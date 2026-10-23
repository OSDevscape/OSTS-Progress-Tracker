import {db,configured,hash,sendPush} from "../lib/push.mjs";
export const config={schedule:"* * * * *"};
export default async()=>{
  if(process.env.CONTEXT&&process.env.CONTEXT!=="production")return;
  if(!configured()){console.warn("Push VAPID variables are missing.");return;}
  const store=db(),deadline=Date.now()+23000;let processed=0,sent=0;
  for await(const page of store.list({prefix:"devices/",paginate:true})){
    for(let offset=0;offset<page.blobs.length;offset+=8){
      if(Date.now()>deadline){console.warn("Dispatch time budget reached; remaining timers will be checked next minute.");return;}
      await Promise.all(page.blobs.slice(offset,offset+8).map(async blob=>{
        try{
          processed++;const device=await store.get(blob.key,{type:"json",consistency:"strong"});
          if(!device)return;
          if(device.expiresAt<Date.now()){await store.delete(blob.key);return;}
          if(!device.enabled)return;
          for(const timer of device.timers.filter(t=>t.endsAt<=Date.now())){
            if(Date.now()>deadline)return;
            const claimKey="delivery/"+hash(blob.key)+"/"+timer.revision;
            const previous=await store.getWithMetadata(claimKey,{type:"json",consistency:"strong"});
            if(previous?.data?.delivered||previous?.data?.leaseUntil>Date.now())continue;
            const claim=await store.setJSON(claimKey,{leaseUntil:Date.now()+90000,expiresAt:Date.now()+15*86400000},previous?{onlyIfMatch:previous.etag}:{onlyIfNew:true});
            if(!claim.modified)continue;
            const latest=await store.get(blob.key,{type:"json",consistency:"strong"});
            if(!latest?.enabled||!latest.timers.some(t=>t.revision===timer.revision)){await store.delete(claimKey);continue;}
            try{
              await sendPush(latest.subscription,{title:timer.label+" - time to check",body:timer.player+": your timer has finished. Check the activity in game.",tag:"osrs-farm-"+timer.id,player:timer.player,revision:timer.revision});
              await store.setJSON(claimKey,{delivered:true,expiresAt:Date.now()+15*86400000},{onlyIfMatch:claim.etag});sent++;
            }catch(error){
              if(error.statusCode===404||error.statusCode===410){
                const current=await store.getWithMetadata(blob.key,{type:"json",consistency:"strong"});
                if(current?.data?.subscription?.endpoint===latest.subscription.endpoint)await store.setJSON(blob.key,{...current.data,enabled:false},{onlyIfMatch:current.etag});
              }
              await store.setJSON(claimKey,{leaseUntil:Date.now()+60000,expiresAt:Date.now()+15*86400000},{onlyIfMatch:claim.etag});
              console.warn("Push attempt failed",error.statusCode||error.name);
            }
          }
        }catch(error){console.warn("Device dispatch failed",error.name);}
      }));
    }
  }
  console.log(JSON.stringify({processed,sent}));
};
