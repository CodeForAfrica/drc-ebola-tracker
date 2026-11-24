# Early-warning alert rules

The precise rules the alert system applies, in plain language, for review and
sign-off by the epidemiology team. They are implemented in
`tools/ebola_early_warning.py` and every parameter named here is a tunable in
that file's `CONFIG` block (overridable with `--config` or CLI flags).

## Input and preparation

- **Source:** `data/zones_timeseries_full.csv` — one row per SitRep × health
  zone, with **cumulative** confirmed cases and deaths (INSP figures). Read-only;
  the system never edits it.
- **Dates are report dates** (the SitRep's `report_date`), not symptom-onset or
  sample dates.
- **Only confirmed cases** are used — the source carries no probable-case column.
- The pseudo-zone **"A ventiler"** (unassigned Ituri deaths) is **excluded from
  every analysis** (`excluded_zones`). Province spellings are canonicalised
  (`Haut-Uele` → `Haut-Uélé`).
- **New cases are derived in code**: for each zone, new = this report's cumulative
  − the zone's previous cumulative. A zone's first appearance counts its full
  cumulative as new. A **negative** difference is a **correction**, logged and
  counted as **0 new cases** — never as a decline.
- **Reporting gaps** are found two ways:
  - **Global gap** — a calendar date on which no zone reported. Consecutive
    missing dates are one gap; its *span* is the days between the report before
    and the report after.
  - **Zone gap** — a report on which other zones reported but this zone did not,
    between its first and last appearance.
- A report is **post-gap** when it follows the previous report by
  `post_gap_min_interval_days` (default **2**) or more calendar days — i.e. at
  least one missing day. An alert dated on a post-gap report is flagged
  **"date uncertain"**, because the cases it carries are a lump of the whole
  missing period.

## Parameters (defaults)

| Parameter | Meaning | Default |
|---|---|---|
| `excluded_zones` | zones dropped from every analysis | `["A ventiler"]` |
| `alert3_window_days` | rolling window for the rise alert | `7` |
| `alert3_zone_threshold` | active zone rise threshold (new cases in window) | `25` |
| `alert3_province_threshold` | active province rise threshold | `50` |
| `alert4_quiet_days` | official end-of-outbreak quiet period | `42` |
| `alert4_confirm_days` | days a resurgent case must persist to confirm | `7` |
| `max_assessable_gap_days` | a reporting gap longer than this voids a window / quiet span | `7` |
| `post_gap_min_interval_days` | a report this many days after the last one is "post-gap" | `2` |

## The four alerts

### Alert 1 — First confirmed case in a new health zone
- **Fires** on the first report where a zone's cumulative confirmed cases go from
  absent (or 0) to greater than 0.
- **Once per zone.** If a later correction brings the zone back to 0 and it rises
  again, that is recorded as a **data-quality note**, not a second alert.
- If the firing report is post-gap, it is flagged **date uncertain** ("the first
  case happened somewhere in the gap").

### Alert 2 — First confirmed case in a new province
- **Fires** on the first report where any zone in the province has cumulative
  cases greater than 0.
- **Lists every zone** in the province that crossed above 0 on that date.
- Same post-gap "date uncertain" flag.

### Alert 3 — Rise in confirmed cases beyond a threshold
- Uses a **7-day rolling sum of new cases** (not day-to-day change, because
  reporting is irregular), computed **by zone and by province**.
- **Fires** on a **rising edge**: the moment the rolling sum crosses from below
  the threshold to at or above it. It does not fire again until the sum has
  dropped back below the threshold (so a zone that stays hot is one alert, not
  one per day).
- Active thresholds: **zone ≥ 25**, **province ≥ 50** new cases in 7 days
  (tunable; a sensitivity scan is in the backtest).
- **Can't be assessed** when the crossing exists *only* because of a post-gap
  lump — i.e. if the new cases that landed on a report following a gap longer
  than `max_assessable_gap_days` are removed, the window would fall back below
  the threshold.

### Alert 4 — Cases return in a previously affected zone
- **Fires** when a zone that has had at least one case records a new case after
  **≥ 42 quiet calendar days** (counted from the last date the zone's cumulative
  went up; its first case counts as the first "increase").
- **Can't be assessed (reporting gap)** when the quiet span overlaps a global
  reporting gap longer than `max_assessable_gap_days` — the zone may have had
  cases during the gap.
- Otherwise it is **Confirmed** only if the new case is still in the cumulative
  count `alert4_confirm_days` (default **7**) days later. If a correction removed
  it within that window it is **Reversed by correction**; if fewer than 7 days of
  follow-up exist yet it is **Pending confirmation**.

## Status values

- **Confirmed** — fired and (for Alerts 3/4) assessable and not reversed.
- **Can't be assessed** — a rise that is only a post-gap lump, or a quiet span
  over a long reporting gap.
- **Reversed by correction** — a resurgence removed by a later correction within
  the confirmation window.
- **Pending confirmation** — a resurgence too recent to confirm yet.
- Any alert on a post-gap report additionally carries **date uncertain = Y**.

## What this is not

- It raises **signals from reported counts**; it is not a transmission model and
  does not estimate anything the SitRep does not print.
- It is an **offline tool**. It is deliberately not wired into the public site's
  Early-warning page, which stays empty until the epidemiology team supplies its
  own indicators and thresholds.
