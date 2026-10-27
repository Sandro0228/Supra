// Test double for supabase-js used by the browser tests. Behaviour is driven by localStorage:
//   mockcfg  = {sessionDelay, session:'valid'|'none'|'expired'|'reject'|'hang', signinDelay, signin:'ok'|'bad'|'net'}
//   mocksess = '1' when a stored session exists;  mockdb = {events:[...]}
(()=>{
const cfg=()=>JSON.parse(localStorage.getItem('mockcfg')||'{}');
const db=()=>JSON.parse(localStorage.getItem('mockdb')||'{"events":[]}');const put=d=>localStorage.setItem('mockdb',JSON.stringify(d));
const sleep=ms=>new Promise(r=>setTimeout(r,ms||0));
const user={id:'u1',email:'sandro@example.com'};
const mkSession=(expired)=>({user,access_token:'t',expires_at:Math.floor(Date.now()/1000)+(expired?-3600:3600)});
const listeners=new Set();
const emit=(ev,s)=>listeners.forEach(fn=>fn(ev,s));
window.__mockEmit=(ev,valid)=>emit(ev,valid?mkSession(false):null);
window.__mockCalls=[];
function storedSession(){const c=cfg();if(!localStorage.getItem('mocksess'))return null;return c.session==='expired'?mkSession(true):mkSession(false)}
function get(o,path){if(path.includes('->')){const[a,b]=path.split('->');return (o[a]||{})[b]}return o[path]}
function q(table){let op='select',payload=null,filters=[],cols='*',single=false,maybe=false;
  const api={select(c){cols=c||'*';return api},insert(p){op='insert';payload=p;return api},update(p){op='update';payload=p;return api},delete(){op='delete';return api},
  eq(k,v){filters.push([k,v]);return api},order(){return api},limit(){return api},single(){single=true;return api},maybeSingle(){maybe=true;return api},
  then(res,rej){return sleep(cfg().dbDelay||0).then(run).then(res,rej)}};
  function run(){const d=db();const rs=d[table]||[];const m=r=>filters.every(([k,v])=>r[k]===v);
    if(!localStorage.getItem('mocksess'))return{data:op==='select'?[]:null,error:op==='select'?null:{message:'not signed in'}};
    // mirrors migration 006: the server picks the token and new events start as private drafts (Balanced)
    if(op==='insert'){const r=Object.assign({id:Math.random().toString(36).slice(2),owner:'u1',data:{},public_data:{},updated_at:new Date().toISOString()},payload,
        {slug:newToken(),share_status:'draft',guest_page:false,share_expires_at:null,lookup_mode:'exact',lookup_pin_hash:null,show_tablemates:false,show_layout:false});
      rs.push(r);d[table]=rs;put(d);return{data:r,error:null}}
    if(op==='update'){let out=null;const p=JSON.parse(JSON.stringify(payload));['slug','lookup_pin_hash','share_status','share_expires_at','guest_page'].forEach(k=>delete p[k]);
      rs.forEach(r=>{if(m(r)){Object.assign(r,p,{updated_at:new Date().toISOString()});out=r}});put(d);window.__mockCalls.push(['update',payload]);return{data:out,error:null}}
    if(op==='delete'){d[table]=rs.filter(r=>!m(r));put(d);return{error:null}}
    let out=rs.filter(m);if(cols!=='*'){out=out.map(r=>{const o={};cols.split(',').forEach(c=>{const[al,src]=c.includes(':')?c.split(':'):[c,c];o[al]=get(r,src)})
      ;return o})}
    if(single||maybe)return{data:out[0]||null,error:null};return{data:out,error:null}}
  return api}
// Mirrors supabase/002_guest_lookup.sql closely enough for UI tests (privacy itself is tested in SQL).
const newToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(22)),b=>'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'[b&63]).join('').slice(0,22);
const statusOf=ev=>{const st=ev.share_status||(ev.guest_page===false?'draft':'published');return st==='published'&&ev.share_expires_at&&new Date(ev.share_expires_at)<=new Date()?'expired':st};
const live=ev=>statusOf(ev)==='published';
const layoutOn=ev=>ev.show_layout===undefined?true:!!ev.show_layout;
const shareState=ev=>({status:statusOf(ev),slug:ev.slug,expires:ev.share_expires_at||null,mode:ev.lookup_mode||'exact',pin:!!ev.lookup_pin_hash,mates:!!ev.show_tablemates,layout:layoutOn(ev)});
const norm=s=>String(s||'').normalize('NFC').toLowerCase().replace(/\s+/g,' ').trim();
function publicPlan(ev){const p=publicPlanAll(ev);if(!layoutOn(ev)){delete p.tables;delete p.venue}p.lookup.layout=layoutOn(ev);return p}
function publicPlanAll(ev){const d=ev.data||{};return{event:{name:d.event?.name,date:d.event?.date,palette:d.event?.palette,lang:d.event?.lang,type:d.event?.type},
  tables:(d.tables||[]).map(t=>({people:d.event?.seatMode==='table'?(t.seats||[]).map(s=>typeof s==='string'&&d.guests[s]).filter(Boolean).sort((a,b)=>a.name<b.name?-1:1).map(g=>({look:g.look,kid:!!g.kid})):null,name:t.name,shape:t.shape,deco:t.deco,x:t.x,y:t.y,rot:t.rot,seats:(t.seats||[]).map(s=>{const g=typeof s==='string'&&d.guests[s];if(!g)return false;if(d.event?.seatMode==='table')return true;const L=g.look||{},k=['kind','skin','hair','hairColor','beard','beardColor','eye','outfit','outfitColor','glasses'];return{look:Object.fromEntries(k.filter(x=>x in L).map(x=>[x,L[x]])),kid:!!g.kid}})})),
  venue:(d.venue||[]).map(v=>({type:v.type,label:v.label,x:v.x,y:v.y,w:v.w,h:v.h,rot:v.rot})),lookup:{mode:ev.lookup_mode||'prefix',pin:!!ev.lookup_pin_hash,seatMode:d.event?.seatMode==='table'?'table':'seat'}}}
function findSeat(ev,query,pin){const qn=norm(query);if(qn.replace(/ /g,'').length<3)return{status:'short',matches:[]};
  window.__mockCalls.push(['find_seat',query]);
  if(ev.lookup_pin_hash&&String(pin||'').trim()!==ev.lookup_pin_hash)return{status:'pin',matches:[]};
  const d=ev.data,rows=[];(d.tables||[]).forEach((t,ti)=>(t.seats||[]).forEach((s,si)=>{const g=typeof s==='string'&&d.guests[s];if(g)rows.push({g,ti,si,t,nn:norm(g.name)})}));
  const sw=qn.replace(/^(\S+) (.+)$/,'$2 $1');
  const hit=r=>ev.lookup_mode==='exact'?(r.nn===qn||r.nn===sw):(r.nn.startsWith(qn)||(' '+r.nn).includes(' '+qn));
  const ms=rows.filter(hit);if(!ms.length)return{status:'none',matches:[]};if(ms.length>5)return{status:'many',matches:[]};
  return{status:'ok',matches:ms.map(r=>({name:r.g.name,look:r.g.look,kid:!!r.g.kid,table:r.ti,tableName:r.t.name,seat:d.event?.seatMode==='table'?null:r.si+1,
    mates:ev.show_tablemates?rows.filter(o=>o.ti===r.ti&&o.si!==r.si).map(o=>o.g.name):null}))}}
window.supabase={createClient(){return{from:q,
  async rpc(fn,args){await sleep(cfg().rpcDelay||0);const evs=db().events;
    if(fn==='public_plan'){const ev=evs.find(e=>e.slug===args.p_slug&&live(e));return{data:ev?publicPlan(ev):null,error:null}}
    if(fn==='find_seat'){if(norm(args.p_query).replace(/ /g,'').length<3)return{data:{status:'short',matches:[]},error:null};
      const ev=evs.find(e=>e.slug===args.p_slug&&live(e));if(!ev)return{data:{status:'unavailable',matches:[]},error:null};
      if(cfg().rateLimited)return{data:{status:'rate_limited',matches:[],retry_after:cfg().rateLimited},error:null};
      return{data:findSeat(ev,args.p_query,args.p_pin),error:null}}
    // owner functions (authorization itself is tested in SQL)
    const d=db(),ev=d.events.find(e=>e.id===args.p_event),ok=()=>{put(d);window.__mockCalls.push([fn,args]);return{data:shareState(ev),error:null}};
    if(['publish_guest_page','unpublish_guest_page','revoke_guest_link','rotate_guest_link','apply_privacy_preset','set_guest_privacy','preview_public_plan','preview_find_seat','supra_share_state'].includes(fn)&&!ev)return{data:null,error:{message:'not found',code:'42501'}};
    if(fn==='publish_guest_page'){if(statusOf(ev)==='revoked')return{data:null,error:{message:'revoked: make a new link first'}};Object.assign(ev,{share_status:'published',guest_page:true,share_expires_at:args.p_expires||null});return ok()}
    if(fn==='unpublish_guest_page'){if(ev.share_status!=='revoked')Object.assign(ev,{share_status:'draft',guest_page:false});return ok()}
    if(fn==='revoke_guest_link'){Object.assign(ev,{share_status:'revoked',guest_page:false,share_expires_at:null});return ok()}
    if(fn==='rotate_guest_link'){ev.slug=newToken();if(ev.share_status==='revoked')Object.assign(ev,{share_status:'draft',guest_page:false});return ok()}
    if(fn==='apply_privacy_preset'){const k=args.p_preset;
      if(k==='strict'){if(!ev.lookup_pin_hash&&!(args.p_pin&&args.p_pin.trim().length>=4))return{data:null,error:{message:'strict needs an invitation code'}};Object.assign(ev,{lookup_mode:'exact',show_tablemates:false,show_layout:false});if(args.p_pin)ev.lookup_pin_hash=args.p_pin.trim()}
      else if(k==='balanced')Object.assign(ev,{lookup_mode:'exact',show_tablemates:false,show_layout:false});
      else if(k==='open')Object.assign(ev,{lookup_mode:'prefix',show_tablemates:true,show_layout:true});return ok()}
    if(fn==='set_guest_privacy'){Object.assign(ev,{lookup_mode:args.p_mode,show_tablemates:args.p_mates??ev.show_tablemates,show_layout:args.p_layout??ev.show_layout});return ok()}
    if(fn==='supra_share_state')return{data:shareState(ev),error:null};
    if(fn==='preview_public_plan')return{data:publicPlan(ev),error:null};
    if(fn==='preview_find_seat'){if(norm(args.p_query).replace(/ /g,'').length<3)return{data:{status:'short',matches:[]},error:null};const r=findSeat(Object.assign({},ev,{lookup_pin_hash:null}),args.p_query);return{data:r,error:null}}
    if(fn==='set_guest_lookup'){const d=db();const ev=d.events.find(e=>e.id===args.p_event);Object.assign(ev,{lookup_mode:args.p_mode,show_tablemates:args.p_mates??ev.show_tablemates});
      if(args.p_pin!==null&&args.p_pin!==undefined)ev.lookup_pin_hash=args.p_pin===''?null:args.p_pin.trim();put(d);return{data:{mode:ev.lookup_mode,pin:!!ev.lookup_pin_hash,mates:ev.show_tablemates},error:null}}
    return{data:null,error:{message:'unknown rpc'}}},
  auth:{
    async getSession(){const c=cfg();if(c.session==='hang')return new Promise(()=>{});await sleep(c.sessionDelay||0);
      if(c.session==='reject')throw new Error('network down');
      const s=storedSession();if(s&&c.session==='expired')return{data:{session:null},error:{message:'Refresh token expired'}};return{data:{session:s},error:null}},
    onAuthStateChange(fn){listeners.add(fn);const c=cfg();
      setTimeout(()=>{if(c.session==='hang'||c.session==='reject')return;const s=storedSession();fn('INITIAL_SESSION',s&&c.session!=='expired'?s:null)},(c.sessionDelay||0)+(c.initialEventDelay||0));
      return{data:{subscription:{unsubscribe(){listeners.delete(fn)}}}}},
    async signInWithPassword({email,password}){const c=cfg();await sleep(c.signinDelay||0);
      if(c.signin==='net')throw new Error('Failed to fetch');
      if(c.signin==='bad'||password!=='secret1')return{data:{session:null},error:{message:'Invalid login credentials'}};
      localStorage.setItem('mocksess','1');const s=mkSession(false);setTimeout(()=>emit('SIGNED_IN',s),0);return{data:{session:s},error:null}},
    async signUp(){return{data:{session:null},error:null}},
    async resetPasswordForEmail(){return{error:{message:'email rate limit exceeded'}}},
    async updateUser(){return{error:null}},
    async signInWithOtp(){return{error:null}},
    async signOut(){localStorage.removeItem('mocksess');emit('SIGNED_OUT',null);return{}}
  }}}};
})();
