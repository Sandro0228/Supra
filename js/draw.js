import { IMG, NAT, SIDE_COL, appState, chairM, esc, person, shade, t, tn, use } from './core.js';
import { P, tName } from './state.js';
import { bounds, brokenSet, dims, geo, rot } from './layout.js';
import { gDate } from './guest.js';
import { invGuestStatus } from './invites.js';
// Vertical middle of a seated figure with its chair (chairM spans y −47…30), used to turn it upright in place.
const FIG_CY = -8.6;
/* Drawing the plan as SVG. Part of the planner (app.html); see js/README.md. */
/* ---------------- plan drawing ---------------- */
function decoAt(kind, x, y, w) {
  const key = { flowers: 'deco_flowers', candles: 'deco_candles', greenery: 'deco_greenery' }[kind];
  if (!key) return '';
  const n = NAT[key],
    sc = w / n[0],
    h = n[1] * sc;
  return `<g transform="translate(${(x - w / 2).toFixed(1)} ${(y - h / 2).toFixed(1)}) scale(${sc.toFixed(4)})">${use(key)}</g>`;
}
function strip(key, x0, x1, y, hgt) {
  const n = NAT[key],
    L = (n[0] * hgt) / n[1],
    n2 = Math.max(1, Math.round((x1 - x0) / (L * 0.9))),
    step = (x1 - x0) / n2,
    tw = step * 1.08;
  let s = '';
  for (let i = 0; i < n2; i++) {
    const cx = x0 + step * (i + 0.5);
    s += `<g transform="translate(${(cx - tw / 2).toFixed(1)} ${(y - hgt / 2).toFixed(1)}) scale(${(tw / n[0]).toFixed(4)} ${(hgt / n[1]).toFixed(4)})">${use(key)}</g>`;
  }
  return s;
}
function setting(x, y, ang) {
  const n = NAT.setting,
    w = 40,
    sc = w / n[0],
    h = n[1] * sc;
  // one element per place setting (a plan has one per seat): the three transforms in a single attribute
  return use(
    'setting',
    `transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${ang + 180}) translate(${-w / 2} ${(-h / 2).toFixed(1)}) scale(${sc.toFixed(4)})"`
  );
}
function clothRect(id, shape, w, h, isSel, p) {
  // plain cloth crop: surface spans x 90..1640, y 8..400 of 1723x544; slices L 0-262, M 258-1462, R 1458-1723
  const sy = h / 392,
    top = -h / 2 - 8 * sy,
    sq = shape === 'square',
    sx = sq ? w / 350 : sy;
  let s = `<defs><clipPath id="ct_${id}"><rect x="${-w / 2 - 60}" y="${-h / 2 - 30}" width="${w + 120}" height="${h + 36}"/></clipPath></defs><g clip-path="url(#ct_${id})">`;
  s += `<g transform="translate(${(-w / 2 - 90 * sx).toFixed(1)} ${top.toFixed(1)}) scale(${sx.toFixed(4)} ${sy.toFixed(4)})">${use('tbl_L')}</g>`;
  if (!sq) {
    const x0 = -w / 2 + 168 * sy,
      x1 = w / 2 - 178 * sy;
    s += `<g transform="translate(${x0.toFixed(1)} ${top.toFixed(1)}) scale(${((x1 - x0) / 1204).toFixed(4)} ${sy.toFixed(4)})">${use('tbl_M')}</g>`;
  }
  s += `<g transform="translate(${(w / 2 - 182 * sx).toFixed(1)} ${top.toFixed(1)}) scale(${sx.toFixed(4)} ${sy.toFixed(4)})">${use('tbl_R')}</g></g>`;
  if (isSel)
    s += `<rect x="${-w / 2 - 4}" y="${-h / 2 - 4}" width="${w + 8}" height="${h + 8}" rx="8" fill="none" stroke="${p.accent}" stroke-width="3" stroke-dasharray="8 5"/>`;
  return s;
}
function clothRound(id, r, isSel, p) {
  const sx = r / 502,
    sy = r / 390;
  return `<defs><clipPath id="ct_${id}"><circle cx="0" cy="2" r="${r + 7}"/></clipPath></defs><g clip-path="url(#ct_${id})"><g transform="translate(${(-598 * sx).toFixed(1)} ${(-390 * sy).toFixed(1)}) scale(${sx.toFixed(4)} ${sy.toFixed(4)})">${use('tbl_round')}</g></g>${isSel ? `<circle r="${r + 5}" fill="none" stroke="${p.accent}" stroke-width="3" stroke-dasharray="8 5"/>` : ''}`;
}
const NAMEFONT = 'Noto Serif Georgian, Noto Sans Georgian, Georgia, serif',
  BODYFONT = 'Noto Sans Georgian, system-ui, sans-serif';
function nameCard(x, y, G, p, bad) {
  const parts = String(G.name || '')
    .trim()
    .split(/\s+/);
  const a = parts[0] || '',
    b = parts.slice(1).join(' ');
  const fit = (s, sz) => (s.length * sz * 0.62 > 76 ? `textLength="76" lengthAdjust="spacingAndGlyphs"` : '');
  const sc = SIDE_COL[G.side];
  return `<rect x="${x - 45}" y="${y - 16}" width="90" height="32" rx="6" fill="#FFFFFF" stroke="${bad ? '#C0392B' : p.edge}" stroke-width="${bad ? 2 : 0.9}"/>
  ${sc ? `<rect x="${x - 45}" y="${y - 16}" width="5" height="32" rx="2" fill="${sc}"/>` : ''}
  <text x="${x + 2}" y="${b ? y - 2 : y + 4}" text-anchor="middle" font-family="${NAMEFONT}" font-weight="700" font-size="11" fill="${p.ink}" ${fit(a, 11)}>${esc(a)}</text>
  ${b ? `<text x="${x + 2}" y="${y + 10}" text-anchor="middle" font-family="${BODYFONT}" font-size="8.6" fill="${shade(p.ink, 30)}" ${fit(b, 8.6)}>${esc(b)}</text>` : ''}`;
}
function handle(kind, id, x, y, p) {
  return `<g class="rothandle" data-rk="${kind}" data-rid="${id}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><circle r="15" fill="#FFFFFF" stroke="${p.accent}" stroke-width="2"/><path d="M-6,-3 A7,7 0 1,1 -4,5" fill="none" stroke="${p.accent}" stroke-width="2" stroke-linecap="round"/><path d="M-9,-6 L-6,-2 L-2,-5" fill="none" stroke="${p.accent}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>`;
}
function stageM(v, p) {
  const x = -v.w / 2,
    y = -v.h / 2,
    w = v.w,
    h = v.h,
    wood = '#C99A63',
    dark = '#8C6239';
  let b = '';
  b += `<rect x="${x + 4}" y="${y + 6}" width="${w}" height="${h}" rx="6" fill="${shade(p.floor, -12)}"/>`;
  b += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${wood}" stroke="${dark}" stroke-width="1.5"/>`;
  for (let yy = y + 14; yy < y + h - 12; yy += 14)
    b += `<path d="M${x + 4},${yy} H${x + w - 4}" stroke="${dark}" stroke-width=".7" opacity=".45"/>`;
  for (let i = 0; i < Math.floor(w / 60); i++) {
    const xx = x + 30 + i * 60 + (i % 2) * 20;
    b += `<path d="M${xx},${y + 4} V${y + h - 12}" stroke="${dark}" stroke-width=".5" opacity=".3"/>`;
  }
  b += `<rect x="${x}" y="${y + h - 10}" width="${w}" height="10" rx="3" fill="${dark}"/>`;
  let cur = '';
  const n = Math.max(4, Math.round(w / 26));
  for (let i = 0; i < n; i++) {
    const cx = x + ((i + 0.5) * w) / n;
    cur += `${i ? '' : `M${x},${y}`} Q${cx.toFixed(1)},${y + 18} ${(x + ((i + 1) * w) / n).toFixed(1)},${y}`;
  }
  b += `<path d="${cur} Z" fill="${p.accent}" opacity=".85"/><rect x="${x}" y="${y - 5}" width="${w}" height="7" rx="3" fill="${shade(p.accent, -25)}"/>`;
  [[x + 16], [x + w - 40]].forEach(([sx]) => {
    b += `<rect x="${sx}" y="${y + h - 40}" width="24" height="26" rx="3" fill="#2A2A2C"/><circle cx="${sx + 12}" cy="${y + h - 27}" r="7" fill="#4A4A4E" stroke="#111" stroke-width="1.5"/>`;
  });
  b += `<circle cx="0" cy="${y + h - 24}" r="4" fill="#2A2A2C"/><circle cx="0" cy="${y + h - 24}" r="10" fill="none" stroke="#2A2A2C" stroke-width="1" opacity=".5"/>`;
  return b;
}
function barM(v, p) {
  const x = -v.w / 2,
    y = -v.h / 2,
    w = v.w,
    h = v.h,
    top = '#7A4E2D',
    edge = '#4E2F19',
    cd = Math.min(46, h * 0.55);
  let b = '';
  b += `<rect x="${x + 4}" y="${y + 6}" width="${w}" height="${cd}" rx="8" fill="${shade(p.floor, -12)}"/>`;
  b += `<rect x="${x}" y="${y}" width="${w}" height="${cd}" rx="8" fill="${top}" stroke="${edge}" stroke-width="1.5"/><rect x="${x + 5}" y="${y + 5}" width="${w - 10}" height="${cd - 16}" rx="5" fill="${shade(top, 14)}"/>`;
  const bc = ['#3F6E3A', '#8C5A1E', '#B23A52', '#D9B45A', '#2F4F6E'];
  const nb = Math.max(3, Math.floor((w - 30) / 18));
  for (let i = 0; i < nb; i++) {
    const cx = x + 15 + (i * (w - 30)) / (nb - 1 || 1);
    b += `<circle cx="${cx.toFixed(1)}" cy="${y + 12}" r="5" fill="${bc[i % bc.length]}" stroke="#00000033"/><circle cx="${cx.toFixed(1)}" cy="${y + 12}" r="1.8" fill="#FFFFFF" opacity=".7"/>`;
  }
  const ng = Math.max(2, Math.floor((w - 40) / 40));
  for (let i = 0; i < ng; i++) {
    const cx = x + 30 + (i * (w - 60)) / (ng - 1 || 1);
    b += `<circle cx="${cx.toFixed(1)}" cy="${y + cd - 9}" r="4.5" fill="#FFFFFF" stroke="#C8CFD6" stroke-width="1"/>`;
  }
  if (h > cd + 20) {
    const ns = Math.max(2, Math.floor(w / 48));
    for (let i = 0; i < ns; i++) {
      const cx = x + ((i + 0.5) * w) / ns;
      b += `<circle cx="${cx.toFixed(1)}" cy="${y + cd + 16}" r="11" fill="${p.chair}" stroke="${shade(p.chair, -30)}" stroke-width="1.2"/><circle cx="${cx.toFixed(1)}" cy="${y + cd + 16}" r="6" fill="${shade(p.chair, 15)}"/>`;
    }
  }
  return b;
}
function venueM(v, p, isSel, guest) {
  const lbl = v.label || t(v.type),
    x = -v.w / 2,
    y = -v.h / 2,
    r = v.rot || 0;
  let body = '';
  if (v.type === 'dance') {
    body = `<rect x="${x}" y="${y}" width="${v.w}" height="${v.h}" rx="6" fill="${shade(p.runner, 25)}" stroke="${p.edge}"/>`;
    const n = 8,
      cw = v.w / n,
      rows = Math.max(1, Math.round(v.h / cw));
    for (let i = 0; i < n; i++)
      for (let j = 0; j < rows; j++)
        if ((i + j) % 2)
          body += `<rect x="${x + i * cw}" y="${y + (j * v.h) / rows}" width="${cw}" height="${v.h / rows}" fill="${p.runner}" opacity=".45"/>`;
  } else if (v.type === 'cake')
    body = `<circle r="${Math.min(v.w, v.h) / 2}" fill="#FFFFFF" stroke="${p.edge}"/><circle r="${Math.min(v.w, v.h) / 2 - 12}" fill="${shade(p.fl[0], 10)}" stroke="${p.accent}" stroke-dasharray="3 3"/>`;
  else if (v.type === 'entrance')
    body = `<rect x="${x}" y="${y}" width="${v.w}" height="${v.h}" rx="4" fill="${p.cloth}" stroke="${p.ink}" stroke-width="1.5" stroke-dasharray="8 5"/>`;
  else if (v.type === 'stage') body = stageM(v, p);
  else if (v.type === 'bar') body = barM(v, p);
  else
    body = `<rect x="${x}" y="${y}" width="${v.w}" height="${v.h}" rx="10" fill="${p.cloth}" stroke="${p.edge}" stroke-width="1.2"/>`;
  const pill = v.type === 'stage' || v.type === 'bar',
    lw = Math.max(60, lbl.length * 8.4 + 24),
    ly = v.type === 'bar' ? y + Math.min(46, v.h * 0.55) / 2 + 4 : 0;
  const [lx, lyy] = rot(0, ly, r);
  return `<g class="venue" data-v="${v.id}"${guest ? '' : ` role="button" tabindex="0" aria-label="${esc(lbl || t(v.type))}"`} transform="translate(${v.x} ${v.y})"><g transform="rotate(${r})">${body}${isSel ? `<rect x="${x - 6}" y="${y - 8}" width="${v.w + 12}" height="${v.h + 14}" rx="10" fill="none" stroke="${p.accent}" stroke-width="2" stroke-dasharray="6 4"/>` : ''}</g>
  <g transform="translate(${lx.toFixed(1)} ${lyy.toFixed(1)})">${pill ? `<rect x="${-lw / 2}" y="-12" width="${lw}" height="24" rx="12" fill="#FFFFFF" stroke="${p.accent}" opacity=".95"/>` : ''}<text x="0" y="5" text-anchor="middle" font-family="Noto Serif Display, Noto Serif Georgian, Georgia, serif" font-size="15" fill="${p.ink}">${esc(lbl)}</text></g>
  ${
    isSel
      ? (() => {
          const [hx, hy] = rot(0, y - 34, r);
          return (
            `<path d="M0,0 L${hx.toFixed(1)},${hy.toFixed(1)}" stroke="${p.accent}" stroke-width="1" stroke-dasharray="3 3" opacity=".6" pointer-events="none"/>` +
            handle('venue', v.id, hx, hy, p)
          );
        })()
      : ''
  }</g>`;
}
function seatLabel(x, i, G) {
  const where = tName(x) + ', ' + t('seat') + ' ' + (i + 1),
    no = G && !G.anon && invGuestStatus(G.id) === 'no';
  return G
    ? (G.anon ? t('takenSeat') : G.name) + (no ? ' (' + t('invSt_declined') + ')' : '') + ' — ' + where
    : t('emptySeat') + ' — ' + where;
}
/* The room around the plan, all seen from above like the floor plan itself: parquet softened with the palette
   colour, walls with windows that let daylight onto the floor, olive trees in the corners, and the entrance in the
   middle of the bottom wall (open doors, a runner and two flower arrangements). Drawings come from img/ (floor,
   tree_top, flowers_top, runner) and are skipped if they haven't loaded. Only the guests are drawn from the front. */
const WALL = 18,
  WALL_COL = '#F4ECDF',
  DOOR_W = 110,
  TREE = 84;
function art(k, x, y, w, h) {
  const n = NAT[k];
  if (!n || !IMG[k]) return '';
  return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${(w / n[0]).toFixed(4)} ${(h / n[1]).toFixed(4)})">${use(k)}</g>`;
}
const artH = (k, x, y, h) => (NAT[k] ? art(k, x, y, (h * NAT[k][0]) / NAT[k][1], h) : '');
/* A window in the wall: glass with a frame, and daylight falling into the room. side: 't', 'l' or 'r'. */
function windowAt(side, a, len) {
  const glass = `fill="#EEF4F3" stroke="${shade(WALL_COL, -40)}" stroke-width="1.5"`;
  if (side === 't') {
    const { x, y } = a;
    return (
      `<path d="M${x},${y + WALL} L${x + len},${y + WALL} L${x + len + 18},${y + WALL + 110} L${x - 18},${y + WALL + 110} Z" fill="url(#gSunT)"/>` +
      `<rect x="${x}" y="${y + WALL / 2 - 4}" width="${len}" height="8" ${glass}/><path d="M${x + len / 2},${y + WALL / 2 - 4} v8" stroke="${shade(WALL_COL, -40)}" stroke-width="1.5"/>`
    );
  }
  const { x, y } = a,
    dir = side === 'l' ? 1 : -1,
    inner = x + dir * WALL,
    far = inner + dir * 110;
  return (
    `<path d="M${inner},${y} L${inner},${y + len} L${far},${y + len + 18} L${far},${y - 18} Z" fill="url(#gSun${side.toUpperCase()})"/>` +
    `<rect x="${x + dir * (WALL / 2) - 4}" y="${y}" width="8" height="${len}" ${glass}/><path d="M${x + dir * (WALL / 2) - 4},${y + len / 2} h8" stroke="${shade(WALL_COL, -40)}" stroke-width="1.5"/>`
  );
}
function hall(B, p) {
  const { x, y, w, h } = B,
    cx = x + w / 2,
    tile = 300,
    sun = (id, x1, y1, x2, y2) =>
      `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="#FFFBEF" stop-opacity=".38"/><stop offset="1" stop-color="#FFFBEF" stop-opacity="0"/></linearGradient>`;
  let s =
    `<defs><pattern id="pFloor" patternUnits="userSpaceOnUse" x="${x}" y="${y}" width="${tile}" height="${tile}">` +
    (IMG.floor ? `<g transform="scale(${tile / NAT.floor[0]})">${use('floor')}</g>` : '') +
    `</pattern><radialGradient id="gPool"><stop offset="0" stop-color="#FFF6E2" stop-opacity=".75"/><stop offset=".6" stop-color="#FFF6E2" stop-opacity=".35"/><stop offset="1" stop-color="#FFF6E2" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="gHall" cx=".5" cy=".45" r=".75"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#3A2A1C" stop-opacity=".16"/></radialGradient>` +
    sun('gSunT', 0, 0, 0, 1) +
    sun('gSunL', 0, 0, 1, 0) +
    sun('gSunR', 1, 0, 0, 0) +
    `</defs>`;
  s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${p.floor}"/>`;
  if (IMG.floor)
    s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#pFloor)"/><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${p.floor}" opacity=".5"/>`;
  s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#gHall)"/>`;
  // windows first, so their daylight lies under the walls and everything in the room
  const half = Math.max(200, ((appState.S.event.name || t('wedding')).length * 19) / 2 + 40), // clear of the event name
    WIN = 92,
    STEP = 230;
  let win = '';
  for (const [a, b] of [
    [x + WALL + TREE + 30, cx - half],
    [cx + half, x + w - WALL - TREE - 30]
  ]) {
    const n = Math.max(0, Math.floor((b - a - WIN) / STEP) + 1);
    const start = a + (b - a - (n - 1) * STEP - WIN) / 2;
    for (let i = 0; i < n; i++) win += windowAt('t', { x: start + i * STEP, y }, WIN);
  }
  {
    const a = y + 220,
      b = y + h - 220,
      n = Math.max(0, Math.floor((b - a - WIN) / STEP) + 1),
      start = a + (b - a - (n - 1) * STEP - WIN) / 2;
    for (let i = 0; i < n; i++)
      win += windowAt('l', { x, y: start + i * STEP }, WIN) + windowAt('r', { x: x + w, y: start + i * STEP }, WIN);
  }
  // walls, with the windows set into them
  s += `<rect x="${x + WALL / 2}" y="${y + WALL / 2}" width="${w - WALL}" height="${h - WALL}" fill="none" stroke="${WALL_COL}" stroke-width="${WALL}"/><rect x="${x + WALL}" y="${y + WALL}" width="${w - 2 * WALL}" height="${h - 2 * WALL}" fill="none" stroke="${shade(WALL_COL, -28)}" stroke-width="1.5"/>`;
  s += win;
  // the entrance: a gap in the bottom wall, both doors open against the wall, a runner and flowers on either side
  const by = y + h - WALL,
    dl = cx - DOOR_W / 2,
    dr = cx + DOOR_W / 2,
    leaf = DOOR_W / 2,
    wood = '#B98A5E';
  s += `<ellipse cx="${cx}" cy="${by}" rx="${DOOR_W * 1.3}" ry="70" fill="url(#gPool)"/>`;
  s += `<rect x="${dl}" y="${by - 1}" width="${DOOR_W}" height="${WALL + 2}" fill="${shade(WALL_COL, -10)}"/>`;
  if (IMG.runner) s += art('runner', cx - 34, by - 140, 68, 140);
  s += `<rect x="${dl - 3}" y="${by - leaf}" width="7" height="${leaf}" rx="1.5" fill="${wood}" stroke="${shade(wood, -35)}" stroke-width="1"/><rect x="${dr - 3}" y="${by - leaf}" width="7" height="${leaf}" rx="1.5" fill="${wood}" stroke="${shade(wood, -35)}" stroke-width="1"/>`;
  s += artH('flowers_top', dl - 86, by - 76, 70) + artH('flowers_top', dr + 16, by - 76, 70);
  // olive trees in the corners
  const tx0 = x + WALL + 6,
    tx1 = x + w - WALL - 6 - TREE,
    ty0 = y + WALL + 6,
    ty1 = y + h - WALL - 6 - TREE;
  s +=
    artH('tree_top', tx0, ty0, TREE) +
    artH('tree_top', tx1, ty0, TREE) +
    artH('tree_top', tx0, ty1, TREE) +
    artH('tree_top', tx1, ty1, TREE);
  return s;
}
function planSVG(opt = {}) {
  const p = P(),
    B = bounds(),
    broken = opt.guest ? new Set() : brokenSet();
  // The drawing is a list of pieces (hall, title, each venue item, each table, legend). renderPlan() replaces only
  // the pieces whose markup changed, so typing a name or seating one guest doesn't rebuild a 1000-guest hall.
  const parts = [],
    add = (k, h) => parts.push({ k, h });
  add('hall', hall(B, p));
  let s = '';
  const seated = appState.S.tables.reduce((a, x) => a + x.seats.filter(Boolean).length, 0);
  const date = gDate();
  const cx = B.x + B.w / 2;
  s += `<text x="${cx}" y="${B.y + 70}" text-anchor="middle" font-family="Noto Serif Display, Noto Serif Georgian, Georgia, serif" font-size="38" fill="${p.ink}">${esc(appState.S.event.name || t('wedding'))}</text>`;
  s += `<text x="${cx}" y="${B.y + 102}" text-anchor="middle" font-family="${BODYFONT}" font-size="15" fill="${p.accent}" letter-spacing="1">${esc([date, tn('nGuests', seated), tn('nTables', appState.S.tables.length)].filter(Boolean).join('  ·  '))}</text>`;
  s += `<path d="M${cx - 70},${B.y + 116} H${cx + 70}" stroke="${p.accent}" stroke-width="1"/>`;
  add('title', s);
  s = '';
  appState.S.tables.forEach(x => {
    const [w, h] = dims(x);
    s += `<ellipse cx="${x.x}" cy="${x.y}" rx="${(w * 0.62).toFixed(0)}" ry="${(h * 0.62).toFixed(0)}" fill="url(#gPool)"/>`;
  });
  add('pools', s);
  appState.S.venue.forEach(v =>
    add(
      'v:' + v.id,
      `<g opacity="${opt.dim ? 0.5 : 1}">${venueM(v, p, !opt.guest && appState.sel.kind === 'venue' && appState.sel.v === v.id, opt.guest)}</g>`
    )
  );
  appState.S.tables.forEach(x => {
    const g = geo(x),
      isSel = !opt.guest && ((appState.sel.kind === 'table' && appState.sel.t === x.id) || appState.swapFrom === x.id),
      dim = opt.dim && opt.dim !== x.id;
    const tA = opt.guest
      ? ''
      : ` role="button" tabindex="0" aria-label="${esc(t('tableA11y', { n: tName(x), occupied: x.seats.filter(Boolean).length, capacity: x.seats.length }))}"`;
    const R0 = x.rot || 0;
    let tb = `<g class="tgrp" data-tg="${x.id}" transform="translate(${x.x} ${x.y})" opacity="${dim ? 0.3 : 1}"><g transform="rotate(${R0})">`;
    g.seats.forEach((st, i) => {
      const gid = x.seats[i],
        G = gid && appState.S.guests[gid],
        ang = (Math.atan2(-st.oy, -st.ox) * 180) / Math.PI - 90;
      const on =
        (!opt.guest && appState.sel.kind === 'seat' && appState.sel.t === x.id && appState.sel.i === i) ||
        (opt.hi && opt.hi === gid);
      // one seat per table is in the Tab order (the last one used there); arrow keys move between the others
      const tabi = i === Math.min(appState.seatFocus[x.id] || 0, x.seats.length - 1) ? 0 : -1;
      tb += `<g class="seat${G && !G.ghost ? '' : ' empty'}" data-t="${x.id}" data-i="${i}" ${opt.guest ? '' : `role="button" tabindex="${tabi}" aria-label="${esc(seatLabel(x, i, G))}"`}><g transform="translate(${st.x.toFixed(1)} ${st.y.toFixed(1)}) rotate(${ang.toFixed(1)})">`;
      tb += `<circle class="ring" r="40" fill="${p.accent}" opacity="${on ? 0.32 : 0}"/>`;
      // The drawings are front-facing portraits: turn them back upright on screen, around their middle, so guests
      // on the far side of a table aren't upside down. The seat itself still faces the table.
      const up = (((-(R0 + ang) % 360) + 540) % 360) - 180;
      if (Math.abs(up) > 0.5) tb += `<g transform="rotate(${up.toFixed(1)} 0 ${FIG_CY})">`;
      const no = opt.rsvp && G && !G.anon && invGuestStatus(gid) === 'no'; // on screen only, never in printed plans
      tb += '<g class="fig">'; // its own group, so CSS animations don't fight the transforms above
      tb +=
        G && G.ghost
          ? chairM(p)
          : G
            ? no
              ? `<g class="rsvpno" opacity=".38" style="filter:grayscale(1)">${person(G, p)}</g><g class="rsvpbadge" transform="translate(17 -40)"><circle r="10" fill="#FFFFFF" stroke="${p.accent}" stroke-width="2"/><path d="M-4,-4 L4,4 M4,-4 L-4,4" stroke="${p.accent}" stroke-width="2.2" stroke-linecap="round"/></g>`
              : person(G, p)
            : chairM(p) +
              `<circle cx="0" cy="-8" r="13" fill="#FFFFFF" opacity=".7" stroke="${shade(p.chair, -30)}" stroke-dasharray="3 3"/><path d="M-5,-8 H5 M0,-13 V-3" stroke="${shade(p.chair, -35)}" stroke-width="1.5"/>`;
      tb += Math.abs(up) > 0.5 ? `</g></g></g></g>` : `</g></g></g>`;
    });
    if (g.shape.type === 'round') {
      const r = g.shape.r;
      tb += `<g class="tbody" data-table="${x.id}"${tA}>` + clothRound(x.id, r, isSel, p);
      g.seats.forEach(
        st => (tb += setting(st.ox * (r - 24), st.oy * (r - 24), (Math.atan2(-st.oy, -st.ox) * 180) / Math.PI - 90))
      );
      if (x.deco === 'mixed')
        tb += decoAt('flowers', 0, -4, Math.min(110, r * 1.05)) + decoAt('candles', 0, r * 0.32, Math.min(70, r * 0.6));
      else if (x.deco !== 'none') tb += decoAt(x.deco, 0, 6, Math.min(x.deco === 'greenery' ? 140 : 110, r * 1.2));
    } else {
      const { w, h } = g.shape;
      tb += `<g class="tbody" data-table="${x.id}"${tA}>` + clothRect(x.id, x.shape, w, h, isSel, p);
      g.seats.forEach(st => {
        const ang = (Math.atan2(-st.oy, -st.ox) * 180) / Math.PI - 90;
        tb += setting(st.x - st.ox * (26 + 22), st.y - st.oy * (26 + 21), ang);
      });
      if (x.shape === 'square') {
        if (x.deco !== 'none') tb += decoAt(x.deco === 'mixed' ? 'flowers' : x.deco, 0, 0, Math.min(110, w * 0.55));
      } else if (x.deco !== 'none') {
        const head = x.shape === 'head',
          ry = head ? h / 2 - 16 : 0,
          gh = head ? 30 : h * 0.36,
          x0 = -w / 2 + 14,
          x1 = w / 2 - 14;
        if (x.deco === 'flowers' || x.deco === 'mixed')
          tb += strip(x.deco === 'mixed' ? 'garland_mixed' : 'garland_flowers', x0, x1, ry, gh);
        else if (x.deco === 'greenery') tb += strip('deco_greenery', x0, x1, ry, gh * 0.8);
        else {
          const n = Math.max(1, Math.round((w - 24) / 140));
          for (let k = 0; k < n; k++) {
            const px = -w / 2 + 12 + ((k + 0.5) * (w - 24)) / n;
            if (Math.abs(px) < 55 && n > 1) continue;
            tb += decoAt('candles', px, ry, head ? 30 : 44);
          }
        }
      }
    }
    const nm = tName(x),
      lw = Math.max(80, nm.length * 8.6 + 28),
      ly = g.shape.type === 'round' ? (x.deco === 'none' ? 0 : -g.shape.r + 46) : x.shape === 'head' ? -10 : 0;
    tb += `</g></g>`;
    const [plx, ply] = rot(0, ly, R0);
    tb += `<g pointer-events="none"><rect x="${(plx - lw / 2).toFixed(1)}" y="${(ply - 13).toFixed(1)}" width="${lw}" height="26" rx="13" fill="#FFFFFF" stroke="${p.accent}" stroke-width="1"/><text x="${plx.toFixed(1)}" y="${(ply + 5).toFixed(1)}" text-anchor="middle" font-family="Noto Serif Display, Noto Serif Georgian, Georgia, serif" font-size="14" fill="${p.ink}">${esc(nm)}</text></g>`;
    g.seats.forEach((st, i) => {
      const G = x.seats[i] && appState.S.guests[x.seats[i]];
      if (G && !G.anon) {
        const d = 48 + 46 * Math.abs(st.ox) + 18 * Math.abs(st.oy);
        const [cx, cy] = rot(st.x + st.ox * d, st.y + st.oy * d, R0);
        tb += nameCard(cx, cy, G, p, broken.has(G.id));
      }
    });
    if (!opt.guest) {
      const [ax, ay] = rot(
        g.shape.type === 'round' ? g.shape.r + 50 : g.shape.w / 2 + 10,
        g.shape.type === 'round' ? -g.shape.r - 6 : 4,
        R0
      );
      tb += `<text x="${ax.toFixed(1)}" y="${ay.toFixed(1)}" font-family="${BODYFONT}" font-size="11" fill="${p.accent}">${x.seats.filter(Boolean).length}/${x.seats.length}</text>`;
    }
    if (isSel) {
      const [hx, hy] = rot(0, -g.h / 2 - 6, R0);
      tb +=
        `<path d="M0,0 L${hx.toFixed(1)},${hy.toFixed(1)}" stroke="${p.accent}" stroke-width="1" stroke-dasharray="3 3" opacity=".5" pointer-events="none"/>` +
        handle('table', x.id, hx, hy, p);
    }
    add('t:' + x.id, tb + `</g>`);
  });
  s = '';
  if (Object.values(appState.S.guests).some(g => g.side)) {
    const ly = B.y + B.h - 22;
    let lx = B.x + (IMG.tree_top ? WALL + TREE + 24 : 30);
    [['bride'], ['groom'], ['both']].forEach(([k]) => {
      s += `<rect x="${lx}" y="${ly - 10}" width="12" height="12" rx="2" fill="${SIDE_COL[k]}"/><text x="${lx + 18}" y="${ly}" font-family="${BODYFONT}" font-size="12" fill="${p.ink}">${esc(t(k))}</text>`;
      lx += t(k).length * 7 + 46;
    });
  }
  add('legend', s);
  return { B, parts, inner: parts.map(c => `<g data-chunk="${esc(c.k)}">${c.h}</g>`).join('') };
}

export { BODYFONT, NAMEFONT, planSVG };
