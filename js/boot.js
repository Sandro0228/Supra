import {
  $,
  appState,
  esc,
  imageDefs,
  L10N,
  loadImages,
  lookImages,
  randLook,
  smartLook,
  t,
  uid,
  UL,
  setDocLang
} from './core.js';
import { CFG, normalize } from './state.js';
import { autoArrange, resolveOverlaps } from './layout.js';
import { hintSeen, logSafe, portraitLook, shareInfo } from './panels.js';
import { renderPlan } from './actions.js';
import { placeCards, savePlan } from './files.js';
import { route } from './guest.js';
import { rsvpDraftFrom } from './rsvp.js';
import { invRefresh } from './invites.js';
import { showConflict } from './conflict.js';
import { loadAccess } from './access.js';
import { storedView } from './listview.js';
/* Startup: decides the page (planner, guest page or RSVP) and loads its data. Part of the planner (app.html); see js/README.md. */
/* ---------------- boot ---------------- */
function measure() {
  const d = $('#gdefs');
  if (d) d.innerHTML = imageDefs();
}
function fatal(msg) {
  $('#loading').hidden = true;
  document.title = 'Supra';
  document.body.classList.add('guestmode');
  $('#app').hidden = true;
  $('#guest').hidden = false;
  $('#guest').innerHTML =
    `<div class="gwrap"><h1>Supra</h1><p class="gnone">${esc(msg)}</p><a class="linkbtn" href="/">${t('goHome')}</a></div>`;
}
function emptyPlan(row) {
  return {
    event: {
      name: row.name || '',
      type: row.type || 'wedding',
      date: row.event_date || '',
      palette: 'blush',
      lang: (navigator.language || '').startsWith('ka') ? 'ka' : 'en'
    },
    guests: {},
    waiting: [],
    rules: [],
    venue: [{ id: uid(), type: 'dance', label: '', w: 300, h: 180 }],
    tables: [
      { id: uid(), name: 'Head table', shape: 'head', deco: 'flowers', seats: [null, null] },
      { id: uid(), name: 'Table 1', shape: 'rect', deco: 'mixed', seats: Array(10).fill(null) },
      { id: uid(), name: 'Table 2', shape: 'round', deco: 'flowers', seats: Array(8).fill(null) }
    ]
  };
}
/* Turns the sanitized public layout into a drawable plan. Taken seats show the guest's drawing, never their name. */
function fromPublic(d) {
  const o = {
    event: Object.assign({}, d.event || {}),
    guests: {},
    waiting: [],
    rules: [],
    venue: (d.venue || []).map((v, i) => Object.assign({ id: 'pv' + i }, v)),
    tables: []
  };
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const table = d.lookup?.seatMode === 'table';
  o.tables = (d.tables || []).map((x, ti) => {
    // "guests choose their seat": the server sends the table's drawings in name order, not seat order;
    // they fill the taken chairs one after another, so the picture looks seated without telling anyone's seat
    const people = table && Array.isArray(x.people) ? x.people.filter(q => q && q.look && q.look.kind) : [];
    let k = 0;
    return {
      id: 'pt' + ti,
      name: x.name || '',
      shape: x.shape || 'rect',
      deco: x.deco || 'none',
      x: x.x,
      y: x.y,
      rot: x.rot || 0,
      seats: (x.seats || []).map((on, si) => {
        if (!on) return null;
        const id = 'po' + ti + '_' + si;
        if (table) {
          const q = people[k++];
          o.guests[id] = q
            ? { id, name: '', anon: true, look: Object.assign(randLook(q.look.kind, rnd), q.look), kid: !!q.kid }
            : { id, name: '', anon: true, ghost: true, look: randLook('m', rnd), kid: false };
          return id;
        }
        // the organiser's drawing for this seat (no name); a plain stand-in only if the server sends just "taken"
        const real = on && typeof on === 'object' && on.look && on.look.kind;
        o.guests[id] = {
          id,
          name: '',
          anon: true,
          look: real ? Object.assign(randLook(on.look.kind, rnd), on.look) : randLook(null, rnd),
          kid: real ? !!on.kid : false
        };
        return id;
      })
    };
  });
  appState.GL = { mode: d.lookup?.mode === 'exact' ? 'exact' : 'prefix', pin: !!d.lookup?.pin };
  o.event.seatMode = d.lookup?.seatMode === 'table' ? 'table' : 'seat';
  return normalize(o);
}
async function boot() {
  measure();
  {
    const l = UL();
    setDocLang(l);
    $('#loadingtxt').textContent =
      (L10N[l] || L10N.en)[location.pathname.startsWith('/r/') ? 'rsvpLoading' : 'loadingPlan'] || 'Loading…';
  }
  appState.S = { event: { lang: (navigator.language || '').startsWith('ka') ? 'ka' : 'en' }, tables: [], guests: {} };
  const path = location.pathname,
    qs = new URLSearchParams(location.search);
  const gm = path.match(/^\/e\/([\w-]+)/),
    em = path.match(/^\/edit\/([\w-]+)/);
  const slug = gm?.[1] || qs.get('e'),
    id = em?.[1] || qs.get('id');
  if (!CFG.supabaseUrl || CFG.supabaseUrl.startsWith('YOUR_')) {
    fatal('Supra is not connected to its database yet. Fill in config.js.');
    return;
  }
  appState.SB = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
  const rm = path.match(/^\/r\/([\w-]+)/);
  if (rm) {
    appState.MODE = 'rsvp';
    appState.RTOK = rm[1];
    appState.readOnly = true;
    let r;
    try {
      const { data, error } = await appState.SB.rpc('rsvp_get', { p_token: appState.RTOK });
      if (error) throw error;
      r = data;
    } catch (e) {
      logSafe('rsvp', e);
      fatal(t('rsvpLoadErr'));
      return;
    }
    if (!r || r.status !== 'ok') {
      fatal(t('rsvpUnavailable'));
      return;
    }
    appState.R = r;
    appState.RD = rsvpDraftFrom(appState.R.invite.answer);
    // only this household's drawings
    await loadImages(r.invite.members.flatMap(m => lookImages(portraitLook(m))));
    appState.S = {
      event: {
        name: r.event.name || '',
        date: r.event.date || '',
        type: r.event.type || 'wedding',
        palette: r.event.palette || 'blush',
        lang: r.invite.lang || r.event.lang || 'ka'
      },
      tables: [],
      guests: {},
      waiting: [],
      rules: [],
      venue: []
    };
    route();
    window.__supraState = () => ({ R: appState.R, RD: appState.RD });
    return;
  }
  // The planner and the guest page draw everything; start loading now, alongside the data.
  const allImages = loadImages();
  if (slug) {
    appState.MODE = 'guest';
    appState.SLUG = slug;
    const { data, error } = await appState.SB.rpc('public_plan', { p_slug: slug });
    if (error || !data || !data.event) {
      fatal(t('fgUnavailable'));
      return;
    }
    appState.S = fromPublic(data);
    appState.readOnly = true;
  } else {
    const {
      data: { session }
    } = await appState.SB.auth.getSession();
    if (!session) {
      location.replace('/?next=' + encodeURIComponent(path + location.search));
      return;
    }
    if (!id) {
      location.replace('/');
      return;
    }
    const { data, error } = await appState.SB.from('events').select('*').eq('id', id).maybeSingle();
    if (error || !data) {
      fatal(t('notFound'));
      return;
    }
    if (data.deleted_at) {
      fatal(t('inTrash'));
      return;
    }
    appState.ROW = data;
    appState.DRAFT = 'supra.draft.' + appState.ROW.id;
    const fromRow = data.data && data.data.tables ? normalize(data.data) : normalize(emptyPlan(data));
    let draft = null;
    try {
      draft = JSON.parse(localStorage.getItem(appState.DRAFT) || 'null');
    } catch (e) {}
    if (draft && draft.data && (draft.base === appState.ROW.version || draft.base === appState.ROW.updated_at)) {
      appState.S = normalize(draft.data);
      appState.dirty = true;
    } else if (draft && draft.data && JSON.stringify(normalize(draft.data)) !== JSON.stringify(fromRow)) {
      // Unsaved changes on this device, but the plan was saved elsewhere since: let the organiser choose (R8).
      appState.S = normalize(draft.data);
      appState.dirty = true;
      appState.conflict = data;
    } else appState.S = fromRow;
    if (!appState.S.event.name) appState.S.event.name = appState.ROW.name;
    // Guests that arrive without a drawing (the sample wedding from "Your events") get one now, and it is saved.
    if (!appState.readOnly) {
      const bare = Object.values(appState.S.guests).filter(g => !g.look);
      bare.forEach(g => (g.look = smartLook(g.name, g.group)));
      if (bare.length) appState.dirty = true;
    }
    // Organiser preview: exactly what an anonymous guest would get, whether or not the page is published.
    if (qs.get('preview')) {
      const pv = await appState.SB.rpc('preview_public_plan', { p_event: appState.ROW.id });
      if (pv.error || !pv.data) {
        logSafe('preview', pv.error);
        fatal(t('pvErr'));
        return;
      }
      appState.PREVIEW = shareInfo().status;
      appState.PREVIEW_ID = appState.ROW.id;
      appState.SLUG = appState.ROW.slug;
      appState.MODE = 'guest';
      appState.readOnly = true;
      appState.S = fromPublic(pv.data);
      document.title = t('pvTitle') + ' · ' + (appState.S.event.name || 'Supra');
    }
  }
  if (appState.MODE === 'edit' && !appState.readOnly) await loadAccess();
  appState.hintOpen = !hintSeen();
  // The guest page shows its search box at once; results wait for the drawings (guestSearch). The planner waits here.
  if (appState.MODE === 'edit') await allImages;
  if (appState.S.tables.some(x => x.x === undefined)) autoArrange();
  resolveOverlaps();
  // /edit/<id>?panel=guests opens the planner on that panel (used by the next-step buttons on "Your events")
  if (appState.MODE === 'edit') appState.view = storedView();
  const startPanel = qs.get('panel');
  if (appState.MODE === 'edit' && !appState.readOnly && ['event', 'guests', 'invites', 'share'].includes(startPanel))
    appState.panel = startPanel;
  route();
  document.fonts?.ready.then(() => {
    if (!appState.guestMode) renderPlan();
  });
  if (appState.MODE === 'edit' && (appState.dirty || !(appState.ROW.data && appState.ROW.data.tables))) {
    appState.dirty = true;
    savePlan();
  }
  if (appState.MODE === 'edit' && appState.conflict) showConflict(appState.conflict);
  // /edit/<id>?do=cards opens the place cards at once (the quick action on "Your events"), unless a save conflict
  // needs an answer first. The parameter is dropped so a reload doesn't open them again.
  if (appState.MODE === 'edit' && qs.get('do') === 'cards') {
    qs.delete('do');
    history.replaceState(history.state, '', location.pathname + (qs.size ? '?' + qs : ''));
    if (!appState.readOnly && !appState.conflict) placeCards();
  }
  if (appState.MODE === 'edit' && !appState.readOnly) invRefresh();
  window.__supraState = () => appState.S;
}

export { boot, fatal };
