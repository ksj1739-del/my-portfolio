import { html, useState, useMemo } from '../react.js';
import { TopBar, Icon, Seg, Chips, Field, NumInput, Empty, toast, go, hname } from '../components.js';
import { won, usd, money, man, pct, arrow, cls, qty, price as fmtPrice, fx as fxf, when, today, parseNum } from '../format.js';
import { valueHolding, applySell, applyBuy, catLabel, priceCurrency, costCurrency } from '../calc.js';
import { addHolding, updateHolding, deleteHolding, recordTrade, undoTrade } from '../store.js';

const CAT_OPTS = [['ETF', 'ETF'], ['STOCK', '개별주식'], ['BOND', '채권'], ['OTHER', '기타']];

function Row({ ctx, h }) {
  const acc = ctx.accById[h.accountId];
  const v = valueHolding(h, acc, ctx.priceOf(h), ctx.fxRate);
  const us = v.pc === 'USD';
  const pnl = us && v.pnlUsd != null ? usd(v.pnlUsd, { sign: true }) : won(v.pnlKrw, { sign: true });
  const pnlV = us && v.pnlUsd != null ? v.pnlUsd : v.pnlKrw;
  return html`<a className="li" href=${'#/holding/' + h.id}>
    <div className="l"><div className="nm">${hname(h)}</div>
      <div className="sm">${qty(h.quantity)}${us && v.mvKrw != null ? ` · ${man(v.mvKrw)}` : ''}${!v.hasPrice ? ' · 시세 없음' : ''}</div></div>
    <div className="r">${us ? usd(v.mvNative) : won(v.mvKrw)}<small className=${cls(pnlV)}>${pnl} (${pct(v.retPct)}) ${arrow(pnlV)}</small></div>
  </a>`;
}

export function HoldingList({ ctx, query }) {
  const [f, setF] = useState('all');
  const accs = ctx.accounts.filter((a) => !query.acc || a.id === query.acc);
  const byAcc = accs.map((a) => ({ a, hs: ctx.holdings.filter((h) => h.accountId === a.id && (f === 'all' || (f === 'US' ? h.market === 'US' : h.market !== 'US'))) }))
    .filter((x) => x.hs.length);
  const addHref = '#/holding/new' + (query.acc ? '?acc=' + query.acc : '');
  return html`
    <${TopBar} title=${query.acc ? ctx.accById[query.acc]?.name || '종목' : '종목'} back=${query.acc ? '#/' : null}>
      <${Seg} label="시장" value=${f} onChange=${setF} options=${[['all', '전체'], ['US', '해외'], ['KR', '국내']]} />
    <//>
    <div className="body">
      ${!byAcc.length && html`<${Empty}><p>아직 종목이 없어요.</p><a className="btn" href=${addHref}>종목 추가</a><//>`}
      ${byAcc.map(({ a, hs }) => {
        const s = ctx.sum.byAccount.find((x) => x.acc.id === a.id);
        return html`<section key=${a.id} className="sec">
          <div className="acc-h"><span>${a.name}</span><span className="num">${money(s?.totalBase, a.baseCurrency)}</span></div>
          ${hs.map((h) => html`<${Row} key=${h.id} ctx=${ctx} h=${h} />`)}
        </section>`;
      })}
      ${byAcc.length ? html`<p className="sm" style=${{ padding: '0 16px' }}>계좌 합계는 예수금 포함. 해외 종목은 $ 기준, 원화는 작게 표시합니다.</p>` : null}
    </div>
    <a className="fab" href=${addHref} aria-label="종목 추가"><${Icon} name="plus" /></a>`;
}

export function HoldingDetail({ ctx, params }) {
  const h = ctx.holdings.find((x) => x.id === params.id);
  if (!h) return html`<${TopBar} title="종목" back="#/holdings" /><${Empty}><p>종목을 찾을 수 없어요.</p><//>`;
  const acc = ctx.accById[h.accountId];
  const v = valueHolding(h, acc, ctx.priceOf(h), ctx.fxRate);
  const asOf = ctx.priceAsOf(h);
  const trades = ctx.trades.filter((t) => t.holdingId === h.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const realized = trades.reduce((s, t) => s + (t.realizedKrw || 0), 0);
  const us = v.pc === 'USD';
  const del = async () => {
    if (!confirm(`${hname(h)}을(를) 삭제할까요?\n거래 기록이 있으면 내역은 남아요.`)) return;
    await deleteHolding(h.id); toast('삭제했어요'); go('#/holdings');
  };
  const undo = async (t) => {
    if (!confirm('이 거래를 되돌릴까요? 수량·평단(현금 반영 시 현금도) 이전 상태로 돌아가요.')) return;
    if (await undoTrade(t.id)) toast('되돌렸어요'); else toast('가장 최근 거래만 되돌릴 수 있어요');
  };
  return html`
    <${TopBar} title=${hname(h)} back="#/holdings" />
    <div className="body">
      <section className="sec">
        <div className="sm">${acc?.name} · ${catLabel(h.category)}${h.market === 'US' && h.name ? ' · ' + h.name : ''}${h.market !== 'US' && h.ticker ? ' · ' + h.ticker : ''}</div>
        <div className="big">${us ? usd(v.mvNative) : won(v.mvKrw)}</div>
        ${us && html`<div className="m num">${won(v.mvKrw)}</div>`}
        <div className=${'num ' + cls(v.pnlKrw)}>${us && v.pnlUsd != null ? usd(v.pnlUsd, { sign: true }) + ' · ' : ''}${won(v.pnlKrw, { sign: true })} (${pct(v.retPct, 2)}) ${arrow(v.pnlKrw)}</div>
      </section>
      <section className="sec">
        <div className="row"><span className="m">보유수량</span><span className="v">${qty(h.quantity)}</span></div>
        <div className="row"><span className="m">평균단가</span><span className="v">${fmtPrice(h.avgPrice, costCurrency(h))}</span></div>
        <div className="row"><span className="m">현재가</span><span className="v">${v.hasPrice ? fmtPrice(v.price, v.pc) : '시세 없음'}${asOf ? html` <span className="sm">${when(asOf.at)} ${asOf.auto ? '자동' : '입력'}</span>` : ''}</span></div>
        <div className="row"><span className="m">원금</span><span className="v">${won(v.costKrw)}</span></div>
        <div className="row"><span className="m">실현손익(누적, 세전)</span><span className=${'v ' + cls(realized)}>${won(realized, { sign: true })}</span></div>
      </section>
      <div className="actions"><div className="grid4">
        <a className="btn" href=${`#/holding/${h.id}/trade/BUY`}>매수</a>
        <a className="btn" href=${`#/holding/${h.id}/trade/SELL`}>매도</a>
        <a className="btn sec2" href=${`#/holding/${h.id}/edit`}>수정</a>
        <button className="btn danger" type="button" onClick=${del}>삭제</button>
      </div></div>
      <section className="sec">
        <h2>거래 내역</h2>
        ${trades.map((t, i) => html`<div key=${t.id} className="li static">
          <div className="l"><div className="nm">${t.initial ? '처음 보유' : t.side === 'BUY' ? '매수' : '매도'} · ${qty(t.quantity)} × ${fmtPrice(t.price, t.priceCurrency)}</div><div className="sm">${t.tradedAt}${t.side === 'SELL' ? ` · 수수료 ${t.feePct?.toFixed(3)}%` : ''}</div></div>
          <div className="r">${t.side === 'SELL' ? html`<span className=${cls(t.realizedKrw)}>${won(t.realizedKrw, { sign: true })}</span>` : ''}
            ${i === 0 && !t.initial ? html`<small><button className="txt-btn" type="button" onClick=${() => undo(t)}>되돌리기</button></small>` : ''}</div>
        </div>`)}
      </section>
    </div>`;
}

// 종목 추가/수정(처음 시작하기에서도 사용)
export function HoldingForm({ ctx, params = {}, query = {}, onboarding, onDone }) {
  const edit = params.id ? ctx.holdings.find((x) => x.id === params.id) : null;
  const firstAcc = query.acc || onboarding?.accId || ctx.settings.lastAccountId || ctx.accounts.find((a) => a.type !== 'BANK')?.id;
  const [accountId, setAcc] = useState(edit?.accountId || firstAcc || '');
  const acc = ctx.accById[accountId];
  const [market, setMarket] = useState(edit?.market || (acc?.baseCurrency === 'KRW' ? 'KR' : 'US'));
  const [ticker, setTicker] = useState(edit?.ticker || '');
  const [name, setName] = useState(edit?.name || '');
  const [category, setCat] = useState(edit?.category || 'ETF');
  const [q, setQ] = useState(edit ? String(edit.quantity) : '');
  const [a, setA] = useState(edit ? String(edit.avgPrice) : '');
  const [cc, setCc] = useState(edit?.costCurrency || (market === 'US' ? 'USD' : 'KRW'));
  const [p, setP] = useState(edit?.manualPrice ? String(edit.manualPrice) : '');
  const [more, setMore] = useState(!!edit && edit.market === 'US' && edit.costCurrency === 'KRW');
  const [tradedAt, setTradedAt] = useState('');
  const [err, setErr] = useState({});
  const [saving, setSaving] = useState(false);

  const setMk = (m) => { setMarket(m); setCc(m === 'US' ? 'USD' : 'KRW'); };
  const costCur = market === 'US' ? cc : 'KRW';
  const priceCur = market === 'US' ? 'USD' : 'KRW';
  const list = onboarding ? ctx.holdings.filter((h) => h.accountId === accountId) : [];

  const validate = () => {
    const e = {};
    const qq = parseNum(q), aa = parseNum(a), pp = parseNum(p);
    if (!acc) e.acc = '계좌를 먼저 만들어 주세요.';
    if (market === 'US' && !/^[A-Za-z][A-Za-z0-9.\-]{0,9}$/.test(ticker.trim())) e.ticker = '티커를 입력하세요(예: NVDA).';
    if (market === 'KR' && !name.trim()) e.name = '종목명을 입력하세요(예: 삼성전자).';
    if (market === 'KR' && ticker.trim() && !/^[0-9][0-9A-Z]{5}$/i.test(ticker.trim())) e.ticker = '종목코드는 6자리예요(예: 005930). 모르면 비워 두세요.';
    if (!(qq > 0)) e.q = '보유수량은 0보다 커야 해요.';
    if (!(aa > 0)) e.a = '평균단가는 0보다 커야 해요.';
    if (p.trim() && !(pp > 0)) e.p = '현재가는 0보다 커야 해요.';
    if (market === 'US' && cc === 'USD' && aa >= 1000 && pp > 0 && aa / pp > 5) e.a = '원화 평단인가요? 아래 [평단을 원화로 입력]을 켜 주세요.';
    // 중복
    const key = (h) => (h.market === 'US' ? (h.ticker || '').toUpperCase() : (h.name || '').replace(/\s/g, '').toLowerCase());
    const mine = market === 'US' ? ticker.trim().toUpperCase() : name.replace(/\s/g, '').toLowerCase();
    const dup = ctx.holdings.find((h) => h.accountId === accountId && h.id !== edit?.id && h.market === market && key(h) === mine);
    if (dup) e.dup = dup.id;
    setErr(e);
    return Object.keys(e).length === 0 ? { qq, aa, pp } : null;
  };

  const preview = useMemo(() => {
    const qq = parseNum(q), aa = parseNum(a), pp = parseNum(p);
    if (!(qq > 0 && aa > 0)) return null;
    return valueHolding({ market, category, quantity: qq, avgPrice: aa, costCurrency: costCur }, acc, pp > 0 ? pp : null, ctx.fxRate);
  }, [q, a, p, market, category, costCur, acc, ctx.fxRate]);

  const save = async (next) => {
    const v = validate();
    if (!v) return;
    setSaving(true);
    const h = {
      ...(edit || {}), accountId, market, category,
      ticker: ticker.trim().toUpperCase(), name: name.trim(),
      quantity: v.qq, avgPrice: v.aa, costCurrency: costCur,
      manualPrice: v.pp > 0 ? v.pp : edit?.manualPrice ?? null,
      manualPriceAsOf: v.pp > 0 && v.pp !== edit?.manualPrice ? new Date().toISOString() : edit?.manualPriceAsOf ?? null,
    };
    if (edit) { await updateHolding(h); toast('저장했어요'); }
    else { await addHolding(h, { tradedAt: tradedAt || undefined }); toast(`${market === 'US' ? h.ticker : h.name} 저장했어요`); }
    setSaving(false);
    if (next === 'again') { setTicker(''); setName(''); setQ(''); setA(''); setP(''); setTradedAt(''); setErr({}); document.getElementById('hf-ticker')?.focus(); return; }
    if (onDone) onDone(); else go(query.back || (edit ? '#/holding/' + edit.id : '#/holdings'));
  };

  const accOpts = ctx.accounts.filter((x) => x.type !== 'BANK');
  return html`
    ${!onboarding && html`<${TopBar} title=${edit ? '종목 수정' : '종목 추가'} back=${query.back || (edit ? '#/holding/' + edit.id : '#/holdings')} />`}
    <div className="body">
      <section className="sec" style=${{ gap: '14px' }}>
        ${!onboarding && html`<${Field} id="hf-acc" label="계좌" error=${err.acc}>
          ${accOpts.length ? html`<select id="hf-acc" className="inp" value=${accountId} onChange=${(e) => setAcc(e.target.value)}>${accOpts.map((x) => html`<option key=${x.id} value=${x.id}>${x.name}</option>`)}</select>`
            : html`<a className="link2" href="#/account/new">계좌 만들기</a>`}
        <//>`}
        ${onboarding && html`<div className="acc-h"><span>${acc?.name}</span><span className="sm">${list.length}개 입력됨</span></div>`}
        <div className="fld"><span className="lab">시장</span><${Seg} label="시장" value=${market} onChange=${setMk} options=${[['US', '해외 ($)'], ['KR', '국내 (₩)']]} /></div>
        ${market === 'US' ? html`
          <${Field} id="hf-ticker" label="티커" error=${err.ticker}><input id="hf-ticker" className="inp" autoCapitalize="characters" autoComplete="off" value=${ticker} placeholder="예: NVDA" onChange=${(e) => setTicker(e.target.value)} aria-invalid=${err.ticker ? 'true' : 'false'} /><//>
          <${Field} id="hf-name" label="종목명 (선택)" hint="티커를 누르면 보이는 이름이에요."><input id="hf-name" className="inp" value=${name} placeholder="예: NVIDIA" onChange=${(e) => setName(e.target.value)} /><//>`
        : html`
          <${Field} id="hf-ticker" label="종목명" error=${err.name}><input id="hf-ticker" className="inp" value=${name} placeholder="예: 삼성전자" onChange=${(e) => setName(e.target.value)} aria-invalid=${err.name ? 'true' : 'false'} /><//>
          <${Field} id="hf-code" label="종목코드 (선택)" error=${err.ticker} hint="6자리 코드를 넣으면 구글 자동 시세가 붙어요."><input id="hf-code" className="inp" inputMode="text" autoComplete="off" value=${ticker} placeholder="예: 005930" onChange=${(e) => setTicker(e.target.value)} /><//>`}
        <div className="fld"><span className="lab">분류</span><${Chips} label="분류" value=${category} onChange=${setCat} options=${CAT_OPTS} /></div>
        <div className="two">
          <${Field} id="hf-q" label="보유수량" error=${err.q}><${NumInput} id="hf-q" value=${q} onChange=${setQ} placeholder="예: 10" error=${err.q} /><//>
          <${Field} id="hf-a" label=${`평균단가 (${costCur === 'USD' ? '$' : '원'})`} error=${err.a}><${NumInput} id="hf-a" value=${a} onChange=${setA} placeholder=${costCur === 'USD' ? '예: 134.00' : '예: 70,000'} error=${err.a} /><//>
        </div>
        ${market === 'US' && html`<label className="chk"><input type="checkbox" checked=${more} onChange=${(e) => { setMore(e.target.checked); setCc(e.target.checked ? 'KRW' : 'USD'); }} />평단을 원화로 입력 (원화로 산 해외 ETF 등)</label>`}
        <${Field} id="hf-p" label=${`현재가 (${priceCur === 'USD' ? '$' : '원'}, 선택)`} error=${err.p} hint=${ctx.connected ? '비워 두면 구글 자동 시세를 씁니다.' : '비워 두면 매입가로 평가해요. 나중에 현재가 입력 화면에서 넣어도 돼요.'}>
          <${NumInput} id="hf-p" value=${p} onChange=${setP} error=${err.p} />
        <//>
        ${!edit && !onboarding && html`<${Field} id="hf-d" label="매수일 (선택)"><input id="hf-d" type="date" className="inp" value=${tradedAt} max=${today()} onChange=${(e) => setTradedAt(e.target.value)} /><//>`}
        <div className="sm">증권사 잔고 화면의 평균단가(매입단가)를 그대로 적으세요. 앱 손익은 수수료를 뺀 값이라 증권사 화면과 조금 다를 수 있어요.</div>
        ${err.dup && html`<div className="note">이미 이 계좌에 있는 종목이에요. <a href=${`#/holding/${err.dup}/trade/BUY`} style=${{ fontWeight: 700 }}>매수로 기록하기 ›</a></div>`}
        ${preview && html`<div className="pv">
          <div className="row"><span className="m">예상 평가액</span><span className="v">${preview.pc === 'USD' ? usd(preview.mvNative) : won(preview.mvKrw)}</span></div>
          <div className="row"><span className="m">평가손익</span><span className=${'v ' + cls(preview.pnlKrw)}>${pct(preview.retPct)} ${arrow(preview.pnlKrw)}</span></div>
        </div>`}
      </section>
      <div className="actions">
        ${onboarding ? html`
          <button className="btn" type="button" disabled=${saving} onClick=${() => save('again')}>저장하고 다음 종목</button>
          <button className="link2" type="button" onClick=${onboarding.finish}>${list.length ? '이 계좌 종목 다 넣었어요' : '이 계좌엔 종목이 없어요'}</button>`
        : html`<button className="btn" type="button" disabled=${saving} onClick=${() => save()}>저장</button>
          ${!edit && html`<button className="link2" type="button" onClick=${() => save('again')}>저장하고 계속 추가</button>`}
          ${edit && html`<button className="btn danger" type="button" onClick=${async () => { if (!confirm('이 종목을 삭제할까요?')) return; await deleteHolding(edit.id); toast('삭제했어요'); go(query.back || '#/holdings'); }}>삭제</button>`}`}
      </div>
      ${onboarding && list.length ? html`<section className="sec"><h2>입력한 종목</h2>
        ${list.map((h) => html`<a key=${h.id} className="li" href=${'#/holding/' + h.id + '/edit?back=' + encodeURIComponent('#/start/holdings/' + accountId)}><div className="l"><div className="nm">${hname(h)}</div></div><div className="r">${qty(h.quantity)} · ${fmtPrice(h.avgPrice, costCurrency(h))}</div></a>`)}
        <div className="sm">누르면 수정·삭제할 수 있어요.</div></section>` : null}
    </div>`;
}

export function TradeForm({ ctx, params }) {
  const h = ctx.holdings.find((x) => x.id === params.id);
  const [side, setSide] = useState(params.side === 'SELL' ? 'SELL' : 'BUY');
  const [date, setDate] = useState(today());
  const [q, setQ] = useState('');
  const [p, setP] = useState('');
  const [fxv, setFx] = useState(ctx.fxRate ? String(ctx.fxRate) : '');
  const [applyCash, setApplyCash] = useState(false);
  const [err, setErr] = useState({});
  if (!h) return html`<${TopBar} title="거래" back="#/holdings" /><${Empty}><p>종목을 찾을 수 없어요.</p><//>`;
  const acc = ctx.accById[h.accountId];
  const pc = priceCurrency(h), cc = costCurrency(h);
  const unitCur = side === 'BUY' ? cc : pc;
  const needFx = pc === 'USD' || cc === 'USD';
  const qq = parseNum(q), pp = parseNum(p), ff = parseNum(fxv);
  const pv = qq > 0 && pp > 0 ? (side === 'BUY' ? applyBuy(h, qq, pp) : applySell(h, acc, qq, pp, ff > 0 ? ff : null)) : null;

  const save = async () => {
    const e = {};
    if (!(qq > 0)) e.q = '수량은 0보다 커야 해요.';
    if (side === 'SELL' && qq > h.quantity + 1e-9) e.q = `보유 수량(${qty(h.quantity)})보다 많이 팔 수 없어요.`;
    if (!(pp > 0)) e.p = '가격은 0보다 커야 해요.';
    if (needFx && side === 'SELL' && !(ff > 0)) e.fx = '환율을 입력하세요.';
    setErr(e);
    if (Object.keys(e).length) return;
    const { trade } = await recordTrade({ holding: h, account: acc, side, quantity: qq, price: pp, fxRate: ff > 0 ? ff : null, tradedAt: date, applyCash });
    toast(side === 'BUY' ? '매수를 기록했어요' : '매도를 기록했어요', { label: '되돌리기', run: () => undoTrade(trade.id) });
    if (side === 'SELL' && h.quantity - qq <= 1e-9) {
      if (confirm('전량 매도했어요. 종목을 목록에서 정리할까요? (거래 내역은 남아요)')) { await deleteHolding(h.id); go('#/holdings'); return; }
    }
    go('#/holding/' + h.id);
  };

  return html`
    <${TopBar} title=${`${hname(h)} ${side === 'BUY' ? '매수' : '매도'}`} back=${'#/holding/' + h.id} />
    <div className="body">
      <section className="sec" style=${{ gap: '14px' }}>
        <${Seg} label="거래 종류" value=${side} onChange=${setSide} options=${[['BUY', '매수'], ['SELL', '매도']]} />
        <div className="sm">보유 ${qty(h.quantity)} · 평단 ${fmtPrice(h.avgPrice, cc)} · ${acc?.name}</div>
        <${Field} id="tf-d" label="거래일"><input id="tf-d" type="date" className="inp" value=${date} max=${today()} onChange=${(e) => setDate(e.target.value)} /><//>
        <${Field} id="tf-q" label="수량" error=${err.q}>
          <div style=${{ display: 'flex', gap: '8px' }}><${NumInput} id="tf-q" value=${q} onChange=${setQ} error=${err.q} />
          ${side === 'SELL' && html`<button type="button" className="chip" onClick=${() => setQ(String(h.quantity))}>전량</button>`}</div>
        <//>
        <${Field} id="tf-p" label=${`${side === 'BUY' ? '매수가' : '매도가'} (${unitCur === 'USD' ? '$' : '원'})`} error=${err.p}><${NumInput} id="tf-p" value=${p} onChange=${setP} error=${err.p} /><//>
        ${needFx && html`<${Field} id="tf-fx" label="환율 (원/$)" error=${err.fx} hint="기본값은 현재 환율이에요. 실제 거래 환율로 바꿔도 돼요."><${NumInput} id="tf-fx" value=${fxv} onChange=${setFx} error=${err.fx} /><//>`}
        <div className="sm">수수료 ${side === 'BUY' ? acc?.buyFeePct : (Number(acc?.sellFeePct) + (h.market === 'KR' && h.category === 'STOCK' ? Number(acc?.sellTaxPct) : 0)).toFixed(3)}% (계좌 설정)</div>
        <label className="chk"><input type="checkbox" checked=${applyCash} onChange=${(e) => setApplyCash(e.target.checked)} />${side === 'BUY' ? '산 금액만큼 이 계좌 현금에서 빼기' : '판 금액을 이 계좌 현금에 더하기'}</label>
        ${pv && html`<div className="pv">
          ${side === 'BUY' ? html`<div className="row"><span className="m">매수 후</span><span className="v">${qty(pv.quantity)} · 평단 ${fmtPrice(pv.avgPrice, cc)}</span></div>`
          : html`<div className="row"><span className="m">실현손익</span><span className=${'v ' + cls(pv.realizedKrw)}>${pv.realizedNative != null && pc === 'USD' ? usd(pv.realizedNative, { sign: true }) + ' · ' : ''}${won(pv.realizedKrw, { sign: true })} ${arrow(pv.realizedKrw)}</span></div>
            <div className="row"><span className="m">매도 후</span><span className="v">${qty(pv.quantity)} · 평단 유지</span></div>
            <div className="sm">세금 전 금액입니다. 해외주식 양도세는 따로 계산하지 않습니다.</div>`}
        </div>`}
      </section>
      <div className="actions"><button className="btn" type="button" onClick=${save}>${side === 'BUY' ? '매수 기록하기' : '매도 기록하기'}</button></div>
    </div>`;
}
