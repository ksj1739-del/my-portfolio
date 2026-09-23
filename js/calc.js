// 계산 엔진(순수 함수). 설계서 §5, §14 기준.
// 요율은 계좌에 % 단위로 저장하고 여기서 한 번만 소수로 바꾼다.

export const CATEGORIES = [
  { id: 'ETF', label: 'ETF', color: 'var(--c1)' },
  { id: 'STOCK', label: '개별주식', color: 'var(--c2)' },
  { id: 'BOND', label: '채권', color: 'var(--c4)' },
  { id: 'OTHER', label: '기타', color: 'var(--c5)' },
];
export const CASH_COLOR = 'var(--c3)';
export const catLabel = (id) => (CATEGORIES.find((c) => c.id === id) || { label: id }).label;

export function fees(account, holding) {
  const fb = (Number(account?.buyFeePct) || 0) / 100;
  const tax = holding.market === 'KR' && holding.category === 'STOCK' ? Number(account?.sellTaxPct) || 0 : 0;
  const fs = ((Number(account?.sellFeePct) || 0) + tax) / 100;
  return { fb, fs };
}

export const priceCurrency = (h) => (h.market === 'US' ? 'USD' : 'KRW');
export const costCurrency = (h) => h.costCurrency || priceCurrency(h);

// 원화 환산. USD인데 환율이 없으면 null
const toKrw = (v, cur, fx) => (cur === 'USD' ? (fx ? v * fx : null) : v);

export function valueHolding(h, account, price, fx) {
  const pc = priceCurrency(h), cc = costCurrency(h);
  const hasPrice = price != null && isFinite(price) && price > 0;
  const p = hasPrice ? price : h.avgPrice; // 시세 없으면 매입가로 평가
  const q = h.quantity, a = h.avgPrice;
  const { fb, fs } = fees(account, h);
  const mvNative = q * p;
  const mvKrw = toKrw(mvNative, pc, fx);
  const costNative = q * a;
  const costKrw = toKrw(costNative, cc, fx);
  const base = costKrw == null ? null : costKrw * (1 + fb);
  const pnlKrw = mvKrw == null || costKrw == null ? null : mvKrw * (1 - fs) - base;
  const retPct = base ? (pnlKrw / base) * 100 : null;
  let mvUsd = null, pnlUsd = null, retUsdPct = null;
  if (pc === 'USD') {
    mvUsd = mvNative;
    if (cc === 'USD') {
      pnlUsd = mvNative * (1 - fs) - costNative * (1 + fb);
      const b = costNative * (1 + fb);
      retUsdPct = b ? (pnlUsd / b) * 100 : null;
    }
  }
  return { pc, cc, price: p, hasPrice, mvNative, mvKrw, mvUsd, costNative, costKrw, base, pnlKrw, pnlUsd, retPct: retUsdPct ?? retPct };
}

// 이동평균법 매수
export function applyBuy(h, q, price) {
  const nq = h.quantity + q;
  return { quantity: nq, avgPrice: (h.quantity * h.avgPrice + q * price) / nq };
}

// 매도: 평단 유지, 실현손익 확정
export function applySell(h, account, q, sellPrice, fxSell) {
  const pc = priceCurrency(h), cc = costCurrency(h);
  const { fb, fs } = fees(account, h);
  const proceedsNative = q * sellPrice * (1 - fs);
  const realizedNative = pc === cc ? proceedsNative - q * h.avgPrice * (1 + fb) : null;
  const pK = pc === 'USD' ? (fxSell ? q * sellPrice * fxSell : null) : q * sellPrice;
  const cK = cc === 'USD' ? (fxSell ? q * h.avgPrice * fxSell : null) : q * h.avgPrice;
  const realizedKrw = pK == null || cK == null ? null : pK * (1 - fs) - cK * (1 + fb);
  return { quantity: h.quantity - q, avgPrice: h.avgPrice, realizedNative, realizedKrw, proceedsNative, feePct: fs * 100 };
}

// 전체 요약
export function summarize({ accounts, holdings, cash, priceOf, fx }) {
  const accById = Object.fromEntries(accounts.map((a) => [a.id, a]));
  const rows = holdings.map((h) => ({ h, acc: accById[h.accountId], v: valueHolding(h, accById[h.accountId], priceOf(h), fx) }));
  let holdingsKrw = 0, costKrw = 0, pnlKrw = 0, base = 0, fxMissing = false, noPrice = 0;
  for (const r of rows) {
    if (r.v.mvKrw == null) { fxMissing = true; continue; }
    holdingsKrw += r.v.mvKrw; costKrw += r.v.costKrw; pnlKrw += r.v.pnlKrw; base += r.v.base;
    if (!r.v.hasPrice) noPrice++;
  }
  let cashKrw = 0, cashKRW = 0, cashUSD = 0;
  for (const c of cash) {
    if (c.currency === 'USD') { cashUSD += c.amount; if (fx) cashKrw += c.amount * fx; else if (c.amount) fxMissing = true; }
    else { cashKRW += c.amount; cashKrw += c.amount; }
  }
  const total = holdingsKrw + cashKrw;

  // 분류별 + 분류 안 종목별
  const cats = CATEGORIES.map((c) => {
    const items = rows.filter((r) => (r.h.category || 'OTHER') === c.id && r.v.mvKrw != null);
    const sum = items.reduce((s, r) => s + r.v.mvKrw, 0);
    return {
      ...c, value: sum, pct: total ? (sum / total) * 100 : null,
      items: items.map((r) => ({ h: r.h, value: r.v.mvKrw, inCat: sum ? (r.v.mvKrw / sum) * 100 : null, ofTotal: total ? (r.v.mvKrw / total) * 100 : null }))
        .sort((a, b) => b.value - a.value),
    };
  }).filter((c) => c.value > 0);
  cats.push({ id: 'CASH', label: '현금', color: CASH_COLOR, value: cashKrw, pct: total ? (cashKrw / total) * 100 : null, items: [] });

  // 계좌별(기본 통화 기준)
  const byAccount = accounts.map((a) => {
    const rs = rows.filter((r) => r.h.accountId === a.id && r.v.mvKrw != null);
    const mv = rs.reduce((s, r) => s + r.v.mvKrw, 0);
    const pnl = rs.reduce((s, r) => s + r.v.pnlKrw, 0);
    const b = rs.reduce((s, r) => s + r.v.base, 0);
    const cs = cash.filter((c) => c.accountId === a.id);
    const cK = cs.reduce((s, c) => s + (c.currency === 'USD' ? (fx ? c.amount * fx : 0) : c.amount), 0);
    const totalKrw = mv + cK;
    const usdOnly = rs.every((r) => r.v.cc === 'USD' && r.v.pc === 'USD');
    const pnlUsd = usdOnly ? rs.reduce((s, r) => s + r.v.pnlUsd, 0) : null;
    return {
      acc: a, mvKrw: mv, cashKrw: cK, totalKrw, totalBase: a.baseCurrency === 'USD' ? (fx ? totalKrw / fx : null) : totalKrw,
      pnlKrw: pnl, pnlUsd, ret: b ? (pnl / b) * 100 : null, pct: total ? (totalKrw / total) * 100 : null, count: rs.length,
    };
  });

  const usdAssets = rows.filter((r) => r.v.pc === 'USD' && r.v.mvKrw != null).reduce((s, r) => s + r.v.mvKrw, 0) + (fx ? cashUSD * fx : 0);
  const byCurrency = [
    { id: 'KRW', label: '원화 자산', value: total - usdAssets, pct: total ? ((total - usdAssets) / total) * 100 : null },
    { id: 'USD', label: '달러 자산', value: usdAssets, pct: total ? (usdAssets / total) * 100 : null },
  ];

  return { rows, total, holdingsKrw, costKrw, pnlKrw, ret: base ? (pnlKrw / base) * 100 : null, cashKrw, cashKRW, cashUSD, cats, byAccount, byCurrency, fxMissing, noPrice };
}

export function realizedSum(trades, { year, accountId } = {}) {
  return trades.filter((t) => t.side === 'SELL' && t.realizedKrw != null && (!year || t.tradedAt.startsWith(String(year))) && (!accountId || t.accountId === accountId))
    .reduce((s, t) => s + t.realizedKrw, 0);
}

// 시장 자동 판별(규칙 기반)
export function guessMarket(input, baseCurrency) {
  const s = String(input || '').trim();
  if (/^[0-9][0-9A-Z]{5}$/i.test(s)) return 'KR';
  if (/[가-힣]/.test(s)) return 'KR';
  if (/^[A-Za-z][A-Za-z0-9.\-]{0,9}$/.test(s)) return baseCurrency === 'KRW' && !s ? 'KR' : 'US';
  return baseCurrency === 'USD' ? 'US' : 'KR';
}
