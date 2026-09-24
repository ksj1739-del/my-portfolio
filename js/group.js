// 같은 종목 합산 보기(M3)와 종목 상세 손익 펼침(M2) 화면 규칙. 순수 함수만 둔다(tests-m3.html).
// 합산은 화면에서만 한다. holdings 저장 구조는 바꾸지 않는다(§3.3.2).
import { fees, priceCurrency, costCurrency } from './calc.js';

// 합산 키(§3.3.2): 해외는 티커, 국내는 이름 정규화(종목코드가 비어 있을 수 있어서). 중복 판정·합산·배당이 같이 쓴다
export const holdingKey = (h) => (h.market || '') + ':' + (h.market === 'US'
  ? (h.ticker || '').toUpperCase().trim()
  : (h.name || '').replace(/\s/g, '').toLowerCase());

const usdUsd = (h) => priceCurrency(h) === 'USD' && costCurrency(h) === 'USD';
const EPS = 1e-9;

// 레버리지 뱃지(표시 전용). 1이나 빈 값이면 없음
export const LEVERAGE_OPTS = [[-1, '인버스'], [1, '1배'], [2, '2배'], [3, '3배']];
export function leverageBadge(lev) {
  const n = Number(lev);
  if (!n || n === 1) return null;
  if (n === -1) return { text: '인버스', cls: 'dn' };
  return { text: `${n}배`, cls: 'lev' };
}

// 계좌 짧은 이름: "키움 · 해외주식" → "키움". 첫 단어가 겹치는 계좌는 전체 이름 그대로
export function shortAccNames(accounts) {
  const first = (a) => (a.name || '').split(/\s/)[0] || a.name || '';
  const cnt = {};
  for (const a of accounts) cnt[first(a)] = (cnt[first(a)] || 0) + 1;
  return Object.fromEntries(accounts.map((a) => [a.id, cnt[first(a)] > 1 ? a.name : first(a)]));
}

// "키움" / "키움 외 1"
export const accLabel = (names) => (names.length > 1 ? `${names[0]} 외 ${names.length - 1}` : names[0] || '');

// summarize().rows({h, acc, v})를 합산 키로 묶는다. accountId를 주면 그 계좌 행만(합산 없음)
export function groupRows(rows, { accountId, market = 'all', accountOrder = [] } = {}) {
  const order = (id) => { const i = accountOrder.indexOf(id); return i < 0 ? 1e9 : i; };
  const live = rows.filter((r) => r.h.quantity > EPS
    && (!accountId || r.h.accountId === accountId)
    && (market === 'all' || (market === 'US' ? r.h.market === 'US' : r.h.market !== 'US')));
  const m = new Map();
  for (const r of live) {
    const k = accountId ? 'id:' + r.h.id : holdingKey(r.h);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return [...m.entries()].map(([k, items]) => {
    items.sort((a, b) => order(a.h.accountId) - order(b.h.accountId));
    return makeGroup(accountId ? holdingKey(items[0].h) : k, items);
  });
}

export function makeGroup(key, items) {
  const h = items[0].h;
  const Q = items.reduce((s, r) => s + r.h.quantity, 0);
  const ccs = new Set(items.map((r) => r.v.cc));
  const mixedCost = ccs.size > 1;
  const avgPrice = mixedCost || !Q ? null : items.reduce((s, r) => s + r.h.quantity * r.h.avgPrice, 0) / Q; // 수수료 제외
  const pc = items[0].v.pc;
  const mvNative = items.reduce((s, r) => s + r.v.mvNative, 0);
  const krwOk = items.every((r) => r.v.mvKrw != null && r.v.pnlKrw != null);
  const mvKrw = krwOk ? items.reduce((s, r) => s + r.v.mvKrw, 0) : null;
  const pnlKrw = krwOk ? items.reduce((s, r) => s + r.v.pnlKrw, 0) : null;
  const base = krwOk ? items.reduce((s, r) => s + r.v.base, 0) : null;
  const ret = base ? (pnlKrw / base) * 100 : null;
  const allUsd = items.every((r) => usdUsd(r.h));
  let pnlUsd = null, retUsd = null;
  if (allUsd) {
    pnlUsd = items.reduce((s, r) => s + r.v.pnlUsd, 0);
    const bUsd = items.reduce((s, r) => s + r.v.costNative * (1 + fees(r.acc, r.h).fb), 0);
    retUsd = bUsd ? (pnlUsd / bUsd) * 100 : null;
  }
  const prices = new Set(items.map((r) => Math.round(r.v.price * 1e6)));
  const lev = items.map((r) => Number(r.h.leverage) || 1).find((x) => x !== 1) || 1;
  return {
    key, h, items, count: items.length, accountIds: items.map((r) => r.h.accountId),
    accNames: items.map((r) => r.acc?.name || ''),
    quantity: Q, avgPrice, mixedCost, cc: mixedCost ? null : [...ccs][0], pc,
    price: items[0].v.price, hasPrice: items.every((r) => r.v.hasPrice), pricesDiffer: prices.size > 1,
    mvNative, mvKrw, pnlKrw, base, ret, allUsd, pnlUsd, retUsd, leverage: lev,
  };
}

// 목록 행 손익: 모든 계좌가 USD/USD면 달러 손익, 아니면 원화 손익. %는 같은 기준(§3.3.5)
export function rowPl(g) {
  if (g.pc === 'USD' && g.allUsd) return { value: g.pnlUsd, cur: 'USD', ret: g.retUsd };
  return { value: g.pnlKrw, cur: 'KRW', ret: g.ret };
}
// 목록 오른쪽 위 숫자: 평가금(해외는 $) 또는 현재가
export function rowValue(g, mode) {
  if (mode === 'price') return { value: g.price, cur: g.pc, price: true };
  return g.pc === 'USD' ? { value: g.mvNative, cur: 'USD' } : { value: g.mvKrw, cur: 'KRW' };
}

export const SORTS = [['mv', '평가금액 높은 순'], ['retDesc', '수익률 높은 순'], ['retAsc', '수익률 낮은 순'], ['name', '이름순']];
const gname = (g) => (g.h.market === 'US' ? g.h.ticker || g.h.name || '' : g.h.name || g.h.ticker || '');
export function sortGroups(groups, mode = 'mv') {
  const nz = (v, d) => (v == null || !isFinite(v) ? d : v);
  const r = (g) => rowPl(g).ret;
  const cmp = {
    mv: (a, b) => nz(b.mvKrw, -Infinity) - nz(a.mvKrw, -Infinity),
    retDesc: (a, b) => nz(r(b), -Infinity) - nz(r(a), -Infinity),
    retAsc: (a, b) => nz(r(a), Infinity) - nz(r(b), Infinity),
    name: (a, b) => gname(a).localeCompare(gname(b), 'ko'),
  }[mode] || (() => 0);
  return [...groups].sort((a, b) => cmp(a, b) || gname(a).localeCompare(gname(b), 'ko'));
}

// 목록 행 링크: 한 계좌면 계좌별 상세, 여러 계좌면 합산 상세
export const groupHref = (g) => (g.count > 1 ? '#/holding/g/' + encodeURIComponent(g.key) : '#/holding/' + g.h.id);

// 합산 상세의 매수·매도 → 계좌 선택(§3.3.5, M3-4). 마지막 사용 계좌가 맨 위, 매도는 보유 수량이 있는 계좌만
export function accountChoices(holdings, key, side, lastAccountId) {
  return holdings.filter((h) => holdingKey(h) === key && (side !== 'SELL' || h.quantity > EPS))
    .sort((a, b) => (b.accountId === lastAccountId) - (a.accountId === lastAccountId));
}

// ---------- M2: 종목 상세 손익 줄 ----------
// split: 두 줄 펼침 / noFx: 환율 없음 → 계산 불가 / missing: 매입환율 미기록 · 입력하기 / none: 대상 아님(원화 원가·국내)
export function pnlView(h, v) {
  if (v.fxKnown) return v.pnlKrwAcq != null ? 'split' : 'noFx';
  if (usdUsd(h)) return 'missing';
  return 'none';
}
// 큰 손익 줄은 원화 금액 + 원화 기준 %(달러 %를 붙이지 않는다 §3.2.6)
export function headlinePl(v) {
  if (v.fxKnown && v.pnlKrwAcq != null) return { value: v.pnlKrwAcq, ret: v.retKrwPct };
  return { value: v.pnlKrw, ret: v.base ? (v.pnlKrw / v.base) * 100 : null };
}
// 매수 뒤 안내: 달러 종목인데 매입환율이 없으면 '처음 매입환율' 입력을 권한다
export const needFxHint = (hAfter) => usdUsd(hAfter) && !(hAfter.avgFx > 0);
