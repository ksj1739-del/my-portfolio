import { html, useState } from '../react.js';
import { TopBar, Field, NumInput, Empty, Seg, toast, go, hname } from '../components.js';
import { won, usd, money, pct, arrow, cls, qty, price as fmtPrice, fx as fxf, when, daysAgo, parseNum } from '../format.js';
import { realizedSum, priceCurrency } from '../calc.js';
import { setCash, undoTrade, saveManualPrices } from '../store.js';
import { refreshQuotes, explain, quoteKey } from '../google.js';

// ---------- 현금 ----------
export function useCashForm({ ctx, accountIds, onboarding }) {
  const accs = ctx.accounts.filter((a) => !accountIds || accountIds.includes(a.id));
  const init = {};
  for (const a of accs) for (const c of a.currencies || ['KRW']) {
    const r = ctx.cash.find((x) => x.accountId === a.id && x.currency === c);
    init[`${a.id}:${c}`] = r ? String(r.amount) : '';
  }
  const [vals, setVals] = useState(init);
  const [err, setErr] = useState({});
  const save = async (key) => {
    const [accId, cur] = key.split(':');
    const v = vals[key].trim() === '' ? 0 : parseNum(vals[key]);
    if (!(v >= 0)) { setErr({ ...err, [key]: '0 이상의 숫자를 입력하세요.' }); return false; }
    setErr({ ...err, [key]: null });
    const prev = ctx.cash.find((x) => x.accountId === accId && x.currency === cur)?.amount ?? null;
    if (prev !== v) await setCash(accId, cur, v);
    return true;
  };
  const saveAll = async () => { let ok = true; for (const k of Object.keys(vals)) ok = (await save(k)) && ok; return ok; };
  return { saveAll, ui: html`
    ${accs.map((a) => {
      const curs = [...(a.currencies || ['KRW'])].sort((x, y) => (x === a.baseCurrency ? -1 : y === a.baseCurrency ? 1 : 0));
      return html`<section key=${a.id} className="sec" style=${{ gap: '12px' }}>
        <div className="acc-h"><span>${a.name}</span><span className="sm">예수금</span></div>
        ${curs.map((c) => {
          const key = `${a.id}:${c}`, id = 'cash-' + key.replace(/[^a-z0-9]/gi, '');
          return html`<${Field} key=${c} id=${id} label=${c === 'USD' ? '달러 ($)' : '원화 (원)'} error=${err[key]}>
            <${NumInput} id=${id} value=${vals[key]} onChange=${(v) => setVals({ ...vals, [key]: v })} error=${err[key]} placeholder="0" />
          <//>`;
        })}
      </section>`;
    })}
    <p className="sm" style=${{ padding: '0 16px' }}>증권사 앱의 '예수금(D+2)'을 원화·달러 따로 적으세요. '주문가능금액'은 쓰지 않습니다.</p>` };
}

export function Cash({ ctx }) {
  const { saveAll, ui } = useCashForm({ ctx });
  const s = ctx.sum;
  if (!ctx.accounts.length) return html`<${TopBar} title="현금" /><${Empty}><p>계좌가 없어요.</p><a className="btn" href="#/account/new">계좌 만들기</a><//>`;
  return html`
    <${TopBar} title="현금" />
    <div className="body">
      <section className="sec">
        <div className="lbl">합계</div>
        <div className="big">${won(s.cashKrw)}</div>
        <div className="m num">${won(s.cashKRW)} + ${usd(s.cashUSD)}${ctx.fxRate ? ` (환율 ${fxf(ctx.fxRate)})` : ''}</div>
      </section>
      ${ui}
      <div className="actions"><button className="btn" type="button" onClick=${async () => { if (await saveAll()) toast('저장했어요'); }}>저장</button></div>
    </div>`;
}

// ---------- 거래 내역·실현손익 ----------
export function Trades({ ctx }) {
  const years = [...new Set(ctx.trades.map((t) => t.tradedAt.slice(0, 4)))].sort().reverse();
  if (!years.includes(String(ctx.year))) years.unshift(String(ctx.year));
  const [year, setYear] = useState(String(ctx.year));
  const [acc, setAcc] = useState('');
  const list = ctx.trades.filter((t) => t.tradedAt.startsWith(year) && (!acc || t.accountId === acc)).sort((a, b) => (b.tradedAt + b.createdAt).localeCompare(a.tradedAt + a.createdAt));
  const total = realizedSum(ctx.trades, { year, accountId: acc || undefined });
  const latestIds = new Set(Object.values(ctx.trades.reduce((m, t) => { if (!m[t.holdingId] || t.createdAt > m[t.holdingId].createdAt) m[t.holdingId] = t; return m; }, {})).map((t) => t.id));
  const holdingName = (t) => (t.market === 'US' ? t.ticker || t.name : t.name || t.ticker);
  const undo = async (t) => {
    if (!confirm('이 거래를 되돌릴까요?')) return;
    toast((await undoTrade(t.id)) ? '되돌렸어요' : '가장 최근 거래만 되돌릴 수 있어요');
  };
  return html`
    <${TopBar} title="거래 내역 · 실현손익" back="#/" />
    <div className="body">
      <div style=${{ display: 'flex', gap: '8px', padding: '0 16px' }}>
        <select className="inp" aria-label="연도" value=${year} onChange=${(e) => setYear(e.target.value)}>${years.map((y) => html`<option key=${y} value=${y}>${y}년</option>`)}</select>
        <select className="inp" aria-label="계좌" value=${acc} onChange=${(e) => setAcc(e.target.value)}><option value="">전체 계좌</option>${ctx.accounts.map((a) => html`<option key=${a.id} value=${a.id}>${a.name}</option>`)}</select>
      </div>
      <section className="sec">
        <div className="lbl">${year}년 실현손익 (세금 전)</div>
        <div className=${'big ' + cls(total)}>${won(total, { sign: true })}</div>
        ${ctx.accounts.filter((a) => !acc || a.id === acc).map((a) => html`<div key=${a.id} className="row"><span className="m">${a.name}</span><span className="v">${won(realizedSum(ctx.trades, { year, accountId: a.id }), { sign: true })}</span></div>`)}
        <div className="sm">참고용이에요. 세금 신고에는 증권사 자료를 쓰세요.</div>
      </section>
      <section className="sec">
        ${!list.length && html`<p className="m">이 기간의 거래가 없어요.</p>`}
        ${list.map((t) => html`<div key=${t.id} className="li static">
          <div className="l"><div className="nm">${holdingName(t)} · ${t.initial ? '처음 보유' : t.side === 'BUY' ? '매수' : '매도'}${t.closed ? ' · 정리됨' : ''}</div>
            <div className="sm">${t.tradedAt} · ${qty(t.quantity)} × ${fmtPrice(t.price, t.priceCurrency)}</div></div>
          <div className="r">${t.side === 'SELL' ? html`<span className=${cls(t.realizedKrw)}>${won(t.realizedKrw, { sign: true })} ${arrow(t.realizedKrw)}</span>${t.realizedNative != null && t.priceCurrency === 'USD' ? html`<small className=${cls(t.realizedNative)}>${usd(t.realizedNative, { sign: true })}</small>` : ''}` : ''}
            ${latestIds.has(t.id) && !t.initial && !t.closed ? html`<small><button className="txt-btn" type="button" onClick=${() => undo(t)}>되돌리기</button></small>` : ''}</div>
        </div>`)}
      </section>
    </div>`;
}

// ---------- 현재가·환율 입력 ----------
export function PriceForm({ ctx, onboarding, onDone }) {
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
    catch (e) { toast(explain(e)); }
    setBusy(false);
  };
  const save = async () => {
    const e = {}, prices = {};
    for (const h of ctx.holdings) {
      const s = (vals[h.id] || '').trim();
      if (!s) continue;
      const v = parseNum(s);
      if (!(v > 0)) { e[h.id] = '0보다 큰 값'; continue; }
      if (v !== ctx.priceOf(h)) prices[h.id] = v;
    }
    const f = vals.fx.trim() ? parseNum(vals.fx) : null;
    if (vals.fx.trim() && !(f > 0)) e.fx = '0보다 큰 값';
    setErr(e);
    if (Object.keys(e).length) return;
    await saveManualPrices(prices, f && f !== ctx.fxRate ? f : null);
    const empty = ctx.holdings.filter((h) => !(vals[h.id] || '').trim()).length;
    toast(empty ? `저장했어요. 현재가 ${empty}개는 비어 있어 매입가로 평가해요.` : '저장했어요');
    if (onDone) onDone(); else go('#/');
  };
  return html`
    ${!onboarding && html`<${TopBar} title="현재가 입력" back="#/"><button className="txt-btn" type="button" onClick=${save}>저장</button><//>`}
    <div className="body">
      <section className="sec">
        <div className="sm">마지막 입력 ${ctx.pricesAt ? `${when(ctx.pricesAt)} · ${daysAgo(ctx.pricesAt)}일 전` : '없음'}</div>
        ${ctx.connected ? html`<button className="btn sec2" type="button" disabled=${busy} onClick=${auto}>${busy ? '받는 중…' : '구글 자동 시세 지금 받기'}</button>
            <div className="sm">자동으로 받은 값이 있으면 입력칸에 채워져요. 직접 고친 값은 다음 자동 시세가 올 때까지 우선해요.</div>`
          : html`<div className="sm">시세 자동 연결 전이에요. <a href="#/connect" style=${{ color: 'var(--blue)', fontWeight: 600 }}>연결하기 ›</a></div>`}
        ${needFx && html`<${Field} id="pf-fx" label="환율 (원/$)" error=${err.fx}><${NumInput} id="pf-fx" value=${vals.fx} onChange=${(v) => setVals({ ...vals, fx: v })} error=${err.fx} placeholder="예: 1,365.85" /><//>`}
      </section>
      ${byAcc.map(({ a, hs }) => html`<section key=${a.id} className="sec" style=${{ gap: '10px' }}>
        <div className="acc-h"><span>${a.name}</span></div>
        ${hs.map((h) => {
          const cur = priceCurrency(h), id = 'pf-' + h.id, as = ctx.priceAsOf(h);
          return html`<div key=${h.id} className="fld">
            <label htmlFor=${id} style=${{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}><span>${hname(h)}</span><span className="sm">${as ? `${when(as.at)} ${as.auto ? '자동' : '입력'}` : ''} ${!quoteKey(h) && ctx.connected ? '· 코드 없음(수동)' : ''}</span></label>
            <${NumInput} id=${id} value=${vals[h.id]} onChange=${(v) => setVals({ ...vals, [h.id]: v })} error=${err[h.id]} placeholder=${cur === 'USD' ? '$' : '원'} />
          </div>`;
        })}
      </section>`)}
      <div className="actions"><button className="btn" type="button" onClick=${save}>${onboarding ? '저장하고 홈으로' : '저장'}</button></div>
    </div>`;
}

export const Prices = ({ ctx }) => html`<${PriceForm} ctx=${ctx} />`;
