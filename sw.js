// 서비스워커: 앱 파일과 React(CDN)를 캐시해 오프라인에서도 열리게 한다.
// 앱 파일을 바꾸면 VERSION을 올린다.
const VERSION = 'v1';
const CACHE = 'portfolio-' + VERSION;
const APP_SHELL = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './js/main.js', './js/react.js', './js/components.js', './js/ctx.js', './js/calc.js', './js/format.js', './js/db.js', './js/store.js', './js/google.js',
  './js/screens/home.js', './js/screens/holdings.js', './js/screens/money.js', './js/screens/settings.js', './js/screens/onboard.js',
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
  const isCdn = url.hostname === 'esm.sh';
  if (url.origin !== location.origin && !isCdn) return;
  // 앱 파일: 네트워크 우선(최신 반영), 실패 시 캐시. CDN: 캐시 우선.
  if (isCdn) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    })));
  } else {
    e.respondWith(fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || caches.match('./index.html'))));
  }
});
