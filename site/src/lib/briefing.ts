/* ============================================================================
   Briefing steps. Every count, name and date below is computed from the data
   (tracker.json, firstListed.json); the text only frames it. The narrative is
   built fresh per language (the Briefing view remounts on a language change),
   so L(en, fr) returns the active language. French copy is AI-assisted and
   needs a Francophone review before publishing (TODO_KIKI).
   ========================================================================== */
import firstRaw from '@/data/firstListed.json';
import { COUNTRIES, MOB, ZONES, PROV, LATEST, cname, fmt, dateShort, dateLong } from '@/lib/data';
import { L } from '@/lib/i18n';

type First = { d: string; src: string; after: string | null; atStart?: boolean };
export const FIRST = firstRaw as Record<string, First>;
const byZone = Object.fromEntries(ZONES.map((z) => [z.z, z]));
const list = (xs: string[], n = 6) => (xs.length <= n ? xs.join(', ') : `${xs.slice(0, n).join(', ')} ${L('and', 'et')} ${xs.length - n} ${L('more', 'de plus')}`);
const andj = (xs: string[]) => xs.join(L(' and ', ' et '));

export type FlowSpec = { from: string; to: string; v: number; kind: 'in' | 'out' };
export type MapSpec = {
  mode: 'spread' | 'mob' | 'countries';
  phase?: number;              // spread: zones listed up to this phase are coloured
  highlight: string[];         // ringed and labelled (in 'countries' mode: the country key to emphasise)
  flows?: FlowSpec[];
  focus: string[];             // zones the map frames (in 'countries' mode: country keys to frame)
  countries?: string[];        // 'countries' mode: country keys to draw as bubbles
};
export type Hud = { a: { label: string; value: number }; b: { label: string; value: number; of?: number } };
export type Step = { id: string; chapter: 1 | 2 | 3; kicker: string; title: string; body: string; note?: string; map: MapSpec; hud: Hud; range?: [string, string] };

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
const PHASE_FR: Record<string, string> = { May: 'mai', June: 'juin', July: 'juillet', 'August–September': 'août–septembre', 'October–November': 'octobre–novembre' };
const phaseLabel = (en: string) => L(en, PHASE_FR[en] ?? en);
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
    const last = i === PHASES.length - 1;
    const sEn = fresh.length === 1 ? '' : 's', sFr = fresh.length === 1 ? '' : 's';
    let body = L(`${fresh.length} health zone${sEn} first listed with a confirmed case: ${list(fresh)}.`,
      `${fresh.length} zone${sFr} de santé ${fresh.length === 1 ? 'inscrite' : 'inscrites'} pour la première fois avec un cas confirmé : ${list(fresh)}.`);
    body += newProv.length
      ? L(` Provinces with a first listed case: ${newProv.map(([p, d]) => `${p} (${dateShort(d)})`).join(', ')}.`, ` Provinces nouvellement touchées : ${newProv.map(([p, d]) => `${p} (${dateShort(d)})`).join(', ')}.`)
      : L(' No new province.', ' Aucune nouvelle province.');
    const span = last ? L(`by ${dateShort(LATEST.d)}`, `au ${dateShort(LATEST.d)}`) : L(`by the end of ${phaseLabel(ph.label).split('–').pop()}`, `à la fin de ${phaseLabel(ph.label).split('–').pop()}`);
    body += L(` Total ${span}: ${total} zones in ${provs} province${provs === 1 ? '' : 's'}.`, ` Total ${span} : ${total} zones dans ${provs} province${provs === 1 ? '' : 's'}.`);
    /* zones first listed right after a gap in the series: give the window, grouped by report */
    const groups = new Map<string, number>();
    windowed.forEach((z) => { const k = `${FIRST[z].after}|${FIRST[z].d}`; groups.set(k, (groups.get(k) ?? 0) + 1); });
    const starts = fresh.filter((z) => FIRST[z].atStart);
    const parts = [...groups].map(([k, n]) => { const [a, d] = k.split('|'); return L(`${n} first listed on ${dateShort(d)}, after a report gap from ${dateShort(a)}: first case between those dates`, `${n} inscrite(s) le ${dateShort(d)}, après une interruption depuis le ${dateShort(a)} : premier cas entre ces deux dates`); });
    if (starts.length) parts.push(L(`${andj(starts)} already appear in the first report of the national zone series (${dateShort(FIRST[starts[0]].d)}) and may have had cases earlier`, `${andj(starts)} figure(nt) déjà dans le premier rapport de la série nationale des zones (${dateShort(FIRST[starts[0]].d)}) et pouvai(en)t avoir des cas plus tôt`));
    const note = parts.length ? parts.join('. ') + '.' : undefined;
    /* titles name what the data shows: new provinces, or where the new zones are */
    const where = [...new Set(fresh.map(provOf))];
    const title = i === 0 ? L('Where it started', 'Là où tout a commencé')
      : newProv.length ? L(`Reaching ${andj(newProv.map(([p]) => p))}`, `Jusqu’à ${andj(newProv.map(([p]) => p))}`)
      : L(`More zones in ${andj(where)}`, `Plus de zones en ${andj(where)}`);
    const hud: Hud = { a: { label: L('Health zones listed', 'Zones de santé inscrites'), value: total }, b: { label: L('Provinces reached', 'Provinces atteintes'), value: provs, of: 26 } };
    return { id: `s${i}`, chapter: 1 as const, kicker: `${i + 1} / ${PHASES.length} · ${phaseLabel(ph.label)} 2026`, title, body, note, hud, range: [ph.from, last ? LATEST.d : ph.to] as [string, string], map: { mode: 'spread' as const, phase: i, highlight: fresh.filter((z) => byZone[z]).slice(0, 12), focus: fresh.filter((z) => byZone[z]).length ? fresh.filter((z) => byZone[z]) : ['Bunia'] } };
  });
}

/* ---------------- chapter 2: mobility ---------------- */
const totalMob = (z: string) => MOB[z].tin + MOB[z].tout;
const HUBS = Object.keys(MOB).sort((a, b) => totalMob(b) - totalMob(a)).slice(0, 4);
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
  const kick = L('Mobility · April 2026', 'Mobilité · avril 2026');
  return [
    { id: 'm0', chapter: 2, kicker: kick, title: L(`Movement concentrates in ${HUBS.length} hubs`, `Le mouvement se concentre dans ${HUBS.length} pôles`),
      body: L(`${list(HUBS)} account for the most estimated movement in and out. ${HUBS.map((z) => `${z}: ${fmt(totalMob(z))}`).join(' · ')} relocations. Each also reports confirmed cases: ${HUBS.map((z) => `${z} ${fmt(byZone[z].c)}`).join(', ')}.`,
        `${list(HUBS)} concentrent le plus de mouvement estimé, entrant et sortant. ${HUBS.map((z) => `${z} : ${fmt(totalMob(z))}`).join(' · ')} déplacements. Chacun rapporte aussi des cas confirmés : ${HUBS.map((z) => `${z} ${fmt(byZone[z].c)}`).join(', ')}.`),
      note: L('Flowminder / Vodacom estimated relocations among the mapped health zones, April 2026. Vodacom subscribers only.', 'Déplacements estimés Flowminder / Vodacom entre les zones de santé cartographiées, avril 2026. Abonnés Vodacom uniquement.'),
      hud: { a: { label: L('Relocations, top 4 hubs', 'Déplacements, 4 premiers pôles'), value: HUBS.reduce((a, z) => a + totalMob(z), 0) }, b: { label: L('Zones with mobility data', 'Zones avec données de mobilité'), value: Object.keys(MOB).length, of: ZONES.length } },
      map: { mode: 'mob', highlight: HUBS, focus: HUBS.flatMap((z) => [z, ...MOB[z].in.slice(0, 3).map((f) => f[0])]) } },
    { id: 'm1', chapter: 2, kicker: kick, title: L(`${h1}: the busiest hub`, `${h1} : le pôle le plus actif`),
      body: L(`${fmt(MOB[h1].tin)} estimated arrivals and ${fmt(MOB[h1].tout)} departures. Its largest exchange is with ${MOB[h1].in[0][0]}: ${fmt(MOB[h1].in[0][1])} arrivals from there, ${fmt(MOB[h1].out[0][1])} departures to ${MOB[h1].out[0][0]}.`,
        `${fmt(MOB[h1].tin)} arrivées estimées et ${fmt(MOB[h1].tout)} départs. Son plus gros échange est avec ${MOB[h1].in[0][0]} : ${fmt(MOB[h1].in[0][1])} arrivées de là, ${fmt(MOB[h1].out[0][1])} départs vers ${MOB[h1].out[0][0]}.`),
      hud: { a: { label: L(`Arrivals into ${h1}`, `Arrivées vers ${h1}`), value: MOB[h1].tin }, b: { label: L(`Departures from ${h1}`, `Départs depuis ${h1}`), value: MOB[h1].tout } },
      map: { mode: 'mob', highlight: [h1], flows: flowsOf(h1), focus: [h1, ...flowsOf(h1).flatMap((f) => [f.from, f.to])] } },
    { id: 'm2', chapter: 2, kicker: kick, title: L(`${h2}'s network`, `Le réseau de ${h2}`),
      body: L(`${fmt(MOB[h2].tin)} arrivals and ${fmt(MOB[h2].tout)} departures, mostly with ${list(MOB[h2].in.slice(0, 3).map((f) => f[0]))}.`,
        `${fmt(MOB[h2].tin)} arrivées et ${fmt(MOB[h2].tout)} départs, surtout avec ${list(MOB[h2].in.slice(0, 3).map((f) => f[0]))}.`),
      hud: { a: { label: L(`Arrivals into ${h2}`, `Arrivées vers ${h2}`), value: MOB[h2].tin }, b: { label: L(`Departures from ${h2}`, `Départs depuis ${h2}`), value: MOB[h2].tout } },
      map: { mode: 'mob', highlight: [h2], flows: flowsOf(h2), focus: [h2, ...flowsOf(h2).flatMap((f) => [f.from, f.to])] } },
    { id: 'm3', chapter: 2, kicker: kick, title: L('Few cases, heavy arrivals from high-burden zones', 'Peu de cas, fortes arrivées depuis des zones à forte charge'),
      body: L(`Among zones with fewer than ${LO} confirmed cases, these receive the most estimated arrivals from zones with ${HI} or more: ${top3.map((x) => `${x.z} (${fmt(byZone[x.z].c)} cases, ${fmt(x.inflow)} arrivals)`).join(', ')}. Next: ${list(exposed.slice(3, 8).map((x) => x.z))}.`,
        `Parmi les zones de moins de ${LO} cas confirmés, celles-ci reçoivent le plus d’arrivées estimées depuis des zones de ${HI} cas ou plus : ${top3.map((x) => `${x.z} (${fmt(byZone[x.z].c)} cas, ${fmt(x.inflow)} arrivées)`).join(', ')}. Ensuite : ${list(exposed.slice(3, 8).map((x) => x.z))}.`),
      note: L('Arrivals are April 2026 estimates, not travel during the outbreak. This ranks exposure to movement, not risk of infection; it is not an early-warning level.', 'Les arrivées sont des estimations d’avril 2026, non des déplacements pendant l’épidémie. Ceci classe l’exposition au mouvement, non le risque d’infection ; ce n’est pas un niveau d’alerte précoce.'),
      hud: { a: { label: L(`Arrivals into ${top3.map((x) => x.z).join(', ')}`, `Arrivées vers ${top3.map((x) => x.z).join(', ')}`), value: top3.reduce((a, x) => a + x.inflow, 0) }, b: { label: L(`Zones under ${LO} cases with such arrivals`, `Zones sous ${LO} cas avec de telles arrivées`), value: exposed.length } },
      map: { mode: 'mob', highlight: top3.map((x) => x.z), flows: top3.flatMap((x) => x.from.slice(0, 3).map(([o, v]) => ({ from: o, to: x.z, v, kind: 'in' as const }))), focus: top3.flatMap((x) => [x.z, ...x.from.slice(0, 3).map((f) => f[0])]) } },
    { id: 'm4', chapter: 2, kicker: L('Mobility · what it cannot show', 'Mobilité · ses limites'), title: L('Zones without cases are not in the mobility data', 'Les zones sans cas ne figurent pas dans les données de mobilité'),
      body: L(`The Flowminder release used here covers the ${Object.keys(MOB).length} affected zones it could match, so it cannot show movement into zones that have no cases yet. ${ZONES.length - Object.keys(MOB).length} mapped zones have no coverage, including every zone mapped on or after 8 October.`,
        `La version Flowminder utilisée ici couvre les ${Object.keys(MOB).length} zones touchées qu’elle a pu apparier ; elle ne peut donc pas montrer le mouvement vers les zones encore sans cas. ${ZONES.length - Object.keys(MOB).length} zones cartographiées n’ont aucune couverture, dont toutes celles cartographiées à partir du 8 octobre.`),
      note: L(`Situation as of INSP SitRep N°${LATEST.s}; ${PROV.length} provinces affected.`, `Situation au SitRep INSP N°${LATEST.s} ; ${PROV.length} provinces touchées.`),
      hud: { a: { label: L('Zones with mobility data', 'Zones avec données de mobilité'), value: Object.keys(MOB).length }, b: { label: L('Mapped zones without', 'Zones cartographiées sans'), value: ZONES.length - Object.keys(MOB).length, of: ZONES.length } },
      map: { mode: 'mob', highlight: ZONES.filter((z) => !MOB[z.z]).map((z) => z.z), focus: ZONES.map((z) => z.z) } },
  ];
}

/** Build the briefing steps in the active language (called from the view, which remounts on a language change). */
export function buildSteps(): Step[] { return [...spreadSteps(), ...mobilitySteps(), ...countriesSteps()]; }

/* ---------------- chapter 3: other affected countries, in the order they were affected ----------------
   Figures and dates come straight from each country's own authority (COUNTRIES, from the config).
   The backdrop shows every affected country as a bubble, framed across the region, so the countries
   are on screen while the cards tell the cross-border chronology; each card lights up its own country. */
function countriesSteps(): Step[] {
  const drc = COUNTRIES.find((c) => c.key === 'COD')!;
  const others = COUNTRIES.filter((c) => c.key !== 'COD').sort((a, b) => a.asof.localeCompare(b.asof));
  const regionC = COUNTRIES.reduce((a, c) => a + c.c, 0);
  const regionD = COUNTRIES.reduce((a, c) => a + c.d, 0);
  const allKeys = COUNTRIES.map((c) => c.key);
  const backdrop: MapSpec = { mode: 'countries', highlight: [], focus: allKeys, countries: allKeys };
  const lead: Step = {
    id: 'c0', chapter: 3, kicker: L('Across borders', 'Au-delà des frontières'),
    title: L(`Beyond DR Congo: ${others.length} more countries`, `Au-delà de la RD Congo : ${others.length} autres pays`),
    body: L(`DR Congo is the epicentre — ${fmt(drc.c)} confirmed and ${fmt(drc.d)} deaths (INSP SitRep N°${LATEST.s}). ${others.map((c) => `${cname(c)} (${dateShort(c.asof)}, ${c.st === 'over' ? 'over' : 'active'})`).join(', ')} have each reported confirmed cases to their own health ministry. Across all ${COUNTRIES.length} countries: ${fmt(regionC)} confirmed, ${fmt(regionD)} deaths.`,
      `La RD Congo est l’épicentre — ${fmt(drc.c)} cas confirmés et ${fmt(drc.d)} décès (SitRep INSP N°${LATEST.s}). ${others.map((c) => `${cname(c)} (${dateShort(c.asof)}, ${c.st === 'over' ? 'terminée' : 'active'})`).join(', ')} ont chacun déclaré des cas confirmés à leur propre ministère de la santé. Pour l’ensemble des ${COUNTRIES.length} pays : ${fmt(regionC)} cas confirmés, ${fmt(regionD)} décès.`),
    note: L('Each country reports to its own public-health authority on its own date; the regional total carries no single as-of date.', 'Chaque pays déclare à sa propre autorité de santé publique, à sa propre date ; le total régional ne porte pas de date unique.'),
    hud: { a: { label: L('Countries with cases', 'Pays avec des cas'), value: COUNTRIES.length }, b: { label: L('Regional confirmed', 'Confirmés régionaux'), value: regionC } },
    map: backdrop,
  };
  const perCountry: Step[] = others.map((c, i) => ({
    id: `c${i + 1}`, chapter: 3 as const,
    kicker: `${i + 1} / ${others.length} · ${dateLong(c.asof)}`,
    title: cname(c),
    body: L(`${c.src} reports ${fmt(c.c)} confirmed case${c.c === 1 ? '' : 's'} and ${fmt(c.d)} death${c.d === 1 ? '' : 's'}${c.r != null ? `, ${fmt(c.r)} recovered` : ''}. `
      + (c.st === 'over' ? `Its outbreak was declared over on ${dateShort(c.asof)}; these figures are final.` : `Its outbreak is active as of ${dateShort(c.asof)}; the ministry publishes national figures only, so no area is shown.`),
      `${c.src} rapporte ${fmt(c.c)} cas confirmé${c.c === 1 ? '' : 's'} et ${fmt(c.d)} décès${c.r != null ? `, ${fmt(c.r)} guéris` : ''}. `
      + (c.st === 'over' ? `Son épidémie a été déclarée terminée le ${dateShort(c.asof)} ; ces chiffres sont définitifs.` : `Son épidémie est active au ${dateShort(c.asof)} ; le ministère ne publie que des chiffres nationaux, aucune zone n’est donc affichée.`)),
    note: c.st === 'active' ? L('Active — figures may change. National totals only; no sub-national breakdown is published.', 'Active — les chiffres peuvent évoluer. Totaux nationaux uniquement ; aucune ventilation infranationale n’est publiée.') : undefined,
    hud: { a: { label: L('Confirmed cases', 'Cas confirmés'), value: c.c }, b: { label: L('Deaths', 'Décès'), value: c.d } },
    map: { ...backdrop, highlight: [c.key] },
  }));
  return [lead, ...perCountry];
}
