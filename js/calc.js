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
  // M2: 평균 매입환율(avgFx)이 있는 USD/USD 행만 환율 효과를 나눈다. 없으면 지금 경로 그대로(fxKnown=false)
  const fxKnown = pc === 'USD' && cc === 'USD' && h.avgFx > 0;
  let costKrwAcq = null, baseAcq = null, pnlKrwAcq = null, pnlFx = null, pnlPrice = null, retKrwPct = null;
  if (fxKnown) {
    costKrwAcq = costNative * h.avgFx;
    baseAcq = costKrwAcq * (1 + fb);
    if (mvKrw != null) {
      pnlKrwAcq = mvKrw * (1 - fs) - baseAcq;
      pnlFx = costNative * (1 + fb) * (fx - h.avgFx);
      pnlPrice = pnlKrwAcq - pnlFx;
      retKrwPct = baseAcq ? (pnlKrwAcq / baseAcq) * 100 : null;
    }
  }
  return {
    pc, cc, price: p, hasPrice, mvNative, mvKrw, mvUsd, costNative, costKrw, base, pnlKrw, pnlUsd, retPct: retUsdPct ?? retPct,
    fxKnown, costKrwAcq, baseAcq, pnlKrwAcq, pnlFx, pnlPrice, retKrwPct,
  };
}

const usdUsd = (h) => priceCurrency(h) === 'USD' && costCurrency(h) === 'USD';

// 이동평균법 매수. avgFx는 달러 매입금액 가중 이동평균(§3.2.3)
// - 보유가 0이면 이번 환율로 새로 시작, avgFx가 없는 보유는 null 유지(부분 평균 금지), 환율을 비우면 null
export function applyBuy(h, q, price, fxRate) {
  const nq = h.quantity + q;
  const out = { quantity: nq, avgPrice: (h.quantity * h.avgPrice + q * price) / nq, avgFx: h.avgFx ?? null };
  if (!usdUsd(h)) return out;
  const f = fxRate > 0 ? fxRate : null;
  if (!(h.quantity > 1e-12)) out.avgFx = f;
  else if (!(h.avgFx > 0) || !f) out.avgFx = null;
  else {
    const w0 = h.quantity * h.avgPrice, w1 = q * price;
    out.avgFx = (w0 * h.avgFx + w1 * f) / (w0 + w1);
  }
  return out;
}

// 매도: 평단·avgFx 유지, 실현손익 확정. avgFx가 있으면 원가를 취득 환율로 잡는다(§3.2.5)
export function applySell(h, account, q, sellPrice, fxSell) {
  const pc = priceCurrency(h), cc = costCurrency(h);
  const { fb, fs } = fees(account, h);
  const proceedsNative = q * sellPrice * (1 - fs);
  const realizedNative = pc === cc ? proceedsNative - q * h.avgPrice * (1 + fb) : null;
  const pK = pc === 'USD' ? (fxSell ? q * sellPrice * fxSell : null) : q * sellPrice;
  const acq = usdUsd(h) && h.avgFx > 0;
  const cK = cc === 'USD' ? (fxSell ? q * h.avgPrice * (acq ? h.avgFx : fxSell) : null) : q * h.avgPrice;
  const realizedKrw = pK == null || cK == null ? null : pK * (1 - fs) - cK * (1 + fb);
  const realizedKrwAcq = acq && realizedKrw != null ? realizedKrw : null;
  const realizedFxKrw = acq && fxSell ? q * h.avgPrice * (1 + fb) * (fxSell - h.avgFx) : null;
  const left = h.quantity - q;
  return {
    quantity: left, avgPrice: h.avgPrice, avgFx: left > 1e-9 ? h.avgFx ?? null : null,
    realizedNative, realizedKrw, realizedKrwAcq, realizedFxKrw, proceedsNative, feePct: fs * 100,
  };
}

// 현금 잔액(파생, 저장하지 않음 §3.1.3). 반환은 옛 cash 저장소와 같은 모양
export const EPOCH = '1970-01-01T00:00:00Z';
const r8 = (v) => Math.round(v * 1e8) / 1e8;
export function deriveCash({ accounts = [], cashTx = [], trades = [], dividends = [], migratedAt }) {
  const since = migratedAt || EPOCH;
  const m = new Map();
  const add = (accountId, currency, amount) => {
    if (!accountId || !currency) return;
    const id = `${accountId}:${currency}`;
    const r = m.get(id) || { id, accountId, currency, amount: 0 };
    r.amount += Number(amount) || 0;
    m.set(id, r);
  };
  for (const a of accounts) for (const c of a.currencies || ['KRW']) add(a.id, c, 0);
  for (const t of cashTx) add(t.accountId, t.currency, t.amount);
  for (const t of trades) if (t.cashApplied && (t.createdAt || '') > since) add(t.accountId, t.cashApplied.currency, t.cashApplied.amount);
  for (const d of dividends) if (d.cashApplied) add(d.cashApplied.accountId || d.accountId, d.cashApplied.currency, d.cashApplied.amount);
  return [...m.values()].map((r) => ({ ...r, amount: r8(r.amount) }));
}

// 매수 폼 환율 기본값(§3.2.3): ① 같은 계좌 최근 환전(30일 이내) ② 오늘이 아니면 그날 스냅샷 환율 ③ 현재 환율
export function defaultTradeFx({ cashTx = [], snapshots = [], accountId, date, today, fxRate }) {
  const d0 = new Date(date + 'T00:00:00').getTime();
  const fx = cashTx.filter((t) => t.type === 'fx' && t.accountId === accountId && t.fxRate > 0 && t.date <= date && d0 - new Date(t.date + 'T00:00:00').getTime() <= 30 * 86400000)
    .sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt))[0];
  if (fx) return { rate: fx.fxRate, src: 'fx' };
  if (date !== today) { const s = snapshots.find((x) => x.date === date && x.usdKrw > 0); if (s) return { rate: s.usdKrw, src: 'day' }; }
  return fxRate ? { rate: fxRate, src: 'now' } : { rate: null, src: null };
}

// 전체 요약
export function summarize({ accounts, holdings, cash, priceOf, fx }) {
  const accById = Object.fromEntries(accounts.map((a) => [a.id, a]));
  const rows = holdings.map((h) => ({ h, acc: accById[h.accountId], v: valueHolding(h, accById[h.accountId], priceOf(h), fx) }));
  let holdingsKrw = 0, costKrw = 0, pnlKrw = 0, base = 0, fxMissing = false, noPrice = 0;
  let pnlKrwBest = 0, baseBest = 0, fxKnownCount = 0, usdRowCount = 0;
  for (const r of rows) {
    if (r.v.pc === 'USD' && r.v.cc === 'USD') { usdRowCount++; if (r.v.fxKnown) fxKnownCount++; }
    if (r.v.mvKrw == null) { fxMissing = true; continue; }
    holdingsKrw += r.v.mvKrw; costKrw += r.v.costKrw; pnlKrw += r.v.pnlKrw; base += r.v.base;
    pnlKrwBest += r.v.pnlKrwAcq ?? r.v.pnlKrw; baseBest += r.v.baseAcq ?? r.v.base;
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

  return { rows, total, holdingsKrw, costKrw, pnlKrw, ret: base ? (pnlKrw / base) * 100 : null, pnlKrwBest, retBest: baseBest ? (pnlKrwBest / baseBest) * 100 : null, fxKnownCount, usdRowCount, cashKrw, cashKRW, cashUSD, cats, byAccount, byCurrency, fxMissing, noPrice };
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
