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
    if(op==='insert'){const r=Object.assign({id:Math.random().toString(36).slice(2),owner:'u1',data:{},public_data:{},guest_page:true,lookup_mode:'prefix',lookup_pin_hash:null,show_tablemates:false,updated_at:new Date().toISOString()},payload);
      rs.push(r);d[table]=rs;put(d);return{data:r,error:null}}
    if(op==='update'){let out=null;rs.forEach(r=>{if(m(r)){Object.assign(r,JSON.parse(JSON.stringify(payload)),{updated_at:new Date().toISOString()});out=r}});put(d);window.__mockCalls.push(['update',payload]);return{data:out,error:null}}
    if(op==='delete'){d[table]=rs.filter(r=>!m(r));put(d);return{error:null}}
    let out=rs.filter(m);if(cols!=='*'){out=out.map(r=>{const o={};cols.split(',').forEach(c=>{const[al,src]=c.includes(':')?c.split(':'):[c,c];o[al]=get(r,src)})
      ;return o})}
    if(single||maybe)return{data:out[0]||null,error:null};return{data:out,error:null}}
  return api}
// Mirrors supabase/002_guest_lookup.sql closely enough for UI tests (privacy itself is tested in SQL).
const norm=s=>String(s||'').normalize('NFC').toLowerCase().replace(/\s+/g,' ').trim();
function publicPlan(ev){const d=ev.data||{};return{event:{name:d.event?.name,date:d.event?.date,palette:d.event?.palette,lang:d.event?.lang,type:d.event?.type},
  tables:(d.tables||[]).map(t=>({name:t.name,shape:t.shape,deco:t.deco,x:t.x,y:t.y,rot:t.rot,seats:(t.seats||[]).map(s=>{const g=typeof s==='string'&&d.guests[s];if(!g)return false;const L=g.look||{},k=['kind','skin','hair','hairColor','beard','beardColor','eye','outfit','outfitColor','glasses'];return{look:Object.fromEntries(k.filter(x=>x in L).map(x=>[x,L[x]])),kid:!!g.kid}})})),
  venue:(d.venue||[]).map(v=>({type:v.type,label:v.label,x:v.x,y:v.y,w:v.w,h:v.h,rot:v.rot})),lookup:{mode:ev.lookup_mode||'prefix',pin:!!ev.lookup_pin_hash}}}
function findSeat(ev,query,pin){const qn=norm(query);if(qn.replace(/ /g,'').length<3)return{status:'short',matches:[]};
  window.__mockCalls.push(['find_seat',query]);
  if(ev.lookup_pin_hash&&String(pin||'').trim()!==ev.lookup_pin_hash)return{status:'pin',matches:[]};
  const d=ev.data,rows=[];(d.tables||[]).forEach((t,ti)=>(t.seats||[]).forEach((s,si)=>{const g=typeof s==='string'&&d.guests[s];if(g)rows.push({g,ti,si,t,nn:norm(g.name)})}));
  const sw=qn.replace(/^(\S+) (.+)$/,'$2 $1');
  const hit=r=>ev.lookup_mode==='exact'?(r.nn===qn||r.nn===sw):(r.nn.startsWith(qn)||(' '+r.nn).includes(' '+qn));
  const ms=rows.filter(hit);if(ms.length>5)return{status:'many',matches:[]};
  return{status:'ok',matches:ms.map(r=>({name:r.g.name,look:r.g.look,kid:!!r.g.kid,table:r.ti,tableName:r.t.name,seat:r.si+1,
    mates:ev.show_tablemates?rows.filter(o=>o.ti===r.ti&&o.si!==r.si).map(o=>o.g.name):null}))}}
window.supabase={createClient(){return{from:q,
  async rpc(fn,args){await sleep(cfg().rpcDelay||0);const evs=db().events;
    if(fn==='public_plan'){const ev=evs.find(e=>e.slug===args.p_slug&&e.guest_page);return{data:ev?publicPlan(ev):null,error:null}}
    if(fn==='find_seat'){const ev=evs.find(e=>e.slug===args.p_slug&&e.guest_page);return{data:ev?findSeat(ev,args.p_query,args.p_pin):{status:'not_found',matches:[]},error:null}}
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
