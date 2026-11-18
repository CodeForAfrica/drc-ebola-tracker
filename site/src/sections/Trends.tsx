import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PageHead, Figure } from '@/components/Figure';
import { COUNTRIES, DAILY, GAPS, LATEST, cname, countryHistory, fmt, dateShort, dateLong, gapWhy, lineParts } from '@/lib/data';
import type { CtryPoint, Country } from '@/lib/data';
import { L } from '@/lib/i18n';

const ts = (d: string) => Date.parse(d + 'T00:00:00Z');
const DATA = DAILY.map((r) => ({ ...r, t: ts(r.d) }));
const FROM = ts('2026-09-07');               // first run of consecutive daily reports
const RECENT = DATA.filter((r) => r.t >= FROM);
/* the national series has one long gap (19 Jul – 4 Sep): the line breaks there and a dashed
   segment joins the last report before it to the first after it */
const isLong = (i: number) => DATA[i].gapBefore > 6;
const PC = lineParts(DATA, 'cum', isLong);
const PD = lineParts(PC.data, 'cumD', isLong);
const CUM = PD.data;
const tick = (t: number) => dateShort(new Date(t).toISOString().slice(0, 10));
const REPO = 'https://github.com/CodeForAfrica/drc-ebola-tracker/blob/main/data';

function Tip({ active, payload, rows }: { active?: boolean; payload?: { payload: (typeof DATA)[number] }[]; rows: [string, (r: (typeof DATA)[number]) => string][] }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div className="rounded-lg border border-rule bg-paper px-3 py-2 text-xs shadow">
      <p className="font-semibold text-ink">{dateLong(r.d)} · N°{r.s}</p>
      {rows.map(([l, f]) => <p key={l} className="num text-ink-2">{l}: <b className="text-ink">{f(r)}</b></p>)}
    </div>
  );
}

/* ---------- DR Congo: the full daily SitRep series ---------- */
function Congo() {
  const recentGaps = GAPS.filter((g) => ts(g.to) >= FROM);
  return (
    <div className="grid gap-6">
      <Figure
        title={L('Cumulative confirmed cases and deaths', 'Cas confirmés et décès cumulés')}
        subtitle={L('DR Congo, every SitRep in the national series. Dashed where no report is held.', 'RD Congo, chaque SitRep de la série nationale. En pointillés là où aucun rapport n’est disponible.')}
        source={<>{L('INSP situation reports N°055–', 'Rapports de situation de l’INSP N°055–')}{LATEST.s}.</>}
        notes={<>{L('Deaths are among confirmed cases. National deaths include', 'Les décès sont parmi les cas confirmés. Les décès nationaux incluent')} {fmt(493)} {L('Ituri deaths not yet assigned to a health zone.', 'décès de l’Ituri non encore attribués à une zone de santé.')}</>}
        download={[{ href: `${REPO}/national_timeseries.csv`, label: 'national_timeseries.csv' }]}
      >
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={CUM} margin={{ top: 6, right: 12, bottom: 0, left: -4 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={tick} tickLine={false} axisLine={false} minTickGap={40} />
              <YAxis tickLine={false} axisLine={false} width={58} tickFormatter={(v) => fmt(v)} />
              <Tooltip content={<Tip rows={[[L('Confirmed', 'Confirmés'), (r) => fmt(r.cum)], [L('Deaths', 'Décès'), (r) => fmt(r.cumD)]]} />} />
              {PC.bridges.map((g, i) => <ReferenceLine key={`cb${i}`} segment={[{ x: g.x1, y: g.y1 }, { x: g.x2, y: g.y2 }]} stroke="rgb(var(--case))" strokeWidth={2} strokeDasharray="5 5" />)}
              {PD.bridges.map((g, i) => <ReferenceLine key={`db${i}`} segment={[{ x: g.x1, y: g.y1 }, { x: g.x2, y: g.y2 }]} stroke="rgb(var(--death))" strokeWidth={2} strokeDasharray="5 5" />)}
              {Array.from({ length: PC.runs }, (_, i) => <Line key={`c${i}`} dataKey={`cum__${i}`} stroke="rgb(var(--case))" strokeWidth={2.6} dot={false} connectNulls isAnimationActive={false} />)}
              {Array.from({ length: PD.runs }, (_, i) => <Line key={`d${i}`} dataKey={`cumD__${i}`} stroke="rgb(var(--death))" strokeWidth={2.6} dot={false} connectNulls isAnimationActive={false} />)}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 flex gap-5 text-xs text-ink-2">
          <span className="flex items-center gap-2"><span className="h-0.5 w-5 bg-case" />{L('Confirmed cases', 'Cas confirmés')} {fmt(LATEST.c)}</span>
          <span className="flex items-center gap-2"><span className="h-0.5 w-5 bg-death" />{L('Deaths', 'Décès')} {fmt(LATEST.dd)}</span>
          <span className="flex items-center gap-2"><span className="w-5 border-t-2 border-dashed border-ink-3" />{L('No report held', 'Aucun rapport disponible')}</span>
        </div>
        <p className="mt-2 text-[11.5px] text-ink-3">{L('Dashed where no figure is held: 19 July – 4 September (SitReps N°066–113 not ingested), and deaths on 16 July (N°063 gives none). Each dashed segment joins two reported values and adds no data.', 'En pointillés là où aucun chiffre n’est disponible : 19 juillet – 4 septembre (SitReps N°066–113 non intégrés), et les décès du 16 juillet (le N°063 n’en donne aucun). Chaque segment pointillé relie deux valeurs déclarées et n’ajoute aucune donnée.')}</p>
      </Figure>

      <Figure
        title={L('New confirmed cases reported each day', 'Nouveaux cas confirmés déclarés chaque jour')}
        subtitle={<>{L('DR Congo, consecutive daily SitReps since', 'RD Congo, SitReps quotidiens consécutifs depuis le')} {dateLong('2026-09-07')}. {L('Bars are cases; grey bands are days without a usable report.', 'Les barres sont les cas ; les bandes grises sont les jours sans rapport exploitable.')}</>}
        source={<>{L('INSP situation reports N°116–', 'Rapports de situation de l’INSP N°116–')}{LATEST.s}{L(', as transcribed in the tracker’s national series.', ', tels que transcrits dans la série nationale du tracker.')}</>}
        notes={<>{L('Derived: cumulative confirmed in a report minus the previous day’s report.', 'Calcul : cas confirmés cumulés d’un rapport moins ceux du rapport de la veille.')}</>}
        download={[{ href: `${REPO}/national_timeseries.csv`, label: 'national_timeseries.csv' }]}
      >
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={RECENT} margin={{ top: 6, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid vertical={false} />
              {recentGaps.map((g) => <ReferenceArea key={g.from} x1={ts(g.from) - 432e5} x2={ts(g.to) + 432e5} fill="rgb(var(--ink-3))" fillOpacity={0.14} />)}
              <XAxis dataKey="t" type="number" scale="time" domain={['dataMin - 43200000', 'dataMax + 43200000']} tickFormatter={tick} tickLine={false} axisLine={false} minTickGap={36} />
              <YAxis tickLine={false} axisLine={false} width={40} />
              <Tooltip cursor={{ fill: 'rgb(var(--ink-3) / .08)' }} content={<Tip rows={[[L('New confirmed', 'Nouveaux confirmés'), (r) => fmt(r.nc)], [L('New deaths', 'Nouveaux décès'), (r) => fmt(r.nd)]]} />} />
              <Bar dataKey="nc" fill="rgb(var(--case))" radius={[2, 2, 0, 0]} maxBarSize={9} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <ul className="mt-3 space-y-1 text-[11.5px] text-ink-3">
          {recentGaps.map((g) => <li key={g.from} className="flex gap-2"><span className="mt-1 h-2.5 w-2.5 flex-none rounded-sm bg-ink-3/30" /><span><b className="font-medium text-ink-2">{dateShort(g.from)}{g.days > 1 ? `–${dateShort(g.to)}` : ''}:</b> {gapWhy(g)}</span></li>)}
        </ul>
      </Figure>
    </div>
  );
}

/* ---------- any other country: its ministry statements, as discrete reported points ---------- */
function CtryTip({ active, payload }: { active?: boolean; payload?: { payload: CtryPoint }[] }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div className="rounded-lg border border-rule bg-paper px-3 py-2 text-xs shadow">
      <p className="font-semibold text-ink">{dateLong(r.d)}</p>
      <p className="num text-ink-2">{L('Confirmed', 'Confirmés')}: <b className="text-ink">{fmt(r.c)}</b></p>
      <p className="num text-ink-2">{L('Deaths', 'Décès')}: <b className="text-ink">{fmt(r.dd)}</b></p>
      {r.r != null && <p className="num text-ink-2">{L('Recovered', 'Guéris')}: <b className="text-ink">{fmt(r.r)}</b></p>}
    </div>
  );
}

function srcLabel(s: string | null) {
  if (!s) return '';
  return s.split(',')[0].replace(/\s+statement.*/, '');
}
function srcUrl(s: string | null) {
  const m = s?.match(/https?:\/\/\S+/);
  return m ? m[0] : null;
}

function CountryTrend({ c }: { c: Country }) {
  const h = countryHistory(c.key);
  const data = h.map((p) => ({ ...p }));
  const one = data.length < 2;
  const pad = 3 * 864e5;
  const min = data.length ? data[0].t - pad : 0;
  const maxT = data.length ? data[data.length - 1].t + pad : 0;
  const over = c.st === 'over';
  return (
    <div className="grid gap-6">
      <Figure
        title={`${L('Reported figures', 'Chiffres déclarés')} — ${cname(c)}`}
        subtitle={over
          ? <>{L('Outbreak declared over on', 'Épidémie déclarée terminée le')} {dateLong(c.asof)}. {L('Figures are final.', 'Chiffres définitifs.')}</>
          : L('Each point is one public-health statement, as reported. The ministry publishes periodically, so this is not a daily series.', 'Chaque point correspond à un communiqué de santé publique, tel que déclaré. Le ministère publie périodiquement : ce n’est donc pas une série quotidienne.')}
        source={<>{c.src}.</>}
        notes={<>{L('National figures only — no sub-national breakdown is published. Deaths are among confirmed cases. Nothing is interpolated between statements.', 'Chiffres nationaux uniquement — aucune ventilation infranationale n’est publiée. Les décès sont parmi les cas confirmés. Rien n’est interpolé entre les communiqués.')}</>}
      >
        {data.length === 0 ? (
          <p className="py-10 text-center text-sm text-ink-3">{L('No reported history available.', 'Aucun historique déclaré disponible.')}</p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 6, right: 14, bottom: 0, left: -6 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="t" type="number" scale="time" domain={[min, maxT]} tickFormatter={tick} tickLine={false} axisLine={false} minTickGap={30} />
                <YAxis tickLine={false} axisLine={false} width={44} allowDecimals={false} tickFormatter={(v) => fmt(v)} />
                <Tooltip content={<CtryTip />} />
                <Line dataKey="c" stroke="rgb(var(--case))" strokeWidth={2.6} dot={{ r: 3.5, strokeWidth: 0, fill: 'rgb(var(--case))' }} connectNulls isAnimationActive={false} />
                <Line dataKey="dd" stroke="rgb(var(--death))" strokeWidth={2.6} dot={{ r: 3.5, strokeWidth: 0, fill: 'rgb(var(--death))' }} connectNulls isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-5 text-xs text-ink-2">
          <span className="flex items-center gap-2"><span className="h-0.5 w-5 bg-case" />{L('Confirmed cases', 'Cas confirmés')} {fmt(c.c)}</span>
          <span className="flex items-center gap-2"><span className="h-0.5 w-5 bg-death" />{L('Deaths', 'Décès')} {fmt(c.d)}</span>
          {one && <span className="text-ink-3">{L('One statement reported to date — shown as a single point.', 'Un seul communiqué à ce jour — affiché comme un point unique.')}</span>}
        </div>
      </Figure>

      {data.length > 0 && (
        <Figure title={L('Statements', 'Communiqués')} subtitle={`${L('Every public-health statement held for', 'Tous les communiqués de santé publique de')} ${cname(c)}${L(', newest first.', ', du plus récent au plus ancien.')}`} source={<>{c.src}.</>}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-rule text-left text-[11px] uppercase tracking-wide text-ink-3">
                  <th className="py-2 pr-3 font-medium">{L('Date', 'Date')}</th>
                  <th className="py-2 pr-3 text-right font-medium">{L('Confirmed', 'Confirmés')}</th>
                  <th className="py-2 pr-3 text-right font-medium">{L('Deaths', 'Décès')}</th>
                  <th className="py-2 pr-3 text-right font-medium">{L('Recovered', 'Guéris')}</th>
                  <th className="py-2 font-medium">{L('Source', 'Source')}</th>
                </tr>
              </thead>
              <tbody>
                {[...data].reverse().map((p) => {
                  const url = srcUrl(p.src);
                  return (
                    <tr key={p.d} className="border-b border-rule/60">
                      <td className="py-2 pr-3 whitespace-nowrap text-ink">{dateLong(p.d)}</td>
                      <td className="num py-2 pr-3 text-right text-ink">{fmt(p.c)}</td>
                      <td className="num py-2 pr-3 text-right text-ink">{fmt(p.dd)}</td>
                      <td className="num py-2 pr-3 text-right text-ink-2">{fmt(p.r)}</td>
                      <td className="py-2 text-ink-2">{url ? <a className="text-accent hover:underline" href={url} target="_blank" rel="noreferrer">{srcLabel(p.src)}</a> : srcLabel(p.src)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Figure>
      )}
    </div>
  );
}

export function Trends() {
  const [sel, setSel] = useState('COD');
  const country = COUNTRIES.find((c) => c.key === sel) ?? COUNTRIES[0];
  return (
    <section className="gutter py-8 md:py-12">
      <div className="mx-auto max-w-wide">
        <PageHead title={L('Trends', 'Tendances')} sub={L('Each affected country’s reported figures over time. Counts are shown only as published; gaps are marked, never filled.', 'Les chiffres déclarés de chaque pays affecté au fil du temps. Les décomptes ne sont montrés que tels que publiés ; les interruptions sont signalées, jamais comblées.')} />
        <div className="mt-4 flex flex-wrap gap-1.5" role="tablist" aria-label={L('Country', 'Pays')}>
          {COUNTRIES.map((c) => (
            <button
              key={c.key} type="button" role="tab" aria-selected={sel === c.key} onClick={() => setSel(c.key)}
              className={`rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors ${sel === c.key ? 'border-accent bg-accent/10 text-ink' : 'border-rule text-ink-2 hover:text-ink'}`}>
              <span className={`mr-1.5 inline-block h-2 w-2 rounded-full align-middle ${c.st === 'active' ? 'bg-st-active' : 'bg-st-over'}`} />
              {cname(c)}
            </button>
          ))}
        </div>
      </div>
      <div className="mx-auto mt-6 max-w-wide">
        {sel === 'COD' ? <Congo /> : <CountryTrend c={country} />}
      </div>
    </section>
  );
}
