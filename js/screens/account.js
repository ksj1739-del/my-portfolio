// 내 계좌: 자산 / 거래내역 / 배당 / 수익분석 / 계좌관리 (밑줄 탭으로 전환)
import { html, useState, useRef } from '../react.js';
import { TopBar, Icon, Seg, Chips, UTabs, Empty, Amount, Avatar, ListRow, openSheet, hname, initials, holdKey } from '../components.js';
import { won, usd, pct, cls, plLine, money, qty, price as fmtPrice, fx as fxf, today } from '../format.js';
import { realizedSum } from '../calc.js';
import { moveAccount } from '../store.js';
import { TX_LABEL, TX_ICON } from './sheets.js';
import { BarChart } from '../charts.js';
import { mdLabel } from '../period.js';
import { holdingKey } from '../group.js';
import { dividendYear, dividendYears, defaultMonth, realizedPeriod, realizedYearBars, shiftMonth } from '../income.js';

const SEGS = [
  ['assets', '자산', '#/account'],
  ['history', '거래내역', '#/account/history'],
  ['dividends', '배당', '#/account/dividends'],
  ['profit', '수익분석', '#/account/profit'],
  ['manage', '계좌관리', '#/account/manage'],
];

export function Account({ ctx, params, query }) {
  const seg = params.seg || 'assets';
  const body = {
    assets: () => html`<${Assets} ctx=${ctx} />`,
    history: () => html`<${History} ctx=${ctx} query=${query} />`,
    dividends: () => html`<${Dividends} ctx=${ctx} />`,
    profit: () => html`<${Profit} ctx=${ctx} query=${query} />`,
    manage: () => html`<${Manage} ctx=${ctx} />`,
  }[seg];
  return html`
    <${TopBar} title="내 계좌" large>
      ${seg === 'manage' ? html`<a className="icon-btn" href="#/account/new" aria-label="계좌 추가"><${Icon} name="plus" /></a>`
        : html`<button className="icon-btn" type="button" aria-label="기록하기" onClick=${() => openSheet('record')}><${Icon} name="plus" /></button>`}
    <//>
    <${UTabs} label="내 계좌 메뉴" value=${seg} options=${SEGS} />
    <div className="body" style=${{ paddingTop: '12px' }}>${body()}</div>`;
}

// 계좌관리 (옛 계좌 · 수수료)
function Manage({ ctx }) {
  return html`
    <section className="sec">
      ${!ctx.accounts.length && html`<${Empty} title="계좌가 없어요" action=${{ label: '계좌 추가하기', href: '#/account/new' }} />`}
      ${ctx.accounts.map((a, i) => html`<div key=${a.id} style=${{ display: 'flex', alignItems: 'center' }}>
        <div style=${{ flex: 1, minWidth: 0 }}><${ListRow} href=${'#/account/' + a.id}
          avatar=${html`<${Avatar} text=${a.name.replace(/\s/g, '').slice(0, 2)} seed=${a.id} />`}
          title=${a.name} badge=${ctx.negCash.some((c) => c.accountId === a.id) ? { text: '현금 마이너스', cls: 'up' } : null} sub=${a.type === 'BANK' ? '현금 전용' : `${a.baseCurrency === 'USD' ? '해외($)' : '국내(원)'} · 매수 ${a.buyFeePct}% · 매도 ${a.sellFeePct}%`} /></div>
        <button className="icon-btn" type="button" aria-label=${a.name + ' 위로'} disabled=${i === 0} onClick=${() => moveAccount(a.id, -1)}><${Icon} name="down" className="i flip" /></button>
        <button className="icon-btn" type="button" aria-label=${a.name + ' 아래로'} disabled=${i === ctx.accounts.length - 1} onClick=${() => moveAccount(a.id, 1)}><${Icon} name="down" /></button>
      </div>`)}
    </section>
    <div className="actions"><a className="btn sec2" href="#/account/new">계좌 추가하기</a></div>
    <p className="sm pad" style=${{ margin: 0 }}>계좌를 누르면 이름·수수료를 고치거나 지울 수 있어요. 잘못 기록한 거래는 종목 상세나 거래내역에서 되돌릴 수 있어요.</p>`;
}

// 내 계좌 › 자산 (옛 자산 구성)
function Assets({ ctx }) {
  const { sum } = ctx;
  const [view, setView] = useState('cat');
  return html`
    <section className="sec hero">
      <span className="lbl">총자산</span>
      <${Amount} value=${sum.total} size="t1" />
      <div className=${'pl ' + cls(sum.pnlKrw)}>${plLine(sum.pnlKrw, 'KRW', sum.ret)}</div>
    </section>
    <section className="sec">
      <${Seg} label="보기" value=${view} onChange=${setView} block options=${[['cat', '분류'], ['acc', '계좌'], ['cur', '통화']]} />
      <div className="stack" aria-hidden="true" style=${{ marginTop: '8px' }}>
        ${view === 'cat' && sum.cats.filter((c) => c.value > 0).map((c) => html`<span key=${c.id} style=${{ width: c.pct + '%', background: c.color }} />`)}
        ${view === 'acc' && sum.byAccount.map((a, i) => html`<span key=${a.acc.id} style=${{ width: (a.pct || 0) + '%', background: `var(--c${(i % 5) + 1})` }} />`)}
        ${view === 'cur' && sum.byCurrency.map((c, i) => html`<span key=${c.id} style=${{ width: (c.pct || 0) + '%', background: i ? 'var(--c2)' : 'var(--c1)' }} />`)}
      </div>
      ${view === 'cat' && sum.cats.filter((c) => c.value > 0).map((c) => c.items.length ? html`
        <details key=${c.id} className="cat">
          <summary><span><i className="sw" style=${{ background: c.color }} />${c.label}</span><span className="num">${won(c.value)} · ${pct(c.pct, 1, { sign: false })} <${Icon} name="down" className="chev" /></span></summary>
          <div className="sub">
            ${c.items.map((it) => html`<div key=${it.h.id}>
              <div className="row"><span style=${{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${it.h.market === 'US' ? it.h.ticker || it.h.name : it.h.name || it.h.ticker}</span><span className="v">${pct(it.inCat, 1, { sign: false })} <span className="sm">· 전체 ${pct(it.ofTotal, 1, { sign: false })}</span></span></div>
              <div className="pbar" aria-hidden="true"><i style=${{ width: it.inCat + '%', background: c.color }} /></div>
            </div>`)}
          </div>
        </details>` : html`<div key=${c.id} className="row" style=${{ padding: '12px 0', minHeight: '48px', alignItems: 'center' }}><span style=${{ fontWeight: 600 }}><i className="sw" style=${{ background: c.color }} />${c.label}</span><span className="v">${won(c.value)} · ${pct(c.pct, 1, { sign: false })}</span></div>`)}
      ${view === 'cat' && html`<div className="sm">분류를 누르면 그 안의 종목별 비중(분류 안 % · 전체 대비 %)이 보여요.</div>`}
      ${view === 'acc' && sum.byAccount.map((a, i) => html`<div key=${a.acc.id} className="row" style=${{ padding: '8px 0' }}><span><i className="sw" style=${{ background: `var(--c${(i % 5) + 1})` }} />${a.acc.name}</span><span className="v">${won(a.totalKrw)} · ${pct(a.pct, 1, { sign: false })}</span></div>`)}
      ${view === 'cur' && sum.byCurrency.map((c, i) => html`<div key=${c.id} className="row" style=${{ padding: '8px 0' }}><span><i className="sw" style=${{ background: i ? 'var(--c2)' : 'var(--c1)' }} />${c.label}</span><span className="v">${won(c.value)} · ${pct(c.pct, 1, { sign: false })}</span></div>`)}
    </section>
    <section className="sec">
      <a className="row" href="#/account/history?f=cash"><span className="m">원화 현금</span><span className="v">${won(sum.cashKRW)} ›</span></a>
      <a className="row" href="#/account/history?f=cash"><span className="m">달러 현금</span><span className="v">${usd(sum.cashUSD)} ›</span></a>
    </section>`;
}

// ---------- 내 계좌 › 거래내역 (trades + cashTx + dividends를 읽을 때 합친다) ----------
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const dayLabel = (d) => { const x = new Date(d + 'T00:00:00'); return `${x.getMonth() + 1}월 ${x.getDate()}일 (${WD[x.getDay()]})`; };
const monthLabel = (m) => `${m.slice(0, 4)}년 ${Number(m.slice(5, 7))}월`;

// 화면에 그릴 항목. 환전은 한 줄, 이체는 계좌 필터가 없으면 한 줄로 합친다
export function timelineItems(ctx, { f = 'all', acc = '' } = {}) {
  const out = [];
  const inAcc = (id) => !acc || id === acc;
  if (f === 'all' || f === 'trade') {
    for (const t of ctx.trades) if (inAcc(t.accountId)) out.push({ kind: 'trade', id: t.id, date: t.tradedAt, createdAt: t.createdAt, t });
  }
  if (f === 'all' || f === 'div') {
    for (const d of ctx.dividends) if (inAcc(d.accountId)) out.push({ kind: 'div', id: d.id, date: d.payDate, createdAt: d.createdAt, d });
  }
  if (f === 'all' || f === 'cash') {
    const seen = new Set();
    for (const r of ctx.cashTx) {
      if (!inAcc(r.accountId)) continue;
      if (r.pairId && (r.type === 'fx' || !acc)) {
        if (seen.has(r.pairId)) continue;
        seen.add(r.pairId);
        out.push({ kind: 'cash', id: r.id, date: r.date, createdAt: r.createdAt, r, legs: ctx.cashTx.filter((x) => x.pairId === r.pairId) });
      } else out.push({ kind: 'cash', id: r.id, date: r.date, createdAt: r.createdAt, r, legs: [r] });
    }
  }
  return out.sort((a, b) => (b.date + (b.createdAt || '')).localeCompare(a.date + (a.createdAt || '')));
}

// 외부 입출금의 원화 값(기록 시점에 고정한 값 우선)
const extKrw = (r, fx) => (r.krwValue != null ? r.krwValue : r.currency === 'USD' ? (fx ? r.amount * fx : 0) : r.amount);

// 금액은 현금 흐름이라 손익 색을 쓰지 않는다. 매도 실현손익만 둘째 줄에 손익 색으로
function TradeRow({ ctx, t }) {
  const acc = ctx.accById[t.accountId];
  const kind = t.initial ? '처음 보유' : t.side === 'BUY' ? '매수' : '매도';
  const cur = t.cashApplied?.currency || t.priceCurrency;
  const fee = (t.feePct || 0) / 100;
  const flow = t.cashApplied ? t.cashApplied.amount : t.side === 'BUY' ? -t.quantity * t.price * (1 + fee) : t.quantity * t.price * (1 - fee);
  const sub = [acc?.name || '삭제된 계좌', `${qty(t.quantity)} × ${fmtPrice(t.price, t.priceCurrency)}`, t.memo].filter(Boolean).join(' · ');
  const rs = [];
  if (t.initial) rs.push(html`<span key="i">처음 보유</span>`);
  else if (!t.cashApplied) rs.push(html`<span key="n" style=${{ color: 'var(--t4)' }}>현금 미반영</span>`);
  if (t.side === 'SELL' && t.realizedKrw != null) rs.push(html`<span key="r" className=${cls(t.realizedKrw)}>${rs.length ? ' · ' : ''}${won(t.realizedKrw, { sign: true })}</span>`);
  return html`<${ListRow} onClick=${() => openSheet('trade', { sid: t.id })} label=${`${hname(t)} ${kind}`}
    avatar=${html`<${Avatar} text=${initials(t)} seed=${holdKey(t)} />`}
    title=${`${hname(t)} ${kind}`} badge=${t.closed ? { text: '정리됨' } : null} sub=${sub}
    right=${html`<${Amount} value=${t.initial ? t.quantity * t.price : flow} cur=${t.initial ? t.priceCurrency : cur} sign=${!t.initial} />`}
    rightSub=${rs.length ? rs : null} />`;
}

function CashRow({ ctx, it, acc }) {
  const { r, legs } = it;
  const an = (id) => ctx.accById[id]?.name || '삭제된 계좌';
  let title = TX_LABEL[r.type], sub, right;
  if (r.system === 'migration') title = '기초 잔액';
  else if (r.system === 'undo') title = '되돌리기 보정';
  if (r.type === 'fx' && legs.length === 2) {
    const inn = legs.find((x) => x.amount > 0), out = legs.find((x) => x.amount < 0);
    sub = [an(r.accountId), `${fxf(r.fxRate)}원/$`, money(out.amount, out.currency, { sign: true }), r.memo].filter(Boolean).join(' · ');
    right = html`<${Amount} value=${inn.amount} cur=${inn.currency} sign />`;
  } else if (r.type === 'transfer' && legs.length === 2 && !acc) {
    const out = legs.find((x) => x.amount < 0), inn = legs.find((x) => x.amount > 0);
    sub = [`${an(out.accountId)} → ${an(inn.accountId)}`, r.memo].filter(Boolean).join(' · ');
    right = html`<${Amount} value=${inn.amount} cur=${r.currency} />`;
  } else {
    const memo = r.system === 'migration' ? '' : r.memo || (r.type === 'adjust' ? '증권사 잔고와 맞춤' : '');
    sub = [an(r.accountId), memo].filter(Boolean).join(' · ');
    right = html`<${Amount} value=${r.amount} cur=${r.currency} sign />`;
  }
  return html`<${ListRow} onClick=${() => openSheet(r.type, { sid: r.id })} label=${title}
    avatar=${html`<${Avatar} icon=${TX_ICON[r.type]} seed=${r.type} />`} title=${title} sub=${sub} right=${right} />`;
}

function DivRow({ ctx, d }) {
  const sub = [ctx.accById[d.accountId]?.name, `세전 ${money(d.gross, d.currency)}`, d.taxRate != null ? `${d.taxRate}%` : null].filter(Boolean).join(' · ');
  return html`<${ListRow} onClick=${() => openSheet('div', { sid: d.id })} label=${`${hname(d)} 배당`}
    avatar=${html`<${Avatar} icon="coin" seed="div" />`} title=${`${hname(d)} 배당`} sub=${sub}
    right=${html`<${Amount} value=${d.net} cur=${d.currency} sign />`} />`;
}

const FILTERS = [['all', '전체'], ['trade', '매매'], ['div', '배당'], ['cash', '입출금']];
function History({ ctx, query }) {
  const [f, setF] = useState(FILTERS.some(([v]) => v === query.f) ? query.f : 'all');
  const [acc, setAcc] = useState(query.acc && ctx.accById[query.acc] ? query.acc : '');
  const [months, setMonths] = useState(3);
  const items = timelineItems(ctx, { f, acc });
  const allMonths = [...new Set(items.map((x) => x.date.slice(0, 7)))];
  const neg = ctx.negCash.filter((c) => !acc || c.accountId === acc);
  const realized = realizedSum(ctx.trades, { year: ctx.year, accountId: acc || undefined });
  return html`
    <div className="tl-bar">
      <${Chips} label="거래 종류" value=${f} onChange=${(v) => { setF(v); setMonths(3); }} options=${FILTERS} />
      ${ctx.accounts.length > 1 && html`<select className="inp" aria-label="계좌" value=${acc} onChange=${(e) => setAcc(e.target.value)}>
        <option value="">전체 계좌</option>${ctx.accounts.map((a) => html`<option key=${a.id} value=${a.id}>${a.name}</option>`)}</select>`}
    </div>
    ${neg.map((c) => html`<${NegCash} key=${c.id} ctx=${ctx} c=${c} />`)}
    ${f === 'trade' && html`<section className="sec">
      <div className="row"><span className="m">${ctx.year}년 실현손익 <span className="sm">세금 전</span></span><span className=${'v ' + cls(realized)}>${won(realized, { sign: true })}</span></div>
      <div className="sm">참고용이에요. 세금 신고는 증권사 자료로 해 주세요.</div></section>`}
    ${!items.length && html`<${Empty} icon="clock" title=${f === 'div' ? '받은 배당 기록이 아직 없어요' : '아직 기록이 없어요'} desc="오른쪽 위 + 버튼으로 매매·입출금·환전을 기록할 수 있어요." action=${{ label: '기록하기', onClick: () => openSheet('record') }} />`}
    ${allMonths.slice(0, months).map((m) => {
      const its = items.filter((x) => x.date.startsWith(m));
      let dep = 0, wd = 0;
      for (const x of its) if (x.kind === 'cash' && x.r.external) { const v = extKrw(x.r, ctx.fxRate); if (v > 0) dep += v; else wd += v; }
      const days = [...new Set(its.map((x) => x.date))];
      return html`<div key=${m}>
        <div className="tl-month">
          <div className="row"><span>${monthLabel(m)}</span><span className="num">순 ${won(dep + wd, { sign: true })}</span></div>
          <div className="sm">입금 ${won(dep, { sign: true })} · 출금 ${won(wd, { sign: true })}</div>
        </div>
        <section className="sec" style=${{ paddingTop: '4px' }}>
          ${days.map((d) => html`<div key=${d}>
            <div className="tl-day">${dayLabel(d)}</div>
            ${its.filter((x) => x.date === d).map((x) => (x.kind === 'trade' ? html`<${TradeRow} key=${x.id} ctx=${ctx} t=${x.t} />`
              : x.kind === 'div' ? html`<${DivRow} key=${x.id} ctx=${ctx} d=${x.d} />`
              : html`<${CashRow} key=${x.id} ctx=${ctx} it=${x} acc=${acc} />`))}
          </div>`)}
        </section>
      </div>`;
    })}
    ${allMonths.length > months && html`<div className="actions"><button className="btn sec2" type="button" onClick=${() => setMonths(months + 3)}>이전 기록 더 보기</button></div>`}`;
}

// ---------- 내 계좌 › 배당 (M5 §3.5.4) ----------
const pad2 = (n) => String(n).padStart(2, '0');
const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const startCur = (ctx) => (ctx.settings.totalCurrency === 'USD' && ctx.fxRate ? 'USD' : 'KRW');
const CurToggle = ({ ctx, value, onChange }) => (ctx.fxRate ? html`<${Seg} label="표시 통화" value=${value} onChange=${onChange} options=${[['KRW', '원'], ['USD', '$']]} />` : null);

function Dividends({ ctx }) {
  const t0 = today();
  const ty = ctx.year, tm = Number(t0.slice(5, 7)) - 1;
  const [cur, setCur] = useState(startCur(ctx));
  const [year, setYearS] = useState(ty);
  const [month, setMonth] = useState(null); // null = 기본(이번 달 또는 가장 최근 받은 달)
  if (!ctx.dividends.length) {
    return html`<${Empty} icon="coin" title="아직 배당 기록이 없어요" desc="배당을 받으면 기록해 보세요." action=${{ label: '배당 기록하기', onClick: () => openSheet('div') }} />`;
  }
  const years = dividendYears(ctx.dividends, ty);
  const Y = dividendYear(ctx.dividends, year, cur, ctx.fxRate);
  const m = month ?? defaultMonth(Y.counts, year, t0);
  const setYear = (y) => { setYearS(y); setMonth(null); };
  const values = Y.months.map((v, i) => (year === ty && i > tm ? null : v));
  const ym = `${year}-${pad2(m + 1)}`;
  const list = ctx.dividends.filter((d) => d.payDate.startsWith(ym)).sort((a, b) => (b.payDate + b.createdAt).localeCompare(a.payDate + a.createdAt));
  const label = year === ty ? '올해 받은 배당' : `${year}년 받은 배당`;
  return html`
    <section className="sec hero" aria-label=${label}>
      <div className="m56-top"><span className="lbl">${label}</span><${CurToggle} ctx=${ctx} value=${cur} onChange=${setCur} /></div>
      <${Amount} key=${cur + year} value=${Y.net} cur=${cur} size="t1" />
      <div className="m56-sub">세전 ${money(Y.gross, cur)} · 세금 ${money(Y.tax, cur)}</div>
      ${Y.missing > 0 && html`<div className="sm">환율이 없어 ${Y.missing}건은 합계에서 빠졌어요</div>`}
      ${years.length > 1 && html`<${Chips} label="연도" value=${year} onChange=${setYear} options=${years.map((y) => [y, String(y)])} />`}
      <div className="m56-chart">
        <${BarChart} values=${values} labels=${MONTHS} selected=${m} onSelect=${setMonth} label=${`${year}년 월별 받은 배당`}
          barLabel=${(i) => `${i + 1}월 ${values[i] == null ? '아직 안 온 달' : money(values[i], cur)}`} />
      </div>
    </section>
    <section className="sec" aria-label=${`${m + 1}월 배당`}>
      <div className="m56-mhead"><span>${m + 1}월 · ${list.length}건</span><span className="num">${money(Y.months[m], cur)}</span></div>
      ${!list.length && html`<div className="sm" style=${{ padding: '8px 0' }}>이 달에는 받은 배당이 없어요.</div>`}
      ${list.map((d) => {
        const how = d.perShare > 0 ? `${qty(d.quantity)} × ${fmtPrice(d.perShare, d.currency)} 세전` : `세전 ${money(d.gross, d.currency)}`;
        return html`<${ListRow} key=${d.id} onClick=${() => openSheet('div', { sid: d.id })} label=${`${hname(d)} 배당 ${mdLabel(d.payDate)}`}
          avatar=${html`<${Avatar} text=${initials(d)} seed=${holdKey(d)} />`} title=${hname(d)}
          sub=${[mdLabel(d.payDate), ctx.accById[d.accountId]?.name, how].filter(Boolean).join(' · ')}
          right=${html`<${Amount} value=${d.net} cur=${d.currency} sign />`} rightSub=${d.cashApplied ? null : '현금 미반영'} />`;
      })}
    </section>
    <div className="actions"><button className="btn soft" style=${{ width: '100%' }} type="button" onClick=${() => openSheet('div')}>배당 기록하기</button></div>`;
}

// ---------- 내 계좌 › 수익분석 (M6 §3.6.4): 월 실현수익 = 매도 + 배당 + 이자 ----------
const MARKETS = [['all', '전체'], ['KR', '국내'], ['US', '해외']];
function Profit({ ctx, query }) {
  const t0 = today(), thisYm = t0.slice(0, 7);
  const [view, setView] = useState(query.v === 'year' ? 'year' : 'month');
  const [ym, setYm] = useState(thisYm);
  const [year, setYear] = useState(ctx.year);
  const [market, setMarket] = useState('all');
  const [cur, setCur] = useState(startCur(ctx));
  const swipe = useRef(null);
  const args = { trades: ctx.trades, dividends: ctx.dividends, cashTx: ctx.cashTx, market, cur, fxNow: ctx.fxRate };
  const period = view === 'month' ? ym : String(year);
  const R = realizedPeriod({ ...args, period });
  const canNext = view === 'month' ? ym < thisYm : year < ctx.year;
  const move = (n) => {
    if (n > 0 && !canNext) return;
    if (view === 'month') setYm(shiftMonth(ym, n)); else setYear(year + n);
  };
  const down = (e) => { swipe.current = { x: e.clientX, y: e.clientY }; };
  const up = (e) => {
    const s = swipe.current; swipe.current = null;
    if (!s) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) move(dx < 0 ? 1 : -1);
  };
  const mNo = Number(ym.slice(5, 7));
  const navText = view === 'month' ? `${ym.slice(0, 4)}년 ${mNo}월` : `${year}년`;
  const label = view === 'month' ? (ym === thisYm ? '이번 달 실현수익' : `${mNo}월 실현수익`) : year === ctx.year ? '올해 실현수익' : `${year}년 실현수익`;
  const bars = view === 'year' ? realizedYearBars(args, year).map((v, i) => (year === ctx.year && i > Number(thisYm.slice(5, 7)) - 1 ? null : v)) : null;
  const liveKeys = new Set(ctx.holdings.filter((h) => h.quantity > 1e-9).map(holdingKey));
  const line = (name, v, note) => html`<div className="row"><span className="m">${name}</span>${note ? html`<span className="sm">${note}</span>` : html`<span className=${'v ' + cls(v)}>${money(v, cur, { sign: true })}</span>`}</div>`;
  const itemSub = (it) => {
    if (it.kind === 'interest') return ctx.accById[it.accountId]?.name || '삭제된 계좌';
    if (it.dates.length === 1) return `${mdLabel(it.dates[0].date)} ${it.dates[0].kind === 'sell' ? '매도' : '배당'}`;
    return [it.sells ? `매도 ${it.sells}건` : '', it.divs ? `배당 ${it.divs}건` : ''].filter(Boolean).join(' · ');
  };
  return html`
    <section className="sec hero" aria-label=${label} onPointerDown=${down} onPointerUp=${up} onPointerCancel=${() => { swipe.current = null; }}>
      <div className="m56-nav">
        <div className="mon">
          <button className="icon-btn" type="button" aria-label=${view === 'month' ? '이전 달' : '이전 해'} onClick=${() => move(-1)}><${Icon} name="left" /></button>
          <b aria-live="polite">${navText}</b>
          <button className="icon-btn" type="button" aria-label=${view === 'month' ? '다음 달' : '다음 해'} disabled=${!canNext} onClick=${() => move(1)}><${Icon} name="right" /></button>
        </div>
        <${Seg} label="보기" value=${view} onChange=${(v) => { setView(v); if (v === 'year') setYear(Number(ym.slice(0, 4))); }} options=${[['month', '월'], ['year', '연']]} />
      </div>
      <span className="lbl">${label}</span>
      <${Amount} key=${cur + period + market} value=${R.total} cur=${cur} sign size="t1" className=${cls(R.total)} />
      <div className="m56-lines">
        ${line('판매수익', R.sell)}
        ${line('배당금', R.div)}
        ${line('이자', R.interest, R.interestHidden ? '이자는 전체에서만 보여요' : null)}
      </div>
      <div className="m56-ctl">
        <${Chips} label="시장" value=${market} onChange=${setMarket} options=${MARKETS} />
        <${CurToggle} ctx=${ctx} value=${cur} onChange=${setCur} />
      </div>
      ${bars && html`<div className="m56-chart">
        <${BarChart} values=${bars} labels=${MONTHS} tone="pl" onSelect=${(i) => { setYm(`${year}-${pad2(i + 1)}`); setView('month'); }} label=${`${year}년 월별 실현수익`}
          barLabel=${(i) => `${i + 1}월 ${bars[i] == null ? '아직 안 온 달' : money(bars[i], cur, { sign: true })}, 누르면 그 달로 가요`} />
      </div>`}
    </section>
    <section className="sec" aria-label="종목별">
      <h2>종목별</h2>
      ${!R.items.length && html`<div className="sm" style=${{ padding: '8px 0' }}>${view === 'month' ? '이 달에는' : '이 해에는'} 매도·배당·이자 기록이 없어요.</div>`}
      ${R.items.map((it) => (it.kind === 'interest'
        ? html`<${ListRow} key=${it.key} avatar=${html`<${Avatar} icon="pct" seed="interest" />`} title="이자" sub=${itemSub(it)}
            right=${html`<span className=${cls(it.total)}>${money(it.total, cur, { sign: true })}</span>`} />`
        : html`<${ListRow} key=${it.key} avatar=${html`<${Avatar} text=${initials(it)} seed=${holdKey(it)} />`} title=${hname(it)}
            badge=${liveKeys.has(it.key) ? null : { text: '전량 매도' }} sub=${itemSub(it)}
            right=${html`<span className=${cls(it.total)}>${money(it.total, cur, { sign: true })}</span>`} />`))}
    </section>
    ${view === 'year' && ctx.accounts.length > 1 && html`<details className="sec m56-acc">
      <summary>계좌별 <${Icon} name="down" className="chev" /></summary>
      ${ctx.accounts.map((a) => { const v = realizedPeriod({ ...args, period, accountId: a.id }).total; return html`<div key=${a.id} className="row"><span className="m">${a.name}</span><span className=${'v ' + cls(v)}>${money(v, cur, { sign: true })}</span></div>`; })}
    </details>`}
    <p className="sm m56-cap">
      수수료·거래세는 뺐고, 양도세 등 세금은 반영하지 않았어요. 배당은 원천징수 후예요.
      ${R.noFxSells > 0 ? html`<br />환율이 없는 매도 ${R.noFxSells}건은 빠졌어요.` : null}
      ${R.estimated ? html`<br />환율 기록이 없는 일부는 지금 환율로 바꾼 추정이에요.` : null}
    </p>`;
}

// 음수 잔액 경고(§3.1.3). 막지 않고 알려만 준다
export function NegCash({ ctx, c }) {
  return html`<div className="banner" role="status"><span>${ctx.accById[c.accountId]?.name} ${c.currency === 'USD' ? '달러' : '원화'} 잔고가 마이너스예요 — 입금 기록이 빠졌을 수 있어요</span>
    <button type="button" onClick=${() => openSheet('adjust', { sa: c.accountId, sc: c.currency })}>잔액 맞추기</button></div>`;
}
