import { Download, ExternalLink } from 'lucide-react';
import { PageHead } from '@/components/Figure';
import { LATEST, str } from '@/lib/data';
import { L } from '@/lib/i18n';

const REPO = 'https://github.com/CodeForAfrica/drc-ebola-tracker/blob/main/data';

export function Methods() {
  const FILES: [string, string][] = [
    ['national_timeseries.csv', L('National figures by SitRep (cumulative cases, deaths, recovered, isolation, contacts, suspects)', 'Chiffres nationaux par SitRep (cas cumulés, décès, guéris, isolement, contacts, suspects)')],
    [`provinces_sitrep${LATEST.s}.csv`, L(`Province table (Tableau 1), SitRep N°${LATEST.s}`, `Tableau des provinces (Tableau 1), SitRep N°${LATEST.s}`)],
    [`zones_sitrep${LATEST.s}.csv`, L(`Health-zone table (Tableau 2), all reported zones, SitRep N°${LATEST.s}`, `Tableau des zones de santé (Tableau 2), toutes zones rapportées, SitRep N°${LATEST.s}`)],
    [`zones_sitrep${LATEST.s}.geojson`, L('Mapped health zones with their figures', 'Zones de santé cartographiées avec leurs chiffres')],
    ['not_reported_provinces.csv', L('Provinces recorded as not reported (ND), by SitRep', 'Provinces enregistrées comme non déclarées (ND), par SitRep')],
    ['mobility_flowminder_od.csv', L('Flowminder / Vodacom estimated relocations, April 2026', 'Déplacements estimés Flowminder / Vodacom, avril 2026')],
    ['health_facilities.csv', L('Health facilities (OpenStreetMap, ODbL) used by the facility finder', 'Établissements de santé (OpenStreetMap, ODbL) utilisés par le localisateur')],
  ];
  const DEFS: [string, string][] = [
    [L('Confirmed case', 'Cas confirmé'), L('Laboratory-confirmed, as counted by INSP. Every case figure on this site is a confirmed case.', 'Confirmé en laboratoire, tel que comptabilisé par l’INSP. Chaque chiffre de cas sur ce site est un cas confirmé.')],
    [L('Suspected case', 'Cas suspect'), L('A validated alert on the report day, from the SitRep alerts table. A daily count, not cumulative.', 'Une alerte validée le jour du rapport, issue du tableau des alertes du SitRep. Un décompte journalier, non cumulé.')],
    [L('Probable case', 'Cas probable'), L('Not published in the series this site reads, so not shown.', 'Non publié dans la série lue par ce site, donc non affiché.')],
    [L('Cumulative vs daily', 'Cumulé ou journalier'), L('Cumulative figures are as printed. Daily figures are the difference between two consecutive daily reports and are left blank across a gap.', 'Les chiffres cumulés sont repris tels quels. Les chiffres journaliers sont la différence entre deux rapports quotidiens consécutifs et restent vides en cas d’interruption.')],
    [L('Rate per 100,000', 'Taux pour 100 000'), L('Cumulative confirmed cases divided by the zone population in the INRB-UMIE v1 shapefile.', 'Cas confirmés cumulés divisés par la population de la zone dans le shapefile INRB-UMIE v1.')],
    [L('Case fatality', 'Létalité'), L('Deaths among confirmed cases divided by confirmed cases, as printed. It counts unresolved cases in the denominator.', 'Décès parmi les cas confirmés divisés par les cas confirmés, tel qu’imprimé. Les cas non résolus comptent au dénominateur.')],
  ];
  return (
    <section className="py-8 md:py-12">
      <div className="gutter">
        <div className="mx-auto max-w-wide"><PageHead title={L('Data & methods', 'Données et méthodes')} /></div>
        <div className="mx-auto grid max-w-wide gap-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div className="prose-body space-y-4">
            <p><b>{L('Sources.', 'Sources.')}</b> {L('DR Congo: Institut National de Santé Publique (INSP) situation reports, national headline and health-zone table both from SitRep N°', 'RD Congo : rapports de situation de l’Institut National de Santé Publique (INSP) ; chiffre national et tableau des zones de santé issus du SitRep N°')}{LATEST.s}. {L('Uganda, Kenya and Nigeria: each national ministry of health. WHO Disease Outbreak News and Africa CDC are used as cross-checks, not as sources for a displayed figure.', 'Ouganda, Kenya et Nigeria : chaque ministère national de la santé. Le Bulletin d’information sur les flambées épidémiques de l’OMS et Africa CDC servent de recoupements, non de sources pour un chiffre affiché.')}</p>
            <p><b>{L('Coverage.', 'Couverture.')}</b> <span dangerouslySetInnerHTML={{ __html: str('mm_cov2') }} /></p>
            <p><span dangerouslySetInnerHTML={{ __html: str('mm_cov_dakwa') }} /></p>
            <p><span dangerouslySetInnerHTML={{ __html: str('mm_cov_held') }} /> {L('N°169 is also held, and N°142 and N°172 were not published.', 'Le N°169 est également retenu, et les N°142 et N°172 n’ont pas été publiés.')}</p>
            <p><b>{L('Geometry.', 'Géométrie.')}</b> {L('Health-zone boundaries, centroids and populations come from the INRB-UMIE archived v1 shapefile. Kenya counties and Nigeria states: geoBoundaries gbOpen ADM1 (CC BY 4.0), drawn for orientation only, since neither ministry publishes figures below national level. Country outlines: Natural Earth. Basemap: © OpenStreetMap contributors, © CARTO.', 'Les limites, centroïdes et populations des zones de santé proviennent du shapefile v1 archivé d’INRB-UMIE. Comtés du Kenya et États du Nigeria : geoBoundaries gbOpen ADM1 (CC BY 4.0), tracés à titre indicatif seulement, aucun des deux ministères ne publiant de chiffres sous le niveau national. Contours des pays : Natural Earth. Fond de carte : © contributeurs OpenStreetMap, © CARTO.')}</p>
            <p><b>{L('Facility finder.', 'Localisateur d’établissements.')}</b> {L('The Facilities page finds the nearest hospitals, clinics and pharmacies from OpenStreetMap (HOT “Health Facilities of {country}”, ODbL, © OpenStreetMap contributors) — community-maintained, not an official registry, and the one place this site goes below health-zone level. A visitor’s location is used only in their browser. New data source and sub-health-zone view: pending maintainer sign-off.', 'La page Établissements trouve les hôpitaux, cliniques et pharmacies les plus proches à partir d’OpenStreetMap (HOT « Health Facilities of {country} », ODbL, © contributeurs OpenStreetMap) — maintenu par la communauté, non un registre officiel, et le seul endroit où ce site descend sous le niveau de la zone de santé. La position d’un visiteur n’est utilisée que dans son navigateur. Nouvelle source de données et vue infra-zone : en attente de validation du mainteneur.')}</p>
            <p className="rounded-xl border border-warn/40 bg-warn/10 p-3 font-sans text-sm text-ink"><b>{L('Verify against WHO before publishing.', 'Vérifier auprès de l’OMS avant publication.')}</b> {L('Figures change with each SitRep and INSP sometimes restates earlier counts.', 'Les chiffres évoluent à chaque SitRep et l’INSP révise parfois des décomptes antérieurs.')}</p>
            <p className="text-xs text-ink-3">{L('French translation is AI-assisted and awaits Francophone review.', 'La traduction française est assistée par IA et attend une relecture francophone.')}</p>
          </div>
          <div className="space-y-8">
            <div>
              <h3 className="font-display text-base font-semibold text-ink">{L('Definitions', 'Définitions')}</h3>
              <dl className="mt-3 divide-y divide-rule border-y border-rule">
                {DEFS.map(([k, v]) => <div key={k} className="grid gap-1 py-2.5 sm:grid-cols-[9rem_minmax(0,1fr)]"><dt className="text-sm font-medium text-ink">{k}</dt><dd className="text-sm text-ink-2">{v}</dd></div>)}
              </dl>
            </div>
            <div>
              <h3 className="font-display text-base font-semibold text-ink">{L('Download the data', 'Télécharger les données')}</h3>
              <ul className="mt-3 space-y-2">
                {FILES.map(([f, d]) => (
                  <li key={f}><a href={`${REPO}/${f}`} target="_blank" rel="noopener" className="group flex gap-3 rounded-xl border border-rule bg-paper p-3 hover:border-accent">
                    <Download className="mt-0.5 h-4 w-4 flex-none text-accent" aria-hidden />
                    <span className="min-w-0"><span className="block break-all font-mono text-[12.5px] text-ink group-hover:text-accent">{f}</span><span className="block text-xs text-ink-3">{d}</span></span>
                  </a></li>
                ))}
              </ul>
              <a href="https://github.com/CodeForAfrica/drc-ebola-tracker" target="_blank" rel="noopener" className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline">{L('All files on GitHub', 'Tous les fichiers sur GitHub')}<ExternalLink className="h-3.5 w-3.5" /></a>
            </div>
          </div>
        </div>
      </div>
      <footer className="gutter mx-auto mt-14 flex max-w-wide flex-wrap items-center justify-between gap-3 border-t border-rule pt-6 text-xs text-ink-3">
        <span>{L('A Code for Africa project. Figures from INSP and national ministries of health.', 'Un projet de Code for Africa. Chiffres de l’INSP et des ministères nationaux de la santé.')}</span>
        <span>{L('Data: SitRep N°', 'Données : SitRep N°')}{LATEST.s}, {LATEST.d}</span>
      </footer>
    </section>
  );
}
