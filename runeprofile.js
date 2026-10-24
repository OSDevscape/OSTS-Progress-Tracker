"use strict";

(() => {
  const $ = id => document.getElementById(id);

  const titles = {
    collection: "Collection Log",
    combat: "Combat Achievements",
    quests: "Quests",
    achievements: "Achievement Diaries"
  };

  const style = document.createElement("style");
  style.textContent = `
    .rp-cards {
      display: grid;
      grid-template-columns:
        repeat(auto-fit, minmax(min(100%, 260px), 1fr));
      gap: 12px;
      margin: 16px 0;
    }
    .rp-card {
      padding: 16px;
      border: 1px solid var(--border, #806a46);
      border-radius: 10px;
      background: var(--panel, #3b3021);
      overflow-wrap: anywhere;
    }
    .rp-card h3 {
      margin: 0 0 8px;
      font-size: 17px;
    }
    .rp-card p {
      margin: 8px 0;
      line-height: 1.5;
    }
    .rp-meta {
      font-size: 12px;
      color: var(--muted, #aa9978);
    }
    .rp-card.done {
      border-color: #789660;
    }
    .rp-badge {
      display: inline-block;
      padding: 3px 7px;
      border: 1px solid currentColor;
      border-radius: 6px;
      font-size: 12px;
    }
    .rp-card.done .rp-badge {
      color: #a9ce8d;
    }
    .rp-card progress {
      display: block;
      width: 100%;
      height: 12px;
      margin: 10px 0;
      accent-color: var(--gold, #ddc078);
    }
    .rp-filters {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin: 16px 0;
    }
    .rp-filters input,
    .rp-filters select {
      min-height: 44px;
      max-width: 100%;
      padding: 10px;
      border: 1px solid var(--border, #806a46);
      border-radius: 8px;
      background: var(--panel, #3b3021);
      color: var(--gold, #ddc078);
      font: inherit;
    }
    .rp-filters input {
      flex: 1;
      min-width: 150px;
    }
    .rp-items {
      display: grid;
      grid-template-columns:
        repeat(auto-fit, minmax(min(100%, 180px), 1fr));
      gap: 8px;
      margin-top: 12px;
    }
    .rp-item {
      padding: 10px;
      border: 1px solid var(--border, #806a46);
      border-radius: 8px;
      font-size: 13px;
    }
    .rp-item.done {
      background: #73935218;
      border-color: #789660;
    }
    .rp-item span {
      display: block;
      margin-top: 5px;
      font-size: 12px;
      color: var(--muted, #aa9978);
    }
    .rp-card summary {
      cursor: pointer;
      min-height: 44px;
    }
    .rp-card summary h3 {
      display: inline;
    }
    .rp-card a {
      display: inline-block;
      margin-top: 10px;
      color: var(--gold, #ddc078);
    }
    .rp-pages {
      display: flex;
      align-items: center;
      gap: 12px;
      justify-content: center;
      margin: 16px 0;
    }
    .rp-pages button {
      min-height: 44px;
      padding: 8px 14px;
      background: var(--panel, #3b3021);
      color: var(--gold, #ddc078);
      border: 1px solid var(--border, #806a46);
      border-radius: 8px;
    }
    .rp-result {
      margin: 12px 0;
      color: var(--muted, #aa9978);
    }
  `;
  document.head.append(style);

  document.querySelector(
    '[data-section="achievements"]'
  ).textContent = titles.achievements;

  let player = "";
  let section = "collection";
  let sequence = 0;
  let controller = null;
  let snapshot = null;

  let query = "";
  let status = "all";
  let group = "all";
  let page = 0;

  const memory = new Map();
  const checked = new Map();
  const size = 36;

  function node(tag, text, cls) {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (cls) el.className = cls;
    return el;
  }

  function number(n) {
    return (
      typeof n === "number" &&
      Number.isFinite(n) &&
      n >= 0
    );
  }

  function fmt(n) {
    return number(n) ? n.toLocaleString() : "Unknown";
  }

  function storeKey() {
    return (
      "osrs-runeprofile-v1:" +
      player.toLowerCase().replaceAll("_", " ") +
      ":" +
      section
    );
  }

  function saved() {
    try {
      return (
        JSON.parse(
          localStorage.getItem(storeKey()) || "null"
        ) || memory.get(storeKey())
      );
    } catch {
      return memory.get(storeKey());
    }
  }

  function save(data) {
    memory.set(storeKey(), data);

    try {
      localStorage.setItem(
        storeKey(),
        JSON.stringify(data)
      );
      return true;
    } catch {
      return false;
    }
  }

  function valid(data) {
    if (!data || typeof data !== "object") return false;

    if (section === "collection") {
      return (
        Array.isArray(data.tabs) &&
        data.tabs.every(t =>
          t &&
          Array.isArray(t.pages) &&
          t.pages.every(p =>
            p &&
            typeof p.name === "string" &&
            Array.isArray(p.items) &&
            p.items.every(i =>
              i &&
              typeof i.name === "string" &&
              number(i.quantity)
            )
          )
        )
      );
    }

    if (!Array.isArray(data.data)) return false;

    if (section === "quests") {
      return data.data.every(q =>
        q &&
        typeof q.name === "string" &&
        typeof q.state === "string"
      );
    }

    if (section === "combat") {
      return data.data.every(t =>
        t &&
        typeof t.name === "string" &&
        typeof t.completed === "boolean"
      );
    }

    return data.data.every(a =>
      a &&
      typeof a.area === "string" &&
      Array.isArray(a.tiers) &&
      a.tiers.every(t =>
        t &&
        number(t.completed) &&
        number(t.total)
      )
    );
  }

  function progress(parent, completed, total) {
    parent.append(
      node(
        "p",
        fmt(completed) + " / " + fmt(total),
        "rp-meta"
      )
    );

    if (
      number(completed) &&
      number(total) &&
      total > 0
    ) {
      const p = node("progress");
      p.max = total;
      p.value = Math.min(completed, total);
      p.setAttribute(
        "aria-label",
        completed + " of " + total + " complete"
      );
      parent.append(p);
    }
  }

  function card(title, done) {
    const c = node(
      "article",
      undefined,
      "rp-card" + (done ? " done" : "")
    );
    c.append(node("h3", title));
    return c;
  }

  function badge(parent, text) {
    parent.append(node("span", text, "rp-badge"));
  }

  function wiki(parent, name) {
    const a = node("a", "Read on Wiki ↗");
    a.href =
      "https://oldschool.runescape.wiki/w/" +
      encodeURIComponent(name.replaceAll(" ", "_"));
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    parent.append(a);
  }

  function state(q) {
    return ({
      finished: "Completed",
      in_progress: "In progress",
      not_started: "Not started"
    })[q.state] || "Unknown status";
  }

  function completed(row) {
    if (section === "quests") {
      return row.state === "finished";
    }

    if (section === "combat") {
      return row.completed === true;
    }

    return (
      row.total > 0 &&
      row.completed === row.total
    );
  }

  function selected(row) {
    return (
      status === "all" ||
      (status === "done" && completed(row)) ||
      (status === "remaining" && !completed(row))
    );
  }

  function filterControl(
    label,
    values,
    value,
    change
  ) {
    const select = node("select");
    select.setAttribute("aria-label", label);

    for (const [v, text] of values) {
      const option = node("option", text);
      option.value = v;
      select.append(option);
    }

    select.value = value;

    select.addEventListener("change", () => {
      change(select.value);
      page = 0;
      render();
    });

    return select;
  }

  function render() {
    const host = $("rp-content");
    host.replaceChildren();
    $("rp-checked").textContent = "";

    if (!snapshot) return;

    const data = snapshot.data;

    if (!valid(data)) {
      host.append(
        node(
          "p",
          "The saved response has an unexpected format. " +
          "Refresh to retry; no progress has been overwritten."
        )
      );
      return;
    }

    const date = new Date(snapshot.fetchedAt);

    $("rp-checked").textContent =
      "Last checked: " +
      (
        Number.isNaN(date.getTime())
          ? "Unknown"
          : date.toLocaleString()
      );

    const summary = node(
      "div",
      undefined,
      "rp-cards"
    );

    if (section === "collection") {
      const c = card("Collection slots obtained");

      progress(c, data.obtained, data.total);

      c.append(
        node(
          "p",
          "Uses RuneProfile’s reported total. " +
          "Items may appear on more than one log page.",
          "rp-meta"
        )
      );

      summary.append(c);
    }

    if (section === "quests") {
      const groups = [
        [
          "Quests",
          data.data.filter(q => q.type !== "mini")
        ],
        [
          "Miniquests",
          data.data.filter(q => q.type === "mini")
        ]
      ];

      for (const [label, rows] of groups) {
        const c = card(label);

        progress(
          c,
          rows.filter(
            q => q.state === "finished"
          ).length,
          rows.length
        );

        summary.append(c);
      }

      const c = card("Quest points");

      const earned = data.data
        .filter(q => q.state === "finished")
        .reduce(
          (sum, q) =>
            sum + (number(q.points) ? q.points : 0),
          0
        );

      c.append(node("p", fmt(earned)));
      summary.append(c);
    }

    if (section === "combat") {
      const rows = data.data.filter(t => !t.exempt);
      const c = card("Combat tasks");

      progress(
        c,
        rows.filter(t => t.completed).length,
        rows.length
      );

      c.append(
        node(
          "p",
          "Exempt tasks excluded from this count.",
          "rp-meta"
        )
      );

      summary.append(c);

      const points = card("Combat points / tier");

      points.append(
        node(
          "p",
          fmt(data.totalPoints) +
          " points · " +
          (data.tierReached || "No tier reported")
        )
      );

      summary.append(points);
    }

    if (section === "achievements") {
      const c = card("Diary tasks");
      const tiers = data.data.flatMap(a => a.tiers);

      progress(
        c,
        tiers.reduce(
          (n, t) => n + t.completed,
          0
        ),
        tiers.reduce(
          (n, t) => n + t.total,
          0
        )
      );

      summary.append(c);
    }

    host.append(summary);

    let rows;
    let groups;

    if (section === "collection") {
      rows = data.tabs.flatMap(t =>
        t.pages.map(p => ({
          ...p,
          group: t.name,
          completed: p.obtained
        }))
      );

      groups = data.tabs.map(t => t.name);
    } else if (section === "quests") {
      rows = data.data.map(q => ({
        ...q,
        group: q.type || "Unknown"
      }));

      groups = [
        ...new Set(rows.map(r => r.group))
      ];
    } else if (section === "combat") {
      rows = data.data.map(t => ({
        ...t,
        group: t.tierName || "Unknown"
      }));

      groups = [
        ...new Set(rows.map(r => r.group))
      ];
    } else {
      rows = data.data.map(a => ({
        ...a,
        name: a.area,
        group: a.area,
        completed: a.tiers.reduce(
          (n, t) => n + t.completed,
          0
        ),
        total: a.tiers.reduce(
          (n, t) => n + t.total,
          0
        )
      }));

      groups = rows.map(a => a.group);
    }

    const filters = node(
      "div",
      undefined,
      "rp-filters"
    );

    const input = node("input");
    input.type = "search";
    input.placeholder =
      section === "collection"
        ? "Search logs or items"
        : "Search";

    input.value = query;
    input.setAttribute(
      "aria-label",
      "Search " + titles[section]
    );

    input.addEventListener("input", () => {
      query = input.value;
      page = 0;

      const start = input.selectionStart;

      render();

      const replacement =
        $("rp-content").querySelector("input");

      replacement.focus();
      replacement.setSelectionRange(start, start);
    });

    filters.append(input);

    filters.append(
      filterControl(
        "Completion",
        [
          ["all", "All statuses"],
          ["done", "Completed"],
          ["remaining", "Remaining"]
        ],
        status,
        v => status = v
      )
    );

    filters.append(
      filterControl(
        "Category",
        [
          ["all", "All categories"],
          ...groups.map(g => [
            g,
            ({
              free: "Free-to-play",
              members: "Members",
              mini: "Miniquests"
            })[g] || g
          ])
        ],
        group,
        v => group = v
      )
    );

    host.append(filters);

    const needle = query.toLowerCase().trim();

    rows = rows.filter(r => {
      const categoryMatches =
        group === "all" || r.group === group;

      const searchValues = [
        r.name,
        r.description,
        r.monster,
        ...(r.items || []).map(i => i.name)
      ];

      const searchMatches =
        !needle ||
        searchValues.some(v =>
          String(v || "")
            .toLowerCase()
            .includes(needle)
        );

      return (
        categoryMatches &&
        selected(r) &&
        searchMatches
      );
    });

    page = Math.min(
      page,
      Math.max(
        0,
        Math.ceil(rows.length / size) - 1
      )
    );

    const noun =
      section === "collection"
        ? "log pages"
        : section === "quests"
          ? "quests / miniquests"
          : section === "combat"
            ? "tasks"
            : "areas";

    host.append(
      node(
        "p",
        rows.length + " matching " + noun,
        "rp-result"
      )
    );

    const grid = node(
      "div",
      undefined,
      "rp-cards"
    );

    const visibleRows = rows.slice(
      page * size,
      (page + 1) * size
    );

    for (const row of visibleRows) {
      if (section === "collection") {
        const c = node(
          "details",
          undefined,
          "rp-card" + (
            completed(row) ? " done" : ""
          )
        );

        const s = node("summary");
        s.append(node("h3", row.name));
        c.append(s);

        progress(c, row.obtained, row.total);
        c.append(
          node("p", row.group, "rp-meta")
        );

        const items = node(
          "div",
          undefined,
          "rp-items"
        );

        for (const item of row.items) {
          const el = node(
            "div",
            item.name,
            "rp-item" + (
              item.quantity > 0 ? " done" : ""
            )
          );

          el.append(
            node(
              "span",
              (
                item.quantity > 0
                  ? "Collected"
                  : "Not collected"
              ) +
              " · Quantity " +
              fmt(item.quantity)
            )
          );

          items.append(el);
        }

        c.append(items);
        grid.append(c);
      } else if (section === "quests") {
        const c = card(
          row.name,
          completed(row)
        );

        badge(c, state(row));

        const typeLabel = ({
          free: "Free-to-play",
          members: "Members",
          mini: "Miniquest"
        })[row.type] || row.type || "Unknown";

        c.append(
          node(
            "p",
            typeLabel +
            " · " +
            fmt(row.points) +
            " quest points",
            "rp-meta"
          )
        );

        wiki(c, row.name);
        grid.append(c);
      } else if (section === "combat") {
        const c = card(
          row.name,
          completed(row)
        );

        badge(
          c,
          row.exempt
            ? "Exempt"
            : row.completed
              ? "Completed"
              : "Remaining"
        );

        c.append(
          node(
            "p",
            [
              row.tierName,
              row.monster,
              row.type
            ].filter(Boolean).join(" · "),
            "rp-meta"
          )
        );

        c.append(
          node(
            "p",
            row.description ||
            "No description returned."
          )
        );

        grid.append(c);
      } else {
        const c = card(
          row.area,
          completed(row)
        );

        progress(
          c,
          row.completed,
          row.total
        );

        for (const tier of row.tiers) {
          c.append(
            node("p", tier.tier, "rp-meta")
          );

          progress(
            c,
            tier.completed,
            tier.total
          );
        }

        grid.append(c);
      }
    }

    host.append(grid);

    if (!rows.length) {
      host.append(
        node(
          "p",
          "No entries match these filters."
        )
      );
    }

    if (rows.length > size) {
      const nav = node(
        "div",
        undefined,
        "rp-pages"
      );

      for (const [label, delta] of [
        ["Previous", -1],
        ["Next", 1]
      ]) {
        const b = node("button", label);
        b.type = "button";

        b.disabled =
          delta < 0
            ? page === 0
            : (page + 1) * size >= rows.length;

        b.addEventListener("click", () => {
          page += delta;
          render();

          $("rp-title").scrollIntoView({
            block: "start"
          });
        });

        nav.append(b);

        if (delta < 0) {
          nav.append(
            node(
              "span",
              (page + 1) +
              " / " +
              Math.ceil(rows.length / size)
            )
          );
        }
      }

      host.append(nav);
    }
  }

  async function load() {
    const version = ++sequence;

    if (controller) controller.abort();

    controller = null;
    $("rp-refresh").disabled = false;
    $("rp-title").textContent = titles[section];

    snapshot = saved();
    render();

    if (!player) {
      $("rp-status").textContent =
        "Choose a player to load RuneProfile data.";
      return;
    }

    const k = storeKey();

    const last =
      checked.get(k) ||
      Date.parse(snapshot?.fetchedAt || "");

    if (
      Number.isFinite(last) &&
      Date.now() - last < 60000
    ) {
      $("rp-status").textContent =
        "Checked within the last minute. " +
        "Showing saved data.";
      return;
    }

    if (!navigator.onLine) {
      $("rp-status").textContent =
        snapshot
          ? "Offline — showing saved data."
          : "Offline — no saved data for this section.";
      return;
    }

    $("rp-status").textContent =
      snapshot
        ? "Showing saved data while refreshing…"
        : "Loading RuneProfile…";

    $("rp-refresh").disabled = true;

    const request = new AbortController();
    controller = request;

    const timer = setTimeout(
      () => request.abort(),
      15000
    );

    try {
      const response = await fetch(
        "/.netlify/functions/runeprofile?" +
        new URLSearchParams({ player, section }),
        {
          cache: "no-store",
          signal: request.signal,
          headers: {
            Accept: "application/json"
          }
        }
      );

      let body;

      try {
        body = await response.json();
      } catch {
        throw new Error(
          "The Netlify function did not return JSON. " +
          "Check that the replacement function is deployed."
        );
      }

      if (version !== sequence) return;

      if (!response.ok) {
        throw new Error(
          body.error ||
          "RuneProfile request failed."
        );
      }

      if (
        body.source !== "RuneProfile" ||
        !Number.isFinite(
          Date.parse(body.fetchedAt)
        ) ||
        !valid(body.data)
      ) {
        throw new Error(
          "Unexpected RuneProfile response format. " +
          "Saved data has not been replaced."
        );
      }

      checked.set(k, Date.now());

      const stored = save(body);

      snapshot = body;
      render();

      $("rp-status").textContent =
        stored
          ? "Latest available RuneProfile data loaded."
          : "Loaded for this session; " +
            "persistent storage is unavailable.";
    } catch (error) {
      if (version === sequence) {
        $("rp-status").textContent =
          (
            error.name === "AbortError"
              ? "The request timed out or was cancelled."
              : error.message
          ) +
          (
            snapshot
              ? " Saved data has been kept."
              : ""
          );
      }
    } finally {
      clearTimeout(timer);

      if (version === sequence) {
        controller = null;
        $("rp-refresh").disabled = false;
      }
    }
  }

  function reset() {
    query = "";
    status = "all";
    group = "all";
    page = 0;
  }

  function choose(value) {
    value = value.trim();

    if (!/^[A-Za-z0-9 _-]{1,12}$/.test(value)) {
      $("rp-status").textContent =
        "Enter a valid OSRS player name " +
        "(1–12 characters).";
      return;
    }

    player = value;
    reset();

    $("rp-name").value = value;
    $("rp-player").textContent =
      "Player: " + value;

    const url = new URL(location.href);
    url.searchParams.set("player", value);
    history.replaceState(null, "", url);

    $("rp-profile").href =
      "https://www.runeprofile.com/" +
      encodeURIComponent(value);

    $("rp-profile").hidden = false;

    load();
  }

  $("rp-form").addEventListener(
    "submit",
    event => {
      event.preventDefault();
      choose($("rp-name").value);
    }
  );

  $("rp-refresh").addEventListener(
    "click",
    load
  );

  document.querySelectorAll(
    "[data-section]"
  ).forEach(button => {
    button.addEventListener("click", () => {
      section = button.dataset.section;
      reset();

      document.querySelectorAll(
        "[data-section]"
      ).forEach(el => {
        el.setAttribute(
          "aria-pressed",
          String(el === button)
        );
      });

      load();
    });
  });

  let initial = new URLSearchParams(
    location.search
  ).get("player");

  if (!initial) {
    try {
      initial =
        sessionStorage.getItem(
          "osrs-active-profile-v1"
        ) ||
        localStorage.getItem(
          "osrs-active-profile-v1"
        );
    } catch {}
  }

  if (initial) {
    choose(initial);
  } else {
    load();
  }
})();