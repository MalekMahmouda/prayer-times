/* Prayer Times service worker — offline app shell (v1) */
const CACHE = 'pt-cache-20260929090451';
const SHELL = ["index.html","styles/app.css","styles/fonts.css","styles/web.css","js/app.js","js/pages.js","js/pages3.js","js/reader.js","js/store3.js","js/data.js","js/platform.js","js/adhan-bundle.js","data/quran.json","manifest.webmanifest","fonts/amiri-bold.woff2","fonts/amiri-quran-regular.woff2","icons/icon-128.png","icons/icon-16.png","icons/icon-256.png","icons/icon-32.png","icons/icon-48.png","icons/icon-64.png"];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // adhan audio streams straight from network
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
