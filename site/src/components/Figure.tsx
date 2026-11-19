/* An exhibit in the Our World in Data manner: the question as title, a one-line
   subtitle saying what is measured, the chart, then source, notes and download. */
import { Download, Info } from 'lucide-react';
import type { ReactNode } from 'react';
import { L } from '@/lib/i18n';

export function Figure({ id, title, subtitle, children, source, notes, download }: {
  id?: string; title: string; subtitle?: ReactNode; children: ReactNode;
  source: ReactNode; notes?: ReactNode; download?: { href: string; label: string }[];
}) {
  return (
    <figure id={id} className="rounded-2xl border border-rule bg-paper p-4 md:p-6">
      <figcaption className="mb-4">
        <h3 className="font-display text-lg font-semibold leading-snug text-ink md:text-xl">{title}</h3>
        {subtitle && <p className="mt-1 text-sm text-ink-2">{subtitle}</p>}
      </figcaption>
      {children}
      <footer className="mt-4 flex flex-col gap-2 border-t border-rule pt-3 text-xs text-ink-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 space-y-1">
          <p><span className="font-semibold text-ink-2">{L('Source:', 'Source :')}</span> {source}</p>
          {notes && <p className="flex gap-1.5"><Info className="mt-0.5 h-3.5 w-3.5 flex-none" aria-hidden />{notes}</p>}
        </div>
        {download && (
          <div className="flex flex-none flex-wrap gap-3">
            {download.map((d) => (
              <a key={d.href} href={d.href} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
                <Download className="h-3.5 w-3.5" aria-hidden />{d.label}
              </a>
            ))}
          </div>
        )}
      </footer>
    </figure>
  );
}

export function SectionHead({ kicker, title, children, id }: { kicker: string; title: string; children?: ReactNode; id: string }) {
  return (
    <header className="mx-auto mb-8 max-w-prose">
      <p className="font-display text-xs font-bold uppercase tracking-[.14em] text-accent">{kicker}</p>
      <h2 id={id} className="mt-2 font-display text-[1.75rem] font-bold leading-tight tracking-tight text-ink md:text-[2.125rem]">{title}</h2>
      {children && <div className="lede mt-3">{children}</div>}
    </header>
  );
}

export function PageHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <header className="mb-6">
      <h1 className="font-display text-3xl font-bold tracking-tight text-ink md:text-4xl">{title}</h1>
      {sub && <p className="mt-2 max-w-xl text-[15px] text-ink-2">{sub}</p>}
    </header>
  );
}
