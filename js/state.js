'use strict';
/* The plan in memory (S), selection, undo history and drafts. Part of the planner (app.html); see js/README.md. */
/* ---------------- state ---------------- */
let DRAFT='supra.draft';
const CFG=window.SUPRA_CONFIG||{};let SB=null,ROW=null,MODE='edit',SLUG='',saveT=0,PREVIEW=null,PREVIEW_ID=null;
let S=null,PUB=null,hist=[],sel={kind:null},scale=null,fitMode=null,waitSel=null,confirmK=null,dirty=false,saveState='idle',ART=undefined,DL=undefined,readOnly=false,guestMode=false;
function mkGuest(name,look,extra){const id=uid();S.guests[id]=Object.assign({id,name,group:'',side:'',kid:false,meal:'',allergies:'',look:look||randLook(guessKind(name))},extra||{});return id}
function sample(){
  S={event:{name:'Sandro & Tamta',type:'wedding',date:'2026-10-31',palette:'blush',lang:'en',shareLink:''},guests:{},waiting:[],rules:[],venue:[],tables:[]};
  const mk=(n,o,ex)=>mkGuest(n,Object.assign(randLook(guessKind(n),rng(n)),o||{}),ex);
  const head=[mk('გივი გურესაშვილი',{hair:'curly',beard:'full',outfit:'suit',outfitColor:'#3D7EA6',glasses:'none'},{side:'groom'}),
    mk('სანდრო მაისურაძე',{hair:'sidepart',hairColor:'#1E1916',beard:'short',beardColor:'#1E1916',outfit:'tuxedo',glasses:'none'},{side:'groom'}),
    mk('თამთა თუნგია',{hair:'bun',hairColor:'#9C6430',outfit:'gown',glasses:'none'},{side:'bride'}),
    mk('მარიამ ბერძული',{hair:'curly',hairColor:'#1E1916',outfit:'dress',outfitColor:'#E2A9BA',glasses:'none'},{side:'bride'})];
  const t1='ნოე ჯანელიძე|მარიამ სურმანიძე|ლევან გასვიანი|ქეთი ხაჭაპურიძე|მარიამ გასვიანი|რამაზ აფხაძე|მექი უგულავა|გიორგი ჭეიშვილი|შალვა ამურველაშვილი|ჯემალ თუთბერიძე|თიკო თევზაძე|გიორგი ქაშიბაძე|ეკა სულაშვილი|ხატია მათურელი|დავით ჯიქურაშვილი|მარიამ ლოლუა'.split('|').map(n=>mk(n));
  const t2='ირაკლი შალამბერიძე|შალვა ომანაძე|თიკო ომანაძე|დიმიტრი ილურიძე|ნანა კენჭიაშვილი|ალექს კაპატაძე|საბა ლურსმანაშვილი|გოგა ძაძუა|ირაკლი ჟორჟოლიანი|სალომე გაბელია'.split('|').map(n=>mk(n));
  S.tables=[{id:uid(),name:'Head table',shape:'head',deco:'flowers',seats:head},{id:uid(),name:'Table 1',shape:'rect',deco:'mixed',seats:t1},{id:uid(),name:'Table 2',shape:'rect',deco:'greenery',seats:t2}];
  autoArrange();
  const ht=S.tables[0];S.venue.push({id:uid(),type:'dance',label:'',x:ht.x,y:ht.y+250,w:300,h:180});
  S.tables.slice(1).forEach(x=>x.y+=260);
  S.venue.push({id:uid(),type:'cake',label:'',x:ht.x+390,y:ht.y,w:110,h:110});
  return S;
}
function normalize(o){o.waiting=o.waiting||[];o.rules=o.rules||[];o.venue=o.venue||[];o.event=Object.assign({lang:'en',shareLink:'',palette:'blush',type:'wedding'},o.event||{});
  Object.values(o.guests||{}).forEach(g=>{g.side=g.side||'';g.meal=g.meal||'';g.allergies=g.allergies||'';g.kid=!!g.kid;g.group=g.group||''});return o}
function saveDraft(){try{localStorage.setItem(DRAFT,JSON.stringify({base:ROW?.updated_at||null,data:S}))}catch(e){}}
function clearDraft(){try{localStorage.removeItem(DRAFT)}catch(e){}}
function markDirty(){if(MODE!=='edit')return;dirty=true;if(saveState!=='saving')saveState='idle';saveDraft();renderTop();clearTimeout(saveT);saveT=setTimeout(savePlan,1500)}
function commit(fn){hist.push(JSON.stringify(S));if(hist.length>80)hist.shift();fn();resolveOverlaps();markDirty();renderAll()}
function undo(){if(!hist.length)return;S=JSON.parse(hist.pop());markDirty();sel={kind:null};renderAll();toast(t('undone'))}
function toast(m){const d=document.createElement('div');d.className='toast';d.setAttribute('role','status');d.textContent=m;(document.fullscreenElement||document.body).appendChild(d);setTimeout(()=>d.remove(),2200)}
const P=()=>PALETTES[S.event.palette]||PALETTES.blush;
const T=id=>S.tables.find(x=>x.id===id);
const V=id=>S.venue.find(x=>x.id===id);
function where(gid){for(const x of S.tables){const i=x.seats.indexOf(gid);if(i>=0)return{t:x,i}}return null}
const headName=()=>t(S.event.type==='wedding'||!S.event.type?'headTable':'headTableMain');
const tName=x=>x.shape==='head'&&x.name==='Head table'?headName():x.name.replace(/^Table (\d+)$/,(m,n)=>t('table')+' '+n);

