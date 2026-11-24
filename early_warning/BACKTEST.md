# Early-warning backtest

What the alert system would have raised if it had been run over the **whole
history in the repository**. This is the historical replay the brief asked for:
the same code that runs on incoming SitReps (`tools/ebola_early_warning.py`),
applied to every report from the first to the latest. Re-run it any time with:

```bash
uv run --with openpyxl --python 3.12 python -I tools/ebola_early_warning.py --scan
```

**Data window:** INSP SitRep **N°055 (2026-07-08) → N°190 (2026-11-20)** — 82
reports, **68 health zones**, **8 provinces** (Bas-Uélé, Haut-Uélé, Ituri,
Nord-Kivu, Nord-Ubangi, Sud-Kivu, Sud-Ubangi, Tshopo).

The rules and parameters are in [`RULES.md`](RULES.md). Thresholds used here:
zone rise ≥ 25, province rise ≥ 50 new cases in 7 days; 42-day quiet period;
7-day confirmation; gaps longer than 7 days void a window / quiet span.

## Data quality found in the replay

**Reporting gaps (9 global; 0 zone-level):**

| After report | Next report | Missing days | Span |
|---|---|---|---|
| 2026-07-11 | 2026-07-13 | 1 | 2 d |
| 2026-07-15 | 2026-07-17 | 1 | 2 d |
| **2026-07-18** | **2026-08-04** | **16** | **17 d** |
| **2026-08-04** | **2026-09-05** | **31** | **32 d** |
| 2026-09-05 | 2026-09-07 | 1 | 2 d |
| 2026-10-02 | 2026-10-04 | 1 | 2 d |
| 2026-10-10 | 2026-10-12 | 1 | 2 d |
| 2026-10-29 | 2026-10-31 | 1 | 2 d |
| 2026-11-01 | 2026-11-03 | 1 | 2 d |

The two long summer gaps (17 d, 32 d) are the reason most resurgence signals in
that period are "can't be assessed". The 2-day gaps are single held/unpublished
SitReps (N°142, 150, 169, 172) — they flag the next report "date uncertain" but
do not void a window.

**Corrections (13 cumulative decreases, logged, counted as 0 new cases):**
Adja 12→11 (N°151), Biena 48→26 (N°174), Beni 553→552 (N°160), Wamba 16→6
(N°065), plus death-count corrections (Rwampara 369→366 at N°139, Lubunga 2→0 at
N°186, Nia-Nia, Musienene, Kambala, Wamba). Every one matches a restatement
documented in the project notes.

## Results by alert

| Alert | Fired | Confirmed | Can't assess | Date-uncertain |
|---|---|---|---|---|
| 1 — new health zone | 68 | 68 | 0 | 18 |
| 2 — new province | 8 | 8 | 0 | 1 |
| 3 — rise (zone + province) | 57 | 43 | 14 | 17 |
| 4 — resurgence | 9 | 1 | 8 | 5 |

### Alert 1 — new health zones (68)
One per zone, on the report where it first appears with a case. 18 are
date-uncertain because the zone first appeared on a post-gap report — including
the 11 zones that first show at N°114 (2026-09-05), after the 32-day gap, and the
5 at N°082 (2026-08-04), after the 17-day gap. (Full list in
`early_warning/alerts.csv`, sheet "Alert 1".)

### Alert 2 — new provinces (8, all confirmed)

| Date | Province | Triggering zones | Note |
|---|---|---|---|
| 2026-07-08 | Ituri | Bunia, Rwampara, Mongbwalu, … (25 zones) | first report |
| 2026-07-08 | Nord-Kivu | Beni, Butembo, Katwa, … (11 zones) | first report |
| 2026-07-08 | Sud-Kivu | Miti-Murhesa | first report |
| 2026-07-10 | Haut-Uélé | Wamba | |
| 2026-07-10 | Tshopo | Lubunga, Makiso-Kisangani, Mangobo | |
| **2026-09-05** | **Bas-Uélé** | Buta, Ganga, Viadana | **date uncertain** (fell in the 32-day gap) |
| 2026-09-10 | Sud-Ubangi | Bulu | |
| 2026-10-16 | Nord-Ubangi | Wapinda | |

These match the documented province history (Bas-Uélé entering at N°114,
Sud-Ubangi via Bulu, Nord-Ubangi via Wapinda at N°155).

### Alert 3 — rises (57: 43 confirmed, 14 can't-assess)
Rising-edge crossings of the 7-day rolling new-case sum. The confirmed signals
track the outbreak's hotspots over time — e.g. the Ituri core (Bunia, Rwampara,
Mongbwalu, Mangala, Nia-Nia, Mambasa) through July–November, and the Nord-Kivu
corridor (Katwa, Butembo, Mabalako, Oicha, **Mutwanga**) from October. The 14
"can't-assess" crossings all sit on the first post-gap report (2026-08-04 /
2026-09-05), where a single lump of accumulated cases pushed the window over
threshold. The **current report (N°190, 2026-11-20)** raises exactly one:
**Mutwanga (Nord-Kivu), 25 in 7 days — Confirmed.**

**Province rises (4):** Ituri 1614 and Nord-Kivu 155 on 2026-07-08, Nord-Kivu 57
on 2026-07-18, and Haut-Uélé 51 on 2026-08-04 (can't-assess — the post-gap lump).

**Threshold sensitivity** (episodes = rising-edge crossings; can't-assess excluded):

| Zone threshold (7-day new) | Episodes | of which can't-assess |
|---|---|---|
| ≥ 10 | 105 | 23 |
| **≥ 25 (active)** | **53** | **13** |
| ≥ 50 | 30 | 13 |

| Province threshold | Episodes |
|---|---|
| ≥ 25 | 9 |
| **≥ 50 (active)** | **4** |
| ≥ 100 | 4 |

25 / zone is a reasonable default: it surfaces the genuine hotspots a few times a
week without firing on every small zone. Lower to 10 for a wider net (≈2× the
volume), raise to 50 to see only the largest surges.

### Alert 4 — resurgence (9: 1 confirmed, 8 can't-assess)

| Date | Zone | Province | Quiet days | Status |
|---|---|---|---|---|
| **2026-11-08** | **Drodro** | Ituri | 64 | **Confirmed** (case still present 7 days later) |
| 2026-09-05 | Boga | Ituri | 59 | Can't assess (over the 17-day gap) |
| 2026-09-05 | Gety | Ituri | 59 | Can't assess |
| 2026-09-05 | Mabalako | Nord-Kivu | 59 | Can't assess |
| 2026-09-05 | Makiso-Kisangani | Tshopo | 50 | Can't assess |
| 2026-09-05 | Mangobo | Tshopo | 57 | Can't assess |
| 2026-10-06 | Adja | Ituri | 63 | Can't assess (over the 32-day gap) |
| 2026-10-21 | Mahagi | Ituri | 78 | Can't assess |
| 2026-11-12 | Kambala | Ituri | 127 | Can't assess |

**Drodro is the one genuine resurgence** in the whole series: it went quiet from
2026-09-05 to 2026-11-08 (64 days, all in the daily-reporting era, no gap) and
then recorded a new case that persisted. The other eight are correctly withheld
because their quiet spans straddle the summer reporting gaps.

## Validation

Every alert was cross-checked against facts recorded independently in the project
notes and matched: the 8 provinces and their entry dates, the 13 corrections, the
summer reporting gaps, and Drodro as the sole clean resurgence. No alert fired on
a figure the system invented — all are derived from the committed cumulative
series.

## Caveats

- Dates are **report dates**, not symptom-onset or sample dates.
- Only **confirmed** cases are used (no probable-case column in the source).
- Zones appear in the series only from their first case, so Alert 1 is only as
  complete as the series.
- Where activity coincides with a long reporting gap, the system **withholds**
  (can't-assess) rather than fire on an unknowable date — so Alerts 3 and 4 are
  conservative across the summer gaps by design.

## Reproducing

```bash
# full backtest + threshold scan
uv run --with openpyxl --python 3.12 python -I tools/ebola_early_warning.py --scan
# edge-case tests
uv run --python 3.12 python -I tools/test_ebola_early_warning.py
```

Outputs land in `early_warning/`: `alerts.xlsx` (one sheet per alert + gaps +
corrections + summary), `alerts.csv`, `cleaned_zone_daily.csv`,
`reporting_gaps.csv`, `corrections.csv`.
