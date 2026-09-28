// Service worker: deixa o app abrir mesmo sem internet.
// Estratégia "internet primeiro": se estiver online, sempre pega a versão nova;
// se estiver offline, usa a cópia guardada.
const CACHE = "foco-v1";
const ARQUIVOS = ["./", "index.html", "style.css", "app.js", "manifest.json", "icons/icon-192.png", "icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  const meu = u.origin === location.origin || u.host.includes("fonts.g");
  if (e.request.method !== "GET" || !meu) return; // ignora outros sites (ex: banco de dados)
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copia = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copia));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
