/* ============================================================================
   The outbreak map. Leaflet with the keyless Esri Gray Canvas basemap (OpenStreetMap
   data) over a vector outline that keeps the map readable if tiles cannot load.

   Two levels:
   - all countries: one bubble per country, nothing sub-national drawn;
   - one country: its sub-national layer fades in. DR Congo has figures by
     health zone (INSP). Kenya and Nigeria show their counties / states as
     outlines only: their ministries publish national figures, so no area is
     coloured and no case location is implied. Uganda shows its outline.
   ========================================================================== */
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { COUNTRIES, GEO, MOB, PROV, ZONES, ADMIN1, EWS_LEVEL, EWS_ZONE, cname, fmt, dateShort, type Zone } from '@/lib/data';
import { LAYERS, type LayerKey, type Dir, zoneValue, classOf } from './layers';
import { L as TR } from '@/lib/i18n';

const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const rgb = (v: string) => `rgb(${css(v).split(' ').join(',')})`;
const dark = () => document.documentElement.dataset.theme === 'dark';
/* Esri Gray Canvas: keyless, no-label light/dark grey base (good under a choropleth).
   Esri tiles are addressed /tile/{z}/{y}/{x} (row before column), unlike the usual {z}/{x}/{y}. */
const tileUrl = () => `https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_${dark() ? 'Dark' : 'Light'}_Gray_Base/MapServer/tile/{z}/{y}/{x}`;

const byZone = Object.fromEntries(ZONES.map((z) => [z.z, z]));
const affected = new Set(PROV.map((p) => p.p));
const statusOf = Object.fromEntries(COUNTRIES.map((c) => [c.base, c.st]));
const keyOfBase = Object.fromEntries(COUNTRIES.map((c) => [c.base, c.key]));
export const COUNTRY_BOUNDS: Record<string, L.LatLngBounds> = Object.fromEntries(
  COUNTRIES.map((c) => { const f = GEO.africa.features.find((x) => (x.properties as { n: string }).n === c.base); return [c.key, f ? L.geoJSON(f).getBounds() : L.latLngBounds([c.lat - 3, c.lon - 3], [c.lat + 3, c.lon + 3])]; }),
);
const REGION = COUNTRIES.reduce((b, c) => b.extend(COUNTRY_BOUNDS[c.key]), L.latLngBounds(COUNTRY_BOUNDS.COD.getSouthWest(), COUNTRY_BOUNDS.COD.getNorthEast()));
const ADMIN_OF: Record<string, 'KEN' | 'NGA'> = { Kenya: 'KEN', Nigeria: 'NGA' };
/* DR Congo opens on its affected health zones, not the whole country */
const ZONES_BOUNDS = L.geoJSON(GEO.zones).getBounds();
const small = () => matchMedia('(max-width: 767px)').matches;

export type MapApi = { flyToZone: (z: Zone) => void };
type Tip = { x: number; y: number; html: string } | null;
type Props = {
  layer: LayerKey; dir: Dir; sel: string | null; country: string;
  onSelect: (z: string | null) => void; onCountry: (key: string) => void; onTip: (t: Tip) => void;
  apiRef: React.MutableRefObject<MapApi | null>;
};

export function OutbreakMap({ layer, dir, sel, country, onSelect, onCountry, onTip, apiRef }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const S = useRef({ layer, dir, sel, country });
  S.current = { layer, dir, sel, country };
  const M = useRef<{ map: L.Map; tiles: L.TileLayer; zones: L.GeoJSON; prov: L.GeoJSON; ctry: L.GeoJSON; land: L.GeoJSON; admin: Record<string, L.GeoJSON>; flows: L.LayerGroup; markers: Record<string, L.CircleMarker>; rings: Record<string, L.CircleMarker> } | null>(null);

  /* ---------- build once ---------- */
  useEffect(() => {
    const map = L.map(el.current!, { zoomControl: false, minZoom: 3, maxZoom: 13, zoomSnap: 0.25 }).fitBounds(REGION, { padding: [30, 30] });
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    map.attributionControl.setPrefix(small() ? false : '<a href="https://leafletjs.com">Leaflet</a>');
    for (const [name, z] of [['base', 150], ['ctry', 360], ['zones', 400], ['admin', 405], ['flows', 450], ['bubbles', 460]] as const) map.createPane(name).style.zIndex = String(z);

    const land = L.geoJSON(GEO.africa, { pane: 'base', interactive: false, style: () => ({ color: css('--map-line'), weight: 0.6, fillColor: css('--map-land'), fillOpacity: 1 }) }).addTo(map);
    const tiles = L.tileLayer(tileUrl(), { maxZoom: 16, className: 'base-tiles',
      attribution: 'Tiles &copy; <a href="https://www.esri.com/">Esri</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' + (small() ? '' : ' · zones: INRB-UMIE v1 · KE/NG: geoBoundaries') }).addTo(map);

    /* countries: tinted by status, click to open */
    const ctry = L.geoJSON(GEO.africa, {
      pane: 'ctry',
      style: (f) => { const n = (f!.properties as { n: string }).n, st = statusOf[n], open = keyOfBase[n] === S.current.country; return { color: st ? rgb(st === 'active' ? '--st-active' : '--st-over') : 'transparent', weight: st ? 1.2 : 0, fillColor: st === 'active' ? rgb('--st-active') : rgb('--st-over'), fillOpacity: st && !open ? 0.1 : 0 }; },
      onEachFeature: (f, l) => {
        const n = (f.properties as { n: string }).n, key = keyOfBase[n]; if (!key) { (l as L.Path).options.interactive = false; return; }
        l.on('click', () => { if (S.current.country !== key) onCountry(key); });
      },
    }).addTo(map);

    /* DR Congo provinces and health zones */
    const prov = L.geoJSON(GEO.provinces, {
      pane: 'zones',
      style: (f) => ({ color: css('--map-line'), weight: 1.1, fillColor: rgb('--st-none'), fillOpacity: affected.has((f!.properties as { n: string }).n) ? 0 : 0.35 }),
      onEachFeature: (f, l) => {
        const n = (f.properties as { n: string }).n;
        l.bindTooltip(n, { permanent: true, direction: 'center', className: affected.has(n) ? 'plabel plabel-aff' : 'plabel', opacity: 1 });
        l.on('mousemove', (e: L.LeafletMouseEvent) => onTip({ x: e.originalEvent.clientX, y: e.originalEvent.clientY, html: `<b>${n}</b> <span class="t3">· ${TR('province', 'province')}</span><br>${affected.has(n) ? TR('Affected · unshaded zones have no confirmed case', 'Touchée · les zones non ombrées n’ont aucun cas confirmé') : TR('No confirmed case reported', 'Aucun cas confirmé déclaré')}` }));
        l.on('mouseout', () => onTip(null));
      },
    });
    const zones = L.geoJSON(GEO.zones, {
      pane: 'zones',
      onEachFeature: (f, l) => {
        const z = byZone[(f.properties as { z: string }).z];
        l.bindTooltip(z.z, { permanent: true, direction: 'center', className: 'zlabel', opacity: 1 });
        l.on('mousemove', (e: L.LeafletMouseEvent) => { (l as L.Path).setStyle({ weight: 2, color: css('--hover-line') }); onTip({ x: e.originalEvent.clientX, y: e.originalEvent.clientY, html: tipHtml(z, S.current.layer, S.current.dir) }); });
        l.on('mouseout', () => { paintZone(l as L.Path); onTip(null); });
        l.on('click', () => onSelect(z.z));
      },
    });

    /* Kenya counties, Nigeria states: outlines only */
    const admin: Record<string, L.GeoJSON> = {};
    for (const [key, code] of Object.entries(ADMIN_OF)) {
      const c = COUNTRIES.find((x) => x.key === key)!;
      admin[key] = L.geoJSON(ADMIN1[code], {
        pane: 'admin',
        style: () => ({ color: rgb('--ink-3'), weight: 0.9, dashArray: '3 3', fillColor: rgb('--st-active'), fillOpacity: 0.04 }),
        onEachFeature: (f, l) => {
          const n = (f.properties as { shapeName: string }).shapeName;
          l.bindTooltip(n, { permanent: true, direction: 'center', className: 'alabel', opacity: 1 });
          l.on('mousemove', (e: L.LeafletMouseEvent) => { (l as L.Path).setStyle({ weight: 2, dashArray: '' }); onTip({ x: e.originalEvent.clientX, y: e.originalEvent.clientY, html: `<b>${n}</b> <span class="t3">· ${code === 'KEN' ? TR('county', 'comté') : TR('state', 'État')}</span><br>${TR('No sub-national figures published', 'Aucun chiffre infranational publié')}<br><span class="t3">${cname(c)}: ${fmt(c.c)} ${TR('confirmed nationally', 'confirmés au niveau national')} (${c.src}, ${dateShort(c.asof)})</span>` }); });
          l.on('mouseout', () => { admin[key].resetStyle(l); onTip(null); });
        },
      });
    }

    const flows = L.layerGroup([], { pane: 'flows' }).addTo(map);

    /* proportional bubbles — small fixed-size circleMarkers drawn in the map's own SVG
       renderer (same renderer as the country polygons), so they track the map exactly on
       zoom instead of floating like an HTML overlay, while staying small. Sized by cases
       (√ scale); active countries carry one slow expanding ring, as before. Centred on the
       country's own drawn outline, not its capital (Kampala, Nairobi read as outside the shape). */
    const bubbleRenderer = L.svg({ pane: 'bubbles' });
    const markers: Record<string, L.CircleMarker> = {};
    const rings: Record<string, L.CircleMarker> = {};
    const max = Math.max(...COUNTRIES.map((c) => c.c));
    COUNTRIES.forEach((c) => {
      const r = 6 + 16 * Math.sqrt(c.c / max);         // small proportional pixel radius
      const active = c.st === 'active';
      const center = COUNTRY_BOUNDS[c.key].getCenter();
      if (active) rings[c.key] = L.circleMarker(center, { renderer: bubbleRenderer, radius: Math.max(r, 10), className: 'cring', interactive: false, stroke: false }).addTo(map);
      const m = L.circleMarker(center, {
        renderer: bubbleRenderer, radius: r, className: `cbubble ${c.st}`,
        color: rgb('--paper'), weight: 1.5, fillColor: rgb(active ? '--st-active' : '--st-over'),
        fillOpacity: active ? 0.9 : 0.8, interactive: true, bubblingMouseEvents: false,
      }).addTo(map);
      m.on('mousemove', (e: L.LeafletMouseEvent) => onTip({ x: e.originalEvent.clientX, y: e.originalEvent.clientY, html: `<b>${cname(c)}</b> <span class="chip ${c.st}">${c.st === 'active' ? TR('Active', 'Active') : TR('Over', 'Terminée')}</span><br><span class="num">${fmt(c.c)}</span> ${TR('confirmed', 'confirmés')} · <span class="num">${fmt(c.d)}</span> ${TR('deaths', 'décès')}<br><span class="t3">${c.src}, ${dateShort(c.asof)}</span><br><span class="t3">${c.key === 'COD' ? TR('Click to open the health-zone map', 'Cliquer pour ouvrir la carte des zones de santé') : TR('Click to zoom · national figures only', 'Cliquer pour zoomer · chiffres nationaux uniquement')}</span>` }));
      m.on('mouseout', () => onTip(null));
      m.on('click', () => { onTip(null); onCountry(c.key); });
      markers[c.key] = m;
    });

    M.current = { map, tiles, zones, prov, ctry, land, admin, flows, markers, rings };

    const onZoom = () => {
      const z = map.getZoom();
      el.current!.classList.toggle('labels-on', z >= 7.5);
      el.current!.classList.toggle('plabels-on', z >= 4.5);
      el.current!.classList.toggle('alabels-on', z >= 6);
      drawFlows();
    };
    map.on('zoomend', onZoom); onZoom();
    map.on('click', (e) => { if (!(e.originalEvent.target as Element).closest('.leaflet-interactive,.leaflet-marker-icon')) onSelect(null); });
    apiRef.current = { flyToZone: (z) => map.flyTo([z.lat, z.lon], Math.max(map.getZoom(), 7.5), { duration: 0.9 }) };

    const ro = new ResizeObserver(() => { map.invalidateSize(); if (pendingFit.current) { fitCountry(false); paintAll(); } }); ro.observe(el.current!);
    const mo = new MutationObserver(() => { tiles.setUrl(tileUrl()); paintAll(); }); mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => { ro.disconnect(); mo.disconnect(); map.remove(); M.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- country level: which sub-national layer shows, where the map goes ---------- */
  useEffect(() => {
    const m = M.current; if (!m) return;
    const { map } = m;
    const showDrc = country === 'COD';
    for (const l of [m.prov, m.zones]) { if (showDrc && !map.hasLayer(l)) l.addTo(map); if (!showDrc && map.hasLayer(l)) map.removeLayer(l); }
    for (const [k, l] of Object.entries(m.admin)) { const on = country === k; if (on && !map.hasLayer(l)) l.addTo(map); if (!on && map.hasLayer(l)) map.removeLayer(l); }
    /* the selected country's bubble gives way to its map; Kenya and Nigeria keep theirs, as their only figure is national */
    Object.entries(m.markers).forEach(([k, mk]) => { const hide = k === 'COD' && showDrc; [mk.getElement(), m.rings[k]?.getElement()].forEach((el) => { const e = el as SVGElement | null; if (e) { e.style.opacity = hide ? '0' : '1'; e.style.pointerEvents = hide ? 'none' : ''; } }); });
    el.current!.dataset.country = country;
    fitCountry(true);
    paintAll();
  }, [country]);

  /* Fly to the selected country. A map inside a hidden page has no size, and fitting it then
     leaves it blank: in that case the fit waits until the map is visible again. */
  const pendingFit = useRef(false);
  function fitCountry(animate: boolean) {
    const m = M.current; if (!m) return;
    const { map } = m, c = S.current.country;
    if (!el.current || el.current.clientWidth === 0) { pendingFit.current = true; return; }
    pendingFit.current = false;
    map.invalidateSize();
    const tl: L.PointExpression = c === 'all' ? [30, 30] : small() ? [12, 130] : [24, 120], br: L.PointExpression = c === 'all' ? [30, 30] : small() ? [12, 40] : [24, 24];
    const b = c === 'all' ? REGION : c === 'COD' ? ZONES_BOUNDS : COUNTRY_BOUNDS[c];
    const opts = { paddingTopLeft: tl, paddingBottomRight: br, maxZoom: c === 'COD' ? 7.5 : c === 'all' ? 6 : 6.5 };
    if (animate) map.flyToBounds(b, { ...opts, duration: 1 }); else map.fitBounds(b, { ...opts, animate: false });
  }

  /* ---------- paint ---------- */
  function paintZone(l: L.Path) {
    const { layer: ly, dir: d, sel: s } = S.current;
    const n = ((l as unknown as { feature: GeoJSON.Feature }).feature.properties as { z: string }).z, on = n === s;
    const base = { color: on ? rgb('--accent') : css('--zone-line'), weight: on ? 2.8 : 0.7, dashArray: '' };
    if (ly === 'ews') {
      const lvl = EWS_LEVEL[n] || 'na';
      if (lvl === 'na') l.setStyle({ ...base, fillColor: rgb('--ink-3'), fillOpacity: 0.14, dashArray: '3 3', color: on ? rgb('--accent') : rgb('--ink-3'), weight: on ? 2.8 : 0.9 });
      else l.setStyle({ ...base, fillColor: rgb(lvl === 'critical' ? '--ew-critical' : lvl === 'alert' ? '--ew-alert' : '--ew-normal'), fillOpacity: lvl === 'normal' ? 0.45 : 0.82 });
      return;
    }
    const k = classOf(ly, d, n);
    if (k === 'na') l.setStyle({ ...base, fillColor: rgb('--ink-3'), fillOpacity: 0, dashArray: '3 3', color: on ? rgb('--accent') : rgb('--ink-3'), weight: on ? 2.8 : 0.9 });
    else if (k === 'zero') l.setStyle({ ...base, fillColor: css('--map-land'), fillOpacity: 0.6 });
    else l.setStyle({ ...base, fillColor: css(LAYERS[ly].ramp[k]), fillOpacity: 0.82 });
  }
  function paintAll() {
    const m = M.current; if (!m) return;
    m.land.setStyle({ color: css('--map-line'), fillColor: css('--map-land') });
    m.prov.resetStyle(); m.ctry.resetStyle();
    Object.values(m.admin).forEach((a) => a.resetStyle());
    m.zones.eachLayer((l) => paintZone(l as L.Path));
    drawFlows();
  }
  function drawFlows() {
    const m = M.current; if (!m) return;
    m.flows.clearLayers();
    const { layer: ly, dir: d, sel: s, country: c } = S.current;
    if (ly !== 'mob' || c !== 'COD' || !s || !MOB[s]) return;
    const home = byZone[s], mob = MOB[s];
    const put = (pairs: typeof mob.in, inbound: boolean) => pairs.slice(0, 5).forEach(([name, v, lo, hi]) => {
      const o = byZone[name]; if (!o) return;
      const a: L.LatLngTuple = inbound ? [o.lat, o.lon] : [home.lat, home.lon];
      const b: L.LatLngTuple = inbound ? [home.lat, home.lon] : [o.lat, o.lon];
      const pts = curve(m.map, a, b, inbound ? 1 : -1);
      const col = inbound ? rgb('--flow-in') : rgb('--flow-out');
      /* soft underlay + an animated marching-dash line on top, as in the Briefing's story map */
      L.polyline(pts, { pane: 'flows', color: col, weight: 5, opacity: 0.18, lineCap: 'round', interactive: false }).addTo(m.flows);
      L.polyline(pts, { pane: 'flows', color: col, weight: 2.8, opacity: 0.95, lineCap: 'round', className: 'flow-anim', dashArray: '7 9' })
        .bindTooltip(`<b>${inbound ? name : s}</b> → <b>${inbound ? s : name}</b><br><span class="num">${fmt(v)}</span> ${TR('estimated relocations', 'déplacements estimés')}${lo != null && hi != null ? `<br><span class="t3">${TR('range', 'plage')} ${fmt(lo)}–${fmt(hi)}</span>` : ''}`, { sticky: true, className: 'ltip' })
        .addTo(m.flows);
      m.flows.addLayer(arrowHead(m.map, pts, col));
      L.circleMarker(inbound ? a : b, { pane: 'flows', radius: 3.5, color: col, weight: 1.5, fillColor: col, fillOpacity: 1, interactive: false }).addTo(m.flows);
    });
    if (d !== 'out') put(mob.in, true);
    if (d !== 'in') put(mob.out, false);
  }
  useEffect(() => { paintAll(); }, [layer, dir, sel]);
  /* Mobility: frame the selected zone and the ends of its top flows, both directions */
  useEffect(() => {
    const m = M.current; if (!m || layer !== 'mob' || country !== 'COD' || !sel || !MOB[sel]) return;
    const pts = [sel, ...MOB[sel].in.slice(0, 5).map((f) => f[0]), ...MOB[sel].out.slice(0, 5).map((f) => f[0])]
      .map((n) => byZone[n]).filter(Boolean).map((z) => [z.lat, z.lon] as L.LatLngTuple);
    setTimeout(() => { if (el.current && el.current.clientWidth > 0) m.map.flyToBounds(L.latLngBounds(pts), { padding: [70, 70], maxZoom: 8.5, duration: 0.9 }); }, 50);
  }, [layer, sel]);

  return <div ref={el} className="absolute inset-0" role="application" aria-label="Outbreak map" />;
}

/* curved path in screen space, bending the same way at any zoom */
function curve(map: L.Map, a: L.LatLngTuple, b: L.LatLngTuple, side: number) {
  const A = map.latLngToLayerPoint(a), B = map.latLngToLayerPoint(b);
  const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2, dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy) || 1;
  const off = Math.min(60, len * 0.22) * side;
  const C = L.point(mx - (dy / len) * off, my + (dx / len) * off);
  const pts: L.LatLng[] = [];
  for (let i = 0; i <= 24; i++) { const t = i / 24, u = 1 - t; pts.push(map.layerPointToLatLng(L.point(u * u * A.x + 2 * u * t * C.x + t * t * B.x, u * u * A.y + 2 * u * t * C.y + t * t * B.y))); }
  return pts;
}
function arrowHead(map: L.Map, pts: L.LatLng[], col: string) {
  const i = Math.floor(pts.length * 0.62), P = map.latLngToLayerPoint(pts[i]), Q = map.latLngToLayerPoint(pts[i + 1]);
  const ang = Math.atan2(Q.y - P.y, Q.x - P.x), s = 7;
  const tri = [[0, s], [2.5, s * 0.8], [-2.5, s * 0.8]].map(([da, r]) => map.layerPointToLatLng(L.point(P.x + Math.cos(ang + da) * r, P.y + Math.sin(ang + da) * r)));
  return L.polygon(tri, { pane: 'flows', color: col, fillColor: col, fillOpacity: 1, weight: 1, interactive: false });
}

function tipHtml(z: Zone, ly: LayerKey, d: Dir) {
  const head = `<b>${z.z}</b> <span class="t3">· ${z.p}</span><br>`;
  if (ly === 'mob') {
    const m = MOB[z.z];
    return head + (m ? `<span class="num">${fmt(m.tin)}</span> ${TR('arrivals', 'arrivées')} · <span class="num">${fmt(m.tout)}</span> ${TR('departures', 'départs')}<br><span class="t3">${TR('April 2026 estimates · click for flows', 'estimations avril 2026 · cliquer pour les flux')}</span>` : `<span class="t3">${TR('No Flowminder coverage', 'Pas de couverture Flowminder')}</span>`);
  }
  if (ly === 'ews') {
    const e = EWS_ZONE[z.z];
    const name: Record<string, [string, string]> = { critical: ['Critical', 'Critique'], alert: ['Alert', 'Alerte'], normal: ['Normal', 'Normal'], na: ['Not assessed', 'Non évalué'] };
    const lvl = e?.level || 'na';
    const col = lvl === 'na' ? 'var(--ink-3)' : `rgb(var(--ew-${lvl}))`;
    const why = lvl === 'critical' || lvl === 'alert'
      ? `<br><span class="t3">${e.flags.includes('rise') ? `${fmt(e.rolling)} ${TR('new in 7 days', 'nouveaux en 7 jours')}` : e.flags.includes('newzone') ? TR('newly affected', 'nouvellement touchée') : TR('case after a quiet period', 'cas après une période calme')}</span>`
      : '';
    return head + `<b style="color:${col}">${TR(name[lvl][0], name[lvl][1])}</b>${why}<br><span class="t3">${TR('automated signal · verify against WHO', 'signal automatisé · vérifier auprès de l’OMS')}</span>`;
  }
  return head + `<span class="num">${fmt(zoneValue('c', d, z.z))}</span> ${TR('cases', 'cas')} · <span class="num">${fmt(zoneValue('d', d, z.z))}</span> ${TR('deaths', 'décès')} · <span class="num">${fmt(zoneValue('k', d, z.z))}</span>/100k<br><span class="t3">${TR('Click for details', 'Cliquer pour les détails')}</span>`;
}
