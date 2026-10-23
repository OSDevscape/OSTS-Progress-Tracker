OSRS Progress Tracker — multi-page web app

FILES
index.html   Gateway and saved-player list
skills.html  Skills and selected wiki training details
bossing.html Boss / raid completion counts and ranks
styles.css   Shared styling
app.js       Shared application logic
config.js    API key setting

SPCK SETUP
1. Extract the archive.
2. Put ALL six app files in the same SPCK project folder.
3. Edit config.js and paste your Wise Old Man key into apiKey.
4. Preview index.html using SPCK's web preview.
5. Use the Skills / Bossing tabs to navigate between real HTML pages.

No npm, framework, build process, or server code is included.
The pages must share the same preview origin for local storage to carry across.
Keep the existing storage origin/project if you want existing saved profiles.
Existing keys osrs-saved-profiles-v1 and osrs-training-plans-v1 are preserved.
If durable storage is unavailable, sessionStorage is used for the active profile;
otherwise a page can retrieve the username in its URL from Wise Old Man again.

SETTINGS
The gear icon opens a modal containing Update Stats and Change Player.
Update Stats retrieves Wise Old Man's stored snapshot; it does not trigger a
new Jagex update. Skills and Bossing share the current player's saved data.

BOSSING
Uses latestSnapshot.data.bosses; shows the API's kills field as recorded
completions so raids and other encounters are included. Variants are separate
metrics; aggregate counts are sums of those reported metrics, not a deduplicated
kill total. Unavailable negative/missing counts are not displayed as zero.
Boss cards open a details dialog with count, rank, and a wiki search link.
This first version does not infer gear, quest unlocks, or boss readiness.

WIKI
wiki.html is the dedicated OSRS Wiki browser. The shared bottom navigation
OSRS Wiki is available as a dedicated article reader and floating reader overlay; the embedded full-site view has been removed.
ui.js. The floating window can be dragged, resized on desktop, minimized,
expanded to the dedicated page, or closed.

OSRS Wiki is available as a dedicated article reader and floating reader overlay; the embedded full-site view has been removed.
may prohibit framing in some browsers. If the embedded page is blank or blocked,
OSRS Wiki is available as a dedicated article reader and floating reader overlay; the embedded full-site view has been removed.
search and render article content, with sanitized HTML and internal article
links routed inside the reader. Interactive Wiki tools, scripts, some templates,
OSRS Wiki is available as a dedicated article reader and floating reader overlay; the embedded full-site view has been removed.

The reader requires a network connection and browser access to the OSRS Wiki API.
The feature does not add an account, tracker server, or new API key. The floating
window and dedicated page share the existing dark brown/gold theme.

PRIVACY / KEYS
A key in config.js is visible to site visitors. It is not a protected secret.
Usernames and the active selection appear in page URLs for navigation.
Profiles and method text remain on this browser/device; clearing site data removes them.

SOURCE API
https://docs.wiseoldman.net/api/players/player-type-definitions
