const CACHE="track-cycling-timer-v23";
const ASSETS=["./","./index.html","./styles.css?v=23","./app.js?v=23","./manifest.webmanifest"];
self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch",event=>{
  if(event.request.mode==="navigate"){
    event.respondWith(fetch(event.request,{cache:"no-store"}).then(response=>{
      const copy=response.clone(); caches.open(CACHE).then(cache=>cache.put("./",copy)); return response;
    }).catch(()=>caches.match("./")));
    return;
  }
  event.respondWith(fetch(event.request).catch(()=>caches.match(event.request)));
});