"use strict";
(() => {
const API_BASE = "https://api.wiseoldman.net/v2";
const WIKI_BASE = "https://oldschool.runescape.wiki";
const PROFILES_KEY = "osrs-saved-profiles-v1";
const PLAN_KEY = "osrs-training-plans-v1";
const ACTIVE_KEY = "osrs-active-profile-v1";
const HANDOFF_KEY = "osrs-profile-handoff-v1";
const PAGE = document.body.dataset.page;
const $ = id => document.getElementById(id);
const formatter = new Intl.NumberFormat("en-US");
const SKILLS = [
["attack","Attack","⚔️","#d3b573"],["defence","Defence","🛡️","#8bb6c7"],["strength","Strength","✊","#d6ad64"],["hitpoints","Hitpoints","❤️","#d77965"],["ranged","Ranged","🏹","#80b493"],["prayer","Prayer","✦","#ddd7b0"],["magic","Magic","🧙","#b49ad5"],["cooking","Cooking","🍳","#d7ae74"],["woodcutting","Woodcutting","🌳","#8dbb82"],["fletching","Fletching","🪶","#89b99a"],["fishing","Fishing","🐟","#8cb7d0"],["firemaking","Firemaking","🔥","#db9670"],["crafting","Crafting","🛠️","#bb9bd2"],["smithing","Smithing","🔨","#b9beb7"],["mining","Mining","⛏️","#b6b8ae"],["herblore","Herblore","🌿","#83b88d"],["agility","Agility","🏃","#8dbeb6"],["thieving","Thieving","🎭","#b99bd4"],["slayer","Slayer","💀","#d68c7e"],["farming","Farming","🌱","#92ba87"],["runecrafting","Runecrafting","🔮","#cfb575"],["hunter","Hunter","🐾","#b6a07b"],["construction","Construction","🏠","#d1b58e"],["sailing","Sailing","⛵","#80b9d0"]
];
const GUIDES = {
attack:"Pay-to-play Melee training",strength:"Pay-to-play Melee training",defence:"Pay-to-play Melee training",hitpoints:"Pay-to-play Hitpoints training",ranged:"Pay-to-play Ranged training",prayer:"Pay-to-play Prayer training",magic:"Pay-to-play Magic training",cooking:"Pay-to-play Cooking training",woodcutting:"Pay-to-play Woodcutting training",fletching:"Pay-to-play Fletching training",fishing:"Pay-to-play Fishing training",firemaking:"Pay-to-play Firemaking training",crafting:"Pay-to-play Crafting training",smithing:"Pay-to-play Smithing training",mining:"Pay-to-play Mining training",herblore:"Herblore training",agility:"Agility training",thieving:"Thieving training",slayer:"Slayer training",farming:"Farming training",runecrafting:"Pay-to-play Runecraft training",hunter:"Hunter training",construction:"Construction training",sailing:"Sailing training"
};
let currentPlayer = null, selectedSkill = null, busy = false;
let profiles = Object.create(null), plans = Object.create(null);
let wikiVersion = 0, wikiController = null;
let bosses = [];
const sectionCache = new Map();

function num(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
function fmt(value) { return value === null ? "—" : formatter.format(value); }
function dateText(value) {
  if (!value) return "Unknown";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
}
function spaces(value) {
  let result = "", previousSpace = true;
  for (const c of String(value)) {
    if (c.trim() === "") { if (!previousSpace) result += " "; previousSpace = true; }
    else { result += c; previousSpace = false; }
  }
  return result.trim();
}
function key(value) { return spaces(String(value || "").toLowerCase().split("_").join(" ")); }
function name(player) { return player.displayName || player.username || "Player"; }
function text(parent, tag, className, content) {
  const el = document.createElement(tag); el.className = className; el.textContent = content; parent.appendChild(el); return el;
}
function status(message, error = false, id) {
  const el = $(id || (PAGE === "gateway" ? "status" : "page-status"));
  if (el) { el.textContent = message; el.classList.toggle("error", error); }
}
function xpForLevel(level) {
  let points = 0;
  for (let i = 1; i < level; i++) points += Math.floor(i + 300 * Math.pow(2, i / 7));
  return Math.floor(points / 4);
}
const XP = Array.from({length:100}, (_, level) => level ? xpForLevel(level) : 0);
const XP99 = XP[99];
function baseLevel(xp) { if (xp === null) return null; let level = 1; while (level < 99 && xp >= XP[level + 1]) level++; return level; }
function parsePlayer(player) {
  const source = player?.latestSnapshot?.data?.skills;
  if (!source || typeof source !== "object") throw new Error("No saved skill snapshot exists. Open this player on Wise Old Man and update them there.");
  const parsed = SKILLS.map(([id,label,icon,color]) => {
    const metric = source[id], xp = num(metric?.experience), level = num(metric?.level), rank = num(metric?.rank);
    return {key:id,name:label,icon,color,xp,level:xp !== null ? baseLevel(xp) : level !== null ? Math.min(99,Math.floor(level)) : null,rank:rank !== null && rank > 0 ? rank : null};
  });
  if (!parsed.some(s => s.xp !== null || s.level !== null)) throw new Error("No recognized skill data was returned.");
  return parsed;
}
function totals(player, skills) {
  const overall = player.latestSnapshot.data.skills.overall;
  const sum = field => skills.every(s => s[field] !== null) ? skills.reduce((n,s) => n+s[field],0) : null;
  return {level:num(overall?.level) ?? sum("level"),xp:num(overall?.experience) ?? sum("xp")};
}
function progress(skill) { return skill.xp === null ? null : Math.min(100,skill.xp/XP99*100); }
function nextXp(skill) { return skill.xp === null || skill.level === null ? null : skill.level >= 99 ? 0 : Math.max(0,XP[skill.level+1]-skill.xp); }
function remaining(skill) { return skill.xp === null ? null : Math.max(0,XP99-skill.xp); }
function readStore(store, id) { try { return JSON.parse(store.getItem(id) || "null"); } catch { return null; } }
function restore() {
  let p = null, t = null;
  try { p = readStore(localStorage,PROFILES_KEY); t = readStore(localStorage,PLAN_KEY); } catch {}
  if (t && typeof t === "object" && !Array.isArray(t)) plans = Object.assign(Object.create(null),t);
  if (p && typeof p === "object" && !Array.isArray(p)) for (const entry of Object.values(p)) {
    try { parsePlayer(entry.player); const id = key(entry.player.username); if (id) profiles[id] = entry; } catch {}
  }
}
function saveProfiles() { try { localStorage.setItem(PROFILES_KEY,JSON.stringify(profiles)); return true; } catch { return false; } }
function savePlayer(player) {
  const id = key(player.username); if (!id) throw new Error("The player response is missing a username.");
  const entry = {player,fetchedAt:new Date().toISOString()}; profiles[id] = entry;
  try { sessionStorage.setItem(HANDOFF_KEY,JSON.stringify(entry)); } catch {}
  return saveProfiles();
}
function setActive(player) {
  try { localStorage.setItem(ACTIVE_KEY,player.username); } catch {}
  try { sessionStorage.setItem(ACTIVE_KEY,player.username); } catch {}
}
function activeName() {
  const query = new URLSearchParams(location.search).get("player");
  if (query) return query.trim();
  try { const value = sessionStorage.getItem(ACTIVE_KEY); if (value) return value; } catch {}
  try { return localStorage.getItem(ACTIVE_KEY) || ""; } catch { return ""; }
}
function pageUrl(page, username) { return page + (username ? "?player=" + encodeURIComponent(username) : ""); }
function openPlayer(player) { setActive(player); location.href = pageUrl("skills.html",player.username); }
function updateGatewayLink() {
  const username = $("username").value.trim(); $("player-link").hidden = !username;
  if (username) $("player-link").href = "https://wiseoldman.net/players/" + encodeURIComponent(username);
  else $("player-link").removeAttribute("href");
}
function renderSaved() {
  if (!$("saved-list")) return;
  const entries = Object.entries(profiles).sort(([,a],[,b]) => name(a.player).localeCompare(name(b.player)));
  $("saved-profiles").hidden = !entries.length;
  $("saved-count").textContent = entries.length + (entries.length === 1 ? " player" : " players");
  const fragment = document.createDocumentFragment();
  for (const [id,entry] of entries) {
    const player = entry.player, total = totals(player,parsePlayer(player));
    const card = document.createElement("article"); card.className = "saved-card";
    const header = document.createElement("div"); header.className = "saved-card-header";
    const info = document.createElement("div");
    text(info,"span","saved-name",name(player));
    text(info,"div","saved-meta","Total level " + fmt(total.level) + " · " + fmt(total.xp) + " XP");
    text(info,"div","saved-meta","Snapshot: " + dateText(player.latestSnapshot.createdAt));
    text(info,"div","saved-meta","Last checked: " + dateText(entry.fetchedAt));
    const remove = document.createElement("button"); remove.type="button"; remove.className="remove-profile"; remove.textContent="×"; remove.disabled=busy;
    remove.setAttribute("aria-label","Remove " + name(player));
    remove.addEventListener("click",() => {
      if (busy || !confirm("Remove " + name(player) + "? Training methods will be kept.")) return;
      delete profiles[id]; const stored = saveProfiles(); renderSaved(); status(stored ? "Saved player removed." : "Removed for this session; storage could not be updated.",!stored);
    });
    header.append(info,remove);
    const actions = document.createElement("div"); actions.className="saved-actions";
    const open = document.createElement("button"); open.type="button"; open.className="secondary-button"; open.textContent="Open"; open.disabled=busy;
    open.addEventListener("click",() => {
      if (busy) return;
      try { sessionStorage.setItem(HANDOFF_KEY,JSON.stringify(entry)); } catch {}
      openPlayer(player);
    });
    const update = document.createElement("button"); update.type="button"; update.className="secondary-button"; update.textContent="Update & Open"; update.disabled=busy;
    update.addEventListener("click",() => { if (busy) return; $("username").value=player.username; updateGatewayLink(); lookup(player.username); });
    actions.append(open,update); card.append(header,actions); fragment.appendChild(card);
  }
  $("saved-list").replaceChildren(fragment);
}
async function fetchPlayer(username) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(),20000);
  const headers = {Accept:"application/json"}; const apiKey = String(window.OSRS_CONFIG?.apiKey || "").trim();
  if (apiKey) headers["x-api-key"] = apiKey;
  try {
    const response = await fetch(API_BASE + "/players/" + encodeURIComponent(username),{headers,signal:controller.signal,cache:"no-store"});
    let data = null; try { data=await response.json(); } catch {}
    if (response.status===404) throw new Error("Player not found on Wise Old Man. Open their Wise Old Man page to start tracking.");
    if (response.status===429) throw new Error("Request limit reached. Wait before trying again.");
    if (response.status===401 || response.status===403) throw new Error("Wise Old Man refused the request. Check your API key.");
    if (!response.ok) throw new Error("Wise Old Man: " + (typeof data?.message === "string" ? data.message : "HTTP " + response.status));
    parsePlayer(data); if (!key(data.username)) throw new Error("The response is missing a username."); return data;
  } finally { clearTimeout(timer); }
}
function errorText(error) { return error.name==="AbortError" ? "The request timed out. Try again." : error instanceof TypeError ? "Could not connect. Check your network or browser console." : error.message || "Could not load data."; }
function setBusy(value) {
  busy=value;
  if (PAGE==="gateway") { $("lookup-button").disabled=value; $("lookup-button").textContent=value?"Loading…":"Look Up & Save"; $("username").disabled=value; document.querySelectorAll("#saved-list button").forEach(b=>b.disabled=value); }
  else { $("refresh-player").disabled=value; $("refresh-player").textContent=value?"Updating…":"↻ Update Stats"; $("change-player").disabled=value; }
}
async function lookup(username) {
  if (busy) return;
  try {
    setBusy(true); status("Loading " + username + "…");
    const player=await fetchPlayer(username); savePlayer(player); openPlayer(player);
  } catch(error) { status(errorText(error),true); }
  finally { setBusy(false); renderSaved(); }
}
function renderProfile(player) {
  const skills=parsePlayer(player), total=totals(player,skills); currentPlayer=player; setActive(player);
  $("player-name").textContent=name(player); $("snapshot-date").textContent="Snapshot: " + dateText(player.latestSnapshot.createdAt);
  $("total-level").textContent=fmt(total.level); $("total-xp").textContent=fmt(total.xp); $("settings-player").textContent=name(player); $("profile").hidden=false; $("open-settings").disabled=false;
  $("skills-link").href=pageUrl("skills.html",player.username); $("bossing-link").href=pageUrl("bossing.html",player.username);
  if (PAGE==="skills") renderSkills(skills); else renderBosses(player);
}
function renderSkills(skills) {
  const fragment=document.createDocumentFragment();
  for(const skill of skills) {
    const card=document.createElement("button"); card.type="button"; card.className="skill-card"; card.style.setProperty("--skill-color",skill.color);
    card.setAttribute("aria-haspopup","dialog"); card.setAttribute("aria-controls","skill-dialog"); card.setAttribute("aria-label",skill.name + ", level " + fmt(skill.level) + ". View details.");
    text(card,"span","skill-icon",skill.icon).setAttribute("aria-hidden","true"); text(card,"span","skill-name",skill.name); text(card,"span","skill-level",fmt(skill.level)); text(card,"span","skill-xp",skill.xp===null?"XP unavailable":fmt(skill.xp)+" XP");
    const track=document.createElement("div");track.className="card-track";track.setAttribute("aria-hidden","true");const fill=document.createElement("div");fill.className="card-fill";const levelProgress =
  skill.xp === null || skill.level === null ? 0 :
  skill.level >= 99 ? 100 :
  Math.max(0, Math.min(100,
    (skill.xp - XP[skill.level]) /
    (XP[skill.level + 1] - XP[skill.level]) * 100
  ));

fill.style.width = levelProgress + "%";track.appendChild(fill);card.appendChild(track);card.addEventListener("click",()=>openSkill(skill));fragment.appendChild(card);
  }
  $("skills").replaceChildren(fragment);
}
function openDialog(id) {
  const dialog=$(id); if (!dialog || typeof dialog.showModal!=="function") { status("This preview does not support dialogs. Open the page in a current browser.",true); return false; }
  if (!dialog.open) dialog.showModal(); dialog.scrollTop=0;document.body.classList.add("modal-open");return true;
}
function bindDialogs() {
  document.querySelectorAll("[data-close]").forEach(button=>button.addEventListener("click",()=>$(button.dataset.close).close()));
  document.querySelectorAll("dialog").forEach(dialog=>{
    dialog.addEventListener("close",()=>{
      document.body.classList.toggle("modal-open",!!document.querySelector("dialog[open]"));
      if (dialog.id==="skill-dialog") {cancelWiki();selectedSkill=null;}
    });
    dialog.addEventListener("click",event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();});
  });
}
async function loadPageProfile() {
  const username=activeName();
  if (!username) {location.replace("index.html");return;}
  const id=key(username);let entry=profiles[id];
  if (!entry) {
    try { const handoff=readStore(sessionStorage,HANDOFF_KEY); if (key(handoff?.player?.username)===id) {parsePlayer(handoff.player);entry=handoff;} } catch {}
  }
  if (entry) {renderProfile(entry.player);status("Saved snapshot · Last checked: " + dateText(entry.fetchedAt));return;}
  status("Loading " + username + "…");
  try {const player=await fetchPlayer(username);const stored=savePlayer(player);renderProfile(player);status(stored?"Latest available snapshot loaded.":"Loaded for this session; local storage is unavailable.",!stored);}
  catch(error){status(errorText(error)+" Return to the gateway to choose another player.",true);}
}
async function updateCurrent() {
  if(busy||!currentPlayer)return;
  try {
    setBusy(true);status("Updating snapshot…",false,"settings-status");const player=await fetchPlayer(currentPlayer.username);const stored=savePlayer(player);renderProfile(player);
    const message=stored?"Latest available snapshot loaded and saved.":"Loaded for this session; storage could not be updated.";
    status(message,!stored);status(message,!stored,"settings-status");
  }catch(error){status(errorText(error)+" Existing data has been kept.",true,"settings-status");}
  finally{setBusy(false);}
}

/* Bossing */
const BOSS_NAMES={
chambers_of_xeric:"Chambers of Xeric",chambers_of_xeric_challenge_mode:"Chambers of Xeric: Challenge Mode",theatre_of_blood:"Theatre of Blood",theatre_of_blood_hard_mode:"Theatre of Blood: Hard Mode",tombs_of_amascut:"Tombs of Amascut",tombs_of_amascut_expert:"Tombs of Amascut: Expert Mode",the_gauntlet:"The Gauntlet",the_corrupted_gauntlet:"The Corrupted Gauntlet",tzkal_zuk:"TzKal-Zuk",tztok_jad:"TzTok-Jad",the_fractured_archive:"The Fractured Archive",dagannoth_rex:"Dagannoth Rex",dagannoth_prime:"Dagannoth Prime",dagannoth_supreme:"Dagannoth Supreme"
};
function metricTitle(value) {return BOSS_NAMES[value]||String(value).split("_").map(word=>word?word[0].toUpperCase()+word.slice(1):"").join(" ");}
function renderBosses(player) {
  const source=player.latestSnapshot?.data?.bosses||{};
  bosses=Object.entries(source).map(([id,metric])=>{const rank=num(metric?.rank);return {id,name:metricTitle(id),kills:num(metric?.kills),rank:rank!==null&&rank>0?rank:null};}).sort((a,b)=>a.name.localeCompare(b.name));
  $("bossing-content").hidden=false;
  filterBosses();
}
const RAID_NAMES = new Set([
  "chambers of xeric",
  "chambers of xeric challenge mode",
  "theatre of blood",
  "theatre of blood hard mode",
  "tombs of amascut",
  "tombs of amascut expert mode",
  "the fractured archive"
]);
function normalizedEncounterName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function filterBosses() {
  const query=$("boss-search").value.trim().toLowerCase(),filter=$("boss-filter").value;
  const isRaidEncounter=b=>RAID_NAMES.has(normalizedEncounterName(b.name));
  const summaryEncounters=filter==="raids"?bosses.filter(isRaidEncounter):bosses;
  const known=summaryEncounters.filter(b=>b.kills!==null);
  const total=known.reduce((sum,b)=>sum+b.kills,0);
  const withCompletions=known.filter(b=>b.kills>0).length;
  const unavailable=summaryEncounters.length-known.length;
  $("boss-heading").textContent=filter==="raids"?"Raids":"Bossing";
  $("boss-note").textContent=filter==="raids"
    ?"Open a raid encounter for combat information, strategies and your manually tracked Collection Log."
    :"Open an encounter for combat information, strategies and your manually tracked Collection Log.";
  $("boss-summary").textContent=filter==="raids"
    ?"You've completed "+fmt(total)+" raid"+(total===1?"":"s")+" across "+fmt(withCompletions)+" encounter"+(withCompletions===1?"":"s")+". "+(unavailable===0
      ?"No other raid completion counts are currently available."
      :fmt(unavailable)+" raid completion count"+(unavailable===1?" is":"s are")+" currently unavailable.")+" Raid variants are tracked separately."
    :fmt(total)+" reported completions across "+withCompletions+" encounters with a positive count. "+unavailable+" encounter counts unavailable. Variants are listed separately.";
  const visible=bosses.filter(b=>{
    const matchesQuery=b.name.toLowerCase().includes(query);
    const isRaid=isRaidEncounter(b);
    const matchesFilter=filter==="all"||(filter==="raids"&&isRaid)||(filter==="recorded"&&b.kills!==null&&b.kills>0)||(filter==="unavailable"&&b.kills===null);
    return matchesQuery&&matchesFilter;
  });
  const fragment=document.createDocumentFragment();
  for(const boss of visible){const card=document.createElement("button");card.type="button";card.className="boss-card";card.setAttribute("aria-haspopup","dialog");card.setAttribute("aria-controls","boss-dialog");text(card,"span","boss-name",boss.name);text(card,"span","boss-count",boss.kills===null?"Unavailable":fmt(boss.kills));text(card,"span","boss-rank",boss.rank===null?"Rank unavailable":"Rank #"+fmt(boss.rank));card.addEventListener("click",()=>openBoss(boss));fragment.appendChild(card);}
  $("boss-list").replaceChildren(fragment);$("boss-empty").hidden=visible.length>0;
}
function openBoss(boss) {
  $("boss-title").textContent=boss.name;$("boss-detail-count").textContent=fmt(boss.kills);$("boss-detail-rank").textContent=boss.rank===null?"—":"#"+fmt(boss.rank);
  $("boss-detail-note").textContent=boss.kills===null?"No available completion count in this snapshot. This does not prove the encounter has never been completed.":"Completions recorded in the snapshot dated "+dateText(currentPlayer.latestSnapshot.createdAt)+".";
  const url=new URL("/w/Special:Search",WIKI_BASE);url.searchParams.set("search",boss.name);$("boss-wiki-link").href=url.toString();openDialog("boss-dialog");
}

/* Skill details and selected methods */
function planId(){return key(currentPlayer?.username||currentPlayer?.displayName)+":"+selectedSkill.key;}
function currentPlan(){if(!selectedSkill)return null;const plan=plans[planId()];return plan&&typeof plan==="object"?plan:null;}
function savePlans(){try{localStorage.setItem(PLAN_KEY,JSON.stringify(plans));$("plan-save-status").textContent="";return true;}catch{$("plan-save-status").textContent="Storage could not be updated. Method details are available for this session only.";return false;}}
function openSkill(skill){
  cancelWiki();selectedSkill=skill;const percent=progress(skill),percentText=percent===null?"—":percent.toFixed(1)+"%",next=nextXp(skill),left=remaining(skill);
  $("sheet-icon").textContent=skill.icon;$("sheet-title").textContent=skill.name;$("sheet-subtitle").textContent="Level "+fmt(skill.level)+" · "+fmt(skill.xp)+" XP";
  $("detail-level").textContent=fmt(skill.level);$("detail-level").style.color=skill.color;$("detail-xp").textContent=fmt(skill.xp);$("detail-rank").textContent=skill.rank===null?"—":"#"+fmt(skill.rank);$("detail-next").textContent=skill.level===99?"Maxed":fmt(next);
  $("road-xp").textContent=fmt(skill.xp);$("road-remaining").textContent=fmt(left);$("road-percent").textContent=percentText;$("road-status").textContent=skill.level===null?"Unavailable":skill.level===99?"Level 99 achieved":"Level "+skill.level;
  $("progress-ring").style.setProperty("--progress",(percent??0)+"%");$("ring-label").textContent=percent===null?"—":Math.round(percent)+"%";$("progress-fill").style.width=(percent??0)+"%";$("progress-caption").textContent=percent===null?"Progress unavailable":percentText+" to 99";
  if(percent===null)$("progress-track").removeAttribute("aria-valuenow");else $("progress-track").setAttribute("aria-valuenow",percent.toFixed(1));
  $("plan-level").textContent=fmt(skill.level)+" → 99";$("plan-next").textContent=skill.level===99?"Maxed":fmt(next);$("plan-remaining").textContent=fmt(left);$("plan-save-status").textContent="";
  $("method-content").replaceChildren();$("method-content").hidden=true;$("method-picker").hidden=true;$("method-view").hidden=true;
  if(!openDialog("skill-dialog"))return;
  if(currentPlan()?.method)showSelectedMethod();else showMethodPicker();
}
function wikiPageUrl(title,anchor=""){const url=new URL("/w/"+encodeURIComponent(String(title).split(" ").join("_")),WIKI_BASE);if(anchor)url.hash=anchor;return url.toString();}
function cancelWiki(){wikiVersion++;if(wikiController){wikiController.abort();wikiController=null;}}
function startWiki(){cancelWiki();const controller=new AbortController();wikiController=controller;const version=wikiVersion,id=planId(),timer=setTimeout(()=>controller.abort(),15000);return{signal:controller.signal,active(){return version===wikiVersion&&selectedSkill!==null&&planId()===id;},finish(){clearTimeout(timer);if(wikiController===controller)wikiController=null;}};}
async function wikiParse(parameters,signal){const url=new URL("/api.php",WIKI_BASE);url.search=new URLSearchParams({action:"parse",redirects:"1",format:"json",origin:"*",...parameters}).toString();const response=await fetch(url.toString(),{signal});if(!response.ok)throw new Error("Wiki returned HTTP "+response.status+".");const data=await response.json();if(data.error||!data.parse)throw new Error("The wiki section could not be loaded.");return data.parse;}
function plainTitle(value){return spaces(new DOMParser().parseFromString(String(value),"text/html").body.textContent||"");}
async function fetchSections(title,signal,force=false){if(!force&&sectionCache.has(title))return sectionCache.get(title);const data=await wikiParse({page:title,prop:"sections"},signal);if(!Array.isArray(data.sections))throw new Error("No wiki sections returned.");const result={title:data.title||title,sections:data.sections.map(s=>({title:plainTitle(s.line),anchor:s.anchor||"",index:String(s.index)}))};sectionCache.set(title,result);return result;}
// No regular expressions or backslashes in the level parser.
function levelRange(title){
  const tokens=[];let word="";function finish(){if(word){tokens.push(word);word="";}}
  for(const c of String(title).toLowerCase()){const n=c.charCodeAt(0);if((n>=97&&n<=122)||(n>=48&&n<=57))word+=c;else{finish();if(c==="-"||c==="–"||c==="—")tokens.push("-");else if(c==="+")tokens.push("+");}}finish();
  function read(value){if(!value)return null;for(const c of value){const n=c.charCodeAt(0);if(n<48||n>57)return null;}const n=Number(value);return Number.isInteger(n)&&n>=1&&n<=99?n:null;}
  for(let i=0;i<tokens.length;i++){if(tokens[i]!=="level"&&tokens[i]!=="levels")continue;const min=read(tokens[i+1]);if(min===null)continue;if(tokens[i+2]==="-"||tokens[i+2]==="to"){const max=read(tokens[i+3]);if(max===null||max<min)continue;return{min,max};}return{min,max:99};}return null;
}
function pickerMessage(message){const p=document.createElement("p");p.className="wiki-message";p.textContent=message;$("wiki-method-list").replaceChildren(p);}
function addMethodCard(guide,section,matching){
  const card=document.createElement("article");card.className="wiki-method"+(matching?" current":"");text(card,"span","wiki-method-tag",matching?"Level range includes your level":"Guide section · Check requirements");text(card,"div","wiki-method-title",section.title);
  const actions=document.createElement("div");actions.className="wiki-method-actions";const choose=document.createElement("button");choose.type="button";choose.className="secondary-button";choose.textContent="Choose Method";
  choose.addEventListener("click",()=>{if(!selectedSkill)return;plans[planId()]={method:section.title,guideTitle:guide,anchor:section.anchor,sectionIndex:section.index,wikiUrl:wikiPageUrl(guide,section.anchor)};savePlans();showSelectedMethod();$("method-title").focus({preventScroll:true});});
  const link=document.createElement("a");link.href=wikiPageUrl(guide,section.anchor);link.target="_blank";link.rel="noopener noreferrer";link.textContent="Read on Wiki ↗";actions.append(choose,link);card.appendChild(actions);$("wiki-method-list").appendChild(card);
}
async function showMethodPicker(){
  if(!selectedSkill)return;const skill=selectedSkill,title=GUIDES[skill.key],request=startWiki();$("method-view").hidden=true;$("method-picker").hidden=false;$("cancel-method-change").hidden=!currentPlan()?.method;$("wiki-guide-link").href=wikiPageUrl(title);$("wiki-level-note").textContent=skill.level===null?"Level unavailable. Browse the guide.":skill.name+" · Level "+skill.level;pickerMessage("Loading training methods…");
  try{const guide=await fetchSections(title,request.signal);if(!request.active())return;$("wiki-guide-link").href=wikiPageUrl(guide.title);const sections=guide.sections.map(s=>({...s,range:levelRange(s.title)}));const matches=skill.level===null?[]:sections.filter(s=>s.range&&skill.level>=s.range.min&&skill.level<=s.range.max);$("wiki-method-list").replaceChildren();if(matches.length){for(const s of matches)addMethodCard(guide.title,s,true);}else{pickerMessage("No explicit level-range heading matches. These general sections are not verified training methods.");const excluded=new Set(["references","navigation","see also","changes","trivia","contents"]);for(const s of sections.filter(s=>!s.range&&!excluded.has(s.title.toLowerCase())).slice(0,5))addMethodCard(guide.title,s,false);}}
  catch{if(request.active())pickerMessage("Could not load methods. Use the full guide link, or reopen the picker to retry.");}finally{request.finish();}
}
function methodReference(plan){let guideTitle=plan.guideTitle||GUIDES[selectedSkill.key],anchor=plan.anchor||"";if(plan.wikiUrl){try{const url=new URL(plan.wikiUrl);if(url.origin===WIKI_BASE){if(!plan.guideTitle&&url.pathname.startsWith("/w/"))guideTitle=decodeURIComponent(url.pathname.slice(3)).split("_").join(" ");if(!anchor&&url.hash)anchor=decodeURIComponent(url.hash.slice(1));}}catch{}}return{guideTitle,anchor};}
function validBlocks(blocks){
  if(!Array.isArray(blocks))return[];
  const strings=a=>Array.isArray(a)&&a.length<=500&&a.every(v=>typeof v==="string"&&v.length<=60000);
  return blocks.filter(b=>b&&(b.type==="loadout"?typeof b.caption==="string"&&strings(b.items):b.type==="table"?typeof b.caption==="string"&&strings(b.headers)&&Array.isArray(b.rows)&&b.rows.length<=500&&b.rows.every(strings)&&Array.isArray(b.sourceRows)&&b.sourceRows.length<=500&&b.sourceRows.every(r=>Array.isArray(r)&&r.length<=60&&r.every(c=>c&&typeof c.text==="string"&&Number.isInteger(c.rowspan)&&c.rowspan>=1&&c.rowspan<=500&&Number.isInteger(c.colspan)&&c.colspan>=1&&c.colspan<=60)):["paragraph","heading","item","row"].includes(b.type)&&typeof b.text==="string"&&b.text.trim())).slice(0,200);
}
function methodAssetLabel(value){const label=spaces(value||"").replace(/_/g," ");return /^(?:file:|image:|empty(?:\s|$)|blank(?:\s|$)|transparent(?:\s|$)|(?:equipment|inventory|worn equipment)\s+(?:slot|background)|(?:head|cape|neck|ammo|weapon|body|shield|legs|hands|feet|ring)\s+slot)/i.test(label)?"":label;}
function methodCellText(cell){
  const clone=cell.cloneNode(true);clone.querySelectorAll("script,style,.reference,.mw-editsection").forEach(n=>n.remove());
  clone.querySelectorAll(".sortkey").forEach(n=>{if(n.hidden||n.getAttribute("aria-hidden")==="true"||/display\s*:\s*none/i.test(n.getAttribute("style")||""))n.remove();});
  clone.querySelectorAll("img").forEach(img=>{const label=methodAssetLabel(img.closest("a")?.getAttribute("title"))||methodAssetLabel(img.getAttribute("alt"))||methodAssetLabel(img.getAttribute("title"));img.replaceWith(clone.ownerDocument.createTextNode(label?" "+label+" ":""));});
  clone.querySelectorAll("a").forEach(a=>{if(!spaces(a.textContent||"")){const label=methodAssetLabel(a.getAttribute("title"));if(label)a.textContent=" "+label+" ";}});
  clone.querySelectorAll("br").forEach(n=>n.replaceWith(clone.ownerDocument.createTextNode(" · ")));return spaces(clone.textContent||"");
}
function methodOwnRows(table){return Array.from(table.rows).filter(r=>r.closest("table")===table);}
function methodHasDataHeaders(table){return methodOwnRows(table).some(row=>{const headers=Array.from(row.cells).filter(c=>c.tagName==="TH").map(methodCellText).filter(Boolean);return headers.length>=2&&new Set(headers).size>=2;});}
function methodLayoutTable(table){if(methodHasDataHeaders(table))return false;return /(?:^|[\s_-])(?:inventory(?:table)?|equipment(?:table)?|worn-?equipment|invgrid|inv-grid)(?:$|[\s_-])/i.test(table.getAttribute("class")||"");}
function methodLoadout(table){
  const items=[],seen=new Set();const add=v=>{const label=spaces(v||"");if(label&&!seen.has(label)){seen.add(label);items.push(label);}};
  Array.from(table.querySelectorAll("td,th")).filter(c=>!c.querySelector("td,th")).forEach(c=>add(methodCellText(c)));
  if(!items.length)table.querySelectorAll("a[title],img").forEach(n=>add(n.tagName==="IMG"?methodAssetLabel(n.closest("a")?.getAttribute("title"))||methodAssetLabel(n.getAttribute("alt"))||methodAssetLabel(n.getAttribute("title")):methodAssetLabel(n.getAttribute("title"))));
  return{type:"loadout",caption:spaces(table.caption?.textContent||""),items:items.slice(0,500)};
}
function methodTableBlock(table){
  const input=methodOwnRows(table);if(!input.length||input.length>500)return null;
  const dataHeaders=methodHasDataHeaders(table),cells=input.flatMap(r=>Array.from(r.cells)),values=cells.map(methodCellText),empty=values.filter(v=>!v).length;
  if(!dataHeaders&&(methodLayoutTable(table)||table.querySelector("img")&&empty>cells.length*.4))return methodLoadout(table);
  if(values.every(v=>!v))return{type:"loadout",caption:spaces(table.caption?.textContent||""),items:[]};
  const grid=[],sourceRows=[],head=[];let complex=false;
  for(let y=0;y<input.length;y++){
    const cells=Array.from(input[y].cells);if(cells.length>60)return null;grid[y] ||= [];sourceRows[y]=[];head[y]=cells.length>0&&cells.every(c=>c.tagName==="TH");let x=0;
    for(const cell of cells){while(grid[y][x]!==undefined)x++;const rowspan=cell.rowSpan===0?input.length-y:Math.min(Math.max(1,cell.rowSpan),input.length-y),colspan=Math.max(1,cell.colSpan),value=methodCellText(cell);if(x+colspan>60)return null;
      sourceRows[y].push({text:value,heading:cell.tagName==="TH",rowspan,colspan});if(colspan>1&&!head[y])complex=true;
      for(let dy=0;dy<rowspan;dy++)for(let dx=0;dx<colspan;dx++){grid[y+dy] ||= [];if(grid[y+dy][x+dx]!==undefined)return null;grid[y+dy][x+dx]=value;}x+=colspan;
    }
  }
  const width=Math.max(...grid.map(r=>r.length));let count=0;while(count<input.length&&head[count])count++;
  const headers=Array.from({length:width},(_,x)=>{const parts=[];for(let y=0;y<count;y++){if(count>1&&sourceRows[y].length===1&&sourceRows[y][0].colspan===width)continue;const v=grid[y][x]||"";if(v&&!parts.includes(v))parts.push(v);}return parts.join(" · ");});
  const rows=grid.slice(count).map(r=>Array.from({length:width},(_,x)=>r[x]??""));if(!rows.length||grid.slice(count).some(r=>r.length!==width)||head.slice(count).some(Boolean))complex=true;
  let caption=spaces(table.caption?.textContent||"");if(!caption&&count>1&&sourceRows[0].length===1&&sourceRows[0][0].colspan===width)caption=sourceRows[0][0].text;
  return{type:"table",caption,headers,rows,sourceRows,layout:count&&headers.every(Boolean)&&!complex?"cards":"table"};
}
function methodMetricGroups(headers,excluded){
  const used=new Set(excluded),groups=[],isVariant=h=>/\(\s*(?:with\s+)?plank sack\s*\)/i.test(h),base=h=>spaces(h.replace(/\s*\(\s*(?:with\s+)?plank sack\s*\)\s*/ig," ")).toLowerCase();
  headers.forEach((label,i)=>{if(used.has(i))return;const mate=headers.findIndex((h,j)=>j!==i&&!used.has(j)&&base(h)===base(label)&&isVariant(h)!==isVariant(label));if(mate>=0){const a=isVariant(label)?mate:i,b=isVariant(label)?i:mate;groups.push({label:headers[a],indices:[a,b]});used.add(mate);}else groups.push({label,indices:[i]});used.add(i);});return groups;
}
function methodIdentityIndex(b){
  const choices=b.headers.map((h,i)=>({h,i})).filter(c=>/^(?:tier|item|name|location|method|fish|tree|ore|product|course|spell|furniture|contract|ensouled head|head|bones|ashes)(?:\b|\s|·)/i.test(c.h));if(!choices.length)return 0;
  return choices.sort((a,z)=>{const score=c=>b.rows.reduce((s,r)=>s+(r[c.i]&&!/^\d/.test(r[c.i])?1:0),0)+(/(?:^| · )price$/i.test(c.h)?-10000:0);return score(z)-score(a);})[0].i;
}
function methodLongText(value){const v=String(value||"").trim();return v.length>120||v.split(/\s+/).length>20;}
function methodBrief(value){
  const v=spaces(value||""),sentence=v.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim();if(sentence&&sentence.length<=72)return sentence;
  if(v.length<=72)return v;let brief=v.slice(0,69);const last=brief.lastIndexOf(" ");if(last>35)brief=brief.slice(0,last);return brief+"…";
}
let methodInfoDialog=null;
function methodOpenDetails(full,context){
  if(!methodInfoDialog){
    const dialog=document.createElement("dialog");dialog.id="method-info-dialog";dialog.className="method-info-dialog";dialog.setAttribute("aria-labelledby","method-info-title");
    const header=document.createElement("header");header.className="method-info-header";
    const heading=text(header,"h2","method-info-title","Method details");heading.id="method-info-title";
    const close=document.createElement("button");close.type="button";close.className="method-info-close";close.textContent="×";close.setAttribute("aria-label","Close method details");close.addEventListener("click",()=>dialog.close());header.append(close);
    const body=document.createElement("div");body.className="method-info-body";const label=text(body,"p","method-info-context","");label.id="method-info-context";const content=text(body,"div","method-info-text","");content.id="method-info-text";dialog.append(header,body);document.body.append(dialog);
    dialog.addEventListener("close",()=>document.body.classList.toggle("modal-open",!!document.querySelector("dialog[open]")));
    const skill=$("skill-dialog");if(skill)skill.addEventListener("close",()=>{if(dialog.open)dialog.close();});
    methodInfoDialog=dialog;
  }
  const label=methodInfoDialog.querySelector("#method-info-context");label.textContent=context?methodBrief(context):"";label.hidden=!label.textContent;
  methodInfoDialog.querySelector("#method-info-text").textContent=full;
  if(typeof methodInfoDialog.showModal!=="function")return;
  if(!methodInfoDialog.open)methodInfoDialog.showModal();methodInfoDialog.scrollTop=0;document.body.classList.add("modal-open");
}
function methodDisplayCell(parent,tag,className,value,context){
  const el=text(parent,tag,className,"");const full=String(value??"");
  if(!methodLongText(full)){el.textContent=full;return el;}
  text(el,"span","method-cell-brief",methodBrief(full));
  const button=document.createElement("button");button.type="button";button.className="method-details-button";button.setAttribute("aria-haspopup","dialog");button.setAttribute("aria-controls","method-info-dialog");button.setAttribute("aria-label","Read full method details");
  text(button,"span","method-details-label","Details ⓘ");text(button,"span","method-details-help","Tap to read");button.addEventListener("click",()=>methodOpenDetails(full,context||methodBrief(full)));el.append(button);return el;
}
function methodScrollHint(scroll,note){let frame=0;const update=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{note.hidden=scroll.scrollWidth<=scroll.clientWidth+2;});};update();if(typeof ResizeObserver!=="undefined"){const observer=new ResizeObserver(()=>{if(!scroll.isConnected){observer.disconnect();return;}update();});observer.observe(scroll);}}
function renderMethodTable(parent,b){
  const section=document.createElement("section");section.className="method-compare";if(b.caption)methodDisplayCell(section,"h4","method-compare-title",b.caption,"Table details");
  const scroll=document.createElement("div");scroll.className="method-compare-scroll";scroll.tabIndex=0;scroll.setAttribute("role","region");scroll.setAttribute("aria-label",b.caption?methodBrief(b.caption):"Training method comparison table");
  const table=document.createElement("table");table.className="method-compare-table";
  if(b.layout==="cards"){
    const identity=methodIdentityIndex(b),groups=methodMetricGroups(b.headers,[identity]),paired=groups.some(g=>g.indices.length===2),head=document.createElement("thead"),tr=document.createElement("tr");methodDisplayCell(tr,"th","method-compare-axis",b.headers[identity],"Column details").scope="col";
    for(const row of b.rows)methodDisplayCell(tr,"th","",row[identity]||"—",b.headers[identity]).scope="col";head.append(tr);table.append(head);
    const body=document.createElement("tbody");let variant=0;
    const draw=()=>{body.replaceChildren();for(const group of groups){const row=document.createElement("tr");methodDisplayCell(row,"th","method-compare-axis",group.label,"Metric details").scope="row";const index=group.indices[variant]??group.indices[0];for(const entry of b.rows)methodDisplayCell(row,"td","",entry[index]||"—",entry[identity]);body.append(row);}};
    if(paired){const controls=document.createElement("div");controls.className="method-compare-switch";controls.setAttribute("role","group");controls.setAttribute("aria-label","Equipment used for estimated rates");const buttons=[];
      ["Standard","Plank sack"].forEach((label,index)=>{const button=document.createElement("button");button.type="button";button.textContent=label;button.setAttribute("aria-pressed",String(index===0));button.addEventListener("click",()=>{variant=index;buttons.forEach((btn,i)=>btn.setAttribute("aria-pressed",String(i===index)));draw();});buttons.push(button);controls.append(button);});section.append(controls);text(section,"p","method-compare-hint","Switch equipment to compare rates. Figures without a matching variant stay unchanged.");}
    table.append(body);draw();
  }else{const body=document.createElement("tbody");for(const source of b.sourceRows){const tr=document.createElement("tr");for(const c of source){const cell=methodDisplayCell(tr,c.heading?"th":"td","",c.text,"Table details");cell.rowSpan=c.rowspan;cell.colSpan=c.colspan;}body.append(tr);}table.append(body);}
  scroll.append(table);section.append(scroll);const note=text(section,"p","method-compare-footnote","Scroll sideways to view more columns.");note.hidden=true;parent.append(section);methodScrollHint(scroll,note);
}
function renderMethodLoadout(parent,b){if(!b.items.length){text(parent,"p","method-loadout-note","This Wiki equipment or inventory diagram has no readable item labels. Use Read on Wiki to view it.");return;}const section=document.createElement("section");section.className="method-loadout";if(b.caption)methodDisplayCell(section,"h4","",b.caption,"Equipment details");const list=document.createElement("ul");list.className="method-loadout-items";b.items.forEach(item=>methodDisplayCell(list,"li","",item,"Equipment details"));section.append(list);parent.append(section);}
function renderBlocks(blocks){
  const fragment=document.createDocumentFragment();for(const b of validBlocks(blocks)){if(b.type==="table")renderMethodTable(fragment,b);else if(b.type==="loadout")renderMethodLoadout(fragment,b);else text(fragment,b.type==="heading"?"h4":"p",b.type==="item"?"method-list-item":b.type==="row"?"method-table-row":"",b.text);}$("method-content").replaceChildren(fragment);$("method-content").hidden=false;
  const note=document.querySelector(".method-attribution");if(note)note.textContent="From the linked OSRS Wiki section. Data tables are reformatted for comparison; equipment and inventory diagrams use available item labels. Open Details for full descriptions, or Read on Wiki for the source.";
}
function extractBlocks(html,title){
  const root=new DOMParser().parseFromString(html,"text/html").body;root.querySelectorAll("script,style,noscript,iframe,form,nav,.mw-editsection,.reference,.reflist,.navbox,.toc,.metadata,.noprint").forEach(n=>n.remove());const blocks=[];let count=0;
  for(const node of root.querySelectorAll("h2,h3,h4,h5,h6,p,li,table")){
    const tag=node.tagName.toLowerCase();if(node.parentElement?.closest("table"))continue;if(tag==="p"&&node.closest("li"))continue;let block;
    if(tag==="table")block=methodTableBlock(node)||{type:"paragraph",text:"This table could not be displayed reliably. Use Read on Wiki for the complete table."};
    else{let type="paragraph",value="";if(tag==="li"){const clone=node.cloneNode(true);clone.querySelectorAll("ul,ol,table").forEach(n=>n.remove());value=spaces(clone.textContent||"");type="item";}else{value=spaces(node.textContent||"");if(tag.startsWith("h")){type="heading";if(value===title)continue;}}if(!value)continue;block={type,text:value};}
    const length=block.type==="table"||block.type==="loadout"?JSON.stringify(block).length:block.text.length;if(blocks.length>=180||count+length>250000){blocks.push({type:"paragraph",text:"Additional content is available in the full wiki section."});break;}
    const previous=blocks[blocks.length-1];if(block.type!=="table"&&block.type!=="loadout"&&previous?.type===block.type&&previous.text===block.text)continue;blocks.push(block);count+=length;
  }
  if(!blocks.length){const value=spaces(root.textContent||"");if(value)blocks.push({type:"paragraph",text:value.slice(0,12000)});}return blocks;
}
async function showSelectedMethod(force=false){
  const plan=currentPlan();if(!plan?.method){showMethodPicker();return;}const request=startWiki(),id=planId(),reference=methodReference(plan),cached=validBlocks(plan.contentBlocks);
  $("method-picker").hidden=true;$("method-view").hidden=false;$("method-title").textContent=plan.method;$("method-source-link").href=wikiPageUrl(reference.guideTitle,reference.anchor);$("retry-method").hidden=true;$("refresh-method").hidden=true;$("method-content-status").className="wiki-message";
  if(cached.length&&!force&&plan.methodTableVersion===4){renderBlocks(cached);$("method-subtitle").textContent="Saved wiki details · "+dateText(plan.contentFetchedAt);$("method-content-status").textContent="";$("refresh-method").hidden=false;request.finish();return;}
  if(cached.length)renderBlocks(cached);else{$("method-content").replaceChildren();$("method-content").hidden=true;}
  $("method-subtitle").textContent="OSRS Wiki training guide";$("method-content-status").textContent=cached.length?"Refreshing details…":"Loading method details…";
  try{const guide=await fetchSections(reference.guideTitle,request.signal,force);if(!request.active())return;let section=guide.sections.find(s=>reference.anchor&&s.anchor===reference.anchor)||guide.sections.find(s=>s.title===plan.method);if(!section)throw new Error("This section may have moved. Use Change Method to choose its current version.");const data=await wikiParse({page:guide.title,prop:"text",section:section.index},request.signal);if(!request.active())return;const html=typeof data.text==="string"?data.text:data.text?.["*"];if(typeof html!=="string")throw new Error("No readable section content returned.");const blocks=extractBlocks(html,section.title);if(!blocks.length)throw new Error("This section has no readable text. Open it on the wiki.");const updated={...plan,method:section.title,guideTitle:guide.title,anchor:section.anchor,sectionIndex:section.index,wikiUrl:wikiPageUrl(guide.title,section.anchor),contentBlocks:blocks,methodTableVersion:4,contentFetchedAt:new Date().toISOString()};plans[id]=updated;const stored=savePlans();renderBlocks(blocks);$("method-title").textContent=updated.method;$("method-source-link").href=updated.wikiUrl;$("method-subtitle").textContent=(stored?"Wiki details saved · ":"Wiki details loaded · ")+dateText(updated.contentFetchedAt);$("method-content-status").textContent="";$("refresh-method").hidden=false;}
  catch(error){if(!request.active())return;$("method-content-status").className="wiki-message error";$("method-content-status").textContent=(cached.length?"Showing saved details. ":"")+errorText(error);$("retry-method").hidden=false;}finally{request.finish();}
}
function bindSkills(){
  $("change-method").addEventListener("click",()=>{$("plan-save-status").textContent="";showMethodPicker();});$("cancel-method-change").addEventListener("click",()=>showSelectedMethod());$("retry-method").addEventListener("click",()=>showSelectedMethod(true));$("refresh-method").addEventListener("click",()=>showSelectedMethod(true));
}
function bindGateway(){
  $("username").addEventListener("input",updateGatewayLink);
  $("lookup-form").addEventListener("submit",event=>{event.preventDefault();const username=$("username").value.trim();if(!username||username.length>12){status("Enter a username between 1 and 12 characters.",true);return;}updateGatewayLink();lookup(username);});
  updateGatewayLink();renderSaved();
}
function bindProfile(){
  bindDialogs();$("open-settings").addEventListener("click",()=>{status("",false,"settings-status");openDialog("settings-dialog");});$("refresh-player").addEventListener("click",updateCurrent);$("change-player").addEventListener("click",()=>{if(!busy)location.href="index.html";});
  if(PAGE==="skills")bindSkills();else{$("boss-search").addEventListener("input",filterBosses);$("boss-filter").addEventListener("change",filterBosses);}
  loadPageProfile().catch(error=>status(errorText(error),true));
}
restore();
if(PAGE==="gateway")bindGateway();else bindProfile();
window.addEventListener("pageshow",event=>{if(event.persisted){restore();if(PAGE==="gateway"){setBusy(false);renderSaved();}else loadPageProfile().catch(error=>status(errorText(error),true));}});
window.appReady=true;
})();