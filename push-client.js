"use strict";
(() => {
  const TIMERS="osrs-farm-timers-v1",PREF="osrs-farm-alerts-v1",STATE="osrs-netlify-push-v1",VERSION="osrs-push-sync-version-v1";
  const rawSet=Storage.prototype.setItem;
  let state=null,subscription=null,registration=null,syncBusy=false,again=false,debounce=null;
  function read(id,fallback){try{return JSON.parse(localStorage.getItem(id)||"null")??fallback;}catch{return fallback;}}
  state=read(STATE,null);
  function storeState(){rawSet.call(localStorage,STATE,JSON.stringify(state));}
  function message(text,error=false){const el=document.getElementById("cloud-push-status")||document.getElementById("farm-status");if(el){el.textContent=text;el.classList.toggle("error",error);}}
  function cloudActive(){return !!state?.enabled&&("Notification"in window)&&Notification.permission==="granted";}
  function suppressLocal(value){try{const timers=JSON.parse(value);if(Array.isArray(timers)){for(const timer of timers)timer.notified=true;return JSON.stringify(timers);}}catch{}return value;}
  Storage.prototype.setItem=function(id,value){
    let next=value;
    if(this===localStorage&&id===TIMERS&&cloudActive())next=suppressLocal(String(value));
    rawSet.call(this,id,next);
    if(this===localStorage&&(id===TIMERS||id===PREF))queueSync();
  };
  if(cloudActive()){try{const value=localStorage.getItem(TIMERS);if(value)rawSet.call(localStorage,TIMERS,suppressLocal(value));}catch{}}
  function token(){return Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,"0")).join("");}
  async function api(endpoint,data){
    const response=await fetch("/.netlify/functions/"+endpoint,{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+state.token},body:JSON.stringify(data||{})});
    let result={};try{result=await response.json();}catch{}
    if(!response.ok)throw new Error(result.error||"Netlify request failed: HTTP "+response.status);
    return result;
  }
  function keyBytes(value){const base64=value.split("-").join("+").split("_").join("/");const decoded=atob(base64+"=".repeat((4-base64.length%4)%4));return Uint8Array.from(decoded,c=>c.charCodeAt(0));}
  async function worker(){
    if(!window.isSecureContext||!("serviceWorker"in navigator)||!("PushManager"in window)||!("Notification"in window))throw new Error("Web Push requires your HTTPS Netlify site in a compatible browser.");
    if(registration)return registration;
    const reg=await navigator.serviceWorker.register("farm-sw.js");await reg.update();
    if(!reg.active){const sw=reg.installing||reg.waiting;if(!sw)throw new Error("Notification worker is not ready. Reload and retry.");await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("Worker activation timed out.")),15000);const check=()=>{if(sw.state==="activated"){clearTimeout(timer);resolve();}else if(sw.state==="redundant"){clearTimeout(timer);reject(new Error("Worker activation failed."));}};sw.addEventListener("statechange",check);check();});}
    registration=reg;return reg;
  }
  function schedule(){
    const timers=read(TIMERS,[]),now=Date.now();if(!Array.isArray(timers))return[];
    return timers.filter(t=>t&&t.alert!==false&&!t.paused&&!t.acknowledged&&Number.isFinite(t.endsAt)&&t.endsAt>now-86400000&&t.endsAt<now+8*86400000).map(t=>({id:String(t.id),label:String(t.label).slice(0,80),player:String(t.player).slice(0,12),endsAt:Math.round(t.endsAt)}));
  }
  function nextVersion(){const old=Number(read(VERSION,0))||0;const version=Math.max(Date.now(),old+1);rawSet.call(localStorage,VERSION,JSON.stringify(version));return version;}
  async function sync(){
    if(!state?.token||!subscription)return;
    if(syncBusy){again=true;return;}
    syncBusy=true;
    try{
      const enabled=state.enabled&&read(PREF,true)!==false;
      const result=await api("push-sync",{subscription:subscription.toJSON(),timers:schedule(),enabled,version:nextVersion()});
      state.lastSync=result.syncedAt||new Date().toISOString();storeState();
      message(enabled?"Cloud timers synced to Netlify at "+new Date(state.lastSync).toLocaleTimeString()+". Server checks run every minute.":"Cloud alerts paused on Netlify.");
      document.getElementById("cloud-sync-state").textContent="Synced";
    }catch(error){message("Not synced: "+error.message+" Keep this page open and retry before relying on background alerts.",true);document.getElementById("cloud-sync-state").textContent="Sync failed";}
    finally{syncBusy=false;if(again){again=false;queueSync();}}
  }
  function queueSync(){if(!subscription||!state?.token)return;clearTimeout(debounce);document.getElementById("cloud-sync-state")?.replaceChildren(document.createTextNode("Sync pending"));debounce=setTimeout(sync,200);}
  async function connect(){
    try{
      if(!window.isSecureContext||!("Notification"in window))throw new Error("Open the deployed HTTPS Netlify site first.");
      const response=await fetch("/.netlify/functions/push-config",{cache:"no-store"});
      const config=await response.json();if(!config.configured)throw new Error("Add the three VAPID environment variables in Netlify, then redeploy.");
      let permission=Notification.permission;if(permission!=="granted")permission=await Notification.requestPermission();if(permission!=="granted")throw new Error("Notification permission was not granted.");
      const reg=await worker();subscription=await reg.pushManager.getSubscription();const publicKey=keyBytes(config.publicKey);
      if(subscription){const current=subscription.options.applicationServerKey;if(current&&Array.from(new Uint8Array(current)).join(",")!==Array.from(publicKey).join(",")){await subscription.unsubscribe();subscription=null;}}
      if(!subscription)subscription=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:publicKey});
      state={...(state||{}),token:state?.token||token(),enabled:true};storeState();
      rawSet.call(localStorage,PREF,JSON.stringify(true));const local=localStorage.getItem(TIMERS);if(local)rawSet.call(localStorage,TIMERS,suppressLocal(local));
      window.dispatchEvent(new StorageEvent("storage",{key:TIMERS,storageArea:localStorage}));await sync();updateLabels();
    }catch(error){message(error.message,true);}
  }
  function updateLabels(){
    const enable=document.getElementById("enable-notifications");if(enable)enable.textContent="Enable Netlify Push";
    const toggle=document.getElementById("toggle-alerts");if(toggle)toggle.textContent=state?.enabled&&read(PREF,true)!==false?"Pause Cloud Alerts":"Resume Cloud Alerts";
    const test=document.getElementById("test-notification");if(test)test.textContent="Send Netlify Test Push";
    const info=document.getElementById("notification-status");if(info)info.textContent=state?.enabled?"Web Push connected. Netlify checks synced timers every minute. Device restrictions can still delay delivery.":"Enable Netlify Push to receive synced timer alerts without keeping this page open.";
  }
  const panel=document.createElement("section");panel.className="cloud-push-panel";
  panel.innerHTML='<div class="cloud-push-header"><span>Netlify Notifications</span><span id="cloud-sync-state">Not connected</span></div><p id="cloud-push-status" role="status" aria-live="polite">Enable Netlify Push in timer settings. Timer changes must show Synced before closing this page.</p><button id="cloud-sync-now" type="button">Sync Timers Now</button>';
  document.querySelector(".timers-app").prepend(panel);
  document.getElementById("cloud-sync-now").addEventListener("click",()=>state?.enabled?sync():connect());
  document.addEventListener("click",event=>{
    const target=event.target instanceof Element?event.target.closest("button"):null;
    if(!target||!["enable-notifications","test-notification","toggle-alerts"].includes(target.id))return;
    event.preventDefault();event.stopImmediatePropagation();
    if(target.id==="enable-notifications"){connect();return;}
    if(target.id==="test-notification"){
      (async()=>{try{if(!state?.enabled||!subscription)throw new Error("Enable Netlify Push first.");await sync();await api("push-test",{});message("Test push sent by Netlify. Check your device notifications.");}catch(error){message(error.message,true);}})();return;
    }
    if(!state?.token){connect();return;}
    const next=!(state.enabled&&read(PREF,true)!==false);state.enabled=next;storeState();rawSet.call(localStorage,PREF,JSON.stringify(next));window.dispatchEvent(new StorageEvent("storage",{key:PREF,storageArea:localStorage}));queueSync();updateLabels();
  },true);
  window.addEventListener("storage",event=>{if(event.key===TIMERS||event.key===PREF)queueSync();});
  document.addEventListener("visibilitychange",()=>{if(!document.hidden){queueSync();updateLabels();}});
  document.addEventListener("click",()=>setTimeout(updateLabels,0));updateLabels();
  if(state?.token&&("Notification"in window)&&Notification.permission==="granted"){
    (async()=>{try{const reg=await worker();subscription=await reg.pushManager.getSubscription();if(subscription)await sync();else message("Push subscription expired. Enable Netlify Push again.",true);}catch(error){message(error.message,true);}})();
  }
})();
