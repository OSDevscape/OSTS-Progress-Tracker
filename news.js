(() => {
  const list = document.getElementById("osrs-news-list");
  const status = document.getElementById("news-status");
  const refresh = document.getElementById("news-refresh");
  if (!list || !status) return;

  const officialNews = "https://oldschool.runescape.com/";
  const safeText = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const dateLabel = (value) => {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(date);
  };

  function render(items) {
    list.replaceChildren();
    if (!items.length) {
      const empty = document.createElement("p");
      empty.className = "news-empty";
      empty.textContent = "No news items were returned. Visit the official OSRS news page to see the latest updates.";
      list.append(empty);
      return;
    }
    items.forEach((item) => {
      const card = document.createElement("article");
      card.className = "news-card";
      if (item.image) {
        const imageLink = document.createElement("a");
        imageLink.className = "news-image-link";
        imageLink.href = item.link;
        imageLink.target = "_blank";
        imageLink.rel = "noopener noreferrer";
        imageLink.setAttribute("aria-label", "Read: " + (safeText(item.title) || "OSRS news update"));
        const image = document.createElement("img");
        image.className = "news-image";
        image.src = item.image;
        image.alt = "";
        image.loading = "lazy";
        image.decoding = "async";
        image.referrerPolicy = "no-referrer";
        image.addEventListener("error", () => imageLink.remove(), { once: true });
        imageLink.append(image);
        card.append(imageLink);
      }
      const link = document.createElement("a");
      link.className = "news-title-link";
      link.href = item.link;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = safeText(item.title) || "OSRS news update";
      const meta = document.createElement("div");
      meta.className = "news-meta";
      if (item.category) {
        const category = document.createElement("span");
        category.className = "news-category";
        category.textContent = safeText(item.category);
        meta.append(category);
      }
      const date = dateLabel(item.date);
      if (date) {
        const dateNode = document.createElement("span");
        dateNode.textContent = date;
        meta.append(dateNode);
      }
      card.append(link, meta);
      if (item.description) {
        const summary = document.createElement("p");
        summary.className = "news-summary";
        summary.textContent = safeText(item.description).slice(0, 240);
        card.append(summary);
      }
      list.append(card);
    });
  }

  async function loadNews() {
    refresh.disabled = true;
    status.textContent = "Loading the latest OSRS announcements…";
    try {
      const response = await fetch("/.netlify/functions/osrs-news", { headers: { Accept: "application/json" }, cache: "no-store" });
      if (!response.ok) throw new Error("News feed unavailable (" + response.status + ")");
      const payload = await response.json();
      if (!Array.isArray(payload.items)) throw new Error("Unexpected news feed response");
      render(payload.items);
      status.textContent = payload.items.length ? "Latest official news from Jagex · Updated " + new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date()) : "The news feed is currently empty.";
    } catch (error) {
      list.replaceChildren();
      const fallback = document.createElement("p");
      fallback.className = "news-empty";
      fallback.textContent = "The live news feed is temporarily unavailable. You can still read the latest updates on the official OSRS news page.";
      list.append(fallback);
      status.textContent = "Live news is temporarily unavailable.";
      console.warn("OSRS news feed:", error);
    } finally {
      refresh.disabled = false;
    }
  }
  refresh?.addEventListener("click", loadNews);
  loadNews();
})();
