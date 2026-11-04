// Service worker: rete prima (così gli aggiornamenti arrivano subito), cache se offline.
// Aumenta VERSION a ogni modifica dei file per aggiornare la cache.
const VERSION = "v4";
const CACHE = "gestionale-" + VERSION;
const FILES = ["./", "index.html", "styles.css", "app.js", "manifest.webmanifest",
  "fonts/BricolageGrotesque.woff2", "fonts/IBMPlexSans-400.woff2", "fonts/IBMPlexSans-500.woff2", "fonts/IBMPlexSans-600.woff2",
  "fonts/IBMPlexMono-400.woff2", "fonts/IBMPlexMono-500.woff2",
  "icons/icon-192.png", "icons/icon-512.png", "icons/icon48.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  // cancella solo le cache di questa app (prefisso "gestionale-", e "bilancio-" del vecchio nome):
  // le altre web app sulla stessa origine hanno le loro
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => (k.startsWith("gestionale-") || k.startsWith("bilancio-")) && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin || !u.pathname.startsWith(new URL("./", self.registration.scope).pathname)) return;
  e.respondWith(
    fetch(e.request)
      .then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match("index.html")))
  );
});
