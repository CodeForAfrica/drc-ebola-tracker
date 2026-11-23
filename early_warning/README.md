# Ebola early-warning alert system

A reusable, re-runnable alert system over this repo's per-zone cumulative time
series. It reads **`data/zones_timeseries_full.csv`** (INSP SitRep figures, one
row per SitRep × health zone) and raises four alerts. It never modifies the raw
data; everything it writes lands in this folder.

## Run

```bash
# full run (writes the .xlsx + CSVs, prints a summary)
uv run --with openpyxl --python 3.12 python -I tools/ebola_early_warning.py

# also print how many Alert-3 episodes each candidate threshold would produce
uv run --with openpyxl --python 3.12 python -I tools/ebola_early_warning.py --scan

# CSVs only, no third-party dependency
uv run --python 3.12 python -I tools/ebola_early_warning.py --no-excel

# change the active Alert-3 thresholds for this run
uv run --with openpyxl --python 3.12 python -I tools/ebola_early_warning.py \
    --zone-threshold 50 --province-threshold 100
```

When a new SitRep is ingested into `data/zones_timeseries_full.csv`, just re-run
the command — no code change needed.

## Parameters

All tunables live in `CONFIG` at the top of `tools/ebola_early_warning.py` and can
be overridden with `--config <json>` or the CLI flags above:

| Key | Meaning | Default |
|---|---|---|
| `excluded_zones` | pseudo-zones dropped from every analysis | `["A ventiler"]` |
| `alert3_window_days` | rolling window for the rise alert | `7` |
| `alert3_zone_threshold` / `alert3_province_threshold` | active rise thresholds (new cases in the window) | `25` / `50` |
| `alert4_quiet_days` | official end-of-outbreak quiet period | `42` |
| `alert4_confirm_days` | days a resurgent case must persist to confirm | `7` |
| `max_assessable_gap_days` | a reporting gap longer than this makes a window/quiet span "can't be assessed" | `7` |
| `post_gap_min_interval_days` | a report this many days after the previous one is "post-gap" (date uncertain) | `2` |

## How the four alerts work

1. **New health zone** — the first report where a zone's cumulative confirmed
   cases go from absent/0 to > 0. Fires once per zone. A later correction back to
   0 and re-rise is a data-quality note, not a second alert.
2. **New province** — the first report where any zone in a province is > 0;
   lists every zone that crossed on that date.
3. **Rise beyond a threshold** — a rising-edge crossing of the 7-day rolling
   new-case sum, by zone and by province. A crossing that exists only because of
   a post-gap lump is marked *Can't be assessed*.
4. **Resurgence** — a new case in a zone that had ≥ 42 quiet calendar days since
   its last increase. If the quiet span overlaps a reporting gap longer than
   `max_assessable_gap_days` it is *Can't be assessed*; otherwise it is confirmed
   only if the case is still in the cumulative count 7 days later (else *Reversed
   by correction*).

New cases are derived in code as the per-zone difference of consecutive
cumulative totals; a negative difference is treated as a correction (logged, and
counted as 0 new cases), never as a decline.

## Outputs (this folder)

| File | Contents |
|---|---|
| `alerts.xlsx` | one sheet per alert (1–4) plus Reporting gaps, Corrections and a Summary sheet |
| `alerts.csv` | all alerts flattened into one table |
| `cleaned_zone_daily.csv` | the cleaned per-zone series: cumulative + derived new cases/deaths, step gap, post-gap and correction flags |
| `reporting_gaps.csv` | global gaps (with length) and zone-level gaps |
| `corrections.csv` | every cumulative decrease (cases and deaths), with from/to |

Each alert sheet carries: Alert, Date, Province, Health Zone, New cases, Quiet
days (Alert 4), Post-gap / date uncertain (Y/N), Reversed by correction (Y/N),
Status (Confirmed / Can't be assessed / Reversed / Pending confirmation) and a
Note.

## Caveats

- Dates are **report dates**, not symptom-onset or sample dates.
- Only **confirmed** cases are used; the source has no probable-case column.
- Zones appear in the series only from their first case, so Alert 1 depends on
  the series being complete.

## Tests

```bash
uv run --python 3.12 python -I tools/test_ebola_early_warning.py
```

covers a correction back to 0, a post-gap lump, a quiet period overlapping a gap
(and a clean confirmed resurgence), and a zone missing from a single report.
