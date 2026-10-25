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
Each page is its own screen with filters that fit it. runeprofile.js is the shared core
(loading, caching, filter bar, pop-up sheet); each page adds one module:
  collection-log.html        rp-collection.js (+ item-dialog.js, item-dialog.css)
  combat-achievements.html   rp-combat.js
  quests.html                rp-quests.js     (+ wiki-data.js, config.js)
  achievement-diaries.html   rp-diaries.js    (+ wiki-data.js, config.js)
They use the Netlify function /.netlify/functions/runeprofile.
- Collection Log: item cards with images; tapping one opens the same pop-up as Bossing.
- Combat Achievements: compact rows; tier / status chips, monster and type filters; tap for requirement.
- Quests: level pills (green = you meet it, red = below it, shown as have/required),
  filters for status, type, difficulty, length, storyline, level requirements and required skill;
  tap a quest for the wiki Quick guide. Difficulty, length, storyline and level requirements
  come from the OSRS Wiki and are cached in localStorage; your levels come from the Wise Old Man
  snapshot saved by the Skills page.
- Achievement Diaries: a button per tier; tap to see that tier's tasks and requirements
  (from the Wiki). Crossed out when RuneProfile reports the tier complete. RuneProfile only gives
  counts per tier, so partial tiers show "n of m" without crossing out individual tasks
  (unless RuneProfile starts returning per-task data, which is used automatically).

PRIVACY / KEYS
A key in config.js is visible to site visitors. It is not a protected secret.
Usernames and the active selection appear in page URLs for navigation.
Profiles and method text remain on this browser/device; clearing site data removes them.

SOURCE API
https://docs.wiseoldman.net/api/players/player-type-definitions
