const BASE = "https://api.runeprofile.com/v1/accounts/";

const ROUTES = Object.freeze({
  collection: "/collection-log",
  combat: "/combat-achievements/tasks",
  quests: "/quests",
  achievements: "/achievement-diaries",
  summary: ""
});

const cache = new Map();
const pending = new Map();

function reply(statusCode, body, extra = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extra
    },
    body: JSON.stringify(body)
  };
}

async function upstream(url) {
  const headers = {
    Accept: "application/json",
    "User-Agent":
      process.env.RUNEPROFILE_USER_AGENT ||
      "OSRS-Progress-Tracker-Personal"
  };

  const key = String(
    process.env.RUNEPROFILE_API_KEY || ""
  ).trim();

  if (key) {
    headers["X-API-Key"] = key;
  }

  const response = await fetch(url, {
    headers,
    redirect: "error",
    signal: AbortSignal.timeout(12000)
  });

  if (!response.ok) {
    const errors = {
      400: "RuneProfile rejected this player name.",
      401:
        "RuneProfile rejected the API key. Remove an invalid or " +
        "placeholder RUNEPROFILE_API_KEY to use anonymous access.",
      403:
        "RuneProfile refused the request. Check any configured API key.",
      404:
        "No RuneProfile data was found for this player or section. " +
        "Check the username and RuneProfile plugin uploads.",
      429:
        "RuneProfile request limit reached. " +
        "Wait one minute before retrying."
    };

    return reply(
      Object.hasOwn(errors, response.status)
        ? response.status
        : 502,
      {
        error:
          errors[response.status] ||
          "RuneProfile returned an upstream error.",
        upstreamStatus: response.status
      },
      response.status === 429
        ? { "Retry-After": "60" }
        : {}
    );
  }

  const text = await response.text();

  if (Buffer.byteLength(text) > 4 * 1024 * 1024) {
    throw new Error("Response too large");
  }

  return reply(200, {
    source: "RuneProfile",
    fetchedAt: new Date().toISOString(),
    data: JSON.parse(text)
  });
}

export async function handler(event) {
  if (event.httpMethod !== "GET") {
    return reply(
      405,
      { error: "GET requests only." },
      { Allow: "GET" }
    );
  }

  const {
    player = "",
    section = ""
  } = event.queryStringParameters || {};

  if (
    typeof player !== "string" ||
    !/^[A-Za-z0-9 _-]{1,12}$/.test(player) ||
    !player.trim() ||
    !Object.hasOwn(ROUTES, section)
  ) {
    return reply(400, {
      error: "Choose a valid player name and section."
    });
  }

  const url =
    BASE +
    encodeURIComponent(
      player.trim().replaceAll("_", " ")
    ) +
    ROUTES[section];

  const saved = cache.get(url);

  if (saved && saved.until > Date.now()) {
    return saved.result;
  }

  if (pending.has(url)) {
    return pending.get(url);
  }

  const task = (async () => {
    try {
      const result = await upstream(url);

      if ([200, 404, 429].includes(result.statusCode)) {
        if (cache.size >= 100) {
          cache.delete(cache.keys().next().value);
        }

        cache.set(url, {
          result,
          until: Date.now() + 60000
        });
      }

      return result;
    } catch {
      return reply(502, {
        error:
          "Could not reach RuneProfile or read its response. " +
          "Saved data has been kept."
      });
    } finally {
      pending.delete(url);
    }
  })();

  pending.set(url, task);

  return task;
}