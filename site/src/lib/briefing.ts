/* ============================================================================
   Briefing steps. Every count, name and date below is computed from the data
   (tracker.json, firstListed.json); the text only frames it.
   ========================================================================== */
import firstRaw from '@/data/firstListed.json';
import { MOB, ZONES, PROV, LATEST, fmt, dateShort } from '@/lib/data';

type First = { d: string; src: string; after: string | null; atStart?: boolean };
export const FIRST = firstRaw as Record<string, First>;
const byZone = Object.fromEntries(ZONES.map((z) => [z.z, z]));
const list = (xs: string[], n = 6) => (xs.length <= n ? xs.join(', ') : `${xs.slice(0, n).join(', ')} and ${xs.length - n} more`);

export type FlowSpec = { from: string; to: string; v: number; kind: 'in' | 'out' };
export type MapSpec = {
  mode: 'spread' | 'mob';
  phase?: number;              // spread: zones listed up to this phase are coloured
  highlight: string[];         // ringed and labelled
  flows?: FlowSpec[];
  focus: string[];             // zones the map frames
};
export type Hud = { a: { label: string; value: number }; b: { label: string; value: number; of?: number } };
export type Step = { id: string; chapter: 1 | 2; kicker: string; title: string; body: string; note?: string; map: MapSpec; hud: Hud; range?: [string, string] };

/** Cumulative number of health zones listed, by date of first listing (for the timeline chart). */
export const ZONES_OVER_TIME = (() => {
  const ds = Object.values(firstRaw as Record<string, { d: string }>).map((f) => f.d).sort();
  const pts: { t: number; d: string; n: number }[] = [];
  ds.forEach((d, i) => { const t = Date.parse(d + 'T00:00:00Z'); if (pts.length && pts[pts.length - 1].d === d) pts[pts.length - 1].n = i + 1; else pts.push({ t, d, n: i + 1 }); });
  return pts;
})();

/* ---------------- chapter 1: spread ---------------- */
export const PHASES = [
  { label: 'May', from: '2026-05-01', to: '2026-05-31' },
  { label: 'June', from: '2026-06-01', to: '2026-06-30' },
  { label: 'July', from: '2026-07-01', to: '2026-07-31' },
  { label: 'August–September', from: '2026-08-01', to: '2026-09-30' },
  { label: 'October–November', from: '2026-10-01', to: '2026-11-30' },
];
export const phaseOf = (z: string) => { const f = FIRST[z]; return f ? PHASES.findIndex((p) => f.d >= p.from && f.d <= p.to) : -1; };

const provOf = (z: string) => byZone[z]?.p ?? (z === 'Dakwa' ? 'Bas-Uele' : '?');
const provFirst: Record<string, string> = {};
Object.entries(FIRST).forEach(([z, f]) => { const p = provOf(z); if (!provFirst[p] || f.d < provFirst[p]) provFirst[p] = f.d; });

function spreadSteps(): Step[] {
  return PHASES.map((ph, i) => {
    const fresh = Object.keys(FIRST).filter((z) => phaseOf(z) === i).sort((a, b) => FIRST[a].d.localeCompare(FIRST[b].d));
    const total = Object.keys(FIRST).filter((z) => phaseOf(z) <= i && phaseOf(z) >= 0).length;
    const newProv = Object.entries(provFirst).filter(([, d]) => d >= ph.from && d <= ph.to).sort((a, b) => a[1].localeCompare(b[1]));
    const provs = Object.keys(provFirst).filter((p) => provFirst[p] <= ph.to).length;
    const windowed = fresh.filter((z) => FIRST[z].after);
    const mapped = fresh.filter((z) => byZone[z]);
    let body = `${fresh.length} health zone${fresh.length === 1 ? '' : 's'} first listed with a confirmed case: ${list(fresh)}.`;
    body += newProv.length ? ` Provinces with a first listed case: ${newProv.map(([p, d]) => `${p} (${dateShort(d)})`).join(', ')}.` : ' No new province.';
    const last = i === PHASES.length - 1;
    body += ` Total ${last ? `by ${dateShort(LATEST.d)}` : `by the end of ${ph.label.split('–').pop()}`}: ${total} zones in ${provs} province${provs === 1 ? '' : 's'}.`;
    /* zones first listed right after a gap in the series: give the window, grouped by report */
    const groups = new Map<string, number>();
    windowed.forEach((z) => { const k = `${FIRST[z].after}|${FIRST[z].d}`; groups.set(k, (groups.get(k) ?? 0) + 1); });
    const starts = fresh.filter((z) => FIRST[z].atStart);
    const parts = [...groups].map(([k, n]) => { const [a, d] = k.split('|'); return `${n} first listed on ${dateShort(d)}, after a report gap from ${dateShort(a)}: first case between those dates`; });
    if (starts.length) parts.push(`${starts.join(', ')} already appear in the first report of the national zone series (${dateShort(FIRST[starts[0]].d)}) and may have had cases earlier`);
    const note = parts.length ? parts.join('. ') + '.' : undefined;
    /* titles name what the data shows: new provinces, or where the new zones are */
    const where = [...new Set(fresh.map(provOf))];
    const title = i === 0 ? 'Where it started' : newProv.length ? `Reaching ${newProv.map(([p]) => p).join(' and ')}` : `More zones in ${where.join(' and ')}`;
    const hud: Hud = { a: { label: 'Health zones listed', value: total }, b: { label: 'Provinces reached', value: provs, of: 26 } };
    return { id: `s${i}`, chapter: 1 as const, kicker: `${i + 1} / ${PHASES.length} · ${ph.label} 2026`, title, body, note, hud, range: [ph.from, last ? LATEST.d : ph.to] as [string, string], map: { mode: 'spread' as const, phase: i, highlight: mapped.slice(0, 12), focus: mapped.length ? mapped : ['Bunia'] } };
  });
}

/* ---------------- chapter 2: mobility ---------------- */
const total = (z: string) => MOB[z].tin + MOB[z].tout;
const HUBS = Object.keys(MOB).sort((a, b) => total(b) - total(a)).slice(0, 4);
const flowsOf = (z: string): FlowSpec[] => [
  ...MOB[z].in.slice(0, 5).map(([o, v]) => ({ from: o, to: z, v, kind: 'in' as const })),
  ...MOB[z].out.slice(0, 5).map(([d, v]) => ({ from: z, to: d, v, kind: 'out' as const })),
];
/* display filters, stated in the step text: "high-burden" = 500+ cumulative cases, "few cases" = under 50 */
const HI = 500, LO = 50;
const hiZones = new Set(ZONES.filter((z) => z.c >= HI).map((z) => z.z));
const exposed = Object.keys(MOB).filter((z) => byZone[z].c < LO)
  .map((z) => ({ z, inflow: MOB[z].in.filter(([o]) => hiZones.has(o)).reduce((a, [, v]) => a + v, 0), from: MOB[z].in.filter(([o]) => hiZones.has(o)) }))
  .filter((x) => x.inflow > 0).sort((a, b) => b.inflow - a.inflow);

function mobilitySteps(): Step[] {
  const [h1, h2] = HUBS;
  const top3 = exposed.slice(0, 3);
  return [
    { id: 'm0', chapter: 2, kicker: 'Mobility · April 2026', title: `Movement concentrates in ${HUBS.length} hubs`,
      body: `${list(HUBS)} account for the most estimated movement in and out. ${HUBS.map((z) => `${z}: ${fmt(total(z))}`).join(' · ')} relocations. Each also reports confirmed cases: ${HUBS.map((z) => `${z} ${fmt(byZone[z].c)}`).join(', ')}.`,
      note: 'Flowminder / Vodacom estimated relocations among the mapped health zones, April 2026. Vodacom subscribers only.',
      hud: { a: { label: 'Relocations, top 4 hubs', value: HUBS.reduce((a, z) => a + total(z), 0) }, b: { label: 'Zones with mobility data', value: Object.keys(MOB).length, of: ZONES.length } },
      map: { mode: 'mob', highlight: HUBS, focus: HUBS.flatMap((z) => [z, ...MOB[z].in.slice(0, 3).map((f) => f[0])]) } },
    { id: 'm1', chapter: 2, kicker: 'Mobility · April 2026', title: `${h1}: the busiest hub`,
      body: `${fmt(MOB[h1].tin)} estimated arrivals and ${fmt(MOB[h1].tout)} departures. Its largest exchange is with ${MOB[h1].in[0][0]}: ${fmt(MOB[h1].in[0][1])} arrivals from there, ${fmt(MOB[h1].out[0][1])} departures to ${MOB[h1].out[0][0]}.`,
      hud: { a: { label: `Arrivals into ${h1}`, value: MOB[h1].tin }, b: { label: `Departures from ${h1}`, value: MOB[h1].tout } },
      map: { mode: 'mob', highlight: [h1], flows: flowsOf(h1), focus: [h1, ...flowsOf(h1).flatMap((f) => [f.from, f.to])] } },
    { id: 'm2', chapter: 2, kicker: 'Mobility · April 2026', title: `${h2}'s network`,
      body: `${fmt(MOB[h2].tin)} arrivals and ${fmt(MOB[h2].tout)} departures, mostly with ${list(MOB[h2].in.slice(0, 3).map((f) => f[0]))}.`,
      hud: { a: { label: `Arrivals into ${h2}`, value: MOB[h2].tin }, b: { label: `Departures from ${h2}`, value: MOB[h2].tout } },
      map: { mode: 'mob', highlight: [h2], flows: flowsOf(h2), focus: [h2, ...flowsOf(h2).flatMap((f) => [f.from, f.to])] } },
    { id: 'm3', chapter: 2, kicker: 'Mobility · April 2026', title: 'Few cases, heavy arrivals from high-burden zones',
      body: `Among zones with fewer than ${LO} confirmed cases, these receive the most estimated arrivals from zones with ${HI} or more: ${top3.map((x) => `${x.z} (${fmt(byZone[x.z].c)} cases, ${fmt(x.inflow)} arrivals)`).join(', ')}. Next: ${list(exposed.slice(3, 8).map((x) => x.z))}.`,
      note: 'Arrivals are April 2026 estimates, not travel during the outbreak. This ranks exposure to movement, not risk of infection; it is not an early-warning level.',
      hud: { a: { label: `Arrivals into ${top3.map((x) => x.z).join(', ')}`, value: top3.reduce((a, x) => a + x.inflow, 0) }, b: { label: `Zones under ${LO} cases with such arrivals`, value: exposed.length } },
      map: { mode: 'mob', highlight: top3.map((x) => x.z), flows: top3.flatMap((x) => x.from.slice(0, 3).map(([o, v]) => ({ from: o, to: x.z, v, kind: 'in' as const }))), focus: top3.flatMap((x) => [x.z, ...x.from.slice(0, 3).map((f) => f[0])]) } },
    { id: 'm4', chapter: 2, kicker: 'Mobility · what it cannot show', title: 'Zones without cases are not in the mobility data',
      body: `The Flowminder release used here covers the ${Object.keys(MOB).length} affected zones it could match, so it cannot show movement into zones that have no cases yet. ${ZONES.length - Object.keys(MOB).length} mapped zones have no coverage, including every zone mapped on or after 8 October.`,
      note: `Situation as of INSP SitRep N°${LATEST.s}; ${PROV.length} provinces affected.`,
      hud: { a: { label: 'Zones with mobility data', value: Object.keys(MOB).length }, b: { label: 'Mapped zones without', value: ZONES.length - Object.keys(MOB).length, of: ZONES.length } },
      map: { mode: 'mob', highlight: ZONES.filter((z) => !MOB[z.z]).map((z) => z.z), focus: ZONES.map((z) => z.z) } },
  ];
}

export const STEPS: Step[] = [...spreadSteps(), ...mobilitySteps()];
