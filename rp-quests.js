"use strict";
/*
 * Quests: compact rows with skill-level pills (green = you meet it, red = you are below it),
 * filters for status, type, difficulty, length, storyline and level requirements, and a
 * pop-up with the wiki Quick guide. Difficulty, length, storyline and level requirements
 * come from the OSRS Wiki; completion comes from RuneProfile.
 */
(() => {
  const RP = window.RP;
  const Wiki = window.OSRSWiki;
  if (!RP) return;

  const PAGE = 60;
  const defaults = { q: "", status: "all", type: "all", diff: "all", len: "all", series: "all", lvl: "all", skill: "all", sort: "az" };
  let state = RP.makeState(defaults);

  let quests = [];
  let wikiList = new Map();          // loose name -> {difficulty,length,series,...}
  let reqs = new Map();              // loose name -> [[skill, level, boostable]]
  let levels = null;                 // Map(skill -> level) or null when unknown
  let levelsSource = "";
  let wikiNote = "";
  let shown = PAGE;
  let controls = null, listHost = null, countEl = null, summaryHost = null, noteEl = null;
  let loadedFor = "";                // player the wiki data was prepared for
  let loading = null;

  const loose = v => String(v || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const typeLabel = t => ({ free: "Free", members: "Members", mini: "Miniquest" })[t] || "";
  const statusKey = q => (q.state === "finished" ? "done" : q.state === "in_progress" ? "doing" : "todo");
  const info = q => wikiList.get(loose(q.name)) || null;
  const needs = q => reqs.get(loose(q.name)) || null;

  function missingFor(q) {
    const list = needs(q);
    if (!list || !levels) return null;
    return list.filter(([skill, level]) => (levels.get(skill) || 1) < level);
  }

  /* ---------- filtering ---------- */
  function matches(q, ignore) {
    const status = statusKey(q);
    const wiki = info(q);
    if (ignore !== "status" && state.status !== "all" && status !== state.status) return false;
    if (ignore !== "type") {
      if (state.type === "free" && q.type !== "free") return false;
      if (state.type === "members" && q.type !== "members") return false;
      if (state.type === "mini" && q.type !== "mini") return false;
    }
    if (state.diff !== "all" && (!wiki || wiki.difficulty !== state.diff)) return false;
    if (state.len !== "all" && (!wiki || wiki.length !== state.len)) return false;
    if (state.series !== "all") {
      if (!wiki) return false;
      if (state.series === "__none") { if (wiki.series) return false; } else if (wiki.series !== state.series) return false;
    }
    if (state.lvl !== "all") {
      const list = needs(q);
      if (state.lvl === "none") { if (!list || list.length) return false; }
      else {
        const missing = missingFor(q);
        if (!missing) return false;
        if (state.lvl === "meet" && (missing.length || !list.length)) return false;
        if (state.lvl === "missing" && !missing.length) return false;
        if (state.lvl === "close" && !(missing.length && missing.length <= 2 && missing.every(([skill, level]) => level - (levels.get(skill) || 1) <= 5))) return false;
      }
    }
    if (state.skill !== "all") {
      const list = needs(q);
      if (!list || !list.some(([skill]) => skill === state.skill)) return false;
    }
    const needle = state.q.toLowerCase().trim();
    if (needle) {
      const hay = [q.name, wiki && wiki.series, wiki && wiki.difficulty, typeLabel(q.type), ...(needs(q) || []).map(([s]) => s)].join(" ").toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  }

  function sorted(list) {
    const copy = [...list];
    const byName = (a, b) => a.name.localeCompare(b.name);
    const diffRank = q => { const i = Wiki ? Wiki.DIFFICULTY_ORDER.indexOf((info(q) || {}).difficulty) : -1; return i < 0 ? 99 : i; };
    const lenRank = q => { const i = Wiki ? Wiki.LENGTH_ORDER.indexOf((info(q) || {}).length) : -1; return i < 0 ? 99 : i; };
    const date = q => { const t = Date.parse((info(q) || {}).release || ""); return Number.isFinite(t) ? t : 0; };
    switch (state.sort) {
      case "diff": copy.sort((a, b) => diffRank(a) - diffRank(b) || byName(a, b)); break;
      case "len": copy.sort((a, b) => lenRank(a) - lenRank(b) || byName(a, b)); break;
      case "new": copy.sort((a, b) => date(b) - date(a) || byName(a, b)); break;
      case "old": copy.sort((a, b) => (date(a) || 9e15) - (date(b) || 9e15) || byName(a, b)); break;
      case "points": copy.sort((a, b) => (b.points || 0) - (a.points || 0) || byName(a, b)); break;
      case "missing": copy.sort((a, b) => ((missingFor(a) || [1, 1, 1, 1]).length - (missingFor(b) || [1, 1, 1, 1]).length) || byName(a, b)); break;
      default: copy.sort(byName);
    }
    return copy;
  }

  /* ---------- summary ---------- */
  function renderSummary() {
    if (!summaryHost) return;
    summaryHost.replaceChildren();
    const main = quests.filter(q => q.type !== "mini");
    const mini = quests.filter(q => q.type === "mini");
    const done = list => list.filter(q => q.state === "finished").length;
    const earned = quests.filter(q => q.state === "finished").reduce((n, q) => n + (RP.num(q.points) ? q.points : 0), 0);
    const total = main.reduce((n, q) => n + (RP.num(q.points) ? q.points : 0), 0);
    const stats = RP.el("div", "rp-stats");
    stats.append(RP.stat(done(main) + "/" + main.length, "Quests"), RP.stat(done(mini) + "/" + mini.length, "Miniquests"), RP.stat(earned + (total ? "/" + total : ""), "Quest points"));
    if (levels && reqs.size) {
      const ready = quests.filter(q => q.state !== "finished" && (missingFor(q) || [1]).length === 0 && needs(q)).length;
      stats.append(RP.stat(String(ready), "Ready to start"));
    }
    const overall = RP.el("div", "rp-overall");
    overall.append(RP.bar(done(quests), quests.length), RP.el("strong", "", RP.pct(done(quests), quests.length) + "%"));
    summaryHost.append(stats, overall);
  }

  /* ---------- controls ---------- */
  const distinct = (field, order) => {
    const values = [...new Set([...wikiList.values()].map(w => w[field]).filter(Boolean))];
    return order ? values.sort((a, b) => (order.indexOf(a) < 0 ? 99 : order.indexOf(a)) - (order.indexOf(b) < 0 ? 99 : order.indexOf(b))) : values.sort((a, b) => a.localeCompare(b));
  };

  function buildControls() {
    controls = RP.controls({
      state,
      onChange: () => { shown = PAGE; renderList(); },
      search: "Search quests, storylines, skills",
      chips: [
        { key: "status", label: "Status", options: () => [["all", "All"], ["todo", "Not started"], ["doing", "In progress"], ["done", "Completed"]] },
        { key: "type", label: "Type", options: () => [["all", "All types"], ["free", "Free"], ["members", "Members"], ["mini", "Miniquests"]] }
      ],
      selects: [
        { key: "diff", label: "Difficulty", options: () => [["all", "Any difficulty"], ...distinct("difficulty", Wiki ? Wiki.DIFFICULTY_ORDER : null).map(v => [v, v])] },
        { key: "len", label: "Length", options: () => [["all", "Any length"], ...distinct("length", Wiki ? Wiki.LENGTH_ORDER : null).map(v => [v, v])] },
        { key: "series", label: "Storyline", options: () => [["all", "Any storyline"], ["__none", "Standalone (no storyline)"], ...distinct("series").map(v => [v, v])] },
        { key: "lvl", label: "Level requirements", options: () => [["all", "Any"], ["meet", "I meet them all"], ["close", "Nearly there (≤2 skills, ≤5 levels)"], ["missing", "I'm missing some"], ["none", "No skill requirements"]] },
        { key: "skill", label: "Requires skill", options: () => [["all", "Any skill"], ...(Wiki ? Wiki.SKILLS : []).map(s => [s, s])] },
        { key: "sort", label: "Sort by", options: () => [["az", "Name A–Z"], ["diff", "Difficulty"], ["len", "Length"], ["missing", "Fewest missing levels"], ["points", "Quest points"], ["new", "Newest"], ["old", "Oldest"]] }
      ]
    });
    return controls.el;
  }

  /* ---------- rows ---------- */
  function row(q) {
    const status = statusKey(q);
    const wiki = info(q);
    const button = RP.el("button", "rp-row" + (status === "done" ? " is-done" : status === "doing" ? " is-doing" : ""));
    button.type = "button";
    button.setAttribute("aria-haspopup", "dialog");
    button.append(RP.el("span", "rp-mark", "✓"));

    const main = RP.el("span", "rp-row-main");
    main.append(RP.el("span", "rp-row-name", q.name));
    const sub = RP.el("span", "rp-row-sub");
    if (wiki && wiki.difficulty) {
      sub.append(RP.el("span", "rp-tag diff-" + wiki.difficulty.toLowerCase(), wiki.difficulty), document.createTextNode(" "));
    }
    const bits = [wiki && wiki.length, typeLabel(q.type), wiki && wiki.series ? wiki.series + (wiki.seriesNo ? " #" + wiki.seriesNo : "") : ""].filter(Boolean);
    sub.append(document.createTextNode(bits.join(" · ") || (wiki ? "" : "")));
    if (sub.childNodes.length) main.append(sub);

    const list = needs(q);
    if (list && list.length && status !== "done" && Wiki) {
      const pills = RP.el("span", "rp-pills");
      for (const [skill, level, boost] of [...list].sort((a, b) => b[1] - a[1])) {
        pills.append(Wiki.pill(skill, level, levels ? levels.get(skill) || 1 : undefined, { boostable: !!boost }));
      }
      main.append(pills);
    }

    const end = RP.el("span", "rp-row-end");
    if (RP.num(q.points) && q.points > 0) end.append(RP.el("span", "", q.points + " QP"));
    button.append(main, end);
    button.addEventListener("click", () => openQuest(q));
    return button;
  }

  function renderList() {
    if (!listHost) return;
    controls.refresh();
    const list = sorted(quests.filter(q => matches(q)));
    const done = list.filter(q => q.state === "finished").length;
    countEl.textContent = list.length + " quest" + (list.length === 1 ? "" : "s") + " · " + done + " completed";
    listHost.replaceChildren();
    if (!list.length) { listHost.append(RP.el("p", "rp-none", "No quests match these filters.")); return; }
    const wrap = RP.el("div", "rp-list");
    for (const q of list.slice(0, shown)) wrap.append(row(q));
    listHost.append(wrap);
    if (list.length > shown) {
      const more = RP.el("button", "rp-more", "Show more (" + (list.length - shown) + " left)");
      more.type = "button";
      more.addEventListener("click", () => { shown += PAGE; renderList(); });
      listHost.append(more);
    }
  }

  function renderNote() {
    if (!noteEl) return;
    noteEl.textContent = wikiNote;
    noteEl.hidden = !wikiNote;
  }

  /* ---------- quest pop-up ---------- */
  function openQuest(q) {
    const wiki = info(q);
    const status = statusKey(q);
    RP.sheet({
      title: q.name,
      subtitle: [typeLabel(q.type), wiki && wiki.series ? wiki.series + (wiki.seriesNo ? " #" + wiki.seriesNo : "") : ""].filter(Boolean).join(" · "),
      build(body, api) {
        const kv = RP.el("div", "rp-kv");
        kv.append(
          RP.stat(status === "done" ? "Completed" : status === "doing" ? "In progress" : "Not started", "Status"),
          RP.stat(wiki && wiki.difficulty ? wiki.difficulty : "—", "Difficulty"),
          RP.stat(wiki && wiki.length ? wiki.length : "—", "Length"),
          RP.stat(RP.num(q.points) ? q.points + " QP" : "—", "Reward")
        );
        body.append(kv);

        const list = needs(q);
        body.append(RP.el("h3", "rp-h", "Level requirements"));
        if (!list) body.append(RP.el("p", "rp-note", wikiNote || "Requirements are still loading from the Wiki…"));
        else if (!list.length) body.append(RP.el("p", "rp-note", "No skill-level requirements."));
        else {
          const pills = RP.el("div", "rp-pills");
          for (const [skill, level, boost] of [...list].sort((a, b) => b[1] - a[1])) {
            const have = levels ? levels.get(skill) || 1 : undefined;
            pills.append(Wiki.pill(skill, level, have, { boostable: !!boost }));
          }
          body.append(pills);
          const missing = missingFor(q);
          let text;
          if (!levels) text = "Your levels aren't available yet. Open the Skills page once so they are saved, then reload this page.";
          else if (!missing.length) text = "You meet every skill requirement.";
          else text = "Missing: " + missing.map(([s, l]) => s + " " + (levels.get(s) || 1) + "→" + l).join(", ") + ".";
          body.append(RP.el("p", "rp-note", text + (list.some(r => r[2]) ? " * = can be boosted." : "")));
        }

        const links = RP.el("div", "rp-links");
        links.append(RP.link("Quest page ↗", RP.wikiUrl(q.name)), RP.link("Quick guide on the Wiki ↗", RP.wikiUrl(q.name + "/Quick guide")));
        if (wiki && wiki.release) links.append(RP.el("span", "rp-note", "Released " + wiki.release));
        body.append(links);

        body.append(RP.el("h3", "rp-h", "Quick guide"));
        const guide = RP.el("div", "rp-guide");
        const state = RP.el("p", "rp-note", Wiki ? "Loading quick guide from the OSRS Wiki…" : "Wiki data is unavailable.");
        body.append(state, guide);
        if (!Wiki) return;

        const load = () => {
          state.textContent = "Loading quick guide from the OSRS Wiki…";
          state.className = "rp-note";
          Wiki.quickGuide(q.name).then(result => {
            if (!api.alive()) return;
            guide.replaceChildren(result.html.cloneNode(true));
            state.textContent = "From the OSRS Wiki (" + result.title + "). Interactive wiki widgets are not shown.";
          }).catch(() => {
            if (!api.alive()) return;
            state.className = "rp-note error";
            state.textContent = "The quick guide couldn't be loaded. ";
            const retry = RP.el("button", "secondary-button", "Retry");
            retry.type = "button";
            retry.addEventListener("click", load);
            state.append(retry);
          });
        };
        load();
      }
    });
  }

  /* ---------- wiki + level data ---------- */
  async function loadWikiData(player) {
    if (!Wiki) { wikiNote = "Wiki data isn't available; showing RuneProfile data only."; renderNote(); return; }
    if (loading && loadedFor === player) return loading;
    loadedFor = player;
    loading = (async () => {
      Wiki.skillLevels(player).then(result => {
        levels = result.map;
        levelsSource = result.source;
        if (!levels) wikiNote = "Your skill levels couldn't be found, so level pills are neutral. Open the Skills page for this player once and reload.";
        renderNote(); renderSummary(); renderList();
      });
      try {
        const list = await Wiki.questList();
        wikiList = new Map(list.map(w => [loose(w.name), w]));
        renderNote(); renderSummary(); renderList();
      } catch {
        wikiNote = "Difficulty, length and storyline couldn't be loaded from the Wiki. Completion still comes from RuneProfile.";
        renderNote();
      }
      try {
        const names = quests.map(q => q.name);
        wikiNote = "Loading level requirements…";
        renderNote();
        reqs = await Wiki.questRequirements(names, (done, total) => {
          wikiNote = done < total ? "Loading level requirements… " + done + "/" + total : "";
          renderNote();
        });
        wikiNote = levels || levelsSource ? "" : wikiNote;
        if (!reqs.size) wikiNote = "Level requirements couldn't be loaded from the Wiki.";
        else if (!levels) wikiNote = "Your skill levels couldn't be found, so level pills are neutral. Open the Skills page for this player once and reload.";
        else wikiNote = "";
        renderNote(); renderSummary(); renderList();
      } catch {
        wikiNote = "Level requirements couldn't be loaded from the Wiki.";
        renderNote();
      }
    })();
    return loading;
  }

  RP.register({
    reset() { state.reset(); shown = PAGE; loadedFor = ""; loading = null; levels = null; reqs = new Map(); wikiNote = ""; },
    render(host, data, meta) {
      quests = data.data.map(q => ({ name: q.name, state: q.state, type: q.type, points: q.points }));
      shown = PAGE;
      summaryHost = RP.el("div", "");
      noteEl = RP.el("p", "rp-status-note");
      noteEl.hidden = true;
      host.append(summaryHost, noteEl, buildControls());
      countEl = RP.el("p", "rp-count");
      listHost = RP.el("div", "");
      host.append(countEl, listHost);
      renderSummary();
      renderNote();
      renderList();
      loadWikiData(meta.player);
    }
  });
})();
