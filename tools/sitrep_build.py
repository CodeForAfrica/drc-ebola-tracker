"""Dashboard data artefacts for INSP SitReps, built from the sitrep-ingest CSVs in data/ (+ the PDF's Tableau 1).

    uv run --with pdfplumber --python 3.12 python -I tools/sitrep_build.py check N [N ...]
    uv run --with pdfplumber --python 3.12 python -I tools/sitrep_build.py append N [N ...] --nd nd.json [--write]

check   rebuilds each report's artefacts and compares them with what is committed: its D.nat2 / D.national rows,
        its D.trends readings, its national_timeseries.csv row, its provinces_sitrepN.csv where it exists and, from
        N°146 (GEOMETRY_FROM), its zones_timeseries_full.csv rows and zones_sitrepN.csv mirror; for the live (last) report also D.zones, PROV and
        zones_sitrepN.geojson.
append  adds reports after the live one as consecutive daily rows (no break row) and makes the last one live:
        D.nat2 (with the nd flags from --nd), D.national, D.trends, D.zones, PROV, NAT, CFG.zoneRelease, and the data/
        mirrors (zones/provinces CSV and GeoJSON of the last report, time series, trend JSON,
        not_reported_provinces.csv). Without --write it prints the discrepancy list (dashboard vs the new report's
        banner and Tableau 1) and changes nothing. A new zone must be mapped first (tools/v1_zone.py).
        It does not touch prose: release labels in index.html, the T strings (stamps, meta_updated, mm_sources,
        mm_cov2, mm_cov_nd, ...) and the ?v= cache bust are edited by hand; the command lists them.

--nd is a JSON object {"164": {"ct": [...], "ctn": 5, "sus": [...]}, ...}; reports without ND are omitted.
PDFs are looked up by the summary CSV's source_pdf name in --pdf-dir (default: $SITREP_PDF_DIR or a temp dir) and
fetched from insp.cd when missing.
"""
import copy, csv, glob, io, json, os, re, sys, tempfile, urllib.request
import pdfplumber

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG = os.path.join(REPO, 'config.drc-bvd-2026.js')
ALIAS = {'Gethy': 'Gety'}           # PDF spelling -> repo key
PROV_ORDER = ['Ituri', 'Nord-Kivu', 'Haut-Uele', 'Tshopo', 'Sud-Kivu', 'Bas-Uele', 'Sud-Ubangi', 'Nord-Ubangi']
T1NAME = {'Ituri': 'Ituri', 'Nord-Kivu': 'Nord-Kivu', 'Haut-Uélé': 'Haut-Uele', 'Tshopo': 'Tshopo',
          'Sud-Kivu': 'Sud-Kivu', 'Bas-Uélé': 'Bas-Uele', 'Bas Uélé': 'Bas-Uele',
          'Sud Ubangi': 'Sud-Ubangi', 'Sud-Ubangi': 'Sud-Ubangi', 'Nord Ubangi': 'Nord-Ubangi', 'Nord-Ubangi': 'Nord-Ubangi'}
MONTHS_EN = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split()
# Reports written before the 8 Oct 2026 geometry update (N°146 is the first) have no population or per-100k for the
# zones then unmapped, in zones_timeseries_full.csv and in their zones_sitrepN.csv mirrors. That history is kept as
# written, so check() compares those two artefacts only from this report on.
GEOMETRY_FROM = 146


def jnum(v):                       # match the JS literal style of the config (50, not 50.0)
    return int(v) if float(v).is_integer() else v
def f1(v): return f'{v:.1f}'


def load_config():
    src = open(CONFIG, encoding='utf8').read()
    lines = src.split('\n')
    assert lines[17].startswith('const D=') and lines[17].endswith(';'), 'config line 18 is not the D object'
    return src, lines, json.loads(lines[17][len('const D='):-1])


def read_ingest(n):
    zf = glob.glob(f'{REPO}/data/zones_sitrep{n}_*.csv'); sf = glob.glob(f'{REPO}/data/summary_sitrep{n}_*.csv')
    assert len(zf) == 1 and len(sf) == 1, (n, zf, sf)
    rows = list(csv.DictReader(open(zf[0], encoding='utf8')))
    summ = next(csv.DictReader(open(sf[0], encoding='utf8')))
    return rows, summ


def fetch_pdf(name, pdf_dir):
    """The PDF by its exact name: from pdf_dir, else from the insp.cd media library (search by file name)."""
    os.makedirs(pdf_dir, exist_ok=True)
    p = os.path.join(pdf_dir, name)
    if os.path.exists(p): return p
    get = lambda u, t: urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'curl/8.5.0'}), timeout=t).read()
    hits = json.loads(get('https://insp.cd/wp-json/wp/v2/media?per_page=20&_fields=source_url&search='
                          + urllib.request.quote(os.path.splitext(name)[0]), 60))
    url = next(h['source_url'] for h in hits if os.path.basename(h['source_url']) == name)
    body = get(url, 180); assert body[:4] == b'%PDF', url
    open(p, 'wb').write(body)
    return p


def tableau1(pdfpath):
    text = '\n'.join(pg.extract_text() or '' for pg in pdfplumber.open(pdfpath).pages)
    out = {}
    blk = text[text.index('Tableau 1'):text.index('Tableau 2')]
    for l in blk.split('\n'):    # 'n/m' with or without a space before '(' ('1/11(9,1%)')
        m = re.match(r'^(Ituri|Nord-Kivu|Haut-Uélé|Tshopo|Sud-Kivu|Bas[ -]Uélé|Sud[ -]Ubangi|Nord[ -]Ubangi)\s+[\d ]+?\s+(\d+,\d+)%\s+(\d+)/(\d+)', l.strip())
        if m: out[T1NAME[m.group(1)]] = dict(cfr=float(m.group(2).replace(',', '.')), zt=int(m.group(3)), zn=int(m.group(4)))
    return out


def build(n, D, pdf_dir, use_tableau1_zones=True):
    """All per-report artefacts for N°n, using D for pop/lat/lon and the mapped set. Zones in D that this report does
    not list (mapped later) are left out of its zones output. use_tableau1_zones=False takes each province's zone
    count from Tableau 2's rows instead (for a report whose Tableau 1 zone column is misprinted; never for the live
    report's PROV)."""
    rows, summ = read_ingest(n)
    Z = {z['z']: z for z in D['zones']}
    status = rows[0]['status']
    key = lambda r: ALIAS.get(r['zone'], r['zone'])
    named = [r for r in rows if r['zone'] != 'A ventiler']
    byk = {key(r): r for r in named}
    cases = sum(int(r['confirmed_cases']) for r in named)
    deaths = sum(int(r['confirmed_deaths']) for r in rows)
    assert deaths == int(summ['confirmed_deaths'])
    zones = []
    for z in D['zones']:
        r = byk.get(z['z'])
        if r is None: continue
        c, d = int(r['confirmed_cases']), int(r['confirmed_deaths'])
        nz = dict(z); nz.update(c=c, d=d, cfr=jnum(float(r['zone_cfr_pct'])), k=jnum(round(c / z['pop'] * 100000, 1)))
        zones.append(nz)
    zones.sort(key=lambda z: -z['c'])                           # stable: ties keep prior order
    mir = []                                                    # zones_sitrepNNN.csv: all reported zones, repo keys, CRLF
    for r in rows:
        k = key(r); z = Z.get(k)
        c = r['confirmed_cases']
        mir.append([k, r['province'], c, r['confirmed_deaths'],
                    z['lat'] if z else '', z['lon'] if z else '', z['pop'] if z else '',
                    r['zone_cfr_pct'], f1(round(int(c) / z['pop'] * 100000, 1)) if z else ''])
    mir.sort(key=lambda m: (m[0] == 'A ventiler', -(int(m[2]) if m[2] else 0), m[0]))
    b = io.StringIO(); w = csv.writer(b, lineterminator='\r\n')
    w.writerow('zone,province,confirmed_cases,confirmed_deaths,lat,lon,population_2024,zone_cfr_pct,cases_per_100k'.split(','))
    w.writerows(mir); mirror_csv = b.getvalue()
    tsr = [[n, summ['report_date'], summ['publication_date'], status, m[0], m[1], m[2], m[3], m[6], m[7], m[8]] for m in mir]
    b = io.StringIO(); csv.writer(b, lineterminator='\r\n').writerows(tsr); ts_rows = b.getvalue()
    t1 = tableau1(fetch_pdf(summ['source_pdf'], pdf_dir))
    prov = []
    for p in [q for q in PROV_ORDER if q in t1]:
        pr = [r for r in rows if r['province'] == p]
        u = sum(int(r['confirmed_deaths']) for r in pr if r['zone'] == 'A ventiler')
        zt = len([r for r in pr if r['zone'] != 'A ventiler'])
        if use_tableau1_zones:
            assert zt == t1[p]['zt'], f"N°{n} {p}: Tableau 2 lists {zt} zones, Tableau 1 prints {t1[p]['zt']}"
        prov.append(dict(p=p, c=sum(int(r['confirmed_cases'] or 0) for r in pr), d=sum(int(r['confirmed_deaths']) for r in pr),
                         cfr=t1[p]['cfr'], zt=t1[p]['zt'] if use_tableau1_zones else zt, zn=t1[p]['zn'], u=u))
    assert set(t1) <= set(PROV_ORDER)
    b = io.StringIO(); w = csv.writer(b, lineterminator='\n')
    w.writerow('province,confirmed_cases,confirmed_deaths,cfr_pct,zones_affected,zones_total,unassigned_deaths'.split(','))
    for q in prov: w.writerow([q['p'], q['c'], q['d'], f1(q['cfr']), q['zt'], q['zn'], q['u']])
    prov_csv = b.getvalue()
    s = str(n)
    nat2 = dict(s=s, d=summ['report_date'], c=cases, dd=deaths, cfr=jnum(float(summ['fatality_rate_pct'])),
                iso=int(summ['patients_in_isolation']) if summ['patients_in_isolation'] else None,
                rec=int(summ['recovered_patients']),
                sus=int(summ['suspects_today']) if summ['suspects_today'] else None,
                ct=jnum(float(summ['contact_tracing_pct'])) if summ['contact_tracing_pct'] else None,
                st=status, pdf=summ['source_pdf'])
    national = [s, summ['report_date'], cases, deaths, status]
    nts = ','.join(map(str, [n, summ['report_date'], summ['publication_date'], summ['provinces'], summ['zones'], cases, deaths,
                             summ['fatality_rate_pct'], summ['patients_in_isolation'], summ['recovered_patients'],
                             summ['suspects_today'], summ['contact_tracing_pct'], summ['source_pdf'], status])) + '\n'
    md = summ['report_date'][5:]
    reading = {k: (md, int(byk[k]['confirmed_cases']), int(byk[k]['confirmed_deaths'])) for k in D['trends']}
    unm = [r for r in named if key(r) not in Z]
    stats = dict(cases=cases, deaths=deaths, zone_deaths=sum(int(r['confirmed_deaths']) for r in named),
                 unm=sorted(key(r) for r in unm), avent=deaths - sum(int(r['confirmed_deaths']) for r in named),
                 date=summ['report_date'], cfr=summ['fatality_rate_pct'], zones_reported=len(named))
    return dict(zones=zones, mirror_csv=mirror_csv, ts_rows=ts_rows, prov=prov, prov_csv=prov_csv,
                nat2=nat2, national=national, nts=nts, reading=reading, stats=stats)


def geojson(zones, D, base_path):
    """zones_sitrepN.geojson: the previous file's features (same order), new mapped zones appended from D.geo, counts
    from this report. Properties: zone, province, confirmed_cases, confirmed_deaths."""
    g = json.load(open(base_path, encoding='utf8'))
    have = {f['properties']['zone'] for f in g['features']}
    zc = {z['z']: z for z in zones}
    tmpl = g['features'][0]
    for f in D['geo']['features']:
        z = f['properties']['z']
        if z in zc and z not in have:
            nf = copy.deepcopy(tmpl); nf['properties'] = {'zone': z, 'province': f['properties']['p'], 'confirmed_cases': 0,
                                                          'confirmed_deaths': 0}
            nf['geometry'] = f['geometry']; g['features'].append(nf)
    assert {f['properties']['zone'] for f in g['features']} == set(zc), 'GeoJSON zones != mapped zones'
    for f in g['features']:
        z = zc[f['properties']['zone']]; f['properties']['confirmed_cases'] = z['c']; f['properties']['confirmed_deaths'] = z['d']
    return json.dumps(g)


def prov_js(prov):
    """PROV rows in the config's literal style, one per line."""
    return ',\n'.join(f" {{p:'{q['p']}',c:{q['c']},d:{q['d']},cfr:{f1(q['cfr'])},zt:{q['zt']},zn:{q['zn']},u:{q['u']}}}" for q in prov)


def rep(txt, old, new, count, where):
    n = txt.count(old)
    assert n == count, (where, old[:90], n)
    return txt.replace(old, new)


def nrp_rows(n, date, nd):
    """data/not_reported_provinces.csv rows for one report's nd flags."""
    out = ''
    if nd.get('sus'): out += f"{n},{date},suspects_today,{';'.join(nd['sus'])}\n"
    if nd.get('ct'): out += f"{n},{date},contact_tracing_pct,{';'.join(nd['ct'])}\n"
    return out


def latest_mirror(kind, below=None):
    """The newest committed data/<kind>_sitrepNNN.<ext> (no date suffix), optionally below report N."""
    fs = []
    for f in glob.glob(f'{REPO}/data/{kind}'):
        m = re.search(r'sitrep(\d+)\.\w+$', f)
        if m and (below is None or int(m.group(1)) < below): fs.append((int(m.group(1)), f))
    return max(fs)[1]


def check(ns, pdf_dir):
    """Rebuild each report and compare with the committed artefacts. Returns the list of differences."""
    _, lines, D = load_config()
    src = '\n'.join(lines)
    nts_lines = {l.split(',', 1)[0].lstrip('0'): l + '\n' for l in open(f'{REPO}/data/national_timeseries.csv', encoding='utf8').read().splitlines()[1:]}
    tsf = open(f'{REPO}/data/zones_timeseries_full.csv', encoding='utf8', newline='').read()
    tj = json.load(open(f'{REPO}/data/zone_trends_sitrep.json', encoding='utf8'))
    nat2 = {r['s']: r for r in D['nat2']}; natl = {r[0]: r for r in D['national']}
    live = D['nat2'][-1]['s']
    bad = []
    def cmp(label, a, b):
        print(('ok    ' if a == b else 'DIFF  ') + label)
        if a != b: bad.append(label)
    for n in ns:
        s = str(n)
        prov_file = f'{REPO}/data/provinces_sitrep{n}.csv'
        rows, _ = read_ingest(n)
        a = build(n, D, pdf_dir, use_tableau1_zones=os.path.exists(prov_file) or s == live)
        r = {k: v for k, v in nat2.get(s, {}).items() if k != 'nd'}
        cmp(f'N°{n} D.nat2 row', a['nat2'], r)
        cmp(f'N°{n} D.national row', a['national'], natl.get(s))
        cmp(f'N°{n} national_timeseries.csv row', a['nts'], nts_lines.get(s))
        if n >= GEOMETRY_FROM: cmp(f'N°{n} zones_timeseries_full.csv rows', a['ts_rows'] in tsf, True)
        md = a['stats']['date'][5:]
        cmp(f'N°{n} D.trends + zone_trends_sitrep.json readings',
            all([md, None, None, c, d] in D['trends'][k] and [md, c, d] in tj[k] for k, (md, c, d) in a['reading'].items()), True)
        mir = f'{REPO}/data/zones_sitrep{n}.csv'
        if os.path.exists(mir) and n >= GEOMETRY_FROM: cmp(f'N°{n} zones_sitrep{n}.csv', a['mirror_csv'], open(mir, encoding='utf8', newline='').read())
        if os.path.exists(prov_file): cmp(f'N°{n} provinces_sitrep{n}.csv', a['prov_csv'], open(prov_file, encoding='utf8').read())
        if s == live:
            cmp(f'N°{n} D.zones', a['zones'], D['zones'])
            cmp(f'N°{n} PROV', prov_js(a['prov']), re.search(r'const PROV=\[\n(.*?)\n\];', src, re.S).group(1))
            gj = f'{REPO}/data/zones_sitrep{n}.geojson'
            cmp(f'N°{n} zones_sitrep{n}.geojson', geojson(a['zones'], D, latest_mirror('zones_sitrep*.geojson', below=n)),
                open(gj, encoding='utf8').read())
    return bad


def append(ns, nd, pdf_dir, write=False):
    """Add N°ns (consecutive daily rows) and make the last one live. Prints the discrepancy list first."""
    _, lines, D = load_config()
    live = D['nat2'][-1]
    assert int(ns[0]) > int(live['s']), f"N°{ns[0]} is not after the live N°{live['s']}"
    src = '\n'.join(lines)
    old_prov = re.search(r'const PROV=\[\n(.*?)\n\];', src, re.S).group(1)
    last = ns[-1]
    outs = {n: build(n, D, pdf_dir, use_tableau1_zones=(n == last)) for n in ns}
    a = outs[last]; st = a['stats']
    mapped = [z for z in a['zones']]
    assert len(mapped) + len(st['unm']) == st['zones_reported'], 'every reported zone is either mapped or listed unmapped'
    new = a['nat2']
    print(f"DISCREPANCIES, dashboard (N°{live['s']}) vs N°{last} banner / Tableau 1:")
    for k, lab in [('c', 'cases'), ('dd', 'deaths'), ('cfr', 'CFR %'), ('iso', 'isolation'), ('rec', 'recovered'), ('sus', 'suspects'), ('ct', 'contact tracing %')]:
        print(f'  national {lab:18} dashboard {live.get(k)!s:>7}   N°{last} {new.get(k)!s:>7}' + ('' if live.get(k) == new.get(k) else '   -> update'))
    print(f"  national nd         dashboard {live.get('nd')}   N°{last} {nd.get(str(last))}")
    op = {m.group(1): m.group(0) for m in re.finditer(r"\{p:'([^']+)'[^}]*\}", old_prov)}
    for q in a['prov']:
        nw = re.search(r'\{p:[^}]*\}', prov_js([q])).group(0)
        print(f"  PROV {q['p']:12} {op.get(q['p'], '(new)')}  ->  {nw}" + ('' if op.get(q['p']) == nw else '   -> update'))
    print(f"  zones: {st['zones_reported']} reported, {len(mapped)} mapped, unmapped {st['unm']}; A ventiler {st['avent']}")
    for n in ns:
        r = outs[n]['nat2']; print(f"  row N°{n}: c {r['c']} dd {r['dd']} cfr {r['cfr']} iso {r['iso']} rec {r['rec']} sus {r['sus']} ct {r['ct']} nd {nd.get(str(n))}")
    if not write:
        print('\nDry run: nothing changed. Re-run with --write to apply.'); return
    for n in ns:
        row = outs[n]['nat2']
        if nd.get(str(n)): row['nd'] = nd[str(n)]
        D['nat2'].append(row); D['national'].append(outs[n]['national'])
        for k, (md, c, d) in outs[n]['reading'].items(): D['trends'][k].append([md, None, None, c, d])
    D['zones'] = a['zones']
    lines[17] = 'const D=' + json.dumps(D, separators=(',', ':'), ensure_ascii=False) + ';'
    cfg = '\n'.join(lines)
    cfg = rep(cfg, old_prov, prov_js(a['prov']), 1, 'PROV')
    y, m, d = st['date'].split('-')
    cfg = re.sub(r"zoneRelease:\{sitrep:'N°\d+',date:'[\d-]+'\}", f"zoneRelease:{{sitrep:'N°{last}',date:'{st['date']}'}}", cfg, count=1)
    cfg = re.sub(r"const NAT=\{cases:\d+,deaths:\d+,cfr:[\d.]+,", f"const NAT={{cases:{st['cases']},deaths:{st['deaths']},cfr:{st['cfr']},", cfg, count=1)
    cfg = re.sub(r"(const NAT=\{[^}]*date:)'[^']*'", rf"\1'{int(d)} {MONTHS_EN[int(m) - 1]} {y}'", cfg, count=1)
    open(CONFIG, 'w', encoding='utf8', newline='').write(cfg)
    dd = f'{REPO}/data'
    tj = json.load(open(f'{dd}/zone_trends_sitrep.json', encoding='utf8'))
    for n in ns:
        for k, v in outs[n]['reading'].items(): tj[k].append(list(v))
    open(f'{dd}/zone_trends_sitrep.json', 'w', encoding='utf8', newline='').write(json.dumps(tj, separators=(',', ':')))
    with open(f'{dd}/national_timeseries.csv', 'a', encoding='utf8', newline='') as f:
        for n in ns: f.write(outs[n]['nts'])
    with open(f'{dd}/zones_timeseries_full.csv', 'a', encoding='utf8', newline='') as f:
        for n in ns: f.write(outs[n]['ts_rows'])
    open(f'{dd}/zones_sitrep{last}.csv', 'w', encoding='utf8', newline='').write(a['mirror_csv'])
    open(f'{dd}/zones_sitrep{last}.geojson', 'w', encoding='utf8', newline='').write(geojson(a['zones'], D, latest_mirror('zones_sitrep*.geojson', below=last)))
    open(f'{dd}/provinces_sitrep{last}.csv', 'w', encoding='utf8', newline='').write(a['prov_csv'])
    with open(f'{dd}/not_reported_provinces.csv', 'a', encoding='utf8', newline='') as f:
        for n in ns: f.write(nrp_rows(n, outs[n]['nat2']['d'], nd.get(str(n), {})))
    print(f"\nWritten. Edit by hand next (the old values are the live N°{live['s']}'s): index.html release labels "
          '(header meta, stamps, built-on release, zones download link, ?v= cache bust); T strings in both languages: '
          'covnote_latest, meta_updated, mm_sources, mm_cov2 (A ventiler arithmetic), mm_cov_nd, mm_dl1, the '
          '"verified against" and "province table" comments; and the index.html fallback copies of those strings.')


def main(argv):
    pdf_dir = os.environ.get('SITREP_PDF_DIR') or os.path.join(tempfile.gettempdir(), 'sitrep_pdfs')
    if '--pdf-dir' in argv:
        i = argv.index('--pdf-dir'); pdf_dir = argv[i + 1]; del argv[i:i + 2]
    if len(argv) >= 2 and argv[0] == 'check':
        bad = check([int(x) for x in argv[1:]], pdf_dir)
        print(f'\n{len(bad)} difference(s)' + (': ' + '; '.join(bad) if bad else ''))
        return 1 if bad else 0
    if len(argv) >= 2 and argv[0] == 'append' and '--nd' in argv:
        i = argv.index('--nd'); nd = json.load(open(argv[i + 1], encoding='utf8')); rest = argv[1:i] + argv[i + 2:]
        write = '--write' in rest
        append([int(x) for x in rest if x != '--write'], nd, pdf_dir, write=write)
        return 0
    sys.exit(__doc__)


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
