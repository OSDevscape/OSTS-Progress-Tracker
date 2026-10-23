import {getStore} from "@netlify/blobs";
import webpush from "web-push";
import {createHash} from "node:crypto";
export function db(){return getStore("osrs-push-v1");}
export function hash(value){return createHash("sha256").update(value).digest("hex");}
export function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});}
export function configured(){return !!(process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY&&process.env.VAPID_SUBJECT);}
export function deviceKey(request){const header=request.headers.get("authorization")||"",value=header.slice(7);if(!header.startsWith("Bearer ")||!/^[a-f0-9]{64}$/.test(value))throw new Error("Invalid device credential.");return "devices/"+hash(value);}
export function sameOrigin(request){return request.headers.get("origin")===new URL(request.url).origin;}
export function validSubscription(subscription){
  if(!subscription||typeof subscription.endpoint!=="string")return false;
  let url;try{url=new URL(subscription.endpoint);}catch{return false;}
  const hosts=["fcm.googleapis.com","updates.push.services.mozilla.com","push.apple.com","notify.windows.com","wns.windows.com"];
  if(!hosts.some(host=>url.hostname===host||url.hostname.endsWith("."+host))||url.protocol!=="https:"||url.port||url.username||url.password||subscription.endpoint.length>2048)return false;
  const keys=subscription.keys;
  return typeof keys?.p256dh==="string"&&/^[A-Za-z0-9_-]{80,100}$/.test(keys.p256dh)&&typeof keys?.auth==="string"&&/^[A-Za-z0-9_-]{20,30}$/.test(keys.auth);
}
export async function rateLimit(request,context){
  const store=db(),bucket=Math.floor(Date.now()/60000),key="rates/"+hash(context.ip||"unknown")+"/"+bucket;
  for(let attempt=0;attempt<3;attempt++){
    const previous=await store.getWithMetadata(key,{type:"json",consistency:"strong"});
    const count=(previous?.data?.count||0)+1;if(count>120)return false;
    const result=await store.setJSON(key,{count,expiresAt:Date.now()+3600000},previous?{onlyIfMatch:previous.etag}:{onlyIfNew:true});
    if(result.modified)return true;
  }
  return false;
}
export function cleanTimers(input){
  if(!Array.isArray(input)||input.length>100)throw new Error("A device may schedule up to 100 active timers.");
  const now=Date.now();
  return input.map(timer=>{
    if(!timer||typeof timer.id!=="string"||timer.id.length>120||typeof timer.label!=="string"||timer.label.length>80||typeof timer.player!=="string"||timer.player.length>12||!Number.isSafeInteger(timer.endsAt)||timer.endsAt>now+8*86400000||timer.endsAt<now-86400000)throw new Error("Invalid timer data.");
    return{id:timer.id,label:timer.label,player:timer.player,endsAt:timer.endsAt,revision:hash(timer.id+":"+timer.endsAt)};
  });
}
export async function sendPush(subscription,payload){
  if(!configured())throw new Error("Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT in Netlify.");
  webpush.setVapidDetails(process.env.VAPID_SUBJECT,process.env.VAPID_PUBLIC_KEY,process.env.VAPID_PRIVATE_KEY);
  return webpush.sendNotification(subscription,JSON.stringify(payload),{TTL:3600,urgency:"normal",timeout:5000});
}
