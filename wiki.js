/* OSRS Wiki browser + custom MediaWiki reader. No framework or server required. */
"use strict";
(() => {
  const WIKI = "https://oldschool.runescape.wiki";
  const API = WIKI + "/api.php";
  const cache = new Map();

  async function api(params) {
    const url = API + "?" + new URLSearchParams({...params, format:"json", origin:"*"}).toString();
    const response = await fetch(url, {headers: {"Accept":"application/json"}});
    if (!response.ok) throw new Error("The OSRS Wiki returned HTTP " + response.status + ".");
    const data = await response.json();
    if (data.error) throw new Error(data.error.info || "The Wiki API returned an error.");
    return data;
  }
  async function search(query) {
    const q = String(query || "").trim();
    if (!q) return [];
    const data = await api({action:"query",list:"search",srsearch:q,srlimit:"10"});
    return (data.query && data.query.search || []).map(item => ({
      title:item.title, snippet:String(item.snippet || "").replace(/<[^>]*>/g,"")
    }));
  }
  async function fetchPage(title) {
    const key = String(title || "").trim();
    if (!key) throw new Error("Enter a Wiki page or search term.");
    if (cache.has(key)) return cache.get(key);
    const data = await api({action:"parse",page:key,prop:"text|displaytitle",disableeditsection:"1",disablelimitreport:"1",formatversion:"2"});
    if (!data.parse || typeof data.parse.text !== "string") throw new Error("That Wiki page could not be found.");
    const result = {title: data.parse.title || key, displayTitle: data.parse.displaytitle || data.parse.title || key, html: data.parse.text};
    cache.set(key,result);
    return result;
  }
  function safeArticle(container, html, onNavigate) {
    const doc = new DOMParser().parseFromString("<main>" + html + "</main>", "text/html");
    const root = doc.querySelector("main");
    root.querySelectorAll("script,style,link,meta,base,iframe,object,embed,form,button,input,textarea,select,video,audio,template,svg,math,.mw-editsection,.mw-indicators,.mw-parser-output > .mw-empty-elt").forEach(el => el.remove());
    for (const el of root.querySelectorAll("*")) {
      if (el.tagName === "IMG" && !el.getAttribute("src")) {
        const lazy = el.getAttribute("data-src") || el.getAttribute("data-original");
        if (lazy) el.setAttribute("src", lazy);
      }
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase();
        if (name.startsWith("on") || ["style","srcdoc","nonce","integrity"].includes(name)) el.removeAttribute(attr.name);
      }
      for (const attr of ["href","src","poster"]) {
        const value = el.getAttribute(attr);
        if (!value) continue;
        try {
          const url = new URL(value, WIKI + "/");
          if (!["https:","http:"].includes(url.protocol)) { el.removeAttribute(attr); continue; }
          if (attr === "src" && el.tagName === "IMG") {
            if (url.hostname.endsWith("runescape.wiki") || url.hostname === "oldschool.runescape.wiki") el.setAttribute(attr,url.href);
            else el.removeAttribute(attr);
          } else if (attr === "href" && el.tagName === "A") {
            el.setAttribute(attr,url.href);
            if (url.hostname === "oldschool.runescape.wiki" || url.hostname.endsWith(".oldschool.runescape.wiki")) {
              el.dataset.wikiHref = url.href;
              el.removeAttribute("target");
            } else {
              el.setAttribute("target","_blank");
              el.setAttribute("rel","noopener noreferrer");
            }
          } else if (attr !== "src") el.setAttribute(attr,url.href);
        } catch { el.removeAttribute(attr); }
      }
    }
    const fragment = document.createDocumentFragment();
    while (root.firstChild) fragment.appendChild(document.importNode(root.firstChild,true)), root.removeChild(root.firstChild);
    container.replaceChildren(fragment);
    container.onclick = event => {
      const a = event.target instanceof Element ? event.target.closest("a[data-wiki-href]") : null;
      if (!a) return;
      const url = new URL(a.href);
      if (url.hash && url.pathname === location.pathname && !url.pathname.startsWith("/w/")) return;
      if (url.pathname.startsWith("/w/")) {
        event.preventDefault();
        const title = decodeURIComponent(url.pathname.slice(3)).replace(/_/g," ");
        if (title && typeof onNavigate === "function") onNavigate(title);
      }
    };
  }
  function wikiUrl(title) { return WIKI + "/w/" + encodeURIComponent(String(title).trim().replace(/ /g,"_")); }
  window.OSRSWiki = {search, fetchPage, safeArticle, wikiUrl, base:WIKI};

  function initPage() {
    const root = document.getElementById("wiki-page");
    if (!root) return;
    const form = document.getElementById("wiki-search-form");
    const input = document.getElementById("wiki-search");
    const status = document.getElementById("wiki-status");
    const results = document.getElementById("wiki-results");
    const article = document.getElementById("wiki-article");
    const back = document.getElementById("wiki-back"), forward = document.getElementById("wiki-forward");
    const refresh = document.getElementById("wiki-refresh"), address = document.getElementById("wiki-address");
    const external = document.getElementById("wiki-open-external");
    const suggestions = document.getElementById("wiki-suggestions");
    const categories = Array.from(root.querySelectorAll("[data-wiki-title]"));
    let history = [], historyIndex = -1, loading = false, suggestionTimer = 0, searchSequence = 0;
    const say = text => { status.textContent = text || ""; };
    function syncNav() {
      back.disabled = historyIndex <= 0;
      forward.disabled = historyIndex >= history.length - 1;
      const title = history[historyIndex] || "";
      address.value = title || "Old School RuneScape Wiki";
      external.href = title ? OSRSWiki.wikiUrl(title) : OSRSWiki.base;
      categories.forEach(button => button.classList.toggle("is-active", button.dataset.wikiTitle === title));
    }
    function showSuggestions(items) {
      suggestions.replaceChildren();
      if (!items.length) { suggestions.hidden = true; return; }
      for (const item of items.slice(0, 6)) {
        const button = document.createElement("button"); button.type = "button"; button.className = "wiki-suggestion"; button.role = "option";
        const title = document.createElement("strong"); title.textContent = item.title;
        const snippet = document.createElement("span"); snippet.textContent = item.snippet || "Read article";
        button.append(title, snippet);
        button.addEventListener("click", () => { input.value = item.title; suggestions.hidden = true; loadTitle(item.title); });
        suggestions.append(button);
      }
      suggestions.hidden = false;
    }
    function showResults(items) {
      results.replaceChildren();
      if (!items.length) { results.hidden = true; return; }
      const heading = document.createElement("h2"); heading.className="wiki-results-heading"; heading.textContent="Search results";
      results.append(heading);
      for (const item of items) {
        const b = document.createElement("button"); b.type="button"; b.className="wiki-result";
        const title = document.createElement("strong"); title.textContent=item.title;
        const snippet = document.createElement("span"); snippet.textContent=item.snippet || "Open Wiki article";
        b.append(title,snippet); b.addEventListener("click",()=>loadTitle(item.title)); results.append(b);
      }
      results.hidden = false;
    }
    async function doSearch(q) {
      if (!q.trim()) return;
      say("Searching the OSRS Wiki…"); results.hidden=true; suggestions.hidden=true;
      try {
        const items = await OSRSWiki.search(q);
        showResults(items); say(items.length ? "Choose an article to read it here." : "No matching pages found.");
        if (items.length === 1) loadTitle(items[0].title);
      } catch (error) { say(error.message || "Wiki search failed. Check your internet connection and try again."); }
    }
    async function loadTitle(title, replace=false) {
      if (!title || loading) return;
      loading = true; say("Loading " + title + "…"); article.replaceChildren();
      const spinner=document.createElement("p"); spinner.className="wiki-loading"; spinner.textContent="Loading article…"; article.append(spinner);
      try {
        const page = await OSRSWiki.fetchPage(title);
        if (!replace) { history = history.slice(0,historyIndex+1); history.push(page.title); historyIndex++; }
        else if (historyIndex < 0) { history=[page.title]; historyIndex=0; }
        const h=document.createElement("h1"); h.className="wiki-article-title"; h.textContent=page.displayTitle.replace(/<[^>]*>/g,"");
        article.replaceChildren(h);
        const body=document.createElement("div"); body.className="wiki-article-content"; article.append(body);
        OSRSWiki.safeArticle(body,page.html,t=>{input.value=t;loadTitle(t);});
        showResults([]); suggestions.hidden = true; say("Reading: " + page.title); syncNav();
      } catch (error) { article.replaceChildren(); say((error.message || "Could not load that page.") + " Try another search."); }
      finally { loading=false; }
    }
    form.addEventListener("submit",e=>{e.preventDefault(); const q=input.value.trim(); if(q) doSearch(q);});
    input.addEventListener("input", () => {
      clearTimeout(suggestionTimer);
      const q = input.value.trim();
      if (q.length < 2) { suggestions.hidden = true; return; }
      const sequence = ++searchSequence;
      suggestionTimer = setTimeout(async () => {
        try { const items = await OSRSWiki.search(q); if (sequence === searchSequence && input.value.trim() === q) showSuggestions(items); }
        catch { if (sequence === searchSequence) suggestions.hidden = true; }
      }, 220);
    });
    input.addEventListener("keydown", e => { if (e.key === "Escape") suggestions.hidden = true; });
    document.addEventListener("click", e => { if (!e.target.closest(".wiki-search-form")) suggestions.hidden = true; });
    categories.forEach(button => button.addEventListener("click", () => { const title = button.dataset.wikiTitle; input.value = title; loadTitle(title); }));
    back.addEventListener("click",()=>{if(historyIndex>0){historyIndex--;loadTitle(history[historyIndex],true);syncNav();}});
    forward.addEventListener("click",()=>{if(historyIndex<history.length-1){historyIndex++;loadTitle(history[historyIndex],true);syncNav();}});
    refresh.addEventListener("click",()=>{if(historyIndex>=0){cache.delete(history[historyIndex]);loadTitle(history[historyIndex],true);}});
    address.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();const value=address.value.trim();if(value){try{const url=new URL(value);if(url.hostname.endsWith("runescape.wiki")){const title=decodeURIComponent(url.pathname.split("/w/")[1]||"Old School RuneScape Wiki").replace(/_/g," ");input.value=title;loadTitle(title);return;}}catch{}input.value=value;loadTitle(value);}}});
    const initial = new URLSearchParams(location.search).get("page");
    if (initial) { input.value=initial; loadTitle(initial); }
    else loadTitle("Old School RuneScape Wiki");
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded",initPage,{once:true}); else initPage();
})();