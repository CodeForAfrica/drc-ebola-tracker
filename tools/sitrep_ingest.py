"""INSP SitRep ingest: one PDF in, two CSVs out (summary + zones), per .agents/skills/sitrep-ingest/SKILL.md.

    uv run --with pdfplumber --python 3.12 python -I tools/sitrep_ingest.py <pdf> <out_dir> [options]

Prints every gate (PASS / FAIL / FLAG) and the province reconciliation. Writes the CSVs to <out_dir> only with
--write and only when every hard gate passes. A failed gate writes nothing and exits 1: an unattended run stops and
reports; it never patches the parser or the figures.

Options
  --write                       write the CSVs (default: dry run)
  --title-number N              the post title's sitrep number (required: gate 6 compares it with the PDF header;
                                the filename's number is only read to flag a mismatch)
  --today YYYY-MM-DD            "today" for gate 5 (default: the real date; set it only to re-parse past reports)
  --pdf-cache DIR               where earlier reports' PDFs are kept for the ND share rule (default: <pdf dir>/prior)
  --accept-t3-row-anomaly       per-run maintainer decision for one approved report (skill, step 6). Off by default;
                                never pass it in a scripted, scheduled or looped run.
"""
import csv, datetime as dt, glob, io, itertools, os, re, sys, traceback
import pdfplumber

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Stop(Exception):
    """A gate that later gates depend on failed (its FAIL is already recorded): the run stops there."""


def file_status(name):
    """provisional / final / unknown from the PDF file name (skill, step 3). A draft marker wins."""
    stem = os.path.splitext(os.path.basename(name))[0]
    if re.search(r'(?<![a-z])d[ar]a?ft', stem, re.I): return 'provisional'
    if re.search(r'(?<![a-z])(final|vf|fv|ok+)(?![a-z])', stem, re.I): return 'final'
    if re.search(r'sitrep', stem, re.I): return 'final'
    return 'unknown'


def filename_info(name):
    """{status, number, date} read from a PDF file name. number and date are None when the name has none; they are
    only ever compared with the PDF to flag a mismatch, never used as the sitrep's identity. Forms seen on insp.cd:
    SitRep_MVEBDB_101_23_08_2026, Draft_SitRep_MVE_RDC_N°055_08_07_2026, Daft-SitRep_MVE_RDC_N18_01_06_2026_JO_PA-Final-1,
    SitRep_MVE_RDC_N_64_17-07-2026_OKK, final_draft_SitRep_MVE_RDC_N_169_30-10-2026, SitRep_MVE_RDC_20260701_OK (date
    only), 100 / 97-1 (bare number), …_NA°046_…."""
    stem = os.path.splitext(os.path.basename(name))[0]
    number = date = None
    m = re.search(r'(?<!\d)0*(\d{1,3})[_-](\d{1,2})[_-](\d{1,2})[_-](\d{4})(?!\d)', stem)
    if m:
        number = int(m.group(1))
        try: date = dt.date(int(m.group(4)), int(m.group(3)), int(m.group(2)))
        except ValueError: date = None
    else:
        m = re.fullmatch(r'0*(\d{1,3})(?:-\d+)?', stem)                       # '100', '97-1'
        if m: number = int(m.group(1))
        m = re.search(r'(?<!\d)(20\d\d)(\d\d)(\d\d)(?!\d)', stem)              # 'SitRep_MVE_RDC_20260701_OK'
        if m:
            try: date = dt.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
            except ValueError: date = None
    return dict(status=file_status(name), number=number, date=date)


def ingest(pdf, outdir, write=False, title_no=None, today=None, pdf_cache=None, accept_t3_row_anomaly=False, log=print):
    """Parse one SitRep PDF. Returns {fails, outs (file name -> CSV text), written, sitrep, summary}. Never raises on
    the PDF's content: a value a later gate depends on that cannot be read is a FAIL at a named gate and stops the run
    (outs empty); any other parser error is also returned as a FAIL, with its line, rather than a traceback."""
    state = dict(fails=[], sitrep=None)
    try:
        return _ingest(pdf, outdir, write, title_no, today, pdf_cache, accept_t3_row_anomaly, log, state)
    except Stop:
        pass
    except Exception as e:                                   # never a traceback: a named FAIL, and the run stops
        where = traceback.extract_tb(e.__traceback__)[-1]
        msg = f'parser error (no gate covers it; fix the parser in an attended session): {type(e).__name__}: {e} at {os.path.basename(where.filename)}:{where.lineno}'
        log('FAIL ' + msg); state['fails'].append(msg)
    log(f"\n*** run stopped at a failed gate ({len(state['fails'])} failed) — nothing written")
    return dict(fails=state['fails'], outs={}, written=[], sitrep=state['sitrep'], summary=None)


def _ingest(pdf, outdir, write, title_no, today, pdf_cache, accept_t3_row_anomaly, log, state):
    TODAY = today or dt.date.today()
    fails = state['fails']
    def gate(ok, msg):
        log(('PASS ' if ok else 'FAIL ') + msg)
        if not ok: fails.append(msg)
    def need(x, msg):
        """A value later gates depend on: PASS, or FAIL and stop the run."""
        ok = x is not None and x is not False
        gate(ok, msg)
        if not ok: raise Stop
        return x
    def find(pat, s, msg, flags=0): return need(re.search(pat, s, flags), msg)
    def first(it, msg): return need(next(it, None), msg)

    text = '\n'.join(pg.extract_text() or '' for pg in pdfplumber.open(pdf).pages)
    text = text.replace('\xa0', ' ').replace('\u202f', ' ')   # no-break and narrow no-break spaces in figures
    L = [l.strip() for l in text.split('\n')]

    MONTHS = dict(janvier=1, février=2, mars=3, avril=4, mai=5, juin=6, juillet=7, août=8,
                  septembre=9, octobre=10, novembre=11, décembre=12)
    def fdate(s):
        s = re.sub(r'^(\d+)(?=(?!er\s)[^\d\s])', r'\1 ', s)   # '20octobre 2026' (N°158); never splits '1er octobre'
        try:
            d, m, y = s.split(); return dt.date(int(y), MONTHS[m.lower()], int(d.removesuffix('er')))   # '1er octobre' (N°139)
        except (ValueError, KeyError):
            return None
    def num(s): return int(s.replace(' ', ''))
    def pct(s): return float(s.replace('%', '').replace(',', '.').strip())

    # identity
    fname = os.path.basename(pdf)
    info = filename_info(fname)
    status = info['status']
    hm = find(r'SitRep N°0*(\d+)\s*/\S*?/(\d\d)/(\d\d)/(\d{4})', text,   # 'N°143 /MVE' has a space
              'PDF header line "SitRep N°…/…/DD/MM/YYYY" found')
    hdr = hm.group(1)
    sitrep = int(hdr); state['sitrep'] = sitrep
    # Gate 6: the post title against the PDF header. The filename is never the sitrep's identity (N°162's says 163).
    need(title_no is not None or None, "post title's sitrep number given for gate 6 (--title-number)")
    gate(int(title_no) == sitrep, f'sitrep number header {hdr} == post title {title_no}')
    if info['number'] is None: log(f'FLAG filename has no readable sitrep number ({fname})')
    elif info['number'] != sitrep: log(f"FLAG filename carries N°{info['number']}, title and header say N°{sitrep}")
    m_rd = find(r'Date (?:de rapportage|du rapport)\s*:\s*(\d+(?:er)? ?\S+ \d{4})', text, 'report date line ("Date du rapport :") found')
    m_pd = find(r'Date de publication\s*:\s*(\d+(?:er)? ?\S+ \d{4})', text, 'publication date line ("Date de publication :") found')
    rd = need(fdate(m_rd.group(1)), f'report date {m_rd.group(1)!r} reads as a date')
    pd = need(fdate(m_pd.group(1)), f'publication date {m_pd.group(1)!r} reads as a date')
    try: hd = dt.date(int(hm.group(4)), int(hm.group(3)), int(hm.group(2)))
    except ValueError: hd = None
    if hd != rd: log(f'FLAG header line date {hd} != Date du rapport {rd} (report_date taken from Date du rapport)')
    if info['date'] is None: log(f'FLAG filename has no readable date ({fname})')
    elif info['date'] not in (rd, hd): log(f"FLAG filename date {info['date']} != report date {rd}")
    gate(rd < pd and (TODAY - rd).days <= 14 and (TODAY - pd).days <= 14,
         f'report_date {rd} < publication_date {pd}, both within 14 days of {TODAY}')

    provinces = int(find(r'^(\d+) Provinces touchées', text, 'page 1 "N Provinces touchées" found', re.M).group(1))
    zones_p1 = int(find(r'^(\d+) Zones de santé', text, 'page 1 "N Zones de santé touchées" found', re.M).group(1))

    # banner: six KPI cells read from the large bold glyphs under the label line. Text extraction of the banner
    # interleaves glyphs, and in N°141 a callout box is overprinted on it, so read by font size and x position.
    BANNER = ['cases', 'deaths', 'CFR', 'isolation', 'recovered', 'contact tracing']
    BANNER_ANCHOR = ['CAS', 'DÉCÈS', 'LETALITE', 'ISOLEMENT/CTE', 'GUÉRIS', 'CONTACTS']   # label words, one per column
    def banner_cells(path):
        """Six KPI cells, or None for a cell with no glyphs (N°164: isolation blank). Inside a cell a gap > 2 pt is kept
        as a space, so a misplaced space shows ('9 36', N°166) instead of being glued into a number."""
        pg = pdfplumber.open(path).pages[0]
        ws = pg.extract_words()
        tops = [w['top'] for w in ws if w['text'] == 'SUIVI']
        if not tops: return None
        top = min(tops)
        cs = sorted((c for c in pg.chars if top + 14 < c['top'] < top + 52 and c['size'] >= 12 and c['text'].strip()),
                    key=lambda c: c['x0'])
        cells, cur, last = [], [], None
        for c in cs:
            if last is not None and c['x0'] - last > 15: cells.append(cur); cur = []
            cur.append(c); last = c['x1']
        if cur: cells.append(cur)
        def txt(cc):
            out, prev = '', None
            for c in cc:
                if prev is not None and c['x0'] - prev > 2: out += ' '
                out += c['text']; prev = c['x1']
            return re.sub(r' %$', '%', out)
        if len(cells) == 6: return [txt(c) for c in cells]
        # fewer cells: place each one under its label column, so a blank cell is identified, never shifted
        anch = {}
        for name in BANNER_ANCHOR:
            hit = [w for w in ws if w['text'] == name and abs(w['top'] - top) < 25]
            if len(hit) != 1: return [txt(c) for c in cells] + ['?'] * 0   # anchors not readable: fail the gate below
            anch[name] = (hit[0]['x0'] + hit[0]['x1']) / 2
        out = [None] * 6
        for cc in cells:
            mid = (cc[0]['x0'] + cc[-1]['x1']) / 2
            k = min(range(6), key=lambda q: abs(anch[BANNER_ANCHOR[q]] - mid))
            if out[k] is not None: return [txt(c) for c in cells]
            out[k] = txt(cc)
        return out
    bc = need(banner_cells(pdf), 'banner label line (SUIVI) found on page 1')
    INT = r'\d{1,3}(?: \d{3})*|\d+'          # '2 708' (thousands space) or '10141'; never '9 36'
    gate(len(bc) == 6, f'banner has six KPI cells {bc}')
    bc = (bc + [None] * 6)[:6]
    for k, (name, v) in enumerate(zip(BANNER, bc)):
        ok = v is not None and re.fullmatch(r'\d+,\d%' if k in (2, 5) else INT, v) is not None
        gate(ok, f'banner {name} cell is printed and well-formed ({v!r})')
    def bint(v): return int(v.replace(' ', '')) if v is not None and re.fullmatch(INT, v) else None
    b_cases, b_deaths, isolation, recovered = bint(bc[0]), bint(bc[1]), bint(bc[3]), bint(bc[4])
    cfr_nat = pct(bc[2]) if bc[2] and re.fullmatch(r'\d+,\d%', bc[2]) else None
    contact = pct(bc[5]) if bc[5] and re.fullmatch(r'\d+,\d%', bc[5]) else None

    # Tableau 2 (zone table)
    PROV = {'Ituri': 'Ituri', 'Nord-Kivu': 'Nord-Kivu', 'Haut-Uélé': 'Haut-Uele', 'Tshopo': 'Tshopo',
            'Sud-Kivu': 'Sud-Kivu', 'Bas Uélé': 'Bas-Uele', 'Bas-Uélé': 'Bas-Uele',
            'Sud Ubangi': 'Sud-Ubangi', 'Sud-Ubangi': 'Sud-Ubangi',
            'Nord Ubangi': 'Nord-Ubangi', 'Nord-Ubangi': 'Nord-Ubangi'}   # eighth province from N°155
    t2 = first((i for i, l in enumerate(L) if l.startswith('Tableau 2')), 'Tableau 2 found')
    t3 = first((i for i, l in enumerate(L) if l.startswith('Tableau 3')), 'Tableau 3 found')
    start = first((i for i in range(t2, t3) if re.match(r'Ituri \d', L[i])), 'Tableau 2 first row ("Ituri <digit>") found')
    ROW = re.compile(r'^(.+?)\s+(\d+(?: \d{3})*|NA)\s+(\d+(?: \d{3})*)\s+(\d+,\d+ ?%|NA)?(?:\s+(.*))?$')
    # Known zones = the most recent EARLIER report's zone CSV (data/ or this run's output dir). Not the union of all
    # files: N°117-123 in data/ carry a mis-parsed "Boma" / "Mangbetu Gombari" and must not count as known names.
    prior = {}
    for kf in glob.glob(f'{REPO}/data/zones_sitrep*_????-??-??.csv') + glob.glob(f'{outdir}/zones_sitrep*_????-??-??.csv') \
            + glob.glob(f'{os.path.dirname(pdf)}/zones_sitrep*_????-??-??.csv'):
        k = int(re.search(r'zones_sitrep(\d+)_', kf).group(1))
        if k < sitrep: prior[k] = kf
    KNOWN_FROM = prior[max(need(prior or None, f'an earlier report\'s zones CSV in data/ (known zone names for N°{sitrep})'))]
    KNOWN = {r['zone'] for r in csv.DictReader(open(KNOWN_FROM, encoding='utf8'))}
    log(f'known zone names from {os.path.basename(KNOWN_FROM)} ({len(KNOWN)})')
    ANNOUNCED = set(re.findall(r'[Nn]ouvelle zone de santé touchée\s*:\s*([A-ZÀ-Ý][\w\'-]+(?: [A-ZÀ-Ý][\w\'-]+)*)', re.sub(r'\s+', ' ', text)))
    # N°147: announced in the page-1 narrative instead of the callout ("Avec l'ajout de la zone de santé de Dakwa au Bas Uélé")
    ANNOUNCED |= set(re.findall(r"[Aa]vec l['’]ajout de la zone de santé de ([A-ZÀ-Ý][\w'-]+(?: [A-ZÀ-Ý][\w'-]+)*)", re.sub(r'\s+', ' ', text)))
    # N°155: new province announced with its zone: 'à travers la zone de santé de (ZS de Wapinda)', 'avec la ZS de Wapinda'
    ANNOUNCED |= set(re.findall(r"(?:nouvelle province a été touchée[^.]{0,80}?\(ZS de|province touchée par l['’]épidémie avec la ZS de) ([A-ZÀ-Ý][\w'-]+(?: [A-ZÀ-Ý][\w'-]+)*)", re.sub(r'\s+', ' ', text)))
    subtot, zones, total, pending, leftovers = {}, [], None, '', []
    cur = None
    i = start
    while i < t3:
        l = L[i]; i += 1
        if not l or l.startswith('*') or l.startswith('NA :'): continue
        if re.fullmatch(r'[\d ]+', l):               # page numbers / wrapped 24h cells
            continue
        if not re.search(r'\d', l):                  # name fragment
            if pending:                              # e.g. "Makiso-" "Kisangani" around the numbers line
                pending += ('' if pending.endswith('-') else ' ') + l; continue
            if zones and zones[-1]['zone'].endswith('-'):
                zones[-1]['zone'] += l; continue
            if zones and f"{zones[-1]['zone']} {l}" in KNOWN and zones[-1]['zone'] not in KNOWN:
                zones[-1]['zone'] += ' ' + l; continue   # "Boma" / numbers / "Mangbetu" (N°140)
            pending = l; continue
        line = (pending + ' ' + l) if pending else l
        pending = ''
        line = re.sub(r'^[AÀ] ventiler\s*\*?\s*', 'A ventiler ', line)
        line = re.sub(r'^A ventiler AN ', 'A ventiler NA ', line)   # 'AN' typo for 'NA' (N°140)
        line = re.sub(r'^(A ventiler NA \d+) NA! ', r'\1 NA ', line)   # 'NA!' for the CFR cell (N°148)
        mm = ROW.match(line)
        if not mm: leftovers.append(line); continue
        name, c, d, cf, rest = mm.groups()
        if cf is None and rest and re.match(r'\d+,\d+ ?%', rest or ''): pass
        if name == 'Total':
            total = (num(c), num(d), pct(cf)); break
        if name in PROV and PROV[name] not in subtot:
            cur = PROV[name]
            new24 = int(rest.split()[0]) if rest else None
            subtot[cur] = dict(cases=num(c), deaths=num(d), new=new24); continue
        if re.search(r'[\d%]', name): leftovers.append(line); continue
        zones.append(dict(zone=name.replace('Boma\nMangbetu', 'Boma Mangbetu'), province=cur,
                          cases=None if c == 'NA' else num(c), deaths=num(d),
                          cfr=None if cf in (None, 'NA') else pct(cf)))
    if pending: leftovers.append(pending)
    need(total, 'Total row found in Tableau 2')
    gate(not leftovers, f'no unmatched/leftover text in zone table {leftovers}')
    gate(all(not re.search(r'[\d%]', z['zone']) for z in zones), 'no zone name contains digit or %')
    unknown = sorted(z['zone'] for z in zones if z['zone'] not in KNOWN | ANNOUNCED | {'A ventiler'})
    gate(not unknown, f'every zone name is already known or announced as new in this report (unknown: {unknown}; announced: {sorted(ANNOUNCED)})')
    for z in sorted(ANNOUNCED): log(f'FLAG new affected zone announced: {z}' + ('' if z in KNOWN else ' (not in any earlier zone CSV)'))

    # Tableau 1 (province table)
    t1 = first((i for i, l in enumerate(L) if l.startswith('Tableau 1')), 'Tableau 1 found')
    t1rows = {}
    t1lines = L[t1:t2]
    for k in range(len(t1lines) - 1):      # from N°140 the Total numbers sit on the line above 'Total 63/167 (...)'
        mt = re.fullmatch(r'Total (?:(\d+) )?(\d+/\d+.*)', t1lines[k + 1])
        if re.fullmatch(r'[\d ]+ \d+,\d+%', t1lines[k]) and mt:
            # N°151: the new-cases figure stays on the Total line ('9 144 4 410 48,2%' then 'Total 79 65/167 (...)')
            t1lines[k + 1] = 'Total ' + (mt.group(1) + ' ' if mt.group(1) else '') + t1lines[k] + ' ' + mt.group(2); t1lines[k] = ''
        # N°160-163: the whole Total row, zone cell included, sits on the line above a bare 'Total'
        # ('71 9 765 4 727 48,4% 63/167 (37,7 %)' then 'Total'); N°163 also splits the denominator ('66/17 8(37,1%)')
        if t1lines[k + 1] == 'Total' and re.fullmatch(r'[\d ]+ \d+,\d+% \d+/\d+.*', t1lines[k]):
            t1lines[k + 1] = 'Total ' + re.sub(r'(\d+)/(\d+) (\d+)(?=\s*\()', r'\1/\2\3', t1lines[k]); t1lines[k] = ''
        # N°176-177: the zone cell alone on the line above 'Total <numbers> <cfr>%' ('67/178 (37,6%)' then
        # 'Total 41 10 920 5 323 48,7%'); N°176 also drops the new-cases figure to a bare line below ('Total 10879 5302 48,7%'
        # then '76'). Checked below: a printed new-cases figure must equal the provinces' Tableau 2 new cases.
        mz = re.fullmatch(r'Total ([\d ]+ \d+,\d+ ?%)', t1lines[k + 1])
        if mz and re.fullmatch(r'\d+/\d+ ?\(\d+,\d+ ?%\)', t1lines[k]):
            below = t1lines[k + 2] if k + 2 < len(t1lines) and re.fullmatch(r'\d+', t1lines[k + 2]) else None
            t1lines[k + 1] = 'Total ' + (below + ' ' if below else '') + mz.group(1) + ' ' + t1lines[k]; t1lines[k] = ''
            if below: t1lines[k + 2] = ''
    for l in t1lines:
        # a footnote marker can follow the deaths (N°169 'Ituri 34 7380 3 769 * 51,1% 28/36 (77,8 %)')
        mm = re.match(r'^(Ituri|Nord-Kivu|Haut-Uélé|Tshopo|Sud-Kivu|Bas[ -]Uélé|Sud[ -]Ubangi|Nord[ -]Ubangi|Total)\s+([\d ]+?)\s+(?:\*\s*)?(\d+,\d+)%\s+(\d+)/(\d+)', l)
        if mm and re.search(r'\d\s*\*\s*\d+,\d+%', l): log(f'FLAG Tableau 1 {mm.group(1)} row carries a footnote marker: {l}')
        if mm:
            t1rows[PROV.get(mm.group(1), 'Total')] = dict(digits=mm.group(2).replace(' ', ''), cfr=pct(mm.group(3)),
                                                          zt=int(mm.group(4)), zof=int(mm.group(5)))

    log('\nProvince reconciliation (zone rows vs Tableau 2 subtotal vs Tableau 1):')
    log(f"{'province':12}{'zones':>6}{'T1 zt':>6}{'Σcases':>8}{'sub':>7}{'Σdeaths':>8}{'sub':>7}  T1-digits")
    gate(set(subtot) == set(k for k in t1rows if k != 'Total'),
         f'Tableau 1 and Tableau 2 list the same provinces ({len(subtot)}: {", ".join(subtot)})')
    gate(len(subtot) == provinces, f'provinces in tables {len(subtot)} == page-1 "{provinces} Provinces touchées"')
    for p, s in subtot.items():
        zs = [z for z in zones if z['province'] == p]
        named = [z for z in zs if z['zone'] != 'A ventiler']
        sc = sum(z['cases'] or 0 for z in zs); sd = sum(z['deaths'] for z in zs)
        r = t1rows.get(p, {})
        t1ok = r.get('digits') == f"{s['new']}{s['cases']}{s['deaths']}"
        log(f"{p:12}{len(named):>6}{r.get('zt','?'):>6}{sc:>8}{s['cases']:>7}{sd:>8}{s['deaths']:>7}  {'ok' if t1ok else 'MISMATCH'}")
        gate(sc == s['cases'] and sd == s['deaths'], f'{p}: zone sums == subtotal (cases, deaths)')
        gate(t1ok, f'{p}: Tableau 1 (new,cases,deaths) == Tableau 2 subtotal')
        gate(len(named) == r.get('zt'), f'{p}: zone rows {len(named)} == Tableau 1 zones touchées {r.get("zt")}')
    tc, td, tcf = total
    gate(sum(s['cases'] for s in subtot.values()) == tc and sum(s['deaths'] for s in subtot.values()) == td,
         f'provinces sum == Total row ({tc}/{td})')
    gate((b_cases, b_deaths) == (tc, td), f'banner cases/deaths {b_cases}/{b_deaths} == Total {tc}/{td}')
    need(t1rows.get('Total'), 'Tableau 1 Total row found')
    gate(t1rows['Total']['digits'].endswith(f'{tc}{td}'), 'Tableau 1 Total == Tableau 2 Total')
    news = [s['new'] for s in subtot.values()]
    tdig = t1rows['Total']['digits']
    if None not in news and tdig.endswith(f'{tc}{td}'):   # a cases/deaths mismatch is already the gate above
        gate(tdig[:len(tdig) - len(f'{tc}{td}')] in ('', str(sum(news))),
             f'Tableau 1 Total new cases (if printed) == Σ provinces\' new cases {sum(news)}')
    nz = len([z for z in zones if z['zone'] != 'A ventiler'])
    gate(nz == zones_p1 == sum(r['zt'] for k, r in t1rows.items() if k != 'Total') == t1rows['Total']['zt'],
         f'zone rows {nz} == page-1 zones {zones_p1} == Σ province zones touchées')
    gate(cfr_nat is not None and tc > 0 and abs(round(td / tc * 100, 1) - cfr_nat) <= 0.1, f'computed CFR {round(td/tc*100,1) if tc else None} vs printed {cfr_nat}')
    gate(cfr_nat == tcf, f'banner CFR {cfr_nat} == Tableau 2 Total CFR {tcf}')

    # Tableau 3 suspects
    t3end = first((i for i in range(t3, len(L)) if L[i].startswith('Figure 1')), 'end of Tableau 3 ("Figure 1") found')
    prow, tot_tokens, in_total, nd_provs = [], [], False, []
    T3L = L[t3:t3end]
    def t3_ncols(lines):
        """9 cells, or 10 from N°169: a 'Nombre de suspects non investigués' column after 'investigués'."""
        head = ' '.join(lines[:next((i for i, l in enumerate(lines) if re.match(r'^(Haut-Uélé|Ituri|Bas[ -]Uélé|Nord-Kivu)\s', l)), len(lines))])
        return 10 if re.search(r'\bnon\s+investigu', head) else 9
    def t3_first_row(lines):
        return next((i for i, l in enumerate(lines) if re.match(r'^(Haut-Uélé|Ituri|Bas[ -]Uélé|Nord-Kivu|Sud[ -]Kivu|Sud[ -]Ubangi|Nord[ -]Ubangi|Tshopo)\s', l)), 0)
    NCOL = t3_ncols(T3L)
    if NCOL == 10: log('FLAG Tableau 3 has ten columns ("Nombre de suspects non investigués", from N°169)')
    def t3_total_above(lines):
        """The Total numbers on their own line directly above 'Total Général' (N°159+), or above 'Total' with
        'Général' on the next line (N°169+): rewrite them as one 'Total <numbers>' line."""
        for k in range(len(lines) - 1):
            if re.fullmatch(r'[\d ]+', lines[k]) and (lines[k + 1] == 'Total Général'
                                                    or (lines[k + 1] == 'Total' and k + 2 < len(lines) and lines[k + 2] == 'Général')):
                if lines[k + 1] == 'Total': lines[k + 2] = ''
                lines[k], lines[k + 1] = 'Total ' + lines[k], ''
    t3_total_above(T3L)
    T3L = T3L[t3_first_row(T3L):]   # N°177: a bare 'Total' header line ('Total alertes') sits above the first province row
    for l in T3L:
        if re.match(r'^Total(\s+\d|$)', l): in_total = True
        if in_total and l.startswith('Figure'): break
        if in_total:
            if re.fullmatch(r'\d{1,2}', l): continue   # page number between the Total row and 'Figure 1' (N°157)
            tot_tokens += re.findall(r'\d+', l); continue
        mm = re.match(r'^(Haut-Uélé|Bas-Uélé|Bas Uélé|Ituri|Nord-Kivu|Sud-Kivu|Sud Ubangi|Sud-Ubangi|Nord Ubangi|Nord-Ubangi|Tshopo)\s+(.*)$', l)
        tk = mm.group(2).split() if mm else []
        if mm and len(tk) == NCOL and tk.count('ND') >= NCOL - 2 and set(tk) <= {'ND', 'NA', '0'}:   # province did not report
            nd_provs.append(mm.group(1)); continue   # all ND (N°119-121, 147+), or ND with NA/0 in one cell (N°123, 128-130)
        if mm and len(tk) == NCOL and 'NA' in tk and 'ND' not in tk and all(re.fullmatch(r'\d+|NA', x) for x in tk):
            # N°159 Nord-Ubangi '227 0 227 17 0 NA NA 17 3': classification pending, not ND. The printed cells count;
            # an NA cell contributes nothing to the Total (maintainer decision, 22 Oct 2026). Never filled.
            log(f'FLAG Tableau 3 {mm.group(1)} prints NA cells (not ND): {mm.group(2)}'); prow.append(' '.join('0' if x == 'NA' else x for x in tk)); continue
        if mm: prow.append(mm.group(2))
    def splits(toks, k):
        if k == 0: return [[]] if not toks else []
        out = []
        for n in range(1, len(toks) + 1):
            grp = toks[:n]
            if n > 1 and (len(grp[0]) > 3 or any(len(g) != 3 for g in grp[1:])): break
            for rest in splits(toks[n:], k - 1): out.append([int(''.join(grp))] + rest)
        return out
    def okcore(s): return s[0] + s[1] == s[2] and s[3] + s[4] + s[5] + s[6] <= s[2]
    def okrow(s): return okcore(s) and s[7] <= s[3] + s[4]
    def splitn(toks, ncol=None, inv=True):
        """Every reading of a row as its table's cells, returned as the nine classic cells. A ten-column row (N°169+)
        must have investigated + not investigated = validated (alive + dead); the 'non investigués' cell is then
        dropped, so everything downstream reads nine cells. inv=False skips that investigated-columns check (the
        investigated-columns rule below); the cell is still dropped."""
        ncol = ncol or NCOL
        out = []
        for c in splits(toks, ncol):
            if ncol == 10:
                if inv and c[7] + c[8] != c[3] + c[4]: continue
                c = c[:8] + c[9:]
            out.append(c)
        return out
    provcols, anomalies = [], []
    for r in prow:
        c = [s for s in splitn(r.split()) if okrow(s)]
        if not c:   # short or internally inconsistent row. Never fill or correct it.
            anomalies.append(r); continue
        provcols.append(c)
    cands = [s for s in splitn(tot_tokens) if okrow(s)]
    flat = re.sub(r'\s+', ' ', text)
    mn = re.search(r'(\d{1,3}(?: \d{3})*)\s*(?:\([\d,]+ ?%\)\s+)?(?:\d{1,2}\s+(?=validées))?(?:alertes\s+)?(?:ont été\s+)?validées\s+comme', flat)   # N°150: page number between the figure and 'validées'
    narr = num(mn.group(1)) if mn else None
    matches = set()
    if not anomalies:
        for combo in itertools.product(*provcols):
            cs = [sum(c[j] for c in combo) for j in range(9)]
            if cs in cands: matches.add(tuple(cs))
    colsum = list(list(matches)[0]) if len(matches) == 1 else None
    inv_rule_accept = inv_used = False
    if colsum is None and prow:
        # Investigated-columns rule (standing rule from N°176, maintainer decision 11 Nov 2026). suspects_today is the
        # validated count (validated alive + validated deceased in the Total row), used when it equals the narrative's
        # validated figure. Columns counting investigated or uninvestigated suspects feed no CSV field: when the strict
        # reading fails, re-read the rows without the two checks on those columns (investigated <= validated; ten
        # columns: investigated + not investigated = validated). Every other row check and the match against the Total
        # row stay; the province rows must then give exactly one validated (alive, dead) pair. Mismatches are recorded,
        # never a stop. Not a general accept flag: nothing else is relaxed.
        rcols, ranom = [], []
        for r in prow:
            c = [s for s in splitn(r.split(), inv=False) if okcore(s)]
            (rcols.append(c) if c else ranom.append(r))
        rcands = [s for s in splitn(tot_tokens, inv=False) if okcore(s)]
        rmatch = set()
        if ranom and accept_t3_row_anomaly:
            # Per-run maintainer decision (never a default; N°176, 11 Nov 2026): a row that is also inconsistent outside
            # the investigated columns (N°176 Bas-Uélé: validated + invalidated 119 > received 114). Each such row must
            # read exactly one way; with it, the column sums must equal a reading of the Total row, give exactly one
            # validated pair, and that pair must equal the narrative (checked below).
            fixed = [splitn(r.split(), inv=False) for r in ranom]
            if all(len(x) == 1 for x in fixed):
                rcols = rcols + fixed; ranom_acc, ranom = ranom, []
                log(f'ANOMALY (accepted by --accept-t3-row-anomaly): rows {ranom_acc} read one way each and are kept as printed')
                inv_rule_accept = True
        if not ranom:
            for combo in itertools.product(*rcols):
                cs = [sum(c[j] for c in combo) for j in range(9)]
                if cs in rcands: rmatch.add(tuple(cs))
        vpairs = {(m[3], m[4]) for m in rmatch}
        if len(vpairs) == 1:
            inv_used = True
            colsum = list(next(iter(rmatch))) if len(rmatch) == 1 else [None, None, None, *next(iter(vpairs)), None, None, None, None]
            bad = [r for r in prow if not [s for s in splitn(r.split()) if okrow(s)]]
            log(f'FLAG Tableau 3 investigated columns do not reconcile (investigated-columns rule, no CSV field): rows {bad}; '
                f'Total row {" ".join(tot_tokens)}; validated suspects {colsum[3]} + {colsum[4]} = {colsum[3] + colsum[4]} '
                f'({len(rmatch)} Total-row reading(s) agree)')
            if colsum[0] is not None and colsum[3] + colsum[4] + colsum[5] + colsum[6] < colsum[2]:
                log(f'FLAG Tableau 3: {colsum[2] - (colsum[3] + colsum[4] + colsum[5] + colsum[6])} of {colsum[2]} alerts are '
                    'neither validated nor invalidated (not yet verified)')
            gate(True, f'Tableau 3 validated suspects {colsum[3]}/{colsum[4]} unique under the investigated-columns rule '
                       f'({len(prow)} rows; investigated / not-investigated cells not reconciled)')
            if inv_rule_accept:
                gate(narr == colsum[3] + colsum[4], f'accepted row anomaly: validated suspects {colsum[3] + colsum[4]} == narrative {narr}')
        elif inv_rule_accept:
            gate(False, f'accepted row anomaly: validated suspects unique {sorted(vpairs)}')
    if not inv_used:
        gate(colsum is not None, f'Tableau 3 Total {colsum}: unique {NCOL}-column split = Σ province rows ({len(prow)} rows, {len(anomalies)} short/inconsistent: {anomalies})')
    if anomalies and accept_t3_row_anomaly and not inv_rule_accept:
        # Per-run maintainer decision (never a default). Validated suspects must still be determined uniquely:
        # Total-row readings (investigated <= validated) whose validated columns equal the sums over the province
        # rows that read as nine cells; exactly one resulting value, which must then also equal the narrative.
        # consistent rows: their checked 9-cell splits; the one anomalous row: its own printed validated cells
        pvs = {(sum(c[3] for c in combo), sum(c[4] for c in combo)) for combo in itertools.product(*provcols)}
        def anomaly_validated(r):
            t = [int(x) for x in r.split()]
            if len(t) == NCOL: return [t[3:5]]               # all cells printed, inconsistent elsewhere (N°140 Tshopo)
            if len(t) == NCOL - 1: return [t[2:4], t[3:5]]   # one blank: before col 4 -> cells 3-4, after col 5 -> cells 4-5
            return []
        av = anomaly_validated(anomalies[0]) if len(anomalies) == 1 else []
        pv = sorted(pvs)
        rel = [t for t in splitn(tot_tokens) if t[7] <= t[3] + t[4]
               and any([t[3] - a, t[4] - b] in av for a, b in pvs)]
        vals = sorted({t[3] + t[4] for t in rel})
        log(f'ANOMALY (accepted by --accept-t3-row-anomaly): rows {anomalies}; province validated sums {pv}; '
              f'{len(rel)} Total-row reading(s) agree, validated suspects {vals}')
        fails.remove(next(f for f in fails if f.startswith('Tableau 3 Total')))
        gate(len(vals) == 1, f'accepted anomaly: validated suspects unique {vals}')
        colsum = rel[0] if len(vals) == 1 else None
    if colsum is None and not anomalies and accept_t3_row_anomaly and not inv_rule_accept:
        # Total-row anomaly (N°147: invalidated-alive 1452 vs Σ province rows 1450). Per-run maintainer decision.
        # Passes ONLY if the CSV-feeding value (validated suspects = vivants + décédés) is confirmed independently by
        # (a) every reading of the Total row, (b) the province rows' sum and (c) the narrative. Cells that feed no CSV
        # field may disagree; any disagreement on the validated cells still stops the run.
        pvs = {(sum(c[3] for c in combo), sum(c[4] for c in combo)) for combo in itertools.product(*provcols)}
        trs = [t for t in splitn(tot_tokens) if t[0] + t[1] == t[2] and t[7] <= t[3] + t[4]]
        tvs = {(t[3], t[4]) for t in trs}
        log(f'ANOMALY (Total row; --accept-t3-row-anomaly): province validated {sorted(pvs)}; Total-row validated {sorted(tvs)}; narrative {narr}')
        ok = len(pvs) == 1 and tvs == pvs and narr == sum(next(iter(pvs)))
        gate(ok, 'accepted Total-row anomaly: validated suspects confirmed by Total row, province sum and narrative independently')
        if ok:
            fails.remove(next(f for f in fails if f.startswith('Tableau 3 Total')))
            sums = [[sum(c[j] for c in combo) for j in range(9)] for combo in itertools.product(*provcols)]   # informational only
            best, psum = min(((t, ps) for t in trs for ps in sums), key=lambda x: sum(x[0][j] != x[1][j] for j in range(9)))
            diff = [j + 1 for j in range(9) if best[j] != psum[j]]
            log(f'  closest Total-row reading {best} vs Σ province rows {psum}: differs in column(s) {diff} (no CSV field)')
            a, b = next(iter(pvs)); colsum = [None, None, None, a, b, None, None, None, None]
    elif anomalies and accept_t3_row_anomaly and colsum is not None and not inv_rule_accept:
        gate(narr == colsum[3] + colsum[4], f'accepted row anomaly: validated suspects {colsum[3] + colsum[4]} == narrative {narr}')
    suspects = colsum[3] + colsum[4] if colsum else None
    if nd_provs: log(f'FLAG Tableau 3 provinces not reporting (all cells ND, excluded from the Total): {nd_provs}')
    # Single-cell rule (maintainer decision, N°138): a table-vs-narrative disagreement on a field that feeds
    # exactly one CSV cell (suspects_today, contact_tracing_pct) blanks that cell instead of holding the report,
    # provided both sides were parsed and it is the only such disagreement. All other gates stay hard.
    soft = []
    if suspects is not None and narr is not None and narr != suspects:
        soft.append(('suspects_today', f'Tableau 3 gives {suspects}, narrative gives {narr}'))
    else:
        gate(narr == suspects, f'suspects Tableau 3 {suspects} == narrative {narr}')
    mc = re.search(r'(?:proportion|taux) de suivi (?:de|au décours du [^,]*? était de) (\d+,\d)\s*%', flat)   # 'taux de suivi' from N°151
    narr_ct = pct(mc.group(1)) if mc else None
    # The key-messages box restates it ('Le taux de suivi des contacts recule à 88,1 % (31 923/36 218)', N°162; 'progresse,
    # passant de 79,7 % la veille à 84,8 %', N°160). Its two columns interleave, so take the first 'à nn,n %' within 160
    # characters after 'suivi des contacts'. Every printing must agree with the banner.
    km_ct = [pct(m.group(1)) for m in re.finditer(r'suivi des contacts\b.{0,160}?\bà (\d+,\d) ?%', flat)]
    others = sorted({v for v in km_ct if v != contact})
    if narr_ct is not None and (narr_ct != contact or others):
        soft.append(('contact_tracing_pct', f'banner gives {contact}, narrative gives {narr_ct}' + (f', key messages give {others}' if others else '')))
    else:
        gate(narr_ct == contact, f'contact tracing banner {contact} == narrative {narr_ct}' + (f' == key messages {sorted(set(km_ct))}' if km_ct else ''))
    gate(len(soft) <= 1, f'at most one single-cell table/narrative disagreement ({len(soft)}: {soft})')
    for field, why in soft:
        log(f'FLAG {field} left EMPTY: {why} (single-cell rule)')
        if field == 'suspects_today': suspects = None
        if field == 'contact_tracing_pct': contact = None
    # ND share rule (standing rule from 26 Oct 2026; applied without a flag). For each province Tableau 3 records as ND,
    # take its validated suspects (vivants + décédés) in the last earlier report where it has a printed row, as a share of
    # that report's national validated suspects (its Tableau 3 province rows summed, checked against its Total row); add
    # the shares. Under 5 %: keep suspects_today. 5 % or more: leave it empty. The dashboard's sus marker goes on every
    # report with an ND province either way.
    T3NAMES = r'Haut-Uélé|Bas-Uélé|Bas Uélé|Ituri|Nord-Kivu|Sud-Kivu|Sud Ubangi|Sud-Ubangi|Nord Ubangi|Nord-Ubangi|Tshopo'
    def t3_validated(path):
        """{province: validated suspects or None if ND}, national validated, from one report's Tableau 3."""
        tx = '\n'.join(pg.extract_text() or '' for pg in pdfplumber.open(path).pages).replace('\u202f', ' ').replace('\xa0', ' ')
        LL = [l.strip() for l in tx.split('\n')]
        a = next(i for i, l in enumerate(LL) if l.startswith('Tableau 3'))
        b = next(i for i in range(a, len(LL)) if LL[i].startswith('Figure 1'))
        TL = LL[a:b]
        nc = t3_ncols(TL)
        t3_total_above(TL)
        TL = TL[t3_first_row(TL):]
        out, tot = {}, []
        for k, l in enumerate(TL):
            if re.match(r'^Total(\s+\d|$)', l):
                tot = re.findall(r'\d+', ' '.join(x for x in TL[k:] if not re.fullmatch(r'\d{1,2}', x))); break
            mm = re.match(rf'^({T3NAMES})\s+(.*)$', l)
            if not mm: continue
            pv, tk = PROV[mm.group(1)], mm.group(2).split()
            if len(tk) == nc and tk.count('ND') >= nc - 2 and set(tk) <= {'ND', 'NA', '0'}: out[pv] = None; continue
            if len(tk) == nc and all(re.fullmatch(r'\d+|NA', x) for x in tk):          # every cell printed (N°159 Nord-Ubangi has NA)
                out[pv] = int(tk[3]) + int(tk[4]); continue
            vals = {c[3] + c[4] for c in splitn(tk, nc) if okrow(c)} if all(x.isdigit() for x in tk) else set()
            if not vals and all(x.isdigit() for x in tk):   # investigated-columns rule
                vals = {c[3] + c[4] for c in splitn(tk, nc, inv=False) if okcore(c)}
            if len(vals) != 1: raise ValueError(f'{os.path.basename(path)}: Tableau 3 row {pv} {tk} not readable')
            out[pv] = vals.pop()
        nat = sum(v for v in out.values() if v is not None)
        if not any(t[3] + t[4] == nat for t in splitn(tot, nc) if t[7] <= t[3] + t[4]) and \
                not any(t[3] + t[4] == nat for t in splitn(tot, nc, inv=False) if okcore(t)):   # investigated-columns rule
            raise ValueError(f'{os.path.basename(path)}: Tableau 3 province rows ({nat}) do not match the Total row')
        return out, nat
    def prior_pdf(name):
        """The earlier report's PDF by its source_pdf name: next to this PDF, in ./prior/, or fetched from insp.cd."""
        d = pdf_cache or os.path.join(os.path.dirname(os.path.abspath(pdf)), 'prior'); os.makedirs(d, exist_ok=True)
        for q in (os.path.join(os.path.dirname(os.path.abspath(pdf)), name), os.path.join(d, name)):
            if os.path.exists(q): return q
        import json as _j, urllib.request as _u
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from sitrep_build import http_get as get   # User-Agent (403 to urllib's default agent) and retries
        hits = _j.loads(get('https://insp.cd/wp-json/wp/v2/media?per_page=20&_fields=source_url&search=' + os.path.splitext(name)[0], 60))
        url = next(h['source_url'] for h in hits if os.path.basename(h['source_url']) == name)
        body = get(url, 120); assert body[:4] == b'%PDF', url
        q = os.path.join(d, name); open(q, 'wb').write(body); return q
    nd_share = []
    if nd_provs:
        earlier = {}
        for f in glob.glob(f'{REPO}/data/summary_sitrep*_????-??-??.csv') + glob.glob(f'{outdir}/summary_sitrep*_????-??-??.csv') \
                + glob.glob(f'{os.path.dirname(pdf)}/summary_sitrep*_????-??-??.csv'):
            k = int(re.search(r'summary_sitrep(\d+)_', f).group(1))
            if k < sitrep: earlier[k] = next(csv.DictReader(open(f, encoding='utf8')))['source_pdf']
        todo, share, cache = {PROV[x] for x in nd_provs}, 0.0, {}
        for k in sorted(earlier, reverse=True)[:30]:
            if not todo: break
            try:
                if k not in cache: cache[k] = t3_validated(prior_pdf(earlier[k]))
            except (ValueError, StopIteration, OSError) as e:
                gate(False, f'ND share rule: cannot read Tableau 3 of N°{k} ({e})'); todo = set(); break
            rows, nat = cache[k]
            for pv in sorted(todo):
                if rows.get(pv) is not None:
                    nd_share.append((pv, k, rows[pv], nat)); share += rows[pv] / nat; todo.discard(pv)
        gate(not todo, f'ND share rule: last report with a Tableau 3 row found for every ND province (missing {sorted(todo)})')
        for pv, k, v, nat in nd_share: log(f'  ND share: {pv} {v} of N°{k}\'s {nat} = {v / nat * 100:.2f} %')
        log(f'FLAG ND share rule: combined {share * 100:.2f} % -> ' + ('suspects_today KEPT' if share < 0.05 else 'suspects_today left EMPTY'))
        if share >= 0.05: suspects = None

    # enrich
    pop = {}
    with open(f'{REPO}/data/zones_sitrep051.csv') as f:
        for r in csv.DictReader(f): pop[r['zone']] = int(r['population_2024'])
    ALIAS = {'Gethy': 'Gety'}
    rows = []
    for z in zones:
        P = None if z['zone'] == 'A ventiler' else pop.get(ALIAS.get(z['zone'], z['zone']))
        rows.append([sitrep, rd, pd, status, z['zone'], z['province'],
                     '' if z['cases'] is None else z['cases'], z['deaths'], P or '',
                     '' if z['cfr'] is None else f"{z['cfr']:.1f}" if round(z['cfr'], 1) == z['cfr'] else z['cfr'],
                     '' if not P else round(z['cases'] / P * 100000, 1)])
    rows.sort(key=lambda r: (r[4] == 'A ventiler', -(r[6] if r[6] != '' else 0), r[4]))
    nopop = sum(1 for r in rows if r[4] != 'A ventiler' and r[8] == '')
    bad = [c for r in rows for c in r[6:] if c != '' and not re.fullmatch(r'-?\d+(\.\d+)?', str(c))]
    gate(not bad, f'all numeric cells parse cleanly {bad}')

    summ = [sitrep, rd, pd, provinces, zones_p1, td, '' if cfr_nat is None else f'{cfr_nat:.1f}', '' if isolation is None else isolation, recovered, '' if suspects is None else suspects,
            '' if contact is None else f'{contact:.1f}', fname]
    log('\nsummary:', summ)
    log(f'zone rows: {nz} + A ventiler = {len(rows)}; zones without population: {nopop}')
    log(f'national cases {tc}; isolation {isolation}; recovered {recovered}')

    def dump(header, rs):
        b = io.StringIO(); w = csv.writer(b, lineterminator='\n'); w.writerow(header); w.writerows(rs); return b.getvalue()
    S_H = 'sitrep_number,report_date,publication_date,provinces,zones,confirmed_deaths,fatality_rate_pct,patients_in_isolation,recovered_patients,suspects_today,contact_tracing_pct,source_pdf'.split(',')
    Z_H = 'sitrep_number,report_date,publication_date,status,zone,province,confirmed_cases,confirmed_deaths,population_2024,zone_cfr_pct,cases_per_100k'.split(',')
    outs = {f'summary_sitrep{sitrep}_{pd}.csv': dump(S_H, [summ]), f'zones_sitrep{sitrep}_{pd}.csv': dump(Z_H, rows)}
    if fails:
        log(f'\n*** {len(fails)} GATE(S) FAILED — nothing written')
        return dict(fails=fails, outs=outs, written=[], sitrep=sitrep, summary=summ)
    written = []
    for n, c in outs.items():
        p = os.path.join(outdir, n)
        if os.path.exists(p):
            same = open(p, encoding='utf8').read() == c
            log(('identical, no-op: ' if same else 'DIFFERS from existing (re-published?): ') + p)
            if same: continue
        if write:
            open(p, 'w', encoding='utf8', newline='').write(c); written.append(p); log('wrote', p)
        else:
            log('dry run, not written:', n)
    return dict(fails=fails, outs=outs, written=written, sitrep=sitrep, summary=summ)


def main(argv):
    args, opts, i = [], {}, 0
    while i < len(argv):
        a = argv[i]
        if a in ('--title-number', '--today', '--pdf-cache'): opts[a] = argv[i + 1]; i += 2; continue
        if a.startswith('--'): opts[a] = True; i += 1; continue
        args.append(a); i += 1
    unknown = set(opts) - {'--write', '--title-number', '--today', '--pdf-cache', '--accept-t3-row-anomaly'}
    if len(args) != 2 or unknown:
        sys.exit(__doc__ + (f'\nunknown option(s): {sorted(unknown)}' if unknown else ''))
    r = ingest(args[0], args[1], write='--write' in opts, title_no=opts.get('--title-number'),
               today=dt.date.fromisoformat(opts['--today']) if '--today' in opts else None,
               pdf_cache=opts.get('--pdf-cache'), accept_t3_row_anomaly='--accept-t3-row-anomaly' in opts)
    return 1 if r['fails'] else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
