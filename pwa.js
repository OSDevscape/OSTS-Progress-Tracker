"use strict";
(() => {
  let installPrompt=null, waitingWorker=null, reloading=false;
  const standalone=()=>window.matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;
  const banner=document.createElement("section");banner.className="pwa-banner";banner.hidden=true;banner.setAttribute("aria-label","App installation and updates");
  const copy=document.createElement("div");copy.className="pwa-banner-text";
  const title=document.createElement("span");title.className="pwa-banner-title";
  const note=document.createElement("span");note.className="pwa-banner-note";copy.append(title,note);
  const action=document.createElement("button");action.type="button";
  const dismiss=document.createElement("button");dismiss.type="button";dismiss.className="pwa-dismiss";dismiss.textContent="x";dismiss.setAttribute("aria-label","Dismiss app message");
  banner.append(copy,action,dismiss);document.body.appendChild(banner);
  const offline=document.createElement("div");offline.className="pwa-offline";offline.setAttribute("role","status");offline.textContent="Offline - saved data only. Timer changes cannot sync to Netlify until you reconnect.";document.body.appendChild(offline);
  let installDismissed=false;
  try{installDismissed=sessionStorage.getItem("osrs-install-dismissed")==="true";}catch{}
  function connection(){offline.hidden=navigator.onLine;}
  connection();window.addEventListener("online",connection);window.addEventListener("offline",connection);
  function showUpdate(){title.textContent="App update ready";note.textContent="Wait for timer changes to show Synced before reloading.";action.textContent="Update";banner.hidden=false;}
  function showInstall(){if(!installPrompt||standalone()||installDismissed||waitingWorker)return;title.textContent="Install OSRS Tracker";note.textContent="Launch it from your home screen in its own app window.";action.textContent="Install";banner.hidden=false;}
  async function install(){
    if(!installPrompt){showInstructions();return;}
    const prompt=installPrompt;installPrompt=null;await prompt.prompt();const choice=await prompt.userChoice;if(choice.outcome==="accepted")banner.hidden=true;else{installDismissed=true;banner.hidden=true;}updateMenu();
  }
  function showInstructions(){
    const message=standalone()?"OSRS Tracker is already running as an installed app.":"Use your browser menu and choose Install app or Add to Home screen. On iPhone/iPad, open the site in Safari, use Share, then Add to Home Screen. Installation options vary by browser.";
    const element=document.getElementById("pwa-menu-note");if(element)element.textContent=message;else window.alert(message);
  }
  action.addEventListener("click",()=>{
    if(waitingWorker){if(window.confirm("Reload to install the app update? Make sure timer changes have synced first.")){reloading=true;waitingWorker.postMessage({type:"SKIP_WAITING"});}}
    else install().catch(()=>showInstructions());
  });
  dismiss.addEventListener("click",()=>{banner.hidden=true;if(!waitingWorker){installDismissed=true;try{sessionStorage.setItem("osrs-install-dismissed","true");}catch{}}});
  window.addEventListener("beforeinstallprompt",event=>{event.preventDefault();installPrompt=event;showInstall();updateMenu();});
  window.addEventListener("appinstalled",()=>{installPrompt=null;banner.hidden=true;updateMenu();});
  const more=location.pathname.split("/").pop()==="more.html";
  let menuButton=null;
  function updateMenu(){if(menuButton)menuButton.textContent=standalone()?"App installed":installPrompt?"Install OSRS Tracker":"Install / Home Screen Help";}
  if(more){const host=document.querySelector("main")||document.body;menuButton=document.createElement("button");menuButton.type="button";menuButton.className="pwa-menu-action";menuButton.addEventListener("click",()=>install().catch(showInstructions));const message=document.createElement("p");message.id="pwa-menu-note";message.className="pwa-menu-note";host.append(menuButton,message);updateMenu();}
  if(!("serviceWorker"in navigator)||!window.isSecureContext)return;
  navigator.serviceWorker.addEventListener("controllerchange",()=>{if(reloading)location.reload();});
  window.addEventListener("load",async()=>{
    try{
      // Same URL and scope as Netlify push: no second competing worker.
      const registration=await navigator.serviceWorker.register("/farm-sw.js",{scope:"/",updateViaCache:"none"});
      if(registration.waiting){waitingWorker=registration.waiting;showUpdate();}
      registration.addEventListener("updatefound",()=>{
        const incoming=registration.installing;if(!incoming)return;
        incoming.addEventListener("statechange",()=>{if(incoming.state==="installed"&&navigator.serviceWorker.controller){waitingWorker=registration.waiting||incoming;showUpdate();}});
      });
      registration.update().catch(()=>{});
    }catch(error){console.warn("PWA registration failed:",error);}
  });
})();
