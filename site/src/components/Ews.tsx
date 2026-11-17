/* Early-warning component. The levels, layout and empty state are final; there are
   no indicators, thresholds or values yet, so nothing is computed or shown as a level. */
import { BellRing, MapPinned } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ZONES } from '@/lib/data';

export const LEVELS = [
  { id: 'critical', label: 'Critical', glyph: '◆', meaning: 'A signal to act on', cls: 'text-ew-critical border-ew-critical' },
  { id: 'alert', label: 'Alert', glyph: '▲', meaning: 'A signal to verify', cls: 'text-ew-alert border-ew-alert' },
  { id: 'normal', label: 'Normal', glyph: '●', meaning: 'Assessed, below every threshold', cls: 'text-ew-normal border-ew-normal' },
  { id: 'na', label: 'Not assessed', glyph: '○', meaning: 'No indicator values', cls: 'text-ink-3 border-ink-3 border-dashed' },
] as const;

export function EwsLevels({ compact }: { compact?: boolean }) {
  return (
    <ul className={compact ? 'mt-1.5 space-y-1' : 'grid grid-cols-2 gap-1.5'}>
      {LEVELS.map((l) => (
        <li key={l.id} className="flex items-center gap-2 text-[11.5px] text-ink-2"><span className={`grid h-4 w-4 place-items-center rounded border text-[9px] ${l.cls}`}>{l.glyph}</span>{l.label}</li>
      ))}
    </ul>
  );
}

const CANDIDATES = [
  ['Event', 'First confirmed case in a previously unaffected health zone'],
  ['Trend', 'New confirmed cases over a rolling window'],
  ['Trend', 'Week-on-week growth in new confirmed cases'],
  ['Trend', 'New case after a quiet period'],
  ['Response', 'Share of contacts followed up'],
  ['Response', 'Share of deaths occurring in the community'],
  ['Exposure', 'Inbound mobility from zones with recent cases'],
] as const;

export function EwsView({ onShowMap }: { onShowMap: () => void }) {
  return (
    <div className="gutter mx-auto max-w-wide py-8 md:py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Badge tone="pending">Not active · no data yet</Badge>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-ink md:text-4xl">Early warning</h1>
          <p className="mt-2 max-w-xl text-[15px] text-ink-2">Each health zone will be compared with an alert and a critical threshold per indicator. The highest level reached sets the zone's level.</p>
        </div>
        <button onClick={onShowMap} className="inline-flex items-center gap-2 rounded-full border border-rule px-4 py-2 text-sm font-medium text-ink hover:border-accent hover:text-accent"><MapPinned className="h-4 w-4" />Show on the map</button>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        {LEVELS.map((l) => (
          <div key={l.id} className={`rounded-2xl border-l-4 border border-rule bg-paper p-4 ${l.cls.split(' ').filter((c) => c.startsWith('border')).join(' ')}`}>
            <p className={`text-sm ${l.cls.split(' ')[0]}`}>{l.glyph} {l.label}</p>
            <p className="num mt-1 font-mono text-3xl font-semibold text-ink-3">{l.id === 'na' ? ZONES.length : '—'}</p>
            <p className="text-[11.5px] text-ink-3">{l.meaning}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="rounded-2xl border border-dashed border-ink-3/40 p-6">
          <div className="flex items-center gap-2 text-ink"><BellRing className="h-5 w-5 text-ink-3" /><p className="font-semibold">Zones under warning</p></div>
          <div className="mt-4 space-y-2" aria-hidden>
            {[0, 1, 2].map((i) => <div key={i} className="h-11 rounded-lg bg-paper-2" style={{ opacity: 1 - i * 0.25 }} />)}
          </div>
          <p className="mt-4 text-sm text-ink-2">This list fills in when indicator values and thresholds are supplied. Until then no zone is shown as normal, alert or critical.</p>
        </div>
        <div className="rounded-2xl border border-rule p-6">
          <p className="font-semibold text-ink">Proposed indicators</p>
          <p className="mt-1 text-xs text-ink-3">For the epidemiology team to confirm. None is active.</p>
          <ul className="mt-3 divide-y divide-rule">
            {CANDIDATES.map(([fam, t]) => (
              <li key={t} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2 py-2 text-[13px]"><span className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-3">{fam}</span><span className="text-ink-2">{t}<span className="block text-[11px] text-warn">threshold not set</span></span></li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
