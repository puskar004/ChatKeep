self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open("chatkeep-v1").then((cache) => cache.addAll(["./", "./index.html", "./app.js", "./manifest.json", "./icon.svg"]))
  );
});
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((hit) => hit || fetch(event.request))
  );
});
