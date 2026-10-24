"use strict";
/*
 * Shared Collection Log bridge.
 *  - Bossing page: RuneProfile quantities are copied into the manual Bossing
 *    tracker whenever RuneProfile reports more of an item than you have saved.
 *    Manual quantities are never lowered or removed.
 *  - Collection Log page: manual Bossing quantities are read (never changed)
 *    and merged into RuneProfile's item and page totals.
 * Items are matched by name, ignoring case and punctuation.
 */
(() => {
  const MANUAL_PREFIX = "osrs-collection-log-v1:";
  const RP_PREFIX = "osrs-runeprofile-v1:";
  const ACTIVE_KEY = "osrs-active-profile-v1";
  const REFRESH_AFTER_MS = 10 * 60 * 1000;

  const manualPlayer = value => String(value || "").split("_").join(" ").split(/\s+/).join(" ").trim().toLowerCase();
  const rpPlayer = value => String(value || "").trim().toLowerCase().split("_").join(" ");
  const manualKey = player => MANUAL_PREFIX + encodeURIComponent(manualPlayer(player));
  const rpKey = player => RP_PREFIX + rpPlayer(player) + ":collection";
  const itemKey = value => String(value).split(/\s+/).join(" ").trim().toLowerCase();
  const looseName = value => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const validQuantity = value => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

  function activePlayer() {
    const query = new URLSearchParams(location.search).get("player");
    if (query && query.trim()) return query.trim();
    try { const value = sessionStorage.getItem(ACTIVE_KEY); if (value) return value; } catch {}
    try { return localStorage.getItem(ACTIVE_KEY) || ""; } catch { return ""; }
  }

  function readJson(key) {
    try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; }
  }

  // Manual Bossing quantities: Map(loose item name -> quantity). Read-only.
  function manualQuantities(player) {
    const result = new Map();
    const state = readJson(manualKey(player));
    if (!state || ![1, 2].includes(state.schema) || !state.items || typeof state.items !== "object" || Array.isArray(state.items)) return result;
    for (const [name, entry] of Object.entries(state.items)) {
      if (!entry || typeof entry !== "object") continue;
      const quantity = entry.quantity === undefined && state.schema === 1 && typeof entry.collectedAt === "string" ? 1 : entry.quantity;
      if (!validQuantity(quantity) || quantity < 1) continue;
      const key = looseName(name);
      result.set(key, Math.max(result.get(key) || 0, quantity));
    }
    return result;
  }

  // RuneProfile quantities from its saved Collection Log snapshot.
  function runeProfileQuantities(player) {
    const result = new Map();
    const saved = readJson(rpKey(player));
    const tabs = saved && saved.data && saved.data.tabs;
    if (!Array.isArray(tabs)) return result;
    for (const tab of tabs) for (const page of (tab && tab.pages) || []) for (const item of (page && page.items) || []) {
      if (!item || typeof item.name !== "string" || !validQuantity(item.quantity) || item.quantity < 1) continue;
      const key = looseName(item.name);
      result.set(key, Math.max(result.get(key) || 0, item.quantity));
    }
    return result;
  }

  window.OSRSCollectionSync = { manualQuantities, runeProfileQuantities, looseName, activePlayer, readJson, rpKey };

  /* ---------- Bossing page: RuneProfile -> manual tracker ---------- */
  function applyToManual(player, quantities, names) {
    const key = manualKey(player), profile = manualPlayer(player), raw = localStorage.getItem(key);
    let state;
    if (raw === null) state = { schema: 2, profile, items: {} };
    else {
      try { state = JSON.parse(raw); } catch { return 0; }
      if (![1, 2].includes(state && state.schema) || state.profile !== profile || !state.items || typeof state.items !== "object" || Array.isArray(state.items)) return 0;
    }
    if (state.schema === 1) {
      for (const entry of Object.values(state.items)) {
        if (entry && entry.quantity === undefined && typeof entry.collectedAt === "string") entry.quantity = 1;
      }
      state.schema = 2;
    }
    const now = new Date().toISOString();
    let changed = 0;
    for (const name of names) {
      const target = quantities.get(looseName(name));
      if (!target) continue;
      const id = itemKey(name), old = state.items[id], current = old && validQuantity(old.quantity) ? old.quantity : 0;
      if (target > current) {
        state.items[id] = { quantity: target, collectedAt: (old && old.collectedAt) || now, updatedAt: now };
        changed++;
      }
    }
    if (changed) localStorage.setItem(key, JSON.stringify(state));
    return changed;
  }

  async function syncBossing() {
    if (!document.body || document.body.dataset.page !== "bossing") return;
    const player = activePlayer();
    if (!player) return;
    let names;
    try {
      names = [...new Set(Object.values(JSON.parse(document.getElementById("boss-collection-data").textContent)).flat())];
    } catch { return; }

    const apply = () => {
      try {
        const quantities = runeProfileQuantities(player);
        if (quantities.size && applyToManual(player, quantities, names)) {
          window.dispatchEvent(new StorageEvent("storage", { key: manualKey(player), storageArea: localStorage }));
        }
      } catch {}
    };
    apply();

    const saved = readJson(rpKey(player));
    const age = saved ? Date.now() - Date.parse(saved.fetchedAt) : Infinity;
    if (!navigator.onLine || age < REFRESH_AFTER_MS) return;
    const attemptKey = "osrs-rp-sync-attempt:" + rpPlayer(player);
    try { if (sessionStorage.getItem(attemptKey)) return; sessionStorage.setItem(attemptKey, "1"); } catch {}
    try {
      const response = await fetch("/.netlify/functions/runeprofile?" + new URLSearchParams({ player: rpPlayer(player), section: "collection" }), {
        cache: "no-store", headers: { Accept: "application/json" }
      });
      if (!response.ok) return;
      const body = await response.json();
      if (body && body.source === "RuneProfile" && body.data && Array.isArray(body.data.tabs)) {
        localStorage.setItem(rpKey(player), JSON.stringify(body));
        apply();
        window.dispatchEvent(new Event("osrs-runeprofile-collection"));
      }
    } catch {}
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", syncBossing, { once: true });
  else syncBossing();
})();
