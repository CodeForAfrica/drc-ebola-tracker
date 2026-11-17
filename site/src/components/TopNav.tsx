import { useEffect, useState } from 'react';
import { AlertTriangle, Moon, Sun } from 'lucide-react';
import { LATEST, dateShort, dateLong } from '@/lib/data';

export const ROUTES = [
  ['map', 'Map'],
  ['briefing', 'Briefing'],
  ['trends', 'Trends'],
  ['countries', 'Countries'],
  ['early-warning', 'Early warning'],
  ['methods', 'Data & methods'],
] as const;
export type Route = (typeof ROUTES)[number][0];

export function TopNav({ route, go }: { route: Route; go: (r: Route) => void }) {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'light');
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('theme', theme); } catch { /* storage may be blocked */ }
  }, [theme]);
  return (
    <header className="sticky z-[1000] border-b border-rule bg-paper/95 backdrop-blur" style={{ top: 'env(safe-area-inset-top, 0px)' }}>
      <div className="gutter flex h-14 items-center gap-3">
        <button onClick={() => go('map')} aria-label="Map, home" className="flex flex-none items-center gap-2.5 text-left">
          {/* text lockup; swap for the official Code for Africa logo file at implementation */}
          <span className="flex flex-col leading-none">
            <span className="text-[10px] font-extrabold uppercase tracking-[.16em] text-accent">Code for Africa</span>
            <span className="mt-1 text-[15px] font-bold tracking-tight text-ink">Epidemic Intelligence<span className="font-normal text-ink-3"> · Bundibugyo 2026</span></span>
            <span className="mt-0.5 hidden text-[10px] text-ink-3 sm:block">Dashboard last updated {dateLong(LATEST.d)}</span>
          </span>
        </button>
        <nav aria-label="Sections" className="no-scrollbar ml-1 flex [mask-image:linear-gradient(90deg,#000_85%,transparent)] md:[mask-image:none] min-w-0 flex-1 items-center gap-0.5 overflow-x-auto md:ml-4">
          {ROUTES.map(([id, label]) => (
            <button key={id} type="button" onClick={() => go(id)} aria-current={route === id ? 'page' : undefined}
              className="relative whitespace-nowrap px-2.5 py-4 text-[13px] font-medium text-ink-2 transition-colors hover:text-ink aria-[current=page]:text-ink after:absolute after:inset-x-2.5 after:bottom-0 after:h-[3px] after:rounded-none after:bg-accent after:opacity-0 aria-[current=page]:after:opacity-100">
              {label}
            </button>
          ))}
        </nav>
        <span className="hidden items-center gap-1.5 whitespace-nowrap rounded-full border border-warn/40 bg-warn/10 px-2.5 py-1 text-[11px] text-ink-2 xl:inline-flex" title="Verify against WHO before publishing">
          <AlertTriangle className="h-3.5 w-3.5 text-warn" aria-hidden />SitRep N°{LATEST.s} · {dateShort(LATEST.d)} · verify against WHO
        </span>
        <button className="hidden h-8 rounded-full border border-rule px-3 text-xs font-medium text-ink-2 md:block" title="French copy comes over from the live site at implementation" aria-disabled>EN · FR</button>
        <button className="grid h-8 w-8 flex-none place-items-center rounded-full text-ink-2 hover:bg-paper-3" aria-label={theme === 'dark' ? 'Use light theme' : 'Use dark theme'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>
    </header>
  );
}
