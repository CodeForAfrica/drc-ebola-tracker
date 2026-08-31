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
- `data/zones_timeseries_full.csv` (per-zone) and `data/national_timeseries.csv` (headline figures) are reference series for that refactor and are **not read at runtime**.
- Health zone count is 51 as of N°082. Beyond Adja (N°066) and Rungu (N°070): Kabondo (Tshopo, N°077), Wanie-Rukula (Tshopo, N°079) and Lubero (Nord-Kivu, N°080). Geometry, centroid and population for all five came from the INRB-UMIE archived shapefile, not from INSP. The shapefile spells Wanie-Rukula as "Wanierukula".
- Zone-name spellings change between sitreps and must be canonicalised on ingest. INSP writes Nia-Nia through N°068 and "Nia Nia" from N°069; Gety through N°068 and "Gethy" from N°069. The repo keys are Nia-Nia and Gety. An un-aliased name does not error — it silently fails to join and the zone drops off the map.
- SitRep N°069 is a source restatement and breaks the per-zone series. National cumulative moved 2536 -> 2905 while N°069 reported only 97 new confirmations; deaths moved +236 against a stated +62. Counts were re-attributed between zones (Bunia deaths -53, Rwampara +81) and the 17 previously unassigned cases were distributed into named zones. Per-zone figures before and after N°069 are NOT comparable. Any trend rendering spanning N°068->N°069 must show a break or start at N°069.
- data/zones_timeseries.csv is date-keyed and mixes two sources: rows before 2026-07-08 are backfilled from INRB-UMIE, rows from 2026-07-08 are transcribed from INSP sitrep PDFs. data/zones_timeseries_sourced.csv carries the same rows with a Source column and is the version to cite.
- Uganda's outbreak was declared over on 28 July 2026. Its figures are final and must not be updated by DRC sitrep cycles. It remains in the regional cumulative; removing it would silently change every historical composite figure.
- Sitrep coverage has gaps. N°059 and N°063 have no zone rows; N°075 and N°076 are not ingested, leaving a two-day gap between 27 and 30 July. Day-over-day deltas cannot be verified across a gap, and any trend rendering must not interpolate across missing dates.
- N°081 has 2 Nord-Kivu deaths reported at province level but not attributed to any health zone, so its zone rows sum to 1749 deaths against a headline of 1751. Zone rows are stored as published. The gap closes at N°082. Where a per-zone sum is displayed alongside a headline figure, they will not match for N°081.
- **SPLIT STATE (as of N°106).** The DRC *national* headline is N°106 (28 Aug 2026: 5945 cases / 2862 deaths / CFR 48.1% / 1327 recovered) but the *health-zone* layer — the HZ array, POP, the per-sitrep GeoJSON, the choropleth scale breaks and the trends series — is still N°082 (04 Aug 2026), with sitreps 083–105 pending. National totals therefore do NOT equal the zone sums. The per-zone share denominator (`DRC_CONFIRMED_TOTAL` = 3973) and the Methods CFR (1801/3973 ≈ 45.3%) are deliberately pinned to the N°082 zone table and must not track the national figure. National cases/deaths live in the `DRC_NAT_CASES` / `DRC_NAT_DEATHS` constants, separate from the zone-derived `drcCases` / `drcDeaths`.
- N°093 recognises a sixth affected province, **Bas-Uélé**, which appears in the national total only. It needs geometry, centroid and population from the INRB-UMIE archived shapefile before it can render as a health zone; until then it is named in the Methods copy but not mapped.
- `data/national_timeseries.csv` currently jumps from N°065 to the appended N°106 row; 066–105 are absent rather than interpolated (the prepared full series has not been supplied). Do not interpolate across the gap.

## Source of truth

- Primary source: **INSP situation reports** (insp.cd). **Split state:** the DRC *national* headline is **SitRep N°106 (28 August 2026)** while the *health-zone* breakdown remains **SitRep N°082 (04 August 2026)** — zone reconciliation through N°106 is pending (see Data handling). Uganda: **Ministry of Health** — outbreak declared over 28 July 2026, figures final at 20 confirmed / 2 deaths / 18 recoveries. WHO Disease Outbreak News, ECDC and NICD are used as cross-checks.
- Current snapshot: DRC national as of **28 August 2026** (INSP SitRep N°106); DRC health-zone map as of **04 August 2026** (INSP SitRep N°082); Uganda figures final as of **28 July 2026** (outbreak declared over).

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
