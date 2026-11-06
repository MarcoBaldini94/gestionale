(function(){
"use strict";
/* ================= modello dati ================= */
const MESI=["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
const FONTI=[["lp","Libera professione","P.IVA forfettario"],["gm","Guardia medica","già tassata dall'ASL"],["ssn","Stipendio SSN","netto in busta"],["sond","Sondaggi","netto"],["spec","Borsa specializzazione","esente"],["altro","Altro",""],["intra","Intramoenia / aggiuntiva","lordo dal cedolino, già nel netto SSN"]];
const FONTI_Y=Y=>(+Y>=2027?["ssn","intra","sond","altro"]:["lp","gm","ssn","intra","sond","spec","altro"]).map(k=>FONTI.find(f=>f[0]===k));
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
  chiusure:{},fondo:{capitale:null},etfBase:null,prev:{entrate:null,spese:null,inv:null},gen:[],ricorrenti:[],fondoMov:[],scadenzario:["qa","qb","imp"].map(a=>scadRow(AUTO_LBL[a]+" "+y,y,a)),accantonato:null,sondExt:null,ced:null,movCond:["spesa","svago"],sondCanali:{},vincolato:{fineco:[]},patEstr:[]};}

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
  o.fondo={capitale:num(s.fondo&&s.fondo.capitale)};o.etfBase=num(s.etfBase);
  o.scadenzario=(Array.isArray(s.scadenzario)?s.scadenzario:d.scadenzario).filter(r=>r&&typeof r==="object").map(r=>({id:str(r.id)||uid(),
    voce:str(r.voce),anno:num(r.anno),auto:AUTO_LBL[r.auto]?r.auto:"",tipo:["qa","qb","imp","spesa"].includes(r.tipo)?r.tipo:"",ric:str(r.ric),...(/^\d{4}-\d{2}$/.test(r.rm)?{rm:r.rm}:{}),frazione:num(r.frazione)??1,meno:num(r.meno)??0,importo:num(r.importo),scadenza:str(r.scadenza),pagato:r.pagato===true,forzaNonPagato:r.forzaNonPagato===true,dataPag:str(r.dataPag)}));
  o.accantonato=num(s.accantonato);
  o.sondExt=s.sondExt&&/^\d{4}-\d{2}$/.test(s.sondExt.da)?{da:s.sondExt.da,a:/^\d{4}-\d{2}$/.test(s.sondExt.a)?s.sondExt.a:s.sondExt.da,fonte:str(s.sondExt.fonte),agg:str(s.sondExt.agg)}:null;
  o.ced=sanitizeCed(s.ced);
  o.cart=sanitizeCart(s.cart);
  o.prev={entrate:num(s.prev&&s.prev.entrate),spese:num(s.prev&&s.prev.spese),inv:num(s.prev&&s.prev.inv)};
  o.gen=(Array.isArray(s.gen)?s.gen:[]).filter(x=>typeof x==="string");
  o.fondoMov=(Array.isArray(s.fondoMov)?s.fondoMov:[]).filter(t=>t&&typeof t==="object").map(t=>({id:str(t.id)||uid(),data:/^\d{4}-\d{2}-\d{2}$/.test(t.data)?t.data:"",tipo:t.tipo==="riscatto"?"riscatto":"acquisto",importo:num(t.importo),nota:str(t.nota)}));
  o.vincolato={fineco:(Array.isArray(s.vincolato&&s.vincolato.fineco)?s.vincolato.fineco:[]).filter(r=>r&&/^\d{4}-\d{2}$/.test(r.da||"")&&num(r.importo)!=null&&r.importo>=0).map(r=>({da:r.da,importo:r.importo})).sort((a,b)=>a.da.localeCompare(b.da))};o.patEstr=(Array.isArray(s.patEstr)?s.patEstr:[]).filter(x=>/^\d{4}-\d{2}$/.test(x)).slice(-240);
  o.sondCanali={};if(s.sondCanali&&typeof s.sondCanali==="object")Object.entries(s.sondCanali).forEach(([k,v])=>{if(/^[a-z0-9_-]{1,48}$/.test(k)&&["banca","paypal","amazon"].includes(v))o.sondCanali[k]=v;});
  o.movCond=Array.isArray(s.movCond)?s.movCond.filter(k=>["casa","spesa","svago","viaggi","carburante","vita","straord"].includes(k)):["spesa","svago"];
  o.ricorrenti=(Array.isArray(s.ricorrenti)?s.ricorrenti:[]).filter(t=>t&&typeof t==="object").map(t=>({id:str(t.id)||uid(),voce:str(t.voce),
    mese:Math.min(12,Math.max(1,num(t.mese)??1)),importo:num(t.importo),variabile:t.variabile===true,esclusi:(Array.isArray(t.esclusi)?t.esclusi:[]).filter(y=>typeof y==="number"||/^\d{4}-\d{2}$/.test(y)),
    freq:t.freq==="m"?"m":"a",giorno:Math.min(31,Math.max(1,num(t.giorno)??1)),da:/^\d{4}-\d{2}$/.test(t.da)?t.da:""}));
  return o;
}
function load(src){const s0=(!src||typeof src!=="object")?defaults():sanitize(src.v>=3?src:migrate(src));return freezePaid(ensureYears(ensureRic(s0)));}
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
function ensureRicM(s,t){const now=new Date(),cy=now.getFullYear(),cur=`${cy}-${String(now.getMonth()+1).padStart(2,"0")}`;if(!t.da)t.da=cur;
  /* il mese di inizio si può portare indietro (es. affitto da febbraio): le righe passate risultano pagate e
     contano come spese fisse di quei mesi; limite: gennaio di due anni fa. Le righe prima di «da» si tolgono. */
  const minDa=(cy-2)+"-01";if(t.da<minDa)t.da=minDa;
  s.scadenzario=s.scadenzario.filter(r=>r.ric!==t.id||!r.rm||r.rm>=t.da);
  let y=+t.da.slice(0,4),m=+t.da.slice(5);
  for(;y<=cy+1;m++){if(m>12){m=1;y++;if(y>cy+1)break;}const mm=String(m).padStart(2,"0"),ym=`${y}-${mm}`;if(t.esclusi.includes(ym))continue;
    const dd=String(Math.min(t.giorno,new Date(y,m,0).getDate())).padStart(2,"0"),sc=`${ym}-${dd}`;
    let r=s.scadenzario.find(x=>x.ric===t.id&&x.anno===y&&(x.rm===ym));
    if(!r){r={id:`${t.id}-${ym}`,voce:t.voce,anno:y,auto:"",tipo:"spesa",ric:t.id,rm:ym,frazione:1,meno:0,importo:null,scadenza:sc,pagato:false,forzaNonPagato:false,dataPag:""};s.scadenzario.push(r);}
    else if(!r.pagato&&(ym>=cur||!(r.scadenza&&r.scadenza<=TODAY))){r.voce=t.voce;r.scadenza=sc;}}}
function ensureRic(s){if(!s.ricorrenti)s.ricorrenti=[];const cy=new Date().getFullYear();
  s.ricorrenti.forEach(t=>{if(t.freq==="m"){s.scadenzario=s.scadenzario.filter(r=>r.ric!==t.id||r.rm||paidOf(r));ensureRicM(s,t);return;}
    s.scadenzario=s.scadenzario.filter(r=>r.ric!==t.id||!r.rm||paidOf(r));
    for(let y=cy;y<=cy+2;y++){if(t.esclusi.includes(y))continue;
    const mm=String(t.mese).padStart(2,"0"),dd=new Date(y,t.mese,0).getDate(),sc=`${y}-${mm}-${dd}`;
    let r=s.scadenzario.find(x=>x.ric===t.id&&x.anno===y&&!x.rm);
    if(!r){r={id:`${t.id}-${y}`,voce:t.voce,anno:y,auto:"",tipo:"spesa",ric:t.id,frazione:1,meno:0,importo:null,scadenza:sc,pagato:false,forzaNonPagato:false,dataPag:""};s.scadenzario.push(r);}
    else if(!r.pagato&&!(r.scadenza&&r.scadenza<=TODAY)){r.voce=t.voce;r.scadenza=sc;}}});
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
const paidOf=r=>r.forzaNonPagato?false:(r.pagato||(!!r.scadenza&&SD(r)<=TODAY));
const autoPaid=r=>!r.pagato&&!r.forzaNonPagato&&!!r.scadenza&&SD(r)<=TODAY;
const tipoOf=r=>(r.auto&&r.auto!=="enpam")?r.auto:r.tipo;
const scadGroup=r=>(/^\d{4}/.test(r.scadenza)?SD(r).slice(0,4):(r.anno!=null?String(r.anno):"senza-data"));
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
    o.varAnno=o.lastD!=null&&prevClose!=null?o.lastD-prevClose:null;o.rendY=o.Rend.some(v=>v!=null)?sum(o.Rend):null;o.rendYF=o.RF.some(v=>v!=null)?sum(o.RF):null;o.rendYE=o.RE.some(v=>v!=null)?sum(o.RE):null;
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
  const svOf=Y=>{const o=R.patr[Y],p=s.patrimonio[Y],sv={ent:[],risp:[],tasso:[],tasse:[],fisse:[],spese:[],inv:[],acc:[],rn:[],spT:[],aff:[]},T=R.anni[Y];
   MESI.forEach((_,m)=>{const pref=`${Y}-${pad(m)}`;
    const ent=sum(s.registro.filter(r=>r.data.startsWith(pref)&&IN_TOT(r.fonte)).map(r=>r.importo));
    const tas=sum(s.scadenzario.map((r,i)=>isF(r)&&paidOf(r)&&(SD(r)||r.dataPag||"").startsWith(pref)?rows[i].imp:0));
    const fis=sum(s.scadenzario.map((r,i)=>!isF(r)&&paidOf(r)&&SD(r).startsWith(pref)?rows[i].imp:0));
    const aff=sum(s.scadenzario.map((r,i)=>!isF(r)&&isAff(r)&&paidOf(r)&&SD(r).startsWith(pref)?rows[i].imp:0));
    const prevD=m===0?o.prevClose:o.D[m-1];const ok=o.D[m]>0&&prevD>0;
    const inv=n(p[m].vEtf)+fondoFlow(s,Y,m),risp=ok?o.D[m]-prevD+inv:null;
    sv.ent.push(ok?ent:null);sv.inv.push(ok?inv:null);sv.risp.push(risp);sv.tasse.push(ok?tas:null);sv.fisse.push(ok?fis:null);sv.aff.push(ok?aff:null);
    sv.spese.push(ok?ent-risp-tas-fis:null);sv.tasso.push(ok&&ent>0?risp/ent:null);
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
  sv.ytd={sp:sum(okM.map(i=>sv.ent[i]-sv.risp[i])),inv:sum(okM.map(i=>sv.inv[i])),sur:sum(okM.map(i=>sv.risp[i]-sv.inv[i])),acc:sum(okM.map(i=>sv.acc[i])),rn:sum(okM.map(i=>sv.rn[i])),ent:sum(okM.map(i=>sv.ent[i])),risp:sum(okM.map(i=>sv.risp[i])),spese:sum(okM.map(i=>sv.spese[i])),tasse:sum(okM.map(i=>sv.tasse[i])),fisse:sum(okM.map(i=>sv.fisse[i])),aff:sum(okM.map(i=>sv.aff[i]))};sv.ytd.tasso=sv.ytd.ent>0?sv.ytd.risp/sv.ytd.ent:null;
  {const ym=q=>`${q.Y}-${pad(q.i)}`,q=pool[pool.length-1];if(sv.last&&q)sv.last.ym=ym(q);}
  R.svAll={};R.ytdAll={};Object.keys(R.patr).filter(isY).forEach(Y=>{let x=null;try{x=+Y===PY?sv:svOf(+Y);}catch(_){x=null;}if(!x)return;R.svAll[Y]=x;
   const ok=x.risp.map((v,i)=>v!=null?i:-1).filter(i=>i>=0),S_=k=>sum(ok.map(i=>x[k][i]));
   R.ytdAll[Y]={n:ok.length,lbl:ok.length?`${MESI[ok[0]].slice(0,3).toLowerCase()}–${MESI[ok[ok.length-1]].slice(0,3).toLowerCase()} ${Y}`:"",ent:S_("ent"),sp:sum(ok.map(i=>x.ent[i]-x.risp[i])),inv:S_("inv"),sur:sum(ok.map(i=>x.risp[i]-x.inv[i])),tasse:S_("tasse"),fisse:S_("fisse"),risp:S_("risp"),aff:S_("aff")};});
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

const ICO={
 vault:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10 12 4l9 6"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8"/><path d="M3 20h18"/></svg>',
 cash:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v5M18 9.5v5"/></svg>',
 receipt:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/></svg>',
 trend:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>'};

/* ================= schede ================= */
const TABS=[["home","Home"],["dashboard","Finanze"],["patrimonio","Patrimonio"],["scadenzario","Scadenzario"],["entrate","Entrate"],["tasse","Tasse"],["risparmio","Andamento"],["mese","Resoconto mensile"],["parametri","Parametri"],
 ["lavoro","Lavoro"],["presenze","Presenze e ferie"],["lv-pag","Guardie e aggiuntiva"],["cedolini","Cedolini"],
 ["sondaggi","Sondaggi"],["collegamenti","Collegamenti e backup"]];
/* tre sezioni (Lavoro, Finanze, Sondaggi), ognuna con la sua dashboard; ogni scheda torna alla dashboard della sua sezione */
const DASHES=["dashboard","lavoro","sondaggi"];
const PARENT={dashboard:"home",lavoro:"home",sondaggi:"home",collegamenti:"home",presenze:"lavoro","lv-pag":"lavoro",cedolini:"lavoro"};
const parentOf=t=>PARENT[t]||(t==="home"?null:"dashboard");
const V={};

V.dashboard=()=>{const PY=R.PY,TY=R.TY,c=`anni.${TY}`,pv=`anni.${TY-1}`;return `
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
function scadLine(r,i,dash){const rows0=R.deb.rows;if(EDIT===r.id&&!dash)return scadEditRow(r,i);const p=paidOf(r),[ck,cl]=catOf(r),e=SD(r),d=e?e.split("-"):null,mv=e&&e!==r.scadenza;
  return `<div class="mrow sr ${p?"paid":""}" data-ym="${e?e.slice(0,7):""}">
  <span class="md">${d?+d[2]:"—"}</span>
  <span class="mv"><span class="dot c-${ck}" title="${cl}"></span><span class="vt">${esc(r.voce||"(senza descrizione)")}</span>${mv?`<span class="slip" title="Scadenza nominale ${dIt(r.scadenza)}: cade di sabato, domenica o festivo">${e>r.scadenza?"slitta":"anticipata"} dal ${dIt(r.scadenza)}</span>`:""}</span>
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
 const rifOpts=[`<option value=":">Altro</option>`,...ys.flatMap(y=>[["qa","Quota A"],["qb","Quota B"],["imp","Imposta sostitutiva"]].map(([t,l])=>`<option value="${t}:${y}">${l} ${y}</option>`))].join("");
 const MS=["gen","feb","mar","apr","mag","giu","lug","ago","set","ott","nov","dic"];
 const rows0=R.deb.rows;
 const idxs=(groups[SY]||[]).sort((a,b)=>(SD(S.scadenzario[a])||"9").localeCompare(SD(S.scadenzario[b])||"9"));
 const mOf=i=>{const e=SD(S.scadenzario[i]);return e?+e.slice(5,7)-1:-1;};
 const nowYM=TODAY.slice(0,7),isY=/^\d{4}$/.test(SY);
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
  <div class="tbl-wrap flat"><table class="ric"><thead><tr><th>Voce</th><th>Ogni</th><th>Quando</th><th>Importo</th><th>Varia</th><th></th></tr></thead><tbody>
  ${S.ricorrenti.map((t,i)=>`<tr><td>${inpT(`ricorrenti.${i}.voce`,"text","es. Bollo auto")}</td>
   <td><select class="in sel ricfreq" id="${idOf("ricorrenti."+i+".freq")}" data-i="ricorrenti.${i}.freq" data-k="sel" aria-label="Frequenza"><option value="a">anno</option><option value="m">mese</option></select></td>
   <td>${t.freq==="m"?`<select class="in sel mesesel" id="${idOf("ricorrenti."+i+".giorno")}" data-i="ricorrenti.${i}.giorno" data-k="mese" aria-label="Giorno del mese">${Array.from({length:31},(_,k)=>`<option value="${k+1}">il ${k+1}</option>`).join("")}</select><label class="ricda">dal <input type="month" class="in ric-da" data-idx="${i}" value="${t.da||""}" aria-label="Primo mese"></label>`
     :`<select class="in sel mesesel" id="${idOf("ricorrenti."+i+".mese")}" data-i="ricorrenti.${i}.mese" data-k="mese" aria-label="Mese">${MESI.map((m,k)=>`<option value="${k+1}">${m}</option>`).join("")}</select>`}</td>
   <td class="imp">${inp(`ricorrenti.${i}.importo`)}</td><td class="c">${inpT(`ricorrenti.${i}.variabile`,"checkbox")}</td>
   <td class="c"><button class="icon-btn" data-act="del-ric" data-idx="${i}" aria-label="Elimina spesa fissa" ${READONLY?"disabled":""}>×</button></td></tr>`).join("")||`<tr><td colspan="6" class="muted">Nessuna spesa fissa.</td></tr>`}
  </tbody></table></div>
  <div class="actions"><button class="btn" data-act="add-ric" ${READONLY?"disabled":""}>+ Aggiungi spesa fissa</button></div>
  <p class="note">Spese fisse annuali: compaiono nello Scadenzario per quest'anno e i due successivi, all'ultimo giorno del mese scelto. Spese fisse mensili (es. affitto): una voce al mese, il giorno scelto, dal mese in cui le aggiungi fino a dicembre dell'anno prossimo (si allunga da sola). Tutte risultano pagate da sole alla scadenza; per saltare un mese elimina quella riga nello Scadenzario. Le spese con importo variabile (es. assicurazioni) si correggono anno per anno direttamente nella riga dello Scadenzario. Le spese fisse non sono debiti fiscali: non riducono il patrimonio netto, ma entrano nella previsione di cassa.</p>
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
const spSeg=x=>{const a=Math.max(n(x.aff),0);return [["Risparmio netto",x.rn,"c-risp"],["Da accantonare per tasse",x.acc,"c-tasse"],...(a>0?[["Affitto",a,"c-aff"],["Altre spese (vita + fisse)",n(x.spT)-a,"c-spese"]]:[["Spese (vita + fisse)",x.spT,"c-spese"]])];};
/* entrate e uscite dell'anno: speso (affitto a parte), investito, surplus */
const euSeg=x=>{const a=Math.max(n(x.aff),0);return [...(a>0?[["Affitto",a,"c-aff"],["Altro speso",n(x.sp)-a,"c-spese"]]:[["Speso",x.sp,"c-spese"]]),["Investito",x.inv,"c-inv"],["Surplus di liquidità",x.sur,"c-liq"]];};
function dashPatCard(Y){const P=R.patr[Y]||{},L=P.last;
 if(!(L>=0))return `<div class="box pcard"><h3>Composizione del patrimonio</h3><p class="muted">Nessun mese compilato nel ${Y}.</p></div>`;
 const g=k=>+(getP(S,`patrimonio.${Y}.${L}.${k}`)||0),lq=g("fineco")+g("revolut"),iv=g("fondo")+g("etf");
 const tx=Math.min(Math.max(+(R.dash&&R.dash.tasseAll)||0,0),Math.max(lq,0));
 const main=[["Liquidità libera",lq-tx,"c-liq"],["Liquidità per tasse future",tx,"taxh"],["Investimenti",iv,"c-inv"]].filter(x=>x[2]!=="taxh"||x[1]>0),totM=sum(main.map(x=>Math.max(x[1],0)));
 const liq=[["Fineco",g("fineco"),"c-fin"],["Revolut",g("revolut"),"c-rev"]],inv=[["Fondo Fineco",g("fondo"),"c-fondo"],["ETF Revolut",g("etf"),"c-etf"]];
 const rend=(v,p)=>`${out(v,"sign")} <small class="muted">${out(p,"pctS")}</small>`;
 const o=`patr.${Y}`;
 const rsp=(x,ttl,sub,mm)=>{if(!x||x.ent==null)return "";const ent=x.ent,sg=spSeg(x);
  return mm?`<a class="psub" href="#mese" data-act="go" data-tab="mese" data-mm="${mm}" title="Apri il resoconto mensile"><h4>${ttl} <small>${sub}</small></h4>`+rspIn(x,ttl):`<a class="psub" href="#risparmio" data-act="go" data-tab="risparmio" title="Apri Andamento: patrimonio e risparmio mese per mese"><h4>${ttl} <small>${sub}</small></h4>`+rspIn(x,ttl);};
 const rspIn=(x,ttl)=>{const ent=x.ent,sg=spSeg(x);return `
    <div class="psub-in">${donut(sg.map(([l,v,c])=>[l,Math.max(v||0,0),c]),112,15,ttl,1,ent,"entrate")}<div><ul class="pleg">${sg.map(([l,v,c])=>li(c,l,v||0,ent)).join("")}</ul></div></div></a>`;};
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
   ${rsp(R.sv&&R.sv.ya,"Uso delle entrate · media mensile",R.sv&&R.sv.yaLbl||"")}
   ${(()=>{const x=R.sv&&R.sv.ytd;if(!x||!x.ent)return "";const sg=euSeg(x);
    return `<a class="psub" href="#entrate" data-act="go" data-tab="entrate" data-uy="${Y}" title="Apri Entrate e uscite ${Y}"><h4>Entrate e uscite ${Y} <small>${R.sv.yaLbl||""}</small></h4>
    <div class="psub-in">${donut(sg.map(([l,v,c])=>[l,Math.max(v||0,0),c]),112,15,"Entrate e uscite "+Y,1,x.ent,"entrate")}<div><ul class="pleg">${sg.map(([l,v,c])=>li(c,l,v||0,x.ent)).join("")}</ul>
    <dl class="kv">${kv("di cui tasse pagate",`<span class="nt-tasse">${out("sv.ytd.tasse")}</span>`)}${kv("di cui spese fisse",`<span class="nt-spese">${out("sv.ytd.fisse")}</span>`)}${x.aff>0?kv("&nbsp;&nbsp;di cui affitto",`<span class="nt-aff">${fmt(x.aff)}</span>`):""}</dl></div></div></a>`;})()}
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
 const P=R.patr[Y]||{},lastLbl=P.last>=0?MESI[P.last].toLowerCase():"—",isPY=Y===R.PY;
 const tile=(cls,l,v,sub)=>`<div class="tile ${cls}"><span class="l">${l}</span><span class="v">${v}</span>${sub?`<span class="s">${sub}</span>`:""}</div>`;
 const cy=[...new Set([...yearsOf(S.chiusure),Y-1])].sort((a,b)=>a-b);
 const tabs=[["liq","Liquidità"],["inv","Investimenti"],["rie","Riepilogo"]];
 const body={
  liq:()=>`<div class="box"><h3>Saldi dei conti mese per mese</h3><p class="note">Saldo all'ultimo giorno del mese. Dai mesi con estratto conto i saldi si riempiono da soli («estratto»): Revolut = conto + deposito; Fineco = conto + conto deposito vincolato qui sotto.</p>
   <details class="more" ${(S.vincolato.fineco||[]).length?"":"open"}><summary>Conto deposito vincolato Fineco${(S.vincolato.fineco||[]).length?" · ora "+fmt(vincAt("9999-12")):""}</summary>
    <p class="note">Non compare nell'estratto: va sommato al conto. Indica l'importo e da quale mese vale; se cambia (rinnovo con importo diverso, scadenza senza rinnovo = 0) aggiungi una variazione: i mesi precedenti non cambiano.</p>
    <div class="vinc">${(S.vincolato.fineco||[]).map((r,i)=>`<div class="vinc-r"><span>dal ${MESE_L(r.da).toLowerCase()}</span><b>${fmt(r.importo)}</b><button class="icon-btn" data-act="vinc-del" data-vi="${i}" aria-label="Togli" ${READONLY?"disabled":""}>×</button></div>`).join("")}
    ${READONLY?"":`<div class="vinc-f"><input class="in" type="month" id="vinc-da" value="${(S.patEstr||[])[0]||new Date().toLocaleDateString("sv-SE").slice(0,7)}" aria-label="Dal mese"><input class="in" id="vinc-v" inputmode="decimal" placeholder="Importo €" aria-label="Importo"><button class="btn sm" data-act="vinc-add">Aggiungi</button></div>`}</div></details>
   ${!(S.vincolato.fineco||[]).length&&(S.patEstr||[]).length?`<p class="note neg">Indica il vincolato (anche 0) per far riempire Fineco dagli estratti.</p>`:""}
   ${tbl(["Fineco","Revolut","Totale","Variazione"],i=>[estCell(Y,i,"fineco",B(i)+".fineco"),estCell(Y,i,"revolut",B(i)+".revolut"),out(`${o}.D.${i}`,"eur","b zd"),out(`${o}.E.${i}`,"sign","zd")])}</div>
  <div class="box c-good"><h3>Valori di fine anno</h3><dl class="kv">
   ${cy.map(y=>kv(`Fine ${y}`+(R.chiusure[y]&&R.chiusure[y].d!=null?` <small class="${R.chiusure[y].d>=0?"pos":"neg"}">${fmt(R.chiusure[y].d,"sign")} sull'anno prima</small>`:""),inp(`chiusure.${y}`))).join("")}</dl>
   <p class="note">Servono come punto di partenza per la variazione annuale. Se lasci vuoto il valore di fine anno precedente, viene usato il liquido di dicembre della tabella di quell'anno.</p></div>`,
  inv:()=>`<div class="grid">
  <div class="box c-fondo"><h3>Fondo Fineco</h3>
   <div class="ibig"><span>Guadagno / perdita</span><b>${out("dash.plusF","sign")}</b><em>${out("dash.plusFp","pctS")}</em></div>
   <dl class="kv">${kv("Valore attuale",out("dash.fondo"))}${kv("Capitale investito <small>acquisto una tantum</small>",inp("fondo.capitale"))}
   ${kv(`Rendimento ${Y}`,`${out("dash.rendYF","sign")} <small class="muted">${out("dash.rendYFp","pctS")}</small>`)}</dl>
   <details class="more"><summary>Acquisti e riscatti (${S.fondoMov.length})</summary>
   <div class="tbl-wrap flat"><table class="fm"><tbody>${S.fondoMov.map((t,i)=>`<tr><td>${inpT(`fondoMov.${i}.data`,"date")}</td><td><select class="in sel" id="${idOf("fondoMov."+i+".tipo")}" data-i="fondoMov.${i}.tipo" data-k="sel"><option value="acquisto">Acquisto</option><option value="riscatto">Riscatto</option></select></td><td>${inp(`fondoMov.${i}.importo`)}</td><td class="c"><button class="icon-btn" data-act="del-fm" data-idx="${i}" aria-label="Elimina" ${READONLY?"disabled":""}>×</button></td></tr>`).join("")||`<tr><td class="muted">Nessun movimento.</td></tr>`}</tbody></table></div>
   <div class="actions"><button class="btn ghost" data-act="add-fm" ${READONLY?"disabled":""}>+ Aggiungi acquisto o riscatto</button></div>
   <p class="note">Servono a non scambiare per guadagno i soldi che entrano o escono dal fondo (maggio 2026: riscatto del vecchio, acquisto del nuovo).</p></details>
   <p class="note">Regime amministrato: le tasse le trattiene Fineco alla vendita.</p></div>
  <div class="box c-etf"><h3>ETF Revolut (PAC)</h3>
   <div class="ibig"><span>Guadagno / perdita</span><b>${out("dash.plusE","sign")}</b><em>${out("dash.plusEp","pctS")}</em></div>
   <dl class="kv">${kv("Valore attuale",out("dash.etf"))}${kv("Totale versato <small>somma della colonna ETF · versato</small>",out("dash.versE"))}
   ${kv(`Rendimento ${Y}`,`${out("dash.rendYE","sign")} <small class="muted">${out("dash.rendYEp","pctS")}</small>`)}
   ${kv("Versato prima del primo anno in tabella <small>0 se il PAC parte in tabella</small>",inp("etfBase"))}</dl>
   <p class="note">Regime dichiarativo: quadro RW e IVAFE; plusvalenze nel quadro RM (26%), minusvalenze nel quadro RT.</p></div>
  </div>
  <div class="box"><h3>Valori mese per mese</h3><p class="note">Valore a fine mese di fondo ed ETF, e quanto hai versato nell'ETF nel mese. Il rendimento è la variazione di valore meno i soldi aggiunti.</p>
   ${tbl(["Fondo Fineco · valore","ETF · valore","ETF · versato","Totale","Rendimento"],i=>[inp(B(i)+".fondo"),inp(B(i)+".etf"),inp(B(i)+".vEtf"),out(`${o}.H.${i}`,"eur","b"),out(`${o}.Rend.${i}`,"sign")],
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
V.risparmio=()=>{const PY=R.PY;return `<section class="sheet">
 <div class="sheet-h"><h2>Andamento ${PY}</h2><p>Come cresce il patrimonio mese per mese e quanto metti da parte: variazione della liquidità più i versamenti negli investimenti, con le tasse che maturano nel mese.</p></div>
  <div class="box chart"><h3><a class="hlink" href="#patrimonio" data-act="go" data-tab="patrimonio" data-pt="liq">Patrimonio mese per mese · ${PY} <span aria-hidden="true">›</span></a></h3><div id="chart"></div>
   <div class="legend"><span><i style="background:var(--liq)"></i>Liquidità</span><span><i style="background:var(--inv)"></i>Investimenti</span><span><i style="background:var(--good);height:3px"></i>Patrimonio netto (dopo le tasse)</span></div></div>
  <div class="box" id="es-box"><h3>Entrate e spese mese per mese · ${PY}</h3>
   <div id="eschart"></div>
   <div class="legend"><span><i style="background:var(--c-ent)"></i>entrate</span><span><i style="background:var(--c-spese)"></i>spese di vita</span>${R.sv&&R.sv.ytd&&R.sv.ytd.aff>0?`<span><i style="background:var(--c-aff)"></i>affitto</span>`:""}<span><i style="background:var(--c-fisse)"></i>${R.sv&&R.sv.ytd&&R.sv.ytd.aff>0?"altre spese fisse":"spese fisse"}</span><span><i style="background:var(--c-tasse)"></i>tasse pagate</span></div>
   <p class="note">Per ogni mese: a sinistra le entrate registrate, a destra le uscite (spese di vita + spese fisse + tasse pagate). La differenza è il risparmio del mese, mostrato nel grafico sotto. Tocca una barra per i valori. Compaiono solo i mesi con i saldi di inizio e fine mese in Patrimonio.</p></div>
  <div class="box c-good" id="sv-box"><h3>Risparmio mese per mese · ${PY}</h3>
   <div id="svchart"></div>
   <div class="legend"><span><i style="background:var(--good)"></i>risparmio del mese</span><span><i style="background:var(--spese)"></i>mese in perdita</span><span><i style="background:var(--muted);height:2px"></i>media ${R.sv&&R.sv.mesi||""}</span></div>
   ${svTable()}
   <p class="note">Risparmio = variazione della liquidità + versamenti negli investimenti. Altre spese (di vita) = entrate − risparmio − tasse − spese fisse del mese. Le entrate sono quelle registrate (libera professione al lordo, stipendio e sondaggi al netto): un mese con entrate non registrate o rimborsi fa sembrare le spese più basse. Leggi la media, non il singolo mese. Da accantonare per tasse = 1/12 della Quota A + Quota B e imposta sostitutiva maturate sulle entrate del mese; risparmio netto = risparmio + tasse pagate nel mese − tasse da accantonare.</p>
  </div>
</section>`;};

/* ================= resoconto mensile ================= */
/* riepilogo di un mese (v31): entrate, uscite, investito e guadagno. Fonte: resoconto (saldi in Patrimonio + entrate
   registrate: guadagno = variazione liquidità + investito) se il mese c'è, altrimenti i movimenti degli estratti conto. */
function mesSum(ym){const Y=ym.slice(0,4),m=+ym.slice(5)-1,x=R.svAll&&R.svAll[Y];
 if(x&&x.ent[m]!=null&&x.risp[m]!=null){const ent=x.ent[m],inv=x.inv[m]||0,guad=x.risp[m];return{ym,src:"res",ent,inv,guad,usc:ent-guad,liq:guad-inv};}
 if(movMesi().includes(ym)){const N=movNetto(ym),inv=-(N.o.invest||0),usc=-(N.tu+N.R),ent=N.te,guad=ent-usc;return{ym,src:"mov",ent,inv,guad,usc,liq:guad-inv};}
 return null;}
const mesiSum=()=>[...new Set([...monthsAvail(),...movMesi()])].sort();
const colChart=(q,h)=>{const inv=Math.max(q.inv,0),top=Math.max(q.ent,q.usc+inv,1),p=v=>(Math.max(v,0)/top*100).toFixed(2)+"%",g=q.liq,
 seg=(cls,v,t,lab)=>v>0.005?`<i class="${cls}" style="height:${p(v)}" title="${t}: ${fmt(v)}">${lab&&v/top>.12?`<b>${lab}</b>`:""}</i>`:"";
 return `<div class="mcol" style="height:${h}px" role="img" aria-label="Entrate ${fmt(q.ent)}; uscite ${fmt(q.usc)}; investito ${fmt(inv)}; ${g>=0?"guadagno":"perdita"} ${fmt(Math.abs(g))}">
  <div class="mc-c"><div class="mc-b">${seg("mc-ent",q.ent,"Entrate")}${g<0?seg("mc-loss",-g,"Perdita del mese",fmt(g,"sign").replace(/,\d\d(?=\s|$)/,"")):""}</div><span>Entrate</span></div>
  <div class="mc-c"><div class="mc-b">${seg("mc-usc",q.usc,"Uscite")}${seg("mc-inv",inv,"Investito")}${g>0?seg("mc-gain",g,"Guadagno del mese",fmt(g,"sign").replace(/,\d\d(?=\s|$)/,"")):""}</div><span>Uscite + investito</span></div></div>`;};
const colLeg=q=>{const inv=Math.max(q.inv,0),g=q.liq;return `<ul class="pleg">${li("c-ent","Entrate",q.ent,q.ent)}${li("c-spese","Uscite",q.usc,q.ent)}${li("c-inv","Investito",inv,q.ent)}${g>=0?li("c-risp","Guadagno del mese",g,q.ent).replace("background:var(--c-risp)","background:color-mix(in srgb,var(--c-risp) 32%,transparent);box-shadow:inset 0 2px 0 var(--c-risp)"):li("neg","Perdita del mese",-g,q.ent).replace("background:var(--neg)","background:repeating-linear-gradient(45deg,var(--neg) 0 3px,var(--neg-soft) 3px 6px)")}</ul>`;};
/* chip della dashboard: unico collegamento al Resoconto mensile */
function riepPsub(){const L=mesiSum();let q=null;for(let i=L.length-1;i>=0&&!q;i--)q=mesSum(L[i]);if(!q)return "";const mn=MESE_L(q.ym).toLowerCase();
 return `<a class="psub" href="#mese" data-act="go" data-tab="mese" data-mm="${q.ym}" title="Apri il resoconto mensile"><h4>Riepilogo del mese <small>${mn}</small></h4><span hidden data-psum>${fmt(Math.round(q.guad),"sign").replace(/,\d\d(?=\s|$)/,"")}</span>
  <div class="psub-in">${colChart(q,112)}<div><dl class="kv">${kv("Guadagno complessivo <small>entrate − uscite</small>",`<span class="${q.guad<0?"neg":"pos"}">${fmt(q.guad,"sign")}</span>`)}${kv("Quota investita",`<span class="nt-inv">${fmt(q.inv)}</span>`)}${kv("Risparmio liquido <small>rimasto sui conti</small>",`<span class="${q.liq<0?"neg":"pos"}">${fmt(q.liq,"sign")}</span>`,"strong")}</dl></div></div></a>`;}

/* grafico a colonne mese per mese (v32): scala comune con asse y, mese scelto al centro, mese prima e dopo ai lati;
   cambiando mese la striscia scorre (MCH_AT = mese al centro nell'ultimo render). */
let MCH_AT=null;
const niceStep=v=>{const p=10**Math.floor(Math.log10(v)),r=v/p;return (r<=1?1:r<=2?2:r<=2.5?2.5:r<=5?5:10)*p;};
const fInt=v=>new Intl.NumberFormat("it-IT",{maximumFractionDigits:0,useGrouping:"always"}).format(v);
function mchHTML(L,k){
 const Q=L.map(mesSum),mx=Math.max(1,...Q.filter(Boolean).map(q=>Math.max(q.ent,Math.max(q.usc,0)+Math.max(q.inv,0))));
 const st=niceStep(mx/4),top=Math.ceil(mx/st-1e-9)*st,y=v=>(Math.max(v,0)/top*100).toFixed(3)+"%";
 const ticks=Array.from({length:Math.round(top/st)+1},(_,i)=>i*st);
 const seg=(c,v,t)=>v>0.005?`<i class="${c}" style="height:${y(v)}" title="${t}: ${fmt(v)}"></i>`:"";
 const slot=(q,ym,i)=>{const sel=i===k,m=MESI[+ym.slice(5)-1];
  if(!q)return `<span class="mch-m${sel?" sel":""}"><span class="mch-p"></span><span class="mch-l">${m.slice(0,3)} <small>${ym.slice(0,4)}</small></span><span class="mch-g">—</span></span>`;
  const inv=Math.max(q.inv,0),usc=Math.max(q.usc,0),g=q.liq;
  const tag=sel?"span":"button",att=sel?`aria-current="true"`:`data-act="mm" data-mm="${ym}" aria-label="Vai a ${m.toLowerCase()} ${ym.slice(0,4)}"`;
  return `<${tag} class="mch-m${sel?" sel":""}" ${att} title="${m} ${ym.slice(0,4)} · entrate ${fmt(q.ent)} · uscite ${fmt(usc)} · investito ${fmt(inv)} · ${g>=0?"guadagno":"perdita"} ${fmt(Math.abs(g))}">
   <span class="mch-p"><span class="mch-c">${seg("mc-ent",q.ent,"Entrate")}${g<0?seg("mc-loss",-g,"Perdita del mese"):""}</span><span class="mch-c">${seg("mc-usc",usc,"Uscite")}${seg("mc-inv",inv,"Investito")}${g>0?seg("mc-gain",g,"Guadagno del mese"):""}</span></span>
   <span class="mch-l">${m.slice(0,3)} <small>${ym.slice(0,4)}</small></span><span class="mch-g ${g<0?"neg":"pos"}">${fmt(Math.round(g),"sign").replace(/,\d\d(?=\s|$)/,"")}</span></${tag}>`;};
 const to=1-k,from=MCH_AT&&L.includes(MCH_AT)?1-L.indexOf(MCH_AT):to;MCH_AT=L[k];
 const tr=d=>`translateX(calc(${d} * 100% / 3))`;
 if(from!==to)requestAnimationFrame(()=>{const t=document.querySelector("#view .mch-track");if(t){void t.offsetWidth;t.style.transform=tr(to);}});
 const q=Q[k];
 return `<div class="mch" role="img" aria-label="${q?`${MESE_L(L[k])}: entrate ${fmt(q.ent)}, uscite ${fmt(q.usc)}, investito ${fmt(Math.max(q.inv,0))}, ${q.liq>=0?"guadagno":"perdita"} ${fmt(Math.abs(q.liq))}`:"Entrate e uscite per mese"}">
  <div class="mch-y" aria-hidden="true">${ticks.map((t,i)=>`<span style="bottom:${y(t)}">${fInt(t)}${i===ticks.length-1?" €":""}</span>`).join("")}</div>
  <div class="mch-vp"><div class="mch-hl" aria-hidden="true"></div><div class="mch-grid" aria-hidden="true">${ticks.map(t=>`<i style="bottom:${y(t)}"${t===0?' class="z"':""}></i>`).join("")}</div>
   <div class="mch-track" style="transform:${tr(from)}">${L.map((ym,i)=>slot(Q[i],ym,i)).join("")}</div></div></div>`;}
let MM=null;
const monthsAvail=()=>Object.keys(R.svAll||{}).sort().flatMap(Y=>R.svAll[Y].ent.map((v,i)=>v!=null?`${Y}-${String(i+1).padStart(2,"0")}`:null).filter(Boolean));
V.mese=()=>{const LR=monthsAvail(),L=[...new Set([...LR,...movMesi()])].sort();
 if(!L.length)return `<section class="sheet"><div class="sheet-h"><h2>Resoconto mensile</h2></div><div class="banner">Il resoconto compare quando ci sono almeno due mesi consecutivi di saldi in <a href="#patrimonio">Patrimonio</a> e le entrate del mese in <a href="#entrate">Entrate</a>.</div></section>`;
 if(!MM||!L.includes(MM))MM=L[L.length-1];
 const k=L.indexOf(MM);
 const yrs=[...new Set(L.map(v=>v.slice(0,4)))];
 const isNeg=v=>{const z=R.svAll[v.slice(0,4)],i=+v.slice(5)-1;return z&&z.rn[i]!=null&&z.rn[i]<0;};
 const opts=yrs.map(y=>`<optgroup label="${y}">${L.filter(v=>v.startsWith(y)).map(v=>`<option value="${v}" ${v===MM?"selected":""}>${MESI[+v.slice(5)-1]} ${y}${isNeg(v)?" · in rosso":""}</option>`).join("")}</optgroup>`).join("");
 const nav=(d,lab,ar)=>{const t=L[k+d];return `<button class="mbtn" data-act="mm" data-mm="${t||""}" ${t?"":"disabled"} aria-label="${lab}${t?": "+MESI[+t.slice(5)-1].toLowerCase()+" "+t.slice(0,4):""}">${ar}</button>`;};
 const headH=`<div class="sheet-h"><h2>Resoconto mensile</h2><p>Entrate, uscite e guadagno del mese; sotto, il dettaglio dei movimenti dei conti.</p></div>`;
 const navH=`<div class="mnav" role="group" aria-label="Scegli il mese">${nav(-1,"Mese precedente","‹")}<select class="in sel mm-sel" id="mm-sel" aria-label="Mese">${opts}</select>${nav(1,"Mese successivo","›")}</div>`;

 const mp={},mb=movBody(MM,mp),hasR=LR.includes(MM),q=mesSum(MM),mn=MESE_L(MM).toLowerCase();
 let resPie="",resAltri="",negB="",nota="";
 if(hasR){const Y=MM.slice(0,4),m=+MM.slice(5)-1,x=R.svAll[Y],g=k=>x[k][m],ent=g("ent");
  const sg=spSeg({rn:g("rn"),acc:g("acc"),spT:g("spT"),aff:g("aff")}),affM=Math.max(n(g("aff")),0);
  const neg=g("rn")<0,usc=Math.max(g("spT")||0,0)+Math.max(g("acc")||0,0),def=neg?-g("rn"):0;
  const dn=neg
   ?donut([["Coperte dalle entrate",Math.max(ent,0),"c-ent"],["Prese dai risparmi",def,"negh"]],150,18,"Uscite di "+mn,1,-def,"dai risparmi",v=>fmt(Math.round(v),"sign").replace(/,\d\d(?=\s|$)/,"")).replace('class="pc1" style="','class="pc1" style="fill:var(--neg);')
   :donut(sg.map(([l,v,c])=>[l,Math.max(v||0,0),c]),150,18,"Uso delle entrate · "+mn,1,ent,"entrate").replace('class="pc1" style="','class="pc1" style="fill:var(--t-ent);');
  const leg=neg?`${affM>0?li("c-aff","Affitto",affM,usc)+li("c-spese","Altre spese (vita + fisse)",(g("spT")||0)-affM,usc):li("c-spese","Spese (vita + fisse)",g("spT")||0,usc)}${li("c-tasse","Da accantonare per tasse",g("acc")||0,usc)}${li("neg","Non coperto dalle entrate",def,usc)}`:sg.map(([l,v,c])=>li(c,l,v||0,ent)).join("");
  resPie=`<div class="box mvpie${neg?" neg-box":""}"><h3>${neg?"Uscite":"Uso delle entrate"} <small>${mn}</small></h3><div class="mvpie-in">${dn}<ul class="pleg">${leg}</ul></div></div>`;
  negB=neg?`<div class="banner neg-b"><b>Mese in rosso</b>: le uscite (${fmt(usc)}) hanno superato le entrate (${fmt(ent)}) di <b>${fmt(def)}</b>, presi dai risparmi.${g("risp")<0?` La liquidità è scesa di ${fmt(-g("risp"))}.`:` La liquidità non è scesa (${fmt(g("risp"),"sign")}) solo perché le tasse da accantonare non sono ancora state pagate.`}</div>`:"";
  const ya=R.ytdAll[Y],avg=ya&&ya.n?ya.ent/ya.n:null;
  resAltri=kv("Tasso di risparmio",fmt(g("tasso"),"pct1"))+kv("Tasse pagate nel mese",`<span class="nt-tasse">${fmt(g("tasse"))}</span>`)+kv("Spese fisse del mese",`<span class="nt-spese">${fmt(g("fisse"))}</span>`)+kv("Altre spese (di vita) <small>per differenza</small>",`<span class="nt-spese">${fmt(g("spese"))}</span>`)+(avg!=null?kv(`Media delle entrate <small>${ya.lbl}</small>`,fmt(avg)):"");}
 const qG=q?kv("Guadagno complessivo <small>guadagno del mese + investito</small>",`<span class="${q.guad<0?"neg":"pos"}">${fmt(q.guad,"sign")}</span>`,"strong"):"";
 const top=q?`<div class="box mcol-box"><h3>Entrate e uscite <small>${mn}${q.src==="mov"?" · dagli estratti conto":""}</small></h3><div class="mcol-in">${mchHTML(L,k)}${colLeg(q)}</div>
  <p class="note">${q.src==="res"?"Entrate registrate; uscite = entrate − risparmio (variazione della liquidità + investito).":"Entrate e uscite nette dagli estratti conto (manca il resoconto: servono i saldi in Patrimonio)."} La fascia verde sopra le uscite è il guadagno del mese rimasto sui conti (in rosso tratteggiato, sopra le entrate, la perdita). Al centro il mese scelto; tocca un mese accanto o scorri per cambiarlo. Stessa scala per tutti i mesi.</p></div>`:"";
 const pies=[resPie,...(mp.pies||[])].filter(Boolean);
 const altri=qG+resAltri+(mp.altri||"")+(q&&q.src==="res"&&mp.netto?mp.netto:"");
 return `<section class="sheet">
 ${headH}
 ${navH}
 ${negB}
 ${top}
 ${pies.length?`<div class="grid mvpies">${pies.join("")}</div>`:""}
 ${altri?`<div class="box"><h3>Altri dati del mese</h3><dl class="kv">${altri}</dl>${hasR?`<p class="note">Spese «di vita» del resoconto = entrate − risparmio − tasse − spese fisse: un'entrata non registrata o un rimborso le fanno sembrare più basse.</p>`:""}</div>`:""}
 <div class="sheet-h mv-sh"><h2>Dai conti</h2><p>Movimenti degli estratti conto Fineco e Revolut letti dal PC fisso: restano su questo dispositivo e non entrano nei backup.</p></div>
 ${mb}
</section>`;};
/* entrate e uscite dell'anno: grafico come in Dashboard, per l'anno scelto */
const euBox=Y=>{const x=R.ytdAll&&R.ytdAll[Y];
 if(!x||!x.n)return `<div class="box" id="eu-box"><h3>Entrate e uscite ${Y}</h3><p class="muted">Per calcolare le uscite del ${Y} servono i saldi mensili in Patrimonio (almeno due mesi consecutivi).</p></div>`;
 const sg=euSeg(x);
 const dn=donut(sg.map(([l,v,c])=>[l,Math.max(v||0,0),c]),170,26,"Entrate e uscite "+Y,1,x.ent,"entrate").replace('class="pc1" style="','class="pc1" style="fill:var(--t-ent);');
 return `<div class="box" id="eu-box"><h3>Entrate e uscite ${Y} <small>${x.lbl} · ${x.n} ${x.n===1?"mese":"mesi"} con saldi</small></h3>
  <div class="ppie-in">${dn}<div class="pside"><ul class="pleg">${sg.map(([l,v,c])=>li(c,l,v||0,x.ent)).join("")}</ul>
  <dl class="kv">${kv("di cui tasse pagate",`<span class="nt-tasse">${fmt(x.tasse)}</span>`)}${kv("di cui spese fisse",`<span class="nt-spese">${fmt(x.fisse)}</span>`)}${x.aff>0?kv("&nbsp;&nbsp;di cui affitto",`<span class="nt-aff">${fmt(x.aff)}</span>`):""}</dl></div></div>
  <p class="note">Solo i mesi con i saldi di inizio e fine mese: per questo le entrate qui possono differire dal totale della tabella sotto.</p></div>`;};
V.entrate=()=>{
 const Y=UY,T=R.anni[Y],c=`anni.${Y}`;
 const idx=S.registro.map((r,i)=>i).filter(i=>S.registro[i].data.startsWith(Y+"-")).sort((a,b)=>S.registro[b].data.localeCompare(S.registro[a].data));
 const noDate=S.registro.map((r,i)=>i).filter(i=>!S.registro[i].data);
 const list=[...noDate,...idx].map(i=>S.registro[i].ext?`<tr class="extrow"><td>${dIt(S.registro[i].data)}</td><td>${FN[S.registro[i].fonte]}</td><td>${fmt(S.registro[i].importo)}</td><td class="muted">${S.registro[i].nota} <span class="chip auto">auto</span></td><td></td></tr>`:`<tr><td>${inpT(`registro.${i}.data`,"date")}</td><td>${sel(`registro.${i}.fonte`,FONTI_Y(Y).some(f=>f[0]===S.registro[i].fonte)?FONTI_Y(Y):[...FONTI_Y(Y),FONTI.find(f=>f[0]===S.registro[i].fonte)])}</td><td>${inp(`registro.${i}.importo`)}</td><td>${inpT(`registro.${i}.nota`,"text","Nota (n. fattura, cliente…)")}</td>
  <td class="c"><button class="icon-btn" data-act="del-mov" data-idx="${i}" aria-label="Elimina movimento" ${READONLY?"disabled":""}>×</button></td></tr>`).join("");
 const FY=FONTI_E(Y),used=+Y>=2027?FY:FY.filter(([k])=>T&&T.tot[k]!==0);const cols=used.length?used:FY;
 let piv="";if(T){MESI.forEach((m,i)=>{piv+=`<tr><td>${m}</td>${cols.map(([k])=>{const nE=cellEntries(Y,i,k).length;if(k==="sond"&&sondCovers(`${Y}-${String(i+1).padStart(2,"0")}`))return `<td class="auto-c" title="Prelievi dall'app Guadagni sondaggi">${out(`${c}.mm.${k}.${i}`)}<span class="nm">auto</span></td>`;
   if(cedCovers(`${Y}-${String(i+1).padStart(2,"0")}`,k))return `<td class="auto-c" title="Netto dal cedolino (scheda Cedolini)">${out(`${c}.mm.${k}.${i}`)}<span class="nm">cedolino</span></td>`;return nE>1?`<td class="multi" title="${nE} movimenti: modificali nell'elenco dettagliato">${out(`${c}.mm.${k}.${i}`)}<span class="nm">${nE} mov.</span></td>`:`<td class="ce">${cellInp(Y,i,k)}</td>`;}).join("")}<td class="gain">${out(`${c}.tm.${i}`)}</td></tr>`;});
  piv+=`<tr class="tot"><td>Totale ${Y}</td>${cols.map(([k])=>`<td>${out(`${c}.tot.${k}`)}</td>`).join("")}<td class="gain">${out(`${c}.tot.all`)}</td></tr>`;}
 const today=TODAY;
 return `<section class="sheet">
 <div class="sheet-h"><h2>Entrate ${Y}</h2>${yearBar()}<p>${+Y>=2027?"Dal 2027 restano stipendio SSN e sondaggi, più «Altro» per le entrate occasionali (rimborso IRPEF, rimborsi spese, regali…). Lo stipendio è il netto in busta, tutto compreso: contiene già intramoenia e prestazioni aggiuntive. Il loro lordo, che serve solo per la Quota B ENPAM, si inserisce nella scheda Tasse.":"Un unico registro di movimenti: data di incasso, fonte, importo. Solo la libera professione entra nel forfettario, per cassa. Lo stipendio SSN è il netto in busta, tutto compreso (anche intramoenia e aggiuntive); il loro lordo per la Quota B ENPAM si inserisce nella scheda Tasse."}</p></div>
 ${euBox(Y)}
 ${sondNote()}
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
 if(+Y>=2027){let rows="";MESI.forEach((m,i)=>{rows+=`<tr><td>${m}</td><td>${out(`${c}.mm.intra.${i}`,"eur","lnk")}</td><td>${out(`${c}.cumI.${i}`)}</td><td>${out(`${c}.ytd.qb.${i}`,"eur","tax")}</td></tr>`;});
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
 let ytd="";MESI.forEach((m,i)=>{ytd+=`<tr><td>${m}</td><td>${out(`${c}.ytd.lp.${i}`,"eur","lnk")}</td><td>${out(`${c}.ytd.cum.${i}`)}</td><td>${out(`${c}.ytd.imponibile.${i}`)}</td><td>${out(`${c}.ytd.qa.${i}`,"eur","tax")}</td><td>${out(`${c}.ytd.qb.${i}`,"eur","tax")}</td><td>${out(`${c}.ytd.imp.${i}`,"eur","tax")}</td><td>${out(`${c}.ytd.h.${i}`,"eur","tax")}</td><td>${out(`${c}.ytd.i.${i}`)}</td></tr>`;});
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
function esChart(){
 const el=document.getElementById("eschart");if(!el||!R.sv)return;const sv=R.sv,P=k=>i=>Math.max(n(sv[k][i]),0);
 const W=480,H=250,L=40,Rm=8,T=12,B=24,pw=W-L-Rm,ph=H-T-B,slot=pw/12,bw=Math.min(14,slot*.36);
 const out_=i=>P("spese")(i)+P("fisse")(i)+P("tasse")(i);
 const mx=Math.max(1000,...MESI.map((_,i)=>Math.max(n(sv.ent[i]),out_(i))));const st=mx>8000?2000:1000,top=Math.ceil(mx/st)*st;
 const y=v=>T+ph-v/top*ph;
 let g="";for(let v=0;v<=top;v+=st)g+=`<line x1="${L}" x2="${W-Rm}" y1="${y(v)}" y2="${y(v)}" style="stroke:var(--line)" ${v?'stroke-dasharray="3 4"':''}/><text x="${L-5}" y="${y(v)+4}" text-anchor="end">${fN.format(v/1000)}k</text>`;
 let bs="";MESI.forEach((m,i)=>{const cx=L+slot*i+slot/2;g+=`<text x="${cx}" y="${H-6}" text-anchor="middle">${m.slice(0,1)}</text>`;if(sv.ent[i]==null)return;
  const tip=`${m}: entrate ${fmt(sv.ent[i])} · uscite ${fmt(out_(i))} (vita ${fmt(sv.spese[i])}, fisse ${fmt(sv.fisse[i])}${n(sv.aff[i])>0?` di cui affitto ${fmt(sv.aff[i])}`:""}, tasse ${fmt(sv.tasse[i])}) · risparmio ${fmt(sv.risp[i],"sign")}`;
  const e=n(sv.ent[i]);bs+=`<rect x="${cx-bw-1}" y="${y(e)}" width="${bw}" height="${Math.max(1,y(0)-y(e))}" rx="2" style="fill:var(--c-ent)" data-tip="${esc(tip)}"><title>${esc(tip)}</title></rect>`;
  const PV={spese:P("spese")(i),aff:P("aff")(i),fisse:Math.max(P("fisse")(i)-P("aff")(i),0),tasse:P("tasse")(i)};
  let acc=0;[["spese","--c-spese"],["aff","--c-aff"],["fisse","--c-fisse"],["tasse","--c-tasse"]].forEach(([k,c])=>{const v=PV[k];if(!v)return;bs+=`<rect x="${cx+1}" y="${y(acc+v)}" width="${bw}" height="${Math.max(1,y(acc)-y(acc+v))}" style="fill:var(${c})" data-tip="${esc(tip)}"><title>${esc(tip)}</title></rect>`;acc+=v;});});
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
 const cols=det?[["Entrate"],["Spese di vita"],...(hasA?[["Affitto"],["Altre fisse"]]:[["Spese fisse"]]),["Tasse pagate"],["Risparmio"],["Tasso"],["Da accantonare"],["Risparmio netto"]]:[["Entrate €"],["Uscite €"],["Risparmio €"],["Tasso"]];
 const cells=i=>det?[c(sv.ent[i],"nt-ent"),c(sv.spese[i],"nt-spese"),...(hasA?[c(sv.aff[i],"nt-aff"),c(n(sv.fisse[i])-n(sv.aff[i]),"nt-spese")]:[c(sv.fisse[i],"nt-spese")]),c(sv.tasse[i],"nt-tasse"),sgn(sv.risp[i]),fmt(sv.tasso[i],"pct1")+bar(sv.tasso[i]),c(sv.acc[i],"nt-tasse"),sgn(sv.rn[i])]
  :[c(sv.ent[i],"nt-ent"),c(usc(i),"nt-spese"),sgn(sv.risp[i]),fmt(sv.tasso[i],"pct1")+bar(sv.tasso[i])];
 const head=det?`<tr class="grp"><th rowspan="2">Mese</th><th rowspan="2">Entrate</th><th colspan="${hasA?4:3}">Uscite</th><th colspan="4">Risparmio</th><th rowspan="2" class="go" aria-label="Apri"></th></tr><tr class="grp2">${cols.slice(1).map(x=>`<th>${x[0]}</th>`).join("")}</tr>`
  :`<tr><th>Mese</th>${cols.map(x=>`<th>${x[0]}</th>`).join("")}<th class="go" aria-label="Apri"></th></tr>`;
 let rows="";for(let i=0;i<=Math.min(lastM,11);i++){
  if(sv.risp[i]==null){rows+=`<tr class="nod"><td>${mLbl(i)}</td><td colspan="${cols.length+1}" class="nodt">${`${PY}-${pad(i)}`===TODAY.slice(0,7)?"mese in corso: si completa con il saldo di fine mese":"saldi mancanti in Patrimonio"}</td></tr>`;continue;}
  rows+=`<tr class="lk${i===best?" best":""}" data-act="go" data-tab="mese" data-mm="${PY}-${pad(i)}" tabindex="0" title="Apri il resoconto di ${MESI[i].toLowerCase()} ${PY}"><td>${mLbl(i)}${i===best?' <small class="bst">migliore</small>':""}</td>${cells(i).map(x=>`<td>${x}</td>`).join("")}<td class="go">›</td></tr>`;}
 const Y=sv.ytd,k=ok.length,av=v=>v/k;
 const tot=det?[c(Y.ent,"nt-ent"),c(Y.spese,"nt-spese"),...(hasA?[c(Y.aff,"nt-aff"),c(Y.fisse-Y.aff,"nt-spese")]:[c(Y.fisse,"nt-spese")]),c(Y.tasse,"nt-tasse"),sgn(Y.risp),fmt(Y.tasso,"pct1"),c(Y.acc,"nt-tasse"),sgn(Y.rn)]:[c(Y.ent,"nt-ent"),c(Y.ent-Y.risp,"nt-spese"),sgn(Y.risp),fmt(Y.tasso,"pct1")];
 const med=det?[c(av(Y.ent),"nt-ent"),c(av(Y.spese),"nt-spese"),...(hasA?[c(av(Y.aff),"nt-aff"),c(av(Y.fisse-Y.aff),"nt-spese")]:[c(av(Y.fisse),"nt-spese")]),c(av(Y.tasse),"nt-tasse"),sgn(av(Y.risp)),"",c(av(Y.acc),"nt-tasse"),sgn(av(Y.rn))]:[c(av(Y.ent),"nt-ent"),c(av(Y.ent-Y.risp),"nt-spese"),sgn(av(Y.risp)),""];
 return `<details class="more svt" id="svt-det" ${SVT_OPEN?"open":""}><summary>Tabella mese per mese</summary>
  <div class="svt-bar"><div class="seg sm" role="tablist" aria-label="Colonne">${[["sint","Sintesi"],["det","Dettaglio"]].map(([v,l])=>`<button class="segb" data-act="svv" data-v="${v}" aria-selected="${v===SVV}">${l}</button>`).join("")}</div><span class="muted svt-h">${det?"Scorri di lato per tutte le colonne · ":""}Tocca un mese per il resoconto</span></div>
  <div class="tbl-wrap flat"><table class="sv2${det?" det":""}"><thead>${head}</thead><tbody>${rows}</tbody>
  <tfoot><tr class="tot"><td>Totale<small class="yr"> ${PY}</small></td>${tot.map(x=>`<td>${x}</td>`).join("")}<td></td></tr><tr class="avg"><td>Media<span class="mfull"> mensile</span> <small>${k} ${k===1?"mese":"mesi"}</small></td>${med.map(x=>`<td>${x}</td>`).join("")}<td></td></tr></tfoot></table></div></details>`;}
function svChart(){
 const el=document.getElementById("svchart");if(!el||!R.sv)return;const V=R.sv.risp;
 const W=660,H=200,L=52,Rm=12,T=14,B=24,pw=W-L-Rm,ph=H-T-B,slot=pw/12,bw=Math.min(26,slot*.6);
 const mx=Math.max(1000,...V.map(v=>Math.abs(n(v))));const top=Math.ceil(mx/1000)*1000;
 const mn=Math.min(0,...V.map(n)),bot=mn<0?-Math.ceil(-mn/1000)*1000:0;
 const y=v=>T+ph-((v-bot)/(top-bot))*ph;
 let g="";for(let v=bot;v<=top;v+=1000*Math.max(1,Math.round((top-bot)/4000)))g+=`<line x1="${L}" x2="${W-Rm}" y1="${y(v)}" y2="${y(v)}" style="stroke:var(--line)" ${v?'stroke-dasharray="3 4"':''}/><text x="${L-6}" y="${y(v)+4}" text-anchor="end">${fN.format(v/1000)}k</text>`;
 let bs="";MESI.forEach((m,i)=>{const cx=L+slot*i+slot/2;g+=`<text x="${cx}" y="${H-6}" text-anchor="middle">${m.slice(0,3)}</text>`;const v=V[i];if(v==null)return;
  bs+=`<rect x="${cx-bw/2}" y="${v>=0?y(v):y(0)}" width="${bw}" height="${Math.max(1,Math.abs(y(v)-y(0)))}" rx="3" style="fill:var(${v>=0?"--good":"--spese"})"><title>${m}: ${fmt(v,"sign")} (${fmt(R.sv.tasso[i],"pct1")})</title></rect>`;});
 const av=R.sv.m3.risp;const al=av!=null?`<line x1="${L}" x2="${W-Rm}" y1="${y(av)}" y2="${y(av)}" style="stroke:var(--muted)" stroke-width="1.5" stroke-dasharray="6 4"/>`:"";
 el.innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Risparmio mensile">${g}${bs}${al}</svg>`;}
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
 const last=M[M.length-1],lx=L+slot*11+slot/2;
 const lab=`<text x="${W-Rm+4}" y="${ly(last.liq)+4}" style="fill:var(--liq-t);font-weight:600">${Math.round(last.liq/1000)}k</text><text x="${W-Rm+4}" y="${ly(M[0].liq)+4}" style="fill:var(--liq-t)">${Math.round(M[0].liq/1000)}k</text>`;
 el.innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Previsione di cassa">${g}${bs}${line}${lab}</svg>`;
}
function chart(){
 const el=document.getElementById("chart");if(!el)return;const P=R.patr[R.PY];
 const idx=P?P.D.map((d,i)=>d>0?i:-1).filter(i=>i>=0):[];
 if(!idx.length){el.innerHTML='<p class="note">Il grafico compare quando inserisci almeno un saldo mensile.</p>';return;}
 const W=Math.max(480,Math.round(el.clientWidth||660)),H=280,L=46,Rm=12,T=18,B=26,pw=W-L-Rm,ph=H-T-B;
 const maxV=Math.max(...idx.map(i=>P.I[i]));
 const raw=maxV/4,mag=Math.pow(10,Math.floor(Math.log10(raw||1))),step=[1,2,2.5,5,10].map(k=>k*mag).find(s=>s>=raw);
 const top=Math.ceil(maxV/step)*step||1,y=v=>T+ph-(v/top)*ph,slot=pw/12,bw=Math.min(30,slot*0.58);
 let g="";
 for(let v=0;v<=top+1e-9;v+=step){g+=`<line x1="${L}" x2="${W-Rm}" y1="${y(v)}" y2="${y(v)}" style="stroke:var(--line)" stroke-width="1" ${v>0?'stroke-dasharray="3 4"':''}/><text x="${L-8}" y="${y(v)+4}" text-anchor="end">${Math.round(v/1000)}k</text>`;}
 let bs="",pts=[];
 MESI.forEach((m,i)=>{const cx=L+slot*i+slot/2;g+=`<text x="${cx}" y="${H-8}" text-anchor="middle">${m.slice(0,3)}</text>`;
  if(P.D[i]>0){const d=P.D[i],h=n(P.H[i]),x=cx-bw/2;
   bs+=`<rect x="${x}" y="${y(d)}" width="${bw}" height="${y(0)-y(d)}" fill="url(#gL)"><title>${m}: liquido ${fmt(d)}</title></rect>`;
   if(h>0)bs+=`<rect x="${x}" y="${y(d+h)}" width="${bw}" height="${y(d)-y(d+h)}" rx="3" style="fill:var(--inv)"><title>${m}: investimenti ${fmt(h)}</title></rect>`;
   pts.push([cx,y(P.K[i]),P.K[i],i]);}});
 let area="",line="";
 if(pts.length>1){const p=pts.map(q=>q[0].toFixed(1)+","+q[1].toFixed(1)).join(" ");
  area=`<polygon points="${pts[0][0]},${y(0)} ${p} ${pts[pts.length-1][0]},${y(0)}" fill="url(#gN)"/>`;
  line=`<polyline points="${p}" fill="none" style="stroke:var(--good)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;}
 const last=pts[pts.length-1];
 const dots=pts.map((q,k)=>`<circle cx="${q[0]}" cy="${q[1]}" r="${k===pts.length-1?5:3}" style="fill:var(--surface);stroke:var(--good)" stroke-width="2"><title>${MESI[q[3]]}: netto ${fmt(q[2])}</title></circle>`).join("");
 const lab=last?`<text x="${last[0]}" y="${y(P.I[last[3]])-9}" text-anchor="middle" style="fill:var(--good);font-weight:600">${fmt(last[2]).replace(/,\d\d\s?€/," €")}</text>`:"";
 el.innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Patrimonio mensile"><defs>
 <linearGradient id="gL" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--liq)"/><stop offset="1" style="stop-color:var(--liq);stop-opacity:.55"/></linearGradient>
 <linearGradient id="gN" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--good);stop-opacity:.16"/><stop offset="1" style="stop-color:var(--good);stop-opacity:0"/></linearGradient></defs>
 ${g}${area}${bs}${line}${dots}${lab}</svg>`;
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
  if(k==="sel"){el.value=v||"altro";el.disabled=READONLY;return;}
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
 {const y=R.deb.curY,pg=R.deb.perAnnoFP[y]||0,tt=R.deb.perAnnoFT[y]||0;bars("taxcurbar",[pg,Math.max(tt-pg,0)]);const el=document.getElementById("taxcurpct");if(el)el.textContent=tt>0?Math.round(pg/tt*100)+"%":"—";}chart();pvChart();svChart();esChart();
}
function render(){
 TODAY=new Date().toLocaleDateString("sv-SE");
 let h=(location.hash||"").slice(1).split("?")[0];if(h==="movimenti")h="mese";current=TABS.some(t=>t[0]===h)?h:"home";
 R=calc(S);if(UY==null||!allYears().includes(UY))UY=R.PY;
 renderTabs();if(current==="sondaggi"&&document.getElementById("sv-frame"))return; // l'app sondaggi resta aperta com'è
 document.getElementById("view").innerHTML=V[current]();if(current==="sondaggi")svFrameInit();if(current==="mese")movFiltra();psubInit();fillInputs(true);updateOutputs();
}
/* sotto-sezioni della scheda principale: chiuse di default; 1° tocco apre, 2° tocco apre la scheda; la freccia richiude */
const PSOPEN=new Set();
function psubInit(){document.querySelectorAll("#view a.psub").forEach(el=>{const h=el.querySelector("h4");if(!h)return;
  const k=(h.firstChild&&h.firstChild.textContent||"").trim();el.dataset.k=k;const op=PSOPEN.has(k);el.classList.toggle("open",op);el.setAttribute("aria-expanded",op?"true":"false");
  const c=el.querySelector("[data-psum]")||el.querySelector("svg text.pc1"),r=document.createElement("span");r.className="pr";
  const cat=/^Liquidit/.test(k)?"liq":/^Investimenti/.test(k)?"inv":/^Tasse/.test(k)?"tasse":/^Scadenze/.test(k)?"spese":/^(Uso delle entrate|Entrate)/.test(k)?"ent":"",col=cat?`var(--t-${cat})`:"";if(c&&col)c.style.fill=col;
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
   if(cedCovers(`${Y}-${String(m+1).padStart(2,"0")}`,f))return;
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
 if(a==="svv"){SVV=b.dataset.v;render();const t=document.getElementById("svt-det");if(t)t.scrollIntoView({block:"nearest"});return;}
 if(a==="mm"){if(b.dataset.mm){MM=b.dataset.mm;render();}return;}
 if(a==="sy"){SY=b.dataset.g;EDIT=null;render();return;}
 if(a==="pt"){PT=b.dataset.v;render();return;}
 if(a==="tpy"){TPY=b.dataset.y;render();return;}
 if(a==="tpv"){TPV=b.dataset.v;render();return;}
 if(a==="edit"&&b.dataset.nav){const r=S.scadenzario.find(x=>x.id===b.dataset.id);EDIT=b.dataset.id;if(r){SY=scadGroup(r);GOTO={ym:SD(r).slice(0,7)};}location.hash="scadenzario";return;}
 if(a==="edit"){EDIT=b.dataset.id;render();const f=document.querySelector("tr.edit input.txt");if(f)f.focus();return;}
 if(a==="done"){EDIT=null;render();return;}
 if(a==="tog"){if(READONLY)return;const r=S.scadenzario.find(x=>x.id===b.dataset.id);if(r){const p=paidOf(r);if(p){r.pagato=false;r.forzaNonPagato=!!r.scadenza&&SD(r)<=TODAY;}else{r.pagato=true;r.forzaNonPagato=false;}r.dataPag=paidOf(r)?SD(r):"";render();scheduleSave();}return;}
 if(READONLY)return;
 if(a==="add-scad"){const t=TODAY.slice(4,10),nr={...scadRow("",+SY||UY,""),scadenza:/^\d{4}$/.test(SY)?SY+t:""};S.scadenzario.push(nr);EDIT=nr.id;}
 else if(a==="del-scad"){const r=S.scadenzario[+b.dataset.idx];if(r&&r.ric){const t=S.ricorrenti.find(x=>x.id===r.ric),k=r.rm||r.anno;if(t&&!t.esclusi.includes(k))t.esclusi.push(k);}S.scadenzario.splice(+b.dataset.idx,1);}
 else if(a==="add-fm"){S.fondoMov.push({id:uid(),data:new Date().toLocaleDateString("sv-SE"),tipo:"acquisto",importo:null,nota:""});}
 else if(a==="del-fm"){S.fondoMov.splice(+b.dataset.idx,1);}
 else if(a==="add-ric"){S.ricorrenti.push({id:"f"+uid(),voce:"",mese:new Date().getMonth()+1,importo:null,variabile:false,esclusi:[],freq:"a",giorno:1,da:""});ensureRic(S);}
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
 if(cedCovers(d.slice(0,7),f)){msg.hidden=false;msg.textContent="Lo stipendio di "+MESE_L(d.slice(0,7))+" arriva dal cedolino: per correggerlo cambia il PDF nella cartella Cedolini.";return;}
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
 clearTimeout(timer);dirty=false;
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
let hubPullBusy=false;
async function hubPull(){
 if(hubPullBusy||!hubUrl())return;hubPullBusy=true;
 try{const el=await hubFetch("/api/"+HUB_APP+"/backup/elenco"),latest=(el&&el.file||[])[0],st=hubState();
  if(!latest||latest===st.base)return;
  const r=await hubFetch("/api/"+HUB_APP+"/backup/ultimo");if(!r||!r.dati)return;
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
 if(hubBusy||!hubUrl()||!hasRealData(S))return;
 await hubPull();
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
 if(sig(nuovo)===prima){if(S.sondExt){S.sondExt.fonte=src.fonte;S.sondExt.agg=nuovo.sondExt.agg;}return false;}
 S.registro=nuovo.registro;S.sondExt=nuovo.sondExt;
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
 return `<div class="banner sond-b"><b>Sondaggi automatici</b> da ${MESE_L(S.sondExt.da)}: ogni mese vale la somma dei <b>prelievi</b> registrati nell'app Guadagni sondaggi (le celle con «auto» non si modificano qui). Aggiornato: ${fmtWhen(Date.parse(S.sondExt.agg))}. <a href="#collegamenti">Dettagli</a></div>`;}
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
 S.registro=[...keep,...add];
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
  if(c.agg>0)out.push(riga(c,"aggiuntiva",c.agg/60,isAggiuntiva,tA));});
 return{righe:out,tG,tA};}
/* ore di recupero usate nel mese: residuo prec. + saldo − residuo (null se manca il mese prima) */
function cartUsate(L,y){const i=L.indexOf(y);if(y.recupero==null||y.fatto==null||y.dovuto==null)return null;
 const pr=i>0&&L[i-1].periodo===ymAdd(y.periodo,-1)?L[i-1]:null,base=pr?pr.recupero:(i===0&&y.recupero===y.fatto-y.dovuto?0:null);
 if(base==null)return null;return base+(y.fatto-y.dovuto)-y.recupero;}
const STATO_L={ok:['ok',"pagato"],pagato:['ok',"pagato"],meno:['',"pagate meno ore"],piu:['',"pagate più ore"],manca:['',"non trovato"],attesa:['',"in arrivo"]};
let CART_SEL=null;
function lavPage(mode){const c=S.cart,L=c?c.lista:[];
 const head=`<div class="sheet-h"><h2>${mode==="pag"?"Guardie e aggiuntiva":"Presenze e ferie"}</h2><p>${mode==="pag"?"Guardie e attività aggiuntiva dai cartellini, confrontate con quanto pagato nei cedolini. Dati":"Ore, recupero e ferie"} dai cartellini presenze nella cartella OneDrive «Assistente Finanziario/Cartellini». La lettura avviene sul PC di casa (Hub); qui arrivano solo orari, causali e totali, senza dati anagrafici.</p></div>
 <div class="actions"><button class="btn" data-act="x-cart">Aggiorna ora</button>${mode==="pag"?'<a class="btn ghost" href="#cedolini">Cedolini</a>':'<a class="btn ghost" href="#lv-pag">Guardie e aggiuntiva</a>'}</div>
 <p class="note" id="lk-cart-msg" ${linkMsgs.cart?"":"hidden"}>${linkMsgs.cart}</p>`;
 const errs=c&&(c.errori.length||L.some(x=>!x.ok))?`<div class="box c-tax"><h3>Da controllare</h3>${L.filter(x=>!x.ok).map(x=>`<p class="note"><b>${esc(x.file)}</b> (${MESE_L(x.periodo)}): le somme dei giorni non tornano con i totali stampati. I numeri di questo mese vanno verificati sul PDF.</p>`).join("")}
  ${c.errori.map(e=>`<p class="note"><b>${esc(e.file)}</b>: non leggibile (${esc(e.errore)}).</p>`).join("")}</div>`:"";
 if(!L.length)return `<section class="sheet">${head}<div class="banner">Nessun cartellino ancora. ${hubUrl()?"Salva i PDF nella cartella Cartellini (anche in una sottocartella per anno) e premi «Aggiorna ora»: il PC li legge entro un minuto.":"Imposta prima l'indirizzo dell'Hub in <a href=\"#collegamenti\">Collegamenti e backup</a>."}</div>${errs}</section>`;
 if(!CART_SEL||!L.some(x=>x.periodo===CART_SEL))CART_SEL=L[L.length-1].periodo;
 const x=L.find(y=>y.periodo===CART_SEL),last=L[L.length-1];
 const P=cartPagamenti(),inArrivo=P.righe.filter(r=>r.stato==="attesa"),daVerif=P.righe.filter(r=>["meno","piu","manca"].includes(r.stato));
 const totArr=inArrivo.reduce((a,r)=>a+(r.stima||0),0);
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
  return `<tr><td>${MESE_L(r.periodo)}</td><td>${tipoL[r.tipo]}</td><td>${hm(Math.round(r.ore*60))}</td><td>${r.stima!=null?fmt(r.stima):"—"}</td><td>${r.pag?fmt(r.pag.importo)+(r.pag.ore!=null?`<br><small class="muted">${fN.format(r.pag.ore)} h · cedolino di ${r.pag.ced.map(MESE_L).join(", ").toLowerCase()}</small>`:""):`<small class="muted">atteso con il cedolino di ${MESE_L(r.atteso).toLowerCase()}</small>`}</td><td><span class="chip ${cls}">${lab}</span></td></tr>`;}).join("");
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
 </div>
 ${daVerif.length?`<div class="box c-tax"><h3>Pagamenti da verificare</h3>${daVerif.map(r=>`<p class="note"><b>${tipoL[r.tipo]} di ${MESE_L(r.periodo).toLowerCase()}</b>: ${r.stato==="manca"?`nel cedolino di ${MESE_L(r.atteso).toLowerCase()} non c'è (${hm(Math.round(r.ore*60))} ore dal cartellino).`:`pagate ${fN.format(r.pag.ore)} ore, dal cartellino ne risultano ${fN.format(oreDec(Math.round(r.ore*60)))}.`}</p>`).join("")}</div>`:""}
  <div class="box"><h3>Guardie e aggiuntiva · ${anno}</h3><dl class="kv">
   ${kv("Notti di guardia",String(notti))}${kv("Guardie festive diurne",String(fest))}${kv("Ore di attività aggiuntiva",hm(aggA))}
   ${kv("Tariffa guardia (ultimo cedolino)",P.tG!=null?fmt(P.tG)+"/h":"—")}${kv("Tariffa aggiuntiva (ultimo cedolino)",P.tA!=null?fmt(P.tA)+"/h":"—")}</dl>
   <p class="note">Guardie e aggiuntiva di un mese si pagano di norma con il cedolino di due mesi dopo. Ore di guardia = ore gettone notturne + festive del cartellino. Le ore di aggiuntiva pagate sono quelle certificate nel report della U.O.C. Libera Professione, che può arrotondare rispetto alle timbrature.</p></div>
 <div class="box"><h3>Pagamenti di guardie e aggiuntiva</h3><div class="tbl-wrap flat"><table><thead><tr><th>Mese lavorato</th><th>Voce</th><th>Ore</th><th>Atteso (lordo)</th><th>Pagato</th><th></th></tr></thead><tbody>${pRows||'<tr><td colspan="6" class="muted">Nessuna guardia o attività aggiuntiva nei cartellini letti.</td></tr>'}</tbody></table></div>
  <p class="note">Atteso = ore × tariffa dell'ultimo cedolino. «In arrivo» finché non c'è il cedolino di due mesi dopo; poi il confronto è con le ore pagate (scarto fino a 15 minuti considerato arrotondamento).</p></div>
</section>`:`<section class="sheet">${head}${errs}
 <div class="hero">
  <div class="tile"><span class="l">Ore · ${MESE_L(x.periodo)}</span><span class="v">${hm(x.fatto)}</span><span class="s">dovute ${hm(x.dovuto)} · saldo ${hmS(saldo)}</span></div>
  <div class="tile"><span class="l">Recupero ore residuo</span><span class="v">${hm(x.recupero)}</span><span class="s">${(()=>{const i=L.indexOf(x),pr=i>0&&L[i-1].periodo===ymAdd(x.periodo,-1)?L[i-1]:null,u=cartUsate(L,x);return pr&&u!=null?`${hm(pr.recupero)} di ${MESE_L(pr.periodo).toLowerCase().split(" ")[0]} ${hmS(saldo)} saldo${u?" − "+hm(u)+" recuperate":""}`:"a fine "+MESE_L(x.periodo).toLowerCase();})()}</span></div>
  <div class="tile t-liq"><span class="l">Ferie residue</span><span class="v">${nGg(ferRes)}</span><span class="s">congedo ${fN.format(fer.co.residuo)} · festività soppresse ${fN.format(fer.fs.residuo)}${fer.ap.residuo?" · anni prec. "+fN.format(fer.ap.residuo):""} (a ${MESE_L(last.periodo).toLowerCase()})</span></div>
 </div>
  <div class="box"><h3>Ferie ${anno}</h3><dl class="kv">
   ${kv("Congedo ordinario spettante",nGg(fer.co.spettanti))}${kv("Goduti",nGg(fer.co.fruiti))}${kv("Festività soppresse residue",nGg(fer.fs.residuo))}${fer.ap.residuo?kv("Residuo anni precedenti",nGg(fer.ap.residuo)):""}${kv("Residue totali",nGg(ferRes))}</dl>
   <p class="note">${Lanno.filter(y=>y.ferieGiorni.length).map(y=>MESE_L(y.periodo)+": "+y.ferieGiorni.join(", ")).join(" · ")||"Nessun giorno di ferie nei cartellini letti."}</p></div>
 <div class="box"><h3>Mesi</h3><div class="tbl-wrap flat"><table><thead><tr><th>Mese</th><th>Fatte</th><th>Dovute</th><th>Saldo mese</th><th>Recuperate</th><th>Residuo</th><th>Notti</th><th>Festive</th><th>Aggiuntiva</th><th>Ferie</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
  <p class="note">Il residuo di recupero ore si muove così: residuo del mese prima + saldo del mese − ore recuperate con riposo (causale 9018, «recupero ore dirigenza»). Il saldo del mese, quindi, non coincide col residuo nei mesi in cui hai preso giorni di recupero. I giorni di riposo compensativo dopo una guardia festiva (9013) sono già nel saldo, come le ore mancanti il giorno prima di una notte. Tocca un mese per vederne i giorni. I cartellini «provvisori» vengono ricalcolati dall'Azienda: ristampali e sostituisci il PDF per avere i numeri aggiornati.</p></div>
 <div class="box" id="lv-giorni"><h3>Giorni di ${MESE_L(x.periodo).toLowerCase()}${x.calcolo?` <small class="muted">· calcolo del ${dIt(x.calcolo.slice(0,10))}</small>`:""}</h3><div class="tbl-wrap flat"><table class="lv-days"><thead><tr><th>Giorno</th><th>Timbrature</th><th>Causali</th><th>Ore</th><th>Ecc./car.</th></tr></thead><tbody>${days}</tbody></table></div>
  <p class="note"><span class="lv-ta">In corsivo</span> le timbrature di attività aggiuntiva. Le notti iniziano alle 20 e finiscono il mattino dopo: le ore compaiono sul giorno di uscita.</p></div>
</section>`;}
V.presenze=()=>lavPage("presenze");
V["lv-pag"]=()=>lavPage("pag");
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
function svCell(k,id){SV.months[k]=SV.months[k]||{};SV.months[k][id]=SV.months[k][id]||{g:0,p:0};return SV.months[k][id];}
const svTot=k=>{let g=0,p=0;SV.sites.forEach(s=>{g+=svGet(k,s.id,"g");p+=svGet(k,s.id,"p");});return{g,p}};
const svUsed=()=>Object.keys(SV.months).filter(k=>{const t=svTot(k);return t.g||t.p}).sort();
const svPend=id=>SV.pending.filter(x=>!id||x.site===id).reduce((a,x)=>a+x.amount,0);
const cE=c=>fmt((c||0)/100);
function svCents(str){let t=String(str==null?"":str).trim().replace(/[€\s]/g,"");if(!t)return NaN;if(t.includes(","))t=t.replace(/\./g,"").replace(",",".");const n=Number(t);return isFinite(n)?Math.round(n*100):NaN;}
const c2f=c=>c?(c/100).toFixed(2).replace(".",","):"";
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
/* ================= dashboard Lavoro ================= */
const hmF=v=>hm(Math.round(v*60)); /* ore decimali -> h:mm (per le ciambelle) */
V.lavoro=()=>{const c=S.cart,L=c?c.lista:[];
 const head=`<div class="sheet-h"><h2>Dashboard lavoro${L.length?" "+L[L.length-1].periodo.slice(0,4):""}</h2><p>${L.length?`Ultimo cartellino: ${MESE_L(L[L.length-1].periodo).toLowerCase()}${L[L.length-1].provvisorio?" (provvisorio)":""}.`:"Cartellini presenze e cedolini letti sul PC di casa."}</p></div>`;
 if(!L.length)return `<section class="sheet">${head}<div class="banner">Nessun cartellino ancora. ${hubUrl()?"Salva i PDF nella cartella Cartellini e premi «Aggiorna ora».":"Imposta prima l'indirizzo dell'Hub in <a href=\"#collegamenti\">Collegamenti e backup</a>."}</div>
  <div class="actions"><button class="btn" data-act="x-cart">Aggiorna ora</button><a class="btn ghost" href="#cedolini">Cedolini</a></div><p class="note" id="lk-cart-msg" ${linkMsgs.cart?"":"hidden"}>${linkMsgs.cart}</p></section>`;
 const x=L[L.length-1],anno=x.periodo.slice(0,4),Lanno=L.filter(y=>y.periodo.startsWith(anno)),mn=MESI[+x.periodo.slice(5)-1].toLowerCase();
 const gN=x.tz.notte.mese/60,gF=x.tz.fest.mese/60,ag=x.agg/60,ord=Math.max(0,(x.fatto||0)/60-gN-gF);
 const main=[["Orario ordinario",ord,"c-liq"],["Guardie notturne",gN,"c-inv"],["Guardie festive",gF,"c-tasse"],["Attività aggiuntiva",ag,"c-ent"]].filter(r=>r[1]>0),totM=sum(main.map(r=>r[1]));
 const saldo=x.fatto!=null&&x.dovuto!=null?x.fatto-x.dovuto:null,u=cartUsate(L,x);
 const fer=x.ferie,ferRes=fer.tot!=null?fer.tot:fer.co.residuo+fer.fs.residuo+fer.ap.residuo,ferGod=fer.co.fruiti+fer.fs.fruiti+fer.ap.fruiti;
 const nA=Lanno.reduce((a,y)=>a+y.tz.notte.mese,0)/60,fA=Lanno.reduce((a,y)=>a+y.tz.fest.mese,0)/60,aA=Lanno.reduce((a,y)=>a+y.agg,0)/60;
 const P=cartPagamenti(),arr=P.righe.filter(r=>r.stato==="attesa"),pag=P.righe.filter(r=>r.pag&&r.periodo.startsWith(anno)),vrf=P.righe.filter(r=>["meno","piu","manca"].includes(r.stato));
 const totArr=sum(arr.map(r=>r.stima||0)),totPag=sum(pag.map(r=>r.pag.importo));
 const ced=(S.ced?S.ced.lista:[]).filter(c=>c.controllo.ok),cl=ced[ced.length-1],cd=cl?cedDerive(cl):null;
 const nf=v=>fN.format(v);
 return `<section class="sheet">${head}
 <div class="actions"><button class="btn" data-act="x-cart">Aggiorna ora</button></div><p class="note" id="lk-cart-msg" ${linkMsgs.cart?"":"hidden"}>${linkMsgs.cart}</p>
 ${vrf.length?`<div class="banner">${vrf.length===1?"Un pagamento":vrf.length+" pagamenti"} di guardie o aggiuntiva da verificare: <a href="#lv-pag">Guardie e aggiuntiva</a>.</div>`:""}
 <div class="box pcard"><h3>Ore di ${mn} <small>${x.provvisorio?"cartellino provvisorio":""}</small></h3>
 <div class="pcard-in">
  <a class="pcard-main pmain" href="#presenze" data-act="go" data-tab="presenze" title="Apri Presenze e ferie">${donut(main,170,26,"Ore di "+mn,true,totM,"ore",hmF)}
   <div class="pside"><ul class="pleg">${main.map(([l,v,c])=>li(c,l,v,totM,hmF)).join("")}</ul>
   <dl class="kv">${kv("Dovute",hm(x.dovuto))}${kv("Saldo del mese",`<span class="${saldo>0?"pos":saldo<0?"neg":""}">${hmS(saldo)}</span>`)}</dl></div></a>
  <div class="pcard-sub">
   <a class="psub" href="#presenze" data-act="go" data-tab="presenze" title="Apri Presenze e ferie"><h4>Recupero ore <small>a fine ${mn}</small></h4>
    <div class="psub-in">${donut([["Residuo",Math.max(0,(x.recupero||0)/60),"c-risp"]],112,15,"Recupero ore",1,(x.recupero||0)/60,"residuo",hmF)}<div>
    <dl class="kv">${(()=>{const i=L.indexOf(x),pr=i>0&&L[i-1].periodo===ymAdd(x.periodo,-1)?L[i-1]:null;return (pr?kv("Residuo a fine "+MESI[+pr.periodo.slice(5)-1].toLowerCase(),hm(pr.recupero)):"")+kv("Saldo del mese",hmS(saldo))+(u?kv("Ore recuperate",`−${hm(u)}`):"")+kv("Residuo",`<b>${hm(x.recupero)}</b>`);})()}</dl></div></div></a>
   <a class="psub" href="#presenze" data-act="go" data-tab="presenze" title="Apri Presenze e ferie"><h4>Ferie ${anno} <small>${nGg(ferRes)} residue</small></h4>
    <div class="psub-in">${donut([["Godute",ferGod,"c-spese"],["Residue",ferRes,"c-liq"]],112,15,"Ferie "+anno,1,ferRes,"residue",v=>nf(v)+" gg")}<div><ul class="pleg">${li("c-spese","Godute",ferGod,ferGod+ferRes,v=>nf(v)+" gg")}${li("c-liq","Residue",ferRes,ferGod+ferRes,v=>nf(v)+" gg")}</ul>
    <dl class="kv">${kv("Congedo ordinario",nf(fer.co.residuo)+" su "+nf(fer.co.spettanti))}${kv("Festività soppresse",nf(fer.fs.residuo))}</dl></div></div></a>
   <a class="psub" href="#lv-pag" data-act="go" data-tab="lv-pag" title="Apri Guardie e aggiuntiva"><h4>Guardie e aggiuntiva ${anno} <small>${hmF(nA+fA+aA)} ore</small></h4>
    <div class="psub-in">${donut([["Guardie notturne",nA,"c-inv"],["Guardie festive",fA,"c-tasse"],["Attività aggiuntiva",aA,"c-ent"]],112,15,"Guardie e aggiuntiva "+anno,1,nA+fA+aA,"ore",hmF)}<div><ul class="pleg">${li("c-inv","Notti ("+Lanno.reduce((a,y)=>a+y.notti.length,0)+")",nA,nA+fA+aA,hmF)}${li("c-tasse","Festive ("+Lanno.reduce((a,y)=>a+y.festive.length,0)+")",fA,nA+fA+aA,hmF)}${li("c-ent","Aggiuntiva",aA,nA+fA+aA,hmF)}</ul></div></div></a>
   <a class="psub" href="#lv-pag" data-act="go" data-tab="lv-pag" title="Apri Guardie e aggiuntiva"><h4>Pagamenti guardie e aggiuntiva <small>${arr.length?fmt(totArr)+" in arrivo":"nulla in sospeso"}</small></h4>
    <div class="psub-in">${donut([["Pagati nel "+anno,totPag,"c-risp"],["In arrivo (stima)",totArr,"qa"]],112,15,"Pagamenti",1,totPag+totArr,"lordo")}<div><ul class="pleg">${li("c-risp","Già pagati",totPag,totPag+totArr)}${li("qa","In arrivo",totArr,totPag+totArr)}</ul>
    <dl class="kv">${arr.map(r=>kv((r.tipo==="guardia"?"Guardia ":"Aggiuntiva ")+MESI[+r.periodo.slice(5)-1].toLowerCase(),`${fmt(r.stima)} <small class="muted">a ${MESI[+r.atteso.slice(5)-1].toLowerCase()}</small>`)).join("")||kv("In arrivo","—")}</dl></div></div></a>
   ${cd?`<a class="psub" href="#cedolini" data-act="go" data-tab="cedolini" title="Apri i cedolini"><h4>Cedolino di ${MESE_L(cl.periodo).toLowerCase()} <small>netto ${fmt(cd.netto)}</small></h4>
    <div class="psub-in">${donut([["Netto",cd.netto,"c-liq"],["Contributi",cd.contributi,"c-fisse"],["Imposte",cd.tasse,"c-tasse"]],112,15,"Cedolino",1,cd.lordo,"lordo")}<div><ul class="pleg">${li("c-liq","Netto",cd.netto,cd.lordo)}${li("c-fisse","Contributi",cd.contributi,cd.lordo)}${li("c-tasse","Imposte",cd.tasse,cd.lordo)}</ul>
    <dl class="kv">${kv("Pagato il",dIt(cl.dataPagamento)||"—")}</dl></div></div></a>`:""}
  </div></div></div>
</section>`;};

/* ================= home: tre sezioni collegate, come l'icona ================= */
V.home=()=>{const L=S.cart?S.cart.lista:[],x=L[L.length-1];svLoad();
 const Y=String(new Date().getFullYear());let pY=0;svUsed().filter(k=>k.startsWith(Y)).forEach(k=>pY+=svTot(k).p);
 const lav=x?`saldo ${hmS(x.fatto!=null&&x.dovuto!=null?x.fatto-x.dovuto:null)} · ferie ${fN.format(x.ferie.tot!=null?x.ferie.tot:x.ferie.co.residuo+x.ferie.fs.residuo)} gg`:"nessun cartellino";
 const fin=R.dash&&hasRealData(S)?`patrimonio ${fmt(Math.round(R.dash.patrL)).replace(/,\d\d(?=\s|$)/,"")}`:"nessun dato";
 const son=svUsed().length?`prelevato ${Y} ${cE(pY).replace(/,\d\d(?=\s|$)/,"")}`:"nessun dato";
 const node=(cls,href,title,sub,ico)=>`<a class="hn ${cls}" href="#${href}"><span class="hn-c">${ico}</span><span class="hn-t">${title}</span><span class="hn-s">${sub}</span></a>`;
 return `<section class="sheet home">
 ${!hasRealData(S)?`<div class="banner">Nessun dato su questo dispositivo (succede con un browser o un telefono nuovo). Vai in <a href="#collegamenti">Collegamenti e backup</a>: imposta l'indirizzo dell'Hub, poi «Ripristina dall'ultimo backup» per le finanze e «Ripristina dal PC» per i sondaggi. Cartellini e cedolini arrivano da soli.</div>`:""}
 <div class="hgraph">
  <svg class="hlines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="M26 22 L74 22 M26 22 L50 64 M74 22 L50 64"/></svg>
  ${node("hn-lav","lavoro","Lavoro",lav,`<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>`)}
  ${node("hn-fin","dashboard","Finanze",fin,`<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 19V13M10 19V9M15 19V11M20 19V5"/></svg>`)}
  ${node("hn-son","sondaggi","Sondaggi",son,`<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5h6M8.5 10l1.5 1.5 3-3M8.5 16h7"/></svg>`)}
 </div>
 <p class="note home-n">Tocca una sezione. I dati sono collegati: le ore del cartellino diventano pagamenti nel cedolino, il netto e i prelievi dei sondaggi entrano nelle Entrate di Finanze.</p>
</section>`;};
/* ================= movimenti dei conti (estratti conto Fineco e Revolut) ================= */
/* L'Hub legge in locale gli estratti conto (cartella «Finanze private (per gestionale)») e pubblica
   GET /api/estratti/archivio: movimenti con categoria (scelta / regola imparata / automatica / da rivedere)
   e quadratura dei saldi. Qui: riepilogo del mese per categoria, lista «Da rivedere», tutti i movimenti.
   I movimenti NON entrano in S né nei backup: copia locale in localStorage «gestionale-movimenti» per l'uso offline. */
const MOV_KEY="gestionale-movimenti";
const MOV_CAT=[["stipendio","Stipendio","e"],["extra","Entrate extra","e"],
 ["casa","Casa e utenze","u"],["spesa","Spesa","u"],["svago","Ristoranti e svago","u"],["viaggi","Viaggi","u"],["carburante","Carburante","u"],["vita","Altre spese quotidiane","u"],["straord","Spese straordinarie","u"],["tasse","Tasse","u"],
 ["rimb","Rimborsi spese condivise","r"],
 ["sondaggi","Sondaggi arrivati in banca","p"],["paypal","Da PayPal (passaggio)","p"],
 ["invest","Investimenti","x"],["giro","Giroconto (tra i tuoi conti)","x"],["escl","Escluso dai conteggi","x"]];
const MOV_COL={carburante:"c-carb",stipendio:"c-ent",sondaggi:"c-ent",paypal:"c-fin",amz:"c-liq",extra:"c-liq",casa:"c-aff",spesa:"c-risp",svago:"c-etf",viaggi:"c-rev",vita:"c-spese",straord:"c-fisse",tasse:"c-tasse",rimb:"c-ent",invest:"c-inv",giro:"c-fin",escl:"muted"};
const MOV_COND_OK=["casa","spesa","svago","viaggi","carburante","vita","straord"];
const movLbl=k=>(MOV_CAT.find(c=>c[0]===k)||[k,"Da classificare"])[1];
let MOV=null,MOV_M=null,MOV_BUSY=false,MOV_ERR="",MOV_ALL=false,MOV_REG=false,MOV_Q="",MOV_FC="*";const MOV_PEND={}; // scelte non ancora confermate in «Da rivedere» (sopravvivono ai render)
function movLoad(){if(MOV)return MOV;try{MOV=JSON.parse(lsGet(MOV_KEY)||"null");}catch(e){MOV=null;}return MOV;}
function movStore(d){MOV=d;try{lsSet(MOV_KEY,JSON.stringify(d));}catch(e){}}
async function movSync(manual,path,body){
 if(MOV_BUSY||!hubUrl()){if(manual&&!hubUrl())linkMsg("mov","Serve l'indirizzo dell'Hub.");return;}
 MOV_BUSY=true;if(manual)linkMsg("mov","Leggo gli estratti conto dal PC…");
 try{const r=path?await hubFetch(path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body||{})}):await hubFetch("/api/estratti/archivio");
  const prima=JSON.stringify(movLoad()&&movLoad().movimenti||[]);movStore(r);MOV_ERR="";if(!READONLY&&applyEstrSaldi()){save();if(current!=="mese")afterExternalChange();}
  if(manual)linkMsg("mov",r.movimenti.length+" movimenti letti.");
  if(current==="mese"||(current==="dashboard"&&JSON.stringify(r.movimenti)!==prima))afterExternalChange();}
 catch(e){MOV_ERR=e.message;if(manual)linkMsg("mov","Estratti conto non letti: "+e.message+".");if(current==="mese")afterExternalChange();}
 finally{MOV_BUSY=false;refreshLinks();}}
const movMesi=()=>{const d=movLoad();return d?[...new Set(d.movimenti.map(m=>m.data.slice(0,7)))].sort():[];};
function movRiep(ym){const d=movLoad(),o={};MOV_CAT.forEach(([k])=>o[k]=0);o[""]=0;
 (d?d.movimenti:[]).filter(m=>m.data.startsWith(ym)).forEach(m=>{o[m.cat||""]=(o[m.cat||""]||0)+m.importo;});return o;}
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
 return{o,R,G,aff,cond,alloc,net,nonRip:R>0?rest:R,sv,amz,pa,ppx,te:sum(MOV_CAT.filter(c=>c[2]==="e").map(([c])=>o[c]))+sv.tot+ppx,tu:sum(MOV_CAT.filter(c=>c[2]==="u").map(([c])=>o[c]))-amz,
  nonArr:sv.banca-(o.sondaggi||0)+sv.paypal+ppx-(o.paypal||0)};}
/* sondaggi (proposta A, v25): l'app Guadagni fa fede. I prelievi del mese per portale si dividono per canale di pagamento
   (S.sondCanali: banca | paypal | amazon; non indicato = banca). Gli accrediti in banca dai portali («sondaggi») e i
   trasferimenti da PayPal («paypal») sono passaggi, non entrate; i buoni Amazon sono entrata + uscita di pari importo. */
const SOND_CAN=[["banca","Banca"],["paypal","PayPal"],["amazon","Buono Amazon"]];
/* entrate extra via PayPal (regola di Marco, v27): atteso da PayPal = prelievi sondaggi non Amazon (banca+PayPal, app)
   − accrediti diretti dei portali in banca («sondaggi») + residuo ancora atteso dal mese prima. Se da PayPal arriva più
   dell'atteso, la differenza è entrata extra ottenuta via PayPal; se arriva meno, il resto passa al mese dopo (residuo). */
function ppAuto(ym){const L=movMesi().filter(m=>m<=ym);let res=0,r=null;
 L.forEach(m=>{const sv=sondMese(m),o=movRiep(m),prima=res,att=sv.banca+sv.paypal-(o.sondaggi||0)+prima,arr=o.paypal||0;
  res=Math.max(att-arr,0);r={prima,att,arr,extra:Math.max(arr-Math.max(att,0),0),res};});
 return r||{prima:0,att:0,arr:0,extra:0,res:0};}
function sondMese(ym){svLoad();const r={banca:0,paypal:0,amazon:0,tot:0,senza:[]};
 SV.sites.forEach(s=>{const v=svGet(ym,s.id,"p")/100;if(!v)return;const c=(S.sondCanali||{})[s.id];r[c||"banca"]+=v;r.tot+=v;if(!c)r.senza.push(s.name);});return r;}
/* saldi di fine mese dagli estratti conto (v28, decisione di Marco): per ogni mese concluso con estratti, Patrimonio ›
   Revolut = conto + deposito Revolut, Fineco = conto Fineco + conto deposito vincolato (S.vincolato.fineco, inserito a
   mano: non compare nell'estratto; finché è vuoto Fineco resta manuale). Un conto senza movimenti nel mese tiene il
   saldo del mese prima. Celle riempite in sola lettura («estratto»); mesi in S.patEstr. */
function applyEstrSaldi(){const d=movLoad();if(!d||!Array.isArray(d.quadratura))return false;
 const cur=new Date().toLocaleDateString("sv-SE").slice(0,7),last={},per={};
 d.quadratura.slice().sort((a,b)=>a.mese.localeCompare(b.mese)).forEach(q=>{(per[q.mese]=per[q.mese]||{})[q.conto]=q;});
 const mesi=Object.keys(per).sort(),prima=JSON.stringify([S.patrimonio,S.patEstr]),cov=new Set();
 mesi.forEach(ym=>{Object.entries(per[ym]).forEach(([c,q])=>{if(q.fine!=null&&!q.parziale)last[c]=q.fine;});
  if(ym>=cur)return;const [Y,M]=ym.split("-"),m=+M-1;let ok=false;
  const set=(k,v)=>{if(!S.patrimonio[Y])S.patrimonio[Y]=blankPat();S.patrimonio[Y][m][k]=Math.round(v*100)/100;ok=true;};
  if(last.Revolut!=null||last["Revolut deposito"]!=null)set("revolut",(last.Revolut||0)+(last["Revolut deposito"]||0));
  const vv=vincAt(ym);if(last.Fineco!=null&&vv!=null&&!(per[ym].Fineco&&per[ym].Fineco.parziale))set("fineco",last.Fineco+vv);
  if(ok)cov.add(ym);});
 S.patEstr=[...new Set([...(S.patEstr||[]),...cov])].sort();
 return JSON.stringify([S.patrimonio,S.patEstr])!==prima;}
const vincAt=ym=>{let v=null;((S.vincolato||{}).fineco||[]).forEach(r=>{if(r.da<=ym)v=r.importo;});return v;};
const estCovers=(Y,m,k)=>(S.patEstr||[]).includes(`${Y}-${String(m+1).padStart(2,"0")}`)&&(k==="revolut"||vincAt(`${Y}-${String(m+1).padStart(2,"0")}`)!=null);
const estCell=(Y,m,k,path)=>estCovers(Y,m,k)?`<span class="est-c" title="Saldo di fine mese dall'estratto conto">${fmt(getP(S,path))}<span class="nm">estratto</span></span>`:inp(path);
/* riquadro nella dashboard di Finanze */
function movPsub(){const d=movLoad();if(!d||!d.movimenti.length)return "";const L=movMesi(),ym=L[L.length-1],N=movNetto(ym),o=N.o,mn=MESE_L(ym).toLowerCase();
 const nr=d.movimenti.filter(m=>m.rivedere).length,usc=MOV_CAT.filter(c=>c[2]==="u").map(([k,l])=>[l,Math.max(-N.net[k],0),MOV_COL[k]]).filter(x=>x[1]>0),tu=sum(usc.map(x=>x[1]));
 return `<a class="psub" href="#mese" data-act="go" data-tab="mese" data-mm="${ym}" title="Apri il resoconto del mese"><h4>Uscite dai conti · ${mn} <small>${nr?nr+" da rivedere":"tutto classificato"}</small></h4>
  <div class="psub-in">${donut(usc,112,15,"Uscite di "+mn,1,tu,"uscite")}<div><ul class="pleg">${usc.map(([l,v,c])=>li(c,l,v,tu)).join("")||`<li><span class="muted">Nessuna uscita</span></li>`}</ul>
  <dl class="kv">${kv("Entrate del mese",`<span class="nt-ent">${fmt(N.te)}</span>`)}${N.R?kv("Rimborsi spese condivise",`<span class="nt-ent">${fmt(N.R,"sign")}</span>${N.G>0?" <small>ripartiti (stima)</small>":""}`):""}${o[""]?kv("Da classificare",fmt(o[""])):""}</dl></div></div></a>`;}
function movBody(ymSel,parts){parts=parts||{};const d=movLoad(),L=movMesi();
 if(!d)return `<div class="banner">${MOV_ERR?"Estratti conto non letti: "+esc(MOV_ERR)+".":hubUrl()?"Lettura in corso… se non compare nulla, controlla che l'Hub sul PC fisso sia aggiornato.":"Imposta l'indirizzo dell'Hub in <a href=\"#collegamenti\">Collegamenti e backup</a>."}</div><div class="actions"><button class="btn" data-act="mov-agg">Aggiorna</button></div>`;
 if(!L.includes(ymSel))return `<div class="banner">Nessun estratto conto per ${MESE_L(ymSel).toLowerCase()}.</div><div class="actions"><button class="btn ghost" data-act="mov-agg">Aggiorna dal PC</button></div><p class="note" id="lk-mov-msg" ${linkMsgs.mov?"":"hidden"}>${linkMsgs.mov||""}</p>`;
 const ym=ymSel,k=L.indexOf(ym),N=movNetto(ym),o=N.o,mv=d.movimenti.filter(m=>m.data.startsWith(ym));
 const E=MOV_CAT.filter(c=>c[2]==="e"),U=MOV_CAT.filter(c=>c[2]==="u"),X=MOV_CAT.filter(c=>c[2]==="x"),P=MOV_CAT.filter(c=>c[2]==="p");
 const te=N.te,tu=N.tu,tn=tu+N.R;
 const q=(d.quadratura||[]).filter(x=>x.mese===ym);
 const qc=x=>`<span class="mq ${x.ok===true?"ok":x.ok===false?"ko":"na"}" title="${x.ok===false&&x.differenza!=null?"differenza "+fmt(x.differenza):""}">${esc(x.conto)} ${x.ok===true?"✓ quadra":x.ok===false?"⚠ non quadra"+(x.differenza!=null?" ("+fmt(x.differenza,"sign")+")":""):"· primo mese, non verificabile"}${x.parziale?" · file parziale":""}<small>${fmt(x.inizio)} → ${fmt(x.fine)}</small></span>`;
 const opt=(sel,prop)=>`<option value="">— scegli —</option>${MOV_CAT.map(([c,l])=>`<option value="${c}" ${c===(sel||prop)?"selected":""}>${l}</option>`).join("")}`;
 const riv=d.movimenti.filter(m=>m.rivedere&&m.data.startsWith(ym)),rivAll=d.movimenti.filter(m=>m.rivedere).length;
 const regK=new Set((d.regole||[]).map(r=>r.chiave)),pend=m=>MOV_PEND[m.id]||{};
 const riga=(m,edit)=>`<div class="mvr${m.importo>0?" in":""}" data-c="${m.cat||""}" data-q="${esc(((m.descr||"")+" "+(m.dett||"")+" "+m.tipo+" "+m.conto).toLowerCase())}"><span class="mvd">${dIt(m.data).slice(0,5)}</span><span class="mvt"><b>${esc(m.descr||m.tipo)}</b><small>${esc(m.conto)} · ${esc(m.tipo)}${m.orig==="regola"?" · regola":""}${m.orig==="scelta"?" · scelta tua":""}</small>${m.dett&&m.dett!==m.descr?`<em>${esc(m.dett)}</em>`:""}</span><span class="mvi">${fmt(m.importo,"sign")}</span>
  ${edit?`<span class="mve"><select class="in sel mv-cat" data-id="${m.id}" aria-label="Categoria">${opt(pend(m).cat!=null?pend(m).cat:(m.proposta||m.cat))}</select><label class="mvk" title="Usa la stessa categoria per i prossimi movimenti con questa controparte"><input type="checkbox" class="mv-ric" data-id="${m.id}" ${(pend(m).ric!=null?pend(m).ric:m.proposta!=="straord")?"checked":""}> sempre</label><button class="btn sm" data-act="mov-ok" data-id="${m.id}">✓</button></span>`
   :`<span class="mve"><select class="in sel mv-set" data-id="${m.id}" aria-label="Categoria">${opt(m.cat)}</select><label class="mvk" title="Spuntato: questa controparte ha una regola e i suoi movimenti si classificano da soli"><input type="checkbox" class="mv-ric2" data-id="${m.id}" ${regK.has(m.chiave)?"checked":""}> sempre${regK.has(m.chiave)&&m.orig==="scelta"?" <small>(eccezione)</small>":""}</label></span>`}</div>`;
 {const mn=MESE_L(ym).toLowerCase();
  const usc=MOV_CAT.filter(c=>c[2]==="u").map(([k,l])=>[l+(N.alloc[k]?" ≈":""),Math.max(-N.net[k],0),MOV_COL[k]]).concat(N.amz?[["Acquisti con buoni Amazon",N.amz,MOV_COL.amz]]:[]).filter(x=>x[1]>0.005);
  const ent=[["Stipendio",Math.max(o.stipendio||0,0),"c-ent"],["Sondaggi",N.sv.tot,"c-etf"],["Entrate extra",Math.max(o.extra||0,0),"c-liq"],["Extra via PayPal",N.ppx,"c-rev"]].filter(x=>x[1]>0.005);
  const tU=sum(usc.map(x=>x[1])),tE=sum(ent.map(x=>x[1]));
  const card=(t,arr,tot,lab)=>`<div class="box mvpie"><h3>${t} <small>${mn}</small></h3><div class="mvpie-in">${donut(arr,150,18,t+" di "+mn,1,tot,lab)}<ul class="pleg">${arr.map(([l,v,c])=>li(c,l,v,tot)).join("")||`<li><span class="muted">Nessun dato</span></li>`}</ul></div></div>`;
  parts.pies=[card("Entrate",ent,tE,"entrate"),card("Uscite",usc,tU,"uscite nette")];}
 {const r=[];const v=(l,x,cl)=>Math.abs(x)>0.005?r.push(kv(l,`<span class="${cl||""}">${fmt(x,"sign")}</span>`)):0;
  if(N.R)r.push(kv(`Rimborsi spese condivise <small>${N.aff?"quota affitto "+fmt(N.aff)+" a casa e utenze":""}${N.R-N.aff-N.nonRip>0.005?(N.aff?"; ":"")+"il resto in parti uguali tra "+N.cond.filter(c=>N.alloc[c]-(c==="casa"?N.aff:0)>0.005).map(movLbl).join(", ").toLowerCase():""}${N.nonRip>0.005?"; "+fmt(N.nonRip)+" non ripartiti":""}: già tolti dalle uscite</small>`,`<span class="nt-ent">${fmt(N.R,"sign")}</span>`));
  if(N.R)v("Uscite lorde dai conti <small>prima dei rimborsi</small>",tu,"nt-spese");
  v("Sondaggi arrivati in banca <small>passaggio: già contati nei sondaggi</small>",o.sondaggi||0);
  v("Da PayPal <small>passaggio</small>",o.paypal||0);
  v("Investimenti dai conti",o.invest||0,"nt-inv");v("Giroconti",o.giro||0);v("Esclusi dai conteggi",o.escl||0);v("Da classificare",o[""]||0,"neg");
  v(`Di cui non (ancora) sui conti <small>${N.nonArr>0?"sondaggi prelevati non ancora arrivati (su PayPal o in viaggio)":"arrivati sondaggi prelevati nei mesi precedenti"}</small>`,N.nonArr);
  parts.altri=r.join("");parts.netto=kv("Entrate − uscite nette dai conti <small>con le entrate dei conti, non quelle registrate</small>",`<span class="${te+tn<0?"neg":"pos"}">${fmt(te+tn,"sign")}</span>`);parts.ok=true;}
 const tr=(c,l)=>`<tr><td>${svDotC(MOV_COL[c])}${l}</td><td class="${o[c]<0?"nt-spese":o[c]>0?"nt-ent":""}">${o[c]?fmt(o[c],"sign"):"—"}</td></tr>`;
 const tu_=(c,l)=>N.alloc[c]?`<tr><td>${svDotC(MOV_COL[c])}${l}<small>lorda ${fmt(o[c],"sign")} · rimborsi ${c==="casa"&&N.aff?`quota affitto ${fmt(N.aff,"sign")}${N.alloc[c]-N.aff>0.005?" + ≈ "+fmt(N.alloc[c]-N.aff,"sign"):""}`:"≈ "+fmt(N.alloc[c],"sign")}</small></td><td class="nt-spese">≈ ${fmt(N.net[c],"sign")}</td></tr>`:tr(c,l);
 return ` <div class="mqs">${q.map(qc).join("")||`<span class="mq na">Quadratura non disponibile</span>`}</div>
 ${riv.length?`<div class="box mv-riv"><h3>Da rivedere <small>${riv.length} in ${MESE_L(ym).toLowerCase()}${rivAll>riv.length?" · "+rivAll+" in tutto":""}</small></h3>
  <p class="note">Scegli la categoria e conferma con ✓. Con «sempre» tutti i movimenti della stessa controparte, anche di questo mese, prendono quella categoria, tranne quelli che hai già impostato a mano.</p>
  <details class="mvhelp"><summary>Come scegliere</summary><p class="note">Le uscite di vita quotidiana sopra ${fmt(d.soglia||300)} sono proposte come spese straordinarie. I soldi che ti restituisce chi divide le spese con te vanno in «Rimborsi spese condivise»: non sono entrate, riducono le spese delle categorie che dividete. Spostamenti tra i tuoi conti: «Giroconto». Quello che non vuoi contare: «Escluso dai conteggi».</p></details>
  <div class="mvl">${riv.map(m=>riga(m,true)).join("")}</div><div class="actions"><button class="btn" data-act="mov-okall">✓ Conferma tutte le proposte visibili</button></div></div>`
  :`<div class="banner sond-b">Tutti i movimenti di ${MESE_L(ym).toLowerCase()} sono classificati.${rivAll?` Ne restano ${rivAll} da rivedere in altri mesi.`:""}</div>`}
 <div class="grid mvgrid">
  <div class="box"><h3>Per conto</h3><dl class="kv">${["Fineco","Revolut","Revolut deposito"].map(c=>{const s=mv.filter(m=>m.conto===c);return s.length?kv(c+` <small>${s.length} movimenti</small>`,fmt(sum(s.map(m=>m.importo)),"sign")):"";}).join("")}</dl>
   <p class="note">File letti: ${(d.file||[]).length}${(d.errori||[]).length?` · <span class="neg">${d.errori.length} illeggibili: ${d.errori.map(e=>esc(e.file)).join(", ")}</span>`:""}. Ultima lettura sul PC: ${d.aggiornato?fmtWhen(Date.parse(d.aggiornato)):"—"}.</p>
   <div class="actions"><button class="btn ghost" data-act="mov-agg">Aggiorna dal PC</button></div><p class="note" id="lk-mov-msg" ${linkMsgs.mov?"":"hidden"}>${linkMsgs.mov||""}</p></div>
  <div class="box"><h3>Spese che dividete</h3><div class="mvcond">${MOV_COND_OK.map(c=>`<label><input type="checkbox" class="mv-cond" value="${c}" ${(S.movCond||[]).includes(c)?"checked":""} ${READONLY?"disabled":""}> ${movLbl(c)}</label>`).join("")}</div>
   <p class="note">Dai rimborsi del mese si toglie prima la quota d'affitto (${affQuota(ym)?fmt(affQuota(ym)):"spesa fissa mensile «Affitto»"}), che va tutta a «Casa e utenze»; il resto si divide in parti uguali tra le categorie spuntate, senza superare quanto hai speso in ciascuna. Le cifre con ≈ sono stime; il totale delle uscite nette è esatto.</p></div>
  <div class="box"><h3>Sondaggi e PayPal <small>${MESE_L(ym).toLowerCase()}</small></h3>${(()=>{const sv=N.sv,Lp=L.filter(m=>m<=ym);
   const pa=N.pa;
   return `<dl class="kv">${kv("Prelevati nell'app Guadagni",fmt(sv.tot)+(sv.amazon?` <small>di cui buoni Amazon ${fmt(sv.amazon)}</small>`:""))}${kv("Prelievi non Amazon <small>banca + PayPal</small>",fmt(sv.banca+sv.paypal))}${kv("− arrivati in banca dai portali",fmt(-(o.sondaggi||0),"sign"))}${pa.prima?kv("+ ancora atteso dal mese prima",fmt(pa.prima,"sign")):""}${kv("= Atteso da PayPal",fmt(pa.att))}${kv("Arrivato da PayPal",fmt(pa.arr))}${kv("Entrate extra via PayPal <small>arrivato oltre l'atteso</small>",`<span class="${pa.extra?"nt-ent":""}">${fmt(pa.extra)}</span>`)}${kv("Ancora da arrivare <small>passa al mese dopo</small>",fmt(pa.res))}</dl>
   ${sv.senza.length?`<p class="note neg">Canale non indicato per ${sv.senza.map(esc).join(", ")}: contati come banca. Indicalo qui sotto.</p>`:""}
   <details class="mvhelp" ${sv.senza.length?"open":""}><summary>Come paga ogni portale</summary><div class="mvcan">${SV.sites.map(x=>`<label><span>${esc(x.name)}</span><select class="in sel mv-canale" data-site="${esc(x.id)}" ${READONLY?"disabled":""}>${(S.sondCanali||{})[x.id]?"":`<option value="" selected>da indicare (ora: banca)</option>`}${SOND_CAN.map(([k,l])=>`<option value="${k}" ${(S.sondCanali||{})[x.id]===k?"selected":""}>${l}</option>`).join("")}</select></label>`).join("")}</div></details>`;})()}</div>
 </div>
 <details class="more" ${MOV_ALL?"open":""} id="mov-all"><summary>Tutti i movimenti di ${MESE_L(ym).toLowerCase()} (${mv.length})</summary><p class="note">Cambia la categoria dal menu. «sempre» spuntato = la controparte ha una regola e i suoi movimenti (passati, del mese e futuri) si classificano da soli, tranne quelli che hai impostato a mano: spuntalo per crearla, toglilo per eliminarla. Se cambi la categoria di un movimento con regola ti chiede se cambiare la regola o solo quel movimento.</p>
  <div class="mvf"><input class="in" type="search" id="mov-q" placeholder="Cerca (es. Coop, Rachele…)" value="${esc(MOV_Q)}" aria-label="Cerca nei movimenti"><select class="in sel" id="mov-fc" aria-label="Filtra per categoria"><option value="*">Tutte le categorie</option>${MOV_CAT.map(([c,l])=>`<option value="${c}" ${c===MOV_FC?"selected":""}>${l}</option>`).join("")}<option value="" ${MOV_FC===""?"selected":""}>Da classificare</option></select><span class="mvn" id="mov-n"></span></div>
  <div class="mvl" id="mov-list">${mv.map(m=>riga(m,false)).join("")}</div></details>
 ${(d.regole||[]).length?`<details class="more" ${MOV_REG?"open":""} id="mov-reg"><summary>Regole imparate (${d.regole.length})</summary><p class="note">Ogni regola classifica da sola i movimenti di quella controparte (anche del mese in corso), tranne quelli che hai impostato a mano (eccezioni). Cambiala dal menu o toglila con ×: i movimenti senza scelta manuale tornano alla classificazione automatica o «da rivedere».</p>
  <div class="mvl">${d.regole.map((r,i)=>`<div class="mvr"><span class="mvd">${r.n}×</span><span class="mvt"><b>${esc(r.descr)}</b><small>${esc(r.conto)}${r.tipo?" · "+esc(r.tipo):""}${(n=>n?` · ${n} ${n>1?"eccezioni":"eccezione"} impostat${n>1?"e":"a"} a mano`:"")(d.movimenti.filter(m=>m.chiave===r.chiave&&m.orig==="scelta").length)}</small></span><span></span><span class="mve"><select class="in sel mv-rule" data-ri="${i}" aria-label="Categoria della regola">${MOV_CAT.map(([c,l])=>`<option value="${c}" ${c===r.cat?"selected":""}>${l}</option>`).join("")}</select><button class="icon-btn" data-act="mov-rdel" data-ri="${i}" aria-label="Togli la regola" title="Togli la regola">×</button></span></div>`).join("")}</div></details>`:""}
`;}
function movFiltra(){const L=document.getElementById("mov-list");if(!L)return;const q=MOV_Q.trim().toLowerCase();let n=0,t=0;
 L.querySelectorAll(".mvr").forEach(r=>{t++;const ok=(MOV_FC==="*"||r.dataset.c===MOV_FC)&&(!q||r.dataset.q.includes(q));r.hidden=!ok;if(ok)n++;});
 const c=document.getElementById("mov-n");if(c)c.textContent=n===t?"":n+" di "+t;}
view.addEventListener("input",e=>{if(e.target.id==="mov-q"){MOV_Q=e.target.value;movFiltra();}});
const svDotC=c=>`<i class="sv-dot" style="background:var(--${c})"></i>`;
async function movClassifica(voci){if(!voci.length)return;voci.forEach(v=>{if(v.id)delete MOV_PEND[v.id];});await movSync(false,"/api/estratti/classifica",{voci});
 if(MOV_ERR)alert("Classificazione non salvata: "+MOV_ERR);}
view.addEventListener("click",e=>{const b=e.target.closest("[data-act^='mov-']");if(!b)return;e.preventDefault();const a=b.dataset.act;
 if(a==="mov-agg"){movSync(true,"/api/estratti/aggiorna",{});return;}
 if(a==="mov-m"){const L=movMesi(),k=L.indexOf(MOV_M)+ +b.dataset.d;if(L[k]){MOV_M=L[k];render();}return;}
 const voce=id=>{const m=movLoad().movimenti.find(x=>x.id===id),s=document.querySelector(`.mv-cat[data-id="${id}"]`),r=document.querySelector(`.mv-ric[data-id="${id}"]`);
  return m&&s&&s.value?{id,chiave:m.chiave,cat:s.value,ricorda:!!(r&&r.checked)}:null;};
 if(a==="mov-ok"){const v=voce(b.dataset.id);if(!v){const s=document.querySelector(`.mv-cat[data-id="${b.dataset.id}"]`);if(s)s.focus();return;}movClassifica([v]);return;}
 if(a==="mov-rdel"){const r=(movLoad().regole||[])[+b.dataset.ri];if(r&&confirm("Togliere la regola per «"+r.descr+"»?"))movClassifica([{chiave:r.chiave,cat:"",ricorda:true}]);return;}
 if(a==="mov-okall"){movClassifica([...document.querySelectorAll(".mv-cat")].map(s=>voce(s.dataset.id)).filter(Boolean));return;}});
view.addEventListener("change",e=>{const t=e.target;
 if(t.id==="mov-sel"){MOV_M=t.value;render();return;}
 if(t.id==="mov-fc"){MOV_FC=t.value;movFiltra();return;}
 if(t.classList&&t.classList.contains("mv-canale")){if(READONLY)return;if(!t.value)return;S.sondCanali=Object.assign({},S.sondCanali,{[t.dataset.site]:t.value});scheduleSave();render();return;}
 if(t.classList&&t.classList.contains("mv-cond")){if(READONLY)return;S.movCond=[...document.querySelectorAll(".mv-cond")].filter(x=>x.checked).map(x=>x.value);scheduleSave();render();return;}
 if(t.classList&&(t.classList.contains("mv-cat")||t.classList.contains("mv-ric"))){const id=t.dataset.id,P=MOV_PEND[id]=MOV_PEND[id]||{};
  if(t.classList.contains("mv-cat"))P.cat=t.value;else P.ric=t.checked;return;}
 if(t.classList&&t.classList.contains("mv-set")){const d=movLoad(),m=d.movimenti.find(x=>x.id===t.dataset.id);if(!m)return;
  const haRegola=(d.regole||[]).some(r=>r.chiave===m.chiave);
  /* controparte con regola: si chiede se cambiare tutti i suoi movimenti o solo questo (eccezione) */
  const tutti=haRegola&&t.value!==""&&confirm(`«${m.descr}» ha una regola. Cambiare la regola?\n\nOK = cambia la regola: vale per tutti i suoi movimenti, tranne quelli che hai impostato a mano · Annulla = solo questo movimento (eccezione)`);
  movClassifica([{id:m.id,chiave:m.chiave,cat:t.value,ricorda:tutti}]);return;}
 if(t.classList&&t.classList.contains("mv-ric2")){const d=movLoad(),m=d.movimenti.find(x=>x.id===t.dataset.id);if(!m)return;
  if(t.checked){if(!m.cat){alert("Scegli prima la categoria dal menu.");t.checked=false;return;}
   movClassifica([{chiave:m.chiave,cat:m.cat,ricorda:true}]);return;}
  if(!confirm(`Togliere la regola per «${m.descr}»? Gli altri suoi movimenti torneranno alla classificazione automatica o «da rivedere»; questo resta «${movLbl(m.cat)}».`)){t.checked=true;return;}
  movClassifica([{chiave:m.chiave,cat:"",ricorda:true},{id:m.id,cat:m.cat}]);return;}
 if(t.classList&&t.classList.contains("mv-rule")){const r=(movLoad().regole||[])[+t.dataset.ri];if(r)movClassifica([{chiave:r.chiave,cat:t.value,ricorda:true}]);}});
view.addEventListener("toggle",e=>{if(e.target.id==="mov-all")MOV_ALL=e.target.open;if(e.target.id==="mov-reg")MOV_REG=e.target.open;},true);

/* ================= tema chiaro / scuro ================= */
/* senza scelta segue il sistema; la scelta resta in localStorage «gestionale-tema» (applicata già in index.html prima del CSS) */
const THEME_KEY="gestionale-tema",themeMQ=window.matchMedia?matchMedia("(prefers-color-scheme: dark)"):null;
const themeCur=()=>{const t=document.documentElement.getAttribute("data-theme");return t==="dark"||t==="light"?t:(themeMQ&&themeMQ.matches?"dark":"light");};
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
 svLoad();render();refreshLinks();
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
