// Service worker: lets the app be installed to a phone's home screen and keeps
// the app shell and rules data cached. Game state (/api) always goes to the network.
const VERSION = "pftable-v2";
const SHELL = [
  "/", "/index.html", "/css/style.css", "/manifest.webmanifest",
  "/js/main.js", "/js/ui.js", "/js/api.js", "/js/data.js", "/js/dm.js", "/js/player.js", "/js/builder.js",
  "/js/sheet.js", "/js/map.js", "/js/table.js", "/js/plot.js", "/js/handouts.js", "/js/dmtools.js",
  "/js/reference.js", "/js/companions.js", "/js/shared/rules.js", "/js/shared/dice.js",
  "/data/ancestries.json", "/data/versatile-heritages.json", "/data/backgrounds.json", "/data/classes.json",
  "/data/weapons.json", "/data/armor.json", "/data/shields.json",
  "/icons/icon-192.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/data/") || url.pathname.startsWith("/icons/")) {
    // rules data rarely changes: cache first, fill the cache on first use
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      if (res.ok) caches.open(VERSION).then((c) => c.put(e.request, copy));
      return res;
    })));
    return;
  }
  // app code: network first so updates show up, cached copy when offline
  e.respondWith(fetch(e.request).then((res) => {
    const copy = res.clone();
    if (res.ok) caches.open(VERSION).then((c) => c.put(e.request, copy));
    return res;
  }).catch(() => caches.match(e.request).then((hit) => hit || caches.match("/index.html"))));
});
