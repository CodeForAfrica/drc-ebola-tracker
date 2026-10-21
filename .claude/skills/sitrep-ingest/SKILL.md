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
https://insp.cd/wp-json/wp/v2/posts?categories=308&per_page=25&page=1&_fields=id,date,modified,slug,title,content
https://insp.cd/wp-json/wp/v2/posts?categories=219&per_page=25&page=1&_fields=id,date,modified,slug,title,content
https://insp.cd/wp-json/wp/v2/posts?categories=307&per_page=25&page=1&_fields=id,date,modified,slug,title,content
```

- Category `308` is `sitrep`. Re-resolve it if it ever 404s:
  `https://insp.cd/wp-json/wp/v2/categories?search=sitrep`
- **Query categories `219` (Actualités) and `307` (Activité COUSP) as well, and merge all three by
  sitrep number.** Don't rely on `308` catching everything. N°156 and N°158 were filed under `307` and
  `308` only, N°157 under `219` and `308`. INSP sometimes
  posts a sitrep under `219` only. N°115 (7 Sept 2026, `SitRep_MVEBDB_115_06_09_2026.pdf`) never
  reached `308`, so every `308`-only run treated it as unpublished until 12 Oct 2026. N°146 first went
  up on 9 Oct under `219` only (post 25689) and was re-posted to `308` on 11 Oct as `…-1.pdf`; the
  two PDFs are byte-identical. `219` also carries news, so keep only posts whose title matches
  `SitRep`.
- Results are newest-first. `page=1` is enough for a daily run; paginate only for a backfill.
  Requesting a page past the end returns HTTP 400 — treat that as "end of list", not an error.
- Sitreps are published irregularly: several can appear on one day, and some numbers are never
  posted. Drive off what exists, never off "yesterday's number + 1". To confirm a number is missing
  rather than overlooked, check categories `308` and `219`, search all categories
  (`/wp-json/wp/v2/posts?search=142`), and list the PDFs **uploaded** around the expected date
  (`/wp-json/wp/v2/media?after=2026-10-02T00:00:00&before=2026-10-12T23:59:59&per_page=100`).
  Search the media library by date, not only by name: early filenames vary
  (`SitRep_MVE_RDC_20260701_OK.pdf`, `…_N_63_…`, `…_NA°046_…`), and a file can be uploaded with
  no post at all.
- Full sweep of N°1–149 on 12 Oct 2026 (both categories, search, media by upload date):
  - **No post and no file anywhere:** N°3, 29, 43, 45, 75, 76, 142.
  - **N°48 has a post** in `308` (3 July, `SitRep_MVE_RDC_20260701_OK.pdf`); it was recorded as
    missing only because its filename carries a date, not a number.
  - **N°63 exists only as a media file** with no post (`SitRep_MVE_RDC_N_63_16-07-2026_Final.pdf`,
    uploaded 17 July). `data/national_timeseries.csv` has it as `missing`, citing a filename
    without `_Final` that returns 404.
  - **N°115 is posted under `219` only** (see above). Not yet ingested.
  - N°6, N°131 and N°146 each have two posts of the same PDF.
  N°142: nothing found as of 12 Oct 2026. The
  cumulative jump from N°141 to N°143 (+161) is larger than N°143's own new cases (59); the
  difference belongs to the unpublished day. Never interpolate it.
- INSP sometimes posts the same report twice: N°131 has two posts (`…_22_09_2026.pdf` and
  `…_22_09_2026-1.pdf`), and the PDFs are byte-identical. Compare the PDFs before treating a second
  post as a correction. A real correction shows up as a changed `modified` date on the post (add
  `modified` to `_fields`), different PDF bytes, or a `…-1.pdf` upload.
- **A `-N` suffix on its own is not a re-upload.** N°144's post embeds `…_05_10_2026-2.pdf`, and
  the post was edited the day after it went up, yet the media library
  (`/wp-json/wp/v2/media?search=SitRep_MVEBDB_144`) holds a single file uploaded with the post,
  and the base, `-1` and `-3` names return 404. WordPress adds the suffix when a filename is already
  taken. Before treating a suffixed file or an edited post as a correction, check the media library
  for more than one upload and compare the PDF bytes. Status and number parsing handle the suffix
  as is.

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
| `report_date` | **PDF** page 1: `Date de rapportage : 23 août 2026` | Map French month names. The label changed in N°137: `Date de rapportage :` through N°136, `Date du rapport :` from N°137. Match either one: `Date (?:de rapportage\|du rapport)\s*:`. The first of the month is printed as an ordinal, `1er octobre 2026` (N°139): accept `\d+(?:er)?`. The header line's date (`SitRep N°141/MVE-BDBV/01/10/2026`) can disagree with this line (N°141 reports 2 Oct). Take `report_date` from `Date du rapport`, check it against the filename, and flag the mismatch. **Exception (N°150):** when `Date du rapport` disagrees with *both* the filename and the report's other printings (header line, table titles `au 11 octobre 2026`, narrative `En terme du 11 octobre`) *and* would collide with an adjacent sitrep's `report_date`, take the date the rest of the document supports and record the substitution in the run report and commit message. N°150 prints `Date du rapport : 12 octobre 2026` while its filename, header, both table titles and narrative say 11 Oct, and N°151 is 12 Oct: its `report_date` is 2026-10-11. In N°141 the filename backed `Date du rapport`, so the rule there stays as above. |
| `publication_date` | **PDF** page 1: `Date de publication : 24 août 2026` | The day and month can run together (`Date de publication : 20octobre 2026`, N°158): insert a space after the day digits before reading the month, but never split an ordinal (`1er octobre` must stay whole; an over-eager first fix broke N°139). **Not the WordPress post date** — they routinely differ (N°101 was published 24 Aug per the PDF but posted 25 Aug). Use the WP `date` only if the PDF line is missing, and note the substitution. |
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
below is only a fallback, and **it no longer works while the callout is overprinted**: from N°143
the `LETALITE` label line is garbled too, so nothing usable follows it in the extracted text
(N°143–145). Use the glyph-size reader; if it fails its gate, stop rather than fall back.

**The overprinted callout is stale and is never data.** The "Nouvelle zone de santé touchée :
Alimbongo (Nord-Kivu), avec 4 cas confirmés dont 2 décès" box from N°141 is still printed on the
banner in N°143, 144 and 145, unchanged. In N°145 Alimbongo's Tableau 2 row is **5 cases / 3
deaths**, not the box's 4 / 2. Never read figures from this box, and never treat it as a new-zone
announcement for gate 8. Only the report's own narrative and Tableau 2 count, and Tableau 2 is
authoritative for zone figures. A zone already in the previous report needs no announcement anyway.

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
| N°150 | `dont 334 (13,3 %)` + page number `4` + page break + `validées comme cas suspects`: allow a lone page number (`\d{1,2}`) between the figure and `validées`, only immediately before `validées`, or the page number is read as the figure |
| N°151 | `dont 522 (16,8 %) validées comme cas suspects` |
| N°153 | `dont\n612(15,3 %) validées comme cas suspects`: no space before the parenthesis; allow `\s*` between the figure and `(` |

**A page number inside the Total block (N°157).** When a page break falls right after the Total row,
the page number (`4`) sits on its own line before `Figure 1` and is read as a tenth Total-row token,
so no split matches. Skip a lone 1–2-digit line inside the Total block.

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

**A province that did not report (ND).** Tableau 3 prints `ND` in the cells of a province that
sent no alert data: all nine cells (`Ituri ND ND ND ND ND ND ND ND ND`; N°119–121, 147–149), or
`ND` with `NA` or `0` in one cell (`Sud Ubangi ND ND NA ND ND ND ND ND NA`, N°123;
`ND ND 0 ND …`, N°128; `ND ND NA ND …`, N°114 and N°129–130). Older layouts mark it in the
suspects and contact-tracing tables instead (`Haut-Uélé ND ND ND`, N°061–065). Rows seen so far:
Sud-Kivu (N°062, 064, 114, 119), Sud-Ubangi (N°119–121, 123, 128–130, 147–149), Haut-Uélé
(N°062, 129) and Ituri (N°147, 149); contact tracing ND for Haut-Uélé (N°061–065), Sud-Ubangi
(N°148) and Ituri + Sud-Ubangi (N°149). Leave the row out of the province sums and report which
provinces were ND. Never read `ND` as 0. Report it as a flag in the run summary: the dashboard
marks every figure whose SitRep records a province as ND (`D.nat2[].nd`,
`data/not_reported_provinces.csv`), so a later dashboard update needs the list. The Total row and the narrative then cover the reporting provinces only
(N°149: "l'Ituri et le Sud-Ubangi n'ont pas transmis de données actualisées (ND)"), so the
printed suspects figure is not comparable with other days. Whether to keep it is a **per-run
maintainer decision**: N°147 (270) and N°149 (310) left `suspects_today` empty because Ituri, the
largest source of alerts, was ND; N°148 kept 473 because only Sud-Ubangi (2 suspects in N°146) was
ND. A parser may expose the choice as an opt-in flag (`--suspects-empty-nd`, which also requires at
least one ND province), with the same rules as `--accept-t3-row-anomaly` below. Record the reason
in the commit message.

**An inconsistent Total row (first seen in N°147).** The province rows were consistent, but the
Total row printed invalidated-alive as 1 452 against a province sum of 1 450 (its own cells add up
to 1 724 against 1 722 received), and the narrative repeated 1 452. The same opt-in flag accepts
this case **only** when the value that feeds the CSV (validated suspects, vivants + décédés) is
confirmed independently by all three of: every reading of the Total row, the sum of the province
rows, and the narrative. Disagreement in cells that feed no CSV field is tolerated; any
disagreement on the validated cells, or with the narrative, still stops the run (as N°138 showed,
the narrative can disagree with the table). N°147 (270) was accepted by maintainer decision on
12 Oct 2026. Report the closest Total-row reading against the province sum, so the reviewer sees
which column differs.

**Contact tracing.** Also cross-check `contact_tracing_pct` against the narrative. Both forms occur:
`soit une proportion de suivi de 82,0%` and `La proportion de suivi au décours du 27 septembre
2026 était de 75,9 %` (N°135, N°136); from N°151 `soit un taux de suivi de 77,6 %` (match
`(?:proportion|taux) de suivi`). The single-cell rule applies to this field too. A province missing
from contact tracing is written in prose, not as `ND`: `Aucune donnée n'a été transmise par le
Sud-Ubangi` (N°151), `l'Ituri et le Sud-Ubangi n'ont pas transmis de données actualisées (ND)` (N°149).
Both count as ND for the dashboard's `nd.ct`. The same holds for alerts: `Le Sud-Kivu n'a pas
transmis ses données` (N°152, no Tableau 3 row) counts as ND for `nd.sus`. Only an explicit record
counts: a province merely missing from the narrative's list of provinces "ayant transmis leurs
données" is not marked (maintainer decision, 19 Oct 2026). A province on its **first day as
affected** is expected to be missing from the transmission lists (Nord-Ubangi in N°155) and is
not marked either; the dashboard's `mm_cov_nd` mentions it instead.

**Contact tracing: a named list counts as explicit (maintainer decision, 21 Oct 2026).** When the
contact-tracing narrative *names* the provinces that transmitted, and that list is complete (its
per-province contacts add up to the narrative's own totals), the affected provinces not on it go in
`nd.ct`, with `ctn` set to the number of provinces in INSP's list (the dashboard words the note from it: "Contact tracing on 17 Oct covers the six provinces INSP lists as transmitting; Sud-Kivu and Nord-Ubangi are not among them"). N°156 names six (Sud-Ubangi, Bas-Uélé, Haut-Uélé, Tshopo, Nord-Kivu, Ituri; 35 162 contacts
and 28 144 seen, exactly the totals), so Sud-Kivu and Nord-Ubangi are marked. A narrative that only
*counts* (`sept provinces ayant transmis`, N°157), or names fewer provinces than its count (N°158
names six of "sept"; Ituri is left out of the breakdown though its contacts are in the total), is
not a list: leave `nd.ct` empty. N°157's "(Tableau 4)" points at the PoE/PoC table, not at contact
tracing.

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
- The `A ventiler` row has also been printed with `AN` for `NA` (`A ventiler AN 493 NA 0`, N°140)
  and with `NA!` for the CFR cell (`A ventiler NA 493 NA! 0`, N°148). Normalise them in that row only.
  Unnormalised, the row is dropped, the 493 deaths go missing and Ituri's zone sum fails.
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
  `Haut-Uele`, `Bas-Uele`, `Nord-Kivu`, `Sud-Kivu`, `Ituri`, `Tshopo`, `Sud-Ubangi`, `Nord-Ubangi`.
  A new province must be added to the parser's province list for Tableaux 1, 2 and 3 (`Nord Ubangi`,
  N°155), or its Tableau 2 subtotal row is read as a zone and every province gate fails. From N°157
  Nord-Ubangi also has its own Tableau 3 row (`Nord Ubangi 6 1 7 6 1 0 0 7 4`).
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
   N°128 (Sud-Ubangi), and eight from N°155 (Nord-Ubangi; the national zone denominator moved from
   /167 to /178). Tableau 1 and Tableau 2 must list the same provinces, and their number must
   equal "*N* Provinces touchées" on page 1. From N°140 the numbers of Tableau 1's Total row are
   printed on the line **above** the word `Total` (`76 8 376 4 042 48,3%` then `Total 63/167 (37,7 %)`).
   Join a numbers-only line to the `Total n/m` line directly below it, and only that line. From
   N°151 the new-cases figure stays on the `Total` line (`9 144 4 410 48,2%` then
   `Total 79 65/167 (38,9%)`): accept `Total (\d+ )?n/m` and put that figure first when joining.
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
   (`Nouvelle zone de santé touchée : Alimbongo (Nord-Kivu)`, N°141; `Avec l'ajout de la zone de
   santé de Dakwa au Bas Uélé, 65 zones de santé …`, N°147, in the page-1 narrative; `une nouvelle
   province a été touchée, notamment celle Nord Ubangi à travers la zone de santé de (ZS de Wapinda)`
   and `qui devient la huitième province touchée par l'épidémie avec la ZS de Wapinda`, N°155). Match
   those sentences only: a bare `(ZS de X)` also appears in ordinary narrative (`(ZS de Likati, Dakwa
   et Ganga)`, N°153) and would let unrelated names through. Older reports announce new
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
| N°138 (29 Sept 2026) | `suspects_today` left empty: the alerts table gives 347, the narrative 334. Checked 1, 6, 8, 12, 14, 19 and 21 Oct 2026: post unmodified, PDF byte-identical, no `-1.pdf` or `-2.pdf`. | Re-ingest N°138, fill `suspects_today`, remove this row. |
| N°142 (≈3 Oct 2026) | Not published. Checked 6, 8, 12, 14, 19 and 21 Oct 2026: not in category `308` or `219`, no search hit in any category, no PDF uploaded 2–12 Oct other than N°139–149 and weekly tables, likely filenames (`_142_02/03_10_2026.pdf`, `-1`) 404. | If it appears, ingest it and remove this row; until then it is a gap, never interpolated. |
| N°150 (11 Oct 2026) | **Held, nothing written** (maintainer decision, 14 Oct 2026). Cases disagree: the page-1 banner (9 065) and Tableau 1's Haut-Uélé row (`4 382 162 42,6%`) are one below Tableau 2's Total (9 066), its Haut-Uélé subtotal (383), the zone rows and the narrative (`la RDC cumule 9066`). No single zone carries it: every Haut-Uélé zone's cumulative change equals its own new-case column (Pawa +2, Rungu +1, Wamba +1; 379 + 4 = 383). Tableau 1's row contradicts itself (379 + 4 new ≠ 382; its CFR 42,6% is 162/380). Deaths (4 381) agree everywhere. Checked 19 and 21 Oct 2026: post and media unmodified (14 Oct), PDF byte-identical, no `-1.pdf` or `-2.pdf`. When ingested, `report_date` is 2026-10-11 (step 3 exception). The dashboard carries a break row for it. | Re-check for a corrected upload (`modified`, PDF bytes, `-1.pdf`); ingest only when the banner and Tableau 1 agree with Tableau 2, then replace the break row and remove this row. |
| Earlier reports, `nd.ct` (found 21 Oct 2026) | Under the named-list rule (step 6), earlier sitreps whose contact-tracing narrative names a complete list of transmitting provinces without Sud-Kivu (or another affected province) could carry `nd.ct` for the missing ones. Not backfilled in the N°156–158 PR. | A separate pass: re-read each committed report's contact-tracing paragraph, check the named list is complete (its per-province contacts sum to the totals), add `nd.ct` with `ctn`, and mirror it in `data/not_reported_provinces.csv`. |
| N°115 (6 Sept 2026) | Published under category `219` only (post 25533, `SitRep_MVEBDB_115_06_09_2026.pdf`); found 12 Oct 2026. Not yet ingested: the dashboard still has a break row there. Its parse needs known zones from `zones_sitrep114.csv`, which has no date suffix. | Ingest it as a follow-up, replace the break row, remove this row. |
| N°063 (16 July 2026) | Uploaded as a media file with no post (`SitRep_MVE_RDC_N_63_16-07-2026_Final.pdf`); found 12 Oct 2026. `data/national_timeseries.csv` lists it as `missing` with a 404 filename. | Maintainer decision whether to ingest. Report only so far. |
