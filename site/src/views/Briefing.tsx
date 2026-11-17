/* ============================================================================
   Briefing: a scroll-driven story over a full-screen map.
   The map is pinned; cards slide over it; an on-map panel counts up the
   figures for each step. One IntersectionObserver picks the active step.
   All figures come from lib/briefing.ts, which computes them from the data.
   ========================================================================== */
import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Area, AreaChart, ReferenceArea, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { ArrowDown, ArrowRight, BellRing, Map as MapIcon } from 'lucide-react';
import { COUNTRIES, GEO, LATEST, MOB, PROV, ZONES, fmt, dateShort, dateLong } from '@/lib/data';
import { STEPS, PHASES, FIRST, ZONES_OVER_TIME, phaseOf, type Step, type MapSpec, type Hud } from '@/lib/briefing';
import type { Route } from '@/components/TopNav';

const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const rgb = (v: string) => `rgb(${css(v).split(' ').join(',')})`;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const desktop = () => matchMedia('(min-width: 1024px)').matches;
const byZone = Object.fromEntries(ZONES.map((z) => [z.z, z]));
const affected = new Set(PROV.map((p) => p.p));
const PHASE_VARS = ['--t1', '--t2', '--t3', '--t4', '--t5'];
const MOB_RAMP = ['--m1', '--m2', '--m3', '--m4', '--m5', '--m6'];
const MOB_BREAKS = [1, 250, 1000, 2500, 5000, 10000];
const ALL_ZONES = ZONES.map((z) => z.z);

/* ---------- the scenes: an opening screen, two chapters, a close ---------- */
type Scene =
  | { kind: 'intro'; map: MapSpec }
  | { kind: 'chapter'; n: 1 | 2; title: string; line: string; map: MapSpec; hud: Hud; range?: [string, string] }
  | { kind: 'step'; step: Step }
  | { kind: 'outro'; map: MapSpec };
const first = (c: 1 | 2) => STEPS.find((s) => s.chapter === c)!;
const SCENES: Scene[] = [
  { kind: 'intro', map: { mode: 'spread', phase: 4, highlight: [], focus: ALL_ZONES } },
  { kind: 'chapter', n: 1, title: 'How it spread', line: 'Each health zone lights up on the date of the first SitRep that lists it with a confirmed case.', map: { ...first(1).map, highlight: [] }, hud: first(1).hud, range: first(1).range },
  ...STEPS.filter((s) => s.chapter === 1).map((step) => ({ kind: 'step' as const, step })),
  { kind: 'chapter', n: 2, title: 'Where people move', line: 'Estimated relocations between health zones in April 2026: where an outbreak can travel.', map: { ...first(2).map, highlight: [] }, hud: first(2).hud },
  ...STEPS.filter((s) => s.chapter === 2).map((step) => ({ kind: 'step' as const, step })),
  { kind: 'outro', map: { mode: 'spread', phase: 4, highlight: [], focus: ALL_ZONES } },
];
const sceneMap = (s: Scene) => (s.kind === 'step' ? s.step.map : s.map);
const sceneHud = (s: Scene): { hud: Hud; chapter: 1 | 2; range?: [string, string] } | null =>
  s.kind === 'step' ? { hud: s.step.hud, chapter: s.step.chapter, range: s.step.range } : s.kind === 'chapter' ? { hud: s.hud, chapter: s.n, range: s.range } : null;

/* ---------- counting numbers ---------- */
function useCount(target: number, ms = 900) {
  const [v, setV] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (reduced()) { setV(target); from.current = target; return; }
    const a = from.current, t0 = performance.now(); let raf = 0;
    const tick = (t: number) => { const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3); setV(Math.round(a + (target - a) * e)); if (k < 1) raf = requestAnimationFrame(tick); else from.current = target; };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}
function Count({ value, className }: { value: number; className?: string }) { const v = useCount(value); return <span className={`num ${className ?? ''}`}>{fmt(v)}</span>; }
/* big counters shrink for five-digit values so two fit side by side */
const big = (v: number) => (v >= 10000 ? 'text-[1.35rem] md:text-[1.6rem]' : 'text-[1.6rem] md:text-[2.2rem]');

/* ---------- the map ---------- */
function StoryMap({ spec }: { spec: MapSpec }) {
  const el = useRef<HTMLDivElement>(null);
  const R = useRef<{ map: L.Map; zones: L.GeoJSON; flows: L.LayerGroup; rings: L.LayerGroup } | null>(null);
  const shown = useRef<Set<string>>(new Set());

  useEffect(() => {
    const map = L.map(el.current!, { zoomControl: false, scrollWheelZoom: false, dragging: !L.Browser.mobile, doubleClickZoom: false, zoomSnap: 0.25, attributionControl: true }).fitBounds(L.geoJSON(GEO.zones).getBounds());
    map.attributionControl.setPrefix(false);
    map.createPane('base').style.zIndex = '150';
    L.geoJSON(GEO.africa, { pane: 'base', interactive: false, style: () => ({ color: css('--map-line'), weight: 0.6, fillColor: css('--map-land'), fillOpacity: 1 }) }).addTo(map);
    const dark = document.documentElement.dataset.theme === 'dark';
    L.tileLayer(`https://{s}.basemaps.cartocdn.com/${dark ? 'dark_nolabels' : 'light_nolabels'}/{z}/{x}/{y}{r}.png`, { subdomains: 'abcd', attribution: '&copy; OpenStreetMap &copy; CARTO' }).addTo(map);
    L.geoJSON(GEO.provinces, {
      interactive: false,
      style: (f) => ({ color: css('--map-line'), weight: 1.1, fillColor: rgb('--st-none'), fillOpacity: affected.has((f!.properties as { n: string }).n) ? 0 : 0.22 }),
      onEachFeature: (f, l) => l.bindTooltip((f.properties as { n: string }).n, { permanent: true, direction: 'center', className: 'plabel story-plabel' }),
    }).addTo(map);
    const zones = L.geoJSON(GEO.zones, { onEachFeature: (f, l) => { const n = (f.properties as { z: string }).z; l.bindTooltip(() => zoneTip(n), { sticky: true, className: 'ltip' }); } }).addTo(map);
    const flows = L.layerGroup().addTo(map), rings = L.layerGroup().addTo(map);
    R.current = { map, zones, flows, rings };
    const ro = new ResizeObserver(() => map.invalidateSize()); ro.observe(el.current!);
    return () => { ro.disconnect(); map.remove(); };
  }, []);

  useEffect(() => {
    const r = R.current; if (!r) return;
    const s = spec, now = new Set<string>();
    r.zones.eachLayer((layer) => {
      const l = layer as L.Path & { feature: GeoJSON.Feature; _path?: SVGPathElement };
      const n = (l.feature.properties as { z: string }).z, hi = s.highlight.includes(n);
      let st: L.PathOptions;
      if (s.mode === 'spread') {
        const p = phaseOf(n);
        if (p < 0 || p > (s.phase ?? 0)) st = { color: rgb('--ink-3'), weight: 0.5, opacity: 0.3, fillOpacity: 0, dashArray: '2 3' };
        else { now.add(n); st = { color: hi ? rgb('--ink') : css('--zone-line'), weight: hi ? 1.6 : 0.6, opacity: 1, dashArray: '', fillColor: css(PHASE_VARS[p]), fillOpacity: p === s.phase ? 0.95 : 0.6 }; }
      } else {
        const m = MOB[n];
        if (!m) st = { color: hi ? rgb('--ink') : rgb('--ink-3'), weight: hi ? 1.6 : 0.7, opacity: 1, dashArray: '3 3', fillColor: rgb('--ink-3'), fillOpacity: hi ? 0.25 : 0.04 };
        else { now.add(n); const v = m.tin + m.tout; let k = 0; while (k < MOB_BREAKS.length - 1 && v >= MOB_BREAKS[k + 1]) k++; st = { color: hi ? rgb('--ink') : css('--zone-line'), weight: hi ? 1.8 : 0.6, opacity: 1, dashArray: '', fillColor: css(MOB_RAMP[k]), fillOpacity: s.flows ? 0.4 : 0.85 }; }
      }
      l.setStyle(st);
      /* zones that just appeared fade in */
      const path = l._path;
      if (path && now.has(n) && !shown.current.has(n) && !reduced()) { path.classList.remove('zone-enter'); void path.getBoundingClientRect(); path.classList.add('zone-enter'); }
    });
    shown.current = now;

    r.flows.clearLayers(); r.rings.clearLayers();
    (s.flows ?? []).forEach((f) => {
      const a = byZone[f.from], b = byZone[f.to]; if (!a || !b) return;
      const col = f.kind === 'in' ? rgb('--flow-in') : rgb('--flow-out');
      const pts = arc(r.map, [a.lat, a.lon], [b.lat, b.lon], f.kind === 'in' ? 1 : -1);
      L.polyline(pts, { color: col, weight: 5, opacity: 0.18, interactive: false }).addTo(r.flows);
      L.polyline(pts, { color: col, weight: 2.8, opacity: 0.95, className: 'flow-anim', dashArray: '7 9' })
        .bindTooltip(`<b>${f.from}</b> → <b>${f.to}</b><br>${fmt(f.v)} estimated relocations`, { sticky: true, className: 'ltip' }).addTo(r.flows);
      L.circleMarker(f.kind === 'in' ? [a.lat, a.lon] : [b.lat, b.lon], { radius: 3.5, color: col, fillColor: col, fillOpacity: 1, weight: 1, interactive: false }).addTo(r.flows);
    });
    [...s.highlight].filter((n) => byZone[n]).sort((a, b) => byZone[b].c - byZone[a].c).slice(0, 6).forEach((n) => {
      const z = byZone[n];
      L.marker([z.lat, z.lon], { interactive: false, keyboard: false, icon: L.divIcon({ className: 'sring', iconSize: [24, 24] }) }).addTo(r.rings)
        .bindTooltip(n, { permanent: true, direction: 'right', offset: [10, 0], className: 'zlabel story-label' });
    });

    const pts = s.focus.map((n) => byZone[n]).filter(Boolean).map((z) => [z.lat, z.lon] as L.LatLngTuple);
    if (pts.length && el.current && el.current.clientWidth > 0) {
      /* keep the framed area clear of the card (left on desktop, bottom on phones) and of the counter panel */
      const pad = desktop() ? { paddingTopLeft: [500, 70] as L.PointTuple, paddingBottomRight: [300, 70] as L.PointTuple } : { paddingTopLeft: [16, 100] as L.PointTuple, paddingBottomRight: [16, Math.round(el.current.clientHeight * 0.55)] as L.PointTuple };
      const b = L.latLngBounds(pts);
      if (reduced()) r.map.fitBounds(b, { ...pad, maxZoom: 8 }); else r.map.flyToBounds(b, { ...pad, maxZoom: 8, duration: 1.2 });
    }
  }, [spec]);

  return <div ref={el} className="absolute inset-0" role="img" aria-label="Story map" />;
}

function zoneTip(n: string) {
  const z = byZone[n], f = FIRST[n], m = MOB[n];
  return `<b>${n}</b> <span class="t3">· ${z?.p ?? ''}</span><br>` +
    (f ? `First listed ${f.after ? `between ${dateShort(f.after)} and ${dateShort(f.d)}` : dateShort(f.d)} <span class="t3">(${f.src})</span><br>` : '') +
    `<span class="num">${fmt(z?.c)}</span> cases to date` + (m ? ` · <span class="num">${fmt(m.tin)}</span> in / <span class="num">${fmt(m.tout)}</span> out (Apr)` : '');
}
function arc(map: L.Map, a: L.LatLngTuple, b: L.LatLngTuple, side: number) {
  const A = map.latLngToLayerPoint(a), B = map.latLngToLayerPoint(b);
  const dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy) || 1, off = Math.min(55, len * 0.24) * side;
  const C = L.point((A.x + B.x) / 2 - (dy / len) * off, (A.y + B.y) / 2 + (dx / len) * off);
  return Array.from({ length: 25 }, (_, i) => { const t = i / 24, u = 1 - t; return map.layerPointToLatLng(L.point(u * u * A.x + 2 * u * t * C.x + t * t * B.x, u * u * A.y + 2 * u * t * C.y + t * t * B.y)); });
}

/* ---------- on-map panel: counters, timeline, legend ---------- */
function Panel({ scene }: { scene: Scene }) {
  const h = sceneHud(scene); if (!h) return null;
  const spread = h.chapter === 1, spec = sceneMap(scene);
  const range = h.range ? [Date.parse(h.range[0] + 'T00:00:00Z'), Date.parse(h.range[1] + 'T00:00:00Z')] : null;
  return (
    <div className="pointer-events-auto absolute inset-x-3 top-3 z-[600] overflow-hidden rounded-2xl border border-rule bg-paper/95 shadow-xl backdrop-blur md:inset-x-auto md:right-5 md:top-5 md:w-[17rem]">
      <div className="h-1 bg-accent" />
      <div className="px-3.5 py-2.5 md:p-4">
        <p className="hidden text-[10px] font-extrabold uppercase tracking-[.16em] text-accent md:block">Chapter {h.chapter} · {spread ? 'How it spread' : 'Where people move'}</p>
        <div className="grid grid-cols-2 gap-3 md:mt-2">
          <div><Count value={h.hud.a.value} className={`block font-extrabold leading-none tracking-tight text-ink ${big(h.hud.a.value)}`} /><p className="mt-1 text-[10.5px] leading-tight text-ink-3">{h.hud.a.label}</p></div>
          <div><p className="leading-none"><Count value={h.hud.b.value} className={`font-extrabold tracking-tight text-ink ${big(h.hud.b.value)}`} />{h.hud.b.of && <span className="text-sm font-semibold text-ink-3">/{h.hud.b.of}</span>}</p><p className="mt-1 text-[10.5px] leading-tight text-ink-3">{h.hud.b.label}</p></div>
        </div>
        {spread ? (
          <div className="mt-3 hidden md:block">
            <div className="h-20">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={ZONES_OVER_TIME} margin={{ top: 4, right: 2, bottom: 0, left: 2 }}>
                  <defs><linearGradient id="zg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="rgb(var(--accent))" stopOpacity={0.35} /><stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity={0.02} /></linearGradient></defs>
                  <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} hide />
                  <YAxis hide domain={[0, 'dataMax']} />
                  {range && <ReferenceArea x1={range[0]} x2={range[1]} fill="rgb(var(--accent))" fillOpacity={0.12} />}
                  <Area type="stepAfter" dataKey="n" stroke="rgb(var(--accent))" strokeWidth={2} fill="url(#zg)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-between text-[10px] text-ink-3"><span>{dateShort(ZONES_OVER_TIME[0].d)}</span><span>zones listed over time</span><span>{dateShort(LATEST.d)}</span></div>
          </div>
        ) : null}
        <div className="mt-3 hidden border-t border-rule pt-2.5 text-[10.5px] text-ink-2 md:block">
          {spec.mode === 'spread' ? (
            <div className="flex flex-wrap gap-x-3 gap-y-1">{PHASES.map((p, i) => <span key={p.label} className={`flex items-center gap-1.5 transition-opacity ${i > (spec.phase ?? 0) ? 'opacity-30' : ''}`}><span className="h-2.5 w-2.5 rounded-sm" style={{ background: `var(${PHASE_VARS[i]})` }} />{p.label.replace('August–September', 'Aug–Sep').replace('October–November', 'Oct–Nov')}</span>)}</div>
          ) : (
            <>
              <div className="flex">{MOB_RAMP.map((r) => <span key={r} className="h-2 flex-1 first:rounded-l last:rounded-r" style={{ background: `var(${r})` }} />)}</div>
              <div className="num mt-1 flex justify-between text-[9.5px] text-ink-3">{MOB_BREAKS.map((b) => <span key={b}>{b >= 1000 ? `${b / 1000}k` : b}</span>)}</div>
              {spec.flows && <div className="mt-1.5 flex gap-3"><span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-flow-in" />Arrivals</span><span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-flow-out" />Departures</span></div>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- timeline under the map, chapter 1 ---------- */
function Timeline({ scene }: { scene: Scene }) {
  const h = sceneHud(scene); if (!h || h.chapter !== 1) return null;
  const p = sceneMap(scene).phase ?? 0;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-6 z-[600] hidden justify-center lg:flex lg:pl-[30rem]">
      <ol className="flex items-center gap-1 rounded-full border border-rule bg-paper/95 px-3 py-2 shadow-lg backdrop-blur">
        {PHASES.map((ph, i) => (
          <li key={ph.label} className="flex items-center gap-1">
            <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold transition-colors duration-500 ${i === p ? 'bg-accent text-white' : i < p ? 'text-ink' : 'text-ink-3'}`}>
              <span className="h-2 w-2 rounded-full" style={{ background: `var(${PHASE_VARS[i]})` }} />{ph.label.replace('August–September', 'Aug–Sep').replace('October–November', 'Oct–Nov')}
            </span>
            {i < PHASES.length - 1 && <span className={`h-px w-4 transition-colors duration-500 ${i < p ? 'bg-accent' : 'bg-rule'}`} />}
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ---------- page ---------- */
export function Briefing({ go }: { go: (r: Route) => void }) {
  const [cur, setCur] = useState(0);
  const [progress, setProgress] = useState(0);
  const refs = useRef<(HTMLElement | null)[]>([]);
  useEffect(() => {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) setCur(Number((e.target as HTMLElement).dataset.i)); }),
      { rootMargin: desktop() ? '-45% 0px -45% 0px' : '-55% 0px -35% 0px' });
    refs.current.forEach((r) => r && io.observe(r));
    const onScroll = () => { const h = document.documentElement; setProgress(Math.min(1, h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight))); };
    addEventListener('scroll', onScroll, { passive: true }); onScroll();
    return () => { io.disconnect(); removeEventListener('scroll', onScroll); };
  }, []);
  const scene = SCENES[cur];
  const spec = useMemo(() => sceneMap(scene), [scene]);
  const jump = (i: number) => refs.current[i]?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'center' });
  const ch2 = SCENES.findIndex((s) => s.kind === 'chapter' && s.n === 2);
  const ch1 = SCENES.findIndex((s) => s.kind === 'chapter' && s.n === 1);
  const countries = COUNTRIES.filter((c) => c.st === 'active').length;

  return (
    <div className="relative">
      {/* reading progress */}
      <div className="fixed inset-x-0 top-14 z-[900] h-[3px] bg-transparent"><div className="h-full origin-left bg-accent" style={{ transform: `scaleX(${progress})` }} /></div>

      {/* the pinned map */}
      <div className="sticky top-14 z-0 h-[calc(100dvh-3.5rem)] overflow-hidden">
        <StoryMap spec={spec} />
        <div className={`pointer-events-none absolute inset-0 z-[450] transition-opacity duration-700 ${scene.kind === 'intro' || scene.kind === 'outro' ? 'opacity-100' : 'opacity-0'}`}
          style={{ background: 'linear-gradient(90deg, rgb(var(--paper)) 0%, rgb(var(--paper) / .92) 38%, rgb(var(--paper) / .25) 70%, transparent 100%)' }} />
        <Panel scene={scene} />
        <Timeline scene={scene} />
        <div className="absolute left-6 top-5 z-[600] hidden gap-1 rounded-full border border-rule bg-paper/95 p-1 text-[11.5px] shadow-lg lg:flex">
          {([[ch1, 'How it spread'], [ch2, 'Where people move']] as const).map(([i, label], k) => (
            <button key={label} onClick={() => jump(i)} aria-pressed={sceneHud(scene)?.chapter === k + 1}
              className="rounded-full px-3 py-1 font-semibold text-ink-2 aria-pressed:bg-accent aria-pressed:text-white">{k + 1} · {label}</button>
          ))}
        </div>
      </div>

      {/* the scenes scroll over the map */}
      <div className="pointer-events-none relative z-10 -mt-[calc(100dvh-3.5rem)]">
        {SCENES.map((s, i) => (
          <section key={i} ref={(e) => (refs.current[i] = e)} data-i={i}
            className={`gutter flex ${s.kind === 'intro' ? 'min-h-[calc(100dvh-3.5rem)] items-center' : s.kind === 'chapter' ? 'min-h-[100dvh] items-center' : s.kind === 'outro' ? 'min-h-[100dvh] items-center pb-24' : 'min-h-[95dvh] items-end pb-[8dvh] lg:items-center lg:pb-0'}`}>
            {s.kind === 'intro' && <Intro countries={countries} onStart={() => jump(1)} />}
            {s.kind === 'chapter' && (
              <div className="pointer-events-auto w-full max-w-[27rem] rounded-3xl bg-[#08125C] p-7 text-white shadow-2xl ring-1 ring-white/10 md:p-8 lg:ml-6">
                <p className="text-[64px] font-extrabold leading-none tracking-tighter text-white/25 md:text-[88px]">0{s.n}</p>
                <h2 className="-mt-3 text-3xl font-extrabold tracking-tight md:text-4xl">{s.title}</h2>
                <p className="mt-3 font-serif text-[15px] font-light leading-relaxed text-white/85">{s.line}</p>
              </div>
            )}
            {s.kind === 'step' && <StepCard step={s.step} active={i === cur} />}
            {s.kind === 'outro' && <Outro go={go} />}
          </section>
        ))}
      </div>
    </div>
  );
}

function Intro({ countries, onStart }: { countries: number; onStart: () => void }) {
  const zones = Object.keys(FIRST).length;
  return (
    <div className="pointer-events-auto max-w-[40rem] py-10 lg:ml-6">
      <p className="text-[11px] font-extrabold uppercase tracking-[.18em] text-accent">Code for Africa · Briefing · SitRep N°{LATEST.s}</p>
      <h1 className="mt-4 text-[2.6rem] font-extrabold leading-[1.02] tracking-[-0.04em] text-ink md:text-[4rem]">How Bundibugyo spread across DR Congo, and where people move</h1>
      <p className="mt-5 max-w-[34rem] font-serif text-[16px] font-light leading-relaxed text-ink-2 md:text-[17px]">Six months of situation reports, zone by zone, and the movement between them. Scroll: the map follows the story.</p>
      <dl className="mt-8 grid max-w-[34rem] grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
        {([['Confirmed cases', LATEST.c, 'text-case'], ['Health zones', zones, 'text-ink'], ['Provinces', PROV.length, 'text-ink'], ['Active countries', countries, 'text-death']] as const).map(([l, v, c]) => (
          <div key={l} className="border-l-[3px] border-accent pl-3"><dd><Count value={v} className={`text-[1.75rem] font-extrabold leading-none tracking-tight ${c}`} /></dd><dt className="mt-1 text-[11px] font-semibold text-ink-3">{l}</dt></div>
        ))}
      </dl>
      <button onClick={onStart} className="mt-10 inline-flex items-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-bold text-white shadow-lg transition-transform hover:translate-y-0.5">
        Start the briefing <ArrowDown className="h-4 w-4 motion-safe:animate-bounce" />
      </button>
      <p className="mt-6 text-[11px] text-ink-3">INSP SitRep N°{LATEST.s}, {dateLong(LATEST.d)} · Flowminder / Vodacom, April 2026 · Verify against WHO before publishing.</p>
    </div>
  );
}

function StepCard({ step, active }: { step: Step; active: boolean }) {
  return (
    <article className={`pointer-events-auto w-full max-w-[27rem] rounded-3xl border bg-paper/95 shadow-2xl backdrop-blur transition-all duration-500 lg:ml-6 ${active ? 'translate-y-0 border-accent/30 opacity-100' : 'translate-y-3 border-rule opacity-60'}`}>
      <div className="flex">
        <div className="w-1.5 flex-none rounded-l-3xl bg-accent" />
        <div className="min-w-0 p-4 md:p-6">
          <p className="text-[10.5px] font-extrabold uppercase tracking-[.16em] text-accent">{step.kicker}</p>
          <h3 className="mt-1.5 text-[1.2rem] font-extrabold leading-tight tracking-[-0.03em] text-ink md:text-[1.7rem]">{step.title}</h3>
          <p className="mt-2 font-serif text-[13.5px] font-light leading-[1.65] text-ink-2 md:mt-2.5 md:text-[14.5px] md:leading-[1.7]">{step.body}</p>
          {step.note && <p className="mt-3 rounded-xl bg-paper-2 px-3 py-2 text-[11px] md:text-[11.5px] leading-snug text-ink-3">{step.note}</p>}
        </div>
      </div>
    </article>
  );
}

function Outro({ go }: { go: (r: Route) => void }) {
  return (
    <div className="pointer-events-auto max-w-[36rem] lg:ml-6">
      <p className="text-[11px] font-extrabold uppercase tracking-[.18em] text-accent">What next</p>
      <h2 className="mt-3 text-[2.2rem] font-extrabold leading-[1.05] tracking-[-0.04em] text-ink md:text-[3rem]">Explore every zone, or follow the early-warning work</h2>
      <p className="mt-4 font-serif text-[15.5px] font-light leading-relaxed text-ink-2">The map has cases, rates, deaths and the full mobility flows for each zone. Early-warning levels appear once the epidemiology team sets indicators and thresholds.</p>
      <div className="mt-7 flex flex-wrap gap-3">
        <button onClick={() => go('map')} className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-bold text-white shadow-lg"><MapIcon className="h-4 w-4" />Explore the map<ArrowRight className="h-4 w-4" /></button>
        <button onClick={() => go('early-warning')} className="inline-flex items-center gap-2 rounded-full border border-rule bg-paper px-5 py-3 text-sm font-bold text-ink"><BellRing className="h-4 w-4" />Early warning (in preparation)</button>
      </div>
    </div>
  );
}
