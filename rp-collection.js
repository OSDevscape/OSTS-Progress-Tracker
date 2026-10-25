"use strict";
/*
 * Collection Log: tabs and log pages as compact expandable rows; every item is a card with its
 * image, like the Bossing page. Tapping an item opens the same pop-up (drop rate, quantity,
 * dry calculator). Quantities come from RuneProfile, topped up by anything tracked by hand
 * on the Bossing page.
 */
(() => {
  const RP = window.RP;
  if (!RP) return;

  const ITEM_CAP = 90;
  const defaults = { q: "", tab: "all", show: "all", pages: "all", sort: "game" };
  let state = RP.makeState(defaults);

  let data = null;
  let meta = null;
  let controls = null, listHost = null, countEl = null;
  let itemsShown = ITEM_CAP;
  const openPages = new Set();

  const pageId = (tab, page) => tab.name + "::" + page.name;
  const itemHave = item => item.quantity > 0;

  function counts(page) {
    const obtained = RP.num(page.obtained) ? page.obtained : page.items.filter(itemHave).length;
    const total = RP.num(page.total) && page.total > 0 ? page.total : page.items.length;
    return { obtained, total };
  }

  function tabCounts(tab) {
    return tab.pages.reduce((sum, p) => { const c = counts(p); return { obtained: sum.obtained + c.obtained, total: sum.total + c.total }; }, { obtained: 0, total: 0 });
  }

  /* ---------- items ---------- */
  function tile(item, page, tab, withSource) {
    const have = itemHave(item);
    const button = RP.el("button", "boss-log-item " + (have ? "is-collected" : "is-missing") + (item.fromManual ? " is-tracked" : ""));
    button.type = "button";
    button.dataset.itemName = item.name;
    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-label", item.name + " — " + (have ? "collected, quantity " + item.quantity.toLocaleString() : "not collected") + ". Open item details.");
    const icon = RP.el("span", "boss-log-icon");
    icon.setAttribute("aria-hidden", "true");
    if (window.OSRSItems) {
      const img = document.createElement("img");
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      icon.append(img);
      window.OSRSItems.setImage(img, item.name);
    }
    button.append(icon, RP.el("span", "boss-log-name", item.name), RP.el("span", "boss-log-badge", have ? "Collected · Quantity " + item.quantity.toLocaleString() : "Not collected · Quantity 0"));
    if (withSource) button.append(RP.el("span", "boss-log-source", page.name));
    button.addEventListener("click", () => {
      if (!window.OSRSItems) return;
      window.OSRSItems.open({
        name: item.name,
        log: page.name,
        tab: tab.name,
        quantity: item.rpQuantity !== undefined ? item.rpQuantity : item.quantity,
        player: meta.player,
        origin: button
      });
    });
    return button;
  }

  function itemMatchesShow(item) {
    if (state.show === "missing") return !itemHave(item);
    if (state.show === "obtained") return itemHave(item);
    return true;
  }

  /* ---------- pages ---------- */
  function pageVisible(page) {
    const c = counts(page);
    if (state.pages === "incomplete" && c.obtained >= c.total) return false;
    if (state.pages === "complete" && !(c.total > 0 && c.obtained >= c.total)) return false;
    if (state.show === "missing" && page.items.every(itemHave)) return false;
    if (state.show === "obtained" && !page.items.some(itemHave)) return false;
    return true;
  }

  function sortPages(pages) {
    const list = [...pages];
    const pct = p => { const c = counts(p); return c.total ? c.obtained / c.total : 0; };
    if (state.sort === "az") list.sort((a, b) => a.name.localeCompare(b.name));
    else if (state.sort === "most") list.sort((a, b) => pct(b) - pct(a) || a.name.localeCompare(b.name));
    else if (state.sort === "least") list.sort((a, b) => pct(a) - pct(b) || a.name.localeCompare(b.name));
    return list;
  }

  function fillBody(body, page, tab) {
    body.replaceChildren();
    const items = page.items.filter(itemMatchesShow);
    if (!items.length) { body.append(RP.el("p", "rp-none", "No items to show here.")); return; }
    const grid = RP.el("div", "rp-itemgrid");
    for (const item of items) grid.append(tile(item, page, tab, false));
    body.append(grid);
  }

  function pageRow(page, tab, forceOpen) {
    const c = counts(page);
    const details = RP.el("details", "rp-logpage" + (c.total > 0 && c.obtained >= c.total ? " is-complete" : ""));
    const summary = RP.el("summary", "");
    summary.append(RP.el("span", "rp-logpage-name", page.name), RP.bar(c.obtained, c.total, c.obtained >= c.total && c.total > 0 ? "green" : ""));
    const right = RP.el("span", "rp-logpage-count", (c.obtained >= c.total && c.total > 0 ? "✓ " : "") + c.obtained + "/" + c.total);
    const chevron = RP.el("span", "rp-logpage-chev", "▶");
    chevron.setAttribute("aria-hidden", "true");
    const trailing = RP.el("span", "");
    trailing.style.cssText = "display:flex;gap:8px;align-items:center";
    trailing.append(right, chevron);
    summary.append(trailing);
    details.append(summary);
    const body = RP.el("div", "rp-logbody");
    details.append(body);
    const id = pageId(tab, page);
    const open = forceOpen || openPages.has(id);
    details.addEventListener("toggle", () => {
      if (details.open) { openPages.add(id); if (!body.childElementCount) fillBody(body, page, tab); }
      else openPages.delete(id);
    });
    if (open) { details.open = true; fillBody(body, page, tab); }
    return details;
  }

  /* ---------- list ---------- */
  function renderList() {
    if (!listHost) return;
    controls.refresh();
    listHost.replaceChildren();
    const needle = state.q.toLowerCase().trim();
    const tabs = state.tab === "all" ? data.tabs : data.tabs.filter(t => t.name === state.tab);

    if (!needle) {
      let shownPages = 0;
      for (const tab of tabs) {
        const pages = sortPages(tab.pages.filter(pageVisible));
        if (!pages.length) continue;
        shownPages += pages.length;
        if (state.tab === "all") {
          const c = tabCounts(tab);
          const head = RP.el("div", "rp-grouphead");
          head.append(RP.el("span", "", tab.name), RP.el("span", "", c.obtained + "/" + c.total));
          listHost.append(head);
        }
        const wrap = RP.el("div", "");
        for (const page of pages) wrap.append(pageRow(page, tab, false));
        listHost.append(wrap);
      }
      countEl.textContent = shownPages + " log page" + (shownPages === 1 ? "" : "s");
      if (!shownPages) listHost.append(RP.el("p", "rp-none", "Nothing matches these filters."));
      return;
    }

    // Searching: matching pages first, then matching items from every page.
    const pageHits = [];
    const itemHits = [];
    for (const tab of tabs) {
      for (const page of tab.pages) {
        if (page.name.toLowerCase().includes(needle) && pageVisible(page)) pageHits.push({ page, tab });
        for (const item of page.items) {
          if (item.name.toLowerCase().includes(needle) && itemMatchesShow(item) && (state.pages === "all" || pageVisible(page))) itemHits.push({ item, page, tab });
        }
      }
    }
    countEl.textContent = pageHits.length + " page" + (pageHits.length === 1 ? "" : "s") + " · " + itemHits.length + " item" + (itemHits.length === 1 ? "" : "s");

    if (pageHits.length) {
      listHost.append(RP.el("div", "rp-grouphead", "Log pages"));
      const wrap = RP.el("div", "");
      for (const { page, tab } of pageHits.slice(0, 40)) wrap.append(pageRow(page, tab, pageHits.length <= 2));
      listHost.append(wrap);
    }
    if (itemHits.length) {
      listHost.append(RP.el("div", "rp-grouphead", "Items"));
      const grid = RP.el("div", "rp-itemgrid");
      for (const { item, page, tab } of itemHits.slice(0, itemsShown)) grid.append(tile(item, page, tab, true));
      listHost.append(grid);
      if (itemHits.length > itemsShown) {
        const more = RP.el("button", "rp-more", "Show more (" + (itemHits.length - itemsShown) + " left)");
        more.type = "button";
        more.addEventListener("click", () => { itemsShown += ITEM_CAP; renderList(); });
        listHost.append(more);
      }
    }
    if (!pageHits.length && !itemHits.length) listHost.append(RP.el("p", "rp-none", "Nothing matches “" + state.q + "”."));
  }

  /* ---------- summary + controls ---------- */
  function summary(filled) {
    const wrap = document.createDocumentFragment();
    const pages = data.tabs.flatMap(t => t.pages);
    const complete = pages.filter(p => { const c = counts(p); return c.total > 0 && c.obtained >= c.total; }).length;
    const obtained = RP.num(data.obtained) ? data.obtained : null;
    const total = RP.num(data.total) ? data.total : null;
    const stats = RP.el("div", "rp-stats");
    stats.append(RP.stat(obtained !== null && total !== null ? obtained.toLocaleString() + "/" + total.toLocaleString() : "—", "Slots obtained"), RP.stat(complete + "/" + pages.length, "Pages complete"));
    if (filled > 0) stats.append(RP.stat("+" + filled, "From Bossing"));
    wrap.append(stats);
    if (obtained !== null && total) {
      const overall = RP.el("div", "rp-overall");
      overall.append(RP.bar(obtained, total), RP.el("strong", "", RP.pct(obtained, total) + "%"));
      wrap.append(overall);
    }
    return wrap;
  }

  function buildControls() {
    controls = RP.controls({
      state,
      onChange: () => { itemsShown = ITEM_CAP; renderList(); },
      search: "Search items or log pages",
      chips: [
        { key: "tab", label: "Collection log tab", options: () => [["all", "All"], ...data.tabs.map(t => { const c = tabCounts(t); return [t.name, t.name + " " + c.obtained + "/" + c.total]; })] },
        { key: "show", label: "Items", options: () => [["all", "All items"], ["missing", "Missing"], ["obtained", "Obtained"]] }
      ],
      selects: [
        { key: "pages", label: "Log pages", options: () => [["all", "All pages"], ["incomplete", "Incomplete"], ["complete", "Complete"]] },
        { key: "sort", label: "Sort pages", options: () => [["game", "Game order"], ["az", "Name A–Z"], ["most", "Most complete"], ["least", "Least complete"]] }
      ]
    });
    return controls.el;
  }

  RP.register({
    reset() { state.reset(); openPages.clear(); itemsShown = ITEM_CAP; },
    render(host, incoming, info) {
      data = incoming;
      meta = info;
      itemsShown = ITEM_CAP;
      host.append(summary(info.filled), buildControls());
      countEl = RP.el("p", "rp-count");
      listHost = RP.el("div", "");
      host.append(countEl, listHost);
      renderList();
      if (window.OSRSItems) window.OSRSItems.ready().catch(() => {});
    }
  });
})();
