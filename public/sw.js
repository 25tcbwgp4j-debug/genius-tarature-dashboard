// Genius Lab Gestionale — Service Worker (PWA)
// 15/11/2026 (piano 2.14): titolo predefinito «Genius Lab» e destinazione giusta (chat Apple per i messaggi del negozio)
// 04/10/2026 (v2): il service worker NON intercetta più pagine, script e chiamate. Prima ogni GET passava di qui e
// finiva in una cache che cresceva a ogni rilascio (mai svuotata): sugli iMac vecchi rallentava la dashboard e, con
// la rete incerta, poteva servire un bundle vecchio. Ora: solo icone/manifest in cache, pagina offline di ripiego,
// e all'attivazione si cancellano le cache vecchie (tarature-v1).

const CACHE_NAME = 'tarature-v4'; // v4 (15/11/2026): manifest con le scorciatoie Apple
const STATIC_ASSETS = [
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // solo le icone e il manifest dalla cache; tutto il resto (pagine, bundle JS/CSS, API) va diretto in rete
  if (STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(caches.match(request).then((r) => r || fetch(request)));
  }
});

// Push notifications (web push - VAPID)
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data = {};
  try {
    data = event.data.json();
  } catch {
    data = { title: 'Genius Lab', body: event.data.text() };
  }
  const title = data.title || 'Genius Lab';
  // destinazione: l'url mandato dal server; altrimenti la chat della divisione del messaggio
  const destinazione = data.url || (data.attivita === 'apple' || data.linea === 'genius' ? '/chat-apple' : '/chat');
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    image: data.image,
    data: destinazione,
    tag: data.tag || 'genius-lab-msg',
    renotify: true,
    vibrate: [200, 100, 200, 100, 200],
    requireInteraction: false,
    actions: [
      { action: 'open', title: '👀 Apri' },
      { action: 'dismiss', title: '✕ Ignora' },
    ],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data || '/chat';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Se c'è già una tab aperta, focus
      for (const client of clients) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      // una finestra del gestionale è già aperta su un'altra pagina: la si porta sulla destinazione
      const aperta = clients.find((c) => 'navigate' in c && 'focus' in c);
      if (aperta) return aperta.focus().then(() => aperta.navigate(url));
      return self.clients.openWindow(url);
    })
  );
});
