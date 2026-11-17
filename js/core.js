'use strict';
/* Shared helpers, text (t/tn), name matching, choices and the character drawing. Part of the planner (app.html); see js/README.md. */
const $ = s => document.querySelector(s);
const esc = s =>
  String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const uid = () => Math.random().toString(36).slice(2, 9);
/* Name matching across scripts (same as supra_skel in migration 007): "Khatia", "Xatia" and "ხატია" all become "xatia". */
const GEO = 'აბგდევზთიკლმნოპჟრსტუფქღყშჩცძწჭხჯჰ',
  LAT = 'abgdevztiklmnopjrstupkgkscczccxjh';
function skel(x) {
  let r = [
    ...String(x || '')
      .normalize('NFC')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
  ]
    .map(c => {
      const i = GEO.indexOf(c);
      return i < 0 ? c : LAT[i];
    })
    .join('')
    .replace(/['`’ʼ]/g, '')
    .replace(/[qwy]/g, c => ({ q: 'k', w: 'v', y: 'i' })[c]);
  for (const [a, b] of [
    ['kh', 'x'],
    ['gh', 'g'],
    ['sh', 's'],
    ['ch', 'c'],
    ['zh', 'j'],
    ['tz', 'c'],
    ['ts', 'c'],
    ['dz', 'z'],
    ['ph', 'p'],
    ['th', 't']
  ])
    r = r.split(a).join(b);
  return r.replace(/h/g, '').replace(/(.)\1+/g, '$1');
}
const IMG = window.SUPRA_IMG || {};
const L10N = window.SUPRA_I18N;
/* Interface language: the visitor's own choice (shared by dashboard, planner and guest page), else the event's, else the browser's. */
const storedLang = () => {
  try {
    const l = localStorage.getItem('supra.lang');
    return l === 'ka' || l === 'en' ? l : null;
  } catch (e) {
    return null;
  }
};
let LANG = storedLang();
const UL = () => LANG || S?.event?.lang || ((navigator.language || '').startsWith('ka') ? 'ka' : 'en');
function setLang(l) {
  LANG = l;
  try {
    localStorage.setItem('supra.lang', l);
  } catch (e) {}
}
function t(k, v) {
  let s = (L10N[UL()] || L10N.en)[k] ?? L10N.en[k] ?? k;
  if (v) for (const x in v) s = s.split('{' + x + '}').join(v[x]);
  return s;
}
/* Counted phrases: uses key_one etc. when the language has that form ("1 guest"); Georgian keeps the noun singular. */
function tn(k, n, v) {
  const f = new Intl.PluralRules(UL() === 'ka' ? 'ka' : 'en').select(n),
    L = L10N[UL()] || L10N.en;
  return t(L[k + '_' + f] !== undefined ? k + '_' + f : k, Object.assign({ count: n }, v));
}
function rng(seed) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}
const pick = (a, r = Math.random) => a[Math.floor(r() * a.length)];
function shade(hex, p) {
  let n = parseInt(hex.slice(1), 16),
    r = n >> 16,
    g = (n >> 8) & 255,
    b = n & 255;
  const f = v => Math.max(0, Math.min(255, Math.round(v + ((p < 0 ? v : 255 - v) * p) / 100)));
  return '#' + [f(r), f(g), f(b)].map(v => v.toString(16).padStart(2, '0')).join('');
}

/* ---------------- options ---------------- */
const OPT = {
  skin: window.SUPRA_SKINS || ['#FDCB9F', '#FDC693', '#F8A362', '#EE975E', '#C56F40', '#AD5B31'],
  hairColor: ['#1E1916', '#3A2618', '#6A4226', '#9C6430', '#D2AE6B', '#B4472C', '#9B9792', '#ECE6DA'],
  eye: ['#3A281E', '#5E3B22', '#2F5E8C', '#4A7A4C', '#788A98'],
  outfitColor: [
    '#1E2A3D',
    '#2A2A2C',
    '#4A5568',
    '#6B4E3D',
    '#6F8F72',
    '#B4506F',
    '#E2A9BA',
    '#8E7CC3',
    '#3D7EA6',
    '#E3C066',
    '#F4F0E6',
    '#9C3F3A'
  ],
  hair: ['short', 'sidepart', 'buzz', 'curly', 'bald', 'long', 'straight', 'bob', 'bun', 'ponytail'],
  beard: ['none', 'stubble', 'mustache', 'goatee', 'short', 'full'],
  outfit: ['suit', 'tuxedo', 'shirt', 'sweater', 'dress', 'gown'],
  glasses: ['none', 'round', 'square', 'sun']
};
const BEARD_LBL = {
  none: 'beardNone',
  stubble: 'stubble',
  mustache: 'mustache',
  goatee: 'goatee',
  short: 'shortB',
  full: 'full'
};
const GL_LBL = { none: 'glassesNone', round: 'roundG', square: 'squareG', sun: 'sun' };
const SHAPES = ['rect', 'round', 'square', 'head'];
const DECOS = ['flowers', 'candles', 'greenery', 'mixed', 'none'];
const DECO_LBL = { none: 'plain' };
const MEALS = ['', 'meat', 'fish', 'veg', 'vegan', 'kids'];
const MEAL_LBL = { '': 'noMeal', kids: 'kidsMenu' };
const SIDES = ['bride', 'groom', 'both', ''];
const SIDE_COL = { bride: '#C4567E', groom: '#3E6E8E', both: '#9A7B3C' };
const VENUE = {
  dance: { w: 300, h: 200 },
  stage: { w: 340, h: 150 },
  bar: { w: 260, h: 90 },
  entrance: { w: 150, h: 40 },
  cake: { w: 110, h: 110 },
  dj: { w: 140, h: 90 },
  photo: { w: 160, h: 120 }
};
const PALETTES = {
  blush: {
    name: 'Blush & ivory',
    floor: '#F7F2EC',
    cloth: '#FFFDF9',
    edge: '#E3D7C8',
    runner: '#EEDFD0',
    ink: '#3B3330',
    accent: '#C46A88',
    chair: '#DCC6AB',
    leaf: '#8DAE89',
    fl: ['#F2B6C5', '#FFFFFF', '#E28AA5', '#F7D9C4']
  },
  sage: {
    name: 'Sage garden',
    floor: '#F0F2EA',
    cloth: '#FDFDF8',
    edge: '#D2D9C5',
    runner: '#CBD8BE',
    ink: '#2E3A2E',
    accent: '#5E7E5A',
    chair: '#D2BE9C',
    leaf: '#6F9A6A',
    fl: ['#FFFFFF', '#F3E6C2', '#E9C1AE', '#F7F1E3']
  },
  navy: {
    name: 'Navy & gold',
    floor: '#EDF0F4',
    cloth: '#FFFFFF',
    edge: '#C8CFDB',
    runner: '#24345A',
    ink: '#1F2D4A',
    accent: '#B8954F',
    chair: '#CDAE6E',
    leaf: '#7F9C8A',
    fl: ['#FFFFFF', '#EADBB6', '#BBC8E2', '#F5EFE1']
  },
  wine: {
    name: 'Autumn wine',
    floor: '#F6EFEC',
    cloth: '#FFFCFA',
    edge: '#E1CFCA',
    runner: '#7B2F3D',
    ink: '#3E2428',
    accent: '#7B2F3D',
    chair: '#D7BE9F',
    leaf: '#7F8F5A',
    fl: ['#B23A52', '#F2C1C8', '#FFFFFF', '#E8A15C']
  }
};
const EVENT_TYPES = [
  ['wedding', true],
  ['birthday', false],
  ['corporate', false],
  ['baby', false],
  ['anniv', false]
];
/* Women's and men's first names: see names.js. null = not sure (the drawing then picks either). */

function randLook(kind, r = Math.random) {
  kind = kind || (r() < 0.5 ? 'm' : 'f');
  const m = kind === 'm';
  const hairColor = pick(OPT.hairColor.slice(0, 7), r);
  return {
    kind,
    skin: pick(OPT.skin, r),
    hair: pick(
      m
        ? ['short', 'short', 'sidepart', 'buzz', 'curly', 'bald']
        : ['long', 'straight', 'bob', 'bun', 'ponytail', 'curly'],
      r
    ),
    hairColor,
    beard: m ? pick(['none', 'none', 'none', 'stubble', 'mustache', 'goatee', 'short', 'full'], r) : 'none',
    beardColor: hairColor,
    eye: pick(OPT.eye, r),
    outfit: pick(
      m ? ['suit', 'suit', 'shirt', 'sweater', 'tuxedo'] : ['dress', 'dress', 'dress', 'shirt', 'sweater'],
      r
    ),
    outfitColor: pick(OPT.outfitColor, r),
    glasses: r() < 0.16 ? pick(['round', 'square', 'sun'], r) : 'none'
  };
}
/* 'seat': guests are told their table and seat; 'table': only their table, they pick a chair themselves. */
const seatMode = () => (S?.event?.seatMode === 'table' ? 'table' : 'seat');
const guessKind = n => window.SupraNames?.guess(n) || null;
/* Redraw someone as a woman or a man, keeping skin, eyes, hair colour and glasses so they still look like themselves. */
function relook(L, kind, r) {
  const n = randLook(kind, r);
  return Object.assign(n, {
    skin: L.skin,
    eye: L.eye,
    hairColor: L.hairColor,
    beardColor: L.hairColor,
    glasses: L.glasses,
    outfitColor: L.outfitColor
  });
}
/* Guests whose drawing doesn't match their name (and that nobody switched by hand). */
const lookMismatch = G => {
  if (!G || G.look?.kindSet || G.look?.outfit === 'gown') return null;
  const k = guessKind(G.name);
  return k && k !== G.look?.kind ? k : null;
};

/* ---------------- character drawing ---------------- */
// Characters are stacked illustration layers placed in the base artwork's own pixel space (1254 px canvas, head centre ~627,505).
// PERSON_T maps that space onto a seat: origin = seat centre, the figure faces +y toward its table.
const FIT = window.SUPRA_FIT || {},
  NAT = window.SUPRA_NAT || {};
const PK = 0.047,
  PERSON_T = `translate(0 22) scale(${PK}) translate(-627 -1215)`;
const BROWN_EYES = new Set(['#3A281E', '#5E3B22']);
let TINTS = new Set();
function tintFilter(id) {
  const n = parseInt(id.slice(2), 16),
    k = 1 / 0.74,
    c = [((n >> 16) / 255) * k, (((n >> 8) & 255) / 255) * k, ((n & 255) / 255) * k];
  return `<filter id="${id}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="${c.map(v => `${(v * 0.3).toFixed(3)} ${(v * 0.59).toFixed(3)} ${(v * 0.11).toFixed(3)} 0 0`).join(' ')} 0 0 0 1 0"/></filter>`;
}
function tint(hex) {
  const id = 'tn' + hex.slice(1).toUpperCase();
  if (!TINTS.has(id)) {
    TINTS.add(id);
    $('#gdefs')?.insertAdjacentHTML('beforeend', tintFilter(id));
  }
  return `url(#${id})`;
}
function imageDefs() {
  let s = '';
  for (const k in IMG) {
    const f = FIT[k],
      n = NAT[k];
    const box = f || (n && [0, 0, n[0], n[1]]);
    if (box)
      s += `<image id="I_${k}" href="${IMG[k]}" x="${box[0]}" y="${box[1]}" width="${box[2]}" height="${box[3]}" preserveAspectRatio="none"/>`;
  }
  return (
    s +
    `<clipPath id="cHead" clipPathUnits="userSpaceOnUse"><rect x="0" y="0" width="1254" height="828"/></clipPath><clipPath id="cBody" clipPathUnits="userSpaceOnUse"><rect x="-300" y="-400" width="1854" height="1615"/></clipPath>`
  );
}
function allDefs() {
  let s = imageDefs();
  TINTS.forEach(id => (s += tintFilter(id)));
  return `<defs>${s}</defs>`;
}
const use = (k, extra = '') => `<use href="#I_${k}" ${extra}/>`;
function hexRGB(h) {
  const n = parseInt(h.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}
function skinIdx(hex) {
  const a = hexRGB(hex || OPT.skin[1]);
  let bi = 0,
    bd = 1e9;
  OPT.skin.forEach((s, i) => {
    const b = hexRGB(s),
      d = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
    if (d < bd) {
      bd = d;
      bi = i;
    }
  });
  return bi;
}
function fig(L) {
  const base = 'base' + skinIdx(L.skin),
    h = L.hairColor,
    bc = L.beardColor || h;
  let g = use(base);
  const ok = {
    suit: 'out_suit',
    tuxedo: 'out_tuxedo',
    shirt: 'out_shirt',
    sweater: 'out_sweater',
    dress: 'out_dress',
    gown: 'out_gown'
  }[L.outfit];
  if (ok) {
    if (L.outfit === 'tuxedo' || L.outfit === 'gown') g += use(ok);
    else {
      g += use(ok, `filter="${tint(L.outfitColor)}"`);
      if (L.outfit === 'suit') g += use('out_suit_fixed');
    }
  }
  g += use(base, 'clip-path="url(#cHead)"');
  if (L.eye && !BROWN_EYES.has(L.eye))
    g += [
      [486, 596],
      [767, 581]
    ]
      .map(
        ([x, y]) =>
          `<ellipse cx="${x}" cy="${y}" rx="25" ry="35" fill="${L.eye}" stroke="#2A1A12" stroke-width="3"/><ellipse cx="${x}" cy="${y + 5}" rx="12" ry="17" fill="#1A1210"/><circle cx="${x + 8}" cy="${y - 13}" r="8" fill="#FFFFFF"/>`
      )
      .join('');
  if (L.hair !== 'bald' && IMG['hair_' + L.hair]) g += use('hair_' + L.hair, `filter="${tint(h)}"`);
  if (L.beard !== 'none' && IMG['beard_' + L.beard]) g += use('beard_' + L.beard, `filter="${tint(bc)}"`);
  if (L.glasses !== 'none') g += use('gl_' + L.glasses);
  return `<g transform="${PERSON_T}" clip-path="url(#cBody)">${g}</g>`;
}
function chairM() {
  const n = NAT.chair;
  return `<g transform="translate(-25 -47) scale(${(50 / n[0]).toFixed(4)})">${use('chair')}</g>`;
}
function person(G, P, withChair = true) {
  return `${withChair ? chairM() : ''}<g transform="translate(0 ${G.kid ? 3 : 0}) scale(${G.kid ? 0.8 : 1})">${fig(G.look)}</g>`;
}
