"use strict";
const BUILD_VERSION="__BUILD_VERSION__";
const CACHE_PREFIX="osrs-pwa-static-";
const CACHE_NAME=CACHE_PREFIX+BUILD_VERSION;
const REQUIRED=["/index.html","/offline.html","/manifest.webmanifest","/pwa.js","/pwa.css"];

self.addEventListener("install",event=>{
  event.waitUntil((async()=>{
    const response=await fetch("/pwa-assets.json",{cache:"no-store"});
    if(!response.ok)throw new Error("The PWA asset list is missing. Deploy with the updated build script.");
    const data=await response.json();
    if(data.version!==BUILD_VERSION)throw new Error("PWA deploy version mismatch. Retry the update.");
    const cache=await caches.open(CACHE_NAME);
    await Promise.all(REQUIRED.map(async path=>{
      const response=await fetch(path,{cache:"reload"});
      if(!response.ok)throw new Error("Missing PWA file: "+path);
      await cache.put(path,response);
    }));
    await Promise.all((data.assets||[]).filter(path=>!REQUIRED.includes(path)).map(async path=>{
      try{const response=await fetch(path,{cache:"reload"});if(response.ok)await cache.put(path,response);}catch{}
    }));
  })());
});
self.addEventListener("activate",event=>{
  event.waitUntil((async()=>{
    for(const key of await caches.keys())if(key.startsWith(CACHE_PREFIX)&&key!==CACHE_NAME)await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener("message",event=>{if(event.data?.type==="SKIP_WAITING")self.skipWaiting();});
function cacheable(url){
  if(url.pathname==="/generate-push-keys.html")return false;
  if(url.pathname.startsWith("/.netlify/")||url.pathname.startsWith("/api/"))return false;
  return url.pathname==="/"||[".html",".css",".js",".png",".svg",".ico",".webmanifest",".jpg",".jpeg",".webp",".woff",".woff2",".ttf"].some(extension=>url.pathname.toLowerCase().endsWith(extension));
}
self.addEventListener("fetch",event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=="GET"||url.origin!==self.location.origin||!cacheable(url))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE_NAME);
    const path=url.pathname==="/"?"/index.html":url.pathname;
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),5000);
    try{
      const response=await fetch(request,{signal:controller.signal});
      if(response.ok){await cache.put(path,response.clone());return response;}
      const cached=await cache.match(path);if(cached)return cached;
      return response;
    }catch{
      const cached=await cache.match(path);if(cached)return cached;
      if(request.mode==="navigate")return await cache.match("/offline.html")||new Response("Offline",{status:503});
      return new Response("Resource unavailable offline",{status:503});
    }finally{clearTimeout(timeout);}
  })());
});
self.addEventListener("push",event=>{
  event.waitUntil((async()=>{
    let payload={title:"OSRS Timers",body:"A timer is ready to check.",tag:"osrs-farm"};
    try{if(event.data)payload={...payload,...event.data.json()};}catch{}
    await self.registration.showNotification(payload.title,{
      body:payload.body,tag:payload.tag,icon:"/icons/app-192.png",badge:"/icons/badge-96.png",
      data:{player:payload.player||"",revision:payload.revision||""}
    });
  })());
});
self.addEventListener("notificationclick",event=>{
  event.notification.close();const target=new URL("/farm.html",self.location.origin);
  if(event.notification.data?.player)target.searchParams.set("player",event.notification.data.player);
  event.waitUntil((async()=>{
    for(const client of await self.clients.matchAll({type:"window",includeUncontrolled:true})){
      const current=new URL(client.url);
      if(current.origin===target.origin&&current.pathname===target.pathname){const next=await client.navigate(target.toString());return(next||client).focus();}
    }
    return self.clients.openWindow(target.toString());
  })());
});
