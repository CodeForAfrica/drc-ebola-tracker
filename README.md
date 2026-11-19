# DRC · Uganda — Ebola Bundibugyo 2026 Tracker

An interactive, map-based dashboard of the 2026 Bundibugyo ebolavirus (BVD) outbreak in the Democratic Republic of the Congo and Uganda. It shows confirmed cases by Ituri health zone on a Leaflet map, with a log/linear color scale, active-case markers, side panels (current snapshot, trends, context), and a national/provincial response summary. The interface is bilingual (English / French) with a 🌐 toggle in the header that remembers your choice.

## Run it

No build step and no server required — just open `index.html` in any modern web browser. An internet connection is needed for the map tiles, fonts, and the WHO figures to load.

## Data

- **Source:** World Health Organization, Disease Outbreak News [DON607](https://www.who.int/emergencies/disease-outbreak-news/item/2026-DON607).
- **As of:** DRC figures 10 June 2026; Uganda figures 11 June 2026.
- The six CSVs in `data/` are transcribed from DON607 (cases by health zone, province and country summaries, contact tracing, cumulative trend, and WHO risk levels). Each row carries its own source attribution.

> **Note:** the sections above describe the original WHO DON607 build. The live dashboard now tracks **INSP situation reports** (the current snapshot and figures live in `config.drc-bvd-2026.js` and the dated files in `data/`); see [CLAUDE.md](CLAUDE.md) for the authoritative current state. The figures above are not updated here to avoid a second, drifting copy.

## React site (`site/`)

A second front end (React + TypeScript + Vite + Tailwind + Leaflet + Recharts) in Code for Africa's visual identity lives in `site/`. It is a **read-only view of this repo's data** — it holds no figures of its own.

```bash
cd site
npm install
npm run data     # copies figures from ../config.drc-bvd-2026.js and ../data/ into src/data/*.json (no value edited)
npm run build    # type-check + Vite build → site/dist/
npm run dev      # local dev server
```

Deployed by `.github/workflows/pages.yml` (GitHub Pages): it runs `npm run data` on every build — so a SitRep update to the config reaches the site automatically — and copies the **unchanged** vanilla tracker to **`/explore/`** in the published output. See the "Site (React)" section of [CLAUDE.md](CLAUDE.md) for the data-flow rules.

> This front end and its build step, the Code for Africa visual identity, the CARTO basemap tiles, and the geoBoundaries ADM1 outlines (Kenya/Nigeria; CC BY 4.0, geometry only) **amend standing project rules and require maintainer approval before merge** (see CLAUDE.md). Until the new site reaches feature parity (EN/FR, time filter, CFR & Risk indicators, contact-tracing/suspect markers, full Methods text, zone search), the vanilla tracker is kept under `/explore/`.

### Open items (site)
- Swap the Code for Africa text lockup in `src/components/TopNav.tsx` for the official logo file.
- Create the social card `og-card.png` referenced by `site/index.html`.
- Health-facilities layer and early-warning thresholds await upstream inputs (epidemiology team / shared data).
- Bundle is ~1.9 MB JS (the config geometry is bundled) — acceptable, can be split later.

## Structure

```
drc-ebola-tracker/
├── index.html   # the dashboard
├── data/        # six CSV datasets (WHO DON607)
└── README.md
```

## Before publishing

Outbreak figures change rapidly and are frequently revised in later reports. **Verify all numbers against the latest WHO Disease Outbreak News before publishing or sharing this dashboard.** This is an independent visualisation for humanitarian information purposes and is not an official WHO product.

The French translations (in the `I18N` object in `index.html`) are AI-assisted drafts. **Have a Francophone reviewer check them before publishing** — especially medical and epidemiological terms, against WHO French (OMS) usage. Place names, figures, and the CSV downloads are intentionally left untranslated.
