"use strict";
/*
 * Client-side OSRS Wiki data used by the Quests and Achievement Diaries pages.
 * Everything is read from the public MediaWiki API (CORS enabled), cached in
 * localStorage, and degrades gracefully: when a request fails the pages still
 * work with RuneProfile data alone.
 */
(() => {
  const WIKI = "https://oldschool.runescape.wiki";
  const CACHE_PREFIX = "osrs-wiki-v2:";
  const DAY = 86400000;

  const SKILLS = ["Attack", "Defence", "Strength", "Hitpoints", "Ranged", "Prayer", "Magic", "Cooking", "Woodcutting", "Fletching", "Fishing", "Firemaking", "Crafting", "Smithing", "Mining", "Herblore", "Agility", "Thieving", "Slayer", "Farming", "Runecraft", "Hunter", "Construction", "Sailing"];
  const EMOJI = { Attack: "⚔️", Defence: "🛡️", Strength: "✊", Hitpoints: "❤️", Ranged: "🏹", Prayer: "✦", Magic: "🧙", Cooking: "🍳", Woodcutting: "🌳", Fletching: "🪶", Fishing: "🐟", Firemaking: "🔥", Crafting: "🛠️", Smithing: "🔨", Mining: "⛏️", Herblore: "🌿", Agility: "🏃", Thieving: "🎭", Slayer: "💀", Farming: "🌱", Runecraft: "🔮", Hunter: "🐾", Construction: "🏠", Sailing: "⛵" };
  const SKILL_SET = new Map(SKILLS.map(name => [name.toLowerCase(), name]));
  SKILL_SET.set("runecrafting", "Runecraft");

  const loose = value => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const clean = value => String(value || "").replace(/\[\s*(?:edit|\d+)\s*\]/gi, "").replace(/\s+/g, " ").trim();
  const skillName = value => SKILL_SET.get(String(value || "").trim().toLowerCase()) || "";

  /* ---------- cache ---------- */
  function cacheGet(key, ttl) {
    try {
      const raw = JSON.parse(localStorage.getItem(CACHE_PREFIX + key) || "null");
      if (raw && typeof raw.at === "number" && Date.now() - raw.at < ttl) return raw.value;
    } catch {}
    return null;
  }
  function cacheSet(key, value) {
    try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ at: Date.now(), value })); } catch {}
  }

  /* ---------- request queue (max 3 at once) ---------- */
  const queue = [];
  let running = 0;
  function pump() {
    while (running < 3 && queue.length) {
      const job = queue.shift();
      running++;
      job.run().then(job.resolve, job.reject).finally(() => { running--; pump(); });
    }
  }
  const schedule = run => new Promise((resolve, reject) => { queue.push({ run, resolve, reject }); pump(); });

  async function api(params) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const url = new URL("/api.php", WIKI);
      url.search = new URLSearchParams({ format: "json", formatversion: "2", origin: "*", ...params }).toString();
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error("Wiki HTTP " + response.status);
      const body = await response.json();
      if (body.error) throw new Error(body.error.info || body.error.code || "Wiki error");
      return body;
    } finally { clearTimeout(timer); }
  }

  async function parsePage(title) {
    const body = await schedule(() => api({ action: "parse", page: title, prop: "text", redirects: "1", disableeditsection: "1" }));
    const html = typeof body.parse?.text === "string" ? body.parse.text : body.parse?.text?.["*"];
    if (!html) throw new Error("Wiki page unavailable");
    return { title: body.parse.title || title, doc: new DOMParser().parseFromString(html, "text/html") };
  }

  const wikiLink = title => WIKI + "/w/" + encodeURIComponent(String(title).replace(/ /g, "_"));
  const skillIconUrl = skill => WIKI + "/w/Special:FilePath/" + encodeURIComponent(skill + "_icon.png");

  /* ---------- skill levels (from the Wise Old Man snapshot saved by the Skills page) ---------- */
  function xpForLevel(level) {
    let points = 0;
    for (let i = 1; i < level; i++) points += Math.floor(i + 300 * Math.pow(2, i / 7));
    return Math.floor(points / 4);
  }
  const XP = Array.from({ length: 100 }, (_, level) => (level ? xpForLevel(level) : 0));
  const levelFromXp = xp => { let level = 1; while (level < 99 && xp >= XP[level + 1]) level++; return level; };
  const playerKey = value => String(value || "").toLowerCase().split("_").join(" ").split(/\s+/).join(" ").trim();

  function levelsFromPlayer(player) {
    const skills = player && player.latestSnapshot && player.latestSnapshot.data && player.latestSnapshot.data.skills;
    if (!skills || typeof skills !== "object") return null;
    const map = new Map();
    for (const [id, metric] of Object.entries(skills)) {
      const name = skillName(id);
      if (!name || !metric) continue;
      const xp = Number(metric.experience);
      const level = Number(metric.level);
      if (Number.isFinite(xp) && xp >= 0) map.set(name, levelFromXp(xp));
      else if (Number.isFinite(level) && level > 0) map.set(name, Math.min(99, Math.floor(level)));
    }
    return map.size ? { map, at: player.latestSnapshot.createdAt || "" } : null;
  }

  async function skillLevels(player) {
    const result = { map: null, source: "", at: "" };
    if (!player) return result;
    try {
      const profiles = JSON.parse(localStorage.getItem("osrs-saved-profiles-v1") || "null");
      if (profiles && typeof profiles === "object") {
        const entry = Object.entries(profiles).find(([key, value]) => playerKey(key) === playerKey(player) || playerKey(value && value.player && value.player.username) === playerKey(player));
        const found = entry && levelsFromPlayer(entry[1].player);
        if (found) return { map: found.map, source: "saved", at: found.at };
      }
    } catch {}
    try {
      const headers = { Accept: "application/json" };
      const key = String((window.OSRS_CONFIG && window.OSRS_CONFIG.apiKey) || "").trim();
      if (key) headers["x-api-key"] = key;
      const response = await fetch("https://api.wiseoldman.net/v2/players/" + encodeURIComponent(player), { headers });
      if (response.ok) {
        const found = levelsFromPlayer(await response.json());
        if (found) return { map: found.map, source: "live", at: found.at };
      }
    } catch {}
    return result;
  }

  /* ---------- pills ---------- */
  function icon(skill) {
    const holder = document.createElement("span");
    holder.className = "rp-skill-icon";
    holder.setAttribute("aria-hidden", "true");
    const image = document.createElement("img");
    image.alt = "";
    image.loading = "lazy";
    image.decoding = "async";
    image.src = skillIconUrl(skill);
    image.addEventListener("error", () => { holder.textContent = EMOJI[skill] || "•"; }, { once: true });
    holder.append(image);
    return holder;
  }

  // Green when your level meets the requirement, red when below, neutral when unknown.
  function pill(skill, required, have, options = {}) {
    const el = document.createElement("span");
    const known = Number.isFinite(have);
    const ok = known && have >= required;
    el.className = "rp-lvl " + (!known ? "na" : ok ? "ok" : "bad");
    el.title = skill + " " + required + " required" + (known ? " · you have " + have : "") + (options.boostable ? " · boostable" : "");
    el.append(icon(skill));
    const label = document.createElement("span");
    label.textContent = known && !ok ? have + "/" + required : String(required);
    el.append(label);
    if (options.boostable) el.dataset.boostable = "true";
    return el;
  }

  /* ---------- sanitising wiki HTML ---------- */
  const DROP_TAGS = new Set(["script", "style", "iframe", "object", "embed", "form", "input", "button", "select", "textarea", "noscript", "meta", "link", "video", "audio", "svg"]);
  const ALLOWED = new Set(["p", "div", "span", "a", "img", "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "ul", "ol", "li", "dl", "dt", "dd", "strong", "b", "em", "i", "u", "s", "small", "sup", "sub", "br", "hr", "h2", "h3", "h4", "h5", "h6", "blockquote", "code", "figure", "figcaption"]);
  const DROP_SELECTOR = ".mw-editsection,.navbox,.metadata,.noprint,.toc,#toc,.reflist,.references,.mw-references-wrap,.printfooter,.catlinks,.mw-empty-elt,.hatnote,.dablink";

  function safeUrl(value, base) {
    if (!value) return "";
    try { const url = new URL(value, base || WIKI); return url.protocol === "https:" || url.protocol === "http:" ? url.href : ""; } catch { return ""; }
  }
  function wikiImage(value) {
    const href = safeUrl(value);
    try { return href && new URL(href).hostname === "oldschool.runescape.wiki" ? href : ""; } catch { return ""; }
  }

  function copyInto(source, parent) {
    if (source.nodeType === 3) { parent.append(document.createTextNode(source.nodeValue)); return; }
    if (source.nodeType !== 1) return;
    const tag = source.tagName.toLowerCase();
    if (DROP_TAGS.has(tag) || source.matches(DROP_SELECTOR)) return;
    if (source.hidden || /display\s*:\s*none/i.test(source.getAttribute("style") || "")) return;
    if (!ALLOWED.has(tag)) { for (const child of source.childNodes) copyInto(child, parent); return; }
    let target;
    if (tag === "img") {
      const url = wikiImage(source.getAttribute("src") || source.getAttribute("data-src"));
      if (!url) { const alt = source.getAttribute("alt"); if (alt) parent.append(document.createTextNode(alt.replace(/\s*icon$/i, ""))); return; }
      target = document.createElement("img");
      target.src = url;
      target.alt = source.getAttribute("alt") || "";
      target.loading = "lazy";
      target.decoding = "async";
      target.addEventListener("error", () => { target.hidden = true; }, { once: true });
    } else {
      target = document.createElement(tag);
      if (tag === "a") {
        const url = safeUrl(source.getAttribute("href"), WIKI);
        if (url) { target.href = url; target.target = "_blank"; target.rel = "noopener noreferrer"; }
      }
      for (const attribute of ["colspan", "rowspan"]) {
        const value = Number(source.getAttribute(attribute));
        if (value > 1 && value <= 50) target.setAttribute(attribute, String(value));
      }
      for (const child of source.childNodes) copyInto(child, target);
    }
    parent.append(target);
  }

  function sanitize(root) {
    const fragment = document.createDocumentFragment();
    for (const child of root.childNodes) copyInto(child, fragment);
    return fragment;
  }

  /* ---------- tables ---------- */
  function cellText(cell) {
    if (!cell) return "";
    const copy = cell.cloneNode(true);
    copy.querySelectorAll("sup,style,script,.reference,.mw-editsection").forEach(n => n.remove());
    copy.querySelectorAll("br").forEach(n => n.replaceWith(" "));
    return clean(copy.textContent);
  }

  function headerMap(table) {
    const rows = [...table.querySelectorAll("tr")].filter(row => row.closest("table") === table);
    for (let y = 0; y < Math.min(rows.length, 3); y++) {
      const cells = [...rows[y].children].filter(c => /^(TH|TD)$/.test(c.tagName));
      const labels = cells.map(cellText);
      if (labels.some(l => /^name$/i.test(l)) && labels.some(l => /^difficulty$/i.test(l))) return { rows, start: y + 1, labels };
    }
    return null;
  }

  /* ---------- quests ---------- */
  const DIFFICULTY_ORDER = ["Novice", "Intermediate", "Experienced", "Master", "Grandmaster", "Special"];
  const LENGTH_ORDER = ["Very Short", "Short", "Medium", "Long", "Very Long"];

  function readQuestTables(doc) {
    const out = [];
    for (const table of doc.querySelectorAll("table")) {
      const map = headerMap(table);
      if (!map) continue;
      const { labels } = map;
      const idx = re => labels.findIndex(l => re.test(l));
      const nameAt = idx(/^name$/i), diffAt = idx(/^difficulty$/i), lengthAt = idx(/^length$/i), seriesAt = idx(/^series$/i), releaseAt = idx(/^release/i);
      // The quest-point column has an icon instead of text; it follows Length.
      const pointsAt = lengthAt >= 0 && labels[lengthAt + 1] !== undefined && !/series|release/i.test(labels[lengthAt + 1]) ? lengthAt + 1 : -1;
      for (let y = map.start; y < map.rows.length; y++) {
        const cells = [...map.rows[y].children].filter(c => /^(TH|TD)$/.test(c.tagName));
        if (cells.length < labels.length - 1) continue;
        const name = cellText(cells[nameAt]);
        if (!name) continue;
        const difficulty = cellText(cells[diffAt]);
        const length = lengthAt >= 0 ? cellText(cells[lengthAt]) : "";
        const seriesRaw = seriesAt >= 0 ? cellText(cells[seriesAt]) : "";
        const seriesMatch = seriesRaw.match(/^(.*?)(?:,?\s*#\s*(\d+))?$/);
        const series = !seriesRaw || /^n\/?a$/i.test(seriesRaw) ? "" : clean(seriesMatch ? seriesMatch[1] : seriesRaw);
        out.push({
          name,
          difficulty: DIFFICULTY_ORDER.find(d => d.toLowerCase() === difficulty.toLowerCase()) || difficulty,
          length: LENGTH_ORDER.find(l => l.toLowerCase() === length.toLowerCase()) || length,
          points: pointsAt >= 0 ? Number((cellText(cells[pointsAt]).match(/\d+/) || [""])[0]) || 0 : 0,
          series,
          seriesNo: seriesMatch && seriesMatch[2] ? Number(seriesMatch[2]) : 0,
          release: releaseAt >= 0 ? cellText(cells[releaseAt]) : ""
        });
      }
    }
    return out;
  }

  let questListPromise = null;
  function questList(force = false) {
    if (!force) {
      const cached = cacheGet("quest-list", 7 * DAY);
      if (cached && cached.length) return Promise.resolve(cached);
    }
    if (!questListPromise) {
      questListPromise = (async () => {
        const main = readQuestTables((await parsePage("Quests/List")).doc);
        let mini = [];
        try { mini = readQuestTables((await parsePage("Miniquests")).doc); } catch {}
        const seen = new Set();
        const all = [];
        for (const quest of [...main, ...mini]) {
          const id = loose(quest.name);
          if (!id || seen.has(id)) continue;
          seen.add(id);
          all.push(quest);
        }
        if (!all.length) throw new Error("The quest table could not be read from the Wiki.");
        cacheSet("quest-list", all);
        return all;
      })();
      questListPromise.catch(() => { questListPromise = null; });
    }
    return questListPromise;
  }

  /* Skill requirements come from each quest's infobox ("requirements" field). */
  function parseRequirements(wikitext) {
    const start = /\|\s*requirements\s*=/i.exec(wikitext || "");
    if (!start) return [];
    const rest = wikitext.slice(start.index + start[0].length);
    let depth = 0, end = rest.length;
    for (let i = 0; i < rest.length; i++) {
      const pair = rest.substr(i, 2);
      if (pair === "{{") { depth++; i++; continue; }
      if (pair === "}}") { if (depth === 0) { end = i; break; } depth--; i++; continue; }
      if (depth === 0 && rest[i] === "\n" && /^\s*\|\s*[a-z_ ]+=/i.test(rest.slice(i + 1, i + 40))) { end = i; break; }
    }
    const block = rest.slice(0, end);
    const found = new Map();
    const pattern = /\{\{\s*SCP\s*\|\s*([A-Za-z ]+?)\s*\|\s*(\d{1,3})\s*((?:\|[^{}]*)?)\}\}/gi;
    let match;
    while ((match = pattern.exec(block))) {
      const skill = skillName(match[1]);
      const level = Number(match[2]);
      if (!skill || !(level > 1) || level > 120) continue;
      const boostable = /boostable\s*=\s*yes/i.test(match[3] || "");
      const old = found.get(skill);
      if (!old || level > old.level) found.set(skill, { level, boostable });
    }
    return [...found.entries()].map(([skill, v]) => [skill, v.level, v.boostable ? 1 : 0]);
  }

  async function requirementChunk(titles, useSection) {
    const params = { action: "query", prop: "revisions", rvprop: "content", rvslots: "main", titles: titles.join("|"), redirects: "1" };
    if (useSection) params.rvsection = "0";
    const body = await schedule(() => api(params));
    const query = body.query || {};
    const redirects = new Map();
    for (const list of [query.normalized || [], query.redirects || []]) for (const item of list) redirects.set(loose(item.from), item.to);
    const byTitle = new Map();
    for (const page of query.pages || []) {
      const content = page.revisions && page.revisions[0] && (page.revisions[0].slots && page.revisions[0].slots.main ? page.revisions[0].slots.main.content : page.revisions[0].content);
      if (typeof content === "string") byTitle.set(loose(page.title), content);
    }
    const out = {};
    for (const title of titles) {
      let target = title;
      for (let hop = 0; hop < 3 && redirects.has(loose(target)); hop++) target = redirects.get(loose(target));
      const content = byTitle.get(loose(target)) ?? byTitle.get(loose(title));
      if (typeof content === "string") out[loose(title)] = parseRequirements(content);
    }
    return out;
  }

  /* Returns Map(loose quest name -> [[skill, level, boostable], ...]); calls onProgress(done, total). */
  async function questRequirements(names, onProgress) {
    const cache = cacheGet("quest-reqs", 30 * DAY) || {};
    const missing = names.filter(name => !(loose(name) in cache));
    let done = names.length - missing.length;
    if (onProgress) onProgress(done, names.length);
    let useSection = true;
    let size = 40;
    let i = 0;
    while (i < missing.length) {
      const chunk = missing.slice(i, i + size);
      let result = null;
      try { result = await requirementChunk(chunk, useSection); } catch {}
      if ((!result || !Object.keys(result).length) && useSection) {
        // Some wikis reject section reads for several pages: retry the same pages whole, in small groups.
        useSection = false;
        size = 6;
        continue;
      }
      if (result) Object.assign(cache, result);
      i += chunk.length;
      done = names.filter(name => loose(name) in cache).length;
      if (onProgress) onProgress(done, names.length);
    }
    cacheSet("quest-reqs", cache);
    const map = new Map();
    for (const name of names) if (loose(name) in cache) map.set(loose(name), cache[loose(name)]);
    return map;
  }

  const guideCache = new Map();
  async function quickGuide(name) {
    if (guideCache.has(name)) return guideCache.get(name);
    const promise = (async () => {
      const page = await parsePage(name + "/Quick guide");
      const root = page.doc.querySelector(".mw-parser-output") || page.doc.body;
      const fragment = sanitize(root);
      const wrapper = document.createElement("div");
      wrapper.append(fragment);
      if (!clean(wrapper.textContent)) throw new Error("The quick guide is empty.");
      return { title: page.title, html: wrapper };
    })();
    guideCache.set(name, promise);
    promise.catch(() => guideCache.delete(name));
    return promise;
  }

  /* ---------- achievement diaries ---------- */
  const TIERS = ["Easy", "Medium", "Hard", "Elite"];

  function diaryTitle(area) {
    const base = clean(area).replace(/\s+diary$/i, "");
    return base + " Diary";
  }

  function readDiary(doc) {
    const root = doc.querySelector(".mw-parser-output") || doc.body;
    const out = { Easy: [], Medium: [], Hard: [], Elite: [] };
    let tier = "";
    for (const node of root.querySelectorAll("h2,h3,h4,table")) {
      if (/^H[2-4]$/.test(node.tagName)) {
        const match = /^(easy|medium|hard|elite)\b/i.exec(clean(node.textContent));
        if (match) tier = TIERS.find(t => t.toLowerCase() === match[1].toLowerCase());
        continue;
      }
      if (!tier || node.closest("table") !== node) continue;
      const rows = [...node.querySelectorAll("tr")].filter(row => row.closest("table") === node);
      let taskAt = -1, reqAt = -1, start = 0;
      for (let y = 0; y < Math.min(rows.length, 3); y++) {
        const labels = [...rows[y].children].filter(c => /^(TH|TD)$/.test(c.tagName)).map(cellText);
        const t = labels.findIndex(l => /^task$/i.test(l));
        const r = labels.findIndex(l => /^requirements?$/i.test(l));
        if (t >= 0) { taskAt = t; reqAt = r; start = y + 1; break; }
      }
      if (taskAt < 0) continue;
      for (let y = start; y < rows.length; y++) {
        const cells = [...rows[y].children].filter(c => /^(TH|TD)$/.test(c.tagName));
        const task = cellText(cells[taskAt]);
        if (!task || task.length < 4) continue;
        out[tier].push({ task, req: reqAt >= 0 ? cellText(cells[reqAt]) : "" });
      }
    }
    return out;
  }

  const diaryMemory = new Map();
  function diaryTasks(area, force = false) {
    const key = loose(area);
    if (!force) {
      if (diaryMemory.has(key)) return diaryMemory.get(key);
      const cached = cacheGet("diary:" + key, 14 * DAY);
      if (cached) { const resolved = Promise.resolve(cached); diaryMemory.set(key, resolved); return resolved; }
    }
    const promise = (async () => {
      const page = await parsePage(diaryTitle(area));
      const tasks = readDiary(page.doc);
      if (!TIERS.some(t => tasks[t].length)) throw new Error("No diary tasks were found on the Wiki page.");
      const value = { title: page.title, tasks };
      cacheSet("diary:" + key, value);
      return value;
    })();
    diaryMemory.set(key, promise);
    promise.catch(() => { if (diaryMemory.get(key) === promise) diaryMemory.delete(key); });
    return promise;
  }

  // Turn "Level 70 Slayer, 60 Herblore" style text into text nodes and skill pills.
  function requirementNodes(text, levels) {
    const fragment = document.createDocumentFragment();
    const skills = [...SKILL_SET.values()].join("|") + "|Runecrafting";
    const pattern = new RegExp("(\\d{1,3})\\s+(" + skills + ")\\b", "gi");
    let last = 0, match;
    const value = String(text || "");
    while ((match = pattern.exec(value))) {
      const skill = skillName(match[2]);
      const level = Number(match[1]);
      if (!skill || level < 1 || level > 120) continue;
      if (match.index > last) fragment.append(document.createTextNode(value.slice(last, match.index)));
      fragment.append(pill(skill, level, levels ? levels.get(skill) : undefined));
      last = match.index + match[0].length;
    }
    if (last < value.length) fragment.append(document.createTextNode(value.slice(last)));
    return fragment;
  }

  window.OSRSWiki = {
    WIKI, SKILLS, EMOJI, TIERS, DIFFICULTY_ORDER, LENGTH_ORDER,
    loose, clean, skillName, wikiLink, skillIconUrl,
    skillLevels, pill, icon, requirementNodes,
    questList, questRequirements, quickGuide, diaryTasks, diaryTitle,
    parsePage, sanitize, safeUrl, wikiImage, cacheGet, cacheSet,
    _test: { parseRequirements, readDiary, readQuestTables }
  };
})();
