# Bundibugyo 2026 · outbreak site (React + Vite)

The Code for Africa site for the 2026 Bundibugyo virus disease outbreak: a map-first explorer, a
scroll-driven briefing, trends, country profiles, an early-warning section (not active yet) and
data & methods. It reads the tracker's data **without changing it**.

## Run

```bash
npm install
npm run data      # copy figures from ../config.drc-bvd-2026.js and ../data/ into src/data/
npm run dev       # local server
npm run build     # dist/ for GitHub Pages
```

`npm run data` expects to sit in a folder inside the tracker repository (paths `../config…`,
`../data/…`). It copies fields one for one; it never edits a value.

## Where things are

| Path | What |
|---|---|
| `src/lib/data.ts` | Every figure the site shows, read from `src/data/tracker.json`; all derived values (daily changes, gaps, shares) and how each is derived |
| `src/lib/briefing.ts` | The briefing's steps, generated from the data |
| `src/components/map/` | Leaflet map: bubbles, country drill-down, zones, flows, labels |
| `src/views/` | Map explorer, briefing |
| `src/sections/` | Trends, countries, methods |
| `src/components/Ews.tsx` | Early-warning view (empty state until thresholds exist) |
| `src/index.css` | Design tokens: Code for Africa palette and type, light and dark |
| `scripts/` | `extract.cjs` (config → JSON), `first_listed.cjs` (first SitRep listing each zone) |
| `src/data/admin1.json` | Kenya counties, Nigeria states: geoBoundaries gbOpen ADM1, CC BY 4.0 |

## Rules carried over from the tracker

Figures only from each country's public-health authority; never estimated, interpolated or
redistributed; gaps shown as gaps (dashed, labelled); "no data" never drawn as zero; mobility
always labelled as Flowminder / Vodacom April 2026 estimates; "Verify against WHO before
publishing" always visible. Early-warning levels stay empty until the epidemiology team supplies
indicators and thresholds.
