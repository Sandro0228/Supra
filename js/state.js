import { PALETTES, appState, guessKind, randLook, rng, smartLook, t, uid } from './core.js';
import { autoArrange, resolveOverlaps } from './layout.js';
import { renderTop } from './panels.js';
import { renderAll } from './actions.js';
import { savePlan } from './files.js';
import { overAfter, paywall } from './access.js';
/* The plan in memory (S), selection, undo history and drafts. Part of the planner (app.html); see js/README.md. */
/* ---------------- state ---------------- */

const CFG = window.SUPRA_CONFIG || {};

let PUB = null,
  hist = [],
  ART = undefined,
  DL = undefined;
function mkGuest(name, look, extra) {
  const id = uid();
  appState.S.guests[id] = Object.assign(
    { id, name, group: '', side: '', kid: false, meal: '', allergies: '', look: look || smartLook(name, extra?.group) },
    extra || {}
  );
  return id;
}
function sample() {
  appState.S = {
    event: { name: 'Sandro & Tamta', type: 'wedding', date: '2026-10-31', palette: 'blush', lang: 'en', shareLink: '' },
    guests: {},
    waiting: [],
    rules: [],
    venue: [],
    tables: []
  };
  const mk = (n, o, ex) => mkGuest(n, Object.assign(randLook(guessKind(n), rng(n)), o || {}), ex);
  const head = [
    mk(
      'გივი გურესაშვილი',
      { hair: 'curly', beard: 'full', outfit: 'suit', outfitColor: '#3D7EA6', glasses: 'none' },
      { side: 'groom' }
    ),
    mk(
      'სანდრო მაისურაძე',
      {
        hair: 'sidepart',
        hairColor: '#1E1916',
        beard: 'short',
        beardColor: '#1E1916',
        outfit: 'tuxedo',
        glasses: 'none'
      },
      { side: 'groom' }
    ),
    mk('თამთა თუნგია', { hair: 'bun', hairColor: '#9C6430', outfit: 'gown', glasses: 'none' }, { side: 'bride' }),
    mk(
      'მარიამ ბერძული',
      { hair: 'curly', hairColor: '#1E1916', outfit: 'dress', outfitColor: '#E2A9BA', glasses: 'none' },
      { side: 'bride' }
    )
  ];
  const t1 =
    'ნოე ჯანელიძე|მარიამ სურმანიძე|ლევან გასვიანი|ქეთი ხაჭაპურიძე|მარიამ გასვიანი|რამაზ აფხაძე|მექი უგულავა|გიორგი ჭეიშვილი|შალვა ამურველაშვილი|ჯემალ თუთბერიძე|თიკო თევზაძე|გიორგი ქაშიბაძე|ეკა სულაშვილი|ხატია მათურელი|დავით ჯიქურაშვილი|მარიამ ლოლუა'
      .split('|')
      .map(n => mk(n));
  const t2 =
    'ირაკლი შალამბერიძე|შალვა ომანაძე|თიკო ომანაძე|დიმიტრი ილურიძე|ნანა კენჭიაშვილი|ალექს კაპატაძე|საბა ლურსმანაშვილი|გოგა ძაძუა|ირაკლი ჟორჟოლიანი|სალომე გაბელია'
      .split('|')
      .map(n => mk(n));
  appState.S.tables = [
    { id: uid(), name: 'Head table', shape: 'head', deco: 'flowers', seats: head },
    { id: uid(), name: 'Table 1', shape: 'rect', deco: 'mixed', seats: t1 },
    { id: uid(), name: 'Table 2', shape: 'rect', deco: 'greenery', seats: t2 }
  ];
  autoArrange();
  const ht = appState.S.tables[0];
  appState.S.venue.push({ id: uid(), type: 'dance', label: '', x: ht.x, y: ht.y + 250, w: 300, h: 180 });
  appState.S.tables.slice(1).forEach(x => (x.y += 260));
  appState.S.venue.push({ id: uid(), type: 'cake', label: '', x: ht.x + 390, y: ht.y, w: 110, h: 110 });
  return appState.S;
}
function normalize(o) {
  o.waiting = o.waiting || [];
  o.rules = o.rules || [];
  o.venue = o.venue || [];
  o.event = Object.assign({ lang: 'en', shareLink: '', palette: 'blush', type: 'wedding' }, o.event || {});
  Object.values(o.guests || {}).forEach(g => {
    g.side = g.side || '';
    g.meal = g.meal || '';
    g.allergies = g.allergies || '';
    g.kid = !!g.kid;
    g.group = g.group || '';
  });
  return o;
}
function saveDraft() {
  try {
    localStorage.setItem(
      appState.DRAFT,
      JSON.stringify({ base: appState.ROW?.version ?? appState.ROW?.updated_at ?? null, data: appState.S })
    );
  } catch (e) {}
}
function clearDraft() {
  try {
    localStorage.removeItem(appState.DRAFT);
  } catch (e) {}
}
function markDirty() {
  if (appState.MODE !== 'edit') return;
  appState.dirty = true;
  if (appState.saveState !== 'saving') appState.saveState = 'idle';
  saveDraft();
  renderTop();
  clearTimeout(appState.saveT);
  appState.saveT = setTimeout(savePlan, 1500);
}
/* One undoable change. Returns false when the step would take a free plan past its guest limit (js/access.js):
   the step is undone and the "get the pass" panel opens. opts.allowOver: never refuse (RSVP answers from guests). */
function commit(fn, opts) {
  const before = Object.keys(appState.S.guests).length;
  hist.push(JSON.stringify(appState.S));
  if (hist.length > 80) hist.shift();
  fn();
  if (!(opts && opts.allowOver) && overAfter(before)) {
    appState.S = JSON.parse(hist.pop());
    renderAll();
    paywall('limit');
    return false;
  }
  resolveOverlaps();
  markDirty();
  renderAll();
  return true;
}
function undo() {
  if (!hist.length) return;
  appState.S = JSON.parse(hist.pop());
  markDirty();
  appState.sel = { kind: null };
  renderAll();
  toast(t('undone'));
}
function toast(m) {
  const d = document.createElement('div');
  d.className = 'toast';
  d.setAttribute('role', 'status');
  d.textContent = m;
  (document.fullscreenElement || document.body).appendChild(d);
  setTimeout(() => d.remove(), 2200);
}
const P = () => PALETTES[appState.S.event.palette] || PALETTES.blush;
const T = id => appState.S.tables.find(x => x.id === id);
const V = id => appState.S.venue.find(x => x.id === id);
function where(gid) {
  for (const x of appState.S.tables) {
    const i = x.seats.indexOf(gid);
    if (i >= 0) return { t: x, i };
  }
  return null;
}
const headName = () => t(appState.S.event.type === 'wedding' || !appState.S.event.type ? 'headTable' : 'headTableMain');
const tName = x =>
  x.shape === 'head' && x.name === 'Head table'
    ? headName()
    : x.name.replace(/^Table (\d+)$/, (m, n) => t('table') + ' ' + n);

export { CFG, P, T, V, clearDraft, commit, headName, hist, markDirty, mkGuest, normalize, tName, toast, undo, where };
