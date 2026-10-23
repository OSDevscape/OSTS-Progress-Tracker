# Deploy OSRS Progress Tracker to Netlify (including OSRS newsfeed)

The newsfeed calls `/.netlify/functions/osrs-news`. A 404 at that URL means the Netlify Function was not included in the active deployment. Updating files in a ZIP on your computer does not update the live website by itself.

## Required project layout

Deploy the project folder that contains all of these at its top level:

- `netlify.toml`
- `package.json`
- `scripts/build.mjs`
- `netlify/functions/osrs-news.mjs`
- `index.html`

Do **not** set the Netlify base directory to `public` or to a folder that does not contain `netlify/functions/osrs-news.mjs`. `public` is the build output folder, not the project root.

## Netlify build settings

In **Site configuration → Build & deploy → Build settings**, use:

- **Base directory:** blank / repository root (or the exact project root folder if your repo stores the app in a subfolder)
- **Build command:** `npm run build`
- **Publish directory:** `public`
- **Functions directory:** `netlify/functions` (also configured in `netlify.toml`)

Commit and push these files to the Git repository connected to the site, then trigger a new deploy. A drag-and-drop static deploy does not run the build command or bundle Netlify Functions; use Git-connected deployment or the Netlify CLI for this project.

## Verify after deployment

Open:

`https://osrs-progress-tracker.netlify.app/.netlify/functions/osrs-news`

A successful response is JSON with an `items` array. If it still returns 404, check the deploy log for function discovery/bundling and confirm the deployed commit includes `netlify/functions/osrs-news.mjs` and `netlify.toml`. If it returns 502, the function is deployed but cannot retrieve the official Jagex feed.
