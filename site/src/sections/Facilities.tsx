/* Nearest health-facility finder. A chat-style panel: the user shares their location
   (browser geolocation, kept entirely client-side) or types a known area, and the finder
   replies with the nearest OpenStreetMap facilities, filterable by type. It is deterministic
   — not an LLM — since the site has no backend. Facilities are community OSM data (ODbL);
   the UI says so and never presents them as an official registry. */
import { useMemo, useRef, useState } from 'react';
import { LocateFixed, Navigation, Search, MapPin, Hospital, AlertTriangle } from 'lucide-react';
import { PageHead } from '@/components/Figure';
import {
  COUNTRIES, ZONES, cname, FACILITY_CATS, FACILITY_SOURCE, ISO3_TO_KEY,
  facilityCatLabel, facilityDist, nearestFacilities, type Facility,
} from '@/lib/data';
import { L } from '@/lib/i18n';

type Near = Facility & { dist: number };
type Place = { label: string; sub: string; lat: number; lon: number };
type Msg = { role: 'bot' | 'user'; text?: string; places?: Near[]; origin?: string };

/* places the user can name instead of sharing location — drawn only from our own data
   (health zones and the four countries), so no external geocoder is called */
const PLACES: Place[] = [
  ...ZONES.map((z) => ({ label: z.z, sub: `${z.p} · ${L('health zone', 'zone de santé')}`, lat: z.lat, lon: z.lon })),
  ...COUNTRIES.map((c) => ({ label: cname(c), sub: L('country centre', 'centre du pays'), lat: c.lat, lon: c.lon })),
];

const catColor: Record<string, string> = { hospital: 'bg-death', clinic: 'bg-case', pharmacy: 'bg-recov', other: 'bg-ink-3' };

export function Facilities() {
  const [cats, setCats] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const last = useRef<{ lat: number; lon: number; origin: string } | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([{ role: 'bot', text: L(
    'Hi, I can point you to the nearest health facilities. Share your location, or type a town or health zone, and pick a type if you like.',
    'Bonjour, je peux vous indiquer les établissements de santé les plus proches. Partagez votre position, ou tapez une ville ou une zone de santé, et choisissez un type si vous le souhaitez.') }]);

  const run = (lat: number, lon: number, origin: string, nextCats = cats) => {
    last.current = { lat, lon, origin };
    const near = nearestFacilities(lat, lon, { cats: nextCats, limit: 8 });
    setMsgs((m) => [...m, { role: 'bot', origin,
      text: near.length
        ? L(`Nearest ${near.length} to ${origin}:`, `Les ${near.length} plus proches de ${origin} :`)
        : L('No facilities found for that filter. Try another type.', 'Aucun établissement pour ce filtre. Essayez un autre type.'),
      places: near }]);
  };

  const useLocation = () => {
    if (!('geolocation' in navigator)) { setMsgs((m) => [...m, { role: 'bot', text: L('This device can’t share a location. Type a town or health zone instead.', 'Cet appareil ne peut pas partager de position. Tapez plutôt une ville ou une zone de santé.') }]); return; }
    setBusy(true);
    setMsgs((m) => [...m, { role: 'user', text: L('📍 Use my location', '📍 Utiliser ma position') }]);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setBusy(false); run(pos.coords.latitude, pos.coords.longitude, L('your location', 'votre position')); },
      () => { setBusy(false); setMsgs((m) => [...m, { role: 'bot', text: L('I couldn’t get your location (permission denied or unavailable). Type a town or health zone instead.', 'Je n’ai pas pu obtenir votre position (permission refusée ou indisponible). Tapez plutôt une ville ou une zone de santé.') }]); },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  };

  const hits = useMemo(() => { const s = q.trim().toLowerCase(); return s ? PLACES.filter((p) => p.label.toLowerCase().includes(s) || p.sub.toLowerCase().includes(s)).slice(0, 6) : []; }, [q]);
  const pick = (p: Place) => { setQ(''); setMsgs((m) => [...m, { role: 'user', text: p.label }]); run(p.lat, p.lon, p.label); };
  const toggleCat = (c: string) => {
    const next = new Set(cats); next.has(c) ? next.delete(c) : next.add(c); setCats(next);
    if (last.current) run(last.current.lat, last.current.lon, last.current.origin, next);
  };

  const gmaps = (f: Near) => `https://www.google.com/maps/dir/?api=1&destination=${f.la},${f.lo}`;
  const osm = (f: Near) => `https://www.openstreetmap.org/?mlat=${f.la}&mlon=${f.lo}#map=16/${f.la}/${f.lo}`;

  return (
    <section className="gutter py-8 md:py-12">
      <div className="mx-auto max-w-wide">
        <PageHead title={L('Find health facilities', 'Trouver des établissements de santé')} sub={L('The nearest hospitals, clinics and pharmacies to you, from OpenStreetMap.', 'Les hôpitaux, cliniques et pharmacies les plus proches de vous, d’après OpenStreetMap.')} />

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
          {/* chat column */}
          <div className="flex min-h-[26rem] flex-col rounded-2xl border border-rule bg-paper">
            <div className="flex-1 space-y-3 overflow-y-auto p-4 md:p-5">
              {msgs.map((m, i) => (
                <div key={i} className={m.role === 'user' ? 'flex justify-end' : ''}>
                  {m.text && <p className={`inline-block max-w-[85%] rounded-2xl px-3.5 py-2 text-[13.5px] leading-snug ${m.role === 'user' ? 'bg-accent text-white' : 'bg-paper-2 text-ink'}`}>{m.text}</p>}
                  {m.places && m.places.length > 0 && (
                    <ul className="mt-2 grid gap-2">
                      {m.places.map((f, j) => (
                        <li key={j} className="rounded-xl border border-rule p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="flex items-center gap-2 font-semibold text-ink"><span className={`h-2 w-2 flex-none rounded-full ${catColor[f.k]}`} /><span className="truncate">{f.n}</span></p>
                              <p className="mt-0.5 text-[11.5px] text-ink-3">{facilityCatLabel(f.k)}{f.p ? ` · ${f.p}` : ''}{ISO3_TO_KEY[f.c] !== 'COD' ? ` · ${f.c}` : ''}</p>
                            </div>
                            <span className="num flex-none whitespace-nowrap rounded-full bg-paper-2 px-2 py-0.5 text-[12px] font-semibold text-ink-2">{facilityDist(f.dist)}</span>
                          </div>
                          <div className="mt-2 flex gap-3 text-[12px]">
                            <a href={gmaps(f)} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-medium text-accent hover:underline"><Navigation className="h-3.5 w-3.5" />{L('Directions', 'Itinéraire')}</a>
                            <a href={osm(f)} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-ink-3 hover:text-ink"><MapPin className="h-3.5 w-3.5" />{L('Map', 'Carte')}</a>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
              {busy && <p className="text-[13px] text-ink-3">{L('Getting your location…', 'Récupération de votre position…')}</p>}
            </div>

            {/* input row */}
            <div className="border-t border-rule p-3">
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={useLocation} disabled={busy} className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-2 text-[13px] font-semibold text-white shadow-sm disabled:opacity-50">
                  <LocateFixed className="h-4 w-4" />{L('Use my location', 'Utiliser ma position')}
                </button>
                <div className="relative min-w-0 flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={L('or type a town or health zone', 'ou tapez une ville ou une zone de santé')} aria-label={L('Type a place', 'Taper un lieu')}
                    onKeyDown={(e) => { if (e.key === 'Enter' && hits[0]) pick(hits[0]); }}
                    className="h-10 w-full rounded-full border border-rule bg-paper pl-9 pr-3 text-[13px] text-ink outline-none placeholder:text-ink-3 focus:border-accent" />
                  {hits.length > 0 && (
                    <ul className="absolute bottom-11 left-0 z-10 w-full overflow-hidden rounded-xl border border-rule bg-paper py-1 shadow-lg">
                      {hits.map((p) => <li key={p.label + p.sub}><button onClick={() => pick(p)} className="flex w-full justify-between gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-paper-2"><span className="truncate text-ink">{p.label}</span><span className="flex-none text-ink-3">{p.sub}</span></button></li>)}
                    </ul>
                  )}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-ink-3">{L('Type:', 'Type :')}</span>
                {FACILITY_CATS.map((c) => (
                  <button key={c} onClick={() => toggleCat(c)} aria-pressed={cats.has(c)}
                    className={`rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-colors ${cats.has(c) ? 'border-accent bg-accent/10 text-ink' : 'border-rule text-ink-2 hover:text-ink'}`}>
                    {facilityCatLabel(c)}
                  </button>
                ))}
                {cats.size > 0 && <button onClick={() => { setCats(new Set()); if (last.current) run(last.current.lat, last.current.lon, last.current.origin, new Set()); }} className="text-[11.5px] text-accent hover:underline">{L('All', 'Tous')}</button>}
              </div>
            </div>
          </div>

          {/* side notes */}
          <aside className="space-y-4 text-[12.5px] leading-relaxed text-ink-2">
            <div className="rounded-2xl border border-warn/40 bg-warn/10 p-4 text-ink">
              <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4 text-warn" />{L('Before you rely on this', 'Avant de vous y fier')}</p>
              <p className="mt-1.5">{L('Facilities come from OpenStreetMap, which is community-maintained and may be incomplete or out of date. Call ahead, and in an emergency contact your local emergency services.', 'Les établissements proviennent d’OpenStreetMap, maintenu par la communauté et parfois incomplet ou obsolète. Téléphonez avant de vous déplacer et, en cas d’urgence, contactez les services d’urgence locaux.')}</p>
            </div>
            <div className="rounded-2xl border border-rule p-4">
              <p className="flex items-center gap-2 font-semibold text-ink"><Hospital className="h-4 w-4 text-accent" />{L('How it works', 'Comment ça marche')}</p>
              <p className="mt-1.5">{L('Your location is used only in your browser to measure distance; it is never sent anywhere. Distances are straight-line (“as the crow flies”), so road distance will be longer.', 'Votre position n’est utilisée que dans votre navigateur pour calculer la distance ; elle n’est jamais transmise. Les distances sont à vol d’oiseau ; la distance par la route sera plus longue.')}</p>
            </div>
            <p className="text-[11px] text-ink-3">{L('Source:', 'Source :')} {FACILITY_SOURCE}</p>
          </aside>
        </div>
      </div>
    </section>
  );
}
