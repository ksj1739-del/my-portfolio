// IndexedDB 얇은 래퍼(외부 라이브러리 없음)
// 테스트 페이지는 import 전에 globalThis.__PORTFOLIO_DB__로 버리는 DB 이름을 정한다
const DB_NAME = globalThis.__PORTFOLIO_DB__ || 'portfolio';
const DB_VERSION = 2;
export const STORES = ['accounts', 'holdings', 'trades', 'cash', 'kv', 'snapshots', 'cashTx', 'dividends'];
const V1_STORES = ['accounts', 'holdings', 'trades', 'cash', 'kv', 'snapshots'];
let dbp;

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// 옛 cash 저장소 행 → 기초 잔액 adjust 행(§3.1.4-2). 0원 행은 만들지 않는다. v1 백업 가져오기도 같은 함수를 쓴다
export function cashToAdjustRows(cash, T, date = localDate()) {
  return (cash || []).filter((c) => c && c.accountId && Number(c.amount)).map((c) => ({
    id: uid(), accountId: c.accountId, date, type: 'adjust', currency: c.currency, amount: Number(c.amount),
    external: false, system: 'migration', memo: '기초 잔액', createdAt: T,
  }));
}

// 설정의 시세 토큰은 백업에서 뺀다
export const stripToken = (r) => (r.key === 'settings' ? { ...r, value: { ...r.value, quote: r.value?.quote ? { url: r.value.quote.url, token: '' } : null } } : r);

// v1 → v2: 같은 versionchange 트랜잭션 안에서 업그레이드 직전 백업(kv.preV2Backup) + cash → cashTx(adjust) + kv.cashMigratedAt
// 중간에 실패하면 업그레이드 전체가 취소되어 v1 그대로 남는다
function migrateV1(tx) {
  const T = new Date().toISOString();
  const data = {};
  let left = V1_STORES.length;
  for (const s of V1_STORES) {
    const r = tx.objectStore(s).getAll();
    r.onsuccess = () => {
      data[s] = r.result;
      if (--left) return;
      const kv = tx.objectStore('kv');
      kv.put({ key: 'preV2Backup', value: { app: 'portfolio', schemaVersion: 1, exportedAt: T, data: { ...data, kv: data.kv.map(stripToken) } } });
      for (const row of cashToAdjustRows(data.cash, T)) tx.objectStore('cashTx').put(row);
      kv.put({ key: 'cashMigratedAt', value: T });
    };
  }
}

export function openDB() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (!db.objectStoreNames.contains('accounts')) db.createObjectStore('accounts', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('holdings')) db.createObjectStore('holdings', { keyPath: 'id' }).createIndex('accountId', 'accountId');
      if (!db.objectStoreNames.contains('trades')) db.createObjectStore('trades', { keyPath: 'id' }).createIndex('holdingId', 'holdingId');
      if (!db.objectStoreNames.contains('cash')) db.createObjectStore('cash', { keyPath: 'id' }); // 읽기 전용(롤백·옛 백업 호환)
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('snapshots')) db.createObjectStore('snapshots', { keyPath: 'date' });
      if (!db.objectStoreNames.contains('cashTx')) {
        const s = db.createObjectStore('cashTx', { keyPath: 'id' });
        s.createIndex('accountId', 'accountId'); s.createIndex('date', 'date');
      }
      if (!db.objectStoreNames.contains('dividends')) {
        const s = db.createObjectStore('dividends', { keyPath: 'id' });
        s.createIndex('holdingKey', 'holdingKey'); s.createIndex('payDate', 'payDate');
      }
      if (e.oldVersion >= 1 && e.oldVersion < 2) migrateV1(req.transaction);
    };
    req.onsuccess = () => {
      const db = req.result;
      // 다른 탭이 새 버전으로 올리려 하면 연결을 닫고 새로 고침을 안내한다
      db.onversionchange = () => { db.close(); dbp = null; dispatchEvent(new CustomEvent('db-versionchange')); };
      resolve(db);
    };
    req.onblocked = () => dispatchEvent(new CustomEvent('db-blocked'));
    req.onerror = () => { dbp = null; reject(req.error); };
  });
  return dbp;
}

const wrap = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

export async function getAll(store) {
  const db = await openDB();
  return wrap(db.transaction(store).objectStore(store).getAll());
}
export async function get(store, key) {
  const db = await openDB();
  return wrap(db.transaction(store).objectStore(store).get(key));
}

// 여러 저장소를 한 트랜잭션으로 쓴다. fn(tx) 안에서 tx.objectStore(...).put/delete
export async function write(stores, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, 'readwrite');
    let out;
    try { out = fn(tx); } catch (e) { tx.abort(); reject(e); return; }
    tx.oncomplete = () => resolve(out);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('저장하지 못했어요'));
  });
}

export async function kvGet(key, dflt = null) {
  const r = await get('kv', key);
  return r ? r.value : dflt;
}
export async function kvSet(key, value) {
  return write(['kv'], (tx) => tx.objectStore('kv').put({ key, value }));
}

export async function clearAll() {
  return write(STORES, (tx) => STORES.forEach((s) => tx.objectStore(s).clear()));
}

// 테스트용: 연결을 닫는다
export async function closeDB() {
  if (!dbp) return;
  const db = await dbp; db.close(); dbp = null;
}
