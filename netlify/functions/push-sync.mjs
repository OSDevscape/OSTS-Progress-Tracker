import {db,json,configured,deviceKey,sameOrigin,validSubscription,cleanTimers,rateLimit} from "../lib/push.mjs";
export default async(request,context)=>{
  if(request.method!=="POST")return json({error:"Method not allowed"},405);
  if(!sameOrigin(request))return json({error:"Origin not allowed"},403);
  if(!configured())return json({error:"Push is not configured on this Netlify site."},503);
  if(Number(request.headers.get("content-length")||0)>60000)return json({error:"Request too large"},413);
  try{
    const key=deviceKey(request);
    if(!await rateLimit(request,context))return json({error:"Too many requests. Wait a minute."},429);
    const raw=await request.text();if(raw.length>60000)return json({error:"Request too large"},413);
    const body=JSON.parse(raw);
    if(!Number.isSafeInteger(body.version)||body.version<0)throw new Error("Invalid sync version.");
    if(!validSubscription(body.subscription))throw new Error("Unsupported or invalid push subscription.");
    const timers=cleanTimers(body.timers),store=db();
    for(let attempt=0;attempt<4;attempt++){
      const previous=await store.getWithMetadata(key,{type:"json",consistency:"strong"});
      if(previous?.data?.version>body.version)return json({ok:true,stale:true});
      const next={version:body.version,subscription:body.subscription,enabled:body.enabled===true,timers,updatedAt:Date.now(),expiresAt:Date.now()+14*86400000};
      const result=await store.setJSON(key,next,previous?{onlyIfMatch:previous.etag}:{onlyIfNew:true});
      if(result.modified)return json({ok:true,count:timers.length,syncedAt:new Date().toISOString()});
    }
    return json({error:"Sync conflict. Retry."},409);
  }catch(error){return json({error:error.message||"Sync failed"},400);}
};
