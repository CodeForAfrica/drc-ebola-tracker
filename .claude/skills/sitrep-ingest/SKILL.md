---
name: sitrep-ingest
description: Fetch new INSP Ebola SitRep PDFs from insp.cd, extract the national summary and health-zone tables, and write the two timestamped CSVs into data/. Use when asked to update, ingest, or check for new sitreps.
---

# INSP SitRep ingestion

Step-by-step procedure for an AI agent to fetch the daily INSP situation report on the
2026 Bundibugyo ebolavirus outbreak in DRC and turn it into two CSVs.

This is plain Markdown — any agent can follow it, not just Claude Code.

## Non-negotiable rules

1. **Never invent, estimate, or interpolate a figure.** Every number written to a CSV must be
   printed in the PDF or computed from PDF figures by an arithmetic rule stated here. If a value
   is absent, leave the cell empty.
2. **Stop on a failed validation gate** (step 9). Do not write partial or "best effort" CSVs, and
   do not "fix" a number so the totals balance. Report what failed and which page it came from.
   The one exception is the **single-cell rule** in step 9: a table-vs-narrative disagreement on a
   field that feeds exactly one CSV cell leaves that cell empty instead of stopping the run.
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
  posted (63, 75, 76, 43, 45, 48 are missing as of N°101; 115 as of N°131; 142 as of N°143). Drive off what exists, never off
  "yesterday's number + 1". To confirm a number is missing rather than overlooked, also search all
  categories (`/wp-json/wp/v2/posts?search=142`) and the media library
  (`/wp-json/wp/v2/media?search=SitRep_MVEBDB_142`). N°142: nothing found as of 6 Oct 2026. The
  cumulative jump from N°141 to N°143 (+161) is larger than N°143's own new cases (59); the
  difference belongs to the unpublished day. Never interpolate it.
- INSP sometimes posts the same report twice: N°131 has two posts (`…_22_09_2026.pdf` and
  `…_22_09_2026-1.pdf`), and the PDFs are byte-identical. Compare the PDFs before treating a second
  post as a correction. A real correction shows up as a changed `modified` date on the post (add
  `modified` to `_fields`), different PDF bytes, or a `…-1.pdf` upload.

Skip any post whose sitrep number already has both CSVs in `data/`, **except** a report ingested
with a cell left empty under the single-cell rule (step 9; see *Open items* at the end). Re-check
those on every run, and if a corrected upload has appeared, re-ingest that report.

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
| `sitrep_number` | post **title** | `SitRep N°101/MVEBDB/23/08/2026` → `101`. Strip leading zeros (`N°0100` → `100`). Allow a space before the slash (`SitRep N°143 /MVE-BDBV/…`, in both the title and the PDF header). Cross-check against the PDF header line; if they disagree, trust the PDF and report the mismatch. |
| `report_date` | **PDF** page 1: `Date de rapportage : 23 août 2026` | Map French month names. The label changed in N°137: `Date de rapportage :` through N°136, `Date du rapport :` from N°137. Match either one: `Date (?:de rapportage\|du rapport)\s*:`. The first of the month is printed as an ordinal, `1er octobre 2026` (N°139): accept `\d+(?:er)?`. The header line's date (`SitRep N°141/MVE-BDBV/01/10/2026`) can disagree with this line (N°141 reports 2 Oct). Take `report_date` from `Date du rapport`, check it against the filename, and flag the mismatch. |
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
The banner holds six cells, left to right: cumulative cases, cumulative deaths, CFR, patients in
isolation/CTE, cumulative recovered, contact-tracing rate.

**Read the banner by glyph size, not from the extracted text line** (from N°141). In N°141 a
"new health zone" callout box is overprinted on the banner, and the text line becomes unreadable
(`8 C A 4 S 42 ▪ No u v e C l O l 4 e D N z É F …`). The banner's numbers are set in large bold
type (13.9–16.1 pt) and every other glyph in that band is smaller. So: find the first label line
by its word `SUIVI` (the second label line, `CAS DÉCÈS LETALITE …`, is overprinted too); take the
page-1 characters ≥ 12 pt lying 14–52 pt below it; sort them by x; and start a new cell at every
horizontal gap > 15 pt. This yields exactly six cells, e.g. `['8442', '4080', '48,3%', '846',
'2213', '73,1%']`. It reproduces the committed values of N°131–138 exactly. Gate: six cells, four
integers and two `nn,n%`, and cells 1–2 must equal Tableau 2's Total row. The positional reading
below is only a fallback.

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

Cross-check `suspects_today` against the narrative in §2.1.1 (§1.1.3 in older reports), which
restates it. If the alerts table and the narrative disagree, apply the **single-cell rule** in
step 9: leave `suspects_today` empty. Never pick one of the two figures.

The narrative wording varies. Match a number, then an optional `(x,x %)`, an optional `alertes`,
an optional `ont été`, then `validées comme`. **Do not require the word "alertes"**:

| Report | Text |
|---|---|
| N°101 | `277 (20,7%) ont été validées comme cas suspects` |
| older | `Toutes les 408 alertes validées comme cas suspects`, `413 (26,3%) alertes ont été validées` |
| N°132 | `353 alertes ont été validées comme cas suspects` |
| N°136 | `Parmi les alertes vérifiées, 283 (15,9 %) ont été validées comme cas suspects` |
| N°137 | `dont 420 (16,5 %) ont été validées comme cas suspects` |
| N°138 | `Les 334 (16,9 %) alertes validées comme cas suspects ont tous été investiguées` |

**Splitting the Total row into its nine columns.** The Total row is sometimes on the same line as
`Total` and sometimes on the next. Its numbers use thousands spaces (`1 155 174 …` is 1155 then 174),
so split it with the checks "received vivants + décédés = total" and "investigated ≤ validated",
not on spaces:

- A token longer than 3 digits is a whole number printed without a thousands space (Ituri's `1119`
  in N°131). Only join tokens when the first has 1–3 digits and each following token has exactly 3.
- Several splits can pass those checks. `… 1 496 0 283 115` reads as `1496, 0, 283, 115` or as
  `1, 496, 0, 283115`. Pick the split that equals the column sums of the province rows, which
  normally gives exactly one. Validated suspects (columns 4 + 5) are usually the same in every split;
  check that rather than assume it.

**A province row that is short or internally inconsistent.** Seen so far: N°136 (Nord-Kivu, a
blank cell), N°140 (Tshopo prints all nine cells but `91 2 92`, so received ≠ alive + dead) and
N°143 (Sud Ubangi, `36 0 36 0 0 36 0 0`, one of the last three cells blank). With the opt-in flag
described below, `suspects_today` counts as determined only if: (a) some Total-row reading has
investigated ≤ validated, and (b) its validated pair, minus the sums of the consistent province
rows, equals the validated cells the anomalous row **actually prints**. Those are cells 4–5 of a
9-cell row, or cells 3–4 or 4–5 of an 8-cell row (blank before or after them). (c) That gives
exactly one value, and (d) it equals the narrative. Without the flag every such row is a stop:
earlier code silently passed N°143 because the Total row implied the blank was 0, which this
rule forbids. N°140 (514) and N°143 (256) were accepted by maintainer decision on 6 Oct 2026.

**A province row with a blank cell (first seen in N°136).** The Nord-Kivu row printed 8 of its 9 cells
(`761 761 77 21 630 0 98 46`). The received-deceased cell was blank, and the row was also
inconsistent elsewhere: invalidated-alive was 630 against the 634 the Total row implies.

- Never fill a blank cell, and never "correct" a row. A short row fails the province-sum check above.
- `suspects_today` is still determined if validated suspects (vivants + décédés) is the same in
  every possible Total-row split *and* equals the narrative.
- Accepting the report in that case is a **per-run maintainer decision**. It is never a default,
  and the parser must not make it by itself. A parser may expose the decision as an opt-in flag
  (the N°136 run used `--accept-t3-row-anomaly`). That flag must default to off, must be passed by
  hand for the one report a maintainer approved, and must **never** appear in a scripted,
  scheduled or looped invocation. Record the row and the reasoning in the commit message, as was
  done for N°136.
- Any other short-row case is a stop.

**Contact tracing.** Also cross-check `contact_tracing_pct` against the narrative. Both forms occur:
`soit une proportion de suivi de 82,0%` and `La proportion de suivi au décours du 27 septembre
2026 était de 75,9 %` (N°135, N°136). The single-cell rule applies to this field too.

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
- **A wrapped name can straddle its own numbers line**, and its second half then lands just before
  the next zone's row (N°117–123, N°140):

  ```
  Boma
  41 17 41,5% 2 0 0 0      <- Boma Mangbetu's figures
  Mangbetu                 <- second half of the name above
  Dungu 1 1 100,0% 0       <- the next zone's row
  ```

  Joining "a line with no numbers to the following line" pairs `Boma` with the numbers, then
  prefixes `Mangbetu` to the next row. The result is zones `Boma` and `Mangbetu Dungu` (N°140) or
  `Mangbetu Gombari` (N°117–123). **Every sum still balances, so gates 1–3 do not catch it.** Rule:
  when a numbers-free fragment follows a zone row whose name is not a known zone, and
  `<that name> <fragment>` is a known zone, append the fragment to that row instead of the next
  one. The N°116–130 backfill missed this. N°117–123 were committed as `Boma` / `Mangbetu
  Gombari` and corrected on 6 Oct 2026, after a re-parse showed the figures were on the right
  rows and only the names were wrong.
- "Known zones" means the zone names in the **most recent earlier report's** zones CSV (in `data/`,
  or written earlier in the same run). Never use the union of all files: a bad name in any one
  file would then count as "known".
- The `A ventiler` row has also been printed with `AN` for `NA` (`A ventiler AN 493 NA 0`, N°140).
  Normalise it in that row only.
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

1. Zone rows summed per province equal the province subtotal, for **cases and deaths**, in every
   province that Tableau 1 lists (count the `A ventiler` deaths toward Ituri). Validate against the
   provinces the PDF actually lists, never a fixed count: there were six from N°093 and seven from
   N°128 (Sud-Ubangi). Tableau 1 and Tableau 2 must list the same provinces, and their number must
   equal "*N* Provinces touchées" on page 1. From N°140 the numbers of Tableau 1's Total row are
   printed on the line **above** the word `Total` (`76 8 376 4 042 48,3%` then `Total 63/167 (37,7 %)`).
   Join a numbers-only line to the `Total n/m` line directly below it, and only that line.
2. All provinces summed equal the `Total` row, and that total equals the page-1 banner cumulative
   cases and deaths.
3. Zone row count (excluding `A ventiler`) equals the "*N* Zones de santé touchées" figure on page 1
   and the sum of the per-province `Zones de santé touchées` column.
4. `round(confirmed_deaths / confirmed_cases * 100, 1)` equals the printed national CFR ±0.1.
5. `report_date` < `publication_date`, and both are within 14 days of today.
6. `sitrep_number` from the title equals the one in the PDF header.
7. Every non-empty numeric cell parses as a number; no cell contains a stray `%`, `,` or space.
8. **Every zone name is known or announced** (from N°140). Each zone in Tableau 2 must appear in the
   most recent earlier report's zones CSV, or be announced as new in this report
   (`Nouvelle zone de santé touchée : Alimbongo (Nord-Kivu)`, N°141). Older reports announce new
   zones in other words ("une nouvelle province a été touchée … à travers la zone de santé de
   Bulu", N°119), so an unmatched announcement is a stop for a person to check, never a reason to
   add the name automatically. This is the only gate that catches the wrapped-name error above.
   Report every newly announced zone, since a zone without geometry stays off the map.

Report the reconciliation table (computed vs printed, per province) in the run summary even when
everything passes — it is the evidence that the extraction is correct.

### The single-cell rule (from N°138)

Some fields are printed twice in the PDF, once in a table or the banner and once in the narrative:
`suspects_today` (alerts table vs narrative) and `contact_tracing_pct` (banner vs narrative). Each
of these feeds exactly one CSV cell. When the two printings disagree on **one** such field and
**every other gate passes**:

- leave that cell **empty**, and write and ingest the report;
- say in the run report, the commit message and the PR description what each printing gave and
  why the cell is empty;
- list the report under *Open items* below, and re-check insp.cd for a corrected upload on later
  runs. If one appears, re-ingest the report and fill the cell.

The empty cell means the source disagrees with itself. It does not mean the value is zero, and
it must not be filled with either figure.

The stop rule still applies in full to any disagreement that touches **cases, deaths, zone
counts or the national totals** (gates 1–4), to a field that can't be parsed on one side, and to
disagreements on more than one such field in the same report. Hold the report in those cases.

Precedent: in N°138 the alerts table gives 277 + 70 = **347** validated suspects, and the table is
internally consistent (347 + 1624 invalidated = 1971 verified; all 347 investigated). The
narrative says **"Les 334 (16,9 %)"**, and 334 is the figure that matches 16.9 % of 1971.
`suspects_today` is empty in `summary_sitrep138_2026-09-30.csv`. Under the earlier stop rule this
report would have been held; the maintainer chose to ingest it.

## Step 10 — Write the CSVs

Write both files to `data/` with the step-0 names. UTF-8, `\n` line endings, no BOM,
header row exactly as specified. Sort the zones CSV by `confirmed_cases` descending, then zone
name ascending, with `A ventiler` last.

If a file with that name already exists, compare: identical → no-op; different → the sitrep was
re-published (INSP does re-upload corrected PDFs). Overwrite, and say so, noting which figures moved.
A corrected upload that resolves a single-cell disagreement is the usual case. Re-ingest, fill
the cell, and remove the report from *Open items*.

## Step 11 — Report

State: sitrep number, report and publication dates, status and the filename it came from, row
counts, the province reconciliation, how many zones lack a population denominator, and the two
output paths. Flag anything the PDF said but the schema cannot hold (e.g. N°100 carried a footnote
that one case was added by data reconciliation and is excluded from the day's new confirmations).
Also list every cell left empty under the single-cell rule, every row anomaly accepted by
maintainer decision, and the result of re-checking the reports under *Open items*.

## Not in scope

Ingestion stops at the CSVs. It does **not** touch `config.drc-bvd-2026.js`, `index.html` or the
map — updating the dashboard is a separate, explicitly requested step, and per `CLAUDE.md` the
embedded figures and `data/` must then be changed together. When that step runs, the dashboard's
national and province figures must equal this PDF exactly (banner and Tableau 1). List every
discrepancy and its fix before changing anything, and never redistribute `A ventiler` deaths into zones.

## Open items

Re-check these on every run (see step 1):

| Report | Issue | Action when a corrected upload appears |
|---|---|---|
| N°138 (29 Sept 2026) | `suspects_today` left empty: the alerts table gives 347, the narrative 334. Checked 1 and 6 Oct 2026: post unmodified, PDF byte-identical, no `-1.pdf`. | Re-ingest N°138, fill `suspects_today`, remove this row. |
| N°142 (≈3 Oct 2026) | Not published. Checked 6 Oct 2026: not in the sitrep category, no search hit in any category, no media file. | If it appears, ingest it and remove this row; until then it is a gap, never interpolated. |
