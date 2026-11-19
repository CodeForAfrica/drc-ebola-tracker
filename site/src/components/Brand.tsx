import { AlertTriangle } from 'lucide-react';
import cfaLogo from '@/assets/code-for-africa.png';
import { LATEST, dateLong } from '@/lib/data';
import { L } from '@/lib/i18n';

/* Project mark: a stylised microbe (in the 🦠 manner) — a cell body with a
   few short pili and inner organelles. Inherits colour via currentColor, so it
   reads in both themes when placed on an accent-tinted tile. */
export function Microbe({ className = 'h-6 w-6' }: { className?: string }) {
  const pili = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    const [c, s] = [Math.cos(a), Math.sin(a)];
    return { x1: 16 + c * 10, y1: 16 + s * 10, x2: 16 + c * 14, y2: 16 + s * 14 };
  });
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden role="img">
      {pili.map((p, i) => (
        <g key={i}>
          <line x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} />
          <circle cx={p.x2} cy={p.y2} r="1.05" fill="currentColor" stroke="none" />
        </g>
      ))}
      <circle cx="16" cy="16" r="9.3" fill="currentColor" fillOpacity="0.12" />
      <circle cx="12.8" cy="13.9" r="2" />
      <circle cx="19" cy="17.4" r="1.5" />
      <circle cx="15" cy="19.6" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

/* Site-wide footer, shown on every scrolling page (not the full-bleed map).
   Carries the project mark, the Code for Africa credit lockup, the SitRep
   stamp, the standing WHO note and the cross-section links. */
export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-rule bg-paper-2/40">
      <div className="gutter mx-auto max-w-wide py-10">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-accent-soft text-accent">
              <Microbe className="h-7 w-7" />
            </span>
            <div>
              <p className="font-display text-base font-bold tracking-tight text-ink">{L('Bundibugyo Ebola Tracker', 'Traqueur Ebola Bundibugyo')}</p>
              <p className="mt-0.5 max-w-sm text-[13px] text-ink-2">{L('Epidemic Intelligence. A read-only view of INSP and national-ministry figures.', 'Veille épidémique. Une vue en lecture seule des chiffres de l’INSP et des ministères nationaux.')}</p>
              <p className="mt-2 text-xs text-ink-3">{L('Data: SitRep N°', 'Données : SitRep N°')}{LATEST.s}, {dateLong(LATEST.d)}.</p>
            </div>
          </div>
          <div className="flex flex-col items-start gap-2 md:items-end">
            <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-ink-3">{L('A project by', 'Un projet de')}</p>
            <a href="https://codeforafrica.org" target="_blank" rel="noopener" aria-label="Code for Africa" className="block">
              <img src={cfaLogo} alt="Code for Africa" width={1054} height={346} className="cfa-logo h-9 w-auto opacity-80 transition-opacity hover:opacity-100" />
            </a>
          </div>
        </div>
        <div className="mt-8 flex flex-col gap-3 border-t border-rule pt-5 text-xs text-ink-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5 flex-none text-warn" aria-hidden />{L('Verify against WHO before publishing.', 'Vérifier auprès de l’OMS avant publication.')}</p>
          <nav aria-label={L('Footer', 'Pied de page')} className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <a href="#methods" className="hover:text-ink">{L('Data & methods', 'Données et méthodes')}</a>
            <a href="./explore/" className="hover:text-ink">{L('Classic tracker', 'Traqueur classique')}</a>
            <a href="https://github.com/CodeForAfrica/drc-ebola-tracker" target="_blank" rel="noopener" className="hover:text-ink">GitHub</a>
          </nav>
        </div>
      </div>
    </footer>
  );
}
