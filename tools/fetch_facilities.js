#!/usr/bin/env node
/* Regenerate data/health_facilities.csv from the HOT OpenStreetMap "Health Facilities of {country}"
   exports on HDX (ODbL, © OpenStreetMap contributors), for the four affected countries.
   This is an OFFLINE data mirror, like tools/extract_flowminder_od.js: run it by hand to refresh;
   the committed CSV is the source of truth and site/scripts/facilities.cjs reduces it for the site.

   Usage:  node tools/fetch_facilities.js
   Needs:  network access to data.humdata.org / the HOT raw-data-api S3 bucket, and the `unzip` CLI.

   Source: HOT "Health Facilities of {DR Congo, Uganda, Kenya, Nigeria}", HDX, licence ODC-ODbL.
   Attribution "© OpenStreetMap contributors" is kept on the map and in Data & methods. OSM is
   community-maintained: coverage and currency vary, so the finder labels it as such. No value is
   invented; a facility with no name or no geometry is dropped. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const URL = (iso) => `https://production-raw-data-api.s3.amazonaws.com/ISO3/${iso.toUpperCase()}/health_facilities/hotosm_${iso}_health_facilities_osm_geojson.zip`;
const ISOS = [['cod', 'COD'], ['uga', 'UGA'], ['ken', 'KEN'], ['nga', 'NGA']];
const OUT = path.join(__dirname, '..', 'data', 'health_facilities.csv');

function centroid(g) {
  if (!g) return null;
  if (g.type === 'Point') return g.coordinates;
  if (g.type === 'Polygon') { const r = g.coordinates[0]; let x = 0, y = 0; for (const p of r) { x += p[0]; y += p[1]; } return [x / r.length, y / r.length]; }
  if (g.type === 'MultiPolygon') return centroid({ type: 'Polygon', coordinates: g.coordinates[0] });
  return null;
}
const q = (s) => { s = (s == null ? '' : String(s)).replace(/\s+/g, ' ').trim(); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-'));
const rows = ['iso3,name,type,lat,lon,adm1,adm2'];
for (const [iso, ISO] of ISOS) {
  const zip = path.join(tmp, `${iso}.zip`);
  execSync(`curl -sS --max-time 120 -A "drc-ebola-tracker-build/1.0" -o ${zip} "${URL(iso)}"`, { stdio: 'inherit' });
  execSync(`unzip -o -q ${zip} -d ${path.join(tmp, iso)}`);
  const j = JSON.parse(fs.readFileSync(path.join(tmp, iso, 'health_facilities.geojson'), 'utf8'));
  let n = 0;
  for (const f of j.features) {
    const p = f.properties || {}, c = centroid(f.geometry); if (!c) continue;
    const name = p.name || p.name_en || p.name_fr || p.name_latin; if (!name) continue;
    rows.push([ISO, q(name), q(p.healthcare || p.amenity || ''), (+c[1]).toFixed(5), (+c[0]).toFixed(5), q(p.adm1_name || ''), q(p.adm2_name || '')].join(','));
    n++;
  }
  console.log(`${ISO}: ${n} named + located facilities`);
}
fs.writeFileSync(OUT, rows.join('\n') + '\n');
console.log('wrote', OUT, rows.length - 1, 'rows');
