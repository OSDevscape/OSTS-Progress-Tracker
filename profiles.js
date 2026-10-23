"use strict";
(() => {
  const list = document.getElementById("saved-list");
  if (!list) return;
  const expanded = new Set();
  
  function identity(value) {
    return String(value || "").trim().toLowerCase().split("_").join(" ");
  }
  
  function addText(parent, className, value) {
    const element = document.createElement("span");
    element.className = className;
    element.textContent = value;
    parent.appendChild(element);
    return element;
  }
  
  function addStat(parent, label, value) {
    if (!value) return;
    const row = document.createElement("div");
    row.className = "saved-stat-row";
    row.style.display = "flex";
    row.style.alignItems = "baseline";
    row.style.flexWrap = "wrap";
    row.style.columnGap = "8px";
    row.style.marginTop = "4px";
    const labelElement = addText(row, "saved-stat-label", label);
    labelElement.style.flexShrink = "0";
    const valueElement = addText(row, "saved-stat-value", value);
    valueElement.style.textAlign = "left";
    valueElement.style.overflowWrap = "anywhere";
    parent.appendChild(row);
  }
  
  function numericCharacter(character) {
    const code = character.charCodeAt(0);
    return (code >= 48 && code <= 57) || character === "," || character === ".";
  }
  
  function extractLevel(value) {
    const prefix = "Total level ";
    const start = value.indexOf(prefix);
    if (start < 0) return "Unavailable";
    let result = "";
    for (const character of value.slice(start + prefix.length)) {
      if (!numericCharacter(character)) break;
      result += character;
    }
    return result || "Unavailable";
  }
  
  function extractXp(value) {
    const end = value.lastIndexOf(" XP");
    if (end < 0) return "Unavailable";
    let start = end;
    while (start > 0 && numericCharacter(value[start - 1])) start--;
    return value.slice(start, end) || "Unavailable";
  }
  
  function convertCard(card) {
    if (card.tagName === "DETAILS") return;
    const name = card.querySelector(".saved-name");
    const actions = card.querySelector(".saved-actions");
    if (!name || !actions) return;
    
    const profileId = identity(name.textContent);
    const meta = Array.from(card.querySelectorAll(".saved-meta"))
      .map(element => element.textContent.trim());
    const totalText = meta.find(value => value.startsWith("Total level ")) || "";
    const level = extractLevel(totalText);
    const xp = extractXp(totalText);
    const snapshot = meta.find(value => value.startsWith("Snapshot: "));
    const checked = meta.find(value => value.startsWith("Last checked: "));
    
    const details = document.createElement("details");
    details.className = "saved-card saved-player-dropdown";
    details.dataset.profileId = profileId;
    details.open = expanded.has(profileId);
    
    const summary = document.createElement("summary");
    summary.className = "saved-player-summary";
    summary.style.display = "grid";
    summary.style.gridTemplateColumns = "max-content minmax(0, 1fr)";
    summary.style.columnGap = "6px";
    summary.style.rowGap = "3px";
    summary.style.alignItems = "center";
    name.style.gridColumn = "1 / -1";
    name.style.display = "block";
    name.style.fontWeight = "700";
    summary.appendChild(name);
    const levelElement = addText(summary, "saved-level", "Lvl " + level);
    levelElement.style.gridColumn = "1";
    const arrow = addText(summary, "dropdown-chevron", ">");
    arrow.setAttribute("aria-hidden", "true");
    arrow.style.gridColumn = "2";
    arrow.style.justifySelf = "start";
    
    const body = document.createElement("div");
    body.className = "saved-player-body";
    const stats = document.createElement("div");
    stats.className = "saved-player-stats";
    stats.style.display = "block";
    stats.style.paddingTop = "8px";
    stats.style.fontSize = "11px";
    addStat(stats, "Total XP", xp);
    addStat(stats, "Snapshot", snapshot ? snapshot.slice(10) : "");
    addStat(stats, "Last checked", checked ? checked.slice(14) : "");
    
    // Move the original controls without losing their event handlers.
    const remove = card.querySelector(".remove-profile");
    if (remove) {
      remove.classList.add("compact-remove");
      remove.textContent = "x";
      actions.appendChild(remove);
    }
    body.append(stats, actions);
    details.append(summary, body);
    details.addEventListener("toggle", () => {
      if (!details.isConnected) return;
      if (details.open) expanded.add(profileId);
      else expanded.delete(profileId);
    });
    card.replaceWith(details);
  }
  
  function updateDropdowns() {
    for (const card of Array.from(list.children)) {
      if (card.classList.contains("saved-card")) convertCard(card);
    }
  }
  
  const outerArrow = document.querySelector(
    "#saved-profiles > summary > .dropdown-chevron"
  );
  if (outerArrow) outerArrow.textContent = ">";
  const observer = new MutationObserver(updateDropdowns);
  observer.observe(list, { childList: true });
  updateDropdowns();
})();