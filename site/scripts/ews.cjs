/* Early-warning status per health zone, computed from the per-zone cumulative
   series (data/zones_timeseries_full.csv) as of the latest SitRep. Mirrors the
   rules in tools/ebola_early_warning.py / early_warning/RULES.md — the Python
   tool stays the authoritative offline analysis; this is the site's current-status
   view. No figure is invented; every value is derived from the committed series.

   Signals (the active indicators):
     - Rise:       7-day rolling new cases >= ALERT / >= CRITICAL (by zone).
     - New zone:   first confirmed case within NEWZONE_DAYS (Event).
     - Resurgence: a new case after >= QUIET_DAYS quiet, within RESURG_DAYS,
                   when the quiet span holds no reporting gap longer than MAX_GAP.
   The highest level any signal reaches sets the zone's level. Indicators that the
   per-zone series cannot support (contacts, community-death share, mobility,
   week-on-week growth) are emitted as pending, not computed.

   Usage: node scripts/ews.cjs ../data/zones_timeseries_full.csv src/data/ews.json */
const fs = require('fs');
const [, , csvPath, out] = process.argv;

const P = {
  WINDOW_DAYS: 7,        // rolling window for the rise indicator
  RISE_ALERT: 25,        // 7-day new cases -> alert
  RISE_CRIT: 50,         // 7-day new cases -> critical
  NEWZONE_DAYS: 21,      // first case within this many days -> alert (Event)
  QUIET_DAYS: 42,        // official end-of-outbreak quiet period
  RESURG_DAYS: 21,       // a resurgence within this many days is a current signal
  MAX_GAP: 7,            // a reporting gap longer than this voids a window / quiet span
  EXCLUDE: 'a ventiler',
};
const DAY = 864e5;
const d = (s) => Date.parse(s);
const canonProv = (p) => (p || '').replace('Uele', 'Uélé');

const lines = fs.readFileSync(csvPath, 'utf8').trim().split('\n');
const H = lines[0].split(',');
const ix = (k) => H.indexOf(k);
const rows = lines.slice(1).map((l) => l.split(','));

const reportDates = [...new Set(rows.map((r) => r[ix('report_date')]))].sort();
const last = reportDates[reportDates.length - 1];
const lastSitrep = rows.filter((r) => r[ix('report_date')] === last)[0][ix('sitrep')];
const lo = d(last) - (P.WINDOW_DAYS - 1) * DAY;
// step gap into the latest report (is the current window itself assessable?)
const prevReport = reportDates[reportDates.length - 2];
const lastStepGap = (d(last) - d(prevReport)) / DAY;
// global gaps longer than MAX_GAP (span = next report - previous report)
const bigGaps = [];
for (let i = 1; i < reportDates.length; i++) {
  const span = (d(reportDates[i]) - d(reportDates[i - 1])) / DAY;
  if (span > P.MAX_GAP) bigGaps.push([d(reportDates[i - 1]), d(reportDates[i])]);
}
const gapInSpan = (a, b) => bigGaps.some(([gs, ge]) => !(ge <= a || gs >= b));

// per-zone cumulative series
const byZone = {};
for (const r of rows) {
  const z = r[ix('zone')];
  if (z.trim().toLowerCase() === P.EXCLUDE) continue;
  const c = r[ix('confirmed_cases')].trim();
  (byZone[z] = byZone[z] || { prov: canonProv(r[ix('province')]), obs: [] })
    .obs.push({ date: r[ix('report_date')], cases: c === '' ? null : +c });
}

const zones = [];
for (const [z, { prov, obs }] of Object.entries(byZone)) {
  obs.sort((a, b) => d(a.date) - d(b.date));
  // derive new cases (negative diff = correction -> 0) and record resurgence events:
  // any increase that follows >= QUIET_DAYS with no increase, over an assessable span.
  let prev = null, lastInc = null;
  const newByDate = {};
  const resurgEvents = [];
  for (const o of obs) {
    if (o.cases == null) continue;
    let nc;
    if (prev == null) { nc = o.cases; if (o.cases > 0) lastInc = o.date; }
    else if (o.cases < prev) nc = 0;                 // correction
    else {
      nc = o.cases - prev;
      if (nc > 0) {
        if (lastInc && (d(o.date) - d(lastInc)) / DAY >= P.QUIET_DAYS && !gapInSpan(d(lastInc), d(o.date))) {
          resurgEvents.push(o.date);
        }
        lastInc = o.date;
      }
    }
    newByDate[o.date] = nc;
    prev = o.cases;
  }
  const rolling = Object.entries(newByDate)
    .filter(([dt]) => d(dt) >= lo && d(dt) <= d(last))
    .reduce((s, [, v]) => s + v, 0);
  const firstDate = obs.find((o) => o.cases > 0)?.date;
  const daysSinceFirst = firstDate ? (d(last) - d(firstDate)) / DAY : null;

  // resurgence signal if any such event is within RESURG_DAYS of the latest report
  const resurgence = resurgEvents.some((e) => (d(last) - d(e)) / DAY <= P.RESURG_DAYS);

  const flags = [];
  let level = 'normal';
  const na = lastStepGap > P.MAX_GAP;               // current window not assessable
  if (na) {
    level = 'na';
  } else {
    if (rolling >= P.RISE_CRIT) { level = 'critical'; flags.push('rise'); }
    else if (rolling >= P.RISE_ALERT) { level = 'alert'; flags.push('rise'); }
    if (daysSinceFirst != null && daysSinceFirst <= P.NEWZONE_DAYS) {
      flags.push('newzone'); if (level === 'normal') level = 'alert';
    }
    if (resurgence) { flags.push('resurgence'); if (level === 'normal') level = 'alert'; }
  }
  zones.push({ z, p: prov, level, rolling, since: daysSinceFirst, flags });
}

const order = { critical: 0, alert: 1, normal: 2, na: 3 };
zones.sort((a, b) => order[a.level] - order[b.level] || b.rolling - a.rolling || a.z.localeCompare(b.z));
const counts = { critical: 0, alert: 0, normal: 0, na: 0 };
for (const z of zones) counts[z.level]++;

const nNewZone = zones.filter((z) => z.flags.includes('newzone')).length;
const nResurg = zones.filter((z) => z.flags.includes('resurgence')).length;
const nRiseA = zones.filter((z) => z.flags.includes('rise') && z.level === 'alert').length;
const nRiseC = zones.filter((z) => z.flags.includes('rise') && z.level === 'critical').length;

const indicators = [
  { family: 'Event', name: 'First confirmed case in a previously unaffected health zone',
    active: true, threshold: `within ${P.NEWZONE_DAYS} days`, current: nNewZone },
  { family: 'Trend', name: 'New confirmed cases over a rolling window',
    active: true, threshold: `${P.WINDOW_DAYS}-day new cases ≥ ${P.RISE_ALERT} (alert) / ≥ ${P.RISE_CRIT} (critical)`,
    current: nRiseA + nRiseC },
  { family: 'Trend', name: 'New case after a quiet period',
    active: true, threshold: `≥ ${P.QUIET_DAYS} quiet days, within ${P.RESURG_DAYS} days`, current: nResurg },
  { family: 'Trend', name: 'Week-on-week growth in new confirmed cases', active: false },
  { family: 'Response', name: 'Share of contacts followed up', active: false, note: 'national only' },
  { family: 'Response', name: 'Share of deaths occurring in the community', active: false, note: 'not in the per-zone series' },
  { family: 'Exposure', name: 'Inbound mobility from zones with recent cases', active: false, note: 'Flowminder April 2026' },
];

const result = {
  asof: last, sitrep: lastSitrep,
  params: P,
  counts, total: zones.length,
  zones, indicators,
};
fs.writeFileSync(out, JSON.stringify(result));
console.log(`EWS ${last} N°${lastSitrep}: critical ${counts.critical}, alert ${counts.alert}, normal ${counts.normal}, na ${counts.na} (of ${zones.length}); active indicators 3`);
