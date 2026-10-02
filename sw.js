// Always-fresh loading. GitHub Pages lets browsers reuse files for 10 minutes, which left people
// on old versions after an update. This worker asks the server every time for the site's own files
// (unchanged files come back as a quick "not modified"). It stores nothing and never touches other
// sites (Supabase, ESPN, fonts).
// It also shows phone notifications (Web Push) and opens the right screen when one is tapped.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'Smelley Pool', body: e.data?.text() || '' }; }
  e.waitUntil((async () => {
    const tag = d.tag || 'smelley';
    // Chat updates in place: "3 new messages", showing the latest.
    let body = d.body || '';
    if (tag === 'chat') {
      const open = await self.registration.getNotifications({ tag: 'chat' });
      const n = (open[0]?.data?.count || 1) + (open.length ? 1 : 0);
      if (n > 1) body = `${n} new · ${body}`;
      d.count = open.length ? n : 1;
    }
    await self.registration.showNotification(d.title || 'Smelley Pool', {
      body, tag, renotify: true,
      icon: 'assets/icon-192.png', badge: 'assets/badge-96.png',
      data: { url: d.url || './', count: d.count || 1, kind: d.kind },
    });
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || './', self.registration.scope).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const win = wins.find(w => w.url.startsWith(self.registration.scope));
    if (win) { await win.focus(); try { await win.navigate(url); } catch { win.postMessage({ type: 'open', url }); } return; }
    await self.clients.openWindow(url);
  })());
});

// The browser replaced the push subscription: tell an open page to save the new one.
self.addEventListener('pushsubscriptionchange', e => {
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(ws => ws.forEach(w => w.postMessage({ type: 'resubscribe' }))));
});
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const req = e.request; const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(req.mode === 'navigate'
    ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
    : fetch(req, { cache: 'no-cache' }));
});
