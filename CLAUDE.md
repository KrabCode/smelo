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

## Flutter sub-projects (`docs/pre/`, `docs/hand/`)

Both directories contain **generated** Flutter web build output. Edits made directly there will be overwritten on the next build. The source repos are siblings of `smelo` in `C:\Users\Krab\Documents\GitHub\`:

| Source repo | Deploys to | `--base-href` |
| --- | --- | --- |
| `poker_flash_cards` | `docs/pre/` | `/pre/` |
| `poker-hand-tracker` | `docs/hand/` | `/hand/` |

### Build & deploy

Run from the Flutter project root, **using PowerShell** (Git Bash mangles the `--base-href` value via MSYS path conversion, silently producing `<base href="/">` and breaking asset loading in production):

```powershell
# 1. Build (replace /<target>/ with /pre/ or /hand/)
flutter build web --release --base-href /<target>/

# 2. Deploy to smelo
Remove-Item -Recurse -Force ..\smelo\docs\<target>\*
Copy-Item -Recurse build\web\* ..\smelo\docs\<target>\

# 3. Commit and push BOTH the Flutter repo AND smelo
```

The `--base-href` flag is **mandatory** — without it, the deployed app will 404 on its own assets at smelo.cz/pre/ and smelo.cz/hand/. Verify with `grep "base href" docs/<target>/index.html` before pushing — the value must be `/pre/` or `/hand/`, not `/`.

### Site-wide changes that affect Flutter pages

Anything that needs to apply to `pre/` and `hand/` (e.g. analytics scripts, meta tags) must be added to the **source** `web/index.html` in the Flutter repo, not to `docs/pre/index.html` or `docs/hand/index.html`. Then rebuild + redeploy.

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
