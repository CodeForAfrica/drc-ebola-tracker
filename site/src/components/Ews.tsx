/* Early-warning component. Levels are now computed from the per-zone cumulative
   series (src/data/ews.json, produced by scripts/ews.cjs — see early_warning/RULES.md).
   These are automated signals from reported SitRep counts with provisional thresholds,
   pending the epidemiology team's own indicators. No value is typed here. */
import { BellRing, MapPinned, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { LATEST, fmt, dateLong } from '@/lib/data';
import { L } from '@/lib/i18n';
import ews from '@/data/ews.json';

type Level = 'critical' | 'alert' | 'normal' | 'na';
type ZoneRow = { z: string; p: string; level: Level; rolling: number; since: number | null; flags: string[] };
const EWS = ews as unknown as {
  asof: string; sitrep: string;
  params: { WINDOW_DAYS: number; RISE_ALERT: number; RISE_CRIT: number; NEWZONE_DAYS: number; QUIET_DAYS: number; RESURG_DAYS: number };
  counts: Record<Level, number>; total: number; zones: ZoneRow[];
  indicators: { family: string; name: string; active: boolean; threshold?: string; current?: number; note?: string }[];
};

export const LEVELS = [
  { id: 'critical', label: ['Critical', 'Critique'], glyph: '◆', meaning: ['A signal to act on', 'Un signal justifiant une action'], cls: 'text-ew-critical border-ew-critical' },
  { id: 'alert', label: ['Alert', 'Alerte'], glyph: '▲', meaning: ['A signal to verify', 'Un signal à vérifier'], cls: 'text-ew-alert border-ew-alert' },
  { id: 'normal', label: ['Normal', 'Normal'], glyph: '●', meaning: ['Assessed, below every threshold', 'Évalué, sous tous les seuils'], cls: 'text-ew-normal border-ew-normal' },
  { id: 'na', label: ['Not assessed', 'Non évalué'], glyph: '○', meaning: ['No assessable signal', 'Aucun signal évaluable'], cls: 'text-ink-3 border-ink-3 border-dashed' },
] as const;

export function EwsLevels({ compact }: { compact?: boolean }) {
  return (
    <ul className={compact ? 'mt-1.5 space-y-1' : 'grid grid-cols-2 gap-1.5'}>
      {LEVELS.map((l) => (
        <li key={l.id} className="flex items-center gap-2 text-[11.5px] text-ink-2"><span className={`grid h-4 w-4 place-items-center rounded border text-[9px] ${l.cls}`}>{l.glyph}</span>{L(l.label[0], l.label[1])}</li>
      ))}
    </ul>
  );
}

/* localized EN/FR for each indicator name and the "why" tags on a flagged zone */
const IND_FR: Record<string, string> = {
  'First confirmed case in a previously unaffected health zone': 'Premier cas confirmé dans une zone de santé jusque-là épargnée',
  'New confirmed cases over a rolling window': 'Nouveaux cas confirmés sur une fenêtre glissante',
  'New case after a quiet period': 'Nouveau cas après une période calme',
  'Week-on-week growth in new confirmed cases': 'Croissance d’une semaine sur l’autre des nouveaux cas confirmés',
  'Share of contacts followed up': 'Part des contacts suivis',
  'Share of deaths occurring in the community': 'Part des décès survenant dans la communauté',
  'Inbound mobility from zones with recent cases': 'Mobilité entrante depuis des zones à cas récents',
};
const FAM_FR: Record<string, string> = { Event: 'Événement', Trend: 'Tendance', Response: 'Riposte', Exposure: 'Exposition' };
const NOTE_FR: Record<string, string> = {
  'national only': 'national uniquement',
  'not in the per-zone series': 'absent de la série par zone',
  'Flowminder April 2026': 'Flowminder avril 2026',
};
const levelOf = (id: string) => LEVELS.find((l) => l.id === id)!;

/* localized threshold label for an active indicator, built from the computed params */
function thresholdLabel(name: string): string {
  const P = EWS.params;
  if (name.startsWith('First confirmed case')) return L(`within ${P.NEWZONE_DAYS} days`, `sous ${P.NEWZONE_DAYS} jours`);
  if (name.startsWith('New confirmed cases')) return L(`${P.WINDOW_DAYS}-day new cases ≥ ${P.RISE_ALERT} (alert) / ≥ ${P.RISE_CRIT} (critical)`, `nouveaux cas sur ${P.WINDOW_DAYS} jours ≥ ${P.RISE_ALERT} (alerte) / ≥ ${P.RISE_CRIT} (critique)`);
  if (name.startsWith('New case after')) return L(`≥ ${P.QUIET_DAYS} quiet days, within ${P.RESURG_DAYS} days`, `≥ ${P.QUIET_DAYS} jours calmes, sous ${P.RESURG_DAYS} jours`);
  return '';
}

function Why({ z }: { z: ZoneRow }) {
  const P = EWS.params;
  const tags: string[] = [];
  if (z.flags.includes('rise')) tags.push(L(`${fmt(z.rolling)} new in ${P.WINDOW_DAYS} days`, `${fmt(z.rolling)} nouveaux en ${P.WINDOW_DAYS} jours`));
  if (z.flags.includes('newzone')) tags.push(L(`newly affected${z.since != null ? ` (${z.since}d)` : ''}`, `nouvellement touchée${z.since != null ? ` (${z.since} j)` : ''}`));
  if (z.flags.includes('resurgence')) tags.push(L('case after a quiet period', 'cas après une période calme'));
  return <span className="text-[11.5px] text-ink-3">{tags.join(' · ')}</span>;
}

export function EwsView({ onShowMap }: { onShowMap: () => void }) {
  const warning = EWS.zones.filter((z) => z.level === 'critical' || z.level === 'alert');
  return (
    <div className="gutter mx-auto max-w-wide py-8 md:py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Badge tone="active">{L('Automated signals', 'Signaux automatisés')} · SitRep N°{EWS.sitrep}</Badge>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-ink md:text-4xl">{L('Early warning', 'Alerte précoce')}</h1>
          <p className="mt-2 max-w-2xl text-[15px] text-ink-2">{L(`Each health zone is compared with an alert and a critical threshold per indicator; the highest level reached sets the zone's level. These are automated signals from the reported SitRep counts, with provisional thresholds, to be confirmed by the epidemiology team.`, 'Chaque zone de santé est comparée à un seuil d’alerte et à un seuil critique par indicateur ; le niveau le plus élevé atteint fixe le niveau de la zone. Ce sont des signaux automatisés issus des chiffres rapportés des SitRep, avec des seuils provisoires, à confirmer par l’équipe d’épidémiologie.')}</p>
          <p className="mt-1 text-xs text-ink-3">{L('As of', 'Au')} {dateLong(EWS.asof)} · {EWS.total} {L('reported health zones', 'zones de santé rapportées')}</p>
        </div>
        <button onClick={onShowMap} className="inline-flex items-center gap-2 rounded-full border border-rule px-4 py-2 text-sm font-medium text-ink hover:border-accent hover:text-accent"><MapPinned className="h-4 w-4" />{L('Show on the map', 'Voir sur la carte')}</button>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        {LEVELS.map((l) => (
          <div key={l.id} className={`rounded-2xl border-l-4 border border-rule bg-paper p-4 ${l.cls.split(' ').filter((c) => c.startsWith('border')).join(' ')}`}>
            <p className={`text-sm ${l.cls.split(' ')[0]}`}>{l.glyph} {L(l.label[0], l.label[1])}</p>
            <p className={`num mt-1 font-mono text-3xl font-semibold ${EWS.counts[l.id] ? l.cls.split(' ')[0] : 'text-ink-3'}`}>{fmt(EWS.counts[l.id])}</p>
            <p className="text-[11.5px] text-ink-3">{L(l.meaning[0], l.meaning[1])}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="rounded-2xl border border-rule p-6">
          <div className="flex items-center gap-2 text-ink"><BellRing className="h-5 w-5 text-ink-3" /><p className="font-semibold">{L('Zones under warning', 'Zones en alerte')}</p></div>
          {warning.length ? (
            <ul className="mt-4 divide-y divide-rule">
              {warning.map((z) => {
                const lv = levelOf(z.level);
                return (
                  <li key={z.z} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span className={`grid h-6 w-6 flex-none place-items-center rounded-lg border text-[11px] ${lv.cls}`}>{lv.glyph}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-[14px] font-medium text-ink">{z.z} <span className="font-normal text-ink-3">· {z.p}</span></span>
                        <Why z={z} />
                      </span>
                    </span>
                    <Badge tone={z.level === 'critical' ? 'over' : 'active'}>{L(lv.label[0], lv.label[1])}</Badge>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-ink-2">{L('No zone is above an alert threshold on the latest report.', 'Aucune zone au-dessus d’un seuil d’alerte sur le dernier rapport.')}</p>
          )}
          <p className="mt-4 flex items-start gap-1.5 text-[11.5px] text-warn"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" aria-hidden />{L('Automated signals from reported counts; verify against WHO before publishing.', 'Signaux automatisés issus des chiffres rapportés ; vérifier auprès de l’OMS avant publication.')}</p>
        </div>

        <div className="rounded-2xl border border-rule p-6">
          <p className="font-semibold text-ink">{L('Indicators', 'Indicateurs')}</p>
          <p className="mt-1 text-xs text-ink-3">{L('Active indicators compute now; the rest await epidemiology-team thresholds or data.', 'Les indicateurs actifs sont calculés ; les autres attendent les seuils ou les données de l’équipe d’épidémiologie.')}</p>
          <ul className="mt-3 divide-y divide-rule">
            {EWS.indicators.map((ind) => (
              <li key={ind.name} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2 py-2 text-[13px]">
                <span className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-3">{L(ind.family, FAM_FR[ind.family] || ind.family)}</span>
                <span className="text-ink-2">
                  {L(ind.name, IND_FR[ind.name] || ind.name)}
                  {ind.active ? (
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[10.5px] font-medium text-accent">{L('active', 'actif')}</span>
                      <span className="text-[11px] text-ink-3">{thresholdLabel(ind.name)}</span>
                      {ind.current != null && <span className="text-[11px] font-medium text-ink-2">· {ind.current} {L('zone(s)', 'zone(s)')}</span>}
                    </span>
                  ) : (
                    <span className="block text-[11px] text-ink-3">{L('threshold not set', 'seuil non défini')}{ind.note ? ` (${L(ind.note, NOTE_FR[ind.note] || ind.note)})` : ''}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="mt-6 text-[11px] text-ink-3">{L('Method: computed from the per-zone cumulative series by scripts/ews.cjs; see early_warning/RULES.md. Dates are report dates; only confirmed cases are used.', 'Méthode : calculé à partir de la série cumulée par zone par scripts/ews.cjs ; voir early_warning/RULES.md. Les dates sont des dates de rapport ; seuls les cas confirmés sont utilisés.')} · {L('Dashboard data', 'Données du tableau de bord')} N°{LATEST.s}.</p>
    </div>
  );
}
