"use strict";
/*
 * Achievement Diaries: one compact card per area with a button per tier. Tapping a tier pops out
 * its task list (from the OSRS Wiki) with the requirements, crossed out when RuneProfile reports
 * the tier as complete. If RuneProfile ever returns per-task data it is used to cross out
 * individual tasks; otherwise only fully completed tiers can be crossed out and partial tiers show
 * their "n of m" count.
 */
(() => {
  const RP = window.RP;
  const Wiki = window.OSRSWiki;
  if (!RP) return;

  const TIERS = ["Easy", "Medium", "Hard", "Elite"];
  const defaults = { q: "", status: "all", tier: "any", sort: "game" };
  let state = RP.makeState(defaults);

  let areas = [];
  let levels = null;
  let wikiData = new Map();     // loose area -> {title, tasks} when loaded
  let wikiErrors = new Map();   // loose area -> true when the load failed
  let controls = null, listHost = null, countEl = null, summaryHost = null;
  let loadedFor = "";

  const loose = v => String(v || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const tierName = v => TIERS.find(t => t.toLowerCase() === String(v || "").trim().toLowerCase()) || String(v || "");

  function prepare(data) {
    areas = data.data.map((a, index) => {
      const tiers = a.tiers.map(t => ({
        name: tierName(t.tier),
        completed: t.completed,
        total: t.total,
        raw: t,
        done: t.total > 0 && t.completed >= t.total
      })).sort((x, y) => TIERS.indexOf(x.name) - TIERS.indexOf(y.name));
      const completed = tiers.reduce((n, t) => n + t.completed, 0);
      const total = tiers.reduce((n, t) => n + t.total, 0);
      return { name: a.area, tiers, completed, total, done: total > 0 && completed >= total, index };
    });
  }

  /* ---------- per-task completion ---------- */
  const flag = t => (t === true ? true : t === false ? false : t && typeof t === "object" ? [t.completed, t.done, t.complete, t.isCompleted].find(v => typeof v === "boolean") : undefined);

  // Returns { done: boolean[]|null, mode: "tasks"|"all"|"none"|"partial" }
  function completionFor(tier, tasks) {
    const list = tier.raw && Array.isArray(tier.raw.tasks) ? tier.raw.tasks : null;
    if (list && list.length) {
      const flags = list.map(flag);
      if (flags.every(v => typeof v === "boolean")) {
        if (flags.length === tasks.length) return { done: flags, mode: "tasks" };
        // Match by text when the counts differ.
        const names = list.map(t => loose(t && (t.name || t.description || t.task || t.title)));
        if (names.every(Boolean)) {
          return { done: tasks.map(task => { const id = loose(task.task); const at = names.findIndex(n => id.includes(n) || n.includes(id)); return at >= 0 ? flags[at] : false; }), mode: "tasks" };
        }
      }
    }
    if (tier.total > 0 && tier.completed >= tier.total) return { done: tasks.map(() => true), mode: "all" };
    if (tier.completed === 0) return { done: tasks.map(() => false), mode: "none" };
    return { done: null, mode: "partial" };
  }

  /* ---------- search over wiki tasks ---------- */
  function taskHits(area) {
    const needle = state.q.toLowerCase().trim();
    if (!needle) return [];
    const loaded = wikiData.get(loose(area.name));
    if (!loaded) return [];
    const hits = [];
    for (const tier of area.tiers) {
      (loaded.tasks[tier.name] || []).forEach((task, i) => {
        if ((task.task + " " + task.req).toLowerCase().includes(needle)) hits.push({ tier: tier.name, index: i });
      });
    }
    return hits;
  }

  function statusFilter(area) {
    const tierFocus = state.tier !== "any" ? area.tiers.find(t => t.name === state.tier) : null;
    if (state.tier !== "any" && !tierFocus) return false;
    const done = tierFocus ? tierFocus.done : area.done;
    const started = tierFocus ? tierFocus.completed > 0 : area.completed > 0;
    if (state.status === "done") return done;
    if (state.status === "todo") return !done;
    if (state.status === "fresh") return !started;
    return true;
  }

  function visibleAreas() {
    const needle = state.q.toLowerCase().trim();
    let list = areas.filter(a => {
      if (!statusFilter(a)) return false;
      if (!needle) return true;
      return a.name.toLowerCase().includes(needle) || taskHits(a).length > 0;
    });
    if (state.sort === "az") list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    else if (state.sort === "most") list = [...list].sort((a, b) => RP.pct(b.completed, b.total) - RP.pct(a.completed, a.total) || a.name.localeCompare(b.name));
    else if (state.sort === "least") list = [...list].sort((a, b) => RP.pct(a.completed, a.total) - RP.pct(b.completed, b.total) || a.name.localeCompare(b.name));
    return list;
  }

  /* ---------- summary + controls ---------- */
  function renderSummary() {
    if (!summaryHost) return;
    summaryHost.replaceChildren();
    const tasks = areas.reduce((n, a) => n + a.completed, 0);
    const total = areas.reduce((n, a) => n + a.total, 0);
    const tiers = areas.flatMap(a => a.tiers);
    const tiersDone = tiers.filter(t => t.done).length;
    const stats = RP.el("div", "rp-stats");
    stats.append(RP.stat(tasks + "/" + total, "Tasks"), RP.stat(tiersDone + "/" + tiers.length, "Tiers done"), RP.stat(areas.filter(a => a.done).length + "/" + areas.length, "Areas done"));
    const overall = RP.el("div", "rp-overall");
    overall.append(RP.bar(tasks, total), RP.el("strong", "", RP.pct(tasks, total) + "%"));
    summaryHost.append(stats, overall);
  }

  function buildControls() {
    controls = RP.controls({
      state,
      onChange: renderList,
      search: "Search areas or tasks",
      chips: [
        { key: "tier", label: "Tier", options: () => [["any", "Any tier"], ...TIERS.map(t => {
          const all = areas.map(a => a.tiers.find(x => x.name === t)).filter(Boolean);
          return [t, t + " " + all.filter(x => x.done).length + "/" + all.length];
        })] },
        { key: "status", label: "Status", options: () => [["all", "All"], ["todo", "Incomplete"], ["done", "Completed"], ["fresh", "Not started"]] }
      ],
      selects: [
        { key: "sort", label: "Sort by", options: () => [["game", "Default order"], ["az", "Name A–Z"], ["most", "Most complete"], ["least", "Least complete"]] }
      ]
    });
    return controls.el;
  }

  /* ---------- cards ---------- */
  function card(area) {
    const wrap = RP.el("article", "rp-area" + (area.done ? " is-done" : ""));
    const head = RP.el("div", "rp-area-head");
    head.append(RP.el("span", "rp-area-name", area.name), RP.el("span", "rp-area-count", area.completed + "/" + area.total));
    wrap.append(head);
    const grid = RP.el("div", "rp-tiers");
    const hits = taskHits(area);
    for (const tier of area.tiers) {
      const button = RP.el("button", "rp-tier" + (tier.done ? " is-done" : ""));
      button.type = "button";
      button.setAttribute("aria-haspopup", "dialog");
      button.setAttribute("aria-label", area.name + " " + tier.name + ": " + tier.completed + " of " + tier.total + " tasks");
      const top = RP.el("span", "rp-tier-top");
      top.append(RP.el("span", "tier-" + tier.name.toLowerCase(), (tier.done ? "✓ " : "") + tier.name), RP.el("span", "", tier.completed + "/" + tier.total));
      button.append(top, RP.bar(tier.completed, tier.total, tier.done ? "green" : ""));
      const first = hits.find(h => h.tier === tier.name);
      button.addEventListener("click", () => openArea(area, tier.name, hits));
      grid.append(button);
      if (first && !wrap.dataset.firstHit) wrap.dataset.firstHit = tier.name;
    }
    wrap.append(grid);
    if (hits.length) {
      const note = RP.el("button", "rp-match rp-link", hits.length + " matching task" + (hits.length === 1 ? "" : "s") + " — show");
      note.type = "button";
      note.style.cssText = "background:none;border:0;padding:0;text-align:left;cursor:pointer;text-decoration:underline";
      note.addEventListener("click", () => openArea(area, hits[0].tier, hits));
      wrap.append(note);
    }
    return wrap;
  }

  function renderList() {
    if (!listHost) return;
    controls.refresh();
    const list = visibleAreas();
    countEl.textContent = list.length + " area" + (list.length === 1 ? "" : "s");
    listHost.replaceChildren();
    if (!list.length) { listHost.append(RP.el("p", "rp-none", "No diary areas match these filters.")); return; }
    const grid = RP.el("div", "rp-areas");
    for (const area of list) grid.append(card(area));
    listHost.append(grid);
  }

  /* ---------- tier pop-up ---------- */
  function openArea(area, startTier, hits) {
    let current = area.tiers.some(t => t.name === startTier) ? startTier : (area.tiers[0] || {}).name;
    const hitSet = new Set((hits || []).map(h => h.tier + ":" + h.index));

    RP.sheet({
      title: area.name + " Diary",
      subtitle: "",
      build(body, api) {
        const tabs = RP.el("div", "rp-tabs");
        const panel = RP.el("div", "");
        body.append(tabs, panel);

        const drawTabs = () => {
          tabs.replaceChildren();
          for (const tier of area.tiers) {
            const b = RP.el("button", "", tier.name);
            b.type = "button";
            b.setAttribute("aria-pressed", String(tier.name === current));
            b.append(RP.el("small", "", (tier.done ? "✓ " : "") + tier.completed + "/" + tier.total));
            b.addEventListener("click", () => { current = tier.name; drawTabs(); drawPanel(); });
            tabs.append(b);
          }
        };

        const drawPanel = async () => {
          const tier = area.tiers.find(t => t.name === current);
          panel.replaceChildren();
          if (!tier) return;
          api.setSubtitle(tier.name + " · " + tier.completed + " of " + tier.total + " tasks complete");

          if (!Wiki) { panel.append(RP.el("p", "rp-note", "Wiki data is unavailable.")); return; }
          const key = loose(area.name);
          let loaded = wikiData.get(key);
          if (!loaded) {
            const wait = RP.el("p", "rp-note", "Loading task list from the OSRS Wiki…");
            panel.append(wait);
            try { loaded = await fetchArea(area); } catch { loaded = null; }
            if (!api.alive() || current !== tier.name) return;
            panel.replaceChildren();
          }
          if (!loaded) {
            const failure = RP.el("div", "rp-status-note");
            failure.append(document.createTextNode("The task list couldn't be loaded from the Wiki. "));
            const retry = RP.el("button", "secondary-button", "Retry");
            retry.type = "button";
            retry.addEventListener("click", () => { wikiErrors.delete(key); drawPanel(); });
            failure.append(retry, document.createTextNode(" "), RP.link("Open on Wiki ↗", RP.wikiUrl(Wiki.diaryTitle(area.name))));
            panel.append(failure);
            return;
          }

          const tasks = loaded.tasks[tier.name] || [];
          if (!tasks.length) { panel.append(RP.el("p", "rp-note", "The Wiki lists no tasks for this tier."), RP.link("Open on Wiki ↗", RP.wikiUrl(loaded.title))); return; }
          const completion = completionFor(tier, tasks);

          if (completion.mode === "partial") {
            panel.append(RP.el("p", "rp-status-note", "RuneProfile reports " + tier.completed + " of " + tier.total + " tasks done for this tier but doesn't say which ones, so none are crossed out."));
          } else if (completion.mode === "all") {
            panel.append(RP.el("p", "rp-status-note", "Tier complete — all tasks crossed out."));
          }
          if (tasks.length !== tier.total) panel.append(RP.el("p", "rp-note", "The Wiki lists " + tasks.length + " tasks; RuneProfile counts " + tier.total + "."));

          const list = RP.el("ul", "rp-tasks");
          tasks.forEach((task, i) => {
            const done = completion.done ? completion.done[i] === true : false;
            const li = RP.el("li", "rp-task" + (done ? " is-done" : "") + (hitSet.has(tier.name + ":" + i) ? " is-hit" : ""));
            li.append(RP.el("span", "rp-mark", "✓"));
            const text = RP.el("div", "");
            text.append(RP.el("div", "rp-task-text", task.task));
            if (task.req && !/^none$/i.test(task.req)) {
              const req = RP.el("div", "rp-task-req");
              req.append(document.createTextNode("Requires: "), Wiki.requirementNodes(task.req, levels));
              text.append(req);
            }
            li.append(text);
            list.append(li);
          });
          panel.append(list);
          panel.append(RP.el("h3", "rp-h", "Source"), RP.link(loaded.title + " on the OSRS Wiki ↗", RP.wikiUrl(loaded.title)));
          const hit = list.querySelector(".is-hit");
          if (hit) hit.scrollIntoView({ block: "center" });
        };

        drawTabs();
        drawPanel();
      }
    });
  }

  /* ---------- wiki data ---------- */
  async function fetchArea(area) {
    const key = loose(area.name);
    if (wikiData.has(key)) return wikiData.get(key);
    const value = await Wiki.diaryTasks(area.name);
    wikiData.set(key, value);
    return value;
  }

  // Load every area quietly so task search works. Failures are ignored here and retried on open.
  async function preload(player) {
    if (!Wiki) return;
    if (loadedFor === player) return;
    loadedFor = player;
    Wiki.skillLevels(player).then(result => { levels = result.map; });
    for (const area of areas) {
      try { await fetchArea(area); } catch { wikiErrors.set(loose(area.name), true); }
      if (loadedFor !== player) return;
      if (state.q.trim()) renderList();
    }
  }

  RP.register({
    reset() { state.reset(); loadedFor = ""; levels = null; wikiData = new Map(); wikiErrors = new Map(); },
    render(host, data, meta) {
      prepare(data);
      summaryHost = RP.el("div", "");
      host.append(summaryHost, buildControls());
      countEl = RP.el("p", "rp-count");
      listHost = RP.el("div", "");
      host.append(countEl, listHost);
      renderSummary();
      renderList();
      preload(meta.player);
    }
  });
})();
