/* First SitRep listing each health zone with at least one confirmed case.
   Sources: data/zones_timeseries_full.csv (national zone series, N°055 onward, copied to
   scripts/sources/) and D.trends (zone series from 14 May, 34 zones).
   For a zone first listed after a gap in the series, `after` is the last report date
   without it, so the first case falls between `after` and `d`. Nothing is estimated. */
const fs = require('fs');
const [,, csvPath, trackerPath, out] = process.argv;
const lines = fs.readFileSync(csvPath, 'utf8').trim().split('\n');
const H = lines[0].split(','); const ix = (k) => H.indexOf(k);
const rows = lines.slice(1).map((l) => l.split(','));
const reports = [...new Set(rows.map((r) => r[ix('report_date')] + '|' + r[ix('sitrep')]))].sort();
const prevDate = {}; reports.forEach((k, i) => { const [, s] = k.split('|'); prevDate[s] = i ? reports[i - 1].split('|')[0] : null; });
const T = JSON.parse(fs.readFileSync(trackerPath, 'utf8'));
const trendFirst = {};
for (const [z, s] of Object.entries(T.trends)) { const r = s.find((x) => x[0] && x[3] > 0); if (r) trendFirst[z] = '2026-' + r[0]; }
const first = {};
for (const r of rows) {
  const z = r[ix('zone')], c = +r[ix('confirmed_cases')] || 0;
  if (c > 0 && !first[z]) first[z] = { d: r[ix('report_date')], s: r[ix('sitrep')] };
}
const res = {};
for (const [z, f] of Object.entries(first)) {
  if (trendFirst[z] && trendFirst[z] <= f.d) res[z] = { d: trendFirst[z], src: 'zone series', after: null };
  else if (f.s === reports[0].split('|')[1]) res[z] = { d: f.d, src: `N°${f.s}`, after: null, atStart: true };
  else { const a = prevDate[f.s]; const gap = (Date.parse(f.d) - Date.parse(a)) / 864e5 > 1; res[z] = { d: f.d, src: `N°${f.s}`, after: gap ? a : null }; }
}
fs.writeFileSync(out, JSON.stringify(res));
console.log('zones', Object.keys(res).length, 'with uncertainty window', Object.values(res).filter((v) => v.after).length, 'listed at series start', Object.values(res).filter((v) => v.atStart).length);
