(function(){
  const DEFAULT_SITES = [
    {id:"sermo",  name:"Sermo",              color:"#3E6FD8"},
    {id:"m3",     name:"M3 Global Research", color:"#2BA39A"},
    {id:"agc",    name:"AllGlobalCircle",    color:"#9A5BD6"},
    {id:"hab",    name:"HabCentral",         color:"#D88A2E"},
    {id:"zoomrx", name:"ZoomRx",             color:"#D4547A"}
  ];
  const PALETTE = ["#3E6FD8","#2BA39A","#9A5BD6","#D88A2E","#D4547A","#4E9A3A","#C0453A","#2E8DB8","#8A6D3B","#6B5BD6","#B8478F","#5A7A8C"];
  let SITES = DEFAULT_SITES.map(s=>({...s}));
  function sanitizeSites(arr){
    if(!Array.isArray(arr)||!arr.length) return DEFAULT_SITES.map(s=>({...s}));
    const out=[],seen=new Set();
    arr.forEach((s,i)=>{
      if(!s||typeof s.id!=="string"||!/^[a-z0-9_-]{1,48}$/.test(s.id)||seen.has(s.id)) return;
      const name=String(s.name||"").trim().slice(0,40)||s.id;
      const color=/^#[0-9a-fA-F]{6}$/.test(s.color||"")?s.color:PALETTE[i%PALETTE.length];
      seen.add(s.id);out.push({id:s.id,name,color});
    });
    return out.length?out:DEFAULT_SITES.map(s=>({...s}));
  }
  function addSite(name){
    name=String(name||"").trim().slice(0,40);
    if(!name) return "Scrivi il nome della piattaforma";
    if(SITES.some(s=>s.name.toLowerCase()===name.toLowerCase())) return "Esiste già una piattaforma con questo nome";
    const slug=(name.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,24))||"p";
    const used=new Set(SITES.map(s=>s.color));
    const color=PALETTE.find(c=>!used.has(c))||PALETTE[SITES.length%PALETTE.length];
    SITES.push({id:slug+"-"+Date.now().toString(36),name,color});
    scheduleSave();renderAll();return "";
  }
  function removeSite(s){
    if(SITES.length<=1){alert("Serve almeno una piattaforma");return}
    let g=0,p=0;Object.keys(state.months).forEach(k=>{g+=get(k,s.id,"g");p+=get(k,s.id,"p")});
    const msg=(g||p)
      ?"Rimuovere "+s.name+"? Verranno eliminati anche i suoi importi (guadagni "+fmt(g)+", prelievi "+fmt(p)+"). Conviene scaricare prima un backup."
      :"Rimuovere "+s.name+"?";
    if(!confirm(msg)) return;
    SITES=SITES.filter(x=>x.id!==s.id);
    state.pending=(state.pending||[]).filter(x=>x.site!==s.id);
    Object.keys(state.months).forEach(k=>{if(state.months[k])delete state.months[k][s.id]});
    scheduleSave();renderAll();
  }
  const MESI = ["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];
  const MESI_BREVI = ["gen","feb","mar","apr","mag","giu","lug","ago","set","ott","nov","dic"];
  const LS_KEY = "survey-earnings-tracker-v1";

  let state = {v:1, months:{}, pending:[]};   // importi in centesimi
  const now = new Date();
  let cur = key(now.getFullYear(), now.getMonth());
  let yearFilter = "all";
  let lastSavedAt = null;
  let tipKey = null, lastPointer = "mouse";

  const $ = id => document.getElementById(id);
  const eur = new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR"});
  const fmt = c => eur.format((c||0)/100);
  function key(y,m){return y+"-"+String(m+1).padStart(2,"0")}
  function parseKey(k){const [y,m]=k.split("-").map(Number);return {y,m:m-1}}
  function label(k){const {y,m}=parseKey(k);return MESI[m].charAt(0).toUpperCase()+MESI[m].slice(1)+" "+y}
  function shift(k,d){const {y,m}=parseKey(k);const dt=new Date(y,m+d,1);return key(dt.getFullYear(),dt.getMonth())}
  function toCents(str){
    if(str==null) return NaN;
    let s=String(str).trim().replace(/[€\s]/g,"");
    if(!s) return NaN;
    if(s.includes(",")) s=s.replace(/\./g,"").replace(",",".");
    const n=Number(s);
    return isFinite(n)?Math.round(n*100):NaN;
  }
  function cell(k,site){
    state.months[k]=state.months[k]||{};
    state.months[k][site]=state.months[k][site]||{g:0,p:0};
    return state.months[k][site];
  }
  function get(k,site,f){return (state.months[k]&&state.months[k][site]&&state.months[k][site][f])||0}
  function monthTot(k){let g=0,p=0;SITES.forEach(s=>{g+=get(k,s.id,"g");p+=get(k,s.id,"p")});return {g,p}}
  function usedMonths(){
    return Object.keys(state.months).filter(k=>{const t=monthTot(k);return t.g||t.p}).sort();
  }
  function setStatus(t){$("status").textContent=t}

  /* ---------- Persistenza ---------- */
  let saveTimer=null, saving=false, pending=false;
  function scheduleSave(){clearTimeout(saveTimer);setStatus("Modifiche non salvate…");saveTimer=setTimeout(save,600)}
  async function save(){
    if(saving){pending=true;return}
    saving=true;
    const payload={v:1,sites:SITES,months:clean(state.months),pending:cleanPending(state.pending),updatedAt:new Date().toISOString()};
    try{
      lastSavedAt=payload.updatedAt;
      localStorage.setItem(LS_KEY,JSON.stringify(payload));
      setStatus("Salvato su questo dispositivo");
      if(typeof scheduleHub==="function") scheduleHub();
    }catch(e){setStatus("Salvataggio non riuscito ("+(e&&e.message||"errore")+"): riprovo alla prossima modifica")}
    saving=false;
    if(pending){pending=false;save()}
  }
  function clean(months){
    const out={};
    Object.keys(months).forEach(k=>{
      if(!/^\d{4}-\d{2}$/.test(k)) return;
      const row={};
      SITES.forEach(s=>{const c=months[k]&&months[k][s.id];if(c&&(c.g||c.p))row[s.id]={g:Math.round(+c.g||0),p:Math.round(+c.p||0)}});
      if(Object.keys(row).length) out[k]=row;
    });
    return out;
  }
  function applyData(d){
    SITES=sanitizeSites(d.sites);
    state={v:1,months:clean(d.months||{}),pending:cleanPending(d.pending)};
  }
  async function init(){
    renderAll();
    try{
      const raw=localStorage.getItem(LS_KEY);
      if(raw) applyData(JSON.parse(raw));
      setStatus("Dati salvati su questo dispositivo");
      // Chiede al browser di non cancellare i dati in caso di spazio scarso
      if(navigator.storage&&navigator.storage.persist) navigator.storage.persist().catch(()=>{});
    }catch(e){setStatus("Salvataggio non disponibile: scarica un backup per non perdere i dati")}
    renderAll();
    // Sincronizza se il tracker è aperto in più schede
    window.addEventListener("storage",e=>{
      if(e.key!==LS_KEY||!e.newValue) return;
      let nv;try{nv=JSON.parse(e.newValue)}catch(err){return}
      if(nv.updatedAt===lastSavedAt) return;
      if(document.activeElement&&document.activeElement.tagName==="INPUT") return;
      applyData(nv);renderAll();setStatus("Aggiornato da un'altra scheda");
    });
  }

  /* ---------- Importi in attesa di approvazione ---------- */
  const openPend=new Set(); let confirmingId=null;
  function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e}
  function todayISO(){const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}
  function fmtDate(iso){const [y,m,d]=iso.split("-");return d+"/"+m+"/"+y}
  function cleanPending(arr){
    if(!Array.isArray(arr)) return [];
    const ids=new Set(SITES.map(s=>s.id)),seen=new Set();
    return arr.filter(x=>x&&typeof x.id==="string"&&!seen.has(x.id)&&ids.has(x.site)&&Number.isFinite(+x.amount)&&+x.amount>0)
      .map(x=>{seen.add(x.id);return {id:x.id.slice(0,40),site:x.site,amount:Math.round(+x.amount),note:String(x.note||"").slice(0,80),date:/^\d{4}-\d{2}-\d{2}$/.test(x.date||"")?x.date:todayISO()}});
  }
  function pendSum(site){return (state.pending||[]).filter(x=>x.site===site).reduce((a,x)=>a+x.amount,0)}
  function pendTotal(){return (state.pending||[]).reduce((a,x)=>a+x.amount,0)}
  function pendingBox(s){
    const items=(state.pending||[]).filter(x=>x.site===s.id);
    const open=openPend.has(s.id);
    const box=el("div","pend");
    const head=el("div","pend-head");
    const tot=el("span","pend-tot",items.length?fmt(pendSum(s.id))+" ("+items.length+")":"nessuno");
    const tg=el("button","pend-toggle",open?"Chiudi":(items.length?"Gestisci":"+ Aggiungi"));tg.type="button";
    tg.setAttribute("aria-expanded",String(open));
    tg.addEventListener("click",()=>{if(open)openPend.delete(s.id);else openPend.add(s.id);confirmingId=null;renderSites()});
    head.append(el("span","ctr-label","In attesa di approvazione"),tot,tg);box.appendChild(head);
    if(!open) return box;
    const body=el("div","pend-body");
    items.slice().sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0).forEach(it=>{
      const r=el("div","pitem");
      r.append(el("span","amt",fmt(it.amount)),el("span","meta",(it.note?it.note+" · ":"")+"dal "+fmtDate(it.date)));
      const ok=el("button","btn ok","✓ Accreditato");ok.type="button";
      ok.addEventListener("click",()=>{confirmingId=confirmingId===it.id?null:it.id;renderSites()});
      const del=el("button","btn ghost","×");del.type="button";del.title="Elimina (es. non approvato)";
      del.setAttribute("aria-label","Elimina importo in attesa di "+fmt(it.amount));
      del.addEventListener("click",()=>{
        if(!confirm("Eliminare "+fmt(it.amount)+" in attesa su "+s.name+"? Usalo se il sondaggio non è stato approvato.")) return;
        state.pending=state.pending.filter(x=>x.id!==it.id);scheduleSave();renderAll();
      });
      r.append(ok,del);
      if(confirmingId===it.id){
        const c=el("div","pconf");
        const mi=document.createElement("input");mi.type="month";mi.value=key(new Date().getFullYear(),new Date().getMonth());
        mi.setAttribute("aria-label","Mese in cui registrare il guadagno");
        const go=el("button","btn ok","Conferma");go.type="button";
        const no=el("button","btn ghost","Annulla");no.type="button";
        go.addEventListener("click",()=>{
          const k=mi.value;if(!/^\d{4}-\d{2}$/.test(k)){mi.focus();return}
          cell(k,s.id).g+=it.amount;
          state.pending=state.pending.filter(x=>x.id!==it.id);confirmingId=null;
          scheduleSave();renderAll();
        });
        no.addEventListener("click",()=>{confirmingId=null;renderSites()});
        c.append(document.createTextNode("Sposta nei guadagni di"),mi,go,no);r.appendChild(c);
      }
      body.appendChild(r);
    });
    const add=el("div","padd");
    const ai=document.createElement("input");ai.inputMode="decimal";ai.placeholder="Importo €";ai.setAttribute("aria-label","Nuovo importo in attesa per "+s.name);
    const ni=document.createElement("input");ni.className="note";ni.placeholder="Nota (facoltativa)";ni.maxLength=80;ni.setAttribute("aria-label","Nota");
    const ab=el("button","btn","Aggiungi in attesa");ab.type="button";
    const doAdd=()=>{
      const n=toCents(ai.value);if(isNaN(n)||n<=0){ai.focus();return}
      state.pending=state.pending||[];
      state.pending.push({id:"w"+Date.now().toString(36)+Math.random().toString(36).slice(2,6),site:s.id,amount:n,note:ni.value.trim().slice(0,80),date:todayISO()});
      scheduleSave();renderAll();
    };
    ab.addEventListener("click",doAdd);
    [ai,ni].forEach(i=>i.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();doAdd()}}));
    add.append(ai,ni,ab);body.appendChild(add);box.appendChild(body);
    return box;
  }

  /* ---------- Contatori ---------- */
  function renderSites(){
    const box=$("sites");box.textContent="";
    SITES.forEach(s=>{
      const row=document.createElement("div");row.className="site";
      const info=document.createElement("div");info.className="site-info";
      const nm=document.createElement("div");nm.className="site-name";
      const dot=document.createElement("span");dot.className="dot";dot.style.background=s.color;
      nm.append(dot,document.createTextNode(s.name));
      const bal=document.createElement("div");bal.className="site-bal";
      let tg=0,tp=0;Object.keys(state.months).forEach(k=>{tg+=get(k,s.id,"g");tp+=get(k,s.id,"p")});
      bal.textContent="Saldo complessivo non prelevato: "+fmt(tg-tp);
      const rm=document.createElement("button");rm.type="button";rm.className="rm";rm.textContent="×";
      rm.title="Rimuovi "+s.name;rm.setAttribute("aria-label","Rimuovi "+s.name);
      rm.addEventListener("click",()=>removeSite(s));
      nm.appendChild(rm);
      info.append(nm,bal);
      row.append(info,counter(s,"g","Guadagni"),counter(s,"p","Prelievi"),pendingBox(s));
      box.appendChild(row);
    });
    const form=document.createElement("div");form.className="add-site";
    const ni=document.createElement("input");ni.placeholder="Nome nuova piattaforma";ni.maxLength=40;
    ni.setAttribute("aria-label","Nome nuova piattaforma");ni.enterKeyHint="done";
    const nb=document.createElement("button");nb.type="button";nb.className="btn";nb.textContent="Aggiungi piattaforma";
    const nm2=document.createElement("div");nm2.className="msg";nm2.setAttribute("role","status");
    const doAdd=()=>{const err=addSite(ni.value);if(err){nm2.textContent=err;ni.focus()}};
    nb.addEventListener("click",doAdd);
    ni.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();doAdd()}});
    form.append(ni,nb,nm2);box.appendChild(form);
    const t=monthTot(cur);
    $("mG").textContent=fmt(t.g);$("mP").textContent=fmt(t.p);
    $("monthName").textContent=label(cur);
  }
  function counter(s,f,lab){
    const c=document.createElement("div");c.className="ctr "+f;
    const head=document.createElement("div");head.className="ctr-head";
    const l=document.createElement("span");l.className="ctr-label";l.textContent=lab;
    const v=document.createElement("button");v.className="ctr-val";v.type="button";
    v.textContent=fmt(get(cur,s.id,f));
    v.title="Clicca per correggere il totale";
    v.setAttribute("aria-label",lab+" "+s.name+": "+fmt(get(cur,s.id,f))+". Clicca per correggere");
    v.addEventListener("click",()=>{
      const inp=document.createElement("input");inp.className="set-input";inp.inputMode="decimal";
      inp.value=((get(cur,s.id,f))/100).toFixed(2).replace(".",",");
      head.replaceChild(inp,v);inp.focus();inp.select();
      let done=false;
      const commit=ok=>{
        if(done) return;done=true;
        if(ok){const n=toCents(inp.value);if(!isNaN(n)&&n>=0){cell(cur,s.id)[f]=n;scheduleSave()}}
        renderAll();
      };
      inp.addEventListener("keydown",e=>{if(e.key==="Enter")commit(true);if(e.key==="Escape")commit(false)});
      inp.addEventListener("blur",()=>commit(true));
    });
    head.append(l,v);
    const ed=document.createElement("div");ed.className="ctr-edit";
    const inp=document.createElement("input");inp.inputMode="decimal";inp.placeholder="Importo €";
    inp.setAttribute("aria-label","Importo da aggiungere a "+lab.toLowerCase()+" "+s.name);
    const add=document.createElement("button");add.className="btn add";add.type="button";add.textContent="+";
    add.setAttribute("aria-label","Aggiungi");
    const sub=document.createElement("button");sub.className="btn add ghost";sub.type="button";sub.textContent="−";
    sub.setAttribute("aria-label","Sottrai");
    const apply=sign=>{
      const n=toCents(inp.value);
      if(isNaN(n)||n<=0){inp.focus();return}
      const c2=cell(cur,s.id);c2[f]=Math.max(0,c2[f]+sign*n);
      scheduleSave();renderAll();
    };
    add.addEventListener("click",()=>apply(1));
    sub.addEventListener("click",()=>apply(-1));
    inp.addEventListener("keydown",e=>{if(e.key==="Enter")apply(1)});
    ed.append(inp,add,sub);
    c.append(head,ed);
    return c;
  }

  /* ---------- Riepilogo ---------- */
  function filteredMonths(){
    const m=usedMonths();
    return yearFilter==="all"?m:m.filter(k=>k.startsWith(yearFilter));
  }
  function renderYearSel(){
    const sel=$("yearSel");const years=[...new Set(usedMonths().map(k=>k.slice(0,4)))];
    if(yearFilter!=="all"&&!years.includes(yearFilter)) yearFilter="all";
    sel.textContent="";
    const o=document.createElement("option");o.value="all";o.textContent="Tutti gli anni";sel.appendChild(o);
    years.forEach(y=>{const op=document.createElement("option");op.value=y;op.textContent=y;sel.appendChild(op)});
    sel.value=yearFilter;
  }
  function renderTotals(){
    let g=0,p=0;filteredMonths().forEach(k=>{const t=monthTot(k);g+=t.g;p+=t.p});
    $("tG").textContent=fmt(g);$("tP").textContent=fmt(p);
    const d=$("tD");d.textContent=fmt(g-p);d.className=g-p<0?"neg":"";
    const n=(state.pending||[]).length;
    $("tW").textContent=fmt(pendTotal());
    $("tWn").textContent=n?(n===1?"1 importo":n+" importi")+", non inclusi nei totali":"non incluso nei totali";
  }
  function renderMonthTable(){
    const tb=$("monthTable");tb.textContent="";
    const months=filteredMonths();
    if(!months.length){tb.innerHTML='<tbody><tr><td class="empty" colspan="4">Nessun importo registrato. Inserisci il primo guadagno nei contatori qui sopra.</td></tr></tbody>';return}
    const th=document.createElement("thead");
    th.innerHTML="<tr><th>Mese</th><th>Guadagni</th><th>Prelievi</th><th>Differenza</th></tr>";
    tb.appendChild(th);
    const body=document.createElement("tbody");let G=0,P=0;
    months.slice().reverse().forEach(k=>{
      const t=monthTot(k);G+=t.g;P+=t.p;
      const tr=document.createElement("tr");tr.className="clickable";tr.tabIndex=0;
      tr.title="Apri "+label(k);
      [mq.matches?shortLabel(k):label(k),fmt(t.g),fmt(t.p),fmt(t.g-t.p)].forEach((x,i)=>{const td=document.createElement("td");td.textContent=x;if(i===1)td.className="earn";if(i===2)td.className="out";if(i===3&&t.g-t.p<0)td.className="neg";tr.appendChild(td)});
      const go=()=>{cur=k;renderAll();window.scrollTo({top:0,behavior:"smooth"})};
      tr.addEventListener("click",go);tr.addEventListener("keydown",e=>{if(e.key==="Enter")go()});
      body.appendChild(tr);
    });
    tb.appendChild(body);
    const tf=document.createElement("tfoot");const tr=document.createElement("tr");
    ["Totale",fmt(G),fmt(P),fmt(G-P)].forEach(x=>{const td=document.createElement("td");td.textContent=x;tr.appendChild(td)});
    tf.appendChild(tr);tb.appendChild(tf);
  }
  function renderSiteTable(){
    const tb=$("siteTable");tb.textContent="";
    const months=filteredMonths();
    const th=document.createElement("thead");
    th.innerHTML="<tr><th>Piattaforma</th><th>Guadagni</th><th>Prelievi</th><th>Differenza</th><th>In attesa</th></tr>";
    tb.appendChild(th);
    const body=document.createElement("tbody");let G=0,P=0;
    SITES.forEach(s=>{
      let g=0,p=0;months.forEach(k=>{g+=get(k,s.id,"g");p+=get(k,s.id,"p")});G+=g;P+=p;
      const tr=document.createElement("tr");
      const td0=document.createElement("td");const dot=document.createElement("span");dot.className="dot";dot.style.cssText="display:inline-block;margin-right:8px;background:"+s.color;
      td0.append(dot,document.createTextNode(s.name));tr.appendChild(td0);
      [fmt(g),fmt(p),fmt(g-p)].forEach((x,i)=>{const td=document.createElement("td");td.textContent=x;if(i===0)td.className="earn";if(i===1)td.className="out";if(i===2&&g-p<0)td.className="neg";tr.appendChild(td)});
      const w=pendSum(s.id);const tw=document.createElement("td");tw.className="wait";tw.textContent=w?fmt(w):"—";tr.appendChild(tw);
      body.appendChild(tr);
    });
    tb.appendChild(body);
    const tf=document.createElement("tfoot");const tr=document.createElement("tr");
    ["Totale",fmt(G),fmt(P),fmt(G-P),fmt(pendTotal())].forEach(x=>{const td=document.createElement("td");td.textContent=x;tr.appendChild(td)});
    tf.appendChild(tr);tb.appendChild(tf);
  }
  function renderChart(){
    const box=$("chart");const tip=$("tip");
    box.querySelectorAll("svg,.empty").forEach(n=>n.remove());
    const months=filteredMonths();
    if(!months.length){const e=document.createElement("div");e.className="empty";e.textContent="Il grafico comparirà dopo il primo importo registrato.";box.appendChild(e);return}
    const W=Math.max(320,box.clientWidth||640),H=Math.round(Math.min(320,Math.max(210,W*0.38)));
    const m={t:12,r:8,b:34,l:Math.min(70,Math.max(52,W*0.09))};
    const iw=W-m.l-m.r,ih=H-m.t-m.b;
    const data=months.map(k=>({k,...monthTot(k)}));
    let max=Math.max(1,...data.map(d=>Math.max(d.g,d.p)));
    const step=niceStep(max/4);max=Math.ceil(max/step)*step;
    const ns="http://www.w3.org/2000/svg";
    const svg=document.createElementNS(ns,"svg");svg.setAttribute("viewBox","0 0 "+W+" "+H);svg.setAttribute("width","100%");
    svg.setAttribute("role","img");svg.setAttribute("aria-label","Grafico a barre di guadagni e prelievi per mese");
    const mk=(t,a)=>{const e=document.createElementNS(ns,t);for(const x in a)e.setAttribute(x,a[x]);return e};
    for(let v=0;v<=max+0.5;v+=step){
      const y=m.t+ih-(v/max)*ih;
      svg.appendChild(mk("line",{x1:m.l,x2:W-m.r,y1:y,y2:y,stroke:"var(--line)","stroke-width":1}));
      const t=mk("text",{x:m.l-8,y:y+4,"text-anchor":"end","font-size":11.5,fill:"var(--muted)"});
      t.textContent=new Intl.NumberFormat("it-IT",{maximumFractionDigits:0}).format(v/100)+" €";svg.appendChild(t);
    }
    const band=iw/data.length,bw=Math.min(26,band*0.32),gap=Math.min(4,band*0.05);
    const labelEvery=Math.ceil(data.length/Math.max(1,Math.floor(iw/46)));
    data.forEach((d,i)=>{
      const cx=m.l+band*i+band/2;
      [["g","var(--earn)",-1],["p","var(--out)",1]].forEach(([f,col,side])=>{
        const h=(d[f]/max)*ih;
        const x=side<0?cx-gap/2-bw:cx+gap/2;
        svg.appendChild(mk("rect",{x,y:m.t+ih-h,width:bw,height:Math.max(0,h),rx:3,fill:col}));
      });
      if(i%labelEvery===0){
        const {y,m:mm}=parseKey(d.k);
        const t=mk("text",{x:cx,y:H-m.b+18,"text-anchor":"middle","font-size":11.5,fill:"var(--muted)"});
        t.textContent=MESI_BREVI[mm]+(data.length>1&&(mm===0||i===0)?" "+String(y).slice(2):"");svg.appendChild(t);
      }
      const hit=mk("rect",{x:m.l+band*i,y:m.t,width:band,height:ih,fill:"transparent"});
      hit.addEventListener("mousemove",ev=>{
        tip.textContent=label(d.k)+": guadagni "+fmt(d.g)+", prelievi "+fmt(d.p);
        const r=box.getBoundingClientRect();let x=ev.clientX-r.left+12;const y=ev.clientY-r.top-38;
        tip.style.opacity=1;const tw=tip.offsetWidth;if(x+tw>r.width)x=Math.max(0,ev.clientX-r.left-tw-12);
        tip.style.left=x+"px";tip.style.top=Math.max(0,y)+"px";
      });
      hit.addEventListener("mouseleave",()=>tip.style.opacity=0);
      hit.addEventListener("pointerdown",ev=>{lastPointer=ev.pointerType||"mouse"});
      hit.addEventListener("click",ev=>{
        if(lastPointer!=="mouse"&&tipKey!==d.k){
          tipKey=d.k;
          tip.textContent=label(d.k)+": guadagni "+fmt(d.g)+", prelievi "+fmt(d.p)+" (tocca di nuovo per aprire)";
          tip.style.whiteSpace="normal";tip.style.maxWidth="240px";
          const r=box.getBoundingClientRect();tip.style.opacity=1;
          const tw=tip.offsetWidth;let x=ev.clientX-r.left-tw/2;x=Math.max(0,Math.min(r.width-tw,x));
          tip.style.left=x+"px";tip.style.top="0px";
          ev.stopPropagation();return;
        }
        tipKey=null;tip.style.opacity=0;cur=d.k;renderAll();window.scrollTo({top:0,behavior:"smooth"});
      });
      hit.style.cursor="pointer";
      svg.appendChild(hit);
    });
    box.appendChild(svg);
  }
  function niceStep(raw){
    const p=Math.pow(10,Math.floor(Math.log10(raw||1)));const n=raw/p;
    return (n<=1?1:n<=2?2:n<=5?5:10)*p;
  }
  /* ---------- Inserimento rapido mesi passati ---------- */
  let bulkFrom=shift(cur,-11), bulkTo=cur;
  function monthsBetween(a,b){const out=[];if(a>b)[a,b]=[b,a];let k=a,guard=0;while(k<=b&&guard<240){out.push(k);k=shift(k,1);guard++}return out}
  function centsToField(c){return c?(c/100).toFixed(2).replace(".",","):""}
  const mq=window.matchMedia("(max-width:640px)");
  function shortLabel(k){const {y,m}=parseKey(k);return MESI_BREVI[m]+" "+String(y).slice(2)}
  function afterBulkChange(){scheduleSave();renderSites();renderYearSel();renderTotals();renderChart();renderMonthTable();renderSiteTable()}
  function renderBulk(force){
    const det=$("bulk");if(!det.open)return;
    const host=mq.matches?$("bulkCards"):$("bulkTable");
    if(!force&&host.contains(document.activeElement))return;
    $("bulkFrom").value=bulkFrom;$("bulkTo").value=bulkTo;
    $("bulkTableWrap").hidden=mq.matches;$("bulkCards").hidden=!mq.matches;
    if(mq.matches)renderBulkCards();else renderBulkTable();
  }
  function renderBulkCards(){
    const box=$("bulkCards");box.textContent="";
    monthsBetween(bulkFrom,bulkTo).reverse().forEach(k=>{
      const card=document.createElement("div");card.className="bcard";
      const head=document.createElement("div");head.className="bcard-head";
      const nm=document.createElement("div");nm.textContent=label(k);
      const tot=document.createElement("span");
      const upd=()=>{const t=monthTot(k);tot.textContent=fmt(t.g)+" / "+fmt(t.p)};
      head.append(nm,tot);card.appendChild(head);
      SITES.forEach(s=>{
        const row=document.createElement("div");row.className="brow";
        const sn=document.createElement("div");sn.className="brow-name";
        const dot=document.createElement("span");dot.className="dot";dot.style.background=s.color;
        sn.append(dot,document.createTextNode(s.name));row.appendChild(sn);
        [["g","Guadagni"],["p","Prelievi"]].forEach(([f,lab])=>{
          const fl=document.createElement("label");fl.className="bfield";
          const inp=document.createElement("input");inp.className=f;inp.inputMode="decimal";inp.placeholder="0";
          inp.enterKeyHint="next";
          inp.value=centsToField(get(k,s.id,f));
          inp.setAttribute("aria-label",lab+" "+s.name+" "+label(k));
          inp.addEventListener("change",()=>{
            const raw=inp.value.trim();const n=raw===""?0:toCents(raw);
            if(isNaN(n)||n<0){inp.classList.add("bad");return}
            inp.classList.remove("bad");cell(k,s.id)[f]=n;inp.value=centsToField(n);upd();afterBulkChange();
          });
          inp.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();const all=[...box.querySelectorAll("input")];const nx=all[all.indexOf(inp)+1];if(nx)nx.focus();else inp.blur()}});
          fl.append(document.createTextNode(lab),inp);row.appendChild(fl);
        });
        card.appendChild(row);
      });
      upd();box.appendChild(card);
    });
  }
  function renderBulkTable(){
    const tb=$("bulkTable");
    tb.textContent="";
    const th=document.createElement("thead");
    const r1=document.createElement("tr");const r2=document.createElement("tr");
    const h0=document.createElement("th");h0.rowSpan=2;h0.textContent="Mese";r1.appendChild(h0);
    SITES.forEach(s=>{
      const h=document.createElement("th");h.colSpan=2;h.className="site-col sep";h.textContent=s.name;r1.appendChild(h);
      const a=document.createElement("th");a.className="sub sep";a.textContent="Guadagni";
      const b=document.createElement("th");b.className="sub";b.textContent="Prelievi";r2.append(a,b);
    });
    const ht=document.createElement("th");ht.rowSpan=2;ht.className="sep";ht.textContent="Totale G / P";r1.appendChild(ht);
    th.append(r1,r2);tb.appendChild(th);
    const body=document.createElement("tbody");
    monthsBetween(bulkFrom,bulkTo).reverse().forEach(k=>{
      const tr=document.createElement("tr");
      const td0=document.createElement("td");td0.textContent=label(k);tr.appendChild(td0);
      const tot=document.createElement("td");tot.className="rowtot sep";
      const upd=()=>{const t=monthTot(k);tot.textContent=fmt(t.g)+" / "+fmt(t.p)};
      SITES.forEach(s=>{
        ["g","p"].forEach((f,i)=>{
          const td=document.createElement("td");if(i===0)td.className="sep";
          const inp=document.createElement("input");inp.className=f;inp.inputMode="decimal";inp.placeholder="0";
          inp.value=centsToField(get(k,s.id,f));
          inp.setAttribute("aria-label",(f==="g"?"Guadagni ":"Prelievi ")+s.name+" "+label(k));
          inp.addEventListener("change",()=>{
            const raw=inp.value.trim();const n=raw===""?0:toCents(raw);
            if(isNaN(n)||n<0){inp.classList.add("bad");return}
            inp.classList.remove("bad");
            cell(k,s.id)[f]=n;inp.value=centsToField(n);upd();
            scheduleSave();renderSites();renderYearSel();renderTotals();renderChart();renderMonthTable();renderSiteTable();
          });
          inp.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();const all=[...tb.querySelectorAll("input")];const nx=all[all.indexOf(inp)+1];if(nx)nx.focus();else inp.blur()}});
          td.appendChild(inp);tr.appendChild(td);
        });
      });
      upd();tr.appendChild(tot);body.appendChild(tr);
    });
    tb.appendChild(body);
  }
  $("bulk").addEventListener("toggle",()=>renderBulk(true));
  $("bulkFrom").addEventListener("change",e=>{if(/^\d{4}-\d{2}$/.test(e.target.value)){bulkFrom=e.target.value;renderBulk(true)}});
  $("bulkTo").addEventListener("change",e=>{if(/^\d{4}-\d{2}$/.test(e.target.value)){bulkTo=e.target.value;renderBulk(true)}});

  function renderAll(){renderSites();renderYearSel();renderTotals();renderChart();renderMonthTable();renderSiteTable();renderBulk(false)}

  /* ---------- Backup ---------- */
  $("exportBtn").addEventListener("click",()=>{
    const json=JSON.stringify({v:1,sites:SITES,months:clean(state.months),pending:cleanPending(state.pending),exportedAt:new Date().toISOString()},null,2);
    const name="guadagni-sondaggi-"+new Date().toISOString().slice(0,10)+".json";
    try{
      const url=URL.createObjectURL(new Blob([json],{type:"application/json"}));
      const a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),2000);
      $("toolMsg").textContent="Backup scaricato";
    }catch(e){$("toolMsg").textContent="Download non riuscito"}
  });
  $("importFile").addEventListener("change",async e=>{
    const f=e.target.files&&e.target.files[0];if(!f)return;
    try{
      const d=JSON.parse(await f.text());
      if(!d||typeof d.months!=="object") throw 0;
      const newSites=Array.isArray(d.sites)?sanitizeSites(d.sites):SITES;
      const oldSites=SITES;SITES=newSites;
      const imported=clean(d.months);
      SITES=oldSites;
      if(!confirm("Sostituire i dati attuali con quelli del backup ("+Object.keys(imported).length+" mesi, "+newSites.length+" piattaforme)?")) return;
      SITES=newSites;state={v:1,months:imported,pending:Array.isArray(d.pending)?cleanPending(d.pending):cleanPending(state.pending)};renderAll();save();
      $("toolMsg").textContent="Backup importato";
    }catch(err){$("toolMsg").textContent="File non valido: serve un backup esportato da questa pagina"}
    e.target.value="";
  });

  $("prev").addEventListener("click",()=>{cur=shift(cur,-1);renderAll()});
  $("next").addEventListener("click",()=>{cur=shift(cur,1);renderAll()});
  $("yearSel").addEventListener("change",e=>{yearFilter=e.target.value;renderTotals();renderChart();renderMonthTable();renderSiteTable()});
  let rw=null;window.addEventListener("resize",()=>{clearTimeout(rw);rw=setTimeout(renderChart,150)});
  mq.addEventListener("change",()=>{renderMonthTable();renderBulk(true)});
  document.addEventListener("click",e=>{if(tipKey&&!$("chart").contains(e.target)){tipKey=null;$("tip").style.opacity=0}});


  /* ---------- Backup automatico sul PC (hub via Tailscale) ---------- */
  const HUB_APP="guadagni", HUB_URL_KEY="hub-url", HUB_STATE_KEY="hub-stato";
  let hubTimer=null, hubBusy=false;
  function lsGet(k){try{return localStorage.getItem(k)}catch(e){return null}}
  function lsSet(k,v){try{localStorage.setItem(k,v)}catch(e){}}
  function hubUrl(){return (lsGet(HUB_URL_KEY)||"").trim().replace(/\/+$/,"")}
  function hubState(){try{return JSON.parse(lsGet(HUB_STATE_KEY)||"{}")}catch(e){return {}}}
  function setHubState(o){lsSet(HUB_STATE_KEY,JSON.stringify(Object.assign(hubState(),o)))}
  function hubPayload(){return {v:1,sites:SITES,months:clean(state.months),pending:cleanPending(state.pending)}}
  async function hash(str){
    try{const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(str));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("")}
    catch(e){let h=0;for(let i=0;i<str.length;i++)h=(h*31+str.charCodeAt(i))|0;return "s"+h}
  }
  function fmtWhen(iso){
    if(!iso) return "mai";
    const d=new Date(iso),t=new Date();
    const hm=d.toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"});
    if(d.toDateString()===t.toDateString()) return "oggi "+hm;
    const y=new Date(t);y.setDate(t.getDate()-1);
    if(d.toDateString()===y.toDateString()) return "ieri "+hm;
    return d.toLocaleDateString("it-IT",{day:"2-digit",month:"2-digit"})+" "+hm;
  }
  function renderHub(msg){
    const st=hubState(),url=hubUrl(),badge=$("hubBadge");
    if(document.activeElement!==$("hubUrl")) $("hubUrl").value=url;
    if(!url){badge.textContent="non attivo";badge.className="hub-badge"}
    else if(st.lastErr&&(!st.lastOk||st.lastErrAt>st.lastOk)){badge.textContent="PC non raggiungibile";badge.className="hub-badge warn"}
    else {badge.textContent="ultimo: "+fmtWhen(st.lastOk);badge.className="hub-badge ok"}
    $("hubStatus").textContent=msg!=null?msg:(url?("Ultimo backup riuscito: "+fmtWhen(st.lastOk)+(st.lastErr&&(!st.lastOk||st.lastErrAt>st.lastOk)?" · ultimo tentativo fallito "+fmtWhen(st.lastErrAt)+" ("+st.lastErr+")":"")):"Inserisci l'indirizzo del PC per attivarlo.");
  }
  async function hubFetch(path,opt){
    const url=hubUrl();if(!url) throw new Error("indirizzo non impostato");
    const ctl=new AbortController();const to=setTimeout(()=>ctl.abort(),12000);
    try{
      const r=await fetch(url+path,Object.assign({signal:ctl.signal,cache:"no-store"},opt||{}));
      let body=null;try{body=await r.json()}catch(e){}
      if(!r.ok) throw new Error((body&&body.errore)||("HTTP "+r.status));
      return body;
    }catch(e){
      if(e.name==="AbortError") throw new Error("nessuna risposta");
      if(e instanceof TypeError) throw new Error("PC non raggiungibile");
      throw e;
    }finally{clearTimeout(to)}
  }
  async function hubSync(force){
    if(hubBusy||!hubUrl()) return;
    const payload=JSON.stringify(hubPayload());const h=await hash(payload);
    if(!force&&hubState().lastHash===h) return;
    hubBusy=true;renderHub("Invio del backup al PC…");
    try{
      const r=await hubFetch("/api/"+HUB_APP+"/backup",{method:"POST",headers:{"Content-Type":"application/json"},body:payload});
      setHubState({lastHash:h,lastOk:new Date().toISOString(),lastErr:null,lastFile:r&&r.file});
      renderHub(r&&r.salvato===false?"Il PC ha già questa versione ("+fmtWhen(hubState().lastOk)+")":null);
    }catch(e){
      setHubState({lastErr:e.message,lastErrAt:new Date().toISOString()});renderHub();
    }finally{hubBusy=false}
  }
  function scheduleHub(){clearTimeout(hubTimer);hubTimer=setTimeout(()=>hubSync(false),8000)}
  $("hubSave").addEventListener("click",async()=>{
    let v=$("hubUrl").value.trim().replace(/\/+$/,"");
    if(v&&!/^https:\/\//i.test(v)){renderHub("L'indirizzo deve iniziare con https://");return}
    lsSet(HUB_URL_KEY,v);
    if(!v){renderHub();return}
    renderHub("Provo il collegamento…");
    try{const r=await hubFetch("/api/ping");renderHub("Collegato a "+r.pc+". Invio il primo backup…");await hubSync(true)}
    catch(e){setHubState({lastErr:e.message,lastErrAt:new Date().toISOString()});renderHub("Collegamento non riuscito: "+e.message+". Controlla che Tailscale sia attivo sul telefono.")}
  });
  $("hubNow").addEventListener("click",()=>hubSync(true));
  $("hubRestore").addEventListener("click",async()=>{
    renderHub("Scarico l'ultimo backup dal PC…");
    try{
      const r=await hubFetch("/api/"+HUB_APP+"/backup/ultimo");
      const d=r.dati;if(!d||typeof d.months!=="object") throw new Error("backup non valido");
      const newSites=sanitizeSites(d.sites);const oldSites=SITES;SITES=newSites;const imported=clean(d.months);SITES=oldSites;
      if(!confirm("Sostituire i dati di questo telefono con il backup del PC "+r.file+" ("+Object.keys(imported).length+" mesi, "+newSites.length+" piattaforme)?")){renderHub();return}
      SITES=newSites;state={v:1,months:imported,pending:cleanPending(d.pending)};renderAll();save();
      renderHub("Ripristinato da "+r.file);
    }catch(e){renderHub("Ripristino non riuscito: "+e.message)}
  });
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")hubSync(false)});
  window.addEventListener("online",()=>hubSync(false));
  renderHub();
  init().then(()=>setTimeout(()=>hubSync(false),1500));
})();

// App installabile: service worker per apertura rapida e funzionamento offline
/* dentro il Gestionale: il service worker è quello del Gestionale (scope /gestionale/) */

