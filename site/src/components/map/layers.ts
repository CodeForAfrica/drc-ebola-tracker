/* Map layers and their classes. Class breaks are a presentation choice and are
   printed in the legend; values come straight from the data module. */
import { MOB, ZONES } from '@/lib/data';
import { getLang } from '@/lib/i18n';

export type LayerKey = 'c' | 'k' | 'd' | 'mob' | 'ews';
export type Dir = 'in' | 'out' | 'all';
type Layer = { label: string; short: string; breaks: number[]; ramp: string[]; note: string };

const RED = ['--r1', '--r2', '--r3', '--r4', '--r5', '--r6'];
const TEAL = ['--m1', '--m2', '--m3', '--m4', '--m5', '--m6'];

export const LAYERS: Record<LayerKey, Layer> = {
  c: { label: 'Confirmed cases', short: 'Cases', breaks: [1, 10, 50, 100, 500, 1000], ramp: RED, note: 'Cumulative, INSP' },
  k: { label: 'Cases per 100,000', short: 'Per 100k', breaks: [0.1, 10, 50, 100, 250, 500], ramp: RED, note: 'v1 shapefile population' },
  d: { label: 'Deaths', short: 'Deaths', breaks: [1, 10, 50, 100, 250, 500], ramp: RED, note: 'Zone-level; 493 Ituri deaths unassigned' },
  mob: { label: 'Mobility', short: 'Mobility', breaks: [1, 250, 1000, 2500, 5000, 10000], ramp: TEAL, note: 'Flowminder / Vodacom, April 2026' },
  ews: { label: 'Early warning', short: 'Early warning', breaks: [], ramp: [], note: 'Not active yet' },
};

/* French labels/notes for the layer picker and legend (data stays in LAYERS). */
const TXT: Record<LayerKey, { short: [string, string]; label: [string, string]; note: [string, string] }> = {
  c: { short: ['Cases', 'Cas'], label: ['Confirmed cases', 'Cas confirmés'], note: ['Cumulative, INSP', 'Cumulé, INSP'] },
  k: { short: ['Per 100k', 'Pour 100k'], label: ['Cases per 100,000', 'Cas pour 100 000'], note: ['v1 shapefile population', 'population shapefile v1'] },
  d: { short: ['Deaths', 'Décès'], label: ['Deaths', 'Décès'], note: ['Zone-level; 493 Ituri deaths unassigned', 'Au niveau zone ; 493 décès de l’Ituri non attribués'] },
  mob: { short: ['Mobility', 'Mobilité'], label: ['Mobility', 'Mobilité'], note: ['Flowminder / Vodacom, April 2026', 'Flowminder / Vodacom, avril 2026'] },
  ews: { short: ['Early warning', 'Alerte précoce'], label: ['Early warning', 'Alerte précoce'], note: ['Not active yet', 'Pas encore actif'] },
};
const idx = () => (getLang() === 'fr' ? 1 : 0);
export const layerShort = (k: LayerKey) => TXT[k].short[idx()];
export const layerLabel = (k: LayerKey) => TXT[k].label[idx()];
export const layerNote = (k: LayerKey) => TXT[k].note[idx()];

const byZone = Object.fromEntries(ZONES.map((z) => [z.z, z]));

export function zoneValue(ly: LayerKey, dir: Dir, n: string): number | null {
  const z = byZone[n]; if (!z) return null;
  if (ly === 'mob') { const m = MOB[n]; if (!m) return null; return dir === 'in' ? m.tin : dir === 'out' ? m.tout : m.tin + m.tout; }
  if (ly === 'ews') return null;
  return z[ly];
}

/** 'na' = no value (drawn hatched/dashed, never as zero), 'zero' = a reported zero, or a class index 0–5 */
export function classOf(ly: LayerKey, dir: Dir, n: string): 'na' | 'zero' | number {
  const v = zoneValue(ly, dir, n);
  if (v == null) return 'na';
  const b = LAYERS[ly].breaks;
  if (v < b[0]) return 'zero';
  let i = 0; while (i < b.length - 1 && v >= b[i + 1]) i++;
  return i;
}
