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
- Health zone count was 51 as of N°082. Beyond Adja (N°066) and Rungu (N°070): Kabondo (Tshopo, N°077), Wanie-Rukula (Tshopo, N°079) and Lubero (Nord-Kivu, N°080). Geometry, centroid and population for all five came from the INRB-UMIE archived shapefile, not from INSP. The shapefile spells Wanie-Rukula as "Wanierukula".
- As of N°114, **61 health zones are reported but only 51 are mapped.** Ten zones new since N°082 — Bafwasende, Biena, Buta, Ganga, Gombari, Kayna, Manguredjipa, Mutwanga, Tshopo, Viadana (Buta/Ganga/Viadana are Bas-Uélé) — appear in `data/zones_sitrep114.csv` **without lat/lon/population** and are **named-but-unmapped**, pending their geometry/centroid/population from the INRB-UMIE archived shapefile (23 confirmed cases / 10 deaths between them). Never invent that geometry; if the shapefile is unavailable, keep them unmapped and disclose them (as the UI and Methods do). `data/zones_sitrep114.geojson` is built from `zones_sitrep082.geojson` polygon geometry + N°114 counts for the 51 mapped zones (the mapped set is identical to the N°082 set). Check shapefile spellings against repo keys before adding any of the ten (e.g. Wanie-Rukula ↔ "Wanierukula").
- Zone-name spellings change between sitreps and must be canonicalised on ingest. INSP writes Nia-Nia through N°068 and "Nia Nia" from N°069; Gety through N°068 and "Gethy" from N°069. The repo keys are Nia-Nia and Gety. An un-aliased name does not error — it silently fails to join and the zone drops off the map.
- SitRep N°069 is a source restatement and breaks the per-zone series. National cumulative moved 2536 -> 2905 while N°069 reported only 97 new confirmations; deaths moved +236 against a stated +62. Counts were re-attributed between zones (Bunia deaths -53, Rwampara +81) and the 17 previously unassigned cases were distributed into named zones. Per-zone figures before and after N°069 are NOT comparable. Any trend rendering spanning N°068->N°069 must show a break or start at N°069.
- data/zones_timeseries.csv is date-keyed and mixes two sources: rows before 2026-07-08 are backfilled from INRB-UMIE, rows from 2026-07-08 are transcribed from INSP sitrep PDFs. data/zones_timeseries_sourced.csv carries the same rows with a Source column and is the version to cite.
- Uganda's outbreak was declared over on 28 July 2026. Its figures are final and must not be updated by DRC sitrep cycles. It remains in the regional cumulative; removing it would silently change every historical composite figure.
- Sitrep coverage has gaps. N°059 and N°063 have no zone rows; N°075 and N°076 are not ingested, leaving a two-day gap between 27 and 30 July. Day-over-day deltas cannot be verified across a gap, and any trend rendering must not interpolate across missing dates.
- N°081 has 2 Nord-Kivu deaths reported at province level but not attributed to any health zone, so its zone rows sum to 1749 deaths against a headline of 1751. Zone rows are stored as published. The gap closes at N°082. Where a per-zone sum is displayed alongside a headline figure, they will not match for N°081.
- **ZONE LAYER AT N°114 (split state resolved, with caveats).** As of N°114 the national headline (6604 cases / 3175 deaths / CFR 48.1% / 1548 recovered) **and** the health-zone layer — the HZ array, POP, the per-sitrep GeoJSON (`zones_sitrep114.geojson`), the choropleth scale and the trends series — are both N°114 (05 Sept 2026). The earlier split state (national N°114 vs zones N°082) is gone. National totals still do NOT equal the *mapped* zone sums, for two reasons: (1) 10 of the 61 reported zones are named-but-unmapped (23 cases / 10 deaths, pending geometry) and are absent from the choropleth; (2) 366 confirmed Ituri CTE deaths are pending zone classification ("A ventiler", following the N°081 precedent) and are excluded from zone-level death totals. Mapped zones sum to 6581 cases / 2799 deaths; all reported-zone deaths (incl. the 10 unmapped) = 2809; 2809 + 366 = 3175 national. The per-zone share denominator `DRC_CONFIRMED_TOTAL` is deliberately the **full national 6604** (NOT the mapped 6581), so each zone reads as a share of the national total and the unmapped zones are simply absent rather than distorting the denominator. The Methods CFR is now the national **3175/6604 ≈ 48.1%**. National cases/deaths live in `DRC_NAT_CASES`/`DRC_NAT_DEATHS`; the mapped zone sums are `drcCases`/`drcDeaths` (6581/2799). The Trends tab (`data/zone_trends_sitrep.json`, read at runtime) now carries the 04 Aug (N°082) and 05 Sept (N°114) cumulative readings appended after break rows and rendered with `spanGaps:false`, so gaps where intervening sitreps are not ingested are not interpolated.
- N°093 recognised a sixth affected province, **Bas-Uélé**. In N°114 its health zones (Buta, Ganga, Viadana) appear in the zone table but still lack geometry/centroid/population from the INRB-UMIE archived shapefile, so **Bas-Uélé remains named but not mapped** — as do seven further new zones in Nord-Kivu, Haut-Uélé and Tshopo (see the 61-vs-51 health-zone-count note above).
- `data/national_timeseries.csv` currently jumps from N°065 to the appended N°114 row; 066–113 are absent rather than interpolated (the prepared full series has not been supplied). Do not interpolate across the gap.

## Source of truth

- Primary source: **INSP situation reports** (insp.cd). Both the DRC *national* headline and the *health-zone* breakdown are **SitRep N°114 (05 September 2026)**; 10 of the 61 reported zones are named but not yet mapped, pending geometry (see Data handling). Uganda: **Ministry of Health** — outbreak declared over 28 July 2026, figures final at 20 confirmed / 2 deaths / 18 recoveries. WHO Disease Outbreak News, ECDC and NICD are used as cross-checks.
- Current snapshot: DRC national as of **05 September 2026** (INSP SitRep N°114); DRC health-zone map as of **05 September 2026** (INSP SitRep N°114, 51 of 61 zones mapped); Uganda figures final as of **28 July 2026** (outbreak declared over).

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
