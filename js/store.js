// 데이터 조작(업무 규칙). 화면은 여기만 호출한다.
import { getAll, write, kvGet, kvSet, clearAll, STORES, cashToAdjustRows, stripToken } from './db.js';
import { applyBuy, applySell, priceCurrency, costCurrency, deriveCash, EPOCH } from './calc.js';
import { today } from './format.js';
import { holdingKey } from './group.js';
import { dividendCalc, payDateFx } from './income.js';

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
  theme: 'dark', // 'dark' | 'light' | 'system'
  haptics: true,
  lastAccountId: null, // 입력 폼의 마지막 사용 계좌
  applyCashByAccount: {}, // 계좌별 '현금 반영' 마지막 선택(기본 켬)
  cashNoticeSeen: false, // '이제 매매하면 현금이 자동으로 바뀌어요' 1회 안내
  holdingSort: 'mv', // 종목 목록 정렬(group.js SORTS)
  holdingMarket: 'all', // 종목 목록 시장 필터 'all' | 'US' | 'KR'
  divTaxDefault: { US: 15, KR: 15.4 }, // 배당 원천징수 기본 세율(%)
  divTaxRate: {}, // holdingKey별 마지막 배당 세율(%)
};

const listeners = new Set();
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const changed = (kind) => listeners.forEach((fn) => fn(kind));

export async function loadAll() {
  const [accounts, holdings, trades, cash, cashTx, dividends, snapshots, settings, fx, quotes, prices, migratedAt] = await Promise.all([
    getAll('accounts'), getAll('holdings'), getAll('trades'), getAll('cash'), getAll('cashTx'), getAll('dividends'), getAll('snapshots'),
    kvGet('settings', {}), kvGet('fx', null), kvGet('quotes', {}), kvGet('pricesAt', null), kvGet('cashMigratedAt', null),
  ]);
  accounts.sort((a, b) => a.order - b.order);
  // cashLegacy = 옛 cash 저장소(읽기 전용). 화면용 잔액(ctx.cash)은 ctx.js가 deriveCash로 만든다
  return {
    accounts, holdings, trades, cashLegacy: cash, cashTx, dividends, snapshots,
    settings: { ...DEFAULT_SETTINGS, ...settings }, fx, quotes, pricesAt: prices, cashMigratedAt: migratedAt || EPOCH,
  };
}

// 업그레이드 직전 백업(kv.preV2Backup)은 마이그레이션 30일 뒤 지운다(§5.1)
export async function cleanupPreV2() {
  const at = await kvGet('cashMigratedAt', null);
  if (!at || Date.now() - new Date(at).getTime() < 30 * 86400000) return;
  if (await kvGet('preV2Backup', null)) await write(['kv'], (tx) => tx.objectStore('kv').delete('preV2Backup'));
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

// 계좌 삭제: 종목·거래·현금 원장·배당을 함께 지운다. 이체 상대편 행은 남기고 메모만 붙인다(§3.1.4-5)
export async function deleteAccount(id) {
  const [holdings, trades, cash, cashTx, dividends] = await Promise.all([getAll('holdings'), getAll('trades'), getAll('cash'), getAll('cashTx'), getAll('dividends')]);
  const mine = cashTx.filter((c) => c.accountId === id);
  const pairIds = new Set(mine.filter((c) => c.type === 'transfer' && c.pairId).map((c) => c.pairId));
  await write(['accounts', 'holdings', 'trades', 'cash', 'cashTx', 'dividends'], (tx) => {
    tx.objectStore('accounts').delete(id);
    holdings.filter((h) => h.accountId === id).forEach((h) => tx.objectStore('holdings').delete(h.id));
    trades.filter((t) => t.accountId === id).forEach((t) => tx.objectStore('trades').delete(t.id));
    cash.filter((c) => c.accountId === id).forEach((c) => tx.objectStore('cash').delete(c.id));
    mine.forEach((c) => tx.objectStore('cashTx').delete(c.id));
    cashTx.filter((c) => c.accountId !== id && pairIds.has(c.pairId))
      .forEach((c) => tx.objectStore('cashTx').put({ ...c, memo: [c.memo, '상대 계좌 삭제됨'].filter(Boolean).join(' · ') }));
    dividends.filter((d) => d.accountId === id || d.cashApplied?.accountId === id).forEach((d) => tx.objectStore('dividends').delete(d.id));
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
// 종목 추가(초기 보유)는 '주식 입고'라 수익이 아니다: 그 시점 평가금(q × 입력 현재가, 없으면 평단)을
// 원화·달러로 고정해 초기 거래 행에 남긴다(externalKrw/externalUsd, period.js netExternalCum이 읽음). 온보딩 중엔 제외(§3.4.2)
export function initialExternal(h, fx) {
  const hasP = h.manualPrice > 0;
  const cur = hasP ? priceCurrency(h) : costCurrency(h);
  const v = (Number(h.quantity) || 0) * (hasP ? h.manualPrice : Number(h.avgPrice) || 0);
  const f = fx > 0 ? fx : null;
  if (cur === 'USD') return { externalKrw: f ? v * f : null, externalUsd: v, externalFx: f };
  return { externalKrw: v, externalUsd: f ? v / f : null, externalFx: f };
}

export async function addHolding(h, { tradedAt, onboarding } = {}) {
  const hold = { ...h, id: uid(), updatedAt: now() };
  const trade = {
    id: uid(), holdingId: hold.id, accountId: hold.accountId, ticker: hold.ticker || '', name: hold.name || '', market: hold.market,
    side: 'BUY', initial: true, tradedAt: tradedAt || today(), quantity: hold.quantity, price: hold.avgPrice,
    priceCurrency: costCurrency(hold), feePct: 0, avgPriceBefore: 0, quantityBefore: 0, createdAt: now(),
  };
  const [settings, fx] = await Promise.all([kvGet('settings', {}), kvGet('fx', null)]);
  if (!onboarding && settings.onboarded) Object.assign(trade, initialExternal(hold, fx?.rate));
  await write(['holdings', 'trades'], (tx) => { tx.objectStore('holdings').put(hold); tx.objectStore('trades').put(trade); });
  changed('data');
  return hold;
}

export async function updateHolding(h) {
  const trades = (await getAll('trades')).filter((t) => t.holdingId === h.id);
  const onlyInitial = trades.length === 1 && trades[0].initial;
  await write(['holdings', 'trades'], (tx) => {
    tx.objectStore('holdings').put({ ...h, updatedAt: now() });
    if (onlyInitial) {
      const t0 = trades[0];
      const t1 = { ...t0, quantity: h.quantity, price: h.avgPrice, ticker: h.ticker || '', name: h.name || '', priceCurrency: costCurrency(h) };
      // 외부 유입을 기록한 초기 보유(v2 이후 추가)만 같은 환율로 다시 계산한다. 옛 행·온보딩 행은 그대로
      if ('externalKrw' in t0) {
        const f = t0.externalFx || (t0.externalKrw && t0.externalUsd ? t0.externalKrw / t0.externalUsd : null);
        Object.assign(t1, initialExternal(h, f));
      }
      tx.objectStore('trades').put(t1);
    }
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
// 현금 저장소는 건드리지 않는다. cashApplied는 거래 행에만 남고 잔액은 deriveCash가 합산한다(클램프 없음)
export async function recordTrade({ holding, account, side, quantity, price, fxRate, tradedAt, applyCash, memo }) {
  let next, trade;
  const base = {
    id: uid(), holdingId: holding.id, accountId: holding.accountId, ticker: holding.ticker || '', name: holding.name || '', market: holding.market,
    side, tradedAt, quantity, price, fxRate: fxRate || null, avgPriceBefore: holding.avgPrice, quantityBefore: holding.quantity,
    avgFxBefore: holding.avgFx ?? null, createdAt: now(),
  };
  if (memo) base.memo = String(memo).slice(0, 200);
  let cashDelta = 0, cashCur;
  if (side === 'BUY') {
    next = applyBuy(holding, quantity, price, fxRate);
    const fb = (Number(account.buyFeePct) || 0) / 100;
    trade = { ...base, priceCurrency: costCurrency(holding), feePct: fb * 100 };
    cashCur = costCurrency(holding); cashDelta = -quantity * price * (1 + fb);
  } else {
    const s = applySell(holding, account, quantity, price, fxRate);
    next = { quantity: s.quantity, avgPrice: s.avgPrice, avgFx: s.avgFx };
    trade = { ...base, priceCurrency: priceCurrency(holding), feePct: s.feePct, realizedNative: s.realizedNative, realizedKrw: s.realizedKrw, realizedKrwAcq: s.realizedKrwAcq, realizedFxKrw: s.realizedFxKrw };
    cashCur = priceCurrency(holding); cashDelta = s.proceedsNative;
  }
  const h2 = { ...holding, ...next, updatedAt: now() };
  if (applyCash) trade.cashApplied = { currency: cashCur, amount: cashDelta };
  await write(['holdings', 'trades'], (tx) => {
    tx.objectStore('holdings').put(h2);
    tx.objectStore('trades').put(trade);
  });
  changed('data');
  return { trade, holding: h2 };
}

// 최근 순. 같은 시각이면 처음 보유(initial)를 뒤로
export const byLatest = (a, b) => b.createdAt.localeCompare(a.createdAt) || (a.initial ? 1 : 0) - (b.initial ? 1 : 0);

// 종목별 가장 최근 거래만 되돌린다. 거래 행을 지우면 파생 잔액이 그대로 돌아온다.
// 마이그레이션 이전 거래(cashApplied가 이미 기초 잔액에 녹아 있음)는 보정 adjust를 같은 트랜잭션에서 쓴다(§3.1.4-4)
export async function undoTrade(tradeId) {
  const [trades, holdings, migratedAt] = await Promise.all([getAll('trades'), getAll('holdings'), kvGet('cashMigratedAt', null)]);
  const t = trades.find((x) => x.id === tradeId);
  if (!t || t.initial) return false;
  const latest = trades.filter((x) => x.holdingId === t.holdingId).sort(byLatest)[0];
  if (latest.id !== t.id) return false;
  const h = holdings.find((x) => x.id === t.holdingId);
  const comp = t.cashApplied && migratedAt && t.createdAt <= migratedAt;
  await write(['holdings', 'trades', 'cashTx'], (tx) => {
    tx.objectStore('trades').delete(t.id);
    if (h) {
      const back = { ...h, quantity: t.quantityBefore, avgPrice: t.avgPriceBefore, updatedAt: now() };
      if ('avgFxBefore' in t) back.avgFx = t.avgFxBefore;
      tx.objectStore('holdings').put(back);
    }
    if (comp) {
      const nm = t.market === 'US' ? t.ticker || t.name : t.name || t.ticker;
      tx.objectStore('cashTx').put({
        id: uid(), accountId: t.accountId, date: today(), type: 'adjust', currency: t.cashApplied.currency, amount: -t.cashApplied.amount,
        external: false, system: 'undo', memo: `되돌리기 보정: ${nm} ${t.side === 'BUY' ? '매수' : '매도'}`, createdAt: now(),
      });
    }
  });
  changed('data');
  return true;
}

export async function updateTradeMemo(id, memo) {
  const t = (await getAll('trades')).find((x) => x.id === id);
  if (!t) return;
  await write(['trades'], (tx) => tx.objectStore('trades').put({ ...t, memo: String(memo || '').slice(0, 200) }));
  changed('data');
}

// ---------- 현금 원장(cashTx) ----------
export const CASH_TYPES = ['deposit', 'withdraw', 'fx', 'interest', 'transfer', 'adjust'];

// 입력 → 저장할 행(들). 순수 함수(테스트용 export)
// 단일: {type, accountId, currency, amount, date, memo}  (adjust는 부호 포함, 나머지는 크기만)
// 환전: {type:'fx', accountId, date, memo, fxRate, from:'KRW'|'USD', sent, received}
// 이체: {type:'transfer', fromId, toId, currency, amount, date, memo}
export function buildCashTx(input, { fx = null, T = now(), ids = [], pairId } = {}) {
  const { type, date = today() } = input;
  if (!CASH_TYPES.includes(type)) throw new Error('알 수 없는 기록이에요.');
  const memo = input.memo ? String(input.memo).slice(0, 200) : '';
  const nextId = (i) => ids[i] || uid();
  const rowBase = { date, type, external: false, createdAt: T, ...(memo ? { memo } : {}) };
  if (type === 'fx') {
    const sent = Math.abs(Number(input.sent)), received = Math.abs(Number(input.received)), rate = Number(input.fxRate);
    if (!(sent > 0) || !(received > 0)) throw new Error('0보다 큰 금액을 입력해 주세요');
    if (!(rate > 0)) throw new Error('적용 환율을 넣어 주세요');
    const from = input.from === 'USD' ? 'USD' : 'KRW', to = from === 'USD' ? 'KRW' : 'USD';
    const p = pairId || uid();
    return [
      { ...rowBase, id: nextId(0), accountId: input.accountId, currency: from, amount: -sent, fxRate: rate, pairId: p },
      { ...rowBase, id: nextId(1), accountId: input.accountId, currency: to, amount: received, fxRate: rate, pairId: p },
    ];
  }
  const raw = Number(input.amount), amt = Math.abs(raw);
  if (!(amt > 0) || !isFinite(amt)) throw new Error('0보다 큰 금액을 입력해 주세요');
  if (type === 'transfer') {
    if (!input.fromId || !input.toId || input.fromId === input.toId) throw new Error('보내는 계좌와 받는 계좌를 다르게 골라 주세요');
    const p = pairId || uid();
    return [
      { ...rowBase, id: nextId(0), accountId: input.fromId, currency: input.currency, amount: -amt, pairId: p },
      { ...rowBase, id: nextId(1), accountId: input.toId, currency: input.currency, amount: amt, pairId: p },
    ];
  }
  const row = { ...rowBase, id: nextId(0), accountId: input.accountId, currency: input.currency, amount: type === 'adjust' ? raw : type === 'withdraw' ? -amt : amt };
  if (input.system) row.system = input.system;
  // 이자는 기록 시점 환율을 참고용으로 남긴다(M6 원/$ 환산)
  if (type === 'interest' && fx) row.fxRate = fx;
  if (type === 'deposit' || type === 'withdraw') {
    // 외부 입출금은 기록 시점 원화·달러 값을 고정 저장(M4 순유입용)
    row.external = true;
    if (row.currency === 'USD') { row.usdValue = row.amount; row.krwValue = fx ? row.amount * fx : null; if (fx) row.fxRate = fx; }
    else { row.krwValue = row.amount; row.usdValue = fx ? row.amount / fx : null; }
  }
  return [row];
}

export async function addCashTx(input) {
  const fx = (await kvGet('fx', null))?.rate || null;
  const rows = buildCashTx(input, { fx });
  await write(['cashTx'], (tx) => rows.forEach((r) => tx.objectStore('cashTx').put(r)));
  if (rows[0].accountId) saveSettings({ lastAccountId: input.accountId || input.fromId }).catch(() => {});
  changed('data');
  return rows;
}

const pairOf = (all, row) => (row.pairId ? all.filter((r) => r.pairId === row.pairId) : [row]);

// 쌍(fx·transfer)은 두 행을 함께 고친다. id·pairId·createdAt·system은 유지
export async function updateCashTx(id, input) {
  const all = await getAll('cashTx');
  const row = all.find((r) => r.id === id);
  if (!row) throw new Error('기록을 찾을 수 없어요');
  const olds = pairOf(all, row).sort((a, b) => a.amount - b.amount); // 보내는 쪽(음수) 먼저
  let rows;
  if (row.system === 'migration') {
    // 기초 잔액은 금액만 고친다
    const v = Number(input.amount);
    if (!v || !isFinite(v)) throw new Error('0보다 큰 금액을 입력해 주세요');
    rows = [{ ...row, amount: v }];
  } else {
    let fx = null;
    if (row.type === 'deposit' || row.type === 'withdraw' || row.type === 'interest') {
      fx = row.fxRate || (row.krwValue && row.usdValue ? row.krwValue / row.usdValue : null) || (await kvGet('fx', null))?.rate || null;
    }
    rows = buildCashTx({ ...input, type: row.type }, { fx, T: row.createdAt, ids: olds.map((r) => r.id), pairId: row.pairId });
    if (row.system) rows.forEach((r) => { r.system = row.system; });
  }
  await write(['cashTx'], (tx) => {
    olds.forEach((r) => tx.objectStore('cashTx').delete(r.id));
    rows.forEach((r) => tx.objectStore('cashTx').put(r));
  });
  changed('data');
  return rows;
}

// 쌍은 함께 지운다. 기초 잔액(migration)은 지울 수 없다
export async function deleteCashTx(id) {
  const all = await getAll('cashTx');
  const row = all.find((r) => r.id === id);
  if (!row) return false;
  if (row.system === 'migration') throw new Error('기초 잔액은 지울 수 없어요. 금액만 고칠 수 있어요.');
  const rows = pairOf(all, row);
  await write(['cashTx'], (tx) => rows.forEach((r) => tx.objectStore('cashTx').delete(r.id)));
  changed('data');
  return true;
}

// 현재 파생 잔액(계좌·통화)
export async function cashBalance(accountId, currency) {
  const [accounts, cashTx, trades, dividends, migratedAt] = await Promise.all([getAll('accounts'), getAll('cashTx'), getAll('trades'), getAll('dividends'), kvGet('cashMigratedAt', null)]);
  const r = deriveCash({ accounts, cashTx, trades, dividends, migratedAt }).find((c) => c.accountId === accountId && c.currency === currency);
  return r ? r.amount : 0;
}

// 잔액 맞추기: 목표 잔액과의 차이만큼 adjust 1행(차이가 없으면 쓰지 않음). 온보딩 현금 단계도 이 함수를 쓴다
export async function setCashTo(accountId, currency, target, { date, memo } = {}) {
  const cur = await cashBalance(accountId, currency);
  const diff = Math.round((Number(target) - cur) * 1e8) / 1e8;
  if (!diff) return null;
  const [row] = await addCashTx({ type: 'adjust', accountId, currency, amount: diff, date, memo: memo || '증권사 잔고와 맞춤' });
  return row;
}

// ---------- 배당(M5) ----------
// 입력 → 저장할 행. 순수 함수(테스트용 export)
// input: {holding:{market,ticker,name}, accountId, payDate, mode, perShare, quantity, gross, taxRate, netOverride, currency, fxRate, applyCash, memo}
export function buildDividend(input, { id, createdAt, T = now(), today: td = today() } = {}) {
  const hd = input.holding || {};
  if (!hd.market) throw new Error('종목을 골라 주세요');
  if (!input.accountId) throw new Error('계좌를 골라 주세요');
  const payDate = input.payDate || td;
  if (payDate > td) throw new Error('지급일이 아직 안 왔어요. 예상 배당은 2차에서 보여 드릴게요');
  const currency = input.currency === 'KRW' ? 'KRW' : input.currency === 'USD' ? 'USD' : hd.market === 'US' ? 'USD' : 'KRW';
  const c = dividendCalc({ ...input, currency });
  if (c.error) throw new Error(c.error);
  const d = {
    id: id || uid(), holdingKey: holdingKey(hd), ticker: hd.ticker || '', name: hd.name || '', market: hd.market,
    accountId: input.accountId, payDate, quantity: c.quantity, gross: c.gross, taxRate: Number(input.taxRate) || 0, tax: c.tax, net: c.net, currency,
    createdAt: createdAt || T,
  };
  if (c.perShare != null && isFinite(c.perShare)) d.perShare = c.perShare;
  if (input.fxRate > 0) d.fxRate = Number(input.fxRate);
  if (input.applyCash) d.cashApplied = { accountId: input.accountId, currency, amount: c.net };
  if (input.memo) d.memo = String(input.memo).slice(0, 200);
  return d;
}

// 새로 쓰거나(id 없음) 고친다. 세율은 그 종목 기본값으로 기억. 삭제·수정하면 cashApplied도 함께 바뀌어 잔액이 맞는다
export async function saveDividend(input, id) {
  const [all, snaps, fx, settings] = await Promise.all([getAll('dividends'), getAll('snapshots'), kvGet('fx', null), kvGet('settings', {})]);
  const old = id ? all.find((d) => d.id === id) : null;
  if (id && !old) throw new Error('기록을 찾을 수 없어요');
  const inp = { ...input };
  if (!(inp.fxRate > 0)) inp.fxRate = payDateFx(snaps, inp.payDate || today(), fx?.rate) || undefined;
  const d = buildDividend(inp, { id: old?.id, createdAt: old?.createdAt });
  const cur = { ...DEFAULT_SETTINGS, ...settings };
  await write(['dividends', 'kv'], (tx) => {
    tx.objectStore('dividends').put(d);
    tx.objectStore('kv').put({ key: 'settings', value: { ...cur, divTaxRate: { ...(cur.divTaxRate || {}), [d.holdingKey]: d.taxRate } } });
  });
  changed('data');
  return d;
}

// 삭제하면 cashApplied도 행과 함께 사라져 잔액이 자동으로 돌아온다
export async function deleteDividend(id) {
  await write(['dividends'], (tx) => tx.objectStore('dividends').delete(id));
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
  // 토큰과 업그레이드 직전 백업(크기 2배 방지)은 백업에서 제외
  data.kv = data.kv.filter((r) => r.key !== 'preV2Backup').map(stripToken);
  return { app: 'portfolio', schemaVersion: 2, exportedAt: now(), data };
}

export function validateBackup(obj) {
  if (!obj || obj.app !== 'portfolio') return '내 포트폴리오 백업 파일이 아니에요.';
  if (obj.schemaVersion > 2) return '더 새로운 버전의 앱에서 만든 백업이에요. 앱을 업데이트한 뒤 다시 시도하세요.';
  const d = obj.data || {};
  const need = ['accounts', 'holdings', 'trades', 'cash', ...(obj.schemaVersion >= 2 ? ['cashTx', 'dividends'] : [])];
  for (const s of need) if (!Array.isArray(d[s])) return `백업 파일이 손상되었어요(${s} 없음).`;
  for (const h of d.holdings) if (!(h.quantity >= 0) || !(h.avgPrice >= 0)) return '백업 파일의 종목 값이 올바르지 않아요.';
  return null;
}

export async function importData(obj, { keepQuote } = {}) {
  const err = validateBackup(obj);
  if (err) throw new Error(err);
  const [curSettings, preV2] = await Promise.all([kvGet('settings', {}), kvGet('preV2Backup', null)]);
  const v1 = !(obj.schemaVersion >= 2);
  const T = obj.exportedAt || now();
  // 지우기와 넣기를 한 트랜잭션으로: 중간에 실패하면 기존 데이터가 그대로 남는다
  await write(STORES, (tx) => {
    for (const s of STORES) tx.objectStore(s).clear();
    for (const s of STORES) for (const r of obj.data[s] || []) if (!(s === 'kv' && r.key === 'preV2Backup')) tx.objectStore(s).put(r);
    // v1 백업: cash → 기초 잔액 adjust. 백업 시점 이전 거래의 cashApplied는 합산에서 빠진다(§3.1.5)
    if (v1) {
      for (const r of cashToAdjustRows(obj.data.cash, T, T.slice(0, 10))) tx.objectStore('cashTx').put(r);
      tx.objectStore('kv').put({ key: 'cashMigratedAt', value: T });
    }
    // 이 기기의 업그레이드 직전 백업은 안전망으로 남긴다
    if (preV2) tx.objectStore('kv').put({ key: 'preV2Backup', value: preV2 });
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
