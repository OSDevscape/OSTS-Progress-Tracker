"use strict";
/*
 * Item pop-up for the Collection Log page. It mirrors the Bossing page's item dialog:
 * item image, Wiki drop rate, collected state and quantity (tracked by hand, stored in the
 * same place as on Bossing), and the dry-streak calculator.
 * Public API: window.OSRSItems = { setImage(img, name), open({ name, log, tab, quantity, player }) }.
 */
(() => {
  const WIKI = "https://oldschool.runescape.wiki";
  const PROGRESS_PREFIX = "osrs-collection-log-v1:";
  const MAX_QUANTITY = Number.MAX_SAFE_INTEGER;

  /* ---------- markup (same structure as bossing.html) ---------- */
  const MARKUP = `
<dialog id="collection-item-dialog" aria-labelledby="collection-item-title" aria-describedby="collection-item-help">
  <header class="sheet-header">
    <div><h2 id="collection-item-title" class="sheet-title"></h2><p id="collection-item-context" class="sheet-subtitle"></p></div>
    <button class="close" type="button" data-close="collection-item-dialog" aria-label="Close item details">✕</button>
  </header>
  <div class="sheet-body">
    <div id="collection-item-art" class="collection-item-art"></div>
    <section id="collection-item-drop-rate" class="collection-drop-rate" aria-label="Wiki drop rate" aria-live="polite"></section>
    <p id="collection-item-state" class="collection-item-state"></p>
    <p id="collection-item-rp" class="collection-rp-line"></p>
    <p id="collection-item-date" class="collection-item-date"></p>
    <p id="collection-item-help" class="note">Manual tracking for the selected player. Saved on this browser/device only; not synced with RuneScape. The same item shares one quantity across its collection pages and the Bossing page. RuneProfile's quantity is used when it is higher.</p>
    <form id="collection-item-quantity-form" novalidate><label class="collection-quantity-label" for="collection-item-quantity">Quantity obtained</label>
      <div class="collection-quantity-controls"><button id="collection-item-minus" class="secondary-button" type="button" aria-label="Remove one item">−</button><input id="collection-item-quantity" type="number" min="0" step="1" inputmode="numeric" autocomplete="off" aria-describedby="collection-quantity-help" value="0"><button id="collection-item-plus" class="secondary-button" type="button" aria-label="Add one item">+</button></div>
      <p id="collection-quantity-help" class="collection-quantity-help">− / + saves immediately. For a typed number, choose Save quantity. Zero means uncollected; duplicates still fill only one collection slot.</p>
      <div class="collection-item-actions"><button id="collection-item-save" class="primary" type="submit">Save quantity</button></div>
    </form>
    <a id="collection-item-wiki" class="source-link" target="_blank" rel="noopener noreferrer">View item on OSRS Wiki</a>
    <p id="collection-item-message" class="collection-item-message" role="status" aria-live="polite"></p>
    <details id="dry-section" class="dry-section">
      <summary>Dry calculator</summary>
      <div class="dry-body"><div class="dry-heading"><h3>Dry calculator</h3><button id="dry-info" class="dry-info" type="button" aria-label="How dry streak works" aria-haspopup="dialog" aria-controls="dry-help-dialog">ⓘ</button></div>
        <p id="dry-context" class="note"></p>
        <form id="dry-form" novalidate>
          <label for="dry-rate">Drop chance</label><input id="dry-rate" type="text" placeholder="1/512" autocomplete="off" aria-describedby="dry-rate-help">
          <p id="dry-rate-help" class="note">Simple, unambiguous Wiki rates prefill here. You can override them. Use 1/512 or 512; basic arithmetic such as 1/(256*2) is supported.</p>
          <section id="raid-aware-panel" class="raid-aware-panel" hidden aria-labelledby="raid-aware-title">
            <h4 id="raid-aware-title">Raid-aware calculation</h4>
            <p class="note">Choose what your entered rate represents. If it is the item's share of the unique table, the calculator will apply supported raid mechanics to estimate your personal chance per completion.</p>
            <label for="raid-rate-kind">Rate entered above</label>
            <select id="raid-rate-kind"><option value="personal">Personal chance per raid</option><option value="unique-share">Item share of the unique table</option></select>
            <label for="raid-mode">Raid mode</label><select id="raid-mode"></select>
            <label for="raid-team-size">Team size</label><input id="raid-team-size" type="number" min="1" max="100" step="1" value="1" inputmode="numeric">
            <div id="raid-cox-fields" hidden><label for="raid-personal-points">Your personal reward points</label><input id="raid-personal-points" type="number" min="0" step="1" value="30000" inputmode="numeric"><label for="raid-group-points">Total team reward points</label><input id="raid-group-points" type="number" min="0" step="1" value="30000" inputmode="numeric"></div>
            <div id="raid-tob-fields" hidden><label for="raid-tob-share">Your estimated share of the team's unique chance (%)</label><input id="raid-tob-share" type="number" min="0" max="100" step="0.1" value="100" inputmode="decimal"></div>
            <div id="raid-toa-fields" hidden><label for="raid-level">Raid level</label><input id="raid-level" type="number" min="0" max="600" step="1" value="300" inputmode="numeric"><label for="raid-toa-personal">Your final reward points</label><input id="raid-toa-personal" type="number" min="0" step="1" value="25000" inputmode="numeric"><label for="raid-toa-total">Total team reward points</label><input id="raid-toa-total" type="number" min="0" step="1" value="25000" inputmode="numeric"></div>
            <label class="raid-eligible-label"><input id="raid-eligible" type="checkbox" checked> I am eligible to receive this reward</label>
            <p id="raid-aware-summary" class="note" role="status" aria-live="polite"></p>
          </section>
          <label for="dry-attempts">Kill count</label><input id="dry-attempts" type="number" min="0" step="1" inputmode="numeric" autocomplete="off">
          <button id="dry-use-kc" class="secondary-button dry-copy" type="button">Use boss completions</button>
          <label for="dry-drops">Drops obtained</label><input id="dry-drops" type="number" min="0" step="1" inputmode="numeric" autocomplete="off" value="0">
          <button id="dry-use-quantity" class="secondary-button dry-copy" type="button">Use saved item quantity</button>
          <button class="primary dry-calculate" type="submit">Calculate</button>
        </form>
        <p id="dry-message" class="dry-message" role="status" aria-live="polite"></p>
        <section id="dry-streak-card" class="dry-streak-card" aria-live="polite" hidden><div class="dry-card-header"><h3 id="dry-card-title">Dry streak</h3><span id="dry-status" class="dry-status"></span></div><div class="dry-kills"><strong id="dry-count"></strong><span id="dry-count-label"></span></div><div id="dry-meter-wrap"><div id="dry-meter" class="dry-track" role="meter" aria-label="Drop-rate multiple" aria-valuemin="0" aria-valuemax="4"><span class="dry-dot" aria-hidden="true"></span></div><div class="dry-scale" aria-hidden="true"><span>0</span><span>1×</span><span>2×</span><span>3×</span><span>4×+</span></div></div><p id="dry-tail"></p><p id="dry-caveat" class="dry-caveat"></p></section>
        <details id="dry-details" hidden><summary>Detailed probabilities</summary><div id="dry-results" class="dry-results" hidden></div></details>
        <p class="note">Calculator inputs do not change your collection quantities or the displayed Wiki reference rate. Use successful drop events, not units in a stack. Shared items, multiple reward rolls and changing rates may require adjusted inputs or a different model.</p>
        <div class="dry-source-links"><a id="dry-item-source" class="source-link" target="_blank" rel="noopener noreferrer">Item drop sources</a><a class="source-link" href="https://oldschool.runescape.wiki/w/Calculator:Dry_calc" target="_blank" rel="noopener noreferrer">Wiki dry calculator</a><a class="source-link" href="https://oldschool.runescape.wiki/w/Module:Dry_calc" target="_blank" rel="noopener noreferrer">Calculator code and flavour text: OSRS Wiki</a></div>
      </div>
    </details>
  </div>
</dialog>
<dialog id="dry-help-dialog" aria-labelledby="dry-help-title"><h2 id="dry-help-title">How dry streak works</h2><p>Your dry streak compares the attempts without the selected item with how often that item is expected to drop.</p><div class="dry-help-box"><h3>What counts as a drop</h3><p>This calculator uses the specific item and drop chance you selected or entered—not every unique from the boss. Use successful drop events, not units in a stack.</p></div><div class="dry-help-box"><h3>Your odds</h3><p id="dry-help-odds">Calculate a result to see your selected odds here.</p><div id="dry-equation" class="dry-equation"></div></div><ul class="dry-legend"><li><i style="--swatch:var(--border)"></i>Under odds<small>Below 1×</small></li><li><i style="--swatch:#d7ad4e"></i>Dry<small>1× to &lt;2×</small></li><li><i style="--swatch:#c77d35"></i>Very dry<small>2× to &lt;3×</small></li><li><i style="--swatch:#ac5849"></i>Bone dry<small>3× and up</small></li></ul><div class="dry-help-box"><h3>Manual tracking</h3><p>Use attempts since your last drop and zero drops obtained to describe a dry streak. Boss completions are lifetime totals, not automatically tracked streaks. With drops obtained above zero, the result describes overall drop luck instead.</p></div><p>Every independent attempt is a fresh roll. Being dry does not make your next drop more likely. Changing rates or multiple reward rolls may need a different model.</p><button id="dry-help-close" class="primary" type="button" autofocus>Got it</button></dialog>`;
  document.body.insertAdjacentHTML("beforeend", MARKUP);

  const $ = id => document.getElementById(id);
  const itemDialog = $("collection-item-dialog");
  const key = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
  const node = (tag, cls, text) => { const n = document.createElement(tag); n.className = cls || ""; if (text !== undefined) n.textContent = text; return n; };
  const clean = n => (n && n.textContent || "").replace(/\s+/g, " ").replace(/\[edit\]/gi, "").trim();
  const source = t => WIKI + "/w/" + encodeURIComponent(String(t).replace(/ /g, "_"));
  const safeURL = (v, b = WIKI) => { if (!v) return ""; try { const u = new URL(v, b); return /^https?:$/.test(u.protocol) ? u.href : ""; } catch { return ""; } };
  const imageURL = v => { const u = safeURL(v); try { return u && new URL(u).hostname === "oldschool.runescape.wiki" ? u : ""; } catch { return ""; } };
  const link = (t, u, c = "source-link") => { const n = node("a", c, t); n.href = u; n.target = "_blank"; n.rel = "noopener noreferrer"; return n; };
  const picture = (u, a) => { const n = document.createElement("img"); n.src = u; n.alt = a; n.loading = "lazy"; n.decoding = "async"; n.addEventListener("error", () => { n.hidden = true; }, { once: true }); return n; };

  itemDialog.querySelector("[data-close]").addEventListener("click", () => itemDialog.close());
  itemDialog.addEventListener("click", e => { if (e.target !== itemDialog) return; const b = itemDialog.getBoundingClientRect(); if (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom) itemDialog.close(); });

  /* ---------- wiki pages ---------- */
  const wikiPages = new Map();
  async function fetchPageNetwork(title) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20000);
    try {
      const url = new URL("/api.php", WIKI);
      url.search = new URLSearchParams({ action: "parse", page: title, prop: "text", redirects: "1", format: "json", origin: "*", disableeditsection: "1" });
      const r = await fetch(url, { signal: controller.signal });
      if (!r.ok) throw new Error("Wiki HTTP " + r.status);
      const p = await r.json(), html = typeof p.parse?.text === "string" ? p.parse.text : p.parse?.text?.["*"];
      if (p.error || !html) throw new Error("Wiki page unavailable");
      return { title: p.parse.title || title, doc: new DOMParser().parseFromString(html, "text/html") };
    } finally { clearTimeout(timer); }
  }
  function fetchPage(title, force = false) {
    const id = String(title);
    if (force) wikiPages.delete(id);
    if (!wikiPages.has(id)) {
      if (wikiPages.size >= 24) wikiPages.delete(wikiPages.keys().next().value);
      const p = fetchPageNetwork(title);
      wikiPages.set(id, p);
      p.catch(() => { if (wikiPages.get(id) === p) wikiPages.delete(id); });
    }
    return wikiPages.get(id);
  }

  /* ---------- item images: one request for the whole Collection log wiki page, then cached ---------- */
  const ART_KEY = "osrs-item-art-v1";
  let artMap = null;
  let artPromise = null;
  function loadStoredArt() {
    try {
      const saved = JSON.parse(localStorage.getItem(ART_KEY) || "null");
      if (saved && Date.now() - saved.at < 30 * 86400000 && saved.map && Object.keys(saved.map).length > 50) return new Map(Object.entries(saved.map).map(([k, v]) => [k, WIKI + v]));
    } catch {}
    return null;
  }
  function collectionArt() {
    if (artMap) return Promise.resolve(artMap);
    if (!artPromise) {
      const stored = loadStoredArt();
      if (stored) { artMap = stored; artPromise = Promise.resolve(stored); return artPromise; }
      artPromise = fetchPage("Collection log").then(({ doc }) => {
        const map = new Map();
        for (const td of doc.querySelectorAll("td")) {
          const url = imageURL(td.querySelector("img")?.getAttribute("src"));
          if (!url) continue;
          for (const a of td.querySelectorAll('a[href^="/w/"]')) {
            const text = clean(a), title = a.getAttribute("title");
            if (text) map.set(key(text), url);
            if (title) map.set(key(title), url);
          }
        }
        artMap = map;
        try {
          const compact = {};
          for (const [k, v] of map) if (v.startsWith(WIKI)) compact[k] = v.slice(WIKI.length);
          localStorage.setItem(ART_KEY, JSON.stringify({ at: Date.now(), map: compact }));
        } catch {}
        return map;
      });
      artPromise.catch(() => { artPromise = null; });
    }
    return artPromise;
  }
  const fileUrl = name => {
    const file = String(name).trim().replace(/^./, c => c.toUpperCase()).replace(/ /g, "_") + ".png";
    return WIKI + "/w/Special:FilePath/" + encodeURIComponent(file);
  };
  // Sets an <img> to the item's wiki image, falling back to its file name when the Collection log table has no entry.
  function setImage(img, name, onFail) {
    const apply = map => {
      const url = map && map.get(key(name));
      img.addEventListener("error", () => {
        if (!img.dataset.fallback) { img.dataset.fallback = "1"; img.src = fileUrl(name); }
        else { img.hidden = true; if (onFail) onFail(); }
      });
      img.src = url || fileUrl(name);
    };
    if (artMap) apply(artMap);
    else collectionArt().then(apply, () => apply(null));
  }

  /* ---------- manually tracked quantities (same store as Bossing) ---------- */
  const normalPlayer = v => String(v || "").replace(/_/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  const itemKey = v => String(v).replace(/\s+/g, " ").trim().toLowerCase();
  const progressKey = p => PROGRESS_PREFIX + encodeURIComponent(p);
  function validateQuantity(v) { if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0) throw new Error("Enter a whole-number quantity of 0 or more."); return v; }
  function parseQuantity(v) { const t = String(v).trim(); if (!/^\d+$/.test(t)) throw new Error("Enter a whole-number quantity of 0 or more."); return validateQuantity(Number(t)); }
  function quantityOf(s, n) { return s?.items[itemKey(n)]?.quantity || 0; }
  function readProgress(profile) {
    if (!profile) throw new Error("No active player is selected.");
    const raw = localStorage.getItem(progressKey(profile));
    if (raw === null) return { schema: 2, profile, items: Object.create(null) };
    let v; try { v = JSON.parse(raw); } catch { throw new Error("Saved collection data could not be read. It has not been overwritten."); }
    if (![1, 2].includes(v?.schema) || v.profile !== profile || !v.items || typeof v.items !== "object" || Array.isArray(v.items)) throw new Error("Saved collection data has an unsupported format. It has not been overwritten.");
    const items = Object.create(null);
    for (const [n, e] of Object.entries(v.items)) {
      if (!e || typeof e !== "object" || Array.isArray(e)) throw new Error("Saved item data is invalid. It has not been overwritten.");
      const quantity = e.quantity === undefined && v.schema === 1 && typeof e.collectedAt === "string" ? 1 : validateQuantity(e.quantity);
      if (quantity > 0) { items[n] = { quantity }; if (typeof e.collectedAt === "string") items[n].collectedAt = e.collectedAt; if (typeof e.updatedAt === "string") items[n].updatedAt = e.updatedAt; }
    }
    return { schema: 2, profile, items };
  }
  function saveQuantity(profile, name, quantity) {
    validateQuantity(quantity);
    const s = readProgress(profile), id = itemKey(name), old = s.items[id], now = new Date().toISOString();
    if (quantity > 0) s.items[id] = { quantity, collectedAt: old?.collectedAt || now, updatedAt: now }; else delete s.items[id];
    localStorage.setItem(progressKey(profile), JSON.stringify(s));
    return s;
  }
  function snapshot(profile) { try { return { state: readProgress(profile), error: "" }; } catch (e) { return { state: null, error: e.message || "Collection storage is unavailable." }; } }

  /* ---------- kill counts from the saved Wise Old Man snapshot ---------- */
  function killsFor(player, log) {
    try {
      const profiles = JSON.parse(localStorage.getItem("osrs-saved-profiles-v1") || "null");
      if (!profiles) return "";
      const want = normalPlayer(player);
      const entry = Object.entries(profiles).find(([k, v]) => normalPlayer(k) === want || normalPlayer(v?.player?.username) === want);
      const bosses = entry?.[1]?.player?.latestSnapshot?.data?.bosses;
      if (!bosses) return "";
      const slugs = name => {
        const base = String(name).toLowerCase();
        const a = base.replace(/'/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
        const b = base.replace(/'/g, "_").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
        return [a, b, a.replace(/^the_/, ""), b.replace(/^the_/, "")];
      };
      const special = { "the fight caves": ["tztok_jad"], "the inferno": ["tzkal_zuk"], "fortis colosseum": ["sol_heredit"], "moons of peril": ["lunar_chests"], "barrows chests": ["barrows_chests"], "dagannoth kings": ["dagannoth_rex", "dagannoth_prime", "dagannoth_supreme"] };
      const names = special[String(log).toLowerCase()] || String(log).split(/ and |, /i);
      let total = 0, found = false;
      for (const part of names) {
        for (const id of slugs(part)) {
          const kills = Number(bosses[id]?.kills);
          if (Number.isFinite(kills) && kills >= 0) { total += kills; found = true; break; }
        }
      }
      return found ? String(total) : "";
    } catch { return ""; }
  }

  /* ---------- wiki drop rates ---------- */
  const rateName = v => String(v || "").toLowerCase().replace(/^the\s+/, "").replace(/[^a-z0-9]/g, "");
  function rateSources(log) {
    const aliases = {
      obor: ["Obor", "Chest (Obor's lair)"], bryophyta: ["Bryophyta", "Bryophyta Members", "Bryophyta F2P", "Chest (Bryophyta's lair)"],
      fightcaves: ["TzTok-Jad", "Fight Caves"], inferno: ["TzKal-Zuk", "Inferno"], fortiscolosseum: ["Sol Heredit", "Fortis Colosseum", "Rewards Chest (Fortis Colosseum)"],
      barrowschests: ["Barrows chest", "Chest (Barrows)", "Barrows"], moonsofperil: ["Lunar Chest", "Moons of Peril"], gauntlet: ["The Gauntlet", "Crystalline Hunllef"],
      corruptedgauntlet: ["The Corrupted Gauntlet", "Corrupted Hunllef"]
    };
    const parts = String(log).split(/ and |, /i);
    return new Set([log, ...parts, ...(aliases[rateName(log)] || [])].map(rateName));
  }
  const plainCell = cell => { if (!cell) return ""; const c = cell.cloneNode(true); c.querySelectorAll("sup,.mw-editsection,script,style").forEach(n => n.remove()); return clean(c); };
  function readRates(payload, log) {
    const root = payload.doc.querySelector(".mw-parser-output") || payload.doc.body;
    const expected = rateSources(log);
    const matched = [], every = [];
    for (const table of root.querySelectorAll("table")) {
      const rows = [...table.querySelectorAll("tr")].filter(r => r.closest("table") === table);
      if (rows.length > 3000) continue;
      let header = null, start = -1;
      for (let y = 0; y < Math.min(rows.length, 4); y++) {
        const labels = [...rows[y].children].filter(c => /^(TH|TD)$/.test(c.tagName)).map(plainCell);
        const s = labels.findIndex(l => /^Source$/i.test(l)), r = labels.findIndex(l => /^(Rarity|Drop rate|Drop chance)$/i.test(l));
        if (s >= 0 && r >= 0) { header = { s, r, q: labels.findIndex(l => /^Quantity$/i.test(l)), n: labels.length }; start = y; break; }
      }
      if (!header) continue;
      for (let y = start + 1; y < rows.length; y++) {
        const cells = [...rows[y].children].filter(c => /^(TH|TD)$/.test(c.tagName));
        if (cells.length !== header.n) continue;
        const sourceName = plainCell(cells[header.s]);
        const rate = plainCell(cells[header.r]);
        if (!sourceName || !rate) continue;
        const entry = { source: sourceName, rate, quantity: header.q >= 0 ? plainCell(cells[header.q]) : "", url: source(payload.title) };
        const names = [sourceName, ...[...cells[header.s].querySelectorAll("a[title]")].map(a => a.getAttribute("title"))];
        (names.some(n => expected.has(rateName(n))) ? matched : every).push(entry);
      }
    }
    const dedupe = list => [...new Map(list.map(r => [JSON.stringify([r.source, r.rate, r.quantity]), r])).values()];
    return { rows: dedupe(matched), others: dedupe(every) };
  }
  function fixedListedRate(text) {
    const t = String(text).trim().replace(/,/g, "");
    if (/^(always|guaranteed)$/i.test(t)) return { value: 1, input: "1/1" };
    let m = t.match(/^(\d+(?:\.\d+)?|\.\d+)\s*\/\s*(\d+(?:\.\d+)?|\.\d+)$/), p, input;
    if (m) { p = Number(m[1]) / Number(m[2]); input = m[1] + "/" + m[2]; }
    else if ((m = t.match(/^(\d+(?:\.\d+)?|\.\d+)\s*%$/))) { p = Number(m[1]) / 100; input = m[1] + "%"; }
    else return null;
    return Number.isFinite(p) && p > 0 && p <= 1 ? { value: p, input } : null;
  }
  const complexLog = log => /chambers|theatre|tombs|barrows|gauntlet|tempoross|wintertodt|zalcano|mokhaiotl|colosseum|fortis|lunar|moons|dukesucellus|vardorvis|leviathan|whisperer|fractured/.test(rateName(log));

  let itemContext = null;
  let itemRequest = 0;
  const rateCurrent = request => itemDialog.open && request === itemRequest && !!itemContext;
  function resetDropRate() { const root = $("collection-item-drop-rate"); root.replaceChildren(node("span", "collection-rate-label", "Drop rate"), node("p", "collection-rate-value", "Loading Wiki rate…")); }

  async function showDropRate(name, log, request, force = false) {
    if (request !== itemRequest) return;
    resetDropRate();
    const root = $("collection-item-drop-rate");
    let page = null, failed = false, result = { rows: [], others: [] };
    try { page = await fetchPage(name, force); result = readRates(page, log); } catch { failed = true; }
    if (!rateCurrent(request)) return;
    root.replaceChildren(node("span", "collection-rate-label", "Drop rate"));
    let rows = result.rows, approximate = false;
    if (!rows.length && result.others.length) { rows = result.others.slice(0, 6); approximate = true; }
    if (!rows.length) {
      root.append(node("p", "collection-rate-value", failed ? "Unable to load Wiki rate" : "No matching rate found"), node("p", "collection-rate-note", "No drop-table entry was matched for " + name + " from " + log + ". The item may belong to another boss in this shared log, use a reward page, or have special unlock conditions."));
      const retry = node("button", "secondary-button collection-rate-retry", "Retry rate lookup"); retry.type = "button";
      retry.addEventListener("click", () => showDropRate(name, log, request, true));
      root.append(retry, link("Check item source", source(page?.title || name)));
      return;
    }
    const fixed = rows.length === 1 && !approximate ? fixedListedRate(rows[0].rate) : null;
    const auto = fixed && !complexLog(log) ? fixed.input : null;
    const listed = [...new Set(rows.map(r => r.rate))];
    root.append(node("p", "collection-rate-value", listed.length === 1 ? listed[0] : "Multiple listed rates"));
    if (fixed) root.append(node("p", "collection-rate-note", "Approximately " + (100 * fixed.value).toLocaleString("en-US", { maximumFractionDigits: 6 }) + "% per eligible roll."));
    if (approximate) root.append(node("p", "collection-rate-note", "None of the Wiki's sources matched " + log + " exactly, so these are the sources it lists for this item. Check which one applies."));
    else if (!auto) root.append(node("p", "collection-rate-note", "Listed rate / conditions to verify. Not automatically applied to the calculator."));
    for (const row of rows.slice(0, 12)) {
      const entry = node("div", "collection-rate-entry");
      entry.append(node("p", "collection-rate-note", (rows.length > 1 ? row.rate + " — " : "") + "Source: " + row.source + (row.quantity ? " · Quantity per drop: " + row.quantity : "")), link("Wiki rate source", row.url));
      root.append(entry);
    }
    if (auto) {
      const use = node("button", "secondary-button collection-rate-retry", "Use Wiki rate in calculator"); use.type = "button";
      use.addEventListener("click", () => { const input = $("dry-rate"); input.value = auto; input.dispatchEvent(new Event("input", { bubbles: true })); $("dry-section").open = true; });
      root.append(use);
    }
    itemDialog.dispatchEvent(new CustomEvent("collection:wiki-rate", { detail: { item: name, boss: log, profile: itemContext.profile, input: auto } }));
  }

  /* ---------- quantity editing ---------- */
  const quantityInput = $("collection-item-quantity"), quantityMinus = $("collection-item-minus"), quantityPlus = $("collection-item-plus"), quantitySave = $("collection-item-save"), itemMessage = $("collection-item-message");
  quantityInput.max = String(MAX_QUANTITY);
  const message = (t, error = false) => { itemMessage.textContent = t; itemMessage.classList.toggle("error", error); };
  function updateQuantityButtons() {
    let draft = null; try { draft = parseQuantity(quantityInput.value); } catch {}
    const enabled = !!itemContext?.editable;
    quantityInput.disabled = !enabled; quantitySave.disabled = !enabled;
    quantityMinus.disabled = !enabled || draft === null || draft === 0;
    quantityPlus.disabled = !enabled || draft === null || draft >= MAX_QUANTITY;
  }
  function refreshItemModal() {
    if (!itemContext) return;
    const snap = snapshot(itemContext.profile), entry = snap.state?.items[itemKey(itemContext.name)], tracked = quantityOf(snap.state, itemContext.name);
    const rp = itemContext.rpQuantity || 0, shown = Math.max(tracked, rp), collected = shown > 0;
    itemContext.savedQuantity = tracked;
    itemContext.editable = !!snap.state;
    const label = $("collection-item-state");
    label.textContent = !snap.state && !rp ? "Status unavailable" : collected ? "Collected · Quantity " + shown.toLocaleString() : "Not collected · Quantity 0";
    label.classList.toggle("is-collected", collected);
    $("collection-item-rp").textContent = "RuneProfile: " + rp.toLocaleString() + " · Tracked by hand: " + tracked.toLocaleString();
    quantityInput.value = snap.state ? String(tracked) : "";
    updateQuantityButtons();
    const date = entry?.collectedAt ? new Date(entry.collectedAt) : null;
    $("collection-item-date").textContent = date && !Number.isNaN(date.getTime()) ? "First marked collected by hand: " + date.toLocaleString() : "";
    return snap;
  }
  function commitQuantity(delta = null) {
    if (!itemContext) return;
    try {
      const draft = parseQuantity(quantityInput.value), fresh = readProgress(itemContext.profile);
      const q = delta === null ? draft : validateQuantity((quantityInput.value === String(itemContext.savedQuantity) ? quantityOf(fresh, itemContext.name) : draft) + delta);
      saveQuantity(itemContext.profile, itemContext.name, q);
      refreshItemModal();
      message("Quantity saved: " + q.toLocaleString() + " on this device.");
      window.dispatchEvent(new Event("rp-manual-changed"));
    } catch (e) { message((e.message || "Could not save quantity.") + " No change was saved.", true); updateQuantityButtons(); }
  }
  $("collection-item-quantity-form").addEventListener("submit", e => { e.preventDefault(); commitQuantity(); });
  quantityMinus.addEventListener("click", () => commitQuantity(-1));
  quantityPlus.addEventListener("click", () => commitQuantity(1));
  quantityInput.addEventListener("input", () => { updateQuantityButtons(); message("Unsaved quantity — choose Save quantity or use − / + to save it."); });
  itemDialog.addEventListener("close", () => { itemRequest++; const origin = itemContext && itemContext.origin; itemContext = null; document.body.classList.toggle("modal-open", !!document.querySelector("dialog[open]")); if (origin && origin.isConnected) origin.focus({ preventScroll: true }); });
  itemDialog.addEventListener("collection:request-quantity", () => {
    if (!itemContext) return;
    const snap = snapshot(itemContext.profile);
    itemDialog.dispatchEvent(new CustomEvent("collection:quantity-value", { detail: { quantity: Math.max(snap.state ? quantityOf(snap.state, itemContext.name) : 0, itemContext.rpQuantity || 0) } }));
  });

  function openItem({ name, log, tab, quantity, player, origin }) {
    const profile = normalPlayer(player);
    itemContext = { name, tab, profile, origin, rpQuantity: quantity || 0, savedQuantity: 0, editable: false };
    const request = ++itemRequest;
    $("collection-item-title").textContent = name;
    $("collection-item-context").textContent = [log, tab].filter((v, i, a) => v && a.indexOf(v) === i).join(" · ") + " · " + (player || "No active player");
    $("collection-item-wiki").href = source(name);
    const art = $("collection-item-art");
    art.replaceChildren(node("span", "muted", "Loading image…"));
    resetDropRate();
    message("");
    const snap = refreshItemModal();
    if (snap && snap.error) message(snap.error, true);
    if (!itemDialog.open) itemDialog.showModal();
    document.body.classList.add("modal-open");
    itemDialog.dispatchEvent(new CustomEvent("collection:item-open", { detail: { item: name, collection: tab, profile, quantity: Math.max(quantityOf(snap?.state, name), quantity || 0), boss: log, killsText: killsFor(player, log), itemURL: source(name) } }));
    showDropRate(name, log, request);
    const img = document.createElement("img");
    img.alt = name;
    art.replaceChildren(img);
    setImage(img, name, () => { if (request === itemRequest) art.replaceChildren(node("span", "muted", "Image unavailable")); });
  }

  /* ---------- dry calculator (ported from the Bossing page) ---------- */
  const dialog = itemDialog, form = $("dry-form");
  function expr(input) { let t = String(input).replace(/,/g, "").trim(); if (!t || t.length > 512) return null; if (/^\s*(?:\d+(?:\.\d*)?|\.\d+)\s*%\s*$/.test(t)) t = "(" + t.replace(/%\s*$/, "") + ")/100"; const tokens = []; let offset = 0; while (offset < t.length) { if (/\s/.test(t[offset])) { offset++; continue; } const m = t.slice(offset).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i); if (m) { tokens.push(Number(m[0])); offset += m[0].length; } else if ("+-*/%^()".includes(t[offset])) tokens.push(t[offset++]); else return null; if (tokens.length > 256) return null; } let i = 0, depth = 0; function primary() { if (++depth > 64) throw Error(); let v; if (tokens[i] === "(") { i++; v = add(); if (tokens[i++] !== ")") throw Error(); } else { v = tokens[i++]; if (typeof v !== "number") throw Error(); } depth--; return v; } function power() { let v = primary(); if (tokens[i] === "^") { i++; v = Math.pow(v, unary()); } return v; } function unary() { if (++depth > 64) throw Error(); let v; if (tokens[i] === "+") { i++; v = unary(); } else if (tokens[i] === "-") { i++; v = -unary(); } else v = power(); depth--; return v; } function multiply() { let v = unary(); while (["*", "/", "%"].includes(tokens[i])) { const op = tokens[i++], r = unary(); v = op === "*" ? v * r : op === "/" ? v / r : v % r; } return v; } function add() { let v = multiply(); while (tokens[i] === "+" || tokens[i] === "-") { const op = tokens[i++], r = multiply(); v = op === "+" ? v + r : v - r; } return v; } try { const v = add(); return i === tokens.length && Number.isFinite(v) ? v : null; } catch { return null; } }
  const flavourTexts = [
    [-1, 1, "You are some sort of sentient water being you're so not-dry. How'd you even do this?"],
    [1, 10, "You're a higher % water than a watermelon.", "Or you would be if you had gotten any drops. But you didn't."],
    [10, 20, "Only ironmen can be this lucky.", "But you got no drops, so I guess you're not an ironman."],
    [20, 30, "🥄 Spooned 🥄", "j/k you got no drops"],
    [30, 40, "Your friends will be jealous.", "...If you got any drops."],
    [40, 49, "You're quite the lucker aren't you.", "Or not, since you got no drops."],
    [49, 51, "A perfect mix of dry and undry, as all things should be."],
    [51, 61, "Nothing interesting happens.", "Over half of your friends would have got a drop by now, though."],
    [61, 65, "An unenlightened being would say 'but 1/x over x kills means I should get it', but you know better now."],
    [65, 73, "Nothing interesting happens.", "Not even any drops."],
    [73, 74, "😂😂😂"], [74, 85, "oof"],
    [85, 90, "A national emergency has been declared in your drop log."],
    [90, 95, "Right, time to post on reddit."],
    [95, 99, "You after being this dry: [[File:Skeleton (level 21, 1).png|link=Skeleton|80x80px]]"],
    [99, 99.5, "You are so dry you have collapsed into the dry singularity. The dryularity, if you will."],
    [99.5, 99.9, "The vacuum of space has more activity than your drop log."],
    [99.9, 99.99, "Wow that's so rare! Seems like it's bugged. We tweeted @JagexAsh for you, we're sure he'll get to the bottom of it in the next 24 hours."],
    [99.99, 1000, "Did you forget to talk to [[Oziach]]?"]
  ];
  function flavourText(x, o) { for (const v of flavourTexts) if (x >= v[0] && x < v[1]) return v[2] + (o === 0 && v[3] ? " " + v[3] : ""); return ""; }
  function binomDist(logP, logQ, n, k) { const diff = logP - logQ; let logPX = n * logQ, sum = 0; for (let x = 1; x <= k; x++) { sum += Math.exp(logPX); logPX += Math.log(n - x + 1) - Math.log(x) + diff; } return [sum, Math.exp(logPX)]; }
  function wikiFixed(v, digits) { if (!Number.isFinite(v)) return "inf"; const negative = v < 0; v = Math.abs(v); const view = new DataView(new ArrayBuffer(8)); view.setFloat64(0, v, false); const hi = view.getUint32(0, false), lo = view.getUint32(4, false), e = (hi >>> 20) & 2047; let m = (BigInt(hi & 1048575) << 32n) | BigInt(lo); if (e !== 0) m |= 1n << 52n; const shift = (e === 0 ? -1022 : e - 1023) - 52; let numerator = m * (10n ** BigInt(digits)), denominator = 1n; if (shift >= 0) numerator <<= BigInt(shift); else denominator <<= BigInt(-shift); let rounded = numerator / denominator; const twice = 2n * (numerator % denominator); if (twice > denominator || (twice === denominator && (rounded & 1n) === 1n)) rounded++; let t = rounded.toString(); if (digits) { t = t.padStart(digits + 1, "0"); t = t.slice(0, -digits) + "." + t.slice(-digits); } return (negative ? "-" : "") + t; }
  function calcWiki(chanceTxt, kc, obtained) { chanceTxt = String(chanceTxt).trim(); let chance = expr(chanceTxt); if (chance === null) return { error: "Looks like there was an error with your input chance, try typing it in again" }; if (chance > 1) { chance = 1 / chance; chanceTxt = "1/" + chanceTxt; } else if (chance <= 0) return { error: "You put your chance at 0 or negative, how you gonna get that drop?" }; const kct = String(kc).trim(); kc = kct === "" ? NaN : Number(kct); if (!Number.isFinite(kc) || kc === 0) return { error: "You ain't killed anything you crazy fool" }; const ot = String(obtained).trim(); obtained = ot === "" ? 0 : Number(ot); if (!Number.isFinite(obtained)) obtained = 0; if (kc < obtained) return { error: "More items dropped than things killed? how?" }; if (!Number.isSafeInteger(kc) || kc < 0 || !Number.isSafeInteger(obtained) || obtained < 0) return { error: "Kill count and drops obtained must be whole numbers of 0 or more." }; if (kc > 1000000000) return { error: "Please use a kill count of 1,000,000,000 or less." }; if (Math.min(obtained, kc - obtained) > 1000000) return { error: "Those inputs require too many calculation steps for this browser. Use a smaller range." }; let less = 0, equal = 0, more = 0; if (chance === 1) { equal = obtained === kc ? 1 : 0; more = obtained < kc ? 1 : 0; } else { const lp = Math.log(chance), lq = Math.log1p(-chance); if (obtained < kc / 2) { [less, equal] = binomDist(lp, lq, kc, obtained); more = 1 - less - equal; } else { [more, equal] = binomDist(lq, lp, kc, kc - obtained); less = 1 - more - equal; } } const clamp = v => Math.min(1, Math.max(0, v)); less = clamp(less); equal = clamp(equal); more = clamp(more); let flavour = flavourText(more * 100, obtained); if (kc === 1 && obtained === 1) flavour = "Perfect drop rate."; const f = wikiFixed, intro = "You killed " + kc + " monsters for an item with a " + chanceTxt + " (" + f(100 * chance, 6) + "% or 1/" + f(1 / chance, 2) + ") drop chance. You had a:", probabilities = [f(100 * equal, 8) + "% chance (1/" + f(1 / equal, 2) + ") of getting exactly " + obtained + " drops,"]; if (obtained > 0) probabilities.push(f(100 * less, 8) + "% chance (1/" + f(1 / less, 2) + ") of getting fewer than " + obtained + " drops,"); if (obtained < kc) probabilities.push(f(100 * more, 8) + "% chance (1/" + f(1 / more, 2) + ") of getting more than " + obtained + " drops,"); return { intro, probabilities, flavour, less, equal, more, chance, kc, obtained }; }
  function mayAutofillRate(context, detail, value, manuallySet) { return !!context && !!detail.input && !manuallySet && !String(value).trim() && context.item === detail.item && context.boss === detail.boss && context.profile === detail.profile; }

  const rate = $("dry-rate"), kills = $("dry-attempts"), drops = $("dry-drops"), results = $("dry-results"), status = $("dry-message"), rates = new Map();
  let context = null, rateManuallySet = false;
  const el = id => document.getElementById(id), fmt = n => n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const raidPanel = el("raid-aware-panel"), raidMode = el("raid-mode"), raidRateKind = el("raid-rate-kind"), raidSummary = el("raid-aware-summary");
  const raidFields = { cox: el("raid-cox-fields"), tob: el("raid-tob-fields"), toa: el("raid-toa-fields") };
  function raidKind(boss) { const n = String(boss || "").toLowerCase().replace(/[^a-z0-9]/g, ""); if (n.includes("chambersofxeric")) return "cox"; if (n.includes("theatreofblood")) return "tob"; if (n.includes("tombsofamascut")) return "toa"; if (n.includes("fracturedarchive") || n.includes("fracturedarchives")) return "tfa"; return ""; }
  const raidModes = { cox: [["normal", "Normal Mode"], ["challenge", "Challenge Mode"]], tob: [["entry", "Entry Mode — no uniques"], ["normal", "Normal Mode"], ["hard", "Hard Mode"]], toa: [["entry", "Entry Mode"], ["normal", "Normal Mode"], ["expert", "Expert Mode"]], tfa: [["normal", "Standard raid"], ["practice", "Practice mode — no rewards"]] };
  function configureRaidPanel() { const kind = raidKind(context?.boss || context?.collection); raidPanel.hidden = !kind; if (!kind) return; raidMode.replaceChildren(...raidModes[kind].map(([v, t]) => { const o = document.createElement("option"); o.value = v; o.textContent = t; return o; })); Object.entries(raidFields).forEach(([k, n]) => n.hidden = k !== kind); raidRateKind.value = "personal"; raidMode.value = "normal"; updateRaidSummary(); }
  function raidPersonalChance() {
    const kind = raidKind(context?.boss || context?.collection), mode = raidMode.value, team = Number(el("raid-team-size").value);
    if (!kind) return { kind, adjusted: false };
    if (!el("raid-eligible").checked) return { error: "This character is marked as ineligible for the selected reward." };
    if (!Number.isInteger(team) || team < 1 || team > (kind === "cox" ? 100 : 8)) return { error: "Enter a valid team size for this raid." };
    if ((kind === "tob" && mode === "entry") || (kind === "tfa" && mode === "practice")) return { error: "This mode does not award the selected unique reward." };
    if (raidRateKind.value !== "unique-share") return { kind, adjusted: false };
    if (kind === "cox") { const personal = Number(el("raid-personal-points").value), group = Number(el("raid-group-points").value); if (!Number.isFinite(personal) || !Number.isFinite(group) || personal < 0 || group < personal || group <= 0) return { error: "Enter valid personal and team points; team points must be at least your personal points." }; return { kind, adjusted: true, chance: Math.min(.657, personal / 867500), note: "Estimated from your personal points at 1% per 8,675 points, capped at 65.7% for the first unique roll. Extra team rolls and multiple uniques are not modeled." }; }
    if (kind === "tob") { const share = Number(el("raid-tob-share").value); if (!Number.isFinite(share) || share < 0 || share > 100) return { error: "Your unique-chance share must be between 0 and 100%." }; return { kind, adjusted: true, chance: (mode === "hard" ? .13 : .11) * share / 100, note: "Uses an 11% Normal or 13% Hard Mode team unique chance multiplied by your entered share. Deaths and detailed performance scaling are not automatically inferred." }; }
    if (kind === "toa") { const rl = Number(el("raid-level").value), personal = Number(el("raid-toa-personal").value), total = Number(el("raid-toa-total").value); if (!Number.isInteger(rl) || rl < 0 || rl > 600 || !Number.isFinite(personal) || !Number.isFinite(total) || personal < 0 || total < personal || total <= 0) return { error: "Enter a raid level from 0–600 and valid personal/team points." }; const scaled = rl <= 310 ? rl : rl <= 430 ? 310 + (rl - 310) / 3 : 350 + (rl - 430) / 6; const denominator = 10500 - 20 * scaled; const teamChance = Math.min(.55, Math.max(0, total - 5000) / (denominator * 100)); const modeFactor = mode === "entry" ? 0 : 1; return { kind, adjusted: true, chance: teamChance * (personal / total) * modeFactor, note: "Estimates your chance of being assigned a team purple from total points and raid level, then multiplies by your share of team points. Item-specific level eligibility, the additional 1/50 off-level roll, pet rolls, and tertiary rewards are not modeled." }; }
    return { kind, adjusted: false, note: "The Fractured Archive's complete unique-reward probability model is not yet implemented. Use a verified personal per-completion rate above; do not treat an unknown table rarity as a personal drop chance." };
  }
  function updateRaidSummary() { if (raidPanel.hidden) return; const kind = raidKind(context?.boss || context?.collection), mode = raidMode.value; if ((kind === "tob" && mode === "entry") || (kind === "tfa" && mode === "practice")) raidSummary.textContent = "This mode does not award the selected unique. Select a reward-eligible mode or track a non-unique reward separately."; else if (kind === "tfa") raidSummary.textContent = raidRateKind.value === "unique-share" ? "Automatic unique-table conversion is not available yet for The Fractured Archive. Enter a verified personal per-raid chance instead." : "Team size is recorded for context, but the entered rate remains your personal chance per completed raid."; else if (raidRateKind.value === "unique-share") raidSummary.textContent = kind === "toa" ? "Uses raid level, total points and your points to estimate personal purple eligibility; verify the item is obtainable at this raid level." : kind === "cox" ? "Uses your personal points for a first-roll estimate; team size and extra unique rolls can change the actual result." : "Uses the selected mode's team unique rate and your estimated share of that chance."; else raidSummary.textContent = "The entered rate is treated as your personal chance per completed raid. Mode and team settings are validation/context only; switch to item share of the unique table to apply supported mechanics."; }
  raidPanel.addEventListener("input", updateRaidSummary); raidRateKind.addEventListener("change", updateRaidSummary); raidMode.addEventListener("change", updateRaidSummary);

  const streakCard = $("dry-streak-card"), detailed = $("dry-details"), helpDialog = $("dry-help-dialog"), infoButton = $("dry-info");
  infoButton.addEventListener("click", () => { if (!helpDialog.open) helpDialog.showModal(); });
  el("dry-help-close").addEventListener("click", () => helpDialog.close());
  helpDialog.addEventListener("click", e => { if (e.target !== helpDialog) return; const b = helpDialog.getBoundingClientRect(); if (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom) helpDialog.close(); });
  helpDialog.addEventListener("close", () => { if (dialog.open) infoButton.focus(); });
  dialog.addEventListener("close", () => { if (helpDialog.open) helpDialog.close(); });
  function resetCard() { streakCard.hidden = true; detailed.hidden = true; detailed.open = false; el("dry-help-odds").textContent = "Calculate a result to see your selected odds here."; el("dry-equation").textContent = ""; }
  function renderCard(r) {
    const n = r.kc, k = r.obtained, p = r.chance, m = n * p, zero = k === 0;
    let title = "Under odds", color = "var(--muted)";
    if (m >= 3) { title = "Bone dry"; color = "var(--red)"; } else if (m >= 2) { title = "Very dry"; color = "#df9c5b"; } else if (m >= 1) { title = "Dry"; color = "var(--gold)"; }
    streakCard.style.setProperty("--dry-color", zero ? color : "var(--muted)"); streakCard.style.setProperty("--dry-position", Math.min(100, m * 25) + "%");
    el("dry-card-title").textContent = zero ? "Dry streak" : "Drop luck"; el("dry-status").textContent = zero ? title.toUpperCase() + " · " + fmt(m) + "×" : fmt(m) + " EXPECTED";
    el("dry-count").textContent = fmt(n); el("dry-count-label").textContent = zero ? "attempts without this drop" : ("attempts · " + fmt(k) + " drops obtained"); el("dry-meter-wrap").hidden = !zero;
    el("dry-meter").setAttribute("aria-valuenow", String(Math.min(4, m))); el("dry-meter").setAttribute("aria-valuetext", fmt(m) + " times the drop rate" + (m > 4 ? ", beyond the displayed scale" : ""));
    const tail = zero ? r.equal : Math.min(1, r.less + r.equal), pct = tail === 0 ? "below numeric precision" : tail * 100 < .001 ? (tail * 100).toExponential(2) + "%" : fmt(tail * 100) + "%";
    el("dry-tail").textContent = zero ? "Chance of going this dry: " + pct + " of independent runs would have no drop after " + fmt(n) + " attempts." : "Chance of getting " + fmt(k) + " or fewer drops in " + fmt(n) + " attempts: " + pct + ".";
    el("dry-caveat").textContent = zero ? "Based on the attempts entered—not an automatically tracked streak." : "Total kills and drops do not tell us how long it has been since your last drop.";
    el("dry-help-odds").textContent = "The selected item has a 1 in " + fmt(1 / p) + " chance per attempt."; el("dry-equation").textContent = fmt(n) + " attempts ÷ " + fmt(1 / p) + " ≈ " + fmt(m) + (zero ? "×" : " expected drops"); streakCard.hidden = false; detailed.hidden = false;
  }
  function contextKey() { return JSON.stringify([context?.profile || "", context?.boss || "", context?.item || ""]); }
  function countFromText(t) { t = String(t || "").replace(/[,\s]/g, ""); return /^\d+$/.test(t) && Number.isSafeInteger(Number(t)) ? t : ""; }
  function reset() { resetCard(); results.replaceChildren(); results.hidden = true; status.textContent = ""; status.classList.remove("error"); }
  function sourceLink(text, title) { const a = document.createElement("a"); a.textContent = text; a.href = "https://oldschool.runescape.wiki/w/" + encodeURIComponent(title.replace(/ /g, "_")); a.target = "_blank"; a.rel = "noopener noreferrer"; return a; }
  function renderFlavour(t) { const p = document.createElement("p"); p.className = "dry-flavour"; const token = "[[File:Skeleton (level 21, 1).png|link=Skeleton|80x80px]]"; if (t.includes(token)) { const [b, aft] = t.split(token); p.append(document.createTextNode(b)); const a = sourceLink("", "Skeleton"), img = document.createElement("img"); img.src = "https://oldschool.runescape.wiki/w/Special:FilePath/" + encodeURIComponent("Skeleton (level 21, 1).png"); img.alt = "Skeleton"; img.width = 80; img.height = 80; img.loading = "lazy"; img.addEventListener("error", () => { a.textContent = "Skeleton"; }, { once: true }); a.append(img); p.append(a, document.createTextNode(aft || "")); } else if (t.includes("[[Oziach]]")) { const [b, a] = t.split("[[Oziach]]"); p.append(document.createTextNode(b), sourceLink("Oziach", "Oziach"), document.createTextNode(a || "")); } else p.textContent = t; return p; }
  dialog.addEventListener("collection:item-open", e => { context = e.detail; form.reset(); reset(); $("dry-section").open = false; rate.value = rates.get(contextKey()) || ""; rateManuallySet = !!rate.value.trim(); kills.value = countFromText(context.killsText); drops.value = Number.isSafeInteger(context.quantity) ? String(context.quantity) : "0"; $("dry-context").textContent = context.item + " — " + (context.boss || context.collection); $("dry-item-source").href = context.itemURL; configureRaidPanel(); });
  dialog.addEventListener("collection:wiki-rate", e => { if (mayAutofillRate(context, e.detail, rate.value, rateManuallySet)) { rate.value = e.detail.input; reset(); } });
  rate.addEventListener("input", () => { rateManuallySet = true; }); form.addEventListener("input", reset);
  $("dry-use-kc").addEventListener("click", () => { kills.value = countFromText(context && context.killsText); reset(); if (!kills.value) { status.textContent = "No boss completion count is saved for this log. Enter your kill count manually."; status.classList.add("error"); } });
  $("dry-use-quantity").addEventListener("click", () => dialog.dispatchEvent(new Event("collection:request-quantity")));
  dialog.addEventListener("collection:quantity-value", e => { reset(); if (Number.isSafeInteger(e.detail.quantity)) drops.value = String(e.detail.quantity); else { status.textContent = "Saved quantity is unavailable. Enter drops obtained manually."; status.classList.add("error"); } });
  form.addEventListener("submit", e => {
    e.preventDefault(); reset();
    let chanceInput = rate.value, raidInfo = null;
    if (!raidPanel.hidden) {
      raidInfo = raidPersonalChance();
      if (raidInfo.error) { status.textContent = raidInfo.error; status.classList.add("error"); return; }
      if (raidRateKind.value === "unique-share") {
        if (raidInfo.adjusted) {
          const share = expr(rate.value);
          if (share === null || share <= 0) { status.textContent = "Enter a valid item share of the unique table, such as 1/7."; status.classList.add("error"); return; }
          const itemShare = share > 1 ? 1 / share : share, effective = itemShare * raidInfo.chance;
          if (!(effective > 0 && effective <= 1)) { status.textContent = "The selected raid settings produce no eligible personal chance for this reward."; status.classList.add("error"); return; }
          chanceInput = String(effective);
        } else if (raidInfo.kind === "tfa") { status.textContent = raidInfo.note; status.classList.add("error"); return; }
      }
    }
    const r = calcWiki(chanceInput, kills.value, drops.value);
    if (!r.error) { const monster = context?.boss || context?.collection; if (monster) r.intro = r.intro.replace(/^You killed \d+ monsters?/, "You killed " + monster + " " + r.kc + (r.kc === 1 ? " time" : " times")); else r.intro = r.intro.replace(/^You killed \d+ monsters?/, "You killed " + r.kc + (r.kc === 1 ? " time" : " times")); }
    if (r.error) { status.textContent = r.error; status.classList.add("error"); return; }
    rates.set(contextKey(), rate.value.trim());
    const intro = document.createElement("p"); intro.textContent = r.intro;
    const list = document.createElement("ul");
    for (const t of r.probabilities) { const li = document.createElement("li"); li.textContent = t; list.append(li); }
    results.append(intro, list);
    if (raidInfo) { const caveat = document.createElement("p"); caveat.className = "note"; caveat.textContent = raidRateKind.value === "unique-share" ? (raidInfo.note || "Raid-specific rate applied.") : "Raid setup: " + raidMode.options[raidMode.selectedIndex].text + ", team size " + el("raid-team-size").value + ". The drop chance used is the personal per-completion chance entered above."; results.append(caveat); }
    results.append(renderFlavour(r.flavour)); results.hidden = false; renderCard(r);
  });

  window.OSRSItems = { setImage, open: openItem, ready: collectionArt };
})();
