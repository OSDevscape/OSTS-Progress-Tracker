"use strict";
(() => {
  const ICONS = {
    home:"\uD83C\uDFE0", skills:"\uD83D\uDCCA", bossing:"\u2694\uFE0F", wiki:"\uD83D\uDCDA",
    timers:"\u23F3", more:"\u2022\u2022\u2022", settings:"\u2699\uFE0F",
    close:"\u2715", chevron:"\u25B6\uFE0F", leaf:"\uD83C\uDF3F",
    allotments:"\uD83E\uDD55", tree:"\uD83C\uDF33", fruit:"\uD83C\uDF4E",
    birdhouse:"\uD83D\uDC26", extras:"\uD83D\uDCE6", custom:"\u23F1\uFE0F",
    bell:"\uD83D\uDD14", "bell-off":"\uD83D\uDD15", play:"\u25B6\uFE0F",
    pause:"\u23F8\uFE0F", resume:"\u23EF\uFE0F", pin:"\uD83D\uDCCC"
  };
  const TIMER_KEY = "osrs-farm-timers-v1";
  const current = location.pathname.split("/").pop() || "index.html";
  let scheduled = false;

  function emoji(name) {
    const el = document.createElement("span");
    el.className = "osrs-emoji";
    el.textContent = ICONS[name] || ICONS.more;
    el.setAttribute("aria-hidden", "true");
    return el;
  }
  function paint(el, name) {
    if (!el) return;
    const child = el.firstElementChild;
    if (el.dataset.uiIcon === name && child && child.classList.contains("osrs-emoji") && el.childNodes.length === 1) return;
    el.replaceChildren(emoji(name));
    el.dataset.uiIcon = name;
  }
  function setText(el, value) {
    if (el && el.textContent !== value) el.textContent = value;
  }
  function username() {
    const value = new URLSearchParams(location.search).get("player");
    if (value) return value;
    const skills = document.getElementById("skills-link");
    if (skills) {
      try { const selected = new URL(skills.href).searchParams.get("player"); if (selected) return selected; } catch {}
    }
    try { const selected = sessionStorage.getItem("osrs-active-profile-v1"); if (selected) return selected; } catch {}
    try { return localStorage.getItem("osrs-active-profile-v1") || ""; } catch { return ""; }
  }
  function destination(page) {
    const player = username();
    return page + (page !== "index.html" && player ? "?player=" + encodeURIComponent(player) : "");
  }
  function buildNavigation() {
    document.querySelectorAll("nav.bottom-nav, nav.shared-bottom-nav").forEach(el => el.remove());
    const nav = document.createElement("nav");
    nav.className = "shared-bottom-nav";
    nav.setAttribute("aria-label", "Main navigation");
    const pages = [["index.html","Home","home"],["skills.html","Skills","skills"],["bossing.html","Bossing","bossing"],["wiki.html","Wiki","wiki"],["farm.html","Timers","timers"],["more.html","More","more"]];
    for (const [page,label,icon] of pages) {
      const link = document.createElement("a");
      link.href = destination(page);
      link.dataset.navPage = page;
      if (current === page) link.setAttribute("aria-current", "page");
      link.appendChild(emoji(icon));
      const title = document.createElement("span");
      title.textContent = label;
      link.appendChild(title);
      link.addEventListener("click", () => { link.href = destination(page); });
      nav.appendChild(link);
    }
    document.body.appendChild(nav);
    document.body.dataset.sharedNav = "true";
  }
  function readTimers() {
    try {
      const timers = JSON.parse(localStorage.getItem(TIMER_KEY) || "[]");
      return Array.isArray(timers) ? timers : [];
    } catch { return []; }
  }
  function notice(message) {
    const el = document.getElementById("farm-status");
    if (el) { el.textContent = message; el.classList.add("error"); }
  }
  function commitTimers(timers) {
    try {
      const value = JSON.stringify(timers);
      localStorage.setItem(TIMER_KEY, value);
      // Tell the existing farm app to reload and render its saved data.
      window.dispatchEvent(new StorageEvent("storage", {
        key: TIMER_KEY,
        newValue: value,
        storageArea: localStorage
      }));
      return true;
    } catch {
      notice("Could not save the timer change. Browser storage must be available to pause timers.");
      return false;
    }
  }
  function changeTimer(id, action) {
    const timers = readTimers();
    const timer = timers.find(item => item && item.id === id);
    if (!timer) { notice("This timer is not available in browser storage."); return; }
    if (action === "restart") {
      if (!window.confirm("Restart " + timer.label + " from now?")) return;
      timer.paused = false;
      timer.startedAt = Date.now();
      timer.endsAt = timer.startedAt + timer.minutes * 60000;
      timer.acknowledged = false;
      timer.notified = false;
      delete timer.pauseRemainingMs;
      delete timer.pausePreviousAcknowledged;
    } else if (timer.paused) {
      const left = Math.max(0, Number(timer.pauseRemainingMs) || 0);
      timer.paused = false;
      timer.endsAt = Date.now() + left;
      timer.startedAt = timer.endsAt - timer.minutes * 60000;
      timer.acknowledged = timer.pausePreviousAcknowledged === true;
      timer.notified = false;
      delete timer.pauseRemainingMs;
      delete timer.pausePreviousAcknowledged;
    } else {
      const left = timer.endsAt - Date.now();
      if (left <= 0 || timer.acknowledged) return;
      timer.paused = true;
      timer.pauseRemainingMs = left;
      timer.pausePreviousAcknowledged = timer.acknowledged === true;
      // Compatibility with the existing farm notification checker:
      // paused timers must not be treated as due notifications.
      timer.acknowledged = true;
    }
    commitTimers(timers);
    updateIcons();
  }
  function clock(ms) {
    if (ms <= 0) return "Ready to check";
    const seconds = Math.ceil(ms / 1000);
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor(seconds % 86400 / 3600);
    const minutes = Math.floor(seconds % 3600 / 60);
    const secs = seconds % 60;
    return (days ? days + "d " : "") +
      (hours ? String(hours).padStart(2,"0") + ":" : "") +
      String(minutes).padStart(2,"0") + ":" + String(secs).padStart(2,"0");
  }
  function duration(minutes) {
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor(minutes % 1440 / 60);
    const mins = Number((minutes % 60).toFixed(1));
    return ((days ? days + "d " : "") + (hours ? hours + "h " : "") + (mins ? mins + "m" : "")).trim() || "0m";
  }
  function syncTimerCards() {
    if (current !== "farm.html") return;
    const timers = readTimers();
    for (const card of document.querySelectorAll("[data-timer-id]")) {
      const timer = timers.find(item => item && item.id === card.dataset.timerId);
      if (!timer) continue;
      const controls = card.querySelector(".timer-actions");
      if (!controls) continue;
      let pause = controls.querySelector("[data-timer-pause]");
      if (!pause) {
        pause = document.createElement("button");
        pause.type = "button";
        pause.className = "icon-button pause-button";
        pause.dataset.timerPause = "true";
        pause.addEventListener("click", () => changeTimer(card.dataset.timerId, "pause"));
        const pin = Array.from(controls.children).find(button =>
          String(button.getAttribute("aria-label") || button.title || "").toLowerCase().includes("pin")
        );
        controls.insertBefore(pause, pin || null);
      }
      const paused = timer.paused === true;
      const label = paused ? "Resume timer" : "Pause timer";
      pause.title = label;
      pause.setAttribute("aria-label", label);
      pause.setAttribute("aria-pressed", String(paused));
      pause.disabled = !paused && (timer.endsAt <= Date.now() || timer.acknowledged === true);
      paint(pause, paused ? "resume" : "pause");
      card.classList.toggle("paused", paused);
      const left = paused ? Math.max(0, Number(timer.pauseRemainingMs) || 0) : timer.endsAt - Date.now();
      const labelText = paused ? "Paused: " + clock(left) : timer.acknowledged ? "Checked" : clock(left);
      // ASCII separator avoids the damaged middle-dot character entirely.
      setText(card.querySelector(".timer-time"), labelText + " | " + duration(timer.minutes));
      const meta = card.querySelector(".timer-meta");
      if (paused) {
        setText(meta, "Estimated check: paused until resumed");
        const fill = card.querySelector(".timer-progress-fill");
        if (fill) fill.style.width = Math.min(100, Math.max(0, (1 - left / (timer.minutes * 60000)) * 100)) + "%";
      } else {
        setText(meta, "Estimated check: " + new Date(timer.endsAt).toLocaleString());
      }
    }
    for (const group of document.querySelectorAll("[data-custom-timer-id]")) {
      const timer = timers.find(item => item && item.id === group.dataset.customTimerId);
      if (timer && timer.paused) {
        setText(group.querySelector(".group-count"), "Paused: " + clock(Number(timer.pauseRemainingMs) || 0));
      }
    }
  }
  function updateIcons() {
    document.querySelectorAll(".gear,.gear-button").forEach(el => paint(el,"settings"));
    document.querySelectorAll(".close").forEach(el => paint(el,"close"));
    document.querySelectorAll(".chevron").forEach(el => paint(el,"chevron"));
    document.querySelectorAll(".timer-group,.custom-group").forEach(group => {
      const category = String(group.dataset.groupId || "").split(":")[1];
      const mapping = {herbs:"leaf",allotments:"allotments",trees:"tree",fruit:"fruit",birdhouses:"birdhouse",extras:"extras"};
      paint(group.querySelector(".group-icon"), group.classList.contains("custom-group") ? "custom" : mapping[category] || "extras");
    });
    document.querySelectorAll(".timer-actions .icon-button").forEach(button => {
      if (button.dataset.timerPause) return;
      const label = String(button.getAttribute("aria-label") || button.title || "").toLowerCase();
      if (label.includes("restart")) paint(button,"play");
      else if (label.includes("pin")) paint(button,"pin");
      else if (label.includes("mute") || label.includes("enable alert")) paint(button,button.classList.contains("alert-off") ? "bell-off" : "bell");
    });
    document.querySelectorAll("[data-feature-icon]").forEach(el => paint(el,el.dataset.featureIcon));
    syncTimerCards();
  }
  function syncLinks() {
    document.querySelectorAll("[data-nav-page]").forEach(link => {
      const href = destination(link.dataset.navPage);
      if (link.getAttribute("href") !== href) link.setAttribute("href",href);
    });
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; updateIcons(); syncLinks(); });
  }
  // A paused timer's Play button still means restart, not resume.
  document.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target : null;
    const button = target && target.closest(".timer-actions .icon-button");
    if (!button || button.dataset.timerPause) return;
    const label = String(button.getAttribute("aria-label") || button.title || "").toLowerCase();
    if (!label.includes("restart")) return;
    const card = button.closest("[data-timer-id]");
    if (!card) return;
    const timer = readTimers().find(item => item && item.id === card.dataset.timerId);
    if (timer && timer.paused) {
      event.preventDefault();
      event.stopImmediatePropagation();
      changeTimer(timer.id,"restart");
    }
  }, true);

  buildNavigation();
  updateIcons();
  syncLinks();
  new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});
  window.addEventListener("pageshow", () => { updateIcons(); syncLinks(); });
  if (current === "farm.html") setInterval(syncTimerCards,1000);
})();