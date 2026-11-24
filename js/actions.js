import {
  $,
  UL,
  VENUE,
  appState,
  lookMismatch,
  randLook,
  relook,
  seatMode,
  setLang,
  smartLook,
  t,
  uid
} from './core.js';
import { T, V, commit, hist, markDirty, mkGuest, tName, toast, undo } from './state.js';
import {
  applyArrangement,
  arrangeDefaults,
  autoArrange,
  bounds,
  dims,
  geo,
  rbox,
  resolveOverlaps,
  toView,
  toWorld,
  turnView,
  withView
} from './layout.js';
import { planSVG } from './draw.js';
import {
  OPEN,
  curTheme,
  doFind,
  drawerOpen,
  focusKeyOf,
  guestUrl,
  renderDrawer,
  renderLeft,
  renderRight,
  renderTop,
  setLookup,
  shareCall,
  shareInfo
} from './panels.js';
import { catererModal, dlQR, exportX, importModal, placeCards, planImage, planPdf, savePlan } from './files.js';
import { GERR, guestClick, setGuestErr } from './guest.js';
import { rsvpClick, rsvpInput } from './rsvp.js';
import { invClick, invInput, invSettingChange } from './invites.js';
/* Rendering everything, and every click, key and input in the planner. Part of the planner (app.html); see js/README.md. */
/* ---------------- render ---------------- */
/* Motion that answers what the organiser did: a guest who lands in a seat settles into the chair, empty seats
   glow while a guest is looking for one, and the room celebrates once when the last guest is seated.
   prefers-reduced-motion turns all of it off (app.html). */
let lastSeats = null,
  wasAllSeated = null;
function seatMap() {
  const m = {};
  appState.S.tables.forEach(x => x.seats.forEach((g, i) => g && (m[x.id + ':' + i] = g)));
  return m;
}
function settleNew(svg, before, now) {
  if (!before) return;
  const changed = Object.keys(now).filter(k => now[k] !== before[k]);
  if (!changed.length || changed.length > 120) return;
  changed.forEach((k, n) => {
    const [tid, i] = k.split(':'),
      f = svg.querySelector(`.seat[data-t="${CSS.escape(tid)}"][data-i="${i}"] .fig`);
    if (!f) return;
    f.style.animationDelay = Math.min(n * 25, 600) + 'ms';
    f.classList.add('settle');
  });
}
function allSeated() {
  const n = Object.keys(appState.S.guests).length;
  return n >= 2 && !appState.S.waiting.length && Object.keys(seatMap()).length >= n;
}
function celebrate() {
  const key = 'supra.celebrated.' + (appState.ROW?.id || 'plan');
  try {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');
  } catch (e) {}
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = document.createElement('div');
  box.className = 'petals';
  box.setAttribute('aria-hidden', 'true');
  const cols = ['#F2C6CF', '#FBE3E6', '#FFFFFF', '#E8B4BE', '#F7D9C4'];
  for (let i = 0; i < 36; i++) {
    const s = document.createElement('i');
    s.style.left = Math.random() * 100 + '%';
    s.style.background = cols[i % cols.length];
    s.style.animationDelay = Math.random() * 900 + 'ms';
    s.style.animationDuration = 2200 + Math.random() * 1400 + 'ms';
    s.style.setProperty('--sway', (Math.random() * 120 - 60).toFixed(0) + 'px');
    s.style.setProperty('--spin', (Math.random() * 540 - 270).toFixed(0) + 'deg');
    box.append(s);
  }
  $('#canvas').append(box);
  setTimeout(() => box.remove(), 4200);
}
function renderPlan() {
  const { B, inner } = withView(() => planSVG({ rsvp: true }));
  const svg = $('#plan');
  svg.setAttribute('viewBox', `${B.x} ${B.y} ${B.w} ${B.h}`);
  svg.dataset.w = B.w;
  svg.dataset.h = B.h;
  svg.innerHTML = inner;
  svg.classList.toggle('seekseat', !!appState.waitSel);
  const now = seatMap();
  settleNew(svg, lastSeats, now);
  lastSeats = now;
  const all = allSeated();
  if (all && wasAllSeated === false && !appState.readOnly) celebrate();
  wasAllSeated = all;
  applyZoom();
}
/* View: `scale` is screen pixels per plan unit, so opening or closing a panel never changes the zoom.
   fitMode remembers a pressed Fit button so the view refits when the window changes size. */
const isPhone = () => matchMedia('(max-width:900px)').matches;
function planWH() {
  const svg = $('#plan');
  return [+svg.dataset.w || 1000, +svg.dataset.h || 800];
}
function padOf(sc) {
  const cs = getComputedStyle(sc);
  return {
    l: parseFloat(cs.paddingLeft),
    r: parseFloat(cs.paddingRight),
    t: parseFloat(cs.paddingTop),
    b: parseFloat(cs.paddingBottom)
  };
}
/* What is actually in the room, in plan units (bounds() adds a title band and a minimum width). */
function contentBox() {
  return withView(contentBox0);
}
function contentBox0() {
  let x0 = Infinity,
    x1 = -Infinity;
  appState.S.tables.forEach(x => {
    const [w] = dims(x);
    x0 = Math.min(x0, x.x - w / 2);
    x1 = Math.max(x1, x.x + w / 2);
  });
  appState.S.venue.forEach(v => {
    const [w] = rbox(v.w, v.h, v.rot);
    x0 = Math.min(x0, v.x - w / 2);
    x1 = Math.max(x1, v.x + w / 2);
  });
  if (!isFinite(x0)) return null;
  return { x0: x0 - 30, x1: x1 + 30 };
}
function fitScale(kind) {
  const sc = $('#scroller'),
    P = padOf(sc),
    [W, H] = planWH(),
    cw = Math.max(200, sc.clientWidth - P.l - P.r),
    ch = Math.max(160, sc.clientHeight - P.t - P.b);
  if (kind === 'width') {
    const cb = contentBox();
    return cw / Math.min(W, cb ? cb.x1 - cb.x0 : W);
  }
  return Math.min(cw / W, ch / H);
}
const ZMIN = 0.08,
  ZMAX = 4;
function sizePlan() {
  const svg = $('#plan'),
    [W, H] = planWH();
  svg.style.width = Math.round(W * appState.scale) + 'px';
  svg.style.height = Math.round(H * appState.scale) + 'px';
  const z = $('#zpct');
  if (z) z.textContent = Math.round((appState.scale / fitScale('all')) * 100) + '%';
}
/* Scrolls so the occupied part of the room is centred, top first. */
function centerContent() {
  const sc = $('#scroller'),
    svg = $('#plan'),
    cb = contentBox();
  if (!cb) return;
  const vb = svg.viewBox.baseVal,
    b = svg.getBoundingClientRect(),
    r = sc.getBoundingClientRect(),
    cx = ((cb.x0 + cb.x1) / 2 - vb.x) * appState.scale;
  sc.scrollLeft += b.left + cx - (r.left + r.width / 2);
  sc.scrollTop = 0;
}
function applyZoom(refit) {
  const svg = $('#plan');
  if (!svg.dataset.w) return;
  if (appState.scale == null) {
    appState.fitMode = isPhone() ? 'width' : 'all';
    appState.scale = fitScale(appState.fitMode);
    sizePlan();
    centerContent();
    return;
  }
  if (refit && appState.fitMode) appState.scale = fitScale(appState.fitMode);
  sizePlan();
}
/* Zoom keeping the plan point under (cx,cy) — or the view centre — still. */
function zoomTo(ns, cx, cy) {
  const sc = $('#scroller'),
    svg = $('#plan'),
    r = sc.getBoundingClientRect();
  ns = Math.min(ZMAX, Math.max(ZMIN, ns));
  const ox = (cx ?? r.left + r.width / 2) - r.left,
    oy = (cy ?? r.top + r.height / 2) - r.top;
  const b0 = svg.getBoundingClientRect(),
    fx = (ox + r.left - b0.left) / b0.width,
    fy = (oy + r.top - b0.top) / b0.height;
  appState.fitMode = null;
  appState.scale = ns;
  applyZoom();
  const b = svg.getBoundingClientRect();
  sc.scrollLeft += b.left + fx * b.width - (r.left + ox);
  sc.scrollTop += b.top + fy * b.height - (r.top + oy);
}
function setFit(kind) {
  appState.fitMode = kind;
  appState.scale = Math.min(ZMAX, fitScale(kind));
  sizePlan();
  centerContent();
}
/* Keeps the plan point at the centre of the view while the layout around the canvas changes. */
function keepView(fn) {
  const sc = $('#scroller'),
    svg = $('#plan');
  if (!svg.dataset.w || appState.guestMode) return fn();
  const r = sc.getBoundingClientRect(),
    b = svg.getBoundingClientRect(),
    fx = (r.left + r.width / 2 - b.left) / b.width,
    fy = (r.top + r.height / 2 - b.top) / b.height;
  fn();
  const r2 = sc.getBoundingClientRect(),
    b2 = svg.getBoundingClientRect();
  sc.scrollLeft += b2.left + fx * b2.width - (r2.left + r2.width / 2);
  sc.scrollTop += b2.top + fy * b2.height - (r2.top + r2.height / 2);
}
/* Focused view of one table, for reading names on a phone. */
function focusTable(x0) {
  const x = withView(() => T(x0.id)),
    [w, h] = dims(x),
    sc = $('#scroller'),
    svg = $('#plan');
  appState.fitMode = null;
  appState.scale = Math.min(
    ZMAX,
    Math.max(ZMIN, Math.min((sc.clientWidth - 24) / (w + 60), (sc.clientHeight - 24) / (h + 60)))
  );
  applyZoom();
  const vb = svg.viewBox.baseVal,
    b = svg.getBoundingClientRect(),
    r = sc.getBoundingClientRect(),
    px = (x.x - vb.x) * appState.scale,
    py = (x.y - vb.y) * appState.scale;
  sc.scrollLeft += b.left + px - (r.left + r.width / 2);
  sc.scrollTop += b.top + py - (r.top + r.height / 2);
}
function renderAll() {
  const fk = focusKeyOf(document.activeElement);
  document.documentElement.lang = UL();
  renderTop();
  const st = renderDrawer();
  renderLeft();
  renderRight();
  renderPlan();
  if (st.opened) {
    $('#dtitle')?.focus({ preventScroll: true });
    return;
  }
  if (st.closed) {
    const back = appState.drawerOpener && document.querySelector(appState.drawerOpener);
    appState.drawerOpener = null;
    (back || $('#scroller')).focus({ preventScroll: true });
    return;
  }
  if (fk && document.activeElement === document.body) {
    const el = document.querySelector(fk);
    el && el.focus({ preventScroll: true });
  }
}

/* ---------------- actions ---------------- */
function curGuest() {
  const x = T(appState.sel.t);
  return x && appState.S.guests[x.seats[appState.sel.i]];
}
function placeNames(names, tid) {
  names.forEach(n => {
    const id = mkGuest(n);
    let x = tid && tid !== '__wait' ? T(tid) : null,
      i = -1;
    if (tid === '__wait') {
      appState.S.waiting.push(id);
      return;
    }
    if (x) i = x.seats.indexOf(null);
    if (i < 0 && !tid)
      for (const y of appState.S.tables) {
        i = y.seats.indexOf(null);
        if (i >= 0) {
          x = y;
          break;
        }
      }
    if (i >= 0) x.seats[i] = id;
    else appState.S.waiting.push(id);
  });
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function autoSeat() {
  const tables = appState.S.tables.filter(x => x.shape !== 'head');
  const pool = [...appState.S.waiting, ...tables.flatMap(x => x.seats.filter(Boolean))];
  tables.forEach(x => (x.seats = x.seats.map(() => null)));
  appState.S.waiting = [];
  const parent = {};
  const f = a => (parent[a] === a ? a : (parent[a] = f(parent[a])));
  pool.forEach(id => (parent[id] = id));
  appState.S.rules
    .filter(r => r.type === 'together' && parent[r.a] && parent[r.b])
    .forEach(r => (parent[f(r.a)] = f(r.b)));
  const clusters = {};
  pool.forEach(id => {
    (clusters[f(id)] = clusters[f(id)] || []).push(id);
  });
  const units = {};
  Object.values(clusters).forEach(c => {
    const g = appState.S.guests[c[0]];
    const key = g.group || (g.side ? 'side:' + g.side : 'zz');
    (units[key] = units[key] || []).push(...c);
  });
  const order = Object.entries(units)
    .sort((a, b) => b[1].length - a[1].length)
    .map(e => e[1]);
  const apart = (id, x) =>
    appState.S.rules.some(
      r => r.type === 'apart' && ((r.a === id && x.seats.includes(r.b)) || (r.b === id && x.seats.includes(r.a)))
    );
  const freeN = x => x.seats.filter(v => !v).length;
  order.forEach(unit => {
    let fit = tables
      .filter(x => freeN(x) >= unit.length && !unit.some(id => apart(id, x)))
      .sort((a, b) => freeN(a) - freeN(b))[0];
    const place = (id, x) => {
      const i = x.seats.indexOf(null);
      if (i >= 0) {
        x.seats[i] = id;
        return true;
      }
      return false;
    };
    if (fit) {
      unit.forEach(id => place(id, fit));
      return;
    }
    unit.forEach(id => {
      const c = tables.filter(x => freeN(x) > 0).sort((a, b) => apart(id, a) - apart(id, b) || freeN(b) - freeN(a));
      if (!c[0] || !place(id, c[0])) appState.S.waiting.push(id);
    });
  });
}
function act(a) {
  const x = appState.sel.t && T(appState.sel.t);
  switch (a) {
    case 'addtable':
      commit(() => {
        const n = appState.S.tables.length;
        const nt = {
          id: uid(),
          name: 'Table ' + n,
          shape: 'round',
          deco: 'flowers',
          seats: Array(8).fill(null),
          x: 0,
          y: 0
        };
        {
          const g = geo(nt);
          [nt.x, nt.y] = freeSpot(g.w, g.h);
        }
        appState.S.tables.push(nt);
        appState.sel = { kind: 'table', t: nt.id };
      });
      toast(t('tableAdded'));
      break;
    case 'arrange':
      commit(() => autoArrange());
      break;
    case 'arr-open':
      if (!drawerOpen) appState.drawerOpener = '#quickadd [data-act="arr-open"]';
      appState.ARR = arrangeDefaults();
      appState.sel = { kind: null };
      appState.swapFrom = null;
      appState.panel = appState.panel === 'arrange' ? null : 'arrange';
      renderAll();
      break;
    case 'arr-rows-':
    case 'arr-rows+': {
      const n = appState.S.tables.filter(x => x.shape !== 'head').length;
      appState.ARR.rows = Math.min(Math.max(1, appState.ARR.rows + (a === 'arr-rows+' ? 1 : -1)), Math.max(1, n));
      appState.ARR.rowAisles = appState.ARR.rowAisles.filter(i => i < appState.ARR.rows - 1);
      const C = Math.ceil(n / appState.ARR.rows);
      appState.ARR.colAisles = appState.ARR.colAisles.filter(i => i < C - 1);
      renderLeft();
      $(`[data-act="${a}"]`)?.focus();
      break;
    }
    case 'arr-apply': {
      const o = appState.ARR;
      commit(() => applyArrangement(o));
      appState.panel = null;
      appState.ARR = null;
      renderAll();
      requestAnimationFrame(() => setFit(isPhone() ? 'width' : 'all'));
      toast(t('arrDone'));
      break;
    }
    case 'swap':
      if (x) {
        appState.swapFrom = x.id;
        appState.sel = { kind: null };
        appState.panel = null;
        renderAll();
        $('#swapbar button')?.focus();
      }
      break;
    case 'swap-cancel':
      appState.swapFrom = null;
      renderAll();
      break;
    case 'bulk': {
      const names = $('#bulk')
        .value.split(/\n/)
        .map(s => s.trim())
        .filter(Boolean);
      if (!names.length) {
        toast(t('pasteFirst'));
        return;
      }
      const tid = $('#bulk-t').value;
      commit(() => placeNames(names, tid));
      toast(t('added', { n: names.length }));
      break;
    }
    case 'randall': {
      // One seed per run: relatives come out alike, and each run gives the families a new look.
      // The couple (gown, tuxedo) and looks changed by hand stay as they are.
      const seed = uid();
      commit(() =>
        Object.values(appState.S.guests).forEach(g => {
          if (g.look.hand || ['gown', 'tuxedo'].includes(g.look.outfit)) return;
          const keep = g.look.kindSet;
          g.look = smartLook(g.name, g.group, { kind: g.look.kind, seed });
          if (keep) g.look.kindSet = true;
        })
      );
      toast(t('newLooks'));
      break;
    }
    case 'shuffleall':
      commit(() => {
        const tb = appState.S.tables.filter(y => y.shape !== 'head');
        const ids = shuffle(tb.flatMap(y => y.seats.filter(Boolean)));
        tb.forEach(y => (y.seats = y.seats.map(v => (v ? ids.shift() : null))));
      });
      toast(t('shuffled'));
      break;
    case 'autoseat':
      appState.confirmK = 'autoseat';
      renderLeft();
      break;
    case 'autoseat-yes':
      appState.confirmK = null;
      commit(autoSeat);
      toast(t('autoDone'));
      break;
    case 'reset':
      appState.confirmK = 'reset';
      renderLeft();
      break;
    case 'reset-yes':
      appState.confirmK = null;
      commit(() => {
        appState.S = {
          event: { ...appState.S.event },
          guests: {},
          waiting: [],
          rules: [],
          venue: [],
          tables: [
            { id: uid(), name: 'Table 1', shape: 'rect', deco: 'flowers', seats: Array(10).fill(null), x: 0, y: 0 }
          ]
        };
        appState.sel = { kind: null };
      });
      break;
    case 'cancel':
      appState.confirmK = null;
      renderLeft();
      renderRight();
      break;
    case 'close':
      closeDrawer();
      break;
    case 'focustable': {
      const tb = T(appState.sel.t);
      if (tb) {
        if (isPhone()) closeDrawer();
        requestAnimationFrame(() => focusTable(tb));
      }
      break;
    }
    case 'hintok':
      try {
        localStorage.setItem('supra.hint', '1');
      } catch (e) {}
      appState.hintOpen = false;
      renderTop();
      $('#help').focus();
      break;
    case 'addguest': {
      const n = ($('#newname').value || '').trim();
      if (!n) {
        toast(t('typeFirst'));
        $('#newname').focus();
        return;
      }
      commit(() => {
        x.seats[appState.sel.i] = mkGuest(n);
      });
      break;
    }
    case 'addrandom':
      commit(() => {
        x.seats[appState.sel.i] = mkGuest(
          t('guestWord') + ' ' + (Object.keys(appState.S.guests).length + 1),
          randLook()
        );
      });
      break;
    case 'rnd':
      commit(() => {
        const g = curGuest(),
          keep = g.look.kindSet;
        g.look = smartLook(g.name, g.group, { kind: g.look.kind, self: g });
        if (keep) g.look.kindSet = true;
      });
      break;
    case 'kind':
      commit(() => {
        const g = curGuest();
        g.look = relook(g.look, g.look.kind === 'm' ? 'f' : 'm');
        g.look.kindSet = true;
      });
      break;
    case 'matchlooks': {
      let n = 0;
      const fix = Object.values(appState.S.guests).filter(lookMismatch);
      if (!fix.length) {
        toast(t('matchNone'));
        break;
      }
      commit(() =>
        fix.forEach(G => {
          G.look = relook(G.look, lookMismatch(G));
          n++;
        })
      );
      toast(t('matchDone', { n }));
      break;
    }
    case 'unseat':
      commit(() => {
        appState.S.waiting.push(x.seats[appState.sel.i]);
        x.seats[appState.sel.i] = null;
      });
      toast(t('movedWaiting'));
      break;
    case 'delguest':
      appState.confirmK = 'guest';
      renderRight();
      break;
    case 'delguest-yes':
      appState.confirmK = null;
      commit(() => {
        const id = x.seats[appState.sel.i];
        delete appState.S.guests[id];
        appState.S.rules = appState.S.rules.filter(r => r.a !== id && r.b !== id);
        x.seats[appState.sel.i] = null;
      });
      break;
    case 'addrule': {
      const b = $('#r-who').value;
      if (!b) {
        $('#r-who').focus();
        return;
      }
      const g = curGuest();
      commit(() => appState.S.rules.push({ id: uid(), type: $('#r-type').value, a: g.id, b }));
      break;
    }
    case 'seat+':
      commit(() => x.seats.push(null));
      break;
    case 'seat-':
      if (x.seats.length > 1)
        commit(() => {
          const i = x.seats.lastIndexOf(null);
          if (i >= 0) x.seats.splice(i, 1);
          else {
            appState.S.waiting.push(x.seats.pop());
            toast(t('movedWaiting'));
          }
        });
      break;
    case 'fillgroup': {
      const g = ($('#grp').value || '').trim() || 'Guest';
      commit(() => {
        let k = Object.values(appState.S.guests).filter(v => v.group === g).length;
        x.seats = x.seats.map(v => v || mkGuest(`${g} ${++k}`, randLook(), { group: g }));
      });
      toast(t('filledWith', { g }));
      break;
    }
    case 'shuffle':
      commit(() => shuffle(x.seats));
      break;
    case 'restyle': {
      const seed = uid();
      commit(() =>
        x.seats.forEach(id => {
          const g = id && appState.S.guests[id];
          if (!g || g.look.hand || ['gown', 'tuxedo'].includes(g.look.outfit)) return;
          const keep = g.look.kindSet;
          g.look = smartLook(g.name, g.group, { kind: g.look.kind, seed });
          if (keep) g.look.kindSet = true;
        })
      );
      break;
    }
    case 'dup':
      commit(() => {
        const nt = {
          id: uid(),
          name: x.name + ' 2',
          shape: x.shape,
          deco: x.deco,
          seats: Array(x.seats.length).fill(null),
          x: x.x + 60,
          y: x.y + geo(x).h
        };
        appState.S.tables.splice(appState.S.tables.indexOf(x) + 1, 0, nt);
        appState.sel = { kind: 'table', t: nt.id };
      });
      break;
    case 'deltable':
      appState.confirmK = 'table';
      renderRight();
      break;
    case 'deltable-yes':
      appState.confirmK = null;
      commit(() => {
        appState.S.waiting.push(...x.seats.filter(Boolean));
        appState.S.tables = appState.S.tables.filter(y => y !== x);
        appState.sel = { kind: null };
      });
      break;
    case 'delvenue':
      commit(() => {
        appState.S.venue = appState.S.venue.filter(v => v.id !== appState.sel.v);
        appState.sel = { kind: null };
      });
      break;
    case 'copylink': {
      const st = $('#copystate'),
        u = guestUrl();
      const done = ok => {
        if (st) st.textContent = ok ? t('copied') : t('copyFail', { url: u });
      };
      (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(
        () => done(true),
        () => done(false)
      );
      break;
    }
    case 'publish': {
      const d = $('#sh-exp')?.value;
      shareCall(
        'publish_guest_page',
        { p_expires: d ? new Date(d + 'T23:59:59').toISOString() : null },
        t('shPublished'),
        '#sh-status'
      );
      break;
    }
    case 'unpublish':
      shareCall('unpublish_guest_page', {}, t('shUnpublished'), '#sh-status');
      break;
    case 'rotate':
      appState.confirmK = 'rotate';
      renderLeft();
      $('[data-act="rotate-yes"]')?.focus();
      break;
    case 'rotate-yes':
      shareCall('rotate_guest_link', {}, t('shRotated'), '#sh-status');
      break;
    case 'revoke':
      appState.confirmK = 'revoke';
      renderLeft();
      $('[data-act="revoke-yes"]')?.focus();
      break;
    case 'revoke-yes':
      shareCall('revoke_guest_link', {}, t('shRevoked'), '#sh-status');
      break;
    case 'strict-yes': {
      const v = ($('#pr-pin')?.value || '').trim();
      if (!shareInfo().pin && (v.length < 4 || v.length > 12)) {
        toast(t('lkPinLen'));
        $('#pr-pin')?.focus();
        break;
      }
      shareCall('apply_privacy_preset', { p_preset: 'strict', p_pin: v || null }, t('lkSaved'), '[data-preset=strict]');
      break;
    }
    case 'open-yes':
      shareCall('apply_privacy_preset', { p_preset: 'open' }, t('lkSaved'), '[data-preset=open]');
      break;
    case 'setpin': {
      const v = ($('#lk-pin')?.value || '').trim();
      if (v.length < 4 || v.length > 12) {
        toast(t('lkPinLen'));
        $('#lk-pin')?.focus();
        break;
      }
      setLookup({ pin: v });
      break;
    }
    case 'rmpin':
      setLookup({ pin: '' });
      break;
    case 'dlqr':
      dlQR();
      break;
    case 'cards':
      placeCards();
      break;
    case 'caterer':
      catererModal();
      break;
    case 'planimg':
      planImage();
      break;
    case 'planpdf':
      planPdf();
      break;
    case 'import':
      importModal();
      break;
    case 'export':
      exportX();
      break;
  }
}
document.addEventListener('click', e => {
  if (appState.guestMode) return appState.MODE === 'rsvp' ? rsvpClick(e) : guestClick(e);
  const b = e.target.closest('button');
  if (!b) return;
  const d = b.dataset;
  if (invClick(b)) return;
  if (d.act) return act(d.act);
  if (d.panel) {
    const k = d.panel;
    if (!drawerOpen) appState.drawerOpener = '#tab-' + k;
    appState.panel = appState.panel === k && !appState.sel.kind ? null : k;
    appState.sel = { kind: null };
    appState.confirmK = null;
    renderAll();
    return;
  }
  if (d.lang) {
    if (d.lang !== UL()) {
      setLang(d.lang);
      renderAll();
    }
    return;
  }
  if (d.preset) {
    const k = d.preset;
    if (k === 'balanced') {
      shareCall('apply_privacy_preset', { p_preset: 'balanced' }, t('lkSaved'), '[data-preset=balanced]');
      return;
    }
    if (k === 'strict' && shareInfo().pin) {
      shareCall('apply_privacy_preset', { p_preset: 'strict' }, t('lkSaved'), '[data-preset=strict]');
      return;
    }
    appState.confirmK = k;
    renderLeft();
    (k === 'strict' ? $('#pr-pin') : $('[data-act="open-yes"]'))?.focus();
    return;
  }
  if (d.seatmode) {
    if (seatMode() !== d.seatmode) commit(() => (appState.S.event.seatMode = d.seatmode));
    return;
  }
  if (d.glangset) {
    if (appState.S.event.lang !== d.glangset) commit(() => (appState.S.event.lang = d.glangset));
    return;
  }
  if (d.pal) return commit(() => (appState.S.event.palette = d.pal));
  if (d.arrOrient) {
    appState.ARR.orient = d.arrOrient;
    renderLeft();
    return;
  }
  if (d.arrAisle) {
    appState.ARR.aisle = d.arrAisle;
    renderLeft();
    return;
  }
  if (d.aisle) {
    const [k, i] = d.aisle.split(':'),
      list = k === 'row' ? appState.ARR.rowAisles : appState.ARR.colAisles,
      n = +i,
      j = list.indexOf(n);
    j < 0 ? list.push(n) : list.splice(j, 1);
    renderLeft();
    $(`[data-aisle="${d.aisle}"]`)?.focus();
    return;
  }
  if (d.seltable) {
    if (!drawerOpen) appState.drawerOpener = focusKeyOf(b);
    appState.sel = { kind: 'table', t: d.seltable };
    appState.confirmK = null;
    renderAll();
    return;
  }
  if (d.shape) return commit(() => (T(appState.sel.t).shape = d.shape));
  if (d.deco) return commit(() => (T(appState.sel.t).deco = d.deco));
  if (d.addvenue) {
    const k = d.addvenue;
    commit(() => {
      const B = bounds();
      const v = { id: uid(), type: k, label: '', w: VENUE[k].w, h: VENUE[k].h, x: 0, y: 0 };
      [v.x, v.y] = freeSpot(v.w, v.h);
      appState.S.venue.push(v);
      appState.sel = { kind: 'venue', v: v.id };
    });
    return;
  }
  if (d.rot || d.rotset) {
    const it =
      appState.sel.kind === 'table' ? T(appState.sel.t) : appState.sel.kind === 'venue' ? V(appState.sel.v) : null;
    if (it)
      commit(() => {
        it.rot = d.rotset !== undefined ? +d.rotset : ((((it.rot || 0) + +d.rot) % 360) + 360) % 360;
      });
    return;
  }
  if (d.vsize) {
    const [k, n] = d.vsize.split(':');
    commit(() => {
      const v = V(appState.sel.v);
      v[k] = Math.max(40, v[k] + +n);
    });
    return;
  }
  if (d.crowd)
    return commit(() => {
      const ev = appState.S.event;
      if (d.crowd === 'auto') return delete ev.crowd;
      const c = (ev.crowd = ev.crowd || { skin: [], hair: [] }),
        list = (c[d.crowd] = c[d.crowd] || []),
        i = +d.i,
        at = list.indexOf(i);
      if (at >= 0) list.splice(at, 1);
      else list.push(i);
      list.sort((a, b) => a - b);
      if (!c.skin.length && !c.hair.length) delete ev.crowd;
    });
  if (d.look)
    return commit(() => {
      const g = curGuest();
      g.look[d.look] = d.v;
      g.look.hand = true; // drawn by hand: never restyled, and relatives added later take after this look
      if (d.look === 'hairColor' && g.look.beard === 'none') g.look.beardColor = d.v;
    });
  if (d.gside !== undefined) return commit(() => (curGuest().side = d.gside));
  if (d.tside !== undefined)
    return commit(() =>
      T(appState.sel.t).seats.forEach(id => {
        if (id) appState.S.guests[id].side = d.tside;
      })
    );
  if (d.delrule) return commit(() => (appState.S.rules = appState.S.rules.filter(r => r.id !== d.delrule)));
  if (d.goto) {
    const [tt, i] = d.goto.split(':');
    appState.sel = { kind: 'seat', t: tt, i: +i };
    renderAll();
    scrollToSeat();
    return;
  }
  if (d.wait) {
    appState.waitSel = appState.waitSel === d.wait ? null : d.wait;
    renderLeft();
    $('#plan').classList.toggle('seekseat', !!appState.waitSel);
    if (appState.waitSel) toast(t('tapEmpty'));
    return;
  }
  if (d.seatwait) {
    const w = d.seatwait;
    commit(() => {
      T(appState.sel.t).seats[appState.sel.i] = w;
      appState.S.waiting = appState.S.waiting.filter(v => v !== w);
    });
    return;
  }
});
document.addEventListener('input', e => {
  if (appState.guestMode) {
    if (appState.MODE === 'rsvp') return rsvpInput(e);
    if (e.target.id === 'gq' && GERR) setGuestErr('');
    return;
  }
  if (invInput(e)) return;
  const id = e.target.id;
  if (id === 'find') {
    appState.FINDQ = e.target.value;
    return doFind();
  }
  const live = {
    'ev-name': v => (appState.S.event.name = v),
    'g-name': v => {
      curGuest().name = v;
    },
    'g-group': v => (curGuest().group = v),
    'g-allergies': v => (curGuest().allergies = v),
    't-name': v => (T(appState.sel.t).name = v),
    'v-label': v => (V(appState.sel.v).label = v)
  };
  if (live[id]) {
    if (!e.target.dataset.h) {
      hist.push(JSON.stringify(appState.S));
      e.target.dataset.h = 1;
    }
    live[id](e.target.value);
    markDirty();
    renderPlan();
  }
});
document.addEventListener('change', e => {
  if (appState.guestMode) {
    if (appState.MODE === 'rsvp') rsvpInput(e);
    return;
  }
  const id = e.target.id;
  if (invInput(e) || invSettingChange(e)) return;
  if (id === 'ev-time') {
    commit(() => (appState.S.event.time = e.target.value));
    return;
  }
  if (id === 'ev-venue') {
    commit(() => (appState.S.event.venue = e.target.value.trim()));
    return;
  }
  if (id === 'ev-map') {
    const v = e.target.value.trim();
    commit(() => (appState.S.event.mapUrl = v));
    $('#ev-map')?.focus();
    return;
  }
  if (id === 'ev-type') commit(() => (appState.S.event.type = e.target.value));
  if (id === 'ev-date') commit(() => (appState.S.event.date = e.target.value));
  if (id === 'g-meal') commit(() => (curGuest().meal = e.target.value));
  if (id === 'g-kid') commit(() => (curGuest().kid = e.target.checked));
  if (e.target.name === 'lk-mode') {
    setLookup({ mode: e.target.value });
    return;
  }
  if (id === 'lk-mates') {
    setLookup({ mates: e.target.checked });
    return;
  }
  if (id === 'lk-layout') {
    const sh = shareInfo();
    shareCall(
      'set_guest_privacy',
      { p_mode: sh.mode, p_mates: sh.mates, p_layout: e.target.checked },
      t('lkSaved'),
      '#lk-layout'
    );
    return;
  }
  if (id === 'arr-venue') {
    appState.ARR.venue = e.target.checked;
    renderLeft();
    $('#arr-venue')?.focus();
    return;
  }
  if (id === 'g-name') {
    const G = curGuest(),
      k = lookMismatch(G);
    if (k) {
      commit(() => {
        G.look = relook(G.look, k);
      });
      toast(t(k === 'f' ? 'relookF' : 'relookM'));
      return;
    }
  }
  if (['t-name', 'g-name', 'v-label'].includes(id)) {
    renderLeft();
    renderRight();
  }
});
/* Arrow keys for tab lists and radio groups (editor and guest page). */
document.addEventListener('keydown', e => {
  const grp = e.target.closest?.('[role=tablist],[role=radiogroup]');
  if (!grp || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
  const tabs = grp.getAttribute('role') === 'tablist',
    items = [...grp.querySelectorAll(tabs ? '[role=tab]' : '[role=radio]')],
    i = items.indexOf(e.target);
  if (i < 0) return;
  e.preventDefault();
  const rtl = getComputedStyle(grp).direction === 'rtl',
    n = items.length;
  let j =
    e.key === 'Home'
      ? 0
      : e.key === 'End'
        ? n - 1
        : (i + ((e.key === 'ArrowRight' || e.key === 'ArrowDown') !== rtl ? 1 : -1) + n) % n;
  const next = items[j];
  items.forEach(b => (b.tabIndex = -1));
  next.tabIndex = 0;
  next.focus();
  if (!tabs) {
    const k = focusKeyOf(next);
    next.click();
    const again = k && document.querySelector(k);
    again && again !== document.activeElement && again.focus();
  }
});
document.addEventListener('keydown', e => {
  if (appState.guestMode) return;
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '');
  if (e.key === 'Escape' && appState.swapFrom) {
    e.preventDefault();
    act('swap-cancel');
    return;
  }
  if (e.key === 'Escape' && drawerOpen && !$('#modalroot').innerHTML) {
    e.preventDefault();
    closeDrawer();
    return;
  }
  if (e.key === 'Tab' && drawerOpen && isPhone()) {
    const f = [
      ...$('#drawer').querySelectorAll('button,[href],input,select,textarea,summary,[tabindex]:not([tabindex="-1"])')
    ].filter(el => !el.disabled && (el.checkVisibility ? el.checkVisibility() : el.offsetParent !== null));
    if (f.length) {
      const a = f[0],
        z = f[f.length - 1];
      if (
        e.shiftKey &&
        (document.activeElement === a ||
          document.activeElement.id === 'dtitle' ||
          !$('#drawer').contains(document.activeElement))
      ) {
        e.preventDefault();
        z.focus();
      } else if (!e.shiftKey && document.activeElement === z) {
        e.preventDefault();
        a.focus();
      }
    }
  }
  if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
    if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      zoomTo(appState.scale * 1.25);
      return;
    }
    if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      zoomTo(appState.scale / 1.25);
      return;
    }
    if (e.key === '0') {
      e.preventDefault();
      setFit('all');
      return;
    }
    const it = e.target.closest?.('.tbody,.venue');
    if (it && e.key.startsWith('Arrow')) {
      e.preventDefault();
      const o = it.dataset.table ? T(it.dataset.table) : V(it.dataset.v),
        st = e.shiftKey ? 50 : 10;
      hist.push(JSON.stringify(appState.S));
      {
        const [dx, dy] = toWorld(
          e.key === 'ArrowLeft' ? -st : e.key === 'ArrowRight' ? st : 0,
          e.key === 'ArrowUp' ? -st : e.key === 'ArrowDown' ? st : 0
        );
        o.x += Math.round(dx);
        o.y += Math.round(dy);
      }
      markDirty();
      renderPlan();
      document.querySelector(focusKeyOf(it))?.focus();
      return;
    }
    if (it && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      it.dataset.table ? selectItem('table', it.dataset.table) : selectItem('venue', it.dataset.v);
      return;
    }
  }
  if (
    (e.ctrlKey || e.metaKey) &&
    e.key.toLowerCase() === 'z' &&
    !/INPUT|TEXTAREA/.test(document.activeElement.tagName)
  ) {
    e.preventDefault();
    undo();
  }
  if (e.key === 'Enter' && e.target.id === 'newname') act('addguest');
  if ((e.key === 'Enter' || e.key === ' ') && e.target.classList?.contains('seat')) {
    e.preventDefault();
    clickSeat(e.target.dataset.t, +e.target.dataset.i);
  }
});
function clickSeat(tid, i) {
  if (appState.swapFrom) return selectItem('table', tid);
  const x = T(tid);
  if (!drawerOpen) appState.drawerOpener = `.seat[data-t="${tid}"][data-i="${i}"]`;
  if (appState.waitSel && !x.seats[i]) {
    const w = appState.waitSel;
    appState.waitSel = null;
    commit(() => {
      x.seats[i] = w;
      appState.S.waiting = appState.S.waiting.filter(v => v !== w);
      appState.sel = { kind: 'seat', t: tid, i };
    });
    return;
  }
  appState.sel = { kind: 'seat', t: tid, i };
  appState.confirmK = null;
  renderAll();
}
function swapTables(a, b) {
  const A = T(a),
    B = T(b);
  if (!A || !B || A === B) return;
  commit(() => {
    [A.x, B.x] = [B.x, A.x];
    [A.y, B.y] = [B.y, A.y];
    [A.rot, B.rot] = [B.rot || 0, A.rot || 0];
  });
  toast(t('swapDone', { a: tName(A), b: tName(B) }));
}
function selectItem(kind, id) {
  if (appState.swapFrom) {
    if (kind === 'table' && id !== appState.swapFrom) {
      const f = appState.swapFrom;
      appState.swapFrom = null;
      swapTables(f, id);
      return;
    }
    if (kind === 'table' && id === appState.swapFrom) {
      appState.swapFrom = null;
      renderAll();
      return;
    }
  }
  if (!drawerOpen) appState.drawerOpener = kind === 'table' ? `.tbody[data-table="${id}"]` : `.venue[data-v="${id}"]`;
  appState.sel = kind === 'table' ? { kind, t: id } : { kind, v: id };
  appState.confirmK = null;
  renderAll();
}
function closeDrawer() {
  appState.sel = { kind: null };
  appState.panel = null;
  appState.confirmK = null;
  renderAll();
}
function scrollToSeat() {
  const el = document.querySelector(`.seat[data-t="${appState.sel.t}"][data-i="${appState.sel.i}"]`);
  el && el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
}

/* drag: seats swap, tables & venue move */
let drag = null;
function viewCenter() {
  const sc = $('#scroller'),
    r = sc.getBoundingClientRect();
  const p = wPt({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 });
  return [Math.round(p.x / 10) * 10, Math.round(p.y / 10) * 10];
}
function freeSpot(w, h) {
  const [cx, cy] = viewCenter(),
    pad = 30,
    boxes = [];
  appState.S.tables.forEach(x => {
    const [bw, bh] = dims(x);
    boxes.push([x.x - bw / 2, x.y - bh / 2, x.x + bw / 2, x.y + bh / 2]);
  });
  appState.S.venue.forEach(v => {
    const [bw, bh] = rbox(v.w, v.h, v.rot);
    boxes.push([v.x - bw / 2, v.y - bh / 2, v.x + bw / 2, v.y + bh / 2]);
  });
  const free = (x, y) =>
    boxes.every(
      b => x + w / 2 + pad < b[0] || x - w / 2 - pad > b[2] || y + h / 2 + pad < b[1] || y - h / 2 - pad > b[3]
    );
  for (let r = 0; r < 3000; r += 40) {
    const steps = Math.max(1, Math.round(r / 20));
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2,
        x = Math.round((cx + r * Math.cos(a)) / 10) * 10,
        y = Math.round((cy + r * Math.sin(a)) / 10) * 10;
      if (free(x, y)) return [x, y];
    }
  }
  return [cx, cy];
}
function svgPt(e) {
  const svg = $('#plan'),
    pt = svg.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}
/* The same point in saved-plan coordinates (undoes a turned view). */
function wPt(e) {
  const p = svgPt(e),
    [x, y] = toWorld(p.x, p.y);
  return { x, y };
}
$('#scroller').addEventListener('pointerdown', e => {
  if (e.button > 0) return;
  const rh = e.target.closest('.rothandle');
  if (rh) {
    const it = rh.dataset.rk === 'table' ? T(rh.dataset.rid) : V(rh.dataset.rid);
    hist.push(JSON.stringify(appState.S));
    drag = { kind: 'rotate', it, x: e.clientX, y: e.clientY, moved: true };
    document.body.classList.add('dragging');
    e.preventDefault();
    return;
  }
  const s = e.target.closest('.seat');
  if (s) {
    drag = { kind: 'seat', t: s.dataset.t, i: +s.dataset.i, x: e.clientX, y: e.clientY, moved: false, el: s };
    return;
  }
  const tb = e.target.closest('.tbody');
  if (tb) {
    const x = T(tb.dataset.table),
      p = wPt(e);
    drag = {
      kind: 'table',
      id: x.id,
      x: e.clientX,
      y: e.clientY,
      ox: x.x - p.x,
      oy: x.y - p.y,
      moved: false,
      el: tb.closest('.tgrp')
    };
    return;
  }
  const v = e.target.closest('.venue');
  if (v) {
    const it = V(v.dataset.v),
      p = wPt(e);
    drag = {
      kind: 'venue',
      id: it.id,
      x: e.clientX,
      y: e.clientY,
      ox: it.x - p.x,
      oy: it.y - p.y,
      moved: false,
      el: v
    };
    return;
  }
  const sc = $('#scroller');
  drag = {
    kind: 'pan',
    x: e.clientX,
    y: e.clientY,
    sl: sc.scrollLeft,
    st: sc.scrollTop,
    moved: false,
    mouse: e.pointerType === 'mouse'
  };
});
let rotRAF = 0;
window.addEventListener('pointermove', e => {
  if (!drag) return;
  if (drag.kind === 'rotate') {
    const p = wPt(e),
      it = drag.it;
    let a = (Math.atan2(p.x - it.x, -(p.y - it.y)) * 180) / Math.PI;
    const snap = e.shiftKey ? 1 : 15;
    a = Math.round(a / snap) * snap;
    a = ((a % 360) + 360) % 360;
    if (a !== it.rot) {
      it.rot = a;
      if (!rotRAF)
        rotRAF = requestAnimationFrame(() => {
          rotRAF = 0;
          renderPlan();
        });
    }
    return;
  }
  if (drag.kind === 'pan') {
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 5) {
      drag.moved = true;
      $('#scroller').classList.add('panning');
    }
    if (drag.moved && drag.mouse) {
      const sc = $('#scroller');
      sc.scrollLeft = drag.sl - (e.clientX - drag.x);
      sc.scrollTop = drag.st - (e.clientY - drag.y);
    }
    return;
  }
  if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 7) {
    drag.moved = true;
    if (drag.kind !== 'seat') hist.push(JSON.stringify(appState.S));
    if (drag.kind === 'seat') {
      drag.el.style.opacity = 0.45;
      $('#plan').classList.add('seekseat');
    }
    document.body.classList.add('dragging');
  }
  if (!drag.moved) return;
  if (drag.kind === 'seat') {
    document.querySelectorAll('.seat.target').forEach(r => r.classList.remove('target'));
    const o = document.elementFromPoint(e.clientX, e.clientY)?.closest('.seat');
    if (o && o !== drag.el) o.classList.add('target');
    return;
  }
  const p = wPt(e),
    nx = Math.round((p.x + drag.ox) / 10) * 10,
    ny = Math.round((p.y + drag.oy) / 10) * 10;
  const it = drag.kind === 'table' ? T(drag.id) : V(drag.id);
  it.x = nx;
  it.y = ny;
  const [vx, vy] = toView(nx, ny);
  drag.el.setAttribute('transform', `translate(${vx} ${vy})`);
});
window.addEventListener('pointercancel', () => {
  if (drag && drag.kind === 'pan') {
    drag = null;
    $('#scroller').classList.remove('panning');
  }
});
window.addEventListener('pointerup', e => {
  if (!drag) return;
  const d = drag;
  drag = null;
  document.body.classList.remove('dragging');
  if (d.kind === 'pan') {
    $('#scroller').classList.remove('panning');
    if (!d.moved && (appState.sel.kind || appState.panel)) closeDrawer();
    return;
  }
  if (d.kind === 'rotate') {
    resolveOverlaps();
    markDirty();
    renderAll();
    return;
  }
  if (d.kind === 'table') {
    if (d.moved) {
      markDirty();
      renderPlan();
    } else selectItem('table', d.id);
    return;
  }
  if (d.kind === 'venue') {
    if (d.moved) {
      markDirty();
      renderPlan();
    } else selectItem('venue', d.id);
    return;
  }
  if (!d.moved) return clickSeat(d.t, d.i);
  d.el.style.opacity = 1;
  $('#plan').classList.toggle('seekseat', !!appState.waitSel);
  const o = document.elementFromPoint(e.clientX, e.clientY)?.closest('.seat');
  if (!o || (o.dataset.t === d.t && +o.dataset.i === d.i)) return renderPlan();
  commit(() => {
    const A = T(d.t),
      Bt = T(o.dataset.t),
      bi = +o.dataset.i,
      tmp = A.seats[d.i];
    A.seats[d.i] = Bt.seats[bi];
    Bt.seats[bi] = tmp;
    appState.sel = { kind: 'seat', t: o.dataset.t, i: bi };
  });
  toast(t('swapped'));
});

$('#zin').onclick = () => zoomTo(appState.scale * 1.25);
$('#zout').onclick = () => zoomTo(appState.scale / 1.25);
$('#zall').onclick = () => setFit('all');
$('#zwidth').onclick = () => setFit('width');
$('#zrot').onclick = () => {
  const n = turnView();
  renderPlan();
  setFit(appState.fitMode || (isPhone() ? 'width' : 'all'));
  toast(t('viewTurned', { n }));
};
$('#help').onclick = () => {
  appState.hintOpen = !appState.hintOpen;
  renderTop();
  if (appState.hintOpen) $('#hint button')?.focus();
};
/* The window or full-screen changed size: a pressed Fit button refits, any other zoom stays put. */
function onViewport() {
  if (appState.guestMode) return;
  if (appState.fitMode) {
    applyZoom(true);
    centerContent();
  } else keepView(() => {});
}
window.addEventListener('resize', onViewport);
/* Ctrl/⌘ + wheel and trackpad pinch (Chrome, Edge, Firefox report it as ctrl+wheel). */
$('#scroller').addEventListener(
  'wheel',
  e => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    zoomTo(appState.scale * Math.exp(-e.deltaY * 0.0025), e.clientX, e.clientY);
  },
  { passive: false }
);
/* Safari trackpad pinch. */
let gs0 = null;
$('#scroller').addEventListener('gesturestart', e => {
  e.preventDefault();
  gs0 = appState.scale;
});
$('#scroller').addEventListener('gesturechange', e => {
  e.preventDefault();
  if (gs0) zoomTo(gs0 * e.scale, e.clientX, e.clientY);
});
$('#scroller').addEventListener('gestureend', () => (gs0 = null));
/* Two-finger pinch on touch screens; one finger keeps native scrolling. */
let pinch = null;
const tdist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY),
  tmid = t => [(t[0].clientX + t[1].clientX) / 2, (t[0].clientY + t[1].clientY) / 2];
$('#scroller').addEventListener(
  'touchstart',
  e => {
    if (e.touches.length === 2) {
      pinch = { d: tdist(e.touches), s: appState.scale };
      drag = null;
      document.body.classList.remove('dragging');
    }
  },
  { passive: true }
);
$('#scroller').addEventListener(
  'touchmove',
  e => {
    if (pinch && e.touches.length === 2) {
      e.preventDefault();
      const [mx, my] = tmid(e.touches);
      zoomTo((pinch.s * tdist(e.touches)) / pinch.d, mx, my);
    }
  },
  { passive: false }
);
$('#scroller').addEventListener('touchend', e => {
  if (e.touches.length < 2) pinch = null;
});
$('#theme').onclick = () => {
  const n = curTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = n;
  try {
    localStorage.setItem('supra.theme', n);
  } catch (e) {}
  renderTop();
};
$('#full').onclick = () => {
  const w = $('#work');
  if (document.fullscreenElement) {
    document.exitFullscreen?.();
    return;
  }
  if (document.body.classList.contains('focus')) {
    document.body.classList.remove('focus');
    renderTop();
    onViewport();
    return;
  }
  if (w.requestFullscreen)
    w.requestFullscreen().catch(() => {
      document.body.classList.add('focus');
      renderTop();
      onViewport();
    });
  else {
    document.body.classList.add('focus');
    renderTop();
    onViewport();
  }
};
document.addEventListener('fullscreenchange', () => {
  renderTop();
  requestAnimationFrame(onViewport);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.body.classList.contains('focus') && !drawerOpen) {
    document.body.classList.remove('focus');
    renderTop();
    onViewport();
  }
});
document.addEventListener(
  'toggle',
  e => {
    const d = e.target;
    if (d.matches && d.matches('details[data-sec]')) {
      d.open ? OPEN.add(d.dataset.sec) : OPEN.delete(d.dataset.sec);
    }
  },
  true
);
$('#undo').onclick = undo;
$('#backdrop').onclick = () => closeDrawer();
$('#save').onclick = () => savePlan(true);

export { isPhone, keepView, renderAll, renderPlan };
