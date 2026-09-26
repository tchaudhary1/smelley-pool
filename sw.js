// Always-fresh loading. GitHub Pages lets browsers reuse files for 10 minutes, which left people
// on old versions after an update. This worker asks the server every time for the site's own files
// (unchanged files come back as a quick "not modified"). It stores nothing and never touches other
// sites (Supabase, ESPN, fonts).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const req = e.request; const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(req.mode === 'navigate'
    ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
    : fetch(req, { cache: 'no-cache' }));
});
