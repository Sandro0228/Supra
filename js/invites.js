'use strict';
/* Invitations tab (RSVP M3): households, contacts, sending links, answers, recent changes and RSVP settings.
   Invitations live in their own table (public.invites, migration 008), not in the plan, so they are saved
   right away and are not part of undo. Part of the planner (app.html); see js/README.md. */
let INV={list:null,log:[],busy:false,err:'',q:'',filter:'all',form:null,formErr:'',picker:'',confirm:null,plan:null};
const INV_GROUP_MAX=12;   // a guest group bigger than this is not a household: one invitation per person
ICON.invites='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>';

/* ---------- event columns saved with the plan (starts_at, venue, RSVP settings) ---------- */
// Tbilisi is UTC+4 all year (no daylight saving), so local wedding times convert without a time-zone library.
const tbIso=(date,time)=>date&&time?new Date(`${date}T${time}:00+04:00`).toISOString():null;
const okMapUrl=u=>!u||(/^https:\/\/\S+$/.test(u)&&u.length<=500);
function rsvpOf(e){const r=e.rsvp||{};return{open:r.open!==false,deadline:['custom','none'].includes(r.deadline)?r.deadline:'auto',deadlineAt:r.deadlineAt||'',msg:r.msg||{}}}
function eventCols(){const e=S.event,r=rsvpOf(e);
  return{starts_at:tbIso(e.date,e.time),venue_name:(e.venue||'').trim().slice(0,200)||null,venue_map_url:okMapUrl(e.mapUrl)&&e.mapUrl?e.mapUrl:null,
    rsvp_open:r.open,rsvp_deadline:r.deadline==='custom'&&r.deadlineAt?new Date(r.deadlineAt+':00+04:00').toISOString():null,rsvp_no_deadline:r.deadline==='none'}}
function invDeadline(){const c=eventCols();if(c.rsvp_no_deadline)return null;return c.rsvp_deadline||(c.starts_at?new Date(new Date(c.starts_at).getTime()-864e5).toISOString():null)}

/* ---------- loading and saving ---------- */
async function invLoad(){if(!SB||!ROW||INV.busy)return;INV.busy=true;INV.err='';
  try{const[a,b]=await Promise.all([SB.from('invites').select('*').eq('event_id',ROW.id).order('created_at'),
      SB.from('invite_log').select('*').eq('event_id',ROW.id).order('at',{ascending:false}).limit(30)]);
    if(a.error)throw a.error;if(b.error)throw b.error;INV.list=a.data||[];INV.log=b.data||[]}
  catch(e){logSafe('invites',e);INV.err=t('invLoadErr')}
  INV.busy=false;invRender()}
function invRender(focus){if(panel!=='invites'||sel.kind)return;const fk=focus||focusKeyOf(document.activeElement);renderLeft();
  const el=fk&&document.querySelector(fk);if(el&&el!==document.activeElement)el.focus({preventScroll:true})}
const invById=id=>(INV.list||[]).find(i=>i.id===id);
function invPut(row){const L=INV.list||(INV.list=[]),k=L.findIndex(i=>i.id===row.id);if(k<0)L.push(row);else L[k]=row}

/* ---------- message and send links ---------- */
const invLink=i=>`${location.origin}/r/${i.token}`;
function invMessage(i){const e=S.event,lang=i.lang==='en'?'en':'ka',own=(rsvpOf(e).msg[lang]||'').trim();
  const tpl=own||(L10N[lang]||L10N.en).invMsgDefault,when=e.date?(e.time?fmtWhenIn(tbIso(e.date,e.time),lang):fmtDateIn(e.date,lang)):'';
  return tpl.split('{name}').join(i.name||'').split('{event}').join(e.name||'').split('{date}').join(when).split('{link}').join(invLink(i))}
// Dates in the invitation's own language, whatever language the couple is using.
function withLang(lang,fn){const keep=LANG;LANG=lang;try{return fn()}finally{LANG=keep}}
const fmtDateIn=(d,lang)=>withLang(lang,()=>fmtDate(d)),fmtWhenIn=(iso,lang)=>withLang(lang,()=>fmtWhen(iso));
// Georgian mobile numbers are 9 digits starting with 5; links need the country code.
function phoneDigits(p){let d=String(p||'').replace(/[^\d+]/g,'');if(d.startsWith('00'))d='+'+d.slice(2);
  if(d.startsWith('+'))return d.slice(1).replace(/\D/g,'');if(/^5\d{8}$/.test(d))return'995'+d;return d.replace(/\D/g,'')}
function sendHref(i,via){const m=encodeURIComponent(invMessage(i)),ph=phoneDigits(i.phone);
  if(via==='wa')return`https://wa.me/${ph}?text=${m}`;
  if(via==='viber')return`viber://forward?text=${m}`;
  if(via==='sms')return`sms:${ph?'+'+ph:''}?&body=${m}`;
  return`mailto:${encodeURIComponent(i.email||'')}?subject=${encodeURIComponent((L10N[i.lang==='en'?'en':'ka']||L10N.en).invMailSubject.split('{event}').join(S.event.name||''))}&body=${m}`}
async function invMarkSent(id,via){const i=invById(id);if(!i)return;const sent=[...(i.sent||[]),{via,at:new Date().toISOString()}].slice(-10);
  i.sent=sent;invRender();
  const{data,error}=await SB.from('invites').update({sent}).eq('id',id).select().single();if(error){logSafe('invsent',error);return}invPut(data)}

/* ---------- invitations from guest groups ---------- */
function invUncovered(){const has=new Set((INV.list||[]).filter(i=>!i.revoked).flatMap(i=>i.members||[]));
  return Object.values(S.guests).filter(g=>g&&!g.anon&&g.name&&!has.has(g.id))}
function invGroupPlan(){const by=new Map(),out=[];
  invUncovered().forEach(g=>{const k=(g.group||'').trim();if(!k){out.push({name:g.name,members:[g.id]});return}(by.get(k)||by.set(k,[]).get(k)).push(g)});
  by.forEach((gs,k)=>{if(gs.length<=INV_GROUP_MAX)out.push({name:k,members:gs.map(g=>g.id)});else gs.forEach(g=>out.push({name:g.name,members:[g.id]}))});
  return out.sort((a,b)=>b.members.length-a.members.length||a.name.localeCompare(b.name))}
async function invCreate(rows){const lang=S.event.lang==='en'?'en':'ka';
  const{data,error}=await SB.from('invites').insert(rows.map(r=>({event_id:ROW.id,lang,...r}))).select();
  if(error){logSafe('invcreate',error);toast(t('invSaveErr'));return false}(data||[]).forEach(invPut);return true}

/* ---------- the panel ---------- */
const invMembers=i=>(i.members||[]).map(id=>S.guests[id]?.name).filter(Boolean);
function invTotals(){const L=(INV.list||[]).filter(i=>!i.revoked);
  return{coming:L.filter(i=>i.state==='coming').length,declined:L.filter(i=>i.state==='declined').length,pending:L.filter(i=>i.state==='pending').length,
    people:L.reduce((a,i)=>a+(i.coming_count||0),0),invited:L.length}}
// "2 hours ago", spelled out here because some browsers ship without Georgian relative-time data.
function invAgo(at){const s=Math.max(0,(Date.now()-new Date(at).getTime())/1000);
  return s<60?t('agoNow'):s<3600?tn('agoMin',Math.round(s/60)):s<86400?tn('agoHour',Math.round(s/3600)):tn('agoDay',Math.round(s/86400))}
function invStatus(i){if(i.revoked)return`<span class="pill">${t('invLinkOffShort')}</span>`;
  return i.state==='coming'?`<span class="pill invok">${esc(tn('invComingN',i.coming_count||0))}</span>`:i.state==='declined'?`<span class="pill invno">${t('invSt_declined')}</span>`:`<span class="pill">${t('invSt_pending')}</span>`}
function invRow(i){const names=invMembers(i),a=i.answer||{},last=(i.sent||[]).slice(-1)[0],ex=(a.extras||[]).map(x=>x.name);
  const send=(via,label)=>`<a class="btn sm" href="${esc(sendHref(i,via))}" target="_blank" rel="noopener noreferrer" data-send="${via}" data-id="${i.id}">${label}<span class="sr"> · ${esc(i.name)}</span></a>`;
  return`<li class="invrow${i.revoked?' off':''}" data-inv-row="${i.id}">
    <div class="invtop"><b class="invname">${esc(i.name||names.join(', ')||t('invNoName'))}</b>${invStatus(i)}</div>
    <p class="small muted invwho">${esc(names.join(', '))}${ex.length?` <span class="invplus">+ ${esc(ex.join(', '))}</span>`:''}${i.extra_allowed&&!ex.length?` <span>(${esc(tn('invPlusN',i.extra_allowed))})</span>`:''}</p>
    ${a.message?`<p class="small invmsg"><q>${esc(a.message)}</q></p>`:''}${a.allergies?`<p class="small"><b>${t('allergies')}:</b> ${esc(a.allergies)}</p>`:''}
    <p class="small muted">${last?esc(t('invSentVia',{via:t('via_'+last.via),date:invAgo(last.at)})):t('invNotSent')}</p>
    ${i.revoked?'':`<div class="row invsend">${send('wa','WhatsApp')}${send('viber','Viber')}${send('sms',t('invSms'))}${send('mail',t('invEmail'))}<button type="button" class="btn sm" data-inv="copy" data-id="${i.id}">${t('invCopy')}<span class="sr"> · ${esc(i.name)}</span></button></div>`}
    <button type="button" class="linkbtn" data-inv="edit" data-id="${i.id}">${t('invEditBtn')}<span class="sr"> · ${esc(i.name)}</span></button>
  </li>`}
function invForm(){const f=INV.form,q=skel(INV.picker),own=new Set(f.members);
  const other=new Map();(INV.list||[]).forEach(i=>{if(i.id!==f.id&&!i.revoked)(i.members||[]).forEach(m=>other.set(m,i.name))});
  const gs=Object.values(S.guests).filter(g=>g&&!g.anon&&g.name).sort((a,b)=>(own.has(b.id)-own.has(a.id))||a.name.localeCompare(b.name));
  const shown=gs.filter(g=>own.has(g.id)||!q||skel(g.name).includes(q)||skel(g.group).includes(q)).slice(0,80);
  const btn=(k,label,cls='')=>`<button type="button" class="btn sm ${cls}" data-inv="${k}">${label}</button>`;
  const conf=(k,text,yes,cls)=>INV.confirm===k?`<div class="confirm ${cls==='danger'?'danger':''}" role="group" aria-label="${esc(text)}"><span>${text}</span><div class="row">${btn(k+'-yes',yes,cls)}${btn('nope',t('keepIt'))}</div></div>`:'';
  return`<section class="invform" aria-labelledby="if-h"><h3 id="if-h">${f.id?t('invEdit'):t('invNew')}</h3>
    <label class="field"><span class="lbl">${t('invName')}</span><input id="if-name" class="inp" maxlength="120" value="${esc(f.name)}" placeholder="${esc(t('invNamePh'))}"></label>
    <fieldset class="field"><legend class="lbl">${t('invMembers')}</legend>
      <input id="if-q" type="search" class="inp" value="${esc(INV.picker)}" placeholder="${esc(t('findPh'))}" aria-label="${esc(t('invFindGuest'))}">
      <div class="invpick" id="if-pick">${shown.map(g=>`<label class="check"><input type="checkbox" data-invm="${g.id}"${own.has(g.id)?' checked':''}> <span>${esc(g.name)}${other.has(g.id)?` <small class="muted">· ${esc(t('invAlsoIn',{name:other.get(g.id)}))}</small>`:''}</span></label>`).join('')||`<p class="small muted">${t('invNoGuests')}</p>`}</div>
      <p class="small muted" id="if-n">${esc(tn('invNSelected',f.members.length))}</p></fieldset>
    <label class="field"><span class="lbl">${t('invExtra')}</span><select id="if-extra">${[0,1,2,3,4,5].map(n=>`<option value="${n}"${f.extra===n?' selected':''}>${n}</option>`).join('')}</select><span class="small muted">${t('invExtraHint')}</span></label>
    <div class="row2"><label class="field"><span class="lbl">${t('invPhone')}</span><input id="if-phone" class="inp" type="tel" inputmode="tel" autocomplete="off" maxlength="32" value="${esc(f.phone)}" placeholder="5XX XX XX XX"></label>
      <label class="field"><span class="lbl">${t('invEmailLbl')}</span><input id="if-email" class="inp" type="email" autocomplete="off" maxlength="254" value="${esc(f.email)}"></label></div>
    <label class="field"><span class="lbl">${t('invLang')}</span><select id="if-lang"><option value="ka"${f.lang==='ka'?' selected':''}>ქართული</option><option value="en"${f.lang==='en'?' selected':''}>English</option></select></label>
    <p class="small muted">${t('invContactsHint')}</p>
    <p class="err" id="if-err" role="alert">${esc(INV.formErr)}</p>
    <div class="row">${btn('save',t('invSave'),'primary')}${btn('cancel',t('cancel'))}</div>
    ${f.id?`<div class="row invmore">${btn('rotate',t('invNewLink'))}${btn(f.revoked?'unrevoke':'revoke',f.revoked?t('invLinkOn'):t('invLinkOff'))}${btn('del',t('invDelete'),'danger')}</div>
      ${conf('rotate',t('invRotateQ'),t('invRotateYes'),'primary')}${conf('revoke',t('invRevokeQ'),t('invRevokeYes'),'danger')}${conf('del',t('invDeleteQ'),t('invDeleteYes'),'danger')}`:''}
  </section>`}
function invPanel(){
  const L=INV.list,tt=invTotals(),e=S.event,r=rsvpOf(e);
  let h=dhead(t('tabInvites'),L?esc(tn('invPeopleComing',tt.people)):'');
  if(INV.err)h+=`<div class="confirm danger" role="alert"><span>${esc(INV.err)}</span><div class="row"><button type="button" class="btn sm" data-inv="reload">${t('invRetry')}</button></div></div>`;
  if(!L)return h+(INV.err?'':`<p class="muted" role="status">${t('invLoading')}</p>`);
  if(!e.date||!e.time)h+=`<p class="notice small">${t('invNeedTime')} <button type="button" class="linkbtn" data-panel="event">${t('invOpenEvent')}</button></p>`;
  if(!r.open)h+=`<p class="notice small">${t('invClosedNote')}</p>`;
  h+=`<div class="invstats">${[['coming',tt.coming],['declined',tt.declined],['pending',tt.pending]].map(([k,n])=>`<div class="invstat st-${k}"><b>${n}</b><span>${esc(t('invSt_'+k))}</span></div>`).join('')}</div>`;
  if(INV.form)return h+invForm();
  const plan=INV.plan;
  if(plan)h+=`<section class="confirm" aria-labelledby="ip-h"><h3 id="ip-h">${esc(tn('invPlanTitle',plan.length))}</h3>
      <ul class="small invplan">${plan.slice(0,40).map(p=>`<li><b>${esc(p.name)}</b> · ${esc(tn('nGuests',p.members.length))}</li>`).join('')}${plan.length>40?`<li>…</li>`:''}</ul>
      <p class="small muted">${t('invPlanHint',{n:INV_GROUP_MAX})}</p>
      <div class="row"><button type="button" class="btn sm primary" data-inv="groups-yes">${esc(tn('invPlanYes',plan.length))}</button><button type="button" class="btn sm" data-inv="nope">${t('keepIt')}</button></div></section>`;
  else{const n=invGroupPlan().length;
    h+=`<div class="row">${n?`<button type="button" class="btn primary" data-inv="groups">${esc(tn('invFromGroups',n))}</button>`:''}<button type="button" class="btn" data-inv="new">${t('invNewBtn')}</button></div>
      ${n?'':`<p class="small muted">${Object.keys(S.guests).length?t('invAllCovered'):t('invNoGuestsYet')}</p>`}`}
  if(L.length){const q=skel(INV.q),list=L.filter(i=>(INV.filter==='all'||(INV.filter==='off'?i.revoked:!i.revoked&&i.state===INV.filter))&&(!q||skel(i.name).includes(q)||invMembers(i).some(n=>skel(n).includes(q))));
    h+=`<input id="inv-q" type="search" class="inp" value="${esc(INV.q)}" placeholder="${esc(t('invSearchPh'))}" aria-label="${esc(t('invSearch'))}">
      ${radios(t('invFilter'),['all','pending','coming','declined'].map(k=>({attr:`data-invf="${k}"`,on:INV.filter===k,html:esc(t(k==='all'?'invAll':'invSt_'+k))})))}
      <ul class="invlist" aria-label="${esc(t('tabInvites'))}">${list.map(invRow).join('')||`<li class="small muted">${t('invNoneMatch')}</li>`}</ul>`}
  const name=id=>invById(id)?.name||'';
  h+=det('invlog',t('invRecent'),INV.log.length?`<ul class="invlog">${INV.log.map(l=>`<li><b>${esc(name(l.invite_id))}</b> → ${esc(l.state_after==='coming'?tn('invComingN',l.coming_after):t('invSt_'+l.state_after))}${l.by==='couple'?` <small class="muted">(${t('invByYou')})</small>`:''}<span class="muted small">${esc(invAgo(l.at))}</span></li>`).join('')}</ul>`:`<p class="small muted">${t('invNoChanges')}</p>`);
  const dl=invDeadline();
  h+=det('invset',t('invSettings'),`
    <label class="check"><input type="checkbox" id="rs-open"${r.open?' checked':''}> ${t('invOpenLbl')}</label>
    <fieldset class="field"><legend class="lbl">${t('invDeadline')}</legend>
      <label class="check"><input type="radio" name="rs-dl" value="auto"${r.deadline==='auto'?' checked':''}> ${t('invDlAuto')}</label>
      <label class="check"><input type="radio" name="rs-dl" value="custom"${r.deadline==='custom'?' checked':''}> ${t('invDlCustom')}</label>
      ${r.deadline==='custom'?`<input id="rs-at" class="inp" type="datetime-local" value="${esc(r.deadlineAt)}" aria-label="${esc(t('invDlCustom'))}">`:''}
      <label class="check"><input type="radio" name="rs-dl" value="none"${r.deadline==='none'?' checked':''}> ${t('invDlNone')}</label>
      <span class="small muted">${dl?esc(t('invDlWhen',{when:fmtWhen(dl)})):r.deadline==='none'?t('invDlNoneHint'):t('invDlNoStart')}</span></fieldset>
    <div class="field"><span class="lbl">${t('invMsgTitle')}</span><p class="small muted">${t('invMsgHint')}</p>
      ${['ka','en'].map(l=>`<label class="field"><span class="small">${l==='ka'?'ქართული':'English'}</span><textarea id="rs-msg-${l}" class="inp" rows="3" placeholder="${esc((L10N[l]||L10N.en).invMsgDefault)}">${esc(r.msg[l]||'')}</textarea></label>`).join('')}</div>
    <div class="field"><span class="lbl">${t('invPrivacy')}</span><p class="small muted">${t('invPrivacyHint')}</p>
      ${INV.confirm==='clear'?`<div class="confirm danger" role="group" aria-label="${esc(t('invClearQ'))}"><span>${t('invClearQ')}</span><div class="row"><button type="button" class="btn sm danger" data-inv="clear-yes">${t('invClearYes')}</button><button type="button" class="btn sm" data-inv="nope">${t('keepIt')}</button></div></div>`
        :`<div class="row"><button type="button" class="btn sm danger" data-inv="clear">${t('invClear')}</button></div>`}</div>`);
  return h}

/* ---------- clicks and typing ---------- */
function invOpenForm(i){INV.formErr='';INV.confirm=null;INV.picker='';
  INV.form=i?{id:i.id,name:i.name||'',members:[...(i.members||[])],extra:i.extra_allowed||0,phone:i.phone||'',email:i.email||'',lang:i.lang||'ka',revoked:!!i.revoked}
    :{id:null,name:'',members:[],extra:0,phone:'',email:'',lang:S.event.lang==='en'?'en':'ka',revoked:false}}
async function invSaveForm(){const f=INV.form;
  const fail=(k,sel)=>{INV.formErr=t(k);invRender(sel)};
  if(!f.members.length)return fail('invNeedMember','#if-q');
  if(f.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email))return fail('invBadEmail','#if-email');
  if(f.phone&&phoneDigits(f.phone).length<8)return fail('invBadPhone','#if-phone');
  const row={name:(f.name.trim()||f.members.map(id=>S.guests[id]?.name).filter(Boolean).join(', ')).slice(0,120),members:f.members,extra_allowed:f.extra,
    phone:f.phone.trim()||null,email:f.email.trim()||null,lang:f.lang};
  const q=f.id?SB.from('invites').update(row).eq('id',f.id):SB.from('invites').insert({event_id:ROW.id,...row});
  const{data,error}=await q.select().single();
  if(error){logSafe('invsave',error);return fail('invSaveErr','[data-inv="save"]')}
  invPut(data);INV.form=null;toast(t('invSaved'));invRender(`[data-inv-row="${data.id}"] [data-inv="edit"]`)}
async function invAct(k,id){const f=INV.form;
  switch(k){
    case'reload':INV.list=null;INV.err='';invLoad();invRender();return;
    case'new':invOpenForm(null);invRender('#if-name');return;
    case'edit':invOpenForm(invById(id));invRender('#if-name');return;
    case'cancel':{const back=f?.id;INV.form=null;invRender(back?`[data-inv-row="${back}"] [data-inv="edit"]`:'[data-inv="new"]');return}
    case'save':return invSaveForm();
    case'nope':{const back=INV.plan?'[data-inv="groups"]':INV.confirm?`[data-inv="${INV.confirm}"]`:null;INV.confirm=null;INV.plan=null;invRender(back);return}
    case'groups':INV.plan=invGroupPlan();invRender('[data-inv="groups-yes"]');return;
    case'groups-yes':{const p=INV.plan;INV.plan=null;if(p&&await invCreate(p))toast(tn('invCreated',p.length));invRender('[data-inv="new"]');return}
    case'copy':{const i=invById(id);if(!i)return;const m=invMessage(i);
      (navigator.clipboard?navigator.clipboard.writeText(m):Promise.reject()).then(()=>{toast(t('invCopied'));invMarkSent(id,'copy')},()=>toast(t('copyFail',{url:invLink(i)})));return}
    case'rotate':case'revoke':case'del':case'clear':INV.confirm=k;invRender(`[data-inv="${k}-yes"]`);return;
    case'rotate-yes':{INV.confirm=null;const{data,error}=await SB.rpc('rotate_invite_link',{p_invite:f.id});
      if(error){logSafe('invrotate',error);toast(t('invSaveErr'));return}const i=invById(f.id);if(i){i.token=data;i.sent=[]}toast(t('invRotated'));invRender('[data-inv="rotate"]');return}
    case'revoke-yes':case'unrevoke':{INV.confirm=null;const off=k==='revoke-yes',{data,error}=await SB.from('invites').update({revoked:off}).eq('id',f.id).select().single();
      if(error){logSafe('invrevoke',error);toast(t('invSaveErr'));return}invPut(data);f.revoked=off;toast(t(off?'invLinkOffDone':'invLinkOnDone'));invRender(`[data-inv="${off?'unrevoke':'revoke'}"]`);return}
    case'del-yes':{INV.confirm=null;const{error}=await SB.from('invites').delete().eq('id',f.id);
      if(error){logSafe('invdel',error);toast(t('invSaveErr'));return}INV.list=INV.list.filter(i=>i.id!==f.id);INV.form=null;toast(t('invDeleted'));invRender('[data-inv="new"]');return}
    case'clear-yes':{INV.confirm=null;const{error}=await SB.rpc('clear_rsvp_contacts',{p_event:ROW.id});
      if(error){logSafe('invclear',error);toast(t('invSaveErr'));return}(INV.list||[]).forEach(i=>{i.phone=null;i.email=null});toast(t('invCleared'));invRender('[data-inv="clear"]');return}
  }}
/* Returns true when the event was the Invitations tab's, so the planner's own handlers skip it. */
function invClick(b){const d=b.dataset;
  if(d.inv){invAct(d.inv,d.id);return true}
  if(d.invf){INV.filter=d.invf;invRender(`[data-invf="${d.invf}"]`);return true}
  return false}
function invInput(e){const el=e.target,id=el.id||'',f=INV.form;
  if(id==='inv-q'){INV.q=el.value;const keep=el.selectionStart;invRender('#inv-q');const n=$('#inv-q');if(n&&keep!=null)n.setSelectionRange(keep,keep);return true}
  if(f){
    if(id==='if-q'){INV.picker=el.value;const keep=el.selectionStart;invRender('#if-q');const n=$('#if-q');if(n&&keep!=null)n.setSelectionRange(keep,keep);return true}
    if(el.dataset?.invm){const g=el.dataset.invm;if(el.checked){if(!f.members.includes(g))f.members.push(g)}else f.members=f.members.filter(x=>x!==g);
      const n=$('#if-n');if(n)n.textContent=tn('invNSelected',f.members.length);if(INV.formErr){INV.formErr='';const p=$('#if-err');if(p)p.textContent=''}return true}
    const map={'if-name':'name','if-phone':'phone','if-email':'email','if-lang':'lang'};
    if(map[id]){f[map[id]]=el.value;return true}
    if(id==='if-extra'){f.extra=+el.value;return true}}
  return false}
/* RSVP settings live in the plan (S.event.rsvp) so they save, sync and undo like everything else. */
function invSettingChange(e){const el=e.target,id=el.id||'';
  const set=fn=>commit(()=>{S.event.rsvp=rsvpOf(S.event);fn(S.event.rsvp)});
  if(id==='rs-open'){set(r=>r.open=el.checked);return true}
  if(el.name==='rs-dl'){set(r=>r.deadline=el.value);invRender(el.value==='custom'?'#rs-at':`input[name="rs-dl"][value="${el.value}"]`);return true}
  if(id==='rs-at'){set(r=>r.deadlineAt=el.value);return true}
  if(id==='rs-msg-ka'||id==='rs-msg-en'){const l=id.slice(-2);set(r=>{r.msg=Object.assign({},r.msg,{[l]:el.value})});return true}
  return false}
document.addEventListener('click',e=>{if(guestMode)return;const a=e.target.closest('a[data-send]');if(a)invMarkSent(a.dataset.id,a.dataset.send)});
