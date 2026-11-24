import { useMemo, useRef, useState } from 'react';
import { ArrowLeft, Search, X, Info } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts';
import { OutbreakMap, type MapApi } from '@/components/map/OutbreakMap';
import { LAYERS, layerShort, layerLabel, layerNote, type LayerKey, type Dir, zoneValue } from '@/components/map/layers';
import { Badge } from '@/components/ui/badge';
import { EwsLevels } from '@/components/Ews';
import { ADMIN1, COUNTRIES, DAILY, EWS, LATEST, MOB, PROV, ZONES, UNASSIGNED_DEATHS, cname, str, fmt, pct, share, zoneSeries, dateShort, dateLong, type Zone } from '@/lib/data';
import { L } from '@/lib/i18n';

const byZone = Object.fromEntries(ZONES.map((z) => [z.z, z]));
const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(' ');

export function MapView({ layer, setLayer, dir, setDir, sel, setSel, country, setCountry }: {
  layer: LayerKey; setLayer: (l: LayerKey) => void; dir: Dir; setDir: (d: Dir) => void; sel: string | null; setSel: (s: string | null) => void;
  country: string; setCountry: (c: string) => void;
}) {
  const api = useRef<MapApi | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; html: string } | null>(null);
  const pick = (n: string | null) => { if (n) { setCountry('COD'); setSel(n); setTimeout(() => api.current?.flyToZone(byZone[n]), country === 'COD' ? 0 : 1100); } else setSel(null); };
  const zoneLayers = country === 'COD';

  return (
    <div className="relative grid h-[calc(100dvh-3.5rem)] grid-rows-[minmax(22rem,58dvh)_auto] lg:grid-cols-[minmax(0,1fr)_24rem] lg:grid-rows-1">
      <div className="relative min-h-0">
        <OutbreakMap layer={layer} dir={dir} sel={sel} country={country} onSelect={(n) => setSel(n)} onCountry={(k) => { setSel(null); setCountry(k); }} onTip={setTip} apiRef={api} />
        {/* floating controls */}
        <div className="pointer-events-none absolute inset-x-3 top-3 z-[500] flex flex-wrap items-start gap-2">
          <ZoneSearch onPick={(n) => pick(n)} />
          <div role="group" aria-label={L('Map layer', 'Couche de la carte')} className="pointer-events-auto flex max-w-full overflow-x-auto rounded-full border border-rule bg-paper/95 p-1 shadow-sm backdrop-blur">
            {(Object.keys(LAYERS) as LayerKey[]).map((k) => (
              <button key={k} aria-pressed={zoneLayers && layer === k} title={zoneLayers ? undefined : L('Opens DR Congo, the only country with health-zone figures', 'Ouvre la RD Congo, seul pays avec des chiffres par zone de santé')} onClick={() => setLayer(k)}
                className="whitespace-nowrap rounded-full px-3 py-1.5 text-[12.5px] font-medium text-ink-2 hover:text-ink aria-pressed:bg-ink aria-pressed:text-paper disabled:opacity-40">
                {layerShort(k)}
              </button>
            ))}
          </div>
          {zoneLayers && layer === 'mob' && (
            <div role="group" aria-label={L('Flow direction', 'Sens des flux')} className="pointer-events-auto flex rounded-full border border-rule bg-paper/95 p-1 shadow-sm">
              {(['in', 'out', 'all'] as Dir[]).map((d) => (
                <button key={d} aria-pressed={dir === d} onClick={() => setDir(d)} className="rounded-full px-3 py-1.5 text-[12.5px] font-medium text-ink-2 aria-pressed:bg-paper-3 aria-pressed:text-ink">
                  {d === 'in' ? L('→ In', '→ Entrées') : d === 'out' ? L('Out →', 'Sorties →') : L('Both', 'Les deux')}
                </button>
              ))}
            </div>
          )}
          <CountryPicker country={country} onChange={(k) => { setSel(null); setCountry(k); }} />
        </div>
        <Legend layer={layer} dir={dir} country={country} sel={sel} />
        {tip && <div role="tooltip" className="maptip" style={{ left: Math.min(tip.x + 14, window.innerWidth - 260), top: tip.y + 14 }} dangerouslySetInnerHTML={{ __html: tip.html }} />}
      </div>
      <aside className="min-h-0 overflow-y-auto border-t border-rule bg-paper lg:border-l lg:border-t-0" aria-live="polite">
        {sel ? <ZonePanel z={byZone[sel]} layer={layer} onBack={() => setSel(null)} />
          : country === 'all' ? <AllCountries onPick={(k) => setCountry(k)} />
          : country === 'COD' ? <Overview layer={layer} dir={dir} onPick={pick} onBack={() => setCountry('all')} />
          : <CountryPanel k={country} onBack={() => setCountry('all')} />}
      </aside>
    </div>
  );
}

/* ---------------- search ---------------- */
function ZoneSearch({ onPick }: { onPick: (n: string) => void }) {
  const [q, setQ] = useState('');
  const hits = useMemo(() => { const s = q.trim().toLowerCase(); return s ? ZONES.filter((z) => z.z.toLowerCase().includes(s) || z.p.toLowerCase().includes(s)).slice(0, 7) : []; }, [q]);
  return (
    <div className="pointer-events-auto relative w-full sm:w-60">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
      <input id="zone-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={L('Find a health zone', 'Rechercher une zone')} aria-label={L('Find a health zone', 'Rechercher une zone de santé')}
        onKeyDown={(e) => { if (e.key === 'Enter' && hits[0]) { onPick(hits[0].z); setQ(''); } }}
        className="h-10 w-full rounded-full border border-rule bg-paper/95 pl-9 pr-8 text-[13px] text-ink shadow-sm outline-none backdrop-blur placeholder:text-ink-3 focus:border-accent" />
      {q && <button aria-label={L('Clear', 'Effacer')} onClick={() => setQ('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-3"><X className="h-4 w-4" /></button>}
      {hits.length > 0 && (
        <ul className="absolute mt-1 w-full overflow-hidden rounded-xl border border-rule bg-paper py-1 shadow-lg">
          {hits.map((z) => <li key={z.z}><button onClick={() => { onPick(z.z); setQ(''); }} className="flex w-full justify-between px-3 py-1.5 text-left text-[13px] hover:bg-paper-2"><span className="text-ink">{z.z}</span><span className="text-ink-3">{z.p}</span></button></li>)}
        </ul>
      )}
    </div>
  );
}

/* ---------------- legend ---------------- */
function Legend({ layer, dir, country, sel }: { layer: LayerKey; dir: Dir; country: string; sel: string | null }) {
  const L0 = LAYERS[layer];
  /* folded by default on phones so the map stays visible */
  const [open, setOpen] = useState(() => !matchMedia('(max-width: 767px)').matches);
  if (!open) return <button onClick={() => setOpen(true)} className="absolute bottom-7 md:bottom-3 left-3 z-[500] rounded-full border border-rule bg-paper/95 px-3 py-1.5 text-xs font-medium text-ink shadow-sm">{L('Legend', 'Légende')} ▴</button>;
  return (
    <div className="absolute bottom-3 left-3 z-[500] w-52 rounded-xl border border-rule bg-paper/95 p-3 text-[11px] text-ink-2 shadow-sm backdrop-blur md:w-56">
      <button onClick={() => setOpen(false)} aria-label={L('Hide legend', 'Masquer la légende')} className="absolute right-2 top-1.5 text-ink-3 md:hidden">▾</button>
      {country !== 'COD' ? (
        <>
          <p className="font-semibold text-ink">{L('Countries', 'Pays')}</p>
          <div className="mt-1.5 flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-st-active" />{L('Active outbreak · size = cases', 'Épidémie active · taille = cas')}</div>
          <div className="mt-1 flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-st-over" />{L('Declared over', 'Déclarée terminée')}</div>
          {country !== 'all' && country !== 'Uganda' && <div className="mt-1 flex items-center gap-2"><span className="h-3 w-3 rounded-sm border border-dashed border-ink-3" />{country === 'Kenya' ? L('County', 'Comté') : L('State', 'État')}: {L('no figures published', 'aucun chiffre publié')}</div>}
          <p className="mt-2 text-ink-3">{country === 'all' ? L('Click a bubble to open a country', 'Cliquer sur une bulle pour ouvrir un pays') : L('National total only', 'Total national uniquement')}</p>
        </>
      ) : layer === 'ews' ? (
        <><p className="font-semibold text-ink">{L('Early-warning level', 'Niveau d’alerte précoce')}</p><EwsLevels compact /><p className="mt-2 text-ink-3">{L('Automated signals · provisional thresholds', 'Signaux automatisés · seuils provisoires')}</p></>
      ) : (
        <>
          <p className="font-semibold text-ink">{layerLabel(layer)}{layer === 'mob' ? ` · ${dir === 'in' ? L('arrivals', 'arrivées') : dir === 'out' ? L('departures', 'départs') : L('arrivals + departures', 'arrivées + départs')}` : ''}</p>
          <div className="mt-2 flex">{L0.ramp.map((r) => <span key={r} className="h-2.5 flex-1 first:rounded-l last:rounded-r" style={{ background: `var(${r})` }} />)}</div>
          <div className="num mt-1 flex justify-between font-mono text-[10px] text-ink-3">{L0.breaks.map((x, i) => <span key={i}>{x < 1 ? '>0' : x >= 1000 ? `${x / 1000}k` : x}</span>)}</div>
          <div className="mt-2 flex items-center gap-2"><span className="h-3 w-3 rounded-sm border border-dashed border-ink-3" />{layer === 'mob' ? L('No Flowminder coverage', 'Pas de couverture Flowminder') : L('No data', 'Pas de données')}</div>
          <div className="mt-1 flex items-center gap-2"><span className="h-3 w-3 rounded-sm" style={{ background: 'rgb(var(--st-none) / .6)' }} />{L('Province, no confirmed case', 'Province, aucun cas confirmé')}</div>
          {layer === 'mob' && sel && <div className="mt-2 space-y-1 border-t border-rule pt-2"><div className="flex items-center gap-2"><span className="h-0.5 w-5 bg-flow-in" />{L('Into', 'Vers')} {sel}</div><div className="flex items-center gap-2"><span className="h-0.5 w-5 bg-flow-out" />{L('Out of', 'Depuis')} {sel}</div><p className="text-ink-3">{L('Top 5 each way · same width for all', 'Top 5 dans chaque sens · même largeur pour tous')}</p></div>}
          <p className="mt-2 text-ink-3">{layerNote(layer)}</p>
        </>
      )}
    </div>
  );
}

/* ---------------- sidebar: overview ---------------- */
const STAT = 'rounded-xl bg-paper-2 px-3 py-2.5';
function Overview({ layer, dir, onPick, onBack }: { layer: LayerKey; dir: Dir; onPick: (n: string) => void; onBack: () => void }) {
  const day = DAILY[DAILY.length - 1];
  const ranked = useMemo(() => ZONES.map((z) => ({ z, v: zoneValue(layer === 'ews' ? 'c' : layer, dir, z.z) })).filter((r) => r.v != null).sort((a, b) => (b.v ?? 0) - (a.v ?? 0)).slice(0, 6), [layer, dir]);
  const max = ranked[0]?.v ?? 1;
  return (
    <div className="space-y-5 p-4 md:p-5">
      <div>
        <BackLink onClick={onBack} label={L('All countries', 'Tous les pays')} />
        <p className="mt-2 text-[11px] font-semibold uppercase tracking-[.12em] text-ink-3">{L('DR Congo', 'RD Congo')} · INSP SitRep N°{LATEST.s} · {dateShort(LATEST.d)}</p>
        <p className="mt-1 text-[11px] text-warn xl:hidden">⚠ {L('Verify against WHO before publishing', 'Vérifier auprès de l’OMS avant publication')}</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div className={STAT}><p className="text-[11px] text-ink-3">{L('Confirmed cases', 'Cas confirmés')}</p><p className="num font-mono text-2xl font-semibold text-case">{fmt(LATEST.c)}</p><p className="text-[10.5px] text-ink-3">{L('cumulative', 'cumulé')} · +{fmt(day.nc)} {L('this report', 'ce rapport')}</p></div>
          <div className={STAT}><p className="text-[11px] text-ink-3">{L('Deaths', 'Décès')}</p><p className="num font-mono text-2xl font-semibold text-death">{fmt(LATEST.dd)}</p><p className="text-[10.5px] text-ink-3">{L('cumulative', 'cumulé')} · +{fmt(day.nd)} {L('this report', 'ce rapport')}</p></div>
        </div>
        <div className="mt-2 grid grid-cols-4 gap-2 text-center">
          {[[L('CFR', 'Létalité'), `${LATEST.cfr}%`], [L('Recovered', 'Guéris'), fmt(LATEST.rec)], [L('Isolated', 'Isolés'), fmt(LATEST.iso)], [L('Contacts seen', 'Contacts vus'), `${LATEST.ct}%`]].map(([l, v]) => (
            <div key={l} className="rounded-lg border border-rule px-1 py-2"><p className="num font-mono text-[13.5px] font-semibold text-ink">{v}</p><p className="text-[10px] leading-tight text-ink-3">{l}</p></div>
          ))}
        </div>
      </div>

      <Insight layer={layer} dir={dir} />

      {layer === 'ews' ? (
        <div className="rounded-xl border border-ink-3/40 p-4">
          <p className="text-sm font-semibold text-ink">{L('Early warning', 'Alerte précoce')} <span className="font-normal text-ink-3">· N°{EWS.sitrep}</span></p>
          <p className="mt-1 text-xs text-ink-2">{L('Automated signals from reported counts, with provisional thresholds.', 'Signaux automatisés issus des chiffres rapportés, avec des seuils provisoires.')}</p>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px]">
            <span className="text-ew-critical">◆ {EWS.counts.critical} {L('critical', 'critique')}</span>
            <span className="text-ew-alert">▲ {EWS.counts.alert} {L('alert', 'alerte')}</span>
            <span className="text-ew-normal">● {EWS.counts.normal} {L('normal', 'normal')}</span>
          </div>
          <a href="#early-warning" className="mt-3 inline-block text-xs font-medium text-accent hover:underline">{L('Open early warning →', 'Ouvrir l’alerte précoce →')}</a>
        </div>
      ) : (
        <div>
          <p className="text-[13px] font-semibold text-ink">{layer === 'mob' ? (dir === 'out' ? L('Most departures', 'Plus de départs') : dir === 'in' ? L('Most arrivals', 'Plus d’arrivées') : L('Most movement', 'Plus de mouvement')) : `${L('Top zones ·', 'Principales zones ·')} ${layerLabel(layer).toLowerCase()}`}</p>
          <ol className="mt-2 space-y-1">
            {ranked.map(({ z, v }, i) => (
              <li key={z.z}><button onClick={() => onPick(z.z)} className="group grid w-full grid-cols-[1rem_minmax(0,1fr)_4rem] items-center gap-2 rounded-lg px-1 py-1 text-left hover:bg-paper-2">
                <span className="num font-mono text-[10.5px] text-ink-3">{i + 1}</span>
                <span className="min-w-0"><span className="block truncate text-[13px] font-medium text-ink group-hover:text-accent">{z.z}</span>
                  <span className="mt-1 block h-1 rounded-full bg-paper-3"><span className="block h-full rounded-full" style={{ width: `${((v ?? 0) / (max ?? 1)) * 100}%`, background: layer === 'mob' ? 'rgb(var(--flow-in))' : layer === 'd' ? 'rgb(var(--death))' : 'rgb(var(--case))' }} /></span></span>
                <span className="num text-right font-mono text-[12px] text-ink">{fmt(v ?? 0)}</span>
              </button></li>
            ))}
          </ol>
          {layer === 'mob' && <p className="mt-2 text-[11px] leading-snug text-ink-3">{str('mob_note')}</p>}
        </div>
      )}

      <div>
        <p className="text-[13px] font-semibold text-ink">{L('Provinces', 'Provinces')}</p>
        <table className="mt-1 w-full text-[12px]">
          <tbody>{PROV.map((p) => (
            <tr key={p.p} className="border-t border-rule"><td className="py-1.5 text-ink">{p.p}</td><td className="num text-right font-mono text-case">{fmt(p.c)}</td><td className="num w-14 text-right font-mono text-death">{fmt(p.d)}</td><td className="num w-12 text-right font-mono text-ink-3">{p.zt}/{p.zn}</td></tr>
          ))}</tbody>
        </table>
        <p className="mt-1 text-[10.5px] text-ink-3">{L('Cases · deaths · zones affected, as printed by INSP', 'Cas · décès · zones touchées, tels qu’imprimés par l’INSP')}</p>
      </div>

      <div>
        <p className="text-[13px] font-semibold text-ink">{L('Other countries', 'Autres pays')}</p>
        <ul className="mt-1">{COUNTRIES.slice(1).map((c) => (
          <li key={c.key} className="flex items-center justify-between border-t border-rule py-1.5 text-[12px]">
            <span className="flex items-center gap-2 text-ink"><span className={cx('h-2 w-2 rounded-full', c.st === 'active' ? 'bg-st-active' : 'bg-st-over')} />{cname(c)}</span>
            <span className="num font-mono text-ink-2">{fmt(c.c)} / {fmt(c.d)} <span className="ml-1 font-sans text-[10.5px] text-ink-3">{dateShort(c.asof)}</span></span>
          </li>))}</ul>
        <a href="#countries" className="mt-1 inline-block text-xs font-medium text-accent hover:underline">{L('Country profiles →', 'Fiches pays →')}</a>
      </div>
    </div>
  );
}

/* one computed line that follows the layer the reader is on */
function Insight({ layer, dir }: { layer: LayerKey; dir: Dir }) {
  const text = useMemo(() => {
    const ituri = PROV.find((p) => p.p === 'Ituri')!;
    if (layer === 'c') { const t = [...ZONES].sort((a, b) => b.c - a.c)[0]; return L(`${t.z} has the most cases (${fmt(t.c)}). Ituri holds ${pct(share(ituri.c, LATEST.c))} of the national total.`, `${t.z} compte le plus de cas (${fmt(t.c)}). L’Ituri représente ${pct(share(ituri.c, LATEST.c))} du total national.`); }
    if (layer === 'k') { const t = [...ZONES].sort((a, b) => b.k - a.k)[0]; return L(`Relative to population, ${t.z} is hardest hit: ${fmt(t.k)} cases per 100,000.`, `Rapporté à la population, ${t.z} est la plus touchée : ${fmt(t.k)} cas pour 100 000.`); }
    if (layer === 'd') return L(`${fmt(UNASSIGNED_DEATHS)} Ituri deaths are not yet assigned to a zone, so zone deaths add to ${fmt(LATEST.dd - UNASSIGNED_DEATHS)}, not ${fmt(LATEST.dd)}.`, `${fmt(UNASSIGNED_DEATHS)} décès de l’Ituri ne sont pas encore attribués à une zone ; les décès par zone totalisent donc ${fmt(LATEST.dd - UNASSIGNED_DEATHS)}, et non ${fmt(LATEST.dd)}.`);
    if (layer === 'mob') { const k = dir === 'out' ? 'tout' : 'tin'; const t = Object.entries(MOB).sort((a, b) => b[1][k] - a[1][k])[0]; return L(`${t[0]} ${dir === 'out' ? 'sends' : 'receives'} the most movement: ${fmt(t[1][k])} estimated ${dir === 'out' ? 'departures' : 'arrivals'} in April 2026. Click a zone to draw its flows.`, `${t[0]} ${dir === 'out' ? 'émet' : 'reçoit'} le plus de mouvement : ${fmt(t[1][k])} ${dir === 'out' ? 'départs' : 'arrivées'} estimés en avril 2026. Cliquez sur une zone pour tracer ses flux.`); }
    const top = EWS.zones.find((z) => z.level === 'critical') || EWS.zones.find((z) => z.level === 'alert');
    return L(`${EWS.counts.critical} critical and ${EWS.counts.alert} alert zones on the latest report${top ? `, led by ${top.z}` : ''}. Automated signals with provisional thresholds; verify against WHO.`, `${EWS.counts.critical} zones critiques et ${EWS.counts.alert} en alerte au dernier rapport${top ? `, en tête ${top.z}` : ''}. Signaux automatisés à seuils provisoires ; vérifier auprès de l’OMS.`);
  }, [layer, dir]);
  return <p className="flex gap-2 rounded-xl bg-accent-soft px-3 py-2.5 text-[12.5px] leading-snug text-ink"><Info className="mt-0.5 h-4 w-4 flex-none text-accent" aria-hidden />{text}</p>;
}

/* ---------------- sidebar: zone ---------------- */
function ZonePanel({ z, layer, onBack }: { z: Zone; layer: LayerKey; onBack: () => void }) {
  const s = zoneSeries(z.z), m = MOB[z.z];
  return (
    <div className="space-y-5 p-4 md:p-5">
      <div>
        <BackLink onClick={onBack} label={L('DR Congo overview', 'Vue d’ensemble RD Congo')} />
        <div className="mt-2 flex items-center gap-2"><h2 className="font-display text-2xl font-bold text-ink">{z.z}</h2><Badge tone="active">{L('Affected', 'Touchée')}</Badge></div>
        <p className="text-xs text-ink-3">{z.p} · {L('health zone', 'zone de santé')} · INSP SitRep N°{LATEST.s}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[[L('Confirmed cases', 'Cas confirmés'), fmt(z.c), 'text-case'], [L('Deaths', 'Décès'), fmt(z.d), 'text-death'], [L('Per 100,000', 'Pour 100 000'), fmt(z.k), 'text-ink'], [L('CFR, printed', 'Létalité, imprimée'), `${z.cfr}%`, 'text-ink']].map(([l, v, c]) => (
          <div key={l} className={STAT}><p className="text-[11px] text-ink-3">{l}</p><p className={`num font-mono text-lg font-semibold ${c}`}>{v}</p></div>
        ))}
      </div>
      <p className="-mt-2 text-[11px] text-ink-3">{pct(share(z.c, LATEST.c), 1)} {L('of national cases · population', 'des cas nationaux · population')} {fmt(z.pop)} {L('(v1 shapefile)', '(shapefile v1)')}</p>

      <section>
        <p className="text-[13px] font-semibold text-ink">{L('Cumulative cases and deaths', 'Cas et décès cumulés')}</p>
        {s ? (
          <div className="mt-1 h-32"><ResponsiveContainer width="100%" height="100%">
            <LineChart data={s.rows} margin={{ top: 4, right: 6, bottom: 0, left: 0 }}>
              <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(t) => dateShort(new Date(t).toISOString().slice(0, 10))} minTickGap={40} tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} width={42} tickFormatter={(v) => fmt(v)} />
              <Tooltip content={({ active, payload }) => active && payload?.length ? (
                <div className="rounded border border-rule bg-paper px-2 py-1 text-xs">
                  <div className="text-ink-3">{dateLong(payload[0].payload.d)}</div>
                  <div><b className="num text-case">{fmt(payload[0].payload.c)}</b> {L('cases', 'cas')}</div>
                  {payload[0].payload.dd != null && <div><b className="num text-death">{fmt(payload[0].payload.dd)}</b> {L('deaths', 'décès')}</div>}
                </div>) : null} />
              {/* continuous lines: real readings are connected across missing dates; nothing is interpolated */}
              <Line type="monotone" dataKey="c" stroke="rgb(var(--case))" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
              <Line type="monotone" dataKey="dd" stroke="rgb(var(--death))" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
            </LineChart></ResponsiveContainer></div>
        ) : <p className="mt-1 text-xs text-ink-3">{L('No published zone series; latest figure only.', 'Aucune série publiée pour la zone ; dernier chiffre uniquement.')}</p>}
        {s && <div className="mt-1 flex gap-4 text-[10.5px] text-ink-3"><span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-case" />{L('Cases', 'Cas')}</span><span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-death" />{L('Deaths', 'Décès')}</span></div>}
      </section>

      <section className={layer === 'mob' ? 'rounded-xl ring-1 ring-flow-in/40 p-3 -mx-1' : ''}>
        <p className="text-[13px] font-semibold text-ink">{L('Mobility · April 2026', 'Mobilité · avril 2026')}</p>
        {m ? (
          <>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className={STAT}><p className="text-[11px] text-ink-3">{L('Arrivals', 'Arrivées')}</p><p className="num font-mono text-lg font-semibold text-flow-in">{fmt(m.tin)}</p></div>
              <div className={STAT}><p className="text-[11px] text-ink-3">{L('Departures', 'Départs')}</p><p className="num font-mono text-lg font-semibold text-flow-out">{fmt(m.tout)}</p></div>
            </div>
            <FlowList title={`${L('Into', 'Vers')} ${z.z} ${L('from', 'depuis')}`} rows={m.in} sup={m.inSup} color="--flow-in" />
            <FlowList title={`${L('Out of', 'Depuis')} ${z.z} ${L('to', 'vers')}`} rows={m.out} sup={m.outSup} color="--flow-out" />
            <p className="mt-2 text-[10.5px] leading-snug text-ink-3">{str('mob_note')}</p>
          </>
        ) : <p className="mt-1 text-xs text-ink-3">{str('mob_none_post')}</p>}
      </section>

      <section>
        <p className="text-[13px] font-semibold text-ink">{L('Early warning', 'Alerte précoce')}</p>
        <p className="mt-1 flex items-center gap-2 text-xs text-ink-2"><Badge tone="pending">{L('Not assessed', 'Non évaluée')}</Badge>{L('Thresholds not set yet', 'Seuils pas encore définis')}</p>
      </section>
    </div>
  );
}

function FlowList({ title, rows, sup, color }: { title: string; rows: [string, number, number | null, number | null][]; sup?: number; color: string }) {
  const top = rows.slice(0, 5), max = top[0]?.[1] ?? 1;
  return (
    <div className="mt-3">
      <p className="text-[11.5px] font-medium text-ink-2">{title}{sup ? <span className="text-ink-3"> · +{sup} {L('redacted (<15)', 'masqués (<15)')}</span> : null}</p>
      <ul className="mt-1 space-y-1">{top.map(([n, v, lo, hi]) => (
        <li key={n} className="grid grid-cols-[6.5rem_minmax(0,1fr)_3.5rem] items-center gap-2 text-[12px]" title={lo != null && hi != null ? `${L('Range', 'Plage')} ${fmt(lo)}–${fmt(hi)}` : undefined}>
          <span className="truncate text-ink">{n}</span>
          <span className="h-1.5 rounded-full bg-paper-3"><span className="block h-full rounded-full" style={{ width: `${(v / max) * 100}%`, background: `rgb(var(${color}))` }} /></span>
          <span className="num text-right font-mono text-ink-2">{fmt(v)}</span>
        </li>))}</ul>
    </div>
  );
}

/* ---------------- country picker, country panels ---------------- */
function CountryPicker({ country, onChange }: { country: string; onChange: (k: string) => void }) {
  const opts = [{ key: 'all', name: L('All countries', 'Tous les pays'), st: '' }, ...COUNTRIES.map((c) => ({ key: c.key, name: cname(c), st: c.st }))];
  return (
    <>
      <div role="group" aria-label={L('Country', 'Pays')} className="pointer-events-auto ml-auto hidden rounded-full border border-rule bg-paper/95 p-1 shadow-sm backdrop-blur xl:flex">
        {opts.map((o) => (
          <button key={o.key} aria-pressed={country === o.key} onClick={() => onChange(o.key)} className="flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[12.5px] font-medium text-ink-2 aria-pressed:bg-paper-3 aria-pressed:text-ink">
            {o.st && <span className={cx('h-2 w-2 rounded-full', o.st === 'active' ? 'bg-st-active' : 'bg-st-over')} />}{o.name}
          </button>
        ))}
      </div>
      <select id="country-select" aria-label={L('Country', 'Pays')} value={country} onChange={(e) => onChange(e.target.value)}
        className="pointer-events-auto ml-auto h-10 rounded-full border border-rule bg-paper/95 px-3 text-[13px] font-medium text-ink shadow-sm xl:hidden">
        {opts.map((o) => <option key={o.key} value={o.key}>{o.name}</option>)}
      </select>
    </>
  );
}

function BackLink({ onClick, label }: { onClick: () => void; label: string }) {
  return <button onClick={onClick} className="-ml-1 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-ink-2 hover:bg-paper-2"><ArrowLeft className="h-3.5 w-3.5" />{label}</button>;
}

function AllCountries({ onPick }: { onPick: (k: string) => void }) {
  const tc = COUNTRIES.reduce((a, c) => a + c.c, 0), td = COUNTRIES.reduce((a, c) => a + c.d, 0);
  return (
    <div className="space-y-4 p-4 md:p-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[.12em] text-ink-3">{L('Bundibugyo virus disease · 4 countries', 'Maladie à virus Bundibugyo · 4 pays')}</p>
        <p className="mt-1 text-[11px] text-warn xl:hidden">⚠ {L('Verify against WHO before publishing', 'Vérifier auprès de l’OMS avant publication')}</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div className={STAT}><p className="text-[11px] text-ink-3">{L('Confirmed cases', 'Cas confirmés')}</p><p className="num font-mono text-2xl font-semibold text-case">{fmt(tc)}</p><p className="text-[10.5px] text-ink-3">{L('regional total · dates differ', 'total régional · dates variables')}</p></div>
          <div className={STAT}><p className="text-[11px] text-ink-3">{L('Deaths', 'Décès')}</p><p className="num font-mono text-2xl font-semibold text-death">{fmt(td)}</p><p className="text-[10.5px] text-ink-3">{L('regional total · dates differ', 'total régional · dates variables')}</p></div>
        </div>
      </div>
      <ul className="space-y-2">
        {COUNTRIES.map((c) => (
          <li key={c.key}><button onClick={() => onPick(c.key)} className="group w-full rounded-xl border border-rule p-3 text-left hover:border-accent">
            <span className="flex items-center justify-between">
              <span className="flex items-center gap-2 font-semibold text-ink group-hover:text-accent"><span className={cx('h-2.5 w-2.5 rounded-full', c.st === 'active' ? 'bg-st-active' : 'bg-st-over')} />{cname(c)}</span>
              <Badge tone={c.st === 'active' ? 'active' : 'over'}>{c.st === 'active' ? L('Active', 'Active') : L('Over', 'Terminée')}</Badge>
            </span>
            <span className="mt-1.5 flex gap-4 text-[12px] text-ink-2"><span><b className="num font-mono text-case">{fmt(c.c)}</b> {L('cases', 'cas')}</span><span><b className="num font-mono text-death">{fmt(c.d)}</b> {L('deaths', 'décès')}</span></span>
            <span className="mt-1 block text-[10.5px] text-ink-3">{c.src} · {dateShort(c.asof)}{c.key === 'COD' ? ` · ${ZONES.length} ${L('health zones mapped', 'zones de santé cartographiées')}` : L(' · national figures only', ' · chiffres nationaux uniquement')}</span>
          </button></li>
        ))}
      </ul>
    </div>
  );
}

function CountryPanel({ k, onBack }: { k: string; onBack: () => void }) {
  const c = COUNTRIES.find((x) => x.key === k)!;
  const code = k === 'Kenya' ? 'KEN' : k === 'Nigeria' ? 'NGA' : null;
  const units = code ? ADMIN1[code].features.length : null;
  return (
    <div className="space-y-5 p-4 md:p-5">
      <div>
        <BackLink onClick={onBack} label={L('All countries', 'Tous les pays')} />
        <div className="mt-2 flex items-center gap-2"><h2 className="font-display text-2xl font-bold text-ink">{cname(c)}</h2><Badge tone={c.st === 'active' ? 'active' : 'over'}>{c.st === 'active' ? L('Active outbreak', 'Épidémie active') : L('Outbreak over', 'Épidémie terminée')}</Badge></div>
        <p className="text-xs text-ink-3">{c.src} · {dateLong(c.asof)}</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {([[L('Confirmed', 'Confirmés'), c.c, 'text-case'], [L('Deaths', 'Décès'), c.d, 'text-death'], [L('Recovered', 'Guéris'), c.r, 'text-recov']] as const).map(([l, v, t]) => (
          <div key={l} className={STAT}><p className="text-[11px] text-ink-3">{l}</p><p className={cx('num font-mono text-xl font-semibold', v == null ? 'text-ink-3' : t)}>{fmt(v)}</p></div>
        ))}
      </div>
      <p className="rounded-xl bg-paper-2 p-3 text-[12.5px] leading-snug text-ink-2">
        {code ? L(`The ministry publishes national figures only. The map shows the ${units} ${code === 'KEN' ? 'counties' : 'states'} for orientation; none is coloured, and the bubble is the national total, not a location.`, `Le ministère ne publie que des chiffres nationaux. La carte montre les ${units} ${code === 'KEN' ? 'comtés' : 'États'} à titre indicatif ; aucun n’est coloré, et la bulle représente le total national, non un lieu.`) : L('The outbreak was declared over on 28 July 2026; the figures are final. Only national figures were published.', 'L’épidémie a été déclarée terminée le 28 juillet 2026 ; les chiffres sont définitifs. Seuls des chiffres nationaux ont été publiés.')}
      </p>
      <p className="text-[10.5px] text-ink-3">{code ? `${L('Boundaries:', 'Limites :')} ${ADMIN1.source}. ` : ''}{L('Recovered is "—" where the statement does not give it.', '« — » indique un nombre de guéris non précisé par le communiqué.')}</p>
    </div>
  );
}
