// 데이터 조작(업무 규칙). 화면은 여기만 호출한다.
import { getAll, write, kvGet, kvSet, clearAll, STORES } from './db.js';
import { applyBuy, applySell, priceCurrency, costCurrency } from './calc.js';
import { today } from './format.js';

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const now = () => new Date().toISOString();

export const DEFAULT_SETTINGS = {
  hideAmounts: false,
  totalCurrency: 'KRW',
  refreshMinutes: 15,
  staleDays: 7,
  defaultFees: { buyFeePct: 0.25, sellFeePct: 0.25, sellTaxPct: 0.2 },
  quote: null, // { url, token }
  autoBackup: true,
  lastBackupAt: null,
  lastGoogleBackupAt: null,
  onboarded: false,
  onboardAccountId: null,
};

const listeners = new Set();
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const changed = (kind) => listeners.forEach((fn) => fn(kind));

export async function loadAll() {
  const [accounts, holdings, trades, cash, settings, fx, quotes, prices] = await Promise.all([
    getAll('accounts'), getAll('holdings'), getAll('trades'), getAll('cash'),
    kvGet('settings', {}), kvGet('fx', null), kvGet('quotes', {}), kvGet('pricesAt', null),
  ]);
  accounts.sort((a, b) => a.order - b.order);
  return { accounts, holdings, trades, cash, settings: { ...DEFAULT_SETTINGS, ...settings }, fx, quotes, pricesAt: prices };
}

export async function saveSettings(patch) {
  const cur = { ...DEFAULT_SETTINGS, ...(await kvGet('settings', {})) };
  const next = { ...cur, ...patch };
  await kvSet('settings', next);
  changed('settings');
  return next;
}

// ---------- 계좌 ----------
export async function saveAccount(acc) {
  const all = await getAll('accounts');
  const a = { ...acc, id: acc.id || uid(), order: acc.order ?? all.length, updatedAt: now() };
  await write(['accounts'], (tx) => tx.objectStore('accounts').put(a));
  changed('data');
  return a;
}

export async function deleteAccount(id) {
  const [holdings, trades, cash] = await Promise.all([getAll('holdings'), getAll('trades'), getAll('cash')]);
  await write(['accounts', 'holdings', 'trades', 'cash'], (tx) => {
    tx.objectStore('accounts').delete(id);
    holdings.filter((h) => h.accountId === id).forEach((h) => tx.objectStore('holdings').delete(h.id));
    trades.filter((t) => t.accountId === id).forEach((t) => tx.objectStore('trades').delete(t.id));
    cash.filter((c) => c.accountId === id).forEach((c) => tx.objectStore('cash').delete(c.id));
  });
  changed('data');
}

export async function moveAccount(id, dir) {
  const all = (await getAll('accounts')).sort((a, b) => a.order - b.order);
  const i = all.findIndex((a) => a.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= all.length) return;
  [all[i], all[j]] = [all[j], all[i]];
  await write(['accounts'], (tx) => all.forEach((a, k) => tx.objectStore('accounts').put({ ...a, order: k })));
  changed('data');
}

// ---------- 종목 ----------
export async function addHolding(h, { tradedAt } = {}) {
  const hold = { ...h, id: uid(), updatedAt: now() };
  const trade = {
    id: uid(), holdingId: hold.id, accountId: hold.accountId, ticker: hold.ticker || '', name: hold.name || '', market: hold.market,
    side: 'BUY', initial: true, tradedAt: tradedAt || today(), quantity: hold.quantity, price: hold.avgPrice,
    priceCurrency: costCurrency(hold), feePct: 0, avgPriceBefore: 0, quantityBefore: 0, createdAt: now(),
  };
  await write(['holdings', 'trades'], (tx) => { tx.objectStore('holdings').put(hold); tx.objectStore('trades').put(trade); });
  changed('data');
  return hold;
}

export async function updateHolding(h) {
  const trades = (await getAll('trades')).filter((t) => t.holdingId === h.id);
  const onlyInitial = trades.length === 1 && trades[0].initial;
  await write(['holdings', 'trades'], (tx) => {
    tx.objectStore('holdings').put({ ...h, updatedAt: now() });
    if (onlyInitial) tx.objectStore('trades').put({ ...trades[0], quantity: h.quantity, price: h.avgPrice, ticker: h.ticker || '', name: h.name || '', priceCurrency: costCurrency(h) });
  });
  changed('data');
}

export async function deleteHolding(id) {
  const trades = (await getAll('trades')).filter((t) => t.holdingId === id);
  const onlyInitial = trades.length === 1 && trades[0].initial;
  await write(['holdings', 'trades'], (tx) => {
    tx.objectStore('holdings').delete(id);
    if (onlyInitial) tx.objectStore('trades').delete(trades[0].id); // 초기 보유만 있으면 기록도 정리
    else trades.forEach((t) => tx.objectStore('trades').put({ ...t, closed: true }));
  });
  changed('data');
}

// ---------- 매수·매도 ----------
export async function recordTrade({ holding, account, side, quantity, price, fxRate, tradedAt, applyCash }) {
  const cashAll = await getAll('cash');
  let next, trade;
  const base = { id: uid(), holdingId: holding.id, accountId: holding.accountId, ticker: holding.ticker || '', name: holding.name || '', market: holding.market, side, tradedAt, quantity, price, fxRate: fxRate || null, avgPriceBefore: holding.avgPrice, quantityBefore: holding.quantity, createdAt: now() };
  let cashDelta = 0, cashCur;
  if (side === 'BUY') {
    next = applyBuy(holding, quantity, price);
    const fb = (Number(account.buyFeePct) || 0) / 100;
    trade = { ...base, priceCurrency: costCurrency(holding), feePct: fb * 100 };
    cashCur = costCurrency(holding); cashDelta = -quantity * price * (1 + fb);
  } else {
    const s = applySell(holding, account, quantity, price, fxRate);
    next = { quantity: s.quantity, avgPrice: s.avgPrice };
    trade = { ...base, priceCurrency: priceCurrency(holding), feePct: s.feePct, realizedNative: s.realizedNative, realizedKrw: s.realizedKrw };
    cashCur = priceCurrency(holding); cashDelta = s.proceedsNative;
  }
  const h2 = { ...holding, ...next, updatedAt: now() };
  if (applyCash) trade.cashApplied = { currency: cashCur, amount: cashDelta };
  await write(['holdings', 'trades', 'cash'], (tx) => {
    tx.objectStore('holdings').put(h2);
    tx.objectStore('trades').put(trade);
    if (applyCash) {
      const id = `${holding.accountId}:${cashCur}`;
      const cur = cashAll.find((c) => c.id === id);
      tx.objectStore('cash').put({ id, accountId: holding.accountId, currency: cashCur, amount: Math.max(0, (cur?.amount || 0) + cashDelta), updatedAt: now() });
    }
  });
  changed('data');
  return { trade, holding: h2 };
}

// 종목별 가장 최근 거래만 되돌린다
export async function undoTrade(tradeId) {
  const [trades, holdings, cashAll] = await Promise.all([getAll('trades'), getAll('holdings'), getAll('cash')]);
  const t = trades.find((x) => x.id === tradeId);
  if (!t || t.initial) return false;
  const latest = trades.filter((x) => x.holdingId === t.holdingId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (latest.id !== t.id) return false;
  const h = holdings.find((x) => x.id === t.holdingId);
  await write(['holdings', 'trades', 'cash'], (tx) => {
    tx.objectStore('trades').delete(t.id);
    if (h) tx.objectStore('holdings').put({ ...h, quantity: t.quantityBefore, avgPrice: t.avgPriceBefore, updatedAt: now() });
    if (t.cashApplied) {
      const id = `${t.accountId}:${t.cashApplied.currency}`;
      const cur = cashAll.find((c) => c.id === id);
      tx.objectStore('cash').put({ id, accountId: t.accountId, currency: t.cashApplied.currency, amount: Math.max(0, (cur?.amount || 0) - t.cashApplied.amount), updatedAt: now() });
    }
  });
  changed('data');
  return true;
}

// ---------- 현금 ----------
export async function setCash(accountId, currency, amount) {
  await write(['cash'], (tx) => tx.objectStore('cash').put({ id: `${accountId}:${currency}`, accountId, currency, amount, updatedAt: now() }));
  changed('data');
}

// ---------- 시세(수동)·환율 ----------
export async function saveManualPrices(prices, fxRate) {
  const holdings = await getAll('holdings');
  const t = now();
  await write(['holdings', 'kv'], (tx) => {
    for (const [id, p] of Object.entries(prices)) {
      const h = holdings.find((x) => x.id === id);
      if (h && p > 0) tx.objectStore('holdings').put({ ...h, manualPrice: p, manualPriceAsOf: t });
    }
    if (fxRate > 0) tx.objectStore('kv').put({ key: 'fx', value: { rate: fxRate, asOf: t, source: 'manual' } });
    tx.objectStore('kv').put({ key: 'pricesAt', value: t });
  });
  changed('data');
}

export async function saveQuotes(quotes, fx) {
  const cur = await kvGet('quotes', {});
  await write(['kv'], (tx) => {
    tx.objectStore('kv').put({ key: 'quotes', value: { ...cur, ...quotes } });
    if (fx) tx.objectStore('kv').put({ key: 'fx', value: fx });
    tx.objectStore('kv').put({ key: 'pricesAt', value: now() });
  });
  changed('quotes');
}

export async function saveSnapshot(s) {
  await write(['snapshots'], (tx) => tx.objectStore('snapshots').put(s));
}

// ---------- 백업 ----------
export async function exportData() {
  const data = {};
  for (const s of STORES) data[s] = await getAll(s);
  // 토큰은 백업에서 제외
  data.kv = data.kv.map((r) => (r.key === 'settings' ? { ...r, value: { ...r.value, quote: r.value?.quote ? { url: r.value.quote.url, token: '' } : null } } : r));
  return { app: 'portfolio', schemaVersion: 1, exportedAt: now(), data };
}

export function validateBackup(obj) {
  if (!obj || obj.app !== 'portfolio') return '내 포트폴리오 백업 파일이 아니에요.';
  if (obj.schemaVersion > 1) return '더 새로운 버전의 앱에서 만든 백업이에요. 앱을 업데이트한 뒤 다시 시도하세요.';
  const d = obj.data || {};
  for (const s of ['accounts', 'holdings', 'trades', 'cash']) if (!Array.isArray(d[s])) return `백업 파일이 손상되었어요(${s} 없음).`;
  for (const h of d.holdings) if (!(h.quantity >= 0) || !(h.avgPrice >= 0)) return '백업 파일의 종목 값이 올바르지 않아요.';
  return null;
}

export async function importData(obj, { keepQuote } = {}) {
  const err = validateBackup(obj);
  if (err) throw new Error(err);
  const curSettings = await kvGet('settings', {});
  // 지우기와 넣기를 한 트랜잭션으로: 중간에 실패하면 기존 데이터가 그대로 남는다
  await write(STORES, (tx) => {
    for (const s of STORES) tx.objectStore(s).clear();
    for (const s of STORES) for (const r of obj.data[s] || []) tx.objectStore(s).put(r);
    // 현재 기기의 시세 연결(토큰)은 유지
    if (keepQuote && curSettings.quote) {
      const st = (obj.data.kv || []).find((r) => r.key === 'settings')?.value || {};
      tx.objectStore('kv').put({ key: 'settings', value: { ...st, quote: curSettings.quote } });
    }
  });
  changed('data');
}

export async function wipe() {
  await clearAll();
  changed('data');
}
