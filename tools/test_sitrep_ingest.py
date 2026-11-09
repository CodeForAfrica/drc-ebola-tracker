"""Regression test for tools/sitrep_ingest.py and tools/sitrep_build.py.

    uv run --with pdfplumber --python 3.12 python -I tools/test_sitrep_ingest.py [--pdf-dir DIR] [N ...]

First checks the file-name reader (status, number, date) over every file-name form the skill lists. Then re-parses
committed SitReps and checks that the CSVs the parser produces are byte-identical to the committed ones in
data/, and that every report a maintainer decision covers fails exactly the gates that decision names (and still
produces the committed CSVs). Then rebuilds the dashboard artefacts of N°131 onward (reports on the dashboard) and compares them with the
committed config and data/ mirrors (tools/sitrep_build.py check).

PDFs are fetched from insp.cd at test time by the committed source_pdf name and cached in --pdf-dir (default:
$SITREP_PDF_DIR or <tmp>/sitrep_pdfs). No PDF is committed. Exit status 0 only if everything matches.

When a new layout breaks the parser, the attended session that fixes it adds that report to CASES below.
"""
import csv, datetime as dt, glob, os, re, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import sitrep_ingest as si
import sitrep_build as sb

REPO = si.REPO
ACCEPT_T3 = 'accept-t3-row-anomaly'

# Each committed report from N°126 is re-parsed. N°116–125 are not: they came from the N°116–130 backfill, written to
# other conventions (CFR rounded to one decimal, older Tableau 3 and narrative layouts) and are not parser output.
# Entries below name the layout cases and maintainer decisions a report exercises; reports not listed must pass every
# gate with no flag.
CASES = {
    127: dict(case='new zone Dungu announced only in older wording: gate 8 stops (step 9)',
              fails=["every zone name is already known or announced as new in this report (unknown: ['Dungu']; announced: [])"]),
    128: dict(case='Sud-Ubangi ND with a 0 cell (ND share rule)'),
    131: dict(case="health zone 'Tshopo' inside Tshopo province; duplicate post"),
    136: dict(case='Tableau 3 row with a blank cell (Nord-Kivu)', flags=[ACCEPT_T3]),
    138: dict(case='single-cell rule: suspects_today empty (table 347, narrative 334)'),
    139: dict(case="'1er octobre' report date"),
    140: dict(case="Tableau 1 Total numbers above 'Total'; Tshopo row received != alive + dead; 'A ventiler AN'; "
                   "Boma / Mangbetu wrapped name", flags=[ACCEPT_T3]),
    141: dict(case='new-zone callout overprinted on the banner (glyph-size reader)'),
    143: dict(case="'N°143 /MVE' header space; short Sud-Ubangi Tableau 3 row", flags=[ACCEPT_T3]),
    144: dict(case="'-2' WordPress filename suffix"),
    147: dict(case='inconsistent Tableau 3 Total row (non-CSV column); Dakwa announced; Ituri ND (ND share rule)',
              flags=[ACCEPT_T3]),
    148: dict(case="'NA!' CFR cell in the A ventiler row; Sud-Ubangi ND kept (ND share rule)"),
    149: dict(case='Ituri + Sud-Ubangi ND, suspects empty (ND share rule)'),
    150: dict(case='held: banner and Tableau 1 one case below Tableau 2 (never ingested)', held=True,
              fails=['Haut-Uele: Tableau 1 (new,cases,deaths) == Tableau 2 subtotal',
                     'banner cases/deaths 9065/4381 == Total 9066/4381', 'Tableau 1 Total == Tableau 2 Total']),
    151: dict(case="new-cases figure on the 'Total n/m' line"),
    153: dict(case="'612(15,3 %)' suspects narrative"),
    155: dict(case='eighth province Nord Ubangi; Wapinda announced with the province'),
    157: dict(case='page number inside the Tableau 3 Total block'),
    158: dict(case="'20octobre 2026' publication date"),
    159: dict(case="Tableau 3 Total above 'Total Général'; NA cells in the Nord-Ubangi row. Its Total row prints received "
                   "3 856 against the rows' 3 795, so the parser stops; the committed summary (663) was accepted by hand",
              compare=['zones'],
              fails=['Tableau 3 Total None: unique 9-column split = Σ province rows (7 rows, 0 short/inconsistent: [])',
                     'suspects Tableau 3 None == narrative 663']),
    160: dict(case="Tableau 1 Total row on the line above a bare 'Total'; gate 3 one-off (Nord-Kivu 16/34, Total 63/167)",
              fails=['Nord-Kivu: zone rows 17 == Tableau 1 zones touchées 16',
                     'zone rows 66 == page-1 zones 66 == Σ province zones touchées']),
    161: dict(case="gate 3 one-off (Nord-Kivu 16/34, Total 63/167); '1/11(9,1%)'",
              fails=['Nord-Kivu: zone rows 17 == Tableau 1 zones touchées 16',
                     'zone rows 66 == page-1 zones 66 == Σ province zones touchées']),
    162: dict(case='filename carries 163; gate 3 one-off (Bas-Uélé 3/11); contact tracing empty (key messages 88.1)',
              title=162,
              fails=['Bas-Uele: zone rows 4 == Tableau 1 zones touchées 3',
                     'zone rows 66 == page-1 zones 66 == Σ province zones touchées']),
    163: dict(case="split denominator '66/17 8(37,1%)'; ND share 5.46 % -> suspects empty"),
    164: dict(case='banner isolation cell blank; Tableau 2 header garbled; Ituri ND',
              fails=['banner isolation cell is printed and well-formed (None)']),
    165: dict(case='Tableau 2 header garbled; Nord-Ubangi ND kept'),
    166: dict(case="banner isolation printed '9 36'; '66/178(37,1%)'",
              fails=["banner isolation cell is printed and well-formed ('9 36')"]),
    167: dict(case="Yakoma unannounced (maintainer decision); 'Zone de / santé' header split; '2/11(18,2%)'",
              fails=["every zone name is already known or announced as new in this report (unknown: ['Yakoma']; announced: [])"]),
}
CASES[169] = dict(case="Tableau 1 Ituri '3 769 *' footnote marker; Tableau 3 tenth column (suspects non investigués); "
                      "Tableau 3 Total above 'Total' / 'Général'; Ituri data harmonisation (restatement), no A ventiler row. "
                      "The 1 Nov run crashed on its file name ('N_169', dashes in the date)")
CASES[170] = dict(case="Tableau 3 tenth column; A ventiler row back (493): N°169's harmonisation is not carried forward")
# N°176 / N°177: Tableau 1 Total with the zone cell alone above 'Total <numbers>' (N°176 also puts the new-cases figure
# on a bare line below). Tableau 1 now passes; both stop at Tableau 3, pending a maintainer decision (9 Nov 2026):
# N°176 verifies 3 855 of 4 176 alerts, so the rows no longer split uniquely; N°177 drops to nine columns and its
# suspects column (461) differs from the validated suspects (457). Not ingested.
CASES[176] = dict(case="Tableau 1 zone cell above 'Total 10879 5302 48,7%', new cases '76' below; Tableau 3 rows with "
                       "unverified alerts (pending decision)", held=True,
                  fails=['Tableau 3 Total None: unique 10-column split = Σ province rows (6 rows, 5 short/inconsistent: '
                         "['119 5 124 18 5 101 0 23 13 10', '111 3 114 8 3 108 0 11 0 11', '1 466 72 1538 111 68 1345 4 179 99 179', "
                         "'2 174 84 2258 197 83 1667 0 280 149 280', '18 0 18 8 0 5 0 8 1 8'])",
                         'suspects Tableau 3 None == narrative 506'])
CASES[177] = dict(case="Tableau 1 zone cell above 'Total 41 10 920 5 323 48,7%'; Tableau 3 back to nine columns, "
                       "suspects column 461 vs validated 457 (pending decision)", held=True,
                  fails=['Tableau 3 Total None: unique 9-column split = Σ province rows (0 rows, 0 short/inconsistent: [])',
                         'suspects Tableau 3 None == narrative 457'])
FIRST = 126
# Committed reports deliberately left out of the dashboard series (maintainer decisions): no D.nat2 / D.national /
# national_timeseries.csv row, one break row in the per-zone series.
DASHBOARD_EXCLUDED = {169: 'Ituri harmonisation not carried forward by N°170 (maintainer decision, 2 Nov 2026)'}
HELD_PDF = {150: 'SitRep_MVEBDB_150_11_10_2026.pdf', 176: 'SitRep_MVE_RDC_N176_06-11-2026_vf.pdf',
            177: 'SitRep_MVE_RDC_N177_07-11-2026_final_corrige.pdf'}
HELD_DATES = {150: '2026-10-14', 176: '2026-11-07', 177: '2026-11-08'}

# File names: the skill's step-3 table, other forms seen on insp.cd, and N°168 / N°169 (status, number, date).
D_ = lambda s: dt.date.fromisoformat(s)
FILENAMES = [
    ('SitRep_MVEBDB_101_23_08_2026.pdf', 'final', 101, D_('2026-08-23')),
    ('Draft_SitRep_MVE_RDC_N°055_08_07_2026.pdf', 'provisional', 55, D_('2026-07-08')),
    ('Draft2_SitRep_MVE_RDC_N°054_07_07_2026.pdf', 'provisional', 54, D_('2026-07-07')),
    ('Draft-1-SitRep_MVE_RDC_N°040_23_06_2026.pdf', 'provisional', 40, D_('2026-06-23')),
    ('Daft-SitRep_MVE_RDC_N18_01_06_2026_JO_PA-Final-1.pdf', 'provisional', 18, D_('2026-06-01')),
    ('Draft-Final-SitRep_MVE_RDC_N°037_20_06_2026.pdf', 'provisional', 37, D_('2026-06-20')),
    ('SitRep_MVE_RDC_N_64_17-07-2026_OKK.pdf', 'final', 64, D_('2026-07-17')),
    ('Final-SitRep_MVE_RDC_N°044_27_06_2026.pdf', 'final', 44, D_('2026-06-27')),
    ('100.pdf', 'unknown', 100, None), ('99.pdf', 'unknown', 99, None), ('97-1.pdf', 'unknown', 97, None),
    ('85.pdf', 'unknown', 85, None),
    ('SitRep_MVE_RDC_20260701_OK.pdf', 'final', None, D_('2026-07-01')),
    ('SitRep_MVE_RDC_N_63_16-07-2026_Final.pdf', 'final', 63, D_('2026-07-16')),
    ('SitRep_MVE_RDC_N_081_03_08_2026_VF.pdf', 'final', 81, D_('2026-08-03')),
    ('SitRep_MVE_RDC_N_080_02-08-2026.pdf', 'final', 80, D_('2026-08-02')),
    ('SitRep_MVEBDB_144_05_10_2026-2.pdf', 'final', 144, D_('2026-10-05')),
    ('SITREP_MVEBDB_159_20_10_2026.pdf', 'final', 159, D_('2026-10-20')),
    ('SITREP_MVEBDB_163_23_10_2026.pdf', 'final', 163, D_('2026-10-23')),     # N°162's file: the name says 163
    ('SitRep_MVEBDB_166_27_10_2026_VF.pdf', 'final', 166, D_('2026-10-27')),
    ('final_draft_SitRep_MVEBDB_168_29_10_2026.pdf', 'provisional', 168, D_('2026-10-29')),
    ('final_draft_SitRep_MVE_RDC_N_169_30-10-2026.pdf', 'provisional', 169, D_('2026-10-30')),
    ('final_draft_SitRep_MVE_RDC_N_170_31-10-2026.pdf', 'provisional', 170, D_('2026-10-31')),
    ('SitRep_MVE_RDC_N176_06-11-2026_vf.pdf', 'final', 176, D_('2026-11-06')),
    ('SitRep_MVE_RDC_N177_07-11-2026_final_corrige.pdf', 'final', 177, D_('2026-11-07')),
]


def test_filenames():
    bad = []
    for name, status, number, date in FILENAMES:
        got = si.filename_info(name)
        if (got['status'], got['number'], got['date']) != (status, number, date):
            bad.append(f"{name}: got {got['status']}, {got['number']}, {got['date']}; expected {status}, {number}, {date}")
    print(f"{'PASS' if not bad else 'FAIL'}  file-name reader: {len(FILENAMES) - len(bad)}/{len(FILENAMES)} names")
    for b in bad: print('        ' + b)
    return bad


def committed():
    out = {}
    for f in glob.glob(f'{REPO}/data/summary_sitrep*_????-??-??.csv'):
        n = int(re.search(r'summary_sitrep(\d+)_', f).group(1))
        if n >= FIRST: out[n] = next(csv.DictReader(open(f, encoding='utf8')))
    return out


def run_ingest(n, summ, pdf_dir, tmp):
    c = CASES.get(n, {})
    name = summ['source_pdf'] if summ else HELD_PDF[n]
    pub = summ['publication_date'] if summ else HELD_DATES[n]
    pdf = sb.fetch_pdf(name, pdf_dir)
    logs = []
    r = si.ingest(pdf, tmp, write=False, title_no=c.get('title', n), pdf_cache=pdf_dir,
                  today=dt.date.fromisoformat(pub) + dt.timedelta(days=1),
                  accept_t3_row_anomaly=ACCEPT_T3 in c.get('flags', []), log=lambda *a: logs.append(' '.join(map(str, a))))
    problems = []
    if sorted(r['fails']) != sorted(c.get('fails', [])):
        problems.append(f"gates failed {r['fails']}, expected {c.get('fails', [])}")
    if any(f.startswith('parser error') for f in r['fails']): problems.append('the parser crashed instead of failing a gate')
    if r['written']: problems.append(f"wrote files in a dry run: {r['written']}")
    if not c.get('held'):
        for fname, text in r['outs'].items():
            kind = fname.split('_')[0]
            if kind not in c.get('compare', ['summary', 'zones']): continue
            path = f'{REPO}/data/{fname}'
            if not os.path.exists(path): problems.append(f'{fname}: no committed file'); continue
            ref = open(path, encoding='utf8', newline='').read()
            if ref != text:
                diff = [(a, b) for a, b in zip(ref.splitlines(), text.splitlines()) if a != b][:2]
                problems.append(f'{fname} differs ({len(ref.splitlines())} vs {len(text.splitlines())} lines): {diff}')
    return problems, logs


def main(argv):
    pdf_dir = os.environ.get('SITREP_PDF_DIR') or os.path.join(tempfile.gettempdir(), 'sitrep_pdfs')
    if '--pdf-dir' in argv:
        i = argv.index('--pdf-dir'); pdf_dir = argv[i + 1]; del argv[i:i + 2]
    only = {int(a) for a in argv}
    reports = committed()
    ns = sorted(set(reports) | set(HELD_PDF))
    if only: ns = [n for n in ns if n in only]
    tmp = tempfile.mkdtemp(prefix='sitrep_test_')
    failed = []
    name_bad = test_filenames()
    print()
    print(f'Re-parsing {len(ns)} report(s); PDFs in {pdf_dir}\n')
    for n in ns:
        c = CASES.get(n, {})
        try:
            problems, logs = run_ingest(n, reports.get(n), pdf_dir, tmp)
        except Exception as e:                       # a crash is a failure, never a skip
            problems, logs = [f'{type(e).__name__}: {e}'], []
        what = ('not ingested, stops at the expected gates' if c.get('held') else
                'expected stop, CSVs match' if c.get('fails') else 'all gates pass, CSVs byte-identical')
        print(f"{'PASS' if not problems else 'FAIL'}  N°{n:<4} {what}" + (f"  [{c['case']}]" if c.get('case') else ''))
        for p in problems: print('        ' + p)
        if problems: failed.append(n)
    _, _, D = sb.load_config()
    on_dashboard = {int(r['s']) for r in D['nat2']}
    live = int(D['nat2'][-1]['s'])
    bad = []
    print('\nDashboard exclusions:')
    for n in sorted(reports):
        if n < FIRST or n > live: continue          # backfill era; ingested but not yet on the dashboard
        if n in DASHBOARD_EXCLUDED:
            ok = n not in on_dashboard and n not in {int(r[0]) for r in D['national']}
            print(f"{'PASS' if ok else 'FAIL'}  N°{n:<4} in data/ but left out of the dashboard series  [{DASHBOARD_EXCLUDED[n]}]")
            if not ok: bad.append(f'N°{n} is on the dashboard but should be excluded')
        elif n not in on_dashboard:
            print(f'FAIL  N°{n:<4} in data/ but missing from the dashboard series'); bad.append(f'N°{n} missing from the dashboard')
    bns = [n for n in ns if n >= 131 and n in reports and n in on_dashboard]
    print(f'\nDashboard artefacts (sitrep_build.py check, {len(bns)} report(s)):')
    bad += sb.check(bns, pdf_dir) if bns else []
    print(f"\nfile names {len(FILENAMES) - len(name_bad)}/{len(FILENAMES)}; {len(ns) - len(failed)}/{len(ns)} ingest case(s) pass"
          + (f'; FAILED: {failed}' if failed else '') + f"; {len(bad)} dashboard artefact difference(s)" + (f': {bad}' if bad else ''))
    return 1 if failed or bad or name_bad else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
