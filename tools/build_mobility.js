#!/usr/bin/env node
/*
 * build_mobility.js — mobility data adapter (mirror CSV -> D.mob)
 * --------------------------------------------------------------
 * Transforms the committed Flowminder O-D mirror
 *   data/mobility_flowminder_od.csv   (month,origin,destination,estimate,lower,upper,status)
 * into the `D.mob` object the existing mobility UI already consumes, and splices
 * it into config.drc-bvd-2026.js in place of the current `"mob":{...}` value.
 *
 * The mobility UI is NOT changed by this script — it only replaces the data the
 * engine reads. To add a future month, append its rows to the mirror CSV with a
 * new `month` value and re-run:  node tools/build_mobility.js --month=2026-05
 *
 * D.mob schema (unchanged shape the engine reads, extended with bounds/suppression):
 *   D.mob[zone] = {
 *     tin, tout,                 // Σ numeric arrivals / departures among mapped zones
 *     in:  [[origin, est, lo, hi], ...],  // sorted desc by est; lo/hi null if unpublished
 *     out: [[dest,   est, lo, hi], ...],
 *     inSup, outSup              // # suppressed (<15) directed pairs (never counted as 0)
 *   }
 * Directional semantics: A->B stays A->B. "in" = destination is this zone;
 * "out" = origin is this zone.
 *
 * Attribution kept in CFG.mobNote: Flowminder / Vodacom, April 2026.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const argMonth = (process.argv.find(a => a.startsWith('--month=')) || '').split('=')[1] || '2026-04';
const REPO = path.resolve(__dirname, '..');
const CSV = path.join(REPO, 'data/mobility_flowminder_od.csv');
const CONFIG = path.join(REPO, 'config.drc-bvd-2026.js');

const raw = fs.readFileSync(CSV, 'utf8').trim().split('\n');
const header = raw[0].split(',');
const col = Object.fromEntries(header.map((h, i) => [h, i]));
const num = s => (s === '' || s == null ? null : Number(s));

const mob = {};                       // zone -> {tin,tout,in,out,inSup,outSup}
const z = k => (mob[k] || (mob[k] = { tin: 0, tout: 0, in: [], out: [], inSup: 0, outSup: 0 }));
let nOk = 0, nSup = 0;

for (let i = 1; i < raw.length; i++) {
  const c = raw[i].split(',');
  if (c[col.month] !== argMonth) continue;
  const o = c[col.origin], d = c[col.destination], st = c[col.status];
  if (st === 'suppressed') { z(o).outSup++; z(d).inSup++; nSup++; continue; }
  const est = num(c[col.estimate]), lo = num(c[col.lower]), hi = num(c[col.upper]);
  if (est == null) continue;
  nOk++;
  z(o).out.push([d, est, lo, hi]); z(o).tout += est;
  z(d).in.push([o, est, lo, hi]); z(d).tin += est;
}

// sort ranked lists by estimate desc, tidy numbers
for (const k of Object.keys(mob)) {
  const m = mob[k];
  m.in.sort((a, b) => b[1] - a[1]);
  m.out.sort((a, b) => b[1] - a[1]);
  m.tin = Math.round(m.tin); m.tout = Math.round(m.tout);
}

// deterministic key order
const ordered = {};
for (const k of Object.keys(mob).sort()) ordered[k] = mob[k];
const json = JSON.stringify(ordered);

// splice into config: replace the D.mob value (first "mob":{...})
let src = fs.readFileSync(CONFIG, 'utf8');
const marker = '"mob":';
const start = src.indexOf(marker);
if (start < 0) throw new Error('could not find "mob": in config');
const braceStart = src.indexOf('{', start + marker.length);
let depth = 0, end = -1, inStr = false, esc = false;
for (let j = braceStart; j < src.length; j++) {
  const ch = src[j];
  if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
  if (ch === '"') { inStr = true; continue; }
  if (ch === '{') depth++;
  else if (ch === '}') { depth--; if (depth === 0) { end = j; break; } }
}
if (end < 0) throw new Error('could not brace-match D.mob value');
src = src.slice(0, braceStart) + json + src.slice(end + 1);
if (src.includes('\r')) throw new Error('CRLF introduced');
fs.writeFileSync(CONFIG, src);

const zones = Object.keys(ordered);
console.log('month:', argMonth);
console.log('numeric flows:', nOk, '| suppressed pairs:', nSup);
console.log('zones with mobility:', zones.length);
console.log('D.mob bytes:', json.length);
console.log('spliced into', path.relative(REPO, CONFIG));
