"""INSP SitRep ingest: one PDF in, two CSVs out (summary + zones), per .agents/skills/sitrep-ingest/SKILL.md.

    uv run --with pdfplumber --python 3.12 python -I tools/sitrep_ingest.py <pdf> <out_dir> [options]

Prints every gate (PASS / FAIL / FLAG) and the province reconciliation. Writes the CSVs to <out_dir> only with
--write and only when every hard gate passes. A failed gate writes nothing and exits 1: an unattended run stops and
reports; it never patches the parser or the figures.

Options
  --write                       write the CSVs (default: dry run)
  --title-number N              the post title's sitrep number, for gate 6 (default: compare with the filename)
  --today YYYY-MM-DD            "today" for gate 5 (default: the real date; set it only to re-parse past reports)
  --pdf-cache DIR               where earlier reports' PDFs are kept for the ND share rule (default: <pdf dir>/prior)
  --accept-t3-row-anomaly       per-run maintainer decision for one approved report (skill, step 6). Off by default;
                                never pass it in a scripted, scheduled or looped run.
"""
import csv, datetime as dt, glob, io, itertools, os, re, sys
import pdfplumber

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def ingest(pdf, outdir, write=False, title_no=None, today=None, pdf_cache=None, accept_t3_row_anomaly=False, log=print):
    """Parse one SitRep PDF. Returns {fails, outs (file name -> CSV text), written, sitrep, summary}."""
    TODAY = today or dt.date.today()
    fails = []
    def gate(ok, msg):
        log(('PASS ' if ok else 'FAIL ') + msg)
        if not ok: fails.append(msg)

    text = '\n'.join(pg.extract_text() or '' for pg in pdfplumber.open(pdf).pages)
    text = text.replace('\xa0', ' ').replace('\u202f', ' ')   # no-break and narrow no-break spaces in figures
    L = [l.strip() for l in text.split('\n')]

    MONTHS = dict(janvier=1, février=2, mars=3, avril=4, mai=5, juin=6, juillet=7, août=8,
                  septembre=9, octobre=10, novembre=11, décembre=12)
    def fdate(s):
        s = re.sub(r'^(\d+)(?=(?!er\s)[^\d\s])', r'\1 ', s)   # '20octobre 2026' (N°158); never splits '1er octobre'
        d, m, y = s.split(); return dt.date(int(y), MONTHS[m.lower()], int(d.removesuffix('er')))   # '1er octobre' (N°139)
    def num(s): return int(s.replace(' ', ''))
    def pct(s): return float(s.replace('%', '').replace(',', '.').strip())

    # identity
    fname = os.path.basename(pdf)
    stem = os.path.splitext(fname)[0]
    if re.search(r'(?<![a-z])d[ar]a?ft', stem, re.I): status = 'provisional'
    elif re.search(r'(?<![a-z])(final|vf|fv|ok+)(?![a-z])', stem, re.I): status = 'final'
    elif re.search(r'sitrep', stem, re.I): status = 'final'
    else: status = 'unknown'
    hm = re.search(r'SitRep N°0*(\d+)\s*/\S*?/(\d\d)/(\d\d)/(\d{4})', text)   # 'N°143 /MVE' has a space
    hdr = hm.group(1)
    fn_no = re.search(r'_(\d+)_\d\d_\d\d_\d{4}', fname).group(1)
    sitrep = int(hdr)
    if title_no is not None:   # gate 6 compares the post title with the PDF header (N°162's filename says 163)
        gate(int(title_no) == sitrep, f'sitrep number header {hdr} == post title {title_no}')
        if int(fn_no) != sitrep: log(f'FLAG filename carries N°{fn_no}, title and header say N°{sitrep}')
    else:
        gate(int(fn_no) == sitrep, f'sitrep number header {hdr} == filename {fn_no} (pass --title-number to compare with the post title)')
    rd = fdate(re.search(r'Date (?:de rapportage|du rapport)\s*:\s*(\d+(?:er)? ?\S+ \d{4})', text).group(1))
    pd = fdate(re.search(r'Date de publication\s*:\s*(\d+(?:er)? ?\S+ \d{4})', text).group(1))
    hd = dt.date(int(hm.group(4)), int(hm.group(3)), int(hm.group(2)))
    if hd != rd: log(f'FLAG header line date {hd} != Date du rapport {rd} (report_date taken from Date du rapport)')
    gate(rd < pd and (TODAY - rd).days <= 14 and (TODAY - pd).days <= 14,
         f'report_date {rd} < publication_date {pd}, both within 14 days of {TODAY}')

    provinces = int(re.search(r'^(\d+) Provinces touchées', text, re.M).group(1))
    zones_p1 = int(re.search(r'^(\d+) Zones de santé', text, re.M).group(1))

    # banner: six KPI cells read from the large bold glyphs under the label line. Text extraction of the banner
    # interleaves glyphs, and in N°141 a callout box is overprinted on it, so read by font size and x position.
    BANNER = ['cases', 'deaths', 'CFR', 'isolation', 'recovered', 'contact tracing']
    BANNER_ANCHOR = ['CAS', 'DÉCÈS', 'LETALITE', 'ISOLEMENT/CTE', 'GUÉRIS', 'CONTACTS']   # label words, one per column
    def banner_cells(path):
        """Six KPI cells, or None for a cell with no glyphs (N°164: isolation blank). Inside a cell a gap > 2 pt is kept
        as a space, so a misplaced space shows ('9 36', N°166) instead of being glued into a number."""
        pg = pdfplumber.open(path).pages[0]
        ws = pg.extract_words()
        top = min(w['top'] for w in ws if w['text'] == 'SUIVI')
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
    bc = banner_cells(pdf)
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
    t2 = next(i for i, l in enumerate(L) if l.startswith('Tableau 2'))
    t3 = next(i for i, l in enumerate(L) if l.startswith('Tableau 3'))
    start = next(i for i in range(t2, t3) if re.match(r'Ituri \d', L[i]))
    ROW = re.compile(r'^(.+?)\s+(\d+(?: \d{3})*|NA)\s+(\d+(?: \d{3})*)\s+(\d+,\d+ ?%|NA)?(?:\s+(.*))?$')
    # Known zones = the most recent EARLIER report's zone CSV (data/ or this run's output dir). Not the union of all
    # files: N°117-123 in data/ carry a mis-parsed "Boma" / "Mangbetu Gombari" and must not count as known names.
    prior = {}
    for kf in glob.glob(f'{REPO}/data/zones_sitrep*_????-??-??.csv') + glob.glob(f'{outdir}/zones_sitrep*_????-??-??.csv') \
            + glob.glob(f'{os.path.dirname(pdf)}/zones_sitrep*_????-??-??.csv'):
        k = int(re.search(r'zones_sitrep(\d+)_', kf).group(1))
        if k < sitrep: prior[k] = kf
    KNOWN_FROM = prior[max(prior)]
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
    gate(total is not None, 'Total row found in Tableau 2')
    gate(not leftovers, f'no unmatched/leftover text in zone table {leftovers}')
    gate(all(not re.search(r'[\d%]', z['zone']) for z in zones), 'no zone name contains digit or %')
    unknown = sorted(z['zone'] for z in zones if z['zone'] not in KNOWN | ANNOUNCED | {'A ventiler'})
    gate(not unknown, f'every zone name is already known or announced as new in this report (unknown: {unknown}; announced: {sorted(ANNOUNCED)})')
    for z in sorted(ANNOUNCED): log(f'FLAG new affected zone announced: {z}' + ('' if z in KNOWN else ' (not in any earlier zone CSV)'))

    # Tableau 1 (province table)
    t1 = next(i for i, l in enumerate(L) if l.startswith('Tableau 1'))
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
    for l in t1lines:
        mm = re.match(r'^(Ituri|Nord-Kivu|Haut-Uélé|Tshopo|Sud-Kivu|Bas[ -]Uélé|Sud[ -]Ubangi|Nord[ -]Ubangi|Total)\s+([\d ]+?)\s+(\d+,\d+)%\s+(\d+)/(\d+)', l)
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
    gate(t1rows['Total']['digits'].endswith(f'{tc}{td}'), 'Tableau 1 Total == Tableau 2 Total')
    nz = len([z for z in zones if z['zone'] != 'A ventiler'])
    gate(nz == zones_p1 == sum(r['zt'] for k, r in t1rows.items() if k != 'Total') == t1rows['Total']['zt'],
         f'zone rows {nz} == page-1 zones {zones_p1} == Σ province zones touchées')
    gate(abs(round(td / tc * 100, 1) - cfr_nat) <= 0.1, f'computed CFR {round(td/tc*100,1)} vs printed {cfr_nat}')
    gate(cfr_nat == tcf, f'banner CFR {cfr_nat} == Tableau 2 Total CFR {tcf}')

    # Tableau 3 suspects
    t3end = next(i for i in range(t3, len(L)) if L[i].startswith('Figure 1'))
    prow, tot_tokens, in_total, nd_provs = [], [], False, []
    T3L = L[t3:t3end]
    for k in range(len(T3L) - 1):   # N°159+: the Total numbers sit on their own line directly above 'Total Général'
        if re.fullmatch(r'[\d ]+', T3L[k]) and T3L[k + 1] == 'Total Général':
            T3L[k], T3L[k + 1] = 'Total ' + T3L[k], ''
    for l in T3L:
        if re.match(r'^Total(\s+\d|$)', l): in_total = True
        if in_total and l.startswith('Figure'): break
        if in_total:
            if re.fullmatch(r'\d{1,2}', l): continue   # page number between the Total row and 'Figure 1' (N°157)
            tot_tokens += re.findall(r'\d+', l); continue
        mm = re.match(r'^(Haut-Uélé|Bas-Uélé|Bas Uélé|Ituri|Nord-Kivu|Sud-Kivu|Sud Ubangi|Sud-Ubangi|Nord Ubangi|Nord-Ubangi|Tshopo)\s+(.*)$', l)
        tk = mm.group(2).split() if mm else []
        if mm and len(tk) == 9 and tk.count('ND') >= 7 and set(tk) <= {'ND', 'NA', '0'}:   # province did not report
            nd_provs.append(mm.group(1)); continue   # all ND (N°119-121, 147+), or ND with NA/0 in one cell (N°123, 128-130)
        if mm and len(tk) == 9 and 'NA' in tk and 'ND' not in tk and all(re.fullmatch(r'\d+|NA', x) for x in tk):
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
    def okrow(s): return s[0] + s[1] == s[2] and s[7] <= s[3] + s[4] and s[3] + s[4] + s[5] + s[6] <= s[2]
    provcols, anomalies = [], []
    for r in prow:
        c = [s for s in splits(r.split(), 9) if okrow(s)]
        if not c:   # short or internally inconsistent row. Never fill or correct it.
            anomalies.append(r); continue
        provcols.append(c)
    cands = [s for s in splits(tot_tokens, 9) if okrow(s)]
    flat = re.sub(r'\s+', ' ', text)
    mn = re.search(r'(\d{1,3}(?: \d{3})*)\s*(?:\([\d,]+ ?%\)\s+)?(?:\d{1,2}\s+(?=validées))?(?:alertes\s+)?(?:ont été\s+)?validées\s+comme', flat)   # N°150: page number between the figure and 'validées'
    narr = num(mn.group(1)) if mn else None
    matches = set()
    if not anomalies:
        for combo in itertools.product(*provcols):
            cs = [sum(c[j] for c in combo) for j in range(9)]
            if cs in cands: matches.add(tuple(cs))
    colsum = list(list(matches)[0]) if len(matches) == 1 else None
    gate(colsum is not None, f'Tableau 3 Total {colsum}: unique 9-column split = Σ province rows ({len(prow)} rows, {len(anomalies)} short/inconsistent: {anomalies})')
    if anomalies and accept_t3_row_anomaly:
        # Per-run maintainer decision (never a default). Validated suspects must still be determined uniquely:
        # Total-row readings (investigated <= validated) whose validated columns equal the sums over the province
        # rows that read as nine cells; exactly one resulting value, which must then also equal the narrative.
        # consistent rows: their checked 9-cell splits; the one anomalous row: its own printed validated cells
        pvs = {(sum(c[3] for c in combo), sum(c[4] for c in combo)) for combo in itertools.product(*provcols)}
        def anomaly_validated(r):
            t = [int(x) for x in r.split()]
            if len(t) == 9: return [t[3:5]]                  # all cells printed, inconsistent elsewhere (N°140 Tshopo)
            if len(t) == 8: return [t[2:4], t[3:5]]          # one blank: before col 4 -> cells 3-4, after col 5 -> cells 4-5
            return []
        av = anomaly_validated(anomalies[0]) if len(anomalies) == 1 else []
        pv = sorted(pvs)
        rel = [t for t in splits(tot_tokens, 9) if t[7] <= t[3] + t[4]
               and any([t[3] - a, t[4] - b] in av for a, b in pvs)]
        vals = sorted({t[3] + t[4] for t in rel})
        log(f'ANOMALY (accepted by --accept-t3-row-anomaly): rows {anomalies}; province validated sums {pv}; '
              f'{len(rel)} Total-row reading(s) agree, validated suspects {vals}')
        fails.remove(next(f for f in fails if f.startswith('Tableau 3 Total')))
        gate(len(vals) == 1, f'accepted anomaly: validated suspects unique {vals}')
        colsum = rel[0] if len(vals) == 1 else None
    if colsum is None and not anomalies and accept_t3_row_anomaly:
        # Total-row anomaly (N°147: invalidated-alive 1452 vs Σ province rows 1450). Per-run maintainer decision.
        # Passes ONLY if the CSV-feeding value (validated suspects = vivants + décédés) is confirmed independently by
        # (a) every reading of the Total row, (b) the province rows' sum and (c) the narrative. Cells that feed no CSV
        # field may disagree; any disagreement on the validated cells still stops the run.
        pvs = {(sum(c[3] for c in combo), sum(c[4] for c in combo)) for combo in itertools.product(*provcols)}
        trs = [t for t in splits(tot_tokens, 9) if t[0] + t[1] == t[2] and t[7] <= t[3] + t[4]]
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
    elif anomalies and accept_t3_row_anomaly and colsum is not None:
        gate(narr == colsum[3] + colsum[4], f'accepted row anomaly: validated suspects {colsum[3] + colsum[4]} == narrative {narr}')
    suspects = colsum[3] + colsum[4] if colsum else None
    if nd_provs: log(f'FLAG Tableau 3 provinces not reporting (all nine cells ND, excluded from the Total): {nd_provs}')
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
        for k in range(len(TL) - 1):
            if re.fullmatch(r'[\d ]+', TL[k]) and TL[k + 1] == 'Total Général': TL[k], TL[k + 1] = 'Total ' + TL[k], ''
        out, tot = {}, []
        for k, l in enumerate(TL):
            if re.match(r'^Total(\s+\d|$)', l):
                tot = re.findall(r'\d+', ' '.join(x for x in TL[k:] if not re.fullmatch(r'\d{1,2}', x))); break
            mm = re.match(rf'^({T3NAMES})\s+(.*)$', l)
            if not mm: continue
            pv, tk = PROV[mm.group(1)], mm.group(2).split()
            if len(tk) == 9 and tk.count('ND') >= 7 and set(tk) <= {'ND', 'NA', '0'}: out[pv] = None; continue
            if len(tk) == 9 and all(re.fullmatch(r'\d+|NA', x) for x in tk):          # nine cells (N°159 Nord-Ubangi has NA)
                out[pv] = int(tk[3]) + int(tk[4]); continue
            vals = {c[3] + c[4] for c in splits(tk, 9) if okrow(c)} if all(x.isdigit() for x in tk) else set()
            if len(vals) != 1: raise ValueError(f'{os.path.basename(path)}: Tableau 3 row {pv} {tk} not readable')
            out[pv] = vals.pop()
        nat = sum(v for v in out.values() if v is not None)
        if not any(t[3] + t[4] == nat for t in splits(tot, 9) if t[7] <= t[3] + t[4]):
            raise ValueError(f'{os.path.basename(path)}: Tableau 3 province rows ({nat}) do not match the Total row')
        return out, nat
    def prior_pdf(name):
        """The earlier report's PDF by its source_pdf name: next to this PDF, in ./prior/, or fetched from insp.cd."""
        d = pdf_cache or os.path.join(os.path.dirname(os.path.abspath(pdf)), 'prior'); os.makedirs(d, exist_ok=True)
        for q in (os.path.join(os.path.dirname(os.path.abspath(pdf)), name), os.path.join(d, name)):
            if os.path.exists(q): return q
        import json as _j, urllib.request as _u
        get = lambda u, t: _u.urlopen(_u.Request(u, headers={'User-Agent': 'curl/8.5.0'}), timeout=t).read()   # 403 to urllib's default agent
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
            except (ValueError, StopIteration) as e:
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

    summ = [sitrep, rd, pd, provinces, zones_p1, td, f'{cfr_nat:.1f}', '' if isolation is None else isolation, recovered, '' if suspects is None else suspects,
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
