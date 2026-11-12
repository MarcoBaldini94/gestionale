(function(){
"use strict";
/* ================= modello dati ================= */
/* v46: versione dei dati scritta in ogni backup (S.appVer). Una copia dell'app più vecchia di quella che ha salvato
   l'ultimo backup sul PC non lo adotta e non lo sovrascrive (perderebbe i campi nuovi, es. i collegamenti): chiede di ricaricare. */
const APP_VER=55;
const MESI=["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
const FONTI=[["lp","Libera professione","P.IVA forfettario"],["gm","Guardia medica","già tassata dall'ASL"],["ssn","Stipendio SSN","netto in busta"],["sond","Sondaggi","netto"],["spec","Borsa specializzazione","esente"],["ext","Entrate extra (dai conti)","dagli estratti conto"],["altro","Altro",""],["intra","Intramoenia / aggiuntiva","lordo dal cedolino, già nel netto SSN"]];
const FONTI_Y=Y=>(+Y>=2027?["ssn","intra","sond","ext","altro"]:["lp","gm","ssn","intra","sond","spec","ext","altro"]).map(k=>FONTI.find(f=>f[0]===k));
const IN_TOT=k=>k!=="intra";
const FONTI_E=Y=>FONTI_Y(Y).filter(f=>f[0]!=="intra");
const FN=Object.fromEntries(FONTI.map(f=>[f[0],f[1]]));
const DEF_ANNO={coeff:0.78,sost:0.15,qA:676.48,qBpiena:0.195,qBrid:0.0975,mesiRid:0,esenteQB:0,qBintra:0.02,contribVers:null};
const DEF_GLOB={gmEnpam:0.02,gmIrpef:0,ivafe:0.002,plus:0.26,soglia:30000,tettoQB:140000};
const PAT_KEYS=["fineco","revolut","fondo","vFondo","etf","vEtf"];
const AUTO_LBL={qa:"Quota A ENPAM",qb:"Quota B ENPAM",imp:"Imposta sostitutiva",enpam:"Rata ENPAM"};
const blankPat=()=>Array.from({length:12},()=>Object.fromEntries(PAT_KEYS.map(k=>[k,null])));
const uid=()=>Math.random().toString(36).slice(2,10);
const num=v=>(typeof v==="number"&&isFinite(v))?v:null;
const str=v=>typeof v==="string"?v:"";
const scadRow=(voce,anno,auto,frazione,scadenza)=>({id:uid(),voce,anno,auto:auto||"",tipo:"",frazione:frazione||1,meno:0,importo:null,scadenza:scadenza||"",pagato:false,dataPag:""});
const isY=y=>/^\d{4}$/.test(String(y));

function defaults(){const y=new Date().getFullYear();return{v:3,anni:{[y]:{...DEF_ANNO}},globali:{...DEF_GLOB},registro:[],patrimonio:{[y]:blankPat()},
  chiusure:{},chiusureInv:{},movAbbNo:[],movNote:{},prestiti:[],straordNoMedia:true,fondo:{capitale:null},etfBase:null,prev:{entrate:null,spese:null,inv:null},gen:[],ricorrenti:[],fondoMov:[],scadenzario:["qa","qb","imp"].map(a=>scadRow(AUTO_LBL[a]+" "+y,y,a)),accantonato:null,sondExt:null,ced:null,movCond:["spesa","svago"],sondCanali:{},vincolato:{fineco:[]},patEstr:[],patEstrF:[],patEstrI:[],link:[],linkMem:{},turni:{},aggCert:{}};}

/* conversione dal formato del foglio (v1/v2): mesi → registro movimenti, parametri → tabella per anno */
function migrate(o){
  const p=o.parametri||{},st=o.storico||{},g=(k,d)=>num(p[k])??d;
  const anni={2025:{coeff:g("coeff",.78),sost:g("sost2025",.05),qA:g("qA2025",661.54),qBpiena:g("qBpiena",.195),qBrid:g("qBrid",.0975),mesiRid:g("mesiSpec2025",10)},
              2026:{coeff:g("coeff",.78),sost:g("irpef",.15),qA:g("qA2026",675.73),qBpiena:g("qBpiena",.195),qBrid:g("qBrid",.0975),mesiRid:g("mesiLP2026",6)}};
  const globali={};for(const k of Object.keys(DEF_GLOB))globali[k]=g(k,DEF_GLOB[k]);
  const registro=[];
  const add=(Y,rows,keys)=>(rows||[]).forEach((r,m)=>keys.forEach(k=>{const v=num(r&&r[k]);if(v){const d=new Date(Y,m+1,0).getDate();
    registro.push({id:uid(),data:`${Y}-${String(m+1).padStart(2,"0")}-${d}`,fonte:k,importo:v,nota:"Totale del mese (dal foglio)"});}}));
  add(2025,o.redditi2025,["lp","gm","spec","altro"]);add(2026,o.redditi2026,["lp","gm","ssn","sond"]);
  const pat=blankPat();(o.patrimonio||[]).forEach((r,m)=>{if(m<12&&r)PAT_KEYS.forEach(k=>pat[m][k]=num(r[k]));});
  const chiusure={};if(num(st.fine2024)!=null)chiusure[2024]=st.fine2024;if(num(st.fine2025)!=null)chiusure[2025]=st.fine2025;
  const MAP={t25qb:["qb",2025],t25imp:["imp",2025],t26qa:["qa",2026],t26qb:["qb",2026],t26imp:["imp",2026]};
  const scad=Array.isArray(o.scadenzario)?o.scadenzario.map(r=>{const m=MAP[r&&r.auto];return{...r,auto:m?m[0]:"",anno:m?m[1]:num(r&&r.anno)};})
    :[["qb",2025],["imp",2025],["qa",2026],["qb",2026],["imp",2026]].map(([a,y])=>scadRow(AUTO_LBL[a]+" "+y,y,a));
  return{v:3,anni,globali,registro,patrimonio:{2026:pat},chiusure,fondo:{capitale:num(st.versFondo)},etfBase:num(st.versEtf),scadenzario:scad,accantonato:num(o.accantonato)};
}
/* archivio cedolini letto dall'Hub (vedi sezione "cedolini"): solo voci economiche, nessun dato anagrafico */
const CED_CAT=["competenza","inps","previdenza_altro","irpef","addizionale","sostitutiva","altra_trattenuta"],CED_TIPI=["fissa","variabile","prestazioni_aggiuntive","una_tantum"];
const ymOk=v=>/^\d{4}-\d{2}$/.test(v),dOk=v=>/^\d{4}-\d{2}-\d{2}$/.test(v);
function cleanCed(c){if(!c||typeof c!=="object"||!ymOk(c.periodo))return null;const h=c.intestazione||{},hh={};
  ["imponibileIrpefMese","detrazioniMese","imponibileProgressivo","irpefProgressiva","totaleCompetenze","totaleTrattenute","netto"].forEach(k=>{if(num(h[k])!=null)hh[k]=h[k];});
  const voci=(Array.isArray(c.voci)?c.voci:[]).filter(v=>v&&typeof v==="object").map(v=>({codice:str(v.codice).slice(0,8),descrizione:str(v.descrizione).slice(0,80),
    categoria:CED_CAT.includes(v.categoria)?v.categoria:"altra_trattenuta",tipo:CED_TIPI.includes(v.tipo)?v.tipo:null,riferimento:ymOk(v.riferimento)?v.riferimento:c.periodo,importo:num(v.importo)??0,...(num(v.tariffa)!=null&&num(v.quantita)!=null?{tariffa:v.tariffa,quantita:v.quantita}:{}),...(v.nuova?{nuova:true}:{})}));
  const k=c.controllo||{};
  return{file:str(c.file).slice(0,120),periodo:c.periodo,dataPagamento:dOk(c.dataPagamento)?c.dataPagamento:"",dataAssunzione:dOk(c.dataAssunzione)?c.dataAssunzione:"",intestazione:hh,voci,
    controllo:{ok:k.ok===true,competenze:num(k.competenze),trattenute:num(k.trattenute),netto:num(k.netto)},nuoveVoci:(Array.isArray(c.nuoveVoci)?c.nuoveVoci:[]).map(str)};}
function sanitizeCed(x){if(!x||typeof x!=="object")return null;
  return{agg:str(x.agg),lista:(Array.isArray(x.lista)?x.lista:[]).map(cleanCed).filter(Boolean),mesi:(Array.isArray(x.mesi)?x.mesi:[]).filter(ymOk),
    errori:(Array.isArray(x.errori)?x.errori:[]).filter(e=>e&&typeof e==="object").map(e=>({file:str(e.file),errore:str(e.errore)}))};}
function sanitize(s){
  const d=defaults(),o={v:3};
  o.anni={};for(const [y,a] of Object.entries(s.anni||{})){if(!isY(y))continue;const r={};for(const k of Object.keys(DEF_ANNO))r[k]=num(a&&a[k])??DEF_ANNO[k];o.anni[y]=r;}
  if(!Object.keys(o.anni).length)o.anni=d.anni;
  o.globali={};for(const k of Object.keys(DEF_GLOB))o.globali[k]=num(s.globali&&s.globali[k])??DEF_GLOB[k];
  o.registro=(Array.isArray(s.registro)?s.registro:[]).filter(r=>r&&typeof r==="object").map(r=>({id:str(r.id)||uid(),
    data:/^\d{4}-\d{2}-\d{2}$/.test(r.data)?r.data:"",fonte:FN[r.fonte]?r.fonte:"altro",importo:num(r.importo),nota:str(r.nota),...(r.ext?{ext:str(r.ext)}:{})}));
  o.patrimonio={};for(const [y,rows] of Object.entries(s.patrimonio||{})){if(!isY(y))continue;const p=blankPat();
    (Array.isArray(rows)?rows:[]).forEach((r,m)=>{if(m<12&&r)PAT_KEYS.forEach(k=>p[m][k]=num(r[k]));});o.patrimonio[y]=p;}
  if(!Object.keys(o.patrimonio).length)o.patrimonio=d.patrimonio;
  o.chiusure={};for(const [y,v] of Object.entries(s.chiusure||{}))if(isY(y)&&num(v)!=null)o.chiusure[y]=v;
  o.chiusureInv={};for(const [y,v] of Object.entries(s.chiusureInv||{}))if(isY(y)&&num(v)!=null)o.chiusureInv[y]=v;
  o.fondo={capitale:num(s.fondo&&s.fondo.capitale)};o.etfBase=num(s.etfBase);
  o.scadenzario=(Array.isArray(s.scadenzario)?s.scadenzario:d.scadenzario).filter(r=>r&&typeof r==="object").map(r=>({id:str(r.id)||uid(),
    voce:str(r.voce),anno:num(r.anno),auto:AUTO_LBL[r.auto]?r.auto:"",tipo:["qa","qb","imp","spesa"].includes(r.tipo)?r.tipo:"",ric:str(r.ric),...(/^\d{4}-\d{2}$/.test(r.rm)?{rm:r.rm}:{}),frazione:num(r.frazione)??1,meno:num(r.meno)??0,importo:num(r.importo),scadenza:str(r.scadenza),pagato:r.pagato===true,forzaNonPagato:r.forzaNonPagato===true,dataPag:str(r.dataPag),...(r.man===true?{man:true}:{}),...(Array.isArray(r.lk)&&r.lk.length?{lk:r.lk.filter(x=>typeof x==="string").slice(0,8),imp0:num(r.imp0)}:{})}));
  o.accantonato=num(s.accantonato);o.appVer=num(s.appVer)??0;
  o.sondExt=s.sondExt&&/^\d{4}-\d{2}$/.test(s.sondExt.da)?{da:s.sondExt.da,a:/^\d{4}-\d{2}$/.test(s.sondExt.a)?s.sondExt.a:s.sondExt.da,fonte:"",agg:""}:null;
  o.ced=sanitizeCed(s.ced);
  o.cart=sanitizeCart(s.cart);
  o.prev={entrate:num(s.prev&&s.prev.entrate),spese:num(s.prev&&s.prev.spese),inv:num(s.prev&&s.prev.inv)};
  o.gen=(Array.isArray(s.gen)?s.gen:[]).filter(x=>typeof x==="string");
  o.fondoMov=(Array.isArray(s.fondoMov)?s.fondoMov:[]).filter(t=>t&&typeof t==="object").map(t=>({id:str(t.id)||uid(),data:/^\d{4}-\d{2}-\d{2}$/.test(t.data)?t.data:"",tipo:t.tipo==="riscatto"?"riscatto":"acquisto",importo:num(t.importo),nota:str(t.nota),...(t.ext?{ext:str(t.ext)}:{})}));
  o.vincolato={fineco:(Array.isArray(s.vincolato&&s.vincolato.fineco)?s.vincolato.fineco:[]).filter(r=>r&&/^\d{4}-\d{2}$/.test(r.da||"")&&num(r.importo)!=null&&r.importo>=0).map(r=>({da:r.da,importo:r.importo})).sort((a,b)=>a.da.localeCompare(b.da))};o.patEstr=(Array.isArray(s.patEstr)?s.patEstr:[]).filter(x=>/^\d{4}-\d{2}$/.test(x)).slice(-240);o.patEstrF=(Array.isArray(s.patEstrF)?s.patEstrF:[]).filter(x=>/^\d{4}-\d{2}$/.test(x)).slice(-240);o.patEstrI=(Array.isArray(s.patEstrI)?s.patEstrI:[]).filter(x=>/^\d{4}-\d{2}$/.test(x)).slice(-240);
  o.link=(Array.isArray(s.link)?s.link:[]).filter(l=>l&&typeof l==="object"&&typeof l.m==="string"&&["s","e","x"].includes(l.k)&&/^\d{4}-\d{2}-\d{2}$/.test(l.d||"")).map(l=>({m:l.m.slice(0,24),k:l.k,r:str(l.r).slice(0,40),d:l.d,i:num(l.i)??0,c:str(l.c).slice(0,20),t:str(l.t).slice(0,60)})).slice(-3000);
  o.linkMem={};if(s.linkMem&&typeof s.linkMem==="object")Object.entries(s.linkMem).forEach(([k,v])=>{if(k.length<=160&&v&&["s","e"].includes(v.k))o.linkMem[k]={k:v.k,r:str(v.r).slice(0,40)};});
  o.sondCanali={};if(s.sondCanali&&typeof s.sondCanali==="object")Object.entries(s.sondCanali).forEach(([k,v])=>{if(/^[a-z0-9_-]{1,48}$/.test(k)&&["banca","paypal","amazon"].includes(v))o.sondCanali[k]=v;});
  o.movAbbNo=Array.isArray(s.movAbbNo)?[...new Set(s.movAbbNo.filter(x=>typeof x==="string"))].slice(-500):[];
  o.movNote={};if(s.movNote&&typeof s.movNote==="object")Object.entries(s.movNote).slice(0,2000).forEach(([k,v])=>{const t=str(v).trim().slice(0,140);if(k.length<=40&&t)o.movNote[k]=t;});
  const dOk=x=>/^\d{4}-\d{2}-\d{2}$/.test(x||"");
  o.prestiti=(Array.isArray(s.prestiti)?s.prestiti:[]).filter(p=>p&&typeof p==="object"&&dOk(p.data)&&num(p.importo)>0).map(p=>({id:str(p.id)||uid(),chi:str(p.chi).slice(0,60),data:p.data,importo:Math.round(num(p.importo)*100)/100,nota:str(p.nota).slice(0,140),mov:str(p.mov).slice(0,40),
   rest:(Array.isArray(p.rest)?p.rest:[]).filter(r=>r&&dOk(r.data)&&num(r.importo)>0).map(r=>({id:str(r.id)||uid(),data:r.data,importo:Math.round(num(r.importo)*100)/100,mov:str(r.mov).slice(0,40)})),
   no:(Array.isArray(p.no)?p.no:[]).filter(x=>typeof x==="string").slice(-200)}));
  o.straordNoMedia=s.straordNoMedia!==false;
  o.aggCert={};if(s.aggCert&&typeof s.aggCert==="object")Object.entries(s.aggCert).forEach(([k,v])=>{const x=num(v);if(/^\d{4}-\d{2}$/.test(k)&&x!=null&&x>=0&&x<=300)o.aggCert[k]=x;});
  o.turni={};if(s.turni&&typeof s.turni==="object")Object.keys(s.turni).filter(k=>dOk(k)).sort().slice(-1500).forEach(k=>{const v=s.turni[k];if(!v||typeof v!=="object")return;const t={};
   ["n","f","fe","rc"].forEach(f=>{if(v[f])t[f]=1;});const a=num(v.a);if(a!=null&&a>0&&a<=24)t.a=Math.round(a*100)/100;if(Object.keys(t).length)o.turni[k]=t;});
  o.movCond=Array.isArray(s.movCond)?s.movCond.filter(k=>["casa","spesa","svago","viaggi","carburante","vita","straord"].includes(k)):["spesa","svago"];
  o.ricorrenti=(Array.isArray(s.ricorrenti)?s.ricorrenti:[]).filter(t=>t&&typeof t==="object").map(t=>({id:str(t.id)||uid(),voce:str(t.voce),
    mese:Math.min(12,Math.max(1,num(t.mese)??1)),importo:num(t.importo),variabile:t.variabile===true,esclusi:(Array.isArray(t.esclusi)?t.esclusi:[]).filter(y=>typeof y==="number"||/^\d{4}-\d{2}$/.test(y)),
    freq:t.freq==="m"?"m":"a",giorno:Math.min(31,Math.max(1,num(t.giorno)??1)),lav:["dopo","prima"].includes(t.lav)?t.lav:"",adeb:t.adeb!==false,giornoA:Math.min(31,Math.max(0,Math.round(num(t.giornoA)??0))),da:/^\d{4}-\d{2}$/.test(t.da)?t.da:"",...(t.reale&&num(t.reale.anno)!=null&&num(t.reale.imp)!=null?{reale:{anno:t.reale.anno,imp:t.reale.imp}}:{})}));
  return o;
}
/* v45: ordine fisso del registro (data, fonte, id). Le righe automatiche (cedolini, conti, sondaggi, extra) venivano
   accodate in ordine diverso a seconda di quale collegamento girava prima: due dispositivi con gli stessi dati
   producevano JSON diversi e si rimandavano a vicenda il backup ogni pochi secondi (backup «ping-pong», 07/11/2026). */
const regSort=s=>{s.registro.sort((a,b)=>(a.data||"").localeCompare(b.data||"")||(a.fonte||"").localeCompare(b.fonte||"")||String(a.id).localeCompare(String(b.id)));return s;};
function load(src){const s0=(!src||typeof src!=="object")?defaults():sanitize(src.v>=3?src:migrate(src));return regSort(freezePaid(ensureYears(ensureRic(s0))));}
/* passaggio d'anno: parametri dell'anno in corso e del successivo, tabella patrimonio dell'anno in corso,
   rate ENPAM (Quota A dell'anno, Quota B dell'anno prima) create una sola volta: se le cancelli non ricompaiono */
function ensureYears(s){const cy=new Date().getFullYear();if(!Array.isArray(s.gen))s.gen=[];
  [cy,cy+1].forEach(y=>{if(!s.anni[y]){const src=s.anni[yearsOf(s.anni).filter(v=>v<y).pop()];if(src)s.anni[y]={...DEF_ANNO,...src,mesiRid:0,contribVers:null};}});
  {const py=yearsOf(s.patrimonio),last=py.length?py[py.length-1]:cy-1;for(let y=last+1;y<=cy;y++)s.patrimonio[y]=blankPat();}
  const has=(t,y)=>s.scadenzario.some(r=>tipoOf(r)===t&&r.anno===y),Rc=calc(s);
  [cy,cy+1].forEach(y=>{
    const kA="qa-"+y;if(s.anni[y]&&!s.gen.includes(kA)){if(!has("qa",y))["04-30","06-30","09-30","11-30"].forEach((d,k)=>s.scadenzario.push(scadRow(`Quota A ENPAM ${y} rata ${k+1}/4${y>cy?" (stima)":""}`,y,"qa",0.25,`${y}-${d}`)));s.gen.push(kA);}
    const kB="qb-"+(y-1),T=Rc.anni[y-1];if(T&&!s.gen.includes(kB)&&(has("qb",y-1)||T.qb>0.5)){
      if(!has("qb",y-1)){const feb=new Date(y+1,2,0).getDate();[`${y}-10-31`,`${y}-12-31`,`${y+1}-02-${feb}`,`${y+1}-04-30`,`${y+1}-06-30`].forEach((d,k)=>s.scadenzario.push(scadRow(`Quota B ENPAM ${y-1} rata ${k+1}/5 (SDD, stima)`,y-1,"qb",0.2,d)));}
      s.gen.push(kB);}});
  return s;}
/* una voce pagata con importo calcolato viene "congelata": se poi cambi parametri o importi delle spese fisse, lo storico non si riscrive */
function freezePaid(s){const Rc=calc(s);s.scadenzario.forEach((r,i)=>{if(r.importo==null&&paidOf(r)){const v=Rc.deb.rows[i].auto;if(typeof v==="number"&&isFinite(v))r.importo=Math.round(v*100)/100;}});return s;}
/* spese fisse: una voce nello Scadenzario per ogni modello, per l'anno in corso e i due successivi */
/* spese fisse mensili (freq "m"): una voce per mese dal mese «da» (o dal mese in corso) a dicembre dell'anno prossimo, il giorno scelto (fine mese se manca) */
/* v53 (richiesta di Marco): per ogni spesa fissa si sceglie se l'addebito resta nel giorno previsto anche se cade di sabato,
   domenica o in una festività nazionale (lav "") o se slitta al primo giorno lavorativo dopo ("dopo") o prima ("prima").
   Festività: 1/1, 6/1, Pasqua e Pasquetta, 25/4, 1/5, 2/6, 15/8, 1/11, 8/12, 25/12, 26/12. */
function pasqua(y){const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),mo=Math.floor((h+l-7*m+114)/31),da=(h+l-7*m+114)%31+1;return new Date(y,mo-1,da);}
function isoD(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
function festivo(d){const w=d.getDay();if(w===0||w===6)return true;const md=isoD(d).slice(5),y=d.getFullYear(),p=pasqua(y),pm=new Date(y,p.getMonth(),p.getDate()+1);
  return ["01-01","01-06","04-25","05-01","06-02","08-15","11-01","12-08","12-25","12-26"].includes(md)||md===isoD(p).slice(5)||md===isoD(pm).slice(5);}
function lavAdj(iso,mode){if(!mode||!/^\d{4}-\d{2}-\d{2}$/.test(iso))return iso;const d=new Date(+iso.slice(0,4),+iso.slice(5,7)-1,+iso.slice(8,10)),st=mode==="prima"?-1:1;
  for(let k=0;k<12&&festivo(d);k++)d.setDate(d.getDate()+st);return isoD(d);}
function ensureRicM(s,t){const now=new Date(),cy=now.getFullYear(),cur=`${cy}-${String(now.getMonth()+1).padStart(2,"0")}`;if(!t.da)t.da=cur;
  /* il mese di inizio si può portare indietro (es. affitto da febbraio): le righe passate risultano pagate e
     contano come spese fisse di quei mesi; limite: gennaio di due anni fa. Le righe prima di «da» si tolgono. */
  const minDa=(cy-2)+"-01";if(t.da<minDa)t.da=minDa;
  s.scadenzario=s.scadenzario.filter(r=>r.ric!==t.id||!r.rm||r.rm>=t.da);
  let y=+t.da.slice(0,4),m=+t.da.slice(5);
  for(;y<=cy+1;m++){if(m>12){m=1;y++;if(y>cy+1)break;}const mm=String(m).padStart(2,"0"),ym=`${y}-${mm}`;if(t.esclusi.includes(ym))continue;
    const dd=String(Math.min(t.giorno,new Date(y,m,0).getDate())).padStart(2,"0"),sc=lavAdj(`${ym}-${dd}`,t.lav);
    let r=s.scadenzario.find(x=>x.ric===t.id&&x.anno===y&&(x.rm===ym));
    if(!r){r={id:`${t.id}-${ym}`,voce:t.voce,anno:y,auto:"",tipo:"spesa",ric:t.id,rm:ym,frazione:1,meno:0,importo:null,scadenza:sc,pagato:false,forzaNonPagato:false,dataPag:"",...(t.adeb===false?{man:true}:{})};s.scadenzario.push(r);}
    else if(!r.pagato&&(ym>=cur||!(r.scadenza&&r.scadenza<=TODAY))){r.voce=t.voce;r.scadenza=sc;}
    if(!r.pagato&&!r.lk&&(r.scadenza||"")>TODAY){if(t.adeb===false)r.man=true;else delete r.man;}}}
function ensureRic(s){if(!s.ricorrenti)s.ricorrenti=[];const cy=new Date().getFullYear();
  s.ricorrenti.forEach(t=>{if(t.freq==="m"){s.scadenzario=s.scadenzario.filter(r=>r.ric!==t.id||r.rm||paidOf(r));ensureRicM(s,t);return;}
    s.scadenzario=s.scadenzario.filter(r=>r.ric!==t.id||!r.rm||paidOf(r));
    for(let y=cy;y<=cy+2;y++){if(t.esclusi.includes(y))continue;
    /* v55: giorno anche per le annuali (giornoA; 0 = fine mese, come prima) */
    const mm=String(t.mese).padStart(2,"0"),fm=new Date(y,t.mese,0).getDate(),gA=+t.giornoA||0,dd=String(gA>0?Math.min(gA,fm):fm).padStart(2,"0"),sc=lavAdj(`${y}-${mm}-${dd}`,t.lav);
    let r=s.scadenzario.find(x=>x.ric===t.id&&x.anno===y&&!x.rm);
    if(!r){r={id:`${t.id}-${y}`,voce:t.voce,anno:y,auto:"",tipo:"spesa",ric:t.id,frazione:1,meno:0,importo:null,scadenza:sc,pagato:false,forzaNonPagato:false,dataPag:"",...(t.adeb===false?{man:true}:{})};s.scadenzario.push(r);}
    else if(!r.pagato&&!(r.scadenza&&r.scadenza<=TODAY)){r.voce=t.voce;r.scadenza=sc;}
    if(!r.pagato&&!r.lk&&(r.scadenza||"")>TODAY){if(t.adeb===false)r.man=true;else delete r.man;}}});
  const ids=new Set(s.ricorrenti.map(t=>t.id));s.scadenzario=s.scadenzario.filter(r=>!r.ric||ids.has(r.ric)||paidOf(r));
  return s;}
let S=defaults();

/* ================= calcoli ================= */
const n=x=>(typeof x==="number"&&isFinite(x))?x:0;
const sum=a=>a.reduce((t,x)=>t+n(x),0);
const yearsOf=o=>Object.keys(o).filter(isY).map(Number).sort((a,b)=>a-b);
const aliqQB=(P,k)=>k/12*P.qBrid+(12-k)/12*P.qBpiena;
function mensili(s,Y){const o={};FONTI.forEach(([k])=>o[k]=Array(12).fill(0));
  s.registro.forEach(r=>{if(r.importo==null||!r.data.startsWith(Y+"-"))return;const m=+r.data.slice(5,7)-1;if(m>=0&&m<12)o[r.fonte][m]+=r.importo;});return o;}
function tasseAnno(s,Y,prev){
  const P=s.anni[Y];if(!P)return null;const G=s.globali;
  const versAuto=P.qA+(prev?prev.qb:0),vers=P.contribVers!=null?P.contribVers:versAuto;
  const mm=mensili(s,Y),tot={};FONTI.forEach(([k])=>tot[k]=sum(mm[k]));tot.all=sum(FONTI.filter(([k])=>IN_TOT(k)).map(([k])=>tot[k]));
  const tm=MESI.map((_,m)=>sum(FONTI.filter(([k])=>IN_TOT(k)).map(([k])=>mm[k][m])));
  let c=0;const cum=mm.lp.map(v=>(c+=v));let ci=0;const cumI=mm.intra.map(v=>(ci+=v));
  const aliq=aliqQB(P,P.mesiRid);
  const qbOf=(lpImp,intra)=>{const esLP=Math.min(P.esenteQB,lpImp),esI=Math.min(P.esenteQB-esLP,intra);return{lp:(lpImp-esLP)*aliq,intra:(intra-esI)*P.qBintra,baseLP:lpImp-esLP,baseI:intra-esI};};
  const imp=tot.lp*P.coeff,QB=qbOf(imp,tot.intra),baseQB=QB.baseLP,qa=P.qA,impI=Math.max(imp-vers,0);
  /* dato reale: se tutte le voci dello Scadenzario di quel tipo e anno hanno l'importo ufficiale, vale la loro somma */
  const reale=t=>{const rr=s.scadenzario.filter(r=>r.anno===+Y&&tipoOf(r)===t);return rr.length&&rr.every(r=>r.importo!=null)?sum(rr.map(r=>r.importo)):null;};
  const qbR=reale("qb"),impR=reale("imp"),qb=qbR!=null?qbR:QB.lp+QB.intra,con=qa+qb,imposta=impR!=null?impR:impI*P.sost,tt=con+imposta;
  const y={lp:mm.lp,cum,imponibile:[],qa:[],qb:[],imp:[],h:[],i:[]};
  cum.forEach((cv,m)=>{const d=cv*P.coeff,e=(cv>0||cumI[m]>0)?P.qA:0,q=qbOf(d,cumI[m]),f=q.lp+q.intra,g=Math.max(d-vers,0)*P.sost,h=e+f+g;
    y.imponibile.push(d);y.qa.push(e);y.qb.push(f);y.imp.push(g);y.h.push(h);y.i.push(h>0?h/(m+1):0);});
  y.max=Math.max(0,...y.h);const im=y.h.findIndex(v=>v===y.max&&v>0);y.maxMese=im>=0?MESI[im]:null;
  const cl=k=>Math.min(12,Math.max(0,k));const ks=[...new Set([P.mesiRid,Math.floor(P.mesiRid),Math.ceil(P.mesiRid),cl(Math.round(P.mesiRid)+1),cl(Math.round(P.mesiRid)-1),0])].sort((a,b)=>b-a);
  const sens=ks.map(k=>({k,aliq:aliqQB(P,k),qb:baseQB*aliqQB(P,k)+QB.intra,sel:k===P.mesiRid}));
  const gmE=-tot.gm*G.gmEnpam,gmI=-tot.gm*G.gmIrpef;
  return{Y,qbReale:qbR!=null,impReale:impR!=null,cumI,vers,versAuto,baseQB,qbLP:QB.lp,qbIntra:QB.intra,baseIntra:QB.baseI,qBintraAliq:P.qBintra,esenteQB:P.esenteQB,mm,tot,tm,cum,lpMesi:mm.lp.filter(v=>v>0).length,coeff:P.coeff,sostAliq:P.sost,aliq,imp,qa,qb,con,impI,imposta,tasse:tt,mens:tt/12,
    pct:tot.lp>0?tt/tot.lp:0,ytd:y,sens,gm:{lordo:tot.gm,enpam:gmE,irpef:gmI,netto:tot.gm+gmE+gmI}};
}
let TODAY=new Date().toLocaleDateString("sv-SE");
// Date effettive: sabato, domenica e festivi nazionali slittano al primo giorno lavorativo successivo;
// per ENPAM il 31/12 festivo viene anticipato al giorno utile precedente.
const HOLI=y=>{const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),mo=Math.floor((h+l-7*m+114)/31),da=((h+l-7*m+114)%31)+1;
 const em=new Date(Date.UTC(y,mo-1,da+1)).toISOString().slice(5,10);return new Set(["01-01","01-06","04-25","05-01","06-02","08-15","11-01","12-08","12-25","12-26",em]);};
const _hc={},isWork=ds=>{const w=new Date(ds+"T00:00:00Z").getUTCDay(),y=+ds.slice(0,4);return w!==0&&w!==6&&!(_hc[y]||(_hc[y]=HOLI(y))).has(ds.slice(5));};
const _sd={},shiftD=(ds,back)=>{const d=new Date(ds+"T00:00:00Z");for(let n=0;n<12;n++){const x=d.toISOString().slice(0,10);if(isWork(x))return x;d.setUTCDate(d.getUTCDate()+(back?-1:1));}return ds;};
const SD=r=>{const s=r&&r.scadenza;if(!s||!/^\d{4}-\d\d-\d\d$/.test(s))return s||"";const back=["qa","qb"].includes(tipoOf(r))&&s.slice(5)==="12-31",k=s+(back?"b":"f");return _sd[k]||(_sd[k]=shiftD(s,back));};
/* v54: le voci delle spese fisse senza addebito automatico (r.man) non risultano pagate da sole alla scadenza:
   si segnano a mano o si collegano al movimento dell'estratto conto (anche in automatico, autoLinkMan). */
const paidOf=r=>r.forzaNonPagato?false:(r.pagato||(!r.man&&!!r.scadenza&&SD(r)<=TODAY));
const PDt=r=>r.lk&&r.dataPag?r.dataPag:SD(r); /* voce collegata a un movimento: conta nel mese del pagamento reale */
const autoPaid=r=>!r.pagato&&!r.forzaNonPagato&&!!r.scadenza&&SD(r)<=TODAY;
const tipoOf=r=>(r.auto&&r.auto!=="enpam")?r.auto:r.tipo;
const scadGroup=r=>(/^\d{4}/.test(r.scadenza)?PDt(r).slice(0,4):(r.anno!=null?String(r.anno):"senza-data"));
const fondoFlow=(s,Y,m)=>{const pref=`${Y}-${String(m+1).padStart(2,"0")}`;return sum((s.fondoMov||[]).filter(t=>t.data.startsWith(pref)).map(t=>t.tipo==="riscatto"?-n(t.importo):n(t.importo)));};
function calc(s){
  const R={anni:{}};yearsOf(s.anni).forEach(Y=>R.anni[Y]=tasseAnno(s,Y,R.anni[Y-1]));
  /* scadenzario */
  const TPL=Object.fromEntries((s.ricorrenti||[]).map(t=>[t.id,t]));
  const AV=r=>{if(r.ric)return TPL[r.ric]?TPL[r.ric].importo:null;if(!r.auto)return null;const T=R.anni[r.anno];
    if(r.auto==="enpam"){const Tp=R.anni[r.anno-1];if(!T&&!Tp)return null;return((T?T.qa:0)+(Tp?Tp.qb:0))*r.frazione-r.meno;}
    return T?{qa:T.qa,qb:T.qb,imp:T.imposta}[r.auto]*r.frazione-r.meno:null;};
  const rows=s.scadenzario.map(r=>{const a=AV(r);return{auto:a,imp:r.importo!=null?r.importo:n(a)};});
  const isF=r=>tipoOf(r)!=="spesa";
  const curY=new Date().getFullYear(),fut=r=>r.anno!=null&&r.anno>curY;
  const D0={rows,curY,aperti:sum(s.scadenzario.map((r,i)=>!isF(r)||paidOf(r)||fut(r)?0:rows[i].imp)),futuri:sum(s.scadenzario.map((r,i)=>isF(r)&&!paidOf(r)&&fut(r)?rows[i].imp:0)),
    pagati:sum(s.scadenzario.map((r,i)=>isF(r)&&paidOf(r)?rows[i].imp:0)),acc:s.accantonato,perAnno:{},fisseAnno:sum((s.ricorrenti||[]).map(t=>n(t.importo)*(t.freq==="m"?12:1)))};
  {const nx=s.scadenzario.map((r,i)=>({r,i})).filter(({r})=>!paidOf(r)&&r.scadenza&&SD(r)>=TODAY).sort((a,b)=>SD(a.r).localeCompare(SD(b.r)))[0];
   D0.next=nx?{voce:nx.r.voce,data:dIt(SD(nx.r)),imp:rows[nx.i].imp}:null;}
  D0.perAnnoF={};D0.perAnnoFT={};D0.perAnnoFP={};s.scadenzario.forEach((r,i)=>{if(!isF(r))return;const g=scadGroup(r);D0.perAnnoFT[g]=(D0.perAnnoFT[g]||0)+rows[i].imp;if(paidOf(r))D0.perAnnoFP[g]=(D0.perAnnoFP[g]||0)+rows[i].imp;else D0.perAnnoF[g]=(D0.perAnnoF[g]||0)+rows[i].imp;});
  {const cats=["qa","qb","imp","altro"],tp={byYear:{},years:[]};
   s.scadenzario.forEach((r,i)=>{if(!isF(r))return;const g=scadGroup(r);const c=["qa","qb","imp"].includes(tipoOf(r))?tipoOf(r):"altro";
     const Y=tp.byYear[g]||(tp.byYear[g]=Object.fromEntries([...cats.map(k=>[k,{tot:0,pag:0,res:0,n:0}]),["tot",0],["pag",0],["res",0]]));
     const v=rows[i].imp,p=paidOf(r);Y[c].tot+=v;Y[c].n++;Y.tot+=v;if(p){Y[c].pag+=v;Y.pag+=v;}else{Y[c].res+=v;Y.res+=v;}});
   tp.years=Object.keys(tp.byYear).sort();tp.all={tot:sum(tp.years.map(y=>tp.byYear[y].tot)),pag:sum(tp.years.map(y=>tp.byYear[y].pag)),res:sum(tp.years.map(y=>tp.byYear[y].res))};
   tp.max=Math.max(1,...tp.years.map(y=>tp.byYear[y].tot));R.tp=tp;}
  {const t=new Date();R.usc=[0,1,2].map(k=>{const d=new Date(t.getFullYear(),t.getMonth()+k,1),key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
    const items=s.scadenzario.map((r,i)=>({r,i})).filter(({r})=>SD(r).startsWith(key)).sort((a,b)=>SD(a.r).localeCompare(SD(b.r)))
      .map(({r,i})=>({voce:r.voce,imp:rows[i].imp,f:isF(r),paid:paidOf(r)}));
    return{lbl:MESI[d.getMonth()].toLowerCase()+" "+d.getFullYear(),items,tot:sum(items.map(x=>x.imp)),tasse:sum(items.filter(x=>x.f).map(x=>x.imp)),fisse:sum(items.filter(x=>!x.f).map(x=>x.imp))};});}
  s.scadenzario.forEach((r,i)=>{const g=scadGroup(r),o=D0.perAnno[g]||(D0.perAnno[g]={aperti:0,pagati:0});if(paidOf(r))o.pagati+=rows[i].imp;else o.aperti+=rows[i].imp;});
  D0.scoperto=D0.acc!=null?Math.max(D0.aperti-D0.acc,0):null;D0.cop=D0.acc!=null&&D0.aperti>0?Math.min(D0.acc/D0.aperti,1):null;R.deb=D0;
  const debMese=(PY,m)=>{const end=`${PY}-${String(m+1).padStart(2,"0")}-31`;
    return sum(s.scadenzario.map((r,i)=>{if(!isF(r))return 0;if(r.anno!=null&&r.anno>PY)return 0;{const pd=SD(r)||r.dataPag;if(paidOf(r)&&(!pd||pd<=end))return 0;}
      if(r.anno===PY&&r.importo==null&&r.auto&&r.auto!=="enpam"&&R.anni[PY])return Math.max(R.anni[PY].ytd[r.auto][m]*r.frazione-r.meno,0);return rows[i].imp;}));};
  /* patrimonio per anno */
  R.patr={};const pys=yearsOf(s.patrimonio);
  pys.forEach(PY=>{
    const p=s.patrimonio[PY],o={D:[],E:[],F:[],G:[],H:[],I:[],J:[],K:[],Rend:[]},prevO=R.patr[PY-1],prevRows=s.patrimonio[PY-1];
    const prevClose=s.chiusure[PY-1]!=null?s.chiusure[PY-1]:(prevO?prevO.lastD:null);
    p.forEach((x,m)=>{
      const D=(n(x.fineco)>0||n(x.revolut)>0)?n(x.fineco)+n(x.revolut):0;
      const E=m===0?(D>0&&prevClose!=null?D-prevClose:0):((D>0&&o.D[m-1]>0)?D-o.D[m-1]:0);
      const F=D>0?debMese(PY,m):0;
      const H=(x.fondo==null&&x.etf==null)?null:n(x.fondo)+n(x.etf);
      const I=D>0?D+n(H):0;
      const J=m===0?0:((I>0&&o.I[m-1]>0)?I-o.I[m-1]:0);
      const Hp=m===0?(prevO?prevO.H[11]:null):o.H[m-1],etfP=m===0?(prevRows?prevRows[11].etf:null):p[m-1].etf;
      const fP_=m===0?(prevRows?prevRows[11].fondo:null):p[m-1].fondo;
      const rF=(x.fondo!=null&&fP_!=null)?x.fondo-fP_-fondoFlow(s,PY,m):null;
      const rE=(x.etf!=null&&(etfP!=null||x.vEtf!=null))&&(x.vEtf!=null||etfP!=null)?x.etf-n(etfP)-n(x.vEtf):null;
      (o.RF=o.RF||[]).push(rF);(o.RE=o.RE||[]).push(rE);
      const ff=fondoFlow(s,PY,m),rend=(H!=null&&Hp!=null&&(x.vEtf!=null||(x.etf==null&&etfP==null)))?H-Hp-n(x.vEtf)-ff:null;
      o.Kd=o.Kd||[];o.D.push(D);o.E.push(E);o.F.push(F);o.G.push(D>0?D-F:0);o.H.push(H);o.I.push(I);o.J.push(J);o.K.push(I>0?I-F:0);o.Kd.push(m===0||!(I>0)||!(o.K[m-1]>0)?null:o.K[m]-o.K[m-1]);o.Rend.push(rend);});
    let k=-1;o.D.forEach((d,i)=>{if(d>0)k=i;});
    o.last=k;o.lastD=k>=0?o.D[k]:null;o.lastH=(()=>{for(let j=11;j>=0;j--)if(o.H[j]!=null)return o.H[j];return null;})();o.E.lastPos=k>=0?o.E[k]:null;o.prevClose=prevClose;
    o.varAnno=o.lastD!=null&&prevClose!=null?o.lastD-prevClose:null;
    /* v41: variazione del patrimonio totale (liquidità + investimenti) da fine anno prima; investimenti di fine anno prima da «Valori di fine anno» (S.chiusureInv), altrimenti dicembre della tabella di quell'anno */
    {const ci=s.chiusureInv&&s.chiusureInv[PY-1],pInv=ci!=null?ci:(prevO&&prevO.H[11]!=null?prevO.H[11]:null);o.prevInv=pInv;
     let hL=0;for(let j=k;j>=0;j--)if(o.H[j]!=null){hL=o.H[j];break;}
     o.varTot=o.lastD!=null&&prevClose!=null?o.lastD+n(hL)-prevClose-n(pInv):null;}o.rendY=o.Rend.some(v=>v!=null)?sum(o.Rend):null;o.rendYF=o.RF.some(v=>v!=null)?sum(o.RF):null;o.rendYE=o.RE.some(v=>v!=null)?sum(o.RE):null;
    R.patr[PY]=o;});
  /* storico chiusure */
  const cy=yearsOf(s.chiusure);R.chiusure={};cy.forEach(y=>{R.chiusure[y]={v:s.chiusure[y],d:s.chiusure[y-1]!=null?s.chiusure[y]-s.chiusure[y-1]:null};});
  /* dashboard */
  const PY=[...pys].reverse().find(y=>R.patr[y].last>=0)??pys[pys.length-1];R.PY=PY;
  const p=s.patrimonio[PY],o=R.patr[PY];
  const lastIn=key=>{for(let i=11;i>=0;i--)if(p[i][key]!=null)return p[i][key];return null;};
  const fineco=lastIn("fineco"),revolut=lastIn("revolut"),fondo=n(lastIn("fondo")),etf=n(lastIn("etf"));
  const lordo=n(fineco)+n(revolut),acc=D0.aperti,inv=fondo+etf;
  const versE=s.etfBase!=null?s.etfBase+sum(pys.flatMap(y=>s.patrimonio[y].map(x=>x.vEtf))):null;
  const capF=s.fondo.capitale,plusF=capF!=null?fondo-capF:null,plusE=versE!=null?etf-versE:null;
  const taxLat=(plusF==null&&plusE==null)?null:(Math.max(n(plusF),0)+Math.max(n(plusE),0))*s.globali.plus;
  R.dash={fineco,revolut,lordo,acc,netto:lordo-acc,inv,patrL:lordo+inv,patrN:lordo+inv-acc,fondo,etf,ivafe:etf*s.globali.ivafe,
    capF,versE,plusF,plusE,taxLat,rendY:o.rendY,kdLast:o.last>=0?o.Kd[o.last]:null,
    dFin:o.last>0&&p[o.last].fineco!=null&&p[o.last-1].fineco!=null?p[o.last].fineco-p[o.last-1].fineco:null,
    dRev:o.last>0&&p[o.last].revolut!=null&&p[o.last-1].revolut!=null?p[o.last].revolut-p[o.last-1].revolut:null,
    dTot:o.last>=0?o.E[o.last]:null,prevMese:o.last>0?MESI[o.last-1].toLowerCase():(o.last===0?"fine "+(PY-1):null),
    tasseAll:D0.aperti+D0.futuri,patrNall:lordo+inv-D0.aperti-D0.futuri,
    plusFp:capF?plusF/capF:null,plusEp:versE?plusE/versE:null,rendYF:o.rendYF,rendYE:o.rendYE,rendYFp:capF&&o.rendYF!=null?o.rendYF/capF:null,rendYEp:versE&&o.rendYE!=null?o.rendYE/versE:null,
    invTot:(capF!=null||versE!=null)?n(capF)+n(versE):null,plusTot:(plusF==null&&plusE==null)?null:n(plusF)+n(plusE),
    plusTotP:(capF!=null||versE!=null)&&(n(capF)+n(versE))>0?(n(plusF)+n(plusE))/(n(capF)+n(versE)):null,rendYp:(n(capF)+n(versE))>0&&o.rendY!=null?o.rendY/(n(capF)+n(versE)):null,varAnno:o.varAnno,lastE:o.E.lastPos,prevY:PY-1};
  const ty=yearsOf(s.anni);R.TY=R.anni[PY]?PY:ty[ty.length-1];
  {const T=R.anni[R.TY],comp={};["qa","qb","imp"].forEach(c=>{
    const tot=T?(c==="imp"?T.imposta:T[c]):0;
    const pag=sum(s.scadenzario.map((r,i)=>paidOf(r)&&r.anno===R.TY&&tipoOf(r)===c?rows[i].imp:0));
    comp[c]={tot,pag,res:Math.max(tot-pag,0)};});
   comp.tot=sum(["qa","qb","imp"].map(c=>comp[c].tot));comp.pag=sum(["qa","qb","imp"].map(c=>comp[c].pag));comp.res=comp.tot-comp.pag;R.comp=comp;}
  /* tasse effettive di un anno = somma delle voci dello Scadenzario di quell'anno di competenza */
  R.eff={};s.scadenzario.forEach((r,i)=>{if(r.anno!=null&&tipoOf(r)&&isF(r))R.eff[r.anno]=(R.eff[r.anno]||0)+rows[i].imp;});
  /* risparmio mese per mese (anno PY); medie sugli ultimi 3 mesi completi, anche a cavallo d'anno */
  const pad=m=>String(m+1).padStart(2,"0");
  /* affitto = righe pagate delle spese fisse la cui voce contiene «affitto» (parte delle spese fisse) */
  const isAff=r=>!!(r.ric&&TPL[r.ric]&&/affitt/i.test(TPL[r.ric].voce||r.voce||""));
  const casaMese=(ym,aff)=>{try{if(movMesi().includes(ym))return Math.max(-movNetto(ym).net.casa,0);}catch(_){}return aff;};
  const svOf=Y=>{const o=R.patr[Y],p=s.patrimonio[Y],sv={ent:[],risp:[],tasso:[],tasse:[],fisse:[],spese:[],inv:[],acc:[],rn:[],spT:[],aff:[],casa:[],prest:[],rst:[]},T=R.anni[Y];
   MESI.forEach((_,m)=>{const pref=`${Y}-${pad(m)}`;
    /* v52 (decisione di Marco): un prestito dato è un'uscita del mese in cui lo fai, le restituzioni sono entrate del mese
       in cui arrivano (conta sempre chiusura − chiusura del mese prima); nelle viste stanno in una voce a parte «Prestiti». */
    const prestM=sum((s.prestiti||[]).filter(p=>p.data.startsWith(pref)).map(p=>p.importo)),rstM=sum((s.prestiti||[]).flatMap(p=>p.rest||[]).filter(r=>r.data.startsWith(pref)).map(r=>r.importo));
    const ent=sum(s.registro.filter(r=>r.data.startsWith(pref)&&IN_TOT(r.fonte)).map(r=>r.importo))+rstM;
    const tas=sum(s.scadenzario.map((r,i)=>isF(r)&&paidOf(r)&&(PDt(r)||r.dataPag||"").startsWith(pref)?rows[i].imp:0));
    const fis=sum(s.scadenzario.map((r,i)=>!isF(r)&&paidOf(r)&&PDt(r).startsWith(pref)?rows[i].imp:0));
    const aff=sum(s.scadenzario.map((r,i)=>!isF(r)&&isAff(r)&&paidOf(r)&&PDt(r).startsWith(pref)?rows[i].imp:0));
    const prevD=m===0?o.prevClose:o.D[m-1];const ok=o.D[m]>0&&prevD>0;
    /* v51: + variazione dei crediti (prestiti dati − restituiti): un prestito non è una spesa */
    const inv=n(p[m].vEtf)+fondoFlow(s,Y,m),risp=ok?o.D[m]-prevD+inv:null;sv.prest.push(ok?prestM:null);sv.rst.push(ok?rstM:null);
    sv.ent.push(ok?ent:null);sv.inv.push(ok?inv:null);sv.risp.push(risp);sv.tasse.push(ok?tas:null);sv.fisse.push(ok?fis:null);sv.aff.push(ok?aff:null);
    sv.spese.push(ok?ent-risp-tas-fis-prestM:null);
    /* v41: affitto + utenze = «Casa e utenze» degli estratti (netta dei rimborsi) se il mese ha estratti, altrimenti l'affitto delle spese fisse; al massimo le uscite meno le tasse */
    sv.casa.push(ok?Math.min(Math.max(casaMese(pref,aff),0),Math.max(ent-risp-tas,0)):null);sv.tasso.push(ok&&ent>0?risp/ent:null);
    /* tasse da accantonare nel mese (competenza): 1/12 di Quota A + Quota B e imposta maturate sulle entrate del mese */
    const dY=a=>a?a[m]-(m?a[m-1]:0):0,acc=ok&&T?T.qa/12+dY(T.ytd.qb)+dY(T.ytd.imp):(ok?0:null);
    sv.acc.push(acc);sv.rn.push(ok?risp+tas-acc:null);sv.spT.push(ok?ent-risp-tas:null);});
   return sv;};
  const sv=svOf(PY),svP=R.patr[PY-1]?svOf(PY-1):null;
  const okM=sv.risp.map((v,i)=>v!=null?i:-1).filter(i=>i>=0);
  const pool=[...(svP?svP.risp.map((v,i)=>v!=null?{o:svP,i,Y:PY-1}:null).filter(Boolean):[]),...okM.map(i=>({o:sv,i,Y:PY}))],l3=pool.slice(-3);
  const avg=k=>l3.length?sum(l3.map(q=>q.o[k][q.i]))/l3.length:null;
  sv.m3={ent:avg("ent"),risp:avg("risp"),spese:avg("spese"),tasse:avg("tasse"),fisse:avg("fisse"),inv:avg("inv"),acc:avg("acc"),rn:avg("rn"),spT:avg("spT"),aff:avg("aff")};
  {const q=pool[pool.length-1];sv.last=q?{lbl:MESI[q.i].toLowerCase()+(q.Y!==PY?" "+q.Y:""),ent:q.o.ent[q.i],acc:q.o.acc[q.i],rn:q.o.rn[q.i],spT:q.o.spT[q.i],aff:q.o.aff[q.i]}:null;}
  /* media mensile sull'anno (mesi compilati di PY) */
  {const aY=k=>okM.length?sum(okM.map(i=>sv[k][i]))/okM.length:null;sv.ya={ent:aY("ent"),acc:aY("acc"),rn:aY("rn"),spT:aY("spT"),aff:aY("aff")};
   sv.yaLbl=okM.length?(okM.length>1?`${MESI[okM[0]].slice(0,3).toLowerCase()}–${MESI[okM[okM.length-1]].slice(0,3).toLowerCase()} `:`${MESI[okM[0]].slice(0,3).toLowerCase()} `)+PY:"";}
  sv.m3.tasso=sv.m3.ent>0?sv.m3.risp/sv.m3.ent:null;
  sv.ytd={sp:sum(okM.map(i=>sv.ent[i]-sv.risp[i])),inv:sum(okM.map(i=>sv.inv[i])),sur:sum(okM.map(i=>sv.risp[i]-sv.inv[i])),acc:sum(okM.map(i=>sv.acc[i])),rn:sum(okM.map(i=>sv.rn[i])),ent:sum(okM.map(i=>sv.ent[i])),risp:sum(okM.map(i=>sv.risp[i])),spese:sum(okM.map(i=>sv.spese[i])),tasse:sum(okM.map(i=>sv.tasse[i])),fisse:sum(okM.map(i=>sv.fisse[i])),aff:sum(okM.map(i=>sv.aff[i])),casa:sum(okM.map(i=>sv.casa[i]))};sv.ytd.prest=sum(okM.map(i=>sv.prest[i]));sv.ytd.rst=sum(okM.map(i=>sv.rst[i]));sv.ytd.resto=sv.ytd.sp-sv.ytd.tasse-sv.ytd.casa-sv.ytd.prest;sv.ytd.tasso=sv.ytd.ent>0?sv.ytd.risp/sv.ytd.ent:null;
  {const ym=q=>`${q.Y}-${pad(q.i)}`,q=pool[pool.length-1];if(sv.last&&q)sv.last.ym=ym(q);}
  R.svAll={};R.ytdAll={};Object.keys(R.patr).filter(isY).forEach(Y=>{let x=null;try{x=+Y===PY?sv:svOf(+Y);}catch(_){x=null;}if(!x)return;R.svAll[Y]=x;
   const ok=x.risp.map((v,i)=>v!=null?i:-1).filter(i=>i>=0),S_=k=>sum(ok.map(i=>x[k][i]));
   R.ytdAll[Y]={n:ok.length,lbl:ok.length?`${MESI[ok[0]].slice(0,3).toLowerCase()}–${MESI[ok[ok.length-1]].slice(0,3).toLowerCase()} ${Y}`:"",ent:S_("ent"),sp:sum(ok.map(i=>x.ent[i]-x.risp[i])),inv:S_("inv"),sur:sum(ok.map(i=>x.risp[i]-x.inv[i])),tasse:S_("tasse"),fisse:S_("fisse"),risp:S_("risp"),aff:S_("aff"),casa:S_("casa"),prest:S_("prest"),rst:S_("rst")};});
  sv.mesi=l3.map(q=>MESI[q.i].slice(0,3).toLowerCase()+(q.Y!==PY?" "+String(q.Y).slice(2):"")).join("–");R.sv=sv;
  /* previsione di cassa: 12 mesi dopo l'ultimo mese compilato */
  {const entA=s.prev.entrate!=null?s.prev.entrate:sv.m3.ent,speA=s.prev.spese!=null?s.prev.spese:sv.m3.spese,invA=s.prev.inv!=null?s.prev.inv:sv.m3.inv;
   const pv={entAuto:sv.m3.ent,speAuto:sv.m3.spese,invAuto:sv.m3.inv,ent:entA,spe:speA,inv:invA,mesi:[],min:null};
   let y=PY,m=o.last,liq=lordo;
   for(let k=0;k<12;k++){m++;if(m>11){m=0;y++;}const key=`${y}-${pad(m)}`;
     const fiscT=sum(s.scadenzario.map((r,i)=>isF(r)&&!paidOf(r)&&SD(r).startsWith(key)?rows[i].imp:0));
     const fisse=sum(s.scadenzario.map((r,i)=>!isF(r)&&!paidOf(r)&&SD(r).startsWith(key)?rows[i].imp:0));const fisc=fiscT+fisse;
     const net=n(entA)-n(speA)-n(invA)-fisc;liq+=net;pv.mesi.push({key,lbl:MESI[m].slice(0,3)+(m===0||k===0?" "+String(y).slice(2):""),fisc,fiscT,fisse,net,liq});}
   pv.min=pv.mesi.reduce((a,x)=>x.net<a.net?x:a,pv.mesi[0]);pv.fine=liq;pv.fiscTot=sum(pv.mesi.map(x=>x.fiscT));pv.fisseTot=sum(pv.mesi.map(x=>x.fisse));pv.invTot=12*n(invA);R.pv=pv;}
  return R;
}

/* ================= formattazione ================= */
const fE=new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR",useGrouping:"always",minimumFractionDigits:2,maximumFractionDigits:2});
const fN=new Intl.NumberFormat("it-IT",{useGrouping:"always",maximumFractionDigits:2});
const fP=new Intl.NumberFormat("it-IT",{style:"percent",minimumFractionDigits:2,maximumFractionDigits:2});
function fmt(v,f){
  if(f==="text")return v==null?"—":String(v);
  if(v==null||(typeof v==="number"&&!isFinite(v)))return "—";
  if(typeof v==="number"&&Math.abs(v)<0.005&&!/pct/.test(f||""))v=0;
  if(f==="pct")return fP.format(v);if(f==="pctS")return (v>0?"+":"")+fP.format(v);if(f==="pct1")return new Intl.NumberFormat("it-IT",{style:"percent",maximumFractionDigits:0}).format(v);if(f==="num")return fN.format(v);
  if(f==="sign")return (v>0?"+":"")+fE.format(v);return fE.format(v);
}
function parseIt(str){
  let t=String(str).trim().replace(/[€\s%]/g,"");if(t==="")return{ok:true,v:null};
  if(t.includes(","))t=t.replace(/\./g,"").replace(",",".");else if(/^-?\d{1,3}(\.\d{3})+$/.test(t))t=t.replace(/\./g,"");
  const v=Number(t);return isFinite(v)?{ok:true,v}:{ok:false};
}
const fN2=new Intl.NumberFormat("it-IT",{useGrouping:"always",minimumFractionDigits:2,maximumFractionDigits:2});
function showIn(v,k){if(v==null)return "";if(k==="int")return String(v);if(k==="dec")return fN.format(v);if(k==="pct")return fN2.format(+(v*100).toFixed(6));return fN2.format(v);}
const getP=(o,p)=>p.split(".").reduce((a,k)=>a==null?a:a[k],o);
function setP(o,p,v){const ks=p.split(".");let a=o;for(let i=0;i<ks.length-1;i++){if(a[ks[i]]==null)a[ks[i]]={};a=a[ks[i]];}a[ks[ks.length-1]]=v;}
const esc=t=>String(t).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const dIt=d=>d?d.split("-").reverse().join("/"):"";

/* ================= mattoncini html ================= */
let R=calc(S),READONLY=false,UY=null;
const idOf=p=>"in-"+p.replace(/\./g,"-");
const inp=(path,kind="num",ph="")=>`<input class="in" id="${idOf(path)}" data-i="${path}" data-k="${kind}" inputmode="decimal" autocomplete="off" placeholder="${ph}" aria-label="${path}">`;
const inpT=(path,type="text",ph="")=>type==="checkbox"
  ?`<input type="checkbox" class="ck" id="${idOf(path)}" data-i="${path}" data-k="bool" aria-label="${path}">`
  :`<input class="in ${type==="text"?"txt":""}" type="${type}" id="${idOf(path)}" data-i="${path}" data-k="${type}" autocomplete="off" placeholder="${ph}" aria-label="${path}">`;
const sel=(path,list=FONTI)=>`<select class="in sel" id="${idOf(path)}" data-i="${path}" data-k="sel" aria-label="${path}">${list.map(([k,l])=>`<option value="${k}">${l}</option>`).join("")}</select>`;
const out=(path,f="eur",cls="")=>`<span data-o="${path}" data-f="${f}" class="${cls}"></span>`;
const kv=(label,val,cls="")=>`<dt class="${cls}">${label}</dt><dd class="${cls}">${val}</dd>`;
const allYears=()=>[...new Set([...yearsOf(S.anni),...yearsOf(S.patrimonio)])].sort((a,b)=>a-b);
const yearBar=()=>`<div class="years" role="group" aria-label="Anno">${allYears().map(y=>`<button class="ybtn" data-act="year" data-y="${y}" ${y===UY?'aria-pressed="true"':""}>${y}</button>`).join("")}</div>`;



/* ================= schede ================= */
const TABS=[["home","Home"],["dashboard","Finanze"],["patrimonio","Patrimonio"],["scadenzario","Scadenzario"],["entrate","Entrate"],["tasse","Tasse"],["risparmio","Andamento"],["mese","Resoconto mensile"],["parametri","Parametri"],
 ["lavoro","Lavoro"],["turni","Turni"],["lv-ora","Orario e riposi"],["presenze","Presenze e ferie"],["lv-pag","Guardie e aggiuntiva"],["cedolini","Cedolini"],
 ["sondaggi","Sondaggi"],["collegamenti","Collegamenti e backup"]];
/* tre sezioni (Lavoro, Finanze, Sondaggi), ognuna con la sua dashboard; ogni scheda torna alla dashboard della sua sezione */
const DASHES=["dashboard","lavoro","sondaggi"];
const PARENT={dashboard:"home",lavoro:"home",sondaggi:"home",collegamenti:"home",turni:"lavoro","lv-ora":"lavoro",presenze:"lavoro","lv-pag":"lavoro",cedolini:"lavoro"};
const parentOf=t=>PARENT[t]||(t==="home"?null:"dashboard");
const V={};

V.dashboard=()=>{const PY=R.PY;return `
<section class="sheet">
 <div class="sheet-h"><h2>Dashboard finanziaria ${PY}</h2><p>Situazione all'ultimo mese compilato (${R.patr[PY]&&R.patr[PY].last>=0?MESI[R.patr[PY].last].toLowerCase():"—"} ${PY}).</p></div>
 <div id="empty-banner" class="banner" hidden>Nessun dato su questo dispositivo. Se li hai già, ripristinali dal PC o da un file in <a href="#collegamenti">Collegamenti e backup</a>. Altrimenti inserisci i saldi in <a href="#patrimonio">Patrimonio</a> e i movimenti in <a href="#entrate">Entrate</a>: i campi con il bordo colorato sono modificabili.</div>
 ${dashPatCard(PY)}
 <details class="calc notes-det" id="notes-det" ${NOTES_OPEN?"open":""}><summary><span class="ct">Note</span><small>promemoria fiscali e legenda</small></summary><div class="calc-in"><ol class="notes">
  <li><b>1.</b><span>Dal 13/7/2026 dipendente SSN a tempo indeterminato; partita IVA chiusa. Stipendio, intramoenia e prestazioni aggiuntive sono tassati in busta dall'azienda.</span></li>
  <li><b>2.</b><span>Forfettario 2026 (gennaio-luglio): imposta sostitutiva 15%; saldo a giugno 2027 (20/7 con proroga ISA) al netto degli acconti versati nel 2026.</span></li>
  <li><b>3.</b><span>Nel forfettario i contributi ENPAM si deducono nell'anno in cui si pagano (rigo LM35).</span></li>
  <li><b>4.</b><span>ENPAM: Quota A in 4 rate (30/4, 30/6, 30/9, 30/11). Quota B dichiarata col Modello D entro il 31/7 dell'anno dopo e pagata dal 31/10 (con addebito: 5 rate fino a giugno). Il reddito coperto dalla Quota A è esente da Quota B.</span></li>
  <li><b>5.</b><span>Quota B 2026 stimata con 6 mesi al 9,75% (mesi da dipendente, se richiesta) e 6 al 19,50%. Intramoenia e prestazioni aggiuntive al 2% (va richiesto con il modulo "Contribuzione ridotta" prima del Modello D). <span class="chip">Da verificare</span></span></li>
  <li><b>6.</b><span>ETF su Revolut: regime dichiarativo. Quadro RW e IVAFE 0,2%; plusvalenze = redditi di capitale (26%, quadro RM), non compensabili con minusvalenze (quadro RT, riportabili 4 anni). Fondo Fineco: regime amministrato.</span></li>
  <li><b>7.</b><span>Campi con bordo colorato = modificabili. Colori: blu mare = liquidità; viola = investimenti; verde acqua = entrate; verde oliva = risparmio e guadagni; rosso mattone = spese e perdite; terracotta = tasse.</span></li>
 </ol></div></details>
</section>`;};

let SY=null,EDIT=null,PT="liq";
const catOf=r=>r.ric?["fissa","Spesa fissa"]:({qa:["enpam","ENPAM"],qb:["enpam","ENPAM"],imp:["imp","Imposta"]}[tipoOf(r)]||["altro","Altro"]);
function scadEditRow(r,i){const rows0=R.deb.rows,ys=yearsOf(S.anni);
 const rifOpts=[`<option value=":">Altro</option>`,...ys.flatMap(y=>[["qa","Quota A"],["qb","Quota B"],["imp","Imposta sostitutiva"]].map(([t,l])=>`<option value="${t}:${y}">${l} ${y}</option>`))].join("");
 return `<div class="mrow edit"><div class="ed">
   <label>Data${inpT(`scadenzario.${i}.scadenza`,"date")}</label>
   <label class="grow">Voce${inpT(`scadenzario.${i}.voce`,"text","Descrizione")}</label>
   <label>Importo €${inp(`scadenzario.${i}.importo`)}<small>${r.ric?`vuoto = ${fmt(rows0[i].auto)}`:r.auto?`vuoto = calcolo ${fmt(rows0[i].auto)}`:""}</small></label>
   ${!r.ric&&!(r.auto&&r.auto!=="enpam")?`<label>Riferita a<select class="in sel rifsel" id="${idOf("scadenzario."+i+".rif")}" data-i="scadenzario.${i}" data-k="rif">${rifOpts}</select></label>`:""}
   <div class="ed-act"><button class="btn" data-act="done">Fatto</button><button class="btn ghost danger" data-act="del-scad" data-idx="${i}" ${READONLY?"disabled":""}>Elimina</button></div>
  </div></div>`;}
function scadLine(r,i,dash){const rows0=R.deb.rows;if(EDIT===r.id&&!dash)return scadEditRow(r,i);const p=paidOf(r),[ck,cl]=catOf(r),e=PDt(r),d=e?e.split("-"):null,mv=!r.lk&&e&&e!==r.scadenza;
  return `<div class="mrow sr ${p?"paid":""}" data-ym="${e?e.slice(0,7):""}">
  <span class="md">${d?+d[2]:"—"}</span>
  <span class="mv"><span class="dot c-${ck}" title="${cl}"></span><span class="vt">${esc(r.voce||"(senza descrizione)")}</span>${r.lk?(()=>{const ls=(S.link||[]).filter(l=>l.k==="s"&&l.r===r.id);return `<span class="lk-b" title="Collegata ai movimenti dei conti: ${esc(ls.map(l=>dIt(l.d)+" "+l.c+" "+l.t+" "+fmt(l.i)).join("; "))}">↔ ${dIt(r.dataPag)}${ls[0]?" · "+esc(ls[0].c):""}${ls.length>1?" ("+ls.length+")":""}</span>`;})():""}${mv&&!r.lk?`<span class="slip" title="Scadenza nominale ${dIt(r.scadenza)}: cade di sabato, domenica o festivo">${e>r.scadenza?"slitta":"anticipata"} dal ${dIt(r.scadenza)}</span>`:""}</span>
  <span class="ma">${fmt(rows0[i].imp)}</span>
  <span class="ms"><button class="pill ${p?"ok":"todo"}" data-act="tog" data-id="${r.id}" ${READONLY?"disabled":""} title="Clicca per cambiare">${p?"✓ Pagato":"Da pagare"}</button><button class="icon-btn ghost-ed" data-act="edit" data-id="${r.id}" ${dash?'data-nav="1"':""} aria-label="Modifica">✎</button></span></div>`;}
function scadCard(ym,label,ids,dash){const rows0=R.deb.rows,nowYM=TODAY.slice(0,7),tot=sum(ids.map(i=>rows0[i].imp)),open=ids.filter(i=>!paidOf(S.scadenzario[i])).length,ed=ids.some(i=>S.scadenzario[i].id===EDIT);
  return `${dash?`<div class="mcard dash`:`<div class="mcard`} ${ids.length?"":"empty"} ${ym===nowYM?"now":""} ${ed?"editing":""} ${ids.length&&!open?"done":""}" data-ym="${ym}">
   <div class="mh"><span class="mn">${dash?`<a class="hlink" href="#scadenzario" data-act="go" data-tab="scadenzario" data-ym="${ym}">${label} <span aria-hidden="true">›</span></a>`:label}</span>${ids.length?`<span class="mt">${fmt(tot)}</span>`:""}</div>
   ${ids.length?ids.map(i=>scadLine(S.scadenzario[i],i,dash)).join(""):`<div class="me">nessuna scadenza</div>`}${dash?`<a class="mgo" href="#scadenzario" data-act="go" data-tab="scadenzario" data-ym="${ym}">Apri lo Scadenzario ›</a>`:""}</div>`;}
V.scadenzario=()=>{
 const groups={};S.scadenzario.forEach((r,i)=>{(groups[scadGroup(r)]=groups[scadGroup(r)]||[]).push(i);});
 const gy=Object.keys(groups).sort(),cy=String(new Date().getFullYear());
 if(SY==null||!gy.includes(SY))SY=gy.includes(cy)?cy:(gy[0]||cy);
 const ys=yearsOf(S.anni);
 
 
 const rows0=R.deb.rows;
 const idxs=(groups[SY]||[]).sort((a,b)=>(PDt(S.scadenzario[a])||"9").localeCompare(PDt(S.scadenzario[b])||"9"));
 const mOf=i=>{const e=PDt(S.scadenzario[i]);return e?+e.slice(5,7)-1:-1;};
 const isY=/^\d{4}$/.test(SY);
 const fisseY=sum(idxs.filter(i=>S.scadenzario[i].ric).map(i=>rows0[i].imp));
 const card=(m,ids)=>scadCard(m>=0?`${SY}-${String(m+1).padStart(2,"0")}`:"",m>=0?MESI[m]:"Senza data",ids);
 let list="";
 if(isY){list=MESI.map((_,m)=>card(m,idxs.filter(i=>mOf(i)===m))).join("");const nd=idxs.filter(i=>mOf(i)<0);if(nd.length)list+=card(-1,nd);}
 else if(idxs.length)list=card(-1,idxs);
 return `<section class="sheet">
 <div class="sheet-h"><h2>Scadenzario</h2><p>Tutte le uscite programmate, anno per anno. Ogni voce risulta pagata da sola il giorno della scadenza; per modificarne una clicca su ✎.</p></div>
 <div class="box">
  <div class="scad-head"><div class="years" role="group" aria-label="Anno di scadenza">${gy.map(g=>`<button class="ybtn" data-act="sy" data-g="${g}" ${g===SY?'aria-pressed="true"':""}>${g==="senza-data"?"Senza data":g}</button>`).join("")}</div>
   <div class="gsum"><span>da pagare <b class="tax">${out(`deb.perAnno.${SY}.aperti`)}</b></span><span>pagato <b class="gain">${out(`deb.perAnno.${SY}.pagati`)}</b></span>${isY?`<span>spese fisse ${SY} <b>${fmt(fisseY)}</b></span>`:""}</div></div>
  <div class="legend scl"><span><i class="dot c-enpam"></i>ENPAM</span><span><i class="dot c-imp"></i>Imposta</span><span><i class="dot c-fissa"></i>Spesa fissa</span><span><i class="dot c-altro"></i>Altro</span></div>
  <div class="mgrid">${list||`<p class="muted">Nessuna scadenza nel ${SY}.</p>`}</div>
 </div>
 <div class="actions"><button class="btn" data-act="add-scad" ${READONLY?"disabled":""}>+ Aggiungi voce al ${SY}</button></div>
 <details class="more"><summary>Altre opzioni e come funziona</summary>
  <div class="actions">${ys.map(y=>`<button class="btn ghost" data-act="gen-enpam" data-y="${y}" ${READONLY?"disabled":""}>+ Rate ENPAM ${y}</button><button class="btn ghost" data-act="gen-imp" data-y="${y}" ${READONLY?"disabled":""}>+ Imposta ${y}</button>`).join("")}</div>
  <p class="note">Il mese in corso è evidenziato; un ✓ accanto al totale indica che il mese è tutto pagato. Le voci ENPAM e imposta calcolate prendono l'importo dalla scheda Tasse finché non scrivi quello reale. Se un addebito non è andato a buon fine, clicca su "✓ Pagato" per riportarlo a "Da pagare". "Riferita a" serve a sapere di quale tassa e di quale anno è una voce inserita a mano: la usa la Composizione tasse della Dashboard. "Rate ENPAM" crea le 4 rate di Quota A (30/4, 30/6, 30/9, 30/11) e la Quota B dell'anno prima in 5 rate SDD (31/10, 31/12, 28/2, 30/4, 30/6; le ultime tre hanno un piccolo interesse legale, qui non incluso).</p></details>
<div class="box c-tax"><h3>Spese fisse</h3>
  <div class="tbl-wrap flat"><table class="ric"><thead><tr><th>Voce</th><th>Ogni</th><th>Quando</th><th>Se festivo</th><th>Importo</th><th>Varia</th><th title="Se tolto, la spesa va segnata come pagata a mano o collegata al movimento dell'estratto conto">Addebito automatico</th><th></th></tr></thead><tbody>
  ${S.ricorrenti.map((t,i)=>`<tr><td class="r-voce">${inpT(`ricorrenti.${i}.voce`,"text","es. Bollo auto")}</td>
   <td class="r-freq" data-l="Ogni"><select class="in sel ricfreq" id="${idOf("ricorrenti."+i+".freq")}" data-i="ricorrenti.${i}.freq" data-k="sel" aria-label="Frequenza"><option value="a">anno</option><option value="m">mese</option></select></td>
   <td class="r-quando"><label class="r-q1"><span class="r-ql">${t.freq==="m"?"Giorno":"Mese"}</span>${t.freq==="m"?`<select class="in sel mesesel" id="${idOf("ricorrenti."+i+".giorno")}" data-i="ricorrenti.${i}.giorno" data-k="mese" aria-label="Giorno del mese">${Array.from({length:31},(_,k)=>`<option value="${k+1}">il ${k+1}</option>`).join("")}</select></label><label class="ricda">dal <input type="month" class="in ric-da" data-idx="${i}" value="${t.da||""}" aria-label="Primo mese"></label>`
     :`<select class="in sel mesesel" id="${idOf("ricorrenti."+i+".mese")}" data-i="ricorrenti.${i}.mese" data-k="mese" aria-label="Mese">${MESI.map((m,k)=>`<option value="${k+1}">${m}</option>`).join("")}</select></label><label class="r-q2"><span class="r-ql">Giorno</span><select class="in sel mesesel" id="${idOf("ricorrenti."+i+".giornoA")}" data-i="ricorrenti.${i}.giornoA" data-k="sel" aria-label="Giorno del mese"><option value="" ${!t.giornoA?"selected":""}>fine mese</option>${Array.from({length:31},(_,k)=>`<option value="${k+1}" ${+t.giornoA===k+1?"selected":""}>il ${k+1}</option>`).join("")}</select></label>`}</td>
   <td class="r-lav" data-l="Se festivo"><select class="in sel" id="${idOf("ricorrenti."+i+".lav")}" data-i="ricorrenti.${i}.lav" data-k="sel" aria-label="Se il giorno cade di sabato, domenica o in un festivo">${[["","resta"],["dopo","giorno lavorativo dopo"],["prima","giorno lavorativo prima"]].map(([v,l])=>`<option value="${v}" ${(t.lav||"")===v?"selected":""}>${l}</option>`).join("")}</select></td>
   <td class="imp r-imp" data-l="Importo">${inp(`ricorrenti.${i}.importo`)}</td><td class="c r-var" data-l="Importo variabile">${inpT(`ricorrenti.${i}.variabile`,"checkbox")}</td><td class="c r-adeb" data-l="Addebito automatico">${inpT(`ricorrenti.${i}.adeb`,"checkbox")}</td>
   <td class="c r-del"><button class="icon-btn" data-act="del-ric" data-idx="${i}" aria-label="Elimina spesa fissa" ${READONLY?"disabled":""}>×</button></td></tr>`).join("")||`<tr><td colspan="8" class="muted">Nessuna spesa fissa.</td></tr>`}
  </tbody></table></div>
  <div class="actions"><button class="btn" data-act="add-ric" ${READONLY?"disabled":""}>+ Aggiungi spesa fissa</button></div>
  <details class="more"><summary>Come funzionano le spese fisse</summary><p class="note">Spese fisse annuali: compaiono nello Scadenzario per quest'anno e i due successivi, nel mese e nel giorno scelti («fine mese» = ultimo giorno del mese). Spese fisse mensili (es. affitto): una voce al mese, il giorno scelto, dal mese in cui le aggiungi fino a dicembre dell'anno prossimo (si allunga da sola). «Se festivo»: se il giorno cade di sabato, domenica o in una festività nazionale, l'addebito resta lì oppure slitta al primo giorno lavorativo dopo (o prima): cambia la data nello Scadenzario e, se passa al mese dopo, il mese in cui la spesa conta. «Addebito automatico» spuntato: la voce risulta pagata da sola alla scadenza. Tolto: resta «da pagare» finché non la segni pagata nello Scadenzario o finché nell'estratto conto non compare un pagamento che combacia (stesso importo nello stesso mese, o una controparte già collegata a questa spesa), che si collega da solo; vale per le scadenze future, quelle passate restano come sono; per saltare un mese elimina quella riga nello Scadenzario. Le spese con importo variabile (es. assicurazioni) si correggono anno per anno direttamente nella riga dello Scadenzario. Le spese fisse non sono debiti fiscali: non riducono il patrimonio netto, ma entrano nella previsione di cassa.</p></details>
 </div>
</section>`;
};

/* ciambelle e legende condivise (Dashboard, Resoconto mensile, Entrate) */
const pc=(v,t)=>t?Math.round(v/t*100)+"%":"—";
const col=c=>c==="taxh"?"url(#hatch-pc)":c==="negh"?"url(#hatch-neg)":c[0]==="#"?c:`var(--${c})`;
const donut=(segs0,sz,sw,label,center,cval,clab="totale",fv=null)=>{const F=fv||fmt;const segs=segs0.filter(x=>x[1]>0),tot=sum(segs.map(x=>x[1])),r=(sz-sw)/2,C=2*Math.PI*r;let off=0;
  const arcs=segs.map(([l,v,c])=>{const len=v/tot*C,gap=segs.length>1?1.5:0,o=`<circle cx="${sz/2}" cy="${sz/2}" r="${r}" fill="none" stroke="${col(c)}" stroke-width="${sw}" stroke-dasharray="${Math.max(len-gap,0).toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 ${sz/2} ${sz/2})"><title>${l}: ${F(v)} (${pc(v,tot)})</title></circle>`;off+=len;return o;}).join("");
  return `<svg viewBox="0 0 ${sz} ${sz}" width="${sz}" height="${sz}" role="img" aria-label="${label}" class="dn">${segs0.some(x=>x[2]==="negh")?`<defs><pattern id="hatch-neg" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="var(--neg-soft)"/><rect width="3" height="6" fill="var(--neg)"/></pattern></defs>`:""}${center===true?`<defs><pattern id="hatch-pc" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="var(--c-liq)"/><rect width="3.2" height="6" fill="var(--c-tasse)"/></pattern></defs>`:""}<circle cx="${sz/2}" cy="${sz/2}" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="${sw}"/>${arcs}${center?`<text x="50%" y="${sz/2-2}" text-anchor="middle" class="pc1" style="font-size:${sz>140?17:13}px">${(cval!=null?cval:tot)?(fv?fv(cval!=null?cval:tot):fmt(Math.round(cval!=null?cval:tot)).replace(/,\d\d(?=\s|$)/,"")):"—"}</text><text x="50%" y="${sz/2+(sz>140?15:13)}" text-anchor="middle" class="pc2" style="font-size:${sz>140?11:10}px">${clab}</text>`:""}</svg>`;};
const li=(c,l,v,t,fv)=>{const k=c==="taxh"?"tasse":c.replace(/^c-/,""),hx=c[0]==="#";return `<li><i style="${c==="taxh"?"background:repeating-linear-gradient(45deg,var(--c-tasse) 0 2.5px,var(--c-liq) 2.5px 5px)":hx?`background:${c}`:`background:var(--${c})`}"></i><span>${l}</span><b style="${hx?"color:var(--fg)":`color:var(--t-${k},var(--c-${k},var(--fg)))`}">${(fv||fmt)(v)}</b><em>${pc(v,t)}</em></li>`;};
/* uso delle entrate: risparmio netto, tasse da accantonare, spese; l'affitto è separato dalle altre spese */

/* entrate e uscite dell'anno: speso (affitto a parte), investito, surplus */

/* v41: legenda dell'Andamento (dashboard e scheda): totali dell'anno PY sui mesi con saldi */
function andLeg(){const x=R.sv&&R.sv.ytd;if(!x||!x.ent)return "";const P=R.patr[R.PY]||{},Y=R.PY,e=x.ent;
 const sub=(c,l,v)=>li(c,l,v,e).replace("<li>",'<li class="lg-s">'),hd=li("c-spese","Uscite",x.sp,e).replace("<li>",'<li class="lg-h">');
 const vt=P.varTot;
 const hx=x.acc>0?`<li class="lg-s"><i style="background:repeating-linear-gradient(45deg,var(--c-tasse) 0 2.5px,var(--c-ent) 2.5px 5px)"></i><span>di cui per tasse future <small>(tratteggio)</small></span><b style="color:var(--t-tasse)">${fmt(x.acc)}</b><em>${pc(x.acc,e)}</em></li>`:"";
 return `<div class="andleg"><ul class="pleg">${li("c-ent","Entrate",e,e)}${hx}${n(x.rst)>0.005?sub("c-ent","di cui restituzioni prestiti",x.rst):""}${hd}${sub("c-tasse","Tasse",x.tasse)}${sub("c-aff","Affitto e utenze",x.casa)}${n(x.prest)>0.005?sub("qa","Prestiti dati",x.prest):""}${sub("c-spese","Tutto il resto",x.resto)}${li("c-inv","Soldi investiti",x.inv,e)}${li("c-liq","Surplus di liquidità",x.sur,e)}</ul>
 <dl class="kv">${(()=>{const k=(R.ytdAll[Y]&&R.ytdAll[Y].n)||0;return k?kv(`Tasse maturate nel ${Y} <small>sulle entrate di ${R.ytdAll[Y].lbl.replace(" "+Y,"")}</small>`,`<span class="nt-tasse">${fmt(x.acc)}</span>`,"strong")+kv(`In media al mese <small>÷ ${k} ${k>1?"mesi":"mese"}</small>`,`<span class="nt-tasse">${fmt(x.acc/k)}</span>`)+kv(`Tasse pagate nel ${Y}`,`<span class="nt-tasse">${fmt(x.tasse)}</span>`):"";})()}${kv("Surplus dell'anno <small>liquidità + investito</small>",`<span class="${x.risp<0?"neg":"pos"}">${fmt(x.risp,"sign")}</span>`,"strong")}${kv(`Variazione del patrimonio <small>da fine ${Y-1}${P.prevInv==null?" · manca l'investito di fine "+(Y-1):""}</small>`,vt==null?`<span class="muted">—</span>`:`<span class="${vt<0?"neg":"pos"}">${fmt(vt,"sign")}</span>`)}</dl></div>`;}
function dashPatCard(Y){const P=R.patr[Y]||{},L=P.last;
 if(!(L>=0))return `<div class="box pcard"><h3>Composizione del patrimonio</h3><p class="muted">Nessun mese compilato nel ${Y}.</p></div>`;
 const g=k=>+(getP(S,`patrimonio.${Y}.${L}.${k}`)||0),lq=g("fineco")+g("revolut"),iv=g("fondo")+g("etf");
 const tx=Math.min(Math.max(+(R.dash&&R.dash.tasseAll)||0,0),Math.max(lq,0));
 const main=[["Liquidità libera",lq-tx,"c-liq"],["Liquidità per tasse future",tx,"taxh"],["Investimenti",iv,"c-inv"]].filter(x=>x[2]!=="taxh"||x[1]>0),totM=sum(main.map(x=>Math.max(x[1],0)));
 const liq=[["Fineco",g("fineco"),"c-fin"],["Revolut",g("revolut"),"c-rev"]],inv=[["Fondo Fineco",g("fondo"),"c-fondo"],["ETF Revolut",g("etf"),"c-etf"]];
 const rend=(v,p)=>`${out(v,"sign")} <small class="muted">${out(p,"pctS")}</small>`;
 const o=`patr.${Y}`;
 return `<div class="box pcard"><h3>Composizione del patrimonio <small>a fine ${MESI[L].toLowerCase()} ${Y}</small></h3>
 <div class="pcard-in">
  <a class="pcard-main pmain" href="#patrimonio" data-act="go" data-tab="patrimonio" data-pt="rie" title="Apri Patrimonio · Riepilogo">${donut(main,170,26,"Composizione del patrimonio",true)}
   <div class="pside"><ul class="pleg">${main.map(([l,v,c])=>li(c,l,v,totM)).join("")}</ul></div></a>
  <div class="pcard-sub">
   <a class="psub" href="#patrimonio" data-act="go" data-tab="patrimonio" data-pt="liq" title="Apri Patrimonio · Liquidità"><h4>Liquidità per conto</h4>
    <div class="psub-in">${donut(liq,112,15,"Liquidità per conto",1)}<div><ul class="pleg">${liq.map(([l,v,c])=>li(c,l,v,lq)).join("")}</ul>
    <dl class="kv">${kv(`Variazione da fine ${Y-1}`,out(`${o}.varAnno`,"sign"))}</dl></div></div></a>
   <a class="psub" href="#patrimonio" data-act="go" data-tab="patrimonio" data-pt="inv" title="Apri Patrimonio · Investimenti"><h4>Investimenti per strumento</h4>
    <div class="psub-in">${donut(inv,112,15,"Investimenti per strumento",1)}<div><ul class="pleg">${inv.map(([l,v,c],k)=>li(c,l,v,iv).replace("</li>",`<span class="rd">rendimento ${rend(k?"dash.plusE":"dash.plusF",k?"dash.plusEp":"dash.plusFp")}</span></li>`)).join("")}</ul>
    <dl class="kv">${kv("Rendimento complessivo",rend("dash.plusTot","dash.plusTotP"),"strong")}</dl></div></div></a>
   ${(()=>{const y=R.deb.curY,tt=R.deb.perAnnoFT[y]||0,pg=R.deb.perAnnoFP[y]||0,dp=Math.max(tt-pg,0);
    return `<a class="psub" href="#tasse" data-act="go" data-tab="tasse" data-tpy="${y}" data-to="tp-box" title="Apri Tasse · anno ${y}"><h4>Tasse ${y} <small>${tt>0?Math.round(pg/tt*100)+"% pagato":""}</small></h4>
    <div class="psub-in">${donut([["Già pagate",pg,"c-risp"],["Da pagare",dp,"c-tasse"]],112,15,"Tasse "+y+" ancora da pagare",1,dp,"da pagare")}<div><ul class="pleg">${li("c-risp","Già pagate",pg,tt)}${li("c-tasse","Da pagare",dp,tt)}</ul>
    <dl class="kv">${[y+1,y+2].map(z=>kv(`Da pagare nel ${z}`,`<span class="nt-tasse">${out(`deb.perAnnoF.${z}`)}</span>`)).join("")}</dl></div></div></a>`;})()}
   ${(()=>{const ym=TODAY.slice(0,7),m=+ym.slice(5)-1,rw=R.deb.rows,mn=MESI[m].toLowerCase(),ids=S.scadenzario.map((r,i)=>i).filter(i=>SD(S.scadenzario[i]).startsWith(ym)).sort((a,b)=>SD(S.scadenzario[a]).localeCompare(SD(S.scadenzario[b])));
    const isP=i=>paidOf(S.scadenzario[i]),tot=sum(ids.map(i=>rw[i].imp)),pg=sum(ids.filter(isP).map(i=>rw[i].imp)),dp=tot-pg,nd=ids.filter(i=>!isP(i)).length;
    const items=ids.map(i=>{const r=S.scadenzario[i],p=isP(i);return `<li class="sitem${p?" paid":""}"><i style="background:var(--${p?"c-risp":"c-spese"})"></i><span><b class="sd">${+SD(r).slice(8)}</b> ${esc(r.voce||"(senza descrizione)")}</span><b style="color:var(--t-${p?"risp":"spese"})">${fmt(rw[i].imp)}</b><em>${p?"✓":""}</em></li>`;}).join("");
    return `<a class="psub" href="#scadenzario" data-act="go" data-tab="scadenzario" data-ym="${ym}" title="Apri lo Scadenzario · ${mn}"><h4>Scadenze di ${mn} <small>${ids.length?(nd?nd+" da pagare":"tutto pagato"):"nessuna"}</small></h4>
    <span hidden data-psum>${dp>0?fmt(Math.round(dp)).replace(/,\d\d(?=\s|$)/,""):"—"}</span><div class="psub-in"><div><ul class="pleg">${items||`<li><span class="muted">Nessuna scadenza questo mese</span></li>`}</ul>
    <dl class="kv">${kv("Già pagate",`<span class="nt-risp">${fmt(pg)}</span>`)}${kv("Da pagare",`<span class="nt-spese">${fmt(dp)}</span>`)}</dl></div></div></a>`;})()}
   ${riepPsub()}
   ${R.sv&&R.sv.ytd&&R.sv.ytd.ent?`<a class="psub" href="#risparmio" data-act="go" data-tab="risparmio" title="Apri Andamento ${R.PY}"><h4>Andamento ${R.PY} <small>${R.sv.yaLbl||""}</small></h4><span hidden data-psum>${fmt(Math.round(R.sv.ytd.risp),"sign").replace(/,\d\d(?=\s|$)/,"")}</span>
    <div class="psub-in psub-col"><div id="eschart-d" class="eschart-d"></div>${andLeg()}</div></a>`:""}
  </div></div></div>`;}
function patPie(Y,vw=PT,dash=false){
 const open=dash?`<a class="box ppie box-link" href="#patrimonio" data-act="go" data-tab="patrimonio" data-pt="${vw}" title="Apri Patrimonio">`:`<div class="box ppie" id="ppie">`,close=dash?"</a>":"</div>";const P=R.patr[Y]||{},L=P.last,B=i=>`patrimonio.${Y}.${i}`,g=k=>+(getP(S,B(L)+"."+k)||0);
 const cfg={liq:["Liquidità per conto",()=>[["Fineco",g("fineco"),"c-fin"],["Revolut",g("revolut"),"c-rev"]]],
  inv:["Investimenti per strumento",()=>[["Fondo Fineco",g("fondo"),"c-fondo"],["ETF Revolut",g("etf"),"c-etf"]]],
  rie:["Composizione del patrimonio",()=>{const lq=g("fineco")+g("revolut"),tx=Y===R.PY?Math.min(Math.max(+(R.dash&&R.dash.tasseAll)||0,0),Math.max(lq,0)):0;return [["Liquidità libera",lq-tx,"c-liq"],["Liquidità per tasse future",tx,"taxh"],["Fondo Fineco",g("fondo"),"c-fondo"],["ETF Revolut",g("etf"),"c-etf"]].filter(x=>x[2]!=="taxh"||x[1]>0);}]}[vw];
 if(!cfg||!(L>=0))return `${open}<p class="muted">Nessun mese compilato nel ${Y}.</p>${close}`;
 const segs=cfg[1]().filter(x=>x[1]>0),tot=sum(segs.map(x=>x[1])),sz=150,sw=24,r=(sz-sw)/2,C=2*Math.PI*r;let off=0;
 const hid=`hatch-${vw}${dash?"d":""}`,stk=c=>c==="taxh"?`url(#${hid})`:`var(--${c})`;
 const arcs=segs.map(([l,v,c])=>{const len=v/tot*C,gap=segs.length>1?1.5:0,a=`<circle cx="${sz/2}" cy="${sz/2}" r="${r}" fill="none" stroke="${stk(c)}" stroke-width="${sw}" stroke-dasharray="${Math.max(len-gap,0).toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 ${sz/2} ${sz/2})"><title>${l}: ${fmt(v)}</title></circle>`;off+=len;return a;}).join("");
 const pc=v=>tot?Math.round(v/tot*100)+"%":"—",o=`patr.${Y}`;
 const extra={liq:()=>`<dl class="kv">${kv("Variazione sul mese prima",out(`${o}.E.lastPos`,"sign"))}${kv(`Variazione da fine ${Y-1}`,out(`${o}.varAnno`,"sign"),"strong")}</dl>`,
  inv:()=>dash?`<dl class="kv">${kv("Rendimento complessivo",`${out("dash.plusTot","sign")} <small class="muted">${out("dash.plusTotP","pctS")}</small>`,"strong")}${kv("Fondo Fineco",`${out("dash.plusF","sign")} <small class="muted">${out("dash.plusFp","pctS")}</small>`)}${kv("ETF Revolut",`${out("dash.plusE","sign")} <small class="muted">${out("dash.plusEp","pctS")}</small>`)}</dl>`:`<div class="ibig"><span>Guadagno / perdita complessiva</span><b>${out("dash.plusTot","sign")}</b><em>${out("dash.plusTotP","pctS")}</em></div>
   <dl class="kv">${kv("Capitale investito <small>fondo + versamenti ETF</small>",out("dash.invTot"))}${kv(`Rendimento ${Y} <small>mesi con dati completi</small>`,`${out(`dash.rendY`,"sign")} <small class="muted">${out("dash.rendYp","pctS")}</small>`)}
   ${kv("Imposta stimata se vendessi oggi <small>26% sui guadagni</small>",out("dash.taxLat","eur","tax"))}${kv("IVAFE annua stimata <small>0,2% sul valore ETF</small>",out("dash.ivafe","eur","tax"))}</dl>`,
  rie:()=>Y===R.PY?`<dl class="kv">${kv("Tasse ancora da pagare",out("dash.tasseAll","eur","tax"))}${kv("Netto dopo le tasse",out("dash.patrNall","eur","gain"),"strong")}${kv("Variazione netto ultimo mese",out("dash.kdLast","sign"))}</dl>`:""}[vw];
 return `${open}<h3>${cfg[0]} <small>a fine ${MESI[L].toLowerCase()} ${Y}</small></h3>
  <div class="ppie-in"><svg viewBox="0 0 ${sz} ${sz}" width="${sz}" height="${sz}" role="img" aria-label="${cfg[0]}"><defs><pattern id="${hid}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="var(--c-liq)"/><rect width="3.2" height="6" fill="var(--c-tasse)"/></pattern></defs><circle cx="${sz/2}" cy="${sz/2}" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="${sw}"/>${arcs}
   <text x="50%" y="${sz/2-2}" text-anchor="middle" class="pc1" style="font-size:16px">${tot?fmt(tot).replace(/,\d\d(?=\s|$)/,""):"—"}</text><text x="50%" y="${sz/2+15}" text-anchor="middle" class="pc2">totale</text></svg>
  <div class="pside"><ul class="pleg">${cfg[1]().map(([l,v,c])=>`<li><i style="${c==="taxh"?"background:repeating-linear-gradient(45deg,var(--c-tasse) 0 2.5px,var(--c-liq) 2.5px 5px)":`background:var(--${c})`}"></i><span>${l}</span><b>${fmt(v)}</b><em>${pc(v)}</em></li>`).join("")}</ul>${extra?extra():""}</div></div>${close}`;}
V.patrimonio=()=>{
 const Y=UY;
 if(!S.patrimonio[Y])return `<section class="sheet"><div class="sheet-h"><h2>Tracking patrimoniale</h2>${yearBar()}</div>
  <div class="banner">Nessuna tabella patrimonio per il ${Y}. <button class="btn" data-act="newpy" data-y="${Y}" ${READONLY?"disabled":""}>Crea il ${Y}</button></div></section>`;
 const o=`patr.${Y}`,B=i=>`patrimonio.${Y}.${i}`;
 const tbl=(head,cells,tot)=>`<div class="tbl-wrap flat"><table class="pt" style="min-width:${110+head.length*118}px"><thead><tr><th>Mese</th>${head.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${MESI.map((m,i)=>`<tr><td>${m}</td>${cells(i).map(c=>`<td>${c}</td>`).join("")}</tr>`).join("")}${tot?`<tr class="tot"><td>${tot[0]}</td>${tot.slice(1).map(c=>`<td>${c}</td>`).join("")}</tr>`:""}</tbody></table></div>`;
 if(!["liq","inv","rie"].includes(PT))PT="liq";
 
 
 const cy=[...new Set([...yearsOf(S.chiusure),Y-1])].sort((a,b)=>a-b);
 const tabs=[["liq","Liquidità"],["inv","Investimenti"],["rie","Riepilogo"]];
 const body={
  liq:()=>`<div class="box"><h3>Saldi dei conti mese per mese</h3><p class="note">Saldo all'ultimo giorno del mese. Dai mesi con estratto conto i saldi si riempiono da soli («estratto»): Revolut = conto + deposito; Fineco = conto + conto deposito vincolato qui sotto. Fineco si ricava per ogni mese coperto da un estratto, anche se il file copre più mesi o finisce a metà mese (saldo finale del file meno i movimenti successivi).</p>
   <details class="more" ${(S.vincolato.fineco||[]).length?"":"open"}><summary>Conto deposito vincolato Fineco${(S.vincolato.fineco||[]).length?" · ora "+fmt(vincAt("9999-12")):""}</summary>
    <p class="note">Non compare nell'estratto: va sommato al conto. Indica l'importo e da quale mese vale; se cambia (rinnovo con importo diverso, scadenza senza rinnovo = 0) aggiungi una variazione: i mesi precedenti non cambiano.</p>
    <div class="vinc">${(S.vincolato.fineco||[]).map((r,i)=>`<div class="vinc-r"><span>dal ${MESE_L(r.da).toLowerCase()}</span><b>${fmt(r.importo)}</b><button class="icon-btn" data-act="vinc-del" data-vi="${i}" aria-label="Togli" ${READONLY?"disabled":""}>×</button></div>`).join("")}
    ${READONLY?"":`<div class="vinc-f"><input class="in" type="month" id="vinc-da" value="${(S.patEstr||[])[0]||new Date().toLocaleDateString("sv-SE").slice(0,7)}" aria-label="Dal mese"><input class="in" id="vinc-v" inputmode="decimal" placeholder="Importo €" aria-label="Importo"><button class="btn sm" data-act="vinc-add">Aggiungi</button></div>`}</div></details>
   ${!(S.vincolato.fineco||[]).length&&(S.patEstr||[]).length?`<p class="note neg">Indica il vincolato (anche 0) per far riempire Fineco dagli estratti.</p>`:vincWarn()}
   ${tbl(["Fineco","Revolut","Totale","Variazione"],i=>[estCell(Y,i,"fineco",B(i)+".fineco"),estCell(Y,i,"revolut",B(i)+".revolut"),out(`${o}.D.${i}`,"eur","b zd"),out(`${o}.E.${i}`,"sign","zd")])}</div>
  <div class="box c-good"><h3>Valori di fine anno</h3><dl class="kv">
   ${cy.map(y=>kv(`Fine ${y}`+(R.chiusure[y]&&R.chiusure[y].d!=null?` <small class="${R.chiusure[y].d>=0?"pos":"neg"}">${fmt(R.chiusure[y].d,"sign")} sull'anno prima</small>`:""),inp(`chiusure.${y}`))+kv(`&nbsp;&nbsp;Investimenti a fine ${y} <small>fondo + ETF</small>`,inp(`chiusureInv.${y}`))).join("")}</dl>
   <p class="note">Liquidità (Fineco + Revolut) e investimenti a fine anno: servono come punto di partenza per la variazione annuale (Andamento › variazione del patrimonio). Se lasci vuoto un valore di fine anno precedente, viene usato dicembre della tabella di quell'anno.</p></div>`,
  inv:()=>`<div class="grid">
  <div class="box c-fondo"><h3>Fondo Fineco</h3>
   <div class="ibig"><span>Guadagno / perdita</span><b>${out("dash.plusF","sign")}</b><em>${out("dash.plusFp","pctS")}</em></div>
   <dl class="kv">${kv("Valore attuale",out("dash.fondo"))}${kv("Capitale investito <small>acquisto una tantum</small>",inp("fondo.capitale"))}
   ${kv(`Rendimento ${Y}`,`${out("dash.rendYF","sign")} <small class="muted">${out("dash.rendYFp","pctS")}</small>`)}</dl>
   <details class="more"><summary>Acquisti e riscatti (${S.fondoMov.length})</summary>
   <div class="tbl-wrap flat"><table class="fm"><tbody>${S.fondoMov.map((t,i)=>fmCovers(i)?`<tr class="extrow"><td>${dIt(t.data)}</td><td>${t.tipo==="riscatto"?"Riscatto":"Acquisto"}</td><td><span class="est-c">${fmt(t.importo)}<span class="nm">estratto</span></span></td><td class="c muted" title="${esc(t.nota||"")}">↔</td></tr>`:`<tr><td>${inpT(`fondoMov.${i}.data`,"date")}</td><td><select class="in sel" id="${idOf("fondoMov."+i+".tipo")}" data-i="fondoMov.${i}.tipo" data-k="sel"><option value="acquisto">Acquisto</option><option value="riscatto">Riscatto</option></select></td><td>${inp(`fondoMov.${i}.importo`)}</td><td class="c"><button class="icon-btn" data-act="del-fm" data-idx="${i}" aria-label="Elimina" ${READONLY?"disabled":""}>×</button></td></tr>`).join("")||`<tr><td class="muted">Nessun movimento.</td></tr>`}</tbody></table></div>
   <div class="actions"><button class="btn ghost" data-act="add-fm" ${READONLY?"disabled":""}>+ Aggiungi acquisto o riscatto</button></div>
   <p class="note">Servono a non scambiare per guadagno i soldi che entrano o escono dal fondo. Quelli segnati «estratto» arrivano dall'estratto Fineco (categoria Investimenti): data e importo reali.</p></details>
   <p class="note">Regime amministrato: le tasse le trattiene Fineco alla vendita.</p></div>
  <div class="box c-etf"><h3>ETF Revolut (PAC)</h3>
   <div class="ibig"><span>Guadagno / perdita</span><b>${out("dash.plusE","sign")}</b><em>${out("dash.plusEp","pctS")}</em></div>
   <dl class="kv">${kv("Valore attuale",out("dash.etf"))}${kv("Totale versato <small>somma della colonna ETF · versato</small>",out("dash.versE"))}
   ${kv(`Rendimento ${Y}`,`${out("dash.rendYE","sign")} <small class="muted">${out("dash.rendYEp","pctS")}</small>`)}
   ${kv("Versato prima del primo anno in tabella <small>0 se il PAC parte in tabella</small>",inp("etfBase"))}</dl>
   <p class="note">Regime dichiarativo: quadro RW e IVAFE; plusvalenze nel quadro RM (26%), minusvalenze nel quadro RT.</p></div>
  </div>
  <div class="box"><h3>Valori mese per mese</h3><p class="note">Valore a fine mese di fondo ed ETF, e quanto hai versato nell'ETF nel mese. Il rendimento è la variazione di valore meno i soldi aggiunti.</p>
   ${tbl(["Fondo Fineco · valore","ETF · valore","ETF · versato","Totale","Rendimento"],i=>[inp(B(i)+".fondo"),inp(B(i)+".etf"),etfCovers(Y,i)?`<span class="est-c" title="Versamenti «Al conto di investimento» nell'estratto Revolut">${fmt(getP(S,B(i)+".vEtf"))}<span class="nm">estratto</span></span>`:inp(B(i)+".vEtf"),out(`${o}.H.${i}`,"eur","b"),out(`${o}.Rend.${i}`,"sign")],
     ["Totale anno","","","",`<span class="muted">attuale</span> ${out(`${o}.lastH`,"eur","b")}`,out(`${o}.rendY`,"sign","b")])}</div>`,
  rie:()=>`<div class="box"><h3>Patrimonio mese per mese</h3><p class="note">Solo calcoli: liquidità + investimenti − tasse ancora da pagare in quel mese (dallo Scadenzario).</p>
   ${tbl(["Liquidità","Investimenti","Patrimonio lordo","Tasse da pagare","Patrimonio netto","Variazione netto"],i=>[out(`${o}.D.${i}`,"eur","zd"),out(`${o}.H.${i}`),out(`${o}.I.${i}`,"eur","zd"),out(`${o}.F.${i}`,"eur","tax zd"),out(`${o}.K.${i}`,"eur","gain b zd"),out(`${o}.Kd.${i}`,"sign")])}</div>`};
 return `<section class="sheet">
 <div class="sheet-h"><h2>Patrimonio ${Y}</h2>${yearBar()}</div>
 <div class="seg pseg" role="tablist">${tabs.map(([k,l])=>`<button class="segb" role="tab" data-act="pt" data-v="${k}" aria-selected="${k===PT}">${l}</button>`).join("")}</div>
 ${patPie(Y)}
 ${body[PT]()}
</section>`;

};

const cellEntries=(Y,m,k)=>{const pref=`${Y}-${String(m+1).padStart(2,"0")}`;return S.registro.map((r,i)=>i).filter(i=>S.registro[i].fonte===k&&S.registro[i].data.startsWith(pref));};
const cellInp=(Y,m,k)=>`<input class="in cell" id="cell-${Y}-${m}-${k}" data-i="cell" data-k="cell" data-y="${Y}" data-m="${m}" data-f="${k}" inputmode="decimal" autocomplete="off" placeholder="—" aria-label="${FN[k]} ${MESI[m]} ${Y}">`;
/* v40/v41: medie mensili per categoria (dai movimenti dei conti) dell'anno Y: mesi conclusi con estratti; se non ce ne sono,
   anche il mese in corso. v41: toccando una ciambella si apre sotto la tabella mese per mese di quella parte (AVG_T). */
const AVG_T=new Set();
function avgCatBox(Y){const all=movMesi().filter(ym=>ym.slice(0,4)===String(Y));if(!all.length)return "";
 const cur=TODAY.slice(0,7),M=all.filter(ym=>ym<cur).length?all.filter(ym=>ym<cur):all,n=M.length,inM=new Set(M);
 const EK=[["stipendio","Stipendio","c-ent"],["sond","Sondaggi","c-etf"],["extra","Entrate extra","c-liq"],["ppx","Extra via PayPal","c-rev"]];
 const UK=[...MOV_CAT.filter(c=>c[2]==="u"&&!(S.straordNoMedia&&c[0]==="straord")).map(([k,l])=>[k,l,MOV_COL[k]]),["amz","Acquisti con buoni Amazon",MOV_COL.amz]];
 const per={};all.forEach(ym=>{const N=movNetto(ym),o=N.o;
  per[ym]={e:{stipendio:Math.max(o.stipendio||0,0),sond:N.sv.tot,extra:Math.max(o.extra||0,0),ppx:N.ppx},
   u:Object.fromEntries(UK.map(([k])=>[k,k==="amz"?(N.amz||0):Math.max(-N.net[k],0)]))};});
 const avg=(t,K)=>K.map(([k,l,c])=>[l,sum(M.map(ym=>per[ym][t][k]))/n,c,k]).filter(x=>x[1]>0.005).sort((a,b)=>b[1]-a[1]);
 const e=avg("e",EK),u=avg("u",UK),tE=sum(e.map(x=>x[1])),tU=sum(u.map(x=>x[1]));
 const lbl=n===1?MESI[+M[0].slice(5)-1].toLowerCase():`${MESI[+M[0].slice(5)-1].slice(0,3).toLowerCase()}–${MESI[+M[n-1].slice(5)-1].slice(0,3).toLowerCase()}`;
 const f0=v=>Math.abs(v)<0.005?`<span class="muted">—</span>`:fN0.format(Math.round(v));
 const tbl=(t,K,tit)=>{const cols=K.filter(([k])=>all.some(ym=>per[ym][t][k]>0.005));if(!cols.length)return `<p class="muted">Nessun movimento.</p>`;
  const rt=ym=>sum(cols.map(([k])=>per[ym][t][k]));
  const rows=all.map(ym=>{const m=+ym.slice(5)-1;return `<tr${inM.has(ym)?"":` class="nod-r"`}><td>${mLbl(m)}${inM.has(ym)?"":' <small class="muted">in corso</small>'}</td>${cols.map(([k])=>`<td>${f0(per[ym][t][k])}</td>`).join("")}<td><b>${f0(rt(ym))}</b></td></tr>`;}).join("");
  const tot=`<tr class="tot"><td>Totale<small class="yr"> ${Y}</small></td>${cols.map(([k])=>`<td>${f0(sum(all.map(ym=>per[ym][t][k])))}</td>`).join("")}<td>${f0(sum(all.map(rt)))}</td></tr>`;
  const med=`<tr class="avg"><td>Media<span class="mfull"> mensile</span> <small>${n} ${n===1?"mese":"mesi"}</small></td>${cols.map(([k])=>`<td>${f0(sum(M.map(ym=>per[ym][t][k]))/n)}</td>`).join("")}<td>${f0(sum(M.map(rt))/n)}</td></tr>`;
  return `<div class="tbl-wrap flat"><table class="sv2 avgt" style="min-width:${110+(cols.length+1)*92}px" aria-label="${tit} mese per mese ${Y}"><thead><tr><th>Mese</th>${cols.map(([k,l,c])=>`<th><i class="sw" style="background:var(--${c})"></i>${l}</th>`).join("")}<th>Totale</th></tr></thead><tbody>${rows}</tbody><tfoot>${tot}${med}</tfoot></table></div>`;};
 const card=(v,t,arr,tot,lab)=>{const op=AVG_T.has(v);return `<div class="box mvpie avg-c${op?" open":""}" data-act="avgt" data-v="${v}" role="button" tabindex="0" aria-expanded="${op}" title="Tocca per la tabella mese per mese"><h3>${t} <small>media mensile</small><span class="chev" aria-hidden="true">›</span></h3><div class="mvpie-in">${donut(arr,150,18,t+" · media mensile "+Y,1,tot,lab)}<ul class="pleg">${arr.map(([l,v,c])=>li(c,l,v,tot)).join("")||`<li><span class="muted">Nessun dato</span></li>`}</ul></div></div>`;};
 const pan=(v,t,K,extra)=>`<div class="box avg-p" data-p="${v}" ${AVG_T.has(v)?"":"hidden"}><h3>${t} mese per mese · ${Y} <small>dagli estratti conto, €</small></h3>${tbl(v,K,t)}${extra||""}</div>`;
 return `<div class="box" id="avg-box"><h3>Medie mensili per categoria · ${Y} <small>${lbl} · ${n} ${n===1?"mese":"mesi"} dai conti</small></h3>
  <div class="grid mvpies avg-g">${card("e","Entrate",e,tE,"entrate")}
  ${pan("e","Entrate",EK,`<p class="note">Sondaggi = prelievi dall'app Guadagni. Per registrare o correggere le entrate: <a href="#entrate" data-act="go" data-tab="entrate" data-uy="${Y}">scheda Entrate ›</a></p>`)}
  ${card("u","Uscite",u,tU,"uscite nette")}
  ${pan("u","Uscite",UK,`<p class="note">Uscite al netto dei rimborsi delle spese condivise (ripartizione per categoria stimata)${S.straordNoMedia?"; spese straordinarie escluse (riquadro «Spese straordinarie»)":""}. Per i singoli movimenti: Resoconto mensile.</p>`)}</div>
  <p class="note">Ciambelle: media dei movimenti degli estratti conto dei mesi conclusi del ${Y}${n&&M.length<all.length?" (escluso il mese in corso)":""}; tocca una ciambella per il dettaglio mese per mese. Possono differire dalle entrate registrate e dalle uscite calcolate dai saldi nel grafico sopra.</p></div>`;}
V.risparmio=()=>{const PY=R.PY;return `<section class="sheet">
 <div class="sheet-h"><h2>Andamento ${PY}</h2><p>Entrate, uscite e surplus del ${PY} mese per mese: il surplus è la variazione della liquidità più i soldi investiti.</p></div>
  <div class="box" id="es-box"><h3>Entrate e uscite mese per mese · ${PY} <small>${R.sv&&R.sv.yaLbl||""}</small></h3>
   <div id="eschart"></div>
   ${andLeg()}
   <p class="note">Per ogni mese: a sinistra le entrate registrate (tratteggiata in cima la parte da mettere da parte per le tasse maturate sulle entrate di quel mese: 1/12 della Quota A + Quota B e imposta sostitutiva), a destra le uscite (tutto il resto + affitto e utenze + tasse pagate). Uscite = entrate − surplus; affitto e utenze dalla categoria «Casa e utenze» degli estratti conto (netta dei rimborsi), nei mesi senza estratto l'affitto delle spese fisse. Tocca una barra per i valori. Barre chiare tratteggiate = mesi stimati (dettaglio nel Resoconto mensile, scegliendo il mese «stima»). Compaiono solo i mesi con i saldi di inizio e fine mese in Patrimonio; i totali sono su questi mesi. Variazione del patrimonio = liquidità + investimenti dell'ultimo mese − valori di fine ${PY-1} (Patrimonio › Valori di fine anno).</p></div>
  ${avgCatBox(PY)}
  ${strBox(PY)}
  <div class="box" id="sv-box"><h3>Riepilogo mese per mese · ${PY}</h3>
   ${svTable()}
   <p class="note">Risparmio = variazione della liquidità + versamenti negli investimenti. Altre spese (di vita) = entrate − risparmio − tasse − spese fisse del mese. Le entrate sono quelle registrate (libera professione al lordo, stipendio e sondaggi al netto): un mese con entrate non registrate o rimborsi fa sembrare le spese più basse. Leggi la media, non il singolo mese. Da accantonare per tasse = 1/12 della Quota A + Quota B e imposta sostitutiva maturate sulle entrate del mese; risparmio netto = risparmio + tasse pagate nel mese − tasse da accantonare.</p>
  </div>
</section>`;};

/* ================= v51: proiezione dei prossimi mesi (scelta di Marco: entrate e uscite, tredicesima stimata) =================
   Entrate: stipendio netto «fisso» dall'ultimo cedolino (netto − parte netta di guardie e aggiuntiva di quel cedolino),
   + guardie e aggiuntiva «in arrivo» dai cartellini (pagate due mesi dopo; se il cartellino non c'è ancora: media delle
   ore degli ultimi 3 cartellini), portate a netto: guardie − contributi (aliquota letta dal cedolino) − IRPEF allo
   scaglione marginale stimato sull'imponibile dell'anno; aggiuntiva − 15% (imposta sostitutiva, come sul cedolino);
   a dicembre la tredicesima ≈ voci fisse × mesi di servizio / 12 (mese con almeno 15 giorni = mese intero), stessa
   trattazione delle guardie; sondaggi = media degli ultimi 3 mesi (o il prelevato del mese, se più alto).
   Se per il mese c'è già il cedolino (riga «ssn» in Entrate) si usano le entrate registrate.
   Uscite: voci dello Scadenzario con scadenza nel mese (tasse e spese fisse, anche già pagate) + spese variabili =
   media degli ultimi 3 mesi con resoconto delle «spese di vita» senza le straordinarie. Surplus = entrate − uscite.
   Non entrano: addizionali IRPEF dell'anno prima trattenute nell'anno dopo, conguaglio di fine anno, restituzioni dei prestiti. */
const IRPEF_SC=[[28000,.23],[50000,.33],[Infinity,.43]];
const irpefMarg=x=>(IRPEF_SC.find(([l])=>x<l)||IRPEF_SC[2])[1];
const p2=n_=>String(n_).padStart(2,"0");
/* v58: parametri dei cedolini verificati, condivisi da proj() e dalla sezione Lavoro (netto stimato di guardie e aggiuntiva) */
let CEDP={r:undefined,v:null};
function cedParams(){if(CEDP.r===S.ced&&CEDP.v)return CEDP.v;
 const ced=(S.ced?S.ced.lista:[]).filter(c=>c.controllo&&c.controllo.ok).sort((a,b)=>a.periodo.localeCompare(b.periodo)),cl=ced[ced.length-1];
 const comp=(c,f)=>sum(c.voci.filter(v=>v.categoria==="competenza"&&f(v)).map(v=>+v.importo||0)),cat=(c,k)=>sum(c.voci.filter(v=>v.categoria===k).map(v=>+v.importo||0));
 let F=0,cR=0,netFix=null;const impY={};
 ced.forEach(c=>{const Y=(c.dataPagamento||c.periodo).slice(0,4);impY[Y]=(impY[Y]||0)+comp(c,v=>v.tipo!=="prestazioni_aggiuntive")-cat(c,"inps");});
 if(cl){F=comp(cl,v=>v.tipo==="fissa");const V=comp(cl,v=>v.tipo==="variabile"||v.tipo==="una_tantum"),P=comp(cl,v=>v.tipo==="prestazioni_aggiuntive");
  cR=F+V>0?cat(cl,"inps")/(F+V):0;const net=num(cl.netto)??num((cl.intestazione||{}).netto);
  const m0=irpefMarg(impY[(cl.dataPagamento||cl.periodo).slice(0,4)]||0);
  if(net!=null)netFix=net-V*(1-cR)*(1-m0)-(P-cat(cl,"sostitutiva"));}
 const ass=(ced.find(c=>c.dataAssunzione)||{}).dataAssunzione||"";
 CEDP={r:S.ced,v:{ced,cl,F,cR,netFix,impY,ass,ok:!!cl}};return CEDP.v;}
/* netto stimato di un compenso del cartellino pagato nel mese ymPag: guardia − contributi − IRPEF allo scaglione
   marginale dell'imponibile dell'anno da cedolini; aggiuntiva − 15% di imposta sostitutiva. null senza cedolini. */
function lavNetto(tipo,lordo,ymPag){const P=cedParams();if(!P.ok||!(lordo>0))return tipo==="aggiuntiva"&&lordo>0?lordo*0.85:null;
 if(tipo==="aggiuntiva")return lordo*0.85;const m=irpefMarg(P.impY[(ymPag||TODAY).slice(0,4)]||0);return lordo*(1-P.cR)*(1-m);}
let PROJ={r:null,v:null};
function proj(){if(PROJ.r===R)return PROJ.v;PROJ.r=R;PROJ.v=null;
 let last=null;Object.keys(R.svAll||{}).sort().forEach(Y=>R.svAll[Y].risp.forEach((v,i)=>{if(v!=null)last=`${Y}-${p2(i+1)}`;}));
 if(!last)return null;
 const {F,cR,netFix,impY,ass}=cedParams();
 const CP=cartPagamenti(),cart=(S.cart?S.cart.lista:[]).slice().sort((a,b)=>a.periodo.localeCompare(b.periodo)),c3=cart.slice(-3),lastCart=cart.length?cart[cart.length-1].periodo:"";
 const avgH=k=>c3.length?sum(c3.map(c=>k==="g"?(c.tz.notte.mese+c.tz.fest.mese)/60:c.agg/60))/c3.length:0;
 /* spese variabili: ultimi 3 mesi con resoconto, senza straordinarie */
 const pool=[];Object.keys(R.svAll).sort().forEach(Y=>R.svAll[Y].risp.forEach((v,i)=>{if(v!=null)pool.push({Y,i,ym:`${Y}-${p2(i+1)}`});}));
 const l3=pool.slice(-3),strM=ym=>{try{return movMesi().includes(ym)?Math.max(-movNetto(ym).net.straord,0):0;}catch(_){return 0;}};
 const vari=l3.length?sum(l3.map(q=>Math.max(n(R.svAll[q.Y].spese[q.i])-strM(q.ym),0)))/l3.length:0;
 const sondM=ym=>sum(S.registro.filter(r=>r.fonte==="sond"&&r.data.startsWith(ym)).map(r=>+r.importo||0));
 const sond3=l3.length?sum(l3.map(q=>sondM(q.ym)))/l3.length:0;
 const cur=TODAY.slice(0,7),mesi=[];let ym=ymAdd(last,1);
 while(mesi.length<6&&(mesi.length<3||ym<=ymAdd(cur,2))){mesi.push(ym);ym=ymAdd(ym,1);}
 const cum={};const rows0=R.deb.rows;
 const out=mesi.map(ym=>{const Y=ym.slice(0,4),mo=+ym.slice(5);if(cum[Y]==null)cum[Y]=impY[Y]||0;
  const reg=S.registro.filter(r=>r.data.startsWith(ym)&&IN_TOT(r.fonte)),hasCed=reg.some(r=>r.fonte==="ssn");
  const E=[],U=[],avv=[];
  if(hasCed){E.push(["Stipendio (cedolino)",sum(reg.filter(r=>r.fonte==="ssn").map(r=>+r.importo||0)),"dal cedolino"]);cum[Y]+=F*(1-cR);}
  else if(netFix!=null){E.push(["Stipendio netto",netFix,"stima dall'ultimo cedolino"]);cum[Y]+=F*(1-cR);
   const arr=CP.righe.filter(r=>r.stato==="attesa"&&r.atteso===ym&&r.stima!=null),ref=ymAdd(ym,-2),noCart=ref>lastCart;
   const add=(tipo,lordo,lbl)=>{if(!(lordo>0))return;if(tipo==="guardia"){const imp=lordo*(1-cR),m=irpefMarg(cum[Y]);cum[Y]+=imp;E.push(["Guardie",imp*(1-m),lbl+` · lordo ${fmt(lordo)}, IRPEF ${Math.round(m*100)}%`]);}
    else E.push(["Attività aggiuntiva",lordo*0.85,lbl+` · lordo ${fmt(lordo)}, sostitutiva 15%`]);};
   const pt=noCart?pianoMese(ref):null;
   if(arr.length)arr.forEach(r=>add(r.tipo,r.stima,`${MESI[+r.periodo.slice(5)-1].toLowerCase()}: ${hmF(r.ore)} h`));
   else if(pt&&pt.lav){const mr=MESI[+ref.slice(5)-1].toLowerCase();add("guardia",pt.oreG*(CP.tG||0),`piano turni di ${mr}: ${hmF(pt.oreG)} h`);add("aggiuntiva",pt.a*(CP.tA||0),`piano turni di ${mr}: ${hmF(pt.a)} h`);}
   else if(noCart&&c3.length){add("guardia",avgH("g")*(CP.tG||0),`media ultimi ${c3.length} mesi`);add("aggiuntiva",avgH("a")*(CP.tA||0),`media ultimi ${c3.length} mesi`);}
   if(mo===12&&F>0){let k=12;if(ass.slice(0,4)===Y){const am=+ass.slice(5,7),ad=+ass.slice(8,10),dim=new Date(+Y,am,0).getDate();k=12-am+(dim-ad+1>=15?1:0);}
    const lordo=F*k/12,imp=lordo*(1-cR),m=irpefMarg(cum[Y]);cum[Y]+=imp;E.push(["Tredicesima",imp*(1-m),`${k}/12 delle voci fisse (${fmt(F)}) · lordo ${fmt(lordo)}, IRPEF ${Math.round(m*100)}%`]);
    avv.push("Dicembre: il conguaglio IRPEF di fine anno può cambiare il netto (in più o in meno).");}
   if(mo===1)avv.push(`Da gennaio si trattengono anche le addizionali regionale e comunale del ${+Y-1}: non stimate.`);}
  const sA=sondM(ym),sv_=Math.max(sA,sond3);if(sv_>0.5)E.push(["Sondaggi",sv_,sA>=sond3?"prelevato nel mese":"media ultimi 3 mesi"]);
  const altre=sum(reg.filter(r=>!["ssn","sond"].includes(r.fonte)).map(r=>+r.importo||0));if(altre>0.5)E.push(["Altre entrate registrate",altre,""]);
  const pm=prestMese(ym);if(pm.rst>0.005)E.push(["Restituzioni prestiti",pm.rst,"segnate in Prestiti"]);
  let tas=0,fis=0,aff=0;S.scadenzario.forEach((r,i)=>{if(!PDt(r).startsWith(ym))return;const v=n(rows0[i]&&rows0[i].imp);if(!(v>0))return;
   const f=tipoOf(r)!=="spesa";if(f)tas+=v;else{fis+=v;if(/affitt/i.test(r.voce||""))aff+=v;}U.push([r.voce||"(senza nome)",v,f?"tasse":"fisse"]);});
  U.push(["Spese variabili (media)",vari,"vari"]);
  (S.prestiti||[]).filter(p=>p.data.startsWith(ym)).forEach(p=>U.push([`Prestito a ${p.chi}`,p.importo,"prest"]));
  const ent=sum(E.map(x=>x[1])),usc=tas+fis+vari+pm.prest;
  return{ym,E,U,ent,usc,tas,fis,aff,vari,prest:pm.prest,rst:pm.rst,sur:ent-usc,avv,hasCed};});
 PROJ.v={mesi:out,last,l3:l3.map(q=>q.ym),cR,netFix,F};return PROJ.v;}
function projBox(ym){const P=proj();if(!P||!P.mesi.length)return "";
 const L=P.mesi.filter(x=>x.ym===ym),ml=ym=>`${MESI[+ym.slice(5)-1]} ${ym.slice(0,4)}`;
 const card=x=>`<div class="pj-c"><h4>${ml(x.ym)} <small>stima</small></h4>
  <ul class="pleg">${x.E.map(([l,v,i])=>`<li><i style="background:var(--c-ent)"></i><span>${l}${i?` <small>${esc(i)}</small>`:""}</span><b class="nt-ent">${fmt(v)}</b><em></em></li>`).join("")}
  <li class="pj-t"><span>Entrate</span><b class="nt-ent">${fmt(x.ent)}</b></li>
  ${x.U.map(([l,v,k])=>`<li><i style="background:var(--${k==="tasse"?"c-tasse":k==="fisse"?"c-aff":k==="prest"?"qa":"c-spese"})"></i><span>${esc(l)}</span><b class="nt-${k==="tasse"?"tasse":"spese"}">${fmt(v)}</b><em></em></li>`).join("")}
  <li class="pj-t"><span>Uscite</span><b class="nt-spese">${fmt(x.usc)}</b></li></ul>
  <dl class="kv">${kv("Surplus previsto <small>entrate − uscite</small>",`<span class="${x.sur<0?"neg":"pos"}">${fmt(x.sur,"sign")}</span>`,"strong")}</dl>
  ${x.avv.map(a=>`<p class="note">${a}</p>`).join("")}</div>`;
 const tot=sum(L.map(x=>x.sur));
 if(!L.length)return "";
 return `<div class="box" id="pj-box"><h3>Dettaglio della stima <small>${ml(ym).toLowerCase()} · surplus previsto ${fmt(tot,"sign")}</small></h3>
  <div class="pj-g">${L.map(card).join("")}</div>
  <details class="more"><summary>Come è calcolata</summary><p class="note">Stima, non dati reali: i mesi stimati sono chiari e tratteggiati qui e nel grafico dell'Andamento. Diventano reali quando ci sono i saldi di fine mese in Patrimonio. <b>Stipendio</b>: netto dell'ultimo cedolino senza la parte di guardie e aggiuntiva (${P.netFix!=null?fmt(P.netFix):"—"}); se il cedolino del mese è già arrivato si usa quello. <b>Guardie e aggiuntiva</b>: ore dei cartellini pagate due mesi dopo, alla tariffa dell'ultimo cedolino (se il cartellino non c'è ancora, le ore del piano in Lavoro › Turni); guardie al netto dei contributi (${fmt(P.cR,"pct1")}) e dell'IRPEF allo scaglione stimato (23/33/43%, senza detrazioni); aggiuntiva al netto dell'imposta sostitutiva del 15%; senza cartellino né piano, media delle ore degli ultimi 3 mesi. <b>Tredicesima</b> (dicembre): voci fisse × mesi di servizio / 12. <b>Sondaggi</b>: media degli ultimi 3 mesi. <b>Uscite</b>: tasse e spese fisse in scadenza nello Scadenzario + spese variabili = media delle spese di vita di ${P.l3.map(ym=>MESI[+ym.slice(5)-1].slice(0,3).toLowerCase()).join(", ")} senza le spese straordinarie. <b>Prestiti</b>: quelli datati nel mese sono uscite, le restituzioni segnate con una data futura sono entrate. Non entrano: addizionali IRPEF dell'anno prima, conguaglio di fine anno, investimenti.</p></details></div>`;}
/* ================= v51: spese straordinarie con nota ================= */
const movNota=id=>(S.movNote||{})[id]||"";
function strBox(Y){const d=movLoad();if(!d)return "";const AB=movAbb(),PR=movPrest();
 const L=d.movimenti.filter(m=>m.cat==="straord"&&m.data.startsWith(Y+"-")&&!AB[m.id]&&!PR[m.id]).sort((a,b)=>a.data.localeCompare(b.data));
 const rows=L.map(m=>`<tr><td>${dIt(m.data).slice(0,5)}</td><td><b>${esc(m.descr||m.tipo)}</b><br><small class="muted">${esc(m.conto)}</small></td><td><input class="in mv-note" data-id="${m.id}" value="${esc(movNota(m.id))}" maxlength="140" placeholder="a cosa è servita…" aria-label="A cosa è servita" ${READONLY?"disabled":""}></td><td class="${m.importo<0?"nt-spese":"nt-ent"}">${fmt(m.importo,"sign")}</td></tr>`).join("");
 return `<div class="box" id="str-box"><h3>Spese straordinarie · ${Y} <small>${L.length?"netto "+fmt(-sum(L.map(m=>m.importo))):"nessuna"}</small></h3>
  ${L.length?`<div class="tbl-wrap flat"><table class="str-t"><thead><tr><th>Data</th><th>Movimento</th><th>A cosa è servita</th><th>Importo</th></tr></thead><tbody>${rows}</tbody></table></div>`:`<p class="muted">Nessun movimento nella categoria «Spese straordinarie» nel ${Y}.</p>`}
  <label class="str-nm"><input type="checkbox" id="str-nomedia" ${S.straordNoMedia?"checked":""} ${READONLY?"disabled":""}> Escludi le spese straordinarie dalle medie mensili delle uscite</label>
  <p class="note">Per segnare una spesa come straordinaria scegli la categoria «Spese straordinarie» sul movimento (Resoconto mensile). La nota resta su questo dispositivo e nei backup. La proiezione dei prossimi mesi non le conta mai.</p></div>`;}
/* ================= v51: prestiti (scelta di Marco: credito da incassare) =================
   S.prestiti [{id,chi,data,importo,nota,mov,rest:[{id,data,importo,mov}],no:[id movimenti scartati]}].
   Il prestito non è una spesa e le restituzioni non sono entrate: i movimenti collegati escono dai conteggi per
   categoria (come gli abbinamenti rimborso ↔ acquisto) e il surplus del mese tiene conto della variazione del credito
   (risp = Δ liquidità + investito + Δ crediti). In Patrimonio il residuo compare come «Prestiti da incassare». */
function movPrest(){const M=memo();if(M.prest)return M.prest;const o={};(S.prestiti||[]).forEach(p=>{if(p.mov)o[p.mov]={p:p.id,t:"dato",chi:p.chi};(p.rest||[]).forEach(r=>{if(r.mov)o[r.mov]={p:p.id,t:"rest",chi:p.chi};});});M.prest=o;return o;}
const prRes=p=>Math.max(p.importo-sum((p.rest||[]).map(r=>r.importo)),0);
const prTok=p=>String(p.chi||"").toLowerCase().split(/[^a-zà-ù0-9]+/).filter(w=>w.length>=3);
let PR_OPEN=null,PR_BOX=false,SP_OPEN=false,SC_OPEN=false;
/* v52: un prestito è «attivo» dal mese in cui è dato fino al mese in cui è restituito tutto (incluso): solo in quei mesi
   compare come barra orizzontale nel Resoconto (restituito / totale, in euro e %). */
const prRestAt=(p,ym)=>sum((p.rest||[]).filter(r=>r.data.slice(0,7)<=ym).map(r=>r.importo));
const prChiuso=p=>{let c=0;for(const r of (p.rest||[]).slice().sort((a,b)=>a.data.localeCompare(b.data))){c+=r.importo;if(c>=p.importo-0.005)return r.data.slice(0,7);}return null;};
const prAttivi=ym=>(S.prestiti||[]).filter(p=>p.data.slice(0,7)<=ym&&(!prChiuso(p)||prChiuso(p)>=ym));
function loanRows(ym,top){return prAttivi(ym).map(p=>{const r=Math.min(prRestAt(p,ym),p.importo),pc=p.importo>0?r/p.importo:0,pm=v=>(Math.max(v,0)/top*100).toFixed(2)+"%";
 const dato=p.data.startsWith(ym),rm=sum((p.rest||[]).filter(x=>x.data.startsWith(ym)).map(x=>x.importo)),fin=r>=p.importo-0.005;
 return `<div class="mhb-r mhb-pr"><div class="mhb-t"><span>Prestito a ${esc(p.chi)} <small>${dato?"dato questo mese":"dal "+dIt(p.data)}</small></span><b>${fmt(r)} di ${fmt(p.importo)} · ${Math.round(pc*100)}%</b></div>
  <div class="mhb-bar"><i class="mc-prr" style="width:${pm(r)}" title="Restituito: ${fmt(r)}"></i><i class="mc-pr" style="width:${pm(p.importo-r)}" title="Da restituire: ${fmt(p.importo-r)}"></i></div>
  ${rm>0.005||fin?`<small class="mhb-n">${rm>0.005?`restituiti nel mese ${fmt(rm)}`:""}${rm>0.005&&fin?" · ":""}${fin?'<span class="pos">restituito tutto ✓</span>':""}</small>`:""}</div>`;}).join("");}
function prestBox(ym){const d=movLoad(),mv=d?d.movimenti:[],AB=movAbb(),PR=movPrest(),L=prAttivi(ym),all=S.prestiti||[];
 const used=m=>AB[m.id]||PR[m.id];
 const one=p=>{const res=prRes(p),rest=sum((p.rest||[]).map(r=>r.importo)),tk=prTok(p),no=new Set(p.no||[]);
  const mvOf=id=>mv.find(m=>m.id===id);
  const mvTxt=m=>m?`${dIt(m.data).slice(0,5)} · ${esc(m.conto)} · ${esc(m.descr||m.tipo)}`:"";
  const out=p.mov?(()=>{const m=mvOf(p.mov);return `<p class="pr-l">Uscita collegata: ${m?mvTxt(m)+" "+fmt(m.importo,"sign"):"movimento non più negli estratti"} <button class="lnk" data-act="pr-movx" data-p="${p.id}">scollega</button></p>`;})()
   :(()=>{const c=mv.filter(m=>m.importo<0&&!used(m)&&!no.has(m.id)&&Math.abs(-m.importo-p.importo)<=1&&Math.abs(dDiff(m.data,p.data))<=10);
    return c.length?c.map(m=>`<p class="pr-l pr-prop">È questo il bonifico del prestito? ${mvTxt(m)} <b>${fmt(m.importo,"sign")}</b> <button class="btn sm" data-act="pr-mov" data-p="${p.id}" data-m="${m.id}">Sì, collega</button> <button class="lnk" data-act="pr-no" data-p="${p.id}" data-m="${m.id}">no</button></p>`).join("")
     :`<p class="note">Quando l'estratto conto con il bonifico del prestito sarà sul PC, comparirà qui da collegare (così non conta come spesa).</p>`;})();
  const props=res>0.005&&tk.length?mv.filter(m=>m.importo>0&&m.data>=p.data&&!used(m)&&!no.has(m.id)&&!["stipendio","giro","invest","escl"].includes(m.cat||"")&&m.importo<=res+0.5&&tk.some(w=>(String(m.descr||"")+" "+String(m.dett||"")).toLowerCase().includes(w))):[];
  return `<div class="pr-c"><div class="pr-h"><b>${esc(p.chi)}</b> <small class="muted">${dIt(p.data)}${p.nota?" · "+esc(p.nota):""}</small><span class="pr-v">${fmt(p.importo)}</span></div>
   <div class="pr-bar" title="Restituito ${fmt(rest)} su ${fmt(p.importo)}"><i style="width:${p.importo>0?Math.min(100,rest/p.importo*100).toFixed(1):0}%"></i></div>
   <dl class="kv">${kv("Restituito",`<span class="nt-ent">${fmt(rest)}</span>`)}${kv("Da restituire",res>0.005?`<b class="nt-tasse">${fmt(res)}</b>`:`<span class="pos">tutto restituito ✓</span>`,"strong")}</dl>
   ${out}
   ${props.length?`<div class="pr-props"><p class="pr-l"><b>Possibili restituzioni</b> <small class="muted">conferma solo quelle che lo sono (un rimborso di spese divise non lo è)</small></p>${props.map(m=>`<p class="pr-l pr-prop">${mvTxt(m)} <b class="nt-ent">${fmt(m.importo,"sign")}</b>${m.cat?` <small class="muted">ora: ${esc(movLbl(m.cat))}</small>`:""} <button class="btn sm" data-act="pr-rok" data-p="${p.id}" data-m="${m.id}">✓ Restituzione</button> <button class="lnk" data-act="pr-no" data-p="${p.id}" data-m="${m.id}">non lo è</button></p>`).join("")}</div>`:""}
   ${(p.rest||[]).length?`<ul class="pr-r">${p.rest.slice().sort((a,b)=>a.data.localeCompare(b.data)).map(r=>`<li><span>${dIt(r.data)}</span><span>${r.mov?(()=>{const m=mvOf(r.mov);return m?esc(m.conto):"dai conti";})():r.data>TODAY?"prevista":"a mano"}</span><b class="nt-ent">${fmt(r.importo)}</b><button class="lnk" data-act="pr-rdel" data-p="${p.id}" data-r="${r.id}" aria-label="Togli la restituzione">✕</button></li>`).join("")}</ul>`:""}
   <div class="pr-add"><input class="in" type="date" id="pr-rd-${p.id}" value="${TODAY}" aria-label="Data della restituzione"><input class="in" id="pr-ri-${p.id}" inputmode="decimal" placeholder="importo" aria-label="Importo restituito"><button class="btn ghost sm" data-act="pr-radd" data-p="${p.id}" ${READONLY?"disabled":""}>+ restituzione (anche futura)</button>
   <button class="lnk pr-del" data-act="pr-del" data-p="${p.id}">elimina prestito</button></div></div>`;};
 const tot=sum(L.map(prRes));
 const totM=sum(L.map(p=>Math.max(p.importo-prRestAt(p,ym),0)));
 return `<details class="box fold" id="pr-box" ${PR_BOX?"open":""}><summary><h3>Prestiti <small>${L.length?`da restituire a fine ${MESE_L(ym).toLowerCase()}: ${fmt(totM)}`:"nessuno attivo"}</small></h3></summary>
  ${L.map(one).join("")}
  ${!L.length&&all.length?`<p class="muted">Nessun prestito attivo in questo mese.</p>`:""}
  <details class="more" id="pr-new" ${PR_OPEN?"open":""}><summary>Nuovo prestito</summary>
   <div class="pr-form"><label>A chi <input class="in" id="pr-chi" maxlength="60" placeholder="nome (come compare nei bonifici)"></label><label>Data <input class="in" type="date" id="pr-data" value="${TODAY.slice(0,7)===ym?TODAY:ym+"-01"}"></label><label>Importo <input class="in" id="pr-imp" inputmode="decimal" placeholder="es. 3500"></label><label>Nota <input class="in" id="pr-nota" maxlength="140" placeholder="facoltativa"></label>
   <button class="btn" data-act="pr-add" ${READONLY?"disabled":""}>Aggiungi</button></div></details>
  <details class="more"><summary>Come funzionano i prestiti</summary><p class="note">Il prestito conta come uscita del mese in cui lo dai e ogni restituzione come entrata del mese in cui arriva (vale la differenza tra le chiusure dei mesi), ma stanno in una voce a parte: non entrano nelle categorie di spesa. Le restituzioni riempiono la barra del prestito; quando è restituito tutto, la barra resta nei mesi in cui era attivo e sparisce dai successivi. Puoi segnare restituzioni future (con data futura): entrano nella stima di quel mese. Il nome serve a riconoscere i bonifici: te li propongo e li confermi tu.</p></details></details>`;}

/* ================= resoconto mensile ================= */
/* riepilogo di un mese (v31): entrate, uscite, investito e guadagno. Fonte: resoconto (saldi in Patrimonio + entrate
   registrate: guadagno = variazione liquidità + investito) se il mese c'è, altrimenti i movimenti degli estratti conto. */
/* v47 (decisione di Marco): «in rosso» solo se il mese ha perso soldi, cioè guadagno complessivo + tasse pagate nel mese < 0
   (le tasse pagate erano già da parte); se il guadagno è positivo ma non copre le tasse maturate sulle entrate del mese
   → «tasse non coperte» (avviso giallo). Prima bastava risparmio netto < 0 e febbraio risultava in rosso con +986 €. */
const mesStato=q=>!q||q.src!=="res"?"":q.guad+n(q.tas)<-0.005?"rosso":q.guad+n(q.tas)<n(q.acc)-0.005?"tasse":"";
function mesSum(ym){const Y=ym.slice(0,4),m=+ym.slice(5)-1,x=R.svAll&&R.svAll[Y];
 if(x&&x.ent[m]!=null&&x.risp[m]!=null){const ent=x.ent[m],inv=x.inv[m]||0,guad=x.risp[m];return{ym,src:"res",ent,inv,guad,usc:ent-guad,liq:guad-inv,prest:n(x.prest&&x.prest[m]),rst:n(x.rst&&x.rst[m]),acc:n(x.acc[m]),tas:n(x.tasse[m]),fis:n(x.fisse[m]),aff:n(x.aff&&x.aff[m]),vita:n(x.spese[m])};}
 if(movMesi().includes(ym)){const N=movNetto(ym),inv=-(N.o.invest||0),pr=prestMese(ym),usc=-(N.tu+N.R)+pr.prest,ent=N.te+pr.rst,guad=ent-usc;return{ym,src:"mov",ent,inv,guad,usc,liq:guad-inv,prest:pr.prest,rst:pr.rst};}
 return null;}
/* v52: mesi stimati (proiezione) per il Resoconto: stessa forma di mesSum, src "proj" */
const prestMese=ym=>({prest:sum((S.prestiti||[]).filter(p=>p.data.startsWith(ym)).map(p=>p.importo)),rst:sum((S.prestiti||[]).flatMap(p=>p.rest||[]).filter(r=>r.data.startsWith(ym)).map(r=>r.importo))});
function projQ(ym){const P=proj(),x=P&&P.mesi.find(z=>z.ym===ym);if(!x)return null;return{ym,src:"proj",ent:x.ent,inv:0,guad:x.sur,usc:x.usc,liq:x.sur,prest:x.prest||0,rst:x.rst||0,x};}
const mesSumP=ym=>monthsAvail().includes(ym)?mesSum(ym):(projQ(ym)||mesSum(ym));
const mesiSum=()=>[...new Set([...monthsAvail(),...movMesi()])].sort();

const colLeg=q=>{const inv=Math.max(q.inv,0),g=q.liq,sub=(c,l,v)=>li(c,l,v,q.ent).replace("<li>",'<li class="lg-s">');return `<div class="mleg"><ul class="pleg">${li("c-ent","Entrate",q.ent,q.ent)}${n(q.rst)>0.005?sub("c-ent","di cui restituzioni prestiti",q.rst):""}${li("c-spese","Uscite",q.usc,q.ent)}${q.src==="res"?(n(q.tas)>0.005?sub("c-tasse","tasse pagate",q.tas):"")+(n(q.fis)>0.005?sub("c-aff",`spese fisse${n(q.aff)>0.005?` <small>(affitto ${fmt(q.aff)})</small>`:""}`,q.fis):"")+(n(q.prest)>0.005?sub("qa","prestiti dati",q.prest):"")+sub("c-spese","altre spese <small>per differenza</small>",Math.max(q.vita,0)):(n(q.prest)>0.005?sub("qa","di cui prestiti dati",q.prest):"")}${li("c-inv","Investito",inv,q.ent)}</ul><dl class="kv mleg-kv">${kv(g>=0?"Guadagno del mese <small>rimasto sui conti</small>":"Perdita del mese <small>presa dai conti</small>",`<span class="${g<0?"neg":"pos"}">${fmt(g,"sign")}</span>`,"strong")}${kv("Guadagno complessivo <small>guadagno + investito</small>",`<span class="${q.guad<0?"neg":"pos"}">${fmt(q.guad,"sign")}</span>`)}${q.ent>0?kv("Tasso di risparmio",fmt(q.guad/q.ent,"pct1")):""}${q.src==="res"?kv("Tasse da mettere da parte <small>maturate sulle entrate del mese</small>",`<span class="nt-tasse">${fmt(q.acc)}</span>`)+kv("Guadagno al netto delle tasse <small>guadagno + tasse pagate − da mettere da parte</small>",`<span class="${q.guad+q.tas-q.acc<0?"neg":"pos"}">${fmt(q.guad+q.tas-q.acc,"sign")}</span>`):""}</dl></div>`;};
/* chip della dashboard: unico collegamento al Resoconto mensile */
function riepPsub(){const L=mesiSum();let q=null;for(let i=L.length-1;i>=0&&!q;i--)q=mesSum(L[i]);if(!q)return "";const mn=MESE_L(q.ym).toLowerCase();
 return `<a class="psub" href="#mese" data-act="go" data-tab="mese" data-mm="${q.ym}" title="Apri il resoconto mensile"><h4>Riepilogo del mese <small>${mn}</small></h4><span hidden data-psum>${fmt(Math.round(q.guad),"sign").replace(/,\d\d(?=\s|$)/,"")}</span>
  <div class="psub-in psub-col">${mhbHTML(q,yearTop(q.ym.slice(0,4)))}<div><dl class="kv">${kv("Guadagno complessivo <small>entrate − uscite</small>",`<span class="${q.guad<0?"neg":"pos"}">${fmt(q.guad,"sign")}</span>`)}${kv("Quota investita",`<span class="nt-inv">${fmt(q.inv)}</span>`)}${kv("Risparmio liquido <small>rimasto sui conti</small>",`<span class="${q.liq<0?"neg":"pos"}">${fmt(q.liq,"sign")}</span>`,"strong")}</dl></div></div></a>`;}

/* grafico a colonne mese per mese (v32): scala comune con asse y, mese scelto al centro, mese prima e dopo ai lati;
   cambiando mese la striscia scorre (MCH_AT = mese al centro nell'ultimo render). */


const fInt=v=>new Intl.NumberFormat("it-IT",{maximumFractionDigits:0,useGrouping:"always"}).format(v);
/* v40: barre orizzontali di un mese (Resoconto e dashboard) e fondo scala annuo (regola di Marco: valore più alto
   dell'anno tra entrate e uscite + investito, arrotondato per eccesso al migliaio) */
const qTop=q=>q?Math.max(q.ent,Math.max(q.usc,0)+Math.max(q.inv,0)):0;
const yearTop=Y=>{const L=mesiSum().filter(ym=>ym.slice(0,4)===String(Y));return Math.max(1000,Math.ceil(Math.max(0,...L.map(ym=>qTop(mesSum(ym))))/1000-1e-9)*1000);};
const mhbHTML=(q,top)=>{const AL=q.ym?prAttivi(q.ym):[];top=Math.max(top,...AL.map(p=>p.importo));const pm=v=>(Math.max(v,0)/top*100).toFixed(2)+"%",uX=Math.max(q.usc-n(q.prest),0);return `<div class="mhb${q.src==="proj"?" pj":""}">
  <div class="mhb-r"><div class="mhb-t"><span>Entrate</span><b class="nt-ent">${fmt(q.ent)}</b></div><div class="mhb-bar" title="Entrate: ${fmt(q.ent)}"><i class="mc-ent" style="width:${pm(q.ent)}"></i></div></div>
  <div class="mhb-r"><div class="mhb-t"><span>Uscite <small>+ investito${n(q.prest)>0.005?" · prestiti a parte":""}</small></span><b>${fmt(uX+Math.max(q.inv,0))}</b></div><div class="mhb-bar"><i class="mc-usc" style="width:${pm(uX)}" title="Uscite: ${fmt(uX)}"></i><i class="mc-inv" style="width:${pm(q.inv)}" title="Investito: ${fmt(q.inv)}"></i></div></div>
  ${q.ym?loanRows(q.ym,top):""}
  <div class="mhb-sc" aria-hidden="true"><span>0</span><span>${fInt(top/2)}</span><span>${fInt(top)} €</span></div></div>`;};
function mchHTML(L,k){
 /* v37 (opzione D scelta da Marco): in alto i tre mesi (prima · scelto · dopo) in miniatura, da toccare; sotto il mese
    scelto a barre orizzontali con gli importi. Scala comune a tutti i mesi. Il guadagno è solo in numeri. */
 const Q=L.map(mesSumP);
 
 const MH=38,topOf=Y=>Math.max(1000,Math.ceil(Math.max(0,...L.map((ym,i)=>ym.slice(0,4)===Y&&Q[i]?Math.max(Q[i].ent,Math.max(Q[i].usc,0)+Math.max(Q[i].inv,0)):0))/1000-1e-9)*1000);
 const tile=i=>{const ym=L[i],q=Q[i];if(ym==null)return `<span class="mst-t mst-void" aria-hidden="true"></span>`;
  const m=MESI[+ym.slice(5)-1],sel=i===k,g=q?q.liq:null,tY=topOf(ym.slice(0,4)),hp=v=>(Math.max(v,0)/tY*MH).toFixed(1)+"px";
  const mini=q?`<span class="mst-mini" aria-hidden="true"><span><i class="mc-ent" style="height:${hp(q.ent)}"></i></span><span><i class="mc-usc" style="height:${hp(q.usc)}"></i><i class="mc-inv" style="height:${hp(q.inv)}"></i></span></span>`:`<span class="mst-mini"></span>`;
  const inner=`${mini}<b>${m.slice(0,3)} <small>${ym.slice(0,4)}</small></b><em class="${g==null?"":g<0?"neg":"pos"}">${g==null?"—":fmt(Math.round(g),"sign").replace(/,\d\d(?=\s|$)/,"")}</em>`;
  const pj=q&&q.src==="proj"?" pj":"";return sel?`<span class="mst-t sel${pj}" aria-current="true">${inner}</span>`:`<button class="mst-t${pj}" data-act="mm" data-mm="${ym}" aria-label="Vai a ${m.toLowerCase()} ${ym.slice(0,4)}">${inner}</button>`;};
 const q=Q[k];
 /* v39 (regola di Marco): fondo scala = valore più alto dell'anno del mese scelto (entrate o uscite + investito),
    arrotondato per eccesso al migliaio; vale per le barre e per le miniature di tutti i mesi di quell'anno */
 const Yk=L[k].slice(0,4),topY=Math.max(1000,Math.ceil(Math.max(0,...L.map((ym,i)=>ym.slice(0,4)===Yk&&Q[i]?Math.max(Q[i].ent,Math.max(Q[i].usc,0)+Math.max(Q[i].inv,0)):0))/1000-1e-9)*1000);
 const topM=topY;
 const bars=q?mhbHTML(q,topM):`<p class="muted">Nessun dato per questo mese.</p>`;
 return `<div class="mch2 mch-vp" role="group" aria-label="Entrate e uscite: ${MESE_L(L[k])}"><div class="mst">${tile(k-1)}${tile(k)}${tile(k+1)}</div>${bars}</div>`;}
let MM=null;
const monthsAvail=()=>Object.keys(R.svAll||{}).sort().flatMap(Y=>R.svAll[Y].ent.map((v,i)=>v!=null?`${Y}-${String(i+1).padStart(2,"0")}`:null).filter(Boolean));
V.mese=()=>{const LR=monthsAvail(),L0=[...new Set([...LR,...movMesi()])].sort();
 /* v52: in coda i mesi stimati (proiezione), scelta di Marco: la stima mese per mese sta qui */
 const PJ=((L0.length&&proj())||{mesi:[]}).mesi.map(x=>x.ym).filter(ym=>!LR.includes(ym)),L=[...new Set([...L0,...PJ])].sort();
 if(!L.length)return `<section class="sheet"><div class="sheet-h"><h2>Resoconto mensile</h2></div><div class="banner">Il resoconto compare quando ci sono almeno due mesi consecutivi di saldi in <a href="#patrimonio">Patrimonio</a> e le entrate del mese in <a href="#entrate">Entrate</a>.</div></section>`;
 if(!MM||!L.includes(MM))MM=L0.filter(v=>!PJ.includes(v)).pop()||L0[L0.length-1]||L[0];
 const k=L.indexOf(MM);
 const yrs=[...new Set(L.map(v=>v.slice(0,4)))];
 const isNeg=v=>{const st=mesStato(mesSum(v));return st==="rosso"?" · in rosso":st==="tasse"?" · tasse non coperte":"";};
 const opts=yrs.map(y=>`<optgroup label="${y}">${L.filter(v=>v.startsWith(y)).map(v=>`<option value="${v}" ${v===MM?"selected":""}>${MESI[+v.slice(5)-1]} ${y}${PJ.includes(v)?" · stima":isNeg(v)}</option>`).join("")}</optgroup>`).join("");
 const nav=(d,lab,ar)=>{const t=L[k+d];return `<button class="mbtn" data-act="mm" data-mm="${t||""}" ${t?"":"disabled"} aria-label="${lab}${t?": "+MESI[+t.slice(5)-1].toLowerCase()+" "+t.slice(0,4):""}">${ar}</button>`;};
 const headH=`<div class="sheet-h"><h2>Resoconto mensile</h2><p>Entrate, uscite e guadagno del mese; sotto, il dettaglio dei movimenti dei conti.</p></div>`;
 const navH=`<div class="mnav" role="group" aria-label="Scegli il mese">${nav(-1,"Mese precedente","‹")}<select class="in sel mm-sel" id="mm-sel" aria-label="Mese">${opts}</select>${nav(1,"Mese successivo","›")}</div>`;

 const isPJ=PJ.includes(MM),hasMov=movMesi().includes(MM);
 const mp={},mb=isPJ&&!hasMov?"":movBody(MM,mp),hasR=LR.includes(MM),q=isPJ?projQ(MM):mesSum(MM),mn=MESE_L(MM).toLowerCase();
 let resAltri="",negB="";
 if(hasR){const Y=MM.slice(0,4),m=+MM.slice(5)-1,x=R.svAll[Y],g=k=>x[k][m],ent=g("ent");
  const affM=Math.max(n(g("aff")),0);
  const st=mesStato(q),gt=g("risp")+n(g("tasse")),acc=n(g("acc"));
  negB=st==="rosso"?`<div class="banner neg-b"><b>Mese in rosso</b>: le uscite (${fmt(ent-gt)}, tasse pagate escluse) hanno superato le entrate (${fmt(ent)}) di <b>${fmt(-gt)}</b>, presi dai risparmi.${acc>0?` In più le entrate del mese hanno fatto maturare ${fmt(acc)} di tasse da mettere da parte.`:""}</div>`
   :st==="tasse"?`<div class="banner warn-b"><b>Tasse non coperte</b>: nel mese hai messo da parte ${fmt(gt)}${n(g("tasse"))?" (guadagno + tasse pagate nel mese)":""}, ma le tasse maturate sulle entrate del mese sono ${fmt(acc)}: mancano <b>${fmt(acc-gt)}</b> all'accantonamento.</div>`:"";
  const ya=R.ytdAll[Y],avg=ya&&ya.n?ya.ent/ya.n:null;
  resAltri="";void kv("Spese fisse del mese",`<span class="nt-spese">${fmt(g("fisse"))}</span>`)+(affM>0?kv("&nbsp;&nbsp;di cui affitto",`<span class="nt-aff">${fmt(affM)}</span>`):"")+kv("Altre spese (di vita) <small>per differenza</small>",`<span class="nt-spese">${fmt(g("spese"))}</span>`)+(avg!=null?kv(`Media delle entrate <small>${ya.lbl}</small>`,fmt(avg)):"");}
 
 const top=q?`<div class="box mcol-box${isPJ?" pj-box":""}"><h3>Entrate e uscite <small>${mn}${q.src==="mov"?" · dagli estratti conto":q.src==="proj"?" · stima":""}</small></h3><div class="mcol-in">${mchHTML(L,k)}${colLeg(q)}</div>
  <details class="more mc-help"><summary>Come leggere il grafico</summary><p class="note">${q.src==="res"?"Entrate registrate (più le restituzioni dei prestiti); uscite = entrate − risparmio (variazione della liquidità + investito), prestiti dati compresi.":q.src==="proj"?"Mese stimato: dettaglio qui sotto.":"Entrate e uscite nette dagli estratti conto (manca il resoconto: servono i saldi in Patrimonio)."} In alto il mese scelto e quelli accanto (toccali o scorri per cambiare mese); fondo scala = valore più alto dell'anno (entrate o uscite + investito), arrotondato al migliaio, uguale per tutti i mesi dell'anno. La differenza tra le due barre è il guadagno (o la perdita) del mese, indicato sotto.</p></details></div>`:"";
 /* v34: confronto entrate registrate (grafico in alto, fonte resoconto) e entrate dai conti (ciambella «Entrate») */
 let entCmp="";if(q&&q.src==="res"&&mp.entC){const reg={};S.registro.filter(r=>r.data.startsWith(MM)&&IN_TOT(r.fonte)).forEach(r=>{const l=FN[r.fonte]||r.fonte;reg[l]=(reg[l]||0)+(+r.importo||0);});
  const d=q.ent-mp.entC.tot,row=(l,v)=>`<div class="ecr"><span>${l}</span><b>${fmt(v)}</b></div>`;
  entCmp=Math.abs(d)<0.5?"":`<details class="ecmp"><summary>Entrate registrate ${fmt(q.ent)} · dai conti ${fmt(mp.entC.tot)} · differenza <b class="${d<0?"neg":""}">${fmt(d,"sign")}</b></summary>
  <div class="ecmp-in"><div><h4>Registrate <small>scheda Entrate · grafico in alto</small></h4>${Object.entries(reg).map(([l,v])=>row(l,v)).join("")}</div><div><h4>Dai conti <small>ciambella «Entrate»</small></h4>${mp.entC.voci.map(x=>row(x[0],x[1])).join("")}</div></div>
  <p class="note">Il grafico in alto usa le entrate registrate (stipendio = netto del cedolino nel mese di pagamento, sondaggi = prelievi dell'app, libera professione al lordo, altro inserito a mano) perché il guadagno del mese viene dai saldi di Patrimonio. La ciambella usa gli accrediti degli estratti conto. Le entrate extra (anche via PayPal) entrano da sole tra le registrate (fonte «Entrate extra (dai conti)»): la differenza che resta viene di solito dallo stipendio accreditato in un giorno o importo diverso dal cedolino, o da entrate registrate a mano che non passano dai conti.</p></details>`;}
 const pies=[...(mp.pies||[])].filter(Boolean); // v36: tolta la ciambella «Uso delle entrate» (doppione del grafico a colonne)
 const altri=mp.altri||"";
 return `<section class="sheet">
 ${headH}
 ${navH}
 ${negB}
 ${top}
 ${isPJ?projBox(MM):""}
 ${pies.length?`<div class="grid mvpies">${pies.join("")}</div>`:""}
 ${prestBox(MM)}
 ${altri||entCmp?`<div class="box"><h3>Da controllare</h3>${altri?`<dl class="kv">${altri}</dl>`:""}${entCmp}</div>`:""}
 ${mb?`<div class="sheet-h mv-sh"><h2>Dai conti</h2><p>Movimenti degli estratti conto Fineco e Revolut letti dal PC fisso: restano su questo dispositivo e non entrano nei backup.</p></div>
 ${mb}`:""}
</section>`;};
V.entrate=()=>{
 const Y=UY,T=R.anni[Y],c=`anni.${Y}`;
 const idx=S.registro.map((r,i)=>i).filter(i=>S.registro[i].data.startsWith(Y+"-")).sort((a,b)=>S.registro[b].data.localeCompare(S.registro[a].data));
 const noDate=S.registro.map((r,i)=>i).filter(i=>!S.registro[i].data);
 const list=[...noDate,...idx].map(i=>S.registro[i].ext?`<tr class="extrow"><td>${dIt(S.registro[i].data)}</td><td>${FN[S.registro[i].fonte]}</td><td>${fmt(S.registro[i].importo)}</td><td class="muted">${S.registro[i].nota} <span class="chip auto">auto</span></td><td></td></tr>`:`<tr><td>${inpT(`registro.${i}.data`,"date")}</td><td>${sel(`registro.${i}.fonte`,FONTI_Y(Y).some(f=>f[0]===S.registro[i].fonte)?FONTI_Y(Y):[...FONTI_Y(Y),FONTI.find(f=>f[0]===S.registro[i].fonte)])}</td><td>${inp(`registro.${i}.importo`)}</td><td>${inpT(`registro.${i}.nota`,"text","Nota (n. fattura, cliente…)")}</td>
  <td class="c"><button class="icon-btn" data-act="del-mov" data-idx="${i}" aria-label="Elimina movimento" ${READONLY?"disabled":""}>×</button></td></tr>`).join("");
 const FY=FONTI_E(Y),used=+Y>=2027?FY:FY.filter(([k])=>T&&T.tot[k]!==0);const cols=used.length?used:FY;
 let piv="";if(T){MESI.forEach((m,i)=>{piv+=`<tr><td>${m}</td>${cols.map(([k])=>{const nE=cellEntries(Y,i,k).length;if(k==="sond"&&sondCovers(`${Y}-${String(i+1).padStart(2,"0")}`))return `<td class="auto-c" title="Prelievi dall'app Guadagni sondaggi">${out(`${c}.mm.${k}.${i}`)}<span class="nm">auto</span></td>`;
   if(k==="ext")return `<td class="auto-c" title="Entrate extra ed extra via PayPal dagli estratti conto (Resoconto mensile)">${out(`${c}.mm.${k}.${i}`)}<span class="nm">conti</span></td>`;
   if(cedCovers(`${Y}-${String(i+1).padStart(2,"0")}`,k))return `<td class="auto-c" title="Netto dal cedolino (scheda Cedolini)">${out(`${c}.mm.${k}.${i}`)}<span class="nm">cedolino</span></td>`;
   if(contiCovers(`${Y}-${String(i+1).padStart(2,"0")}`,k))return `<td class="auto-c" title="Accrediti collegati negli estratti conto (Resoconto mensile › Da collegare)">${out(`${c}.mm.${k}.${i}`)}<span class="nm">conti</span></td>`;return nE>1?`<td class="multi" title="${nE} movimenti: modificali nell'elenco dettagliato">${out(`${c}.mm.${k}.${i}`)}<span class="nm">${nE} mov.</span></td>`:`<td class="ce">${cellInp(Y,i,k)}</td>`;}).join("")}<td class="gain">${out(`${c}.tm.${i}`)}</td></tr>`;});
  piv+=`<tr class="tot"><td>Totale ${Y}</td>${cols.map(([k])=>`<td>${out(`${c}.tot.${k}`)}</td>`).join("")}<td class="gain">${out(`${c}.tot.all`)}</td></tr>`;}
 const today=TODAY;
 return `<section class="sheet">
 <div class="sheet-h"><h2>Entrate ${Y}</h2>${yearBar()}<p>${+Y>=2027?"Dal 2027 restano stipendio SSN e sondaggi, più «Altro» per le entrate occasionali (rimborso IRPEF, rimborsi spese, regali…). Lo stipendio è il netto in busta, tutto compreso: contiene già intramoenia e prestazioni aggiuntive. Il loro lordo, che serve solo per la Quota B ENPAM, si inserisce nella scheda Tasse.":"Un unico registro di movimenti: data di incasso, fonte, importo. Solo la libera professione entra nel forfettario, per cassa. Lo stipendio SSN è il netto in busta, tutto compreso (anche intramoenia e aggiuntive); il loro lordo per la Quota B ENPAM si inserisce nella scheda Tasse."}</p></div>
 ${sondNote()}${contiWarn(Y)}
 ${cedNote()}
 <p class="note">Scrivi il totale del mese direttamente nella cella della fonte: lo stipendio netto dal cedolino. Le celle con più movimenti (es. più fatture nello stesso mese) si modificano nell'elenco dettagliato in fondo.</p>
 <details class="more"><summary>Aggiungi un singolo movimento con data e nota</summary>
 <div class="box c-good"><h3>Nuovo movimento</h3>
  <form class="addrow" id="addmov" autocomplete="off">
   <label>Data incasso<input class="in" type="date" id="nm-data" value="${today}" required></label>
   <label>Fonte<select class="in sel" id="nm-fonte">${FONTI_E(Y).map(([k,l])=>`<option value="${k}">${l}</option>`).join("")}</select></label>
   <label>Importo €<input class="in" id="nm-imp" inputmode="decimal" placeholder="0,00" required></label>
   <label class="grow">Nota<input class="in txt" id="nm-nota" placeholder="es. Fattura 12/2026 · Clinica X"></label>
   <button class="btn" type="submit" ${READONLY?"disabled":""}>Aggiungi</button>
  </form><p class="note" id="nm-msg" hidden></p></div></details>
 ${T?`<div class="tbl-wrap"><table class="piv ${cols.length<=3?"few":""}"><thead><tr><th>Mese</th>${cols.map(([k,l])=>`<th>${l}${k==="ssn"?" · netto in busta":""}</th>`).join("")}<th>Totale mese</th></tr></thead><tbody>${piv}</tbody></table></div>
`:`<div class="banner">Mancano i parametri del ${Y}: aggiungili in <a href="#parametri">Parametri</a> per vedere il riepilogo.</div>`}
 <details class="more"><summary>Elenco dettagliato dei movimenti ${Y} (${idx.length})</summary>
 <div class="box"><div class="tbl-wrap flat"><table class="mov"><thead><tr><th>Data</th><th>Fonte</th><th>Importo</th><th>Nota</th><th></th></tr></thead><tbody>${list||`<tr><td colspan="5" class="muted">Nessun movimento nel ${Y}.</td></tr>`}</tbody></table></div></div></details>
</section>`;
};

let TPY=null,TPV="pie";
const TPCAT=[["qa","Quota A ENPAM"],["qb","Quota B ENPAM"],["imp","Imposta sostitutiva"],["altro","Altre tasse"]];
function taxPayBox(){const tp=R.tp;if(!tp||!tp.years.length)return "";
 const cy=String(new Date().getFullYear());if(TPY==null||!tp.years.includes(TPY))TPY=tp.years.includes(cy)?cy:tp.years[tp.years.length-1];
 const Y=tp.byYear[TPY],cats=TPCAT.filter(([k])=>Y[k].n>0),b=`tp.byYear.${TPY}`;
 const mx=Math.max(1,...cats.map(([k])=>Y[k].tot)),col=k=>k==="altro"?"muted":k;
 let viz="";
 const pp=Y.tot?Y.pag/Y.tot:0,pI=f=>Math.round(f*100)+"%";
 const tHead=(lbl,pt,pg,rs)=>`<div class="taxd-n"><span class="l">${lbl}</span><b class="big">${out(pt)}</b>
  <span class="row"><i style="background:var(--good)"></i>già pagate <b class="gain">${out(pg)}</b></span>
  <span class="row"><i style="background:var(--tax);opacity:.45"></i>da pagare <b class="tax">${out(rs)}</b></span></div>`;
 const head=tHead(`Totale tasse nel ${TPY}`,b+".tot",b+".pag",b+".res");
 if(TPV==="bar"){viz=`<div class="prog"><div class="prog-h"><span>Pagato <b class="gain">${out(b+".pag")}</b> di ${out(b+".tot")}</span><b class="pp">${pI(pp)}</b></div>
  <div class="stack tall" id="tpbar"><span style="background:var(--good);width:${(pp*100).toFixed(1)}%"></span><span style="width:${(100-pp*100).toFixed(1)}%"></span></div></div>
  <div class="comp">${cats.map(([k,l])=>`<div class="crow"><i style="background:var(--${col(k)})"></i><span class="cl">${l}</span><span class="cv">${out(`${b}.${k}.tot`)}</span>
   <div class="mtrack"><div class="mini" data-w="${b}.${k}" style="width:${(Y[k].tot/mx*100).toFixed(1)}%"><span class="rest" style="--c:var(--${col(k)})"></span><span style="background:var(--${col(k)})"></span></div></div>
   <span class="cs">da pagare ${out(`${b}.${k}.res`,"eur","tax")} · pagato ${out(`${b}.${k}.pag`,"eur","gain")}</span></div>`).join("")}</div>
  <div class="legend"><span><i style="background:var(--qb)"></i>da pagare</span><span><i class="hatch" style="--c:var(--qb)"></i>pagato</span></div>`;}
 else if(TPV==="pie"){
  const ring=(sz,sw,f,colr,t1,t2,lbl,trk)=>{const r=(sz-sw)/2,L=2*Math.PI*r,d=(Math.min(Math.max(f,0),1)*L).toFixed(2);
   return `<svg viewBox="0 0 ${sz} ${sz}" width="${sz}" height="${sz}" role="img" aria-label="${lbl}"><circle cx="${sz/2}" cy="${sz/2}" r="${r}" fill="none" ${trk?`stroke="var(--tax)" stroke-opacity=".22"`:`stroke="var(--surface-2)"`} stroke-width="${sw}"/>
    <circle cx="${sz/2}" cy="${sz/2}" r="${r}" fill="none" stroke="${colr}" stroke-width="${sw}" stroke-linecap="${f>0&&f<1?"round":"butt"}" stroke-dasharray="${d} ${L.toFixed(2)}" transform="rotate(-90 ${sz/2} ${sz/2})"><title>${lbl}</title></circle>
    <text x="50%" y="${sz/2-(t2?2:-5)}" text-anchor="middle" class="pc1" style="font-size:${sz>120?22:Math.max(11,Math.round(sz*.17))}px">${t1}</text>${t2?`<text x="50%" y="${sz/2+14}" text-anchor="middle" class="pc2">${t2}</text>`:""}</svg>`;};
  viz=`<div class="ring-main taxd-in">${ring(150,18,pp,"var(--good)",pI(pp),"pagato",`Pagato ${fmt(Y.pag)} su ${fmt(Y.tot)}`,1)}${head}</div>
   <div class="rings">${cats.map(([k,l])=>{const f=Y[k].tot?Y[k].pag/Y[k].tot:0,mxT=Math.max(1,...cats.map(([q])=>Y[q].tot)),sz=Math.round(Math.max(58,116*Math.sqrt(Y[k].tot/mxT)));return `<div class="ring1"><div class="rbox">${ring(sz,Math.max(7,Math.round(sz*.1)),f,`var(--${col(k)})`,pI(f),"",`${l}: pagato ${fmt(Y[k].pag)} su ${fmt(Y[k].tot)}`)}</div>
    <span class="rl"><i style="background:var(--${col(k)})"></i>${l}</span><span class="rv">${out(`${b}.${k}.tot`)}</span><span class="cs">da pagare ${out(`${b}.${k}.res`,"eur","tax")}<br>pagato ${out(`${b}.${k}.pag`,"eur","gain")}</span></div>`;}).join("")}</div>`;}
 else{viz=`<div class="tbl-wrap flat"><table class="tpt"><thead><tr><th>Voce</th><th>Totale</th><th>Pagato</th><th>Da pagare</th></tr></thead><tbody>
  ${cats.map(([k,l])=>`<tr><td><i class="dot" style="background:var(--${col(k)})"></i> ${l}</td><td>${out(`${b}.${k}.tot`)}</td><td>${out(`${b}.${k}.pag`,"eur","gain")}</td><td>${out(`${b}.${k}.res`,"eur","tax")}</td></tr>`).join("")}
  <tr class="tot"><td>Totale ${TPY}</td><td>${out(b+".tot")}</td><td>${out(b+".pag","eur","gain")}</td><td>${out(b+".res","eur","tax")}</td></tr></tbody></table></div>`;}
 return `<div class="split2 tpw">
 <div class="box c-tax" id="tp-box"><h3>Tasse da pagare anno per anno</h3>
  <div class="scad-head"><div class="years">${tp.years.map(y=>`<button class="ybtn" data-act="tpy" data-y="${y}" ${y===TPY?'aria-pressed="true"':""}>${y}</button>`).join("")}</div>
   <div class="seg sm" role="tablist">${[["bar","Barre"],["pie","Ciambella"],["tab","Tabella"]].map(([k,l])=>`<button class="segb" data-act="tpv" data-v="${k}" aria-selected="${k===TPV}">${l}</button>`).join("")}</div></div>
  ${TPV==="pie"?"":head}
  ${viz}
  <p class="note">Anno = anno in cui paghi (data di scadenza nello Scadenzario), non anno a cui si riferisce la tassa.</p>
 </div>
 <div class="box c-tax"><h3>Riepilogo complessivo</h3>
  ${tHead("Totale tasse, tutti gli anni","tp.all.tot","tp.all.pag","tp.all.res")}
  <div class="yrbars">${tp.years.map(y=>{const Yy=tp.byYear[y],w=v=>(v/tp.max*100).toFixed(1)+"%";return `<button class="yr ${y===TPY?"on":""}" data-act="tpy" data-y="${y}"><span class="yl">${y}</span>
   <span class="yb"><span class="p" style="width:${w(Yy.pag)}"></span><span class="r" style="width:${w(Yy.res)}"></span></span>
   <span class="yv">${fmt(Yy.res)}<small>${Yy.pag>0?"pagato "+fmt(Yy.pag):""}</small></span></button>`;}).join("")}</div>
  <div class="legend"><span><i style="background:var(--tax)"></i>da pagare</span><span><i class="hatch" style="--c:var(--good)"></i>pagato</span></div>
 </div></div>`;}
const intraBox=(Y,c)=>{const q=+Y>=2027;let rows="";MESI.forEach((m,i)=>{const nE=cellEntries(Y,i,"intra").length,au=cedCovers(`${Y}-${String(i+1).padStart(2,"0")}`,"intra");
  rows+=`<tr><td>${m}</td>${au?`<td class="auto-c" title="Prestazioni aggiuntive e ALPI dal cedolino">${out(`${c}.mm.intra.${i}`)}<span class="nm">cedolino</span></td>`:nE>1?`<td class="multi" title="${nE} movimenti: modificali in Entrate, elenco dettagliato">${out(`${c}.mm.intra.${i}`)}<span class="nm">${nE} mov.</span></td>`:`<td class="ce">${cellInp(Y,i,"intra")}</td>`}<td>${out(`${c}.cumI.${i}`,"eur","zd")}</td>${q?`<td>${out(`${c}.ytd.qb.${i}`,"eur","tax zd")}</td>`:""}</tr>`;});
 rows+=`<tr class="tot"><td>Totale ${Y}</td><td>${out(`${c}.tot.intra`)}</td><td></td>${q?`<td>${out(c+".qbIntra","eur","tax")}</td>`:""}</tr>`;
 return `<div class="box c-tax" id="intra-box"><h3>Intramoenia e prestazioni aggiuntive ${Y} · lordo dal cedolino</h3>
  <p class="note">Inserisci il lordo del mese (voci ALPI e prestazioni aggiuntive del cedolino). Serve solo per la Quota B ENPAM: non è un'entrata in più, perché il netto è già compreso nello stipendio in Entrate.</p>
  <div class="tbl-wrap"><table class="piv few"><thead><tr><th>Mese</th><th>Lordo</th><th>Cumulato</th>${q?"<th>Quota B maturata</th>":""}</tr></thead><tbody>${rows}</tbody></table></div></div>`;};
let CALC_OPEN=false,NOTES_OPEN=false;
const calcOpen=t=>`<details class="calc" id="calc-det" ${CALC_OPEN?"open":""}><summary><span class="ct">${t}</span><small>passaggi del calcolo e note</small></summary><div class="calc-in">`;
V.tasse=()=>{
 const Y=UY,T=R.anni[Y],c=`anni.${Y}`;
 if(!T)return `<section class="sheet"><div class="sheet-h"><h2>Tasse</h2>${yearBar()}</div><div class="banner">Mancano i parametri del ${Y}. <button class="btn" data-act="add-anno" data-y="${Y}" ${READONLY?"disabled":""}>Aggiungi parametri ${Y}</button></div></section>`;
 if(+Y>=2027){
  return `<section class="sheet">
 ${taxPayBox()}
 <div class="sheet-h"><h2>Contributi ${Y} · ENPAM</h2>${yearBar()}<p>Quota A e Quota B ENPAM: i valori da inserire sono solo i lordi di intramoenia e aggiuntive qui sotto.</p></div>
 <div class="hero">
  <div class="tile t-tax"><span class="l">Totale ENPAM ${Y}</span><span class="v">${out(c+".con")}</span><span class="s">Quota A + Quota B</span></div>
  <div class="tile"><span class="l">Quota A ${Y}</span><span class="v">${out(c+".qa")}</span><span class="s">4 rate: 30/4, 30/6, 30/9, 30/11/${Y}</span></div>
  <div class="tile"><span class="l">Quota B su intramoenia</span><span class="v">${out(c+".qbIntra")}</span><span class="s">da pagare dal 31/10/${+Y+1}</span></div>
 </div>
 ${intraBox(Y,c)}
 ${calcOpen(`Come sono calcolati i contributi ${Y}`)}
  <p class="note">Dal ${Y} non c'è più libera professione con partita IVA: niente forfettario né imposta sostitutiva. Restano la Quota A ENPAM e la Quota B sull'intramoenia e sulle attività equiparate (prestazioni aggiuntive). L'IRPEF su stipendio e intramoenia è già trattenuta in busta dall'azienda.</p>
 <div class="grid">
  <div class="box c-tax"><h3>Quota B ${Y} · intramoenia</h3><dl class="kv">
   ${kv("Intramoenia e prestazioni aggiuntive (lordo) <small>dalla tabella sopra</small>",out(c+".tot.intra","eur","lnk"))}
   ${kv("Reddito già coperto da Quota A <small>esente da Quota B</small>",out(c+".esenteQB"))}
   ${kv("Reddito soggetto a Quota B",out(c+".baseIntra"))}${kv("Aliquota",out(c+".qBintraAliq","pct"))}
   ${kv("Quota B",out(c+".qbIntra","eur","tax"),"strong")}</dl>
   <p class="note">Si dichiara con il Modello D entro il 31/7/${+Y+1} e si paga dal 31/10/${+Y+1}. Il 2% va chiesto con il modulo "Contribuzione ridotta" prima di compilare il Modello D.</p></div>
  <div class="box"><h3>Nella dichiarazione dei redditi</h3><dl class="kv">
   ${kv("Quota A e Quota B pagate nel "+Y+" <small>contributi previdenziali obbligatori, deducibili nel 730</small>",'<span class="chip">Da verificare</span>')}</dl>
   <p class="note">I contributi ENPAM versati nell'anno (Quota A ${Y}, rate di Quota B degli anni precedenti) dovrebbero ridurre l'imponibile IRPEF nel 730 ${+Y+1}: conserva le quietanze.</p></div>
 </div>
 </div></details>
</section>`;}

 const sens=T.sens.map((x,j)=>`<tr class="${x.sel?"hl":""}"><td>${fN.format(x.k)} / ${fN.format(+(12-x.k).toFixed(2))}${x.sel?' <span class="chip auto">impostato</span>':""}${x.k===0?' <span class="muted">aliquota piena su tutto</span>':""}</td><td>${out(`${c}.sens.${j}.aliq`,"pct")}</td><td>${out(`${c}.sens.${j}.qb`,"eur","tax")}</td></tr>`).join("");
 return `<section class="sheet">
 ${taxPayBox()}
 <div class="sheet-h"><h2>Tasse ${Y} · forfettario ed ENPAM</h2>${yearBar()}<p>Imposta sostitutiva e contributi ENPAM sugli incassi da libera professione del ${Y}.</p></div>
 <div class="hero">
  <div class="tile t-tax"><span class="l">Tasse totali ${Y}</span><span class="v">${out(c+".tasse")}</span><span class="s">ENPAM + imposta sostitutiva</span></div>
  <div class="tile"><span class="l">Contributi ENPAM</span><span class="v">${out(c+".con")}</span><span class="s">Quota A ${out(c+".qa")} · Quota B ${out(c+".qb")}</span></div>
  <div class="tile"><span class="l">Imposta sostitutiva</span><span class="v">${out(c+".imposta")}</span><span class="s">aliquota ${out(c+".sostAliq","pct")}</span></div>
  <div class="tile t-liq"><span class="l">Da accantonare al mese</span><span class="v">${out(c+".mens")}</span><span class="s">${out(c+".pct","pct")} degli incassi LP</span></div>
 </div>
 ${T.tot.intra>0||+Y>=2026?intraBox(Y,c):""}
 ${calcOpen(`Come sono calcolate le tasse ${Y}`)}
  <p class="note">Calcolate sugli incassi da libera professione del ${Y} (scheda Entrate) con i parametri del ${Y}. Nel forfettario i contributi si deducono per cassa: conta quanto versi nell'anno (Quota A ${Y} e Quota B sui redditi ${Y-1}), non la Quota B che maturi sul reddito ${Y}: quella si paga dal 31/10/${Y+1} e si deduce nell'anno in cui la versi.</p>
  <div class="grid">
  <div class="box"><h3><span class="stp">1</span>Base imponibile</h3><dl class="kv">${kv("Incassi libera professione",out(c+".tot.lp","eur","lnk"))}${kv("Coefficiente di redditività",out(c+".coeff","pct"))}${kv("Imponibile lordo",out(c+".imp"),"strong")}</dl></div>
  <div class="box c-tax"><h3><span class="stp">2</span>Contributi ENPAM ${Y}</h3><dl class="kv">${kv("Quota A",out(c+".qa","eur","tax"))}${kv("Reddito già coperto da Quota A <small>esente da Quota B</small>",out(c+".esenteQB"))}${kv("Reddito LP soggetto a Quota B",out(c+".baseQB"))}${kv("Quota B su LP <small>aliquota pesata "+out(c+".aliq","pct")+"</small>",out(c+".qbLP","eur","tax"))}${kv("Quota B su intramoenia <small>"+out(c+".qBintraAliq","pct")+" su "+out(c+".baseIntra")+"</small>",out(c+".qbIntra","eur","tax"))}${kv("Quota B totale"+(T.qbReale?" <small>dato reale: somma delle rate ENPAM</small>":""),out(c+".qb","eur","tax"))}${kv("Totale contributi ENPAM",out(c+".con","eur","tax"),"strong")}</dl></div>
  <div class="box c-tax"><h3><span class="stp">3</span>Imposta sostitutiva ${Y}</h3><dl class="kv">${kv(`Contributi ENPAM versati nel ${Y} <small>deducibili per cassa: Quota A ${Y} (rate apr-nov) + Quota B ${Y-1} (dal 31/10/${Y}), se pagate entro il 31/12</small>`,out(c+".vers"))}${kv("Imponibile <small>dopo deduzione contributi versati</small>",out(c+".impI"))}${kv("Aliquota",out(c+".sostAliq","pct"))}${kv("Imposta sostitutiva"+(T.impReale?" <small>dato reale: importo versato</small>":""),out(c+".imposta","eur","tax"),"strong")}</dl></div>
  <div class="box c-tax"><h3><span class="stp">4</span>Totale e accantonamento</h3><dl class="kv">${kv("Tasse totali (ENPAM + imposta)",out(c+".tasse","eur","tax"),"strong")}${kv("Da accantonare ogni mese",out(c+".mens","eur","tax"))}${kv("% degli incassi LP",out(c+".pct","pct"))}</dl></div>
  </div>
 <div class="box c-tax"><h3><span class="stp">+</span>Sensibilità Quota B · mesi ad aliquota ridotta / piena</h3>
  <div class="tbl-wrap flat"><table><thead><tr><th>Mesi ridotta / piena</th><th>Aliquota pesata</th><th>Quota B</th></tr></thead><tbody>${sens}</tbody></table></div>
  <p class="note">I mesi ad aliquota ridotta si impostano in Parametri (accetta decimali, es. 10,33 per il pro-rata in giorni). Per il 2025 ENPAM potrebbe arrotondare in dodicesimi: verifica sul Modello D. Riferimento: <a href="https://www.giornaleprevidenza.it/previdenza-e-assistenza/quando-pago-la-quota-b-ridotta/" target="_blank" rel="noopener">Giornale della Previdenza ENPAM</a>.</p></div>
 </div></details>
</section>`;
};

V.parametri=()=>{
 const ys=yearsOf(S.anni),pi=p=>`<span class="pct-in">${inp(p,"pct")}<span class="muted">%</span></span>`;
 const row=y=>`<tr><td>${y}</td><td>${pi(`anni.${y}.coeff`)}</td><td>${pi(`anni.${y}.sost`)}</td><td>${inp(`anni.${y}.qA`)}</td><td>${pi(`anni.${y}.qBpiena`)}</td><td>${pi(`anni.${y}.qBrid`)}</td><td>${inp(`anni.${y}.mesiRid`,"dec")}</td><td>${pi(`anni.${y}.qBintra`)}</td><td>${inp(`anni.${y}.esenteQB`)}</td><td>${out(`anni.${y}.aliq`,"pct")}</td><td>${inp(`anni.${y}.contribVers`,"num","auto")}<span class="sub">auto: ${out(`anni.${y}.versAuto`)}</span></td><td>${out(`anni.${y}.lpMesi`,"num")}</td></tr>`;
 return `<section class="sheet">
 <div class="sheet-h"><h2>Parametri fiscali e previdenziali</h2><p>Una riga per anno: per un anno nuovo basta aggiungere una riga, che parte dai valori dell'anno prima.</p>
 <div class="legenda"><span><i class="sw"></i>Input modificabile</span><span>Formula (nero)</span><span class="lnk">Incassi e guadagni</span><span class="tax">Valori delle tasse</span></div></div>
 <div class="tbl-wrap"><table class="par"><thead><tr><th>Anno</th><th>Coeff. redditività</th><th>Imposta sostitutiva</th><th>Quota A ENPAM €</th><th>Quota B piena</th><th>Quota B ridotta</th><th>Mesi a Quota B ridotta</th><th>Quota B intramoenia</th><th>Reddito coperto da Quota A (esente Quota B) €</th><th>Aliquota Quota B pesata</th><th>Contributi ENPAM versati nell'anno (deducibili)</th><th>Mesi con incassi LP (dai dati)</th></tr></thead><tbody>${ys.map(row).join("")}</tbody></table></div>
 <div class="actions"><button class="btn" data-act="add-anno" data-y="${ys[ys.length-1]+1}" ${READONLY?"disabled":""}>+ Aggiungi ${ys[ys.length-1]+1}</button></div>
 <p class="note">Mesi a Quota B ridotta: 2025 = mesi da specializzando (10 nel foglio); 2026 = impostato a 6 come nel foglio originale; il periodo da libero professionista è gennaio-luglio (7 mesi), con incassi in 6 mesi (aprile senza incassi). Il valore resta quello impostato: la colonna "dai dati" è solo un controllo. Quota A 2026: 676,48 € (4 rate da 169,12 €, importo ufficiale ENPAM).</p>
 <div class="grid">
  <div class="box c-good"><h3>Guardia medica (convenzione SSN)</h3><dl class="kv">
   ${kv("Aliquota ENPAM trattenuta da ASL <small>tipicamente 2%, verifica su CU</small>",pi("globali.gmEnpam"))}${kv("IRPEF stimata su GM in dichiarazione",pi("globali.gmIrpef"))}</dl></div>
  <div class="box c-inv"><h3>Investimenti · fiscalità finanziaria</h3><dl class="kv">
   ${kv("IVAFE su titoli esteri <small>annua sulla giacenza Revolut</small>",pi("globali.ivafe"))}
   ${kv("Aliquota redditi da ETF/fondi <small>plusvalenze = redditi di capitale, non compensabili; 12,5% sulla quota titoli di Stato white-list</small>",pi("globali.plus"))}
   ${kv("Regime Fineco (fondo)",'<span>Amministrato</span>')}${kv("Regime Revolut (ETF PAC)",'<span>Dichiarativo</span>')}</dl></div>
  <div class="box c-tax"><h3>ENPAM · altri limiti</h3><dl class="kv">${kv("Tetto reddito Quota B <small>sopra tetto: 1%; non usato nei calcoli</small>",inp("globali.tettoQB"))}</dl></div>
  <div class="box"><h3>Tipologie di reddito</h3><dl class="kv">
   ${kv("Libera professione (P.IVA) <small>imponibile = coeff. × incassi; imposta su imponibile − contributi</small>",'<span>Forfettario</span>')}
   ${kv("Guardia medica <small>già tassata da ASL, fuori dal forfettario</small>","<span>Sostituto d'imposta</span>")}
   ${kv("Stipendio SSN <small>IRPEF e contributi trattenuti in busta</small>","<span>Sostituto d'imposta</span>")}
   ${kv("Borsa specializzazione <small>art. 4 L. 257/1991</small>",'<span>Esente IRPEF</span>')}</dl></div>
  <div class="box c-good"><h3>Lavoro dipendente SSN</h3><dl class="kv">
   ${kv("Ultimo mese di libera professione <small>da agosto 2026 dipendente a tempo indeterminato</small>",'<span>Luglio 2026</span>')}
   ${kv("Soglia redditi dipendente per forfettario <small>€ 35.000 per 2025-2026; € 30.000 a regime</small>",inp("globali.soglia"))}</dl></div>
 </div></section>`;
};

/* ================= grafico ================= */
function bars(id,vals){const el=document.getElementById(id);if(!el)return;const t=vals.reduce((x,y)=>x+Math.max(0,y),0);
 [...el.children].forEach((c,i)=>{c.style.width=t>0?(Math.max(0,vals[i])/t*100)+"%":"0";});}
/* entrate e uscite mese per mese (anno PY): barra entrate + barra uscite impilata */
function esChart(id="eschart"){
 const el=document.getElementById(id);if(!el||!R.sv)return;const sv=R.sv,P=k=>i=>Math.max(n(sv[k][i]),0);
 const W=480,H=250,L=40,Rm=8,T=12,B=24,pw=W-L-Rm,ph=H-T-B,slot=pw/12,bw=Math.min(14,slot*.36);
 const out_=i=>P("spese")(i)+P("fisse")(i)+P("tasse")(i)+P("prest")(i);
 const PJ={};{const P=proj();if(P)P.mesi.forEach(x=>{if(+x.ym.slice(0,4)===+R.PY)PJ[+x.ym.slice(5)-1]=x;});}
 const mx=Math.max(1000,...MESI.map((_,i)=>Math.max(n(sv.ent[i]),out_(i),PJ[i]&&sv.ent[i]==null?Math.max(PJ[i].ent,PJ[i].usc):0)));const st=mx>8000?2000:1000,top=Math.ceil(mx/st)*st;
 const y=v=>T+ph-v/top*ph;
 let g=`<defs><pattern id="${id}-htx" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" style="fill:var(--c-ent)"/><rect width="2.4" height="5" style="fill:var(--c-tasse)"/></pattern></defs>`;for(let v=0;v<=top;v+=st)g+=`<line x1="${L}" x2="${W-Rm}" y1="${y(v)}" y2="${y(v)}" style="stroke:var(--line)" ${v?'stroke-dasharray="3 4"':''}/><text x="${L-5}" y="${y(v)+4}" text-anchor="end">${fN.format(v/1000)}k</text>`;
 let bs="";MESI.forEach((m,i)=>{const cx=L+slot*i+slot/2;g+=`<text x="${cx}" y="${H-6}" text-anchor="middle">${m.slice(0,1)}</text>`;
  if(sv.ent[i]==null&&PJ[i]){/* v51: mese stimato (proiezione): barre chiare tratteggiate */const x=PJ[i];
   const tp=`${m} (stima): entrate ${fmt(x.ent)} · uscite ${fmt(x.usc)} (tasse ${fmt(x.tas)}, spese fisse ${fmt(x.fis)}, variabili ${fmt(x.vari)}) · surplus ${fmt(x.sur,"sign")}`;
   bs+=`<rect class="pj" x="${cx-bw-1}" y="${y(x.ent)}" width="${bw}" height="${Math.max(1,y(0)-y(x.ent))}" rx="2" style="fill:var(--c-ent);stroke:var(--c-ent)" data-tip="${esc(tp)}"><title>${esc(tp)}</title></rect>`;
   let ac=0;[[x.vari,"--c-spese"],[x.fis,"--c-aff"],[x.prest||0,"--qa"],[x.tas,"--c-tasse"]].forEach(([v,c])=>{if(!(v>0))return;bs+=`<rect class="pj" x="${cx+1}" y="${y(ac+v)}" width="${bw}" height="${Math.max(1,y(ac)-y(ac+v))}" style="fill:var(${c});stroke:var(${c})" data-tip="${esc(tp)}"><title>${esc(tp)}</title></rect>`;ac+=v;});return;}
  if(sv.ent[i]==null)return;
  const cs=P("casa")(i),pr=P("prest")(i),rs=Math.max(out_(i)-P("tasse")(i)-cs-pr,0);
  const tip=`${m}: entrate ${fmt(sv.ent[i])}${n(sv.acc[i])>0?` (di cui per tasse future ${fmt(sv.acc[i])})`:""} · uscite ${fmt(out_(i))} (tasse ${fmt(sv.tasse[i])}, affitto e utenze ${fmt(cs)}${pr?`, prestiti ${fmt(pr)}`:""}, resto ${fmt(rs)}) · investito ${fmt(sv.inv[i])} · surplus ${fmt(sv.risp[i],"sign")}`;
  const e=n(sv.ent[i]);bs+=`<rect x="${cx-bw-1}" y="${y(e)}" width="${bw}" height="${Math.max(1,y(0)-y(e))}" rx="2" style="fill:var(--c-ent)" data-tip="${esc(tip)}"><title>${esc(tip)}</title></rect>`;
  /* v49 (richiesta di Marco): in cima alla colonna delle entrate, tratteggiata, la parte destinata alle tasse future =
     tasse maturate sulle entrate di quel mese (sv.acc: 1/12 Quota A + Quota B e imposta maturate nel mese), non la media */
  const ta=Math.min(Math.max(n(sv.acc[i]),0),e);if(ta>0.5)bs+=`<rect x="${cx-bw-1}" y="${y(e)}" width="${bw}" height="${Math.max(1,y(e-ta)-y(e))}" rx="2" fill="url(#${id}-htx)" data-tip="${esc(tip)}"><title>${esc(tip)}</title></rect>`;
  /* v41: uscite impilate come nella legenda: tutto il resto, affitto e utenze, tasse */
  const PV={resto:rs,casa:cs,prest:pr,tasse:P("tasse")(i)};
  let acc=0;[["resto","--c-spese"],["casa","--c-aff"],["prest","--qa"],["tasse","--c-tasse"]].forEach(([k,c])=>{const v=PV[k];if(!v)return;bs+=`<rect x="${cx+1}" y="${y(acc+v)}" width="${bw}" height="${Math.max(1,y(acc)-y(acc+v))}" style="fill:var(${c})" data-tip="${esc(tip)}"><title>${esc(tip)}</title></rect>`;acc+=v;});});
 if(id!=="eschart"){el.innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Entrate e spese mese per mese">${g}${bs}</svg>`;return;}
 el.innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Entrate e spese mese per mese">${g}${bs}</svg><p id="es-tip" aria-live="polite"></p>`;
 el.querySelector("svg").addEventListener("click",ev=>{const r=ev.target.closest("rect[data-tip]");const t=document.getElementById("es-tip");if(t)t.textContent=r?r.dataset.tip:"";});}
/* tabella del risparmio mese per mese: vista Sintesi / Dettaglio, righe cliccabili verso il Resoconto mensile */
let SVV="sint",SVT_OPEN=true;
const fN0=new Intl.NumberFormat("it-IT",{useGrouping:"always",maximumFractionDigits:0});
const mLbl=i=>`<span class="mfull">${MESI[i]}</span><span class="mshort">${MESI[i].slice(0,3)}</span>`;
function svTable(){const sv=R.sv,PY=R.PY;if(!sv)return "";
 const ok=sv.risp.map((v,i)=>v!=null?i:-1).filter(i=>i>=0);
 if(!ok.length)return `<p class="muted">Nessun mese con i saldi di inizio e fine mese nel ${PY}.</p>`;
 const lastM=Math.max(ok[ok.length-1],TODAY.slice(0,4)==String(PY)?+TODAY.slice(5,7)-1:11);
 const det=SVV==="det",pad=i=>String(i+1).padStart(2,"0");
 const usc=i=>sv.ent[i]-sv.risp[i];
 const sgn=v=>`<span class="${v<0?"neg":v>0?"pos":""}">${fs0(v)}</span>`;
 const f0=v=>(det?fmt(v):fN0.format(Math.round(n(v)))),fs0=v=>(det?fmt(v,"sign"):(v>0?"+":"")+fN0.format(Math.round(n(v))));
 const c=(v,cl)=>Math.abs(n(v))<0.005?`<span class="muted">—</span>`:`<span class="${cl}">${f0(v)}</span>`;
 const bar=t=>{const p=t==null?0:Math.min(1,Math.abs(t));return `<span class="tbar"><i style="width:${(p*100).toFixed(0)}%;background:var(${t<0?"--c-spese":"--c-risp"})"></i></span>`;};
 const best=ok.reduce((a,i)=>sv.rn[i]>sv.rn[a]?i:a,ok[0]);
 const hasA=n(sv.ytd&&sv.ytd.aff)>0;
 const hasP=n(sv.ytd&&sv.ytd.prest)>0;
 const cols=det?[["Entrate"],["Spese di vita"],...(hasA?[["Affitto"],["Altre fisse"]]:[["Spese fisse"]]),...(hasP?[["Prestiti"]]:[]),["Tasse pagate"],["Risparmio"],["Tasso"],["Da accantonare"],["Risparmio netto"]]:[["Entrate €"],["Uscite €"],["Risparmio €"],["Tasso"],["Tasse da parte €"]];
 const cells=i=>det?[c(sv.ent[i],"nt-ent"),c(sv.spese[i],"nt-spese"),...(hasA?[c(sv.aff[i],"nt-aff"),c(n(sv.fisse[i])-n(sv.aff[i]),"nt-spese")]:[c(sv.fisse[i],"nt-spese")]),...(hasP?[c(sv.prest[i],"nt-tasse")]:[]),c(sv.tasse[i],"nt-tasse"),sgn(sv.risp[i]),fmt(sv.tasso[i],"pct1")+bar(sv.tasso[i]),c(sv.acc[i],"nt-tasse"),sgn(sv.rn[i])]
  :[c(sv.ent[i],"nt-ent"),c(usc(i),"nt-spese"),sgn(sv.risp[i]),fmt(sv.tasso[i],"pct1")+bar(sv.tasso[i]),c(sv.acc[i],"nt-tasse")];
 const head=det?`<tr class="grp"><th rowspan="2">Mese</th><th rowspan="2">Entrate</th><th colspan="${(hasA?4:3)+(hasP?1:0)}">Uscite</th><th colspan="4">Risparmio</th><th rowspan="2" class="go" aria-label="Apri"></th></tr><tr class="grp2">${cols.slice(1).map(x=>`<th>${x[0]}</th>`).join("")}</tr>`
  :`<tr><th>Mese</th>${cols.map(x=>`<th>${x[0]}</th>`).join("")}<th class="go" aria-label="Apri"></th></tr>`;
 let rows="";for(let i=0;i<=Math.min(lastM,11);i++){
  if(sv.risp[i]==null){rows+=`<tr class="nod"><td>${mLbl(i)}</td><td colspan="${cols.length+1}" class="nodt">${`${PY}-${pad(i)}`===TODAY.slice(0,7)?"mese in corso: si completa con il saldo di fine mese":"saldi mancanti in Patrimonio"}</td></tr>`;continue;}
  rows+=`<tr class="lk${i===best?" best":""}" data-act="go" data-tab="mese" data-mm="${PY}-${pad(i)}" tabindex="0" title="Apri il resoconto di ${MESI[i].toLowerCase()} ${PY}"><td>${mLbl(i)}${i===best?' <small class="bst">migliore</small>':""}</td>${cells(i).map(x=>`<td>${x}</td>`).join("")}<td class="go">›</td></tr>`;}
 const Y=sv.ytd,k=ok.length,av=v=>v/k;
 const tot=det?[c(Y.ent,"nt-ent"),c(Y.spese,"nt-spese"),...(hasA?[c(Y.aff,"nt-aff"),c(Y.fisse-Y.aff,"nt-spese")]:[c(Y.fisse,"nt-spese")]),...(hasP?[c(Y.prest,"nt-tasse")]:[]),c(Y.tasse,"nt-tasse"),sgn(Y.risp),fmt(Y.tasso,"pct1"),c(Y.acc,"nt-tasse"),sgn(Y.rn)]:[c(Y.ent,"nt-ent"),c(Y.ent-Y.risp,"nt-spese"),sgn(Y.risp),fmt(Y.tasso,"pct1"),c(Y.acc,"nt-tasse")];
 const med=det?[c(av(Y.ent),"nt-ent"),c(av(Y.spese),"nt-spese"),...(hasA?[c(av(Y.aff),"nt-aff"),c(av(Y.fisse-Y.aff),"nt-spese")]:[c(av(Y.fisse),"nt-spese")]),...(hasP?[c(av(Y.prest),"nt-tasse")]:[]),c(av(Y.tasse),"nt-tasse"),sgn(av(Y.risp)),"",c(av(Y.acc),"nt-tasse"),sgn(av(Y.rn))]:[c(av(Y.ent),"nt-ent"),c(av(Y.ent-Y.risp),"nt-spese"),sgn(av(Y.risp)),"",c(av(Y.acc),"nt-tasse")];
 return `<details class="more svt" id="svt-det" ${SVT_OPEN?"open":""}><summary>Tabella mese per mese</summary>
  <div class="svt-bar"><div class="seg sm" role="tablist" aria-label="Colonne">${[["sint","Sintesi"],["det","Dettaglio"]].map(([v,l])=>`<button class="segb" data-act="svv" data-v="${v}" aria-selected="${v===SVV}">${l}</button>`).join("")}</div><span class="muted svt-h">${det?"Scorri di lato per tutte le colonne · ":""}Tocca un mese per il resoconto</span></div>
  <div class="tbl-wrap flat"><table class="sv2${det?" det":""}"><thead>${head}</thead><tbody>${rows}</tbody>
  <tfoot><tr class="tot"><td>Totale<small class="yr"> ${PY}</small></td>${tot.map(x=>`<td>${x}</td>`).join("")}<td></td></tr><tr class="avg"><td>Media<span class="mfull"> mensile</span> <small>${k} ${k===1?"mese":"mesi"}</small></td>${med.map(x=>`<td>${x}</td>`).join("")}<td></td></tr></tfoot></table></div></details>`;}

function pvChart(){
 const el=document.getElementById("pvchart");if(!el||!R.pv)return;const M=R.pv.mesi;
 if(R.pv.ent==null||R.pv.spe==null){el.innerHTML='<p class="note">Servono almeno un paio di mesi di saldi ed entrate per stimare entrate e spese, oppure inseriscile qui sotto.</p>';return;}
 const W=660,H=240,L=52,Rm=46,T=14,B=26,pw=W-L-Rm,ph=H-T-B,slot=pw/12,bw=Math.min(28,slot*.6);
 const nets=M.map(x=>x.net),mx=Math.max(1,...nets.map(Math.abs));const top=Math.ceil(mx/500)*500;
 const y=v=>T+ph/2-(v/top)*(ph/2);
 const liqs=M.map(x=>x.liq),lmin=Math.min(...liqs),lmax=Math.max(...liqs),pad=(lmax-lmin)*.15||1000;
 const ly=v=>T+ph-((v-(lmin-pad))/((lmax+pad)-(lmin-pad)))*ph;
 let g=`<line x1="${L}" x2="${W-Rm}" y1="${y(0)}" y2="${y(0)}" style="stroke:var(--line)"/>`;
 [top,-top].forEach(v=>{g+=`<line x1="${L}" x2="${W-Rm}" y1="${y(v)}" y2="${y(v)}" style="stroke:var(--line)" stroke-dasharray="3 4"/><text x="${L-6}" y="${y(v)+4}" text-anchor="end">${v>0?"+":""}${fN.format(v)}</text>`;});
 g+=`<text x="${L-6}" y="${y(0)+4}" text-anchor="end">0</text>`;
 let bs="",pts=[];
 M.forEach((x,i)=>{const cx=L+slot*i+slot/2,h=Math.abs(y(x.net)-y(0));
  bs+=`<rect x="${cx-bw/2}" y="${x.net>=0?y(x.net):y(0)}" width="${bw}" height="${Math.max(h,1)}" rx="3" style="fill:var(${x.net>=0?"--good":"--tax"})"><title>${x.lbl}: ${fmt(x.net,"sign")} (tasse ${fmt(x.fiscT)}, spese fisse ${fmt(x.fisse)})</title></rect>`;
  g+=`<text x="${cx}" y="${H-8}" text-anchor="middle">${x.lbl}</text>`;pts.push(`${cx.toFixed(1)},${ly(x.liq).toFixed(1)}`);});
 const line=`<polyline points="${pts.join(" ")}" fill="none" style="stroke:var(--liq)" stroke-width="2.5" stroke-linejoin="round"/>`;
 const last=M[M.length-1];
 const lab=`<text x="${W-Rm+4}" y="${ly(last.liq)+4}" style="fill:var(--liq-t);font-weight:600">${Math.round(last.liq/1000)}k</text><text x="${W-Rm+4}" y="${ly(M[0].liq)+4}" style="fill:var(--liq-t)">${Math.round(M[0].liq/1000)}k</text>`;
 el.innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Previsione di cassa">${g}${bs}${line}${lab}</svg>`;
}


/* ================= rendering e binding ================= */
let current="dashboard";
function renderTabs(){const n=document.querySelector("nav.tabs"),t=document.getElementById("tabs"),par=document.getElementById("hdr-par");
 const pa=parentOf(current),lbl=k=>(TABS.find(x=>x[0]===k)||[])[1]||"";
 n.hidden=current==="home";if(par)par.hidden=parentOf(current)!=="dashboard"&&current!=="dashboard";{const sy=document.getElementById("hdr-sync");if(sy)sy.hidden=current==="collegamenti";}
 document.body.dataset.sez=current==="home"?"home":current==="collegamenti"?"":(DASHES.includes(current)?current:pa);
 t.innerHTML=current==="home"?"":`<a class="back" href="#${pa}" id="back" aria-label="Torna a ${lbl(pa)}"><span aria-hidden="true">‹</span> ${lbl(pa)}</a><span class="crumb">${lbl(current)}</span>`;}
function fillInputs(force){
 document.querySelectorAll("#view [data-i]").forEach(el=>{
  if(!force&&el===document.activeElement)return;
  const v=getP(S,el.dataset.i),k=el.dataset.k;
  if(k==="bool"){const mm=el.dataset.i.match(/^scadenzario\.(\d+)\.pagato$/);el.checked=mm?paidOf(S.scadenzario[+mm[1]]):!!v;el.disabled=READONLY;return;}
  if(k==="sel"){el.value=v||(el.querySelector('option[value=""]')?"":"altro");el.disabled=READONLY;return;}
  if(k==="mese"){el.value=String(v||1);el.disabled=READONLY;return;}
  if(k==="cell"){const e=cellEntries(+el.dataset.y,+el.dataset.m,el.dataset.f);el.value=e.length?showIn(sum(e.map(i=>S.registro[i].importo)),"num"):"";el.readOnly=READONLY;el.classList.remove("bad");return;}
  if(k==="rif"){el.value=v&&v.tipo&&v.anno!=null?`${v.tipo}:${v.anno}`:":";el.disabled=READONLY;return;}
  el.value=(k==="text"||k==="date")?(v||""):showIn(v,k);el.classList.remove("bad");el.readOnly=READONLY;});
}
function updateOutputs(){
 R=calc(S);
 {const pp=document.getElementById("ppie");if(pp&&location.hash.slice(1)==="patrimonio")pp.outerHTML=patPie(UY);}
 document.querySelectorAll("[data-o]").forEach(el=>{const v=getP(R,el.dataset.o);el.textContent=(v===0&&el.classList.contains("zd"))?"—":fmt(v,el.dataset.f);el.classList.toggle("zero",v===0||v==null);
  if(el.dataset.f==="sign"||el.dataset.f==="pctS"){el.classList.toggle("pos",v>0);el.classList.toggle("neg",v<0);}});
 document.querySelectorAll('[data-i$=".importo"][data-i^="scadenzario"]').forEach(el=>{const i=+el.dataset.i.split(".")[1],r=R.deb.rows[i];el.placeholder=r&&r.auto!=null?"auto":"";});
 const hasData=S.registro.length>0||Object.values(S.patrimonio).some(rows=>rows.some(x=>x.fineco!=null||x.revolut!=null));
 const b=document.getElementById("empty-banner");if(b)b.hidden=hasData;
 const C=R.anni[R.TY];
 if(R.tp&&TPY&&R.tp.byYear[TPY]&&document.getElementById("tpbar")){const Y=R.tp.byYear[TPY];bars("tpbar",[Y.pag,Y.res]);}
 if(C&&R.comp)bars("taxbar",["qa","qb","imp"].flatMap(k=>[R.comp[k].pag,R.comp[k].res]));
 document.querySelectorAll("[data-w]").forEach(el=>{const o=getP(R,el.dataset.w);const r=o&&o.tot>0?Math.min(o.res/o.tot*100,100):0;el.children[0].style.width=(o&&o.tot>0?100-r:0)+"%";el.children[1].style.width=r+"%";});bars("invbar",[R.dash.fondo,R.dash.etf]);bars("liqbar",[R.dash.fineco,R.dash.revolut]);
 {const y=R.deb.curY,pg=R.deb.perAnnoFP[y]||0,tt=R.deb.perAnnoFT[y]||0;bars("taxcurbar",[pg,Math.max(tt-pg,0)]);const el=document.getElementById("taxcurpct");if(el)el.textContent=tt>0?Math.round(pg/tt*100)+"%":"—";}pvChart();esChart();esChart("eschart-d");
}
function render(){
 TODAY=new Date().toLocaleDateString("sv-SE");
 let h=(location.hash||"").slice(1).split("?")[0];if(h==="movimenti")h="mese";current=TABS.some(t=>t[0]===h)?h:"home";
 R=calc(S);if(UY==null||!allYears().includes(UY))UY=R.PY;
 renderTabs();if(current==="sondaggi"&&document.getElementById("sv-frame"))return; // l'app sondaggi resta aperta com'è
 document.getElementById("view").innerHTML=(OLD_APP?`<div class="banner neg-b"><b>App da aggiornare.</b> L'ultimo backup sul PC è stato salvato da una versione più nuova del Gestionale (v${OLD_APP}; questa è la v${APP_VER}). Per non perdere dati questa copia non manda backup finché non la aggiorni. <button class="btn sm" data-act="reload">Ricarica l'app</button></div>`:"")+V[current]();if(current==="sondaggi")svFrameInit();if(current==="mese")movFiltra();psubInit();fillInputs(true);updateOutputs();
}
/* sotto-sezioni della scheda principale: chiuse di default; 1° tocco apre, 2° tocco apre la scheda; la freccia richiude */
const PSOPEN=new Set();
function psubInit(){document.querySelectorAll("#view a.psub").forEach(el=>{const h=el.querySelector("h4");if(!h)return;
  const k=(h.firstChild&&h.firstChild.textContent||"").trim();el.dataset.k=k;const op=PSOPEN.has(k);el.classList.toggle("open",op);el.setAttribute("aria-expanded",op?"true":"false");
  const c=el.querySelector("[data-psum]")||el.querySelector("svg text.pc1"),r=document.createElement("span");r.className="pr";
  const cat=/^Liquidit/.test(k)?"liq":/^Investimenti/.test(k)?"inv":/^Tasse/.test(k)?"tasse":/^Scadenze/.test(k)?"spese":/^(Uso delle entrate|Entrate)/.test(k)?"ent":/^Andamento/.test(k)?(/^[−-]/.test((c&&c.textContent||"").trim())?"spese":"risp"):"",col=cat?`var(--t-${cat})`:"";if(c&&col)c.style.fill=col;
  r.innerHTML=`${c?`<span class="psum"${col?` style="color:${col}"`:""}>${c.textContent}</span>`:""}<span class="chev" data-act="ptog" role="button" aria-label="Apri o chiudi">›</span>`;h.appendChild(r);
  const t=document.createElement("span");t.className="phint";t.textContent="Tocca di nuovo per aprire la scheda ›";el.appendChild(t);});}
let GOTO=null;
function landGoto(){const g=GOTO;GOTO=null;if(!g){if((DASHES.includes(current)||current==="home")&&DASH_Y!=null){const y=DASH_Y;DASH_Y=null;requestAnimationFrame(()=>window.scrollTo(0,y));}else window.scrollTo(0,0);return;}
 requestAnimationFrame(()=>{let t=null,fl=[];
  if(g.ym){t=document.querySelector(`.mcard[data-ym="${g.ym}"]`)||document.querySelector(".mgrid");}
  else if(g.to)t=document.getElementById(g.to);
  else if(g.pt)t=document.querySelector(".pseg");
  if(!t){window.scrollTo(0,0);return;}
  t.scrollIntoView({behavior:"smooth",block:fl.length?"center":"start"});
  (fl.length?fl:[t.closest(".box")||t]).forEach(e=>{e.classList.remove("flash");void e.offsetWidth;e.classList.add("flash");});});}
function go(b){const d=b.dataset;
 if(d.pt){PT=d.pt;UY=R.PY;}
 if(d.ym)SY=d.ym.slice(0,4),EDIT=null;
 if(d.tpy)TPY=String(d.tpy);
 if(d.mm)MM=d.mm;
 if(d.uy)UY=+d.uy;
 GOTO={ym:d.ym,to:d.to,pt:d.pt};
 if((location.hash||"#home").slice(1)===d.tab){render();landGoto();}else location.hash=d.tab;}
/* navigazione: la dashboard è la home; dalle schede si torna indietro col pulsante «‹ Dashboard» (o col tasto indietro del telefono) */
let FROM=null,DASH_Y=null;const DASH_YS={};
window.addEventListener("hashchange",e=>{let old="home";try{old=(new URL(e.oldURL).hash||"#home").slice(1)||"home";}catch(_){}
 FROM=old;if(DASHES.includes(old)||old==="home")DASH_YS[old]=window.scrollY;
 const cur=(location.hash||"#home").slice(1);if((DASHES.includes(cur)||cur==="home")&&parentOf(old)===cur)DASH_Y=DASH_YS[cur]??null;else DASH_Y=null;
 render();landGoto();});
document.getElementById("tabs").addEventListener("click",e=>{if(!e.target.closest("#back"))return;e.preventDefault();
 const pa=parentOf(current)||"home";if(FROM===pa&&history.length>1)history.back();else location.hash=pa;});
const view=document.getElementById("view");
view.addEventListener("keydown",e=>{const r=e.target.closest&&e.target.closest("tr.lk");if(r&&(e.key==="Enter"||e.key===" ")){e.preventDefault();go(r);}});
view.addEventListener("change",e=>{const t=e.target;if(!t.classList||!t.classList.contains("ric-da")||READONLY)return;
 const r=S.ricorrenti[+t.dataset.idx];if(!r||!/^\d{4}-\d{2}$/.test(t.value)){render();return;}
 r.da=t.value;r.esclusi=r.esclusi.filter(x=>typeof x!=="string"||x>=r.da);ensureRic(S);render();scheduleSave();});
view.addEventListener("keydown",e=>{const t=e.target;if(t.classList&&(t.classList.contains("lk")||t.classList.contains("mvr-m")||t.classList.contains("avg-c"))&&(e.key==="Enter"||e.key===" ")){e.preventDefault();t.click();}});
/* scorrimento laterale sul grafico del resoconto = mese prima/dopo */
let MCH_X=null;
view.addEventListener("touchstart",e=>{MCH_X=e.target.closest(".mch-vp")?[e.touches[0].clientX,e.touches[0].clientY]:null;},{passive:true});
view.addEventListener("touchend",e=>{if(!MCH_X)return;const t=e.changedTouches[0],dx=t.clientX-MCH_X[0],dy=t.clientY-MCH_X[1];MCH_X=null;
 if(Math.abs(dx)<40||Math.abs(dx)<Math.abs(dy)*1.5)return;const b=document.querySelector(`#view .mnav .mbtn:${dx<0?"last":"first"}-of-type`);if(b&&b.dataset.mm){MM=b.dataset.mm;render();}},{passive:true});
view.addEventListener("change",e=>{if(e.target.id==="mm-sel"){MM=e.target.value;render();const s2=document.getElementById("mm-sel");if(s2)s2.focus();}});
view.addEventListener("toggle",e=>{if(e.target.id==="calc-det")CALC_OPEN=e.target.open;if(e.target.id==="notes-det")NOTES_OPEN=e.target.open;if(e.target.id==="svt-det")SVT_OPEN=e.target.open;},true);
view.addEventListener("input",e=>{
 const el=e.target;if(!el.dataset||!el.dataset.i||READONLY)return;
 const k=el.dataset.k;
 if(k==="cell"){const p=parseIt(el.value);if(!p.ok){el.classList.add("bad");return;}el.classList.remove("bad");
   const Y=+el.dataset.y,m=+el.dataset.m,f=el.dataset.f,e=cellEntries(Y,m,f);
   if(f==="ext"||cedCovers(`${Y}-${String(m+1).padStart(2,"0")}`,f)||contiCovers(`${Y}-${String(m+1).padStart(2,"0")}`,f))return;
   if(p.v==null){if(e.length===1)S.registro.splice(e[0],1);}
   else if(e.length===1)S.registro[e[0]].importo=p.v;
   else if(e.length===0){const d=new Date(Y,m+1,0).getDate();S.registro.push({id:uid(),data:`${Y}-${String(m+1).padStart(2,"0")}-${d}`,fonte:f,importo:p.v,nota:"Totale del mese"});}
   updateOutputs();scheduleSave();return;}
 if(k==="mese"){setP(S,el.dataset.i,+el.value);ensureRic(S);updateOutputs();scheduleSave();return;}
 if(k==="rif"){const r=getP(S,el.dataset.i),[t,a]=el.value.split(":");r.tipo=t||"";if(a)r.anno=+a;updateOutputs();scheduleSave();return;}
 if(k==="sel"&&/^ricorrenti\.\d+\.freq$/.test(el.dataset.i)){const t=getP(S,el.dataset.i.replace(/\.freq$/,""));t.freq=el.value==="m"?"m":"a";if(t.freq==="m"){const d=new Date();t.da=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;}ensureRic(S);render();scheduleSave();return;}
 if(k==="bool"||k==="text"||k==="date"||k==="sel"){setP(S,el.dataset.i,k==="bool"?el.checked:el.value);if(el.dataset.i.startsWith("ricorrenti."))ensureRic(S);
   const mm=el.dataset.i.match(/^scadenzario\.(\d+)\.(pagato|scadenza)$/);if(mm){const r=S.scadenzario[+mm[1]];
     if(mm[2]==="pagato"){r.forzaNonPagato=!el.checked&&!!r.scadenza&&SD(r)<=TODAY;}
     if(mm[2]==="scadenza")r.forzaNonPagato=false;
     r.dataPag=paidOf(r)?SD(r):"";const tr=el.closest("tr");if(tr){tr.classList.toggle("paid",paidOf(r));const ap=tr.querySelector(".autop");if(ap)ap.hidden=!autoPaid(r);}
     const cb=tr&&tr.querySelector("input.ck");if(cb)cb.checked=paidOf(r);}
   updateOutputs();scheduleSave();return;}
 const p=parseIt(el.value);if(!p.ok){el.classList.add("bad");return;}
 el.classList.remove("bad");let v=p.v;if(v!=null&&k==="pct")v=v/100;
 if(k==="int"&&v!=null)v=Math.round(v);
 setP(S,el.dataset.i,v);updateOutputs();scheduleSave();
});
view.addEventListener("click",e=>{const b=e.target.closest("[data-act='vinc-add'],[data-act='vinc-del']");if(!b||READONLY)return;e.preventDefault();
 const L=S.vincolato.fineco=S.vincolato.fineco||[];
 if(b.dataset.act==="vinc-del")L.splice(+b.dataset.vi,1);
 else{const da=(document.getElementById("vinc-da")||{}).value||"",p=parseIt((document.getElementById("vinc-v")||{}).value||"");
  if(!/^\d{4}-\d{2}$/.test(da)||!p.ok||p.v==null||p.v<0){const f=document.getElementById(/^\d{4}-\d{2}$/.test(da)?"vinc-v":"vinc-da");if(f)f.focus();return;}
  const j=L.findIndex(r=>r.da===da);if(j>=0)L[j].importo=p.v;else L.push({da,importo:p.v});L.sort((a,c)=>a.da.localeCompare(c.da));}
 applyEstrSaldi();scheduleSave();render();});
view.addEventListener("focusout",e=>{const el=e.target;if(el.dataset&&el.dataset.k==="cell"&&!el.classList.contains("bad")){const e2=cellEntries(+el.dataset.y,+el.dataset.m,el.dataset.f);el.value=e2.length?showIn(sum(e2.map(i=>S.registro[i].importo)),"num"):"";}if(el.dataset&&el.dataset.i&&["num","pct","int","dec"].includes(el.dataset.k)&&!el.classList.contains("bad"))el.value=showIn(getP(S,el.dataset.i),el.dataset.k);});
view.addEventListener("click",e=>{
 const b=e.target.closest("[data-act]");if(!b)return;const a=b.dataset.act,y=+b.dataset.y;
 if(a==="ptog"){e.preventDefault();const ps=b.closest("a.psub");if(ps){const op=!ps.classList.contains("open");ps.classList.toggle("open",op);ps.setAttribute("aria-expanded",op?"true":"false");op?PSOPEN.add(ps.dataset.k):PSOPEN.delete(ps.dataset.k);}return;}
 if(a==="go"&&b.classList.contains("psub")&&!b.classList.contains("open")){e.preventDefault();b.classList.add("open");b.setAttribute("aria-expanded","true");PSOPEN.add(b.dataset.k);return;}
 if(a==="go"){e.preventDefault();go(b);return;}
 if(a==="year"){UY=y;render();return;}
 if(a==="avgt"){const v=b.dataset.v,op=!AVG_T.has(v);op?AVG_T.add(v):AVG_T.delete(v);b.classList.toggle("open",op);b.setAttribute("aria-expanded",op);const pn=document.querySelector(`#avg-box .avg-p[data-p="${v}"]`);if(pn){pn.hidden=!op;if(op)pn.scrollIntoView({behavior:"smooth",block:"nearest"});}return;}
 if(a==="svv"){SVV=b.dataset.v;render();const t=document.getElementById("svt-det");if(t)t.scrollIntoView({block:"nearest"});return;}
 if(a==="mm"){if(b.dataset.mm){MM=b.dataset.mm;render();}return;}
 if(a==="mvrow"){const ed=b.nextElementSibling,op=ed&&ed.hidden;if(ed){ed.hidden=!op;b.setAttribute("aria-expanded",op);if(op){const sl=ed.querySelector("select");if(sl)sl.focus({preventScroll:true});}}return;}
 if(a==="mvleg"){const k=b.dataset.k,pn=b.parentElement.querySelector(`[data-p="${k}"]`),op=!MOV_LEG.has(k);op?MOV_LEG.add(k):MOV_LEG.delete(k);b.setAttribute("aria-expanded",op);if(pn)pn.hidden=!op;return;}
 if(a==="sy"){SY=b.dataset.g;EDIT=null;render();return;}
 if(a==="pt"){PT=b.dataset.v;render();return;}
 if(a==="tpy"){TPY=b.dataset.y;render();return;}
 if(a==="tpv"){TPV=b.dataset.v;render();return;}
 if(a==="edit"&&b.dataset.nav){const r=S.scadenzario.find(x=>x.id===b.dataset.id);EDIT=b.dataset.id;if(r){SY=scadGroup(r);GOTO={ym:SD(r).slice(0,7)};}location.hash="scadenzario";return;}
 if(a==="edit"){EDIT=b.dataset.id;render();const f=document.querySelector("tr.edit input.txt");if(f)f.focus();return;}
 if(a==="done"){EDIT=null;render();return;}
 if(a==="tog"){if(READONLY)return;const r=S.scadenzario.find(x=>x.id===b.dataset.id);
  if(r&&r.lk){if(!confirm(`«${r.voce}» è collegata a un movimento dei conti. Togliere il collegamento? La voce tornerà a «pagata alla scadenza».`))return;S.link=(S.link||[]).filter(l=>!(l.k==="s"&&l.r===r.id));applyLinks();render();scheduleSave();return;}
  if(r){const p=paidOf(r);if(p){r.pagato=false;r.forzaNonPagato=!!r.scadenza&&SD(r)<=TODAY;}else{r.pagato=true;r.forzaNonPagato=false;}r.dataPag=paidOf(r)?SD(r):"";render();scheduleSave();}return;}
 if(READONLY)return;
 if(a==="add-scad"){const t=TODAY.slice(4,10),nr={...scadRow("",+SY||UY,""),scadenza:/^\d{4}$/.test(SY)?SY+t:""};S.scadenzario.push(nr);EDIT=nr.id;}
 else if(a==="del-scad"){const r=S.scadenzario[+b.dataset.idx];if(r&&r.ric){const t=S.ricorrenti.find(x=>x.id===r.ric),k=r.rm||r.anno;if(t&&!t.esclusi.includes(k))t.esclusi.push(k);}S.scadenzario.splice(+b.dataset.idx,1);}
 else if(a==="add-fm"){S.fondoMov.push({id:uid(),data:new Date().toLocaleDateString("sv-SE"),tipo:"acquisto",importo:null,nota:""});}
 else if(a==="del-fm"){S.fondoMov.splice(+b.dataset.idx,1);}
 else if(a==="add-ric"){S.ricorrenti.push({id:"f"+uid(),voce:"",mese:new Date().getMonth()+1,importo:null,variabile:false,esclusi:[],freq:"a",giorno:1,da:"",lav:"",adeb:true,giornoA:0});ensureRic(S);}
 else if(a==="del-ric"){const t=S.ricorrenti.splice(+b.dataset.idx,1)[0];if(t)S.scadenzario=S.scadenzario.filter(r=>r.ric!==t.id||paidOf(r));}
 else if(a==="gen-enpam"){if(!S.scadenzario.some(r=>r.anno===y&&(r.auto==="enpam"||(r.auto==="qa"&&r.frazione<1)))){
   S.scadenzario=S.scadenzario.filter(r=>r.pagato||!(r.auto==="qa"&&r.anno===y));
   ["04-30","06-30","09-30","11-30"].forEach((d,k)=>S.scadenzario.push(scadRow(`Quota A ENPAM ${y} rata ${k+1}/4`,y,"qa",0.25,`${y}-${d}`)));
   if(!S.scadenzario.some(r=>r.auto==="qb"&&r.anno===y-1)&&S.anni[y-1]){const feb=new Date(y+1,2,0).getDate();
     [`${y}-10-31`,`${y}-12-31`,`${y+1}-02-${feb}`,`${y+1}-04-30`,`${y+1}-06-30`].forEach((d,k)=>S.scadenzario.push(scadRow(`Quota B ENPAM ${y-1} rata ${k+1}/5 (SDD)`,y-1,"qb",0.2,d)));}}}
 else if(a==="gen-imp"){if(!S.scadenzario.some(r=>r.anno===y&&r.auto==="imp"))S.scadenzario.push(scadRow(`Imposta sostitutiva ${y}`,y,"imp"));}
 else if(a==="del-mov")S.registro.splice(+b.dataset.idx,1);
 else if(a==="newpy")S.patrimonio[y]=blankPat();
 else if(a==="add-anno"){const ys=yearsOf(S.anni),src=S.anni[ys.filter(v=>v<y).pop()??ys[ys.length-1]];S.anni[y]={...DEF_ANNO,...src,mesiRid:0,contribVers:null};UY=y;}
 else return;
 render();scheduleSave();
});
view.addEventListener("submit",e=>{
 if(e.target.id!=="addmov")return;e.preventDefault();if(READONLY)return;
 const d=document.getElementById("nm-data").value,f=document.getElementById("nm-fonte").value,p=parseIt(document.getElementById("nm-imp").value),nota=document.getElementById("nm-nota").value.trim();
 const msg=document.getElementById("nm-msg");
 if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||!p.ok||p.v==null){msg.hidden=false;msg.textContent="Inserisci una data e un importo validi.";return;}
 if(f==="sond"&&sondCovers(d.slice(0,7))){msg.hidden=false;msg.textContent="I sondaggi di "+MESE_L(d.slice(0,7))+" arrivano dall'app Guadagni sondaggi: registra lì il prelievo.";return;}
 if(f==="ext"){msg.hidden=false;msg.textContent="Le entrate extra arrivano dagli estratti conto: classifica il movimento come «Entrate extra» nel Resoconto mensile.";return;}
 if(cedCovers(d.slice(0,7),f)){msg.hidden=false;msg.textContent="Lo stipendio di "+MESE_L(d.slice(0,7))+" arriva dal cedolino: per correggerlo cambia il PDF nella cartella Cedolini.";return;}
 if(contiCovers(d.slice(0,7),f)){msg.hidden=false;msg.textContent=FN[f]+" di "+MESE_L(d.slice(0,7))+" arriva dagli accrediti collegati negli estratti conto: collega o scollega il movimento nel Resoconto mensile.";return;}
 S.registro.push({id:uid(),data:d,fonte:f,importo:p.v,nota});
 const y=+d.slice(0,4);if(!allYears().includes(y))S.patrimonio[y]=S.patrimonio[y]||blankPat();
 UY=y;render();scheduleSave();
 const m2=document.getElementById("nm-msg");if(m2){m2.hidden=false;m2.textContent=`Aggiunto: ${FN[f]} ${fmt(p.v)} del ${dIt(d)}.`;}
 const f2=document.getElementById("nm-fonte");if(f2)f2.value=f;
});

/* ================= salvataggio sul dispositivo ================= */
/* I dati stanno nel localStorage di questo browser (come le altre web app su marcobaldini94.github.io).
   Ogni modifica viene anche inviata all'Hub su PC2 (Tailscale) come file di backup nuovo. */
const LS_KEY="bilancio-personale-v1",LS_AGG="bilancio-personale-agg";
const HUB_APP="bilancio",HUB_URL_KEY="hub-url",HUB_STATE_KEY="bilancio-hub-stato";
const SOND_LS_KEY="survey-earnings-tracker-v1",SOND_STATE_KEY="bilancio-sond-stato";
const st=document.getElementById("status"),stT=document.getElementById("status-t");
function status(s,t){st.dataset.s=s;stT.textContent=t;}
function lsGet(k){try{return localStorage.getItem(k)}catch(e){return null}}
function lsSet(k,v){try{localStorage.setItem(k,v);return true}catch(e){return false}}
function lsJSON(k){try{return JSON.parse(lsGet(k)||"null")||{}}catch(e){return {}}}
const hhmm=d=>new Date(d).toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"});
function fmtWhen(t){if(!t)return "mai";const d=new Date(t),oggi=new Date().toDateString()===d.toDateString();
 return oggi?"oggi alle "+hhmm(d):d.toLocaleDateString("it-IT",{day:"numeric",month:"short",year:"numeric"})+" alle "+hhmm(d);}
const hasRealData=s=>s.registro.some(r=>!r.ext)||Object.values(s.patrimonio).some(rows=>rows.some(x=>PAT_KEYS.some(k=>x[k]!=null)));
let timer=null,dirty=false;
function scheduleSave(){dirty=true;status("busy","Modifiche in corso…");clearTimeout(timer);timer=setTimeout(save,600);}
function save(){
 clearTimeout(timer);dirty=false;if(!(S.appVer>APP_VER))S.appVer=APP_VER;
 const agg=new Date().toISOString();
 if(lsSet(LS_KEY,JSON.stringify(S))){lsSet(LS_AGG,agg);status("ok","Salvato alle "+hhmm(agg));scheduleHub();}
 else status("err","Salvataggio non riuscito: scarica un backup su file");
}
function replaceState(obj){S=load(obj);save();render();}

/* ================= backup sul PC (Hub via Tailscale) ================= */
function hubUrl(){return (lsGet(HUB_URL_KEY)||"").trim().replace(/\/+$/,"")}
function hubState(){return lsJSON(HUB_STATE_KEY)}
function setHubState(o){lsSet(HUB_STATE_KEY,JSON.stringify(Object.assign(hubState(),o)))}
async function hubFetch(path,opt){
 const url=hubUrl();if(!url)throw new Error("indirizzo non impostato");
 const ctl=new AbortController(),to=setTimeout(()=>ctl.abort(),10000);
 try{const r=await fetch(url+path,Object.assign({signal:ctl.signal,cache:"no-store"},opt||{}));
  let j=null;try{j=await r.json()}catch(e){}
  if(!r.ok)throw new Error((j&&j.errore)||("errore HTTP "+r.status));return j;}
 catch(e){throw new Error(e.name==="AbortError"?"il PC non risponde":(e.message==="Failed to fetch"?"PC non raggiungibile (Tailscale attivo?)":e.message));}
 finally{clearTimeout(to)}}
async function sha(t){try{const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(t));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("")}catch(e){return t.length+":"+t.slice(-64)}}
let hubBusy=false,hubTimer=null;
/* ---- più dispositivi: prima di mandare dati al PC si controlla che nessun altro dispositivo abbia salvato
   una versione più recente (base = ultimo file del PC che questo dispositivo ha visto; syncHash = impronta dei dati
   in quel momento). Se sì: dati locali non modificati -> si adotta la versione del PC; modificati -> si chiede.
   Evita che un dispositivo rimasto indietro sovrascriva il PC con dati vecchi (successo il 05/11/2026). */
const canon=o=>JSON.stringify(o,(k,v)=>v&&typeof v==="object"&&!Array.isArray(v)?Object.keys(v).sort().reduce((a,x)=>(a[x]=v[x],a),{}):v);
let hubPullBusy=false,OLD_APP=0;
async function hubPull(){
 if(hubPullBusy||!hubUrl())return;hubPullBusy=true;
 try{const el=await hubFetch("/api/"+HUB_APP+"/backup/elenco"),latest=(el&&el.file||[])[0],st=hubState();
  if(!latest||latest===st.base)return;
  const r=await hubFetch("/api/"+HUB_APP+"/backup/ultimo");if(!r||!r.dati)return;
  if(+r.dati.appVer>APP_VER){if(!OLD_APP){OLD_APP=+r.dati.appVer;status("err","App da aggiornare: ricarica la pagina");render();}return;}
  let H;try{H=load(fromAnyBackup(r));}catch(e){return;}
  const hHub=await sha(canon(H)),hLoc=await sha(canon(S));
  if(hHub===hLoc){setHubState({base:r.file,syncHash:hLoc});return;}
  const pulito=!hasRealData(S)||(st.syncHash&&st.syncHash===hLoc);
  const quando=(m=>m?`${m[3]}/${m[2]} alle ${m[4]}:${m[5]}`:"?")(/(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})/.exec(r.file||""));
  const qui=lsGet(LS_AGG),voci=x=>`${x.registro.length} movimenti, ${x.scadenzario.length} scadenze, ${x.ricorrenti.length} spese ricorrenti`;
  if(pulito||confirm(`I dati su questo dispositivo sono diversi dall'ultimo backup sul PC (salvato da un altro dispositivo).\n\nPC: salvato il ${quando} · ${voci(H)}\nQuesto dispositivo: modificato ${qui?fmtWhen(Date.parse(qui)):"—"} · ${voci(S)}\n\nOK = usa la versione del PC (scegli questo se qui non hai fatto modifiche)\nAnnulla = tieni i dati di questo dispositivo: diventano il nuovo backup sul PC`)){
   S=H;lsSet(LS_KEY,JSON.stringify(S));lsSet(LS_AGG,new Date().toISOString());
   setHubState({base:r.file,syncHash:await sha(canon(S)),lastHash:""});status("ok","Aggiornato con i dati salvati da un altro dispositivo");
   afterExternalChange();}
  else setHubState({base:r.file});}
 catch(e){/* PC non raggiungibile: si riprova alla prossima occasione */}
 finally{hubPullBusy=false;}}
async function hubSync(force){
 if(hubBusy||!hubUrl()||!hasRealData(S)||OLD_APP)return;
 await hubPull();if(OLD_APP)return;
 const body=JSON.stringify(S),h=await sha(body);
 if(!force&&hubState().lastHash===h)return;
 hubBusy=true;linkMsg("hub","Invio del backup al PC…");
 try{const r=await hubFetch("/api/"+HUB_APP+"/backup",{method:"POST",headers:{"Content-Type":"application/json"},body});
  setHubState({lastOk:Date.now(),lastHash:h,lastErr:"",base:r&&r.file||hubState().base,syncHash:await sha(canon(S))});linkMsg("hub",r&&r.salvato===false?"Il PC ha già questa versione.":"Backup salvato sul PC"+(r&&r.file?" ("+r.file+")":"")+".");}
 catch(e){setHubState({lastErr:e.message,lastErrAt:Date.now()});linkMsg("hub","Backup non riuscito: "+e.message+". Riprovo alla prossima modifica.");}
 finally{hubBusy=false;refreshLinks();}}
function scheduleHub(){clearTimeout(hubTimer);hubTimer=setTimeout(()=>hubSync(false),8000)}

/* ================= collegamento con l'app Guadagni sondaggi ================= */
/* Stessa origine (marcobaldini94.github.io): se l'app sondaggi è sullo stesso dispositivo se ne leggono i dati
   direttamente; altrimenti si usa l'ultimo backup che quell'app ha mandato all'Hub. Vince il dato più recente.
   Da quel mese in poi la colonna Sondaggi delle Entrate = somma dei prelievi del mese su tutti i portali. */
function sondState(){return lsJSON(SOND_STATE_KEY)}
function setSondState(o){lsSet(SOND_STATE_KEY,JSON.stringify(Object.assign(sondState(),o)))}
const sondCovers=ym=>!!(S.sondExt&&ym>=S.sondExt.da&&ym<=S.sondExt.a);
function readSondLocal(){const raw=lsGet(SOND_LS_KEY);if(!raw)return null;
 try{const d=JSON.parse(raw);return d&&d.months&&typeof d.months==="object"?{months:d.months,t:Date.parse(d.updatedAt)||0,fonte:"locale",dati:d}:null}catch(e){return null}}
async function readSondHub(){const r=await hubFetch("/api/guadagni/backup/ultimo");
 const m=/(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(\d{2})/.exec((r&&r.file)||"");
 const t=m?new Date(+m[1],m[2]-1,+m[3],+m[4],+m[5],+m[6]).getTime():0;
 return r&&r.dati&&r.dati.months&&typeof r.dati.months==="object"?{months:r.dati.months,t,fonte:"hub",dati:r.dati,file:r.file}:null;}
function sondTotals(months){const tot={};
 for(const [ym,row] of Object.entries(months)){if(!/^\d{4}-\d{2}$/.test(ym)||!row||typeof row!=="object")continue;
  let c=0;for(const v of Object.values(row))c+=Math.round(+((v&&v.p)||0))||0;tot[ym]=c;}
 return tot;}
function applySond(src){
 const tot=sondTotals(src.months),keys=Object.keys(tot).sort();if(!keys.length)return false;
 const cur=new Date().toLocaleDateString("sv-SE").slice(0,7),da=keys[0],a=keys[keys.length-1]>cur?keys[keys.length-1]:cur;
 const sig=s=>JSON.stringify([s.registro.filter(r=>r.fonte==="sond").map(r=>[r.data,r.importo,r.ext||""]).sort(),s.sondExt&&[s.sondExt.da,s.sondExt.a]]);
 const prima=sig(S);
 const inR=ym=>ym>=da&&ym<=a;
 const keep=S.registro.filter(r=>!(r.fonte==="sond"&&(r.ext||inR((r.data||"").slice(0,7)))));
 const add=keys.filter(ym=>tot[ym]>0).map(ym=>{const [y,m]=ym.split("-").map(Number);
  return{id:"sond-"+ym,data:`${ym}-${String(new Date(y,m,0).getDate()).padStart(2,"0")}`,fonte:"sond",importo:tot[ym]/100,nota:"Prelievi dall'app Guadagni sondaggi",ext:"guadagni"};});
 const nuovo={...S,registro:[...keep,...add],sondExt:{da,a,fonte:src.fonte,agg:new Date(src.t||Date.now()).toISOString()}};
 setSondState({agg:nuovo.sondExt.agg,fonteDati:src.fonte});
 /* v45: con gli stessi prelievi non si tocca S (prima fonte/agg cambiavano tra telefono «locale» e PC «hub» → backup ping-pong) */
 if(sig(nuovo)===prima)return false;
 S.registro=nuovo.registro;S.sondExt={da:nuovo.sondExt.da,a:nuovo.sondExt.a,fonte:"",agg:""};regSort(S);
 add.forEach(r=>{const y=+r.data.slice(0,4);if(!S.patrimonio[y])S.patrimonio[y]=blankPat();});
 return true;}
let sondBusy=false,pendingRender=false;
function afterExternalChange(){const a=document.activeElement;
 if(a&&view.contains(a)&&a.matches("input,select,textarea")){pendingRender=true;updateOutputs();}else render();}
view.addEventListener("focusout",()=>{if(pendingRender){pendingRender=false;setTimeout(()=>{const a=document.activeElement;if(!(a&&view.contains(a)&&a.matches("input,select,textarea")))render();else pendingRender=true;},0);}});
async function sondSync(manual){
 if(sondBusy)return;
 sondBusy=true;if(manual)linkMsg("sond","Controllo i dati dei sondaggi…");
 try{
  let changed=false,usato=null;
  const loc=readSondLocal();
  if(loc){if(hasRealData(S))changed=applySond(loc)||changed;usato=loc;}
  let hub=null,hubErr="";
  if(hubUrl()){try{hub=await readSondHub();}catch(e){hubErr=e.message;}}
  if(hub&&(!loc||hub.t>loc.t)){
   /* backup sul PC più recente dei dati locali (es. inserito dalla vecchia app o da un altro dispositivo): diventa il dato locale */
   const nh=sondClean(hub.dati);if(svSig(nh)!==svHubState().lastSig&&(!loc||svSig(nh)!==svSig(sondClean(loc.dati)))){lsSet(SOND_LS_KEY,JSON.stringify(Object.assign(nh,{updatedAt:new Date(hub.t).toISOString()})));svLoad();if(["home"].includes(current))afterExternalChange();}
   if(hasRealData(S))changed=applySond(hub)||changed;usato=hub;}
  setSondState({check:Date.now(),locT:loc?loc.t:0,hubT:hub?hub.t:0,hubErr,usato:usato?usato.fonte:"",usatoT:usato?usato.t:0});
  if(changed){afterExternalChange();scheduleSave();}
  if(manual)linkMsg("sond",usato?(changed?"Prelievi aggiornati.":"Già aggiornato: nessuna differenza."):"Nessun dato dell'app sondaggi trovato"+(hubErr?" ("+hubErr+")":"")+".");
 }finally{sondBusy=false;refreshLinks();}}

/* ================= scheda Collegamenti e backup ================= */
const MESE_L=ym=>ym?MESI[+ym.slice(5,7)-1]+" "+ym.slice(0,4):"";
function sondNote(){if(!S.sondExt)return "";
 return `<div class="banner sond-b"><b>Sondaggi automatici</b> da ${MESE_L(S.sondExt.da)}: ogni mese vale la somma dei <b>prelievi</b> registrati nell'app Guadagni sondaggi (le celle con «auto» non si modificano qui). Aggiornato: ${fmtWhen(Date.parse(sondState().agg||S.sondExt.agg))}. <a href="#collegamenti">Dettagli</a></div>`;}
const linkMsgs={hub:"",sond:"",file:"",ced:"",cart:"",mov:""};
function linkMsg(k,t){linkMsgs[k]=t;const el=document.getElementById("lk-"+k+"-msg");if(el){el.textContent=t;el.hidden=!t;}}
function hubBadge(){const s=hubState(),url=hubUrl();
 if(!url)return ["off","non attivo"];
 if(s.lastErr&&(!s.lastOk||s.lastErrAt>s.lastOk))return ["warn","PC non raggiungibile"];
 return s.lastOk?["ok","ultimo backup "+fmtWhen(s.lastOk)]:["off","nessun backup ancora"];}
function sondInfo(){const ss=sondState(),e=S.sondExt,hs=svHubState();
 const rows=[["Dati su questo dispositivo",ss.locT?"aggiornati "+fmtWhen(ss.locT):"nessuno"],
  ["Ultimo backup dei sondaggi sul PC",!hubUrl()?"Hub non configurato":ss.hubErr?"non raggiungibile ("+ss.hubErr+")":ss.hubT?fmtWhen(ss.hubT):"—"],
  ["Ultimo invio da qui",hs.lastErr&&(!hs.lastOk||hs.lastErrAt>hs.lastOk)?"non riuscito ("+esc(hs.lastErr)+")":hs.lastOk?fmtWhen(hs.lastOk):"—"],
  ["Mesi automatici",e?"da "+MESE_L(e.da)+" a "+MESE_L(e.a):"nessuno (ancora inserimento manuale)"],
  ["Ultimo controllo",fmtWhen(ss.check)]];
 return rows.map(([a,b])=>`<dt>${a}</dt><dd class="txtv">${b}</dd>`).join("");}
function refreshLinks(){
 const [k,t]=hubBadge(),p=document.getElementById("hdr-sync");
 if(p){p.dataset.s=k;document.getElementById("hdr-sync-t").textContent=k==="warn"?"PC non raggiungibile":"Collegamenti";}
 const b=document.getElementById("lk-hub-badge");if(b){b.textContent=t;b.dataset.s=k;}
 const si=document.getElementById("lk-sond-info");if(si)si.innerHTML=sondInfo();
 const ci=document.getElementById("lk-ced-info");if(ci)ci.innerHTML=cedInfo();
 const ki=document.getElementById("lk-cart-info");if(ki)ki.innerHTML=cartInfo();}
V.collegamenti=()=>{const Y=new Date().getFullYear(),T=R.anni[Y];
 return `<section class="sheet">
 <div class="sheet-h"><h2>Collegamenti e backup</h2><p>I dati stanno in questo browser. Ogni modifica viene copiata sul PC di casa tramite l'Hub (Tailscale). Su un telefono o un browser nuovo: imposta l'indirizzo dell'Hub e ripristina finanze e sondaggi dal PC.</p></div>
 <div class="grid">
 <div class="box c-good"><h3>Sondaggi</h3>
  <dl class="kv" id="lk-sond-info">${sondInfo()}</dl>
  ${T?`<dl class="kv">${kv("Prelievi sondaggi "+Y,out(`anni.${Y}.tot.sond`))}</dl>`:""}
  <div class="actions"><button class="btn" data-act="x-sond">Aggiorna ora</button><button class="btn ghost" data-act="x-sond-bk">Backup ora</button><button class="btn ghost" data-act="x-sond-rs">Ripristina dal PC</button></div>
  <div class="actions"><button class="btn ghost" data-act="x-sond-exp">Scarica backup sondaggi</button><label class="btn ghost" for="lk-sond-imp">Importa backup sondaggi…</label><input type="file" id="lk-sond-imp" accept="application/json,.json" hidden></div>
  <p class="note" id="lk-sond-msg" ${linkMsgs.sond?"":"hidden"}>${linkMsgs.sond}</p>
  <p class="note">I sondaggi si gestiscono qui, nella sezione <a href="#sondaggi">Sondaggi</a> (stesso formato dell'ex app Guadagni). Ogni modifica va sul PC (Hub, cartella dei backup dei sondaggi) e i prelievi di ogni mese entrano in Entrate › Sondaggi${S.sondExt?" da "+MESE_L(S.sondExt.da):""}. Se sul PC c'è un backup più recente (ad esempio inserito dalla vecchia app), al prossimo controllo viene adottato qui.</p></div>
 <div class="box c-good"><h3>Cedolini</h3>
  <dl class="kv" id="lk-ced-info">${cedInfo()}</dl>
  <div class="actions"><button class="btn" data-act="x-ced">Aggiorna ora</button><a class="btn ghost" href="#cedolini">Apri i cedolini</a></div>
  <p class="note" id="lk-ced-msg" ${linkMsgs.ced?"":"hidden"}>${linkMsgs.ced}</p>
  <p class="note">I PDF salvati nella cartella OneDrive «Assistente Finanziario/Cedolini» vengono letti sul PC di casa dall'Hub, senza servizi esterni. Per ogni cedolino con totali e netto verificati, lo stipendio netto entra in Entrate e il lordo di prestazioni aggiuntive e ALPI nella Quota B, nel mese di pagamento.</p></div>
 <div class="box c-good"><h3>Cartellini presenze</h3>
  <dl class="kv" id="lk-cart-info">${cartInfo()}</dl>
  <div class="actions"><button class="btn" data-act="x-cart">Aggiorna ora</button><a class="btn ghost" href="#lavoro">Apri Lavoro</a></div>
  <p class="note" id="lk-cart-msg" ${linkMsgs.cart?"":"hidden"}>${linkMsgs.cart}</p>
  <p class="note">I PDF salvati nella cartella OneDrive «Assistente Finanziario/Cartellini» (anche in sottocartelle per anno) vengono letti sul PC di casa dall'Hub. Ne ricava ore, ferie, guardie e attività aggiuntiva e le confronta con quanto pagato nei cedolini.</p></div>
 <div class="box"><h3>Backup automatico sul PC</h3>
  <p class="lk-badge"><span id="lk-hub-badge" data-s="${hubBadge()[0]}">${hubBadge()[1]}</span></p>
  <form class="addrow" id="lk-hub-form" autocomplete="off">
   <label class="grow">Indirizzo dell'Hub<input class="in txt" id="lk-hub-url" placeholder="https://jarvis-pc.….ts.net:8443" value="${esc(hubUrl())}" inputmode="url" spellcheck="false"></label>
   <button class="btn" type="submit">Salva e prova</button></form>
  <div class="actions"><button class="btn ghost" data-act="x-hub-now">Backup ora</button><button class="btn ghost" data-act="x-hub-restore">Ripristina dall'ultimo backup</button></div>
  <p class="note" id="lk-hub-msg" ${linkMsgs.hub?"":"hidden"}>${linkMsgs.hub}</p>
  <p class="note">È lo stesso indirizzo usato dall'app sondaggi e dalla scheda allenamento: se l'hai già inserito lì, qui compare da solo. I backup finiscono in OneDrive, nella cartella «backup» del progetto, un file per versione.</p></div>
 <div class="box"><h3>Backup su file</h3>
  <div class="actions"><button class="btn" data-act="x-exp">Scarica backup</button><label class="btn ghost" for="lk-imp">Importa backup…</label><input type="file" id="lk-imp" accept="application/json,.json" hidden></div>
  <p class="note" id="lk-file-msg" ${linkMsgs.file?"":"hidden"}>${linkMsgs.file}</p>
  <p class="note">Accetta i file scaricati da qui, i backup dell'Hub e il file di esportazione dall'artefatto claude.ai. L'importazione sostituisce tutti i dati di questo dispositivo.</p></div>
 </div></section>`;};
function fromAnyBackup(o){if(o&&o.dati&&typeof o.dati==="object")o=o.dati;if(o&&o.data&&o.data.registro)o=o.data;
 if(!o||typeof o!=="object"||!(o.anni||o.registro||o.parametri))throw new Error("il file non sembra un backup del Gestionale");return o;}
view.addEventListener("click",async e=>{const b=e.target.closest("[data-act^='x-']");if(!b)return;e.preventDefault();const a=b.dataset.act;
 if(a==="x-sond"){sondSync(true);return;}
 if(a==="x-sond-bk"){if(!hubUrl()){linkMsg("sond","Inserisci prima l'indirizzo dell'Hub.");return;}svLoad();svHubSync(true);return;}
 if(a==="x-sond-exp"){svLoad();svExport();return;}
 if(a==="x-sond-rs"){try{linkMsg("sond","Scarico l'ultimo backup dei sondaggi…");const r=await hubFetch("/api/guadagni/backup/ultimo");if(!r||!r.dati||typeof r.dati.months!=="object")throw new Error("backup non valido");
   svLoad();if(svReplace(r.dati,"il backup del PC "+(r.file||"")))linkMsg("sond","Sondaggi ripristinati da "+(r.file||"PC")+".");else linkMsg("sond","Ripristino annullato.");render();}
  catch(err){linkMsg("sond","Ripristino non riuscito: "+err.message+".");}return;}
 if(a==="x-ced"){cedSync(true,true);return;}
 if(a==="x-hub-now"){if(!hubUrl()){linkMsg("hub","Inserisci prima l'indirizzo dell'Hub.");return;}if(!hasRealData(S)){linkMsg("hub","Non c'è ancora niente da salvare.");return;}hubSync(true);return;}
 if(a==="x-hub-restore"){try{linkMsg("hub","Scarico l'ultimo backup…");const r=await hubFetch("/api/"+HUB_APP+"/backup/ultimo");const o=fromAnyBackup(r);
   if(hasRealData(S)&&!confirm("Sostituire i dati di questo dispositivo con il backup "+(r.file||"")+"?")){linkMsg("hub","Ripristino annullato.");return;}
   replaceState(o);setHubState({base:r.file,syncHash:await sha(canon(S))});linkMsg("hub","Ripristinato "+(r.file||"l'ultimo backup")+".");sondSync(false);cedSync(false);cartSync(false);}
  catch(err){linkMsg("hub","Ripristino non riuscito: "+err.message+".");}return;}
 if(a==="x-exp"){const blob=new Blob([JSON.stringify(S,null,1)],{type:"application/json"});const u=URL.createObjectURL(blob),l=document.createElement("a");
  l.href=u;l.download="gestionale-"+new Date().toLocaleDateString("sv-SE")+".json";document.body.appendChild(l);l.click();l.remove();setTimeout(()=>URL.revokeObjectURL(u),2000);linkMsg("file","File scaricato.");return;}
});
view.addEventListener("change",async e=>{if(e.target.id!=="lk-sond-imp")return;const f=e.target.files&&e.target.files[0];e.target.value="";if(!f)return;
 try{const d=JSON.parse(await f.text());if(!d||typeof d.months!=="object")throw new Error("serve un backup dell'app Guadagni o del Gestionale");svLoad();if(svReplace(d,"«"+f.name+"»"))linkMsg("sond","Sondaggi importati da "+f.name+".");render();}
 catch(err){linkMsg("sond","File non valido: "+err.message+".");}});
view.addEventListener("change",async e=>{if(e.target.id!=="lk-imp")return;const f=e.target.files&&e.target.files[0];e.target.value="";if(!f)return;
 try{const o=fromAnyBackup(JSON.parse(await f.text()));
  if(hasRealData(S)&&!confirm("Sostituire tutti i dati di questo dispositivo con «"+f.name+"»?")){linkMsg("file","Importazione annullata.");return;}
  replaceState(o);linkMsg("file","Importato «"+f.name+"».");sondSync(false);}
 catch(err){linkMsg("file","Importazione non riuscita: "+err.message+".");}});
view.addEventListener("submit",async e=>{if(e.target.id!=="lk-hub-form")return;e.preventDefault();
 const v=document.getElementById("lk-hub-url").value.trim().replace(/\/+$/,"");
 if(v&&!/^https:\/\//.test(v)){linkMsg("hub","L'indirizzo deve iniziare con https://");return;}
 lsSet(HUB_URL_KEY,v);setHubState({lastHash:"",lastErr:""});refreshLinks();
 if(!v){linkMsg("hub","Backup automatico disattivato.");return;}
 try{const r=await hubFetch("/api/ping");const ok=(r.app||[]).includes(HUB_APP);
  linkMsg("hub","Collegato a "+r.pc+"."+(ok?"":" Attenzione: l'Hub non ha ancora l'app «bilancio» in hub_config.json, quindi non può salvare i backup."));
  if(ok)hubSync(true);sondSync(false);}
 catch(err){linkMsg("hub","Prova non riuscita: "+err.message+".");refreshLinks();}});

/* ================= cedolini (letti in locale dall'Hub) ================= */
/* L'Hub su PC2 controlla la cartella OneDrive «Cedolini», legge ogni PDF in locale e pubblica
   GET /api/cedolini/archivio. Qui: per ogni cedolino con totali e netto verificati,
   Entrate › Stipendio SSN = netto e Intramoenia/aggiuntiva = lordo delle prestazioni aggiuntive,
   nel mese di pagamento (data di riscossione). I mesi senza cedolino restano manuali. */
const CED_STATE_KEY="bilancio-ced-stato";
function cedState(){return lsJSON(CED_STATE_KEY)}
function setCedState(o){lsSet(CED_STATE_KEY,JSON.stringify(Object.assign(cedState(),o)))}
const cedCovers=(ym,f)=>!!(S.ced&&(f==="ssn"||f==="intra")&&S.ced.mesi.includes(ym));
const cedYM=c=>(c.dataPagamento||c.periodo+"-28").slice(0,7);
function cedDerive(c){const v=c.voci||[],sm=f=>v.filter(f).reduce((a,x)=>a+(+x.importo||0),0),comp=x=>x.categoria==="competenza";
 const d={lordo:sm(comp),fisse:sm(x=>comp(x)&&x.tipo==="fissa"),variabili:sm(x=>comp(x)&&x.tipo==="variabile"),pa:sm(x=>comp(x)&&x.tipo==="prestazioni_aggiuntive"),
  inps:sm(x=>x.categoria==="inps"),prev:sm(x=>x.categoria==="previdenza_altro"),irpef:sm(x=>x.categoria==="irpef"),add:sm(x=>x.categoria==="addizionale"),
  sost:sm(x=>x.categoria==="sostitutiva"),altre:sm(x=>x.categoria==="altra_trattenuta")};
 d.contributi=d.inps+d.prev;d.tasse=d.irpef+d.add+d.sost;d.netto=d.lordo-d.contributi-d.tasse-d.altre;return d;}
function applyCed(arch){
 const lista=(arch.cedolini||[]).map(cleanCed).filter(Boolean).sort((a,b)=>(a.periodo+a.file).localeCompare(b.periodo+b.file));
 const per={};lista.filter(c=>c.controllo.ok).forEach(c=>{(per[cedYM(c)]=per[cedYM(c)]||[]).push(c);});
 const mesi=Object.keys(per).sort();
 const sig=s=>JSON.stringify([s.registro.filter(r=>r.fonte==="ssn"||r.fonte==="intra").map(r=>[r.data,r.fonte,r.importo,r.ext||""]).sort(),s.ced&&s.ced.lista.map(c=>[c.file,c.controllo.netto,c.nuoveVoci.join()]),s.ced&&s.ced.errori.length]);
 const prima=sig(S);
 const keep=S.registro.filter(r=>!(r.ext==="cedolini"||((r.fonte==="ssn"||r.fonte==="intra")&&mesi.includes((r.data||"").slice(0,7)))));
 const add=[];
 mesi.forEach(ym=>{const g=per[ym],y=+ym.slice(0,4),m=+ym.slice(5,7);
  const data=g.map(c=>c.dataPagamento).filter(Boolean).sort().pop()||`${ym}-${String(new Date(y,m,0).getDate()).padStart(2,"0")}`;
  const nomi=g.map(c=>MESE_L(c.periodo)).join(", ");
  const netto=Math.round(g.reduce((a,c)=>a+c.intestazione.netto,0)*100)/100;
  add.push({id:"ced-ssn-"+ym,data,fonte:"ssn",importo:netto,nota:"Netto del cedolino di "+nomi,ext:"cedolini"});
  const pa=g.flatMap(c=>c.voci.filter(v=>v.categoria==="competenza"&&v.tipo==="prestazioni_aggiuntive"));
  const lordo=Math.round(pa.reduce((a,v)=>a+v.importo,0)*100)/100;
  if(lordo!==0)add.push({id:"ced-intra-"+ym,data,fonte:"intra",importo:lordo,nota:pa.map(v=>v.descrizione.toLowerCase()+" (rif. "+v.riferimento.slice(5)+"/"+v.riferimento.slice(0,4)+")").join(" · ")+" · cedolino di "+nomi,ext:"cedolini"});});
 S.registro=[...keep,...add];regSort(S);
 S.ced={agg:str(arch.aggiornato),lista,mesi,errori:(arch.errori||[]).map(e=>({file:str(e.file),errore:str(e.errore)}))};
 mesi.forEach(ym=>{const y=+ym.slice(0,4);if(!S.patrimonio[y])S.patrimonio[y]=blankPat();});
 return sig(S)!==prima;}
let cedBusy=false;
async function cedSync(manual,rileggi){
 if(cedBusy)return;
 if(!hubUrl()){if(manual)linkMsg("ced","Serve l'indirizzo dell'Hub (riquadro «Backup automatico sul PC»).");return;}
 if(!hasRealData(S)){if(manual)linkMsg("ced","Prima importa o ripristina i dati del bilancio.");return;}
 cedBusy=true;if(manual)linkMsg("ced",rileggi?"Chiedo al PC di rileggere la cartella…":"Controllo i cedolini…");
 try{const r=rileggi?await hubFetch("/api/cedolini/aggiorna",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"}):await hubFetch("/api/cedolini/archivio");
  const changed=applyCed(r);setCedState({check:Date.now(),err:""});
  if(changed){afterExternalChange();scheduleSave();}else if(current==="cedolini")afterExternalChange();
  if(manual)linkMsg("ced",changed?"Cedolini aggiornati.":"Già aggiornato: nessuna differenza.");}
 catch(e){setCedState({check:Date.now(),err:e.message});if(manual)linkMsg("ced","Cedolini non letti: "+e.message+".");}
 finally{cedBusy=false;refreshLinks();}}
function cedInfo(){const cs=cedState(),c=S.ced;
 const ok=c?c.lista.filter(x=>x.controllo.ok).length:0,nv=c?[...new Set(c.lista.flatMap(x=>x.nuoveVoci))].length:0;
 return [["Cedolini letti",c?ok+" verificati"+(c.lista.length>ok?", "+(c.lista.length-ok)+" da controllare":"")+(c.errori.length?", "+c.errori.length+" illeggibili":""):"—"],
  ["Mesi automatici in Entrate",c&&c.mesi.length?MESE_L(c.mesi[0])+" – "+MESE_L(c.mesi[c.mesi.length-1]):"nessuno"],
  ["Voci nuove da confermare",nv?String(nv):"nessuna"],
  ["Ultima lettura sul PC",c&&c.agg?fmtWhen(Date.parse(c.agg)):"—"],
  ["Ultimo controllo",cs.err?"non riuscito ("+esc(cs.err)+")":fmtWhen(cs.check)]].map(([a,b])=>`<dt>${a}</dt><dd class="txtv">${b}</dd>`).join("");}
function cedNote(){if(!S.ced||!S.ced.mesi.length)return "";
 return `<div class="banner sond-b"><b>Stipendio dai cedolini</b> per ${S.ced.mesi.length} ${S.ced.mesi.length===1?"mese":"mesi"} (${MESE_L(S.ced.mesi[0])} – ${MESE_L(S.ced.mesi[S.ced.mesi.length-1])}): netto in busta nel mese di pagamento, celle «cedolino» in sola lettura. <a href="#cedolini">Apri i cedolini</a></div>`;}

const CAT_L={competenza:"Competenza",inps:"Contributo INPS",previdenza_altro:"TFR, ONAOSI, altra previdenza",irpef:"IRPEF",addizionale:"Addizionale",sostitutiva:"Imposta sostitutiva",altra_trattenuta:"Altra trattenuta"};
const TIPO_L={fissa:"Fissa",variabile:"Variabile (guardie, straordinari…)",prestazioni_aggiuntive:"Prestazioni aggiuntive / ALPI",una_tantum:"Una tantum (arretrati, conguagli…)"};
let CED_SEL=null;
const scaglione=R0=>R0>50000?"43%":R0>28000?"33%":"23%";
V.cedolini=()=>{const c=S.ced,L=c?c.lista:[];
 const head=`<div class="sheet-h"><h2>Cedolini</h2><p>Busta paga letta dai PDF nella cartella OneDrive «Assistente Finanziario/Cedolini». La lettura avviene sul PC di casa (Hub), senza servizi esterni; qui arrivano solo le voci economiche, senza dati anagrafici.</p></div>
 <div class="actions"><button class="btn" data-act="x-ced">Aggiorna ora</button><a class="btn ghost" href="#collegamenti">Stato del collegamento</a></div>
 <p class="note" id="lk-ced-msg" ${linkMsgs.ced?"":"hidden"}>${linkMsgs.ced}</p>`;
 if(!L.length)return `<section class="sheet">${head}<div class="banner">Nessun cedolino ancora. ${hubUrl()?"Salva i PDF nella cartella Cedolini e premi «Aggiorna ora»: il PC li legge entro un minuto.":"Imposta prima l'indirizzo dell'Hub in <a href=\"#collegamenti\">Collegamenti e backup</a>."}</div>
  ${c&&c.errori.length?errBox(c):""}</section>`;
 if(!CED_SEL||!L.some(x=>x.file===CED_SEL))CED_SEL=L[L.length-1].file;
 const nuove=[];L.forEach(x=>x.voci.forEach(v=>{if(v.nuova&&!nuove.some(n=>n.codice===v.codice))nuove.push({...v,periodo:x.periodo});}));
 const rows=L.slice().reverse().map(x=>{const d=cedDerive(x),st=!x.controllo.ok?'<span class="chip">da controllare</span>':x.nuoveVoci.length?'<span class="chip">voci nuove</span>':'<span class="chip ok">verificato</span>';
  return `<tr class="ced-row ${x.file===CED_SEL?"hl":""}" data-act="ced-sel" data-file="${esc(x.file)}" tabindex="0"><td>${MESI[+x.periodo.slice(5)-1]} ${x.periodo.slice(0,4)}</td><td>${dIt(x.dataPagamento)}</td><td>${fmt(d.lordo)}</td><td>${fmt(d.contributi)}</td><td class="tax">${fmt(d.tasse)}</td><td><b>${fmt(d.netto)}</b></td><td>${d.lordo?Math.round(d.netto/d.lordo*100)+"%":"—"}</td><td>${st}</td></tr>`;}).join("");
 const x=L.find(y=>y.file===CED_SEL),d=cedDerive(x),h=x.intestazione;
 const grp=[["Competenze",v=>v.categoria==="competenza"],["Contributi INPS",v=>v.categoria==="inps"],["TFR, ONAOSI e altra previdenza",v=>v.categoria==="previdenza_altro"],["Imposte",v=>["irpef","addizionale","sostitutiva"].includes(v.categoria)],["Altre trattenute",v=>v.categoria==="altra_trattenuta"]];
 let det="";grp.forEach(([t,f])=>{const vv=x.voci.filter(f);if(!vv.length)return;const sub=vv.reduce((a,v)=>a+v.importo,0),comp=t==="Competenze";
  det+=`<tr class="mh"><td>${t}</td><td class="am">${fmt(comp?sub:-sub)}</td></tr>`;
  vv.forEach(v=>{const meta=[v.categoria==="competenza"&&v.tipo?TIPO_L[v.tipo].split(" (")[0].toLowerCase():"",v.riferimento!==x.periodo?"lavoro di "+MESE_L(v.riferimento).toLowerCase():""].filter(Boolean).join(" · ");
   det+=`<tr><td>${esc(v.descrizione)}${v.nuova?' <span class="chip">nuova</span>':""}${meta?`<br><small class="muted">${meta}</small>`:""}</td><td class="am">${fmt(v.categoria==="competenza"?v.importo:-v.importo)}</td></tr>`;});});
 det+=`<tr class="mh ced-tot"><td>Netto in busta</td><td class="am">${fmt(d.netto)}</td></tr>`;
 const chk=[];
 chk.push(x.controllo.ok?`Totali e netto letti corrispondono a quelli stampati (${fmt(h.netto)}).`:`<b>Il netto ricostruito dalle voci (${fmt(x.controllo.netto)}) non corrisponde a quello stampato (${fmt(h.netto)})</b>: questo cedolino non entra nelle Entrate finché non si verifica.`);
 if(h.imponibileProgressivo!=null)chk.push(`Imponibile IRPEF da inizio anno ${fmt(h.imponibileProgressivo)}, IRPEF netta trattenuta ${fmt(h.irpefProgressiva)}: aliquota media ${fmt(h.irpefProgressiva/h.imponibileProgressivo,"pct")}, ultimo scaglione raggiunto ${scaglione(h.imponibileProgressivo)}.`);
 const late=x.voci.filter(v=>v.categoria==="competenza"&&v.riferimento!==x.periodo);
 if(late.length)chk.push("Pagate in questo cedolino ma riferite ad altri mesi: "+late.map(v=>esc(v.descrizione.toLowerCase())+" ("+MESE_L(v.riferimento).toLowerCase()+", "+fmt(v.importo)+")").join("; ")+".");
 if(d.pa)chk.push(`Prestazioni aggiuntive/ALPI ${fmt(d.pa)} lordi: entrano nella Quota B ENPAM di ${MESE_L(cedYM(x)).toLowerCase()} (scheda Tasse); imposta sostitutiva trattenuta ${fmt(d.sost)}.`);
 return `<section class="sheet">${head}
 ${nuove.length?`<div class="box c-tax" id="ced-nuove"><h3>Voci nuove da confermare</h3>
  <p class="note">Codici mai visti prima: il netto è già verificato, ma va confermato che tipo di voce sono (serve per stipendio fisso, guardie e Quota B). La scelta vale per tutti i cedolini, anche futuri.</p>
  ${nuove.map(v=>`<div class="ced-nv" data-cod="${esc(v.codice)}" data-desc="${esc(v.descrizione)}"><div class="ced-nv-h"><span><b>${esc(v.codice)}</b> ${esc(v.descrizione)}<br><small class="muted">${MESE_L(v.periodo)}</small></span><span class="am">${fmt(v.importo)}</span></div>
   <label>Categoria<select class="in sel ced-cat">${CED_CAT.map(k=>`<option value="${k}" ${k===v.categoria?"selected":""}>${CAT_L[k]}</option>`).join("")}</select></label>
   <label>Tipo (solo competenze)<select class="in sel ced-tipo">${CED_TIPI.map(k=>`<option value="${k}" ${k===(v.tipo||"una_tantum")?"selected":""}>${TIPO_L[k]}</option>`).join("")}</select></label></div>`).join("")}
  <div class="actions"><button class="btn" data-act="x-ced-ok">Conferma</button></div></div>`:""}
 ${c.errori.length||L.some(y=>!y.controllo.ok)?errBox(c):""}
 <div class="hero">
  <div class="tile"><span class="l">Lordo · ${MESE_L(x.periodo)}</span><span class="v">${fmt(d.lordo)}</span><span class="s">pagato il ${dIt(x.dataPagamento)||"—"}${Math.abs(d.lordo-(h.totaleCompetenze??d.lordo))>0.005?" · sul cedolino "+fmt(h.totaleCompetenze)+" (TFR già sottratto)":""}</span></div>
  <div class="tile"><span class="l">Contributi, TFR, ONAOSI</span><span class="v">${fmt(d.contributi)}</span><span class="s">${d.lordo?fmt(d.contributi/d.lordo,"pct"):""} del lordo</span></div>
  <div class="tile t-tax"><span class="l">IRPEF e imposte</span><span class="v">${fmt(d.tasse)}</span><span class="s">IRPEF ${fmt(d.irpef)}${d.sost?" · sostitutiva "+fmt(d.sost):""}${d.add?" · addizionali "+fmt(d.add):""}</span></div>
  <div class="tile t-liq"><span class="l">Netto in busta</span><span class="v">${fmt(d.netto)}</span><span class="s">${d.lordo?Math.round(d.netto/d.lordo*100)+"% del lordo":""}</span></div>
 </div>
 <div class="grid">
  <div class="box"><h3>Voci del cedolino di ${MESE_L(x.periodo)}</h3><div class="tbl-wrap flat"><table class="scad2 ced-det"><tbody>${det}</tbody></table></div></div>
  <div class="box ${x.controllo.ok?"c-good":"c-tax"}"><h3>Controlli</h3>${chk.map(t=>`<p class="note">${t}</p>`).join("")}</div>
 </div>
 <div class="box"><h3>Storico</h3><div class="tbl-wrap flat"><table><thead><tr><th>Mese</th><th>Pagato il</th><th>Lordo</th><th>Contributi</th><th>Imposte</th><th>Netto</th><th>Netto / lordo</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
  <p class="note">Tocca un mese per vederne le voci. Lo stipendio netto di ogni cedolino verificato è già in Entrate, nel mese di pagamento.</p></div>
</section>`;};
function errBox(c){const bad=(c.lista||[]).filter(y=>!y.controllo.ok);
 return `<div class="box c-tax"><h3>Da controllare</h3>${bad.map(y=>`<p class="note"><b>${esc(y.file)}</b> (${MESE_L(y.periodo)}): il netto ricostruito non torna con quello stampato, quindi lo stipendio di quel mese resta manuale in Entrate.</p>`).join("")}
  ${c.errori.map(e=>`<p class="note"><b>${esc(e.file)}</b>: non leggibile (${esc(e.errore)}). Controlla che sia il PDF originale scaricato dal portale.</p>`).join("")}</div>`;}
view.addEventListener("click",async e=>{const b=e.target.closest("[data-act='ced-sel'],[data-act='x-ced-ok']");if(!b)return;
 if(b.dataset.act==="ced-sel"){CED_SEL=b.dataset.file;render();const t=document.querySelector(".ced-det");if(t)t.closest(".box").scrollIntoView({behavior:"smooth",block:"start"});return;}
 e.preventDefault();if(READONLY)return;
 const voci=[...document.querySelectorAll("#ced-nuove .ced-nv")].map(tr=>({codice:tr.dataset.cod,descrizione:tr.dataset.desc,categoria:tr.querySelector(".ced-cat").value,tipo:tr.querySelector(".ced-tipo").value}));
 if(!voci.length)return;b.disabled=true;linkMsg("ced","Invio la classificazione al PC…");
 try{const r=await hubFetch("/api/cedolini/classifica",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({voci})});
  if(applyCed(r))scheduleSave();linkMsg("ced","Classificazione salvata: i cedolini sono stati riletti.");render();}
 catch(err){linkMsg("ced","Classificazione non salvata: "+err.message+".");b.disabled=false;}});
view.addEventListener("keydown",e=>{const r=e.target.closest&&e.target.closest("tr[data-act='ced-sel']");if(r&&(e.key==="Enter"||e.key===" ")){e.preventDefault();r.click();}});

/* ================= lavoro: cartellini presenze (letti in locale dall'Hub) ================= */
/* L'Hub su PC2 controlla la cartella OneDrive «Cartellini» (anche le sottocartelle per anno), legge ogni PDF
   in locale e pubblica GET /api/cartellini/archivio. Qui: ore fatte e dovute, recupero ore, ferie, guardie
   e attività aggiuntiva per mese, e il confronto con quanto pagato nei cedolini (di norma due mesi dopo). */
const CART_STATE_KEY="bilancio-cart-stato";
function cartState(){return lsJSON(CART_STATE_KEY)}
function setCartState(o){lsSet(CART_STATE_KEY,JSON.stringify(Object.assign(cartState(),o)))}
function minN(v){return typeof v==="number"&&isFinite(v)?Math.round(v):null;}
function cleanCart(c){if(!c||typeof c!=="object"||!ymOk(c.periodo))return null;
 const gg=(Array.isArray(c.giorni)?c.giorni:[]).filter(g=>g&&typeof g==="object").map(g=>({g:minN(g.g),dow:str(g.dow).slice(0,3),orario:str(g.orario).slice(0,6),
  t:(Array.isArray(g.timbrature)?g.timbrature:[]).filter(Boolean).map(t=>[str(t.e),str(t.u),t.tipo==="a"?"a":"o"]),
  c:(Array.isArray(g.causali)?g.causali:[]).filter(Boolean).map(x=>[str(x.codice).slice(0,8),minN(x.minuti)]),
  tc:minN(g.totC),ec:minN(g.eccCar)})).filter(g=>g.g);
 const o=x=>x&&typeof x==="object"?x:{},tz=o(c.totalizzatori),fe=o(c.ferie),rp=o(c.riepilogo),d=o(c.derivati),k=o(c.controllo);
 const mp=x=>({mese:num(o(x).mese)??0,progr:num(o(x).progr)??0}),fr=x=>({spettanti:num(o(x).spettanti)??0,fruiti:num(o(x).fruiti)??0,decurtati:num(o(x).decurtati)??0,residuo:num(o(x).residuo)??0});
 const ints=a=>(Array.isArray(a)?a:[]).filter(n=>Number.isInteger(n));
 const caus={};Object.entries(o(c.causali)).forEach(([a,b])=>{caus[str(a).slice(0,8)]=str(b).slice(0,80);});
 return{file:str(c.file).slice(0,120),periodo:c.periodo,provvisorio:c.provvisorio===true,calcolo:str(c.ultimoCalcolo).slice(0,19),giorni:gg,
  fatto:minN(rp.fattoMin),dovuto:minN(rp.dovutoMin),recupero:minN(rp.recuperoResiduoMin),
  ferie:{fs:fr(fe.festivitaSoppresse),co:fr(fe.congedoOrdinario),ap:fr(fe.residuoAnniPrecedenti),tot:num(o(fe.residueTotali).residuo)},
  tz:{notte:mp(tz.gettoneNotturnaMin),fest:mp(tz.gettoneFestivaMin),indFest:mp(tz.indennitaFestiva)},
  agg:minN(d.aggiuntivaMin)??0,aggGiorni:ints(d.aggiuntivaGiorni),recGiorni:gg.filter(g=>g.c.some(x=>x[0]==="9018")).map(g=>g.g),notti:ints(d.notti),festive:ints(d.festive),ferieGiorni:ints(d.ferieGiorni),causali:caus,ok:k.ok===true};}
/* Cartellino già compattato (formato salvato in S.cart.lista). Prima sanitizeCart lo ripassava a cleanCart,
   che legge il formato dell'Hub: a ogni avvio timbrature, ore, ferie e controllo venivano azzerati, poi cartSync
   li riscaricava → due backup diversi (≈69 KB / ≈82 KB) a ogni apertura e sezione Lavoro vuota senza Hub. */
function cleanCartStored(c){if(!c||typeof c!=="object"||!ymOk(c.periodo))return null;
 const o=x=>x&&typeof x==="object"?x:{},ints=a=>(Array.isArray(a)?a:[]).filter(n=>Number.isInteger(n));
 const mp=x=>({mese:num(o(x).mese)??0,progr:num(o(x).progr)??0}),fr=x=>({spettanti:num(o(x).spettanti)??0,fruiti:num(o(x).fruiti)??0,decurtati:num(o(x).decurtati)??0,residuo:num(o(x).residuo)??0});
 const gg=(Array.isArray(c.giorni)?c.giorni:[]).filter(g=>g&&typeof g==="object").map(g=>({g:minN(g.g),dow:str(g.dow).slice(0,3),orario:str(g.orario).slice(0,6),
  t:(Array.isArray(g.t)?g.t:[]).filter(Array.isArray).map(t=>[str(t[0]),str(t[1]),t[2]==="a"?"a":"o"]),
  c:(Array.isArray(g.c)?g.c:[]).filter(Array.isArray).map(x=>[str(x[0]).slice(0,8),minN(x[1])]),
  tc:minN(g.tc),ec:minN(g.ec)})).filter(g=>g.g);
 const fe=o(c.ferie),tz=o(c.tz),caus={};Object.entries(o(c.causali)).forEach(([a,b])=>{caus[str(a).slice(0,8)]=str(b).slice(0,80);});
 return{file:str(c.file).slice(0,120),periodo:c.periodo,provvisorio:c.provvisorio===true,calcolo:str(c.calcolo).slice(0,19),giorni:gg,
  fatto:minN(c.fatto),dovuto:minN(c.dovuto),recupero:minN(c.recupero),
  ferie:{fs:fr(fe.fs),co:fr(fe.co),ap:fr(fe.ap),tot:num(fe.tot)},
  tz:{notte:mp(tz.notte),fest:mp(tz.fest),indFest:mp(tz.indFest)},
  agg:minN(c.agg)??0,aggGiorni:ints(c.aggGiorni),recGiorni:ints(c.recGiorni),notti:ints(c.notti),festive:ints(c.festive),ferieGiorni:ints(c.ferieGiorni),causali:caus,ok:c.ok===true};}
/* formato salvato se ha i campi compattati, altrimenti (dati vecchi / risposta Hub) quello dell'Hub */
const cartItem=c=>c&&typeof c==="object"&&("tz" in c||"fatto" in c||"recupero" in c||"ok" in c)?cleanCartStored(c):cleanCart(c);
function sanitizeCart(x){if(!x||typeof x!=="object")return null;
 return{agg:str(x.agg),lista:(Array.isArray(x.lista)?x.lista:[]).map(cartItem).filter(Boolean),
  errori:(Array.isArray(x.errori)?x.errori:[]).filter(e=>e&&typeof e==="object").map(e=>({file:str(e.file),errore:str(e.errore)}))};}
function applyCart(arch){
 const prima=JSON.stringify(S.cart||null);
 const lista=(arch.cartellini||[]).map(cleanCart).filter(Boolean).sort((a,b)=>(a.periodo+a.calcolo).localeCompare(b.periodo+b.calcolo));
 const per={};lista.forEach(c=>{const p=per[c.periodo];if(!p||(c.ok&&!p.ok)||(c.ok===p.ok&&c.calcolo>=p.calcolo))per[c.periodo]=c;}); // un cartellino per mese: il ricalcolo più recente
 S.cart={agg:str(arch.aggiornato),lista:Object.keys(per).sort().map(k=>per[k]),errori:(arch.errori||[]).map(e=>({file:str(e.file),errore:str(e.errore)}))};
 return JSON.stringify(S.cart)!==prima;}
let cartBusy=false;
async function cartSync(manual,rileggi){
 if(cartBusy)return;
 if(!hubUrl()){if(manual)linkMsg("cart","Serve l'indirizzo dell'Hub (Collegamenti e backup › Backup automatico sul PC).");return;}
 cartBusy=true;if(manual)linkMsg("cart",rileggi?"Chiedo al PC di rileggere la cartella…":"Controllo i cartellini…");
 try{const r=rileggi?await hubFetch("/api/cartellini/aggiorna",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"}):await hubFetch("/api/cartellini/archivio");
  const changed=applyCart(r);setCartState({check:Date.now(),err:""});
  if(changed)scheduleSave();
  if(changed||current==="lavoro")afterExternalChange();
  if(manual)linkMsg("cart",changed?"Cartellini aggiornati.":"Già aggiornato: nessuna differenza.");}
 catch(e){setCartState({check:Date.now(),err:e.message});if(manual)linkMsg("cart","Cartellini non letti: "+e.message+".");}
 finally{cartBusy=false;refreshLinks();}}
/* ore: minuti -> "h:mm" */
const hm=m=>m==null?"—":(m<0?"−":"")+Math.floor(Math.abs(m)/60)+":"+String(Math.abs(m)%60).padStart(2,"0");
const hmS=m=>m==null?"—":(m>0?"+":"")+hm(m);
const oreDec=m=>Math.round(m/60*100)/100;
const ymAdd=(ym,n)=>{const d=new Date(+ym.slice(0,4),+ym.slice(5,7)-1+n,1);return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");};
const nGg=n=>n===1?"1 giorno":(Number.isInteger(n)?n:fN.format(n))+" giorni";
/* Voci del cedolino collegate al cartellino: guardia a ore (variabile) e attività aggiuntiva (prestazioni aggiuntive). */
const isGuardia=v=>v.categoria==="competenza"&&(v.codice==="20169"||(v.tipo==="variabile"&&/GUARDIA/i.test(v.descrizione)));
const isAggiuntiva=v=>v.categoria==="competenza"&&(v.codice==="28070"||(v.tipo==="prestazioni_aggiuntive"&&/LISTE|AGGIUNT/i.test(v.descrizione)));
function cartPagamenti(){
 const ced=(S.ced?S.ced.lista:[]).filter(c=>c.controllo.ok),voci=ced.flatMap(c=>c.voci.map(v=>({...v,ced:c.periodo})));
 const ultimaTariffa=f=>{const v=voci.filter(f).filter(v=>num(v.tariffa)).sort((a,b)=>a.ced.localeCompare(b.ced)).pop();return v?v.tariffa:null;};
 const tG=ultimaTariffa(isGuardia),tA=ultimaTariffa(isAggiuntiva),ultimoCed=ced.map(c=>c.periodo).sort().pop()||"";
 const riga=(c,tipo,ore,f,tar)=>{const vv=voci.filter(v=>f(v)&&v.riferimento===c.periodo);
  const pag=vv.length?{importo:vv.reduce((a,v)=>a+v.importo,0),ore:vv.every(v=>num(v.quantita)!=null)?vv.reduce((a,v)=>a+v.quantita,0):null,ced:[...new Set(vv.map(v=>v.ced))]}:null;
  const atteso=ymAdd(c.periodo,2),stima=tar!=null?Math.round(ore*tar*100)/100:null;
  let stato;if(pag){const d=pag.ore!=null?pag.ore-ore:null;stato=d==null?"pagato":Math.abs(d)<=0.25?"ok":d<0?"meno":"piu";}
  else stato=ultimoCed>=atteso?"manca":"attesa";
  return{periodo:c.periodo,tipo,ore,stima,pag,atteso,stato};};
 const out=[];(S.cart?S.cart.lista:[]).forEach(c=>{
  const g=(c.tz.notte.mese+c.tz.fest.mese)/60;if(g>0)out.push(riga(c,"guardia",g,isGuardia,tG));
  {const ao=aggOre(c);if(ao>0)out.push(Object.assign(riga(c,"aggiuntiva",ao,isAggiuntiva,tA),{cert:(S.aggCert||{})[c.periodo]!=null}));}});
 return{righe:out,tG,tA};}
/* ore di recupero usate nel mese: residuo prec. + saldo − residuo (null se manca il mese prima) */
function cartUsate(L,y){const i=L.indexOf(y);if(y.recupero==null||y.fatto==null||y.dovuto==null)return null;
 const pr=i>0&&L[i-1].periodo===ymAdd(y.periodo,-1)?L[i-1]:null,base=pr?pr.recupero:(i===0&&y.recupero===y.fatto-y.dovuto?0:null);
 if(base==null)return null;return base+(y.fatto-y.dovuto)-y.recupero;}
const STATO_L={ok:['ok',"pagato"],pagato:['ok',"pagato"],meno:['',"pagate meno ore"],piu:['',"pagate più ore"],manca:['',"non trovato"],attesa:['',"in arrivo"]};
let CART_SEL=null;
function lavPage(mode){const c=S.cart,L=c?c.lista:[];
 const head=`<div class="sheet-h"><h2>${mode==="pag"?"Guardie e aggiuntiva":"Presenze e ferie"}</h2><p>${mode==="pag"?"Guardie e attività aggiuntiva dai cartellini, confrontate con quanto pagato nei cedolini. Dati":"Ore, recupero e ferie"} dai cartellini presenze nella cartella OneDrive «Assistente Finanziario/Cartellini». La lettura avviene sul PC di casa (Hub); qui arrivano solo orari, causali e totali, senza dati anagrafici.</p></div>
 <div class="actions"><button class="btn" data-act="x-cart">Aggiorna ora</button>${mode==="pag"?'<a class="btn ghost" href="#cedolini">Cedolini</a>':'<a class="btn ghost" href="#lv-pag">Guardie e aggiuntiva</a>'}<a class="btn ghost" href="#turni">Turni</a><a class="btn ghost" href="#lv-ora">Orario e riposi</a></div>
 <p class="note" id="lk-cart-msg" ${linkMsgs.cart?"":"hidden"}>${linkMsgs.cart}</p>`;
 const errs=c&&(c.errori.length||L.some(x=>!x.ok))?`<div class="box c-tax"><h3>Da controllare</h3>${L.filter(x=>!x.ok).map(x=>`<p class="note"><b>${esc(x.file)}</b> (${MESE_L(x.periodo)}): le somme dei giorni non tornano con i totali stampati. I numeri di questo mese vanno verificati sul PDF.</p>`).join("")}
  ${c.errori.map(e=>`<p class="note"><b>${esc(e.file)}</b>: non leggibile (${esc(e.errore)}).</p>`).join("")}</div>`:"";
 if(!L.length)return `<section class="sheet">${head}<div class="banner">Nessun cartellino ancora. ${hubUrl()?"Salva i PDF nella cartella Cartellini (anche in una sottocartella per anno) e premi «Aggiorna ora»: il PC li legge entro un minuto.":"Imposta prima l'indirizzo dell'Hub in <a href=\"#collegamenti\">Collegamenti e backup</a>."}</div>${errs}</section>`;
 if(!CART_SEL||!L.some(x=>x.periodo===CART_SEL))CART_SEL=L[L.length-1].periodo;
 const x=L.find(y=>y.periodo===CART_SEL),last=L[L.length-1];
 const P=cartPagamenti(),inArrivo=P.righe.filter(r=>r.stato==="attesa"),daVerif=P.righe.filter(r=>["meno","piu","manca"].includes(r.stato));
 const totArr=inArrivo.reduce((a,r)=>a+(r.stima||0),0),netOf=r=>r.stima!=null?lavNetto(r.tipo,r.stima,r.atteso):null,totArrN=sum(inArrivo.map(r=>netOf(r)||0));
 const pMesi=[...new Set(Object.keys(S.turni||{}).map(k=>k.slice(0,7)))].filter(m=>m>last.periodo).sort().map(pianoMese).filter(q=>q.lav).map(q=>Object.assign(q,{$:pianoSoldi(q)}));
 const fProg=ferieProgr();
 const saldo=x.fatto!=null&&x.dovuto!=null?x.fatto-x.dovuto:null;
 const fer=last.ferie,ferRes=fer.tot!=null?fer.tot:fer.co.residuo+fer.fs.residuo+fer.ap.residuo;
 const anno=last.periodo.slice(0,4),Lanno=L.filter(y=>y.periodo.startsWith(anno));
 const notti=Lanno.reduce((a,y)=>a+y.notti.length,0),fest=Lanno.reduce((a,y)=>a+y.festive.length,0),aggA=Lanno.reduce((a,y)=>a+y.agg,0);
 /* tabella mesi: residuo = residuo del mese prima + saldo del mese − ore recuperate (causale 9018) */
 const rows=L.slice().reverse().map(y=>{const s=y.fatto!=null&&y.dovuto!=null?y.fatto-y.dovuto:null,u=cartUsate(L,y);
  return `<tr class="ced-row ${y.periodo===CART_SEL?"hl":""}" data-act="cart-sel" data-ym="${y.periodo}" tabindex="0"><td>${MESE_L(y.periodo)}</td><td>${hm(y.fatto)}</td><td>${hm(y.dovuto)}</td><td class="${s>0?"pos":s<0?"neg":""}">${hmS(s)}</td><td>${u==null?"—":u?"−"+hm(u)+(y.recGiorni.length?`<br><small class="muted">${y.recGiorni.length} ${y.recGiorni.length===1?"giorno":"giorni"}</small>`:""):"—"}</td><td><b>${hm(y.recupero)}</b></td><td>${y.notti.length}</td><td>${y.festive.length}</td><td>${y.agg?hm(y.agg):"—"}</td><td>${y.ferieGiorni.length||"—"}</td><td>${y.ok?(y.provvisorio?'<span class="chip">provvisorio</span>':'<span class="chip ok">definitivo</span>'):'<span class="chip">da controllare</span>'}</td></tr>`;}).join("");
 /* pagamenti */
 const tipoL={guardia:"Guardia",aggiuntiva:"Aggiuntiva"};
 const pRows=P.righe.slice().reverse().map(r=>{const [cls,lab]=STATO_L[r.stato];
  return `<tr><td>${MESE_L(r.periodo)}</td><td>${tipoL[r.tipo]}</td><td>${hm(Math.round(r.ore*60))}${r.cert?'<br><small class="muted">certificate</small>':""}</td><td>${r.stima!=null?fmt(r.stima)+(r.stato==="attesa"&&netOf(r)!=null?`<br><small class="muted">netto ≈ ${fmt(netOf(r))}</small>`:""):"—"}</td><td>${r.pag?fmt(r.pag.importo)+(r.pag.ore!=null?`<br><small class="muted">${fN.format(r.pag.ore)} h · cedolino di ${r.pag.ced.map(MESE_L).join(", ").toLowerCase()}</small>`:""):`<small class="muted">atteso con il cedolino di ${MESE_L(r.atteso).toLowerCase()}</small>`}</td><td><span class="chip ${cls}">${lab}</span></td></tr>`;}).join("");
 /* giorni del mese selezionato */
 const cl=(cod)=>x.causali[cod]||cod;
 const days=x.giorni.map(g=>{const tags=[];
  if(x.notti.includes(g.g))tags.push('<span class="chip lv-n">notte</span>');
  if(x.festive.includes(g.g))tags.push('<span class="chip lv-f">guardia festiva</span>');
  g.c.forEach(([cod,m])=>tags.push(`<span class="chip ${x.ferieGiorni.includes(g.g)&&cod==="1000"?"lv-fe":x.aggGiorni.includes(g.g)&&m!=null?"lv-a":""}" title="${esc(cl(cod))}">${esc(cod==="1000"?"ferie":cod==="000038"?"aggiuntiva":cl(cod).split(" (")[0].toLowerCase())}${m!=null?" "+hm(m):""}</span>`));
  const tt=g.t.map(([e,u,k])=>`<span class="${k==="a"?"lv-ta":""}">${e||"?"}–${u||"?"}</span>`).join(" ");
  const we=g.dow==="sab"||g.dow==="dom";
  return `<tr class="${we?"lv-we":""}"><td>${g.g} <small class="muted">${g.dow}</small></td><td class="lv-t">${tt||'<span class="muted">—</span>'}</td><td>${tags.join(" ")}</td><td>${g.tc!=null?hm(g.tc):""}</td><td class="${g.ec>0?"pos":g.ec<0?"neg":""}">${g.ec!=null?hmS(g.ec):""}</td></tr>`;}).join("");
 return mode==="pag"?`<section class="sheet">${head}${errs}
 <div class="hero">
  <div class="tile t-tax"><span class="l">In arrivo nei prossimi cedolini</span><span class="v">${fmt(totArr)}</span><span class="s">lordo stimato: ${inArrivo.length?inArrivo.map(r=>tipoL[r.tipo].toLowerCase()+" "+MESE_L(r.periodo).slice(0,3).toLowerCase()).join(", "):"niente in sospeso"}</span></div>
  ${inArrivo.length?`<div class="tile t-liq"><span class="l">Netto stimato in arrivo</span><span class="v">${fmt(totArrN)}</span><span class="s">guardie − contributi e IRPEF · aggiuntiva − 15%</span></div>`:""}
  ${pMesi.length?`<div class="tile"><span class="l">Dal piano turni</span><span class="v">${fmt(sum(pMesi.map(q=>q.$.netto||0)))}</span><span class="s">netto stimato, ${pMesi.map(q=>MESE_L(q.ym).slice(0,3).toLowerCase()).join(", ")} (cartellino non ancora letto) · <a href="#turni">Turni</a></span></div>`:""}
 </div>
 ${daVerif.length?`<div class="box c-tax"><h3>Pagamenti da verificare</h3>${daVerif.map(r=>`<p class="note"><b>${tipoL[r.tipo]} di ${MESE_L(r.periodo).toLowerCase()}</b>: ${r.stato==="manca"?`nel cedolino di ${MESE_L(r.atteso).toLowerCase()} non c'è (${hm(Math.round(r.ore*60))} ore dal cartellino).`:`pagate ${fN.format(r.pag.ore)} ore, dal cartellino ne risultano ${fN.format(oreDec(Math.round(r.ore*60)))}.`}</p>`).join("")}</div>`:""}
  <div class="box"><h3>Guardie e aggiuntiva · ${anno}</h3><dl class="kv">
   ${kv("Notti di guardia",String(notti))}${kv("Guardie festive diurne",String(fest))}${kv("Ore di attività aggiuntiva",hm(aggA))}
   ${kv("Tariffa guardia (ultimo cedolino)",P.tG!=null?fmt(P.tG)+"/h":"—")}${kv("Tariffa aggiuntiva (ultimo cedolino)",P.tA!=null?fmt(P.tA)+"/h":"—")}</dl>
   <p class="note">Guardie e aggiuntiva di un mese si pagano di norma con il cedolino di due mesi dopo. Ore di guardia = ore gettone notturne + festive del cartellino. Le ore di aggiuntiva pagate sono quelle certificate nel report della U.O.C. Libera Professione, che può arrotondare rispetto alle timbrature. Netto stimato: guardie meno contributi (aliquota dall'ultimo cedolino) e IRPEF allo scaglione dell'imponibile dell'anno, senza detrazioni; aggiuntiva meno l'imposta sostitutiva del 15%.</p></div>
 <div class="box"><h3>Pagamenti di guardie e aggiuntiva</h3><div class="tbl-wrap flat"><table><thead><tr><th>Mese lavorato</th><th>Voce</th><th>Ore</th><th>Atteso (lordo)</th><th>Pagato</th><th></th></tr></thead><tbody>${pRows||'<tr><td colspan="6" class="muted">Nessuna guardia o attività aggiuntiva nei cartellini letti.</td></tr>'}</tbody></table></div>
  <p class="note">Atteso = ore × tariffa dell'ultimo cedolino (per l'aggiuntiva le ore certificate, se le hai scritte sotto). «In arrivo» finché non c'è il cedolino di due mesi dopo; poi il confronto è con le ore pagate (scarto fino a 15 minuti considerato arrotondamento).</p></div>
 ${annoBox(anno)}
 ${aggCertBox(L)}
</section>`:`<section class="sheet">${head}${errs}
 <div class="hero">
  <div class="tile"><span class="l">Ore · ${MESE_L(x.periodo)}</span><span class="v">${hm(x.fatto)}</span><span class="s">dovute ${hm(x.dovuto)} · saldo ${hmS(saldo)}</span></div>
  <div class="tile"><span class="l">Recupero ore residuo</span><span class="v">${hm(x.recupero)}</span><span class="s">${(()=>{const i=L.indexOf(x),pr=i>0&&L[i-1].periodo===ymAdd(x.periodo,-1)?L[i-1]:null,u=cartUsate(L,x);return pr&&u!=null?`${hm(pr.recupero)} di ${MESE_L(pr.periodo).toLowerCase().split(" ")[0]} ${hmS(saldo)} saldo${u?" − "+hm(u)+" recuperate":""}`:"a fine "+MESE_L(x.periodo).toLowerCase();})()}</span></div>
  <div class="tile t-liq"><span class="l">Ferie residue</span><span class="v">${nGg(ferRes)}</span><span class="s">congedo ${fN.format(fer.co.residuo)} · festività soppresse ${fN.format(fer.fs.residuo)}${fer.ap.residuo?" · anni prec. "+fN.format(fer.ap.residuo):""} (a ${MESE_L(last.periodo).toLowerCase()})</span></div>
 </div>
  <div class="box"><h3>Ferie ${anno}</h3><dl class="kv">
   ${kv("Congedo ordinario spettante",nGg(fer.co.spettanti))}${kv("Goduti",nGg(fer.co.fruiti))}${kv("Festività soppresse residue",nGg(fer.fs.residuo))}${fer.ap.residuo?kv("Residuo anni precedenti",nGg(fer.ap.residuo)):""}${kv("Residue totali",nGg(ferRes))}${fProg.length?kv(`Programmate nel piano <small>dopo ${MESE_L(last.periodo).toLowerCase()}</small>`,nGg(fProg.length))+kv("Residue dopo il piano",`<b>${nGg(ferRes-fProg.length)}</b>`,"strong"):""}</dl>
   <p class="note">${Lanno.filter(y=>y.ferieGiorni.length).map(y=>MESE_L(y.periodo)+": "+y.ferieGiorni.join(", ")).join(" · ")||"Nessun giorno di ferie nei cartellini letti."}</p></div>
 <div class="box"><h3>Mesi</h3><div class="tbl-wrap flat"><table><thead><tr><th>Mese</th><th>Fatte</th><th>Dovute</th><th>Saldo mese</th><th>Recuperate</th><th>Residuo</th><th>Notti</th><th>Festive</th><th>Aggiuntiva</th><th>Ferie</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
  <p class="note">Il residuo di recupero ore si muove così: residuo del mese prima + saldo del mese − ore recuperate con riposo (causale 9018, «recupero ore dirigenza»). Il saldo del mese, quindi, non coincide col residuo nei mesi in cui hai preso giorni di recupero. I giorni di riposo compensativo dopo una guardia festiva (9013) sono già nel saldo, come le ore mancanti il giorno prima di una notte. Tocca un mese per vederne i giorni. I cartellini «provvisori» vengono ricalcolati dall'Azienda: ristampali e sostituisci il PDF per avere i numeri aggiornati.</p></div>
 <div class="box" id="lv-giorni"><h3>Giorni di ${MESE_L(x.periodo).toLowerCase()}${x.calcolo?` <small class="muted">· calcolo del ${dIt(x.calcolo.slice(0,10))}</small>`:""}</h3>${cartCal(x)}
  <details class="more lv-dt"><summary>Timbrature giorno per giorno</summary><div class="tbl-wrap flat"><table class="lv-days"><thead><tr><th>Giorno</th><th>Timbrature</th><th>Causali</th><th>Ore</th><th>Ecc./car.</th></tr></thead><tbody>${days}</tbody></table></div></details>
  <p class="note">N notte (sul giorno in cui inizia), F guardia festiva, A aggiuntiva, Fe ferie, R recupero; in basso le ore del giorno. ${Object.keys(S.turni||{}).some(k=>k.startsWith(x.periodo))?"Bordo tratteggiato = diverso dal piano turni. ":""}<span class="lv-ta">In corsivo</span> le timbrature di attività aggiuntiva. Le notti iniziano alle 20 e finiscono il mattino dopo: le ore compaiono sul giorno di uscita.</p></div>
</section>`;}
V.presenze=()=>lavPage("presenze");
V["lv-pag"]=()=>lavPage("pag");
/* ================= v58: piano dei turni (ex tracker React) =================
   S.turni {"YYYY-MM-DD": {n:1 guardia notturna (giorno in cui inizia), f:1 guardia festiva diurna, a:ore di aggiuntiva,
   fe:1 ferie, rc:1 recupero ore}}. Serve a stimare ore e compensi PRIMA del cartellino (che arriva a fine mese e viene
   pagato due mesi dopo) e a confrontarli poi con quanto timbrato. Ore medie per notte/festiva/giornata di aggiuntiva
   ricavate dai cartellini letti (12 h / 12 h / 4 h se non ce ne sono). */
const TU_K=[["n","Notte","lv-n"],["f","Festiva","lv-f"],["a","Aggiuntiva","lv-a"],["fe","Ferie","lv-fe"],["rc","Recupero",""]];
const TU_S={n:"N",f:"F",a:"A",fe:"Fe",rc:"R"};
let TU_M=null,TU_T="n",TU_H=null;
const q25=v=>Math.round(v*4)/4;
function turniOre(){const L=S.cart?S.cart.lista:[],sm=f=>sum(L.map(f));
 const nN=sm(c=>c.notti.length),nF=sm(c=>c.festive.length),nA=sm(c=>c.aggGiorni.length);
 return{hN:nN?q25(sm(c=>c.tz.notte.mese)/nN/60):12,hF:nF?q25(sm(c=>c.tz.fest.mese)/nF/60):12,hA:nA?q25(sm(c=>c.agg)/nA/60):4,daCart:nN+nF+nA>0};}
function pianoMese(ym){const H=turniOre(),o={ym,n:0,f:0,a:0,fe:[],rc:[],giorni:0};
 Object.keys(S.turni||{}).filter(k=>k.startsWith(ym)).forEach(k=>{const t=S.turni[k],g=+k.slice(8);o.giorni++;
  if(t.n)o.n++;if(t.f)o.f++;if(t.a)o.a+=t.a;if(t.fe)o.fe.push(g);if(t.rc)o.rc.push(g);});
 o.oreN=o.n*H.hN;o.oreF=o.f*H.hF;o.oreG=o.oreN+o.oreF;o.lav=o.n+o.f+o.a>0;return o;}
/* compenso stimato di un mese di piano: lordo alla tariffa dell'ultimo cedolino, netto come in proj() */
function pianoSoldi(p){const CP=cartPagamenti(),pag=ymAdd(p.ym,2);
 const gL=CP.tG!=null?p.oreG*CP.tG:null,aL=CP.tA!=null?p.a*CP.tA:null;
 const gN=gL!=null?lavNetto("guardia",gL,pag):null,aN=aL!=null?lavNetto("aggiuntiva",aL,pag):null;
 return{gL,aL,gN,aN,lordo:(gL||0)+(aL||0),netto:gN!=null||aN!=null?(gN||0)+(aN||0):null,pag,tG:CP.tG,tA:CP.tA};}
/* ferie programmate nel piano dopo l'ultimo cartellino letto */
function ferieProgr(){const L=S.cart?S.cart.lista:[],last=L.length?L[L.length-1].periodo:"";
 return Object.keys(S.turni||{}).filter(k=>S.turni[k].fe&&k.slice(0,7)>last).sort();}
const TU_DOW=["L","M","M","G","V","S","D"];
V.turni=()=>{const H=turniOre();if(!TU_M)TU_M=TODAY.slice(0,7);if(TU_H==null)TU_H=H.hA;
 const ym=TU_M,Y=+ym.slice(0,4),M=+ym.slice(5),dim=new Date(Y,M,0).getDate(),off=(new Date(Y,M-1,1).getDay()+6)%7;
 const p=pianoMese(ym),$=pianoSoldi(p),cart=(S.cart?S.cart.lista:[]).find(c=>c.periodo===ym);
 let cells="";for(let i=0;i<off;i++)cells+=`<span class="tu-c tu-v" aria-hidden="true"></span>`;
 for(let g=1;g<=dim;g++){const d=`${ym}-${p2(g)}`,t=(S.turni||{})[d]||{},fest=festivo(new Date(Y,M-1,g));
  const tags=TU_K.filter(([k])=>t[k]).map(([k,,c])=>`<i class="tu-t tu-${k}">${TU_S[k]}${k==="a"?" "+hmF(t.a):""}</i>`).join("");
  const lab=`${g} ${MESI[M-1].toLowerCase()}`+(TU_K.filter(([k])=>t[k]).map(([k,l])=>", "+l.toLowerCase()+(k==="a"?" "+hmF(t.a)+" ore":"")).join(""));
  cells+=`<button class="tu-c${fest?" tu-fest":""}${d===TODAY?" tu-oggi":""}" data-act="tu-day" data-d="${d}" aria-label="${esc(lab)}" ${READONLY?"disabled":""}><b>${g}</b>${tags}</button>`;}
 const tool=TU_K.map(([k,l])=>`<button class="tu-tool tu-${k}${TU_T===k?" on":""}" data-act="tu-tool" data-t="${k}" aria-pressed="${TU_T===k}">${l}</button>`).join("")+`<button class="tu-tool tu-x${TU_T==="x"?" on":""}" data-act="tu-tool" data-t="x" aria-pressed="${TU_T==="x"}">Cancella</button>`;
 const nm=v=>fN.format(v);
 const riep=`<dl class="kv">${kv(`Notti di guardia <small>× ${nm(H.hN)} h</small>`,`${p.n} · ${hmF(p.oreN)} h`)}${kv(`Guardie festive diurne <small>× ${nm(H.hF)} h</small>`,`${p.f} · ${hmF(p.oreF)} h`)}${kv("Attività aggiuntiva",hmF(p.a)+" h")}${kv("Ferie",p.fe.length?nGg(p.fe.length):"—")}${kv("Recupero ore",p.rc.length?nGg(p.rc.length):"—")}</dl>`;
 const soldi=p.lav?`<dl class="kv">${$.gL!=null&&p.oreG>0?kv("Guardie <small>lordo "+fmt($.gL)+"</small>",`<span class="nt-ent">${fmt($.gN)}</span>`):""}${$.aL!=null&&p.a>0?kv("Aggiuntiva <small>lordo "+fmt($.aL)+"</small>",`<span class="nt-ent">${fmt($.aN)}</span>`):""}
   ${$.netto!=null?kv(`Netto stimato <small>con il cedolino di ${MESE_L($.pag).toLowerCase()}</small>`,`<b class="nt-ent">${fmt($.netto)}</b>`,"strong"):""}</dl>
   ${$.tG==null||$.tA==null?`<p class="note">Manca la tariffa ${$.tG==null&&$.tA==null?"di guardia e aggiuntiva":$.tG==null?"di guardia":"dell'aggiuntiva"} (si legge da un cedolino che la riporta).</p>`:""}`:`<p class="muted">Nessuna guardia o aggiuntiva nel piano di questo mese.</p>`;
 /* confronto con il cartellino del mese */
 let cmp="";if(cart){const cN=cart.notti.length,cF=cart.festive.length,cA=cart.agg/60,cFe=cart.ferieGiorni;
  const row=(l,a,b,f)=>{const d=Math.abs(a-b)>0.26;return `<tr><td>${l}</td><td>${f(a)}</td><td>${f(b)}</td><td>${d?`<span class="chip">${b>a?"+":"−"}${f(Math.abs(b-a))}</span>`:'<span class="chip ok">uguale</span>'}</td></tr>`;};
  const soloP=p.fe.filter(g=>!cFe.includes(g)),soloC=cFe.filter(g=>!p.fe.includes(g));
  cmp=`<div class="box"><h3>Piano e cartellino di ${MESE_L(ym).toLowerCase()}${cart.provvisorio?' <small class="muted">cartellino provvisorio</small>':""}</h3>
   <div class="tbl-wrap flat"><table class="tu-cmp"><thead><tr><th></th><th>Piano</th><th>Cartellino</th><th></th></tr></thead><tbody>
   ${row("Notti di guardia",p.n,cN,v=>String(Math.round(v)))}${row("Guardie festive",p.f,cF,v=>String(Math.round(v)))}${row("Ore di aggiuntiva",p.a,cA,v=>hmF(v))}${row("Giorni di ferie",p.fe.length,cFe.length,v=>String(Math.round(v)))}</tbody></table></div>
   ${soloP.length||soloC.length?`<p class="note">${soloP.length?`Ferie nel piano ma non nel cartellino: ${soloP.join(", ")}. `:""}${soloC.length?`Ferie nel cartellino ma non nel piano: ${soloC.join(", ")}.`:""}</p>`:""}
   <p class="note">L'aggiuntiva pagata è quella certificata dalla U.O.C. Libera Professione, che può differire dalle ore timbrate. Le notti si confrontano per numero: nel cartellino le ore di una notte stanno sul giorno di uscita.</p></div>`;}
 return `<section class="sheet">
 <div class="sheet-h"><h2>Turni</h2><p>Il piano del mese: segna guardie, aggiuntiva, ferie e recuperi per avere subito ore e compensi stimati, senza aspettare il cartellino. Quando il cartellino arriva, il piano si confronta con quanto timbrato.</p></div>
 <div class="box tu-box">
  <div class="tu-nav"><button class="btn ghost sm" data-act="tu-m" data-d="-1" aria-label="Mese prima">‹</button><h3>${MESE_L(ym)}${p.giorni?` <small>${p.giorni} ${p.giorni===1?"giorno segnato":"giorni segnati"}</small>`:""}</h3><button class="btn ghost sm" data-act="tu-m" data-d="1" aria-label="Mese dopo">›</button></div>
  <div class="tu-tools" role="toolbar" aria-label="Cosa segnare">${tool}<label class="tu-h" ${TU_T==="a"?"":"hidden"}>ore <input class="in" id="tu-h" inputmode="decimal" value="${nm(TU_H)}" aria-label="Ore di aggiuntiva per giorno"></label></div>
  <p class="note tu-hint">Scegli cosa segnare, poi tocca i giorni (un secondo tocco lo toglie). La notte va sul giorno in cui inizia.</p>
  <div class="tu-g">${TU_DOW.map((d,i)=>`<span class="tu-dw${i>4?" tu-fest":""}">${d}</span>`).join("")}${cells}</div>
  ${READONLY?"":`<div class="actions"><button class="lnk" data-act="tu-clear" ${p.giorni?"":"disabled"}>svuota il mese</button></div>`}
 </div>
 <div class="grid tu-sum"><div class="box"><h3>Ore del piano</h3>${riep}<p class="note">Ore medie per notte, festiva e giornata di aggiuntiva ${H.daCart?"dai cartellini letti":"predefinite (12 h, 12 h, 4 h): diventano le tue medie quando ci sono cartellini"}.</p></div>
  <div class="box"><h3>Compenso stimato</h3>${soldi}<p class="note">Lordo = ore × tariffa dell'ultimo cedolino. Netto: guardie meno contributi e IRPEF allo scaglione stimato, aggiuntiva meno l'imposta sostitutiva del 15%. Pagato di norma con il cedolino di due mesi dopo; finché il cartellino non c'è, la stima di Finanze usa questo piano.</p></div></div>
 ${cmp}
</section>`;};
function tuSet(d){if(READONLY)return;const t=Object.assign({},(S.turni||{})[d]||{}),k=TU_T;
 if(k==="x"){delete S.turni[d];}
 else{if(k==="a"){const h=TU_H>0&&TU_H<=24?TU_H:turniOre().hA;if(t.a===h)delete t.a;else t.a=h;}else if(t[k])delete t[k];else t[k]=1;
  if(t[k]&&(k==="fe"||k==="rc")){["n","f","a",k==="fe"?"rc":"fe"].forEach(x=>delete t[x]);}
  else if(t[k]&&["n","f","a"].includes(k)){delete t.fe;delete t.rc;}
  if(Object.keys(t).length)S.turni[d]=t;else delete S.turni[d];}
 scheduleSave();render();}
view.addEventListener("click",e=>{const b=e.target.closest("[data-act^='tu-']");if(!b)return;const a=b.dataset.act;e.preventDefault();
 if(!S.turni)S.turni={};
 if(a==="tu-day")tuSet(b.dataset.d);
 else if(a==="tu-tool"){TU_T=b.dataset.t;render();}
 else if(a==="tu-m"){TU_M=ymAdd(TU_M||TODAY.slice(0,7),+b.dataset.d);render();}
 else if(a==="tu-clear"){const ks=Object.keys(S.turni).filter(k=>k.startsWith(TU_M));if(!ks.length||!confirm(`Togliere i ${ks.length} giorni segnati in ${MESE_L(TU_M).toLowerCase()}?`))return;ks.forEach(k=>delete S.turni[k]);scheduleSave();render();}});
view.addEventListener("change",e=>{if(e.target.id!=="tu-h")return;const v=parseFloat(String(e.target.value).replace(",","."));if(v>0&&v<=24){TU_H=q25(v);e.target.value=fN.format(TU_H);}else e.target.value=fN.format(TU_H);});
/* ================= v59: orario e riposi (dalle timbrature dei cartellini) =================
   Riferimenti: D.Lgs. 66/2003 art. 4 (durata media ≤ 48 h ogni 7 giorni, straordinari compresi, media su un periodo
   non superiore a 4 mesi), art. 6 (ferie e malattia non contano nella media), art. 7 (11 h di riposo consecutivo ogni
   24 h); dirigenti medici inclusi dal 25/11/2015 (L. 161/2014, art. 14). Deroghe di CCNL/accordi aziendali NON
   considerate (scelta di Marco, 11/11/2026: in sospeso). Solo promemoria personale, non un giudizio di conformità.
   Turni: intervalli timbrati uniti se contigui (24:00 → 00:00 del giorno dopo) o separati da una pausa < 2 h; il
   riposo è lo stacco tra la fine di un turno e l'inizio del successivo. Ore settimanali = somma delle timbrature
   (pause escluse) da lunedì a domenica; contano solo le settimane con tutti i 7 giorni coperti da cartellini. */
const ORA_PAUSA=120,ORA_RIP=11*60,ORA_SETT=48*60,ORA_MED=17;
const hm2m=s=>{const m=/^(\d{1,2}):(\d{2})$/.exec(String(s||""));return m?+m[1]*60+ +m[2]:null;};
const dayISO=(Y,M,g)=>`${Y}-${p2(M)}-${p2(g)}`;
let ORA={r:null,v:null};
function oraDati(){if(ORA.r===S.cart&&ORA.v)return ORA.v;
 const L=(S.cart?S.cart.lista:[]).slice().sort((a,b)=>a.periodo.localeCompare(b.periodo));
 const iv=[],inc=[],cop=new Set(),fer=new Set();
 L.forEach(c=>{const Y=+c.periodo.slice(0,4),M=+c.periodo.slice(5),dim=new Date(Y,M,0).getDate();
  for(let g=1;g<=dim;g++)cop.add(dayISO(Y,M,g));(c.ferieGiorni||[]).forEach(g=>fer.add(dayISO(Y,M,g)));
  c.giorni.forEach(d=>d.t.forEach(([e,u,k])=>{const a=hm2m(e),b=hm2m(u);if(a==null||b==null){inc.push(dayISO(Y,M,d.g));return;}
   const s=new Date(Y,M-1,d.g,0,a).getTime(),en=new Date(Y,M-1,d.g,0,b).getTime();if(en>s)iv.push({s,e:en,a:k==="a"});}));});
 iv.sort((x,y)=>x.s-y.s);
 /* i giorni prima della prima timbratura (es. prima dell'assunzione) non sono «coperti»: le settimane a 0 h non abbassano la media */
 if(iv.length){const f0=isoD(new Date(iv[0].s));[...cop].forEach(d=>{if(d<f0)cop.delete(d);});}
 const tu=[];iv.forEach(x=>{const l=tu[tu.length-1];if(l&&x.s-l.e<ORA_PAUSA*60000){l.e=Math.max(l.e,x.e);l.min+=(x.e-x.s)/60000;l.a=l.a||x.a;}else tu.push({s:x.s,e:x.e,min:(x.e-x.s)/60000,a:x.a});});
 const rip=[];for(let i=1;i<tu.length;i++){const gap=(tu[i].s-tu[i-1].e)/60000;if(gap<ORA_RIP)rip.push({fine:tu[i-1].e,inizio:tu[i].s,min:Math.round(gap)});}
 /* settimane lun–dom */
 const sett=[];if(L.length){const d0=new Date(+L[0].periodo.slice(0,4),+L[0].periodo.slice(5)-1,1),lp=L[L.length-1].periodo,dEnd=new Date(+lp.slice(0,4),+lp.slice(5),0);
  let w=new Date(d0);w.setDate(w.getDate()-((w.getDay()+6)%7));
  while(w<=dEnd){const ws=w.getTime(),we=new Date(w.getFullYear(),w.getMonth(),w.getDate()+7).getTime(),gg=[];
   for(let i=0;i<7;i++){const x=new Date(w.getFullYear(),w.getMonth(),w.getDate()+i);gg.push(isoD(x));}
   const full=gg.every(x=>cop.has(x)),fe=gg.filter(x=>fer.has(x)).length;
   const min=Math.round(sum(iv.map(x=>Math.max(0,Math.min(x.e,we)-Math.max(x.s,ws))/60000)));
   sett.push({da:gg[0],a:gg[6],min,full,fe});w=new Date(we);}}
 const valide=sett.filter(x=>x.full&&!x.fe),ult=valide.slice(-ORA_MED),media=ult.length?sum(ult.map(x=>x.min))/ult.length:null;
 ORA={r:S.cart,v:{tu,rip,sett,inc:[...new Set(inc)],media,nMed:ult.length,medDa:ult.length?ult[0].da:"",medA:ult.length?ult[ult.length-1].a:"",sopra:sett.filter(x=>x.full&&x.min>ORA_SETT)}};return ORA.v;}
const dtIt=ms=>{const d=new Date(ms);return `${p2(d.getDate())}/${p2(d.getMonth()+1)} ${p2(d.getHours())}:${p2(d.getMinutes())}`;};
const ddIt=iso=>iso?iso.slice(8,10)+"/"+iso.slice(5,7):"";
function oraChart(sett){const W=Math.max(320,sett.length*18+50),H=170,L=34,T=10,B=24,ph=H-T-B,mx=Math.max(60*60,...sett.map(x=>x.min))/60;
 const top=Math.ceil(mx/12)*12,y=v=>T+ph-(v/top)*ph,bw=Math.max(6,Math.min(14,(W-L-8)/sett.length-4)),slot=(W-L-8)/sett.length;
 let g="";[0,24,48,top].filter((v,i,a)=>a.indexOf(v)===i&&v<=top).forEach(v=>{g+=`<line x1="${L}" x2="${W-4}" y1="${y(v)}" y2="${y(v)}" style="stroke:var(--line)" ${v===48?'stroke-dasharray="5 4" stroke-width="1.5" class="o48"':""}/><text x="${L-5}" y="${y(v)+4}" text-anchor="end">${v}</text>`;});
 let bs="",lab="",lastM="";sett.forEach((x,i)=>{const cx=L+slot*i+slot/2,h=x.min/60,cls=!x.full?"o-p":x.fe?"o-f":x.min>ORA_SETT?"o-x":"o-n";
  bs+=`<rect class="${cls}" x="${(cx-bw/2).toFixed(1)}" y="${y(h).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(ph-(y(h)-T),0.5).toFixed(1)}" rx="2"><title>${ddIt(x.da)}–${ddIt(x.a)}: ${hm(x.min)} h${!x.full?" (settimana non completa nei cartellini)":x.fe?` (${x.fe} ${x.fe===1?"giorno":"giorni"} di ferie: esclusa dalla media)`:""}</title></rect>`;
  const m=x.da.slice(5,7);if(m!==lastM){lastM=m;lab+=`<text x="${(cx-bw/2).toFixed(1)}" y="${H-7}">${MESI[+m-1].slice(0,3).toLowerCase()}</text>`;}});
 return `<div class="tbl-wrap flat o-wrap"><svg class="o-ch" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Ore lavorate per settimana">${g}${bs}${lab}</svg></div>`;}
V["lv-ora"]=()=>{const L=S.cart?S.cart.lista:[];
 const head=`<div class="sheet-h"><h2>Orario e riposi</h2><p>Dalle timbrature dei cartellini: riposi tra un turno e l'altro e ore lavorate per settimana, confrontati con i limiti di legge sull'orario di lavoro.</p></div>`;
 if(!L.length)return `<section class="sheet">${head}<div class="banner">Nessun cartellino ancora: <a href="#presenze">Presenze e ferie</a>.</div></section>`;
 const O=oraDati(),rs=O.rip.slice().reverse(),lastW=O.sett.filter(x=>x.full).slice(-1)[0];
 const rows=rs.map(r=>`<tr><td>${dtIt(r.fine)}</td><td>${dtIt(r.inizio)}</td><td class="neg"><b>${hm(r.min)}</b></td></tr>`).join("");
 return `<section class="sheet">${head}
 <div class="hero">
  <div class="tile ${O.rip.length?"t-tax":"t-liq"}"><span class="l">Riposi sotto 11 ore</span><span class="v">${O.rip.length}</span><span class="s">${O.rip.length?"l'ultimo il "+dtIt(O.rip[O.rip.length-1].inizio).slice(0,5):"nessuno"} · ${MESE_L(L[0].periodo).toLowerCase()} – ${MESE_L(L[L.length-1].periodo).toLowerCase()}</span></div>
  <div class="tile ${O.media!=null&&O.media>ORA_SETT?"t-tax":""}"><span class="l">Media settimanale</span><span class="v">${O.media!=null?hm(Math.round(O.media)):"—"} h</span><span class="s">${O.nMed?`${O.nMed} settimane complete senza ferie, ${ddIt(O.medDa)} – ${ddIt(O.medA)} (limite 48 h)`:"servono settimane complete nei cartellini"}</span></div>
  <div class="tile"><span class="l">Settimane oltre 48 h</span><span class="v">${O.sopra.length}</span><span class="s">${lastW?`ultima settimana completa: ${hm(lastW.min)} h`:"—"}</span></div>
 </div>
 <div class="box"><h3>Riposi tra turni sotto 11 ore</h3>
  ${rows?`<div class="tbl-wrap flat"><table class="o-rip"><thead><tr><th>Fine turno</th><th>Inizio turno dopo</th><th>Riposo</th></tr></thead><tbody>${rows}</tbody></table></div>`:`<p class="muted">Nessuno nei cartellini letti.</p>`}
  <details class="more"><summary>Come si calcola</summary><p class="note">Le timbrature si uniscono in turni: una notte (fino alle 24:00 e dalle 00:00 del giorno dopo) è un turno solo, e una pausa sotto le 2 ore nella stessa giornata non conta come riposo. Il riposo è il tempo tra la fine di un turno e l'inizio del successivo; sono elencati quelli sotto le 11 ore consecutive (D.Lgs. 66/2003, art. 7).${O.inc.length?` Timbrature incomplete, escluse dal calcolo: ${O.inc.map(ddIt).join(", ")}.`:""}</p></details></div>
 <div class="box"><h3>Ore per settimana <small>lunedì–domenica</small></h3>
  ${oraChart(O.sett)}
  <ul class="pleg o-leg"><li><i class="o-n"></i><span>Settimana</span></li><li><i class="o-x"></i><span>Oltre 48 h</span></li><li><i class="o-f"></i><span>Con ferie (esclusa dalla media)</span></li><li><i class="o-p"></i><span>Non completa nei cartellini</span></li></ul>
  ${O.sopra.length?`<p class="note">Oltre 48 h: ${O.sopra.map(x=>`${ddIt(x.da)}–${ddIt(x.a)} (${hm(x.min)} h)`).join(" · ")}. Una singola settimana può superarle: il limite riguarda la media.</p>`:""}
  <details class="more"><summary>Riferimenti e limiti del calcolo</summary><p class="note">D.Lgs. 66/2003: art. 4, durata media dell'orario non oltre 48 ore ogni 7 giorni, straordinari compresi, calcolata su un periodo di riferimento non superiore a 4 mesi; art. 6, ferie e malattia non entrano nella media; art. 7, 11 ore di riposo consecutivo ogni 24 ore. Per i dirigenti medici del SSN valgono dal 25/11/2015 (L. 161/2014, art. 14). Qui la media è sulle ultime ${ORA_MED} settimane complete (circa 4 mesi) senza giorni di ferie. Non sono considerate le deroghe previste da contratti collettivi o accordi aziendali, né le assenze per malattia (il cartellino non le distingue qui): è un promemoria personale, non una verifica di conformità.</p></details></div>
</section>`;};
/* ================= v59: ore di aggiuntiva certificate (report U.O.C. Libera Professione) ================= */
/* S.aggCert {"YYYY-MM": ore}: se c'è, sostituisce le ore timbrate nella stima del pagamento dell'aggiuntiva */
const aggOre=c=>{const v=(S.aggCert||{})[c.periodo];return v!=null?v:c.agg/60;};
function aggCertBox(L){const M=L.filter(c=>c.agg>0||(S.aggCert||{})[c.periodo]!=null).slice().reverse();if(!M.length)return "";
 return `<div class="box" id="ac-box"><h3>Ore di aggiuntiva certificate</h3>
  <div class="ac-l">${M.map(c=>{const v=(S.aggCert||{})[c.periodo];
   return `<label class="ac-r"><span>${MESE_L(c.periodo)}<br><small class="muted">timbrate ${hm(c.agg)}</small></span><input class="in ac-in" data-ym="${c.periodo}" inputmode="decimal" value="${v!=null?fN.format(v):""}" placeholder="ore" aria-label="Ore certificate di ${MESE_L(c.periodo).toLowerCase()}" ${READONLY?"disabled":""}></label>`;}).join("")}</div>
  <p class="note">Le ore pagate sono quelle del report della U.O.C. Libera Professione, che può arrotondare rispetto alle timbrature. Se le scrivi qui, la stima del pagamento usa queste al posto delle timbrate (in ore decimali: 8,5 = 8 ore e 30). Vuoto = ore timbrate.</p></div>`;}
view.addEventListener("change",e=>{const t=e.target;if(!t.classList||!t.classList.contains("ac-in")||READONLY)return;
 const ym=t.dataset.ym,raw=String(t.value).trim().replace(",",".");if(!S.aggCert)S.aggCert={};
 const prev=S.aggCert[ym];if(raw===""){if(prev==null)return;delete S.aggCert[ym];}else{const v=parseFloat(raw);if(!(v>=0&&v<=300)){t.classList.add("bad");return;}const nv=Math.round(v*100)/100;if(prev===nv)return;S.aggCert[ym]=nv;}
 scheduleSave();setTimeout(render,0);});
/* ================= v59: anno mese per mese (guardie e aggiuntiva) ================= */
function annoBox(Y){const P=cartPagamenti(),L=(S.cart?S.cart.lista:[]).filter(c=>c.periodo.startsWith(Y)),last=L.length?L[L.length-1].periodo:"";
 const pm=[...new Set(Object.keys(S.turni||{}).map(k=>k.slice(0,7)))].filter(m=>m.startsWith(Y)&&m>last).sort().map(pianoMese).filter(q=>q.lav);
 const mesi=[...L.map(c=>({ym:c.periodo,n:c.tz.notte.mese/60,f:c.tz.fest.mese/60,a:aggOre(c),pj:false})),...pm.map(q=>({ym:q.ym,n:q.oreN,f:q.oreF,a:q.a,pj:true}))];
 if(!mesi.length)return "";
 const soldi=m=>{if(m.pj){const $=pianoSoldi(pianoMese(m.ym));return{l:$.lordo,n:$.netto,st:"piano"};}
  const rr=P.righe.filter(r=>r.periodo===m.ym);const l=sum(rr.map(r=>r.pag?r.pag.importo:(r.stima||0)));
  const n=sum(rr.map(r=>{const v=r.pag?r.pag.importo:r.stima;return v?lavNetto(r.tipo,v,r.pag?r.pag.ced[0]:r.atteso)||0:0;}));
  const st=!rr.length?"":rr.every(r=>r.pag)?"pagato":rr.some(r=>r.pag)?"in parte":"in arrivo";return{l,n,st};};
 const R2=mesi.map(m=>Object.assign(m,{$:soldi(m)})),top=Math.max(12,...R2.map(m=>m.n+m.f+m.a));
 const W=Math.max(300,R2.length*46+40),H=150,T=8,B=22,ph=H-T-B,yy=v=>T+ph-v/top*ph,slot=(W-36)/R2.length,bw=Math.min(26,slot-10);
 let bars="";R2.forEach((m,i)=>{const cx=36+slot*i+slot/2;let acc=0;[["n","var(--inv)"],["f","var(--tax)"],["a","var(--ent-t)"]].forEach(([k,c])=>{const v=m[k];if(!(v>0))return;
  bars+=`<rect x="${(cx-bw/2).toFixed(1)}" y="${yy(acc+v).toFixed(1)}" width="${bw.toFixed(1)}" height="${(ph*v/top).toFixed(1)}" style="fill:${c}" ${m.pj?'class="a-pj"':""}><title>${MESE_L(m.ym)}${m.pj?" (piano)":""}: ${k==="n"?"notti":k==="f"?"festive":"aggiuntiva"} ${hmF(v)} h</title></rect>`;acc+=v;});
  bars+=`<text x="${cx}" y="${H-6}" text-anchor="middle">${MESI[+m.ym.slice(5)-1].slice(0,3).toLowerCase()}</text>`;});
 const g=[0,Math.round(top/2),top].map(v=>`<line x1="36" x2="${W-2}" y1="${yy(v)}" y2="${yy(v)}" style="stroke:var(--line)" stroke-dasharray="3 4"/><text x="31" y="${yy(v)+4}" text-anchor="end">${v}</text>`).join("");
 const tL=sum(R2.map(m=>m.$.l)),tN=sum(R2.map(m=>m.$.n||0)),tH=sum(R2.map(m=>m.n+m.f+m.a));
 const rows=R2.map(m=>`<tr${m.pj?' class="a-pjr"':""}><td>${MESE_L(m.ym)}<br><small class="muted">${m.pj?"dal piano":m.$.st||""}</small></td><td>${hmF(m.n+m.f+m.a)}</td><td>${m.$.l?fmt(m.$.l):"—"}</td><td>${m.$.n?fmt(m.$.n):"—"}</td></tr>`).join("");
 const nG=P.tG!=null?lavNetto("guardia",P.tG,TODAY.slice(0,7)):null,nA=P.tA!=null?P.tA*0.85:null;
 return `<div class="box" id="anno-box"><h3>Mese per mese · ${Y} <small>${hmF(tH)} ore · ≈ ${fmt(tN)} netti</small></h3>
  <div class="tbl-wrap flat o-wrap"><svg class="o-ch" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Ore di guardia e aggiuntiva mese per mese ${Y}"><defs><pattern id="a-pjp" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="3" height="6" fill="var(--surface)" opacity=".55"/></pattern></defs>${g}${bars}</svg></div>
  <ul class="pleg o-leg"><li><i style="background:var(--inv)"></i><span>Guardie notturne</span></li><li><i style="background:var(--tax)"></i><span>Guardie festive</span></li><li><i style="background:var(--ent-t)"></i><span>Aggiuntiva</span></li><li><i class="a-pjl"></i><span>Dal piano turni</span></li></ul>
  <div class="tbl-wrap flat"><table class="a-t"><thead><tr><th>Mese lavorato</th><th>Ore</th><th>Lordo</th><th>Netto ≈</th></tr></thead><tbody>${rows}</tbody>
   <tfoot><tr class="tot"><td>Totale</td><td>${hmF(tH)}</td><td>${fmt(tL)}</td><td>${fmt(tN)}</td></tr></tfoot></table></div>
  <dl class="kv">${nG!=null?kv("Un'ora di guardia <small>netto stimato</small>",fmt(nG)+"/h"):""}${nA!=null?kv("Un'ora di aggiuntiva <small>netto</small>",fmt(nA)+"/h"):""}</dl>
  <p class="note">Ore per mese lavorato (si pagano di norma due mesi dopo). Lordo = pagato nel cedolino se c'è, altrimenti stima (ore × tariffa). Netto stimato anche per i mesi pagati: il cedolino non separa le trattenute per voce.</p></div>`;}
/* ================= v59: calendario del mese dal cartellino (Presenze) ================= */
function cartCal(x){const Y=+x.periodo.slice(0,4),M=+x.periodo.slice(5),dim=new Date(Y,M,0).getDate(),off=(new Date(Y,M-1,1).getDay()+6)%7,byG={};x.giorni.forEach(g=>byG[g.g]=g);
 let c="";for(let i=0;i<off;i++)c+=`<span class="tu-c tu-v" aria-hidden="true"></span>`;
 for(let g=1;g<=dim;g++){const d=byG[g]||{},tags=[],pl=(S.turni||{})[dayISO(Y,M,g)]||{};
  if(x.notti.includes(g))tags.push(`<i class="tu-t tu-n">N</i>`);if(x.festive.includes(g))tags.push(`<i class="tu-t tu-f">F</i>`);
  const am=x.aggGiorni.includes(g)?sum((d.c||[]).filter(z=>z[0]==="000038").map(z=>z[1]||0)):0;if(am)tags.push(`<i class="tu-t tu-a">A ${hm(am)}</i>`);
  if(x.ferieGiorni.includes(g))tags.push(`<i class="tu-t tu-fe">Fe</i>`);if(x.recGiorni.includes(g))tags.push(`<i class="tu-t tu-rc">R</i>`);
  const diff=(!!pl.n!==x.notti.includes(g))||(!!pl.f!==x.festive.includes(g))||(!!pl.fe!==x.ferieGiorni.includes(g));
  const hasPl=Object.keys(S.turni||{}).some(k=>k.startsWith(x.periodo));
  c+=`<span class="tu-c${festivo(new Date(Y,M-1,g))?" tu-fest":""}${hasPl&&diff?" tu-diff":""}" title="${hasPl&&diff?"diverso dal piano turni":""}"><b>${g}</b>${tags.join("")}${d.tc?`<small class="tu-o">${hm(d.tc)}</small>`:""}</span>`;}
 return `<div class="tu-g tu-ro">${TU_DOW.map((d,i)=>`<span class="tu-dw${i>4?" tu-fest":""}">${d}</span>`).join("")}${c}</div>`;}
function cartInfo(){const cs=cartState(),c=S.cart,L=c?c.lista:[];
 return [["Cartellini letti",c?L.filter(x=>x.ok).length+" verificati"+(L.some(x=>!x.ok)?", "+L.filter(x=>!x.ok).length+" da controllare":"")+(c.errori.length?", "+c.errori.length+" illeggibili":""):"—"],
  ["Mesi",L.length?MESE_L(L[0].periodo)+" – "+MESE_L(L[L.length-1].periodo):"nessuno"],
  ["Ultima lettura sul PC",c&&c.agg?fmtWhen(Date.parse(c.agg)):"—"],
  ["Ultimo controllo",cs.err?"non riuscito ("+esc(cs.err)+")":fmtWhen(cs.check)]].map(([a,b])=>`<dt>${a}</dt><dd class="txtv">${b}</dd>`).join("");}
view.addEventListener("click",e=>{const b=e.target.closest("[data-act='cart-sel'],[data-act='x-cart']");if(!b)return;
 if(b.dataset.act==="x-cart"){e.preventDefault();cartSync(true,true);return;}
 CART_SEL=b.dataset.ym;render();const t=document.getElementById("lv-giorni");if(t)t.scrollIntoView({behavior:"smooth",block:"start"});});
view.addEventListener("keydown",e=>{const r=e.target.closest&&e.target.closest("tr[data-act='cart-sel']");if(r&&(e.key==="Enter"||e.key===" ")){e.preventDefault();r.click();}});

/* ================= sondaggi (ex app Guadagni sondaggi, ora dentro il Gestionale) ================= */
/* Stessi dati e stesso formato dell'app Guadagni: localStorage «survey-earnings-tracker-v1»
   {v,sites[{id,name,color}],months{"YYYY-MM":{site:{g,p}}},pending[{id,site,amount,note,date}],updatedAt}, importi in centesimi.
   Backup sul PC con l'app Hub «guadagni» (stessa cartella di prima). Ogni modifica aggiorna anche Entrate › Sondaggi (prelievi). */
const SOND_DEF_SITES=[{id:"sermo",name:"Sermo",color:"#3E6FD8"},{id:"m3",name:"M3 Global Research",color:"#2BA39A"},{id:"agc",name:"AllGlobalCircle",color:"#9A5BD6"},{id:"hab",name:"HabCentral",color:"#D88A2E"},{id:"zoomrx",name:"ZoomRx",color:"#D4547A"}];
const SOND_PAL=["#3E6FD8","#2BA39A","#9A5BD6","#D88A2E","#D4547A","#4E9A3A","#C0453A","#2E8DB8","#8A6D3B","#6B5BD6","#B8478F","#5A7A8C"];
const SOND_HUB_STATE_KEY="gestionale-sond-hub";
const isoToday=()=>new Date().toLocaleDateString("sv-SE");
function sondSites(arr){if(!Array.isArray(arr)||!arr.length)return SOND_DEF_SITES.map(s=>({...s}));const out=[],seen=new Set();
 arr.forEach((s,i)=>{if(!s||typeof s.id!=="string"||!/^[a-z0-9_-]{1,48}$/.test(s.id)||seen.has(s.id))return;seen.add(s.id);
  out.push({id:s.id,name:String(s.name||"").trim().slice(0,40)||s.id,color:/^#[0-9a-fA-F]{6}$/.test(s.color||"")?s.color:SOND_PAL[i%SOND_PAL.length]});});
 return out.length?out:SOND_DEF_SITES.map(s=>({...s}));}
function sondClean(d){d=d&&typeof d==="object"?d:{};const sites=sondSites(d.sites),ids=new Set(sites.map(s=>s.id)),months={};
 Object.entries(d.months&&typeof d.months==="object"?d.months:{}).sort((a,b)=>a[0].localeCompare(b[0])).forEach(([k,row])=>{if(!ymOk(k)||!row||typeof row!=="object")return;const r={};
  sites.forEach(s=>{const c=row[s.id];if(c&&(c.g||c.p))r[s.id]={g:Math.max(0,Math.round(+c.g||0)),p:Math.max(0,Math.round(+c.p||0))};});if(Object.keys(r).length)months[k]=r;});
 const seen=new Set(),pending=(Array.isArray(d.pending)?d.pending:[]).filter(x=>x&&typeof x.id==="string"&&!seen.has(x.id)&&ids.has(x.site)&&+x.amount>0)
  .map(x=>{seen.add(x.id);return{id:x.id.slice(0,40),site:x.site,amount:Math.round(+x.amount),note:String(x.note||"").slice(0,80),date:dOk(x.date)?x.date:isoToday()};});
 return{v:1,sites,months,pending};}
let SV=null;
function svLoad(){try{const raw=lsGet(SOND_LS_KEY);const d=raw?JSON.parse(raw):null;SV=sondClean(d);SV.updatedAt=d&&d.updatedAt||"";}catch(e){SV=sondClean(null);SV.updatedAt="";}return SV;}
function svData(){return{v:1,sites:SV.sites,months:SV.months,pending:SV.pending}}
const svSig=d=>JSON.stringify([d.sites,d.months,d.pending]);
/* modifica locale: salva, aggiorna Entrate, programma il backup sul PC */
function svSave(){SV=Object.assign(sondClean(SV),{updatedAt:new Date().toISOString()});
 lsSet(SOND_LS_KEY,JSON.stringify(Object.assign(svData(),{updatedAt:SV.updatedAt})));
 if(hasRealData(S)&&applySond({months:SV.months,t:Date.now(),fonte:"locale"}))scheduleSave();
 clearTimeout(svHubTimer);svHubTimer=setTimeout(()=>svHubSync(false),8000);}
const svGet=(k,id,f)=>(SV.months[k]&&SV.months[k][id]&&SV.months[k][id][f])||0;

const svTot=k=>{let g=0,p=0;SV.sites.forEach(s=>{g+=svGet(k,s.id,"g");p+=svGet(k,s.id,"p");});return{g,p}};
const svUsed=()=>Object.keys(SV.months).filter(k=>{const t=svTot(k);return t.g||t.p}).sort();

const cE=c=>fmt((c||0)/100);


/* backup dei sondaggi sul PC (Hub, app «guadagni») */
let svHubTimer=null,svHubBusy=false;
function svHubState(){return lsJSON(SOND_HUB_STATE_KEY)}
async function svHubSync(force){if(svHubBusy||!hubUrl()||!SV||!svUsed().length&&!SV.pending.length)return;
 const body=JSON.stringify(svData()),h=await sha(body);if(!force&&svHubState().lastHash===h)return;
 svHubBusy=true;
 try{const r=await hubFetch("/api/guadagni/backup",{method:"POST",headers:{"Content-Type":"application/json"},body});
  lsSet(SOND_HUB_STATE_KEY,JSON.stringify({lastHash:h,lastSig:svSig(sondClean(svData())),lastOk:Date.now(),lastErr:"",file:r&&r.file||""}));if(force)linkMsg("sond","Backup dei sondaggi salvato sul PC.");}
 catch(e){lsSet(SOND_HUB_STATE_KEY,JSON.stringify(Object.assign(svHubState(),{lastErr:e.message,lastErrAt:Date.now()})));if(force)linkMsg("sond","Backup dei sondaggi non riuscito: "+e.message+".");}
 finally{svHubBusy=false;refreshLinks();}}

/* ---- vista ----
   La sezione Sondaggi è l'app Guadagni sondaggi originale, copiata tale e quale in «sondaggi/» e mostrata in un iframe
   (stessa origine, stessa chiave localStorage: ogni modifica arriva qui con l'evento «storage» e aggiorna Entrate › Sondaggi).
   L'iframe prende l'altezza del contenuto (niente doppia barra di scorrimento) e non viene ricreato ai render successivi. */
V.sondaggi=()=>`<section class="sheet sv-embed"><iframe id="sv-frame" src="sondaggi/index.html?v=11" title="Guadagni sondaggi" loading="eager"></iframe></section>`;
let svFrameRO=null;
function svFrameFit(){const f=document.getElementById("sv-frame");if(!f)return;try{const d=f.contentDocument;if(!d||!d.documentElement)return;
 const h=Math.max(d.documentElement.scrollHeight,d.body?d.body.scrollHeight:0);if(h&&Math.abs(f.offsetHeight-h)>1)f.style.height=h+"px";}catch(e){}}
function svFrameInit(){const f=document.getElementById("sv-frame");if(!f||f.dataset.init)return;f.dataset.init="1";
 f.addEventListener("load",()=>{svFrameFit();try{const d=f.contentDocument;if(svFrameRO)svFrameRO.disconnect();
   if(window.ResizeObserver){svFrameRO=new ResizeObserver(svFrameFit);svFrameRO.observe(d.documentElement);if(d.body)svFrameRO.observe(d.body);}
   d.addEventListener("toggle",()=>setTimeout(svFrameFit,30),true);d.addEventListener("click",()=>setTimeout(svFrameFit,60),true);}catch(e){}});
 window.addEventListener("resize",svFrameFit);}
/* backup dei sondaggi su file e dal PC (riquadro in Collegamenti) */
function svExport(){const blob=new Blob([JSON.stringify(Object.assign(svData(),{exportedAt:new Date().toISOString()}),null,2)],{type:"application/json"});
 const u=URL.createObjectURL(blob),l=document.createElement("a");l.href=u;l.download="guadagni-sondaggi-"+isoToday()+".json";document.body.appendChild(l);l.click();l.remove();setTimeout(()=>URL.revokeObjectURL(u),2000);linkMsg("sond","Backup dei sondaggi scaricato.");}
function svReplace(d,origine){const n=sondClean(d);if(!confirm(`Sostituire i dati dei sondaggi di questo dispositivo con ${origine} (${Object.keys(n.months).length} mesi, ${n.sites.length} piattaforme)?`))return false;
 SV=Object.assign(n,{updatedAt:""});svSave();return true;}
/* ================= dashboard Lavoro (v60: niente ciambelle — barre, mini-calendario, colonnine) =================
   Scelta di Marco (12/11/2026): troppe ciambelle inutili. Ogni riquadro usa la forma adatta al dato:
   composizione delle ore del mese e del cedolino = barra orizzontale impilata (con il riferimento delle ore dovute);
   ferie = barra di avanzamento (godute · programmate · residue); andamenti (settimane, mesi, recupero) = colonnine
   con la linea di riferimento; piano dei turni = mini-calendario; pagamenti = elenco per mese di pagamento. */
const hmF=v=>hm(Math.round(v*60)); /* ore decimali -> h:mm */
/* barra orizzontale impilata: segs [[etichetta, valore, token colore]], max = fondo scala, mark {v,l} = tacca di riferimento */
function hbar(segs,max,mark,fv,label){const s=segs.filter(x=>x[1]>0),F=fv||fmt;if(!(max>0))return "";
 return `<div class="hb" role="img" aria-label="${esc(label||"")}: ${s.map(([l,v])=>l+" "+F(v)).join(", ")}"><div class="hb-t">${s.map(([l,v,c])=>`<i style="width:${Math.min(v/max*100,100).toFixed(2)}%;background:var(--${c})" title="${esc(l)}: ${F(v)}"></i>`).join("")}</div>${mark&&mark.v>0?`<b class="hb-m" style="left:${Math.min(mark.v/max*100,100).toFixed(2)}%" title="${esc(mark.l)}"><span>${esc(mark.l)}</span></b>`:""}</div>`;}
/* legenda con valori (testo nei colori del testo, il quadratino porta il colore) */
const lgd=(segs,fv)=>`<ul class="lv-lg">${segs.filter(x=>x[1]>0).map(([l,v,c])=>`<li><i style="background:var(--${c})"></i><span>${l}</span><b>${(fv||fmt)(v)}</b></li>`).join("")}</ul>`;
/* colonnine: items [{l, segs:[[v,token]], t (title), pj}], ref {v,l} = linea di riferimento */
function miniBars(items,o){o=o||{};if(!items.length)return "";const W=300,H=o.h||86,T=10,B=16,ph=H-T-B,n=items.length,slot=W/n,bw=Math.max(4,Math.min(22,slot*0.62));
 const top=Math.max(o.ref?o.ref.v*1.12:0,...items.map(x=>sum(x.segs.map(s=>s[0]))),1e-9),y=v=>T+ph-v/top*ph;
 let g="";items.forEach((x,i)=>{const cx=slot*i+slot/2;let acc=0;x.segs.forEach(([v,c],k)=>{if(!(v>0))return;const y1=y(acc+v),h=ph*v/top;
   g+=`<rect x="${(cx-bw/2).toFixed(1)}" y="${y1.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(h-(acc>0?1.5:0),0.8).toFixed(1)}" rx="${k===x.segs.length-1||acc+v>=sum(x.segs.map(s=>s[0]))-1e-9?2:0}" style="fill:var(--${c})"${x.pj?' class="mb-pj"':""}><title>${esc(x.t||"")}</title></rect>`;acc+=v;});
  if(x.l&&(n<=12||i%2===(n-1)%2))g+=`<text x="${cx.toFixed(1)}" y="${H-3}" text-anchor="middle">${esc(x.l)}</text>`;});
 const ref=o.ref?`<line x1="0" x2="${W}" y1="${y(o.ref.v).toFixed(1)}" y2="${y(o.ref.v).toFixed(1)}" class="mb-ref"/><text x="${W}" y="${(y(o.ref.v)-3).toFixed(1)}" text-anchor="end" class="mb-rl">${esc(o.ref.l)}</text>`:"";
 return `<svg class="mbars" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(o.label||"")}"><line x1="0" x2="${W}" y1="${T+ph}" y2="${T+ph}" class="mb-base"/>${ref}${g}</svg>`;}
/* mini-calendario del piano turni */
function miniCal(ym){const Y=+ym.slice(0,4),M=+ym.slice(5),dim=new Date(Y,M,0).getDate(),off=(new Date(Y,M-1,1).getDay()+6)%7;let c="";
 for(let i=0;i<off;i++)c+=`<span class="mc-v"></span>`;
 for(let g=1;g<=dim;g++){const d=`${ym}-${p2(g)}`,t=(S.turni||{})[d]||{},k=t.n?"n":t.f?"f":t.fe?"fe":t.a?"a":t.rc?"rc":"";
  c+=`<span class="mc-d${k?" tu-"+k:""}${festivo(new Date(Y,M-1,g))?" mc-fe":""}${d===TODAY?" mc-oggi":""}" title="${g}${k?" · "+TU_K.filter(([q])=>t[q]).map(([,l])=>l.toLowerCase()).join(", "):""}">${g}</span>`;}
 return `<div class="mcal">${TU_DOW.map(d=>`<span class="mc-h">${d}</span>`).join("")}${c}</div>`;}
const psum=v=>`<span data-psum hidden>${v}</span>`;
V.lavoro=()=>{const c=S.cart,L=c?c.lista:[];
 const head=`<div class="sheet-h"><h2>Dashboard lavoro${L.length?" "+L[L.length-1].periodo.slice(0,4):""}</h2><p>${L.length?`Ultimo cartellino: ${MESE_L(L[L.length-1].periodo).toLowerCase()}${L[L.length-1].provvisorio?" (provvisorio)":""}.`:"Cartellini presenze e cedolini letti sul PC di casa."}</p></div>`;
 if(!L.length)return `<section class="sheet">${head}<div class="banner">Nessun cartellino ancora. ${hubUrl()?"Salva i PDF nella cartella Cartellini e premi «Aggiorna ora».":"Imposta prima l'indirizzo dell'Hub in <a href=\"#collegamenti\">Collegamenti e backup</a>."}</div>
  <div class="actions"><button class="btn" data-act="x-cart">Aggiorna ora</button><a class="btn ghost" href="#turni">Turni</a><a class="btn ghost" href="#cedolini">Cedolini</a></div><p class="note" id="lk-cart-msg" ${linkMsgs.cart?"":"hidden"}>${linkMsgs.cart}</p></section>`;
 const x=L[L.length-1],anno=x.periodo.slice(0,4),Lanno=L.filter(y=>y.periodo.startsWith(anno)),mn=MESI[+x.periodo.slice(5)-1].toLowerCase(),m3=ym=>MESI[+ym.slice(5)-1].slice(0,3).toLowerCase();
 const gN=x.tz.notte.mese/60,gF=x.tz.fest.mese/60,ag=x.agg/60,fat=(x.fatto||0)/60,dov=(x.dovuto||0)/60,ord=Math.max(0,fat-gN-gF-ag);
 const main=[["Orario ordinario",ord,"c-liq"],["Guardie notturne",gN,"c-inv"],["Guardie festive",gF,"c-tasse"],["Attività aggiuntiva",ag,"c-ent"]];
 const saldo=x.fatto!=null&&x.dovuto!=null?x.fatto-x.dovuto:null,u=cartUsate(L,x);
 const fer=x.ferie,ferRes=fer.tot!=null?fer.tot:fer.co.residuo+fer.fs.residuo+fer.ap.residuo,ferGod=fer.co.fruiti+fer.fs.fruiti+fer.ap.fruiti;
 const P=cartPagamenti(),arr=P.righe.filter(r=>r.stato==="attesa"),pag=P.righe.filter(r=>r.pag&&r.periodo.startsWith(anno)),vrf=P.righe.filter(r=>["meno","piu","manca"].includes(r.stato));
 const totPag=sum(pag.map(r=>r.pag.importo)),netOf=r=>r.stima!=null?lavNetto(r.tipo,r.stima,r.atteso)||0:0,arrN=sum(arr.map(netOf)),arrL=sum(arr.map(r=>r.stima||0));
 const ced=(S.ced?S.ced.lista:[]).filter(c=>c.controllo.ok),cl=ced[ced.length-1],cd=cl?cedDerive(cl):null;
 const nf=v=>fN.format(v),gg=v=>nf(v)+" gg";
 const tym=TODAY.slice(0,7),tp=pianoMese(tym),t$=pianoSoldi(tp),tmn=MESI[+tym.slice(5)-1].toLowerCase(),fProg=ferieProgr();
 const OD=oraDati(),oMed=OD.media!=null?OD.media/60:null,wk=OD.sett.filter(w=>w.full).slice(-10);
 /* recupero: residuo a fine mese, mese per mese */
 const recM=L.slice(-8).map(y=>({l:m3(y.periodo),segs:[[Math.max(0,(y.recupero||0)/60),"c-risp"]],t:`${MESE_L(y.periodo)}: residuo ${hm(y.recupero)}`}));
 /* guardie e aggiuntiva dell'anno, mese per mese (+ mesi del piano dopo l'ultimo cartellino) */
 const pmA=[...new Set(Object.keys(S.turni||{}).map(k=>k.slice(0,7)))].filter(m=>m.startsWith(anno)&&m>x.periodo).sort().map(pianoMese).filter(q=>q.lav);
 const gaM=[...Lanno.map(y=>({ym:y.periodo,n:y.tz.notte.mese/60,f:y.tz.fest.mese/60,a:aggOre(y)})),...pmA.map(q=>({ym:q.ym,n:q.oreN,f:q.oreF,a:q.a,pj:true}))];
 const nA=sum(gaM.filter(m=>!m.pj).map(m=>m.n)),fA=sum(gaM.filter(m=>!m.pj).map(m=>m.f)),aA=sum(gaM.filter(m=>!m.pj).map(m=>m.a));
 /* pagamenti in arrivo raggruppati per mese di pagamento */
 const byPag={};arr.forEach(r=>{(byPag[r.atteso]=byPag[r.atteso]||[]).push(r);});
 const pagRows=Object.keys(byPag).sort().map(ym=>{const rr=byPag[ym];return `<li><span><b>${MESE_L(ym)}</b><small>${rr.map(r=>(r.tipo==="guardia"?"guardia ":"aggiuntiva ")+m3(r.periodo)).join(" · ")}</small></span><span class="lv-pv"><b>≈ ${fmt(sum(rr.map(netOf)))}</b><small>lordo ${fmt(sum(rr.map(r=>r.stima||0)))}</small></span></li>`;}).join("");
 const ferTot=ferGod+ferRes,ferP=Math.min(fProg.length,ferRes);
 return `<section class="sheet">${head}
 <div class="actions"><button class="btn" data-act="x-cart">Aggiorna ora</button></div><p class="note" id="lk-cart-msg" ${linkMsgs.cart?"":"hidden"}>${linkMsgs.cart}</p>
 ${vrf.length?`<div class="banner">${vrf.length===1?"Un pagamento":vrf.length+" pagamenti"} di guardie o aggiuntiva da verificare: <a href="#lv-pag">Guardie e aggiuntiva</a>.</div>`:""}
 <div class="box pcard"><h3>Ore di ${mn} <small>${x.provvisorio?"cartellino provvisorio":""}</small></h3>
 <div class="pcard-in">
  <a class="pcard-main pmain lv-main" href="#presenze" data-act="go" data-tab="presenze" title="Apri Presenze e ferie">
   <div class="lv-hero"><span class="lv-big">${hm(x.fatto)}<small> h lavorate</small></span><span class="lv-sub">dovute ${hm(x.dovuto)} · saldo <b class="${saldo>0?"pos":saldo<0?"neg":""}">${hmS(saldo)}</b></span></div>
   ${hbar(main,Math.max(fat,dov)*1.04,{v:dov,l:"dovute "+hm(x.dovuto)},hmF,"Ore di "+mn)}
   ${lgd(main,hmF)}</a>
  <div class="pcard-sub">
   <a class="psub" href="#turni" data-act="go" data-tab="turni" title="Apri Turni"><h4>Turni di ${tmn} <small>${tp.giorni?`${tp.n} notti · ${tp.f} festive${tp.a?" · "+hmF(tp.a)+" h agg.":""}`:"nessun turno segnato"}</small></h4>${psum(t$.netto!=null&&tp.lav?"≈ "+fmt(t$.netto):tp.giorni?tp.giorni+" gg":"—")}
    <div class="psub-in">${miniCal(tym)}<div>
    <dl class="kv">${kv("Guardie",`${tp.n+tp.f} · ${hmF(tp.oreG)} h`)}${kv("Aggiuntiva",hmF(tp.a)+" h")}${tp.fe.length?kv("Ferie",nGg(tp.fe.length)):""}${t$.netto!=null&&tp.lav?kv(`Netto stimato <small>a ${MESI[+t$.pag.slice(5)-1].toLowerCase()}</small>`,`<b>${fmt(t$.netto)}</b>`):""}</dl></div></div></a>
   <a class="psub" href="#lv-ora" data-act="go" data-tab="lv-ora" title="Apri Orario e riposi"><h4>Orario e riposi <small>${OD.rip.length?OD.rip.length+(OD.rip.length===1?" riposo":" riposi")+" sotto 11 h":"nessun riposo sotto 11 h"}</small></h4>${psum(oMed!=null?hmF(oMed)+" h/sett.":"—")}
    <div class="psub-in lv-col">${miniBars(wk.map(w=>({l:ddIt(w.da),segs:[[w.min/60,w.min>ORA_SETT?"c-tasse":w.fe?"c-fisse":"c-liq"]],t:`${ddIt(w.da)}–${ddIt(w.a)}: ${hm(w.min)} h${w.fe?" (con ferie)":""}`})),{ref:{v:48,l:"48 h"},label:"Ore delle ultime settimane"})}
    <dl class="kv">${kv(`Media settimanale <small>${OD.nMed} settimane</small>`,oMed!=null?hmF(oMed)+" h":"—")}${kv("Settimane oltre 48 h",String(OD.sopra.length))}${kv("Riposi sotto 11 h",String(OD.rip.length))}</dl></div></a>
   <a class="psub" href="#presenze" data-act="go" data-tab="presenze" title="Apri Presenze e ferie"><h4>Recupero ore <small>a fine ${mn}</small></h4>${psum(hm(x.recupero))}
    <div class="psub-in lv-col">${miniBars(recM,{label:"Residuo di recupero ore a fine mese"})}
    <dl class="kv">${(()=>{const i=L.indexOf(x),pr=i>0&&L[i-1].periodo===ymAdd(x.periodo,-1)?L[i-1]:null;return (pr?kv("Residuo a fine "+MESI[+pr.periodo.slice(5)-1].toLowerCase(),hm(pr.recupero)):"")+kv("Saldo del mese",hmS(saldo))+(u?kv("Ore recuperate",`−${hm(u)}`):"")+kv("Residuo",`<b>${hm(x.recupero)}</b>`);})()}</dl></div></a>
   <a class="psub" href="#presenze" data-act="go" data-tab="presenze" title="Apri Presenze e ferie"><h4>Ferie ${anno} <small>${nGg(ferRes)} residue</small></h4>${psum(gg(ferRes))}
    <div class="psub-in lv-col">${hbar([["Godute",ferGod,"c-spese"],["Programmate nel piano",ferP,"c-inv"],["Libere",ferRes-ferP,"c-liq"]],ferTot,null,gg,"Ferie "+anno)}
    ${lgd([["Godute",ferGod,"c-spese"],["Programmate nel piano",ferP,"c-inv"],["Residue libere",ferRes-ferP,"c-liq"]],gg)}
    <dl class="kv">${kv("Congedo ordinario",nf(fer.co.residuo)+" su "+nf(fer.co.spettanti))}${kv("Festività soppresse",nf(fer.fs.residuo))}</dl></div></a>
   <a class="psub" href="#lv-pag" data-act="go" data-tab="lv-pag" title="Apri Guardie e aggiuntiva"><h4>Guardie e aggiuntiva ${anno} <small>${Lanno.reduce((a,y)=>a+y.notti.length,0)} notti · ${Lanno.reduce((a,y)=>a+y.festive.length,0)} festive · ${hmF(aA)} h agg.</small></h4>${psum(hmF(nA+fA+aA)+" h")}
    <div class="psub-in lv-col">${miniBars(gaM.map(m=>({l:m3(m.ym),pj:m.pj,segs:[[m.n,"c-inv"],[m.f,"c-tasse"],[m.a,"c-ent"]],t:`${MESE_L(m.ym)}${m.pj?" (piano)":""}: notti ${hmF(m.n)}, festive ${hmF(m.f)}, aggiuntiva ${hmF(m.a)} h`})),{label:"Ore di guardia e aggiuntiva per mese"})}
    ${lgd([["Guardie notturne",nA,"c-inv"],["Guardie festive",fA,"c-tasse"],["Attività aggiuntiva",aA,"c-ent"]],hmF)}${pmA.length?`<p class="note">Colonne chiare: dal piano turni.</p>`:""}</div></a>
   <a class="psub" href="#lv-pag" data-act="go" data-tab="lv-pag" title="Apri Guardie e aggiuntiva"><h4>Pagamenti guardie e aggiuntiva <small>${arr.length?"in arrivo":"nulla in sospeso"}</small></h4>${psum(arr.length?"≈ "+fmt(arrN):"—")}
    <div class="psub-in lv-col">${pagRows?`<ul class="lv-pl">${pagRows}</ul>`:`<p class="muted">Niente in arrivo.</p>`}
    <dl class="kv">${arr.length?kv("In arrivo <small>netto stimato</small>",`<b>${fmt(arrN)}</b> <small class="muted">lordo ${fmt(arrL)}</small>`):""}${kv("Già pagati nel "+anno+" <small>lordo</small>",fmt(totPag))}</dl></div></a>
   ${cd?`<a class="psub" href="#cedolini" data-act="go" data-tab="cedolini" title="Apri i cedolini"><h4>Cedolino di ${MESE_L(cl.periodo).toLowerCase()} <small>pagato il ${dIt(cl.dataPagamento)||"—"}</small></h4>${psum(fmt(cd.netto))}
    <div class="psub-in lv-col">${hbar([["Netto",cd.netto,"c-liq"],["Contributi",cd.contributi,"c-fisse"],["Imposte",cd.tasse,"c-tasse"]],cd.lordo,null,fmt,"Cedolino")}
    ${lgd([["Netto",cd.netto,"c-liq"],["Contributi",cd.contributi,"c-fisse"],["Imposte",cd.tasse,"c-tasse"]])}
    <dl class="kv">${kv("Lordo",fmt(cd.lordo))}</dl></div></a>`:""}
  </div></div></div>
</section>`;};

/* ================= home: tre sezioni collegate, come l'icona ================= */
/* v48: sfere con sfumatura (icona bianca, ombra colorata) disposte a triangolo con Finanze più grande in basso;
   puntini animati da Lavoro e da Sondaggi verso Finanze (il verso reale dei dati). Solo i nomi, nessun altro testo. */
V.home=()=>{svLoad();
 const IC={lav:`<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>`,fin:`<path d="M5 19V13M10 19V9M15 19V11M20 19V5"/>`,son:`<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5h6M8.5 10l1.5 1.5 3-3M8.5 16h7"/>`};
 const N=[{k:"lav",h:"lavoro",t:"Lavoro",x:72,y:92,r:42,sh:"#2fb0a0",ik:"#fff"},{k:"son",h:"sondaggi",t:"Sondaggi",x:228,y:92,r:42,sh:"#9cc0d3",ik:"#0b3a53"},{k:"fin",h:"dashboard",t:"Finanze",x:150,y:218,r:56,sh:"#eb9a4a",ik:"#fff"}];
 const node=n=>{const s=n.r>50?1.75:1.4,ly=n.k==="fin"?n.y+n.r+26:n.y-n.r-15;
  return `<a class="hs-n hs-${n.k}" href="#${n.h}" aria-label="${n.t}"><g class="hs-g"><ellipse cx="${n.x}" cy="${n.y+n.r+2}" rx="${n.r*.75}" ry="${n.r*.18}" fill="${n.sh}" opacity=".45" filter="url(#hs-bl)"/><circle cx="${n.x}" cy="${n.y}" r="${n.r}" fill="url(#hs-${n.k})"/><g transform="translate(${n.x-12*s},${n.y-12*s}) scale(${s})" fill="none" stroke="${n.ik}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${IC[n.k]}</g></g><text class="hs-t" x="${n.x}" y="${ly}">${n.t}</text></a>`;};
 return `<section class="sheet home">
 ${!hasRealData(S)?`<div class="banner">Nessun dato su questo dispositivo (succede con un browser o un telefono nuovo). Vai in <a href="#collegamenti">Collegamenti e backup</a>: imposta l'indirizzo dell'Hub, poi «Ripristina dall'ultimo backup» per le finanze e «Ripristina dal PC» per i sondaggi. Cartellini e cedolini arrivano da soli.</div>`:""}
 <svg class="hsfere" viewBox="0 18 300 282" role="navigation" aria-label="Sezioni"><defs>
  <radialGradient id="hs-lav" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#6fd6c8"/><stop offset="1" stop-color="#1c7a6f"/></radialGradient>
  <radialGradient id="hs-fin" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#ffc283"/><stop offset="1" stop-color="#b9631a"/></radialGradient>
  <radialGradient id="hs-son" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#a9c7d8"/></radialGradient>
  <filter id="hs-bl" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter></defs>
  <path class="hs-l0" d="M72 92L228 92"/>
  <path class="hs-tr" d="M72 92L150 218M228 92L150 218"/>
  <path class="hs-fl hs-fl-lav" d="M72 92L150 218"/><path class="hs-fl hs-fl-son" d="M228 92L150 218"/>
  ${N.map(node).join("")}
 </svg>
</section>`;};
/* ================= movimenti dei conti (estratti conto Fineco e Revolut) ================= */
/* L'Hub legge in locale gli estratti conto (cartella «Finanze private (per gestionale)») e pubblica
   GET /api/estratti/archivio: movimenti con categoria (scelta / regola imparata / automatica / da rivedere)
   e quadratura dei saldi. Qui: riepilogo del mese per categoria, lista «Da rivedere», tutti i movimenti.
   I movimenti NON entrano in S né nei backup: copia locale in localStorage «gestionale-movimenti» per l'uso offline. */
const MOV_KEY="gestionale-movimenti";
const MOV_CAT=[["stipendio","Stipendi e compensi","e"],["extra","Entrate extra","e"],
 ["casa","Casa e utenze","u"],["spesa","Spesa","u"],["svago","Ristoranti e svago","u"],["viaggi","Viaggi","u"],["carburante","Carburante","u"],["fisse","Spese fisse (bolli, assicurazioni, rate)","u"],["vita","Altre spese quotidiane","u"],["straord","Spese straordinarie","u"],["tasse","Tasse","u"],
 ["rimb","Rimborsi spese condivise","r"],
 ["sondaggi","Sondaggi arrivati in banca","p"],["paypal","Da PayPal (passaggio)","p"],
 ["invest","Investimenti","x"],["giro","Giroconto (tra i tuoi conti)","x"],["escl","Escluso dai conteggi","x"]];
const MOV_COL={carburante:"c-carb",fisse:"c-fondo",stipendio:"c-ent",sondaggi:"c-ent",paypal:"c-fin",amz:"c-liq",extra:"c-liq",casa:"c-aff",spesa:"c-risp",svago:"c-etf",viaggi:"c-rev",vita:"c-spese",straord:"c-fisse",tasse:"c-tasse",rimb:"c-ent",invest:"c-inv",giro:"c-fin",escl:"muted"};
const MOV_COND_OK=["casa","spesa","svago","viaggi","carburante","vita","straord"];
const movLbl=k=>(MOV_CAT.find(c=>c[0]===k)||[k,"Da classificare"])[1];
let MOV=null,MOV_M=null,MOV_BUSY=false,MOV_ERR="",MOV_ALL=false,MOV_REG=false,MOV_Q="",MOV_FC="*";const MOV_PEND={},MOV_LEG=new Set(); // scelte non ancora confermate in «Da rivedere» (sopravvivono ai render)
view.addEventListener("click",e=>{if(!e.target.closest('[data-act="reload"]'))return;e.preventDefault();
 const go=()=>location.reload();try{navigator.serviceWorker.getRegistration().then(r=>r&&r.update()).then(go,go);}catch(_){go();}});
function movLoad(){if(MOV)return MOV;try{MOV=JSON.parse(lsGet(MOV_KEY)||"null");}catch(e){MOV=null;}return MOV;}
function movStore(d){MOV=d;try{lsSet(MOV_KEY,JSON.stringify(d));}catch(e){}}
async function movSync(manual,path,body){
 if(MOV_BUSY||!hubUrl()){if(manual&&!hubUrl())linkMsg("mov","Serve l'indirizzo dell'Hub.");return;}
 MOV_BUSY=true;if(manual)linkMsg("mov","Leggo gli estratti conto dal PC…");
 try{const r=path?await hubFetch(path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body||{})}):await hubFetch("/api/estratti/archivio");
  const prima=JSON.stringify(movLoad()&&movLoad().movimenti||[]);movStore(r);MOV_ERR="";if(!READONLY&&(applyEstrSaldi()|applyExtra()|applyLinks())){save();if(current!=="mese")afterExternalChange();}
  if(manual)linkMsg("mov",r.movimenti.length+" movimenti letti.");
  if(current==="mese"||(current==="dashboard"&&JSON.stringify(r.movimenti)!==prima))afterExternalChange();}
 catch(e){MOV_ERR=e.message;if(manual)linkMsg("mov","Estratti conto non letti: "+e.message+".");if(current==="mese")afterExternalChange();}
 finally{MOV_BUSY=false;refreshLinks();}}
/* v46: memoria dei calcoli sui movimenti. calc() gira a ogni render e a ogni modifica: movRiep/ppAuto/sondMese
   ripassavano tutti i movimenti più volte per mese (e sondMese rileggeva i sondaggi da localStorage a ogni chiamata).
   La memoria vale finché non cambiano gli estratti (MOV), i canali dei portali o i dati dei sondaggi. */
let MEMO={k:null};
function memo(){const k=(lsGet(SOND_LS_KEY)||"")+"|"+JSON.stringify(S.sondCanali||{})+"|"+(S.movAbbNo||[]).join(",")+"|"+JSON.stringify(S.prestiti||[]);
 if(MEMO.mov!==MOV||MEMO.k!==k)MEMO={mov:MOV,k,riep:{},pp:{},sond:{},mesi:null};return MEMO;}
const movMesi=()=>{const d=movLoad();if(!d)return [];const M=memo();return M.mesi||(M.mesi=[...new Set(d.movimenti.map(m=>m.data.slice(0,7)))].sort());};
function movRiep(ym){const M=(movLoad(),memo());if(M.riep[ym])return Object.assign({},M.riep[ym]);const o0=movRiep0(ym);M.riep[ym]=o0;return Object.assign({},o0);}
/* v49 (opzione 1 scelta da Marco): rimborso su carta ↔ acquisto. Un'entrata in una categoria di uscita (o di tipo
   rimborso/storno/reso) si abbina al pagamento dello stesso conto e della stessa controparte (descrizione), stesso importo
   (±1 cent), nei 60 giorni prima (il più vicino); i due si annullano e non entrano nei conteggi per categoria (il saldo
   del conto non cambia). Caso reale: due addebiti a fine giugno rimborsati a inizio luglio → luglio con una categoria
   in negativo (sparita dalla ciambella) e giugno gonfiato. S.movAbbNo = id dei rimborsi da NON abbinare («separa»). */
const MOV_U=()=>MOV_CAT.filter(c=>c[2]==="u").map(c=>c[0]);
const abbKey=m=>(m.conto||"")+"|"+String(m.descr||"").toLowerCase().replace(/\s+/g," ").trim();
function movAbb(){const M=memo();if(M.abb)return M.abb;const d=movLoad(),out={};M.abb=out;if(!d)return out;
 const U=MOV_U(),no=new Set(S.movAbbNo||[]),dd=(x,y)=>(Date.parse(x)-Date.parse(y))/864e5;
 const refs=d.movimenti.filter(m=>m.importo>0&&!no.has(m.id)&&m.descr&&(U.includes(m.cat||"")||/rimbors|storno|reso/i.test(m.tipo||""))&&!["giro","escl","invest","rimb"].includes(m.cat||"")).sort((x,y)=>x.data.localeCompare(y.data));
 const buy=d.movimenti.filter(m=>m.importo<0&&U.includes(m.cat||""));
 refs.forEach(r=>{const k=abbKey(r);const c=buy.filter(p=>!out[p.id]&&abbKey(p)===k&&Math.abs(-p.importo-r.importo)<=0.011&&dd(r.data,p.data)>=0&&dd(r.data,p.data)<=60).sort((x,y)=>y.data.localeCompare(x.data))[0];
  if(c){out[r.id]={p:c.id,ref:1,data:c.data};out[c.id]={p:r.id,ref:0,data:r.data};}});
 return out;}
function movRiep0(ym){const d=movLoad(),o={};MOV_CAT.forEach(([k])=>o[k]=0);o[""]=0;const AB=movAbb(),PR=movPrest();
 (d?d.movimenti:[]).filter(m=>m.data.startsWith(ym)&&!AB[m.id]&&!PR[m.id]).forEach(m=>{o[m.cat||""]=(o[m.cat||""]||0)+m.importo;});return o;}
/* rimborsi spese condivise (v24, regola di Marco): prima la quota d'affitto (= importo delle spese fisse mensili
   «affitt…» in vigore quel mese, cioè la metà che paga l'altra persona) va tutta a «Casa e utenze»; il resto si divide
   in parti uguali tra le categorie che dividete (S.movCond), senza superare la spesa lorda di ciascuna (l'eccedenza
   passa alle altre). Il totale netto è esatto, la ripartizione per categoria è una stima. */
const affQuota=ym=>sum((S.ricorrenti||[]).filter(t=>t.freq==="m"&&/affitt/i.test(t.voce||"")&&(t.da||"")<=ym&&!(t.esclusi||[]).includes(ym)).map(t=>+t.importo||0));
function movNetto(ym){const o=movRiep(ym),cond=(S.movCond||[]).filter(c=>MOV_COND_OK.includes(c)),R=o.rimb||0;
 const U=MOV_CAT.filter(c=>c[2]==="u").map(c=>c[0]),lordo=c=>Math.max(-o[c],0),alloc={},net={};U.forEach(c=>alloc[c]=0);
 const aff=R>0?Math.min(R,affQuota(ym),lordo("casa")):0;alloc.casa=aff;let rest=R>0?R-aff:0;
 let att=cond.filter(c=>lordo(c)-alloc[c]>0.005);
 while(rest>0.005&&att.length){const q=rest/att.length;att.forEach(c=>{const x=Math.min(q,lordo(c)-alloc[c]);alloc[c]+=x;rest-=x;});att=att.filter(c=>lordo(c)-alloc[c]>0.005);}
 U.forEach(c=>net[c]=o[c]+alloc[c]);const G=sum(cond.map(lordo));
 const sv=sondMese(ym),amz=sv.amazon,pa=ppAuto(ym),ppx=pa.extra;
 return{o,R,G,aff,cond,alloc,net,nonRip:R>0?rest:R,sv,amz,pa,ppx,te:sum(MOV_CAT.filter(c=>c[2]==="e").map(([c])=>o[c]))+sv.tot+ppx+vincInt(ym),tu:sum(MOV_CAT.filter(c=>c[2]==="u").map(([c])=>o[c]))-amz,
  nonArr:sv.banca-(o.sondaggi||0)+sv.paypal+ppx-(o.paypal||0)};}
/* sondaggi (proposta A, v25): l'app Guadagni fa fede. I prelievi del mese per portale si dividono per canale di pagamento
   (S.sondCanali: banca | paypal | amazon; non indicato = banca). Gli accrediti in banca dai portali («sondaggi») e i
   trasferimenti da PayPal («paypal») sono passaggi, non entrate; i buoni Amazon sono entrata + uscita di pari importo. */
const SOND_CAN=[["banca","Banca"],["paypal","PayPal"],["amazon","Buono Amazon"]];
/* entrate extra via PayPal (regola di Marco, v27): atteso da PayPal = prelievi sondaggi non Amazon (banca+PayPal, app)
   − accrediti diretti dei portali in banca («sondaggi») + residuo ancora atteso dal mese prima. Se da PayPal arriva più
   dell'atteso, la differenza è entrata extra ottenuta via PayPal; se arriva meno, il resto passa al mese dopo (residuo). */
function ppAuto(ym){const M=(movLoad(),memo());return M.pp[ym]||(M.pp[ym]=ppAuto0(ym));}
function ppAuto0(ym){const L=movMesi().filter(m=>m<=ym);let res=0,r=null;
 L.forEach(m=>{const sv=sondMese(m),o=movRiep(m),prima=res,att=sv.banca+sv.paypal-(o.sondaggi||0)+prima,arr=o.paypal||0;
  res=Math.max(att-arr,0);r={prima,att,arr,extra:Math.max(arr-Math.max(att,0),0),res};});
 return r||{prima:0,att:0,arr:0,extra:0,res:0};}
function sondMese(ym){const M=(movLoad(),memo());if(M.sond[ym])return M.sond[ym];return (M.sond[ym]=sondMese0(ym));}
function sondMese0(ym){svLoad();const r={banca:0,paypal:0,amazon:0,tot:0,senza:[]};
 SV.sites.forEach(s=>{const v=svGet(ym,s.id,"p")/100;if(!v)return;const c=(S.sondCanali||{})[s.id];r[c||"banca"]+=v;r.tot+=v;if(!c)r.senza.push(s.name);});return r;}
/* saldi di fine mese dagli estratti conto (v28, decisione di Marco): per ogni mese concluso con estratti, Patrimonio ›
   Revolut = conto + deposito Revolut, Fineco = conto Fineco + conto deposito vincolato (S.vincolato.fineco, inserito a
   mano: non compare nell'estratto; finché è vuoto Fineco resta manuale). Un conto senza movimenti nel mese tiene il
   saldo del mese prima. Celle riempite in sola lettura («estratto»); mesi in S.patEstr. */
/* v35 (decisione di Marco): le entrate extra dei conti sono guadagni → righe automatiche in Entrate, fonte «ext»,
   una per mese = «Entrate extra» (categoria extra) + «Extra via PayPal» (ppAuto). Solo i mesi presenti negli estratti
   di questo dispositivo; gli altri mesi non si toccano. */
function applyExtra(){const L=movMesi();if(!L.length)return false;const inL=new Set(L);
 const sig=a=>JSON.stringify(a.filter(r=>r.fonte==="ext").map(r=>[r.data,r.importo]).sort());const prima=sig(S.registro);
 const keep=S.registro.filter(r=>!(r.fonte==="ext"&&inL.has((r.data||"").slice(0,7))));
 const add=L.map(ym=>{const o=movRiep(ym),v=Math.max(o.extra||0,0)+(ppAuto(ym).extra||0)+vincInt(ym);if(v<0.005)return null;const [y,m]=ym.split("-").map(Number);
  return{id:"est-ext-"+ym,data:`${ym}-${String(new Date(y,m,0).getDate()).padStart(2,"0")}`,fonte:"ext",importo:Math.round(v*100)/100,nota:"Entrate extra dagli estratti conto",ext:"estratti"};}).filter(Boolean);
 const nuovo=[...keep,...add];if(sig(nuovo)===prima)return false;S.registro=nuovo;regSort(S);
 add.forEach(r=>{const y=+r.data.slice(0,4);if(!S.patrimonio[y])S.patrimonio[y]=blankPat();});return true;}
/* v42 (richiesta di Marco): Fineco di fine mese ricostruito per OGNI mese coperto da un estratto, anche se il file
   copre più mesi o finisce a metà mese: saldo a fine mese M = «Saldo Finale» di un file che va da ≤ 1° del mese dopo
   ad «Al» ≥ fine di M, meno i movimenti Fineco tra fine M (esclusa) e «Al» (inclusa). Tra i file adatti vale quello che
   finisce prima. Mesi riempiti: S.patEstr = Revolut, S.patEstrF = Fineco (prima un'unica lista: Revolut risultava «estratto»
   anche nei mesi coperti solo da Fineco e viceversa). Serve l'Hub aggiornato (saldoFinale nell'elenco dei file); con l'Hub vecchio resta la regola v28. */
const ymEnd=ym=>{const [y,m]=ym.split("-").map(Number);return `${ym}-${String(new Date(y,m,0).getDate()).padStart(2,"0")}`;};
const ymNext=ym=>{const [y,m]=ym.split("-").map(Number);return m===12?`${y+1}-01`:`${y}-${String(m+1).padStart(2,"0")}`;};
function finecoFine(d,ym){const fs=(d.file||[]).filter(f=>f.banca==="fineco"&&f.saldoFinale!=null&&f.periodo&&/^\d{4}-\d{2}-\d{2}$/.test(f.periodo.a||"")&&/^\d{4}-\d{2}-\d{2}$/.test(f.periodo.da||""));
 const e=ymEnd(ym),nx=ymNext(ym)+"-01",c=fs.filter(f=>f.periodo.a>=e&&f.periodo.da<=nx).sort((a,b)=>a.periodo.a.localeCompare(b.periodo.a))[0];if(!c)return null;
 const dopo=sum(d.movimenti.filter(m=>m.conto==="Fineco"&&!m.carta&&m.data>e&&m.data<=c.periodo.a).map(m=>+m.importo||0));
 return Math.round((c.saldoFinale-dopo)*100)/100;}
function applyEstrSaldi(){const d=movLoad();if(!d||!Array.isArray(d.quadratura))return false;
 const cur=new Date().toLocaleDateString("sv-SE").slice(0,7),last={},per={};
 d.quadratura.slice().sort((a,b)=>a.mese.localeCompare(b.mese)).forEach(q=>{(per[q.mese]=per[q.mese]||{})[q.conto]=q;});
 const nuovo=(d.file||[]).some(f=>f.banca==="fineco"&&"saldoFinale" in f);
 const fm=[];(d.file||[]).forEach(f=>{const da=f.periodo&&f.periodo.da,a=f.periodo&&f.periodo.a;if(f.banca!=="fineco"||!/^\d{4}-\d{2}-\d{2}$/.test(da||"")||!/^\d{4}-\d{2}-\d{2}$/.test(a||""))return;
  let y=+da.slice(0,4),m=+da.slice(5,7)-(da.slice(8)==="01"?1:0);if(m<1){m=12;y--;}for(let k=0;k<240;k++){const ym=`${y}-${String(m).padStart(2,"0")}`;if(ym>a.slice(0,7))break;fm.push(ym);if(++m>12){m=1;y++;}}});
 const mesi=[...new Set([...Object.keys(per),...(d.movimenti||[]).map(m=>m.data.slice(0,7)),...fm])].sort(),prima=JSON.stringify([S.patrimonio,S.patEstr,S.patEstrF]),cov=new Set(),covF=new Set();
 mesi.forEach(ym=>{Object.entries(per[ym]||{}).forEach(([c,q])=>{if(q.fine!=null&&!q.parziale)last[c]=q.fine;});
  if(ym>=cur)return;const [Y,M]=ym.split("-"),m=+M-1;
  const set=(k,v)=>{if(!S.patrimonio[Y])S.patrimonio[Y]=blankPat();S.patrimonio[Y][m][k]=Math.round(v*100)/100;(k==="fineco"?covF:cov).add(ym);};
  if(per[ym]&&(last.Revolut!=null||last["Revolut deposito"]!=null))set("revolut",(last.Revolut||0)+(last["Revolut deposito"]||0));
  const vv=vincAt(ym);if(vv==null)return;
  if(nuovo){const f=finecoFine(d,ym);if(f!=null)set("fineco",f+vv);}
  else if(per[ym]&&last.Fineco!=null&&!(per[ym].Fineco&&per[ym].Fineco.parziale))set("fineco",last.Fineco+vv);});
 S.patEstr=[...new Set([...(S.patEstr||[]),...cov])].sort();S.patEstrF=[...new Set([...(S.patEstrF||[]),...covF])].sort();
 return JSON.stringify([S.patrimonio,S.patEstr,S.patEstrF])!==prima;}
const vincAt=ym=>{let v=null;((S.vincolato||{}).fineco||[]).forEach(r=>{if(r.da<=ym)v=r.importo;});return v;};
const estCovers=(Y,m,k)=>{const ym=`${Y}-${String(m+1).padStart(2,"0")}`;return k==="revolut"?(S.patEstr||[]).includes(ym):(S.patEstrF||[]).includes(ym)&&vincAt(ym)!=null;};
const estCell=(Y,m,k,path)=>estCovers(Y,m,k)?`<span class="est-c" title="Saldo di fine mese dall'estratto conto">${fmt(getP(S,path))}<span class="nm">estratto</span></span>`:inp(path);
/* ================= collegamenti voci ↔ movimenti dei conti (v43, richiesta di Marco 07/11/2026) =================
   Ogni voce del Gestionale che ha un corrispettivo negli estratti conto si può collegare al movimento:
   - Scadenzario (spese fisse annuali e mensili, ENPAM, F24): la voce risulta pagata alla data reale; le spese fisse
     annuali prendono l'importo reale e, se «varia», la previsione degli anni dopo usa l'ultimo importo reale.
     Un F24 può pagare più voci insieme (una delega = più righe).
   - Entrate senza cedolino (libera professione, guardia medica, …): nei mesi con movimenti collegati la riga di Entrate
     si genera dai movimenti (ext «conti») e sostituisce il totale inserito a mano. Lo stipendio con cedolino resta dal
     cedolino: il collegamento è solo la conferma dell'accredito.
   - Investimenti: automatici dalla categoria «Investimenti» (ETF Revolut = «ETF · versato» del mese; fondo Fineco =
     acquisti e riscatti), senza conferma.
   L'app propone gli abbinamenti (importo e data vicini; controparte già collegata in passato = S.linkMem), Marco conferma.
   S.link: [{m:id movimento, k:"s"|"e"|"x", r:id riga | fonte | "", d:data, i:importo, c:conto, t:descrizione}]
   ("x" = «non collegare»: la proposta non torna). S.link è nei backup; i movimenti no, per questo ogni collegamento
   tiene data, importo, conto e descrizione. */
const LINK_F=[["lp","Libera professione (P.IVA)"],["gm","Guardia medica"],["ssn","Stipendio SSN"],["spec","Borsa di specializzazione"],["altro","Altro"]];
const LINK_NOCAT=["giro","invest","escl","paypal","sondaggi","rimb"];
const contiCovers=(ym,f)=>(S.registro||[]).some(r=>r.ext==="conti"&&r.fonte===f&&(r.data||"").startsWith(ym));
const linkOf=id=>(S.link||[]).filter(l=>l.m===id&&l.k!=="x");
const linkNo=id=>(S.link||[]).some(l=>l.m===id&&l.k==="x");
const dDiff=(a,b)=>(Date.parse(a)-Date.parse(b))/864e5;
/* interessi del conto deposito vincolato: accredito alla scadenza (capitale + interessi netti) − capitale in vigore il mese prima */
function vincInt(ym){const d=movLoad();if(!d)return 0;const acc=d.movimenti.filter(m=>m.conto==="Fineco"&&/^accr\.?\s*cashpark/i.test(m.tipo||"")&&m.data.startsWith(ym));
 if(!acc.length)return 0;const [y,mm]=ym.split("-").map(Number),pr=mm===1?`${y-1}-12`:`${y}-${String(mm-1).padStart(2,"0")}`,cap=vincAt(pr);if(cap==null)return 0;
 const v=sum(acc.map(m=>m.importo))-cap;return v>0&&v<cap*0.1?Math.round(v*100)/100:0;}
/* v54: voci senza addebito automatico non ancora pagate: se nell'estratto c'è un pagamento che combacia (stesso importo,
   ±1 cent, o pagato per due nel caso dell'affitto, oppure controparte già collegata a questa spesa in passato), nello
   stesso mese della scadenza o a ±10 giorni, e quel pagamento non è collegato ad altro, si collega da solo. */
function autoLinkMan(){const d=movLoad();if(!d||READONLY)return false;let ch=false;
 const todo=new Set(S.scadenzario.filter(r=>r.man&&!r.pagato&&!r.lk).map(r=>r.id));if(!todo.size)return false;
 d.movimenti.filter(m=>m.importo<0&&linkable(m)&&!linkOf(m.id).length&&!linkNo(m.id)).forEach(m=>{
  const c=linkCands(m,false)[0];if(!c||c.k!=="s"||c.rs.length!==1||!todo.has(c.rs[0])||c.sc<2.5)return;
  const r=S.scadenzario.find(x=>x.id===c.rs[0]),e=SD(r);if(!e||(e.slice(0,7)!==m.data.slice(0,7)&&Math.abs(dDiff(e,m.data))>10))return;
  linkSet(m,"s",[r.id]);todo.delete(r.id);ch=true;});
 return ch;}
function applyLinks(){if(!Array.isArray(S.link))S.link=[];if(!S.linkMem)S.linkMem={};try{autoLinkMan();}catch(_){}
 const prima=JSON.stringify([S.scadenzario,S.registro,S.ricorrenti,S.patrimonio,S.fondoMov,S.patEstrI]);
 const L=S.link.filter(l=>l.k!=="x");
 /* 1. scadenzario */
 const byRow={},rowsOfMov={};L.filter(l=>l.k==="s").forEach(l=>{(byRow[l.r]=byRow[l.r]||[]).push(l);(rowsOfMov[l.m]=rowsOfMov[l.m]||[]).push(l.r);});
 const TPL=Object.fromEntries((S.ricorrenti||[]).map(t=>[t.id,t])),ultimo={};
 S.scadenzario.forEach(r=>{const ls=byRow[r.id];
  if(ls&&ls.length){if(!r.lk)r.imp0=r.importo;r.lk=ls.map(l=>l.m);r.pagato=true;r.forzaNonPagato=false;r.dataPag=ls.map(l=>l.d).sort().pop();
   if(r.ric&&!r.rm&&ls.every(l=>rowsOfMov[l.m].length===1)){r.importo=Math.round(-sum(ls.map(l=>l.i))*100)/100;
    const t=TPL[r.ric];if(t&&(!ultimo[t.id]||ultimo[t.id].anno<r.anno))ultimo[t.id]={anno:r.anno,imp:r.importo};}}
  else if(r.lk){delete r.lk;r.pagato=false;r.importo=r.imp0!==undefined?r.imp0:r.importo;delete r.imp0;r.dataPag=paidOf(r)?SD(r):"";}});
 /* previsione (scelta di Marco): spese fisse annuali «variabili» → l'importo del modello diventa l'ultimo importo reale.
    Prima si fissano le righe passate senza importo proprio, così lo storico non cambia. */
 /* solo quando cambia l'ultimo pagamento reale (t.reale): se poi Marco corregge a mano la previsione, resta la sua */
 Object.entries(ultimo).forEach(([id,u])=>{const t=TPL[id];if(!t||(t.reale&&t.reale.anno===u.anno&&t.reale.imp===u.imp))return;t.reale={anno:u.anno,imp:u.imp};
  if(!t.variabile||t.importo===u.imp)return;S.scadenzario.forEach(r=>{if(r.ric===id&&r.importo==null&&paidOf(r))r.importo=t.importo;});t.importo=u.imp;});
 /* 2. entrate senza cedolino */
 const grp={};L.filter(l=>l.k==="e").forEach(l=>{const ym=l.d.slice(0,7);if(cedCovers(ym,l.r))return;const g=grp[l.r+"|"+ym]=grp[l.r+"|"+ym]||{f:l.r,ym,v:0,n:0,d:""};g.v+=l.i;g.n++;if(l.d>g.d)g.d=l.d;});
 const cov=new Set(Object.keys(grp));
 /* v46: si tolgono solo i vecchi totali mensili («Totale del mese…»); le altre righe a mano restano (es. un incasso
    non passato dai conti) e la scheda Entrate le segnala come possibili doppioni (contiWarn) */
 S.registro=S.registro.filter(r=>r.ext!=="conti"&&!(!r.ext&&/^totale del mese/i.test(r.nota||"")&&cov.has(r.fonte+"|"+(r.data||"").slice(0,7))));
 Object.values(grp).sort((a,b)=>(a.ym+a.f).localeCompare(b.ym+b.f)).forEach(g=>{S.registro.push({id:`mov-${g.f}-${g.ym}`,data:g.d,fonte:g.f,importo:Math.round(g.v*100)/100,nota:`Dai conti: ${g.n} ${g.n>1?"accrediti":"accredito"}`,ext:"conti"});
  const y=+g.ym.slice(0,4);if(!S.patrimonio[y])S.patrimonio[y]=blankPat();});
 regSort(S);
 /* 3-4. investimenti dagli estratti */
 const d=movLoad();
 if(d&&Array.isArray(d.movimenti)){const cur=new Date().toLocaleDateString("sv-SE").slice(0,7);
  const mesiR=[...new Set(d.movimenti.filter(m=>m.conto==="Revolut").map(m=>m.data.slice(0,7)))].filter(ym=>ym<cur),v={};
  d.movimenti.filter(m=>m.cat==="invest"&&m.conto==="Revolut").forEach(m=>{const ym=m.data.slice(0,7);v[ym]=(v[ym]||0)-m.importo;});
  const covI=new Set(S.patEstrI||[]);
  mesiR.forEach(ym=>{const [Y,M]=ym.split("-");if(!S.patrimonio[Y])S.patrimonio[Y]=blankPat();const p=S.patrimonio[Y][+M-1],x=Math.round((v[ym]||0)*100)/100;
   p.vEtf=x?x:(p.etf!=null?0:null);covI.add(ym);});
  S.patEstrI=[...covI].sort();
  d.movimenti.filter(m=>m.conto==="Fineco"&&m.cat==="invest"&&/acquisto fondi|sottoscrizione fondi|rimborso quote/i.test(m.tipo||"")).forEach(m=>{
   const tipo=m.importo<0?"acquisto":"riscatto",id="est-"+m.id;let r=S.fondoMov.find(t=>t.id===id);
   if(!r){r=S.fondoMov.find(t=>!t.ext&&t.tipo===tipo&&t.data&&Math.abs(dDiff(t.data,m.data))<=20);if(r)r.id=id;else{r={id,nota:""};S.fondoMov.push(r);}}
   r.ext="estratti";r.data=m.data;r.tipo=tipo;r.importo=Math.abs(m.importo);});}
 return JSON.stringify([S.scadenzario,S.registro,S.ricorrenti,S.patrimonio,S.fondoMov,S.patEstrI])!==prima;}
function contiWarn(Y){const L=[];S.registro.filter(r=>r.ext==="conti"&&(r.data||"").startsWith(Y+"-")).forEach(c=>{const ym=c.data.slice(0,7);
  S.registro.filter(r=>!r.ext&&r.fonte===c.fonte&&(r.data||"").startsWith(ym)).forEach(r=>L.push(`${MESE_L(ym).toLowerCase()}: ${FN[r.fonte]} ${fmt(r.importo)}${r.nota?" («"+esc(r.nota)+"»)":""}`));});
 return L.length?`<div class="banner"><b>Da controllare</b>: in questi mesi l'entrata arriva dagli accrediti collegati nei conti, ma c'è anche una riga inserita a mano: ${L.join("; ")}. Se è lo stesso incasso, elimina la riga a mano qui sotto.</div>`:"";}
const fmCovers=i=>!!(S.fondoMov[i]&&S.fondoMov[i].ext);
const etfCovers=(Y,m)=>(S.patEstrI||[]).includes(`${Y}-${String(m+1).padStart(2,"0")}`);
/* etichette */
function scadLbl(r){const i=S.scadenzario.indexOf(r),imp=R.deb&&R.deb.rows[i]?R.deb.rows[i].imp:r.importo;return `${r.voce||"(voce)"} · ${dIt(SD(r)).slice(0,5)}/${(SD(r)||"").slice(2,4)} · ${fmt(imp)}`;}
const fonteLbl=f=>(LINK_F.find(x=>x[0]===f)||[f,FN[f]||f])[1];
function linkLbl(ls){if(!ls.length)return "";if(ls[0].k==="e")return "Entrata · "+fonteLbl(ls[0].r);
 return ls.map(l=>{const r=S.scadenzario.find(x=>x.id===l.r);return r?r.voce:"(voce tolta)";}).join(" + ");}
/* candidati per un movimento: [{k, rs:[...], sc, lbl}] ordinati per probabilità */
function linkCands(m,tutti){const out=[],a=Math.abs(m.importo),mem=(S.linkMem||{})[m.chiave],rows0=R.deb?R.deb.rows:[];
 const occ=new Set((S.link||[]).filter(l=>l.k==="s"&&l.m!==m.id).map(l=>l.r));
 if(m.importo<0){
  S.scadenzario.forEach((r,i)=>{const e=SD(r);if(!e||occ.has(r.id))return;const dd=dDiff(e,m.data);if(dd<-(tutti?150:80)||dd>(tutti?150:95))return;
   const imp=rows0[i]?rows0[i].imp:n(r.importo);let sc=0;
   if(mem&&mem.k==="s"&&((r.ric&&mem.r===r.ric)||(!r.ric&&mem.r===tipoOf(r))))sc=r.rm?(e.slice(0,7)===m.data.slice(0,7)?3.5:1):3;
   const tp=r.ric?(S.ricorrenti||[]).find(t=>t.id===r.ric):null;
   if(imp>0&&Math.abs(imp-a)<=0.011)sc=Math.max(sc,2.6);
   else if(r.rm&&imp>0&&Math.abs(2*imp-a)<=0.011&&Math.abs(dd)<=20)sc=Math.max(sc,2.6); /* affitto pagato per due: metà torna come rimborso */else if(tp&&tp.variabile&&!r.rm&&imp>0&&Math.abs(imp-a)<=0.15*imp&&(m.cat==="fisse"||!m.cat))sc=Math.max(sc,1.4);
   if(sc||tutti)out.push({k:"s",rs:[r.id],sc:sc-Math.abs(dd)/400,lbl:scadLbl(r)});});
  /* F24 / delega con più voci: combinazioni di 2-4 tasse con scadenza a ±12 giorni che sommano l'importo */
  const tx=S.scadenzario.map((r,i)=>({r,i})).filter(({r})=>tipoOf(r)!=="spesa"&&SD(r)&&!occ.has(r.id)&&Math.abs(dDiff(SD(r),m.data))<=12);
  const imp=({i})=>rows0[i]?rows0[i].imp:0;
  if(tx.length>=2&&tx.length<=12){const rec=(k,st,acc)=>{if(acc.length>=2&&Math.abs(sum(acc.map(imp))-a)<=0.02)out.push({k:"s",rs:acc.map(x=>x.r.id),sc:2.8,lbl:acc.map(x=>x.r.voce).join(" + ")+" · "+fmt(sum(acc.map(imp)))});
    if(acc.length>=4)return;for(let j=st;j<tx.length;j++)rec(k,j+1,[...acc,tx[j]]);};rec(0,0,[]);}}
 else{const ym=m.data.slice(0,7);
  LINK_F.forEach(([f,l])=>{let sc=0;
   if(f==="ssn"&&S.ced&&S.ced.lista.some(c=>c.controllo.ok&&c.dataPagamento&&Math.abs(dDiff(c.dataPagamento,m.data))<=10&&Math.abs((c.controllo.netto||0)-m.importo)<0.011))sc=3.2;
   if(mem&&mem.k==="e"&&mem.r===f)sc=Math.max(sc,2.2);
   const man=S.registro.filter(r=>!r.ext&&r.fonte===f&&(r.data||"").startsWith(ym)),tm=sum(man.map(r=>r.importo));
   if(man.length){const d=movLoad(),stessi=d?d.movimenti.filter(x=>x.chiave===m.chiave&&x.data.startsWith(ym)&&x.importo>0):[m];
    if(Math.abs(tm-m.importo)<0.011||Math.abs(tm-sum(stessi.map(x=>x.importo)))<0.011)sc=Math.max(sc,3);}
   if(!sc&&f==="lp"&&/ric\.?\s*fatt|fattura/i.test(m.dett||""))sc=1.2;
   if(sc||tutti)out.push({k:"e",rs:[f],sc,lbl:"Entrata · "+l});});}
 return out.sort((x,y)=>y.sc-x.sc);}
/* movimenti per cui proporre un collegamento */
const linkable=m=>m&&!movAbb()[m.id]&&!movPrest()[m.id]&&m.cat!==undefined&&!LINK_NOCAT.includes(m.cat||"")&&(m.importo<0||m.cat==="stipendio");
const LINK_PROPCAT=["fisse","tasse","casa","straord","stipendio",""];
/* v56: anche i movimenti di altre categorie (es. abbonamenti in «Altre spese quotidiane») si propongono se combaciano con una
   spesa fissa (stesso importo ±1 cent vicino alla scadenza, o controparte già collegata a quella spesa) */
function linkProp(m){if(!linkable(m)||linkOf(m.id).length||linkNo(m.id))return null;const pc=LINK_PROPCAT.includes(m.cat||"");if(!pc&&!(m.importo<0))return null;
 const c=linkCands(m,false);if(!c.length)return null;const b=c[0];
 if(pc)return b.sc>=1.2?b:null;
 return b.k==="s"&&b.rs.length===1&&b.sc>=2.5&&(S.scadenzario.find(r=>r.id===b.rs[0])||{}).ric?b:null;}
function linkSet(m,k,rs){S.link=(S.link||[]).filter(l=>l.m!==m.id);
 if(k==="x")S.link.push({m:m.id,k:"x",r:"",d:m.data,i:m.importo,c:m.conto,t:(m.descr||m.tipo||"").slice(0,60)});
 else if(k)rs.forEach(r=>S.link.push({m:m.id,k,r,d:m.data,i:k==="s"&&rs.length>1?0:m.importo,c:m.conto,t:(m.descr||m.tipo||"").slice(0,60)}));
 if(k==="s"&&rs.length===1){const r=S.scadenzario.find(x=>x.id===rs[0]);if(r)S.linkMem[m.chiave]={k:"s",r:r.ric||tipoOf(r)};}
 if(k==="e")S.linkMem[m.chiave]={k:"e",r:rs[0]};
 if(k==="s"&&rs.length>1){const tot=sum(rs.map(id=>{const i=S.scadenzario.findIndex(x=>x.id===id);return R.deb&&R.deb.rows[i]?R.deb.rows[i].imp:0;}));
  /* più voci con un solo pagamento: a ciascuna la sua parte (in proporzione all'importo previsto) */
  S.link.filter(l=>l.m===m.id).forEach(l=>{const i=S.scadenzario.findIndex(x=>x.id===l.r),v=R.deb&&R.deb.rows[i]?R.deb.rows[i].imp:0;l.i=tot?Math.round(m.importo*v/tot*100)/100:0;});}
 applyLinks();scheduleSave();}
/* opzioni del menu «collega» */
function linkOpts(m){const ls=linkOf(m.id),curV=ls.length?ls[0].k+":"+ls.map(l=>l.r).join(","):linkNo(m.id)?"x":"";
 const c=linkCands(m,true).slice(0,40),seen=new Set();let o=`<option value="">${ls.length?"— togli il collegamento —":"Collega a… (nessuno)"}</option>`;
 if(ls.length&&!c.some(x=>x.k+":"+x.rs.join(",")===curV))o+=`<option value="${curV}" selected>↔ ${esc(linkLbl(ls))}</option>`;
 c.forEach(x=>{const v=x.k+":"+x.rs.join(",");if(seen.has(v))return;seen.add(v);o+=`<option value="${esc(v)}" ${v===curV?"selected":""}>${x.sc>=1.2?"★ ":""}${esc(x.lbl)}</option>`;});
 return o+`<option value="x" ${curV==="x"?"selected":""}>Non collegare</option>`;}
const linkSel=m=>(linkable(m)&&(LINK_PROPCAT.includes(m.cat||"")||m.importo<0))||linkOf(m.id).length?`<select class="in sel mv-link" data-id="${m.id}" aria-label="Collega a una voce" ${READONLY?"disabled":""}>${linkOpts(m)}</select>`:"";
const linkTag=m=>{const ls=linkOf(m.id);return ls.length?`<span class="lk-tag" title="Collegato">↔ ${esc(linkLbl(ls))}</span>`:"";};
/* riquadro «Da collegare» nel Resoconto mensile */
function linkBox(ym){const d=movLoad();if(!d)return "";const P=[];d.movimenti.forEach(m=>{const p=linkProp(m);if(p)P.push([m,p]);});
 const qui=P.filter(([m])=>m.data.startsWith(ym)).sort((a,b)=>a[0].data.localeCompare(b[0].data)),altri=[...new Set(P.filter(([m])=>!m.data.startsWith(ym)).map(([m])=>m.data.slice(0,7)))].sort();
 const nL=new Set((S.link||[]).filter(l=>l.k!=="x"&&(l.d||"").startsWith(ym)).map(l=>l.m)).size;
 if(!qui.length&&!altri.length)return nL?`<p class="note lk-ok">↔ ${nL} ${nL>1?"movimenti collegati":"movimento collegato"} a voci del Gestionale in ${MESE_L(ym).toLowerCase()}; nessun altro da collegare.</p>`:"";
 return `<div class="box lk-box"><h3>Da collegare <small>${qui.length?qui.length+" in "+MESE_L(ym).toLowerCase():"nessuno in questo mese"}${nL?" · "+nL+" già collegati":""}</small></h3>
 <p class="note">Movimenti che corrispondono a una voce del Gestionale (spese fisse, tasse, entrate senza cedolino). Con ✓ la voce risulta pagata o incassata alla data e con l'importo reale; ✕ = non collegare. Per scegliere un'altra voce usa il menu.</p>
 ${qui.length?`<div class="mvl">${qui.map(([m,p],j)=>`<div class="mvr lk-r${m.importo>0?" in":""}"><span class="mvd">${dIt(m.data).slice(0,5)}</span><span class="mvt"><b>${esc(m.descr||m.tipo)}</b><small>${esc(m.conto)} · ${esc(movLbl(m.cat))}</small><em class="lk-p">↔ ${esc(p.lbl)}</em></span><span class="mvi">${fmt(m.importo,"sign")}</span>
  <span class="mve">${linkSel(m)}<button class="btn sm" data-act="lk-ok" data-id="${m.id}" data-v="${esc(p.k+":"+p.rs.join(","))}" ${READONLY?"disabled":""}>✓</button><button class="btn sm ghost" data-act="lk-no" data-id="${m.id}" title="Non collegare" ${READONLY?"disabled":""}>✕</button></span></div>`).join("")}</div>
 <div class="actions"><button class="btn" data-act="lk-all" data-ym="${ym}" ${READONLY?"disabled":""}>✓ Conferma tutte le proposte di ${MESE_L(ym).toLowerCase()}</button></div>`:""}
 ${altri.length?`<p class="note">Da collegare anche in: ${altri.map(x=>`<button class="lk-m" data-act="lk-mm" data-mm="${x}">${MESI[+x.slice(5)-1].slice(0,3).toLowerCase()} ${x.slice(2,4)}</button>`).join(" ")}</p>`:""}</div>`;}
/* avviso: mesi con estratto Fineco ma senza conto deposito vincolato indicato → Fineco non si riempie */
function vincWarn(){const d=movLoad();if(!d)return "";const cur=new Date().toLocaleDateString("sv-SE").slice(0,7);
 const L=[...new Set((d.file||[]).filter(f=>f.banca==="fineco"&&f.periodo&&f.periodo.a).map(f=>f.periodo.a.slice(0,7)))].filter(ym=>ym<cur&&vincAt(ym)==null).sort();
 if(!L.length||!(S.vincolato.fineco||[]).length)return "";
 const cp=d.movimenti.some(m=>m.conto==="Fineco"&&/cashpark/i.test(m.tipo||"")&&m.data<=ymEnd(L[L.length-1]));
 return `<p class="note neg">Fineco non si riempie da solo per ${L.map(x=>MESI[+x.slice(5)-1].slice(0,3).toLowerCase()).join(", ")} ${L[0].slice(0,4)}: il conto deposito vincolato è indicato solo dal ${MESE_L(S.vincolato.fineco[0].da).toLowerCase()}.${cp?" Negli estratti c'è un CashPark già attivo in quei mesi: aggiungi il vincolato dal mese in cui l'hai aperto (vale anche 0 se non c'era).":" Se in quei mesi non c'era, aggiungi 0 dal primo mese."}</p>`;}
view.addEventListener("click",e=>{const b=e.target.closest("[data-act^='lk-']");if(!b)return;e.preventDefault();const a=b.dataset.act,d=movLoad();
 if(a==="lk-mm"){MM=b.dataset.mm;render();return;}
 if(READONLY||!d)return;const mv=id=>d.movimenti.find(x=>x.id===id);
 if(a==="lk-ok"){const m=mv(b.dataset.id),[k,r]=(b.dataset.v||"").split(":");if(m&&k){linkSet(m,k,r.split(","));render();}return;}
 if(a==="lk-no"){const m=mv(b.dataset.id);if(m){linkSet(m,"x",[]);render();}return;}
 if(a==="lk-all"){d.movimenti.filter(m=>m.data.startsWith(b.dataset.ym)).forEach(m=>{const p=linkProp(m);if(p)linkSet(m,p.k,p.rs);});render();return;}});
view.addEventListener("change",e=>{const t=e.target;if(!t.classList||!t.classList.contains("mv-link")||READONLY)return;const d=movLoad(),m=d&&d.movimenti.find(x=>x.id===t.dataset.id);if(!m)return;
 const v=t.value;if(!v){linkSet(m,"",[]);}else if(v==="x")linkSet(m,"x",[]);else{const [k,r]=v.split(":");linkSet(m,k,r.split(","));}render();});

/* riquadro nella dashboard di Finanze */

function movBody(ymSel,parts){parts=parts||{};const d=movLoad(),L=movMesi();
 if(!d)return `<div class="banner">${MOV_ERR?"Estratti conto non letti: "+esc(MOV_ERR)+".":hubUrl()?"Lettura in corso… se non compare nulla, controlla che l'Hub sul PC fisso sia aggiornato.":"Imposta l'indirizzo dell'Hub in <a href=\"#collegamenti\">Collegamenti e backup</a>."}</div><div class="actions"><button class="btn" data-act="mov-agg">Aggiorna</button></div>`;
 if(!L.includes(ymSel))return `<div class="banner">Nessun estratto conto per ${MESE_L(ymSel).toLowerCase()}.</div><div class="actions"><button class="btn ghost" data-act="mov-agg">Aggiorna dal PC</button></div><p class="note" id="lk-mov-msg" ${linkMsgs.mov?"":"hidden"}>${linkMsgs.mov||""}</p>`;
 const ym=ymSel,N=movNetto(ym),o=N.o,mv=d.movimenti.filter(m=>m.data.startsWith(ym));
 
 const te=N.te,tu=N.tu,tn=tu+N.R;
 const q=(d.quadratura||[]).filter(x=>x.mese===ym);
 const qc=x=>`<span class="mq ${x.ok===true?"ok":x.ok===false?"ko":"na"}" title="${x.ok===false&&x.differenza!=null?"differenza "+fmt(x.differenza):""}">${esc(x.conto)} ${x.ok===true?"✓ quadra":x.ok===false?"⚠ non quadra"+(x.differenza!=null?" ("+fmt(x.differenza,"sign")+")":""):"· primo mese, non verificabile"}${x.parziale?" · file parziale":""}<small>${fmt(x.inizio)} → ${fmt(x.fine)}</small></span>`;
 const opt=(sel,prop)=>`<option value="">— scegli —</option>${MOV_CAT.map(([c,l])=>`<option value="${c}" ${c===(sel||prop)?"selected":""}>${l}</option>`).join("")}`;
 const riv=d.movimenti.filter(m=>m.rivedere&&m.data.startsWith(ym)),rivAll=d.movimenti.filter(m=>m.rivedere).length;
 const regK=new Set((d.regole||[]).map(r=>r.chiave)),pend=m=>MOV_PEND[m.id]||{};
 const nAn={};d.movimenti.forEach(m=>{if(m.chiave)nAn[m.chiave]=(nAn[m.chiave]||0)+1;});
 const abbT=m=>{const pq=movPrest()[m.id];if(pq)return `<span class="chip mv-abb" title="Legato a un prestito: non entra nei conteggi">${pq.t==="dato"?"prestito a":"restituzione da"} ${esc(pq.chi)}</span> `;const x=movAbb()[m.id];return (movNota(m.id)?`<em class="mv-nt">${esc(movNota(m.id))}</em> `:"")+(x?`<span class="chip mv-abb" title="Abbinato: non entra nei conteggi">↔ ${x.ref?"rimborso del pagamento":"pagamento rimborsato"} del ${dIt(x.data).slice(0,5)} <button class="lnk" data-act="mov-sep" data-id="${x.ref?m.id:x.p}">separa</button></span> `:"");};
 const riga=(m,edit)=>`<div class="mvr${m.importo>0?" in":""}${movAbb()[m.id]||movPrest()[m.id]?" abb":""}" data-c="${m.cat||""}" data-q="${esc(((m.descr||"")+" "+(m.dett||"")+" "+m.tipo+" "+m.conto).toLowerCase())}"><span class="mvd">${dIt(m.data).slice(0,5)}</span><span class="mvt"><b>${esc(m.descr||m.tipo)}</b><small>${esc(m.conto)} · ${esc(m.tipo)}${m.carta?" · carta di credito":""}${m.orig==="regola"?" · regola":""}${m.orig==="scelta"?" · scelta tua":""}</small>${abbT(m)}${edit?"":linkTag(m)}${m.dett&&m.dett!==m.descr?`<em>${esc(m.dett)}</em>`:""}</span><span class="mvi">${fmt(m.importo,"sign")}</span>
  ${edit?`<span class="mve"><select class="in sel mv-cat" data-id="${m.id}" aria-label="Categoria">${opt(pend(m).cat!=null?pend(m).cat:(m.proposta||m.cat))}</select><label class="mvk" title="Usa la stessa categoria per i prossimi movimenti con questa controparte"><input type="checkbox" class="mv-ric" data-id="${m.id}" ${(pend(m).ric!=null?pend(m).ric:m.proposta!=="straord")?"checked":""}> sempre</label><button class="btn sm" data-act="mov-ok" data-id="${m.id}">✓</button></span>`
   :`<span class="mve"><select class="in sel mv-set" data-id="${m.id}" aria-label="Categoria">${opt(m.cat)}</select><label class="mvk" title="Spuntato: questa controparte ha una regola e i suoi movimenti si classificano da soli"><input type="checkbox" class="mv-ric2" data-id="${m.id}" ${regK.has(m.chiave)?"checked":""}> sempre${regK.has(m.chiave)&&m.orig==="scelta"?" <small>(eccezione)</small>":""}</label>${linkSel(m)}</span>`}</div>`;
 {const mn=MESE_L(ym).toLowerCase();
  const usc=MOV_CAT.filter(c=>c[2]==="u").map(([k,l])=>[l+(N.alloc[k]?" ≈":""),Math.max(-N.net[k],0),MOV_COL[k],k]).concat(N.amz?[["Acquisti con buoni Amazon",N.amz,MOV_COL.amz,"amz"]]:[]).filter(x=>x[1]>0.005);
  const ent=[["Stipendio",Math.max(o.stipendio||0,0),"c-ent","stipendio"],["Sondaggi",N.sv.tot,"c-etf","sond"],["Entrate extra",Math.max(o.extra||0,0),"c-liq","extra"],["Interessi conto deposito",vincInt(ym),"c-inv","vint"],["Extra via PayPal",N.ppx,"c-rev","ppx"]].filter(x=>x[1]>0.005);
  const tU=sum(usc.map(x=>x[1])),tE=sum(ent.map(x=>x[1]));
  /* v34: tocco su una voce della legenda = elenco dei movimenti del mese in quella categoria (pannello sotto la voce) */
  const AB=movAbb(),PRm=movPrest();
  const legList=(key,box)=>{const byC=c=>mv.filter(m=>(m.cat||"")===c&&!AB[m.id]&&!PRm[m.id]);let L=[],nota="";
   if(key==="sond"){L=[...byC("sondaggi"),...byC("paypal")];nota=`Il valore viene dall'app Guadagni: prelievi del mese ${fmt(N.sv.tot)} (banca ${fmt(N.sv.banca)}, PayPal ${fmt(N.sv.paypal)}, buoni Amazon ${fmt(N.sv.amazon)}). Sotto, gli accrediti arrivati sui conti da portali e PayPal (passaggi, non contati due volte).`;}
   else if(key==="ppx"){L=byC("paypal");nota=`Arrivato da PayPal oltre l'atteso dai sondaggi: ${fmt(N.ppx)}. Dettaglio del calcolo in «Sondaggi e PayPal».`;}
   else if(key==="amz"){nota=`Buoni Amazon prelevati nell'app Guadagni (${fmt(N.amz)}): non passano dai conti.`;}
   else if(key==="vint"){L=mv.filter(m=>/cashpark/i.test(m.tipo||""));nota=`Interessi netti del conto deposito vincolato arrivati alla scadenza: accredito − capitale (${fmt(vincAt(ymAdd(ym,-1)))}, da Patrimonio › Liquidità). Il capitale è un giroconto.`;}
   else{L=byC(key);if(box==="u"&&N.alloc[key])nota=`Spesa lorda ${fmt(-o[key])} − rimborsi ≈ ${fmt(N.alloc[key])} = ≈ ${fmt(-N.net[key])}.`;}
   L.sort((a,b)=>a.data.localeCompare(b.data));
   {const pr=mv.filter(m=>PRm[m.id]&&(m.cat||"")===key);if(pr.length)nota=(nota?nota+" ":"")+`Non contati perché legati a un prestito (Patrimonio › Prestiti): ${pr.map(m=>`${esc(m.descr||m.tipo)} ${fmt(m.importo,"sign")} del ${dIt(m.data).slice(0,5)}`).join(" · ")}.`;}
   {const ab=mv.filter(m=>AB[m.id]&&(m.cat||"")===key);if(ab.length)nota=(nota?nota+" ":"")+`Non contati perché abbinati (acquisto ↔ rimborso): ${ab.map(m=>`${esc(m.descr||m.tipo)} ${fmt(m.importo,"sign")} del ${dIt(m.data).slice(0,5)} ↔ ${AB[m.id].ref?"pagamento":"rimborso"} del ${dIt(AB[m.id].data).slice(0,5)}${AB[m.id].data.slice(0,7)!==ym?" "+MESE_L(AB[m.id].data.slice(0,7)).toLowerCase():""} <button class="lnk" data-act="mov-sep" data-id="${AB[m.id].ref?m.id:AB[m.id].p}">separa</button>`).join(" · ")}.`;}
   return `${nota?`<p class="note">${nota}</p>`:""}${L.length?`<div class="mvl-mini">${L.map(m=>`<div class="mvr-m${m.importo>0?" in":""}" data-act="mvrow" role="button" tabindex="0" aria-expanded="false" title="Tocca per cambiare categoria"><span class="mvd">${dIt(m.data).slice(0,5)}</span><span class="mvt"><b>${esc(m.descr||m.tipo)}</b><small>${esc(m.conto)}${m.dett&&m.dett!==m.descr?" · "+esc(m.dett):""}${m.orig==="regola"?" · regola":m.orig==="scelta"?" · scelta tua":""}</small>${movNota(m.id)?`<em class="mv-nt">${esc(movNota(m.id))}</em>`:""}</span><span class="mvi">${fmt(m.importo,"sign")}</span></div><div class="mvr-ed" hidden>${m.cat==="straord"||movNota(m.id)?`<label>A cosa è servita <input class="in mv-note" data-id="${m.id}" value="${esc(movNota(m.id))}" maxlength="140" placeholder="es. telefono nuovo" ${READONLY?"disabled":""}></label>`:""}<label>Categoria <select class="in sel mv-set" data-ed="1" data-id="${m.id}" ${READONLY?"disabled":""}>${opt(m.cat)}</select></label>${(()=>{const nA=(nAn[m.chiave]||1)-1;return `<label class="mv-an-l"><input type="checkbox" class="mv-an" data-id="${m.id}" ${READONLY?"disabled":""}> Applica anche ${nA?`agli altri ${nA===1?"movimento":nA+" movimenti"} di «${esc(m.descr||m.tipo)}» in memoria`:`ai movimenti di «${esc(m.descr||m.tipo)}»`} e a quelli futuri</label>`;})()}${linkSel(m)?`<label>Collegato a ${linkSel(m)}</label>`:""}${(()=>{if(movPrest()[m.id]||READONLY)return "";const pa=(S.prestiti||[]).filter(p=>p.data<=m.data);
   if(m.importo>0)return pa.filter(p=>prRes(p)>0.005).map(p=>`<button class="btn ghost sm" data-act="pr-rok" data-p="${p.id}" data-m="${m.id}">È una restituzione del prestito a ${esc(p.chi)}</button>`).join("");
   return (S.prestiti||[]).filter(p=>!p.mov&&Math.abs(-m.importo-p.importo)<=1&&Math.abs(dDiff(m.data,p.data))<=10).map(p=>`<button class="btn ghost sm" data-act="pr-mov" data-p="${p.id}" data-m="${m.id}">È il prestito a ${esc(p.chi)}</button>`).join("");})()}<small>${regK.has(m.chiave)?"Questa controparte ha già una regola. ":""}Con la casella spuntata la scelta diventa la regola della controparte (vale per tutti i suoi movimenti, tranne quelli impostati a mano uno per uno); senza, cambia solo questo movimento. Puoi spuntare la casella prima di scegliere, oppure dopo per estendere la categoria attuale.</small></div>`).join("")}</div><p class="mvl-tot">${L.length} ${L.length===1?"movimento":"movimenti"} · totale <b>${fmt(sum(L.map(m=>m.importo)),"sign")}</b></p>`:key==="amz"?"":`<p class="muted">Nessun movimento sui conti in questa categoria.</p>`}`;};
  const legLi=(box,tot)=>([l,v,c,key])=>li(c,l,v,tot).replace("<li>",`<li class="lk" data-act="mvleg" data-k="${box}-${key}" role="button" tabindex="0" aria-expanded="${MOV_LEG.has(box+"-"+key)}" title="Mostra i movimenti">`)+`<li class="mvleg-p" data-p="${box}-${key}" ${MOV_LEG.has(box+"-"+key)?"":"hidden"}>${legList(key,box)}</li>`;
  const card=(t,arr,tot,lab,box)=>`<div class="box mvpie"><h3>${t} <small>${mn}</small></h3><div class="mvpie-in">${donut(arr.map(x=>x.slice(0,3)),150,18,t+" di "+mn,1,tot,lab)}<ul class="pleg pleg-k">${arr.map(legLi(box,tot)).join("")||`<li><span class="muted">Nessun dato</span></li>`}</ul></div><p class="note mvleg-h">Tocca una voce per vedere i movimenti.</p></div>`;
  parts.pies=[card("Entrate",ent,tE,"entrate","e"),card("Uscite",usc,tU,"uscite nette","u")];parts.entC={tot:tE,voci:ent};}
 /* v57 (richiesta di Marco: «Altri dati» ripetitivo): restano solo i movimenti ancora da classificare; il resto è già
    nelle legende, in «Sondaggi e PayPal» o in «Spese che dividete» */
 {const r=[];if(Math.abs(o[""]||0)>0.005)r.push(kv(`Movimenti da classificare <small>non entrano nelle ciambelle finché non scegli la categoria</small>`,`<span class="neg">${fmt(o[""],"sign")}</span>`));
  parts.altri=r.join("");parts.ok=true;}
 
 return ` <div class="mqs">${q.map(qc).join("")||`<span class="mq na">Quadratura non disponibile</span>`}</div>
 ${riv.length?`<div class="box mv-riv"><h3>Da rivedere <small>${riv.length} in ${MESE_L(ym).toLowerCase()}${rivAll>riv.length?" · "+rivAll+" in tutto":""}</small></h3>
  <p class="note">Scegli la categoria e conferma con ✓. Con «sempre» tutti i movimenti della stessa controparte, anche di questo mese, prendono quella categoria, tranne quelli che hai già impostato a mano.</p>
  <details class="mvhelp"><summary>Come scegliere</summary><p class="note">Le uscite di vita quotidiana sopra ${fmt(d.soglia||300)} sono proposte come spese straordinarie. I soldi che ti restituisce chi divide le spese con te vanno in «Rimborsi spese condivise»: non sono entrate, riducono le spese delle categorie che dividete. Spostamenti tra i tuoi conti: «Giroconto». Quello che non vuoi contare: «Escluso dai conteggi».</p></details>
  <div class="mvl">${riv.map(m=>riga(m,true)).join("")}</div><div class="actions"><button class="btn" data-act="mov-okall">✓ Conferma tutte le proposte visibili</button></div></div>`
  :`<div class="banner sond-b">Tutti i movimenti di ${MESE_L(ym).toLowerCase()} sono classificati.${rivAll?` Ne restano ${rivAll} da rivedere in altri mesi.`:""}</div>`}
 ${linkBox(ym)}
  <div class="box"><h3>Per conto</h3><dl class="kv">${["Fineco","Revolut","Revolut deposito"].map(c=>{const s=mv.filter(m=>m.conto===c);return s.length?kv(c+` <small>${s.length} movimenti</small>`,fmt(sum(s.map(m=>m.importo)),"sign")):"";}).join("")}</dl>
   <p class="note">File letti: ${(d.file||[]).length}${(d.errori||[]).length?` · <span class="neg">${d.errori.length} illeggibili: ${d.errori.map(e=>esc(e.file)).join(", ")}</span>`:""}. Ultima lettura sul PC: ${d.aggiornato?fmtWhen(Date.parse(d.aggiornato)):"—"}.</p>
   <div class="actions"><button class="btn ghost" data-act="mov-agg">Aggiorna dal PC</button></div><p class="note" id="lk-mov-msg" ${linkMsgs.mov?"":"hidden"}>${linkMsgs.mov||""}</p></div>
  ${(()=>{const sv=N.sv,pa=N.pa,row=(l,v,c)=>`<div class="sp-r"><span>${l}</span><b class="${c||""}">${v}</b></div>`;
   return `<details class="box fold" id="sp-box" ${SP_OPEN||sv.senza.length?"open":""}><summary><h3>Sondaggi e PayPal <small>prelevati ${fmt(sv.tot)}${pa.extra>0.005?` · extra via PayPal ${fmt(pa.extra)}`:""}</small></h3></summary>
   <div class="sp-l">${row("Prelevati nell'app Guadagni",fmt(sv.tot))}${sv.amazon?row("&nbsp;&nbsp;di cui buoni Amazon",fmt(sv.amazon)):""}${row("Arrivati in banca dai portali",fmt(o.sondaggi||0))}${row("Arrivati da PayPal",fmt(pa.arr))}${pa.res>0.005?row("Ancora da arrivare <small>passa al mese dopo</small>",fmt(pa.res)):""}${pa.extra>0.005?row("Extra via PayPal <small>contato nelle entrate</small>",fmt(pa.extra),"nt-ent"):""}</div>
   ${sv.senza.length?`<p class="note neg">Canale non indicato per ${sv.senza.map(esc).join(", ")}: contati come banca. Indicalo sotto.</p>`:""}
   <details class="more"><summary>Come si calcola</summary><p class="note">I sondaggi contano come entrate per quanto prelevi nell'app Guadagni; gli accrediti dei portali in banca e i trasferimenti da PayPal sono solo passaggi. Atteso da PayPal = prelievi non Amazon (${fmt(sv.banca+sv.paypal)}) − arrivati in banca dai portali (${fmt(o.sondaggi||0)})${pa.prima?` + ancora atteso dal mese prima (${fmt(pa.prima)})`:""} = ${fmt(pa.att)}. Arrivato da PayPal ${fmt(pa.arr)}: quello che supera l'atteso è un'entrata extra (${fmt(pa.extra)}), quello che manca passa al mese dopo (${fmt(pa.res)}).</p></details>
   <details class="more" ${sv.senza.length?"open":""}><summary>Come paga ogni portale</summary><div class="mvcan">${SV.sites.map(x=>`<label><span>${esc(x.name)}</span><select class="in sel mv-canale" data-site="${esc(x.id)}" ${READONLY?"disabled":""}>${(S.sondCanali||{})[x.id]?"":`<option value="" selected>da indicare (ora: banca)</option>`}${SOND_CAN.map(([k,l])=>`<option value="${k}" ${(S.sondCanali||{})[x.id]===k?"selected":""}>${l}</option>`).join("")}</select></label>`).join("")}</div></details></details>`;})()}
 <details class="more" ${MOV_ALL?"open":""} id="mov-all"><summary>Tutti i movimenti di ${MESE_L(ym).toLowerCase()} (${mv.length})</summary><details class="more"><summary>Come funziona</summary><p class="note">Cambia la categoria dal menu. «sempre» spuntato = la controparte ha una regola e i suoi movimenti (passati, del mese e futuri) si classificano da soli, tranne quelli che hai impostato a mano: spuntalo per crearla, toglilo per eliminarla. Se cambi la categoria di un movimento con regola ti chiede se cambiare la regola o solo quel movimento.</p></details>
  <div class="mvf"><input class="in" type="search" id="mov-q" placeholder="Cerca (es. Coop, Netflix…)" value="${esc(MOV_Q)}" aria-label="Cerca nei movimenti"><select class="in sel" id="mov-fc" aria-label="Filtra per categoria"><option value="*">Tutte le categorie</option>${MOV_CAT.map(([c,l])=>`<option value="${c}" ${c===MOV_FC?"selected":""}>${l}</option>`).join("")}<option value="" ${MOV_FC===""?"selected":""}>Da classificare</option></select><span class="mvn" id="mov-n"></span></div>
  <div class="mvl" id="mov-list">${mv.map(m=>riga(m,false)).join("")}</div></details>
 ${(d.regole||[]).length?`<details class="more" ${MOV_REG?"open":""} id="mov-reg"><summary>Regole imparate (${d.regole.length})</summary><p class="note">Ogni regola classifica da sola i movimenti di quella controparte (anche del mese in corso), tranne quelli che hai impostato a mano (eccezioni). Cambiala dal menu o toglila con ×: i movimenti senza scelta manuale tornano alla classificazione automatica o «da rivedere».</p>
  <div class="mvl">${d.regole.map((r,i)=>`<div class="mvr"><span class="mvd">${r.n}×</span><span class="mvt"><b>${esc(r.descr)}</b><small>${esc(r.conto)}${r.tipo?" · "+esc(r.tipo):""}${(n=>n?` · ${n} ${n>1?"eccezioni":"eccezione"} impostat${n>1?"e":"a"} a mano`:"")(d.movimenti.filter(m=>m.chiave===r.chiave&&m.orig==="scelta").length)}</small></span><span></span><span class="mve"><select class="in sel mv-rule" data-ri="${i}" aria-label="Categoria della regola">${MOV_CAT.map(([c,l])=>`<option value="${c}" ${c===r.cat?"selected":""}>${l}</option>`).join("")}</select><button class="icon-btn" data-act="mov-rdel" data-ri="${i}" aria-label="Togli la regola" title="Togli la regola">×</button></span></div>`).join("")}</div></details>`:""}
  <details class="box fold" id="sc-box" ${SC_OPEN?"open":""}><summary><h3>Spese che dividete <small>${(S.movCond||[]).length?(S.movCond||[]).map(movLbl).join(", "):"nessuna"}</small></h3></summary>${N.R?`<div class="sp-l">${`<div class="sp-r"><span>Rimborsi ricevuti nel mese</span><b class="nt-ent">${fmt(N.R)}</b></div>`}${N.aff?`<div class="sp-r"><span>&nbsp;&nbsp;quota affitto → Casa e utenze</span><b>${fmt(N.aff)}</b></div>`:""}${N.nonRip>0.005?`<div class="sp-r"><span>&nbsp;&nbsp;non ripartiti</span><b>${fmt(N.nonRip)}</b></div>`:""}</div>`:""}<div class="mvcond">${MOV_COND_OK.map(c=>`<label><input type="checkbox" class="mv-cond" value="${c}" ${(S.movCond||[]).includes(c)?"checked":""} ${READONLY?"disabled":""}> ${movLbl(c)}</label>`).join("")}</div>
   <details class="more"><summary>Come funziona</summary><p class="note">Dai rimborsi del mese si toglie prima la quota d'affitto (${affQuota(ym)?fmt(affQuota(ym)):"spesa fissa mensile «Affitto»"}), che va tutta a «Casa e utenze»; il resto si divide in parti uguali tra le categorie spuntate, senza superare quanto hai speso in ciascuna. Le cifre con ≈ sono stime; il totale delle uscite nette è esatto.</p></details></details>
`;}
function movFiltra(){const L=document.getElementById("mov-list");if(!L)return;const q=MOV_Q.trim().toLowerCase();let n=0,t=0;
 L.querySelectorAll(".mvr").forEach(r=>{t++;const ok=(MOV_FC==="*"||r.dataset.c===MOV_FC)&&(!q||r.dataset.q.includes(q));r.hidden=!ok;if(ok)n++;});
 const c=document.getElementById("mov-n");if(c)c.textContent=n===t?"":n+" di "+t;}
view.addEventListener("input",e=>{if(e.target.id==="mov-q"){MOV_Q=e.target.value;movFiltra();}});

async function movClassifica(voci){if(!voci.length)return;voci.forEach(v=>{if(v.id)delete MOV_PEND[v.id];});await movSync(false,"/api/estratti/classifica",{voci});
 if(MOV_ERR)alert("Classificazione non salvata: "+MOV_ERR);}
view.addEventListener("click",e=>{const b=e.target.closest("[data-act^='mov-']");if(!b)return;e.preventDefault();const a=b.dataset.act;
 if(a==="mov-agg"){movSync(true,"/api/estratti/aggiorna",{});return;}
 if(a==="mov-m"){const L=movMesi(),k=L.indexOf(MOV_M)+ +b.dataset.d;if(L[k]){MOV_M=L[k];render();}return;}
 const voce=id=>{const m=movLoad().movimenti.find(x=>x.id===id),s=document.querySelector(`.mv-cat[data-id="${id}"]`),r=document.querySelector(`.mv-ric[data-id="${id}"]`);
  return m&&s&&s.value?{id,chiave:m.chiave,cat:s.value,ricorda:!!(r&&r.checked)}:null;};
 if(a==="mov-ok"){const v=voce(b.dataset.id);if(!v){const s=document.querySelector(`.mv-cat[data-id="${b.dataset.id}"]`);if(s)s.focus();return;}movClassifica([v]);return;}
 if(a==="mov-sep"){if(movPrest()[b.dataset.id])return;if(READONLY)return;const id=b.dataset.id;if(!id)return;S.movAbbNo=[...new Set([...(S.movAbbNo||[]),id])];
  applyExtra();applyLinks();scheduleSave();render();return;}
 if(a==="mov-rdel"){const r=(movLoad().regole||[])[+b.dataset.ri];if(r&&confirm("Togliere la regola per «"+r.descr+"»?"))movClassifica([{chiave:r.chiave,cat:"",ricorda:true}]);return;}
 if(a==="mov-okall"){movClassifica([...document.querySelectorAll(".mv-cat")].map(s=>voce(s.dataset.id)).filter(Boolean));return;}});
view.addEventListener("change",e=>{const t=e.target;
 if(t.id==="mov-sel"){MOV_M=t.value;render();return;}
 if(t.id==="mov-fc"){MOV_FC=t.value;movFiltra();return;}
 if(t.classList&&t.classList.contains("mv-canale")){if(READONLY)return;if(!t.value)return;S.sondCanali=Object.assign({},S.sondCanali,{[t.dataset.site]:t.value});applyExtra();scheduleSave();render();return;}
 if(t.classList&&t.classList.contains("mv-cond")){if(READONLY)return;S.movCond=[...document.querySelectorAll(".mv-cond")].filter(x=>x.checked).map(x=>x.value);scheduleSave();render();return;}
 if(t.classList&&(t.classList.contains("mv-cat")||t.classList.contains("mv-ric"))){const id=t.dataset.id,P=MOV_PEND[id]=MOV_PEND[id]||{};
  if(t.classList.contains("mv-cat"))P.cat=t.value;else P.ric=t.checked;return;}
 if(t.classList&&t.classList.contains("mv-set")){const d=movLoad(),m=d.movimenti.find(x=>x.id===t.dataset.id);if(!m)return;
  if(t.dataset.ed){const ck=t.closest(".mvr-ed").querySelector(".mv-an"),tutti=!!(ck&&ck.checked)&&t.value!=="";
   movClassifica([{id:m.id,chiave:m.chiave,cat:t.value,ricorda:tutti}]);return;}
  const haRegola=(d.regole||[]).some(r=>r.chiave===m.chiave);
  /* controparte con regola: si chiede se cambiare tutti i suoi movimenti o solo questo (eccezione) */
  const tutti=haRegola&&t.value!==""&&confirm(`«${m.descr}» ha una regola. Cambiare la regola?\n\nOK = cambia la regola: vale per tutti i suoi movimenti, tranne quelli che hai impostato a mano · Annulla = solo questo movimento (eccezione)`);
  movClassifica([{id:m.id,chiave:m.chiave,cat:t.value,ricorda:tutti}]);return;}
 if(t.classList&&t.classList.contains("mv-an")){if(!t.checked)return;const d=movLoad(),m=d.movimenti.find(x=>x.id===t.dataset.id);if(!m)return;
  const s=t.closest(".mvr-ed").querySelector(".mv-set"),cat=(s&&s.value)||m.cat;if(!cat)return; /* nessuna categoria: la si applica quando la si sceglie */
  const nA=d.movimenti.filter(x=>x.chiave===m.chiave&&x.id!==m.id&&x.cat!==cat).length;
  if(!confirm(`Applicare «${movLbl(cat)}» a tutti i movimenti di «${m.descr||m.tipo}»${nA?` (${nA} da cambiare)`:""} e a quelli futuri?\n\nRestano come sono solo i movimenti che hai impostato a mano uno per uno.\n\nOK = applica ora · Annulla = scelgo prima un'altra categoria dal menu (la casella resta spuntata e la scelta varrà per tutti)`))return;
  movClassifica([{id:m.id,chiave:m.chiave,cat,ricorda:true}]);return;}
 if(t.classList&&t.classList.contains("mv-ric2")){const d=movLoad(),m=d.movimenti.find(x=>x.id===t.dataset.id);if(!m)return;
  if(t.checked){if(!m.cat){alert("Scegli prima la categoria dal menu.");t.checked=false;return;}
   movClassifica([{chiave:m.chiave,cat:m.cat,ricorda:true}]);return;}
  if(!confirm(`Togliere la regola per «${m.descr}»? Gli altri suoi movimenti torneranno alla classificazione automatica o «da rivedere»; questo resta «${movLbl(m.cat)}».`)){t.checked=true;return;}
  movClassifica([{chiave:m.chiave,cat:"",ricorda:true},{id:m.id,cat:m.cat}]);return;}
 if(t.classList&&t.classList.contains("mv-rule")){const r=(movLoad().regole||[])[+t.dataset.ri];if(r)movClassifica([{chiave:r.chiave,cat:t.value,ricorda:true}]);}});
view.addEventListener("toggle",e=>{if(e.target.id==="mov-all")MOV_ALL=e.target.open;if(e.target.id==="mov-reg")MOV_REG=e.target.open;},true);
/* v51: azioni su prestiti, note delle spese straordinarie, esclusione dalle medie */
view.addEventListener("click",e=>{const b=e.target.closest("[data-act^='pr-']");if(!b)return;e.preventDefault();if(READONLY)return;
 const a=b.dataset.act,P=(S.prestiti||[]).find(p=>p.id===b.dataset.p),val=id=>(document.getElementById(id)||{}).value||"";
 if(a==="pr-add"){const chi=val("pr-chi").trim(),dt=val("pr-data"),pi=parseIt(val("pr-imp"));
  if(!chi){document.getElementById("pr-chi").focus();return;}if(!/^\d{4}-\d{2}-\d{2}$/.test(dt)){document.getElementById("pr-data").focus();return;}if(!pi.ok||!(pi.v>0)){document.getElementById("pr-imp").focus();return;}
  S.prestiti=[...(S.prestiti||[]),{id:uid(),chi,data:dt,importo:Math.round(pi.v*100)/100,nota:val("pr-nota").trim().slice(0,140),mov:"",rest:[],no:[]}];PR_OPEN=false;}
 else if(!P)return;
 else if(a==="pr-del"){if(!confirm(`Eliminare il prestito a «${P.chi}» (${fmt(P.importo)})? I movimenti collegati tornano nelle categorie.`))return;S.prestiti=S.prestiti.filter(p=>p!==P);}
 else if(a==="pr-mov"){P.mov=b.dataset.m;}
 else if(a==="pr-movx"){P.mov="";}
 else if(a==="pr-no"){P.no=[...new Set([...(P.no||[]),b.dataset.m])];}
 else if(a==="pr-rok"){const m=(movLoad()||{movimenti:[]}).movimenti.find(x=>x.id===b.dataset.m);if(!m)return;
  /* se c'era una restituzione segnata a mano (anche prevista) dello stesso importo entro 45 giorni, diventa questa */
  const im=Math.round(m.importo*100)/100,j=(P.rest||[]).findIndex(r=>!r.mov&&Math.abs(r.importo-im)<=0.011&&Math.abs(dDiff(r.data,m.data))<=45);
  if(j>=0)P.rest=P.rest.map((r,i)=>i===j?{...r,data:m.data,mov:m.id}:r);else P.rest=[...(P.rest||[]),{id:uid(),data:m.data,importo:im,mov:m.id}];}
 else if(a==="pr-rdel"){P.rest=(P.rest||[]).filter(r=>r.id!==b.dataset.r);}
 else if(a==="pr-radd"){const dt=val("pr-rd-"+P.id),pi=parseIt(val("pr-ri-"+P.id));if(!/^\d{4}-\d{2}-\d{2}$/.test(dt)||!pi.ok||!(pi.v>0)){const f=document.getElementById("pr-ri-"+P.id);if(f)f.focus();return;}
  P.rest=[...(P.rest||[]),{id:uid(),data:dt,importo:Math.round(pi.v*100)/100,mov:""}];}
 applyExtra();applyLinks();scheduleSave();render();});
view.addEventListener("change",e=>{const t=e.target;if(READONLY)return;
 if(t.classList&&t.classList.contains("mv-note")){const v=t.value.trim().slice(0,140),o=Object.assign({},S.movNote||{});if(v)o[t.dataset.id]=v;else delete o[t.dataset.id];S.movNote=o;scheduleSave();return;}
 if(t.id==="str-nomedia"){S.straordNoMedia=t.checked;scheduleSave();render();}});
view.addEventListener("toggle",e=>{if(e.target.id==="pr-new")PR_OPEN=e.target.open;if(e.target.id==="pr-box")PR_BOX=e.target.open;if(e.target.id==="sp-box")SP_OPEN=e.target.open;if(e.target.id==="sc-box")SC_OPEN=e.target.open;},true);

/* ================= tema chiaro / scuro ================= */
/* predefinito scuro (impostato in index.html); la scelta resta in localStorage «gestionale-tema» (applicata già in index.html prima del CSS) */
const THEME_KEY="gestionale-tema",themeMQ=window.matchMedia?matchMedia("(prefers-color-scheme: dark)"):null;
const themeCur=()=>{const t=document.documentElement.getAttribute("data-theme");return t==="dark"||t==="light"?t:"dark";};
function themeUI(){const d=themeCur()==="dark",b=document.getElementById("hdr-theme");
 if(b){const l=d?"Passa al tema chiaro":"Passa al tema scuro";b.title=l;b.setAttribute("aria-label",l);document.getElementById("hdr-theme-i").textContent=d?"☀":"☾";document.getElementById("hdr-theme-t").textContent=d?"Chiaro":"Scuro";}
 const m=document.querySelector('meta[name="theme-color"]');if(m)m.content=d?"#072636":"#0b3a53";}
document.getElementById("hdr-theme").addEventListener("click",()=>{const n=themeCur()==="dark"?"light":"dark";document.documentElement.setAttribute("data-theme",n);lsSet(THEME_KEY,n);themeUI();});
if(themeMQ){const f=()=>themeUI();themeMQ.addEventListener?themeMQ.addEventListener("change",f):themeMQ.addListener&&themeMQ.addListener(f);}
window.addEventListener("storage",e=>{if(e.key===THEME_KEY&&(e.newValue==="dark"||e.newValue==="light")){document.documentElement.setAttribute("data-theme",e.newValue);themeUI();}});
themeUI();
/* ================= avvio ================= */
(function init(){
 const raw=lsGet(LS_KEY);
 if(raw){try{S=load(JSON.parse(raw));status("ok","Dati salvati su questo dispositivo");}
  catch(e){S=load(null);status("err","Dati locali illeggibili: ripristina un backup");}}
 else{S=load(null);status("busy","Nessun dato: importa o ripristina un backup");}
 svLoad();try{if(!READONLY&&(applyExtra()|applyLinks()))scheduleSave();}catch(e){}render();refreshLinks();
 try{if(navigator.storage&&navigator.storage.persist)navigator.storage.persist().catch(()=>{});}catch(e){}
 setTimeout(()=>{hubPull().finally(()=>{sondSync(false);cedSync(false);cartSync(false);hubSync(false);movSync(false);});},1200);
 setTimeout(()=>svHubSync(false),4000);
 document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"){hubPull().finally(()=>{sondSync(false);cedSync(false);cartSync(false);hubSync(false);movSync(false);});}
  else if(dirty)save();});
 window.addEventListener("pagehide",()=>{if(dirty)save();});
 window.addEventListener("online",()=>{sondSync(false);cedSync(false);cartSync(false);hubSync(false);movSync(false);});
 window.addEventListener("storage",e=>{
  if(e.key===SOND_LS_KEY){svLoad();sondSync(false);if(["home"].includes(current))afterExternalChange();}
  else if(e.key===LS_KEY&&e.newValue&&!dirty){try{S=load(JSON.parse(e.newValue));afterExternalChange();}catch(_){}}});
})();
})();
