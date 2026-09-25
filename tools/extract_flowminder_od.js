#!/usr/bin/env node
/*
 * extract_flowminder_od.js — provenance step (run once per Flowminder release)
 * ---------------------------------------------------------------------------
 * Reads the Flowminder HDX long O-D table published in INRB-UMIE/BDBV2026-Data
 *   data/flowminder/raw/drc-estimated-relocations-2020_03-2026_04-v2.0-external.csv
 * and writes a small, web-repo-ready mirror of the April 2026 estimates for the
 * health zones this dashboard actually maps:
 *   data/mobility_flowminder_od.csv
 *
 * Only directed pairs where BOTH endpoints are mapped dashboard zones are kept
 * (those are the only flows the map/sidebar can draw and name). Directionality,
 * the point estimate and the published lower/upper bounds are preserved, and
 * cells Flowminder marks "redacted (count <15)" are written as status=suppressed
 * with empty values — never converted to 0.
 *
 * Source column dictionary (raw/…-variable-list.csv):
 *   from_hz_name / from_province_name / to_hz_name / to_province_name
 *   est_flows_2026_04 (point), est_flows_2026_04_LB, est_flows_2026_04_UB
 *
 * The 66 MB raw CSV is NOT bundled into this repo; this script is the documented
 * derivation of the committed mirror. Point it at a local clone of the source:
 *   node tools/extract_flowminder_od.js /path/to/bdbv2026-data
 *
 * Attribution: Flowminder / Vodacom, April 2026 (Vodacom subscribers only;
 * Flowminder-derived estimates). Integration test — Flowminder provenance kept.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC_REPO = process.argv[2] || '/home/user/inrb-umie/bdbv2026-data';
const MONTH = '2026-04';
const FLOW = 'est_flows_2026_04', LB = 'est_flows_2026_04_LB', UB = 'est_flows_2026_04_UB';
const RAW = path.join(SRC_REPO, 'data/flowminder/raw/drc-estimated-relocations-2020_03-2026_04-v2.0-external.csv');
const REPO = path.resolve(__dirname, '..');
const OUT = path.join(REPO, 'data/mobility_flowminder_od.csv');

/* ---- dashboard zone keys (the 51 mapped zones) from the live config ---- */
function loadDashZones() {
  let code = fs.readFileSync(path.join(REPO, 'config.drc-bvd-2026.js'), 'utf8');
  code += '\n;globalThis._cap={D:typeof D!=="undefined"?D:null};';
  const ctx = { localStorage: { getItem: () => null, setItem: () => {} }, console };
  vm.createContext(ctx); vm.runInContext(code, ctx);
  return ctx._cap.D.zones.map(z => ({ z: z.z, p: z.p }));
}
const DASH = loadDashZones();
const DASHSET = new Set(DASH.map(d => d.z));

/* Flowminder canonical Nom -> dashboard key. The dashboard carries the
 * pre-2026-07 shapefile spellings; Flowminder uses the post-migration ones.
 * (Verified exhaustively against the processed April matrix header.) */
const ALIAS = {
  'Makiso Kisangani': 'Makiso-Kisangani',
  'Miti Murhesa': 'Miti-Murhesa',
  'Nia Nia': 'Nia-Nia',
  'Wanierukula': 'Wanie-Rukula',
  // 'Lubunga' is province-ambiguous; handled below (dashboard Lubunga is Tshopo).
};
const LABEL_RE = /^[a-z]{2}\s+(.+?)\s+Zone de Sant[eé]$/i;
const strip = s => { const m = LABEL_RE.exec((s || '').trim()); return m ? m[1].trim() : (s || '').trim(); };

/* raw Flowminder label + province -> dashboard key, or null if not a mapped zone */
function toDash(rawLabel, province) {
  const n = strip(rawLabel);
  if (n === 'Lubunga') return /^Tshopo/i.test((province || '').trim()) ? 'Lubunga' : null;
  if (ALIAS[n]) return ALIAS[n];
  return DASHSET.has(n) ? n : null;
}

/* parse a Flowminder flow cell: number, or null for missing / "redacted (count <15)" */
function parseFlow(raw) {
  const t = (raw || '').trim();
  if (!t || /redacted/i.test(t)) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

/* ---- streamed CSV read (66 MB) ---- */
function* rows(file) {
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(1 << 20); let leftover = '', header = null;
  let n;
  while ((n = fs.readSync(fd, buf, 0, buf.length)) > 0) {
    leftover += buf.toString('utf8', 0, n);
    let i;
    while ((i = leftover.indexOf('\n')) >= 0) {
      const line = leftover.slice(0, i).replace(/\r$/, ''); leftover = leftover.slice(i + 1);
      const cells = line.split(',');
      if (!header) { header = cells; continue; }
      const o = {}; for (let k = 0; k < header.length; k++) o[header[k]] = cells[k];
      yield o;
    }
  }
  if (leftover.trim()) { const cells = leftover.split(','); const o = {}; header.forEach((h, k) => o[h] = cells[k]); yield o; }
  fs.closeSync(fd);
}

const out = [];                 // {origin,destination,estimate,lower,upper,status}
const seenFlowNames = new Set();
const unmatched = new Set();     // stripped names that touch neither alias nor dash set (reporting only)
let rawRows = 0, mappedPairs = 0, suppressed = 0, zeros = 0;

for (const r of rows(RAW)) {
  rawRows++;
  const oDash = toDash(r.from_hz_name, r.from_province_name);
  const dDash = toDash(r.to_hz_name, r.to_province_name);
  // track unmatched stripped names for the integration report
  if (!oDash) unmatched.add(strip(r.from_hz_name));
  if (!dDash) unmatched.add(strip(r.to_hz_name));
  if (!oDash || !dDash) continue;         // only mapped→mapped is drawable/nameable
  if (oDash === dDash) continue;          // no self-loops
  const est = parseFlow(r[FLOW]);
  if (est === null) {                      // redacted (<15) — preserve, never 0
    suppressed++;
    out.push({ origin: oDash, destination: dDash, estimate: '', lower: '', upper: '', status: 'suppressed' });
    continue;
  }
  if (est === 0) { zeros++; continue; }    // explicit zero flow: absence, drop
  mappedPairs++;
  const lo = parseFlow(r[LB]), hi = parseFlow(r[UB]);
  out.push({
    origin: oDash, destination: dDash,
    estimate: String(Math.round(est)),
    lower: lo === null ? '' : String(Math.round(lo)),
    upper: hi === null ? '' : String(Math.round(hi)),
    status: 'ok',
  });
}

/* stable order: origin, then estimate desc, then destination */
out.sort((a, b) =>
  a.origin.localeCompare(b.origin) ||
  (Number(b.estimate || -1) - Number(a.estimate || -1)) ||
  a.destination.localeCompare(b.destination));

const head = 'month,origin,destination,estimate,lower,upper,status';
const lines = out.map(r => [MONTH, r.origin, r.destination, r.estimate, r.lower, r.upper, r.status].join(','));
fs.writeFileSync(OUT, head + '\n' + lines.join('\n') + '\n');

const coveredOrigins = new Set(out.map(r => r.origin));
const coveredDests = new Set(out.map(r => r.destination));
const noCoverage = DASH.map(d => d.z).filter(z => !coveredOrigins.has(z) && !coveredDests.has(z));

console.log('source raw rows read:', rawRows);
console.log('mapped→mapped numeric flows:', mappedPairs);
console.log('mapped→mapped suppressed (<15):', suppressed);
console.log('mapped→mapped explicit zeros dropped:', zeros);
console.log('output rows (ok+suppressed):', out.length);
console.log('mapped zones with any coverage:', new Set([...coveredOrigins, ...coveredDests]).size, '/', DASH.length);
console.log('mapped zones with NO Flowminder coverage:', JSON.stringify(noCoverage));
console.log('wrote', path.relative(REPO, OUT));
