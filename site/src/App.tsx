import { useCallback, useEffect, useState } from 'react';
import { TopNav, ROUTES, type Route } from '@/components/TopNav';
import { MapView } from '@/views/MapView';
import { Briefing } from '@/views/Briefing';
import { EwsView } from '@/components/Ews';
import { Trends } from '@/sections/Trends';
import { Countries } from '@/sections/Countries';
import { Facilities } from '@/sections/Facilities';
import { Methods } from '@/sections/Methods';
import type { LayerKey, Dir } from '@/components/map/layers';
import { MOB } from '@/lib/data';
import { useLang } from '@/lib/i18n';

/* Routing is held in state. The hash is only mirrored (for bookmarks and the back button) and is
   never relied on: some embedded viewers ignore in-page link jumps, which left the tabs inert. */
const isRoute = (h: string): h is Route => ROUTES.some(([id]) => id === h);
const fromHash = (): Route => { try { const h = location.hash.slice(1); return isRoute(h) ? h : 'map'; } catch { return 'map'; } };

export default function App() {
  const [route, setRoute] = useState<Route>(fromHash);
  const [layer, setLayer] = useState<LayerKey>('c');
  const [dir, setDir] = useState<Dir>('all');      // both directions at first glance
  const [country, setCountry] = useState('all');   // bubbles first
  const [sel, setSel] = useState<string | null>(null);
  const { lang } = useLang();   // remount map-bound Leaflet tooltips when the language changes

  const go = useCallback((r: Route) => {
    setRoute(r); window.scrollTo(0, 0);
    try { if (location.hash.slice(1) !== r) history.pushState(null, '', `#${r}`); } catch { /* the viewer may refuse; state still changes */ }
  }, []);
  useEffect(() => {
    const onPop = () => setRoute(fromHash());
    /* every in-page "#route" link goes through go() */
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element).closest?.('a[href^="#"]') as HTMLAnchorElement | null;
      if (!a) return; const h = a.getAttribute('href')!.slice(1);
      if (isRoute(h)) { e.preventDefault(); go(h); }
    };
    addEventListener('popstate', onPop); addEventListener('hashchange', onPop); document.addEventListener('click', onClick);
    return () => { removeEventListener('popstate', onPop); removeEventListener('hashchange', onPop); document.removeEventListener('click', onClick); };
  }, [go]);

  /* any layer works from any view: health-zone layers open DR Congo. Mobility opens on the
     zone with the most movement, so flows show straight away. */
  const chooseLayer = (l: LayerKey) => {
    setLayer(l); setCountry('COD');
    if (l === 'mob' && !sel) setSel(Object.entries(MOB).sort((a, b) => b[1].tin + b[1].tout - (a[1].tin + a[1].tout))[0][0]);
  };

  return (
    <>
      <TopNav route={route} go={go} />
      <main>
        {/* the map stays mounted so returning to it keeps its view */}
        <div hidden={route !== 'map'}><MapView key={lang} layer={layer} setLayer={chooseLayer} dir={dir} setDir={setDir} sel={sel} setSel={setSel} country={country} setCountry={setCountry} /></div>
        {route === 'briefing' && <Briefing key={lang} go={go} />}
        {route === 'trends' && <Trends />}
        {route === 'countries' && <Countries />}
        {route === 'facilities' && <Facilities key={lang} />}
        {route === 'early-warning' && <EwsView onShowMap={() => { setLayer('ews'); setCountry('COD'); go('map'); }} />}
        {route === 'methods' && <Methods />}
      </main>
    </>
  );
}
