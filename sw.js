// 서비스워커: 앱 파일과 React·폰트(CDN)를 캐시해 오프라인에서도 열리게 한다.
// 앱 파일을 바꾸면 VERSION을 올린다.
const VERSION = 'v6';
const CACHE = 'portfolio-' + VERSION;
const APP_SHELL = [
  './', './index.html', './manifest.webmanifest', './css/app.css', './css/m4.css', './css/m3.css', './css/m56.css',
  './js/main.js', './js/group.js', './js/react.js', './js/components.js', './js/ctx.js', './js/calc.js', './js/format.js', './js/db.js', './js/store.js', './js/google.js', './js/charts.js', './js/period.js', './js/income.js',
  './js/screens/home.js', './js/screens/holdings.js', './js/screens/money.js', './js/screens/settings.js', './js/screens/onboard.js', './js/screens/account.js', './js/screens/sheets.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // 구글 시세·백업 요청은 캐시하지 않는다
  if (url.hostname.endsWith('google.com') || url.hostname.endsWith('googleusercontent.com')) return;
  const isCdn = url.hostname === 'esm.sh' || url.hostname === 'cdn.jsdelivr.net';
  if (url.origin !== location.origin && !isCdn) return;
  // 앱 파일: 네트워크 우선(최신 반영), 실패 시 캐시. CDN: 캐시 우선.
  if (isCdn) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    })));
  } else {
    // HTTP 캐시에 남은 옛 모듈과 섞이지 않도록 매번 재검증
    const req = e.request.mode === 'navigate' ? e.request : new Request(e.request, { cache: 'no-cache' });
    e.respondWith(fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || caches.match('./index.html'))));
  }
});
