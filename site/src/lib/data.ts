/* ============================================================================
   Data layer. Everything here is read from data/tracker.json, which
   scripts/extract.cjs copies field for field from the live tracker config
   (config.drc-bvd-2026.js). Derived values (differences, shares, rankings) are
   computed here, in one place, and each says how it is derived.
   ========================================================================== */
import raw from '@/data/tracker.json';
import admin1 from '@/data/admin1.json';

export type NatRow = {
  s: string; d: string; c: number; dd: number | null; cfr: number;
  iso: number | null; rec: number; sus: number | null; ct: number | null; dd_null?: never;
  st: 'final' | 'provisional'; pdf?: string; nd?: { ct?: string[]; sus?: string[] };
};
export type Prov = { p: string; c: number; d: number; cfr: number; zt: number; zn: number; u: number };
export type Zone = { z: string; p: string; c: number; d: number; lat: number; lon: number; pop: number; cfr: number; k: number };
export type Ctry = { n: { en: string; fr: string }; lat: number; lon: number; c: number; d: number; r: number | null; ci: number | null; asof: string; st: 'active' | 'over'; src: string };
/** Flowminder / Vodacom relocations, April 2026: [zone, estimate, lower, upper]. */
export type Flow = [string, number, number | null, number | null];
export type Mob = { tin: number; tout: number; in: Flow[]; out: Flow[]; inSup?: number; outSup?: number };
type TrendRow = [string, number | null, number | null, number | null, number | null];

const R = raw as unknown as {
  source: { sitrep: string; date: string };
  nat: NatRow[]; prov: Prov[]; ctry: Ctry[]; zones: Zone[];
  zgeo: GeoJSON.FeatureCollection; africa: GeoJSON.FeatureCollection; provinces: GeoJSON.FeatureCollection;
  trends: Record<string, TrendRow[]>;
  mob: Record<string, Mob>;
  strings: Record<string, string>;
  ctryHist: Record<string, { d: string; c: number | null; dd: number | null; r: number | null; src: string | null }[]>;
};

export const SOURCE = R.source;
export const NAT = R.nat;
export const LATEST = NAT[NAT.length - 1] as NatRow & { dd: number };
if (LATEST.dd == null) throw new Error(`SitRep N°${LATEST.s} has no deaths figure`);
export const PREV = NAT[NAT.length - 2];
export const PROV = R.prov;
export const ZONES = R.zones;
export const CTRY = R.ctry;
export const GEO = { zones: R.zgeo, africa: R.africa, provinces: R.provinces };
export const STR = R.strings;
export const MOB = R.mob;
/** Kenya counties and Nigeria states (geoBoundaries ADM1, CC BY 4.0). Geometry only: no figure is attached. */
export const ADMIN1 = admin1 as unknown as { source: string; KEN: GeoJSON.FeatureCollection; NGA: GeoJSON.FeatureCollection };

/** Gap segments for a series: each joins the last reported value before a gap to the first after it.
 *  Charts draw them dashed, so the line reads as continuous while showing that no report exists there. */
export type GapSeg = { x1: string | number; y1: number; x2: string | number; y2: number };

/** Splits one series into solid runs and dashed bridges. A run ends at a missing value or where
 *  `breakBefore(i)` says a report gap starts. Each run gets its own key (`${key}__0`, `${key}__1`…)
 *  so it can be drawn as a separate solid line; bridges join the last value of one run to the
 *  first value of the next. No value is added. */
export function lineParts<T extends { t: number }>(rows: T[], key: keyof T & string, breakBefore: (i: number) => boolean) {
  let run = 0, prev: { t: number; v: number } | null = null, pendingBreak = false;
  const out = rows.map((r) => ({ ...r } as T & Record<string, number | null>));
  const bridges: GapSeg[] = [];
  rows.forEach((r, i) => {
    const v = r[key] as unknown as number | null;
    if (i > 0 && breakBefore(i)) pendingBreak = true;
    if (v == null) { pendingBreak = true; return; }
    if (pendingBreak && prev) { run++; bridges.push({ x1: prev.t, y1: prev.v, x2: r.t, y2: v }); }
    (out[i] as Record<string, number | null>)[`${key}__${run}`] = v;
    prev = { t: r.t, v }; pendingBreak = false;
  });
  return { data: out, runs: run + 1, bridges };
}

const DAY = 864e5;
const t = (d: string) => Date.parse(d + 'T00:00:00Z');

/* ---------- national series ---------- */

/** New confirmed cases / deaths reported in a SitRep = its cumulative minus the previous
 *  SitRep's, ONLY when the previous SitRep is the previous calendar day. Across a
 *  missing, held or unpublished report the value is null: a two-day change is never
 *  shown as one day's. */
export type Daily = { d: string; s: string; cum: number; cumD: number | null; nc: number | null; nd: number | null; gapBefore: number };
export const DAILY: Daily[] = NAT.map((r, i) => {
  const p = NAT[i - 1];
  const gap = p ? Math.round((t(r.d) - t(p.d)) / DAY) - 1 : 0;
  const ok = !!p && gap === 0;
  const diff = (a: number | null, b: number | null) => (ok && a != null && b != null ? a - b : null);
  return { d: r.d, s: r.s, cum: r.c, cumD: r.dd as number | null, nc: diff(r.c, p?.c ?? null), nd: diff(r.dd, p?.dd ?? null), gapBefore: gap };
});

/* Reasons as recorded in the repository's CLAUDE.md (coverage notes). */
const GAP_REASON: Record<string, string> = {
  '065-114': 'SitReps N°066–113 not ingested in the national series',
  '114-116': 'N°115 published under Actualités only; not yet ingested',
  '141-143': 'N°142 never published by INSP',
  '149-151': 'N°150 held: its totals disagree with its own zone table',
  '168-170': 'N°169 held: Ituri data harmonisation, reverted in N°170',
  '171-173': 'N°172 not published as of 16 Nov 2026',
};

/** Calendar days with no SitRep in the series, with the reason documented by the maintainer. */
export const GAPS: { from: string; to: string; days: number; why: string }[] = DAILY
  .filter((r) => r.gapBefore > 0)
  .map((r) => {
    const i = NAT.findIndex((x) => x.d === r.d);
    const prev = NAT[i - 1];
    const from = new Date(t(prev.d) + DAY).toISOString().slice(0, 10);
    const to = new Date(t(r.d) - DAY).toISOString().slice(0, 10);
    return { from, to, days: r.gapBefore, why: GAP_REASON[`${prev.s}-${r.s}`] ?? 'Not in the series' };
  });


/** Sum over the last n consecutive daily SitReps, or null if the run is broken. */
export function lastNDays(n: number) {
  const tail = DAILY.slice(-n);
  if (tail.length < n || tail.some((r) => r.nc == null)) return null;
  return { cases: tail.reduce((a, r) => a + (r.nc ?? 0), 0), deaths: tail.reduce((a, r) => a + (r.nd ?? 0), 0), from: tail[0].d, to: tail[n - 1].d };
}

/* ---------- provinces, zones, countries ---------- */

export const PROV_TOTAL_ZONES = PROV.reduce((a, p) => a + p.zt, 0);   // health zones affected (INSP Tableau 1)
export const PROV_ZONE_DENOM = PROV.reduce((a, p) => a + p.zn, 0);    // zones in the affected provinces
export const DRC_PROVINCES = GEO.provinces.features.length;          // 26
export const MAPPED_ZONES = ZONES.length;
export const ZONE_SUM = { c: ZONES.reduce((a, z) => a + z.c, 0), d: ZONES.reduce((a, z) => a + z.d, 0) };
export const UNASSIGNED_DEATHS = PROV.reduce((a, p) => a + p.u, 0);   // "A ventiler"

export const share = (part: number, whole: number) => (whole ? part / whole : 0);

export type Country = { key: string; name: string; c: number; d: number; r: number | null; st: 'active' | 'over'; asof: string; src: string; lat: number; lon: number; base: string };
export const COUNTRIES: Country[] = [
  { key: 'COD', name: 'DR Congo', base: 'Dem. Rep. Congo', c: LATEST.c, d: LATEST.dd, r: LATEST.rec, st: 'active', asof: LATEST.d, src: `INSP SitRep N°${LATEST.s}`, lat: -2.9, lon: 23.6 },
  ...CTRY.map((x) => ({ key: x.n.en, name: x.n.en, base: x.n.en, c: x.c, d: x.d, r: x.r, st: x.st, asof: x.asof, src: x.src, lat: x.lat, lon: x.lon })),
];

/** A country's reported history, one point per public-health statement, for the Trends view.
 *  DR Congo's daily series is the national SitRep series (see DAILY); every other country is
 *  read from `ctryHist` — Kenya and Nigeria from their ministry CSVs (one row per statement),
 *  Uganda's single final figure from its country row. Nothing is interpolated: ministries
 *  publish periodic statements, so these are discrete reported points, never a daily line. */
export type CtryPoint = { d: string; t: number; c: number | null; dd: number | null; r: number | null; src: string | null };
export function countryHistory(key: string): CtryPoint[] {
  const h = R.ctryHist?.[key];
  if (!h) return [];
  return h.map((p) => ({ ...p, t: Date.parse(p.d + 'T00:00:00Z') })).sort((a, b) => a.t - b.t);
}

/** Zone cumulative series from D.trends: cases (r[3]) and deaths (r[4]). Only real
 *  observations are kept — break/null rows are dropped — so the lines read as
 *  continuous across missing report dates. No value is interpolated: every point is a
 *  reported cumulative reading and tooltips show only those. */
export function zoneSeries(z: string) {
  const s = R.trends[z];
  if (!s) return null;
  const rows: { t: number; d: string; c: number; dd: number | null }[] = [];
  s.forEach((r) => {
    if (!r[0] || r[3] == null) return;                 // break row / no cumulative case figure
    const d = `2026-${r[0]}`;
    rows.push({ t: Date.parse(d + 'T00:00:00Z'), d, c: r[3], dd: r[4] });
  });
  return rows.length ? { rows } : null;
}

/* ---------- formatting ---------- */
export const fmt = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('en-GB'));
export const pct = (x: number, dp = 0) => `${(x * 100).toFixed(dp)}%`;
export const dateLong = (d: string) => new Date(t(d)).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
export const dateShort = (d: string) => new Date(t(d)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
