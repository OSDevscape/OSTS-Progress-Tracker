"use strict";
/*
 * Bossing page: replaces the manual Collection Log section in each boss dialog
 * with that boss's log from RuneProfile (read-only quantities).
 * The original section stays in the page, hidden. It still supplies the item
 * images and the item details dialog (drop rate / dry calculator) that opens
 * when you tap an item.
 */
(() => {
  const sync = window.OSRSCollectionSync;
  const reference = document.getElementById("boss-reference");
  if (!sync || !reference || document.body.dataset.page !== "bossing") return;

  const loose = sync.looseName;
  const stripThe = value => loose(value).replace(/^the/, "");
  const number = value => typeof value === "number" && Number.isFinite(value) && value >= 0;

  function node(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function runeProfile(player) {
    const saved = sync.readJson(sync.rpKey(player));
    const tabs = saved && saved.data && saved.data.tabs;
    if (!Array.isArray(tabs)) return null;

    const pages = [];
    for (const tab of tabs) {
      for (const page of (tab && tab.pages) || []) {
        if (page && typeof page.name === "string" && Array.isArray(page.items)) {
          pages.push({ name: page.name, items: page.items.filter(i => i && typeof i.name === "string" && number(i.quantity)) });
        }
      }
    }

    return { pages, fetchedAt: saved.fetchedAt };
  }

  function pickPage(pages, names, candidates) {
    for (const candidate of candidates) {
      const wanted = stripThe(candidate);
      if (!wanted) continue;
      const match = pages.find(page => stripThe(page.name) === wanted);
      if (match) return match;
    }

    // Different page naming: choose the page that holds most of this boss's items.
    const wantedItems = new Set(names.map(loose));
    let best = null;
    let bestScore = 0;

    for (const page of pages) {
      const score = page.items.filter(item => wantedItems.has(loose(item.name))).length;
      if (score > bestScore) {
        best = page;
        bestScore = score;
      }
    }

    return bestScore >= Math.max(1, Math.ceil(names.length / 2)) ? best : null;
  }

  function originalTile(original, name) {
    return Array.from(original.querySelectorAll("button.boss-log-item"))
      .find(tile => loose(tile.dataset.itemName) === loose(name));
  }

  function heading(section) {
    section.append(node("h3", "section-label", "Collection Log"));
  }

  function build(original) {
    const player = original.dataset.collectionProfile || sync.activePlayer();
    const section = node("section", "boss-reference-section");
    section.dataset.rpLog = "true";
    heading(section);

    const data = runeProfile(player);
    const link = node("a", "source-link", "Open the full Collection Log page");
    link.href = "collection-log.html" + (player ? "?player=" + encodeURIComponent(player) : "");

    if (!data) {
      section.append(
        node("p", "wiki-intro", "No RuneProfile Collection Log is saved for this player yet. It loads in the background when you open this page; reopen this encounter in a moment, or load it on the Collection Log page."),
        link
      );
      return section;
    }

    const originalNames = Array.from(original.querySelectorAll("button.boss-log-item")).map(tile => tile.dataset.itemName);
    const tabText = original.querySelector(".wiki-intro")?.textContent || "";
    const bossName = document.getElementById("boss-title")?.textContent || "";
    const page = pickPage(data.pages, originalNames, [tabText, bossName]);

    if (!page) {
      section.append(
        node("p", "wiki-intro", "RuneProfile has no Collection Log page for this encounter."),
        link
      );
      return section;
    }

    // Keep variant lists (for example Normal vs Challenge Mode) when names line up.
    const wanted = new Set(originalNames.map(loose));
    const inList = page.items.filter(item => wanted.has(loose(item.name)));
    const items = inList.length >= Math.ceil(originalNames.length / 2) ? inList : page.items;
    const collected = items.filter(item => item.quantity > 0).length;

    section.append(node("p", "wiki-intro", page.name));
    section.append(node("p", "boss-log-count", collected + " / " + items.length + " unique items collected"));

    const progress = node("progress", "boss-log-progress");
    progress.max = Math.max(1, items.length);
    progress.value = collected;
    progress.setAttribute("aria-label", page.name + " collection progress");
    section.append(progress);

    const grid = node("div", "boss-log-grid");

    for (const item of items) {
      const have = item.quantity > 0;
      const tile = node("button", "boss-log-item " + (have ? "is-collected" : "is-missing"));
      tile.type = "button";
      tile.dataset.rpItem = item.name;
      tile.setAttribute("aria-label", item.name + " — " + (have ? "collected, quantity " + item.quantity.toLocaleString() : "not collected") + ". Open item details.");

      const icon = node("span", "boss-log-icon");
      icon.setAttribute("aria-hidden", "true");
      tile.append(
        icon,
        node("span", "boss-log-name", item.name),
        node("span", "boss-log-badge", have ? "Collected · Quantity " + item.quantity.toLocaleString() : "Not collected · Quantity 0")
      );

      tile.addEventListener("click", () => {
        const source = originalTile(original, item.name);
        if (source) source.click();
      });

      grid.append(tile);
    }

    section.append(grid);

    const checked = new Date(data.fetchedAt);
    section.append(
      node(
        "p",
        "boss-reference-note",
        "From RuneProfile" +
        (Number.isNaN(checked.getTime()) ? "" : " · last checked " + checked.toLocaleString()) +
        ". Tap an item for its drop rate and dry calculator."
      ),
      link
    );

    return section;
  }

  // Item images come from the hidden original tiles as they finish loading.
  function copyImages(section, original) {
    for (const tile of section.querySelectorAll("button[data-rp-item]")) {
      const icon = tile.querySelector(".boss-log-icon");
      if (!icon || icon.firstElementChild) continue;

      const source = originalTile(original, tile.dataset.rpItem);
      const image = source && source.querySelector(".boss-log-icon img");

      if (image && image.getAttribute("src")) {
        const copy = document.createElement("img");
        copy.src = image.getAttribute("src");
        copy.alt = "";
        copy.loading = "lazy";
        copy.decoding = "async";
        copy.addEventListener("error", () => { copy.hidden = true; }, { once: true });
        icon.append(copy);
      }
    }
  }

  function enhance() {
    for (const original of reference.querySelectorAll("[data-collection-profile]")) {
      let section = original.nextElementSibling;

      if (!section || !section.dataset.rpLog) {
        original.hidden = true;
        section = build(original);
        original.after(section);
      }

      copyImages(section, original);
    }
  }

  new MutationObserver(enhance).observe(reference, { childList: true, subtree: true });

  // RuneProfile data arrived after the dialog was built: rebuild with it.
  window.addEventListener("osrs-runeprofile-collection", () => {
    reference.querySelectorAll("[data-rp-log]").forEach(section => section.remove());
    enhance();
  });

  enhance();
})();
