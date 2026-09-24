import { html, createRoot, useState, useEffect, useCallback, useRef } from './react.js';
import { loadAll, onChange, saveSnapshot, saveSettings, cleanupPreV2 } from './store.js';
import { makeCtx } from './ctx.js';
import { buildSnapshot } from './period.js';
import { setHidden, today } from './format.js';
import { refreshQuotes, scheduleBackup, explain } from './google.js';
import { TabBar, ToastHost, DialogHost, Skeleton, toast, setHaptics, SHEET_KEYS } from './components.js';
import { Home } from './screens/home.js';
import { HoldingList, HoldingDetail, HoldingForm, TradeForm, GroupDetail } from './screens/holdings.js';
import { Settings, AccountForm, Connect, Backup } from './screens/settings.js';
import { Account } from './screens/account.js';
import { SheetHost } from './screens/sheets.js';
import { Welcome, StartAccount, StartHoldings, StartCash, StartConnect, StartPrices } from './screens/onboard.js';

// 옛 경로 → 새 경로 (TWA 시작 URL·북마크 호환)
const ALIASES = {
  '/cash': '#/',
  '/alloc': '#/account',
  '/trades': '#/account/history?f=trade',
  '/accounts': '#/account/manage',
  '/prices': '#/?sheet=prices',
  '/cash/edit': '#/?sheet=adjust',
};

// [경로, 컴포넌트, 하단 탭, 추가 params]. 내 계좌 세그먼트는 '/account/:id'보다 먼저
const ROUTES = [
  ['/', Home, 'home'],
  ['/holdings', HoldingList, 'holdings'],
  ['/holding/new', HoldingForm],
  ['/holding/g/:key', GroupDetail], // M3 합산 상세. '/holding/:id/edit'와 같은 4칸이라 먼저
  ['/holding/:id/edit', HoldingForm],
  ['/holding/:id/trade/:side', TradeForm],
  ['/holding/:id', HoldingDetail],
  ['/account', Account, 'account', { seg: 'assets' }],
  ['/account/history', Account, 'account', { seg: 'history' }],
  ['/account/dividends', Account, 'account', { seg: 'dividends' }],
  ['/account/profit', Account, 'account', { seg: 'profit' }],
  ['/account/manage', Account, 'account', { seg: 'manage' }],
  ['/account/new', AccountForm],
  ['/account/:id', AccountForm],
  ['/settings', Settings, 'settings'],
  ['/connect', Connect],
  ['/backup', Backup],
  ['/start', Welcome],
  ['/start/account', StartAccount],
  ['/start/holdings/:acc', StartHoldings],
  ['/start/cash/:acc', StartCash],
  ['/start/connect', StartConnect],
  ['/start/prices', StartPrices],
];

function match(path) {
  for (const [pat, C, tab, extra] of ROUTES) {
    const a = pat.split('/'), b = path.split('/');
    if (a.length !== b.length) continue;
    const params = { ...extra };
    if (a.every((s, i) => (s.startsWith(':') ? ((params[s.slice(1)] = decodeURIComponent(b[i])), true) : s === b[i]))) return { C, tab, params };
  }
  return { C: Home, tab: 'home', params: {} };
}

function useHash() {
  const [h, setH] = useState(location.hash || '#/');
  useEffect(() => { const f = () => setH(location.hash || '#/'); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  return h;
}

// 테마: 'system'은 여기서 풀어 data-theme에는 dark/light만 넣는다
const THEME_BG = { dark: '#17171C', light: '#F2F4F6' };
function useTheme(pref) {
  useEffect(() => {
    if (!pref) return; // 설정을 읽기 전에는 head 스크립트가 적용한 값을 유지
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const t = pref === 'system' ? (mq.matches ? 'dark' : 'light') : pref === 'light' ? 'light' : 'dark';
      document.documentElement.dataset.theme = t;
      document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', THEME_BG[t]));
    };
    apply();
    try { localStorage.setItem('theme', pref || 'dark'); } catch { /* 무시 */ }
    if (pref !== 'system') return;
    mq.addEventListener?.('change', apply);
    return () => mq.removeEventListener?.('change', apply);
  }, [pref]);
}

function App() {
  const hash = useHash();
  const [st, setSt] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const lastRefresh = useRef(0);

  const reload = useCallback(async () => setSt(await loadAll()), []);
  useEffect(() => { reload(); return onChange((kind) => { reload(); if (kind === 'data') scheduleBackup(); }); }, []);
  useEffect(() => {
    cleanupPreV2().catch(() => {});
    // 다른 탭에서 새 버전으로 DB를 올리면 이 탭은 연결을 닫는다
    const vc = () => toast('앱이 업데이트됐어요. 새로 고쳐 주세요.', { type: 'error', action: { label: '새로 고침', run: () => location.reload() } });
    const bl = () => toast('다른 탭에서 앱이 열려 있어요. 그 탭을 닫아 주세요.', { type: 'error' });
    addEventListener('db-versionchange', vc); addEventListener('db-blocked', bl);
    return () => { removeEventListener('db-versionchange', vc); removeEventListener('db-blocked', bl); };
  }, []);

  const refresh = useCallback(async (force = true) => {
    const s = await loadAll();
    if (!s.settings.quote?.token || !navigator.onLine) return;
    if (!force && Date.now() - lastRefresh.current < (s.settings.refreshMinutes || 15) * 60000) return;
    lastRefresh.current = Date.now();
    setRefreshing(true);
    try { const r = await refreshQuotes(); if (r?.failed?.length) toast(`시세 ${r.failed.length}건을 받지 못했어요. 마지막 값을 보여 드려요.`, { type: 'error' }); }
    catch (e) { toast(explain(e), { type: 'error' }); }
    setRefreshing(false);
  }, []);

  useEffect(() => {
    refresh(true);
    const vis = () => document.visibilityState === 'visible' && refresh(false);
    document.addEventListener('visibilitychange', vis);
    const id = setInterval(vis, 60000);
    if (navigator.storage?.persist) navigator.storage.persist().then((ok) => saveSettings({ persisted: ok })).catch(() => {});
    return () => { document.removeEventListener('visibilitychange', vis); clearInterval(id); };
  }, []);

  const [pathPart, qs] = hash.slice(1).split('?');
  const path = pathPart || '/';
  const q = new URLSearchParams(qs || '');
  const sheet = q.get('sheet');
  const sheetQuery = Object.fromEntries(q);
  SHEET_KEYS.forEach((k) => q.delete(k)); // 시트를 열고 닫아도 화면이 다시 그려지지 않게
  const screenKey = path + '?' + q.toString();
  useEffect(() => { window.scrollTo(0, 0); }, [screenKey]);
  useTheme(st ? st.settings.theme || 'dark' : null);

  if (ALIASES[path]) { location.replace(ALIASES[path]); return null; }
  if (!st) return html`<${Skeleton} />`;
  setHidden(st.settings.hideAmounts);
  setHaptics(st.settings.haptics);
  const query = Object.fromEntries(q);
  if (!st.accounts.length && !path.startsWith('/start') && path !== '/backup' && path !== '/connect') { location.replace('#/start'); return null; }
  const ctx = makeCtx(st);
  if (path === '/' && st.accounts.length) {
    // 하루 1건(그날 마지막 값으로 덮어씀). v2 필드(순유입 누계·계좌별 등)는 period.js가 만든다(§3.4.2)
    saveSnapshot(buildSnapshot({ date: today(), sum: ctx.sum, fxRate: ctx.fxRate, cashTx: ctx.cashTx, trades: ctx.trades })).catch(() => {});
  }
  const { C, tab, params } = match(path);
  document.getElementById('app').className = tab ? '' : 'no-tab';
  document.body.classList.toggle('has-tab', !!tab);
  return html`
    <div className=${'page' + (tab ? '' : ' sub')} key=${screenKey}>
      <${C} ctx=${ctx} params=${params} query=${query} refresh=${() => refresh(true)} refreshing=${refreshing} />
    </div>
    ${tab && html`<${TabBar} active=${tab} />`}
    ${sheet && html`<${SheetHost} name=${sheet} ctx=${ctx} query=${sheetQuery} path=${path} />`}
    <${ToastHost} />
    <${DialogHost} />`;
}

createRoot(document.getElementById('app')).render(html`<${App} />`);
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
