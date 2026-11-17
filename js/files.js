'use strict';
/* Saving, downloads (PNG, PDF, place cards, caterer list, CSV) and the modal. Part of the planner (app.html); see js/README.md. */
/* ---------------- saving ---------------- */
let savingNow=false,saveAgain=false;
async function savePlan(){
  clearTimeout(saveT);if(!SB||!ROW||readOnly)return;
  if(savingNow){saveAgain=true;return}
  savingNow=true;saveState='saving';renderTop();
  const snapshot=JSON.stringify(S);
  try{const{data,error}=await SB.from('events').update({data:S,name:S.event.name||'',event_date:S.event.date||null,type:S.event.type,...eventCols()}).eq('id',ROW.id).select('updated_at').single();
    if(error)throw error;ROW.updated_at=data.updated_at;
    if(JSON.stringify(S)===snapshot){dirty=false;clearDraft()}saveState='idle'}
  catch(err){saveState='error';logSafe('save',err);toast(t('couldntSave'))}
  savingNow=false;renderTop();
  if(saveAgain||dirty&&saveState!=='error'){saveAgain=false;if(dirty)saveT=setTimeout(savePlan,800)}
}
window.addEventListener('beforeunload',e=>{if(dirty&&MODE==='edit'){savePlan();e.preventDefault();e.returnValue=''}});

/* ---------------- files out ---------------- */
async function offerFile(name,blob){
  const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),4000);
}
function svgToPng(inner,vb,W,H,scale=2){return new Promise((ok,no)=>{
  const src=`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${vb}" width="${W}" height="${H}">${inner}</svg>`;
  const im=new Image();im.onload=()=>{const c=document.createElement('canvas');c.width=W*scale;c.height=H*scale;const x=c.getContext('2d');x.scale(scale,scale);x.drawImage(im,0,0);c.toBlob(b=>b?ok({blob:b,url:c.toDataURL('image/png')}):no(),'image/png')};
  im.onerror=no;im.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(src)})}
const fname=s=>(S.event.name||t('fileBase')).replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-|-$/g,'').toLowerCase()+s;
async function planImage(){const keep=sel;sel={kind:null};const{B,inner}=planSVG();sel=keep;
  try{const r=await svgToPng(allDefs()+inner,`${B.x} ${B.y} ${B.w} ${B.h}`,B.w,B.h,2);offerFile(fname('-'+t('fileSeating')+'.png'),r.blob,r.url)}catch(e){toast(t('couldntSave'))}}
/* ---------------- PDF ----------------
   Pages are pictures (the plan, place cards) or lists drawn on a canvas with the page's own fonts, so Georgian
   names print correctly without embedding a font in the PDF. A4, 72pt per inch. */
const A4={w:595.28,h:841.89};
async function savePdf(pages,name,title){
  await loadScript(PDFLIB);const{jsPDF}=window.jspdf;let doc=null;
  for(const pg of pages){const land=pg.w>pg.h&&!pg.fill,W=land?A4.h:A4.w,H=land?A4.w:A4.h;
    if(!doc)doc=new jsPDF({orientation:land?'landscape':'portrait',unit:'pt',format:'a4',compress:true});else doc.addPage('a4',land?'landscape':'portrait');
    const m=pg.fill?0:28,sc=Math.min((W-2*m)/pg.w,(H-2*m)/pg.h),iw=pg.w*sc,ih=pg.h*sc;
    doc.addImage(pg.url,pg.url.startsWith('data:image/jpeg')?'JPEG':'PNG',(W-iw)/2,pg.fill?0:m,iw,ih,undefined,'FAST')}
  doc.setProperties({title:title||'Supra',creator:'Supra'});
  offerFile(name,doc.output('blob'))}
/* Lists for the plan PDF: each table in number order (for the venue staff), then everyone A–Z (for the entrance). */
function listPages(){
  const W=1588,H=2246,M=120,F="'Noto Sans Georgian', system-ui, sans-serif",FD="Marcellus, 'Noto Serif Georgian', Georgia, serif",p=P();
  const rows=[];S.tables.forEach(x=>x.seats.forEach((id,i)=>{const g=id&&S.guests[id];if(g)rows.push({name:g.name,table:tName(x),seat:i+1})}));
  const coll=new Intl.Collator(UL()==='ka'?'ka':'en',{sensitivity:'base'});rows.sort((a,b)=>coll.compare(a.name,b.name));
  const pages=[];let c,x,y,col;
  const page=(heading)=>{const cv=document.createElement('canvas');cv.width=W;cv.height=H;c=cv.getContext('2d');c.fillStyle='#FFFFFF';c.fillRect(0,0,W,H);
    c.fillStyle=p.ink;c.font=`56px ${FD}`;c.textBaseline='alphabetic';c.fillText(S.event.name||'Supra',M,M+40);
    c.fillStyle=p.accent;c.font=`30px ${F}`;c.fillText([gDate(),heading].filter(Boolean).join('  ·  '),M,M+96);
    c.strokeStyle=p.accent;c.lineWidth=2;c.beginPath();c.moveTo(M,M+124);c.lineTo(W-M,M+124);c.stroke();
    pages.push(cv);col=0;x=M;y=M+200};
  const fit=(txt,max)=>{if(c.measureText(txt).width<=max)return txt;while(txt.length>1&&c.measureText(txt+'…').width>max)txt=txt.slice(0,-1);return txt+'…'};
  // by table first (for the venue staff): head table(s), then Table 1, 2, … 10 in number order; a block never splits across columns
  const colW=(W-2*M-60)/2,num=new Intl.Collator(UL()==='ka'?'ka':'en',{numeric:true,sensitivity:'base'});
  const ordered=[...S.tables].sort((a,b)=>(b.shape==='head')-(a.shape==='head')||num.compare(tName(a),tName(b)));
  page(t('pdfByTable'));
  ordered.forEach(tb=>{const names=tb.seats.map((id,i)=>id&&S.guests[id]?(seatMode()==='table'?`• ${S.guests[id].name}`:`${i+1}. ${S.guests[id].name}`):null).filter(Boolean);if(!names.length)return;
    const need=70+names.length*50+40;if(y+need>H-M){if(col===0){col=1;x=M+colW+60;y=M+200}else page(t('pdfByTable'))}
    c.fillStyle=p.accent;c.font=`40px ${FD}`;c.fillText(fit(tName(tb),colW),x,y);
    c.font=`26px ${F}`;c.fillStyle='#8A8580';c.fillText(t('statSeats',{occupied:names.length,capacity:tb.seats.length}),x,y+40);y+=90;
    c.fillStyle=p.ink;c.font=`30px ${F}`;names.forEach(n=>{c.fillText(fit(n,colW),x,y);y+=50});y+=40});
  // then everyone A–Z (for the entrance): two columns, name left, table and seat right
  // two lines per guest so long names and long table names both stay whole
  const lh=96;page(t('pdfAZ'));
  rows.forEach(r=>{if(y+lh-40>H-M){if(col===0){col=1;x=M+colW+60;y=M+200}else page(t('pdfAZ'))}
    c.fillStyle=p.ink;c.font=`34px ${F}`;c.fillText(fit(r.name,colW),x,y);
    c.fillStyle=p.accent;c.font=`27px ${F}`;c.fillText(fit(seatMode()==='table'?r.table:`${r.table} · ${t('seatN',{number:r.seat})}`,colW),x,y+38);
    c.strokeStyle='#E6E1DA';c.lineWidth=1;c.beginPath();c.moveTo(x,y+60);c.lineTo(x+colW,y+60);c.stroke();y+=lh});
  // page numbers (the plan itself is page 1)
  pages.forEach((cv,i)=>{const g=cv.getContext('2d');g.fillStyle='#8A8580';g.font=`24px ${F}`;const s=t('pageN',{n:i+2,of:pages.length+1});g.fillText(s,W-M-g.measureText(s).width,H-60)});
  return pages.map(cv=>({url:cv.toDataURL('image/png'),w:W,h:H}));
}
async function planPdf(){
  const btn=document.querySelector('[data-act=planpdf]');if(btn){btn.disabled=true;btn.setAttribute('aria-busy','true')}
  toast(t('pdfMaking'));
  try{await document.fonts?.ready;const keep=sel;sel={kind:null};const{B,inner}=planSVG();sel=keep;
    const r=await svgToPng(allDefs()+inner,`${B.x} ${B.y} ${B.w} ${B.h}`,B.w,B.h,2);
    await savePdf([{url:r.url,w:B.w,h:B.h},...listPages()],fname('-'+t('fileSeating')+'.pdf'),(S.event.name||'Supra')+' · '+t('planLabel'))}
  catch(e){logSafe('pdf',e);toast(t('pdfFail'))}
  if(btn){btn.disabled=false;btn.removeAttribute('aria-busy')}}
async function dlQR(){const c=$('#qr canvas');if(!c)return;const pad=document.createElement('canvas');pad.width=c.width+80;pad.height=c.height+120;const x=pad.getContext('2d');
  x.fillStyle='#FFFFFF';x.fillRect(0,0,pad.width,pad.height);x.drawImage(c,40,40);x.fillStyle='#24302A';x.font='600 20px Noto Sans Georgian, sans-serif';x.textAlign='center';x.fillText(t('fgTitle'),pad.width/2,c.height+80);
  pad.toBlob(b=>offerFile(fname('-'+t('qrFile')+'.png'),b,pad.toDataURL()),'image/png')}

/* place cards */
async function placeCards(){
  const list=[];S.tables.forEach(x=>x.seats.forEach(id=>{if(id)list.push({G:S.guests[id],x})}));
  const per=10,pages=Math.ceil(list.length/per),p=P();
  modal(`<h2>${t('cardsTitle')}</h2><p class="muted">${list.length} · ${pages} ${t('page').toLowerCase()}</p><div id="cardpages" class="cardpages">${t('loadingLib')}</div>`);
  const out=[];
  for(let pg=0;pg<pages;pg++){
    let s=`<rect width="794" height="1123" fill="#FFFFFF"/>`;
    list.slice(pg*per,pg*per+per).forEach((c,k)=>{const cx=40+(k%2)*367,cy=40+Math.floor(k/2)*209;
      s+=`<g transform="translate(${cx} ${cy})"><rect width="347" height="189" rx="10" fill="${p.cloth}" stroke="${p.edge}" stroke-width="1.5"/><rect x="8" y="8" width="331" height="173" rx="6" fill="none" stroke="${p.accent}" stroke-width=".8" stroke-dasharray="3 4"/>
      <g transform="translate(62 104) scale(1.6)">${person(c.G,p,false)}</g>
      ${c.G.side?`<circle cx="320" cy="28" r="6" fill="${SIDE_COL[c.G.side]}"/>`:''}
      <text x="226" y="82" text-anchor="middle" font-family="${NAMEFONT}" font-weight="700" font-size="${c.G.name.length>18?17:21}" fill="${p.ink}">${esc(c.G.name.split(/\s+/)[0])}</text>
      <text x="226" y="106" text-anchor="middle" font-family="${BODYFONT}" font-size="14" fill="${shade(p.ink,25)}">${esc(c.G.name.split(/\s+/).slice(1).join(' '))}</text>
      <path d="M176,122 H276" stroke="${p.accent}"/>
      <text x="226" y="146" text-anchor="middle" font-family="Marcellus, Noto Serif Georgian, serif" font-size="17" fill="${p.accent}">${esc(tName(c.x))}</text>
      ${c.G.meal?`<text x="226" y="167" text-anchor="middle" font-family="${BODYFONT}" font-size="11" fill="${shade(p.ink,35)}">${esc(t(MEAL_LBL[c.G.meal]||c.G.meal))}</text>`:''}</g>`});
    try{out.push(await svgToPng(allDefs()+s,'0 0 794 1123',794,1123,2))}catch(e){}
  }
  const box=$('#cardpages');if(!box)return;
  box.insertAdjacentHTML('beforebegin',`<div class="row"><button type="button" class="btn primary" id="cardspdf">${t('cardsPdf')}</button></div>`);
  $('#cardspdf').onclick=async()=>{const b=$('#cardspdf');b.disabled=true;b.setAttribute('aria-busy','true');
    try{await savePdf(out.map(r=>({url:r.url,w:794,h:1123,fill:true})),fname('-'+t('fileCards')+'.pdf'),t('cardsTitle'))}catch(e){logSafe('pdf',e);toast(t('pdfFail'))}
    b.disabled=false;b.removeAttribute('aria-busy')};
  box.innerHTML=out.map((r,i)=>`<figure><img src="${r.url}" alt="${t('page')} ${i+1}"><button type="button" class="btn sm" data-dlcard="${i}">${t('download')} · ${t('page')} ${i+1}</button></figure>`).join('');
  box.onclick=e=>{const b=e.target.closest('[data-dlcard]');if(b){const i=+b.dataset.dlcard;offerFile(fname(`-${t('fileCards')}-${i+1}.png`),out[i].blob,out[i].url)}};
}

/* caterer */
function catererData(){const rows=[];S.tables.forEach(x=>{const c={table:tName(x),total:0,kids:0,meals:{}};x.seats.forEach(id=>{const g=id&&S.guests[id];if(!g)return;c.total++;if(g.kid)c.kids++;const m=g.meal||'';c.meals[m]=(c.meals[m]||0)+1});rows.push(c)});return rows}
function catererModal(){
  const rows=catererData(),tot={total:0,kids:0,meals:{}};rows.forEach(r=>{tot.total+=r.total;tot.kids+=r.kids;for(const m in r.meals)tot.meals[m]=(tot.meals[m]||0)+r.meals[m]});
  const al=[];S.tables.forEach(x=>x.seats.forEach(id=>{const g=id&&S.guests[id];if(g&&g.allergies.trim())al.push(`<li><b>${esc(g.name)}</b> · ${esc(tName(x))} · ${esc(g.allergies)}</li>`)}));
  const head=`<tr><th>${t('table')}</th><th>${t('total')}</th>${MEALS.map(m=>`<th>${t(MEAL_LBL[m]||m)}</th>`).join('')}<th>${t('children')}</th></tr>`;
  const tr=r=>`<tr><td>${esc(r.table)}</td><td>${r.total}</td>${MEALS.map(m=>`<td>${r.meals[m]||''}</td>`).join('')}<td>${r.kids||''}</td></tr>`;
  modal(`<h2>${t('catTitle')}</h2><div class="tablewrap"><table class="cat">${head}${rows.map(tr).join('')}<tr class="tot">${tr(Object.assign({table:t('total')},tot)).slice(4)}</table></div>
  <h3>${t('allergyList')}</h3>${al.length?`<ul class="al">${al.join('')}</ul>`:`<p class="muted">${t('noAllergies')}</p>`}
  ${(()=>{const h=(INV.list||[]).filter(i=>!i.revoked&&i.state==='coming'&&i.answer?.allergies);return h.length?`<h3>${t('invAllergyList')}</h3><ul class="al">${h.map(i=>`<li><b>${esc(i.name)}</b> · ${esc(i.answer.allergies)}</li>`).join('')}</ul>`:''})()}
  <div class="row"><button type="button" class="btn primary" id="dlcsv">${t('dlCSV')}</button></div>`);
  $('#dlcsv').onclick=()=>{const L=[['colTable','colSeat','colName','colMeal','colChild','colAllergies','colSide','colGroup'].map(k=>t(k))];S.tables.forEach(x=>x.seats.forEach((id,i)=>{const g=id&&S.guests[id];if(g)L.push([tName(x),i+1,g.name,t(MEAL_LBL[g.meal]||g.meal),g.kid?t('yes'):'',g.allergies,g.side?t(g.side):'',g.group])}));
    const csv='﻿'+L.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');offerFile(fname('-'+t('fileCaterer')+'.csv'),new Blob([csv],{type:'text/csv'}))};
}

/* excel */
async function exportX(){try{await loadScript(XLSXLIB)}catch(e){return toast(t('couldntSave'))}
  // Headings and values follow the interface language; the importer reads both languages back.
  const L=[['colName','colTable','colSeat','colGroup','colSide','colMeal','colChild','colAllergies'].map(k=>t(k))];
  const row=(g,tb,i)=>[g.name,tb,i,g.group,g.side?t(g.side):'',g.meal?t(MEAL_LBL[g.meal]||g.meal):'',g.kid?t('yes'):'',g.allergies];
  S.tables.forEach(x=>x.seats.forEach((id,i)=>{const g=id&&S.guests[id];if(g)L.push(row(g,tName(x),i+1))}));
  S.waiting.forEach(id=>{const g=S.guests[id];if(g)L.push(row(g,'',''))});
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(L),t('sheetGuests').slice(0,31));
  offerFile(fname('-'+t('fileGuests')+'.xlsx'),new Blob([XLSX.write(wb,{type:'array',bookType:'xlsx'})],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}))}
function parseRows(rows){
  const re={name:/^(name|names|guest|სახელი|სტუმარი|სახელი გვარი)/i,table:/(table|მაგიდ)/i,group:/(group|ჯგუფ)/i,side:/(side|მხარე)/i,meal:/(meal|menu|კერძ|კვებ|მენიუ)/i,kid:/(child|kid|ბავშ)/i,allergies:/(allerg|ალერგ)/i};
  let hr=-1,col={};
  for(let r=0;r<Math.min(rows.length,10)&&hr<0;r++)(rows[r]||[]).forEach((c,i)=>{if(typeof c==='string'&&re.name.test(c.trim())){hr=r}});
  if(hr>=0){(rows[hr]||[]).forEach((c,i)=>{if(typeof c!=='string')return;for(const k in re)if(col[k]===undefined&&re[k].test(c.trim()))col[k]=i})}
  else{const r0=rows.find(r=>r&&r.some(v=>v!==null&&v!==''))||[];r0.forEach((v,i)=>{if(col.name===undefined&&typeof v==='string')col.name=i;else if(col.table===undefined&&typeof v==='number')col.table=i});hr=rows.indexOf(r0)-1}
  const sideMap=v=>{v=String(v||'').toLowerCase();return/bride|პატარძ/.test(v)?'bride':/groom|სიძ/.test(v)?'groom':/both|ორივ/.test(v)?'both':''};
  const mealMap=v=>{v=String(v||'').toLowerCase();return/meat|ხორც/.test(v)?'meat':/fish|თევზ/.test(v)?'fish':/vegan|ვეგან/.test(v)?'vegan':/veg|ვეგეტ/.test(v)?'veg':/kid|საბავშ/.test(v)?'kids':''};
  return rows.slice(hr+1).filter(r=>r&&col.name!==undefined&&r[col.name]&&String(r[col.name]).trim()).map(r=>({name:String(r[col.name]).trim(),table:col.table!==undefined?r[col.table]:'',group:col.group!==undefined?String(r[col.group]||''):'',side:sideMap(r[col.side]),meal:mealMap(r[col.meal]),kid:col.kid!==undefined&&/^(y|yes|1|true|კი|დიახ)/i.test(String(r[col.kid]||'')),allergies:col.allergies!==undefined?String(r[col.allergies]||''):''}));
}
function importModal(){
  modal(`<h2>${t('importTitle')}</h2><p class="muted">${t('importHint')}</p>
  <div class="field"><span class="lbl" id="xfile-l">${t('chooseFile')}</span>${filePick('xfile','.xlsx,.xls,.csv','xfile-l')}</div>
  <p id="xinfo" class="muted"></p>
  <div class="field"><span class="lbl">${t('importMode')}</span><label class="check"><input type="radio" name="xmode" value="add" checked> ${t('importAdd')}</label><label class="check"><input type="radio" name="xmode" value="replace"> ${t('importReplace')}</label></div>
  <div class="row"><button type="button" class="btn primary" id="xgo" disabled>${t('importGo')}</button></div>`);
  let parsed=[];
  $('#xfile').onchange=async e=>{const f=e.target.files[0];if(!f)return;$('#xinfo').textContent=t('loadingLib');
    try{await loadScript(XLSXLIB);const wb=XLSX.read(await f.arrayBuffer());const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,blankrows:false});parsed=parseRows(rows);
      $('#xinfo').textContent=parsed.length?t('importFound',{n:parsed.length}):t('importNone');$('#xgo').disabled=!parsed.length}catch(err){$('#xinfo').textContent=t('importNone')}};
  $('#xgo').onclick=()=>{const mode=document.querySelector('input[name=xmode]:checked').value;
    commit(()=>{
      if(mode==='replace'){const keep=new Set(S.tables.filter(x=>x.shape==='head').flatMap(x=>x.seats.filter(Boolean)));
        Object.keys(S.guests).forEach(id=>{if(!keep.has(id))delete S.guests[id]});S.waiting=[];S.rules=S.rules.filter(r=>keep.has(r.a)&&keep.has(r.b));S.tables=S.tables.filter(x=>x.shape==='head')}
      const byTable={};parsed.forEach(r=>{const k=r.table===''||r.table===undefined||r.table===null?'':String(r.table).trim();(byTable[k]=byTable[k]||[]).push(r)});
      const newT=[];
      for(const k in byTable){const list=byTable[k];
        if(k===''){list.forEach(r=>S.waiting.push(mkGuest(r.name,null,{group:r.group,side:r.side,meal:r.meal,kid:r.kid,allergies:r.allergies})));continue}
        const nm=/^\d+$/.test(k)?'Table '+k:k;
        let x=S.tables.find(y=>y.name.toLowerCase()===nm.toLowerCase()||tName(y).toLowerCase()===nm.toLowerCase());
        if(!x){x={id:uid(),name:nm,shape:'rect',deco:'flowers',seats:[]};S.tables.push(x);newT.push(x)}
        list.forEach(r=>{const id=mkGuest(r.name,null,{group:r.group,side:r.side,meal:r.meal,kid:r.kid,allergies:r.allergies});let i=x.seats.indexOf(null);if(i<0){x.seats.push(id)}else x.seats[i]=id});
      }
      if(newT.length||mode==='replace')autoArrange();
    });
    $('#modalroot').innerHTML='';toast(t('importDone',{n:parsed.length}))};
}

/* ---------------- modal ---------------- */
/* File chooser with interface-language text: the native input stays (keyboard, screen readers, drag-and-drop), its browser-language button is hidden. */
const filePick=(id,accept,labelled)=>`<div class="filepick"><input type="file" id="${id}" accept="${accept}" class="fileinput" aria-labelledby="${labelled} ${id}-btn"><label for="${id}" class="btn" id="${id}-btn" aria-hidden="true">${t('pickFile')}</label><span class="fname" id="${id}-name" aria-live="polite">${t('noFile')}</span></div>`;
document.addEventListener('change',e=>{const i=e.target;if(i.classList?.contains('fileinput')){const n=document.getElementById(i.id+'-name');if(n)n.textContent=i.files[0]?.name||t('noFile')}},true);
function modal(html){const r=$('#modalroot'),back=document.activeElement;
  r.innerHTML=`<div class="modal" role="dialog" aria-modal="true" aria-labelledby="mtitle"><div class="box" tabindex="-1">${html.replace('<h2>','<h2 id="mtitle">')}<div class="row end"><button type="button" class="btn" data-close>${t('close')}</button></div></div></div>`;
  const shut=()=>{r.innerHTML='';document.removeEventListener('keydown',key,true);back&&back.focus&&back.focus()};
  const key=e=>{if(e.key==='Escape'){e.stopPropagation();e.preventDefault();shut()}
    if(e.key==='Tab'){const f=[...r.querySelectorAll('button,[href],input,select,textarea')].filter(el=>!el.disabled);if(!f.length)return;
      if(e.shiftKey&&(document.activeElement===f[0]||!r.contains(document.activeElement))){e.preventDefault();f[f.length-1].focus()}else if(!e.shiftKey&&document.activeElement===f[f.length-1]){e.preventDefault();f[0].focus()}}};
  document.addEventListener('keydown',key,true);
  r.querySelector('[data-close]').onclick=shut;r.querySelector('.modal').onclick=e=>{if(e.target.classList.contains('modal'))shut()};
  r.querySelector('.box').focus()}

