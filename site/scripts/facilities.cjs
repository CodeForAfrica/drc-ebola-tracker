/* Reduce ../data/health_facilities.csv (HOT OpenStreetMap, ODbL) to the compact JSON the
   facility finder reads. No value is invented or moved: each row is a named, located OSM
   facility; the raw OSM type is bucketed into a category for filtering, and the admin-1 name
   is kept for context. Coordinates are already reduced to 5 dp in the mirror.
   Usage: node scripts/facilities.cjs ../data/health_facilities.csv src/data/facilities.json */
const fs = require('fs');
const [, , csvPath, out] = process.argv;

const splitCsv = (l) => { const o = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { o.push(cur); cur = ''; } else cur += ch; } o.push(cur); return o; };

/* OSM healthcare/amenity value → finder category. Kept deliberately small. */
function cat(t) {
  t = (t || '').toLowerCase();
  if (t === 'hospital') return 'hospital';
  if (t === 'pharmacy') return 'pharmacy';
  if (t === 'clinic' || t === 'health_post' || t === 'health_centre' || t === 'centre' || t === 'primary' || t === 'yes') return 'clinic';
  return 'other';   // doctors, laboratory, dentist, nurse, …
}

const lines = fs.readFileSync(csvPath, 'utf8').trim().split('\n');
const H = lines[0].split(','); const ix = (k) => H.indexOf(k);
const f = [];
for (const ln of lines.slice(1)) {
  const c = splitCsv(ln);
  const la = +c[ix('lat')], lo = +c[ix('lon')];
  if (!isFinite(la) || !isFinite(lo)) continue;
  f.push({ c: c[ix('iso3')], n: c[ix('name')], k: cat(c[ix('type')]), la, lo, p: c[ix('adm1')] || '' });
}
const data = {
  source: 'HOT OpenStreetMap "Health Facilities of {country}" (HDX), © OpenStreetMap contributors, ODbL',
  note: 'Community-maintained; coverage and currency vary. Not an official facility registry.',
  f,
};
fs.writeFileSync(out, JSON.stringify(data));
const by = {}; f.forEach((x) => (by[x.c] = (by[x.c] || 0) + 1));
console.log('wrote', out, f.length, 'facilities', JSON.stringify(by), (fs.statSync(out).size / 1e6).toFixed(2) + 'MB');
