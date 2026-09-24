// 현금 입력(온보딩)·시세·환율 입력 폼. 화면 틀은 onboard.js / sheets.js가 씌운다
import { html, useState } from '../react.js';
import { Field, NumInput, toast, hname } from '../components.js';
import { when, daysAgo, parseNum } from '../format.js';
import { priceCurrency } from '../calc.js';
import { setCashTo, saveManualPrices } from '../store.js';
import { refreshQuotes, explain, quoteKey } from '../google.js';

// ---------- 현금(온보딩 3단계): 입력값과 파생 잔액의 차이만큼 기초 잔액(adjust)을 쓴다 ----------
export function useCashForm({ ctx, accountIds }) {
  const accs = ctx.accounts.filter((a) => !accountIds || accountIds.includes(a.id));
  const init = {};
  for (const a of accs) for (const c of a.currencies || ['KRW']) {
    const r = ctx.cash.find((x) => x.accountId === a.id && x.currency === c);
    init[`${a.id}:${c}`] = r && r.amount ? String(r.amount) : '';
  }
  const [vals, setVals] = useState(init);
  const [err, setErr] = useState({});
  const save = async (key) => {
    const [accId, cur] = key.split(':');
    const v = vals[key].trim() === '' ? 0 : parseNum(vals[key]);
    if (!(v >= 0)) { setErr((e) => ({ ...e, [key]: '0 이상의 숫자를 넣어 주세요.' })); return false; }
    setErr((e) => ({ ...e, [key]: null }));
    await setCashTo(accId, cur, v, { memo: '기초 잔액' });
    return true;
  };
  const saveAll = async () => { let ok = true; for (const k of Object.keys(vals)) ok = (await save(k)) && ok; return ok; };
  return { saveAll, ui: html`
    ${accs.map((a) => {
      const curs = [...(a.currencies || ['KRW'])].sort((x, y) => (x === a.baseCurrency ? -1 : y === a.baseCurrency ? 1 : 0));
      return html`<section key=${a.id} className="sec" style=${{ gap: '12px' }}>
        <div className="acc-h"><span>${a.name}</span></div>
        ${curs.map((c) => {
          const key = `${a.id}:${c}`, id = 'cash-' + key.replace(/[^a-z0-9]/gi, '');
          return html`<${Field} key=${c} id=${id} label=${c === 'USD' ? '달러 ($)' : '원화 (원)'} error=${err[key]}>
            <${NumInput} id=${id} value=${vals[key]} onChange=${(v) => setVals({ ...vals, [key]: v })} error=${err[key]} placeholder="0" />
          <//>`;
        })}
      </section>`;
    })}
    <p className="sm pad" style=${{ margin: 0 }}>증권사 앱의 '예수금(D+2)'을 원화·달러 따로 적어 주세요. '주문가능금액'은 쓰지 않아요. 적은 금액은 거래내역에 '기초 잔액'으로 남아요.</p>` };
}

// ---------- 현재가·환율 입력(시트와 온보딩이 같이 쓴다) ----------
export function usePriceForm({ ctx, onDone }) {
  const init = { fx: ctx.fxRate ? String(ctx.fxRate) : '' };
  for (const h of ctx.holdings) { const p = ctx.priceOf(h); init[h.id] = p ? String(p) : ''; }
  const [vals, setVals] = useState(init);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState({});
  const byAcc = ctx.accounts.map((a) => ({ a, hs: ctx.holdings.filter((h) => h.accountId === a.id) })).filter((x) => x.hs.length);
  const needFx = ctx.holdings.some((h) => h.market === 'US' || h.costCurrency === 'USD') || ctx.cash.some((c) => c.currency === 'USD' && c.amount);

  const auto = async () => {
    setBusy(true);
    try { const r = await refreshQuotes(); toast(r.failed?.length ? `자동 시세 ${r.ok}건 받음, ${r.failed.length}건 실패` : `자동 시세 ${r.ok}건을 받았어요`); }
    catch (e) { toast(explain(e), { type: 'error' }); }
    setBusy(false);
  };
  const save = async () => {
    const e = {}, prices = {};
    for (const h of ctx.holdings) {
      const s = (vals[h.id] || '').trim();
      if (!s) continue;
      const v = parseNum(s);
      if (!(v > 0)) { e[h.id] = '0보다 큰 값을 넣어 주세요'; continue; }
      if (v !== ctx.priceOf(h)) prices[h.id] = v;
    }
    const f = vals.fx.trim() ? parseNum(vals.fx) : null;
    if (vals.fx.trim() && !(f > 0)) e.fx = '0보다 큰 값을 넣어 주세요';
    setErr(e);
    if (Object.keys(e).length) return;
    await saveManualPrices(prices, f && f !== ctx.fxRate ? f : null);
    const empty = ctx.holdings.filter((h) => !(vals[h.id] || '').trim()).length;
    toast(empty ? `저장했어요. 현재가 ${empty}개는 비어 있어 매입가로 평가해요.` : '저장했어요');
    onDone?.();
  };
  const ui = html`
    <div className="sm">마지막 입력 ${ctx.pricesAt ? `${when(ctx.pricesAt)} · ${daysAgo(ctx.pricesAt)}일 전` : '없음'}</div>
    ${ctx.connected ? html`<button className="btn sec2" type="button" disabled=${busy} onClick=${auto}>${busy ? '받는 중…' : '구글 자동 시세 지금 받기'}</button>
        <div className="sm">자동으로 받은 값이 있으면 입력칸에 채워져요. 직접 고친 값은 다음 자동 시세가 올 때까지 우선해요.</div>`
      : html`<div className="sm">시세 자동 연결 전이에요. <a href="#/connect" className="inline-link">연결하기 ›</a></div>`}
    ${needFx && html`<${Field} id="pf-fx" label="환율 (원/$)" error=${err.fx}><${NumInput} id="pf-fx" value=${vals.fx} onChange=${(v) => setVals({ ...vals, fx: v })} error=${err.fx} placeholder="예: 1,365.85" /><//>`}
    ${byAcc.map(({ a, hs }) => html`<div key=${a.id} style=${{ display: 'flex', flexDirection: 'column', gap: '12px', paddingTop: '8px' }}>
      <div className="acc-h"><span>${a.name}</span></div>
      ${hs.map((h) => {
        const cur = priceCurrency(h), id = 'pf-' + h.id, as = ctx.priceAsOf(h);
        return html`<div key=${h.id} className="fld">
          <label htmlFor=${id} style=${{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}><span>${hname(h)}</span><span className="sm">${as ? `${when(as.at)} ${as.auto ? '자동' : '입력'}` : ''} ${!quoteKey(h) && ctx.connected ? '· 코드 없음(수동)' : ''}</span></label>
          <${NumInput} id=${id} value=${vals[h.id]} onChange=${(v) => setVals({ ...vals, [h.id]: v })} error=${err[h.id]} placeholder=${cur === 'USD' ? '$' : '원'} />
          ${err[h.id] && html`<div className="err" id=${id + '-err'}>${err[h.id]}</div>`}
        </div>`;
      })}
    </div>`)}`;
  return { ui, save };
}

// 온보딩 4단계용 화면 본문
export function PriceForm({ ctx, onDone }) {
  const { ui, save } = usePriceForm({ ctx, onDone });
  return html`<div className="body">
    <section className="sec" style=${{ gap: '12px' }}>${ui}</section>
    <div className="actions"><button className="btn" type="button" onClick=${save}>저장하고 홈으로</button></div>
  </div>`;
}
