import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PageHead, Figure } from '@/components/Figure';
import { DAILY, GAPS, LATEST, fmt, dateShort, dateLong, lineParts } from '@/lib/data';

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

export function Trends() {
  const recentGaps = GAPS.filter((g) => ts(g.to) >= FROM);
  return (
    <section className="gutter py-8 md:py-12">
      <div className="mx-auto max-w-wide"><PageHead title="Trends" sub="Daily counts are shown only between consecutive reports; gaps are marked, never filled." /></div>
      <div className="mx-auto grid max-w-wide gap-6">
        <Figure
          title="Cumulative confirmed cases and deaths"
          subtitle="DR Congo, every SitRep in the national series. Dashed where no report is held."
          source={<>INSP situation reports N°055–{LATEST.s}.</>}
          notes={<>Deaths are among confirmed cases. National deaths include {fmt(493)} Ituri deaths not yet assigned to a health zone.</>}
          download={[{ href: `${REPO}/national_timeseries.csv`, label: 'national_timeseries.csv' }]}
        >
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={CUM} margin={{ top: 6, right: 12, bottom: 0, left: -4 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={tick} tickLine={false} axisLine={false} minTickGap={40} />
                <YAxis tickLine={false} axisLine={false} width={58} tickFormatter={(v) => v.toLocaleString('en-GB')} />
                <Tooltip content={<Tip rows={[['Confirmed', (r) => fmt(r.cum)], ['Deaths', (r) => fmt(r.cumD)]]} />} />
                {PC.bridges.map((g, i) => <ReferenceLine key={`cb${i}`} segment={[{ x: g.x1, y: g.y1 }, { x: g.x2, y: g.y2 }]} stroke="rgb(var(--case))" strokeWidth={2} strokeDasharray="5 5" />)}
                {PD.bridges.map((g, i) => <ReferenceLine key={`db${i}`} segment={[{ x: g.x1, y: g.y1 }, { x: g.x2, y: g.y2 }]} stroke="rgb(var(--death))" strokeWidth={2} strokeDasharray="5 5" />)}
                {Array.from({ length: PC.runs }, (_, i) => <Line key={`c${i}`} dataKey={`cum__${i}`} stroke="rgb(var(--case))" strokeWidth={2.6} dot={false} connectNulls isAnimationActive={false} />)}
                {Array.from({ length: PD.runs }, (_, i) => <Line key={`d${i}`} dataKey={`cumD__${i}`} stroke="rgb(var(--death))" strokeWidth={2.6} dot={false} connectNulls isAnimationActive={false} />)}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex gap-5 text-xs text-ink-2">
            <span className="flex items-center gap-2"><span className="h-0.5 w-5 bg-case" />Confirmed cases {fmt(LATEST.c)}</span>
            <span className="flex items-center gap-2"><span className="h-0.5 w-5 bg-death" />Deaths {fmt(LATEST.dd)}</span>
            <span className="flex items-center gap-2"><span className="w-5 border-t-2 border-dashed border-ink-3" />No report held</span>
          </div>
          <p className="mt-2 text-[11.5px] text-ink-3">Dashed where no figure is held: 19 July – 4 September (SitReps N°066–113 not ingested), and deaths on 16 July (N°063 gives none). Each dashed segment joins two reported values and adds no data.</p>
        </Figure>

        <Figure
          title="New confirmed cases reported each day"
          subtitle={<>DR Congo, consecutive daily SitReps since {dateLong('2026-09-07')}. Bars are cases; grey bands are days without a usable report.</>}
          source={<>INSP situation reports N°116–{LATEST.s}, as transcribed in the tracker's national series.</>}
          notes={<>Derived: cumulative confirmed in a report minus the previous day's report.</>}
          download={[{ href: `${REPO}/national_timeseries.csv`, label: 'national_timeseries.csv' }]}
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={RECENT} margin={{ top: 6, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid vertical={false} />
                {recentGaps.map((g) => <ReferenceArea key={g.from} x1={ts(g.from) - 432e5} x2={ts(g.to) + 432e5} fill="rgb(var(--ink-3))" fillOpacity={0.14} />)}
                <XAxis dataKey="t" type="number" scale="time" domain={['dataMin - 43200000', 'dataMax + 43200000']} tickFormatter={tick} tickLine={false} axisLine={false} minTickGap={36} />
                <YAxis tickLine={false} axisLine={false} width={40} />
                <Tooltip cursor={{ fill: 'rgb(var(--ink-3) / .08)' }} content={<Tip rows={[['New confirmed', (r) => fmt(r.nc)], ['New deaths', (r) => fmt(r.nd)]]} />} />
                <Bar dataKey="nc" fill="rgb(var(--case))" radius={[2, 2, 0, 0]} maxBarSize={9} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-3 space-y-1 text-[11.5px] text-ink-3">
            {recentGaps.map((g) => <li key={g.from} className="flex gap-2"><span className="mt-1 h-2.5 w-2.5 flex-none rounded-sm bg-ink-3/30" /><span><b className="font-medium text-ink-2">{dateShort(g.from)}{g.days > 1 ? `–${dateShort(g.to)}` : ''}:</b> {g.why}</span></li>)}
          </ul>
        </Figure>

      </div>
    </section>
  );
}
