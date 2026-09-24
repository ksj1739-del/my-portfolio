// M5 받은 배당 + M6 수익분석(월 실현수익 = 매도 + 배당 + 이자). 순수 함수만 둔다(tests-m56.html).
// 월·연 구분은 날짜 문자열을 잘라서 한다('YYYY-MM-DD'.slice(0, 7)). new Date('YYYY-MM-DD')는 쓰지 않는다.
import { holdingKey } from './group.js';

const EPS = 1e-9;
// 달러는 센트, 원은 1원 단위로 반올림
export const roundCur = (v, cur) => (cur === 'USD' ? Math.round(v * 100) / 100 : Math.round(v));

// ---------- M5 배당 계산(§3.5.3) ----------
// 입력: mode 'per'(주당) | 'total'(총액). netOverride를 주면 세금을 거꾸로 계산(gross 유지)
// 반환 {perShare, quantity, gross, tax, net} 또는 {error}
export function dividendCalc({ mode = 'per', perShare, quantity, gross, taxRate, netOverride, currency = 'USD' }) {
  const q = Number(quantity) || 0;
  let g, ps;
  if (mode === 'per') {
    ps = Number(perShare);
    if (!(ps > 0)) return { error: '주당 배당을 넣어 주세요' };
    if (!(q > 0)) return { error: '수량을 넣어 주세요' };
    g = roundCur(ps * q, currency);
  } else {
    g = roundCur(Number(gross), currency);
    if (!(g > 0)) return { error: '세전 총액을 넣어 주세요' };
    ps = q > 0 ? g / q : null;
  }
  const r = Number(taxRate);
  if (!(r >= 0 && r <= 100)) return { error: '세율은 0~100% 사이로 넣어 주세요' };
  let tax, net;
  const o = netOverride == null || netOverride === '' ? null : Number(netOverride);
  if (o != null && isFinite(o)) {
    net = roundCur(o, currency);
    if (net < 0 || net > g + EPS) return { error: '받은 금액은 세전 총액보다 클 수 없어요' };
    tax = roundCur(g - net, currency);
  } else {
    tax = roundCur((g * r) / 100, currency);
    net = roundCur(g - tax, currency);
  }
  return { perShare: ps, quantity: q, gross: g, tax, net };
}

// 원화·달러 환산. fxRate(기록 시점) → 없으면 지금 환율. 둘 다 없으면 null
export const divFx = (d, fxNow) => (d.fxRate > 0 ? d.fxRate : fxNow > 0 ? fxNow : null);
export function toKrw(v, cur, fx) { if (cur !== 'USD') return v; return fx ? v * fx : null; }
export function toUsd(v, cur, fx) { if (cur === 'USD') return v; return fx ? v / fx : null; }
export const divIn = (d, field, cur, fxNow) => (cur === 'USD' ? toUsd(d[field], d.currency, divFx(d, fxNow)) : toKrw(d[field], d.currency, divFx(d, fxNow)));

// 지급일 보유 수량(§3.5.2): 그 계좌·그 키의 거래 중 tradedAt ≤ payDate인 Σ매수 − Σ매도.
// 0 이하이거나 거래 합계와 지금 보유 수량이 어긋나면(수량 직접 수정 흔적) 지금 수량 + check
export function qtyAtDate({ trades = [], holdings = [], key, accountId, date }) {
  const mine = trades.filter((t) => t.accountId === accountId && holdingKey(t) === key);
  const sum = (arr) => arr.reduce((s, t) => s + (t.side === 'SELL' ? -1 : 1) * (Number(t.quantity) || 0), 0);
  const atDate = sum(mine.filter((t) => (t.tradedAt || '') <= date));
  const all = sum(mine);
  const cur = holdings.filter((h) => h.accountId === accountId && holdingKey(h) === key).reduce((s, h) => s + (Number(h.quantity) || 0), 0);
  const mismatch = Math.abs(all - cur) > 1e-6;
  if (atDate > EPS && !mismatch) return { quantity: Math.round(atDate * 1e8) / 1e8, check: false };
  return { quantity: cur > EPS ? cur : 0, check: true };
}

// 배당 종목 고르기: 보유 중(수량 > 0) + 예전 보유(trades 기준, 지금은 0주·삭제)
// 반환 [{key, market, ticker, name, past, accountIds}]
export function dividendChoices(holdings = [], trades = []) {
  const m = new Map();
  const put = (x, accountId, live) => {
    const k = holdingKey(x);
    if (!k || k.endsWith(':')) return;
    const c = m.get(k) || { key: k, market: x.market, ticker: x.ticker || '', name: x.name || '', live: new Set(), seen: new Set() };
    if (!c.ticker && x.ticker) c.ticker = x.ticker;
    if (!c.name && x.name) c.name = x.name;
    (live ? c.live : c.seen).add(accountId);
    m.set(k, c);
  };
  for (const h of holdings) put(h, h.accountId, h.quantity > EPS);
  for (const t of trades) put(t, t.accountId, false);
  const nm = (c) => (c.market === 'US' ? c.ticker || c.name : c.name || c.ticker);
  return [...m.values()].map((c) => ({
    key: c.key, market: c.market, ticker: c.ticker, name: c.name, past: c.live.size === 0,
    accountIds: c.live.size ? [...c.live] : [...c.seen],
  })).sort((a, b) => (a.past - b.past) || nm(a).localeCompare(nm(b), 'ko'));
}

// 지급일 환율(참고용): 그날 스냅샷 usdKrw → 없으면 지금 환율
export function payDateFx(snapshots = [], date, fxNow) {
  const s = snapshots.find((x) => x.date === date && x.usdKrw > 0);
  return s ? s.usdKrw : fxNow > 0 ? fxNow : null;
}

// 연도별 배당 요약: 세후·세전·세금 합계와 12개월 세후 합(선택 통화)
export function dividendYear(dividends = [], year, cur = 'KRW', fxNow = null) {
  const y = String(year);
  const list = dividends.filter((d) => (d.payDate || '').startsWith(y + '-'));
  const months = Array(12).fill(0), counts = Array(12).fill(0);
  let net = 0, gross = 0, tax = 0, missing = 0;
  for (const d of list) {
    const n = divIn(d, 'net', cur, fxNow);
    if (n == null) { missing++; continue; }
    const i = Number(d.payDate.slice(5, 7)) - 1;
    months[i] += n; counts[i]++;
    net += n; gross += divIn(d, 'gross', cur, fxNow); tax += divIn(d, 'tax', cur, fxNow) ?? 0;
  }
  return { net, gross, tax, months, counts, count: list.length, missing };
}

export const dividendYears = (dividends = [], thisYear) =>
  [...new Set([thisYear, ...dividends.map((d) => Number((d.payDate || '').slice(0, 4))).filter(Boolean)])].sort((a, b) => b - a);

// 기본 선택 달(0~11): 올해면 이번 달에 기록이 있으면 이번 달, 아니면 가장 최근 받은 달. 없으면 이번 달(지난해면 12월)
export function defaultMonth(counts, year, today) {
  const ty = Number(today.slice(0, 4)), tm = Number(today.slice(5, 7)) - 1;
  const last = year === ty ? tm : 11;
  if (counts[last] > 0) return last;
  for (let i = last; i >= 0; i--) if (counts[i] > 0) return i;
  return last;
}

// ---------- M6 월 실현수익(§3.6.3) ----------
// period: 'YYYY-MM'(월) 또는 'YYYY'(연). market: 'all'|'KR'|'US'. cur: 'KRW'|'USD'
// 반환 {sell, div, interest, total, items, noFxSells, estimated, interestHidden}
const inPeriod = (date, period) => (date || '').startsWith(period + (period.length === 4 ? '-' : ''));
const mkOk = (m, market) => market === 'all' || (market === 'US' ? m === 'US' : m !== 'US');

// 매도 1건의 실현손익(선택 통화). null이면 계산 불가(합계에서 뺌)
export function sellValue(t, cur, fxNow) {
  if (cur !== 'USD') return t.realizedKrw != null && isFinite(t.realizedKrw) ? { v: t.realizedKrw, est: false } : null;
  if (t.priceCurrency === 'USD' && t.realizedNative != null && isFinite(t.realizedNative)) return { v: t.realizedNative, est: false };
  if (t.realizedKrw == null || !isFinite(t.realizedKrw)) return null;
  if (t.fxRate > 0) return { v: t.realizedKrw / t.fxRate, est: false };
  return fxNow > 0 ? { v: t.realizedKrw / fxNow, est: true } : null;
}
function interestValue(r, cur, fxNow) {
  if (r.currency === cur) return { v: r.amount, est: false };
  const f = r.fxRate > 0 ? r.fxRate : fxNow > 0 ? fxNow : null;
  if (!f) return null;
  return { v: cur === 'USD' ? r.amount / f : r.amount * f, est: !(r.fxRate > 0) };
}
function divValue(d, cur, fxNow) {
  const v = divIn(d, 'net', cur, fxNow);
  if (v == null) return null;
  return { v, est: d.currency !== cur && !(d.fxRate > 0) };
}

export function realizedPeriod({ trades = [], dividends = [], cashTx = [], period, market = 'all', cur = 'KRW', fxNow = null, accountId }) {
  let sell = 0, div = 0, interest = 0, noFxSells = 0, estimated = false;
  const items = new Map();
  const acc = (id) => !accountId || id === accountId;
  const item = (k, base) => { if (!items.has(k)) items.set(k, { key: k, sell: 0, div: 0, interest: 0, total: 0, sells: 0, divs: 0, dates: [], ...base }); return items.get(k); };
  for (const t of trades) {
    if (t.side !== 'SELL' || !inPeriod(t.tradedAt, period) || !mkOk(t.market, market) || !acc(t.accountId)) continue;
    const r = sellValue(t, cur, fxNow);
    if (!r) { noFxSells++; continue; }
    if (r.est) estimated = true;
    sell += r.v;
    const it = item(holdingKey(t), { kind: 'stock', market: t.market, ticker: t.ticker, name: t.name, closed: false });
    it.sell += r.v; it.total += r.v; it.sells++; it.dates.push({ date: t.tradedAt, kind: 'sell' });
    if (t.closed) it.closed = true;
  }
  for (const d of dividends) {
    if (!inPeriod(d.payDate, period) || !mkOk(d.market, market) || !acc(d.accountId)) continue;
    const r = divValue(d, cur, fxNow);
    if (!r) continue;
    if (r.est) estimated = true;
    div += r.v;
    const it = item(d.holdingKey || holdingKey(d), { kind: 'stock', market: d.market, ticker: d.ticker, name: d.name, closed: false });
    it.div += r.v; it.total += r.v; it.divs++; it.dates.push({ date: d.payDate, kind: 'div' });
  }
  const interestHidden = market !== 'all';
  if (!interestHidden) {
    for (const r of cashTx) {
      if (r.type !== 'interest' || !inPeriod(r.date, period) || !acc(r.accountId)) continue;
      const x = interestValue(r, cur, fxNow);
      if (!x) continue;
      if (x.est) estimated = true;
      interest += x.v;
      const it = item('interest:' + r.accountId, { kind: 'interest', accountId: r.accountId });
      it.interest += x.v; it.total += x.v; it.dates.push({ date: r.date, kind: 'interest' });
    }
  }
  const list = [...items.values()].map((it) => ({ ...it, dates: it.dates.sort((a, b) => (a.date < b.date ? 1 : -1)) }))
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  return { sell, div, interest, total: sell + div + interest, items: list, noFxSells, estimated, interestHidden };
}

// 연 보기 12개월 합계
export function realizedYearBars(args, year) {
  return Array.from({ length: 12 }, (_, i) => realizedPeriod({ ...args, period: `${year}-${String(i + 1).padStart(2, '0')}` }).total);
}

// 달 이동: 'YYYY-MM' + n
export function shiftMonth(ym, n) {
  let y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)) - 1 + n;
  y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
  return `${y}-${String(m + 1).padStart(2, '0')}`;
}
