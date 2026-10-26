(()=>{
'use strict';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const CFG=window.SUPRA_CONFIG||{},L=window.SUPRA_I18N;
let lang=(()=>{try{return localStorage.getItem('supra.lang')}catch(e){return null}})()||((navigator.language||'').startsWith('ka')?'ka':'en');
const t=(k,v)=>{let s=(L[lang]||L.en)[k]??L.en[k]??k;if(v)for(const x in v)s=s.replace('{'+x+'}',v[x]);return s};
const next=(()=>{const n=new URLSearchParams(location.search).get('next');return n&&n.startsWith('/')&&!n.startsWith('//')?n:null})();
const fmtDate=d=>d?new Intl.DateTimeFormat(lang==='ka'?'ka-GE':'en-GB',{day:'numeric',month:'long',year:'numeric'}).format(new Date(d+'T12:00')):'';
const rand=n=>{const a='abcdefghjkmnpqrstuvwxyz23456789';let s='';crypto.getRandomValues(new Uint8Array(n)).forEach(v=>s+=a[v%a.length]);return s};
function toast(m){const d=document.createElement('div');d.className='toast';d.setAttribute('role','status');d.textContent=m;document.body.appendChild(d);setTimeout(()=>d.remove(),2400)}

/* ---------------- auth state machine ----------------
   initializing → anonymous | authenticated | error
   anonymous → authenticating → anonymous (with a form error) | authenticated
   Every auth change bumps `gen`; an async result is applied only if gen has not moved since it started,
   so a slow session restore or a late failed sign-in can never overwrite a newer state. */
const A={state:'initializing',session:null,gen:0,busy:null,formError:null,initError:null};
let SB=null,sub=null;
const F={mode:'signin',email:'',sent:false,recovery:false};            // sign-in form state survives re-renders and language changes
const D={events:null,loadErr:false,confirmId:null,name:'',date:'',nerr:''}; // dashboard state

function setAuth(state,patch){Object.assign(A,patch||{},{state});render()}
function sessionValid(s){return !!(s&&s.user&&(!s.expires_at||s.expires_at*1000>Date.now()-5000))}
function onAuthEvent(ev,s){
  if(ev==='INITIAL_SESSION'&&!sessionValid(s))return;            // the explicit restore() decides the anonymous case
  if(ev==='TOKEN_REFRESHED'&&A.state==='authenticated'&&sessionValid(s)){A.session=s;return}
  A.gen++;
  if(ev==='PASSWORD_RECOVERY'){F.recovery=true;F.mode='signin';setAuth('anonymous',{session:null,busy:null,formError:null});return}
  if(F.recovery&&ev!=='SIGNED_OUT')return;
  if(sessionValid(s)){
    const was=A.state==='authenticated';
    if(next&&!was){location.replace(next);return}
    setAuth('authenticated',{session:s,busy:null,formError:null});if(!was)loadEvents();return}
  D.events=null;F.sent=false;setAuth('anonymous',{session:null,busy:null});
}
function withTimeout(p,ms){return Promise.race([p,new Promise((_,no)=>setTimeout(()=>no(new Error('timeout')),ms))])}
async function restore(){
  const gen=++A.gen;setAuth('initializing',{initError:null});
  try{
    const{data,error}=await withTimeout(SB.auth.getSession(),12000);
    if(gen!==A.gen)return;
    const s=data&&data.session;
    if(!error&&sessionValid(s)){if(next){location.replace(next);return}setAuth('authenticated',{session:s});loadEvents();return}
    setAuth('anonymous',{session:null});
  }catch(e){if(gen!==A.gen)return;setAuth('error',{initError:e&&e.message||'error'})}
}

/* ---------------- chrome ---------------- */
const SUN='<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',MOON='<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
const curTheme=()=>document.documentElement.dataset.theme||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
function chrome(){
  document.documentElement.lang=lang;document.title=t('dTitle');
  const md=document.querySelector('meta[name=description]');if(md)md.content=t('dMeta');
  const th=$('#theme'),dark=curTheme()==='dark';th.innerHTML=dark?SUN:MOON;th.setAttribute('aria-pressed',String(dark));th.setAttribute('aria-label',t('darkMode'));th.title=t('darkMode');
  $('#lang').setAttribute('aria-label',t('language'));
  $('#lang').innerHTML=[['en','EN','English'],['ka','ქარ','ქართული']].map(([k,s,full])=>`<button type="button" role="radio" data-lang="${k}" aria-checked="${lang===k}" tabindex="${lang===k?0:-1}" aria-label="${full}" lang="${k}">${s}</button>`).join('');
  $('#tag').textContent=t('dTag');
  $('#feats').innerHTML=['dF1','dF2','dF3','dF4'].map(k=>`<li>${esc(t(k))}</li>`).join('');
  const authed=A.state==='authenticated';
  $('#who').textContent=authed?(A.session.user.email||''):'';
  const so=$('#signout');so.hidden=!authed;so.textContent=t('dSignOut');
}
function render(){chrome();
  if(A.state==='initializing')return renderLoading();
  if(A.state==='error')return renderInitError();
  if(A.state==='authenticated')return renderDash();
  renderSignIn();
}
function renderLoading(){$('#main').innerHTML=`<div class="card signin loading" role="status" aria-live="polite"><span class="spinner" aria-hidden="true"></span><span>${esc(t('dLoading'))}</span></div>`}
function renderInitError(){$('#main').innerHTML=`<div class="card signin" role="alert"><p class="msg err">${esc(t('dInitErr'))}</p><button type="button" class="btn primary" data-act="retry">${esc(t('dRetry'))}</button></div>`}

/* ---------------- sign-in ---------------- */
function friendly(err){const m=(err&&err.message||'').toLowerCase();
  if(m.includes('invalid login'))return{text:t('dBadLogin'),field:'pw'};
  if(m.includes('already registered')||m.includes('already been registered'))return{text:t('dExists'),field:'email'};
  if(m.includes('rate limit'))return{text:t('dRate'),field:null};
  if(m.includes('password')&&(m.includes('least')||m.includes('weak')||m.includes('short')))return{text:t('dWeak'),field:'pw'};
  if(m.includes('not confirmed'))return{text:t('dUnconfirmed'),field:'email'};
  if(m.includes('fetch')||m.includes('network')||m.includes('timeout'))return{text:t('dNetErr'),field:null};
  return{text:t('dErr'),field:null}}
function renderSignIn(){
  const fe=A.formError,busy=A.state==='authenticating';
  const errFor=f=>fe&&fe.field===f?` aria-invalid="true" aria-describedby="ferr"`:'';
  const submitLbl=F.recovery?'dSavePw':F.mode==='signup'?'dCreateAcct':F.mode==='forgot'?'dSendReset':F.mode==='link'?'dSend':'dSignIn';
  const emailF=`<label class="field"><span class="lbl">${esc(t('dEmail'))}</span><input class="inp" id="email" name="email" type="email" autocomplete="email" required value="${esc(F.email)}" placeholder="name@example.com"${errFor('email')}></label>`;
  const pwF=`<label class="field"><span class="lbl">${esc(t('dPassword'))}</span><input class="inp" id="pw" name="password" type="password" autocomplete="${F.mode==='signup'||F.recovery?'new-password':'current-password'}" minlength="6" required${errFor('pw')}${F.mode==='signup'||F.recovery?' aria-describedby="pwhint'+(fe&&fe.field==='pw'?' ferr':'')+'"':''}>${F.mode==='signup'||F.recovery?`<span class="small" id="pwhint">${esc(t('dPwHint'))}</span>`:''}</label>`;
  let body;
  if(F.recovery)body=`<h2 id="ftitle">${esc(t('dNewPw'))}</h2>${pwF}`;
  else if(F.sent)body=`<p class="msg" role="status">${esc(t(F.mode==='forgot'?'dResetSent':F.mode==='signup'?'dConfirm':'dSent'))}</p><button type="button" class="linkish" data-mode="signin">${esc(t('dBack'))}</button>`;
  else if(F.mode==='link'||F.mode==='forgot')body=`<h2 id="ftitle">${esc(t(F.mode==='forgot'?'dForgotTitle':'dLinkTitle'))}</h2>${emailF}`;
  else body=`<div class="tabs2" role="tablist" aria-label="${esc(t('dAccount'))}">${[['signin','dSignIn'],['signup','dSignUp']].map(([k,l])=>`<button type="button" role="tab" class="tabbtn" id="tab-${k}" data-mode="${k}" aria-selected="${F.mode===k}" aria-controls="authpanel" tabindex="${F.mode===k?0:-1}">${esc(t(l))}</button>`).join('')}</div>${emailF}${pwF}`;
  const showSubmit=!F.sent;
  const extra=(!F.recovery&&!F.sent)?(F.mode==='link'||F.mode==='forgot'?`<button type="button" class="linkish" data-mode="signin">${esc(t('dBack'))}</button>`:
    `<div class="row2l">${F.mode==='signin'?`<button type="button" class="linkish" data-mode="forgot">${esc(t('dForgot'))}</button>`:'<span></span>'}<button type="button" class="linkish" data-mode="link">${esc(t('dUseLink'))}</button></div>
    ${CFG.googleSignIn?`<div class="or">${esc(t('dOr'))}</div><button class="btn" type="button" id="google">${esc(t('dGoogle'))}</button>`:''}`):'';
  const tp=F.mode==='signin'||F.mode==='signup';
  $('#main').innerHTML=`${tp?`<div role="tabpanel" id="authpanel" aria-labelledby="tab-${F.mode}">`:''}<form class="card signin" id="sform" novalidate aria-labelledby="${tp?'tab-'+F.mode:'ftitle'}">${body}
    ${fe?`<p class="msg err" id="ferr" role="alert">${esc(fe.text)}</p>`:''}
    ${showSubmit?`<button class="btn primary" type="submit" ${busy?'disabled aria-busy="true"':''}>${busy?`<span class="spinner sm" aria-hidden="true"></span>`:''}${esc(t(submitLbl))}</button>`:''}${extra}</form>${tp?'</div>':''}`;
}
function focusAfterRender(field){const el=field==='email'?$('#email'):field==='pw'?$('#pw'):null;(el||$('#email')||$('#pw'))?.focus()}

async function submitAuth(){
  const email=($('#email')?.value||'').trim(),pw=$('#pw')?.value||'';F.email=email;
  const needEmail=!F.recovery,needPw=F.recovery||F.mode==='signin'||F.mode==='signup';
  const bad=(text,field)=>{A.formError={text,field};if(field==='pw'||needPw){/* never keep a password in the DOM after a failure */}render();if($('#pw'))$('#pw').value='';focusAfterRender(field)};
  if(needEmail&&!/^\S+@\S+\.\S+$/.test(email))return bad(t('dEmailBad'),'email');
  if(needPw&&pw.length<6)return bad(t('dWeak'),'pw');
  const gen=++A.gen;A.state='authenticating';A.formError=null;A.busy=F.recovery?'recovery':F.mode;
  $('#ferr')?.remove();$('#email')?.removeAttribute('aria-invalid');$('#pw')?.removeAttribute('aria-invalid');
  const sb=$('#sform [type=submit]');if(sb){sb.disabled=true;sb.setAttribute('aria-busy','true');sb.insertAdjacentHTML('afterbegin','<span class="spinner sm" aria-hidden="true"></span>')}
  let res;
  try{
    if(F.recovery)res=await SB.auth.updateUser({password:pw});
    else if(F.mode==='signin')res=await SB.auth.signInWithPassword({email,password:pw});
    else if(F.mode==='signup')res=await SB.auth.signUp({email,password:pw,options:{emailRedirectTo:location.origin+(next||'/')}});
    else if(F.mode==='forgot')res=await SB.auth.resetPasswordForEmail(email,{redirectTo:location.origin+'/'});
    else res=await SB.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin+(next||'/')}});
  }catch(e){res={error:e}}
  if(gen!==A.gen)return;                       // a newer auth change (e.g. a restored session) already decided the screen
  if(res&&res.error){const f=friendly(res.error);A.state='anonymous';A.busy=null;A.formError=f;render();if($('#pw'))$('#pw').value='';focusAfterRender(f.field||'pw');return}
  if(F.recovery){F.recovery=false;history.replaceState(null,'','/');const{data}=await SB.auth.getSession();if(gen!==A.gen)return;setAuth(sessionValid(data.session)?'authenticated':'anonymous',{session:data.session,busy:null});if(A.state==='authenticated')loadEvents();return}
  const s=res&&res.data&&res.data.session;
  if(sessionValid(s)){A.gen++;if(next){location.replace(next);return}setAuth('authenticated',{session:s,busy:null});loadEvents();return}
  F.sent=F.mode!=='signin';setAuth('anonymous',{busy:null});
}

/* ---------------- dashboard ---------------- */
const SOON=['birthday','corporate','baby','anniv'];
function renderDash(){
  const today=new Date().toISOString().slice(0,10);
  const list=D.loadErr?`<div class="empty" role="alert"><p>${esc(t('dLoadErr'))}</p><button type="button" class="btn sm" data-act="reload">${esc(t('dRetry'))}</button></div>`
    :D.events===null?`<p class="empty" role="status">${esc(t('dLoadingEvents'))}</p>`
    :D.events.length?`<ul class="events" role="list">${D.events.map(evCard).join('')}</ul>`:`<p class="empty">${esc(t('dNone'))}</p>`;
  $('#main').innerHTML=`<div class="dash">
  <form class="card" id="nform" novalidate aria-labelledby="newh"><h2 id="newh">${esc(t('dNew'))}</h2>
    <div class="newgrid">
      <label class="field"><span class="lbl">${esc(t('eventName'))}</span><input class="inp" id="nname" value="${esc(D.name)}" placeholder="${esc(t('dNamePh'))}" ${D.nerr?'aria-invalid="true" aria-describedby="nerr"':''}></label>
      <label class="field"><span class="lbl">${esc(t('eventType'))}</span><select id="ntype"><option value="wedding">${esc(t('wedding'))}</option></select></label>
      <label class="field"><span class="lbl">${esc(t('date'))}</span><input class="inp" id="ndate" type="date" min="${today}" value="${esc(D.date)}"></label>
      <button class="btn primary" type="submit">${esc(t('dCreate'))}</button>
    </div>
    ${D.nerr?`<p class="msg err" id="nerr" role="alert">${esc(D.nerr)}</p>`:''}
    <p class="small soon">${esc(t('soonLine'))} ${SOON.map(k=>esc(t(k))).join(', ')}.</p>
    <div class="field"><label class="lbl" for="nfile">${esc(t('dImport'))}</label><input type="file" id="nfile" accept=".json,application/json" aria-describedby="nfilehint"><span class="small" id="nfilehint">${esc(t('dImportHint'))}</span></div>
  </form>
  <section aria-labelledby="yourh" class="yours"><h2 id="yourh">${esc(t('dYour'))}</h2>${list}</section></div>`;
}
function evCard(e){
  const n=e.guests?Object.keys(e.guests).length:0,nm=e.name||'—';
  return`<li class="ev"><h3>${esc(nm)}</h3><div class="meta">${esc([fmtDate(e.event_date),n+' '+t('dGuests')].filter(Boolean).join(' · '))}</div>
    <div class="row"><a class="btn sm primary" href="/edit/${esc(e.id)}" aria-label="${esc(t('dOpen')+': '+nm)}">${esc(t('dOpen'))}</a>${e.guest_page?`<button type="button" class="btn sm" data-copy="${esc(e.slug)}" aria-label="${esc(t('dGuestLink')+': '+nm)}">${esc(t('dGuestLink'))}</button>`:''}<button type="button" class="btn sm danger" data-del="${esc(e.id)}" aria-label="${esc(t('dDelete')+': '+nm)}">${esc(t('dDelete'))}</button></div>
    ${D.confirmId===e.id?`<div class="confirm" role="alertdialog" aria-label="${esc(t('dDelete'))}"><span>${esc(t('dDeleteQ',{n:nm}))}</span><div class="row"><button type="button" class="btn sm danger" data-delyes="${esc(e.id)}">${esc(t('dDelete'))}</button><button type="button" class="btn sm" data-cancel>${esc(t('dKeep'))}</button></div></div>`:''}</li>`;
}
let loadGen=0;
async function loadEvents(){
  const g=++loadGen;D.loadErr=false;
  const{data,error}=await SB.from('events').select('id,name,event_date,slug,guest_page,updated_at,guests:data->guests').order('updated_at',{ascending:false});
  if(g!==loadGen||A.state!=='authenticated')return;
  if(error){D.loadErr=true;D.events=[]}else D.events=data||[];
  render();
}
async function create(fields){
  for(let i=0;i<4;i++){
    const{data,error}=await SB.from('events').insert(Object.assign({slug:rand(10)},fields)).select('id').single();
    if(!error){location.href='/edit/'+data.id;return}
    if(error.code!=='23505'){toast(t('dErr'));return}
  }
}

/* ---------------- events ---------------- */
document.addEventListener('submit',e=>{
  e.preventDefault();
  if(e.target.id==='sform'){if(A.state!=='authenticating')submitAuth();return}
  if(e.target.id==='nform'){const name=$('#nname').value.trim();D.name=name;D.date=$('#ndate').value;
    if(!name){D.nerr=t('dNameReq');render();$('#nname').focus();return}
    D.nerr='';create({name,type:'wedding',event_date:D.date||null})}
});
document.addEventListener('input',e=>{
  if(e.target.id==='email')F.email=e.target.value;
  if(e.target.id==='nname'){D.name=e.target.value;if(D.nerr){D.nerr='';e.target.removeAttribute('aria-invalid');$('#nerr')?.remove()}}
  if(e.target.id==='ndate')D.date=e.target.value;
  if((e.target.id==='email'||e.target.id==='pw')&&A.formError&&A.formError.field){A.formError=null;$('#ferr')?.remove();e.target.removeAttribute('aria-invalid')}
});
document.addEventListener('change',async e=>{
  if(e.target.id!=='nfile')return;const f=e.target.files[0];if(!f)return;
  try{const plan=JSON.parse(await f.text());if(!plan||!Array.isArray(plan.tables)||typeof plan.guests!=='object')throw 0;
    delete plan.savedAt;if(plan.event)delete plan.event.shareLink;
    toast(t('dImported'));create({name:plan.event?.name||f.name.replace(/\.json$/,''),type:'wedding',event_date:plan.event?.date||null,data:plan});
  }catch(err){toast(t('dBadFile'));e.target.value=''}
});
document.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b)return;const d=b.dataset;
  if(d.mode){if(A.state==='authenticating')return;const wasTab=b.getAttribute('role')==='tab';F.mode=d.mode;F.sent=false;A.formError=null;render();(wasTab?$('#tab-'+F.mode):$('#email'))?.focus();return}
  if(d.lang){if(d.lang===lang)return;lang=d.lang;try{localStorage.setItem('supra.lang',lang)}catch(x){}const ae=document.activeElement?.id;render();($('#'+ae)||$(`[data-lang="${lang}"]`))?.focus();return}
  if(b.id==='theme'){const n=curTheme()==='dark'?'light':'dark';document.documentElement.dataset.theme=n;try{localStorage.setItem('supra.theme',n)}catch(x){}chrome();return}
  if(b.id==='signout'){b.disabled=true;await SB.auth.signOut();return}
  if(b.id==='google'){SB.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+(next||'/')}});return}
  if(d.act==='retry'){restore();return}
  if(d.act==='reload'){D.events=null;render();loadEvents();return}
  if(d.copy){const u=location.origin+'/e/'+d.copy;navigator.clipboard?.writeText(u).then(()=>toast(t('dCopied')),()=>toast(u));return}
  if(d.del){D.confirmId=d.del;render();$('[data-cancel]')?.focus();return}
  if(d.cancel!==undefined){const id=D.confirmId;D.confirmId=null;render();$(`[data-del="${id}"]`)?.focus();return}
  if(d.delyes){b.disabled=true;const{error}=await SB.from('events').delete().eq('id',d.delyes);if(error)toast(t('dErr'));D.confirmId=null;loadEvents();return}
});
// Arrow keys inside radio groups and tab lists.
document.addEventListener('keydown',e=>{
  const grp=e.target.closest('[role=radiogroup],[role=tablist]');if(!grp)return;
  const items=[...grp.querySelectorAll('[role=radio],[role=tab]')],i=items.indexOf(e.target);if(i<0)return;
  let j=null;if(e.key==='ArrowRight'||e.key==='ArrowDown')j=(i+1)%items.length;else if(e.key==='ArrowLeft'||e.key==='ArrowUp')j=(i-1+items.length)%items.length;else if(e.key==='Home')j=0;else if(e.key==='End')j=items.length-1;
  if(j===null)return;e.preventDefault();items[j].click();requestAnimationFrame(()=>{const sel=grp.id?document.querySelector('#'+grp.id+' [aria-checked=true],#'+grp.id+' [aria-selected=true]'):null;(sel||items[j]).focus()});
});
window.addEventListener('pagehide',()=>{try{sub&&sub.unsubscribe()}catch(e){}});

function boot(){
  render();
  if(!CFG.supabaseUrl||CFG.supabaseUrl.startsWith('YOUR_')){$('#main').innerHTML='<p class="empty">Supra is not connected to its database yet.</p>';return}
  SB=window.supabase.createClient(CFG.supabaseUrl,CFG.supabaseAnonKey);
  const r=SB.auth.onAuthStateChange((ev,s)=>onAuthEvent(ev,s));sub=r&&r.data&&r.data.subscription;
  restore();
}
window.__supraAuth=()=>({state:A.state,gen:A.gen,authed:A.state==='authenticated'});
boot();
})();
