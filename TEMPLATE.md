# TEMPLATE.md

How this dashboard is structured so it can be re-skinned for a different outbreak,
and the design decisions that define what the template can and cannot represent.

## Engine / content split

- **Engine** (`index.html` shell, `styles.css`, `app.js`) — the reusable machinery:
  theme, layout, choropleth + cluster map, panels, per-zone charts, mobility/population
  context, modals, EN/FR i18n, CSV downloads. It reads globals from the config and
  hard-codes **no outbreak-specific values and no geography**. Identical across sites.
- **Content** (`config.<slug>.js`, `data/`) — everything specific to one outbreak:
  the tunables (ramp, map extent, data-file paths), the health-zone records, the
  EN/FR i18n strings, and the CSV datasets. `data/` holds the fetched GeoJSON
  (zone polygons), per-zone time series, and mobility JSON.

`config.drc-bvd-2026.js` is the reference config (2026 DRC/Uganda BVD, INSP SitRep N°051).
To spin off a new microsite: copy that file, change the values, drop the matching files
in `data/`, and reuse `app.js` + `styles.css` + the `index.html` shell unchanged.

Bilingual (EN/FR) is first-class: every user-facing string lives in the config's `I18N`
table (plus `PROV_I18N` / `COUNTRY_I18N` and per-zone `i18n.{en,fr}`), and the engine's
language toggle re-renders from it. Place names, coordinates and figures are not translated.

Rules from [CLAUDE.md](CLAUDE.md) still apply to every config: never invent numbers
(every figure is WHO / Africa CDC / INSP-sourced), aggregate no finer than health-zone,
and keep the "⚠ verify against WHO before publishing" lines (in the `legend_src` and
`ctx_none` i18n strings). French strings are AI-assisted and must be reviewed by a
Francophone before publishing.

## Template contract — decisions (v1)

These fix the *shape* of what a config can express. Each notes when you'd revisit it —
deliberately **not** built speculatively.

### 1. Choropleth primary layer + optional Clusters view + context markers

The map is three config-driven layers:

- **Choropleth** — health-zone polygons from a fetched GeoJSON (`DATA_FILES.geojson`),
  shaded by `confirmed_cases` on `FILL_RAMP` (domain `1…RAMP_MAX`, sqrt scale). The
  primary, default lens. Clicking a polygon opens its snapshot.
- **Clusters** (opt-in via the View toggle) — one numbered bubble per zone, grouped by
  markercluster; the cluster bubble shows the summed count on the same ramp.
- **Context markers** — point markers for areas reported by a *different source* and not
  part of the polygon layer (here: Uganda / Kampala). May be empty.

**Revisit if:** an outbreak has no zone polygons (then run Clusters-only, GeoJSON omitted),
or needs a lens beyond these three (e.g. a flow/mobility layer promoted onto the map).

### 2. Flat, single-level admin geography

Each zone carries one `prov` string (e.g. `Ituri`, `Nord-Kivu`, `Sud-Kivu`), displayed
bilingually via `PROV_I18N`. There is no hierarchy or drill-down. `prov` is generic —
it can hold a province, region, or district depending on the outbreak.

**Revisit if:** an outbreak needs multi-level nesting with interaction (country → region →
district drill-down). Then `prov` becomes a small hierarchy and the engine gains drill logic.

### 3. Single "share of" parent denominator

Each zone's "share of…" figure is its `cases` over one national total
(`DRC_CONFIRMED_TOTAL` = summed zone cases + `AWAITING_CASES`), labelled via i18n.
National headline totals are **computed from the zone data**, not hardcoded, so they can't
drift from the per-zone numbers.

**Revisit if:** an outbreak has no single dominant parent (e.g. cases split across several
countries with no natural whole). Then the share bar becomes optional or per-parent.

## Resolved, not deferred

- **Boundaries, not points.** Zones are rendered as **GeoJSON polygons** (choropleth), with
  points used only for the cluster view and the separate context markers. (This is why the
  earlier "points-only" question is settled rather than an open decision.)

## Curated vs figures-only zones

Zones with a curated `i18n.{en,fr}` block get a narrative (tag / context / note) in the
Context tab; the rest show **figures only** — the engine hides the narrative blocks and
shows a "no curated context" line rather than blanks. A new outbreak can curate as few or
as many zones as it has good narrative for.
