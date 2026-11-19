import { PageHead } from '@/components/Figure';
import { Badge } from '@/components/ui/badge';
import { COUNTRIES, cname, fmt, dateLong } from '@/lib/data';
import { L } from '@/lib/i18n';

export function Countries() {
  const tc = COUNTRIES.reduce((a, c) => a + c.c, 0), td = COUNTRIES.reduce((a, c) => a + c.d, 0);
  return (
    <section className="py-8 md:py-12">
      <div className="gutter">
        <div className="mx-auto max-w-wide"><PageHead title={L('Countries', 'Pays')} sub={L("Each country's own authority, each with its own date.", 'Chaque pays selon sa propre autorité sanitaire, à sa propre date.')} /></div>
        <ul className="mx-auto grid max-w-wide gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {COUNTRIES.map((c) => (
            <li key={c.key} className="flex flex-col rounded-2xl border border-rule bg-paper p-5">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-display text-lg font-semibold text-ink">{cname(c)}</h3>
                <Badge tone={c.st === 'active' ? 'active' : 'over'}>{c.st === 'active' ? L('Active', 'Active') : L('Over', 'Terminée')}</Badge>
              </div>
              <dl className="mt-4 grid grid-cols-3 gap-2">
                {([[L('Confirmed', 'Confirmés'), c.c, 'text-case'], [L('Deaths', 'Décès'), c.d, 'text-death'], [L('Recovered', 'Guéris'), c.r, 'text-recov']] as const).map(([l, v, t]) => (
                  <div key={l}><dt className="text-[11px] text-ink-3">{l}</dt><dd className={`num font-mono text-xl font-semibold ${v == null ? 'text-ink-3' : t}`}>{fmt(v)}</dd></div>
                ))}
              </dl>
              <p className="mt-auto pt-4 text-xs leading-relaxed text-ink-3">
                {c.src} · {dateLong(c.asof)}{c.st === 'over' ? L(' · declared over, figures final', ' · épidémie déclarée terminée, chiffres définitifs') : ''}{c.key !== 'COD' ? L('. National totals only; no sub-national breakdown is published.', '. Totaux nationaux uniquement ; aucune ventilation infranationale n’est publiée.') : '.'}
              </p>
            </li>
          ))}
        </ul>
        <p className="mx-auto mt-4 max-w-wide text-sm text-ink-2">
          <b className="text-ink">{L('Regional total:', 'Total régional :')}</b> <span className="num font-mono">{fmt(tc)}</span> {L('confirmed cases and', 'cas confirmés et')} <span className="num font-mono">{fmt(td)}</span> {L('deaths. Dates differ by country; see each card. Recovered is shown as "—" where the ministry does not state it.', 'décès. Les dates varient selon les pays ; voir chaque fiche. « — » indique un nombre de guéris non précisé par le ministère.')}
        </p>
      </div>
    </section>
  );
}
