import {db,json,deviceKey,sameOrigin,rateLimit,sendPush} from "../lib/push.mjs";
export default async(request,context)=>{
  if(request.method!=="POST")return json({error:"Method not allowed"},405);
  if(!sameOrigin(request))return json({error:"Origin not allowed"},403);
  try{
    const key=deviceKey(request);
    if(!await rateLimit(request,context))return json({error:"Too many requests."},429);
    const data=await db().get(key,{type:"json",consistency:"strong"});
    if(!data?.subscription)return json({error:"Enable cloud notifications first."},404);
    await sendPush(data.subscription,{title:"OSRS Timers",body:"Netlify Web Push is connected to this device.",tag:"osrs-push-test",player:""});
    return json({ok:true});
  }catch(error){return json({error:"Test push failed. "+error.message},400);}
};
