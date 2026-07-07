/* =============================================================================
 * ENGINE — reusable dashboard logic. Reads the globals defined in config.*.js
 * (FILL_RAMP, HZ, CONTEXT, POP, I18N, CSV, DATA_FILES, …) and renders the map,
 * panels, charts, modals, i18n and theme. No outbreak-specific values live here;
 * this file is identical across microsites. See TEMPLATE.md.
 * ========================================================================== */


// Per-zone time series + Flowminder mobility — fetched on init (see loadZoneData).
let zoneTrends=null, zoneMobility=null;

// National totals COMPUTED from the data (single source of truth) rather than hardcoded.
const drcCases=HZ.reduce((s,z)=>s+z.cases,0)+AWAITING_CASES; // 1544 mapped + 17 awaiting = 1561
const drcDeaths=HZ.reduce((s,z)=>s+z.deaths,0);              // 506
const totalConfirmed=drcCases+UGANDA.confirmed;             // 1581
const totalDeaths=drcDeaths+UGANDA.deaths;                 // 508
const zonesWithCases=HZ.length;                            // 36
function injectTotals(){ renderRespSummary(); }
/* ---- country summary: composite total + per-country breakdown ---- */
function renderRespSummary(){
  const nf=n=>Number(n).toLocaleString(lang==='fr'?'fr-FR':'en-US');
  const set=(id,v)=>{const e=document.getElementById(id); if(e) e.textContent=v;};
  const totalRec=DRC_RECOVERED+UGANDA.recoveries;
  set('rtConfirmed',nf(totalConfirmed)); set('rtDeaths',nf(totalDeaths)); set('rtRecovered',nf(totalRec));
  set('rtCfr','CFR ≈ '+(totalConfirmed?(totalDeaths/totalConfirmed*100).toFixed(1):0)+'%');
  set('drcC',nf(drcCases)); set('drcR',nf(DRC_RECOVERED)); set('drcD',nf(drcDeaths));
  set('ugC',nf(UGANDA.confirmed)); set('ugR',nf(UGANDA.recoveries)); set('ugD',nf(UGANDA.deaths));
}
function highlightCountry(c){
  document.querySelectorAll('.resp-table tbody tr').forEach(tr=>tr.classList.toggle('hl',tr.id===('row-'+c)));
}

const DRC_CONFIRMED_TOTAL=drcCases; // 1561 — DRC national confirmed total (computed), used for per-zone share
let lang = localStorage.getItem('lang') || 'en';
const tr=d=>d.i18n?d.i18n[lang]:null; // null for the 25 uncurated zones (figures-only)
const provName=p=>(PROV_I18N[p]&&PROV_I18N[p][lang])||p;
const countryName=c=>(COUNTRY_I18N[c]&&COUNTRY_I18N[c][lang])||c;

/* ============ MAP ============ */
// Locally vendored Leaflet: point default marker icons at the bundled images/ folder.
L.Icon.Default.imagePath='vendor/leaflet/images/';
// EPI_BOUNDS and ATTR come from config.*.js.
const map=L.map('map',{zoomControl:true,attributionControl:true,minZoom:4,maxZoom:11}).fitBounds(EPI_BOUNDS,{padding:[16,16]});
const darkTile=L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{attribution:ATTR,subdomains:'abcd',maxZoom:19});
const lightTile=L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{attribution:ATTR,subdomains:'abcd',maxZoom:19});
darkTile.addTo(map);

/* Legend ramp bar + tick labels rendered from config (FILL_RAMP + RAMP_TICKS),
   so those values are the single source of truth. Overwrites the shell fallback. */
(function renderLegendRamp(){
  const bar=document.querySelector('#legend .ramp');
  if(bar) bar.innerHTML=FILL_RAMP.map(c=>`<i style="background:${c}"></i>`).join('');
  const vals=document.querySelector('#legend .ramp-vals');
  if(vals) vals.innerHTML=RAMP_TICKS.map(t=>`<span>${t}</span>`).join('');
})();

/* Choropleth fill — FILL_RAMP + RAMP_MAX come from config.*.js.
   sqrt transform keeps the long tail of small zones readable. */
function fillColorFor(cases){
  if(cases==null||cases<=0) return null;            // zones with no cases get no fill
  const t=Math.sqrt(cases)/Math.sqrt(RAMP_MAX);
  const idx=Math.min(FILL_RAMP.length-1,Math.max(0,Math.round(t*(FILL_RAMP.length-1))));
  return FILL_RAMP[idx];
}

let ctxLayer=L.layerGroup().addTo(map);
let selected=null;

/* ---- Shared red ramp helpers — the choropleth fill AND the cluster bubbles use the
   SAME ramp + breakpoints. Cluster SUMS can exceed RAMP_MAX, so clamp to the darkest band. ---- */
function rampIdx(c){return Math.min(FILL_RAMP.length-1,Math.max(0,Math.round(Math.sqrt(Math.max(c,0))/Math.sqrt(RAMP_MAX)*(FILL_RAMP.length-1))));}
function rampColor(c){return FILL_RAMP[rampIdx(c)];}
function bubbleDiam(c){const t=Math.min(1,Math.sqrt(Math.max(c,1))/Math.sqrt(RAMP_MAX));return Math.round(24+t*22);} // 24..46px
function digitColor(c){return rampIdx(c)<=1?'#67000d':'#fff';}                                  // dark digits on the 2 lightest reds
function bubbleHtml(n,extra){const d=bubbleDiam(n),fs=(''+n).length>=3?11:13;
  return `<div class="zbub ${extra||''}" style="width:${d}px;height:${d}px;background:${rampColor(n)};color:${digitColor(n)};font-size:${fs}px">${n}</div>`;}
function bubbleIcon(n){const d=bubbleDiam(n);return L.divIcon({html:bubbleHtml(n),className:'zbub-wrap',iconSize:[d,d],iconAnchor:[d/2,d/2]});}

/* ---- Choropleth zone labels: confirmed-case number centred on the polygon, for
   zones with >= LABEL_MIN cases (from config). Auto-contrast digits (matching the fill
   darkness) + a halo so they stay legible over any fill. Non-interactive. ---- */
let labelLayer=L.layerGroup();
function zoneLabelIcon(cases){
  const fg=digitColor(cases);
  const halo=fg==='#fff'?'rgba(0,0,0,.6)':'rgba(255,255,255,.75)';
  const html=`<span class="zlabel" style="color:${fg};text-shadow:0 0 2px ${halo},0 0 4px ${halo}">${cases}</span>`;
  return L.divIcon({html,className:'zlabel-wrap',iconSize:[40,16],iconAnchor:[20,8]});
}

/* ---- Choropleth polygons. choroFilled toggles fill (Choropleth view) vs borders-only
   (Clusters view). Always on the map for geographic reference + as a click target. ---- */
let choroFilled=true;
function styleFeature(f){
  const c=fillColorFor(f.properties.confirmed_cases);
  if(choroFilled) return {fillColor:c||'#000',fillOpacity:c?0.8:0,color:'#fff',weight:1,opacity:c?0.8:0};
  return {fillColor:'#000',fillOpacity:0,color:'#fff',weight:1,opacity:.5}; // borders only
}
let choroplethLayer=L.geoJSON(null,{
  style:styleFeature,
  onEachFeature:(f,layer)=>{
    const p=f.properties,T=I18N[lang];
    layer.bindTooltip(`<b>${p.zone}</b> · ${p.confirmed_cases} ${T.tip_cases} · ${p.confirmed_deaths} ${T.tip_deaths}`,{className:'hz-tip',sticky:true,direction:'top'});
    layer.on('mouseover',()=>layer.setStyle({weight:2.5,color:'#fff',opacity:1}));
    layer.on('mouseout',()=>choroplethLayer.resetStyle(layer));
    layer.on('click',()=>{
      const hz=HZ.find(z=>z.name===p.zone);
      const ctr=layer.getBounds().getCenter();
      selectZone(hz||{name:p.zone,prov:p.province,country:'DRC',cases:p.confirmed_cases,deaths:p.confirmed_deaths,lat:ctr.lat,lng:ctr.lng});
    });
    if(p.confirmed_cases>=LABEL_MIN){
      L.marker(layer.getBounds().getCenter(),{icon:zoneLabelIcon(p.confirmed_cases),interactive:false,keyboard:false}).addTo(labelLayer);
    }
  }
}).addTo(map);

function loadChoropleth(){
  // Fetched at runtime (needs an HTTP origin). On failure (e.g. opened via file://)
  // we log and continue — borders/markers still work once data loads.
  fetch(DATA_FILES.geojson)
    .then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json();})
    .then(gj=>{choroplethLayer.addData(gj);choroplethLayer.setStyle(styleFeature);if(mapView!=='cluster')labelLayer.addTo(map);})
    .catch(e=>{console.warn('Choropleth GeoJSON failed to load — continuing with markers only.',e);});
}
loadChoropleth();

/* ---- Clusters view (opt-in): one numbered red bubble per zone, grouped by
   Leaflet.markercluster; the cluster bubble shows the SUMMED case count. ---- */
const clusterLayer=L.markerClusterGroup({
  maxClusterRadius:50,spiderfyOnMaxZoom:true,showCoverageOnHover:false,
  iconCreateFunction:cl=>{
    const sum=cl.getAllChildMarkers().reduce((s,m)=>s+(m.options.zCases||0),0);
    const d=bubbleDiam(sum);
    return L.divIcon({html:bubbleHtml(sum,'zclus'),className:'zbub-wrap',iconSize:[d,d]});
  }
});
HZ.forEach(d=>{
  const m=L.marker([d.lat,d.lng],{icon:bubbleIcon(d.cases),zCases:d.cases,zName:d.name});
  m.bindTooltip(()=>{const T=I18N[lang];return `<b>${d.name}</b> · ${d.cases} ${T.tip_cases} · ${d.deaths} ${T.tip_deaths}`;},{className:'hz-tip',sticky:true,direction:'top'});
  m.on('click',()=>selectZone(d));
  clusterLayer.addLayer(m);
});
clusterLayer.on('clustermouseover',e=>{
  const T=I18N[lang];
  const arr=e.layer.getAllChildMarkers().map(m=>({n:m.options.zName,c:m.options.zCases})).sort((a,b)=>b.c-a.c);
  const sum=arr.reduce((s,z)=>s+z.c,0);
  const top=arr.slice(0,3).map(z=>`${z.n} ${z.c}`).join(', ');
  const more=arr.length>3?` +${arr.length-3} ${T.cluster_more}`:'';
  e.layer.bindTooltip(`${arr.length} ${T.cluster_zones} · ${sum} ${T.cluster_cases} — ${top}${more}`,{className:'hz-tip',direction:'top'}).openTooltip();
});

/* ---- View toggle: Choropleth (default) ↔ Clusters. Only one lens active at a time;
   Uganda (ctxLayer) stays visible in both. ---- */
let mapView='choro';
function setMapView(v){
  mapView=v;const cluster=v==='cluster';
  document.querySelectorAll('.map-toggle button').forEach(b=>b.classList.toggle('active',b.dataset.view===v));
  choroFilled=!cluster;
  choroplethLayer.setStyle(styleFeature);            // fill ⇄ borders-only
  if(cluster){
    if(!map.hasLayer(clusterLayer))clusterLayer.addTo(map);
    if(map.hasLayer(labelLayer))map.removeLayer(labelLayer);   // cluster markers carry their own numbers
  }else{
    if(map.hasLayer(clusterLayer))map.removeLayer(clusterLayer);
    if(!map.hasLayer(labelLayer))labelLayer.addTo(map);        // restore choropleth zone labels
  }
  const $$=s=>document.querySelector(s);
  $$('#legHeadChoro').style.display=cluster?'none':'';$$('#legHeadCluster').style.display=cluster?'':'none';
  $$('#legRowChoro').style.display=cluster?'none':'';$$('#legRowCluster').style.display=cluster?'':'none';
  $$('#legSrcChoro').style.display=cluster?'none':'';$$('#legSrcCluster').style.display=cluster?'':'none';
}
const ViewToggle=L.control({position:'topleft'});
ViewToggle.onAdd=function(){
  const div=L.DomUtil.create('div','map-toggle');
  div.innerHTML='<span class="mt-label" data-i18n="view_label">View:</span>'+
                '<button data-view="choro" class="active" data-i18n="view_choro">Choropleth</button>'+
                '<button data-view="cluster" data-i18n="view_cluster">Clusters</button>';
  L.DomEvent.disableClickPropagation(div);L.DomEvent.disableScrollPropagation(div);
  div.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>setMapView(b.dataset.view)));
  return div;
};
ViewToggle.addTo(map);

function drawCtx(){
  ctxLayer.clearLayers();
  CONTEXT.forEach(d=>{
    const isUg=d.kind==='uganda';
    const m=L.circleMarker([d.lat,d.lng],{
      radius:isUg?12:11,fillColor:isUg?'#3d8bff':'#2bb3a3',color:'#fff',
      weight:1.4,opacity:.9,fillOpacity:.55,dashArray:'3 3'
    });
    m.bindTooltip(`<b>${tr(d).label}</b><br>${tr(d).sub}`,{className:'hz-tip',sticky:true,direction:'top'});
    m.on('click',()=>selectContext(d));
    m.on('click',()=>highlightCountry('UGANDA'));
    m.addTo(ctxLayer);
  });
}
drawCtx();injectTotals();

/* ============ PANEL UPDATES ============ */
const $=s=>document.querySelector(s);
let activeTab='snap';
function setTab(t){
  activeTab=t;
  document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===t));
  document.querySelectorAll('.tabpane').forEach(p=>p.classList.toggle('active',p.id==='tab-'+t));
  if(t==='trend')drawZoneTrend(selected); // (re)draw when the tab becomes visible so Chart.js sizes correctly
}
document.querySelectorAll('.tabs button').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.tab)));

function selectZone(d,noPan){
  highlightCountry('DRC');
  document.getElementById('zone').classList.remove('collapsed');
  document.getElementById('response').classList.add('collapsed');
  selected=d;
  const t=tr(d),T=I18N[lang]; // t is null for the 25 uncurated zones
  $('#hint').style.display='none';
  $('#snapEmpty').style.display='none';$('#snapBody').style.display='block';
  // Figures — always shown
  $('#znName').textContent=d.name;
  $('#znMeta').textContent=T.meta_hz.replace('{prov}',provName(d.prov)).replace('{country}',countryName(d.country));
  $('#znCases').textContent=d.cases;
  $('#znDeaths').textContent=(d.deaths!=null)?(d.deaths+' '+T.snap_deaths):'';
  const share=(d.cases/DRC_CONFIRMED_TOTAL*100);
  $('#znShare').textContent=share.toFixed(1)+'%';
  $('#znBarLab').textContent=T.share_ituri_confirmed;
  $('#znBarVal').textContent=share.toFixed(1)+'%';
  $('#znBar').style.width=Math.min(100,share)+'%';
  // Context tab: always shown (population + mobility); narrative only for curated zones.
  $('#ctxEmpty').style.display='none';$('#ctxBody').style.display='block';
  if(t){
    $('#znNote').textContent=t.note;
    $('#ctxNarr').style.display='block';$('#ctxNoNarr').style.display='none';
    $('#ctxTag').textContent=t.tag;
    $('#ctxText').innerHTML=t.ctx;
    $('#ctxNote').textContent=t.note;
  }else{
    $('#znNote').textContent='';
    $('#ctxNarr').style.display='none';$('#ctxNoNarr').style.display='block';
  }
  fillContextExtras(d.name);
  if(activeTab==='trend')drawZoneTrend(d);
  if(!noPan && d.lat!=null)map.panTo([d.lat,d.lng],{animate:true});
}
function selectContext(d,noPan){
  selected=d;
  const t=tr(d),T=I18N[lang];
  $('#hint').style.display='none';
  $('#snapEmpty').style.display='none';$('#snapBody').style.display='block';
  $('#ctxEmpty').style.display='none';$('#ctxBody').style.display='block';
  $('#znName').textContent=t.label;
  $('#znMeta').textContent=T.meta_ctx.replace('{prov}',provName(d.prov)).replace('{country}',countryName(d.country));
  $('#znDeaths').textContent='';
  const isUg=d.country==='Uganda';
  $('#znCases').textContent=isUg?String(UGANDA.confirmed):T.na;
  $('#znShare').textContent=isUg?'—':t.sub.split(' ')[0];
  $('#znBarLab').textContent=isUg?T.ctx_confirmed_kampala:T.ctx_hz_affected;
  $('#znBarVal').textContent=t.sub;
  $('#znBar').style.width=isUg?'3%':(d.prov==='North Kivu'?'25%':'3%');
  $('#znNote').textContent=t.note;
  $('#ctxNarr').style.display='block';$('#ctxNoNarr').style.display='none';
  $('#ctxTag').textContent=isUg?T.tag_crossborder:T.tag_geoexpansion;
  $('#ctxText').innerHTML=t.ctx;
  $('#ctxNote').textContent=t.note;
  fillContextExtras(d.name); // no POP/mobility for Kampala → both sections hide
  if(activeTab==='trend')drawZoneTrend(d); // no per-zone series for Kampala → Trends shows empty state
  if(!noPan)map.panTo([d.lat,d.lng],{animate:true});
}

/* collapse panels */
document.querySelectorAll('[data-toggle]').forEach(h=>{
  h.addEventListener('click',()=>{
    const p=h.closest('.panel'); p.classList.toggle('collapsed');
    if(p.id==='zone' && p.classList.contains('collapsed')) document.getElementById('response').classList.remove('collapsed');
  });
});

/* ============ PER-ZONE TREND CHART ============ */
function chartColors(){
  const light=document.documentElement.hasAttribute('data-theme');
  return {tick:light?'#3a5268':'#5f768c',leg:light?'#50687c':'#8ba0b4',grid:light?'rgba(0,0,0,.08)':'rgba(255,255,255,.06)'};
}
let zoneTrendChart=null;
function drawZoneTrend(d){
  const T=I18N[lang];
  const rows=d&&zoneTrends?zoneTrends[d.name]:null;
  if(zoneTrendChart){zoneTrendChart.destroy();zoneTrendChart=null;}
  if(!rows||!rows.length){               // no per-zone series (e.g. Uganda, or not yet loaded)
    $('#trendBody').style.display='none';$('#trendEmpty').style.display='block';return;
  }
  $('#trendEmpty').style.display='none';$('#trendBody').style.display='block';
  if(rows.length<2){                      // single data point → show as text, no chart
    const r=rows[0];$('#zoneTrendChart').style.display='none';$('#znTrendSingle').style.display='block';
    $('#znTrendSingle').textContent=`${r[0]}: ${r[1]} ${T.tip_cases}`+(r[2]!=null?` · ${r[2]} ${T.tip_deaths}`:'');
    return;
  }
  $('#znTrendSingle').style.display='none';$('#zoneTrendChart').style.display='block';
  const c=chartColors();
  zoneTrendChart=new Chart($('#zoneTrendChart'),{
    type:'line',
    data:{labels:rows.map(r=>r[0]),datasets:[
      {label:T.trend_cases,data:rows.map(r=>r[1]),borderColor:'#ff5a3c',backgroundColor:'rgba(255,90,60,.12)',fill:true,tension:.25,pointRadius:2,borderWidth:2,spanGaps:true},
      {label:T.trend_deaths,data:rows.map(r=>r[2]),borderColor:'#67000d',backgroundColor:'transparent',borderDash:[5,4],tension:.25,pointRadius:2,borderWidth:2,spanGaps:true}
    ]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{labels:{color:c.leg,boxWidth:18,font:{size:9}}}},
      scales:{
        y:{beginAtZero:true,ticks:{color:c.tick,font:{size:9}},grid:{color:c.grid}},
        x:{ticks:{color:c.tick,font:{size:9},maxTicksLimit:7,autoSkip:true},grid:{display:false}}
      }}
  });
}

/* ---- Context tab extras: population + Flowminder mobility ---- */
function sparkline(series){
  const w=124,h=26,pad=3,n=series.length;
  const max=Math.max(...series),min=Math.min(...series),rng=(max-min)||1;
  const xy=i=>[pad+i*(w-2*pad)/(n-1),h-pad-(series[i]-min)/rng*(h-2*pad)];
  const pts=series.map((_,i)=>xy(i).map(v=>v.toFixed(1)).join(',')).join(' ');
  const [lx,ly]=xy(n-1);
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">`+
    `<polyline points="${pts}" fill="none" stroke="#ff5a3c" stroke-width="1.5"/>`+
    `<circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="2.2" fill="#ff5a3c"/></svg>`;
}
function fillContextExtras(name){
  const T=I18N[lang];
  const p=POP[name];
  if(p){
    $('#ctxPopSec').style.display='block';
    $('#znPop').textContent=T.ctx_pop_year+': '+p[0].toLocaleString(lang==='fr'?'fr-FR':'en-US');
    $('#znIncidence').textContent=T.ctx_incidence+': '+p[1];
  }else $('#ctxPopSec').style.display='none';
  const mob=zoneMobility?zoneMobility[name]:null;
  if(mob){
    $('#ctxMobSec').style.display='block';
    if(mob.status==='recipient'){
      $('#znMob').textContent=T.ctx_mob_recipient.replace('{rank}',mob.rank).replace('{pct}',mob.pct);
      $('#znMobSpark').innerHTML=sparkline(mob.series);
    }else if(mob.status==='origin'){
      $('#znMob').textContent=T.ctx_mob_origin;$('#znMobSpark').innerHTML='';
    }else{
      $('#znMob').textContent=T.ctx_mob_excluded;$('#znMobSpark').innerHTML='';
    }
  }else $('#ctxMobSec').style.display='none';
}

function loadZoneData(){
  // Fetched once on init; on failure log + degrade (Trends shows empty, Context omits the sections).
  fetch(DATA_FILES.trends).then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json();})
    .then(j=>{zoneTrends=j;if(selected&&activeTab==='trend')drawZoneTrend(selected);})
    .catch(e=>console.warn('zone_trends_sitrep.json failed to load — Trends tab will show no curve.',e));
  fetch(DATA_FILES.mobility).then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json();})
    .then(j=>{zoneMobility=j.zones||j;if(selected)fillContextExtras(selected.name);})
    .catch(e=>console.warn('zone_mobility_flowminder.json failed to load — Context mobility omitted.',e));
}
loadZoneData();

/* ============ OUTCOMES DONUT ============ */
// Outcomes (computed, same source of truth as the cards): recovered = DRC_RECOVERED (115),
// deaths = totalDeaths (279), active = totalConfirmed - deaths - recovered = 719.
const outcomesChart=null; // donut removed

function updateChartTheme(light){
  const leg=light?'#50687c':'#8ba0b4';
  if(outcomesChart){outcomesChart.options.plugins.legend.labels.color=leg;outcomesChart.update();}
  if(zoneTrendChart&&selected)drawZoneTrend(selected); // recolour the per-zone chart for the new theme
}

/* ============ THEME TOGGLE ============ */
const html=document.documentElement;
const themeBtn=document.getElementById('themeToggle');

function applyTheme(light){
  if(light){
    html.setAttribute('data-theme','light');
    themeBtn.textContent='☀️';
    map.removeLayer(darkTile);lightTile.addTo(map);
  } else {
    html.removeAttribute('data-theme');
    themeBtn.textContent='🌙';
    map.removeLayer(lightTile);darkTile.addTo(map);
  }
  updateChartTheme(light);
}

const savedTheme=localStorage.getItem('theme');
const isLight=savedTheme==='light';
applyTheme(isLight);

themeBtn.addEventListener('click',()=>{
  const nowLight=!html.hasAttribute('data-theme');
  localStorage.setItem('theme',nowLight?'light':'dark');
  applyTheme(nowLight);
});

/* ============ MODALS ============ */
function openModal(id){document.getElementById(id).classList.add('open')}
function closeModals(){document.querySelectorAll('.modal-bg').forEach(m=>m.classList.remove('open'))}
$('#openData').addEventListener('click',()=>openModal('dataModal'));
$('#openTerms').addEventListener('click',()=>openModal('termsModal'));
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',closeModals));
document.querySelectorAll('.modal-bg').forEach(bg=>bg.addEventListener('click',e=>{if(e.target===bg)closeModals()}));
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModals()});


/* ============ CSV DOWNLOADS ============ */
document.querySelectorAll('[data-dl]').forEach(b=>b.addEventListener('click',()=>{
  const f=b.dataset.dl,blob=new Blob([CSV[f]],{type:'text/csv;charset=utf-8'}),u=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=u;a.download=f;a.click();setTimeout(()=>URL.revokeObjectURL(u),1500);
}));

/* ============ LANGUAGE TOGGLE ============ */
const langBtn=document.getElementById('langToggle');
function applyStaticI18n(){
  const T=I18N[lang];
  document.querySelectorAll('[data-i18n]').forEach(el=>{const k=el.getAttribute('data-i18n');if(T[k]!=null)el.textContent=T[k];});
  document.querySelectorAll('[data-i18n-html]').forEach(el=>{const k=el.getAttribute('data-i18n-html');if(T[k]!=null)el.innerHTML=T[k];});
  document.querySelectorAll('[data-i18n-title]').forEach(el=>{const k=el.getAttribute('data-i18n-title');if(T[k]!=null)el.title=T[k];});
  document.querySelectorAll('[data-i18n-aria]').forEach(el=>{const k=el.getAttribute('data-i18n-aria');if(T[k]!=null)el.setAttribute('aria-label',T[k]);});
  document.querySelectorAll('[data-i18n-alt]').forEach(el=>{const k=el.getAttribute('data-i18n-alt');if(T[k]!=null)el.alt=T[k];});
}
function updateChartsI18n(){
  const T=I18N[lang];
  // The per-zone trend chart is re-rendered via selectZone() on language change (see setLanguage).
  if(outcomesChart){outcomesChart.data.labels=[T.chart_active,T.chart_recovered,T.chart_deaths];outcomesChart.update();}
}
function setLanguage(l){
  lang=l;
  localStorage.setItem('lang',l);
  document.documentElement.setAttribute('lang',l);
  document.title=I18N[l].doc_title;
  applyStaticI18n();
  if(window.renderRespSummary)renderRespSummary();
  langBtn.textContent='🌐 '+(l==='fr'?'FR':'EN');
  drawCtx();choroplethLayer&&choroplethLayer.eachLayer(l=>{const p=l.feature.properties,T=I18N[lang];l.setTooltipContent(`<b>${p.zone}</b> · ${p.confirmed_cases} ${T.tip_cases} · ${p.confirmed_deaths} ${T.tip_deaths}`);});
  if(selected){selected.kind?selectContext(selected,true):selectZone(selected,true);}
  updateChartsI18n();
}
langBtn.addEventListener('click',()=>setLanguage(lang==='en'?'fr':'en'));
setLanguage(lang);
