const FEED_URL = "https://secure.runescape.com/m=news/latest_news.rss?oldschool=true";
const NEWS_PAGE_URL = "https://oldschool.runescape.com/news";
const headers = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "public, max-age=300"
};

function decodeEntities(value = "") {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function field(xml, tag) {
  const expression = new RegExp(String.raw`<${tag}\b[^>]*>([\s\S]*?)<\/${tag}>`, "i");
  const match = xml.match(expression);
  return match ? decodeEntities(match[1]) : "";
}

function safeNewsLink(rawLink) {
  try {
    const parsed = new URL(rawLink, "https://oldschool.runescape.com/");
    if (parsed.protocol === "https:" && /(^|\.)runescape\.com$/i.test(parsed.hostname)) return parsed.href;
  } catch {}
  return NEWS_PAGE_URL;
}

function safeImageUrl(rawUrl) {
  if (!rawUrl) return "";
  try {
    const parsed = new URL(rawUrl, "https://oldschool.runescape.com/");
    return parsed.protocol === "https:" && !parsed.username && !parsed.password ? parsed.href : "";
  } catch { return ""; }
}

// Read one attribute from a tag, regardless of attribute order.
function attr(tag, name) {
  const match = tag.match(new RegExp(String.raw`\b${name}\s*=\s*["']([^"']+)["']`, "i"));
  return match ? decodeEntities(match[1]) : "";
}

// The official feed puts each post's custom thumbnail in <enclosure type="image/..." url="..." />.
// Attributes appear as type-then-url, so they must be parsed independently of order.
function imageFromItem(item) {
  for (const match of item.matchAll(/<enclosure\b[^>]*>/gi)) {
    const tag = match[0];
    const type = attr(tag, "type");
    if (type && !/^image\//i.test(type)) continue;
    const url = safeImageUrl(attr(tag, "url"));
    if (url) return url;
  }
  const fallbacks = [
    item.match(/<media:thumbnail\b[^>]*\burl\s*=\s*["']([^"']+)["']/i)?.[1],
    item.match(/<media:content\b[^>]*\burl\s*=\s*["']([^"']+)["']/i)?.[1],
    item.match(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i)?.[1]
  ];
  return safeImageUrl(fallbacks.find(Boolean) || "");
}

function ogImage(html) {
  const match = html.match(/<meta\b[^>]*(?:property|name)\s*=\s*["'](?:og:image|twitter:image)["'][^>]*content\s*=\s*["']([^"']+)["']/i)
    || html.match(/<meta\b[^>]*content\s*=\s*["']([^"']+)["'][^>]*(?:property|name)\s*=\s*["'](?:og:image|twitter:image)["']/i);
  return safeImageUrl(match?.[1] || "");
}

function articleImages(html) {
  const found = [];
  for (const tagMatch of html.matchAll(/<(?:img|source)\b[^>]*>/gi)) {
    const tag = tagMatch[0];
    for (const attrMatch of tag.matchAll(/\b(?:src|data-src|data-original|data-lazy-src|srcset)\s*=\s*["']([^"']+)["']/gi)) {
      const raw = attrMatch[1].split(',')[0].trim().split(/\s+/)[0].replace(/&amp;/g, '&');
      const url = safeImageUrl(raw);
      if (!url || found.includes(url)) continue;
      found.push(url);
    }
  }
  for (const match of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    const url = safeImageUrl(match[1].replace(/&amp;/g, '&'));
    if (!url || found.includes(url)) continue;
    try {
      const parsed = new URL(url);
      if (/(^|\.)cdn\.runescape\.com$/i.test(parsed.hostname)
        && /\/assets\/img\/external\/oldschool\//i.test(parsed.pathname)) found.unshift(url);
    } catch {}
  }
  return found.find((url) => {
    try {
      const parsed = new URL(url);
      return /(^|\.)cdn\.runescape\.com$/i.test(parsed.hostname)
        && /\/assets\/img\/external\/oldschool\//i.test(parsed.pathname);
    } catch { return false; }
  }) || found.find((url) => /(^|\.)cdn\.runescape\.com$/i.test(new URL(url).hostname)) || found[0] || '';
}

// Scrape the article page ONLY for items that have no feed thumbnail.
// The feed's own per-post thumbnail is authoritative and is never overridden.
async function addArticleImages(items, requestHeaders) {
  return Promise.all(items.map(async (item) => {
    if (item.image) return item;
    try {
      const response = await fetch(item.link, { headers: requestHeaders, signal: AbortSignal.timeout(6500) });
      if (!response.ok) return item;
      const html = (await response.text()).slice(0, 1_500_000);
      return { ...item, image: ogImage(html) || articleImages(html) || '' };
    } catch { return item; }
  }));
}

function parseRss(xml) {
  return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)]
    .slice(0, 8)
    .map(({ 1: item }) => ({
      title: field(item, "title"),
      link: safeNewsLink(field(item, "link")),
      date: field(item, "pubDate"),
      category: field(item, "category"),
      description: field(item, "description").slice(0, 400),
      image: imageFromItem(item)
    }))
    .filter((item) => item.title);
}

function parseNewsPage(html) {
  const results = [];
  const seen = new Set();
  for (const match of html.matchAll(/<a\b([^>]*href\s*=\s*["']([^"']+)["'][^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = match[2];
    const title = decodeEntities(match[3]);
    if (!title || title.length < 8 || /^(read more|view all|login|play now)$/i.test(title)) continue;
    let url;
    try { url = new URL(href, NEWS_PAGE_URL); } catch { continue; }
    if (!/(^|\.)runescape\.com$/i.test(url.hostname) || url.protocol !== "https:") continue;
    if (!/news|article|update|game.?update/i.test(url.href)) continue;
    if (seen.has(url.href)) continue;
    seen.add(url.href);
    results.push({ title, link: url.href, date: "", category: "OSRS News", description: "Read the official announcement from Jagex." });
    if (results.length >= 8) break;
  }
  return results;
}

export default async () => {
  try {
    const requestHeaders = {
      "user-agent": "Mozilla/5.0 (compatible; OSRS-Progress-Tracker/1.1)",
      accept: "application/rss+xml, application/xml, text/xml, text/html;q=0.9, */*;q=0.8"
    };

    try {
      const response = await fetch(FEED_URL, { headers: requestHeaders, signal: AbortSignal.timeout(10000) });
      if (response.ok) {
        const items = parseRss(await response.text());
        if (items.length) {
          const withImages = await addArticleImages(items, requestHeaders);
          return new Response(JSON.stringify({ items: withImages, source: "rss" }), { status: 200, headers });
        }
      }
    } catch {
      // Continue to the official page fallback below.
    }

    const pageResponse = await fetch(NEWS_PAGE_URL, { headers: requestHeaders, signal: AbortSignal.timeout(10000) });
    if (!pageResponse.ok) throw new Error(`Official news page returned ${pageResponse.status}`);
    const items = parseNewsPage(await pageResponse.text());
    if (!items.length) throw new Error("No official news articles could be extracted");
    const withImages = await addArticleImages(items, requestHeaders);
    return new Response(JSON.stringify({ items: withImages, source: "official-page" }), { status: 200, headers });
  } catch {
    return new Response(JSON.stringify({ error: "Unable to retrieve official OSRS news right now.", items: [] }), {
      status: 502,
      headers: { ...headers, "cache-control": "no-store" }
    });
  }
};
