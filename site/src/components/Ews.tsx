/* Early-warning component. The levels, layout and empty state are final; there are
   no indicators, thresholds or values yet, so nothing is computed or shown as a level. */
import { BellRing, MapPinned } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ZONES } from '@/lib/data';
import { L } from '@/lib/i18n';

export const LEVELS = [
  { id: 'critical', label: ['Critical', 'Critique'], glyph: '◆', meaning: ['A signal to act on', 'Un signal justifiant une action'], cls: 'text-ew-critical border-ew-critical' },
  { id: 'alert', label: ['Alert', 'Alerte'], glyph: '▲', meaning: ['A signal to verify', 'Un signal à vérifier'], cls: 'text-ew-alert border-ew-alert' },
  { id: 'normal', label: ['Normal', 'Normal'], glyph: '●', meaning: ['Assessed, below every threshold', 'Évalué, sous tous les seuils'], cls: 'text-ew-normal border-ew-normal' },
  { id: 'na', label: ['Not assessed', 'Non évalué'], glyph: '○', meaning: ['No indicator values', 'Aucune valeur d’indicateur'], cls: 'text-ink-3 border-ink-3 border-dashed' },
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

const CANDIDATES = [
  [['Event', 'Événement'], ['First confirmed case in a previously unaffected health zone', 'Premier cas confirmé dans une zone de santé jusque-là épargnée']],
  [['Trend', 'Tendance'], ['New confirmed cases over a rolling window', 'Nouveaux cas confirmés sur une fenêtre glissante']],
  [['Trend', 'Tendance'], ['Week-on-week growth in new confirmed cases', 'Croissance d’une semaine sur l’autre des nouveaux cas confirmés']],
  [['Trend', 'Tendance'], ['New case after a quiet period', 'Nouveau cas après une période calme']],
  [['Response', 'Riposte'], ['Share of contacts followed up', 'Part des contacts suivis']],
  [['Response', 'Riposte'], ['Share of deaths occurring in the community', 'Part des décès survenant dans la communauté']],
  [['Exposure', 'Exposition'], ['Inbound mobility from zones with recent cases', 'Mobilité entrante depuis des zones à cas récents']],
] as const;

export function EwsView({ onShowMap }: { onShowMap: () => void }) {
  return (
    <div className="gutter mx-auto max-w-wide py-8 md:py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Badge tone="pending">{L('Not active · no data yet', 'Inactif · pas encore de données')}</Badge>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-ink md:text-4xl">{L('Early warning', 'Alerte précoce')}</h1>
          <p className="mt-2 max-w-xl text-[15px] text-ink-2">{L("Each health zone will be compared with an alert and a critical threshold per indicator. The highest level reached sets the zone's level.", 'Chaque zone de santé sera comparée à un seuil d’alerte et à un seuil critique par indicateur. Le niveau le plus élevé atteint fixe le niveau de la zone.')}</p>
        </div>
        <button onClick={onShowMap} className="inline-flex items-center gap-2 rounded-full border border-rule px-4 py-2 text-sm font-medium text-ink hover:border-accent hover:text-accent"><MapPinned className="h-4 w-4" />{L('Show on the map', 'Voir sur la carte')}</button>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        {LEVELS.map((l) => (
          <div key={l.id} className={`rounded-2xl border-l-4 border border-rule bg-paper p-4 ${l.cls.split(' ').filter((c) => c.startsWith('border')).join(' ')}`}>
            <p className={`text-sm ${l.cls.split(' ')[0]}`}>{l.glyph} {L(l.label[0], l.label[1])}</p>
            <p className="num mt-1 font-mono text-3xl font-semibold text-ink-3">{l.id === 'na' ? ZONES.length : '—'}</p>
            <p className="text-[11.5px] text-ink-3">{L(l.meaning[0], l.meaning[1])}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="rounded-2xl border border-dashed border-ink-3/40 p-6">
          <div className="flex items-center gap-2 text-ink"><BellRing className="h-5 w-5 text-ink-3" /><p className="font-semibold">{L('Zones under warning', 'Zones en alerte')}</p></div>
          <div className="mt-4 space-y-2" aria-hidden>
            {[0, 1, 2].map((i) => <div key={i} className="h-11 rounded-lg bg-paper-2" style={{ opacity: 1 - i * 0.25 }} />)}
          </div>
          <p className="mt-4 text-sm text-ink-2">{L('This list fills in when indicator values and thresholds are supplied. Until then no zone is shown as normal, alert or critical.', 'Cette liste se remplira une fois les valeurs d’indicateurs et les seuils fournis. D’ici là, aucune zone n’est affichée comme normale, en alerte ou critique.')}</p>
        </div>
        <div className="rounded-2xl border border-rule p-6">
          <p className="font-semibold text-ink">{L('Proposed indicators', 'Indicateurs proposés')}</p>
          <p className="mt-1 text-xs text-ink-3">{L('For the epidemiology team to confirm. None is active.', 'À confirmer par l’équipe d’épidémiologie. Aucun n’est actif.')}</p>
          <ul className="mt-3 divide-y divide-rule">
            {CANDIDATES.map(([fam, tx]) => (
              <li key={tx[0]} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2 py-2 text-[13px]"><span className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-3">{L(fam[0], fam[1])}</span><span className="text-ink-2">{L(tx[0], tx[1])}<span className="block text-[11px] text-warn">{L('threshold not set', 'seuil non défini')}</span></span></li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
