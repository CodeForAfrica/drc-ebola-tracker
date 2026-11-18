/* Reads the live tracker config (unchanged) and writes the JSON the microsite imports.
   No value is edited: fields are copied, only geometry precision is reduced for the country outlines. */
const fs=require('fs');
const [,,cfgPath,out]=process.argv;
const src=fs.readFileSync(cfgPath,'utf8');const g={};
new Function('g',src+';g.CFG=CFG;g.D=D;g.PROV=PROV;g.CTRY=CTRY;g.BASE=BASE;g.T=T;')(g);
const r=(c,p)=>Array.isArray(c)?c.map(x=>r(x,p)):+c.toFixed(p);
const simp=(fc,p)=>({type:'FeatureCollection',features:fc.features.map(f=>({type:'Feature',properties:f.properties,geometry:{type:f.geometry.type,coordinates:r(f.geometry.coordinates,p)}}))});

/* Per-country reported history, so Trends can show every affected country, not DRC alone.
   Uganda has no per-statement CSV in data/ (outbreak over, one final figure) — its single point
   comes from its CTRY row. Kenya and Nigeria are read, one point per ministry statement, from the
   same CSVs the maintainer appends to by hand. No figure is typed or interpolated here. */
const dataDir=require('path').join(require('path').dirname(cfgPath),'data');
const splitCsv=(l)=>{const o=[];let cur='',q=false;for(const ch of l){if(ch==='"')q=!q;else if(ch===','&&!q){o.push(cur);cur='';}else cur+=ch;}o.push(cur);return o;};
const num=(v)=>v===''||v==null?null:+v;
const readMoh=(file)=>{const p=require('path').join(dataDir,file);if(!fs.existsSync(p))return[];const L=fs.readFileSync(p,'utf8').trim().split('\n');const H=splitCsv(L[0]);const ix=(k)=>H.indexOf(k);
 return L.slice(1).map((ln)=>{const c=splitCsv(ln);return{d:c[ix('statement_date')],c:num(c[ix('confirmed')]),dd:num(c[ix('deaths')]),r:num(c[ix('recoveries')]),src:c[ix('source')]};}).filter(x=>x.d);};
const ctryHist={};
for(const row of g.CTRY){const key=row.n.en;
 if(key==='Kenya')ctryHist[key]=readMoh('kenya_moh.csv');
 else if(key==='Nigeria')ctryHist[key]=readMoh('nigeria_fmoh.csv');
 else ctryHist[key]=[{d:row.asof,c:row.c,dd:row.d,r:row.r,src:row.src||null}];}
const data={
 source:{config:'config.drc-bvd-2026.js',sitrep:g.CFG.zoneRelease.sitrep,date:g.CFG.zoneRelease.date},
 nat:g.D.nat2, prov:g.PROV, ctry:g.CTRY, ctryHist,
 zones:g.D.zones, zgeo:g.D.geo,
 africa:simp(g.BASE.africa,3), provinces:simp(g.BASE.provinces,3),
 trends:g.D.trends,
 mob:g.D.mob,
 strings:{mm_cov2:g.T.en.mm_cov2,mm_cov_dakwa:g.T.en.mm_cov_dakwa,mm_cov_held:g.T.en.mm_cov_held,mm_cov_held169:g.T.en.mm_cov_held169,mob_note:g.T.en.mob_note,leg_note_mob:g.T.en.leg_note_mob,mob_none_post:g.T.en.mob_none_post}
};
fs.writeFileSync(out,JSON.stringify(data));
console.log('wrote',out,(fs.statSync(out).size/1024).toFixed(0)+' KB','zones',data.zones.length,'nat rows',data.nat.length,'last',JSON.stringify(data.nat[data.nat.length-1]));
