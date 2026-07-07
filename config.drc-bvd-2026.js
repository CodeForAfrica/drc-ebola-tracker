/* =============================================================================
 * PER-OUTBREAK CONTENT — the 2026 DRC/Uganda Bundibugyo outbreak (INSP SitRep N°051).
 *
 * This file holds EVERYTHING that changes between outbreaks: the tunables below,
 * the health-zone data, the EN/FR i18n strings, and the downloadable CSV datasets.
 * The engine (app.js) reads these globals and renders the dashboard; it contains
 * no outbreak-specific values. To spin off a new microsite, copy this file, change
 * the values, drop the matching files in data/, and reuse app.js + styles.css + the
 * index.html shell unchanged. See TEMPLATE.md.
 *
 * RULES (from CLAUDE.md): never invent/adjust numbers; every figure is WHO / Africa
 * CDC / INSP-sourced; aggregate no finer than health-zone; keep the "⚠ verify against
 * WHO before publishing" lines (in the i18n legend_src / ctx_none strings).
 * French strings are AI-assisted and MUST be reviewed by a Francophone before publishing.
 * ========================================================================== */

/* ===== TUNABLES (per-outbreak map + ramp config) ===== */
const FILL_RAMP=['#fee5d9','#fcae91','#fb6a4a','#de2d26','#a50f15','#67000d']; // sequential red; swap to restyle
const RAMP_MAX=438;                                   // ramp domain max = highest single-zone case count
const RAMP_TICKS=['1','10','50','150','438'];         // legend tick labels under the ramp
const EPI_BOUNDS=[[-0.1,29.05],[2.35,30.70]];         // initial map extent (fitBounds): the high-case cluster
const LABEL_MIN=5;                                    // choropleth zones with >= this many cases get a number label
const ATTR='&copy; OpenStreetMap &copy; CARTO &middot; data: INSP SitRep N°051';
const DATA_FILES={                                    // runtime-fetched data (relative to the page)
  geojson:'data/zones_sitrep051.geojson',             // choropleth polygons
  trends:'data/zone_trends_sitrep.json',              // per-zone case/death time series
  mobility:'data/zone_mobility_flowminder.json'       // per-zone Flowminder mobility
};

/* ============ DATA ============ */
/* Place names, provinces, countries and case figures are language-independent
   identifiers; the translatable prose lives under each record's i18n.{en,fr}. */
const HZ=[
  {name:"Bunia",prov:"Ituri",country:"DRC",cases:438,deaths:118,lat:1.5667,lng:30.2500,
    i18n:{
      en:{tag:"Referral hub",
        ctx:"Bunia is Ituri's provincial capital and main referral hub, and reports the highest confirmed case count in the province (296). It sits less than 40 km from the Uganda border, making it central to cross-border transmission risk.",
        note:"Cases migrated here from Mongbwalu to seek medical care."},
      fr:{tag:"Pôle de référence",
        ctx:"Bunia est le chef-lieu de l'Ituri et son principal pôle de référence ; elle enregistre le plus grand nombre de cas confirmés de la province (296). Située à moins de 40 km de la frontière ougandaise, elle est au cœur du risque de transmission transfrontalière.",
        note:"Des cas s'y sont déplacés depuis Mongbwalu pour chercher des soins médicaux."}}},
  {name:"Rwampara",prov:"Ituri",country:"DRC",cases:344,deaths:71,lat:1.4800,lng:30.2300,
    i18n:{
      en:{tag:"Care-seeking destination",
        ctx:"Rwampara is one of the three health zones (with Bunia and Mongbwalu) that together account for the bulk of confirmed cases. Transmission here is linked to care-seeking movement from the outbreak origin.",
        note:"Among the earliest-declared health zones of the 17th outbreak."},
      fr:{tag:"Destination de recours aux soins",
        ctx:"Rwampara est l'une des trois zones de santé (avec Bunia et Mongbwalu) qui concentrent l'essentiel des cas confirmés. La transmission y est liée aux déplacements pour recours aux soins depuis le foyer d'origine.",
        note:"Parmi les premières zones de santé déclarées lors de la 17e épidémie."}}},
  {name:"Mongbwalu",prov:"Ituri",country:"DRC",cases:278,deaths:141,lat:1.9400,lng:30.0300,
    i18n:{
      en:{tag:"Presumed origin",
        ctx:"Mongbwalu — a high-traffic gold-mining area — is the presumed origin of the outbreak. Four health-worker deaths within four days at Mongbwalu General Referral Hospital signalled critical breaches in infection prevention and control early in the response.",
        note:"High population mobility tied to mining amplifies transmission risk."},
      fr:{tag:"Origine présumée",
        ctx:"Mongbwalu — une zone aurifère à fort trafic — est l'origine présumée de l'épidémie. Le décès de quatre agents de santé en quatre jours à l'Hôpital général de référence de Mongbwalu a révélé de graves défaillances de la prévention et du contrôle des infections au début de la riposte.",
        note:"La forte mobilité de la population liée à l'exploitation minière amplifie le risque de transmission."}}},
  {name:"Nyankunde",prov:"Ituri",country:"DRC",cases:95,deaths:17,lat:1.4000,lng:30.1800,
    i18n:{
      en:{tag:"Care-seeking destination",
        ctx:"Nyankunde, south of Bunia, is among the Ituri health zones with confirmed cases and is associated with referral and care-seeking movement within the province.",
        note:"Lower count than the three core zones but part of the active cluster."},
      fr:{tag:"Destination de recours aux soins",
        ctx:"Nyankunde, au sud de Bunia, fait partie des zones de santé de l'Ituri comptant des cas confirmés et est associée aux déplacements de référence et de recours aux soins au sein de la province.",
        note:"Nombre de cas inférieur à celui des trois zones principales, mais elle fait partie du foyer actif."}}},
  {name:"Katwa",prov:"Nord-Kivu",country:"DRC",cases:52,deaths:38,lat:0.12058,lng:29.32371,
    i18n:{
      en:{tag:"North Kivu cluster",
        ctx:"Katwa, near Butembo in North Kivu, is among the North Kivu health zones now reporting confirmed cases — evidence the outbreak has reached beyond its Ituri core. Its high case-fatality (19 of 32 confirmed) should be read cautiously: on small caseloads, undetected milder cases can inflate the ratio.",
        note:"Katwa was a major hotspot of the 2018-2020 Kivu Ebola outbreak. (Verify.)"},
      fr:{tag:"Foyer du Nord-Kivu",
        ctx:"Katwa, près de Butembo au Nord-Kivu, fait partie des zones de santé du Nord-Kivu désormais touchées — signe que l'épidémie s'étend au-delà de son foyer ituri. Sa létalité élevée (19 décès sur 32 cas confirmés) doit être interprétée avec prudence : sur de faibles effectifs, les cas bénins non détectés peuvent gonfler ce ratio.",
        note:"Katwa fut un foyer majeur de l'épidémie d'Ebola au Kivu de 2018-2020. (À vérifier.)"}}},
  {name:"Nizi",prov:"Ituri",country:"DRC",cases:72,deaths:19,lat:1.74969,lng:30.32474,
    i18n:{
      en:{tag:"Ituri mining belt",
        ctx:"Nizi, in Djugu territory, sits in the Ituri gold-mining belt close to Mongbwalu, the presumed origin. Its caseload is consistent with local spread and care-seeking movement around that core.",
        note:"Proximity to Mongbwalu and high mining-related mobility raise transmission risk."},
      fr:{tag:"Ceinture minière de l'Ituri",
        ctx:"Nizi, dans le territoire de Djugu, se situe dans la ceinture aurifère de l'Ituri, près de Mongbwalu, l'origine présumée. Son nombre de cas est cohérent avec une diffusion locale et les déplacements de recours aux soins autour de ce foyer.",
        note:"La proximité de Mongbwalu et la forte mobilité minière accroissent le risque de transmission."}}},
  {name:"Butembo",prov:"Nord-Kivu",country:"DRC",cases:40,deaths:18,lat:0.13996,lng:29.25991,
    i18n:{
      en:{tag:"North Kivu urban centre",
        ctx:"Butembo is a large North Kivu commercial city; confirmed cases here carry outsized weight because dense urban populations and heavy trade movement can accelerate spread. The 13 deaths in 28 confirmed reflect a high reported fatality, with the usual small-number caveat.",
        note:"A focal city of the 2018-2020 Kivu Ebola outbreak. (Verify.)"},
      fr:{tag:"Centre urbain du Nord-Kivu",
        ctx:"Butembo est une grande ville commerciale du Nord-Kivu ; les cas confirmés y pèsent particulièrement, car la densité urbaine et l'intensité des échanges peuvent accélérer la propagation. Les 13 décès sur 28 cas confirmés traduisent une létalité élevée, avec la réserve habituelle des faibles effectifs.",
        note:"Ville-clé de l'épidémie d'Ebola au Kivu de 2018-2020. (À vérifier.)"}}},
  {name:"Lita",prov:"Ituri",country:"DRC",cases:33,deaths:12,lat:1.57476,lng:30.37491,
    i18n:{
      en:{tag:"Ituri — Djugu",
        ctx:"Lita, in Djugu territory north of Bunia, is part of the Ituri cluster where most confirmed cases concentrate. Transmission here is linked to movement within the province's outbreak core.",
        note:"Among the Ituri health zones in the active cluster."},
      fr:{tag:"Ituri — Djugu",
        ctx:"Lita, dans le territoire de Djugu au nord de Bunia, fait partie du foyer ituri où se concentrent la plupart des cas confirmés. La transmission y est liée aux déplacements au sein du cœur épidémique de la province.",
        note:"Parmi les zones de santé de l'Ituri du foyer actif."}}},
  {name:"Beni",prov:"Nord-Kivu",country:"DRC",cases:29,deaths:17,lat:0.49952,lng:29.46953,
    i18n:{
      en:{tag:"North Kivu — prior epicentre",
        ctx:"Beni is a major North Kivu city and was the epicentre of the 2018-2020 Ebola outbreak, leaving it with significant prior response infrastructure. Confirmed cases here signal the outbreak's reach into a historically high-risk, high-mobility hub.",
        note:"12 deaths in 20 confirmed; read the ratio with small-number caution."},
      fr:{tag:"Nord-Kivu — ancien épicentre",
        ctx:"Beni est une grande ville du Nord-Kivu et fut l'épicentre de l'épidémie d'Ebola de 2018-2020, ce qui lui confère d'importantes infrastructures de riposte. Les cas confirmés y signalent l'extension de l'épidémie vers un carrefour historiquement à haut risque et à forte mobilité.",
        note:"12 décès sur 20 cas confirmés ; ratio à interpréter avec la prudence des faibles effectifs."}}}
];
const CONTEXT=[
  {name:"Kampala Metro",prov:"Kampala / Wakiso",country:"Uganda",lat:0.3476,lng:32.5825,kind:"uganda",
    i18n:{
      en:{label:"Kampala Metropolitan Area",sub:"20 confirmed · 2 deaths",
        ctx:"Uganda's 20 confirmed cases (15 imported, 5 local) are confined to the Kampala Metropolitan Area (Kampala &amp; Wakiso districts), epidemiologically linked to DRC. Source: WHO DON608 / Uganda MoH (05 Jul) — separate from the INSP zone layer, which is DRC-only. As of that report, no new cases in the prior six days and no documented community transmission.",
        note:"820 contacts listed; 409 under active follow-up, 394 completed 21 days."},
      fr:{label:"Aire métropolitaine de Kampala",sub:"20 confirmés · 2 décès",
        ctx:"Les 20 cas confirmés en Ouganda (15 importés, 5 locaux) sont confinés à l'aire métropolitaine de Kampala (districts de Kampala et Wakiso), épidémiologiquement liés à la RDC. Source : OMS DON608 / ministère ougandais de la Santé (05 juillet) — distincte des données par zone de l'INSP, qui ne couvrent que la RDC. À la date de ce rapport, aucun nouveau cas au cours des six derniers jours et aucune transmission communautaire documentée.",
        note:"820 contacts répertoriés ; 409 sous suivi actif, 394 ayant achevé les 21 jours."}}}
];
/* The 25 lower-burden zones (<20 confirmed cases, INSP SitRep N°051). These carry no
   curated i18n (tag/ctx/note); they are merged into HZ below so every one of the 34
   zones gets a clustered marker and a clickable choropleth polygon. selectZone()
   shows figures only and hides the narrative blocks for these (no "undefined"). */
const TAIL=[
  {name:"Bambu",prov:"Ituri",cases:18,deaths:5,lat:1.87176,lng:30.22046},
  {name:"Mangala",prov:"Ituri",cases:26,deaths:14,lat:1.96698,lng:30.41024},
  {name:"Komanda",prov:"Ituri",cases:22,deaths:8,lat:1.13414,lng:29.64301},
  {name:"Tchomia",prov:"Ituri",cases:15,deaths:2,lat:1.52789,lng:30.59572},
  {name:"Kilo",prov:"Ituri",cases:9,deaths:1,lat:1.76212,lng:30.08494},
  {name:"Aungba",prov:"Ituri",cases:6,deaths:2,lat:2.59705,lng:30.59664},
  {name:"Logo",prov:"Ituri",cases:7,deaths:0,lat:2.17107,lng:30.91868},
  {name:"Damas",prov:"Ituri",cases:5,deaths:0,lat:2.18521,lng:30.17799},
  {name:"Rimba",prov:"Ituri",cases:3,deaths:0,lat:2.21952,lng:30.75595},
  {name:"Aru",prov:"Ituri",cases:3,deaths:1,lat:2.85261,lng:30.73485},
  {name:"Oicha",prov:"Nord-Kivu",cases:3,deaths:2,lat:0.75582,lng:29.59942},
  {name:"Kyondo",prov:"Nord-Kivu",cases:4,deaths:2,lat:0.01319,lng:29.4859},
  {name:"Miti-Murhesa",prov:"Sud-Kivu",cases:3,deaths:1,lat:-2.33753,lng:28.86162},
  {name:"Mambasa",prov:"Ituri",cases:2,deaths:1,lat:1.44963,lng:28.69974},
  {name:"Nia-Nia",prov:"Ituri",cases:12,deaths:5,lat:1.31274,lng:27.97986},
  {name:"Kalunguta",prov:"Nord-Kivu",cases:2,deaths:1,lat:0.43659,lng:29.51381},
  {name:"Musienene",prov:"Nord-Kivu",cases:6,deaths:2,lat:0.01858,lng:28.65899},
  {name:"Drodro",prov:"Ituri",cases:3,deaths:3,lat:1.74173,lng:30.54869},
  {name:"Gety",prov:"Ituri",cases:1,deaths:0,lat:1.26554,lng:30.2325},
  {name:"Kambala",prov:"Ituri",cases:2,deaths:2,lat:2.33517,lng:30.48101},
  {name:"Fataki",prov:"Ituri",cases:1,deaths:0,lat:1.91391,lng:30.55534},
  {name:"Goma",prov:"Nord-Kivu",cases:1,deaths:0,lat:-1.6526,lng:29.18021},
  {name:"Masereka",prov:"Nord-Kivu",cases:2,deaths:0,lat:-0.18405,lng:29.55946},
  {name:"Vuhovi",prov:"Nord-Kivu",cases:1,deaths:1,lat:0.25118,lng:29.25411},
  {name:"Mabalako",prov:"Nord-Kivu",cases:1,deaths:0,lat:0.46812,lng:29.21145},
  {name:"Mandima",prov:"Ituri",cases:4,deaths:1,lat:0.91185,lng:29.19347},
  {name:"Lolwa",prov:"Ituri",cases:1,deaths:1,lat:1.82992,lng:29.44205}
];
// Merge the 25 lower-burden zones into HZ → one 34-zone array (all DRC).
TAIL.forEach(z=>{z.country="DRC";});
HZ.push(...TAIL);

// Figures that aren't broken out by health zone, kept as named constants.
const UGANDA={confirmed:20,deaths:2,admissions:2,recoveries:16};   // WHO DON608 (17 Jun) — separate source/date
const AWAITING_CASES=17;                // DRC cases awaiting health-zone assignment (INSP SitRep N°051)
const DRC_RECOVERED=254;                // INSP SitRep N°051

// Per-zone population (2024) and cumulative incidence per 100k — INSP / projections.
const POP={"Bunia":[268128,163.4],"Rwampara":[134068,256.6],"Mongbwalu":[133371,208.4],"Nyankunde":[97949,97],"Nizi":[141651,50.8],"Katwa":[411346,12.6],"Butembo":[316182,12.7],"Lita":[128175,25.7],"Beni":[382409,7.6],"Mangala":[92662,28.1],"Komanda":[184816,11.9],"Bambu":[148752,12.1],"Tchomia":[110386,13.6],"Nia-Nia":[71361,16.8],"Kilo":[55902,16.1],"Logo":[240552,2.9],"Aungba":[158181,3.8],"Musienene":[249370,2.4],"Damas":[116731,4.3],"Mandima":[138196,2.9],"Kyondo":[215154,1.9],"Rimba":[211373,1.4],"Aru":[181110,1.7],"Drodro":[154777,1.9],"Oicha":[336160,0.9],"Miti-Murhesa":[239135,1.3],"Mambasa":[95906,2.1],"Kambala":[123772,1.6],"Kalunguta":[199559,1],"Masereka":[177664,1.1],"Gety":[186541,0.5],"Fataki":[128262,0.8],"Lolwa":[45779,2.2],"Goma":[251728,0.4],"Vuhovi":[121520,0.8],"Mabalako":[186148,0.5]};

/* ============ I18N ============
   French strings below are AI-assisted and MUST be reviewed by a Francophone
   team member before publishing — consistent with the project's
   "verify against WHO before publishing" rule. Check medical/epidemiological
   terms against WHO French (OMS) usage. Place names, figures and CSV data are
   intentionally left untranslated. */
const PROV_I18N={
  "Ituri":{en:"Ituri",fr:"Ituri"},
  "North Kivu":{en:"North Kivu",fr:"Nord-Kivu"},
  "South Kivu":{en:"South Kivu",fr:"Sud-Kivu"},
  "Nord-Kivu":{en:"North Kivu",fr:"Nord-Kivu"},
  "Sud-Kivu":{en:"South Kivu",fr:"Sud-Kivu"},
  "Kampala / Wakiso":{en:"Kampala / Wakiso",fr:"Kampala / Wakiso"}
};
const COUNTRY_I18N={
  "DRC":{en:"DRC",fr:"RDC"},
  "Uganda":{en:"Uganda",fr:"Ouganda"}
};
const I18N={
  en:{
    doc_title:"DRC · Uganda — Ebola Bundibugyo 2026 · Interactive Dashboard",
    app_title_html:'Ebola <span>Bundibugyo</span> 2026 · DRC &amp; Uganda',
    topbar_sub:"Interactive outbreak dashboard · INSP SitRep N°051 + Uganda MoH · as of 04–05 Jul 2026",
    btn_data:"Contributors, Data & Methods",
    btn_terms:"Terms of Use",
    theme_title:"Toggle light/dark mode",
    lang_title:"Changer de langue · Switch language",
    hint:"Click a shaded zone to inspect a health zone · scroll to zoom",
    legend_title:"Confirmed cases",
    legend_sub:"DRC health zones · INSP SitRep N°051 · 04 Jul 2026",
    legend_colour:"Colour · case intensity",
    legend_scale:"Scale",
    seg_log:"log",
    seg_linear:"linear",
    legend_choropleth:"Choropleth · confirmed cases",
    legend_cluster_head:"Clusters · confirmed cases",
    legend_cluster:"Bubbles group nearby zones; the number on each marker or bubble is confirmed cases (per zone, or the group total when clustered), coloured by that count. Hover for zone detail; zoom in to separate.",
    legend_click_marker:"Number on each marker/bubble = confirmed cases",
    view_label:"View:",
    view_choro:"Choropleth",
    view_cluster:"Clusters",
    cluster_zones:"zones",
    cluster_cases:"confirmed cases",
    cluster_more:"more",
    legend_markers:"Map",
    legend_click_zone:"Click a shaded zone for detail",
    legend_ctx_uga:"Uganda · Kampala metro (20 confirmed)",
    legend_src:"Each DRC health-zone polygon is shaded by confirmed cases on a sequential red ramp (light = few, dark = many) — click a zone for its detail. Zone figures are INSP SitRep N°051 (04 Jul 2026, DRC only); Uganda (Kampala) is a separate Uganda MoH context marker (05 Jul). 17 cases awaiting health-zone assignment (INSP SitRep N°051, 04 Jul). ⚠ Verify against WHO before publishing.",
    zone_title:"Health zone",
    zone_hint:"Select a zone ›",
    tab_snap:"Current snapshot",
    tab_trend:"Trends",
    tab_ctx:"Context",
    snap_empty:"Select a health zone on the map to see its current snapshot.",
    kpi_confirmed:"Confirmed cases",
    kpi_share:"Share of DRC",
    share_ituri_confirmed:"Share of DRC confirmed (INSP SitRep N°051)",
    share_drc_caption:"share of all confirmed cases in DRC (1561, INSP SitRep N°051, 04 Jul); excludes Uganda, which is not reported by health zone.",
    snap_deaths:"deaths",
    tip_cases:"cases",
    tip_deaths:"deaths",
    trend_tag:"National cumulative",
    trend_desc:"Confirmed cases reported across WHO Disease Outbreak News. Per–health-zone time series are not published by WHO.",
    trend_note:"DRC: 83 (21 May) → 515 (8 Jun) → 676 (10 Jun) → 896 (17 Jun). Uganda flat at 19 since 8 Jun.",
    ctx_empty:"Select a health zone for response context.",
    ctx_none:"No curated context for this zone — confirmed figures only. ⚠ Verify against WHO before publishing.",
    trend_empty:"Select a health zone to see its case & death trend.",
    trend_caption:"Cumulative confirmed cases and deaths, INSP SitReps (14 May–04 Jul). Counts are occasionally revised down between reports.",
    trend_cases:"Cases",
    trend_deaths:"Deaths",
    ctx_pop_header:"Population",
    ctx_pop_year:"Population (2024)",
    ctx_incidence:"Cumulative incidence per 100k",
    ctx_mob_header:"Mobility · importation risk",
    ctx_mob_recipient:"Rank #{rank} of 141 recipient zones · {pct}% of the outbreak-origin cohort reached here by 24 May.",
    ctx_mob_origin:"Outbreak-origin zone — the source of the mobility cohort, not a recipient.",
    ctx_mob_excluded:"Excluded from the Flowminder mobility study for data quality.",
    ctx_mob_caveat:"Vodacom/Flowminder CDR, movements 24 Apr–24 May 2026; Vodacom subscribers only. Mobility predicts importation risk, not transmission.",
    resp_title:"National & provincial response",
    resp_confirmed_both:"Confirmed (both countries)",
    ctry_drc:"DR Congo",ctry_uga:"Uganda",rt_confirmed:"confirmed",rt_deaths:"deaths",rt_recovered:"recovered",rt_both:"both countries",th_confirmed:"Confirmed",th_recoveries:"Recoveries",th_deaths:"Deaths",sum_confirmed:"Cumulative confirmed",sum_admissions:"Current admissions",sum_recoveries:"Recoveries",sum_deaths:"Cumulative deaths",sum_src_drc:"INSP SitRep N°051 · 04 Jul 2026",sum_src_uga:"Uganda MoH · 05 Jul 2026",
    resp_deaths:"Deaths · CFR ≈25.3% (provisional)",
    resp_hz:"Health zones with cases (DRC) · INSP SitRep N°051",
    resp_recovered:"Recovered (DRC) · INSP SitRep N°051",
    resp_followup:"Contact follow-up (Ituri) · per DON608 · 17 Jun",
    risk_drc:"DRC",
    risk_uganda:"Uganda",
    risk_borders:"Bordering countries",
    risk_rest:"Rest of Africa · global",
    pill_vh:"Very high",
    pill_h:"High",
    pill_l:"Low",
    resp_note:"159 health zones categorized affected or at risk (risk-stratification, 8 Jun). Candidate-therapeutics trial underway: MBP134, REGN3479 (treatment); obeldesivir (post-exposure prophylaxis). No licensed vaccine or treatment for BVD.",
    modal_data_title:"Contributors, Data & Methods",
    md_h_source:"Data source",
    md_source_p:"All DRC figures — national headline and every health zone — are transcribed from INSP situation reports (SitRep N°051, 04 July 2026, Table II). Uganda figures are from the Uganda Ministry of Health Ebola portal (05 July 2026). WHO Disease Outbreak News (DON608, 17 Jun) is retained only as a cross-reference.",
    who_link_text:"WHO DON608 — Ebola disease caused by Bundibugyo virus, DRC & Uganda (19 June 2026)",
    md_asof_p:"DRC figures are as of 04 July 2026 (INSP SitRep N°051); Uganda figures are as of 05 July 2026 (Uganda Ministry of Health). The headline total is a composite of these two sources.",
    md_h_method:"Method",
    md_method_1:"The map is a <strong>choropleth</strong>: each health-zone polygon is shaded by confirmed cases on a sequential red ramp (light = few, dark = many). Click a shaded zone for its detail; hover to highlight it.",
    md_method_2:"Each zone polygon is <strong>interactive</strong>: hovering highlights it and shows its figures, and clicking opens the zone's snapshot. Uganda (Kampala) is the only point marker, on a separate context layer.",
    md_method_3:"All three affected provinces — Ituri, North Kivu and South Kivu — are now mapped at <strong>health-zone level</strong> from INSP SitRep N°051 (04 Jul 2026); the earlier North and South Kivu province context markers have been retired. Only Uganda (Kampala Metro) remains a separate context marker, as it is reported by a different source. 17 DRC cases were awaiting health-zone distribution at the time of reporting.",
    md_method_4:"Zone polygons are <strong>approximate health-zone boundaries</strong> for visual placement, not official administrative boundaries.",
    md_method_5:"The per-zone Trends tab shows cumulative confirmed cases and deaths from successive INSP SitReps (14 May–04 Jul 2026).",
    md_method_6:"DRC case-fatality is provisional — confirmed deaths ÷ confirmed cases (506/1561 ≈ 32.4%, INSP SitRep N°051). Not comparable to earlier DONs (different case definition) and unstable while most cases remain unresolved.",
    md_h_figures:"WHO figures (view / download at source)",
    md_fig_alt:"WHO Figure 1: distribution of confirmed BVD cases, DRC and Uganda",
    md_figcap:"WHO Figure 1 — distribution of confirmed cases, DRC (10 Jun) & Uganda (11 Jun). © WHO.",
    dl_fig1:"Fig 1 · distribution map",
    dl_fig2:"Fig 2 · DRC epicurve",
    dl_fig3:"Fig 3 · Uganda epicurve",
    md_h_csv:"Download the data (CSV)",
    dl_csv_sitrep39:"Cases by health zone — INSP SitRep N°051 (04 Jul)",
    dl_csv_hz:"Cases by health zone — WHO DON608 (17 Jun)",
    dl_csv_prov:"Province summary",
    dl_csv_country:"Country summary",
    dl_csv_contacts:"Contact tracing",
    dl_csv_trend:"Cumulative trend",
    dl_csv_risk:"WHO risk levels",
    md_h_attr:"Attribution",
    md_attr_p:"Epidemiological data © World Health Organization 2026. Basemap © OpenStreetMap contributors, © CARTO. This dashboard is an independent visualisation for humanitarian information purposes and is not an official WHO product. Inspired by the layout of the INRB-UMIE BDBV 2026 Epidemic Dashboard.",
    modal_terms_title:"Terms of Use",
    terms_p1:"This dashboard reproduces publicly available figures from WHO Disease Outbreak News for non-commercial humanitarian information purposes. It is not an official publication of WHO, INRB, or any government authority.",
    terms_h_warranty:"No warranty",
    terms_warranty_p:"Figures evolve rapidly and are frequently revised in later reports; counts shown reflect a single point in time (04–05 July 2026) and should not be treated as real-time surveillance. Marker locations are approximate and do not represent official administrative boundaries.",
    terms_h_rights:"Rights",
    terms_rights_p:"All epidemiological data and figures remain the property of the World Health Organization and underlying national authorities. Map tiles are © OpenStreetMap contributors and © CARTO. Always cite the original WHO Disease Outbreak News source (DON608) for any onward use.",
    terms_h_sensitive:"Sensitive context",
    terms_sensitive_p:"This is an active public health emergency affecting conflict-affected and displaced communities. Please use this information responsibly.",
    meta_hz:"{prov} Province · {country} · INSP SitRep N°051",
    meta_ctx:"{prov} · {country} · Uganda MoH",
    na:"n/a",
    ctx_confirmed_kampala:"Confirmed in Kampala metro",
    ctx_hz_affected:"Health zones affected",
    tag_crossborder:"Cross-border",
    tag_geoexpansion:"Geographic expansion",
    tip_confirmed_cases:"confirmed cases",
    chart_trend_drc:"DRC confirmed",
    chart_trend_uga:"Uganda confirmed",
    chart_dates:["21 May","8 Jun","10 Jun","17 Jun"],
    chart_active:"Active",
    chart_recovered:"Recovered",
    chart_deaths:"Deaths"
  },
  fr:{
    doc_title:"RDC · Ouganda — Ebola Bundibugyo 2026 · Tableau de bord interactif",
    app_title_html:'Ebola <span>Bundibugyo</span> 2026 · RDC et Ouganda',
    topbar_sub:"Tableau de bord interactif de l'épidémie · SitRep N°051 de l'INSP + MinSanté Ouganda · au 04–05 juil 2026",
    btn_data:"Contributeurs, données et méthodes",
    btn_terms:"Conditions d'utilisation",
    theme_title:"Basculer en mode clair/sombre",
    lang_title:"Changer de langue · Switch language",
    hint:"Cliquez sur une zone colorée pour examiner une zone de santé · défilez pour zoomer",
    legend_title:"Cas confirmés",
    legend_sub:"Zones de santé de la RDC · INSP SitRep N°051 · 04 juillet 2026",
    legend_colour:"Couleur · intensité des cas",
    legend_scale:"Échelle",
    seg_log:"log",
    seg_linear:"linéaire",
    legend_choropleth:"Choroplèthe · cas confirmés",
    legend_cluster_head:"Grappes · cas confirmés",
    legend_cluster:"Les grappes regroupent les zones proches ; le nombre sur chaque marqueur ou grappe indique les cas confirmés (par zone, ou le total du groupe), coloré selon ce nombre. Survolez pour le détail ; zoomez pour les séparer.",
    legend_click_marker:"Nombre sur chaque marqueur/grappe = cas confirmés",
    view_label:"Vue :",
    view_choro:"Choroplèthe",
    view_cluster:"Grappes",
    cluster_zones:"zones",
    cluster_cases:"cas confirmés",
    cluster_more:"de plus",
    legend_markers:"Carte",
    legend_click_zone:"Cliquez sur une zone colorée pour le détail",
    legend_ctx_uga:"Ouganda · agglomération de Kampala (20 confirmés)",
    legend_src:"Chaque polygone de zone de santé de la RDC est coloré selon le nombre de cas confirmés sur un dégradé rouge séquentiel (clair = peu, foncé = beaucoup) — cliquez sur une zone pour son détail. Les chiffres par zone proviennent du SitRep N°051 de l'INSP (04 juillet 2026, RDC uniquement) ; l'Ouganda (Kampala) est un marqueur contextuel distinct (MinSanté ougandais, 05 juillet). 17 cas en attente d'attribution à une zone de santé (INSP SitRep N°051, 04 juillet). ⚠ Vérifier auprès de l'OMS avant publication.",
    zone_title:"Zone de santé",
    zone_hint:"Sélectionnez une zone ›",
    tab_snap:"Aperçu actuel",
    tab_trend:"Tendances",
    tab_ctx:"Contexte",
    snap_empty:"Sélectionnez une zone de santé sur la carte pour afficher son aperçu actuel.",
    kpi_confirmed:"Cas confirmés",
    kpi_share:"Part de la RDC",
    share_ituri_confirmed:"Part des cas confirmés de la RDC (INSP SitRep N°051)",
    share_drc_caption:"part de tous les cas confirmés en RDC (1561, INSP SitRep N°051, 04 juillet) ; hors Ouganda, non ventilé par zone de santé.",
    snap_deaths:"décès",
    tip_cases:"cas",
    tip_deaths:"décès",
    trend_tag:"Cumul national",
    trend_desc:"Cas confirmés rapportés dans les Bulletins d'information sur les flambées épidémiques de l'OMS. Les séries chronologiques par zone de santé ne sont pas publiées par l'OMS.",
    trend_note:"RDC : 83 (21 mai) → 515 (8 juin) → 676 (10 juin) → 896 (17 juin). Ouganda stable à 19 depuis le 8 juin.",
    ctx_empty:"Sélectionnez une zone de santé pour le contexte de la riposte.",
    ctx_none:"Aucun contexte détaillé pour cette zone — chiffres confirmés uniquement. ⚠ Vérifier auprès de l'OMS avant publication.",
    trend_empty:"Sélectionnez une zone de santé pour voir sa courbe de cas et de décès.",
    trend_caption:"Cas et décès confirmés cumulés, SitReps de l'INSP (14 mai–04 juillet). Les comptages sont parfois révisés à la baisse entre les rapports.",
    trend_cases:"Cas",
    trend_deaths:"Décès",
    ctx_pop_header:"Population",
    ctx_pop_year:"Population (2024)",
    ctx_incidence:"Incidence cumulée pour 100 000",
    ctx_mob_header:"Mobilité · risque d'importation",
    ctx_mob_recipient:"Rang n°{rank} sur 141 zones réceptrices · {pct} % de la cohorte d'origine de l'épidémie atteinte ici au 24 mai.",
    ctx_mob_origin:"Zone d'origine de l'épidémie — source de la cohorte de mobilité, pas une zone réceptrice.",
    ctx_mob_excluded:"Exclue de l'étude de mobilité Flowminder pour qualité des données.",
    ctx_mob_caveat:"Données Vodacom/Flowminder, déplacements du 24 avr. au 24 mai 2026 ; abonnés Vodacom uniquement. La mobilité prédit le risque d'importation, pas la transmission.",
    resp_title:"Riposte nationale et provinciale",
    resp_confirmed_both:"Confirmés (les deux pays)",
    ctry_drc:"RD Congo",ctry_uga:"Ouganda",rt_confirmed:"confirmés",rt_deaths:"décès",rt_recovered:"guéris",rt_both:"les deux pays",th_confirmed:"Confirmés",th_recoveries:"Guéris",th_deaths:"Décès",sum_confirmed:"Cas confirmés cumulés",sum_admissions:"Admissions en cours",sum_recoveries:"Guéris",sum_deaths:"Décès cumulés",sum_src_drc:"INSP SitRep N°051 · 04 juillet 2026",sum_src_uga:"MinSanté Ouganda · 05 juillet 2026",
    resp_deaths:"Décès · TL ≈25,3 %",
    resp_hz:"Zones de santé avec des cas (RDC) · INSP SitRep N°051",
    resp_recovered:"Guéris (RDC) · INSP SitRep N°051",
    resp_followup:"Suivi des contacts (Ituri) · selon le DON608 · 17 juin",
    risk_drc:"RDC",
    risk_uganda:"Ouganda",
    risk_borders:"Pays frontaliers",
    risk_rest:"Reste de l'Afrique · mondial",
    pill_vh:"Très élevé",
    pill_h:"Élevé",
    pill_l:"Faible",
    resp_note:"159 zones de santé classées touchées ou à risque (stratification du risque, 8 juin). Essai de thérapies candidates en cours : MBP134, REGN3479 (traitement) ; obeldesivir (prophylaxie post-exposition). Aucun vaccin ni traitement homologué contre la MVB.",
    modal_data_title:"Contributeurs, données et méthodes",
    md_h_source:"Source des données",
    md_source_p:"Les chiffres par zone de santé sont transcrits des rapports de situation de l'INSP (SitRep N°051, 04 juillet 2026). Les chiffres nationaux globaux et ceux de l'Ouganda proviennent du Bulletin d'information sur les flambées de l'OMS (DON608). L'OMS cite le COUSP-RDC / INSP comme source sous-jacente pour la RDC.",
    who_link_text:"OMS DON608 — Maladie à virus Ebola Bundibugyo, RDC et Ouganda (19 juin 2026)",
    md_asof_p:"Les données par zone de santé de la RDC sont arrêtées au 04 juillet 2026 (SitRep N°051 de l'INSP) ; les chiffres nationaux et ougandais du DON608 de l'OMS sont arrêtés aux 17–18 juin. Les totaux affichés constituent donc un composite de deux sources et de deux dates.",
    md_h_method:"Méthode",
    md_method_1:"La carte est une <strong>choroplèthe</strong> : chaque polygone de zone de santé est coloré selon le nombre de cas confirmés sur un dégradé rouge séquentiel (clair = peu, foncé = beaucoup). Cliquez sur une zone colorée pour son détail ; survolez pour la mettre en évidence.",
    md_method_2:"Chaque polygone de zone est <strong>interactif</strong> : le survol le met en évidence et affiche ses chiffres, et le clic ouvre l'aperçu de la zone. L'Ouganda (Kampala) est le seul marqueur ponctuel, sur une couche contextuelle distincte.",
    md_method_3:"Les trois provinces touchées — Ituri, Nord-Kivu et Sud-Kivu — sont désormais cartographiées au <strong>niveau des zones de santé</strong> d'après le SitRep N°051 de l'INSP (04 juillet 2026) ; les anciens marqueurs contextuels provinciaux du Nord- et du Sud-Kivu ont été retirés. Seul l'Ouganda (aire métropolitaine de Kampala) demeure un marqueur contextuel distinct, car il provient d'une source différente. 17 cas en RDC étaient en attente de répartition par zone de santé au moment du rapport.",
    md_method_4:"Les polygones de zones sont des <strong>limites approximatives des zones de santé</strong> destinées au placement visuel, et non des limites administratives officielles.",
    md_method_5:"L'onglet Tendances par zone montre les cas et décès confirmés cumulés des SitReps successifs de l'INSP (14 mai–04 juillet 2026).",
    md_method_6:"La létalité en RDC est provisoire — décès confirmés ÷ cas confirmés (506/1561 ≈ 32,4 %, SitRep N°051 de l'INSP). Non comparable aux DON antérieurs (définition de cas différente) et instable tant que la plupart des cas ne sont pas clôturés.",
    md_h_figures:"Figures de l'OMS (consulter / télécharger à la source)",
    md_fig_alt:"Figure 1 de l'OMS : distribution des cas confirmés de MVB, RDC et Ouganda",
    md_figcap:"Figure 1 de l'OMS — distribution des cas confirmés, RDC (10 juin) et Ouganda (11 juin). © OMS.",
    dl_fig1:"Fig 1 · carte de distribution",
    dl_fig2:"Fig 2 · courbe épidémique RDC",
    dl_fig3:"Fig 3 · courbe épidémique Ouganda",
    md_h_csv:"Télécharger les données (CSV)",
    dl_csv_sitrep39:"Cas par zone de santé — INSP SitRep N°051 (04 juillet)",
    dl_csv_hz:"Cas par zone de santé — OMS DON608 (17 juin)",
    dl_csv_prov:"Synthèse par province",
    dl_csv_country:"Synthèse par pays",
    dl_csv_contacts:"Recherche des contacts",
    dl_csv_trend:"Tendance cumulée",
    dl_csv_risk:"Niveaux de risque OMS",
    md_h_attr:"Attribution",
    md_attr_p:"Données épidémiologiques © Organisation mondiale de la Santé 2026. Fond de carte © contributeurs OpenStreetMap, © CARTO. Ce tableau de bord est une visualisation indépendante à des fins d'information humanitaire et n'est pas un produit officiel de l'OMS. Inspiré de la présentation du tableau de bord épidémique INRB-UMIE BDBV 2026.",
    modal_terms_title:"Conditions d'utilisation",
    terms_p1:"Ce tableau de bord reproduit des chiffres accessibles au public issus du Bulletin d'information sur les flambées épidémiques de l'OMS, à des fins d'information humanitaire non commerciale. Il ne constitue pas une publication officielle de l'OMS, de l'INRB ou d'une quelconque autorité gouvernementale.",
    terms_h_warranty:"Aucune garantie",
    terms_warranty_p:"Les chiffres évoluent rapidement et sont fréquemment révisés dans les rapports ultérieurs ; les nombres affichés reflètent un instant précis (04–05 juillet 2026) et ne doivent pas être considérés comme une surveillance en temps réel. Les emplacements des marqueurs sont approximatifs et ne représentent pas des limites administratives officielles.",
    terms_h_rights:"Droits",
    terms_rights_p:"L'ensemble des données et chiffres épidémiologiques demeurent la propriété de l'Organisation mondiale de la Santé et des autorités nationales concernées. Les tuiles cartographiques sont © contributeurs OpenStreetMap et © CARTO. Citez toujours la source originale de l'OMS (DON608) pour toute réutilisation.",
    terms_h_sensitive:"Contexte sensible",
    terms_sensitive_p:"Il s'agit d'une urgence de santé publique en cours touchant des communautés affectées par les conflits et des populations déplacées. Veuillez utiliser ces informations de manière responsable.",
    meta_hz:"Province : {prov} · {country} · INSP SitRep N°051",
    meta_ctx:"{prov} · {country} · MinSanté Ouganda",
    na:"n/d",
    ctx_confirmed_kampala:"Confirmés dans l'agglomération de Kampala",
    ctx_hz_affected:"Zones de santé touchées",
    tag_crossborder:"Transfrontalier",
    tag_geoexpansion:"Expansion géographique",
    tip_confirmed_cases:"cas confirmés",
    chart_trend_drc:"RDC confirmés",
    chart_trend_uga:"Ouganda confirmés",
    chart_dates:["21 mai","8 juin","10 juin","17 juin"],
    chart_active:"Actifs",
    chart_recovered:"Guéris",
    chart_deaths:"Décès"
  }
};

/* ===== CSV DATASETS (mirrored in data/*.csv; keep in sync) ===== */
const CSV={
"zones_sitrep051.csv":`zone,province,confirmed_cases,confirmed_deaths,lat,lon,population_2024,zone_cfr_pct,cases_per_100k
Bunia,Ituri,438,118,1.59551,30.22344,268128,26.9,163.4
Rwampara,Ituri,344,71,1.57195,30.11021,134068,20.6,256.6
Mongbwalu,Ituri,278,141,1.98343,29.91567,133371,50.7,208.4
Nyankunde,Ituri,95,17,1.47609,29.9444,97949,17.9,97.0
Nizi,Ituri,72,19,1.74969,30.32474,141651,26.4,50.8
Katwa,Nord-Kivu,52,38,0.12058,29.32371,411346,73.1,12.6
Butembo,Nord-Kivu,40,18,0.13996,29.25991,316182,45.0,12.7
Lita,Ituri,33,12,1.57476,30.37491,128175,36.4,25.7
Beni,Nord-Kivu,29,17,0.49952,29.46953,382409,58.6,7.6
Mangala,Ituri,26,14,1.96698,30.41024,92662,53.8,28.1
Komanda,Ituri,22,8,1.13414,29.64301,184816,36.4,11.9
Bambu,Ituri,18,5,1.87176,30.22046,148752,27.8,12.1
Tchomia,Ituri,15,2,1.52789,30.59572,110386,13.3,13.6
Nia-Nia,Ituri,12,5,1.31274,27.97986,71361,41.7,16.8
Kilo,Ituri,9,1,1.76212,30.08494,55902,11.1,16.1
Logo,Ituri,7,0,2.17107,30.91868,240552,0.0,2.9
Aungba,Ituri,6,2,2.59705,30.59664,158181,33.3,3.8
Musienene,Nord-Kivu,6,2,0.01858,28.65899,249370,33.3,2.4
Damas,Ituri,5,0,2.18521,30.17799,116731,0.0,4.3
Mandima,Ituri,4,1,0.91185,29.19347,138196,25.0,2.9
Kyondo,Nord-Kivu,4,2,0.01319,29.4859,215154,50.0,1.9
Rimba,Ituri,3,0,2.21952,30.75595,211373,0.0,1.4
Aru,Ituri,3,1,2.85261,30.73485,181110,33.3,1.7
Drodro,Ituri,3,3,1.74173,30.54869,154777,100.0,1.9
Oicha,Nord-Kivu,3,2,0.75582,29.59942,336160,66.7,0.9
Miti-Murhesa,Sud-Kivu,3,1,-2.33753,28.86162,239135,33.3,1.3
Mambasa,Ituri,2,1,1.44963,28.69974,95906,50.0,2.1
Kambala,Ituri,2,2,2.33517,30.48101,123772,100.0,1.6
Kalunguta,Nord-Kivu,2,1,0.43659,29.51381,199559,50.0,1.0
Masereka,Nord-Kivu,2,0,-0.18405,29.55946,177664,0.0,1.1
Gety,Ituri,1,0,1.26554,30.2325,186541,0.0,0.5
Fataki,Ituri,1,0,1.91391,30.55534,128262,0.0,0.8
Lolwa,Ituri,1,1,1.82992,29.44205,45779,100.0,2.2
Goma,Nord-Kivu,1,0,-1.6526,29.18021,251728,0.0,0.4
Vuhovi,Nord-Kivu,1,1,0.25118,29.25411,121520,100.0,0.8
Mabalako,Nord-Kivu,1,0,0.46812,29.21145,186148,0.0,0.5
`,
"don608_confirmed_by_health_zone.csv":`health_zone,province,country,confirmed_cases,role,latitude,longitude,as_of,source
Bunia,Ituri,DRC,247,Referral hub; <40km from Uganda border,1.5667,30.2500,2026-06-17,WHO DON608
Rwampara,Ituri,DRC,195,Care-seeking destination,1.4800,30.2300,2026-06-17,WHO DON608
Mongbwalu,Ituri,DRC,189,Presumed outbreak origin (gold-mining hub),1.9400,30.0300,2026-06-17,WHO DON608
Nyankunde,Ituri,DRC,68,Care-seeking destination,1.4000,30.1800,2026-06-17,WHO DON608`,
"don608_province_summary.csv":`province,country,confirmed_cases,deaths,health_zones_affected,health_zones_total,cfr_pct,note,as_of,source
Ituri,DRC,817,186,21,36,22.7,Epicentre; 91% of DRC confirmed cases,2026-06-17,WHO DON608
North Kivu,DRC,not disaggregated,,11,35,,Part of remaining DRC cases; counts not split by WHO,2026-06-17,WHO DON608
South Kivu,DRC,not disaggregated,,1,34,,Part of remaining DRC cases; counts not split by WHO,2026-06-17,WHO DON608
Kampala Metropolitan Area,Uganda,19,2,2,,,14 imported + 5 secondary; districts Kampala & Wakiso,2026-06-11,WHO DON607`,
"don608_country_summary.csv":`country,confirmed_cases,deaths,cfr_pct,recovered,health_zones_with_cases,health_worker_cases,as_of,source
DRC,896,232,25.9,78,29,16,2026-06-17,WHO DON608
Uganda,19,2,,10,2,,2026-06-18,WHO DON608
Both countries,915,234,,88,31,,2026-06-18,WHO DON608`,
"don608_contacts.csv":`location,contacts_identified,contacts_followed_up,follow_up_rate_pct,as_of,source
Ituri (DRC),4659,,70.8,2026-06-17,WHO DON608
North Kivu (DRC),1628,,70.5,2026-06-17,WHO DON608
South Kivu (DRC),80,,100,2026-06-17,WHO DON608
DRC total,6367,4525,,2026-06-17,WHO DON608
Uganda,820,,,2026-06-11,WHO DON607
Uganda active follow-up,409,,,2026-06-11,WHO DON607
Uganda completed 21-day,394,,,2026-06-11,WHO DON607`,
"don_cumulative_trend.csv":`date,don,drc_confirmed,drc_deaths,uganda_confirmed,uganda_deaths,source
2026-05-21,DON603,83,9,2,1,WHO DON603
2026-06-08,DON606,515,91,19,2,WHO DON606/607 (derived)
2026-06-10,DON607,676,136,19,2,WHO DON607
2026-06-17,DON608,896,232,19,2,WHO DON608`,
"risk_assessment.csv":`geography,risk_level,reassessed,source
Democratic Republic of the Congo,Very high,2026-06-06,WHO DON607
Uganda,High,2026-06-06,WHO DON607
Countries with land borders adjoining affected countries,High,2026-06-06,WHO DON607
Rest of Africa region,Low,2026-06-06,WHO DON607
Global,Low,2026-06-06,WHO DON607`
};
