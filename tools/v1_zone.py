"""Map a newly reported health zone from the INRB-UMIE archived v1 shapefile, the vintage every mapped zone uses.

    uv run --with pyshp --with shapely --python 3.12 python -I tools/v1_zone.py <ZSCode> [--as NAME] [--write] [--shp-dir DIR]

--as gives the repo key when v1 spells the zone differently from the SitRep (v1 'Gethy' is the repo's 'Gety';
match spellings against data/ before adding). The province is v1's, with accents and spaces normalised
('Haut-Uélé' -> 'Haut-Uele').

Takes the v1 polygon rounded to 5 dp, v1 `Population` and the centroid from v1's DMS `coordx`/`coordy`, exactly as
Wapinda (N°155) and Yakoma (N°167) were mapped. Before anything is written it checks that the same file reproduces
an already-mapped zone exactly (Wapinda: polygon, population, centroid), that the new centroid lies inside its
polygon, and reports any overlap with the mapped zones and the nearest one. With --write it adds the zone to D.zones
(counts 0 until tools/sitrep_build.py append fills them), D.geo and D.cent in the config. Never use the v8.0
(GRID3) shapefile for a single zone: the map stays on one vintage.
"""
import json, math, os, re, sys, tempfile, unicodedata, urllib.request
import shapefile
from shapely.geometry import Point, shape

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG = os.path.join(REPO, 'config.drc-bvd-2026.js')
URL = 'https://raw.githubusercontent.com/INRB-UMIE/BDBV2026-Data/main/data/shapefiles/archived/DRC_Health_zones.'
REFERENCE = 'Wapinda'


def r5(c): return [r5(x) for x in c] if isinstance(c[0], (list, tuple)) else [round(c[0], 5), round(c[1], 5)]


def dms(s):
    d, m, sec, h = re.match(r"(\d+)° (\d+)' ([\d,]+)\" ([NSEW])", s).groups()
    v = int(d) + int(m) / 60 + float(sec.replace(',', '.')) / 3600
    return round(-v if h in 'SW' else v, 5)


def main(argv):
    shp_dir = os.path.join(tempfile.gettempdir(), 'v1_shapefile')
    if '--shp-dir' in argv:
        i = argv.index('--shp-dir'); shp_dir = argv[i + 1]; del argv[i:i + 2]
    alias = None
    if '--as' in argv:
        i = argv.index('--as'); alias = argv[i + 1]; del argv[i:i + 2]
    write = '--write' in argv; argv = [a for a in argv if a != '--write']
    if len(argv) != 1: sys.exit(__doc__)
    code = argv[0]
    os.makedirs(shp_dir, exist_ok=True)
    for ext in ('shp', 'shx', 'dbf', 'prj'):
        p = os.path.join(shp_dir, 'DRC_Health_zones.' + ext)
        if not os.path.exists(p): open(p, 'wb').write(urllib.request.urlopen(URL + ext, timeout=300).read())
    r = shapefile.Reader(os.path.join(shp_dir, 'DRC_Health_zones.shp'))
    F = [f[0] for f in r.fields[1:]]
    recs = [(dict(zip(F, sr.record)), sr.shape.__geo_interface__) for sr in r.shapeRecords()]
    lines = open(CONFIG, encoding='utf8').read().split('\n')
    D = json.loads(lines[17][len('const D='):-1])
    G = {f['properties']['z']: f for f in D['geo']['features']}; Z = {z['z']: z for z in D['zones']}

    ra, rg = next((a, g) for a, g in recs if a['Nom'] == REFERENCE)
    ok = (r5(rg['coordinates']) == G[REFERENCE]['geometry']['coordinates'] and ra['Population'] == Z[REFERENCE]['pop']
          and [dms(ra['coordy']), dms(ra['coordx'])] == D['cent'][REFERENCE])
    print(f'reference {REFERENCE} reproduced from this file (polygon, population, centroid): {ok}')
    if not ok: sys.exit('STOP: this is not the shapefile the map was built from')

    hit = [(a, g) for a, g in recs if a['ZSCode'] == code]
    if len(hit) != 1: sys.exit(f'STOP: {len(hit)} records with ZSCode {code}')
    a, g = hit[0]
    name = alias or a['Nom']
    prov = unicodedata.normalize('NFKD', a['PROVINCE']).encode('ascii', 'ignore').decode().replace(' ', '-')
    geom = {'type': g['type'], 'coordinates': r5(g['coordinates'])}
    P = shape(geom); lat, lon = dms(a['coordy']), dms(a['coordx']); c = P.centroid
    print(f"{name} ({prov}, {code}): population {a['Population']}, centroid {lat}, {lon}; inside polygon: {P.contains(Point(lon, lat))}; "
          f"polygon centroid {round(c.y, 5)}, {round(c.x, 5)} "
          f"({math.hypot((c.x - lon) * 111.32 * math.cos(math.radians(lat)), (c.y - lat) * 110.57) * 1000:.0f} m away); valid: {P.is_valid}")
    over, near = [], []
    for f in D['geo']['features']:
        if f['properties']['z'] == name: continue
        Q = shape(f['geometry']); i = P.intersection(Q).area
        if i > 0: over.append((f['properties']['z'], round(i / P.area * 100, 3)))
        near.append((round(P.distance(Q) * 111, 1), f['properties']['z']))
    print(f'overlaps with mapped zones (% of {name}): {over or "none"}; nearest: {sorted(near)[:3]} (km, approx.)')
    if name in Z: sys.exit(f'STOP: {name} is already mapped')
    if not write:
        print('Dry run: config unchanged. Re-run with --write to add it.'); return 0
    tmpl = json.loads(json.dumps(G[REFERENCE])); tmpl['properties'] = {'z': name, 'p': prov}; tmpl['geometry'] = geom
    D['geo']['features'].append(tmpl); D['cent'][name] = [lat, lon]
    D['zones'].append({'z': name, 'p': prov, 'c': 0, 'd': 0, 'lat': lat, 'lon': lon, 'pop': a['Population'], 'cfr': 0, 'k': 0})
    lines[17] = 'const D=' + json.dumps(D, separators=(',', ':'), ensure_ascii=False) + ';'
    open(CONFIG, 'w', encoding='utf8', newline='').write('\n'.join(lines))
    print(f'added {name} to D.zones, D.geo and D.cent')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
