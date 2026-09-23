import { html, createRoot, useState, useEffect, useCallback, useRef } from './react.js';
import { loadAll, onChange, saveSnapshot, saveSettings } from './store.js';
import { makeCtx } from './ctx.js';
import { setHidden, today } from './format.js';
import { refreshQuotes, scheduleBackup, explain } from './google.js';
import { TabBar, ToastHost, toast } from './components.js';
import { Home, Alloc } from './screens/home.js';
import { HoldingList, HoldingDetail, HoldingForm, TradeForm } from './screens/holdings.js';
import { Cash, Trades, Prices } from './screens/money.js';
import { Settings, Accounts, AccountForm, Connect, Backup } from './screens/settings.js';
import { Welcome, StartAccount, StartHoldings, StartCash, StartConnect, StartPrices } from './screens/onboard.js';

// [경로, 컴포넌트, 하단 탭]
const ROUTES = [
  ['/', Home, 'home'],
  ['/alloc', Alloc],
  ['/holdings', HoldingList, 'holdings'],
  ['/holding/new', HoldingForm],
  ['/holding/:id/edit', HoldingForm],
  ['/holding/:id/trade/:side', TradeForm],
  ['/holding/:id', HoldingDetail],
  ['/trades', Trades],
  ['/cash', Cash, 'cash'],
  ['/prices', Prices],
  ['/settings', Settings, 'settings'],
  ['/accounts', Accounts],
  ['/account/new', AccountForm],
  ['/account/:id', AccountForm],
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
  for (const [pat, C, tab] of ROUTES) {
    const a = pat.split('/'), b = path.split('/');
    if (a.length !== b.length) continue;
    const params = {};
    if (a.every((s, i) => (s.startsWith(':') ? ((params[s.slice(1)] = decodeURIComponent(b[i])), true) : s === b[i]))) return { C, tab, params };
  }
  return { C: Home, tab: 'home', params: {} };
}

function useHash() {
  const [h, setH] = useState(location.hash || '#/');
  useEffect(() => { const f = () => setH(location.hash || '#/'); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  return h;
}

function App() {
  const hash = useHash();
  const [st, setSt] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const lastRefresh = useRef(0);

  const reload = useCallback(async () => setSt(await loadAll()), []);
  useEffect(() => { reload(); return onChange((kind) => { reload(); if (kind === 'data') scheduleBackup(); }); }, []);

  const refresh = useCallback(async (force = true) => {
    const s = await loadAll();
    if (!s.settings.quote?.token || !navigator.onLine) return;
    if (!force && Date.now() - lastRefresh.current < (s.settings.refreshMinutes || 15) * 60000) return;
    lastRefresh.current = Date.now();
    setRefreshing(true);
    try { const r = await refreshQuotes(); if (r?.failed?.length) toast(`시세 ${r.failed.length}건을 받지 못했어요. 마지막 값을 표시합니다.`); }
    catch (e) { toast(explain(e)); }
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

  useEffect(() => { window.scrollTo(0, 0); }, [hash]);

  if (!st) return null;
  setHidden(st.settings.hideAmounts);
  const [pathPart, qs] = hash.slice(1).split('?');
  const path = pathPart || '/';
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  if (!st.accounts.length && !path.startsWith('/start') && path !== '/backup' && path !== '/connect') { location.replace('#/start'); return null; }
  const ctx = makeCtx(st);
  if (path === '/' && st.accounts.length) {
    saveSnapshot({ date: today(), totalAssetKrw: ctx.sum.total, totalCostKrw: ctx.sum.costKrw, cashKrw: ctx.sum.cashKrw, usdKrw: ctx.fxRate, byCategory: Object.fromEntries(ctx.sum.cats.map((c) => [c.id, c.value])) }).catch(() => {});
  }
  const { C, tab, params } = match(path);
  document.getElementById('app').className = tab ? '' : 'no-tab';
  return html`
    <${C} key=${hash} ctx=${ctx} params=${params} query=${query} refresh=${() => refresh(true)} refreshing=${refreshing} />
    ${tab && html`<${TabBar} active=${tab} />`}
    <${ToastHost} />`;
}

createRoot(document.getElementById('app')).render(html`<${App} />`);
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
