# CLAUDE.md

Context for Claude Code working in this repository.

## What this project is

A single-page, map-based dashboard of the 2026 Bundibugyo ebolavirus (BVD) outbreak in DRC and Uganda. It is **plain HTML/CSS/JS in one `index.html`**, using **Leaflet** and **Chart.js** loaded from CDN.

- There is **NO framework** and **NO build step**. The site runs by opening `index.html` directly in a browser.
- **Do NOT** convert it to React (or any framework), and **do NOT** add a bundler, package manager, or build tooling. Keep it as vanilla HTML/CSS/JS with CDN scripts.

## Data handling

- The WHO DON607 figures are **embedded inside `index.html`** (in the JS) and are **also mirrored in `data/`** as CSVs.
- If any figures change, **keep both copies in sync** — update the embedded data in `index.html` and the corresponding file(s) in `data/` together.
- **Never invent or estimate numbers.** Use only figures explicitly cited by **WHO** (Disease Outbreak News) or **Africa CDC**. If a number isn't in a cited source, leave it out rather than guessing.
- Keep all outputs **aggregated to health-zone level** (or coarser: province/country). Do not produce or display anything more granular than health zone.
- Keep the **"verify against WHO before publishing"** note visible in the UI. Do not remove it.
- **Two GeoJSON files in `data/` look interchangeable but are not.** `zones_sitrep0XX.geojson` carries per-zone `confirmed_cases`/`confirmed_deaths` and is what the live choropleth `fetch()`es. `zones_geometry.geojson` carries **geometry only** (46 zones, no counts) and is staged for a future CSV-driven refactor — it is **not wired up**. Do not point `fetch()` at `zones_geometry.geojson` without also changing how the choropleth reads counts, or the map will render unfilled with no error.
- `data/zones_timeseries_full.csv` (per-zone, N°055–065) and `data/national_timeseries.csv` (headline figures, N°055–065) are reference series for that refactor and are **not read at runtime**.

## Source of truth

- Primary source: **INSP situation reports** (insp.cd) through **SitRep N°065 (18 July 2026)** for DRC, plus the **Uganda Ministry of Health Ebola portal (20 July 2026)** for Uganda. WHO Disease Outbreak News, ECDC and NICD are used as cross-checks.
- Current snapshot: DRC figures as of **18 July 2026** (INSP SitRep N°065), Uganda figures as of **20 July 2026** (Uganda MoH portal).

## Design

- **Preserve the existing visual design** when making changes — the dark situation-room theme, color ramp, typography (Archivo / IBM Plex Sans / IBM Plex Mono), panel layout, and interaction model (map markers, log/linear toggle, side panels, modals). Make edits in keeping with what's already there rather than restyling.

## Structure

```
drc-ebola-tracker/
├── index.html   # the dashboard (data embedded here)
├── data/        # six CSV datasets mirrored from index.html
├── README.md
└── CLAUDE.md
```
