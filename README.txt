OSRS Progress Tracker — multi-page web app

FILES
index.html                 Gateway and saved-player list
skills.html                Skills, Gains (with levels gained) and wiki training details
bossing.html               Boss / raid completion counts, ranks and RuneProfile Collection Log
bossing-runeprofile.js     Shows RuneProfile's log for each boss on the Bossing page
collection-log.html        RuneProfile Collection Log, merged with Bossing tracking
combat-achievements.html   RuneProfile Combat Achievements
quests.html                RuneProfile Quests and miniquests
achievement-diaries.html   RuneProfile Achievement Diaries
more.html                  Links to the feature pages above, plus Timers
collection-sync.js         Shares Collection Log quantities between Bossing and RuneProfile
styles.css                 Shared styling
app.js                     Shared application logic
config.js                  API key setting

SPCK SETUP
1. Extract the archive.
2. Put ALL app files in the same SPCK project folder.
3. Edit config.js and paste your Wise Old Man key into apiKey.
4. Preview index.html using SPCK's web preview.
5. Use the bottom navigation to move between real HTML pages.

The pages must share the same preview origin for local storage to carry across.
Keep the existing storage origin/project if you want existing saved profiles.
Existing keys osrs-saved-profiles-v1 and osrs-training-plans-v1 are preserved.
If durable storage is unavailable, sessionStorage is used for the active profile;
otherwise a page can retrieve the username in its URL from Wise Old Man again.

SETTINGS
The gear icon opens a modal containing Update Stats and Change Player.
Update Stats retrieves Wise Old Man's stored snapshot; it does not trigger a
new Jagex update. Skills and Bossing share the current player's saved data.

GAINS
Skill details open a Gains dialog (Daily / Weekly / Monthly / Yearly). It shows XP
gained, the levels gained in that period (computed from the recorded start and
end XP), and a chart of recorded snapshots. Each chart point also shows the level
at that snapshot.

BOSSING
Uses latestSnapshot.data.bosses; shows the API's kills field as recorded
completions so raids and other encounters are included. Variants are separate
metrics; aggregate counts are sums of those reported metrics, not a deduplicated
kill total. Unavailable negative/missing counts are not displayed as zero.
Boss cards open a details dialog with count, rank, combat information,
strategies and a manually tracked Collection Log.

COLLECTION LOG INTEGRATION
Bossing keeps manual item quantities per player (key osrs-collection-log-v1:<player>).
RuneProfile data is saved under osrs-runeprofile-v1:<player>:collection.
- Opening Bossing copies any higher RuneProfile quantity into the manual tracker.
  Manual quantities are never lowered or removed.
- collection-log.html reads the manual quantities and merges them into
  RuneProfile's item list; page and overall item totals are recalculated.
Items are matched by name, ignoring case and punctuation.

RUNEPROFILE PAGES
The four RuneProfile pages share runeprofile.js. Each page sets its section with
<body data-rp-section="collection|combat|quests|achievements">. They use the
Netlify function /.netlify/functions/runeprofile.

PRIVACY / KEYS
A key in config.js is visible to site visitors. It is not a protected secret.
Usernames and the active selection appear in page URLs for navigation.
Profiles and method text remain on this browser/device; clearing site data removes them.

SOURCE API
https://docs.wiseoldman.net/api/players/player-type-definitions
