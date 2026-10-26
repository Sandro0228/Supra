(()=>{
'use strict';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const CFG=window.SUPRA_CONFIG||{},L=window.SUPRA_I18N;
let lang=(()=>{try{return localStorage.getItem('supra.lang')}catch(e){return null}})()||((navigator.language||'').startsWith('ka')?'ka':'en');
const t=(k,v)=>{let s=(L[lang]||L.en)[k]??L.en[k]??k;if(v)for(const x in v)s=s.replace('{'+x+'}',v[x]);return s};
const next=new URLSearchParams(location.search).get('next');
let SB=null,session=null,events=[],confirmId=null,msg={text:'',err:false},sent=false;
function toast(m){const d=document.createElement('div');d.className='toast';d.setAttribute('role','status');d.textContent=m;document.body.appendChild(d);setTimeout(()=>d.remove(),2200)}
const rand=n=>{const a='abcdefghjkmnpqrstuvwxyz23456789';let s='';const r=crypto.getRandomValues(new Uint8Array(n));r.forEach(v=>s+=a[v%a.length]);return s};
const fmtDate=d=>d?new Date(d+'T12:00').toLocaleDateString(lang==='ka'?'ka-GE':'en-GB',{day:'numeric',month:'long',year:'numeric'}):'';

function chrome(){
  document.documentElement.lang=lang;
  $('#lang').innerHTML=`<button data-lang="en" aria-pressed="${lang==='en'}">EN</button><button data-lang="ka" aria-pressed="${lang==='ka'}">ქარ</button>`;
  $('#tag').textContent=t('dTag');
  $('#feats').innerHTML=['dF1','dF2','dF3','dF4'].map(k=>`<li>${esc(t(k))}</li>`).join('');
  $('#who').textContent=session?.user?.email||'';
  const so=$('#signout');so.hidden=!session;so.textContent=t('dSignOut');
}
function render(){chrome();session?renderDash():renderSignIn()}
function renderSignIn(){
  $('#main').innerHTML=`<form class="card signin" id="sform" novalidate>
    ${sent?`<p class="msg">${esc(t('dSent'))}</p>`:`
    <label class="field"><span class="lbl">${esc(t('dEmail'))}</span><input class="inp" id="email" type="email" autocomplete="email" required placeholder="name@example.com"></label>
    <button class="btn primary" type="submit">${esc(t('dSend'))}</button>
    ${CFG.googleSignIn?`<div class="or">${esc(t('dOr'))}</div><button class="btn" type="button" id="google">${esc(t('dGoogle'))}</button>`:''}`}
    ${msg.text?`<p class="msg ${msg.err?'err':''}">${esc(msg.text)}</p>`:''}
  </form>`;
}
function renderDash(){
  const today=new Date().toISOString().slice(0,10);
  $('#main').innerHTML=`<div style="display:flex;flex-direction:column;gap:22px">
  <form class="card" id="nform" novalidate><h2>${esc(t('dNew'))}</h2>
    <div class="newgrid">
      <label class="field"><span class="lbl">${esc(t('eventName'))}</span><input class="inp" id="nname" placeholder="Nino & Giorgi"></label>
      <label class="field"><span class="lbl">${esc(t('eventType'))}</span><select id="ntype">${[['wedding',1],['birthday',0],['corporate',0],['baby',0],['anniv',0]].map(([k,on])=>`<option value="${k}" ${on?'':'disabled'}>${esc(t(k))}${on?'':' · '+esc(t('soon'))}</option>`).join('')}</select></label>
      <label class="field"><span class="lbl">${esc(t('date'))}</span><input class="inp" id="ndate" type="date" min="${today}"></label>
      <button class="btn primary" type="submit">${esc(t('dCreate'))}</button>
    </div>
    <p class="msg err" id="nerr" hidden></p>
    <div class="field"><span class="lbl">${esc(t('dImport'))}</span><input type="file" id="nfile" accept=".json,application/json"><span class="small">${esc(t('dImportHint'))}</span></div>
  </form>
  <section style="display:flex;flex-direction:column;gap:12px"><h2>${esc(t('dYour'))}</h2>
    ${events.length?`<div class="events">${events.map(evCard).join('')}</div>`:`<p class="empty">${esc(t('dNone'))}</p>`}
  </section></div>`;
}
function evCard(e){
  const n=e.guests?Object.keys(e.guests).length:0;
  return`<article class="ev"><h3>${esc(e.name||'—')}</h3><div class="meta">${esc([fmtDate(e.event_date),n+' '+t('dGuests')].filter(Boolean).join(' · '))}</div>
    <div class="row"><a class="btn sm primary" href="/edit/${esc(e.id)}">${esc(t('dOpen'))}</a>${e.guest_page?`<button class="btn sm" data-copy="${esc(e.slug)}">${esc(t('dGuestLink'))}</button>`:''}<button class="btn sm danger" data-del="${esc(e.id)}">${esc(t('dDelete'))}</button></div>
    ${confirmId===e.id?`<div class="confirm"><span>${esc(t('dDeleteQ',{n:e.name||'—'}))}</span><div class="row"><button class="btn sm danger" data-delyes="${esc(e.id)}">${esc(t('dDelete'))}</button><button class="btn sm" data-cancel>${esc(t('dKeep'))}</button></div></div>`:''}</article>`;
}
async function load(){
  const{data,error}=await SB.from('events').select('id,name,event_date,slug,guest_page,updated_at,guests:data->guests').order('updated_at',{ascending:false});
  if(error){toast(t('dErr'));events=[]}else events=data||[];
  renderDash();
}
async function create(fields){
  for(let i=0;i<4;i++){
    const{data,error}=await SB.from('events').insert(Object.assign({slug:rand(10)},fields)).select('id').single();
    if(!error){location.href='/edit/'+data.id;return}
    if(error.code!=='23505'){toast(t('dErr'));console.error(error);return}
  }
}
document.addEventListener('submit',async e=>{
  e.preventDefault();
  if(e.target.id==='sform'){const email=$('#email').value.trim();
    if(!/^\S+@\S+\.\S+$/.test(email)){msg={text:t('dEmail')+'?',err:true};renderSignIn();return}
    const{error}=await SB.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin+(next||'/')}});
    if(error){msg={text:error.message||t('dErr'),err:true};renderSignIn()}else{sent=true;msg={text:'',err:false};renderSignIn()}}
  if(e.target.id==='nform'){const name=$('#nname').value.trim();
    if(!name){const n=$('#nerr');n.textContent=t('dNameReq');n.hidden=false;$('#nname').focus();return}
    create({name,type:$('#ntype').value,event_date:$('#ndate').value||null})}
});
document.addEventListener('input',e=>{if(e.target.id==='nname'){const n=$('#nerr');if(n)n.hidden=true}});
document.addEventListener('change',async e=>{
  if(e.target.id!=='nfile')return;const f=e.target.files[0];if(!f)return;
  try{const plan=JSON.parse(await f.text());if(!plan||!Array.isArray(plan.tables)||typeof plan.guests!=='object')throw 0;
    delete plan.savedAt;delete plan.shareLink;if(plan.event)delete plan.event.shareLink;
    toast(t('dImported'));
    create({name:plan.event?.name||f.name.replace(/\.json$/,''),type:'wedding',event_date:plan.event?.date||null,data:plan});
  }catch(err){toast(t('dBadFile'));e.target.value=''}
});
document.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b)return;const d=b.dataset;
  if(d.lang){lang=d.lang;try{localStorage.setItem('supra.lang',lang)}catch(x){}render();return}
  if(b.id==='signout'){await SB.auth.signOut();return}
  if(b.id==='google'){SB.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+(next||'/')}});return}
  if(d.copy){const u=location.origin+'/e/'+d.copy;navigator.clipboard?.writeText(u).then(()=>toast(t('dCopied')),()=>toast(u));return}
  if(d.del){confirmId=d.del;renderDash();return}
  if(d.cancel!==undefined){confirmId=null;renderDash();return}
  if(d.delyes){const{error}=await SB.from('events').delete().eq('id',d.delyes);if(error)toast(t('dErr'));confirmId=null;load();return}
});
async function boot(){
  chrome();
  if(!CFG.supabaseUrl||CFG.supabaseUrl.startsWith('YOUR_')){$('#main').innerHTML='<p class="empty">Supra is not connected to its database yet. Fill in config.js.</p>';return}
  SB=window.supabase.createClient(CFG.supabaseUrl,CFG.supabaseAnonKey);
  const{data}=await SB.auth.getSession();session=data.session;
  if(session&&next&&next.startsWith('/')){location.replace(next);return}
  render();if(session)load();
  SB.auth.onAuthStateChange((ev,s)=>{const was=!!session;session=s;
    if(s&&!was){if(next&&next.startsWith('/')){location.replace(next);return}render();load()}
    else if(!s&&was){events=[];sent=false;render()}});
}
boot();
})();
