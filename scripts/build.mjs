import {mkdir,readdir,readFile,writeFile,copyFile,cp,access,rm,stat} from "node:fs/promises";
import path from "node:path";
import {createHash} from "node:crypto";
const root=process.cwd(),publish=path.join(root,"public");
for(const required of ["index.html","manifest.webmanifest","pwa.js","pwa.css","offline.html","farm-sw.js","icons/app-192.png","icons/app-512.png"]){
  try{await access(path.join(root,required));}catch{throw new Error("PWA build missing "+required+". Merge the full PWA update into the project root.");}
}
await rm(publish,{recursive:true,force:true});await mkdir(publish,{recursive:true});
const extensions=new Set([".html",".css",".js",".png",".svg",".ico",".webmanifest",".jpg",".jpeg",".webp",".gif",".avif",".woff",".woff2",".ttf"]);
for(const entry of await readdir(root,{withFileTypes:true})){
  if(entry.isFile()&&(extensions.has(path.extname(entry.name).toLowerCase())||["_headers","_redirects","robots.txt"].includes(entry.name)))await copyFile(path.join(root,entry.name),path.join(publish,entry.name));
}
for(const folder of ["assets","images","icons","fonts"]){
  try{await access(path.join(root,folder));}catch{continue;}
  await cp(path.join(root,folder),path.join(publish,folder),{recursive:true});
}
const tags=[
  '<link rel="manifest" href="/manifest.webmanifest">',
  '<meta name="theme-color" content="#3b3021">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-title" content="OSRS Tracker">',
  '<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">',
  '<link rel="icon" type="image/png" href="/icons/app-192.png">',
  '<link rel="stylesheet" href="/pwa.css">',
  '<script src="/pwa.js" defer></script>'
];
for(const entry of await readdir(publish,{withFileTypes:true})){
  if(!entry.isFile()||!entry.name.endsWith(".html")||entry.name==="generate-push-keys.html")continue;
  const filename=path.join(publish,entry.name);let html=await readFile(filename,"utf8");
  const additions=tags.filter(tag=>!html.includes(tag));
  if(!html.toLowerCase().includes("</head>"))throw new Error(entry.name+" has no closing head tag.");
  html=html.replace(/<\/head>/i,additions.join("\n")+"\n</head>");
  await writeFile(filename,html);
}
async function listFiles(directory,prefix=""){
  let files=[];
  for(const entry of await readdir(directory,{withFileTypes:true})){
    const relative=prefix+entry.name;
    if(entry.isDirectory())files.push(...await listFiles(path.join(directory,entry.name),relative+"/"));
    else files.push(relative);
  }
  return files;
}
const candidates=(await listFiles(publish)).sort();
const hash=createHash("sha256");const assets=[];
for(const relative of candidates){
  if(["farm-sw.js","generate-push-keys.html","_headers","_redirects","robots.txt"].includes(relative))continue;
  const file=path.join(publish,relative);if((await stat(file)).size>3*1024*1024)continue;
  hash.update(relative);hash.update(await readFile(file));assets.push("/"+relative);
}
const template=await readFile(path.join(root,"farm-sw.js"),"utf8");hash.update(template);
const version=hash.digest("hex").slice(0,16);
await writeFile(path.join(publish,"pwa-assets.json"),JSON.stringify({version,assets}));
await writeFile(path.join(publish,"farm-sw.js"),template.split("__BUILD_VERSION__").join(version));
let headers="";try{headers=await readFile(path.join(publish,"_headers"),"utf8");}catch{}
headers+='\n/farm-sw.js\n  Cache-Control: no-cache, no-store, must-revalidate\n  Service-Worker-Allowed: /\n/manifest.webmanifest\n  Content-Type: application/manifest+json\n  Cache-Control: no-cache\n/pwa-assets.json\n  Cache-Control: no-cache, no-store, must-revalidate\n';
await writeFile(path.join(publish,"_headers"),headers);
console.log("PWA build complete:",version,"with",assets.length,"precache resources.");
console.log("Manifest and install controls injected into public HTML. Netlify bundles functions separately.");
