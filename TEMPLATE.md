# TEMPLATE.md

How this dashboard is split so it can be re-used for a different outbreak.

## Engine / content split

| File | Role | Outbreak-specific? |
|---|---|---|
| `index.html` | Page shell: markup, `data-i18n` hooks, script tags | Partly — see "Shell text" below |
| `styles.css` | Theme tokens, layout, colour ramp (`--r1`…`--r6`) | No |
| `app.js` | Engine: map layers, sidebar, zone chart, search, time filter, i18n, modal | **No** — holds no figures, dates or place names |
| `config.drc-bvd-2026.js` | Content: `CFG`, `D`, `T`, `NAT`, `BASE` | Yes |
| `vendor/leaflet/` | Leaflet 1.9.4 | No |

Scripts load in order `leaflet.js` → `config.*.js` → `app.js` as plain classic scripts,
so the config's top-level `const`s are visible to the engine and the page still opens
from `file://` with no server and no build step.

To spin off a new microsite: copy `config.drc-bvd-2026.js`, replace its values, edit the
shell text in `index.html`, and point the `<script src>` at the new config.

## What the config provides

- **`CFG`** — settings the engine reads directly:
  - `view.center`, `view.zoom`: initial map view
  - `defaultProv`: province in the provincial snapshot on load
  - `zoneRelease.sitrep`, `zoneRelease.date`: the release the health-zone layer is built on (sidebar stamps)
  - `months.short`, `months.long.{en,fr}`: time-filter chip labels, one per month in `D.tl`
  - `mobNote`: source note under the per-zone mobility panel
- **`D`** — the dataset:
  - `zones`: `{z,p,c,d,lat,lon,pop,cfr,k}`
  - `geo`: zone polygons, `properties.z`
  - `cent`: zone centroids
  - `trends`: per-zone series
  - `nat2`: national series; the last row is the headline
  - `tl`: timeline of report dates, with zone/national coverage flags
  - `mob`: mobility; `{}` when none is published
- **`T`** — every UI string, `T.en` and `T.fr`. The engine's `tx(key)` falls back to English, then to the key.
- **`NAT`** — national headline (`cases`, `deaths`, `cfr`, `date`). `NAT.cases` is also the denominator for each zone's "share of national".
- **`BASE`** — the country and province outlines for the vector base (hidden while OSM tiles are the base).

## Shell text (still in `index.html`)

The shell still holds some outbreak text:
- `<title>` and `<h1>`
- the header meta line (latest SitRep link, "Built on release")
- the initial sidebar stamps (overwritten on first render)
- the Methods modal paragraphs and the two CSV download links

Most of this is also in `T` and gets replaced by `applyStaticI18n()`. The `<title>`, the `<h1>`, the SitRep link text and the download `href`s are not in `T`, so they must be edited by hand for each outbreak.

## Engine assumptions (v1)

Each of these limits what a config can express. Revisit only when an outbreak needs it.

1. **One country, flat province → zone geography.** Each zone has one `p` string. There is no drill-down. The province picker and search are built from `D.zones`.
2. **Polygons first, dots as fallback.** Zones with a polygon in `D.geo` are drawn as a choropleth. Zones with only `lat/lon` are drawn as dots on the same ramp. The scale is log over the current indicator.
3. **Fixed indicator set.** The indicators are `c`, `d`, `cfr`, `k` (per 100k), `mob` (in/out) and `risk`. `risk` is a percentile blend of cases, deaths and mobility, computed in `app.js`.
4. **Time filter = cumulative-at-date.** Zone values at a past date come from the last `D.trends` row on or before it. No row means no data, never interpolation.
5. **EN/FR only.** `LANG` is `'en' | 'fr'`, `MONABBR` is in the engine, and all other strings are in `T`.

## Rules that apply to every config

From [CLAUDE.md](CLAUDE.md):
- Never invent or estimate figures. Every number comes from INSP, WHO or Africa CDC.
- Aggregate no finer than health zone.
- Keep the "⚠ Verify against WHO before publishing" lines (`meta_verify`, `mm_who`).
- French copy is AI-assisted and needs Francophone review before publishing.
