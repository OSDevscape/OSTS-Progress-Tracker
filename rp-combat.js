"use strict";
/* Combat Achievements: compact task list with tier/monster/type filters and a requirement pop-up. */
(() => {
  const RP = window.RP;
  if (!RP) return;

  const TIERS = ["Easy", "Medium", "Hard", "Elite", "Master", "Grandmaster"];
  const POINTS = { Easy: 1, Medium: 2, Hard: 3, Elite: 4, Master: 5, Grandmaster: 6 };
  const PAGE = 80;

  const defaults = { q: "", tier: "all", show: "all", monster: "all", type: "all", group: "tier", sort: "game" };
  let state = RP.makeState(defaults);
  let data = null;
  let tasks = [];
  let shown = PAGE;
  let controls = null;
  let listHost = null;
  let countEl = null;

  const tierOf = t => TIERS.find(x => x.toLowerCase() === String(t.tierName || "").toLowerCase()) || String(t.tierName || "Other");
  const tierClass = tier => "tier-" + String(tier).toLowerCase();
  const loose = v => String(v || "").toLowerCase();

  function matches(task, ignore) {
    if (ignore !== "tier" && state.tier !== "all" && task.tier !== state.tier) return false;
    if (ignore !== "show" && state.show === "remaining" && (task.completed || task.exempt)) return false;
    if (ignore !== "show" && state.show === "done" && !task.completed) return false;
    if (ignore !== "monster" && state.monster !== "all" && task.monster !== state.monster) return false;
    if (ignore !== "type" && state.type !== "all" && task.type !== state.type) return false;
    const needle = loose(state.q).trim();
    if (needle && ![task.name, task.description, task.monster, task.type, task.tier].some(v => loose(v).includes(needle))) return false;
    return true;
  }

  function prepare(raw) {
    tasks = raw.data.map((t, index) => ({
      name: t.name, description: t.description || "", monster: t.monster || "", type: t.type || "",
      completed: t.completed === true, exempt: !!t.exempt, tier: tierOf(t), index
    }));
  }

  function chipOptions() {
    const tierCounts = new Map();
    for (const t of tasks) {
      if (t.exempt) continue;
      const c = tierCounts.get(t.tier) || { done: 0, total: 0 };
      c.total++;
      if (t.completed) c.done++;
      tierCounts.set(t.tier, c);
    }
    const tiers = [...TIERS, ...[...tierCounts.keys()].filter(k => !TIERS.includes(k))].filter(k => tierCounts.has(k));
    return [["all", "All tiers"], ...tiers.map(t => [t, t + " " + tierCounts.get(t).done + "/" + tierCounts.get(t).total])];
  }

  function distinct(field) {
    return [...new Set(tasks.map(t => t[field]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }

  function buildControls() {
    controls = RP.controls({
      state,
      onChange: () => { shown = PAGE; renderList(); },
      search: "Search tasks, monsters, requirements",
      chips: [
        { key: "tier", label: "Tier", options: chipOptions },
        { key: "show", label: "Status", options: () => [["all", "All"], ["remaining", "Remaining"], ["done", "Completed"]] }
      ],
      selects: [
        { key: "monster", label: "Monster / boss", options: () => [["all", "All monsters"], ...distinct("monster").map(m => [m, m])] },
        { key: "type", label: "Task type", options: () => [["all", "All types"], ...distinct("type").map(t => [t, t])] },
        { key: "group", label: "Group by", options: () => [["tier", "Tier"], ["monster", "Monster"], ["none", "No grouping"]] },
        { key: "sort", label: "Sort", options: () => [["game", "Default order"], ["az", "Name A–Z"], ["monster", "Monster A–Z"]] }
      ]
    });
    return controls.el;
  }

  function summary() {
    const counted = tasks.filter(t => !t.exempt);
    const done = counted.filter(t => t.completed).length;
    const wrap = document.createDocumentFragment();
    const stats = RP.el("div", "rp-stats");
    stats.append(
      RP.stat(done + "/" + counted.length, "Tasks done"),
      RP.stat(RP.fmt(data.totalPoints), "Points"),
      RP.stat(data.tierReached || "None yet", "Tier reached")
    );
    const overall = RP.el("div", "rp-overall");
    overall.append(RP.bar(done, counted.length), RP.el("strong", "", RP.pct(done, counted.length) + "%"));
    wrap.append(stats, overall);
    return wrap;
  }

  function row(task) {
    const button = RP.el("button", "rp-row" + (task.completed ? " is-done" : ""));
    button.type = "button";
    button.setAttribute("aria-haspopup", "dialog");
    button.append(RP.el("span", "rp-mark", "✓"));
    const main = RP.el("span", "rp-row-main");
    main.append(
      RP.el("span", "rp-row-name", task.name),
      RP.el("span", "rp-row-sub", [task.monster, task.type].filter(Boolean).join(" · ") || "—")
    );
    const end = RP.el("span", "rp-row-end");
    end.append(RP.el("span", "rp-tag " + tierClass(task.tier), task.tier), RP.el("span", "", "+" + (POINTS[task.tier] || 0) + " pt" + ((POINTS[task.tier] || 0) === 1 ? "" : "s")));
    button.append(main, end);
    button.addEventListener("click", () => openTask(task));
    return button;
  }

  function openTask(task, list) {
    const sequence = list || visibleTasks();
    const position = sequence.indexOf(task);
    RP.sheet({
      title: task.name,
      subtitle: [task.tier + " tier", task.monster].filter(Boolean).join(" · "),
      build(body, api) {
        const kv = RP.el("div", "rp-kv");
        kv.append(
          RP.stat(task.exempt ? "Exempt" : task.completed ? "Completed" : "Remaining", "Status"),
          RP.stat(task.tier, "Tier"),
          RP.stat("+" + (POINTS[task.tier] || 0), "Points")
        );
        const req = RP.el("div", "rp-callout" + (task.completed ? " done" : ""));
        req.append(RP.el("h4", "", "Requirement"), RP.el("div", "", task.description || "RuneProfile did not return a description for this task."));
        const facts = RP.el("div", "rp-kv");
        if (task.monster) facts.append(RP.stat(task.monster, "Monster / boss"));
        if (task.type) facts.append(RP.stat(task.type, "Task type"));
        body.append(kv, req);
        if (facts.children.length) body.append(facts);

        const links = RP.el("div", "rp-links");
        links.append(
          RP.link("Search this task on the Wiki ↗", "https://oldschool.runescape.wiki/w/Special:Search?search=" + encodeURIComponent(task.name + " combat achievement")),
          RP.link(task.tier + " tier list ↗", RP.wikiUrl("Combat Achievements/" + task.tier))
        );
        if (task.monster) links.append(RP.link(task.monster + " ↗", RP.wikiUrl(task.monster)));
        body.append(links);

        if (sequence.length > 1 && position >= 0) {
          const nav = RP.el("div", "rp-actions-row");
          nav.style.cssText = "display:flex;gap:8px;margin-top:14px";
          const go = (label, delta) => {
            const b = RP.el("button", "secondary-button", label);
            b.type = "button";
            b.style.flex = "1";
            const target = sequence[position + delta];
            b.disabled = !target;
            b.addEventListener("click", () => openTask(target, sequence));
            return b;
          };
          nav.append(go("‹ Previous", -1), go("Next ›", 1));
          body.append(nav);
        }
      }
    });
  }

  function sorted(list) {
    const copy = [...list];
    if (state.sort === "az") copy.sort((a, b) => a.name.localeCompare(b.name));
    else if (state.sort === "monster") copy.sort((a, b) => a.monster.localeCompare(b.monster) || a.name.localeCompare(b.name));
    return copy;
  }

  function visibleTasks() {
    const list = sorted(tasks.filter(t => matches(t)));
    if (state.group === "tier") {
      const order = [...TIERS, "Other"];
      return list.sort((a, b) => (order.indexOf(a.tier) < 0 ? 99 : order.indexOf(a.tier)) - (order.indexOf(b.tier) < 0 ? 99 : order.indexOf(b.tier)) || 0);
    }
    if (state.group === "monster") return list.sort((a, b) => a.monster.localeCompare(b.monster));
    return list;
  }

  function renderList() {
    if (!listHost) return;
    controls.refresh();
    const list = visibleTasks();
    const done = list.filter(t => t.completed).length;
    countEl.textContent = list.length + " task" + (list.length === 1 ? "" : "s") + " · " + done + " completed";
    listHost.replaceChildren();
    if (!list.length) { listHost.append(RP.el("p", "rp-none", "No tasks match these filters.")); return; }

    const visible = list.slice(0, shown);
    const wrap = RP.el("div", "rp-list");
    let current = null;
    for (const task of visible) {
      const label = state.group === "tier" ? task.tier : state.group === "monster" ? task.monster || "No specific monster" : "";
      if (label !== current && state.group !== "none") {
        current = label;
        const all = list.filter(t => (state.group === "tier" ? t.tier : t.monster || "No specific monster") === label);
        const head = RP.el("div", "rp-grouphead");
        head.append(RP.el("span", "", label), RP.el("span", "", all.filter(t => t.completed).length + "/" + all.length));
        wrap.append(head);
      }
      wrap.append(row(task));
    }
    listHost.append(wrap);
    if (list.length > shown) {
      const more = RP.el("button", "rp-more", "Show more (" + (list.length - shown) + " left)");
      more.type = "button";
      more.addEventListener("click", () => { shown += PAGE; renderList(); });
      listHost.append(more);
    }
  }

  RP.register({
    reset() { state.reset(); shown = PAGE; },
    render(host, incoming) {
      data = incoming;
      prepare(incoming);
      shown = PAGE;
      host.append(summary(), buildControls());
      countEl = RP.el("p", "rp-count");
      listHost = RP.el("div", "");
      host.append(countEl, listHost);
      renderList();
    }
  });
})();
