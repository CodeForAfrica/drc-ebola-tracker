# DRC · Uganda — Ebola Bundibugyo 2026 Tracker

An interactive, map-based dashboard of the 2026 Bundibugyo ebolavirus (BVD) outbreak in the Democratic Republic of the Congo and Uganda. It shows confirmed cases by Ituri health zone on a Leaflet map, with a log/linear color scale, active-case markers, side panels (current snapshot, trends, context), and a national/provincial response summary.

## Run it

No build step and no server required — just open `index.html` in any modern web browser. An internet connection is needed for the map tiles, fonts, and the WHO figures to load.

## Data

- **Source:** World Health Organization, Disease Outbreak News [DON607](https://www.who.int/emergencies/disease-outbreak-news/item/2026-DON607).
- **As of:** DRC figures 10 June 2026; Uganda figures 11 June 2026.
- The six CSVs in `data/` are transcribed from DON607 (cases by health zone, province and country summaries, contact tracing, cumulative trend, and WHO risk levels). Each row carries its own source attribution.

## Structure

```
drc-ebola-tracker/
├── index.html   # the dashboard
├── data/        # six CSV datasets (WHO DON607)
└── README.md
```

## Before publishing

Outbreak figures change rapidly and are frequently revised in later reports. **Verify all numbers against the latest WHO Disease Outbreak News before publishing or sharing this dashboard.** This is an independent visualisation for humanitarian information purposes and is not an official WHO product.
