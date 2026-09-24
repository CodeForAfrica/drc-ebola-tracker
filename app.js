const $=s=>document.querySelector(s);
const RAMP=['--r1','--r2','--r3','--r4','--r5','--r6'];
const NAMES=()=>({c:tx('opt_c'),d:tx('opt_d'),cfr:tx('opt_cfr'),k:tx('opt_k'),mob:tx('opt_mob'),risk:tx('opt_risk')});
const fmt=n=>n==null?'—':Math.round(n).toLocaleString(LANG==='fr'?'fr-FR':'en-US');
const css=v=>getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const Z={};D.zones.forEach(z=>Z[z.z]=z);
const PROVS=[...new Set(D.zones.map(z=>z.p))].sort();

let LANG=(localStorage.getItem('lang')==='fr')?'fr':'en';
const MONABBR={en:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
               fr:['jan','fév','mar','avr','mai','juin','juil','aoû','sep','oct','nov','déc']};
const MONLONG=CFG.months.long;
const tx=k=>{const v=T[LANG]&&T[LANG][k];return v!=null?v:(T.en[k]!=null?T.en[k]:k);};
function applyStaticI18n(){
 document.querySelectorAll('[data-i18n]').forEach(el=>{const v=tx(el.getAttribute('data-i18n'));if(v!=null)el.textContent=v;});
 document.querySelectorAll('[data-i18n-html]').forEach(el=>{el.innerHTML=tx(el.getAttribute('data-i18n-html'));});
 document.querySelectorAll('[data-i18n-ph]').forEach(el=>{el.placeholder=tx(el.getAttribute('data-i18n-ph'));});
 document.querySelectorAll('[data-i18n-aria]').forEach(el=>{el.setAttribute('aria-label',tx(el.getAttribute('data-i18n-aria')));});
 document.querySelectorAll('[data-i18n-label]').forEach(el=>{el.label=tx(el.getAttribute('data-i18n-label'));});
 document.querySelectorAll('.tchips button[data-month]').forEach(b=>{const i=MONTHS.indexOf(b.dataset.month);b.textContent=(MONLONG[LANG]&&MONLONG[LANG][i])||b.dataset.month;});
 const th=document.getElementById('theme'); if(th){const lightNow=document.documentElement.dataset.theme==='light';th.setAttribute('aria-label',lightNow?tx('theme_to_dark'):tx('theme_to_light'));}
}
function setLang(l){LANG=(l==='fr')?'fr':'en';try{localStorage.setItem('lang',LANG);}catch(e){}
 document.documentElement.lang=LANG;
 const lb=document.getElementById('lang'); if(lb)lb.textContent='🌐 '+(LANG==='fr'?'FR':'EN');
 applyStaticI18n();
 renderNat();renderProv();if(S.sel)renderZone();repaint();syncTime();
}

document.getElementById("lang").addEventListener("click",()=>setLang(LANG==="fr"?"en":"fr"));


D.zones.forEach(z=>{const m=D.mob[z.z];z.tin=m?m.tin:null;z.tout=m?m.tout:null;z.hasMob=!!m;});
(function(){const pct=k=>{const v=D.zones.map(z=>z[k]).filter(x=>x!=null).sort((a,b)=>a-b);
 return x=>x==null?null:v.filter(y=>y<x).length/Math.max(1,v.length-1);};
 const f=[pct('c'),pct('d'),pct('tin'),pct('tout')];
 D.zones.forEach(z=>{const p=[f[0](z.c),f[1](z.d),f[2](z.tin),f[3](z.tout)].filter(x=>x!=null);
  z.risk=p.length?p.reduce((a,b)=>a+b,0)/p.length*100:null;});})();

let S={ind:'c',dir:'in',sel:null,prov:CFG.defaultProv,t:null,month:null,playing:false};
/* keep the latest-release snapshot so "Latest" can always be restored */
D.zones.forEach(z=>{z.c0=z.c;z.d0=z.d;z.cfr0=z.cfr;z.k0=z.k;});
const TL=D.tl, MONTHS=[...new Set(TL.map(t=>t.d.slice(0,7)))];
const MN=CFG.months.short;
const monthIdx=m=>TL.map((t,i)=>[t,i]).filter(([t])=>t.d.startsWith(m)).map(([,i])=>i);
const curTL=()=>S.t==null?null:TL[S.t];
const prettyDate=iso=>{const [y,m,d]=iso.split('-');
 return `${+d} ${MONABBR[LANG][+m-1]}`;};

/* cumulative values for a zone at or before a date */
function zoneAt(name,iso){const s=D.trends[name];if(!s)return null;
 const md=iso.slice(5);let last=null;
 for(const r of s){if(r[0]<=md)last=r;}
 return last&&last[3]!=null?{c:last[3],d:last[4]}:null;}
/* national row exactly on a date */
const natAt=iso=>D.nat2.find(n=>n.d===iso)||null;

function applyTime(){
 const t=curTL();
 D.zones.forEach(z=>{
  if(!t||t.z===0){ if(!t){z.c=z.c0;z.d=z.d0;z.cfr=z.cfr0;z.k=z.k0;}
                   else {z.c=null;z.d=null;z.cfr=null;z.k=null;} return; }
  const v=zoneAt(z.z,t.d);
  if(!v){z.c=null;z.d=null;z.cfr=null;z.k=null;return;}
  z.c=v.c; z.d=v.d;
  z.cfr=(v.c&&v.d!=null)?v.d/v.c*100:null;
  z.k=(z.pop&&v.c)?v.c/z.pop*1e5:null;});}
const value=z=>S.ind==='mob'?(S.dir==='in'?z.tin:z.tout):z[S.ind];
const fmtVal=z=>{const v=value(z);if(v==null)return null;
 if(S.ind==='cfr')return v.toFixed(0)+'%';
 if(S.ind==='risk'||S.ind==='k')return v.toFixed(0);return fmt(v);};

/* ================= MAP ================= */
const map=L.map('map',{zoomControl:true,zoomSnap:.5,minZoom:3,maxZoom:12}).setView(CFG.view.center,CFG.view.zoom);
/* base map: OpenStreetMap tiles only — the existing site's base, kept as-is */
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{subdomains:'abc',maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);

/* ---- vector base map: always renders, no network needed ---- */
const basePane=map.createPane('basemap'); basePane.style.zIndex=200; basePane.style.display='none'; /* OSM tiles are the base */
const africaLayer=L.geoJSON(BASE.africa,{pane:'basemap',interactive:false,
 style:f=>({color:css('--coast'),weight:f.properties.drc?1.1:.7,
   fillColor:f.properties.drc?css('--land-2'):css('--land'),fillOpacity:1})}).addTo(map);
const provLayer=L.geoJSON(BASE.provinces,{pane:'basemap',interactive:false,
 style:{color:css('--prov'),weight:.7,fill:false,dashArray:'2 2'}}).addTo(map);
/* country labels appear once you are zoomed out enough to need them */
const cLblLayer=L.layerGroup().addTo(map);
function drawCountryLabels(){
 cLblLayer.clearLayers(); return; /* OSM tiles carry country labels */
 const z=map.getZoom(); if(z>6.5) return;
 const b=map.getBounds();
 BASE.africa.features.forEach(f=>{
  const l=L.geoJSON(f).getBounds().getCenter();
  if(!b.contains(l))return;
  L.marker(l,{interactive:false,keyboard:false,icon:L.divIcon({className:'zlbl',iconSize:[0,0],
   html:`<div class="in"><span class="n" style="font-size:${f.properties.drc?11:9}px;${f.properties.drc?'font-weight:700':''}">${f.properties.n}</span></div>`})}).addTo(cLblLayer);
 });
}
map.on('zoomend moveend',drawCountryLabels);

/* ---- OSM tiles: optional overlay, off by default ---- */
let osm=null, osmFailed=false;
function enableOsm(on){
 if(on){
  if(!osm){
   osm=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:12,minZoom:3,opacity:.9,
    attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · standard (Carto) style'});
   osm.on('tileerror',()=>{ if(osmFailed)return; osmFailed=true;
     document.getElementById('tilewarn').classList.add('on'); });
  }
  osm.addTo(map);
 } else if(osm) map.removeLayer(osm);
 document.getElementById('bVec').setAttribute('aria-pressed',String(!on));
 document.getElementById('bOsm').setAttribute('aria-pressed',String(on));
}
const flowLayer=L.layerGroup().addTo(map),dotLayer=L.layerGroup().addTo(map),lblLayer=L.layerGroup().addTo(map);
let layerByZone={},gj;
function scale(){const v=D.zones.map(value).filter(x=>x!=null&&x>0),max=Math.max(...v,1);
 return{max,col:x=>{if(x==null||x<=0)return null;
  const t=Math.log(x+1)/Math.log(max+1);return css('--'+RAMP[Math.min(5,Math.floor(t*6))].slice(2));}};}
function style(f){const z=Z[f.properties.z],sc=scale(),c=sc.col(z?value(z):null),on=S.sel===f.properties.z;
 return{color:on?css('--blue'):css('--line-2'),weight:on?2.8:.9,dashArray:c?null:'3 3',
  fillColor:c||'transparent',fillOpacity:c?(on?.85:.68):.05};}
gj=L.geoJSON(D.geo,{style,onEachFeature:(f,l)=>{const n=f.properties.z;layerByZone[n]=l;
 l.on({click:()=>select(n),
  mouseover:e=>{l.setStyle({weight:2.4,color:css('--blue')});tipZone(e.originalEvent,n);},
  mousemove:e=>tipZone(e.originalEvent,n),
  mouseout:()=>{gj.resetStyle(l);if(S.sel===n)l.setStyle(style(f));hideTip();}});}}).addTo(map);
const noPoly=D.zones.filter(z=>!layerByZone[z.z]);
function drawDots(){dotLayer.clearLayers();const sc=scale();
 noPoly.forEach(z=>{if(z.lat==null)return;const c=sc.col(value(z));
  L.circleMarker([z.lat,z.lon],{radius:S.sel===z.z?10:6.5,color:S.sel===z.z?css('--blue'):css('--line-2'),
   weight:S.sel===z.z?2.6:1,fillColor:c||'transparent',fillOpacity:c?.78:.12})
   .on('click',()=>select(z.z)).on('mouseover',e=>tipZone(e.originalEvent,z.z))
   .on('mouseout',hideTip).addTo(dotLayer);});}
function drawLabels(){lblLayer.clearLayers();const z0=map.getZoom();
 const cap=z0<6?6:z0<7?12:z0<8?24:z0<9?40:999,b=map.getBounds();
 D.zones.filter(z=>value(z)!=null&&value(z)>0).sort((a,b2)=>value(b2)-value(a)).slice(0,cap)
  .forEach(z=>{const c=D.cent[z.z]||(z.lat!=null?[z.lat,z.lon]:null);
   if(!c||!b.contains(c))return;const hi=S.sel===z.z;
   L.marker(c,{interactive:false,keyboard:false,icon:L.divIcon({className:'zlbl'+(hi?' hi':''),iconSize:[0,0],
    html:`<div class="in">${(z0>=7||hi)?`<span class="n">${z.z}</span>`:''}<span class="v">${fmtVal(z)}</span></div>`})}).addTo(lblLayer);});}
map.on('zoomend moveend',drawLabels);

function curve(a,b,bend){const mx=(a[0]+b[0])/2,my=(a[1]+b[1])/2,dx=b[0]-a[0],dy=b[1]-a[1];
 const cx=mx-dy*bend,cy=my+dx*bend,p=[];
 for(let t=0;t<=1.0001;t+=1/26){const u=1-t;
  p.push([u*u*a[0]+2*u*t*cx+t*t*b[0],u*u*a[1]+2*u*t*cy+t*t*b[1]]);}
 return p;}
function arrow(pts,colour,at){const i=Math.max(1,Math.floor(pts.length*at)),p=pts[i-1],q=pts[i];
 const ang=Math.atan2(q[1]-p[1],q[0]-p[0])*180/Math.PI;
 return L.marker(q,{interactive:false,keyboard:false,icon:L.divIcon({className:'arrowhead',
  iconSize:[13,13],iconAnchor:[6.5,6.5],
  html:`<svg width="13" height="13" viewBox="0 0 13 13" style="transform:rotate(${ang}deg)">
   <path d="M2.8 2 L10 6.5 L2.8 11 Z" fill="${colour}"/></svg>`})});}
/* both directions drawn when a zone is selected, per the sidebar */
function drawFlows(){flowLayer.clearLayers();
 if(!S.sel)return;const m=D.mob[S.sel];if(!m)return;
 const home=D.cent[S.sel]||(Z[S.sel]?[Z[S.sel].lat,Z[S.sel].lon]:null);if(!home)return;
 const put=(pairs,colour,inbound)=>{const max=Math.max(...pairs.map(p=>p[1]),1);
  pairs.slice(0,5).forEach(([name,v])=>{const other=D.cent[name];if(!other)return;
   const from=inbound?other:home,to=inbound?home:other;
   const pts=curve(from,to,inbound?.13:-.13),w=1.3+(v/max)*4.6;
   L.polyline(pts,{color:colour,weight:w,opacity:.76,lineCap:'round'})
    .bindTooltip(`<b>${inbound?name:S.sel}</b> → <b>${inbound?S.sel:name}</b><br>`+
      `${inbound?'Inbound to':'Outbound from'} ${S.sel}<br><b>${fmt(v)}</b> estimated relocations`,{sticky:true})
    .addTo(flowLayer);
   flowLayer.addLayer(arrow(pts,colour,.64));flowLayer.addLayer(arrow(pts,colour,.93));
   L.circleMarker(other,{radius:3,color:colour,weight:1.4,fillOpacity:.95,interactive:false}).addTo(flowLayer);});};
 put(m.in,css('--teal'),true);put(m.out,css('--accent'),false);}

const tip=$('#tip');
function tipZone(ev,n){const z=Z[n];if(!z)return;
 tip.innerHTML=`<b>${n}</b> · ${z.p}<br>${NAMES()[S.ind]}: <span class="mono">${fmtVal(z)||'—'}</span>`+
  (S.ind==='mob'&&!z.hasMob?`<br><i style="color:var(--dim)">${tx('tip_nomob')}</i>`:'');
 tip.style.display='block';tip.style.left=Math.min(innerWidth-210,ev.clientX+14)+'px';
 tip.style.top=(ev.clientY+14)+'px';}
function hideTip(){tip.style.display='none';}
function repaint(){gj.setStyle(style);drawDots();drawFlows();drawLabels();
 const sc=scale();
 $('#legTitle').textContent=NAMES()[S.ind]+(S.ind==='mob'?` — ${S.dir==='in'?tx('leg_dir_in'):tx('leg_dir_out')}`:'');
 $('#legHi').textContent=S.ind==='cfr'?Math.round(sc.max)+'%':S.ind==='risk'?Math.round(sc.max):fmt(sc.max);
 $('#fkey').hidden=true; /* mobility flows not included in this release */
 $('#legNote').textContent=S.ind==='mob'
  ?tx('leg_note_mob')
  :tx('leg_note_default');}

$('#indicator').addEventListener('change',e=>{S.ind=e.target.value;
 $('#mobRow').classList.toggle('on',S.ind==='mob');repaint();});
$('#mIn').onclick=()=>setDir('in');$('#mOut').onclick=()=>setDir('out');
function setDir(d){S.dir=d;$('#mIn').setAttribute('aria-pressed',String(d==='in'));
 $('#mOut').setAttribute('aria-pressed',String(d==='out'));repaint();}

/* ================= SIDEBAR ================= */
function heroHTML(cases,deaths,subA,subB,cfr,extra){
 return `<div class="hero">
   <div class="h"><div class="lab">${tx('cl_cumconf')}</div><div class="num">${fmt(cases)}</div>
     <div class="sub">${subA||''}</div></div>
   <div class="h"><div class="lab">${tx('cl_cumdeaths')}</div><div class="num d">${fmt(deaths)}</div>
     <div class="sub">${subB||''}</div></div>
 </div>
 <div class="strip">
   <div class="si"><div class="sl">${tx('hero_cfr')}</div><div class="sv">${cfr}</div></div>
   <div class="div"></div>${extra}
 </div>`;}

function renderNat(){
 const t=curTL(), row=t?natAt(t.d):D.nat2[D.nat2.length-1];
 const live=false;
 const cases=live?NAT.cases:(row?row.c:null), deaths=live?NAT.deaths:(row?row.dd:null);
 const cfr=live?NAT.cfr:(row?row.cfr:null), rec=row?row.rec:D.nat2[D.nat2.length-1].rec;
 const iso=row?row.iso:null, ct=row?row.ct:null;
 if(t&&!row){
  $('#natHero').innerHTML=`<div class="hint" style="margin-top:var(--s4)">${tx('no_nat_pub_a')} <b>${prettyDate(t.d)} 2026</b>.<br>${tx('no_nat_pub_b')}</div>`;
  $('#natStamp').innerHTML=`<span class="dot"></span>${tx('no_nat_report')}`;
  return;}
 $('#natStamp').innerHTML=`<span class="dot"></span>INSP SitRep ${live?CFG.zoneRelease.sitrep:'N°'+row.s} · ${live?NAT.date:prettyDate(row.d)+' 2026'}${row&&row.st?' · '+tx('status_'+row.st):''}`;
 $('#natHero').innerHTML=heroHTML(cases,deaths,
   live?`<b>+${NAT.newCases}</b> on ${NAT.date}`:`SitRep N°${row.s}`,
   live?`<b>+${NAT.newDeaths}</b> that day · ${NAT.comm} in community`:(row.st==='missing'?tx('not_reported'):''),
   cfr==null?'—':cfr.toFixed(1)+'%',
   `<div class="si"><div class="sl">${tx('n_recovered')}</div><div class="sv" style="color:var(--teal)">${fmt(rec)}</div></div>
    <div class="div"></div>
    <div class="si"><div class="sl">${iso!=null?tx('n_isolation'):tx('n_ituri')}</div>
      <div class="sv">${iso!=null?fmt(iso):NAT.ituri+'%'}</div></div>`)
  +(ct!=null?`<div class="strip" style="margin-top:var(--s2)">
     <div class="si"><div class="sl">${tx('n_contact')}</div><div class="sv">${ct.toFixed(1)}%</div></div>
     <div class="div"></div>
     <div class="si"><div class="sl">${tx('n_suspects')}</div><div class="sv">${fmt(row.sus)}</div></div>
   </div>`:'')
  +`<p class="note">${tx('nat_note')}</p>`;}

function renderProv(){
 const zs=D.zones.filter(z=>z.p===S.prov);
 const c=zs.reduce((a,z)=>a+(z.c||0),0),d=zs.reduce((a,z)=>a+(z.d||0),0);
 const tin=zs.filter(z=>z.hasMob).reduce((a,z)=>a+z.tin,0);
 const tout=zs.filter(z=>z.hasMob).reduce((a,z)=>a+z.tout,0);
 $('#provPick').innerHTML=PROVS.map(p=>`<option ${p===S.prov?'selected':''}>${p}</option>`).join('');
 $('#provHero').innerHTML=heroHTML(c,d,`${zs.length} ${zs.length===1?tx('prov_affected_one'):tx('prov_affected_many')}`,
   `SitRep ${CFG.zoneRelease.sitrep} · ${prettyDate(CFG.zoneRelease.date)}`,c?(d/c*100).toFixed(1)+'%':'—',
   `<div class="si"><div class="sl">${tx('prov_mob_in')}</div><div class="sv">${tin?fmt(tin):'—'}</div></div>
    <div class="div"></div>
    <div class="si"><div class="sl">${tx('n_recovered')}</div><div class="sv" style="color:var(--dim)">${tx('n_na')}</div></div>`)
  +`<p class="note">${tx('prov_note')}</p>`;
 const rows=PROVS.map(p=>{const q=D.zones.filter(z=>z.p===p);
   return{p,c:q.reduce((a,z)=>a+(z.c||0),0)};}).sort((a,b)=>b.c-a.c);
 const max=Math.max(...rows.map(r=>r.c),1);
 $('#provList').innerHTML=rows.map(r=>`<div class="row ${r.p===S.prov?'on':''}" data-prov="${r.p}" role="button" tabindex="0">
   <span class="fn">${r.p}</span><span class="fb"><i style="width:${r.c/max*100}%;background:var(--r4)"></i></span>
   <span class="fv mono">${fmt(r.c)}</span></div>`).join('');
 $('#provList').querySelectorAll('[data-prov]').forEach(el=>{
  const go=()=>{S.prov=el.dataset.prov;renderProv();
   const pts=D.zones.filter(z=>z.p===S.prov&&z.lat!=null).map(z=>[z.lat,z.lon]);
   if(pts.length)map.flyToBounds(L.latLngBounds(pts),{padding:[70,70],duration:.6});};
  el.onclick=go;el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go();}};});}
$('#provPick').addEventListener('change',e=>{S.prov=e.target.value;renderProv();});

/* ---- single cumulative line chart ---- */
function smooth(pts){const segs=[];let cur=[];
 pts.forEach(p=>{if(p==null){if(cur.length)segs.push(cur);cur=[];}else cur.push(p);});
 if(cur.length)segs.push(cur);
 return segs.map(sg=>{if(sg.length===1)return `M ${sg[0][0]},${sg[0][1]} l .01 0`;
  let d=`M ${sg[0][0]},${sg[0][1]}`;
  for(let i=0;i<sg.length-1;i++){const p0=sg[i-1]||sg[i],p1=sg[i],p2=sg[i+1],p3=sg[i+2]||p2,t=.42;
   d+=` C ${p1[0]+(p2[0]-p0[0])/6*t*2},${p1[1]+(p2[1]-p0[1])/6*t*2}`
     +` ${p2[0]-(p3[0]-p1[0])/6*t*2},${p2[1]-(p3[1]-p1[1])/6*t*2} ${p2[0]},${p2[1]}`;}
  return d;}).join(' ');}

function drawZoneChart(name){
 const s=D.trends[name],host=$('#zchart'),note=$('#zchartNote');
 if(!s||s.length<2){host.innerHTML='<p class="note" style="text-align:center;padding:16px 0">'+tx('chart_none')+'</p>';
  note.textContent='';return;}
 const pts=s.map(r=>({x:r[0],c:r[3],d:r[4]}));
 const W=344,H=152,ml=34,mr=10,mt=12,mb=24,iw=W-ml-mr,ih=H-mt-mb;
 const max=Math.max(...pts.map(p=>Math.max(p.c||0,p.d||0)),1);
 const X=i=>ml+(pts.length===1?iw/2:i/(pts.length-1)*iw),Y=v=>mt+ih-(v/max)*ih;
 const P=k=>pts.map((p,i)=>p[k]==null?null:[X(i),Y(p[k])]);
 const areaC=(()=>{const g=P('c').filter(Boolean);if(g.length<2)return'';
  return `${smooth(g)} L ${g[g.length-1][0]},${mt+ih} L ${g[0][0]},${mt+ih} Z`;})();
 host.innerHTML=`<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img"
   aria-label="Cumulative confirmed cases and deaths over time for ${name}">
  <defs><linearGradient id="gz" x1="0" y1="0" x2="0" y2="1">
   <stop offset="0%" stop-color="var(--r4)" stop-opacity=".22"/>
   <stop offset="100%" stop-color="var(--r4)" stop-opacity="0"/></linearGradient></defs>
  ${[0,.25,.5,.75,1].map(f=>`<line x1="${ml}" y1="${Y(max*f)}" x2="${W-mr}" y2="${Y(max*f)}" stroke="var(--chart-grid)"/>`).join('')}
  <path d="${areaC}" fill="url(#gz)"/>
  <path d="${smooth(P('c'))}" fill="none" stroke="var(--r4)" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="${smooth(P('d'))}" fill="none" stroke="var(--teal)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <g id="gpts">${pts.map((p,i)=>`<g class="hpt" data-i="${i}">
    <circle cx="${X(i)}" cy="${Y(p.c||0)}" r="2.4" fill="var(--r4)"/>
    ${p.d!=null?`<circle cx="${X(i)}" cy="${Y(p.d)}" r="2.1" fill="var(--teal)"/>`:''}
    <rect x="${X(i)-iw/pts.length/2}" y="${mt}" width="${iw/pts.length}" height="${ih}" fill="transparent"/>
   </g>`).join('')}</g>
  ${(()=>{const t=curTL();if(!t)return'';
     const i=pts.findIndex(p=>'2026-'+p.x===t.d);
     return i<0?'':`<line x1="${X(i)}" y1="${mt}" x2="${X(i)}" y2="${mt+ih}" stroke="var(--blue)" stroke-width="1.2" stroke-dasharray="3 2"/>`;})()}
  <text x="2" y="${mt+7}" font-size="8.5" fill="var(--chart-tick)">${fmt(max)}</text>
  <text x="2" y="${mt+ih+3}" font-size="8.5" fill="var(--chart-tick)">0</text>
  <text x="${ml}" y="${H-5}" font-size="8.5" fill="var(--chart-tick)">${pts[0].x}</text>
  <text x="${W-mr}" y="${H-5}" font-size="8.5" fill="var(--chart-tick)" text-anchor="end">${pts[pts.length-1].x}</text>
 </svg>`;
 host.querySelectorAll('.hpt').forEach(g=>{
  const i=+g.dataset.i,p=pts[i];
  g.addEventListener('mousemove',e=>{
   tip.innerHTML=`<b>${p.x} 2026</b><br>${tx('tip_cumconf')} <span class="mono">${fmt(p.c)}</span><br>`+
    `${tx('tip_cumdeaths')} <span class="mono">${fmt(p.d)}</span>`;
   tip.style.display='block';tip.style.left=Math.min(innerWidth-215,e.clientX+14)+'px';
   tip.style.top=(e.clientY+14)+'px';});
  g.addEventListener('mouseleave',hideTip);});
 note.textContent=tx('chart_note');}

function renderZone(){
 const z=Z[S.sel];if(!z)return;
 $('#zName').textContent=z.z;
 $('#zStamp').innerHTML=`<span class="dot"></span>${z.p} · INSP SitRep ${CFG.zoneRelease.sitrep} · ${prettyDate(CFG.zoneRelease.date)} 2026`;
 const lv=z.risk>=75?[tx('risk_vh'),'b-vh']:z.risk>=55?[tx('risk_h'),'b-h']:z.risk>=35?[tx('risk_m'),'b-m']:[tx('risk_l'),'b-l'];
 const s=D.trends[z.z];let rc=null;
 if(s){const t=s.slice(-3);rc=t.reduce((a,r)=>a+(r[1]||0),0);}
 $('#zHero').innerHTML=heroHTML(z.c,z.d,
   rc?`<b>+${rc}</b> ${tx('z_over_last3')}`:`${(z.c/NAT.cases*100).toFixed(1)}${tx('z_share')}`,
   z.pop?`${tx('z_pop')} ${fmt(z.pop)}`:'',
   z.cfr==null?'—':z.cfr.toFixed(1)+'%',
   `<div class="si"><div class="sl">${tx('z_per100k')}</div><div class="sv">${z.k==null?'—':z.k.toFixed(0)}</div></div>
    <div class="div"></div>
    <div class="si"><div class="sl">${tx('n_recovered')}</div><div class="sv" style="color:var(--dim)">${tx('n_na')}</div></div>`)
  +`<p class="note">${tx('z_risk_word')} <span class="badge ${lv[1]}">${lv[0]}</span> · ${z.k==null?'':tx('z_per100k_mid')+' '+z.k.toFixed(0)+' · '}${tx('z_note_recov')}</p>`;
 drawZoneChart(z.z);
 renderZoneMob(z);}

function renderZoneMob(z){
 const m=D.mob[z.z],host=$('#zmob');
 if(!m){host.innerHTML=`<p class="note" style="text-align:center;padding:14px 0">${tx('mob_none_pre')} ${z.z}.<br>${tx('mob_none_post')}</p>`;return;}
 const rows=(pairs,colour)=>{const max=Math.max(...pairs.map(p=>p[1]),1);
  return pairs.slice(0,5).map(([n,v])=>`<div class="row" data-goto="${n}" role="button" tabindex="0">
   <span class="fn">${n}</span><span class="fb"><i style="width:${v/max*100}%;background:${colour}"></i></span>
   <span class="fv mono">${fmt(v)}</span></div>`).join('');};
 host.innerHTML=`
  <div class="mini" style="grid-template-columns:1fr 1fr">
    <div class="m"><div class="ml">Total in</div><div class="mv" style="color:var(--teal)">${fmt(m.tin)}</div></div>
    <div class="m"><div class="ml">Total out</div><div class="mv" style="color:var(--accent)">${fmt(m.tout)}</div></div>
  </div>
  <div class="dirhead"><span class="pill in">→ In</span> top origins moving into ${z.z}</div>
  ${rows(m.in,'var(--teal)')}
  <div class="dirhead"><span class="pill out">Out →</span> top destinations from ${z.z}</div>
  ${rows(m.out,'var(--accent)')}
  <p class="note">${CFG.mobNote}</p>`;
 host.querySelectorAll('[data-goto]').forEach(el=>{
  const go=()=>{const n=el.dataset.goto;if(Z[n])select(n);else map.flyTo(D.cent[n],8,{duration:.6});};
  el.onclick=go;el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go();}};});}

/* ---- view switching: progressive disclosure ---- */
function showView(which){
 const over=$('#v-over'),zone=$('#v-zone');
 const on=which==='zone'?zone:over,off=which==='zone'?over:zone;
 off.classList.add('out');
 setTimeout(()=>{off.hidden=true;on.hidden=false;on.classList.add('out');
  requestAnimationFrame(()=>{on.classList.remove('out');on.scrollTop=0;});},180);}

function select(n,{zoom=true}={}){
 if(S.sel===n){deselect();return;}
 S.sel=n;const z=Z[n];if(z)S.prov=z.p;
 if(zoom){const l=layerByZone[n];
  if(l)map.flyToBounds(l.getBounds(),{padding:[80,80],maxZoom:9,duration:.65});
  else if(z&&z.lat!=null)map.flyTo([z.lat,z.lon],8.5,{duration:.65});}
 renderZone();renderProv();showView('zone');repaint();}
function deselect(){S.sel=null;renderProv();showView('over');repaint();}
$('#back').onclick=deselect;

/* ================= SEARCH ================= */
const si=$('#sinput'),sr=$('#sres'),sc2=$('#sclear');let hits=[],hi=-1;
function search(q){const t=q.trim().toLowerCase();sc2.style.display=t?'block':'none';
 if(!t){sr.dataset.open='false';$('#searchbox').setAttribute('aria-expanded','false');return;}
 const zs=D.zones.filter(z=>z.z.toLowerCase().includes(t)).map(z=>({t:'zone',n:z.z,p:z.p,c:z.c}));
 const ps=PROVS.filter(p=>p.toLowerCase().includes(t)).map(p=>({t:'prov',n:p}));
 hits=[...ps,...zs.sort((a,b)=>b.c-a.c)].slice(0,9);hi=-1;
 sr.innerHTML=hits.length?hits.map((h,i)=>`<div class="sopt" role="option" id="o${i}" aria-selected="false"
  data-t="${h.t}" data-n="${h.n}"><span class="nm">${h.n}</span>
  <span class="tag">${h.t==='prov'?tx('search_prov'):h.p}</span>
  ${h.t==='zone'?`<span class="ct mono">${fmt(h.c)}</span>`:''}</div>`).join('')
  :'<div class="sempty">'+tx('search_empty')+'</div>';
 sr.dataset.open='true';$('#searchbox').setAttribute('aria-expanded','true');
 sr.querySelectorAll('.sopt').forEach(o=>o.addEventListener('mousedown',e=>{e.preventDefault();commit(o.dataset.t,o.dataset.n);}));}
function commit(type,name){si.value='';sc2.style.display='none';sr.dataset.open='false';
 $('#searchbox').setAttribute('aria-expanded','false');
 if(type==='prov'){S.prov=name;deselect();renderProv();
  const pts=D.zones.filter(z=>z.p===name&&z.lat!=null).map(z=>[z.lat,z.lon]);
  if(pts.length)map.flyToBounds(L.latLngBounds(pts),{padding:[70,70],duration:.65});}
 else{S.sel=null;select(name);}}
si.addEventListener('input',e=>search(e.target.value));
si.addEventListener('keydown',e=>{if(sr.dataset.open!=='true')return;
 if(e.key==='ArrowDown'){e.preventDefault();hi=Math.min(hits.length-1,hi+1);mk();}
 else if(e.key==='ArrowUp'){e.preventDefault();hi=Math.max(0,hi-1);mk();}
 else if(e.key==='Enter'&&hi>=0){e.preventDefault();commit(hits[hi].t,hits[hi].n);}
 else if(e.key==='Escape')sr.dataset.open='false';});
function mk(){sr.querySelectorAll('.sopt').forEach((o,i)=>{o.setAttribute('aria-selected',String(i===hi));
 if(i===hi){o.scrollIntoView({block:'nearest'});si.setAttribute('aria-activedescendant','o'+i);}});}
si.addEventListener('blur',()=>setTimeout(()=>sr.dataset.open='false',130));
sc2.onclick=()=>{si.value='';search('');si.focus();};

/* ================= TIME FILTER ================= */
(function buildMonths(){
 const box=document.querySelector('.tchips');
 MONTHS.forEach(m=>{
  const idx=monthIdx(m), anyZone=idx.some(i=>TL[i].z>0);
  const b=document.createElement('button');
  b.dataset.month=m; b.setAttribute('aria-pressed','false');
  b.textContent=MN[m]||m;
  b.title=`${idx.length} report date${idx.length===1?'':'s'} · ${anyZone?'health-zone level':'national only'}`;
  box.appendChild(b);});
 box.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{
  stopPlay();
  if(b.id==='mLatest'){S.month=null;S.t=null;}
  else{S.month=b.dataset.month;S.t=monthIdx(S.month)[monthIdx(S.month).length-1];}
  syncTime();}));
})();

function syncTime(){
 document.querySelectorAll('.tchips button').forEach(b=>
  b.setAttribute('aria-pressed',String(b.id==='mLatest'?S.month==null:b.dataset.month===S.month)));
 const sl=$('#tslide'), play=$('#tplay');
 if(S.month==null){
  sl.disabled=true;play.disabled=true;
  $('#tdate').textContent=tx('t_latest');
  sl.setAttribute('aria-valuetext','latest');
  $('#covZ').className='cov on';$('#covN').className='cov on';
  $('#covNote').innerHTML=tx('covnote_latest');
  $('#covNote').className='';
 } else {
  const idx=monthIdx(S.month);
  sl.disabled=false;play.disabled=false;
  sl.min=0;sl.max=idx.length-1;
  sl.value=Math.max(0,idx.indexOf(S.t));
  const t=TL[S.t];
  $('#tdate').textContent=prettyDate(t.d);
  sl.setAttribute('aria-valuetext',prettyDate(t.d));
  $('#covZ').className='cov'+(t.z>0?' on':'');
  $('#covN').className='cov'+(t.n?' on':'');
  if(t.z>0)      $('#covNote').innerHTML=`${t.z} ${tx('sync_zones_reporting')}`, $('#covNote').className='';
  else if(t.n)   $('#covNote').innerHTML=tx('sync_nat_only'), $('#covNote').className='warn';
  else           $('#covNote').innerHTML='', $('#covNote').className='';
 }
 applyTime();
 const t=curTL();
 $('#nozone').className = (t&&t.z===0)?'on':'';
 if(t&&t.z===0) $('#nozone').innerHTML=
   `<b>${tx('nozone_a')} ${prettyDate(t.d)} 2026.</b><br>`+tx('nozone_b');
 if(S.sel&&t&&t.z===0){/* keep selection but the panel will show gaps */}
 renderNat();renderProv();if(S.sel)renderZone();repaint();}

$('#tslide').addEventListener('input',e=>{stopPlay();
 S.t=monthIdx(S.month)[+e.target.value];syncTime();});

let timer=null;
function stopPlay(){if(timer){clearInterval(timer);timer=null;}
 S.playing=false;$('#tplay').textContent='▶';$('#tplay').setAttribute('aria-label','Play through dates');}
$('#tplay').addEventListener('click',()=>{
 if(S.playing){stopPlay();return;}
 const idx=monthIdx(S.month);if(!idx.length)return;
 S.playing=true;$('#tplay').textContent='❚❚';$('#tplay').setAttribute('aria-label','Pause');
 if(idx.indexOf(S.t)>=idx.length-1)S.t=idx[0];
 timer=setInterval(()=>{
  const i=idx.indexOf(S.t);
  if(i>=idx.length-1){stopPlay();return;}
  S.t=idx[i+1];syncTime();},560);});


$('#theme').addEventListener('click',e=>{const light=document.documentElement.dataset.theme==='light';
 document.documentElement.dataset.theme=light?'dark':'light';
 e.currentTarget.textContent=light?'🌙':'☀';
 africaLayer.setStyle(f=>({color:css('--coast'),weight:f.properties.drc?1.1:.7,
   fillColor:f.properties.drc?css('--land-2'):css('--land'),fillOpacity:1}));
 provLayer.setStyle({color:css('--prov'),weight:.7,fill:false,dashArray:'2 2'});
 repaint();});

/* ================= INIT ================= */
document.getElementById('lang').textContent='🌐 '+(LANG==='fr'?'FR':'EN');document.documentElement.lang=LANG;applyStaticI18n();syncTime();renderNat();renderProv();repaint();drawCountryLabels();
setTimeout(()=>{map.invalidateSize();drawLabels();drawCountryLabels();},150);
addEventListener('resize',()=>map.invalidateSize());

/* ---- Data & Methods modal ---- */
(function(){const mm=document.getElementById('mmodal');
 document.getElementById('methods').addEventListener('click',()=>mm.classList.add('on'));
 document.getElementById('mmClose').addEventListener('click',()=>mm.classList.remove('on'));
 mm.addEventListener('click',e=>{if(e.target===mm)mm.classList.remove('on');});
 addEventListener('keydown',e=>{if(e.key==='Escape')mm.classList.remove('on');});})();
