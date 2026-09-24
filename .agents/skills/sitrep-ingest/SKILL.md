---
name: sitrep-ingest
description: Fetch new INSP Ebola SitRep PDFs from insp.cd, extract the national summary and health-zone tables, and write the two timestamped CSVs into data/. Use when asked to update, ingest, or check for new sitreps.
---

# INSP SitRep ingestion

Step-by-step procedure for an AI agent to fetch the daily INSP situation report on the
2026 Bundibugyo ebolavirus outbreak in DRC and turn it into two CSVs.

This is plain Markdown — any agent can follow it, not just Codex.

## Non-negotiable rules

1. **Never invent, estimate, or interpolate a figure.** Every number written to a CSV must be
   printed in the PDF or computed from PDF figures by an arithmetic rule stated here. If a value
   is absent, leave the cell empty.
2. **Stop on a failed validation gate** (step 9). Do not write partial or "best effort" CSVs, and
   do not "fix" a number so the totals balance. Report what failed and which page it came from.
3. **One PDF in, two CSVs out.** Never merge figures from two different sitreps into one row.
4. Figures are French-formatted: `48,0%` is 48.0 percent; `5 584` (narrow/non-breaking space)
   is 5584. Normalise before parsing.

## Outputs

Both files go in `data/`, named with the **publication date** taken from the PDF header:

| File | Grain | Naming |
|---|---|---|
| `summary_sitrep<NNN>_<YYYY-MM-DD>.csv` | one row — national snapshot | `summary_sitrep101_2026-08-24.csv` |
| `zones_sitrep<NNN>_<YYYY-MM-DD>.csv` | one row per health zone | `zones_sitrep101_2026-08-24.csv` |

### Schema — summary CSV

```
sitrep_number,report_date,publication_date,provinces,zones,confirmed_deaths,
fatality_rate_pct,patients_in_isolation,recovered_patients,suspects_today,
contact_tracing_pct,source_pdf
```

### Schema — zones CSV

```
sitrep_number,report_date,publication_date,status,zone,province,
confirmed_cases,confirmed_deaths,population_2024,zone_cfr_pct,cases_per_100k
```

All dates are ISO `YYYY-MM-DD`. Percentages are numbers, not strings (`48.0`, not `48,0%`).

---

## Step 1 — Discover sitreps

**Use the WordPress REST API, not the HTML listing page.** `https://insp.cd/category/sitrep/`
returns **403** to non-browser clients; the REST API returns 200 from plain `curl`/`urllib`
with no headers or auth.

```
https://insp.cd/wp-json/wp/v2/posts?categories=308&per_page=25&page=1&_fields=id,date,slug,title,content
```

- Category `308` is `sitrep`. Re-resolve it if it ever 404s:
  `https://insp.cd/wp-json/wp/v2/categories?search=sitrep`
- Results are newest-first. `page=1` is enough for a daily run; paginate only for a backfill.
  Requesting a page past the end returns HTTP 400 — treat that as "end of list", not an error.
- Sitreps are published irregularly: several can appear on one day, and some numbers are never
  posted (63, 75, 76, 43, 45, 48 are missing as of N°101; 115 as of N°131). Drive off what exists, never off
  "yesterday's number + 1".

Skip any post whose sitrep number already has both CSVs in `data/`.

## Step 2 — Resolve the PDF URL

The PDF is not linked with an `<a href>`. It is embedded by the `pdfemb` plugin as a
base64url-encoded JSON blob inside the iframe `src` in `content.rendered`:

```python
m = re.search(r'pdfemb-data=([A-Za-z0-9_-]+)', post['content']['rendered'])
s = m.group(1) + '=' * (-len(m.group(1)) % 4)          # restore padding
pdf_url = json.loads(base64.urlsafe_b64decode(s))['url']
```

Fallback if that pattern is gone: `re.search(r'href="([^"]+\.pdf)"', html)`.
If neither matches, stop and report the post URL — do not guess a `wp-content/uploads` path.

## Step 3 — Derive the four identity fields

| Field | Source | Notes |
|---|---|---|
| `sitrep_number` | post **title** | `SitRep N°101/MVEBDB/23/08/2026` → `101`. Strip leading zeros (`N°0100` → `100`). Cross-check against the PDF header line; if they disagree, trust the PDF and report the mismatch. |
| `report_date` | **PDF** page 1: `Date de rapportage : 23 août 2026` | Map French month names. |
| `publication_date` | **PDF** page 1: `Date de publication : 24 août 2026` | **Not the WordPress post date** — they routinely differ (N°101 was published 24 Aug per the PDF but posted 25 Aug). Use the WP `date` only if the PDF line is missing, and note the substitution. |
| `status` | **PDF filename** | See below. |

### Deriving `status` from the filename

`provisional` if the filename stem contains a draft marker; otherwise `final`;
`unknown` if the filename carries no signal at all.

```python
stem = os.path.splitext(os.path.basename(pdf_url))[0]
if re.search(r'(?<![a-z])d[ar]a?ft', stem, re.I):   status = "provisional"
elif re.search(r'(?<![a-z])(final|vf|fv|ok+)(?![a-z])', stem, re.I): status = "final"
elif re.search(r'sitrep', stem, re.I):              status = "final"
else:                                               status = "unknown"
```

Real filenames the rule must survive (all observed on insp.cd):

| Filename | status | why |
|---|---|---|
| `SitRep_MVEBDB_101_23_08_2026.pdf` | final | no draft marker |
| `Draft_SitRep_MVE_RDC_N°055_08_07_2026.pdf` | provisional | `Draft_` |
| `Draft2_SitRep_MVE_RDC_N°054_07_07_2026.pdf` | provisional | `Draft2_` |
| `Draft-1-SitRep_MVE_RDC_N°040_23_06_2026.pdf` | provisional | `Draft-1-` |
| `Daft-SitRep_MVE_RDC_N18_01_06_2026_JO_PA-Final-1.pdf` | provisional | INSP typo for "Draft" — the `d[ar]a?ft` pattern catches it |
| `Draft-Final-SitRep_MVE_RDC_N°037_20_06_2026.pdf` | provisional | a *draft of* the final; draft marker wins |
| `SitRep_MVE_RDC_N_64_17-07-2026_OKK.pdf` | final | no draft marker |
| `Final-SitRep_MVE_RDC_N°044_27_06_2026.pdf` | final | explicit |
| `100.pdf`, `99.pdf`, `97-1.pdf`, `85.pdf` | **unknown** | INSP sometimes uploads a bare number — nothing to infer from |

Always keep the raw filename in `source_pdf` so status can be re-derived later.
Never write `final` for a bare-number filename just because it looks like the others.

Validated against all 95 sitrep posts on insp.cd as of N°101: **56 final, 29 provisional, 10 unknown** (the 10 are the bare-number uploads `83`–`85`, `91`, `94`–`97`, `99`, `100`, all from August 2026). Re-run the classifier over the full list if you change the pattern.

## Step 4 — Download the PDF

Fetch `pdf_url` to a scratch directory. `curl`/`urllib` with no special headers is sufficient.
Verify the response is a PDF (magic bytes `%PDF`) and non-trivial in size (> 100 KB; the reports
run ~700 KB / 10 pages). Keep the original filename.

## Step 5 — Extract text

```bash
uv run --with pdfplumber --python 3.12 python -c "
import pdfplumber,sys
p=pdfplumber.open(sys.argv[1])
print('\n'.join(pg.extract_text() or '' for pg in p.pages))" <file.pdf>
```

`UV_HTTP_TIMEOUT=180` on the first run — the pdfplumber dependency download can exceed the
30 s default. Do **not** use `pg.extract_tables()`; these tables are drawn without ruling lines
and `extract_text()` line parsing is more reliable.

## Step 6 — Parse the national summary

The page-1 KPI banner has interleaved glyphs and extracts garbled — e.g.
`5 584 C 2 O N 6 F 8 IR 0 M ÉS 48,0% 846 1 215 83 (D , u 4 Jou r % )`.
Read the numbers **positionally, left to right**, in banner order:
cumulative cases, cumulative deaths, CFR, patients in isolation/CTE, cumulative recovered,
contact-tracing rate.

| CSV field | Where | N°101 value |
|---|---|---|
| `provinces` | page 1, "*N* Provinces touchées" | 6 |
| `zones` | page 1, "*N* Zones de santé touchées sur 151" | 57 |
| `confirmed_deaths` | banner, 2nd number | 2680 |
| `fatality_rate_pct` | banner, `LETALITE` | 48.0 |
| `patients_in_isolation` | banner, `PATIENTS EN ISOLEMENT/CTE` | 846 |
| `recovered_patients` | banner, `CUMUL DES GUÉRIS` | 1215 |
| `suspects_today` | alerts table (§"Situation des alertes notifiées"), Total row: *Alertes vérifiées et validées (cas suspect)* **vivants + décédés** | 165 + 112 = 277 |
| `contact_tracing_pct` | banner `TAUX DE SUIVI DES CONTACTS (Du Jour)` | 83.4 |

Cross-check `suspects_today` against the narrative in §1.1.3, which restates it
("277 (20,7%) ont été validées comme cas suspects"). If banner and narrative disagree, stop.
The wording varies ("Toutes les 408 alertes validées comme cas suspects", "413 (26,3%) alertes ont été
validées"), and the Total row is sometimes on the same line as `Total`, sometimes on the next. Its
numbers use thousands spaces (`1 155 174 …` is 1155 then 174), so split it into its nine columns with
the checks received vivants + décédés = total, and investigated ≤ validated, rather than on spaces.

Layout drift seen in N°116–131: the zone count on page 1 can share a line with the narrative column
(`62 Zones de santé des décès du jour à 35.`), so match it at line start. The contact-tracing
figure is garbled more than one way (`78 (D , u 3 Jou r % )`, `8 ( 9 Du , J 3 ou % r)`): take all
digits after the recovered figure and put the decimal point before the last one.

## Step 7 — Parse the zone table

Section *"Cas et décès confirmés par province et zone de santé"* (pages 2–3). Each province has a
bold subtotal row followed by its zones in alphabetical order. Per zone line, take the first three
numeric fields only: `Cas (n)`, `Décès (n)`, `Létalité`. Ignore the four 24 h columns — they are
not in the output schema, and their column alignment shifts between reports.

Line-parsing rules:

- Zone names wrap across lines (`Boma\nMangbetu`, `Makiso-\nKisangani`). Join a line that has no
  numbers with the following line before parsing.
- A `Létalité` cell occasionally wraps onto the next line (seen in N°100 for `Gethy`). If a zone
  line yields fewer than three numbers, pull the remainder from the next line.
- Ituri has an `A ventiler` row: deaths recorded in CTEs but **not yet assigned to a zone**
  (250 in N°101). Keep it as its own row so deaths reconcile — `confirmed_cases`,
  `population_2024`, `zone_cfr_pct` and `cases_per_100k` are all empty for it.
- The row is also printed `A ventiler *`, `A ventiler*` or `À ventiler*`. Normalise all of them
  to `A ventiler`, or the row fails to match and its text runs into the next row.
- `Létalité` can have two decimals (`100,00%`, from N°119), and is occasionally not printed at all
  (Buta in N°116: `Buta 1 1 1 0`). Leave `zone_cfr_pct` empty when it is missing. Never compute it.
- Province names in the PDF use accents (`Haut-Uélé`, `Bas Uélé`, `Sud Ubangi`). Normalise to the CSV forms
  `Haut-Uele`, `Bas-Uele`, `Nord-Kivu`, `Sud-Kivu`, `Ituri`, `Tshopo`, `Sud-Ubangi`.
- There is a health zone called `Tshopo` inside Tshopo province. Treat a province name as a subtotal
  only the first time it appears.
- Fail the run if any zone name contains a digit or `%`, or text is left over at the end of the table.
  That is the sign of a row that did not match and ran into its neighbour.
- Keep zone names exactly as the PDF spells them (`Gethy`, not the older `Gety`).

## Step 8 — Enrich and compute

- `zone_cfr_pct`: use the **printed** `Létalité`, comma → dot. Do not recompute it.
- `population_2024`: look up the zone in `data/zones_sitrep051.csv`, the repo's only denominator
  source (36 zones). Alias `Gethy` → `Gety`. **Leave empty for every zone not in that file** —
  21 of the 57 affected zones, chiefly in Haut-Uélé, Tshopo and Bas-Uélé.
- `cases_per_100k`: `round(confirmed_cases / population_2024 * 100000, 1)`; empty when the
  population is empty.

## Step 9 — Validate (hard gates)

Do not write any file until all of these pass:

1. Zone rows summed per province equal the province subtotal, for **cases and deaths**, in all
   six provinces (count the `A ventiler` deaths toward Ituri).
2. All provinces summed equal the `Total` row, and that total equals the page-1 banner cumulative
   cases and deaths.
3. Zone row count (excluding `A ventiler`) equals the "*N* Zones de santé touchées" figure on page 1
   and the sum of the per-province `Zones de santé touchées` column.
4. `round(confirmed_deaths / confirmed_cases * 100, 1)` equals the printed national CFR ±0.1.
5. `report_date` < `publication_date`, and both are within 14 days of today.
6. `sitrep_number` from the title equals the one in the PDF header.
7. Every non-empty numeric cell parses as a number; no cell contains a stray `%`, `,` or space.

Report the reconciliation table (computed vs printed, per province) in the run summary even when
everything passes — it is the evidence that the extraction is correct.

## Step 10 — Write the CSVs

Write both files to `data/` with the step-0 names. UTF-8, `\n` line endings, no BOM,
header row exactly as specified. Sort the zones CSV by `confirmed_cases` descending, then zone
name ascending, with `A ventiler` last.

If a file with that name already exists, compare: identical → no-op; different → the sitrep was
re-published (INSP does re-upload corrected PDFs). Overwrite, and say so, noting which figures moved.

## Step 11 — Report

State: sitrep number, report and publication dates, status and the filename it came from, row
counts, the province reconciliation, how many zones lack a population denominator, and the two
output paths. Flag anything the PDF said but the schema cannot hold (e.g. N°100 carried a footnote
that one case was added by data reconciliation and is excluded from the day's new confirmations).

## Not in scope

Ingestion stops at the CSVs. It does **not** touch `config.drc-bvd-2026.js`, `index.html` or the
map — updating the dashboard is a separate, explicitly requested step, and per `AGENTS.md` the
embedded figures and `data/` must then be changed together. When that step runs, the dashboard's
national and province figures must equal this PDF exactly (banner and Tableau 1). List every
discrepancy and its fix before changing anything, and never redistribute `A ventiler` deaths into zones.
