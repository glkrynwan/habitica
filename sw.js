/* Habitica service worker.
 * Strategi: precache versi (cache-first) + pembaruan atas persetujuan pengguna.
 * PENTING: naikkan VERSION setiap kali file aplikasi berubah, agar pengguna menerima pembaruan.
 * Semua path relatif terhadap lokasi sw.js, sehingga aman di GitHub Pages subpath (/habitica/). */
const VERSION = '1.0.0';
const CACHE = `habitica-v${VERSION}`;
const LEGACY_CACHES = ['levelup-v1'];

const ASSETS = [
  './', './index.html', './manifest.webmanifest',
  './css/app.css',
  './js/theme-boot.js', './js/app.js', './js/ui.js', './js/views.js', './js/editor.js', './js/focus.js',
  './js/store.js', './js/dates.js', './js/util.js', './js/schedule.js', './js/xp.js', './js/tasks.js',
  './js/habits.js', './js/today.js', './js/stats.js', './js/achievements.js', './js/cats.js',
  './icons/logo.svg', './icons/favicon.svg', './icons/favicon-48.png', './icons/apple-touch-icon.png',
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-192.png', './icons/maskable-512.png',
];

async function broadcast(msg) {
  for (const c of await self.clients.matchAll({ includeUncontrolled: true })) c.postMessage(msg);
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const failed = [];
    // Satu per satu agar kegagalan menyebut file yang tepat, bukan "addAll gagal" yang buram.
    await Promise.all(ASSETS.map(async url => {
      try {
        const res = await fetch(new Request(url, { cache: 'reload' }));
        if (!res.ok) throw new Error('HTTP ' + res.status);
        await cache.put(url, res);
      } catch (err) { failed.push(`${url} (${err.message})`); }
    }));
    if (failed.length) {
      const detail = 'file gagal diunduh: ' + failed.join(', ');
      console.error('[sw] precache gagal →', detail);
      await caches.delete(CACHE);
      await broadcast({ type: 'PRECACHE_FAILED', detail });
      throw new Error(detail);          // pemasangan dibatalkan; SW lama (jika ada) tetap berjalan
    }
    // Migrasi sekali dari "Level Up": ganti SW lama segera agar pengguna tidak tertahan di versi lama.
    if (await caches.has('levelup-v1')) self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE && (k.startsWith('habitica-') || LEGACY_CACHES.includes(k))) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => { if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting(); });

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;                 // tidak menyentuh sumber luar
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') {                                   // hanya navigasi halaman → cangkang aplikasi
      const shell = await cache.match('./index.html');
      if (shell) return shell;
    }
    return fetch(req);                                               // aset lain: jaringan apa adanya (tidak di-cache)
  })());
});
