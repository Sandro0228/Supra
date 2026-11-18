import { appState, esc, t } from './core.js';
import { P, where } from './state.js';
/* Table geometry, "Arrange tables", view rotation and seating rules. Part of the planner (app.html); see js/README.md. */
/* ---------------- geometry ---------------- */
const SP = 86;
function geo(x) {
  const n = x.seats.length,
    seats = [];
  let shape, w, h;
  const out = (px, py, ox, oy) => seats.push({ x: px, y: py, ox, oy });
  if (x.shape === 'round') {
    const rs = Math.max(92, (n * SP) / (2 * Math.PI)),
      r = rs - 26;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / n,
        ox = Math.cos(a),
        oy = Math.sin(a);
      out(ox * rs, oy * rs, ox, oy);
    }
    shape = { type: 'round', r };
    w = 2 * (rs + 104);
    h = 2 * (rs + 92);
  } else if (x.shape === 'square') {
    const per = [0, 0, 0, 0];
    for (let i = 0; i < n; i++) per[i % 4]++;
    const side = Math.max(...per, 1) * SP + 24,
      hs = side / 2;
    [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0]
    ].forEach(([ox, oy], k) => {
      const c = per[k];
      for (let i = 0; i < c; i++) {
        const o = (i - (c - 1) / 2) * SP;
        out(ox ? ox * (hs + 26) : o, oy ? oy * (hs + 26) : o, ox, oy);
      }
    });
    shape = { type: 'rect', w: side, h: side };
    w = side + 2 * 170;
    h = side + 2 * 100;
  } else if (x.shape === 'head') {
    const W = Math.max(n, 2) * SP + 24,
      H = 74;
    for (let i = 0; i < n; i++) out((i - (n - 1) / 2) * SP, -H / 2 - 26, 0, -1);
    shape = { type: 'rect', w: W, h: H };
    w = W + 20;
    h = H + 2 * 96;
  } else {
    const top = Math.ceil(n / 2),
      bot = n - top,
      W = Math.max(top, 1) * SP + 24,
      H = 120;
    for (let i = 0; i < top; i++) out((i - (top - 1) / 2) * SP, -H / 2 - 26, 0, -1);
    for (let i = 0; i < bot; i++) out((i - (bot - 1) / 2) * SP, H / 2 + 26, 0, 1);
    shape = { type: 'rect', w: W, h: H };
    w = W + 20;
    h = H + 2 * 96 + 8;
  }
  return { seats, shape, w, h };
}
function autoArrange() {
  const MAXW = 1000,
    GAP = 60,
    rows = [];
  let row = [],
    rw = 0;
  appState.S.tables.forEach(x => {
    const [gw, gh] = dims(x),
      g = { w: gw, h: gh };
    if (row.length && rw + GAP + g.w > MAXW) {
      rows.push(row);
      row = [];
      rw = 0;
    }
    row.push({ x, g });
    rw += (row.length > 1 ? GAP : 0) + g.w;
  });
  if (row.length) rows.push(row);
  let y = 0;
  rows.forEach(r => {
    const tw = r.reduce((a, o) => a + o.g.w, 0) + GAP * (r.length - 1),
      rh = Math.max(...r.map(o => o.g.h));
    let cx = -tw / 2;
    r.forEach(o => {
      o.x.x = Math.round(cx + o.g.w / 2);
      o.x.y = Math.round(y + rh / 2);
      cx += o.g.w + GAP;
    });
    y += rh + GAP;
  });
  let vx = -500;
  appState.S.venue.forEach(v => {
    v.x = vx + v.w / 2;
    v.y = y + v.h / 2;
    vx += v.w + 40;
  });
}
/* ---------------- arrange tables ----------------
   A grid of guest tables in rows, the head table centred on top, optional room items lined up between them.
   Wider gaps ("aisles") go after the rows and columns the planner picks. Pure: returns positions, changes nothing. */
const AISLE = { normal: 140, wide: 220, xwide: 320 },
  GAP = 60,
  SECTION = 100; // GAP ≥ resolveOverlaps' clearance, so arranged tables never get nudged
function arrangeDefaults() {
  const n = appState.S.tables.filter(x => x.shape !== 'head').length || 1;
  const o = appState.S.layout || {};
  const rows = Math.min(n, Math.max(1, o.rows || Math.round(Math.sqrt(n / 1.6)) || 1));
  return {
    orient: o.orient === 'vertical' ? 'vertical' : 'horizontal',
    rows,
    rowAisles: (o.rowAisles || []).filter(i => i < rows - 1),
    colAisles: o.colAisles || [],
    aisle: AISLE[o.aisle] ? o.aisle : 'wide',
    venue: o.venue !== false
  };
}
function arrangeLayout(o) {
  const heads = appState.S.tables.filter(x => x.shape === 'head'),
    guests = appState.S.tables.filter(x => x.shape !== 'head'),
    n = guests.length;
  const R = Math.min(Math.max(1, o.rows | 0), Math.max(1, n)),
    C = Math.max(1, Math.ceil(n / R)),
    out = { tables: {}, venue: {}, R, C, bands: [] };
  const rotOf = x => (x.shape === 'rect' ? (o.orient === 'vertical' ? 90 : 0) : 0);
  const size = x => {
    const g = geo(x);
    return rbox(g.w, g.h, rotOf(x));
  };
  const colW = Array(C).fill(0),
    rowH = Array(R).fill(0);
  guests.forEach((x, i) => {
    const r = Math.floor(i / C),
      c = i % C,
      [w, h] = size(x);
    colW[c] = Math.max(colW[c], w);
    rowH[r] = Math.max(rowH[r], h);
  });
  const gapAfter = (list, i) => (list.includes(i) ? AISLE[o.aisle] || AISLE.wide : GAP);
  const colX = [];
  let cx = 0;
  colW.forEach((w, c) => {
    colX[c] = cx + w / 2;
    cx += w + (c < C - 1 ? gapAfter(o.colAisles, c) : 0);
  });
  const gridW = cx;
  // head table(s) on top, side by side
  let y = 0;
  const hs = heads.map(x => {
    const g = geo(x);
    return [g.w, g.h];
  });
  if (heads.length) {
    const hw = hs.reduce((a, [w]) => a + w, 0) + GAP * (heads.length - 1),
      hh = Math.max(...hs.map(([, h]) => h));
    let hx = -hw / 2;
    heads.forEach((x, i) => {
      out.tables[x.id] = { x: Math.round(hx + hs[i][0] / 2), y: Math.round(hh / 2), rot: 0 };
      hx += hs[i][0] + GAP;
    });
    y = hh + SECTION;
  }
  // room items in one row under the head table, keeping their left-to-right order
  if (o.venue && appState.S.venue.length) {
    const vs = [...appState.S.venue].sort((a, b) => (a.x || 0) - (b.x || 0)),
      dims = vs.map(v => rbox(v.w, v.h, v.rot)),
      vw = dims.reduce((a, [w]) => a + w, 0) + GAP * (vs.length - 1),
      vh = Math.max(...dims.map(([, h]) => h));
    let vx = -vw / 2;
    vs.forEach((v, i) => {
      out.venue[v.id] = { x: Math.round(vx + dims[i][0] / 2), y: Math.round(y + vh / 2) };
      vx += dims[i][0] + GAP;
    });
    y += vh + SECTION;
  } else if (!o.venue && appState.S.venue.length) {
    appState.S.venue.forEach(v => {
      const [, h] = rbox(v.w, v.h, v.rot);
      y = Math.max(y, (v.y || 0) + h / 2 + SECTION);
    });
  }
  // the grid, centred under everything above it
  const x0 = -gridW / 2;
  let ry = y;
  const rowY = [];
  rowH.forEach((h, r) => {
    rowY[r] = ry + h / 2;
    ry += h + (r < R - 1 ? gapAfter(o.rowAisles, r) : 0);
  });
  guests.forEach((x, i) => {
    const r = Math.floor(i / C),
      c = i % C;
    out.tables[x.id] = { x: Math.round(x0 + colX[c]), y: Math.round(rowY[r]), rot: rotOf(x) };
  });
  // aisles, for the preview
  o.rowAisles
    .filter(i => i < R - 1)
    .forEach(i => out.bands.push({ k: 'row', x: x0, y: rowY[i] + rowH[i] / 2, w: gridW, h: gapAfter(o.rowAisles, i) }));
  o.colAisles
    .filter(i => i < C - 1)
    .forEach(i =>
      out.bands.push({ k: 'col', x: x0 + colX[i] + colW[i] / 2, y, w: gapAfter(o.colAisles, i), h: ry - y })
    );
  return out;
}
function applyArrangement(o) {
  const L = arrangeLayout(o);
  appState.S.tables.forEach(x => {
    const p = L.tables[x.id];
    if (p) {
      x.x = p.x;
      x.y = p.y;
      x.rot = p.rot;
    }
  });
  appState.S.venue.forEach(v => {
    const p = L.venue[v.id];
    if (p) {
      v.x = p.x;
      v.y = p.y;
    }
  });
  appState.S.layout = {
    orient: o.orient,
    rows: o.rows,
    rowAisles: o.rowAisles,
    colAisles: o.colAisles,
    aisle: o.aisle,
    venue: o.venue
  };
}
/* Small picture of the arrangement for the panel: table footprints, room items, aisles. */
function arrangePreview(o) {
  const L = arrangeLayout(o),
    p = P();
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity,
    s = '';
  const box = (cx, cy, w, h) => {
    x0 = Math.min(x0, cx - w / 2);
    x1 = Math.max(x1, cx + w / 2);
    y0 = Math.min(y0, cy - h / 2);
    y1 = Math.max(y1, cy + h / 2);
  };
  appState.S.tables.forEach(x => {
    const q = L.tables[x.id],
      g = geo(x),
      [w, h] = rbox(g.w, g.h, q.rot);
    box(q.x, q.y, w, h);
  });
  appState.S.venue.forEach(v => {
    const q = L.venue[v.id] || v,
      [w, h] = rbox(v.w, v.h, v.rot);
    box(q.x, q.y, w, h);
  });
  L.bands.forEach(
    b => (s += `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="${p.accent}" opacity=".16"/>`)
  );
  appState.S.venue.forEach(v => {
    const q = L.venue[v.id] || v,
      [w, h] = rbox(v.w, v.h, v.rot);
    s += `<rect x="${q.x - w / 2}" y="${q.y - h / 2}" width="${w}" height="${h}" rx="8" fill="none" stroke="${p.edge}" stroke-width="6" stroke-dasharray="14 10"/>`;
  });
  appState.S.tables.forEach(x => {
    const q = L.tables[x.id],
      g = geo(x);
    s +=
      g.shape.type === 'round'
        ? `<circle cx="${q.x}" cy="${q.y}" r="${g.shape.r}" fill="${p.cloth}" stroke="${p.accent}" stroke-width="6"/>`
        : `<rect x="${-g.shape.w / 2}" y="${-g.shape.h / 2}" width="${g.shape.w}" height="${g.shape.h}" rx="10" transform="translate(${q.x} ${q.y}) rotate(${q.rot})" fill="${x.shape === 'head' ? p.accent : p.cloth}" fill-opacity="${x.shape === 'head' ? 0.35 : 1}" stroke="${p.accent}" stroke-width="6"/>`;
  });
  const pad = 40;
  return {
    svg: `<svg viewBox="${x0 - pad} ${y0 - pad} ${x1 - x0 + 2 * pad} ${y1 - y0 + 2 * pad}" role="img" aria-label="${esc(t('arrPreviewA11y', { rows: L.R, cols: L.C }))}" class="arrprev"><rect x="${x0 - pad}" y="${y0 - pad}" width="${x1 - x0 + 2 * pad}" height="${y1 - y0 + 2 * pad}" fill="${p.floor}"/>${s}</svg>`,
    R: L.R,
    C: L.C
  };
}
/* ---------------- view rotation ----------------
   Turns the picture only, in 90° steps, for this viewer on this device. The saved plan keeps its own coordinates,
   so downloads, the guest page for other people and every saved position stay exactly as they are. */
let VROT = null;
const vKey = () => 'supra.view.' + (appState.ROW?.id || appState.SLUG || 'plan');
function vrot() {
  if (VROT == null) {
    let v = 0;
    try {
      v = +localStorage.getItem(vKey()) || 0;
    } catch (e) {}
    VROT = [0, 90, 180, 270].includes(v) ? v : 0;
  }
  return VROT;
}
function turnView() {
  VROT = (vrot() + 90) % 360;
  try {
    localStorage.setItem(vKey(), String(VROT));
  } catch (e) {}
  return VROT;
}
const r2 = v => Math.round(v * 100) / 100;
function toView(x, y) {
  const [a, b] = rot(x, y, vrot());
  return [r2(a), r2(b)];
}
function toWorld(x, y) {
  const [a, b] = rot(x, y, -vrot());
  return [r2(a), r2(b)];
}
/* Runs fn with S.tables and S.venue swapped for turned copies (same ids and seat lists), then puts the real ones back. */
function withView(fn) {
  if (!vrot()) return fn();
  const T0 = appState.S.tables,
    V0 = appState.S.venue;
  appState.S.tables = T0.map(x => {
    const [a, b] = toView(x.x, x.y);
    return Object.assign({}, x, { x: a, y: b, rot: ((x.rot || 0) + VROT) % 360 });
  });
  appState.S.venue = V0.map(v => {
    const [a, b] = toView(v.x, v.y);
    return Object.assign({}, v, { x: a, y: b, rot: ((v.rot || 0) + VROT) % 360 });
  });
  try {
    return fn();
  } finally {
    appState.S.tables = T0;
    appState.S.venue = V0;
  }
}
function rbox(w, h, deg) {
  const a = ((deg || 0) * Math.PI) / 180,
    c = Math.abs(Math.cos(a)),
    n = Math.abs(Math.sin(a));
  return [w * c + h * n, w * n + h * c];
}
function rot(x, y, deg) {
  const a = ((deg || 0) * Math.PI) / 180,
    c = Math.cos(a),
    n = Math.sin(a);
  return [x * c - y * n, x * n + y * c];
}
function dims(x) {
  const g = geo(x);
  return rbox(g.w, g.h, x.rot);
}
function resolveOverlaps() {
  const pad = 50,
    R = x => {
      const [w, h] = dims(x);
      return { x0: x.x - w / 2, x1: x.x + w / 2, y0: x.y - h / 2, y1: x.y + h / 2 };
    };
  let moved = false;
  const ts = [...appState.S.tables].sort((a, b) => a.y - b.y);
  for (let i = 1; i < ts.length; i++)
    for (let j = 0; j < i; j++) {
      const A = R(ts[j]),
        B = R(ts[i]);
      if (B.x0 < A.x1 + pad && B.x1 > A.x0 - pad && B.y0 < A.y1 + pad && B.y1 > A.y0 - pad) {
        ts[i].y += Math.ceil(A.y1 + pad - B.y0);
        moved = true;
      }
    }
  return moved;
}
function bounds() {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  appState.S.tables.forEach(x => {
    const [w, h] = dims(x);
    x0 = Math.min(x0, x.x - w / 2);
    x1 = Math.max(x1, x.x + w / 2);
    y0 = Math.min(y0, x.y - h / 2);
    y1 = Math.max(y1, x.y + h / 2);
  });
  appState.S.venue.forEach(v => {
    const [w, h] = rbox(v.w, v.h, v.rot);
    x0 = Math.min(x0, v.x - w / 2 - 30);
    x1 = Math.max(x1, v.x + w / 2 + 30);
    y0 = Math.min(y0, v.y - h / 2 - 30);
    y1 = Math.max(y1, v.y + h / 2 + 30);
  });
  if (!isFinite(x0)) {
    x0 = -400;
    x1 = 400;
    y0 = 0;
    y1 = 300;
  }
  // at least 800 wide, and not much narrower than tall, so the hall reads as a room
  const w = Math.max(x1 - x0, 800, (y1 - y0 + 310) * 0.8 - 100);
  const cx = (x0 + x1) / 2;
  x0 = cx - w / 2;
  x1 = cx + w / 2;
  // 160 above for the title and windows, 150 below for the entrance
  return { x: x0 - 50, y: y0 - 160, w: x1 - x0 + 100, h: y1 - y0 + 310 };
}

/* ---------------- rules ---------------- */
function ruleBroken(r) {
  const a = where(r.a),
    b = where(r.b);
  if (!a || !b) return false;
  return r.type === 'together' ? a.t !== b.t : a.t === b.t;
}
function brokenSet() {
  const s = new Set();
  appState.S.rules.forEach(r => {
    if (ruleBroken(r)) {
      s.add(r.a);
      s.add(r.b);
    }
  });
  return s;
}

export {
  applyArrangement,
  arrangeDefaults,
  arrangePreview,
  autoArrange,
  bounds,
  brokenSet,
  dims,
  geo,
  rbox,
  resolveOverlaps,
  rot,
  ruleBroken,
  toView,
  toWorld,
  turnView,
  withView
};
