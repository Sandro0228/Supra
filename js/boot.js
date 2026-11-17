'use strict';
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
  GL = { mode: d.lookup?.mode === 'exact' ? 'exact' : 'prefix', pin: !!d.lookup?.pin };
  o.event.seatMode = d.lookup?.seatMode === 'table' ? 'table' : 'seat';
  return normalize(o);
}
async function boot() {
  measure();
  {
    const l = UL();
    document.documentElement.lang = l;
    $('#loadingtxt').textContent =
      (L10N[l] || L10N.en)[location.pathname.startsWith('/r/') ? 'rsvpLoading' : 'loadingPlan'] || 'Loading…';
  }
  S = { event: { lang: (navigator.language || '').startsWith('ka') ? 'ka' : 'en' }, tables: [], guests: {} };
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
  SB = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
  const rm = path.match(/^\/r\/([\w-]+)/);
  if (rm) {
    MODE = 'rsvp';
    RTOK = rm[1];
    readOnly = true;
    let r;
    try {
      const { data, error } = await SB.rpc('rsvp_get', { p_token: RTOK });
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
    R = r;
    RD = rsvpDraftFrom(R.invite.answer);
    S = {
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
    window.__supraState = () => ({ R, RD });
    return;
  }
  if (slug) {
    MODE = 'guest';
    SLUG = slug;
    const { data, error } = await SB.rpc('public_plan', { p_slug: slug });
    if (error || !data || !data.event) {
      fatal(t('fgUnavailable'));
      return;
    }
    S = fromPublic(data);
    readOnly = true;
  } else {
    const {
      data: { session }
    } = await SB.auth.getSession();
    if (!session) {
      location.replace('/?next=' + encodeURIComponent(path + location.search));
      return;
    }
    if (!id) {
      location.replace('/');
      return;
    }
    const { data, error } = await SB.from('events').select('*').eq('id', id).maybeSingle();
    if (error || !data) {
      fatal(t('notFound'));
      return;
    }
    ROW = data;
    DRAFT = 'supra.draft.' + ROW.id;
    const fromRow = data.data && data.data.tables ? normalize(data.data) : normalize(emptyPlan(data));
    let draft = null;
    try {
      draft = JSON.parse(localStorage.getItem(DRAFT) || 'null');
    } catch (e) {}
    if (draft && draft.data && draft.base === ROW.updated_at) {
      S = normalize(draft.data);
      dirty = true;
    } else S = fromRow;
    if (!S.event.name) S.event.name = ROW.name;
    // Organiser preview: exactly what an anonymous guest would get, whether or not the page is published.
    if (qs.get('preview')) {
      const pv = await SB.rpc('preview_public_plan', { p_event: ROW.id });
      if (pv.error || !pv.data) {
        logSafe('preview', pv.error);
        fatal(t('pvErr'));
        return;
      }
      PREVIEW = shareInfo().status;
      PREVIEW_ID = ROW.id;
      SLUG = ROW.slug;
      MODE = 'guest';
      readOnly = true;
      S = fromPublic(pv.data);
      document.title = t('pvTitle') + ' · ' + (S.event.name || 'Supra');
    }
  }
  hintOpen = !hintSeen();
  if (S.tables.some(x => x.x === undefined)) autoArrange();
  resolveOverlaps();
  route();
  document.fonts?.ready.then(() => {
    if (!guestMode) renderPlan();
  });
  if (MODE === 'edit' && (dirty || !(ROW.data && ROW.data.tables))) {
    dirty = true;
    savePlan();
  }
  if (MODE === 'edit' && !readOnly) invRefresh();
  window.__supraState = () => S;
}
boot();
