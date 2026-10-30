"""Regression test for tools/sitrep_ingest.py and tools/sitrep_build.py.

    uv run --with pdfplumber --python 3.12 python -I tools/test_sitrep_ingest.py [--pdf-dir DIR] [N ...]

Re-parses committed SitReps and checks that the CSVs the parser produces are byte-identical to the committed ones in
data/, and that every report a maintainer decision covers fails exactly the gates that decision names (and still
produces the committed CSVs). Then rebuilds the dashboard artefacts of N°131 onward and compares them with the
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
FIRST = 126
HELD_PDF = {150: 'SitRep_MVEBDB_150_11_10_2026.pdf'}
HELD_DATES = {150: '2026-10-14'}


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
    print(f'Re-parsing {len(ns)} report(s); PDFs in {pdf_dir}\n')
    for n in ns:
        c = CASES.get(n, {})
        try:
            problems, logs = run_ingest(n, reports.get(n), pdf_dir, tmp)
        except Exception as e:                       # a crash is a failure, never a skip
            problems, logs = [f'{type(e).__name__}: {e}'], []
        what = ('held, refused' if c.get('held') else
                'expected stop, CSVs match' if c.get('fails') else 'all gates pass, CSVs byte-identical')
        print(f"{'PASS' if not problems else 'FAIL'}  N°{n:<4} {what}" + (f"  [{c['case']}]" if c.get('case') else ''))
        for p in problems: print('        ' + p)
        if problems: failed.append(n)
    bns = [n for n in ns if n >= 131 and n in reports]
    print(f'\nDashboard artefacts (sitrep_build.py check, {len(bns)} report(s)):')
    bad = sb.check(bns, pdf_dir) if bns else []
    print(f"\n{len(ns) - len(failed)}/{len(ns)} ingest case(s) pass" + (f'; FAILED: {failed}' if failed else '')
          + f"; {len(bad)} dashboard artefact difference(s)" + (f': {bad}' if bad else ''))
    return 1 if failed or bad else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
