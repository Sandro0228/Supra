(()=>{
'use strict';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const uid=()=>Math.random().toString(36).slice(2,9);
const IMG=window.SUPRA_IMG||{};
const L10N=window.SUPRA_I18N;
/* Interface language: the visitor's own choice (shared by dashboard, planner and guest page), else the event's, else the browser's. */
const storedLang=()=>{try{const l=localStorage.getItem('supra.lang');return l==='ka'||l==='en'?l:null}catch(e){return null}};
let LANG=storedLang();
const UL=()=>LANG||S?.event?.lang||((navigator.language||'').startsWith('ka')?'ka':'en');
function setLang(l){LANG=l;try{localStorage.setItem('supra.lang',l)}catch(e){}}
function t(k,v){let s=(L10N[UL()]||L10N.en)[k]??L10N.en[k]??k;if(v)for(const x in v)s=s.split('{'+x+'}').join(v[x]);return s}
/* Counted phrases: uses key_one etc. when the language has that form ("1 guest"); Georgian keeps the noun singular. */
function tn(k,n,v){const f=new Intl.PluralRules(UL()==='ka'?'ka':'en').select(n),L=L10N[UL()]||L10N.en;return t(L[k+'_'+f]!==undefined?k+'_'+f:k,Object.assign({count:n},v))}
function rng(seed){let h=1779033703^seed.length;for(let i=0;i<seed.length;i++){h=Math.imul(h^seed.charCodeAt(i),3432918353);h=h<<13|h>>>19}
  return()=>{h=Math.imul(h^h>>>16,2246822507);h=Math.imul(h^h>>>13,3266489909);return((h^=h>>>16)>>>0)/4294967296}}
const pick=(a,r=Math.random)=>a[Math.floor(r()*a.length)];
function shade(hex,p){let n=parseInt(hex.slice(1),16),r=n>>16,g=n>>8&255,b=n&255;const f=v=>Math.max(0,Math.min(255,Math.round(v+(p<0?v:255-v)*p/100)));
  return'#'+[f(r),f(g),f(b)].map(v=>v.toString(16).padStart(2,'0')).join('')}

/* ---------------- options ---------------- */
const OPT={
  skin:window.SUPRA_SKINS||['#FDCB9F','#FDC693','#F8A362','#EE975E','#C56F40','#AD5B31'],
  hairColor:['#1E1916','#3A2618','#6A4226','#9C6430','#D2AE6B','#B4472C','#9B9792','#ECE6DA'],
  eye:['#3A281E','#5E3B22','#2F5E8C','#4A7A4C','#788A98'],
  outfitColor:['#1E2A3D','#2A2A2C','#4A5568','#6B4E3D','#6F8F72','#B4506F','#E2A9BA','#8E7CC3','#3D7EA6','#E3C066','#F4F0E6','#9C3F3A'],
  hair:['short','sidepart','buzz','curly','bald','long','straight','bob','bun','ponytail'],
  beard:['none','stubble','mustache','goatee','short','full'],
  outfit:['suit','tuxedo','shirt','sweater','dress','gown'],
  glasses:['none','round','square','sun']
};
const BEARD_LBL={none:'beardNone',stubble:'stubble',mustache:'mustache',goatee:'goatee',short:'shortB',full:'full'};
const GL_LBL={none:'glassesNone',round:'roundG',square:'squareG',sun:'sun'};
const SHAPES=['rect','round','square','head'];
const DECOS=['flowers','candles','greenery','mixed','none'];
const DECO_LBL={none:'plain'};
const MEALS=['','meat','fish','veg','vegan','kids'];
const MEAL_LBL={'':'noMeal',kids:'kidsMenu'};
const SIDES=['bride','groom','both',''];
const SIDE_COL={bride:'#C4567E',groom:'#3E6E8E',both:'#9A7B3C'};
const VENUE={dance:{w:300,h:200},stage:{w:340,h:150},bar:{w:260,h:90},entrance:{w:150,h:40},cake:{w:110,h:110},dj:{w:140,h:90},photo:{w:160,h:120}};
const PALETTES={
  blush:{name:'Blush & ivory',floor:'#F7F2EC',cloth:'#FFFDF9',edge:'#E3D7C8',runner:'#EEDFD0',ink:'#3B3330',accent:'#C46A88',chair:'#DCC6AB',leaf:'#8DAE89',fl:['#F2B6C5','#FFFFFF','#E28AA5','#F7D9C4']},
  sage:{name:'Sage garden',floor:'#F0F2EA',cloth:'#FDFDF8',edge:'#D2D9C5',runner:'#CBD8BE',ink:'#2E3A2E',accent:'#5E7E5A',chair:'#D2BE9C',leaf:'#6F9A6A',fl:['#FFFFFF','#F3E6C2','#E9C1AE','#F7F1E3']},
  navy:{name:'Navy & gold',floor:'#EDF0F4',cloth:'#FFFFFF',edge:'#C8CFDB',runner:'#24345A',ink:'#1F2D4A',accent:'#B8954F',chair:'#CDAE6E',leaf:'#7F9C8A',fl:['#FFFFFF','#EADBB6','#BBC8E2','#F5EFE1']},
  wine:{name:'Autumn wine',floor:'#F6EFEC',cloth:'#FFFCFA',edge:'#E1CFCA',runner:'#7B2F3D',ink:'#3E2428',accent:'#7B2F3D',chair:'#D7BE9F',leaf:'#7F8F5A',fl:['#B23A52','#F2C1C8','#FFFFFF','#E8A15C']}
};
const EVENT_TYPES=[['wedding',true],['birthday',false],['corporate',false],['baby',false],['anniv',false]];
const FEM=new Set('მარიამ ქეთი ქეთევან თიკო თინათინ ნანა მექი ეკა ეკატერინე ხატია სალომე თამთა ნინო ანა ანი ლიკა ნათია მაკა თამარ ნატო სოფო სოფიო ლელა ლია მზია ნესტან ელენე ბარბარე მაია ირმა ია ნუცა მარი ხათუნა ქრისტინე ლალი ნია თეონა გვანცა'.split(' '));

function randLook(kind,r=Math.random){
  kind=kind||(r()<.5?'m':'f');const m=kind==='m';const hairColor=pick(OPT.hairColor.slice(0,7),r);
  return{kind,skin:pick(OPT.skin,r),hair:pick(m?['short','short','sidepart','buzz','curly','bald']:['long','straight','bob','bun','ponytail','curly'],r),
    hairColor,beard:m?pick(['none','none','none','stubble','mustache','goatee','short','full'],r):'none',beardColor:hairColor,
    eye:pick(OPT.eye,r),outfit:pick(m?['suit','suit','shirt','sweater','tuxedo']:['dress','dress','dress','shirt','sweater'],r),
    outfitColor:pick(OPT.outfitColor,r),glasses:r()<.16?pick(['round','square','sun'],r):'none'};
}
const guessKind=n=>FEM.has(String(n).trim().split(/\s+/)[0])?'f':'m';

/* ---------------- character drawing ---------------- */
// Characters are stacked illustration layers placed in the base artwork's own pixel space (1254 px canvas, head centre ~627,505).
// PERSON_T maps that space onto a seat: origin = seat centre, the figure faces +y toward its table.
const FIT=window.SUPRA_FIT||{},NAT=window.SUPRA_NAT||{};
const PK=0.047,PERSON_T=`translate(0 22) scale(${PK}) translate(-627 -1215)`;
const BROWN_EYES=new Set(['#3A281E','#5E3B22']);
let TINTS=new Set();
function tintFilter(id){const n=parseInt(id.slice(2),16),k=1/0.74,c=[(n>>16)/255*k,(n>>8&255)/255*k,(n&255)/255*k];
  return`<filter id="${id}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="${c.map(v=>`${(v*.3).toFixed(3)} ${(v*.59).toFixed(3)} ${(v*.11).toFixed(3)} 0 0`).join(' ')} 0 0 0 1 0"/></filter>`}
function tint(hex){const id='tn'+hex.slice(1).toUpperCase();if(!TINTS.has(id)){TINTS.add(id);$('#gdefs')?.insertAdjacentHTML('beforeend',tintFilter(id))}return`url(#${id})`}
function imageDefs(){let s='';
  for(const k in IMG){const f=FIT[k],n=NAT[k];const box=f||(n&&[0,0,n[0],n[1]]);if(box)s+=`<image id="I_${k}" href="${IMG[k]}" x="${box[0]}" y="${box[1]}" width="${box[2]}" height="${box[3]}" preserveAspectRatio="none"/>`}
  return s+`<clipPath id="cHead" clipPathUnits="userSpaceOnUse"><rect x="0" y="0" width="1254" height="828"/></clipPath><clipPath id="cBody" clipPathUnits="userSpaceOnUse"><rect x="-300" y="-400" width="1854" height="1615"/></clipPath>`}
function allDefs(){let s=imageDefs();TINTS.forEach(id=>s+=tintFilter(id));return`<defs>${s}</defs>`}
const use=(k,extra='')=>`<use href="#I_${k}" ${extra}/>`;
function hexRGB(h){const n=parseInt(h.slice(1),16);return[n>>16,n>>8&255,n&255]}
function skinIdx(hex){const a=hexRGB(hex||OPT.skin[1]);let bi=0,bd=1e9;OPT.skin.forEach((s,i)=>{const b=hexRGB(s),d=(a[0]-b[0])**2+(a[1]-b[1])**2+(a[2]-b[2])**2;if(d<bd){bd=d;bi=i}});return bi}
function fig(L){
  const base='base'+skinIdx(L.skin),h=L.hairColor,bc=L.beardColor||h;
  let g=use(base);
  const ok={suit:'out_suit',tuxedo:'out_tuxedo',shirt:'out_shirt',sweater:'out_sweater',dress:'out_dress',gown:'out_gown'}[L.outfit];
  if(ok){if(L.outfit==='tuxedo'||L.outfit==='gown')g+=use(ok);else{g+=use(ok,`filter="${tint(L.outfitColor)}"`);if(L.outfit==='suit')g+=use('out_suit_fixed')}}
  g+=use(base,'clip-path="url(#cHead)"');
  if(L.eye&&!BROWN_EYES.has(L.eye))g+=[[486,596],[767,581]].map(([x,y])=>`<ellipse cx="${x}" cy="${y}" rx="25" ry="35" fill="${L.eye}" stroke="#2A1A12" stroke-width="3"/><ellipse cx="${x}" cy="${y+5}" rx="12" ry="17" fill="#1A1210"/><circle cx="${x+8}" cy="${y-13}" r="8" fill="#FFFFFF"/>`).join('');
  if(L.hair!=='bald'&&IMG['hair_'+L.hair])g+=use('hair_'+L.hair,`filter="${tint(h)}"`);
  if(L.beard!=='none'&&IMG['beard_'+L.beard])g+=use('beard_'+L.beard,`filter="${tint(bc)}"`);
  if(L.glasses!=='none')g+=use('gl_'+L.glasses);
  return`<g transform="${PERSON_T}" clip-path="url(#cBody)">${g}</g>`;
}
function chairM(){const n=NAT.chair;return`<g transform="translate(-25 -47) scale(${(50/n[0]).toFixed(4)})">${use('chair')}</g>`}
function person(G,P,withChair=true){return`${withChair?chairM():''}<g transform="translate(0 ${G.kid?3:0}) scale(${G.kid?.8:1})">${fig(G.look)}</g>`}

/* ---------------- state ---------------- */
let DRAFT='supra.draft';
const CFG=window.SUPRA_CONFIG||{};let SB=null,ROW=null,MODE='edit',SLUG='',saveT=0;
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

/* ---------------- geometry ---------------- */
const SP=86;
function geo(x){
  const n=x.seats.length,seats=[];let shape,w,h;
  const out=(px,py,ox,oy)=>seats.push({x:px,y:py,ox,oy});
  if(x.shape==='round'){
    const rs=Math.max(92,n*SP/(2*Math.PI)),r=rs-26;
    for(let i=0;i<n;i++){const a=-Math.PI/2+i*2*Math.PI/n,ox=Math.cos(a),oy=Math.sin(a);out(ox*rs,oy*rs,ox,oy)}
    shape={type:'round',r};w=2*(rs+104);h=2*(rs+92);
  }else if(x.shape==='square'){
    const per=[0,0,0,0];for(let i=0;i<n;i++)per[i%4]++;
    const side=Math.max(...per,1)*SP+24,hs=side/2;
    [[0,-1],[1,0],[0,1],[-1,0]].forEach(([ox,oy],k)=>{const c=per[k];for(let i=0;i<c;i++){const o=(i-(c-1)/2)*SP;out(ox?ox*(hs+26):o,oy?oy*(hs+26):o,ox,oy)}});
    shape={type:'rect',w:side,h:side};w=side+2*170;h=side+2*100;
  }else if(x.shape==='head'){
    const W=Math.max(n,2)*SP+24,H=74;
    for(let i=0;i<n;i++)out((i-(n-1)/2)*SP,-H/2-26,0,-1);
    shape={type:'rect',w:W,h:H};w=W+20;h=H+2*96;
  }else{
    const top=Math.ceil(n/2),bot=n-top,W=Math.max(top,1)*SP+24,H=120;
    for(let i=0;i<top;i++)out((i-(top-1)/2)*SP,-H/2-26,0,-1);
    for(let i=0;i<bot;i++)out((i-(bot-1)/2)*SP,H/2+26,0,1);
    shape={type:'rect',w:W,h:H};w=W+20;h=H+2*96+8;
  }
  return{seats,shape,w,h};
}
function autoArrange(){
  const MAXW=1000,GAP=60,rows=[];let row=[],rw=0;
  S.tables.forEach(x=>{const[gw,gh]=dims(x),g={w:gw,h:gh};if(row.length&&rw+GAP+g.w>MAXW){rows.push(row);row=[];rw=0}row.push({x,g});rw+=(row.length>1?GAP:0)+g.w});
  if(row.length)rows.push(row);
  let y=0;rows.forEach(r=>{const tw=r.reduce((a,o)=>a+o.g.w,0)+GAP*(r.length-1),rh=Math.max(...r.map(o=>o.g.h));let cx=-tw/2;
    r.forEach(o=>{o.x.x=Math.round(cx+o.g.w/2);o.x.y=Math.round(y+rh/2);cx+=o.g.w+GAP});y+=rh+GAP});
  let vx=-500;S.venue.forEach(v=>{v.x=vx+v.w/2;v.y=y+v.h/2;vx+=v.w+40});
}
function rbox(w,h,deg){const a=(deg||0)*Math.PI/180,c=Math.abs(Math.cos(a)),n=Math.abs(Math.sin(a));return[w*c+h*n,w*n+h*c]}
function rot(x,y,deg){const a=(deg||0)*Math.PI/180,c=Math.cos(a),n=Math.sin(a);return[x*c-y*n,x*n+y*c]}
function dims(x){const g=geo(x);return rbox(g.w,g.h,x.rot)}
function resolveOverlaps(){const pad=50,R=x=>{const[w,h]=dims(x);return{x0:x.x-w/2,x1:x.x+w/2,y0:x.y-h/2,y1:x.y+h/2}};let moved=false;
  const ts=[...S.tables].sort((a,b)=>a.y-b.y);
  for(let i=1;i<ts.length;i++)for(let j=0;j<i;j++){const A=R(ts[j]),B=R(ts[i]);if(B.x0<A.x1+pad&&B.x1>A.x0-pad&&B.y0<A.y1+pad&&B.y1>A.y0-pad){ts[i].y+=Math.ceil(A.y1+pad-B.y0);moved=true}}
  return moved}
function bounds(){
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  S.tables.forEach(x=>{const[w,h]=dims(x);x0=Math.min(x0,x.x-w/2);x1=Math.max(x1,x.x+w/2);y0=Math.min(y0,x.y-h/2);y1=Math.max(y1,x.y+h/2)});
  S.venue.forEach(v=>{const[w,h]=rbox(v.w,v.h,v.rot);x0=Math.min(x0,v.x-w/2-30);x1=Math.max(x1,v.x+w/2+30);y0=Math.min(y0,v.y-h/2-30);y1=Math.max(y1,v.y+h/2+30)});
  if(!isFinite(x0)){x0=-400;x1=400;y0=0;y1=300}
  const w=Math.max(x1-x0,800);const cx=(x0+x1)/2;x0=cx-w/2;x1=cx+w/2;
  return{x:x0-50,y:y0-160,w:x1-x0+100,h:y1-y0+210};
}

/* ---------------- rules ---------------- */
function ruleBroken(r){const a=where(r.a),b=where(r.b);if(!a||!b)return false;return r.type==='together'?a.t!==b.t:a.t===b.t}
function brokenSet(){const s=new Set();S.rules.forEach(r=>{if(ruleBroken(r)){s.add(r.a);s.add(r.b)}});return s}

/* ---------------- plan drawing ---------------- */
function decoAt(kind,x,y,w){const key={flowers:'deco_flowers',candles:'deco_candles',greenery:'deco_greenery'}[kind];if(!key)return'';const n=NAT[key],sc=w/n[0],h=n[1]*sc;
  return`<g transform="translate(${(x-w/2).toFixed(1)} ${(y-h/2).toFixed(1)}) scale(${sc.toFixed(4)})">${use(key)}</g>`}
function strip(key,x0,x1,y,hgt){const n=NAT[key],L=n[0]*hgt/n[1],n2=Math.max(1,Math.round((x1-x0)/(L*.9))),step=(x1-x0)/n2,tw=step*1.08;let s='';
  for(let i=0;i<n2;i++){const cx=x0+step*(i+.5);s+=`<g transform="translate(${(cx-tw/2).toFixed(1)} ${(y-hgt/2).toFixed(1)}) scale(${(tw/n[0]).toFixed(4)} ${(hgt/n[1]).toFixed(4)})">${use(key)}</g>`}return s}
function setting(x,y,ang){const n=NAT.setting,w=40,sc=w/n[0],h=n[1]*sc;
  return`<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${ang+180})"><g transform="translate(${-w/2} ${(-h/2).toFixed(1)}) scale(${sc.toFixed(4)})">${use('setting')}</g></g>`}
function clothRect(id,shape,w,h,isSel,p){
  // plain cloth crop: surface spans x 90..1640, y 8..400 of 1723x544; slices L 0-262, M 258-1462, R 1458-1723
  const sy=h/392,top=-h/2-8*sy,sq=shape==='square',sx=sq?w/350:sy;let s=`<defs><clipPath id="ct_${id}"><rect x="${-w/2-60}" y="${-h/2-30}" width="${w+120}" height="${h+36}"/></clipPath></defs><g clip-path="url(#ct_${id})">`;
  s+=`<g transform="translate(${(-w/2-90*sx).toFixed(1)} ${top.toFixed(1)}) scale(${sx.toFixed(4)} ${sy.toFixed(4)})">${use('tbl_L')}</g>`;
  if(!sq){const x0=-w/2+168*sy,x1=w/2-178*sy;s+=`<g transform="translate(${x0.toFixed(1)} ${top.toFixed(1)}) scale(${((x1-x0)/1204).toFixed(4)} ${sy.toFixed(4)})">${use('tbl_M')}</g>`}
  s+=`<g transform="translate(${(w/2-182*sx).toFixed(1)} ${top.toFixed(1)}) scale(${sx.toFixed(4)} ${sy.toFixed(4)})">${use('tbl_R')}</g></g>`;
  if(isSel)s+=`<rect x="${-w/2-4}" y="${-h/2-4}" width="${w+8}" height="${h+8}" rx="8" fill="none" stroke="${p.accent}" stroke-width="3" stroke-dasharray="8 5"/>`;
  return s}
function clothRound(id,r,isSel,p){const sx=r/502,sy=r/390;
  return`<defs><clipPath id="ct_${id}"><circle cx="0" cy="2" r="${r+7}"/></clipPath></defs><g clip-path="url(#ct_${id})"><g transform="translate(${(-598*sx).toFixed(1)} ${(-390*sy).toFixed(1)}) scale(${sx.toFixed(4)} ${sy.toFixed(4)})">${use('tbl_round')}</g></g>${isSel?`<circle r="${r+5}" fill="none" stroke="${p.accent}" stroke-width="3" stroke-dasharray="8 5"/>`:''}`}
const NAMEFONT='Noto Serif Georgian, Noto Sans Georgian, Georgia, serif',BODYFONT='Noto Sans Georgian, system-ui, sans-serif';
function nameCard(x,y,G,p,bad){
  const parts=String(G.name||'').trim().split(/\s+/);const a=parts[0]||'',b=parts.slice(1).join(' ');
  const fit=(s,sz)=>s.length*sz*.62>76?`textLength="76" lengthAdjust="spacingAndGlyphs"`:'';
  const sc=SIDE_COL[G.side];
  return`<g><rect x="${x-45}" y="${y-16}" width="90" height="32" rx="6" fill="#FFFFFF" stroke="${bad?'#C0392B':p.edge}" stroke-width="${bad?2:.9}"/>
  ${sc?`<rect x="${x-45}" y="${y-16}" width="5" height="32" rx="2" fill="${sc}"/>`:''}
  <text x="${x+2}" y="${b?y-2:y+4}" text-anchor="middle" font-family="${NAMEFONT}" font-weight="700" font-size="11" fill="${p.ink}" ${fit(a,11)}>${esc(a)}</text>
  ${b?`<text x="${x+2}" y="${y+10}" text-anchor="middle" font-family="${BODYFONT}" font-size="8.6" fill="${shade(p.ink,30)}" ${fit(b,8.6)}>${esc(b)}</text>`:''}</g>`;
}
function handle(kind,id,x,y,p){return`<g class="rothandle" data-rk="${kind}" data-rid="${id}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><circle r="15" fill="#FFFFFF" stroke="${p.accent}" stroke-width="2"/><path d="M-6,-3 A7,7 0 1,1 -4,5" fill="none" stroke="${p.accent}" stroke-width="2" stroke-linecap="round"/><path d="M-9,-6 L-6,-2 L-2,-5" fill="none" stroke="${p.accent}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>`}
function stageM(v,p){const x=-v.w/2,y=-v.h/2,w=v.w,h=v.h,wood='#C99A63',dark='#8C6239';let b='';
  b+=`<rect x="${x+4}" y="${y+6}" width="${w}" height="${h}" rx="6" fill="${shade(p.floor,-12)}"/>`;
  b+=`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${wood}" stroke="${dark}" stroke-width="1.5"/>`;
  for(let yy=y+14;yy<y+h-12;yy+=14)b+=`<path d="M${x+4},${yy} H${x+w-4}" stroke="${dark}" stroke-width=".7" opacity=".45"/>`;
  for(let i=0;i<Math.floor(w/60);i++){const xx=x+30+i*60+((i%2)*20);b+=`<path d="M${xx},${y+4} V${y+h-12}" stroke="${dark}" stroke-width=".5" opacity=".3"/>`}
  b+=`<rect x="${x}" y="${y+h-10}" width="${w}" height="10" rx="3" fill="${dark}"/>`;
  let cur='';const n=Math.max(4,Math.round(w/26));for(let i=0;i<n;i++){const cx=x+(i+.5)*w/n;cur+=`${i?'':`M${x},${y}`} Q${(cx).toFixed(1)},${y+18} ${(x+(i+1)*w/n).toFixed(1)},${y}`}
  b+=`<path d="${cur} Z" fill="${p.accent}" opacity=".85"/><rect x="${x}" y="${y-5}" width="${w}" height="7" rx="3" fill="${shade(p.accent,-25)}"/>`;
  [[x+16],[x+w-40]].forEach(([sx])=>{b+=`<rect x="${sx}" y="${y+h-40}" width="24" height="26" rx="3" fill="#2A2A2C"/><circle cx="${sx+12}" cy="${y+h-27}" r="7" fill="#4A4A4E" stroke="#111" stroke-width="1.5"/>`});
  b+=`<circle cx="0" cy="${y+h-24}" r="4" fill="#2A2A2C"/><circle cx="0" cy="${y+h-24}" r="10" fill="none" stroke="#2A2A2C" stroke-width="1" opacity=".5"/>`;
  return b}
function barM(v,p){const x=-v.w/2,y=-v.h/2,w=v.w,h=v.h,top='#7A4E2D',edge='#4E2F19',cd=Math.min(46,h*.55);let b='';
  b+=`<rect x="${x+4}" y="${y+6}" width="${w}" height="${cd}" rx="8" fill="${shade(p.floor,-12)}"/>`;
  b+=`<rect x="${x}" y="${y}" width="${w}" height="${cd}" rx="8" fill="${top}" stroke="${edge}" stroke-width="1.5"/><rect x="${x+5}" y="${y+5}" width="${w-10}" height="${cd-16}" rx="5" fill="${shade(top,14)}"/>`;
  const bc=['#3F6E3A','#8C5A1E','#B23A52','#D9B45A','#2F4F6E'];const nb=Math.max(3,Math.floor((w-30)/18));
  for(let i=0;i<nb;i++){const cx=x+15+i*(w-30)/(nb-1||1);b+=`<circle cx="${cx.toFixed(1)}" cy="${y+12}" r="5" fill="${bc[i%bc.length]}" stroke="#00000033"/><circle cx="${cx.toFixed(1)}" cy="${y+12}" r="1.8" fill="#FFFFFF" opacity=".7"/>`}
  const ng=Math.max(2,Math.floor((w-40)/40));for(let i=0;i<ng;i++){const cx=x+30+i*(w-60)/(ng-1||1);b+=`<circle cx="${cx.toFixed(1)}" cy="${y+cd-9}" r="4.5" fill="#FFFFFF" stroke="#C8CFD6" stroke-width="1"/>`}
  if(h>cd+20){const ns=Math.max(2,Math.floor(w/48));for(let i=0;i<ns;i++){const cx=x+(i+.5)*w/ns;b+=`<circle cx="${cx.toFixed(1)}" cy="${y+cd+16}" r="11" fill="${p.chair}" stroke="${shade(p.chair,-30)}" stroke-width="1.2"/><circle cx="${cx.toFixed(1)}" cy="${y+cd+16}" r="6" fill="${shade(p.chair,15)}"/>`}}
  return b}
function venueM(v,p,isSel,guest){
  const lbl=v.label||t(v.type),x=-v.w/2,y=-v.h/2,r=v.rot||0;let body='';
  if(v.type==='dance'){body=`<rect x="${x}" y="${y}" width="${v.w}" height="${v.h}" rx="6" fill="${shade(p.runner,25)}" stroke="${p.edge}"/>`;
    const n=8,cw=v.w/n,rows=Math.max(1,Math.round(v.h/cw));for(let i=0;i<n;i++)for(let j=0;j<rows;j++)if((i+j)%2)body+=`<rect x="${x+i*cw}" y="${y+j*v.h/rows}" width="${cw}" height="${v.h/rows}" fill="${p.runner}" opacity=".45"/>`}
  else if(v.type==='cake')body=`<circle r="${Math.min(v.w,v.h)/2}" fill="#FFFFFF" stroke="${p.edge}"/><circle r="${Math.min(v.w,v.h)/2-12}" fill="${shade(p.fl[0],10)}" stroke="${p.accent}" stroke-dasharray="3 3"/>`;
  else if(v.type==='entrance')body=`<rect x="${x}" y="${y}" width="${v.w}" height="${v.h}" rx="4" fill="${p.cloth}" stroke="${p.ink}" stroke-width="1.5" stroke-dasharray="8 5"/>`;
  else if(v.type==='stage')body=stageM(v,p);
  else if(v.type==='bar')body=barM(v,p);
  else body=`<rect x="${x}" y="${y}" width="${v.w}" height="${v.h}" rx="10" fill="${p.cloth}" stroke="${p.edge}" stroke-width="1.2"/>`;
  const pill=v.type==='stage'||v.type==='bar',lw=Math.max(60,lbl.length*8.4+24),ly=v.type==='bar'?y+Math.min(46,v.h*.55)/2+4:0;
  const [lx,lyy]=rot(0,ly,r);
  return`<g class="venue" data-v="${v.id}"${guest?'':` role="button" tabindex="0" aria-label="${esc(lbl||t(v.type))}"`} transform="translate(${v.x} ${v.y})"><g transform="rotate(${r})">${body}${isSel?`<rect x="${x-6}" y="${y-8}" width="${v.w+12}" height="${v.h+14}" rx="10" fill="none" stroke="${p.accent}" stroke-width="2" stroke-dasharray="6 4"/>`:''}</g>
  <g transform="translate(${lx.toFixed(1)} ${lyy.toFixed(1)})">${pill?`<rect x="${-lw/2}" y="-12" width="${lw}" height="24" rx="12" fill="#FFFFFF" stroke="${p.accent}" opacity=".95"/>`:''}<text x="0" y="5" text-anchor="middle" font-family="Marcellus, Noto Serif Georgian, Georgia, serif" font-size="15" fill="${p.ink}">${esc(lbl)}</text></g>
  ${isSel?(()=>{const[hx,hy]=rot(0,y-34,r);return`<path d="M0,0 L${hx.toFixed(1)},${hy.toFixed(1)}" stroke="${p.accent}" stroke-width="1" stroke-dasharray="3 3" opacity=".6" pointer-events="none"/>`+handle('venue',v.id,hx,hy,p)})():''}</g>`;
}
function seatLabel(x,i,G){const where=tName(x)+', '+t('seat')+' '+(i+1);return G?(G.anon?t('takenSeat'):G.name)+' — '+where:t('emptySeat')+' — '+where}
function planSVG(opt={}){
  const p=P(),B=bounds(),broken=opt.guest?new Set():brokenSet();
  let s=`<rect x="${B.x}" y="${B.y}" width="${B.w}" height="${B.h}" fill="${p.floor}"/>`;
  for(let x=Math.ceil(B.x/48)*48;x<B.x+B.w;x+=48)s+=`<path d="M${x},${B.y} V${B.y+B.h}" stroke="${shade(p.floor,-4)}" stroke-width="1"/>`;
  const seated=S.tables.reduce((a,x)=>a+x.seats.filter(Boolean).length,0);
  const date=gDate();
  const cx=B.x+B.w/2;
  s+=`<text x="${cx}" y="${B.y+70}" text-anchor="middle" font-family="Marcellus, Noto Serif Georgian, Georgia, serif" font-size="38" fill="${p.ink}">${esc(S.event.name||t('wedding'))}</text>`;
  s+=`<text x="${cx}" y="${B.y+102}" text-anchor="middle" font-family="${BODYFONT}" font-size="15" fill="${p.accent}" letter-spacing="1">${esc([date,tn('nGuests',seated),tn('nTables',S.tables.length)].filter(Boolean).join('  ·  '))}</text>`;
  s+=`<path d="M${cx-70},${B.y+116} H${cx+70}" stroke="${p.accent}" stroke-width="1"/>`;
  S.venue.forEach(v=>s+=`<g opacity="${opt.dim?.5:1}">${venueM(v,p,!opt.guest&&sel.kind==='venue'&&sel.v===v.id,opt.guest)}</g>`);
  S.tables.forEach(x=>{
    const g=geo(x),isSel=!opt.guest&&sel.kind==='table'&&sel.t===x.id,dim=opt.dim&&opt.dim!==x.id;
    const tA=opt.guest?'':` role="button" tabindex="0" aria-label="${esc(t('tableA11y',{n:tName(x),occupied:x.seats.filter(Boolean).length,capacity:x.seats.length}))}"`;
    const R0=x.rot||0;let tb=`<g class="tgrp" data-tg="${x.id}" transform="translate(${x.x} ${x.y})" opacity="${dim?.3:1}"><g transform="rotate(${R0})">`;
    g.seats.forEach((st,i)=>{
      const gid=x.seats[i],G=gid&&S.guests[gid],ang=Math.atan2(-st.oy,-st.ox)*180/Math.PI-90;
      const on=(!opt.guest&&sel.kind==='seat'&&sel.t===x.id&&sel.i===i)||(opt.hi&&opt.hi===gid);
      tb+=`<g class="seat" data-t="${x.id}" data-i="${i}" ${opt.guest?'':`role="button" tabindex="0" aria-label="${esc(seatLabel(x,i,G))}"`}><g transform="translate(${st.x.toFixed(1)} ${st.y.toFixed(1)}) rotate(${ang.toFixed(1)})">`;
      tb+=`<circle class="ring" r="40" fill="${p.accent}" opacity="${on?.32:0}"/>`;
      tb+=G?person(G,p):chairM(p)+`<circle cx="0" cy="-8" r="13" fill="#FFFFFF" opacity=".7" stroke="${shade(p.chair,-30)}" stroke-dasharray="3 3"/><path d="M-5,-8 H5 M0,-13 V-3" stroke="${shade(p.chair,-35)}" stroke-width="1.5"/>`;
      tb+=`</g></g>`;
    });
    if(g.shape.type==='round'){const r=g.shape.r;
      tb+=`<g class="tbody" data-table="${x.id}"${tA}>`+clothRound(x.id,r,isSel,p);
      g.seats.forEach(st=>tb+=setting(st.ox*(r-24),st.oy*(r-24),Math.atan2(-st.oy,-st.ox)*180/Math.PI-90));
      if(x.deco==='mixed')tb+=decoAt('flowers',0,-4,Math.min(110,r*1.05))+decoAt('candles',0,r*.32,Math.min(70,r*.6));
      else if(x.deco!=='none')tb+=decoAt(x.deco,0,6,Math.min(x.deco==='greenery'?140:110,r*1.2));
    }else{const{w,h}=g.shape;
      tb+=`<g class="tbody" data-table="${x.id}"${tA}>`+clothRect(x.id,x.shape,w,h,isSel,p);
      g.seats.forEach(st=>{const ang=Math.atan2(-st.oy,-st.ox)*180/Math.PI-90;tb+=setting(st.x-st.ox*(26+22),st.y-st.oy*(26+21),ang)});
      if(x.shape==='square'){if(x.deco!=='none')tb+=decoAt(x.deco==='mixed'?'flowers':x.deco,0,0,Math.min(110,w*.55))}
      else if(x.deco!=='none'){const head=x.shape==='head',ry=head?h/2-16:0,gh=head?30:h*.36,x0=-w/2+14,x1=w/2-14;
        if(x.deco==='flowers'||x.deco==='mixed')tb+=strip(x.deco==='mixed'?'garland_mixed':'garland_flowers',x0,x1,ry,gh);
        else if(x.deco==='greenery')tb+=strip('deco_greenery',x0,x1,ry,gh*.8);
        else{const n=Math.max(1,Math.round((w-24)/140));for(let k=0;k<n;k++){const px=-w/2+12+(k+.5)*(w-24)/n;if(Math.abs(px)<55&&n>1)continue;tb+=decoAt('candles',px,ry,head?30:44)}}}
    }
    const nm=tName(x),lw=Math.max(80,nm.length*8.6+28),ly=g.shape.type==='round'?(x.deco==='none'?0:-g.shape.r+46):x.shape==='head'?-10:0;
    tb+=`</g></g>`;const[plx,ply]=rot(0,ly,R0);
    tb+=`<g pointer-events="none"><rect x="${(plx-lw/2).toFixed(1)}" y="${(ply-13).toFixed(1)}" width="${lw}" height="26" rx="13" fill="#FFFFFF" stroke="${p.accent}" stroke-width="1"/><text x="${plx.toFixed(1)}" y="${(ply+5).toFixed(1)}" text-anchor="middle" font-family="Marcellus, Noto Serif Georgian, Georgia, serif" font-size="14" fill="${p.ink}">${esc(nm)}</text></g>`;
    g.seats.forEach((st,i)=>{const G=x.seats[i]&&S.guests[x.seats[i]];if(G&&!G.anon){const d=48+46*Math.abs(st.ox)+18*Math.abs(st.oy);const[cx,cy]=rot(st.x+st.ox*d,st.y+st.oy*d,R0);tb+=nameCard(cx,cy,G,p,broken.has(G.id))}});
    if(!opt.guest){const[ax,ay]=rot(g.shape.type==='round'?g.shape.r+50:g.shape.w/2+10,g.shape.type==='round'?-g.shape.r-6:4,R0);tb+=`<text x="${ax.toFixed(1)}" y="${ay.toFixed(1)}" font-family="${BODYFONT}" font-size="11" fill="${p.accent}">${x.seats.filter(Boolean).length}/${x.seats.length}</text>`}
    if(isSel){const[hx,hy]=rot(0,-g.h/2-6,R0);tb+=`<path d="M0,0 L${hx.toFixed(1)},${hy.toFixed(1)}" stroke="${p.accent}" stroke-width="1" stroke-dasharray="3 3" opacity=".5" pointer-events="none"/>`+handle('table',x.id,hx,hy,p)}
    s+=tb+`</g>`;
  });
  if(Object.values(S.guests).some(g=>g.side)){const ly=B.y+B.h-22;let lx=B.x+30;
    [['bride'],['groom'],['both']].forEach(([k])=>{s+=`<rect x="${lx}" y="${ly-10}" width="12" height="12" rx="2" fill="${SIDE_COL[k]}"/><text x="${lx+18}" y="${ly}" font-family="${BODYFONT}" font-size="12" fill="${p.ink}">${esc(t(k))}</text>`;lx+=t(k).length*7+46})}
  return{B,inner:s};
}

/* ---------------- top bar ---------------- */
/* ---------------- top bar ---------------- */
let panel=null,FINDQ='';const OPEN=new Set();
const ICON={
  close:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  sun:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  full:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  unfull:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>',
  event:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  guests:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14a5 5 0 0 1 5.5 5"/></svg>',
  share:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>'};
function curTheme(){return document.documentElement.dataset.theme||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')}
function isFull(){return !!document.fullscreenElement||document.body.classList.contains('focus')}
function hintSeen(){try{return localStorage.getItem('supra.hint')==='1'}catch(e){return false}}
let hintOpen=!hintSeen();
function renderTop(){
  const seated=S.tables.reduce((a,x)=>a+x.seats.filter(Boolean).length,0),cap=S.tables.reduce((a,x)=>a+x.seats.length,0);
  const sides={bride:0,groom:0};Object.values(S.guests).forEach(g=>{if(sides[g.side]!==undefined)sides[g.side]++});
  const nb=S.rules.filter(ruleBroken).length;
  $('#evname').textContent=S.event.name||'Supra';if(!guestMode)document.title=t('editTitle',{event:S.event.name||'Supra'});
  $('#stats').innerHTML=`<span>${esc(t('statSeats',{occupied:seated,capacity:cap}))}${S.waiting.length?` · ${esc(tn('nUnseated',S.waiting.length))}`:''}</span>${sides.bride||sides.groom?`<span class="sides"><i style="background:${SIDE_COL.bride}"></i>${sides.bride} <i style="background:${SIDE_COL.groom}"></i>${sides.groom}</span>`:''}${nb?`<button type="button" class="warn" data-panel="guests">⚠ ${nb}</button>`:''}`;
  const cur=!sel.kind&&panel,tabs=[['event','event'],['guests','tabGuests'],['share','tabShare']];
  $('#nav').setAttribute('aria-label',t('panels'));
  $('#nav').innerHTML=tabs.map(([k,l],i)=>`<button type="button" role="tab" id="tab-${k}" data-panel="${k}" aria-selected="${cur===k}" aria-controls="left" tabindex="${(cur?cur===k:i===0)?0:-1}">${ICON[k]}<span>${esc(t(l))}</span></button>`).join('');
  $('#lang').setAttribute('aria-label',t('language'));
  $('#lang').innerHTML=[['en','EN','English'],['ka','ქარ','ქართული']].map(([k,l,n])=>`<button type="button" role="radio" data-lang="${k}" lang="${k}" aria-label="${n}" aria-checked="${UL()===k}" tabindex="${UL()===k?0:-1}">${l}</button>`).join('');
  $('#undo').title=t('undo');$('#undo').setAttribute('aria-label',t('undo'));$('#undo').disabled=!hist.length;
  const th=$('#theme');th.innerHTML=curTheme()==='dark'?ICON.sun:ICON.moon;const tl=t(curTheme()==='dark'?'toLight':'toDark');th.setAttribute('aria-label',tl);th.title=tl;th.removeAttribute('aria-pressed');
  const fb=$('#full');fb.innerHTML=isFull()?ICON.unfull:ICON.full;fb.title=isFull()?t('exitFull'):t('fullscreen');fb.setAttribute('aria-label',fb.title);
  const sb=$('#save'),st=$('#savestate');
  sb.hidden=saveState!=='error';sb.textContent=t('save');
  st.textContent=saveState==='saving'?t('saving'):saveState==='error'?t('notSaved'):dirty?t('unsaved'):t('saved');
  st.dataset.state=saveState==='error'||dirty?'dirty':'ok';
  const bk=$('#backlink');if(bk){bk.setAttribute('aria-label',t('logoHome'));$('#backtxt').textContent=t('myEvents')}
  $('.navwrap').setAttribute('aria-label',t('planner'));
  const sv=$('#savestate');sv.setAttribute('aria-label',t('saveStatus'));
  const hn=$('#hint'),touch=matchMedia('(pointer:coarse)').matches;hn.hidden=!hintOpen||(!!(sel.kind||panel)&&isPhone());
  hn.innerHTML=`<span>${esc(t(touch?'hintTouch':'hintPlan'))}</span><button type="button" data-act="hintok" aria-label="${esc(t('hintClose'))}">×</button>`;
  $('#help').setAttribute('aria-expanded',!hn.hidden);
  $('#quickadd').setAttribute('aria-label',t('addToRoom'));
  $('#quickadd').innerHTML=`<button type="button" class="btn" data-act="addtable">${t('addTable')}</button>${['stage','bar','dance'].map(k=>`<button type="button" class="btn" data-addvenue="${k}">+ ${t(k)}</button>`).join('')}`;
  [['zout','zoomOut'],['zin','zoomIn'],['zall','fitAll'],['zwidth','fitWidth'],['help','helpMove']].forEach(([id,k])=>{const b=$('#'+id);b.setAttribute('aria-label',t(k));b.title=t(k)});
  $('#zoombar').setAttribute('aria-label',t('zoom'));
  $('#scroller').setAttribute('aria-label',t('planLabel'));$('#plankeys').textContent=t('planKeys');
}

/* ---------------- panels ---------------- */
/* Single-choice button rows are radio groups: one tab stop, arrow keys move and select. */
const radios=(name,items)=>{const any=items.some(it=>it.on);return`<div class="chips" role="radiogroup" aria-label="${esc(name)}">${items.map((it,i)=>`<button type="button" role="radio" class="${it.cls||'chip'}" ${it.attr} aria-checked="${!!it.on}" tabindex="${it.on||(!any&&i===0)?0:-1}"${it.label?` aria-label="${esc(it.label)}" title="${esc(it.label)}"`:''}${it.style?` style="${it.style}"`:''}>${it.html||''}</button>`).join('')}</div>`};
const chipBtns=(attr,list,cur,lbl,name)=>radios(name||'',list.map(k=>({attr:`${attr}="${k}"`,on:cur===k,html:esc(lbl?lbl(k):t(k))})));
const det=(key,title,body)=>`<details class="more" data-sec="${key}" ${OPEN.has(key)?'open':''}><summary>${title}</summary><div class="body">${body}</div></details>`;
const dhead=(title,sub)=>`<div class="dhead"><div style="min-width:0"><h2 id="dtitle" tabindex="-1">${title}</h2>${sub?`<span class="muted">${sub}</span>`:''}</div><button type="button" class="icon" data-act="close" aria-label="${esc(t('closePanel'))}" title="${esc(t('closePanel'))}">${ICON.close}</button></div>`;
function renderLeft(){
  const L=$('#left');if(!panel||sel.kind){L.innerHTML='';return}
  const e=S.event;let h='';
  if(panel==='event'){h=dhead(t('event'))+`
    <label class="field"><span class="lbl">${t('eventName')}</span><input id="ev-name" class="inp" value="${esc(e.name)}"></label>
    <div class="row2"><div class="field"><span class="lbl">${t('eventType')}</span>${EVENT_TYPES.filter(([,on])=>on).length>1?`<select id="ev-type" aria-label="${esc(t('eventType'))}">${EVENT_TYPES.filter(([,on])=>on).map(([k])=>`<option value="${k}" ${e.type===k?'selected':''}>${t(k)}</option>`).join('')}</select>`:`<p class="static">${esc(t(e.type||'wedding'))}</p>`}</div>
    <label class="field"><span class="lbl">${t('date')}</span><input id="ev-date" class="inp" type="date" value="${esc(e.date)}" aria-describedby="ev-date-txt"><span class="muted small" id="ev-date-txt">${esc(fmtDate(e.date))}</span></label></div>
    <p class="muted small">${t('soonLine')} ${EVENT_TYPES.filter(([,on])=>!on).map(([k])=>t(k)).join(', ')}.</p>
    <div class="field"><span class="lbl">${t('style')}</span>${chipBtns('data-pal',Object.keys(PALETTES),e.palette,k=>t('pal_'+k),t('style'))}</div>
    ${det('layout',t('layoutTools'),`<p class="muted">${t('venueHint')}</p><div class="chips">${Object.keys(VENUE).filter(k=>!['stage','bar','dance'].includes(k)).map(k=>`<button type="button" class="chip" data-addvenue="${k}">+ ${t(k)}</button>`).join('')}</div><button type="button" class="btn sm" data-act="arrange">${t('autoArrange')}</button>`)}`}
  else if(panel==='guests'){const total=Object.keys(S.guests).length;const seatedG=S.tables.reduce((a,x)=>a+x.seats.filter(Boolean).length,0);h=dhead(t('tabGuests'),esc(t('statGuests',{seatedGuests:seatedG,totalGuests:total})))+`
    <input id="find" type="search" class="inp" placeholder="${t('findPh')}" aria-label="${t('findGuest')}" value="${esc(FINDQ)}"><div class="search-res" id="findres"></div>
    ${S.waiting.length?`<div class="field"><span class="lbl">${t('waitingTitle')}</span><p class="muted">${t('waitingHint')}</p><div class="waiting">${S.waiting.map(id=>`<button type="button" class="wchip" data-wait="${id}" aria-pressed="${waitSel===id}">${esc(S.guests[id]?.name)}</button>`).join('')}</div></div>`:''}
    ${det('add',t('addGuests'),`<label class="field"><span class="lbl">${t('pasteNames')}</span><textarea id="bulk" rows="3" class="inp" placeholder="ნინო ბერიძე&#10;Giorgi Kapanadze"></textarea></label>
      <label class="field"><span class="lbl">${t('seatThem')}</span><select id="bulk-t"><option value="">${t('anyFree')}</option>${S.tables.map(x=>`<option value="${x.id}">${esc(tName(x))} (${esc(tn('nFree',x.seats.filter(v=>!v).length))})</option>`).join('')}<option value="__wait">${t('waitList')}</option></select></label>
      <div class="row"><button type="button" class="btn primary" data-act="bulk">${t('addNames')}</button></div>
      <div class="row"><button type="button" class="btn sm" data-act="import">${t('importX')}</button><button type="button" class="btn sm" data-act="export">${t('exportX')}</button></div>`)}
    ${det('rules',`${t('rules')}${S.rules.length?` · ${S.rules.length}`:''}`,`${S.rules.length?`<div class="rules">${S.rules.map(r=>{const b=ruleBroken(r);return`<div class="rule ${b?'bad':''}"><span>${esc(S.guests[r.a]?.name)} <b>${r.type==='together'?'＋':'≠'}</b> ${esc(S.guests[r.b]?.name)}</span><span class="pill ${b?'bad':''}">${b?t('ruleBroken'):t('ruleOk')}</span><button type="button" class="x" data-delrule="${r.id}" aria-label="${t('remove')}">×</button></div>`}).join('')}</div>`:''}<p class="muted">${t('rulesHint')}</p>`)}
    ${det('tools',t('tools'),`<div class="row"><button type="button" class="btn sm" data-act="autoseat">${t('autoSeat')}</button><button type="button" class="btn sm" data-act="randall">${t('restyle')}</button><button type="button" class="btn sm" data-act="shuffleall">${t('shuffle')}</button><button type="button" class="btn sm danger" data-act="reset">${t('startOver')}</button></div>
      ${confirmK==='autoseat'?`<div class="confirm"><span>${t('autoSeatQ')}</span><div class="row"><button type="button" class="btn sm primary" data-act="autoseat-yes">${t('autoSeatYes')}</button><button type="button" class="btn sm" data-act="cancel">${t('keep')}</button></div></div>`:''}
      ${confirmK==='reset'?`<div class="confirm danger"><span>${t('startOverQ')}</span><div class="row"><button type="button" class="btn sm danger" data-act="reset-yes">${t('startOverYes')}</button><button type="button" class="btn sm" data-act="cancel">${t('keep')}</button></div></div>`:''}`)}`}
  else{const on=ROW?.guest_page!==false,mode=ROW?.lookup_mode||'prefix',pin=!!ROW?.lookup_pin_hash,u=guestUrl();
    h=dhead(t('tabShare'))+`
    <p class="muted">${t('guestPageHint')}</p>
    <label class="check"><input type="checkbox" id="gp-on" ${on?'checked':''}> ${t('guestPageOn')}</label>
    ${on?`<div class="field"><span class="lbl" id="sl-l">${t('shareLink')}</span>
      <p class="sharelink" aria-labelledby="sl-l"><span class="host">${esc(location.host)}/e/</span><b class="code">${esc(ROW?.slug||'')}</b></p>
      <div class="row"><button type="button" class="btn primary" data-act="copylink">${t('copyLink')}</button><a class="btn" href="${esc(u)}" target="_blank" rel="noopener">${t('openGuest')}<span class="sr"> ${t('newTab')}</span></a></div>
      <p id="copystate" class="muted small" role="status"></p></div>
      <div id="qr" class="qr" role="img" aria-label="${esc(t('qrAlt'))}"></div>
      <div class="row"><button type="button" class="btn sm" data-act="dlqr">${t('dlQR')}</button></div>
      <div class="field"><span class="lbl">${t('guestLang')}</span>${radios(t('guestLang'),[['en',t('lang_en')],['ka',t('lang_ka')]].map(([k,l])=>({attr:`data-glangset="${k}" lang="${k}"`,on:(S.event.lang||'en')===k,html:esc(l)})))}<span class="muted small">${t('guestLangHint')}</span></div>`:''}
    <section class="pubbox" id="privacy-controls" aria-labelledby="pub-h">
      <h3 id="pub-h">${t('pubTitle')}</h3>
      <p class="small">${t('privacy')}</p>
      <p class="small">${t('pubSees')}</p>
      <ul class="small publist"><li>${t('pubLayout')}</li><li>${t('pubMatch')}</li>${ROW?.show_tablemates?`<li>${t('pubMates')}</li>`:''}</ul>
      <p class="small muted">${t('pubNever')}</p>
      <fieldset class="field"><legend class="lbl">${t('lkMode')}</legend>
        <label class="check"><input type="radio" name="lk-mode" value="prefix" ${mode==='prefix'?'checked':''}> ${t('lkPrefix')}</label>
        <label class="check"><input type="radio" name="lk-mode" value="exact" ${mode==='exact'?'checked':''}> ${t('lkExact')}</label></fieldset>
      <label class="check"><input type="checkbox" id="lk-mates" ${ROW?.show_tablemates?'checked':''}> ${t('lkMates')}</label>
      <div class="field"><label class="lbl" for="lk-pin">${t('lkPin')}</label>
        <p class="small muted" id="lk-pin-h">${pin?t('lkPinOn'):t('lkPinOff')} ${t('lkPinHint')}</p>
        <div class="row2 linkrow"><input id="lk-pin" class="inp" maxlength="12" autocomplete="off" aria-describedby="lk-pin-h"><button type="button" class="btn" data-act="setpin">${pin?t('lkPinChange'):t('lkPinSet')}</button></div>
        ${pin?`<button type="button" class="btn sm" data-act="rmpin">${t('lkPinRemove')}</button>`:''}</div>
    </section>
    ${det('print',t('printOuts'),`<div class="field"><span class="lbl">${t('cards')}</span><p class="muted">${t('cardsHint')}</p><button type="button" class="btn" data-act="cards">${t('makeCards')}</button></div>
      <div class="field"><span class="lbl">${t('caterer')}</span><p class="muted">${t('catererHint')}</p><button type="button" class="btn" data-act="caterer">${t('openCaterer')}</button></div>
      <div class="field"><span class="lbl">${t('planImg')}</span><p class="muted">${t('planImgHint')}</p><div class="row"><button type="button" class="btn" data-act="planpdf">${t('dlPdf')}</button><button type="button" class="btn" data-act="planimg">${t('dlPng')}</button></div><p class="muted small">${t('pdfPlanHint')}</p></div>`)}`}
  L.innerHTML=h;
  if(panel==='guests')doFind();
  if(panel==='share')drawQR();
}
function doFind(){const q=($('#find')?.value||'').trim().toLowerCase(),box=$('#findres');if(!box)return;if(!q){box.innerHTML='';return}
  const res=[];S.tables.forEach(x=>x.seats.forEach((id,i)=>{const G=id&&S.guests[id];if(G&&(G.name.toLowerCase().includes(q)||G.group.toLowerCase().includes(q)))res.push(`<button type="button" data-goto="${x.id}:${i}"><span>${esc(G.name)}</span><small>${esc(tName(x))} · ${t('seat')} ${i+1}</small></button>`)}));
  S.waiting.forEach(id=>{const G=S.guests[id];if(G&&G.name.toLowerCase().includes(q))res.push(`<button type="button" data-wait="${id}"><span>${esc(G.name)}</span><small>${t('waiting')}</small></button>`)});
  box.innerHTML=res.join('')||`<span class="muted">${t('noOne')}</span>`}
function loadScript(src){return new Promise((ok,no)=>{if(document.querySelector(`script[src="${src}"]`)&&window.__loaded?.[src])return ok();const s=document.createElement('script');s.src=src;s.onload=()=>{(window.__loaded=window.__loaded||{})[src]=1;ok()};s.onerror=no;document.head.appendChild(s)})}
const QRLIB='https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',XLSXLIB='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',PDFLIB='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
async function setLookup(ch){
  const args={p_event:ROW.id,p_mode:ch.mode||ROW.lookup_mode||'prefix',p_pin:ch.pin===undefined?null:ch.pin,p_mates:ch.mates===undefined?!!ROW.show_tablemates:ch.mates};
  const{data,error}=await SB.rpc('set_guest_lookup',args);
  if(error||!data){console.error(error);toast(t('lkErr'));renderLeft();return}
  ROW.lookup_mode=data.mode;ROW.show_tablemates=data.mates;ROW.lookup_pin_hash=data.pin?'set':null;
  renderLeft();toast(ch.pin===undefined?t('lkSaved'):ch.pin?t('lkPinSaved'):t('lkPinGone'));
  const f=ch.mode?`[name=lk-mode][value=${data.mode}]`:ch.mates!==undefined?'#lk-mates':'#lk-pin';$(f)?.focus()}
function guestUrl(){return ROW?location.origin+'/e/'+ROW.slug:''}
async function drawQR(){const box=$('#qr');if(!box)return;box.innerHTML='';const u=guestUrl();if(!u)return;
  try{await loadScript(QRLIB);new QRCode(box,{text:u,width:180,height:180,colorDark:'#24302A',colorLight:'#FFFFFF',correctLevel:QRCode.CorrectLevel.M});box.querySelectorAll('img,canvas').forEach(el=>{el.setAttribute('alt','');el.setAttribute('aria-hidden','true')})}catch(e){box.textContent=u}}

/* ---------------- inspector ---------------- */
const SW_LBL={skin:'skin',hairColor:'hairColour',beardColor:'beardColour',eye:'eyes',outfitColor:'outfitColour'},LOOK_LBL={hair:'hairStyle',beard:'beard',outfit:'outfit',glasses:'glasses'};
const sw=(key,list,val)=>radios(t(SW_LBL[key]||key),list.map((c,i)=>({cls:'sw',attr:`data-look="${key}" data-v="${c}"`,on:val===c,style:`background:${c}`,label:t('shadeN',{n:i+1,of:list.length})})));
const lch=(key,list,val,map)=>radios(t(LOOK_LBL[key]||key),list.map(k=>({attr:`data-look="${key}" data-v="${k}"`,on:val===k,html:esc(t(map?.[k]||k))})));
function preview(G){return`<svg viewBox="-34 -50 68 84" width="130" height="161">${person(G,P())}</svg>`}
const rotUI=it=>`<div class="field"><span class="lbl">${t('rotation')}</span><div class="stepper"><button type="button" class="btn sm" data-rot="-15" aria-label="${t('rotLeft')}">↺</button><output>${it.rot||0}°</output><button type="button" class="btn sm" data-rot="15" aria-label="${t('rotRight')}">↻</button></div><span class="muted small">${t('rotHint')}</span></div>`;
function renderRight(){
  const R=$('#right');if(!sel.kind){R.innerHTML='';return}
  if(sel.kind==='seat'){
    const x=T(sel.t);if(!x||sel.i>=x.seats.length){sel={kind:null};return renderRight()}
    const id=x.seats[sel.i],G=id&&S.guests[id];
    if(!G){R.innerHTML=dhead(`${esc(tName(x))} · ${t('seat')} ${sel.i+1}`,t('freeSeat'))+`
      <label class="field"><span class="lbl">${t('guestName')}</span><input id="newname" class="inp" placeholder="${t('typeName')}"></label>
      <div class="row"><button type="button" class="btn primary" data-act="addguest">${t('addGuest')}</button><button type="button" class="btn" data-act="addrandom">${t('addRandom')}</button></div>
      ${S.waiting.length?`<div class="field"><span class="lbl">${t('orWaiting')}</span><div class="waiting">${S.waiting.map(w=>`<button type="button" class="wchip" data-seatwait="${w}">${esc(S.guests[w]?.name)}</button>`).join('')}</div></div>`:''}`;return}
    const L=G.look,groups=[...new Set(Object.values(S.guests).map(g=>g.group).filter(Boolean))];
    const myRules=S.rules.filter(r=>r.a===G.id||r.b===G.id);
    const others=Object.values(S.guests).filter(g=>g.id!==G.id).sort((a,b)=>a.name.localeCompare(b.name));
    R.innerHTML=dhead(esc(G.name),`${esc(tName(x))} · ${t('seat')} ${sel.i+1}`)+`
    <div class="who"><div class="preview">${preview(G)}</div><div class="whotxt">
      <button type="button" class="btn primary" data-act="rnd">🎲 ${t('randomLook')}</button><button type="button" class="btn sm" data-act="kind">${L.kind==='m'?t('toFem'):t('toMasc')}</button></div></div>
    <label class="field"><span class="lbl">${t('name')}</span><input id="g-name" class="inp" value="${esc(G.name)}"></label>
    <div class="field"><span class="lbl">${t('side')}</span>${radios(t('side'),SIDES.map(k=>({attr:`data-gside="${k}"`,on:G.side===k,html:`${k?`<i class="dot" style="background:${SIDE_COL[k]}"></i>`:''}${t(k||'sideNone')}`})))}</div>
    ${det('look',t('appearance'),`<span class="lbl">${t('skin')}</span>${sw('skin',OPT.skin,L.skin)}
      <span class="lbl">${t('hairStyle')}</span>${lch('hair',OPT.hair,L.hair)}
      ${L.hair!=='bald'?`<span class="lbl">${t('hairColour')}</span>${sw('hairColor',OPT.hairColor,L.hairColor)}`:''}
      <span class="lbl">${t('beard')}</span>${lch('beard',OPT.beard,L.beard,BEARD_LBL)}
      ${L.beard!=='none'||L.hair==='bald'?`<span class="lbl">${t('beardColour')}</span>${sw('beardColor',OPT.hairColor,L.beardColor)}`:''}
      <span class="lbl">${t('eyes')}</span>${sw('eye',OPT.eye,L.eye)}
      <span class="lbl">${t('outfit')}</span>${lch('outfit',OPT.outfit,L.outfit)}
      ${['gown','tuxedo'].includes(L.outfit)?'':`<span class="lbl">${t('outfitColour')}</span>${sw('outfitColor',OPT.outfitColor,L.outfitColor)}`}
      <span class="lbl">${t('glasses')}</span>${lch('glasses',OPT.glasses,L.glasses,GL_LBL)}`)}
    ${det('details',t('guestDetails'),`<label class="field"><span class="lbl">${t('group')}</span><input id="g-group" class="inp" list="grouplist" value="${esc(G.group)}" placeholder="${t('groupPh')}"><datalist id="grouplist">${groups.map(v=>`<option value="${esc(v)}">`).join('')}</datalist></label>
      <div class="row2"><label class="field"><span class="lbl">${t('meal')}</span><select id="g-meal">${MEALS.map(k=>`<option value="${k}" ${G.meal===k?'selected':''}>${t(MEAL_LBL[k]||k)}</option>`).join('')}</select></label>
      <label class="check"><input type="checkbox" id="g-kid" ${G.kid?'checked':''}> ${t('child')}</label></div>
      <label class="field"><span class="lbl">${t('allergies')}</span><input id="g-allergies" class="inp" value="${esc(G.allergies)}" placeholder="${t('allergiesPh')}"></label>`)}
    ${det('grules',`${t('rules')}${myRules.length?` · ${myRules.length}`:''}`,`${myRules.map(r=>{const o=S.guests[r.a===G.id?r.b:r.a];const b=ruleBroken(r);return`<div class="rule ${b?'bad':''}"><span>${r.type==='together'?t('together'):t('apart')}: ${esc(o?.name)}</span><span class="pill ${b?'bad':''}">${b?t('ruleBroken'):t('ruleOk')}</span><button type="button" class="x" data-delrule="${r.id}" aria-label="${t('remove')}">×</button></div>`}).join('')}
      <div class="row2"><select id="r-type" aria-label="${esc(t('ruleType'))}"><option value="together">${t('together')}</option><option value="apart">${t('apart')}</option></select>
      <select id="r-who" aria-label="${esc(t('pickGuest'))}"><option value="">${t('pickGuest')}</option>${others.map(o=>`<option value="${o.id}">${esc(o.name)}</option>`).join('')}</select></div>
      <button type="button" class="btn sm" data-act="addrule">${t('addRule')}</button>`)}
    <div class="row" style="border-top:1px solid var(--line);padding-top:12px"><button type="button" class="btn sm" data-act="unseat">${t('toWaiting')}</button><button type="button" class="btn sm danger" data-act="delguest">${t('removeGuest')}</button></div>
    ${confirmK==='guest'?`<div class="confirm danger"><span>${t('removeQ',{n:esc(G.name)})}</span><div class="row"><button type="button" class="btn sm danger" data-act="delguest-yes">${t('remove')}</button><button type="button" class="btn sm" data-act="cancel">${t('keepIt')}</button></div></div>`:''}`;
    return;
  }
  if(sel.kind==='table'){
    const x=T(sel.t);if(!x){sel={kind:null};return renderRight()}
    const free=x.seats.filter(v=>!v).length;
    R.innerHTML=dhead(esc(tName(x)),esc(t('statSeats',{occupied:x.seats.length-free,capacity:x.seats.length})))+`
      <label class="field"><span class="lbl">${t('tableName')}</span><input id="t-name" class="inp" value="${esc(x.name)}"></label>
      <div class="field"><span class="lbl">${t('shape')}</span>${chipBtns('data-shape',SHAPES,x.shape,k=>k==='head'?headName():t(k),t('shape'))}</div>
      <div class="field"><span class="lbl">${t('seats')}</span><div class="stepper"><button type="button" class="btn sm" data-act="seat-" aria-label="-">−</button><output>${x.seats.length}</output><button type="button" class="btn sm" data-act="seat+" aria-label="+">+</button><span class="muted">${esc(tn('nFree',free))}</span></div></div>
      ${rotUI(x)}
      ${det('deco',t('decoration'),chipBtns('data-deco',DECOS,x.deco,k=>t(DECO_LBL[k]||k),t('decoration')))}
      ${det('fill',t('fillGroup'),`<p class="muted">${t('fillHint')}</p><label class="field"><span class="lbl">${t('groupName')}</span><input id="grp" class="inp" value="${UL()==='ka'?'მეზობელი':'Neighbour'}"></label><button type="button" class="btn" data-act="fillgroup" ${free?'':'disabled'}>${t('fillFree')}</button>`)}
      ${det('tmore',t('moreActions'),`<span class="lbl">${t('setSide')}</span><div class="chips">${SIDES.map(k=>`<button type="button" class="chip" data-tside="${k}">${k?`<i class="dot" style="background:${SIDE_COL[k]}"></i>`:''}${t(k||'sideNone')}</button>`).join('')}</div>
        <div class="row"><button type="button" class="btn sm" data-act="focustable">${t('zoomTable')}</button><button type="button" class="btn sm" data-act="shuffle">${t('shuffleTable')}</button><button type="button" class="btn sm" data-act="restyle">${t('restyleTable')}</button><button type="button" class="btn sm" data-act="dup">${t('duplicate')}</button><button type="button" class="btn sm danger" data-act="deltable">${t('deleteTable')}</button></div>
        ${confirmK==='table'?`<div class="confirm danger"><span>${t('deleteTableQ',{n:esc(tName(x)),c:x.seats.filter(Boolean).length})}</span><div class="row"><button type="button" class="btn sm danger" data-act="deltable-yes">${t('deleteTable')}</button><button type="button" class="btn sm" data-act="cancel">${t('keepIt')}</button></div></div>`:''}`)}`;
    return;
  }
  if(sel.kind==='venue'){
    const v=V(sel.v);if(!v){sel={kind:null};return renderRight()}
    R.innerHTML=dhead(esc(v.label||t(v.type)))+`
      <label class="field"><span class="lbl">${t('itemName')}</span><input id="v-label" class="inp" value="${esc(v.label)}" placeholder="${esc(t(v.type))}"></label>
      <div class="row2"><div class="field"><span class="lbl">${t('width')}</span><div class="stepper"><button type="button" class="btn sm" data-vsize="w:-20">−</button><output>${v.w}</output><button type="button" class="btn sm" data-vsize="w:20">+</button></div></div>
      <div class="field"><span class="lbl">${t('height')}</span><div class="stepper"><button type="button" class="btn sm" data-vsize="h:-20">−</button><output>${v.h}</output><button type="button" class="btn sm" data-vsize="h:20">+</button></div></div></div>
      ${rotUI(v)}
      <div class="row"><button type="button" class="btn sm danger" data-act="delvenue">${t('deleteItem')}</button></div>`;
  }
}
/* Desktop: a side panel next to the plan. Phone: a modal sheet — focus moves to its heading, stays inside,
   the plan behind it is inert, and closing returns focus to whatever opened it. */
let drawerOpen=false,opener=null;
function renderDrawer(){const open=!!sel.kind||!!panel,d=$('#drawer'),modal=open&&isPhone(),was=drawerOpen;
  keepView(()=>{d.hidden=!open});drawerOpen=open;
  $('#left').hidden=!!sel.kind||!panel;$('#right').hidden=!sel.kind;
  const L=$('#left');if(panel&&!sel.kind){L.setAttribute('role','tabpanel');L.setAttribute('aria-labelledby','tab-'+panel)}else{L.removeAttribute('role');L.removeAttribute('aria-labelledby')}
  if(modal){d.setAttribute('role','dialog');d.setAttribute('aria-modal','true');d.setAttribute('aria-labelledby','dtitle')}
  else{d.removeAttribute('aria-modal');d.setAttribute('role','complementary');d.setAttribute('aria-label',t('details'));d.removeAttribute('aria-labelledby')}
  $('#backdrop').hidden=!modal;
  ['.bar','#canvas'].forEach(q=>{const el=$(q);if(modal)el.setAttribute('inert','');else el.removeAttribute('inert')});
  return{opened:open&&!was,closed:!open&&was,modal}}
const focusKeyOf=el=>{if(!el||el===document.body)return null;if(el.id)return'#'+CSS.escape(el.id);
  const ds=Object.entries(el.dataset||{}).filter(([k])=>k!=='h');if(!ds.length)return null;
  return el.tagName.toLowerCase()+ds.map(([k,v])=>`[data-${k.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())}="${CSS.escape(v)}"]`).join('')};

/* ---------------- render ---------------- */
function renderPlan(){const{B,inner}=planSVG();const svg=$('#plan');svg.setAttribute('viewBox',`${B.x} ${B.y} ${B.w} ${B.h}`);svg.dataset.w=B.w;svg.dataset.h=B.h;svg.innerHTML=inner;applyZoom()}
/* View: `scale` is screen pixels per plan unit, so opening or closing a panel never changes the zoom.
   fitMode remembers a pressed Fit button so the view refits when the window changes size. */
const isPhone=()=>matchMedia('(max-width:900px)').matches;
function planWH(){const svg=$('#plan');return[+svg.dataset.w||1000,+svg.dataset.h||800]}
function padOf(sc){const cs=getComputedStyle(sc);return{l:parseFloat(cs.paddingLeft),r:parseFloat(cs.paddingRight),t:parseFloat(cs.paddingTop),b:parseFloat(cs.paddingBottom)}}
/* What is actually in the room, in plan units (bounds() adds a title band and a minimum width). */
function contentBox(){let x0=Infinity,x1=-Infinity;
  S.tables.forEach(x=>{const[w]=dims(x);x0=Math.min(x0,x.x-w/2);x1=Math.max(x1,x.x+w/2)});
  S.venue.forEach(v=>{const[w]=rbox(v.w,v.h,v.rot);x0=Math.min(x0,v.x-w/2);x1=Math.max(x1,v.x+w/2)});
  if(!isFinite(x0))return null;return{x0:x0-30,x1:x1+30}}
function fitScale(kind){const sc=$('#scroller'),P=padOf(sc),[W,H]=planWH(),cw=Math.max(200,sc.clientWidth-P.l-P.r),ch=Math.max(160,sc.clientHeight-P.t-P.b);
  if(kind==='width'){const cb=contentBox();return cw/Math.min(W,cb?cb.x1-cb.x0:W)}
  return Math.min(cw/W,ch/H)}
const ZMIN=.08,ZMAX=4;
function sizePlan(){const svg=$('#plan'),[W,H]=planWH();svg.style.width=Math.round(W*scale)+'px';svg.style.height=Math.round(H*scale)+'px';
  const z=$('#zpct');if(z)z.textContent=Math.round(scale/fitScale('all')*100)+'%'}
/* Scrolls so the occupied part of the room is centred, top first. */
function centerContent(){const sc=$('#scroller'),svg=$('#plan'),cb=contentBox();if(!cb)return;
  const vb=svg.viewBox.baseVal,b=svg.getBoundingClientRect(),r=sc.getBoundingClientRect(),cx=((cb.x0+cb.x1)/2-vb.x)*scale;
  sc.scrollLeft+=b.left+cx-(r.left+r.width/2);sc.scrollTop=0}
function applyZoom(refit){const svg=$('#plan');if(!svg.dataset.w)return;
  if(scale==null){fitMode=isPhone()?'width':'all';scale=fitScale(fitMode);sizePlan();centerContent();return}
  if(refit&&fitMode)scale=fitScale(fitMode);sizePlan()}
/* Zoom keeping the plan point under (cx,cy) — or the view centre — still. */
function zoomTo(ns,cx,cy){const sc=$('#scroller'),svg=$('#plan'),r=sc.getBoundingClientRect();
  ns=Math.min(ZMAX,Math.max(ZMIN,ns));const ox=(cx??r.left+r.width/2)-r.left,oy=(cy??r.top+r.height/2)-r.top;
  const b0=svg.getBoundingClientRect(),fx=(ox+r.left-b0.left)/b0.width,fy=(oy+r.top-b0.top)/b0.height;
  fitMode=null;scale=ns;applyZoom();
  const b=svg.getBoundingClientRect();sc.scrollLeft+=b.left+fx*b.width-(r.left+ox);sc.scrollTop+=b.top+fy*b.height-(r.top+oy)}
function setFit(kind){fitMode=kind;scale=Math.min(ZMAX,fitScale(kind));sizePlan();centerContent()}
/* Keeps the plan point at the centre of the view while the layout around the canvas changes. */
function keepView(fn){const sc=$('#scroller'),svg=$('#plan');if(!svg.dataset.w||guestMode)return fn();
  const r=sc.getBoundingClientRect(),b=svg.getBoundingClientRect(),fx=(r.left+r.width/2-b.left)/b.width,fy=(r.top+r.height/2-b.top)/b.height;
  fn();
  const r2=sc.getBoundingClientRect(),b2=svg.getBoundingClientRect();sc.scrollLeft+=b2.left+fx*b2.width-(r2.left+r2.width/2);sc.scrollTop+=b2.top+fy*b2.height-(r2.top+r2.height/2)}
/* Focused view of one table, for reading names on a phone. */
function focusTable(x){const[w,h]=dims(x),sc=$('#scroller'),svg=$('#plan');
  fitMode=null;scale=Math.min(ZMAX,Math.max(ZMIN,Math.min((sc.clientWidth-24)/(w+60),(sc.clientHeight-24)/(h+60))));applyZoom();
  const vb=svg.viewBox.baseVal,b=svg.getBoundingClientRect(),r=sc.getBoundingClientRect(),px=(x.x-vb.x)*scale,py=(x.y-vb.y)*scale;
  sc.scrollLeft+=b.left+px-(r.left+r.width/2);sc.scrollTop+=b.top+py-(r.top+r.height/2)}
function renderAll(){
  const fk=focusKeyOf(document.activeElement);
  document.documentElement.lang=UL();renderTop();const st=renderDrawer();renderLeft();renderRight();renderPlan();
  if(st.opened){$('#dtitle')?.focus({preventScroll:true});return}
  if(st.closed){const back=opener&&document.querySelector(opener);opener=null;(back||$('#scroller')).focus({preventScroll:true});return}
  if(fk&&document.activeElement===document.body){const el=document.querySelector(fk);el&&el.focus({preventScroll:true})}}

/* ---------------- actions ---------------- */
function curGuest(){const x=T(sel.t);return x&&S.guests[x.seats[sel.i]]}
function placeNames(names,tid){names.forEach(n=>{const id=mkGuest(n);let x=tid&&tid!=='__wait'?T(tid):null,i=-1;
  if(tid==='__wait'){S.waiting.push(id);return}
  if(x)i=x.seats.indexOf(null);
  if(i<0&&!tid)for(const y of S.tables){i=y.seats.indexOf(null);if(i>=0){x=y;break}}
  if(i>=0)x.seats[i]=id;else S.waiting.push(id)})}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function autoSeat(){
  const tables=S.tables.filter(x=>x.shape!=='head');
  const pool=[...S.waiting,...tables.flatMap(x=>x.seats.filter(Boolean))];
  tables.forEach(x=>x.seats=x.seats.map(()=>null));S.waiting=[];
  const parent={};const f=a=>parent[a]===a?a:(parent[a]=f(parent[a]));pool.forEach(id=>parent[id]=id);
  S.rules.filter(r=>r.type==='together'&&parent[r.a]&&parent[r.b]).forEach(r=>parent[f(r.a)]=f(r.b));
  const clusters={};pool.forEach(id=>{(clusters[f(id)]=clusters[f(id)]||[]).push(id)});
  const units={};Object.values(clusters).forEach(c=>{const g=S.guests[c[0]];const key=g.group||(g.side?'side:'+g.side:'zz');(units[key]=units[key]||[]).push(...c)});
  const order=Object.entries(units).sort((a,b)=>b[1].length-a[1].length).map(e=>e[1]);
  const apart=(id,x)=>S.rules.some(r=>r.type==='apart'&&((r.a===id&&x.seats.includes(r.b))||(r.b===id&&x.seats.includes(r.a))));
  const freeN=x=>x.seats.filter(v=>!v).length;
  order.forEach(unit=>{
    let fit=tables.filter(x=>freeN(x)>=unit.length&&!unit.some(id=>apart(id,x))).sort((a,b)=>freeN(a)-freeN(b))[0];
    const place=(id,x)=>{const i=x.seats.indexOf(null);if(i>=0){x.seats[i]=id;return true}return false};
    if(fit){unit.forEach(id=>place(id,fit));return}
    unit.forEach(id=>{const c=tables.filter(x=>freeN(x)>0).sort((a,b)=>(apart(id,a)-apart(id,b))||(freeN(b)-freeN(a)));if(!c[0]||!place(id,c[0]))S.waiting.push(id)});
  });
}
function act(a){
  const x=sel.t&&T(sel.t);
  switch(a){
    case'addtable':commit(()=>{const n=S.tables.length;const nt={id:uid(),name:'Table '+n,shape:'round',deco:'flowers',seats:Array(8).fill(null),x:0,y:0};{const g=geo(nt);[nt.x,nt.y]=freeSpot(g.w,g.h)}S.tables.push(nt);sel={kind:'table',t:nt.id}});toast(t('tableAdded'));break;
    case'arrange':commit(()=>autoArrange());break;
    case'bulk':{const names=$('#bulk').value.split(/\n/).map(s=>s.trim()).filter(Boolean);if(!names.length){toast(t('pasteFirst'));return}
      const tid=$('#bulk-t').value;commit(()=>placeNames(names,tid));toast(t('added',{n:names.length}));break}
    case'randall':commit(()=>Object.values(S.guests).forEach(g=>{if(!['gown','tuxedo'].includes(g.look.outfit))g.look=randLook(g.look.kind)}));toast(t('newLooks'));break;
    case'shuffleall':commit(()=>{const tb=S.tables.filter(y=>y.shape!=='head');const ids=shuffle(tb.flatMap(y=>y.seats.filter(Boolean)));tb.forEach(y=>y.seats=y.seats.map(v=>v?ids.shift():null))});toast(t('shuffled'));break;
    case'autoseat':confirmK='autoseat';renderLeft();break;
    case'autoseat-yes':confirmK=null;commit(autoSeat);toast(t('autoDone'));break;
    case'reset':confirmK='reset';renderLeft();break;
    case'reset-yes':confirmK=null;commit(()=>{S={event:{...S.event},guests:{},waiting:[],rules:[],venue:[],tables:[{id:uid(),name:'Table 1',shape:'rect',deco:'flowers',seats:Array(10).fill(null),x:0,y:0}]};sel={kind:null}});break;
    case'cancel':confirmK=null;renderLeft();renderRight();break;
    case'close':closeDrawer();break;
    case'focustable':{const tb=T(sel.t);if(tb){if(isPhone())closeDrawer();requestAnimationFrame(()=>focusTable(tb))}break}
    case'hintok':try{localStorage.setItem('supra.hint','1')}catch(e){};hintOpen=false;renderTop();$('#help').focus();break;
    case'addguest':{const n=($('#newname').value||'').trim();if(!n){toast(t('typeFirst'));$('#newname').focus();return}commit(()=>{x.seats[sel.i]=mkGuest(n)});break}
    case'addrandom':commit(()=>{x.seats[sel.i]=mkGuest(t('guestWord')+' '+(Object.keys(S.guests).length+1),randLook())});break;
    case'rnd':commit(()=>{const g=curGuest();g.look=randLook(g.look.kind)});break;
    case'kind':commit(()=>{const g=curGuest();g.look=randLook(g.look.kind==='m'?'f':'m')});break;
    case'unseat':commit(()=>{S.waiting.push(x.seats[sel.i]);x.seats[sel.i]=null});toast(t('movedWaiting'));break;
    case'delguest':confirmK='guest';renderRight();break;
    case'delguest-yes':confirmK=null;commit(()=>{const id=x.seats[sel.i];delete S.guests[id];S.rules=S.rules.filter(r=>r.a!==id&&r.b!==id);x.seats[sel.i]=null});break;
    case'addrule':{const b=$('#r-who').value;if(!b){$('#r-who').focus();return}const g=curGuest();commit(()=>S.rules.push({id:uid(),type:$('#r-type').value,a:g.id,b}));break}
    case'seat+':commit(()=>x.seats.push(null));break;
    case'seat-':if(x.seats.length>1)commit(()=>{const i=x.seats.lastIndexOf(null);if(i>=0)x.seats.splice(i,1);else{S.waiting.push(x.seats.pop());toast(t('movedWaiting'))}});break;
    case'fillgroup':{const g=($('#grp').value||'').trim()||'Guest';commit(()=>{let k=Object.values(S.guests).filter(v=>v.group===g).length;x.seats=x.seats.map(v=>v||mkGuest(`${g} ${++k}`,randLook(),{group:g}))});toast(t('filledWith',{g}));break}
    case'shuffle':commit(()=>shuffle(x.seats));break;
    case'restyle':commit(()=>x.seats.forEach(id=>{const g=id&&S.guests[id];if(g&&!['gown','tuxedo'].includes(g.look.outfit))g.look=randLook(g.look.kind)}));break;
    case'dup':commit(()=>{const nt={id:uid(),name:x.name+' 2',shape:x.shape,deco:x.deco,seats:Array(x.seats.length).fill(null),x:x.x+60,y:x.y+geo(x).h};S.tables.splice(S.tables.indexOf(x)+1,0,nt);sel={kind:'table',t:nt.id}});break;
    case'deltable':confirmK='table';renderRight();break;
    case'deltable-yes':confirmK=null;commit(()=>{S.waiting.push(...x.seats.filter(Boolean));S.tables=S.tables.filter(y=>y!==x);sel={kind:null}});break;
    case'delvenue':commit(()=>{S.venue=S.venue.filter(v=>v.id!==sel.v);sel={kind:null}});break;
    case'copylink':{const st=$('#copystate'),u=guestUrl();const done=ok=>{if(st)st.textContent=ok?t('copied'):t('copyFail',{url:u})};
      (navigator.clipboard?navigator.clipboard.writeText(u):Promise.reject()).then(()=>done(true),()=>done(false));break}
    case'setpin':{const v=($('#lk-pin')?.value||'').trim();if(v.length<4||v.length>12){toast(t('lkPinLen'));$('#lk-pin')?.focus();break}setLookup({pin:v});break}
    case'rmpin':setLookup({pin:''});break;
    case'dlqr':dlQR();break;
    case'cards':placeCards();break;
    case'caterer':catererModal();break;
    case'planimg':planImage();break;
    case'planpdf':planPdf();break;
    case'import':importModal();break;
    case'export':exportX();break;
  }
}
document.addEventListener('click',e=>{
  if(guestMode)return guestClick(e);
  const b=e.target.closest('button');if(!b)return;const d=b.dataset;
  if(d.act)return act(d.act);
  if(d.panel){const k=d.panel;if(!drawerOpen)opener='#tab-'+k;panel=(panel===k&&!sel.kind)?null:k;sel={kind:null};confirmK=null;renderAll();return}
  if(d.lang){if(d.lang!==UL()){setLang(d.lang);renderAll()}return}
  if(d.glangset){if(S.event.lang!==d.glangset)commit(()=>S.event.lang=d.glangset);return}
  if(d.pal)return commit(()=>S.event.palette=d.pal);
  if(d.seltable){if(!drawerOpen)opener=focusKeyOf(b);sel={kind:'table',t:d.seltable};confirmK=null;renderAll();return}
  if(d.shape)return commit(()=>T(sel.t).shape=d.shape);
  if(d.deco)return commit(()=>T(sel.t).deco=d.deco);
  if(d.addvenue){const k=d.addvenue;commit(()=>{const B=bounds();const v={id:uid(),type:k,label:'',w:VENUE[k].w,h:VENUE[k].h,x:0,y:0};[v.x,v.y]=freeSpot(v.w,v.h);S.venue.push(v);sel={kind:'venue',v:v.id}});return}
  if(d.rot||d.rotset){const it=sel.kind==='table'?T(sel.t):sel.kind==='venue'?V(sel.v):null;if(it)commit(()=>{it.rot=d.rotset!==undefined?+d.rotset:((((it.rot||0)+ +d.rot)%360)+360)%360});return}
  if(d.vsize){const[k,n]=d.vsize.split(':');commit(()=>{const v=V(sel.v);v[k]=Math.max(40,v[k]+ +n)});return}
  if(d.look)return commit(()=>{const g=curGuest();g.look[d.look]=d.v;if(d.look==='hairColor'&&g.look.beard==='none')g.look.beardColor=d.v});
  if(d.gside!==undefined)return commit(()=>curGuest().side=d.gside);
  if(d.tside!==undefined)return commit(()=>T(sel.t).seats.forEach(id=>{if(id)S.guests[id].side=d.tside}));
  if(d.delrule)return commit(()=>S.rules=S.rules.filter(r=>r.id!==d.delrule));
  if(d.goto){const[tt,i]=d.goto.split(':');sel={kind:'seat',t:tt,i:+i};renderAll();scrollToSeat();return}
  if(d.wait){waitSel=waitSel===d.wait?null:d.wait;renderLeft();if(waitSel)toast(t('tapEmpty'));return}
  if(d.seatwait){const w=d.seatwait;commit(()=>{T(sel.t).seats[sel.i]=w;S.waiting=S.waiting.filter(v=>v!==w)});return}
});
document.addEventListener('input',e=>{
  if(guestMode){if(e.target.id==='gq'||e.target.id==='gpin')guestSearch(false);return}
  const id=e.target.id;
  if(id==='find'){FINDQ=e.target.value;return doFind()}
  const live={'ev-name':v=>S.event.name=v,'g-name':v=>{curGuest().name=v},'g-group':v=>curGuest().group=v,'g-allergies':v=>curGuest().allergies=v,'t-name':v=>T(sel.t).name=v,'v-label':v=>V(sel.v).label=v};
  if(live[id]){if(!e.target.dataset.h){hist.push(JSON.stringify(S));e.target.dataset.h=1}live[id](e.target.value);markDirty();renderPlan()}
});
document.addEventListener('change',e=>{if(guestMode)return;const id=e.target.id;
  if(id==='ev-type')commit(()=>S.event.type=e.target.value);
  if(id==='ev-date')commit(()=>S.event.date=e.target.value);
  if(id==='g-meal')commit(()=>curGuest().meal=e.target.value);
  if(id==='g-kid')commit(()=>curGuest().kid=e.target.checked);
  if(e.target.name==='lk-mode'){setLookup({mode:e.target.value});return}
  if(id==='lk-mates'){setLookup({mates:e.target.checked});return}
  if(id==='gp-on'){const on=e.target.checked;SB.from('events').update({guest_page:on}).eq('id',ROW.id).then(({error})=>{if(error){toast(t('couldntSave'));e.target.checked=!on}else{ROW.guest_page=on;renderLeft()}})}
  if(['t-name','g-name','v-label'].includes(id)){renderLeft();renderRight()}});
/* Arrow keys for tab lists and radio groups (editor and guest page). */
document.addEventListener('keydown',e=>{
  const grp=e.target.closest?.('[role=tablist],[role=radiogroup]');if(!grp||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key))return;
  const tabs=grp.getAttribute('role')==='tablist',items=[...grp.querySelectorAll(tabs?'[role=tab]':'[role=radio]')],i=items.indexOf(e.target);if(i<0)return;
  e.preventDefault();const rtl=getComputedStyle(grp).direction==='rtl',n=items.length;
  let j=e.key==='Home'?0:e.key==='End'?n-1:(i+((e.key==='ArrowRight'||e.key==='ArrowDown')!==rtl?1:-1)+n)%n;
  const next=items[j];items.forEach(b=>b.tabIndex=-1);next.tabIndex=0;next.focus();
  if(!tabs){const k=focusKeyOf(next);next.click();const again=k&&document.querySelector(k);again&&again!==document.activeElement&&again.focus()}
});
document.addEventListener('keydown',e=>{
  if(guestMode)return;
  const typing=/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||'');
  if(e.key==='Escape'&&drawerOpen&&!$('#modalroot').innerHTML){e.preventDefault();closeDrawer();return}
  if(e.key==='Tab'&&drawerOpen&&isPhone()){const f=[...$('#drawer').querySelectorAll('button,[href],input,select,textarea,summary,[tabindex]:not([tabindex="-1"])')].filter(el=>!el.disabled&&(el.checkVisibility?el.checkVisibility():el.offsetParent!==null));
    if(f.length){const a=f[0],z=f[f.length-1];if(e.shiftKey&&(document.activeElement===a||document.activeElement.id==='dtitle'||!$('#drawer').contains(document.activeElement))){e.preventDefault();z.focus()}else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus()}}}
  if(!typing&&!e.ctrlKey&&!e.metaKey&&!e.altKey){
    if(e.key==='+'||e.key==='='){e.preventDefault();zoomTo(scale*1.25);return}
    if(e.key==='-'||e.key==='_'){e.preventDefault();zoomTo(scale/1.25);return}
    if(e.key==='0'){e.preventDefault();setFit('all');return}
    const it=e.target.closest?.('.tbody,.venue');
    if(it&&e.key.startsWith('Arrow')){e.preventDefault();const o=it.dataset.table?T(it.dataset.table):V(it.dataset.v),st=e.shiftKey?50:10;
      hist.push(JSON.stringify(S));o.x+=e.key==='ArrowLeft'?-st:e.key==='ArrowRight'?st:0;o.y+=e.key==='ArrowUp'?-st:e.key==='ArrowDown'?st:0;markDirty();renderPlan();
      document.querySelector(focusKeyOf(it))?.focus();return}
    if(it&&(e.key==='Enter'||e.key===' ')){e.preventDefault();it.dataset.table?selectItem('table',it.dataset.table):selectItem('venue',it.dataset.v);return}
  }
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!/INPUT|TEXTAREA/.test(document.activeElement.tagName)){e.preventDefault();undo()}
  if(e.key==='Enter'&&e.target.id==='newname')act('addguest');
  if((e.key==='Enter'||e.key===' ')&&e.target.classList?.contains('seat')){e.preventDefault();clickSeat(e.target.dataset.t,+e.target.dataset.i)}
});
function clickSeat(tid,i){const x=T(tid);if(!drawerOpen)opener=`.seat[data-t="${tid}"][data-i="${i}"]`;
  if(waitSel&&!x.seats[i]){const w=waitSel;waitSel=null;commit(()=>{x.seats[i]=w;S.waiting=S.waiting.filter(v=>v!==w);sel={kind:'seat',t:tid,i}});return}
  sel={kind:'seat',t:tid,i};confirmK=null;renderAll();
}
function selectItem(kind,id){if(!drawerOpen)opener=kind==='table'?`.tbody[data-table="${id}"]`:`.venue[data-v="${id}"]`;sel=kind==='table'?{kind,t:id}:{kind,v:id};confirmK=null;renderAll()}
function closeDrawer(){sel={kind:null};panel=null;confirmK=null;renderAll()}
function scrollToSeat(){const el=document.querySelector(`.seat[data-t="${sel.t}"][data-i="${sel.i}"]`);el&&el.scrollIntoView({block:'center',inline:'center',behavior:'smooth'})}

/* drag: seats swap, tables & venue move */
let drag=null;
function viewCenter(){const sc=$('#scroller'),r=sc.getBoundingClientRect();const p=svgPt({clientX:r.left+r.width/2,clientY:r.top+r.height/2});return[Math.round(p.x/10)*10,Math.round(p.y/10)*10]}
function freeSpot(w,h){const[cx,cy]=viewCenter(),pad=30,boxes=[];
  S.tables.forEach(x=>{const[bw,bh]=dims(x);boxes.push([x.x-bw/2,x.y-bh/2,x.x+bw/2,x.y+bh/2])});
  S.venue.forEach(v=>{const[bw,bh]=rbox(v.w,v.h,v.rot);boxes.push([v.x-bw/2,v.y-bh/2,v.x+bw/2,v.y+bh/2])});
  const free=(x,y)=>boxes.every(b=>x+w/2+pad<b[0]||x-w/2-pad>b[2]||y+h/2+pad<b[1]||y-h/2-pad>b[3]);
  for(let r=0;r<3000;r+=40){const steps=Math.max(1,Math.round(r/20));for(let i=0;i<steps;i++){const a=i/steps*Math.PI*2,x=Math.round((cx+r*Math.cos(a))/10)*10,y=Math.round((cy+r*Math.sin(a))/10)*10;if(free(x,y))return[x,y]}}
  return[cx,cy]}
function svgPt(e){const svg=$('#plan'),pt=svg.createSVGPoint();pt.x=e.clientX;pt.y=e.clientY;return pt.matrixTransform(svg.getScreenCTM().inverse())}
$('#scroller').addEventListener('pointerdown',e=>{
  if(e.button>0)return;
  const rh=e.target.closest('.rothandle');if(rh){const it=rh.dataset.rk==='table'?T(rh.dataset.rid):V(rh.dataset.rid);hist.push(JSON.stringify(S));drag={kind:'rotate',it,x:e.clientX,y:e.clientY,moved:true};document.body.classList.add('dragging');e.preventDefault();return}
  const s=e.target.closest('.seat');if(s){drag={kind:'seat',t:s.dataset.t,i:+s.dataset.i,x:e.clientX,y:e.clientY,moved:false,el:s};return}
  const tb=e.target.closest('.tbody');if(tb){const x=T(tb.dataset.table),p=svgPt(e);drag={kind:'table',id:x.id,x:e.clientX,y:e.clientY,ox:x.x-p.x,oy:x.y-p.y,moved:false,el:tb.closest('.tgrp')};return}
  const v=e.target.closest('.venue');if(v){const it=V(v.dataset.v),p=svgPt(e);drag={kind:'venue',id:it.id,x:e.clientX,y:e.clientY,ox:it.x-p.x,oy:it.y-p.y,moved:false,el:v};return}
  const sc=$('#scroller');drag={kind:'pan',x:e.clientX,y:e.clientY,sl:sc.scrollLeft,st:sc.scrollTop,moved:false,mouse:e.pointerType==='mouse'};
});
let rotRAF=0;
window.addEventListener('pointermove',e=>{if(!drag)return;
  if(drag.kind==='rotate'){const p=svgPt(e),it=drag.it;let a=Math.atan2(p.x-it.x,-(p.y-it.y))*180/Math.PI;const snap=e.shiftKey?1:15;a=Math.round(a/snap)*snap;a=((a%360)+360)%360;
    if(a!==it.rot){it.rot=a;if(!rotRAF)rotRAF=requestAnimationFrame(()=>{rotRAF=0;renderPlan()})}return}
  if(drag.kind==='pan'){if(!drag.moved&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>5){drag.moved=true;$('#scroller').classList.add('panning')}
    if(drag.moved&&drag.mouse){const sc=$('#scroller');sc.scrollLeft=drag.sl-(e.clientX-drag.x);sc.scrollTop=drag.st-(e.clientY-drag.y)}return}
  if(!drag.moved&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>7){drag.moved=true;if(drag.kind!=='seat')hist.push(JSON.stringify(S));if(drag.kind==='seat')drag.el.style.opacity=.45;document.body.classList.add('dragging')}
  if(!drag.moved)return;
  if(drag.kind==='seat'){document.querySelectorAll('.seat .ring').forEach(r=>r.setAttribute('opacity',0));const o=document.elementFromPoint(e.clientX,e.clientY)?.closest('.seat');if(o&&o!==drag.el)o.querySelector('.ring').setAttribute('opacity',.35);return}
  const p=svgPt(e),nx=Math.round((p.x+drag.ox)/10)*10,ny=Math.round((p.y+drag.oy)/10)*10;
  const it=drag.kind==='table'?T(drag.id):V(drag.id);it.x=nx;it.y=ny;drag.el.setAttribute('transform',`translate(${nx} ${ny})`)});
window.addEventListener('pointercancel',()=>{if(drag&&drag.kind==='pan'){drag=null;$('#scroller').classList.remove('panning')}});
window.addEventListener('pointerup',e=>{if(!drag)return;const d=drag;drag=null;document.body.classList.remove('dragging');
  if(d.kind==='pan'){$('#scroller').classList.remove('panning');if(!d.moved&&(sel.kind||panel))closeDrawer();return}
  if(d.kind==='rotate'){resolveOverlaps();markDirty();renderAll();return}
  if(d.kind==='table'){if(d.moved){markDirty();renderPlan()}else selectItem('table',d.id);return}
  if(d.kind==='venue'){if(d.moved){markDirty();renderPlan()}else selectItem('venue',d.id);return}
  if(!d.moved)return clickSeat(d.t,d.i);
  d.el.style.opacity=1;const o=document.elementFromPoint(e.clientX,e.clientY)?.closest('.seat');
  if(!o||(o.dataset.t===d.t&&+o.dataset.i===d.i))return renderPlan();
  commit(()=>{const A=T(d.t),Bt=T(o.dataset.t),bi=+o.dataset.i,tmp=A.seats[d.i];A.seats[d.i]=Bt.seats[bi];Bt.seats[bi]=tmp;sel={kind:'seat',t:o.dataset.t,i:bi}});toast(t('swapped'))});

$('#zin').onclick=()=>zoomTo(scale*1.25);
$('#zout').onclick=()=>zoomTo(scale/1.25);
$('#zall').onclick=()=>setFit('all');
$('#zwidth').onclick=()=>setFit('width');
$('#help').onclick=()=>{hintOpen=!hintOpen;renderTop();if(hintOpen)$('#hint button')?.focus()};
/* The window or full-screen changed size: a pressed Fit button refits, any other zoom stays put. */
function onViewport(){if(guestMode)return;if(fitMode){applyZoom(true);centerContent()}else keepView(()=>{})}
window.addEventListener('resize',onViewport);
/* Ctrl/⌘ + wheel and trackpad pinch (Chrome, Edge, Firefox report it as ctrl+wheel). */
$('#scroller').addEventListener('wheel',e=>{if(!(e.ctrlKey||e.metaKey))return;e.preventDefault();zoomTo(scale*Math.exp(-e.deltaY*.0025),e.clientX,e.clientY)},{passive:false});
/* Safari trackpad pinch. */
let gs0=null;$('#scroller').addEventListener('gesturestart',e=>{e.preventDefault();gs0=scale});
$('#scroller').addEventListener('gesturechange',e=>{e.preventDefault();if(gs0)zoomTo(gs0*e.scale,e.clientX,e.clientY)});
$('#scroller').addEventListener('gestureend',()=>gs0=null);
/* Two-finger pinch on touch screens; one finger keeps native scrolling. */
let pinch=null;const tdist=t=>Math.hypot(t[0].clientX-t[1].clientX,t[0].clientY-t[1].clientY),tmid=t=>[(t[0].clientX+t[1].clientX)/2,(t[0].clientY+t[1].clientY)/2];
$('#scroller').addEventListener('touchstart',e=>{if(e.touches.length===2){pinch={d:tdist(e.touches),s:scale};drag=null;document.body.classList.remove('dragging')}},{passive:true});
$('#scroller').addEventListener('touchmove',e=>{if(pinch&&e.touches.length===2){e.preventDefault();const[mx,my]=tmid(e.touches);zoomTo(pinch.s*tdist(e.touches)/pinch.d,mx,my)}},{passive:false});
$('#scroller').addEventListener('touchend',e=>{if(e.touches.length<2)pinch=null});
$('#theme').onclick=()=>{const n=curTheme()==='dark'?'light':'dark';document.documentElement.dataset.theme=n;try{localStorage.setItem('supra.theme',n)}catch(e){}renderTop()};
$('#full').onclick=()=>{const w=$('#work');
  if(document.fullscreenElement){document.exitFullscreen?.();return}
  if(document.body.classList.contains('focus')){document.body.classList.remove('focus');renderTop();onViewport();return}
  if(w.requestFullscreen)w.requestFullscreen().catch(()=>{document.body.classList.add('focus');renderTop();onViewport()});else{document.body.classList.add('focus');renderTop();onViewport()}};
document.addEventListener('fullscreenchange',()=>{renderTop();requestAnimationFrame(onViewport)});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('focus')&&!drawerOpen){document.body.classList.remove('focus');renderTop();onViewport()}});
document.addEventListener('toggle',e=>{const d=e.target;if(d.matches&&d.matches('details[data-sec]')){d.open?OPEN.add(d.dataset.sec):OPEN.delete(d.dataset.sec)}},true);
$('#undo').onclick=undo;
$('#backdrop').onclick=()=>closeDrawer();
$('#save').onclick=savePlan;

/* ---------------- saving ---------------- */
let savingNow=false,saveAgain=false;
async function savePlan(){
  clearTimeout(saveT);if(!SB||!ROW||readOnly)return;
  if(savingNow){saveAgain=true;return}
  savingNow=true;saveState='saving';renderTop();
  const snapshot=JSON.stringify(S);
  try{const{data,error}=await SB.from('events').update({data:S,name:S.event.name||'',event_date:S.event.date||null,type:S.event.type}).eq('id',ROW.id).select('updated_at').single();
    if(error)throw error;ROW.updated_at=data.updated_at;
    if(JSON.stringify(S)===snapshot){dirty=false;clearDraft()}saveState='idle'}
  catch(err){saveState='error';console.error(err);toast(t('couldntSave'))}
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
/* Lists for the plan PDF: everyone A–Z (for the entrance), then each table (for the venue staff). */
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
  // A–Z: two columns, name left, table and seat right
  const colW=(W-2*M-60)/2,lh=58;page(t('pdfAZ'));
  rows.forEach(r=>{if(y>H-M){if(col===0){col=1;x=M+colW+60;y=M+200}else page(t('pdfAZ'))}
    const right=`${r.table} · ${t('seatN',{number:r.seat})}`;c.font=`28px ${F}`;const rw=c.measureText(right).width;
    c.fillStyle=p.accent;c.fillText(right,x+colW-rw,y);c.fillStyle=p.ink;c.font=`32px ${F}`;c.fillText(fit(r.name,colW-rw-30),x,y);
    c.strokeStyle='#E6E1DA';c.lineWidth=1;c.beginPath();c.moveTo(x,y+18);c.lineTo(x+colW,y+18);c.stroke();y+=lh});
  // by table: each table as a block; a block never splits across columns
  page(t('pdfByTable'));
  S.tables.forEach(tb=>{const names=tb.seats.map((id,i)=>id&&S.guests[id]?`${i+1}. ${S.guests[id].name}`:null).filter(Boolean);if(!names.length)return;
    const need=70+names.length*50+40;if(y+need>H-M){if(col===0){col=1;x=M+colW+60;y=M+200}else page(t('pdfByTable'))}
    c.fillStyle=p.accent;c.font=`40px ${FD}`;c.fillText(fit(tName(tb),colW),x,y);
    c.font=`26px ${F}`;c.fillStyle='#8A8580';c.fillText(t('statSeats',{occupied:names.length,capacity:tb.seats.length}),x,y+40);y+=90;
    c.fillStyle=p.ink;c.font=`30px ${F}`;names.forEach(n=>{c.fillText(fit(n,colW),x,y);y+=50});y+=40});
  // page numbers
  pages.forEach((cv,i)=>{const g=cv.getContext('2d');g.fillStyle='#8A8580';g.font=`24px ${F}`;const s=t('pageN',{n:i+1,of:pages.length});g.fillText(s,W-M-g.measureText(s).width,H-60)});
  return pages.map(cv=>({url:cv.toDataURL('image/png'),w:W,h:H}));
}
async function planPdf(){
  const btn=document.querySelector('[data-act=planpdf]');if(btn){btn.disabled=true;btn.setAttribute('aria-busy','true')}
  toast(t('pdfMaking'));
  try{await document.fonts?.ready;const keep=sel;sel={kind:null};const{B,inner}=planSVG();sel=keep;
    const r=await svgToPng(allDefs()+inner,`${B.x} ${B.y} ${B.w} ${B.h}`,B.w,B.h,2);
    await savePdf([{url:r.url,w:B.w,h:B.h},...listPages()],fname('-'+t('fileSeating')+'.pdf'),(S.event.name||'Supra')+' · '+t('planLabel'))}
  catch(e){console.error(e);toast(t('pdfFail'))}
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
    try{await savePdf(out.map(r=>({url:r.url,w:794,h:1123,fill:true})),fname('-'+t('fileCards')+'.pdf'),t('cardsTitle'))}catch(e){console.error(e);toast(t('pdfFail'))}
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

/* ---------------- guest "find my seat" view ----------------
   The public page never receives the guest list. It gets a sanitized layout (public_plan) and asks the server
   for one name at a time (find_seat), which returns only name, drawing, table and seat. */
let GROOM=false,GL={mode:'prefix',pin:false},GQ='',GPIN='',gseq=0,gT=null,GS={status:'idle',matches:[],chosen:-1};
const gnorm=s=>String(s||'').normalize('NFC').toLowerCase().replace(/\s+/g,' ').trim();
/* Dates: "31 ოქტომბერი, 2026" / "31 October 2026". Georgian is spelled out here because some browsers ship without Georgian date data. */
const KA_MONTHS=['იანვარი','თებერვალი','მარტი','აპრილი','მაისი','ივნისი','ივლისი','აგვისტო','სექტემბერი','ოქტომბერი','ნოემბერი','დეკემბერი'];
function fmtDate(d){if(!d)return'';const[y,m,day]=d.split('-').map(Number);if(!y||!m||!day)return'';
  return UL()==='ka'?`${day} ${KA_MONTHS[m-1]}, ${y}`:new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'long',year:'numeric'}).format(new Date(d+'T12:00'))}
function gDate(){return fmtDate(S.event.date)}
function guestMeta(){
  document.documentElement.lang=UL();
  document.title=[t('fgTitle'),S.event.name,'Supra'].filter(Boolean).join(' · ');
  let m=document.querySelector('meta[name=description]');if(!m){m=document.createElement('meta');m.name='description';document.head.appendChild(m)}
  m.content=t('fgMeta',{event:S.event.name||'Supra'});
}
function guestRender(){
  document.body.classList.add('guestmode');guestMeta();
  const date=gDate(),hint=GL.mode==='exact'?t('fgHintExact'):t('fgHintPrefix');
  $('#guest').innerHTML=`<div class="gwrap">
    <div class="glang" role="radiogroup" aria-label="${esc(t('language'))}">${[['en','English'],['ka','ქართული']].map(([k,l])=>`<button type="button" role="radio" data-glang="${k}" aria-checked="${UL()===k}" tabindex="${UL()===k?0:-1}" lang="${k}">${l}</button>`).join('')}</div>
    ${date?`<p class="gdate"><time datetime="${esc(S.event.date)}">${esc(date)}</time></p>`:''}<h1>${esc(S.event.name||'Supra')}</h1>
    <form id="gform" class="gform" role="search" autocomplete="off" novalidate>
      <h2 id="gtitle">${t('fgTitle')}</h2>
      ${GL.pin?`<label class="gfield"><span>${t('fgPin')}</span><input id="gpin" class="ginput" type="text" inputmode="text" autocomplete="one-time-code" maxlength="12" value="${esc(GPIN)}" aria-describedby="gpinhint"><small id="gpinhint">${t('fgPinNeed')}</small></label>`:''}
      <label class="gfield"><span>${t('fgLabel')}</span><input id="gq" class="ginput" type="search" placeholder="${esc(t('fgPh'))}" value="${esc(GQ)}" aria-describedby="ghint" spellcheck="false" autocapitalize="words"></label>
      <small id="ghint" class="ghint">${hint}</small>
      <button type="submit" class="btn primary gfind">${t('fgFind')}</button>
    </form>
    <div id="gres" class="gres" aria-live="polite"></div><div id="gmap" class="gmap"></div>
    ${MODE==='edit'?`<button type="button" class="linkbtn" data-gback>${t('fgBack')}</button>`:''}
    <footer class="gpowered"><span>${esc(t('poweredBy'))}</span>${SupraLogo({kind:'full',width:100,alt:UL()==='ka'?'':'Supra',cls:'gplogo'})}</footer></div>`;
  guestShow();
}
function guestStatusMsg(st){return{short:t('fgShort'),many:t('fgMany'),rate_limited:t('fgRate'),
  pin:GPIN?t('fgPinBad'):t('fgPinNeed'),not_found:t('fgUnavailable'),error:t('fgErr'),none:t('fgNone'),searching:t('fgSearching')}[st]||''}
function guestShow(){
  const res=$('#gres'),map=$('#gmap');if(!res)return;
  const st=GS.status,ms=GS.matches;
  map.innerHTML='';
  if(st==='idle'){res.innerHTML='';return}
  if(st!=='ok'){res.innerHTML=`<p class="gnone ${st==='searching'?'gwait':''}" ${['rate_limited','error','pin'].includes(st)?'role="alert"':''}>${esc(guestStatusMsg(st))}</p>`;return}
  if(!ms.length){res.innerHTML=`<div class="gempty"><p class="gnone">${esc(t('fgNone'))}</p></div>`;return}
  if(ms.length>1&&GS.chosen<0){
    res.innerHTML=`<p class="gnone">${esc(t('fgPick'))}</p><ul class="ghits">${ms.map((m,i)=>`<li><button type="button" class="ghit" data-ghit="${i}"><span class="gname">${esc(m.name)}</span><span class="gtable">${esc(gTableName(m))} · ${esc(t('seatN',{number:m.seat}))}</span></button></li>`).join('')}</ul>`;return}
  const m=ms[Math.max(0,GS.chosen)],mates=Array.isArray(m.mates)?m.mates.filter(Boolean):[];
  res.innerHTML=`<div class="gcard" tabindex="-1" id="gcard"><span class="lbl">${t('fgTable')}</span><div class="gbig">${esc(gTableName(m))}</div>
    <div class="gname">${esc(m.name)} · <span class="gseat">${esc(t('seatN',{number:m.seat}))}</span></div>
    ${mates.length?`<h3 class="lbl">${t('fgWith')}</h3><p class="gwith">${mates.map(esc).join(' · ')}</p>`:''}
    <div class="row gacts">${ms.length>1?`<button type="button" class="linkbtn" data-gall>${t('fgNotYou')}</button>`:''}<button type="button" class="linkbtn" data-gagain>${t('fgAgain')}</button></div></div>`;
  gMap(m);
}
function gTableName(m){const x=S.tables[m.table];return x?tName(x):(m.tableName||'')}
function gMap(m){
  const x=S.tables[m.table];if(!x)return;
  const keepSeat=x.seats[m.seat-1],keepSel=sel;
  S.guests.__hit={id:'__hit',name:m.name,look:m.look||randLook(guessKind(m.name)),kid:!!m.kid,side:'',group:'',meal:'',allergies:''};
  x.seats[m.seat-1]='__hit';sel={kind:null};
  const{B,inner}=planSVG({guest:true,dim:x.id,hi:'__hit'});
  x.seats[m.seat-1]=keepSeat;delete S.guests.__hit;sel=keepSel;
  const alt=t('fgMapAlt',{table:tName(x),seat:m.seat});
  // Start close on the guest's table so names stay readable on phones; the whole room is one tap away.
  const[w,h]=dims(x),pad=70,vb=GROOM?`${B.x} ${B.y} ${B.w} ${B.h}`:`${x.x-w/2-pad} ${x.y-h/2-pad} ${w+2*pad} ${h+2*pad}`;
  $('#gmap').innerHTML=`<svg viewBox="${vb}" role="img" aria-label="${esc(alt)}"><title>${esc(alt)}</title>${inner}</svg>
    <button type="button" class="linkbtn" data-groom aria-pressed="${GROOM}">${GROOM?t('fgMyTable'):t('fgRoom')}</button>`;
}
/* Owner's preview (#find inside the editor) uses the same rules locally, without the PIN. */
function findLocal(q){
  const qn=gnorm(q);if(qn.replace(/ /g,'').length<3)return{status:'short',matches:[]};
  const sw=qn.replace(/^(\S+) (.+)$/,'$2 $1'),rows=[];
  S.tables.forEach((x,ti)=>x.seats.forEach((id,si)=>{const g=id&&S.guests[id];if(g&&!g.anon)rows.push({g,ti,si,nn:gnorm(g.name)})}));
  const hit=r=>GL.mode==='exact'?(r.nn===qn||r.nn===sw):(r.nn.startsWith(qn)||(' '+r.nn).includes(' '+qn));
  const ms=rows.filter(hit);if(ms.length>5)return{status:'many',matches:[]};
  return{status:'ok',matches:ms.map(r=>({name:r.g.name,look:r.g.look,kid:r.g.kid,table:r.ti,tableName:S.tables[r.ti].name,seat:r.si+1,
    mates:ROW?.show_tablemates?rows.filter(o=>o.ti===r.ti&&o.si!==r.si).map(o=>o.g.name):null}))}}
async function guestSearch(now){
  GQ=$('#gq')?.value||'';GPIN=$('#gpin')?.value||'';clearTimeout(gT);
  const qn=gnorm(GQ);
  if(!qn){GS={status:'idle',matches:[],chosen:-1};guestShow();return}
  if(qn.replace(/ /g,'').length<3){GS={status:now?'short':'idle',matches:[],chosen:-1};guestShow();return}
  if(!now){gT=setTimeout(()=>guestSearch(true),450);return}
  const my=++gseq;
  if(MODE!=='guest'){const r=findLocal(GQ);GS={status:r.status,matches:r.matches,chosen:r.matches.length===1?0:-1};guestShow();return}
  if(GS.status!=='ok'){GS={status:'searching',matches:[],chosen:-1};guestShow()}
  let r;try{const{data,error}=await SB.rpc('find_seat',{p_slug:SLUG,p_query:GQ,p_pin:GL.pin?GPIN:null});if(error)throw error;r=data||{status:'error',matches:[]}}
  catch(e){console.error(e);r={status:'error',matches:[]}}
  if(my!==gseq)return; // a newer search is on its way
  GS={status:r.status||'error',matches:r.matches||[],chosen:(r.matches||[]).length===1?0:-1};guestShow();
  if(r.status==='pin')$('#gpin')?.focus();
}
function guestClick(e){const b=e.target.closest('button');if(!b)return;
  if(b.dataset.ghit!==undefined){GS.chosen=+b.dataset.ghit;guestShow();$('#gcard')?.focus();return}
  if(b.dataset.groom!==undefined){GROOM=!GROOM;guestShow();$('[data-groom]')?.focus();return}
  if(b.dataset.gagain!==undefined){GQ='';GS={status:'idle',matches:[],chosen:-1};GROOM=false;const q=$('#gq');q.value='';guestShow();q.focus();return}
  if(b.dataset.gall!==undefined){GS.chosen=-1;guestShow();$('.ghit')?.focus();return}
  if(b.dataset.glang){const a=document.activeElement?.id;setLang(b.dataset.glang);guestRender();(a?document.getElementById(a):$(`[data-glang="${b.dataset.glang}"]`))?.focus();return}
  if(b.dataset.gback!==undefined){history.replaceState(null,'',location.pathname+location.search);route()}}
document.addEventListener('submit',e=>{if(e.target.id==='gform'){e.preventDefault();guestSearch(true)}});
function route(){$('#loading').hidden=true;
  guestMode=MODE==='guest'||location.hash==='#find';
  $('#app').hidden=guestMode;$('#guest').hidden=!guestMode;
  if(guestMode){if(MODE==='edit')GL={mode:ROW?.lookup_mode||'prefix',pin:false};guestRender();if(MODE==='guest'||!GQ)$('#gq')?.focus({preventScroll:true})}
  else{document.body.classList.remove('guestmode');renderAll()}
}
window.addEventListener('hashchange',route);

/* ---------------- boot ---------------- */
function measure(){const d=$('#gdefs');if(d)d.innerHTML=imageDefs()}
function fatal(msg){$('#loading').hidden=true;document.title='Supra';document.body.classList.add('guestmode');$('#app').hidden=true;$('#guest').hidden=false;$('#guest').innerHTML=`<div class="gwrap"><h1>Supra</h1><p class="gnone">${esc(msg)}</p><a class="linkbtn" href="/">${t('goHome')}</a></div>`}
function emptyPlan(row){return{event:{name:row.name||'',type:row.type||'wedding',date:row.event_date||'',palette:'blush',lang:(navigator.language||'').startsWith('ka')?'ka':'en'},guests:{},waiting:[],rules:[],
  venue:[{id:uid(),type:'dance',label:'',w:300,h:180}],tables:[{id:uid(),name:'Head table',shape:'head',deco:'flowers',seats:[null,null]},{id:uid(),name:'Table 1',shape:'rect',deco:'mixed',seats:Array(10).fill(null)},{id:uid(),name:'Table 2',shape:'round',deco:'flowers',seats:Array(8).fill(null)}]}}
/* Turns the sanitized public layout into a drawable plan. Taken seats get a decorative stand-in, never a real guest. */
function fromPublic(d){
  const o={event:Object.assign({},d.event||{}),guests:{},waiting:[],rules:[],
    venue:(d.venue||[]).map((v,i)=>Object.assign({id:'pv'+i},v)),tables:[]};
  let seed=7;const rnd=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646};
  o.tables=(d.tables||[]).map((x,ti)=>({id:'pt'+ti,name:x.name||'',shape:x.shape||'rect',deco:x.deco||'none',x:x.x,y:x.y,rot:x.rot||0,
    seats:(x.seats||[]).map((on,si)=>{if(!on)return null;const id='po'+ti+'_'+si;o.guests[id]={id,name:'',anon:true,look:randLook(null,rnd),kid:false};return id})}));
  GL={mode:d.lookup?.mode==='exact'?'exact':'prefix',pin:!!d.lookup?.pin};
  return normalize(o);
}
async function boot(){
  measure();{const l=UL();document.documentElement.lang=l;$('#loadingtxt').textContent=(L10N[l]||L10N.en).loadingPlan||'Loading…'}
  S={event:{lang:(navigator.language||'').startsWith('ka')?'ka':'en'},tables:[],guests:{}};
  const path=location.pathname,qs=new URLSearchParams(location.search);
  const gm=path.match(/^\/e\/([\w-]+)/),em=path.match(/^\/edit\/([\w-]+)/);
  const slug=gm?.[1]||qs.get('e'),id=em?.[1]||qs.get('id');
  if(!CFG.supabaseUrl||CFG.supabaseUrl.startsWith('YOUR_')){fatal('Supra is not connected to its database yet. Fill in config.js.');return}
  SB=window.supabase.createClient(CFG.supabaseUrl,CFG.supabaseAnonKey);
  if(slug){MODE='guest';
    SLUG=slug;
    const{data,error}=await SB.rpc('public_plan',{p_slug:slug});
    if(error||!data||!data.tables){fatal(t('fgUnavailable'));return}
    S=fromPublic(data);readOnly=true;
  }else{
    const{data:{session}}=await SB.auth.getSession();
    if(!session){location.replace('/?next='+encodeURIComponent(path+location.search));return}
    if(!id){location.replace('/');return}
    const{data,error}=await SB.from('events').select('*').eq('id',id).maybeSingle();
    if(error||!data){fatal(t('notFound'));return}
    ROW=data;DRAFT='supra.draft.'+ROW.id;
    const fromRow=data.data&&data.data.tables?normalize(data.data):normalize(emptyPlan(data));
    let draft=null;try{draft=JSON.parse(localStorage.getItem(DRAFT)||'null')}catch(e){}
    if(draft&&draft.data&&draft.base===ROW.updated_at){S=normalize(draft.data);dirty=true}else S=fromRow;
    if(!S.event.name)S.event.name=ROW.name;
  }
  hintOpen=!hintSeen();
  if(S.tables.some(x=>x.x===undefined))autoArrange();
  resolveOverlaps();
  route();
  document.fonts?.ready.then(()=>{if(!guestMode)renderPlan()});
  if(MODE==='edit'&&(dirty||!(ROW.data&&ROW.data.tables))){dirty=true;savePlan()}
  window.__supraState=()=>S;
}
boot();
})();
