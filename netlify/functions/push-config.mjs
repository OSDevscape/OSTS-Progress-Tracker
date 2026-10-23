import {json,configured} from "../lib/push.mjs";
export default async request=>request.method==="GET"?json({configured:configured(),publicKey:process.env.VAPID_PUBLIC_KEY||"",schedule:"every minute"}):json({error:"Method not allowed"},405);
