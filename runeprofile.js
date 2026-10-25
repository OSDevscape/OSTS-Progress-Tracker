"use strict";
/*
 * Shared core for the four RuneProfile pages (Collection Log, Combat
 * Achievements, Quests, Achievement Diaries). It loads and caches the data,
 * and gives each page module a small toolkit: filter bar, pop-up sheet,
 * persistent filter state. Each page then registers its own renderer.
 */
(() => {
  const $ = id => document.getElementById(id);
  const TITLES = { collection: "Collection Log", combat: "Combat Achievements", quests: "Quests", achievements: "Achievement Diaries" };
  const declared = document.body.dataset.rpSection;
  const section = Object.hasOwn(TITLES, declared) ? declared : "collection";

  const RP = window.RP = { section, title: TITLES[section], player: "", module: null, $ };

  /* ---------- small helpers ---------- */
  RP.el = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined && text !== null) el.textContent = text;
    return el;
  };
  RP.num = n => typeof n === "number" && Number.isFinite(n) && n >= 0;
  RP.fmt = n => (RP.num(n) ? n.toLocaleString() : "—");
  RP.pct = (a, b) => (RP.num(a) && RP.num(b) && b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0);
  RP.debounce = (fn, ms) => { let t = 0; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); }; };
  RP.register = module => { RP.module = module; };
  RP.wikiUrl = name => "https://oldschool.runescape.wiki/w/" + encodeURIComponent(String(name).replace(/ /g, "_"));
  RP.link = (text, href, cls) => {
    const a = RP.el("a", cls || "rp-link", text);
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    return a;
  };
  RP.bar = (done, total, cls) => {
    const track = RP.el("span", "rp-bar" + (cls ? " " + cls : ""));
    track.setAttribute("aria-hidden", "true");
    const fill = RP.el("span", "rp-bar-fill");
    fill.style.width = RP.pct(done, total) + "%";
    track.append(fill);
    return track;
  };
  RP.stat = (value, label, cls) => {
    const tile = RP.el("div", "rp-stat" + (cls ? " " + cls : ""));
    tile.append(RP.el("strong", "", value), RP.el("span", "", label));
    return tile;
  };

  /* ---------- persistent filter state (per page, per browser tab) ---------- */
  RP.makeState = defaults => {
    const key = "osrs-rp-state-v2:" + section;
    const state = { ...defaults };
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) || "null");
      if (saved && typeof saved === "object") for (const k of Object.keys(defaults)) if (typeof saved[k] === typeof defaults[k]) state[k] = saved[k];
    } catch {}
    Object.defineProperty(state, "save", { enumerable: false, value: () => { try { sessionStorage.setItem(key, JSON.stringify(state)); } catch {} } });
    Object.defineProperty(state, "reset", { enumerable: false, value: keep => { for (const k of Object.keys(defaults)) if (!keep || !keep.includes(k)) state[k] = defaults[k]; state.save(); } });
    return state;
  };

  /*
   * Filter bar. cfg = {
   *   state, onChange(),
   *   search: "placeholder",
   *   chips:   [{ key, label, options: () => [[value, label]] }],     (quick one-tap filters)
   *   selects: [{ key, label, options: () => [[value, label]] }]      (tucked into the Filters panel)
   * }
   */
  RP.controls = cfg => {
    const { state } = cfg;
    const root = RP.el("div", "rp-controls");

    const row = RP.el("div", "rp-searchrow");
    const input = RP.el("input", "rp-search");
    input.type = "search";
    input.placeholder = cfg.search || "Search";
    input.setAttribute("aria-label", cfg.search || "Search");
    input.autocomplete = "off";
    input.value = state.q || "";
    const toggle = RP.el("button", "rp-filter-toggle");
    toggle.type = "button";
    toggle.setAttribute("aria-expanded", "false");
    toggle.append(RP.el("span", "", "Filters"), RP.el("span", "rp-count-badge"));
    row.append(input);
    if ((cfg.selects || []).length) row.append(toggle);
    root.append(row);

    const chipRows = [];
    for (const group of cfg.chips || []) {
      const holder = RP.el("div", "rp-chips");
      holder.setAttribute("role", "group");
      holder.setAttribute("aria-label", group.label);
      chipRows.push({ group, holder });
      root.append(holder);
    }

    const panel = RP.el("div", "rp-filter-panel");
    panel.hidden = true;
    const grid = RP.el("div", "rp-filter-grid");
    const selectRefs = [];
    for (const spec of cfg.selects || []) {
      const label = RP.el("label", "rp-field");
      label.append(RP.el("span", "", spec.label));
      const select = RP.el("select");
      label.append(select);
      selectRefs.push({ spec, select });
      grid.append(label);
    }
    const reset = RP.el("button", "rp-reset", "Reset filters");
    reset.type = "button";
    panel.append(grid, reset);
    if (selectRefs.length) root.append(panel);

    function fillSelect({ spec, select }) {
      const options = spec.options();
      select.replaceChildren();
      for (const [value, text] of options) {
        const option = RP.el("option", "", text);
        option.value = value;
        select.append(option);
      }
      if (!options.some(([value]) => value === state[spec.key])) state[spec.key] = options.length ? options[0][0] : "all";
      select.value = state[spec.key];
    }
    function fillChips({ group, holder }) {
      holder.replaceChildren();
      for (const [value, text] of group.options()) {
        const chip = RP.el("button", "rp-chip", text);
        chip.type = "button";
        chip.dataset.value = value;
        chip.setAttribute("aria-pressed", String(state[group.key] === value));
        chip.addEventListener("click", () => {
          state[group.key] = value;
          state.save();
          fillChips({ group, holder });
          cfg.onChange();
        });
        holder.append(chip);
      }
    }
    function badge() {
      const active = selectRefs.filter(({ spec }) => {
        const options = spec.options();
        return options.length && state[spec.key] !== options[0][0];
      }).length;
      const el = toggle.querySelector(".rp-count-badge");
      el.textContent = active ? String(active) : "";
      el.hidden = !active;
      toggle.classList.toggle("is-active", active > 0);
    }
    function refresh() {
      chipRows.forEach(fillChips);
      selectRefs.forEach(fillSelect);
      badge();
    }

    input.addEventListener("input", RP.debounce(() => { state.q = input.value; state.save(); cfg.onChange(); }, 120));
    toggle.addEventListener("click", () => {
      panel.hidden = !panel.hidden;
      toggle.setAttribute("aria-expanded", String(!panel.hidden));
    });
    for (const ref of selectRefs) {
      ref.select.addEventListener("change", () => { state[ref.spec.key] = ref.select.value; state.save(); badge(); cfg.onChange(); });
    }
    reset.addEventListener("click", () => {
      for (const { spec } of selectRefs) { const options = spec.options(); state[spec.key] = options.length ? options[0][0] : "all"; }
      state.save();
      refresh();
      cfg.onChange();
    });

    refresh();
    // Open the panel on load when a stored filter is active so it is never hidden state.
    if (toggle.classList.contains("is-active")) { panel.hidden = false; toggle.setAttribute("aria-expanded", "true"); }
    return { el: root, refresh, input };
  };

  /* ---------- pop-up sheet ---------- */
  const sheet = $("rp-sheet");
  let sheetToken = 0;
  const sheetParts = sheet ? {
    title: sheet.querySelector(".rp-sheet-title"),
    sub: sheet.querySelector(".rp-sheet-sub"),
    body: sheet.querySelector(".rp-sheet-body")
  } : null;

  RP.sheet = ({ title, subtitle, build, onClose }) => {
    if (!sheet || typeof sheet.showModal !== "function") return null;
    const token = ++sheetToken;
    sheetParts.title.textContent = title || "";
    sheetParts.sub.textContent = subtitle || "";
    sheetParts.sub.hidden = !subtitle;
    sheetParts.body.replaceChildren();
    const api = {
      body: sheetParts.body,
      alive: () => token === sheetToken && sheet.open,
      setTitle: v => { sheetParts.title.textContent = v; },
      setSubtitle: v => { sheetParts.sub.textContent = v; sheetParts.sub.hidden = !v; },
      close: () => sheet.close()
    };
    sheet.onCloseHook = onClose || null;
    build(sheetParts.body, api);
    if (!sheet.open) sheet.showModal();
    sheet.scrollTop = 0;
    document.body.classList.add("modal-open");
    return api;
  };
  if (sheet) {
    sheet.querySelector(".rp-sheet-close").addEventListener("click", () => sheet.close());
    sheet.addEventListener("click", event => {
      if (event.target !== sheet) return;
      const r = sheet.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) sheet.close();
    });
    sheet.addEventListener("close", () => {
      sheetToken++;
      document.body.classList.toggle("modal-open", !!document.querySelector("dialog[open]"));
      if (typeof sheet.onCloseHook === "function") { const hook = sheet.onCloseHook; sheet.onCloseHook = null; hook(); }
    });
  }

  /* ---------- RuneProfile data ---------- */
  let sequence = 0;
  let controller = null;
  let snapshot = null;
  const memory = new Map();
  const checked = new Map();

  const storeKey = () => "osrs-runeprofile-v1:" + RP.player.toLowerCase().replaceAll("_", " ") + ":" + section;
  function saved() {
    try { return JSON.parse(localStorage.getItem(storeKey()) || "null") || memory.get(storeKey()); } catch { return memory.get(storeKey()); }
  }
  function save(data) {
    memory.set(storeKey(), data);
    try { localStorage.setItem(storeKey(), JSON.stringify(data)); return true; } catch { return false; }
  }

  function valid(data) {
    if (!data || typeof data !== "object") return false;
    if (section === "collection") {
      return Array.isArray(data.tabs) && data.tabs.every(t => t && Array.isArray(t.pages) && t.pages.every(p => p && typeof p.name === "string" && Array.isArray(p.items) && p.items.every(i => i && typeof i.name === "string" && RP.num(i.quantity))));
    }
    if (!Array.isArray(data.data)) return false;
    if (section === "quests") return data.data.every(q => q && typeof q.name === "string" && typeof q.state === "string");
    if (section === "combat") return data.data.every(t => t && typeof t.name === "string" && typeof t.completed === "boolean");
    return data.data.every(a => a && typeof a.area === "string" && Array.isArray(a.tiers) && a.tiers.every(t => t && RP.num(t.completed) && RP.num(t.total)));
  }

  /*
   * Collection Log only: quantities tracked by hand on the Bossing page are
   * merged into RuneProfile's list. The higher quantity wins and page/overall
   * totals are recalculated. Nothing is written back.
   */
  function mergeManual(data) {
    const sync = window.OSRSCollectionSync;
    if (!sync || !RP.player) return { data, filled: 0 };
    let manual;
    try { manual = sync.manualQuantities(RP.player); } catch { return { data, filled: 0 }; }
    if (!manual.size) return { data, filled: 0 };
    const rpHave = new Set();
    const mergedHave = new Set();
    const tabs = data.tabs.map(tab => ({
      ...tab,
      pages: tab.pages.map(p => {
        let extra = 0;
        const items = p.items.map(item => {
          const key = sync.looseName(item.name);
          const tracked = manual.get(key) || 0;
          if (item.quantity > 0) rpHave.add(key);
          if (Math.max(item.quantity, tracked) > 0) mergedHave.add(key);
          if (tracked > item.quantity) {
            if (item.quantity < 1) extra++;
            return { ...item, quantity: tracked, rpQuantity: item.quantity, fromManual: true };
          }
          return item;
        });
        let obtained = p.obtained;
        if (RP.num(obtained)) {
          obtained += extra;
          if (RP.num(p.total)) obtained = Math.min(obtained, p.total);
        }
        return { ...p, items, obtained };
      })
    }));
    const filled = mergedHave.size - rpHave.size;
    let obtained = data.obtained;
    if (RP.num(obtained)) {
      obtained += filled;
      if (RP.num(data.total)) obtained = Math.min(obtained, data.total);
    }
    return { data: { ...data, tabs, obtained }, filled };
  }

  /* ---------- rendering ---------- */
  const status = (message, isError) => {
    const el = $("rp-status");
    el.textContent = message || "";
    el.classList.toggle("error", !!isError);
  };

  function emptyState(message, action) {
    const host = $("rp-content");
    host.replaceChildren();
    const box = RP.el("div", "rp-empty");
    box.append(RP.el("p", "", message));
    if (action) {
      const b = RP.el("button", "primary", action);
      b.type = "button";
      b.addEventListener("click", openPlayerDialog);
      box.append(b);
    }
    host.append(box);
  }

  function render(keepScroll) {
    const host = $("rp-content");
    const y = keepScroll ? window.scrollY : 0;
    $("rp-checked").textContent = "";
    if (!RP.player) { emptyState("Choose a player to load their RuneProfile data.", "Choose player"); return; }
    if (!snapshot) { emptyState(navigator.onLine ? "Loading RuneProfile…" : "Offline — nothing saved for this page yet."); return; }
    let data = snapshot.data;
    if (!valid(data)) { emptyState("The saved response has an unexpected format. Refresh to retry; nothing has been overwritten."); return; }
    let filled = 0;
    if (section === "collection") { const merged = mergeManual(data); data = merged.data; filled = merged.filled; }
    const date = new Date(snapshot.fetchedAt);
    $("rp-checked").textContent = Number.isNaN(date.getTime()) ? "" : "Updated " + date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
    if (RP.module) {
      host.replaceChildren();
      RP.module.render(host, data, { snapshot, player: RP.player, filled });
    }
    if (keepScroll) requestAnimationFrame(() => window.scrollTo(0, y));
  }
  RP.rerender = () => render(true);

  async function load(force) {
    const version = ++sequence;
    if (controller) controller.abort();
    controller = null;
    $("rp-refresh").disabled = false;

    snapshot = RP.player ? saved() : null;
    render(false);
    if (!RP.player) { status(""); return; }

    const key = storeKey();
    const last = checked.get(key) || Date.parse((snapshot && snapshot.fetchedAt) || "");
    if (!force && Number.isFinite(last) && Date.now() - last < 60000) { status("Showing saved data (checked in the last minute)."); return; }
    if (!navigator.onLine) { status(snapshot ? "Offline — showing saved data." : "Offline — no saved data for this page.", !snapshot); return; }

    status(snapshot ? "Refreshing…" : "Loading RuneProfile…");
    $("rp-refresh").disabled = true;
    $("rp-refresh").classList.add("is-busy");
    const request = new AbortController();
    controller = request;
    const timer = setTimeout(() => request.abort(), 15000);

    try {
      const response = await fetch("/.netlify/functions/runeprofile?" + new URLSearchParams({ player: RP.player, section }), { cache: "no-store", signal: request.signal, headers: { Accept: "application/json" } });
      let body;
      try { body = await response.json(); } catch { throw new Error("The Netlify function did not return JSON. Check that the RuneProfile function is deployed."); }
      if (version !== sequence) return;
      if (!response.ok) throw new Error(body.error || "RuneProfile request failed.");
      if (body.source !== "RuneProfile" || !Number.isFinite(Date.parse(body.fetchedAt)) || !valid(body.data)) throw new Error("Unexpected RuneProfile response format. Saved data has not been replaced.");
      checked.set(key, Date.now());
      const stored = save(body);
      snapshot = body;
      render(true);
      status(stored ? "" : "Loaded for this session; persistent storage is unavailable.", !stored);
    } catch (error) {
      if (version === sequence) {
        status((error.name === "AbortError" ? "The request timed out or was cancelled." : error.message) + (snapshot ? " Saved data has been kept." : ""), true);
      }
    } finally {
      clearTimeout(timer);
      if (version === sequence) {
        controller = null;
        $("rp-refresh").disabled = false;
        $("rp-refresh").classList.remove("is-busy");
      }
    }
  }

  function choose(value) {
    value = String(value || "").trim();
    if (!/^[A-Za-z0-9 _-]{1,12}$/.test(value)) { status("Enter a valid OSRS player name (1–12 characters).", true); return false; }
    RP.player = value;
    $("rp-name").value = value;
    $("rp-player").textContent = value;
    const url = new URL(location.href);
    url.searchParams.set("player", value);
    history.replaceState(null, "", url);
    $("rp-profile").href = "https://www.runeprofile.com/" + encodeURIComponent(value);
    $("rp-profile").hidden = false;
    try { sessionStorage.setItem("osrs-active-profile-v1", value); } catch {}
    if (RP.module && RP.module.reset) RP.module.reset();
    load(false);
    return true;
  }

  /* ---------- player dialog ---------- */
  const playerDialog = $("rp-player-dialog");
  function openPlayerDialog() {
    if (!playerDialog || typeof playerDialog.showModal !== "function") return;
    $("rp-name").value = RP.player;
    playerDialog.showModal();
    document.body.classList.add("modal-open");
    $("rp-name").focus();
  }
  if (playerDialog) {
    playerDialog.addEventListener("close", () => document.body.classList.toggle("modal-open", !!document.querySelector("dialog[open]")));
    playerDialog.addEventListener("click", event => {
      if (event.target !== playerDialog) return;
      const r = playerDialog.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) playerDialog.close();
    });
    $("rp-player-cancel").addEventListener("click", () => playerDialog.close());
  }
  $("rp-player-btn").addEventListener("click", openPlayerDialog);
  $("rp-form").addEventListener("submit", event => {
    event.preventDefault();
    if (choose($("rp-name").value) && playerDialog && playerDialog.open) playerDialog.close();
  });
  $("rp-refresh").addEventListener("click", () => load(true));
  window.addEventListener("rp-manual-changed", () => { if (section === "collection") render(true); });
  window.addEventListener("storage", event => { if (section === "collection" && event.key && event.key.startsWith("osrs-collection-log-v1:")) render(true); });

  /* ---------- start (after every deferred module has registered) ---------- */
  function start() {
    let initial = new URLSearchParams(location.search).get("player");
    if (!initial) {
      try { initial = sessionStorage.getItem("osrs-active-profile-v1") || localStorage.getItem("osrs-active-profile-v1"); } catch {}
    }
    if (initial && choose(initial)) return;
    load(false);
  }
  // Deferred scripts run while readyState is already "interactive", so wait for DOMContentLoaded.
  if (document.readyState === "complete") start();
  else document.addEventListener("DOMContentLoaded", start);
})();
