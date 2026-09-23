// IndexedDB 얇은 래퍼(외부 라이브러리 없음)
const DB_NAME = 'portfolio';
const DB_VERSION = 1;
export const STORES = ['accounts', 'holdings', 'trades', 'cash', 'kv', 'snapshots'];
let dbp;

export function openDB() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('accounts')) db.createObjectStore('accounts', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('holdings')) db.createObjectStore('holdings', { keyPath: 'id' }).createIndex('accountId', 'accountId');
      if (!db.objectStoreNames.contains('trades')) db.createObjectStore('trades', { keyPath: 'id' }).createIndex('holdingId', 'holdingId');
      if (!db.objectStoreNames.contains('cash')) db.createObjectStore('cash', { keyPath: 'id' }); // id = accountId:currency
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('snapshots')) db.createObjectStore('snapshots', { keyPath: 'date' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
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
    tx.onabort = () => reject(tx.error || new Error('저장이 취소되었습니다'));
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
