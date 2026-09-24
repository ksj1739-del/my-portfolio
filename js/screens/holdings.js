import { html, useState, useMemo, useEffect } from '../react.js';
import { TopBar, Icon, Seg, Chips, Field, NumInput, Empty, Amount, Avatar, ListRow, BottomSheet, ask, toast, go, hname, initials, holdKey, openSheet, haptic } from '../components.js';
import { won, usd, pct, cls, plLine, money, qty, price as fmtPrice, fx as fxf, when, today, parseNum } from '../format.js';
import { valueHolding, applySell, applyBuy, defaultTradeFx, catLabel, priceCurrency, costCurrency } from '../calc.js';
import { holdingKey, groupRows, sortGroups, rowPl, rowValue, groupHref, accLabel, shortAccNames, leverageBadge, LEVERAGE_OPTS, SORTS, pnlView, headlinePl, needFxHint } from '../group.js';
import { addHolding, updateHolding, deleteHolding, recordTrade, undoTrade, saveSettings, byLatest } from '../store.js';

const CAT_OPTS = [['ETF', 'ETF'], ['STOCK', '개별주식'], ['BOND', '채권'], ['OTHER', '기타']];

// 종목 목록 행(합산 그룹 하나). 오른쪽 위는 평가금 ↔ 현재가, 아래는 보유 손익(§3.3.5)
function GroupRow({ g, mode, single, short }) {
  const rv = rowValue(g, mode);
  const pl = rowPl(g);
  const noKrw = pl.cur === 'KRW' && pl.value == null;
  return html`<${ListRow} href=${groupHref(g)}
    avatar=${html`<${Avatar} text=${initials(g.h)} seed=${holdKey(g.h)} />`}
    title=${hname(g.h)} badge=${leverageBadge(g.leverage)}
    sub=${`${qty(g.quantity)}${single ? '' : ' · ' + accLabel(g.accountIds.map((id, i) => short[id] || g.accNames[i]))}${!g.hasPrice ? ' · 시세 없음' : ''}`}
    right=${rv.price ? fmtPrice(rv.value, rv.cur) : html`<${Amount} value=${rv.value} cur=${rv.cur} />`}
    rightSub=${noKrw ? '계산 불가' : plLine(pl.value, pl.cur, pl.ret)}
    rightCls=${cls(pl.value)} />`;
}

export function HoldingList({ ctx, query }) {
  const accs = ctx.accounts.filter((a) => a.type !== 'BANK');
  const short = shortAccNames(accs);
  const [accF, setAccF] = useState(query.acc && ctx.accById[query.acc] ? query.acc : 'all');
  const [mode, setMode] = useState('mv');
  const sort = ctx.settings.holdingSort || 'mv';
  const market = ctx.settings.holdingMarket || 'all';
  const groups = sortGroups(groupRows(ctx.sum.rows, { accountId: accF === 'all' ? null : accF, market, accountOrder: ctx.accounts.map((a) => a.id) }), sort);
  const any = ctx.holdings.some((h) => h.quantity > 0);
  const addHref = '#/holding/new' + (accF !== 'all' ? '?acc=' + accF : '');
  const sortLabel = (SORTS.find(([v]) => v === sort) || SORTS[0])[1] + (market === 'US' ? ' · 해외' : market === 'KR' ? ' · 국내' : '');
  return html`
    <${TopBar} title="종목" large>
      <button className="icon-btn" type="button" aria-label="기록하기" onClick=${() => openSheet('record')}><${Icon} name="plus" /></button>
    <//>
    <div className="body m3-list">
      ${accs.length > 1 && html`<div className="pad"><div className="chips scroll" role="radiogroup" aria-label="계좌">
        ${[['all', '전체'], ...accs.map((a) => [a.id, short[a.id]])].map(([v, t]) => html`<button key=${v} type="button" role="radio" aria-checked=${accF === v} className=${'chip' + (accF === v ? ' on' : '')} onClick=${() => { haptic(); setAccF(v); }}>${t}</button>`)}
      </div></div>`}
      <section className="sec">
        <div className="m3-bar">
          <button type="button" className="m3-sort" onClick=${() => openSheet('sort')} aria-haspopup="dialog">${sortLabel}<${Icon} name="down" className="i sm-i" /></button>
          <div className="m3-tog" role="radiogroup" aria-label="오른쪽 숫자">
            ${[['price', '현재가'], ['mv', '평가금']].map(([v, t]) => html`<button key=${v} type="button" role="radio" aria-checked=${mode === v} className=${mode === v ? 'on' : ''} onClick=${() => setMode(v)}>${t}</button>`)}
          </div>
        </div>
        ${!groups.length && html`<${Empty} title=${any ? '조건에 맞는 종목이 없어요' : '아직 종목이 없어요'} desc=${any ? '다른 계좌나 시장을 골라 보세요.' : '증권사 잔고를 보고 옮겨 적어 보세요'} action=${any ? null : { label: '종목 추가하기', href: addHref }} />`}
        <div className="list-in">${groups.map((g) => html`<${GroupRow} key=${g.key + g.h.id} g=${g} mode=${mode} single=${accF !== 'all'} short=${short} />`)}</div>
      </section>
      ${groups.length ? html`<p className="sm pad" style=${{ margin: 0 }}>${accF === 'all' ? '같은 종목은 계좌를 합쳐 보여 드려요. ' : ''}해외 종목 손익은 모든 계좌가 달러로 샀으면 $ 기준이에요.</p>` : null}
    </div>`;
}

// 합산 종목 상세(2개 계좌 이상). 보기 전용이라 매수·매도는 계좌를 먼저 고른다(§1.8-3, M3-4)
export function GroupDetail({ ctx, params }) {
  const key = params.key;
  const [g] = groupRows(ctx.sum.rows.filter((r) => holdingKey(r.h) === key), { accountOrder: ctx.accounts.map((a) => a.id) });
  if (!g) return html`<${TopBar} title="종목" back="#/holdings" /><${Empty} title="종목을 찾을 수 없어요" action=${{ label: '종목 목록으로', href: '#/holdings' }} />`;
  const us = g.pc === 'USD';
  const lb = leverageBadge(g.leverage);
  const short = shortAccNames(ctx.accounts);
  return html`
    <${TopBar} title=${hname(g.h)} back="#/holdings" />
    <div className="body">
      <section className="sec hero">
        <div style=${{ display: 'flex', alignItems: 'center', gap: '12px' }}><${Avatar} text=${initials(g.h)} seed=${holdKey(g.h)} />
          <div className="sm">${g.count}개 계좌 합산 · ${catLabel(g.h.category)}${lb ? html` <span className=${'badge ' + lb.cls}>${lb.text}</span>` : ''}</div></div>
        <${Amount} value=${us ? g.mvNative : g.mvKrw} cur=${us ? 'USD' : 'KRW'} size="t2" />
        ${us && html`<div className="sm">원화 평가 ${g.mvKrw == null ? '계산 불가' : won(g.mvKrw)}</div>`}
        <div className=${'pl ' + cls(g.pnlKrw)}>${g.pnlKrw == null ? '원화 손익 계산 불가' : plLine(g.pnlKrw, 'KRW', g.ret, 2)}</div>
        ${us && g.allUsd && html`<div className="sm">$ 기준 ${plLine(g.pnlUsd, 'USD', g.retUsd, 2)}</div>`}
        <div className="sm">${g.mixedCost ? '평균 매수가는 계좌마다 기준이 달라요' : `평균 매수가 ${fmtPrice(g.avgPrice, g.cc)} · 수수료 제외`}</div>
        ${g.pricesDiffer && html`<div className="sm">계좌마다 시세 기준이 달라요</div>`}
      </section>
      <section className="sec">
        <div className="row"><span className="m">보유 수량</span><span className="v">${qty(g.quantity)}</span></div>
        <div className="row"><span className="m">현재가</span><span className="v">${g.hasPrice ? fmtPrice(g.price, g.pc) : '시세 없음'}</span></div>
      </section>
      <section className="sec">
        <h2>보유 계좌</h2>
        <div className="m3-cards">${g.items.map((r) => {
          const hr = headlinePl({ ...r.v, fxKnown: false });
          return html`<${ListRow} key=${r.h.id} href=${'#/holding/' + r.h.id} chev
            avatar=${html`<${Avatar} text=${(r.acc?.name || '?').replace(/\s/g, '').slice(0, 2)} seed=${r.h.accountId} />`}
            title=${short[r.h.accountId] || r.acc?.name || '계좌'} sub=${`평단 ${fmtPrice(r.h.avgPrice, r.v.cc)}`} right=${qty(r.h.quantity)}
            rightSub=${hr.value == null ? '계산 불가' : plLine(hr.value, 'KRW', hr.ret, 2)} rightCls=${cls(hr.value)} />`;
        })}</div>
        <div className="sm">계좌를 누르면 거래 내역·환율 효과를 볼 수 있어요. 손익은 계좌별 수수료를 반영했어요.</div>
      </section>
      <div className="actions"><div className="acts2">
        <button className="btn buy" type="button" onClick=${() => openSheet('pickacc', { sid: key, side: 'BUY' })}>매수</button>
        <button className="btn sell" type="button" onClick=${() => openSheet('pickacc', { sid: key, side: 'SELL' })}>매도</button>
      </div></div>
    </div>`;
}

// M2: 큰 손익 줄(원화 금액 + 원화 기준 %). 탭하면 '주가로 번 돈 / 환율로 번 돈' 두 줄을 펼친다(종목 상세만)
function PlSplit({ h, v, view, head, fxRate }) {
  const [open, setOpen] = useState(false);
  const line = head.value == null ? '원화 손익 계산 불가' : plLine(head.value, 'KRW', head.ret, 2);
  if (view !== 'split') return html`
    <div className=${'pl ' + cls(head.value)}>${line}</div>
    ${view === 'missing' && html`<div className="sm">매입환율 미기록 · <a className="m3-link" href=${`#/holding/${h.id}/edit?focus=afx`}>입력하기</a></div>`}
    ${view === 'noFx' && html`<div className="sm">환율이 없어 환율 효과는 계산 불가예요</div>`}`;
  return html`
    <button type="button" className=${'pl m3-plbtn ' + cls(head.value)} aria-expanded=${open} aria-controls="m2-split" onClick=${() => { haptic(); setOpen(!open); }}>
      <span>${line}</span><${Icon} name="down" className=${'i m3-chev' + (open ? ' open' : '')} />
    </button>
    ${open && html`<div className="m3-split" id="m2-split">
      <div className="row"><span className="m">주가로 번 돈</span><span className=${'v ' + cls(v.pnlPrice)}>${won(v.pnlPrice, { sign: true })}</span></div>
      <div className="row"><span className="m">환율로 번 돈 <span className="sm">환차손익</span></span><span className=${'v ' + cls(v.pnlFx)}>${won(v.pnlFx, { sign: true })}</span></div>
      <div className="sm">평균 매입환율 ${fxf(h.avgFx)} → 지금 ${fxf(fxRate)}</div>
      <div className="sm">구글 환율 기준 참고용이에요. 증권사 적용 환율과 조금 다를 수 있어요.</div>
    </div>`}`;
}

export function HoldingDetail({ ctx, params }) {
  const h = ctx.holdings.find((x) => x.id === params.id);
  if (!h) return html`<${TopBar} title="종목" back="#/holdings" /><${Empty} title="종목을 찾을 수 없어요" action=${{ label: '종목 목록으로', href: '#/holdings' }} />`;
  const acc = ctx.accById[h.accountId];
  const v = valueHolding(h, acc, ctx.priceOf(h), ctx.fxRate);
  const asOf = ctx.priceAsOf(h);
  const trades = ctx.trades.filter((t) => t.holdingId === h.id).sort(byLatest);
  const realized = trades.reduce((s, t) => s + (t.realizedKrw || 0), 0);
  const us = v.pc === 'USD';
  const view = pnlView(h, v);
  const head = headlinePl(v);
  const lb = leverageBadge(h.leverage);
  const del = async () => {
    if (!(await ask({ title: `${hname(h)}을(를) 지울까요?`, desc: '거래 기록이 있으면 내역은 남아요.', ok: '삭제하기', danger: true }))) return;
    await deleteHolding(h.id); toast('삭제했어요'); go('#/holdings');
  };
  const undo = async (t) => {
    if (!(await ask({ title: '이 거래를 되돌릴까요?', desc: '수량·평균 매수가가 이전으로 돌아가고, 현금 반영분도 함께 돌아가요.', ok: '되돌리기' }))) return;
    if (await undoTrade(t.id)) toast('되돌렸어요'); else toast('가장 최근 거래만 되돌릴 수 있어요', { type: 'error' });
  };
  return html`
    <${TopBar} title=${hname(h)} back="#/holdings">
      <a className="icon-btn" href=${`#/holding/${h.id}/edit`} aria-label="수정"><${Icon} name="pen" /></a>
    <//>
    <div className="body">
      <section className="sec hero">
        <div style=${{ display: 'flex', alignItems: 'center', gap: '12px' }}><${Avatar} text=${initials(h)} seed=${holdKey(h)} />
          <div className="sm">${acc?.name} · ${catLabel(h.category)}${h.market === 'US' && h.name ? ' · ' + h.name : ''}${h.market !== 'US' && h.ticker ? ' · ' + h.ticker : ''}${lb ? html` <span className=${'badge ' + lb.cls}>${lb.text}</span>` : ''}</div></div>
        <${Amount} value=${us ? v.mvNative : v.mvKrw} cur=${us ? 'USD' : 'KRW'} size="t2" />
        ${us && html`<div className="sm">원화 평가 ${v.mvKrw == null ? '계산 불가' : won(v.mvKrw)}</div>`}
        <${PlSplit} h=${h} v=${v} view=${view} head=${head} fxRate=${ctx.fxRate} />
        ${us && v.pnlUsd != null && html`<div className="sm">$ 기준 ${plLine(v.pnlUsd, 'USD', v.retPct, 2)}</div>`}
      </section>
      <section className="sec">
        <div className="row"><span className="m">보유 수량</span><span className="v">${qty(h.quantity)}</span></div>
        <div className="row"><span className="m">평균 매수가</span><span className="v">${fmtPrice(h.avgPrice, costCurrency(h))}</span></div>
        <div className="row"><span className="m">현재가</span><span className="v">${v.hasPrice ? fmtPrice(v.price, v.pc) : '시세 없음'}${asOf ? html` <span className="sm">${when(asOf.at)} ${asOf.auto ? '자동' : '입력'}</span>` : ''}</span></div>
        ${v.fxKnown ? html`<div className="row"><span className="m">원금 <span className="sm">취득 환율</span></span><span className="v">${won(v.costKrwAcq)}</span></div>`
          : html`<div className="row"><span className="m">원금</span><span className="v">${won(v.costKrw)}</span></div>`}
        <div className="row"><span className="m">실현손익 <span className="sm">누적, 세금 전</span></span><span className=${'v ' + cls(realized)}>${won(realized, { sign: true })}</span></div>
      </section>
      <div className="actions"><div className="acts2">
        <a className="btn buy" href=${`#/holding/${h.id}/trade/BUY`}>매수</a>
        <a className="btn sell" href=${`#/holding/${h.id}/trade/SELL`}>매도</a>
      </div></div>
      <section className="sec">
        <h2>거래 내역</h2>
        ${trades.map((t, i) => html`<${ListRow} key=${t.id}
          title=${`${t.initial ? '처음 보유' : t.side === 'BUY' ? '매수' : '매도'} ${qty(t.quantity)}`}
          sub=${`${t.tradedAt} · ${fmtPrice(t.price, t.priceCurrency)}${t.side === 'SELL' ? ` · 수수료 ${t.feePct?.toFixed(3)}%` : ''}`}
          right=${t.side === 'SELL' ? html`<span className=${cls(t.realizedKrw)}>${won(t.realizedKrw, { sign: true })}</span>` : null}
          rightSub=${i === 0 && !t.initial ? html`<button className="txt-btn" style=${{ minHeight: '32px', padding: '4px 0 0' }} type="button" onClick=${() => undo(t)}>되돌리기</button>` : null} />`)}
      </section>
      <div className="actions"><button className="btn danger" type="button" onClick=${del}>종목 삭제</button></div>
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
  const [afx, setAfx] = useState(edit?.avgFx ? String(edit.avgFx) : '');
  const [lev, setLev] = useState(Number(edit?.leverage) || 1);
  // 상세의 '매입환율 미기록 · 입력하기'에서 오면 처음 매입환율 칸으로 스크롤
  useEffect(() => {
    if (query.focus !== 'afx') return;
    const id = setTimeout(() => { const el = document.getElementById('hf-afx'); if (el) { el.scrollIntoView({ block: 'center' }); el.focus({ preventScroll: true }); } }, 50);
    return () => clearTimeout(id);
  }, []);
  const [err, setErr] = useState({});
  const [saving, setSaving] = useState(false);

  const setMk = (m) => { setMarket(m); setCc(m === 'US' ? 'USD' : 'KRW'); };
  const costCur = market === 'US' ? cc : 'KRW';
  const priceCur = market === 'US' ? 'USD' : 'KRW';
  const usdUsd = market === 'US' && costCur === 'USD'; // 처음 매입환율(avgFx) 대상
  const list = onboarding ? ctx.holdings.filter((h) => h.accountId === accountId) : [];

  const validate = () => {
    const e = {};
    const qq = parseNum(q), aa = parseNum(a), pp = parseNum(p);
    if (!acc) e.acc = '계좌를 먼저 만들어 주세요.';
    if (market === 'US' && !/^[A-Za-z][A-Za-z0-9.\-]{0,9}$/.test(ticker.trim())) e.ticker = '티커를 넣어 주세요(예: NVDA).';
    if (market === 'KR' && !name.trim()) e.name = '종목명을 넣어 주세요(예: 삼성전자).';
    if (market === 'KR' && ticker.trim() && !/^[0-9][0-9A-Z]{5}$/i.test(ticker.trim())) e.ticker = '종목코드는 6자리예요(예: 005930). 모르면 비워 두세요.';
    if (!(qq > 0)) e.q = '보유 수량은 0보다 커야 해요.';
    if (!(aa > 0)) e.a = '평균 매수가는 0보다 커야 해요.';
    if (p.trim() && !(pp > 0)) e.p = '현재가는 0보다 커야 해요.';
    if (usdUsd && afx.trim() && !(parseNum(afx) > 0)) e.afx = '환율은 0보다 커야 해요.';
    if (market === 'US' && cc === 'USD' && aa >= 1000 && pp > 0 && aa / pp > 5) e.a = '원화 평균 매수가인가요? 아래 [평균 매수가를 원화로 입력]을 켜 주세요.';
    // 중복
    const mine = holdingKey({ market, ticker, name });
    const dup = ctx.holdings.find((h) => h.accountId === accountId && h.id !== edit?.id && holdingKey(h) === mine);
    if (dup) e.dup = dup.id;
    setErr(e);
    if (Object.keys(e).length) haptic([20, 40, 20]);
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
      avgFx: usdUsd && parseNum(afx) > 0 ? parseNum(afx) : null,
      leverage: lev,
      manualPrice: v.pp > 0 ? v.pp : edit?.manualPrice ?? null,
      manualPriceAsOf: v.pp > 0 && v.pp !== edit?.manualPrice ? new Date().toISOString() : edit?.manualPriceAsOf ?? null,
    };
    if (edit) { await updateHolding(h); toast('저장했어요'); }
    else { await addHolding(h, { tradedAt: tradedAt || undefined }); toast(`${market === 'US' ? h.ticker : h.name} 저장했어요`); }
    haptic();
    setSaving(false);
    if (next === 'again') { setTicker(''); setName(''); setQ(''); setA(''); setP(''); setTradedAt(''); setAfx(''); setLev(1); setErr({}); document.getElementById('hf-ticker')?.focus(); return; }
    if (onDone) onDone(); else go(query.back || (edit ? '#/holding/' + edit.id : '#/holdings'));
  };
  const delEdit = async () => {
    if (!(await ask({ title: '이 종목을 지울까요?', desc: '거래 기록이 있으면 내역은 남아요.', ok: '삭제하기', danger: true }))) return;
    await deleteHolding(edit.id); toast('삭제했어요'); go(query.back || '#/holdings');
  };

  const accOpts = ctx.accounts.filter((x) => x.type !== 'BANK');
  return html`
    ${!onboarding && html`<${TopBar} title=${edit ? '종목 수정' : '종목 추가'} back=${query.back || (edit ? '#/holding/' + edit.id : '#/holdings')} />`}
    <div className="body">
      <section className="sec" style=${{ gap: '16px' }}>
        ${!onboarding && html`<${Field} id="hf-acc" label="계좌" error=${err.acc}>
          ${accOpts.length ? html`<select id="hf-acc" className="inp" value=${accountId} onChange=${(e) => setAcc(e.target.value)}>${accOpts.map((x) => html`<option key=${x.id} value=${x.id}>${x.name}</option>`)}</select>`
            : html`<a className="link2" href="#/account/new">계좌 만들기</a>`}
        <//>`}
        ${onboarding && html`<div className="acc-h"><span>${acc?.name}</span><span className="sm">${list.length}개 입력함</span></div>`}
        <div className="fld"><span className="lab">시장</span><${Seg} label="시장" block size="l" value=${market} onChange=${setMk} options=${[['US', '해외 ($)'], ['KR', '국내 (원)']]} /></div>
        ${market === 'US' ? html`
          <${Field} id="hf-ticker" label="티커" error=${err.ticker}><input id="hf-ticker" className="inp" autoCapitalize="characters" autoComplete="off" value=${ticker} placeholder="예: NVDA" onChange=${(e) => setTicker(e.target.value)} aria-invalid=${err.ticker ? 'true' : 'false'} /><//>
          <${Field} id="hf-name" label="종목명 (선택)" hint="티커를 누르면 보이는 이름이에요."><input id="hf-name" className="inp" value=${name} placeholder="예: NVIDIA" onChange=${(e) => setName(e.target.value)} /><//>`
        : html`
          <${Field} id="hf-ticker" label="종목명" error=${err.name}><input id="hf-ticker" className="inp" value=${name} placeholder="예: 삼성전자" onChange=${(e) => setName(e.target.value)} aria-invalid=${err.name ? 'true' : 'false'} /><//>
          <${Field} id="hf-code" label="종목코드 (선택)" error=${err.ticker} hint="6자리 코드를 넣으면 자동 시세가 붙어요."><input id="hf-code" className="inp" inputMode="text" autoComplete="off" value=${ticker} placeholder="예: 005930" onChange=${(e) => setTicker(e.target.value)} /><//>`}
        <div className="fld"><span className="lab">분류</span><${Chips} label="분류" value=${category} onChange=${setCat} options=${CAT_OPTS} /></div>
        <div className="fld"><span className="lab">레버리지 배수</span><${Chips} label="레버리지 배수" value=${lev} onChange=${setLev} options=${LEVERAGE_OPTS} />
          <div className="sm">목록에 뱃지로만 보여요. 손익 계산에는 쓰지 않아요.</div></div>
        <div className="two">
          <${Field} id="hf-q" label="보유 수량" error=${err.q}><${NumInput} id="hf-q" value=${q} onChange=${setQ} placeholder="예: 10" error=${err.q} /><//>
          <${Field} id="hf-a" label=${`평균 매수가 (${costCur === 'USD' ? '$' : '원'})`} error=${err.a}><${NumInput} id="hf-a" value=${a} onChange=${setA} placeholder=${costCur === 'USD' ? '예: 134.00' : '예: 70,000'} error=${err.a} /><//>
        </div>
        ${market === 'US' && html`<label className="chk"><input type="checkbox" checked=${more} onChange=${(e) => { setMore(e.target.checked); setCc(e.target.checked ? 'KRW' : 'USD'); }} />평균 매수가를 원화로 입력 (원화로 산 해외 ETF 등)</label>`}
        <${Field} id="hf-p" label=${`현재가 (${priceCur === 'USD' ? '$' : '원'}, 선택)`} error=${err.p} hint=${ctx.connected ? '비워 두면 자동 시세를 써요.' : '비워 두면 매입가로 평가해요. 나중에 시세 입력 화면에서 넣어도 돼요.'}>
          <${NumInput} id="hf-p" value=${p} onChange=${setP} error=${err.p} />
        <//>
        ${usdUsd && html`<${Field} id="hf-afx" label="처음 매입환율 (원/$, 선택)" error=${err.afx} hint="증권사 해외잔고의 '매입환율'을 그대로 옮겨 주세요. 넣으면 종목 손익을 주가로 번 돈과 환율로 번 돈으로 나눠 볼 수 있어요.">
          <${NumInput} id="hf-afx" value=${afx} onChange=${setAfx} error=${err.afx} placeholder="예: 1,300.00" /><//>`}
        ${!edit && !onboarding && html`<${Field} id="hf-d" label="매수일 (선택)"><input id="hf-d" type="date" className="inp" value=${tradedAt} max=${today()} onChange=${(e) => setTradedAt(e.target.value)} /><//>`}
        <div className="sm">증권사 잔고 화면의 평균단가(매입단가)를 그대로 적어 주세요. 앱 손익은 수수료를 뺀 값이라 증권사 화면과 조금 다를 수 있어요.</div>
        ${err.dup && html`<div className="note">이미 이 계좌에 있는 종목이에요. <a href=${`#/holding/${err.dup}/trade/BUY`} style=${{ fontWeight: 700 }}>매수로 기록하기 ›</a></div>`}
        ${preview && html`<div className="pv">
          <div className="row"><span className="m">예상 평가액</span><span className="v">${preview.pc === 'USD' ? usd(preview.mvNative) : won(preview.mvKrw)}</span></div>
          <div className="row"><span className="m">평가손익</span><span className=${'v ' + cls(preview.pnlKrw)}>${pct(preview.retPct)}</span></div>
        </div>`}
      </section>
      <div className="actions">
        ${onboarding ? html`
          <button className="btn" type="button" disabled=${saving} onClick=${() => save('again')}>저장하고 다음 종목</button>
          <button className="link2" type="button" onClick=${onboarding.finish}>${list.length ? '이 계좌 종목 다 넣었어요' : '이 계좌엔 종목이 없어요'}</button>`
        : html`<button className="btn" type="button" disabled=${saving} onClick=${() => save()}>저장하기</button>
          ${!edit && html`<button className="link2" type="button" onClick=${() => save('again')}>계속 추가</button>`}
          ${edit && html`<button className="btn danger" type="button" onClick=${delEdit}>종목 삭제</button>`}`}
      </div>
      ${onboarding && list.length ? html`<section className="sec"><h2>입력한 종목</h2>
        ${list.map((h) => html`<${ListRow} key=${h.id} href=${'#/holding/' + h.id + '/edit?back=' + encodeURIComponent('#/start/holdings/' + accountId)}
          avatar=${html`<${Avatar} text=${initials(h)} seed=${holdKey(h)} />`} title=${hname(h)} right=${qty(h.quantity)} rightSub=${fmtPrice(h.avgPrice, costCurrency(h))} />`)}
        <div className="sm">누르면 수정·삭제할 수 있어요.</div></section>` : null}
    </div>`;
}

// 매수·매도 기록. 필수는 수량·가격(종목은 경로로 정해짐). 날짜·환율·현금 반영·메모는 '상세'에 자동 기본값으로(§3.1.7)
const FX_SRC = { fx: '같은 계좌의 최근 환전 환율이에요.', day: '그날 환율이에요.', now: '지금 환율이에요.' };
export function TradeForm({ ctx, params }) {
  const h = ctx.holdings.find((x) => x.id === params.id);
  const [side, setSide] = useState(params.side === 'SELL' ? 'SELL' : 'BUY');
  const [date, setDate] = useState(today());
  const [q, setQ] = useState('');
  const [p, setP] = useState('');
  const fxDefault = (d) => defaultTradeFx({ cashTx: ctx.cashTx, snapshots: ctx.snapshots, accountId: h?.accountId, date: d, today: today(), fxRate: ctx.fxRate });
  const [fx0] = useState(() => fxDefault(today()));
  const [fxv, setFx] = useState(fx0.rate ? String(fx0.rate) : '');
  const [fxSrc, setFxSrc] = useState(fx0.src);
  const [applyCash, setApplyCash] = useState(h ? ctx.settings.applyCashByAccount?.[h.accountId] ?? true : true);
  const [memo, setMemo] = useState('');
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState(!ctx.settings.cashNoticeSeen);
  const [err, setErr] = useState({});
  if (!h) return html`<${TopBar} title="거래" back="#/holdings" /><${Empty} title="종목을 찾을 수 없어요" action=${{ label: '종목 목록으로', href: '#/holdings' }} />`;
  const acc = ctx.accById[h.accountId];
  const pc = priceCurrency(h), cc = costCurrency(h);
  const unitCur = side === 'BUY' ? cc : pc;
  const needFx = pc === 'USD' || cc === 'USD';
  const usdUsd = pc === 'USD' && cc === 'USD';
  const qq = parseNum(q), pp = parseNum(p), ff = parseNum(fxv);
  const pv = qq > 0 && pp > 0 ? (side === 'BUY' ? applyBuy(h, qq, pp, ff > 0 ? ff : null) : applySell(h, acc, qq, pp, ff > 0 ? ff : null)) : null;
  const fb = (Number(acc?.buyFeePct) || 0) / 100;
  const cashAmt = pv ? (side === 'BUY' ? -qq * pp * (1 + fb) : pv.proceedsNative) : null;
  const fxInMain = side === 'SELL' && needFx; // 매도 달러 종목은 환율이 필수라 밖에 둔다

  // 최근 거래한 종목(다른 종목으로 바로 바꾸기)
  const lastAt = {};
  for (const t of ctx.trades) if (!lastAt[t.holdingId] || t.createdAt > lastAt[t.holdingId]) lastAt[t.holdingId] = t.createdAt;
  const recent = ctx.holdings.filter((x) => x.id !== h.id && lastAt[x.id] && (side === 'BUY' || x.quantity > 0))
    .sort((a, b) => lastAt[b.id].localeCompare(lastAt[a.id])).slice(0, 5);

  const changeDate = (d) => {
    setDate(d);
    if (fxSrc === 'typed') return; // 직접 고친 환율은 그대로
    const r = fxDefault(d);
    setFx(r.rate ? String(r.rate) : ''); setFxSrc(r.src);
  };
  const closeNotice = () => { setNotice(false); saveSettings({ cashNoticeSeen: true }); };

  const save = async () => {
    const e = {};
    if (!(qq > 0)) e.q = '수량은 0보다 커야 해요.';
    if (side === 'SELL' && qq > h.quantity + 1e-9) e.q = `보유 수량(${qty(h.quantity)})보다 많이 팔 수 없어요.`;
    if (!(pp > 0)) e.p = '가격은 0보다 커야 해요.';
    if (needFx && side === 'SELL' && !(ff > 0)) e.fx = '환율을 넣어 주세요.';
    if (needFx && side === 'BUY' && fxv.trim() && !(ff > 0)) e.fx = '환율은 0보다 커야 해요. 모르면 비워 두세요.';
    setErr(e);
    if (Object.keys(e).length) { haptic([20, 40, 20]); if (e.fx && !fxInMain) setOpen(true); return; }
    const { trade, holding: after } = await recordTrade({ holding: h, account: acc, side, quantity: qq, price: pp, fxRate: ff > 0 ? ff : null, tradedAt: date, applyCash, memo: memo.trim() });
    const map = ctx.settings.applyCashByAccount || {};
    if (map[h.accountId] !== applyCash || ctx.settings.lastAccountId !== h.accountId) saveSettings({ applyCashByAccount: { ...map, [h.accountId]: applyCash }, lastAccountId: h.accountId });
    haptic();
    // avgFx가 없는 달러 종목에 매수하면 같은 토스트에 '처음 매입환율' 안내를 붙인다(§3.2.8). 되돌리기는 그대로
    const hint = side === 'BUY' && needFxHint(after) ? '. 처음 매입환율을 넣으면 환율 효과가 보여요' : '';
    toast((side === 'BUY' ? '매수를 기록했어요' : '매도를 기록했어요') + hint, { label: '되돌리기', run: () => undoTrade(trade.id) });
    if (side === 'SELL' && h.quantity - qq <= 1e-9) {
      const r = trade.realizedKrw;
      if (await ask({ title: '모두 팔았어요', desc: r != null ? `실현 수익 ${won(r, { sign: true })}이에요. 목록에서 정리할까요? 거래 내역은 남아요.` : '목록에서 정리할까요? 거래 내역은 남아요.', ok: '목록에서 정리하기', cancel: '그대로 두기' })) { await deleteHolding(h.id); go('#/holdings'); return; }
    }
    go('#/holding/' + h.id);
  };

  const fxField = html`<${Field} id="tf-fx" label=${`환율 (원/$${side === 'BUY' ? ', 선택' : ''})`} error=${err.fx}
    hint=${[fxSrc && fxSrc !== 'typed' ? FX_SRC[fxSrc] : '', side === 'BUY' && usdUsd ? "비우면 이 종목의 환율 효과는 '미기록'으로 보여요." : ''].filter(Boolean).join(' ') || null}>
    <${NumInput} id="tf-fx" value=${fxv} onChange=${(v) => { setFx(v); setFxSrc('typed'); }} error=${err.fx} /><//>`;
  return html`
    <${TopBar} title=${`${hname(h)} ${side === 'BUY' ? '매수' : '매도'}`} back=${'#/holding/' + h.id} />
    <div className="body">
      <section className="sec" style=${{ gap: '16px' }}>
        <${Seg} label="거래 종류" block size="l" value=${side} onChange=${setSide} options=${[['BUY', '매수'], ['SELL', '매도']]} />
        ${recent.length > 0 && html`<div className="fld"><span className="lab">최근 종목</span><div className="chips">
          ${recent.map((x) => html`<button key=${x.id} type="button" className="chip" onClick=${() => location.replace(`#/holding/${x.id}/trade/${side}`)}>${hname(x)} · ${ctx.accById[x.accountId]?.name.split(' ')[0] || ''}</button>`)}</div></div>`}
        <div className="sm">보유 ${qty(h.quantity)} · 평균 매수가 ${fmtPrice(h.avgPrice, cc)} · ${acc?.name}</div>
        <${Field} id="tf-q" label="수량" error=${err.q}>
          <div style=${{ display: 'flex', gap: '8px', alignItems: 'center' }}><${NumInput} id="tf-q" value=${q} onChange=${setQ} error=${err.q} />
          ${side === 'SELL' && html`<button type="button" className="chip" style=${{ minHeight: '48px' }} onClick=${() => setQ(String(h.quantity))}>전량</button>`}</div>
        <//>
        <${Field} id="tf-p" label=${`${side === 'BUY' ? '매수가' : '매도가'} (${unitCur === 'USD' ? '$' : '원'})`} error=${err.p}><${NumInput} id="tf-p" value=${p} onChange=${setP} error=${err.p} /><//>
        ${fxInMain && fxField}
        <details className="cat" open=${open} onToggle=${(e) => setOpen(e.currentTarget.open)}>
          <summary><span>상세</span><span className="sm">${date === today() ? '오늘' : date}${needFx && !fxInMain ? ` · 환율 ${fxv || '비움'}` : ''} · 현금 ${applyCash ? '반영' : '미반영'} <${Icon} name="down" className="chev" /></span></summary>
          <div style=${{ display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '8px' }}>
            <${Field} id="tf-d" label="거래일"><input id="tf-d" type="date" className="inp" value=${date} max=${today()} onChange=${(e) => changeDate(e.target.value)} /><//>
            ${needFx && !fxInMain && fxField}
            <div className="sm">수수료 ${side === 'BUY' ? acc?.buyFeePct : (Number(acc?.sellFeePct) + (h.market === 'KR' && h.category === 'STOCK' ? Number(acc?.sellTaxPct) : 0)).toFixed(3)}% (계좌 설정)</div>
            <label className="chk"><input type="checkbox" checked=${applyCash} onChange=${(e) => setApplyCash(e.target.checked)} />${side === 'BUY' ? '산 금액만큼 이 계좌 현금에서 빼기' : '판 금액을 이 계좌 현금에 더하기'}</label>
            ${!applyCash && html`<div className="note">현금 잔고에 반영하지 않아요. 증권사 잔고와 달라질 수 있어요.</div>`}
            <${Field} id="tf-memo" label="메모 (선택)"><input id="tf-memo" className="inp" maxLength="200" value=${memo} onChange=${(e) => setMemo(e.target.value)} placeholder="예: 분할 매수 2회차" /><//>
          </div>
        </details>
        ${pv && html`<div className="pv">
          ${side === 'BUY' ? html`<div className="row"><span className="m">매수 후</span><span className="v">${qty(pv.quantity)} · 평균 ${fmtPrice(pv.avgPrice, cc)}</span></div>`
          : html`<div className="row"><span className="m">실현손익</span><span className=${'v ' + cls(pv.realizedKrw)}>${pv.realizedNative != null && pc === 'USD' ? usd(pv.realizedNative, { sign: true }) + ' · ' : ''}${won(pv.realizedKrw, { sign: true })}</span></div>
            <div className="row"><span className="m">매도 후</span><span className="v">${qty(pv.quantity)} · 평균 매수가 그대로</span></div>`}
          <div className="row"><span className="m">현금</span><span className="v">${applyCash ? money(cashAmt, side === 'BUY' ? cc : pc, { sign: true }) : '반영 안 함'}</span></div>
          ${side === 'SELL' && html`<div className="sm">세금 전 금액이에요. 양도세는 계산하지 않아요.</div>`}
        </div>`}
      </section>
      <div className="actions"><button className=${'btn ' + (side === 'BUY' ? 'buy' : 'sell')} style=${{ background: side === 'BUY' ? 'var(--up)' : 'var(--down)' }} type="button" onClick=${save}>${side === 'BUY' ? '매수 기록하기' : '매도 기록하기'}</button></div>
    </div>
    ${notice && html`<${BottomSheet} title="이제 매매하면 현금이 자동으로 바뀌어요" onClose=${closeNotice}
      footer=${html`<button className="btn" type="button" onClick=${closeNotice}>알겠어요</button>`}>
      <p className="hint">산 금액은 이 계좌 현금에서 빠지고, 판 금액은 현금에 더해져요. 현금을 따로 고치지 않아도 돼요.</p>
      <p className="hint">반영하고 싶지 않으면 '상세'에서 끌 수 있어요. 계좌마다 마지막 선택을 기억해요.</p>
    <//>`}`;
}
