/* === Service Worker === */
const CACHE = 'personal-platform-v28';
const URLS = ['index.html', 'style.css', 'app.js', 'manifest.json', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(URLS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // 網路優先：先拿網路，失敗才用快取（確保最新版）
  // 導覽／HTML 一定要繞過瀏覽器 HTTP 快取（GitHub Pages 是 max-age=600，
  // 只寫 fetch(e.request) 會拿到快取舊 HTML，改了版還看到舊畫面）
  const _u = new URL(e.request.url);
  const _ext = _u.pathname.split('.').pop();
  const _isHTML = e.request.mode === 'navigate' || !_ext || _ext === 'html' || _ext === 'htm' || _u.pathname.endsWith('/');
  if (_isHTML) {
    e.respondWith(fetch(e.request, { cache: 'no-store' }).catch(() => caches.match(e.request)));
    return;
  }
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request))
  );
});
