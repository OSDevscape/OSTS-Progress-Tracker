import {db} from "../lib/push.mjs";
export const config={schedule:"@daily"};
export default async()=>{
  const store=db(),deadline=Date.now()+23000;
  for(const prefix of ["rates/","delivery/","devices/"]){
    for await(const page of store.list({prefix,paginate:true})){
      for(let offset=0;offset<page.blobs.length;offset+=12){
        if(Date.now()>deadline)return;
        await Promise.all(page.blobs.slice(offset,offset+12).map(async blob=>{
          const data=await store.get(blob.key,{type:"json",consistency:"strong"});
          if(data?.expiresAt<Date.now())await store.delete(blob.key);
        }));
      }
    }
  }
};
