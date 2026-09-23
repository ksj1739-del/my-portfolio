// 구글 Apps Script 웹앱 연동: 시세 조회(GET), 자동 백업(POST text/plain), 복원(GET)
import { loadAll, saveQuotes, saveSettings, exportData } from './store.js';

const TIMEOUT = 20000;

function withTimeout(p, ms = TIMEOUT) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

export function quoteKey(h) {
  if (h.market === 'US' && h.ticker) return `US:${h.ticker.toUpperCase()}`;
  if (h.market === 'KR' && /^[0-9][0-9A-Z]{5}$/i.test(h.ticker || '')) return `KR:${h.ticker.toUpperCase()}`;
  return null;
}

export function explain(err) {
  const m = String(err?.message || err);
  if (m === 'timeout') return '응답이 없어요. 잠시 후 다시 시도하세요.';
  if (m === 'auth') return '토큰이 맞지 않아요. 시트의 「설정」 탭에 있는 토큰을 다시 복사하세요.';
  if (m === 'url') return '웹앱 URL을 확인하세요(https://script.google.com/…/exec 형태).';
  if (m.includes('Failed to fetch') || m.includes('NetworkError')) return '연결하지 못했어요. 인터넷 연결과 Apps Script 배포(액세스: 모든 사용자)를 확인하세요.';
  return `연결 오류: ${m}`;
}

function checkUrl(url) {
  if (!/^https:\/\/script\.google(usercontent)?\.com\/.+\/exec(\?.*)?$/.test(url || '')) throw new Error('url');
}

export async function fetchQuotes(conn, keys) {
  checkUrl(conn.url);
  const u = new URL(conn.url);
  u.searchParams.set('action', 'quotes');
  u.searchParams.set('t', conn.token);
  u.searchParams.set('s', [...new Set(keys)].join(','));
  const res = await withTimeout(fetch(u.toString(), { method: 'GET', redirect: 'follow' }));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  if (j.error) throw new Error(j.error);
  return j; // { fetchedAt, quotes: { key: {price,currency,asOf} | {error} } }
}

// 보유 종목 전체 시세 + 환율 갱신
let busy = null;
export function refreshQuotes() {
  if (busy) return busy;
  busy = (async () => {
    const st = await loadAll();
    const conn = st.settings.quote;
    if (!conn?.url || !conn?.token) return { skipped: true };
    const keys = st.holdings.map(quoteKey).filter(Boolean);
    keys.push('FX:USDKRW');
    const j = await fetchQuotes(conn, keys);
    const quotes = {}, failed = [];
    let fx = null;
    for (const [k, v] of Object.entries(j.quotes || {})) {
      if (v && v.price > 0 && isFinite(v.price)) {
        if (k === 'FX:USDKRW') fx = { rate: v.price, asOf: v.asOf || j.fetchedAt, source: 'google' };
        else quotes[k] = { price: v.price, currency: v.currency, asOf: v.asOf || j.fetchedAt, fetchedAt: j.fetchedAt };
      } else failed.push(k);
    }
    await saveQuotes(quotes, fx);
    return { ok: Object.keys(quotes).length, failed };
  })().finally(() => { busy = null; });
  return busy;
}

// ---------- 자동 백업 ----------
export async function pushBackup() {
  const st = await loadAll();
  const conn = st.settings.quote;
  if (!conn?.url || !conn?.token) throw new Error('not-connected');
  checkUrl(conn.url);
  const payload = await exportData();
  const res = await withTimeout(fetch(conn.url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // 사전 요청(CORS preflight) 없이 보내기
    body: JSON.stringify({ action: 'backup', t: conn.token, payload }),
    redirect: 'follow',
  }));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  if (j.error) throw new Error(j.error);
  await saveSettings({ lastGoogleBackupAt: new Date().toISOString() });
  return j;
}

export async function fetchGoogleBackup(conn) {
  checkUrl(conn.url);
  const u = new URL(conn.url);
  u.searchParams.set('action', 'restore');
  u.searchParams.set('t', conn.token);
  const res = await withTimeout(fetch(u.toString(), { redirect: 'follow' }));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  if (j.error) throw new Error(j.error);
  return j.payload; // 백업 JSON 또는 null
}

let timer = null;
export function scheduleBackup(delay = 8000) {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    const st = await loadAll();
    if (!st.settings.autoBackup || !st.settings.quote?.token || !navigator.onLine) return;
    try { await pushBackup(); } catch (e) { console.warn('자동 백업 실패', e); }
  }, delay);
}
