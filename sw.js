const V='kt-v276',A='kt-assets';
const CORE=['./','index.html','style.css','app.js','engine.js','ai.js','ai_fploy.json','view3d.js','sandbox.js','gl3d.js','fx.js','peerjs.min.js','tutorial.js','dcrop.js','camp.js','nemesis.js','ground.webp','vground.webp','tyground.webp','twground.webp','vwall.webp','vgrate.webp','sk1c.webp','sk1o.webp','sk2c.webp','sk2o.webp','sk3c.webp','sk3o.webp','skb.webp','skt0.webp','skt1.webp','skt2.webp','sks0.webp','sks1.webp','sks2.webp','mesh26.webp','vkt_A.webp','vkt_B.webp','vkt_C.webp','vkt_D.webp','vkt_E.webp','vkt_F.webp','vkt_G.webp','vkt_H.webp','vkt_I.webp','vkt_J.webp','vkt_K.webp','vkt_L.webp','vkt_M.webp','vkt_N.webp','meshes.json','mesh24.webp','mesh25.webp','data.json','weights.json','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(CORE).catch(()=>{})).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V&&x!==A).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const r=e.request; if(r.method!=='GET')return;
  const isCode=/\.(html|js|css|json)$|\/$/.test(new URL(r.url).pathname);
  if(isCode){e.respondWith(fetch(r).then(x=>{const c=x.clone();caches.open(V).then(ch=>ch.put(r,c));return x}).catch(()=>caches.match(r)));}
  else e.respondWith(caches.match(r).then(m=>m||fetch(r).then(x=>{if(x.ok){const c=x.clone();caches.open(A).then(ch=>ch.put(r,c))}return x})));
});

self.addEventListener('message',e=>{
  const d=e.data||{}; if(d.t!=='precache')return; const src=e.source;
  e.waitUntil((async()=>{
    const ch=await caches.open(A); const urls=d.urls||[]; let done=0,fail=0,i=0;
    const say=(o)=>{try{src&&src.postMessage(Object.assign({t:'precache'},o))}catch(_){}};
    const work=async()=>{while(i<urls.length){const u=urls[i++];try{const req=new Request(u);if(!(await ch.match(req))){const r=await fetch(req);if(r.ok)await ch.put(req,r);else fail++}}catch(_){fail++}done++;if(done%10===0||done===urls.length)say({done,total:urls.length,fail})}};
    await Promise.all([work(),work(),work(),work(),work(),work()]); say({done:urls.length,total:urls.length,fail,end:true});
  })());
});
