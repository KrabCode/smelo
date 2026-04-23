# smelo.cz

Static site hosted on GitHub Pages at **smelo.cz**. Everything under `docs/` is the web root.

## Project structure

```
docs/
├── index.html, style.css, base.css   # Landing page & shared styles
├── turnaj/                            # Poker tournament display (Firebase-backed)
│   ├── tv/app.js, index.html, style.css       # TV/projector display (read-only, shown to players)
│   ├── tv/admin/app.js, index.html, style.css # Admin console (password-protected)
│   ├── assets/fish-config.js                  # Animated fish decorations
│   ├── print.html                             # Printable tournament info
│   └── index.html                             # Entry point
├── teorie/                            # Poker theory articles (static HTML pages)
├── text/                              # Shareable text page (URL-based via ?t= param)
├── hand/                              # Flutter web app (hand-related)
├── pre/                               # Flutter web app
├── input/                             # Google Apps Script + web form
├── privacy/                           # Privacy policy
├── chart.js, suits.js                 # Shared JS utilities
└── assets/, reveal.js/                # Shared assets & presentation framework
```

## Poker tournament system (`docs/turnaj/tv/`)

The main feature. Firebase Realtime Database syncs state between the admin console and TV display.

### Key files
- **`tv/app.js`** (~1250 lines) — TV display: blind timer, seating charts, payout table, winner banner, event feed, fish animations
- **`tv/admin/app.js`** (~1870 lines) — Admin console: all tournament controls, player management, payout config, blind editing, seating, sounds

### Firebase data model
Tournament state lives under a single `tournament/` ref with children: `config`, `state`, `players`, `blindStructure`, `blindOverrides`, `payoutConfig`, `tableLocks`, `eventLog`, `breakMessages`, `breakLabels`, `rules`, `notes`, and sound refs.

### Prize pool calculation (appears in multiple places!)
The prize pool formula is: `totalBuys * buyInAmount + addons * addonPrice - organizerFee`

This calculation exists in **6 places** — 3 in `tv/app.js` (payout table, winner banner, knockout feed) and 3 in `admin/app.js` (pool display, payout config render, payout config drag). When modifying the formula, update all 6.

### Config fields (saved to Firebase `tournament/config`)
`startingStack`, `levelDuration`, `maxLevels`, `startTime`, `bonusAmount`, `levelsPerBreak`, `breakDuration`, `maxBreaks`, `buyInAmount`, `addonChips`, `addonAmount`, `anteMult`, `organizerFee`

### UI language
The tournament UI is in **Czech**. Use Czech for all user-facing labels and hints.

## Results chart (`docs/chart.js`)

Reads the results CSV from a published Google Sheet. **Assume CSV rows are in chronological order** (oldest → newest); the last row is the most recent session. Existing logic (cutoff slicing, "present in last session" filter override) relies on this.
