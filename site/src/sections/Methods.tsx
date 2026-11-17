import { Download, ExternalLink } from 'lucide-react';
import { PageHead } from '@/components/Figure';
import { LATEST, STR } from '@/lib/data';

const REPO = 'https://github.com/CodeForAfrica/drc-ebola-tracker/blob/main/data';
const FILES = [
  ['national_timeseries.csv', 'National figures by SitRep (cumulative cases, deaths, recovered, isolation, contacts, suspects)'],
  [`provinces_sitrep${LATEST.s}.csv`, `Province table (Tableau 1), SitRep N°${LATEST.s}`],
  [`zones_sitrep${LATEST.s}.csv`, `Health-zone table (Tableau 2), all reported zones, SitRep N°${LATEST.s}`],
  [`zones_sitrep${LATEST.s}.geojson`, 'Mapped health zones with their figures'],
  ['not_reported_provinces.csv', 'Provinces recorded as not reported (ND), by SitRep'],
  ['mobility_flowminder_od.csv', 'Flowminder / Vodacom estimated relocations, April 2026'],
] as const;

const DEFS = [
  ['Confirmed case', 'Laboratory-confirmed, as counted by INSP. Every case figure on this site is a confirmed case.'],
  ['Suspected case', 'A validated alert on the report day, from the SitRep alerts table. A daily count, not cumulative.'],
  ['Probable case', 'Not published in the series this site reads, so not shown.'],
  ['Cumulative vs daily', 'Cumulative figures are as printed. Daily figures are the difference between two consecutive daily reports and are left blank across a gap.'],
  ['Rate per 100,000', 'Cumulative confirmed cases divided by the zone population in the INRB-UMIE v1 shapefile.'],
  ['Case fatality', 'Deaths among confirmed cases divided by confirmed cases, as printed. It counts unresolved cases in the denominator.'],
] as const;

export function Methods() {
  return (
    <section className="py-8 md:py-12">
      <div className="gutter">
        <div className="mx-auto max-w-wide"><PageHead title="Data & methods" /></div>
        <div className="mx-auto grid max-w-wide gap-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div className="prose-body space-y-4">
            <p><b>Sources.</b> DR Congo: Institut National de Santé Publique (INSP) situation reports, national headline and health-zone table both from SitRep N°{LATEST.s}. Uganda, Kenya and Nigeria: each national ministry of health. WHO Disease Outbreak News and Africa CDC are used as cross-checks, not as sources for a displayed figure.</p>
            <p><b>Coverage.</b> <span dangerouslySetInnerHTML={{ __html: STR.mm_cov2 }} /></p>
            <p><span dangerouslySetInnerHTML={{ __html: STR.mm_cov_dakwa }} /></p>
            <p><span dangerouslySetInnerHTML={{ __html: STR.mm_cov_held }} /> N°169 is also held, and N°142 and N°172 were not published.</p>
            <p><b>Geometry.</b> Health-zone boundaries, centroids and populations come from the INRB-UMIE archived v1 shapefile. Kenya counties and Nigeria states: geoBoundaries gbOpen ADM1 (CC BY 4.0), drawn for orientation only, since neither ministry publishes figures below national level. Country outlines: Natural Earth. Basemap: © OpenStreetMap contributors, © CARTO.</p>
            <p className="rounded-xl border border-warn/40 bg-warn/10 p-3 font-sans text-sm text-ink"><b>Verify against WHO before publishing.</b> Figures change with each SitRep and INSP sometimes restates earlier counts.</p>
          </div>
          <div className="space-y-8">
            <div>
              <h3 className="font-display text-base font-semibold text-ink">Definitions</h3>
              <dl className="mt-3 divide-y divide-rule border-y border-rule">
                {DEFS.map(([k, v]) => <div key={k} className="grid gap-1 py-2.5 sm:grid-cols-[9rem_minmax(0,1fr)]"><dt className="text-sm font-medium text-ink">{k}</dt><dd className="text-sm text-ink-2">{v}</dd></div>)}
              </dl>
            </div>
            <div>
              <h3 className="font-display text-base font-semibold text-ink">Download the data</h3>
              <ul className="mt-3 space-y-2">
                {FILES.map(([f, d]) => (
                  <li key={f}><a href={`${REPO}/${f}`} target="_blank" rel="noopener" className="group flex gap-3 rounded-xl border border-rule bg-paper p-3 hover:border-accent">
                    <Download className="mt-0.5 h-4 w-4 flex-none text-accent" aria-hidden />
                    <span className="min-w-0"><span className="block break-all font-mono text-[12.5px] text-ink group-hover:text-accent">{f}</span><span className="block text-xs text-ink-3">{d}</span></span>
                  </a></li>
                ))}
              </ul>
              <a href="https://github.com/CodeForAfrica/drc-ebola-tracker" target="_blank" rel="noopener" className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline">All files on GitHub<ExternalLink className="h-3.5 w-3.5" /></a>
            </div>
          </div>
        </div>
      </div>
      <footer className="gutter mx-auto mt-14 flex max-w-wide flex-wrap items-center justify-between gap-3 border-t border-rule pt-6 text-xs text-ink-3">
        <span>A Code for Africa project. Figures from INSP and national ministries of health.</span>
        <span>Data: SitRep N°{LATEST.s}, {LATEST.d}</span>
      </footer>
    </section>
  );
}
