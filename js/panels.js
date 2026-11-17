import {
  $,
  BEARD_LBL,
  DECOS,
  DECO_LBL,
  EVENT_TYPES,
  GL_LBL,
  MEALS,
  MEAL_LBL,
  OPT,
  PALETTES,
  SHAPES,
  SIDES,
  SIDE_COL,
  UL,
  VENUE,
  appState,
  esc,
  guessKind,
  lookMismatch,
  person,
  randLook,
  rng,
  seatMode,
  skel,
  t,
  tn
} from './core.js';
import { P, T, V, headName, hist, tName, toast } from './state.js';
import { arrangeDefaults, arrangePreview, ruleBroken } from './layout.js';
import { isPhone, keepView } from './actions.js';
import { fmtDate } from './guest.js';
import { INV, INV_AT, invGuestStatus, invOfGuest, invPanel, invRefresh, invSeatedNo, okMapUrl } from './invites.js';
/* Top bar, side panels (Event, Guests, Share), guest-link settings and the inspector. Part of the planner (app.html); see js/README.md. */
/* ---------------- top bar ---------------- */
/* ---------------- top bar ---------------- */

const OPEN = new Set();
const ICON = {
  invites:
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
  turn: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
  close:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  full: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  unfull:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>',
  event:
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  guests:
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14a5 5 0 0 1 5.5 5"/></svg>',
  swap: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4v13M3 13l4 4 4-4M17 20V7M21 11l-4-4-4 4"/></svg>',
  arrange:
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="4" width="7" height="5" rx="1"/><rect x="14" y="4" width="7" height="5" rx="1"/><rect x="3" y="15" width="7" height="5" rx="1"/><rect x="14" y="15" width="7" height="5" rx="1"/></svg>',
  share:
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>'
};
function curTheme() {
  return (
    document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  );
}
function isFull() {
  return !!document.fullscreenElement || document.body.classList.contains('focus');
}
function hintSeen() {
  try {
    return localStorage.getItem('supra.hint') === '1';
  } catch (e) {
    return false;
  }
}

function renderTop() {
  const seated = appState.S.tables.reduce((a, x) => a + x.seats.filter(Boolean).length, 0),
    cap = appState.S.tables.reduce((a, x) => a + x.seats.length, 0);
  const sides = { bride: 0, groom: 0 };
  Object.values(appState.S.guests).forEach(g => {
    if (sides[g.side] !== undefined) sides[g.side]++;
  });
  const nb = appState.S.rules.filter(ruleBroken).length;
  $('#evname').textContent = appState.S.event.name || 'Supra';
  if (!appState.guestMode) document.title = t('editTitle', { event: appState.S.event.name || 'Supra' });
  $('#stats').innerHTML =
    `<span>${esc(t('statSeats', { occupied: seated, capacity: cap }))}${appState.S.waiting.length ? ` · ${esc(tn('nUnseated', appState.S.waiting.length))}` : ''}</span>${sides.bride || sides.groom ? `<span class="sides"><i style="background:${SIDE_COL.bride}"></i>${sides.bride} <i style="background:${SIDE_COL.groom}"></i>${sides.groom}</span>` : ''}${nb ? `<button type="button" class="warn" data-panel="guests">⚠ ${nb}</button>` : ''}`;
  const cur = !appState.sel.kind && appState.panel,
    tabs = [
      ['event', 'event'],
      ['guests', 'tabGuests'],
      ['invites', 'tabInvites'],
      ['share', 'tabShare']
    ];
  $('#nav').setAttribute('aria-label', t('panels'));
  $('#nav').innerHTML = tabs
    .map(
      ([k, l], i) =>
        `<button type="button" role="tab" id="tab-${k}" data-panel="${k}" aria-selected="${cur === k}" aria-controls="left" tabindex="${(cur ? cur === k : i === 0) ? 0 : -1}">${ICON[k]}<span>${esc(t(l))}</span></button>`
    )
    .join('');
  $('#lang').setAttribute('aria-label', t('language'));
  $('#lang').innerHTML = [
    ['en', 'EN', 'English'],
    ['ka', 'ქარ', 'ქართული']
  ]
    .map(
      ([k, l, n]) =>
        `<button type="button" role="radio" data-lang="${k}" lang="${k}" aria-label="${n}" aria-checked="${UL() === k}" tabindex="${UL() === k ? 0 : -1}">${l}</button>`
    )
    .join('');
  $('#undo').title = t('undo');
  $('#undo').setAttribute('aria-label', t('undo'));
  $('#undo').disabled = !hist.length;
  const th = $('#theme');
  th.innerHTML = curTheme() === 'dark' ? ICON.sun : ICON.moon;
  const tl = t(curTheme() === 'dark' ? 'toLight' : 'toDark');
  th.setAttribute('aria-label', tl);
  th.title = tl;
  th.removeAttribute('aria-pressed');
  const fb = $('#full');
  fb.innerHTML = isFull() ? ICON.unfull : ICON.full;
  fb.title = isFull() ? t('exitFull') : t('fullscreen');
  fb.setAttribute('aria-label', fb.title);
  const sb = $('#save'),
    st = $('#savestate');
  sb.hidden = appState.saveState !== 'error';
  sb.textContent = t('save');
  st.textContent =
    appState.saveState === 'saving'
      ? t('saving')
      : appState.saveState === 'error'
        ? t('notSaved')
        : appState.dirty
          ? t('unsaved')
          : t('saved');
  st.dataset.state = appState.saveState === 'error' || appState.dirty ? 'dirty' : 'ok';
  const bk = $('#backlink');
  if (bk) {
    bk.setAttribute('aria-label', t('logoHome'));
    $('#backtxt').textContent = t('myEvents');
  }
  $('.navwrap').setAttribute('aria-label', t('planner'));
  const sv = $('#savestate');
  sv.setAttribute('aria-label', t('saveStatus'));
  const hn = $('#hint'),
    touch = matchMedia('(pointer:coarse)').matches;
  hn.hidden = !appState.hintOpen || (!!(appState.sel.kind || appState.panel) && isPhone());
  hn.innerHTML = `<span>${esc(t(touch ? 'hintTouch' : 'hintPlan'))}</span><button type="button" data-act="hintok" aria-label="${esc(t('hintClose'))}">×</button>`;
  $('#help').setAttribute('aria-expanded', !hn.hidden);
  $('#quickadd').setAttribute('aria-label', t('addToRoom'));
  $('#quickadd').innerHTML =
    `<button type="button" class="btn" data-act="arr-open" aria-pressed="${appState.panel === 'arrange'}">${ICON.arrange}<span>${t('arrOpenShort')}</span></button><span class="tsep" aria-hidden="true"></span><button type="button" class="btn" data-act="addtable">${t('addTable')}</button>${['stage', 'bar', 'dance'].map(k => `<button type="button" class="btn" data-addvenue="${k}">+ ${t(k)}</button>`).join('')}`;
  [
    ['zout', 'zoomOut'],
    ['zin', 'zoomIn'],
    ['zall', 'fitAll'],
    ['zwidth', 'fitWidth'],
    ['zrot', 'rotView'],
    ['help', 'helpMove']
  ].forEach(([id, k]) => {
    const b = $('#' + id);
    b.setAttribute('aria-label', t(k));
    b.title = t(k);
  });
  $('#zoombar').setAttribute('aria-label', t('zoom'));
  const swb = $('#swapbar'),
    sf = appState.swapFrom && T(appState.swapFrom);
  swb.hidden = !sf;
  if (sf)
    swb.innerHTML = `<span>${esc(t('swapPick', { n: tName(sf) }))}</span><button type="button" class="btn sm" data-act="swap-cancel">${t('swapCancel')}</button>`;
  else swb.innerHTML = '';
  document.body.classList.toggle('swapping', !!sf);
  $('#scroller').setAttribute('aria-label', t('planLabel'));
  $('#plankeys').textContent = t('planKeys');
}

/* ---------------- panels ---------------- */
/* Single-choice button rows are radio groups: one tab stop, arrow keys move and select. */
const radios = (name, items) => {
  const any = items.some(it => it.on);
  return `<div class="chips" role="radiogroup" aria-label="${esc(name)}">${items.map((it, i) => `<button type="button" role="radio" class="${it.cls || 'chip'}" ${it.attr} aria-checked="${!!it.on}" tabindex="${it.on || (!any && i === 0) ? 0 : -1}"${it.label ? ` aria-label="${esc(it.label)}" title="${esc(it.label)}"` : ''}${it.style ? ` style="${it.style}"` : ''}>${it.html || ''}</button>`).join('')}</div>`;
};
const chipBtns = (attr, list, cur, lbl, name) =>
  radios(
    name || '',
    list.map(k => ({ attr: `${attr}="${k}"`, on: cur === k, html: esc(lbl ? lbl(k) : t(k)) }))
  );
const det = (key, title, body) =>
  `<details class="more" data-sec="${key}" ${OPEN.has(key) ? 'open' : ''}><summary>${title}</summary><div class="body">${body}</div></details>`;
const dhead = (title, sub) =>
  `<div class="dhead"><div style="min-width:0"><h2 id="dtitle" tabindex="-1">${title}</h2>${sub ? `<span class="muted">${sub}</span>` : ''}</div><button type="button" class="icon" data-act="close" aria-label="${esc(t('closePanel'))}" title="${esc(t('closePanel'))}">${ICON.close}</button></div>`;
function renderLeft() {
  const L = $('#left');
  if (!appState.panel || appState.sel.kind) {
    L.innerHTML = '';
    return;
  }
  const e = appState.S.event;
  let h = '';
  if (appState.panel === 'event') {
    h =
      dhead(t('event')) +
      `
    <label class="field"><span class="lbl">${t('eventName')}</span><input id="ev-name" class="inp" value="${esc(e.name)}"></label>
    <div class="row2"><div class="field"><span class="lbl">${t('eventType')}</span>${
      EVENT_TYPES.filter(([, on]) => on).length > 1
        ? `<select id="ev-type" aria-label="${esc(t('eventType'))}">${EVENT_TYPES.filter(([, on]) => on)
            .map(([k]) => `<option value="${k}" ${e.type === k ? 'selected' : ''}>${t(k)}</option>`)
            .join('')}</select>`
        : `<p class="static">${esc(t(e.type || 'wedding'))}</p>`
    }</div>
    <label class="field"><span class="lbl">${t('date')}</span><input id="ev-date" class="inp" type="date" value="${esc(e.date)}" aria-describedby="ev-date-txt"><span class="muted small" id="ev-date-txt">${esc(fmtDate(e.date))}</span></label></div>
    <div class="row2 top"><label class="field"><span class="lbl">${t('evTime')}</span><input id="ev-time" class="inp" type="time" value="${esc(e.time || '')}" aria-describedby="ev-time-h"><span class="muted small" id="ev-time-h">${t('evTimeHint')}</span></label>
      <label class="field"><span class="lbl">${t('evVenue')}</span><input id="ev-venue" class="inp" maxlength="200" value="${esc(e.venue || '')}" placeholder="${esc(t('evVenuePh'))}"></label></div>
    <label class="field"><span class="lbl">${t('evMap')}</span><input id="ev-map" class="inp" type="url" inputmode="url" maxlength="500" value="${esc(e.mapUrl || '')}" placeholder="https://maps.app.goo.gl/…" aria-describedby="ev-map-h"${okMapUrl(e.mapUrl) ? '' : ' aria-invalid="true"'}><span class="muted small${okMapUrl(e.mapUrl) ? '' : ' err'}" id="ev-map-h">${okMapUrl(e.mapUrl) ? t('evMapHint') : t('evMapBad')}</span></label>
    <p class="muted small">${t('soonLine')} ${EVENT_TYPES.filter(([, on]) => !on)
      .map(([k]) => t(k))
      .join(', ')}.</p>
    <div class="field"><span class="lbl">${t('arrTitle')}</span><p class="muted small">${t('arrHint')}</p><div class="row"><button type="button" class="btn" data-act="arr-open">${t('arrOpen')}</button></div></div>
    <div class="field"><span class="lbl">${t('style')}</span>${chipBtns('data-pal', Object.keys(PALETTES), e.palette, k => t('pal_' + k), t('style'))}</div>
    ${det(
      'layout',
      t('layoutTools'),
      `<p class="muted">${t('venueHint')}</p><div class="chips">${Object.keys(VENUE)
        .filter(k => !['stage', 'bar', 'dance'].includes(k))
        .map(k => `<button type="button" class="chip" data-addvenue="${k}">+ ${t(k)}</button>`)
        .join('')}</div><button type="button" class="btn sm" data-act="arrange">${t('autoArrange')}</button>`
    )}`;
  } else if (appState.panel === 'arrange') {
    const o = appState.ARR || (appState.ARR = arrangeDefaults()),
      pv = arrangePreview(o),
      n = appState.S.tables.filter(x => x.shape !== 'head').length;
    const tog = (kind, count, list) =>
      count < 1
        ? `<p class="muted small">${t('arrNoGaps')}</p>`
        : `<div class="chips">${Array.from({ length: count }, (_, i) => `<button type="button" class="chip" data-aisle="${kind}:${i}" aria-pressed="${list.includes(i)}">${esc(t(kind === 'row' ? 'arrBetweenRows' : 'arrBetweenCols', { a: i + 1, b: i + 2 }))}</button>`).join('')}</div>`;
    h =
      dhead(t('arrTitle'), esc(t('arrSub', { n }))) +
      `
    <div class="field"><span class="lbl">${t('arrOrient')}</span>${radios(
      t('arrOrient'),
      [
        ['horizontal', 'arrHoriz'],
        ['vertical', 'arrVert']
      ].map(([k, l]) => ({ attr: `data-arr-orient="${k}"`, on: o.orient === k, html: esc(t(l)) }))
    )}<span class="muted small">${t('arrOrientHint')}</span></div>
    <div class="field"><span class="lbl" id="arr-rows-l">${t('arrRows')}</span><div class="stepper"><button type="button" class="btn sm" data-act="arr-rows-" aria-label="${esc(t('arrFewer'))}" ${o.rows <= 1 ? 'disabled' : ''}>−</button><output aria-labelledby="arr-rows-l" aria-live="polite">${pv.R}</output><button type="button" class="btn sm" data-act="arr-rows+" aria-label="${esc(t('arrMore'))}" ${o.rows >= n ? 'disabled' : ''}>+</button><span class="muted">${esc(t('arrGrid', { rows: pv.R, cols: pv.C }))}</span></div></div>
    <div class="field"><span class="lbl">${t('arrRowAisles')}</span>${tog('row', pv.R - 1, o.rowAisles)}</div>
    <div class="field"><span class="lbl">${t('arrColAisles')}</span>${tog('col', pv.C - 1, o.colAisles)}</div>
    <div class="field"><span class="lbl">${t('arrAisleW')}</span>${radios(
      t('arrAisleW'),
      [
        ['normal', 'arrAisleN'],
        ['wide', 'arrAisleWd'],
        ['xwide', 'arrAisleX']
      ].map(([k, l]) => ({ attr: `data-arr-aisle="${k}"`, on: o.aisle === k, html: esc(t(l)) }))
    )}</div>
    ${appState.S.venue.length ? `<label class="check"><input type="checkbox" id="arr-venue" ${o.venue ? 'checked' : ''}> ${t('arrVenue')}</label>` : ''}
    <div class="field"><span class="lbl">${t('arrPreview')}</span>${pv.svg}</div>
    <div class="row"><button type="button" class="btn primary" data-act="arr-apply">${t('arrApply')}</button><button type="button" class="btn" data-act="close">${t('arrCancel')}</button></div>
    <p class="muted small">${t('arrUndoHint')}</p>`;
  } else if (appState.panel === 'guests') {
    const total = Object.keys(appState.S.guests).length;
    const seatedG = appState.S.tables.reduce((a, x) => a + x.seats.filter(Boolean).length, 0);
    h =
      dhead(t('tabGuests'), esc(t('statGuests', { seatedGuests: seatedG, totalGuests: total }))) +
      `
    ${(() => {
      const n = invSeatedNo().length;
      return n
        ? `<div class="confirm"><span>${esc(tn('invNoSeated', n))}</span><div class="row"><button type="button" class="btn sm primary" data-inv="move-declined">${esc(tn('invMoveBtn', n))}</button></div></div>`
        : '';
    })()}
    <input id="find" type="search" class="inp" placeholder="${t('findPh')}" aria-label="${t('findGuest')}" value="${esc(appState.FINDQ)}"><div class="search-res" id="findres"></div>
    ${appState.S.waiting.length ? `<div class="field"><span class="lbl">${t('waitingTitle')}</span><p class="muted">${t('waitingHint')}</p><div class="waiting">${appState.S.waiting.map(id => `<button type="button" class="wchip" data-wait="${id}" aria-pressed="${appState.waitSel === id}">${esc(appState.S.guests[id]?.name)}</button>`).join('')}</div></div>` : ''}
    ${det(
      'add',
      t('addGuests'),
      `<label class="field"><span class="lbl">${t('pasteNames')}</span><textarea id="bulk" rows="3" class="inp" placeholder="ნინო ბერიძე&#10;Giorgi Kapanadze"></textarea></label>
      <label class="field"><span class="lbl">${t('seatThem')}</span><select id="bulk-t"><option value="">${t('anyFree')}</option>${appState.S.tables.map(x => `<option value="${x.id}">${esc(tName(x))} (${esc(tn('nFree', x.seats.filter(v => !v).length))})</option>`).join('')}<option value="__wait">${t('waitList')}</option></select></label>
      <div class="row"><button type="button" class="btn primary" data-act="bulk">${t('addNames')}</button></div>
      <div class="row"><button type="button" class="btn sm" data-act="import">${t('importX')}</button><button type="button" class="btn sm" data-act="export">${t('exportX')}</button></div>`
    )}
    ${det(
      'rules',
      `${t('rules')}${appState.S.rules.length ? ` · ${appState.S.rules.length}` : ''}`,
      `${
        appState.S.rules.length
          ? `<div class="rules">${appState.S.rules
              .map(r => {
                const b = ruleBroken(r);
                return `<div class="rule ${b ? 'bad' : ''}"><span>${esc(appState.S.guests[r.a]?.name)} <b>${r.type === 'together' ? '＋' : '≠'}</b> ${esc(appState.S.guests[r.b]?.name)}</span><span class="pill ${b ? 'bad' : ''}">${b ? t('ruleBroken') : t('ruleOk')}</span><button type="button" class="x" data-delrule="${r.id}" aria-label="${t('remove')}">×</button></div>`;
              })
              .join('')}</div>`
          : ''
      }<p class="muted">${t('rulesHint')}</p>`
    )}
    ${(() => {
      const n = Object.values(appState.S.guests).filter(lookMismatch).length;
      return n
        ? `<div class="confirm"><span>${esc(tn('matchQ', n))}</span><div class="row"><button type="button" class="btn sm primary" data-act="matchlooks">${t('matchBtn')}</button></div></div>`
        : '';
    })()}
    ${det(
      'tools',
      t('tools'),
      `<div class="row"><button type="button" class="btn sm" data-act="matchlooks">${t('matchBtn')}</button><button type="button" class="btn sm" data-act="autoseat">${t('autoSeat')}</button><button type="button" class="btn sm" data-act="randall">${t('restyle')}</button><button type="button" class="btn sm" data-act="shuffleall">${t('shuffle')}</button><button type="button" class="btn sm danger" data-act="reset">${t('startOver')}</button></div>
      ${appState.confirmK === 'autoseat' ? `<div class="confirm"><span>${t('autoSeatQ')}</span><div class="row"><button type="button" class="btn sm primary" data-act="autoseat-yes">${t('autoSeatYes')}</button><button type="button" class="btn sm" data-act="cancel">${t('keep')}</button></div></div>` : ''}
      ${appState.confirmK === 'reset' ? `<div class="confirm danger"><span>${t('startOverQ')}</span><div class="row"><button type="button" class="btn sm danger" data-act="reset-yes">${t('startOverYes')}</button><button type="button" class="btn sm" data-act="cancel">${t('keep')}</button></div></div>` : ''}`
    )}`;
  } else if (appState.panel === 'invites') {
    h = invPanel();
    if (!INV.busy && !INV.err && (INV.list === null || Date.now() - INV_AT > 30000)) setTimeout(invRefresh);
  } else {
    const sh = shareInfo(),
      u = guestUrl(),
      pre = presetOf(sh),
      st = sh.status,
      pv = `/edit/${encodeURIComponent(appState.ROW?.id || '')}?preview=1`;
    const btn = (act, label, cls = '') =>
      `<button type="button" class="btn ${cls}" data-act="${act}">${label}</button>`;
    const conf = (k, text, yes, cls = 'primary') =>
      appState.confirmK === k
        ? `<div class="confirm ${cls === 'danger' ? 'danger' : ''}" role="group" aria-label="${esc(text)}"><span>${text}</span><div class="row">${btn(k + '-yes', yes, 'sm ' + cls)}${btn('cancel', t('keepIt'), 'sm')}</div></div>`
        : '';
    h =
      dhead(t('tabShare')) +
      `
    <p class="muted">${t('guestPageHint')}</p>
    <section class="sharebox" aria-labelledby="sh-h">
      <div class="shhead"><h3 id="sh-h">${t('shTitle')}</h3><span class="badge st-${st}" id="sh-status">${t('st_' + st)}</span></div>
      <p class="small muted">${t('st_' + st + 'Hint', { date: sh.expires ? fmtDate(sh.expires.slice(0, 10)) : '' })}</p>
      <div class="row">
        ${st === 'draft' || st === 'expired' ? btn('publish', t(st === 'expired' ? 'shRepublish' : 'shPublish'), 'primary') : ''}
        ${st === 'published' ? btn('unpublish', t('shUnpublish')) : ''}
        ${st === 'revoked' ? btn('rotate', t('shNewLink'), 'primary') : ''}
        <a class="btn" href="${esc(pv)}" target="_blank" rel="noopener noreferrer">${t('shPreview')}<span class="sr"> ${t('newTab')}</span></a>
      </div>
      ${st === 'draft' || st === 'expired' ? `<label class="field"><span class="lbl">${t('shExpiry')}</span><input type="date" id="sh-exp" class="inp" min="${new Date(Date.now() + 864e5).toISOString().slice(0, 10)}" aria-describedby="sh-exp-h"><span class="muted small" id="sh-exp-h">${t('shExpiryHint')}</span></label>` : ''}
      ${conf('rotate', t('shRotateQ'), t('shRotateYes'))}
    </section>
    ${
      st !== 'revoked'
        ? `<div class="field"><span class="lbl" id="sl-l">${t('shareLink')}</span>
      <p class="sharelink" aria-labelledby="sl-l"><span class="host">${esc(location.host)}/e/</span><b class="code">${esc(appState.ROW?.slug || '')}</b></p>
      <div class="row"><button type="button" class="btn ${st === 'published' ? 'primary' : ''}" data-act="copylink">${t('copyLink')}</button>${st === 'published' ? `<a class="btn" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${t('openGuest')}<span class="sr"> ${t('newTab')}</span></a>` : ''}</div>
      <p id="copystate" class="muted small" role="status">${st === 'published' ? '' : esc(t('shNotLiveYet'))}</p></div>
      <div id="qr" class="qr" role="img" aria-label="${esc(t('qrAlt'))}"></div>
      <div class="row">${btn('dlqr', t('dlQR'), 'sm')}${btn('rotate', t('shRotate'), 'sm')}${btn('revoke', t('shRevoke'), 'sm danger')}</div>
      ${st !== 'revoked' ? conf('rotate', t('shRotateQ'), t('shRotateYes')) : ''}
      ${conf('revoke', t('shRevokeQ'), t('shRevokeYes'), 'danger')}`
        : ''
    }
    <section class="pubbox" id="privacy-controls" aria-labelledby="pub-h">
      <h3 id="pub-h">${t('pubTitle')}</h3>
      ${radios(
        t('prTitle'),
        ['strict', 'balanced', 'open'].map(k => ({
          attr: `data-preset="${k}"`,
          on: pre === k,
          html: `<b>${esc(t('pr_' + k))}</b>`
        }))
      )}
      <p class="small muted">${pre === 'custom' ? t('pr_customHint') : t('pr_' + pre + 'Hint')}</p>
      ${appState.confirmK === 'strict' ? `<div class="confirm" role="group" aria-label="${esc(t('pr_strict'))}"><label class="field"><span class="lbl">${t('lkPin')}</span><input id="pr-pin" class="inp" maxlength="12" autocomplete="off" aria-describedby="pr-pin-h"></label><span class="small muted" id="pr-pin-h">${t('prStrictCode')}</span><div class="row">${btn('strict-yes', t('prUseStrict'), 'sm primary')}${btn('cancel', t('keepIt'), 'sm')}</div></div>` : ''}
      ${appState.confirmK === 'open' ? `<div class="confirm danger" role="group" aria-label="${esc(t('pr_open'))}"><span>${t('prOpenQ')}</span><ul class="small publist"><li>${t('prOpen1')}</li><li>${t('prOpen2')}</li><li>${t('prOpen3')}</li></ul><div class="row">${btn('open-yes', t('prUseOpen'), 'sm danger')}${btn('cancel', t('keepIt'), 'sm')}</div></div>` : ''}
      <p class="small">${t('privacy')}</p>
      <p class="small">${t('pubSees')}</p>
      <ul class="small publist"><li>${t(sh.layout ? 'pubLayout' : 'pubNoLayout')}</li><li>${t(seatMode() === 'table' ? 'pubMatchTable' : 'pubMatch')}</li>${sh.mates ? `<li>${t('pubMates')}</li>` : ''}</ul>
      <p class="small muted">${t('pubNever')}</p>
      ${det(
        'privdetails',
        t('privDetails'),
        `
      <fieldset class="field"><legend class="lbl">${t('lkMode')}</legend>
        <label class="check"><input type="radio" name="lk-mode" value="exact" ${sh.mode === 'exact' ? 'checked' : ''}> ${t('lkExact')}</label>
        <label class="check"><input type="radio" name="lk-mode" value="prefix" ${sh.mode === 'prefix' ? 'checked' : ''}> ${t('lkPrefix')}</label></fieldset>
      <label class="check"><input type="checkbox" id="lk-mates" ${sh.mates ? 'checked' : ''}> ${t('lkMates')}</label>
      <label class="check"><input type="checkbox" id="lk-layout" ${sh.layout ? 'checked' : ''}> ${t('lkLayout')}</label>
      <div class="field"><label class="lbl" for="lk-pin">${t('lkPin')}</label>
        <p class="small muted" id="lk-pin-h">${sh.pin ? t('lkPinOn') : t('lkPinOff')} ${t('lkPinHint')}</p>
        <div class="row2 linkrow"><input id="lk-pin" class="inp" maxlength="12" autocomplete="off" aria-describedby="lk-pin-h"><button type="button" class="btn" data-act="setpin">${sh.pin ? t('lkPinChange') : t('lkPinSet')}</button></div>
        ${sh.pin ? `<button type="button" class="btn sm" data-act="rmpin">${t('lkPinRemove')}</button>` : ''}</div>
      <div class="field"><span class="lbl">${t('smTitle')}</span>${radios(
        t('smTitle'),
        [
          ['seat', 'smSeat'],
          ['table', 'smTable']
        ].map(([k, l]) => ({ attr: `data-seatmode="${k}"`, on: seatMode() === k, html: esc(t(l)) }))
      )}<span class="muted small">${t(seatMode() === 'table' ? 'smTableHint' : 'smSeatHint')}</span></div>
      <div class="field"><span class="lbl">${t('guestLang')}</span>${radios(
        t('guestLang'),
        [
          ['en', t('lang_en')],
          ['ka', t('lang_ka')]
        ].map(([k, l]) => ({
          attr: `data-glangset="${k}" lang="${k}"`,
          on: (appState.S.event.lang || 'en') === k,
          html: esc(l)
        }))
      )}<span class="muted small">${t('guestLangHint')}</span></div>`
      )}
    </section>
    ${det(
      'print',
      t('printOuts'),
      `<div class="field"><span class="lbl">${t('cards')}</span><p class="muted">${t('cardsHint')}</p><button type="button" class="btn" data-act="cards">${t('makeCards')}</button></div>
      <div class="field"><span class="lbl">${t('caterer')}</span><p class="muted">${t('catererHint')}</p><button type="button" class="btn" data-act="caterer">${t('openCaterer')}</button></div>
      <div class="field"><span class="lbl">${t('planImg')}</span><p class="muted">${t('planImgHint')}</p><div class="row"><button type="button" class="btn" data-act="planpdf">${t('dlPdf')}</button><button type="button" class="btn" data-act="planimg">${t('dlPng')}</button></div><p class="muted small">${t('pdfPlanHint')}</p></div>`
    )}`;
  }
  L.innerHTML = h;
  if (appState.panel === 'guests') doFind();
  if (appState.panel === 'share') drawQR();
}
function doFind() {
  const q = ($('#find')?.value || '').trim().toLowerCase(),
    box = $('#findres');
  if (!box) return;
  if (!q) {
    box.innerHTML = '';
    return;
  }
  const qk = skel(q),
    has = v => {
      v = String(v || '');
      return v.toLowerCase().includes(q) || (qk.length >= 2 && skel(v).includes(qk));
    };
  const res = [];
  appState.S.tables.forEach(x =>
    x.seats.forEach((id, i) => {
      const G = id && appState.S.guests[id];
      if (G && (has(G.name) || has(G.group)))
        res.push(
          `<button type="button" data-goto="${x.id}:${i}"><span>${esc(G.name)}</span><small>${esc(tName(x))} · ${t('seat')} ${i + 1}</small></button>`
        );
    })
  );
  appState.S.waiting.forEach(id => {
    const G = appState.S.guests[id];
    if (G && has(G.name))
      res.push(
        `<button type="button" data-wait="${id}"><span>${esc(G.name)}</span><small>${t('waiting')}</small></button>`
      );
  });
  box.innerHTML = res.join('') || `<span class="muted">${t('noOne')}</span>`;
}
function loadScript(src) {
  return new Promise((ok, no) => {
    if (document.querySelector(`script[src="${src}"]`) && window.__loaded?.[src]) return ok();
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => {
      (window.__loaded = window.__loaded || {})[src] = 1;
      ok();
    };
    s.onerror = no;
    document.head.appendChild(s);
  });
}
const QRLIB = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
  XLSXLIB = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  PDFLIB = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
/* ---------------- guest link: lifecycle and privacy ----------------
   The server owns the link token and the publish state (migration 006); the page only asks for changes. */
function shareInfo() {
  const r = appState.ROW || {},
    has = r.share_status !== undefined,
    exp = r.share_expires_at && new Date(r.share_expires_at) <= new Date();
  const status = has
    ? r.share_status === 'published' && exp
      ? 'expired'
      : r.share_status
    : r.guest_page === false
      ? 'draft'
      : 'published';
  return {
    status,
    expires: r.share_expires_at || null,
    mode: r.lookup_mode || 'exact',
    pin: !!r.lookup_pin_hash,
    mates: !!r.show_tablemates,
    layout: r.show_layout === undefined ? true : !!r.show_layout
  };
}
function presetOf(sh) {
  if (sh.mode === 'exact' && !sh.mates && !sh.layout) return sh.pin ? 'strict' : 'balanced';
  if (sh.mode === 'prefix' && sh.mates && sh.layout) return 'open';
  return 'custom';
}
function applyShare(st) {
  if (!st || !appState.ROW) return;
  appState.ROW.share_status = st.status === 'expired' ? 'published' : st.status;
  appState.ROW.share_expires_at = st.expires || null;
  if (st.slug) appState.ROW.slug = st.slug;
  appState.ROW.lookup_mode = st.mode;
  appState.ROW.lookup_pin_hash = st.pin ? 'set' : null;
  appState.ROW.show_tablemates = !!st.mates;
  appState.ROW.show_layout = !!st.layout;
  appState.ROW.guest_page = st.status === 'published';
}
/* Errors are reported by kind only: never names, codes, or plan contents. */
function logSafe(kind, err) {
  try {
    console.warn('[supra]', kind, (err && (err.code || err.status || err.name)) || '');
  } catch (e) {}
}
async function shareCall(fn, args, okMsg, focusSel) {
  const { data, error } = await appState.SB.rpc(fn, Object.assign({ p_event: appState.ROW.id }, args || {}));
  if (error || !data) {
    logSafe('share:' + fn, error);
    toast(t(/revoked/.test(error?.message || '') ? 'shRevokedErr' : 'shErr'));
    renderLeft();
    return false;
  }
  applyShare(data);
  appState.confirmK = null;
  renderLeft();
  if (okMsg) toast(okMsg);
  if (focusSel) $(focusSel)?.focus();
  return true;
}
async function setLookup(ch) {
  const args = {
    p_event: appState.ROW.id,
    p_mode: ch.mode || appState.ROW.lookup_mode || 'prefix',
    p_pin: ch.pin === undefined ? null : ch.pin,
    p_mates: ch.mates === undefined ? !!appState.ROW.show_tablemates : ch.mates
  };
  const { data, error } = await appState.SB.rpc('set_guest_lookup', args);
  if (error || !data) {
    logSafe('share:set_guest_lookup', error);
    toast(t('lkErr'));
    renderLeft();
    return;
  }
  appState.ROW.lookup_mode = data.mode;
  appState.ROW.show_tablemates = data.mates;
  appState.ROW.lookup_pin_hash = data.pin ? 'set' : null;
  renderLeft();
  toast(ch.pin === undefined ? t('lkSaved') : ch.pin ? t('lkPinSaved') : t('lkPinGone'));
  const f = ch.mode ? `[name=lk-mode][value=${data.mode}]` : ch.mates !== undefined ? '#lk-mates' : '#lk-pin';
  $(f)?.focus();
}
function guestUrl() {
  return appState.ROW ? location.origin + '/e/' + appState.ROW.slug : '';
}
async function drawQR() {
  const box = $('#qr');
  if (!box) return;
  box.innerHTML = '';
  const u = guestUrl();
  if (!u) return;
  try {
    await loadScript(QRLIB);
    new QRCode(box, {
      text: u,
      width: 180,
      height: 180,
      colorDark: '#24302A',
      colorLight: '#FFFFFF',
      correctLevel: QRCode.CorrectLevel.M
    });
    box.querySelectorAll('img,canvas').forEach(el => {
      el.setAttribute('alt', '');
      el.setAttribute('aria-hidden', 'true');
    });
  } catch (e) {
    box.textContent = u;
  }
}

/* ---------------- inspector ---------------- */
const SW_LBL = {
    skin: 'skin',
    hairColor: 'hairColour',
    beardColor: 'beardColour',
    eye: 'eyes',
    outfitColor: 'outfitColour'
  },
  LOOK_LBL = { hair: 'hairStyle', beard: 'beard', outfit: 'outfit', glasses: 'glasses' };
const sw = (key, list, val) =>
  radios(
    t(SW_LBL[key] || key),
    list.map((c, i) => ({
      cls: 'sw',
      attr: `data-look="${key}" data-v="${c}"`,
      on: val === c,
      style: `background:${c}`,
      label: t('shadeN', { n: i + 1, of: list.length })
    }))
  );
const lch = (key, list, val, map) =>
  radios(
    t(LOOK_LBL[key] || key),
    list.map(k => ({ attr: `data-look="${key}" data-v="${k}"`, on: val === k, html: esc(t(map?.[k] || k)) }))
  );
/* The guest's own character, for the guest page: their drawing on a little place-card-style frame. */
let PCLIP = 0;
/* The look a portrait shows: the guest's own drawing, or a steady stand-in made from the name. */
function portraitLook(m) {
  return m.look && m.look.kind
    ? Object.assign(randLook(m.look.kind, rng(m.name || 'x')), m.look)
    : randLook(guessKind(m.name), rng(m.name || 'x'));
}
function portrait(m, size, label) {
  const p = P(),
    cid = 'gpc' + ++PCLIP,
    G = { look: portraitLook(m), kid: !!m.kid };
  return `<svg class="gportrait" viewBox="-40 -54 80 80" width="${size}" height="${size}" ${label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true" focusable="false"'}>
    <circle cx="0" cy="-14" r="38" fill="${p.floor}" stroke="${p.accent}" stroke-width="1.2"/><circle cx="0" cy="-14" r="34" fill="none" stroke="${p.accent}" stroke-width=".6" stroke-dasharray="2 2.5" opacity=".7"/>
    <clipPath id="${cid}"><circle cx="0" cy="-14" r="38"/></clipPath><g clip-path="url(#${cid})"><g transform="translate(0 ${G.kid ? 2 : -2})">${person(G, p, false)}</g></g></svg>`;
}
function preview(G) {
  return `<svg viewBox="-34 -50 68 84" width="130" height="161">${person(G, P())}</svg>`;
}
const rotUI = it =>
  `<div class="field"><span class="lbl">${t('rotation')}</span><div class="stepper"><button type="button" class="btn sm" data-rot="-15" aria-label="${t('rotLeft')}">↺</button><output>${it.rot || 0}°</output><button type="button" class="btn sm" data-rot="15" aria-label="${t('rotRight')}">↻</button></div><span class="muted small">${t('rotHint')}</span></div>`;
function renderRight() {
  const R = $('#right');
  if (!appState.sel.kind) {
    R.innerHTML = '';
    return;
  }
  if (appState.sel.kind === 'seat') {
    const x = T(appState.sel.t);
    if (!x || appState.sel.i >= x.seats.length) {
      appState.sel = { kind: null };
      return renderRight();
    }
    const id = x.seats[appState.sel.i],
      G = id && appState.S.guests[id];
    if (!G) {
      R.innerHTML =
        dhead(`${esc(tName(x))} · ${t('seat')} ${appState.sel.i + 1}`, t('freeSeat')) +
        `
      <label class="field"><span class="lbl">${t('guestName')}</span><input id="newname" class="inp" placeholder="${t('typeName')}"></label>
      <div class="row"><button type="button" class="btn primary" data-act="addguest">${t('addGuest')}</button><button type="button" class="btn" data-act="addrandom">${t('addRandom')}</button></div>
      ${appState.S.waiting.length ? `<div class="field"><span class="lbl">${t('orWaiting')}</span><div class="waiting">${appState.S.waiting.map(w => `<button type="button" class="wchip" data-seatwait="${w}">${esc(appState.S.guests[w]?.name)}</button>`).join('')}</div></div>` : ''}`;
      return;
    }
    const L = G.look,
      groups = [
        ...new Set(
          Object.values(appState.S.guests)
            .map(g => g.group)
            .filter(Boolean)
        )
      ];
    const myRules = appState.S.rules.filter(r => r.a === G.id || r.b === G.id);
    const others = Object.values(appState.S.guests)
      .filter(g => g.id !== G.id)
      .sort((a, b) => a.name.localeCompare(b.name));
    R.innerHTML =
      dhead(esc(G.name), `${esc(tName(x))} · ${t('seat')} ${appState.sel.i + 1}`) +
      `
    <div class="who"><div class="preview">${preview(G)}</div><div class="whotxt">
      <button type="button" class="btn primary" data-act="rnd">🎲 ${t('randomLook')}</button><button type="button" class="btn sm" data-act="kind">${L.kind === 'm' ? t('toFem') : t('toMasc')}</button></div></div>
    ${(() => {
      const iv = invOfGuest(G.id),
        st = invGuestStatus(G.id);
      return iv
        ? `<p class="small invg">${esc(t('invGuestLine', { name: iv.name }))} <span class="pill${st === 'yes' ? ' invok' : st === 'no' ? ' invno' : ''}">${t(st === 'yes' ? 'invSt_coming' : st === 'no' ? 'invSt_declined' : 'invSt_pending')}</span></p>`
        : '';
    })()}
    <label class="field"><span class="lbl">${t('name')}</span><input id="g-name" class="inp" value="${esc(G.name)}"></label>
    <div class="field"><span class="lbl">${t('side')}</span>${radios(
      t('side'),
      SIDES.map(k => ({
        attr: `data-gside="${k}"`,
        on: G.side === k,
        html: `${k ? `<i class="dot" style="background:${SIDE_COL[k]}"></i>` : ''}${t(k || 'sideNone')}`
      }))
    )}</div>
    ${det(
      'look',
      t('appearance'),
      `<span class="lbl">${t('skin')}</span>${sw('skin', OPT.skin, L.skin)}
      <span class="lbl">${t('hairStyle')}</span>${lch('hair', OPT.hair, L.hair)}
      ${L.hair !== 'bald' ? `<span class="lbl">${t('hairColour')}</span>${sw('hairColor', OPT.hairColor, L.hairColor)}` : ''}
      <span class="lbl">${t('beard')}</span>${lch('beard', OPT.beard, L.beard, BEARD_LBL)}
      ${L.beard !== 'none' || L.hair === 'bald' ? `<span class="lbl">${t('beardColour')}</span>${sw('beardColor', OPT.hairColor, L.beardColor)}` : ''}
      <span class="lbl">${t('eyes')}</span>${sw('eye', OPT.eye, L.eye)}
      <span class="lbl">${t('outfit')}</span>${lch('outfit', OPT.outfit, L.outfit)}
      ${['gown', 'tuxedo'].includes(L.outfit) ? '' : `<span class="lbl">${t('outfitColour')}</span>${sw('outfitColor', OPT.outfitColor, L.outfitColor)}`}
      <span class="lbl">${t('glasses')}</span>${lch('glasses', OPT.glasses, L.glasses, GL_LBL)}`
    )}
    ${det(
      'details',
      t('guestDetails'),
      `<label class="field"><span class="lbl">${t('group')}</span><input id="g-group" class="inp" list="grouplist" value="${esc(G.group)}" placeholder="${t('groupPh')}"><datalist id="grouplist">${groups.map(v => `<option value="${esc(v)}">`).join('')}</datalist></label>
      <div class="row2"><label class="field"><span class="lbl">${t('meal')}</span><select id="g-meal">${MEALS.map(k => `<option value="${k}" ${G.meal === k ? 'selected' : ''}>${t(MEAL_LBL[k] || k)}</option>`).join('')}</select></label>
      <label class="check"><input type="checkbox" id="g-kid" ${G.kid ? 'checked' : ''}> ${t('child')}</label></div>
      <label class="field"><span class="lbl">${t('allergies')}</span><input id="g-allergies" class="inp" value="${esc(G.allergies)}" placeholder="${t('allergiesPh')}"></label>`
    )}
    ${det(
      'grules',
      `${t('rules')}${myRules.length ? ` · ${myRules.length}` : ''}`,
      `${myRules
        .map(r => {
          const o = appState.S.guests[r.a === G.id ? r.b : r.a];
          const b = ruleBroken(r);
          return `<div class="rule ${b ? 'bad' : ''}"><span>${r.type === 'together' ? t('together') : t('apart')}: ${esc(o?.name)}</span><span class="pill ${b ? 'bad' : ''}">${b ? t('ruleBroken') : t('ruleOk')}</span><button type="button" class="x" data-delrule="${r.id}" aria-label="${t('remove')}">×</button></div>`;
        })
        .join('')}
      <div class="row2"><select id="r-type" aria-label="${esc(t('ruleType'))}"><option value="together">${t('together')}</option><option value="apart">${t('apart')}</option></select>
      <select id="r-who" aria-label="${esc(t('pickGuest'))}"><option value="">${t('pickGuest')}</option>${others.map(o => `<option value="${o.id}">${esc(o.name)}</option>`).join('')}</select></div>
      <button type="button" class="btn sm" data-act="addrule">${t('addRule')}</button>`
    )}
    <div class="row" style="border-top:1px solid var(--line);padding-top:12px"><button type="button" class="btn sm" data-act="unseat">${t('toWaiting')}</button><button type="button" class="btn sm danger" data-act="delguest">${t('removeGuest')}</button></div>
    ${appState.confirmK === 'guest' ? `<div class="confirm danger"><span>${t('removeQ', { n: esc(G.name) })}</span><div class="row"><button type="button" class="btn sm danger" data-act="delguest-yes">${t('remove')}</button><button type="button" class="btn sm" data-act="cancel">${t('keepIt')}</button></div></div>` : ''}`;
    return;
  }
  if (appState.sel.kind === 'table') {
    const x = T(appState.sel.t);
    if (!x) {
      appState.sel = { kind: null };
      return renderRight();
    }
    const free = x.seats.filter(v => !v).length;
    R.innerHTML =
      dhead(esc(tName(x)), esc(t('statSeats', { occupied: x.seats.length - free, capacity: x.seats.length }))) +
      `
      <label class="field"><span class="lbl">${t('tableName')}</span><input id="t-name" class="inp" value="${esc(x.name)}"></label>
      <div class="field"><span class="lbl">${t('shape')}</span>${chipBtns('data-shape', SHAPES, x.shape, k => (k === 'head' ? headName() : t(k)), t('shape'))}</div>
      <div class="field"><span class="lbl">${t('seats')}</span><div class="stepper"><button type="button" class="btn sm" data-act="seat-" aria-label="-">−</button><output>${x.seats.length}</output><button type="button" class="btn sm" data-act="seat+" aria-label="+">+</button><span class="muted">${esc(tn('nFree', free))}</span></div></div>
      <div class="row"><button type="button" class="btn" data-act="swap">${ICON.swap}<span>${t('swapBtn')}</span></button></div><p class="muted small" style="margin-top:-6px">${t('swapHint')}</p>
      ${rotUI(x)}
      ${det(
        'deco',
        t('decoration'),
        chipBtns('data-deco', DECOS, x.deco, k => t(DECO_LBL[k] || k), t('decoration'))
      )}
      ${det('fill', t('fillGroup'), `<p class="muted">${t('fillHint')}</p><label class="field"><span class="lbl">${t('groupName')}</span><input id="grp" class="inp" value="${UL() === 'ka' ? 'მეზობელი' : 'Neighbour'}"></label><button type="button" class="btn" data-act="fillgroup" ${free ? '' : 'disabled'}>${t('fillFree')}</button>`)}
      ${det(
        'tmore',
        t('moreActions'),
        `<span class="lbl">${t('setSide')}</span><div class="chips">${SIDES.map(k => `<button type="button" class="chip" data-tside="${k}">${k ? `<i class="dot" style="background:${SIDE_COL[k]}"></i>` : ''}${t(k || 'sideNone')}</button>`).join('')}</div>
        <div class="row"><button type="button" class="btn sm" data-act="focustable">${t('zoomTable')}</button><button type="button" class="btn sm" data-act="shuffle">${t('shuffleTable')}</button><button type="button" class="btn sm" data-act="restyle">${t('restyleTable')}</button><button type="button" class="btn sm" data-act="dup">${t('duplicate')}</button><button type="button" class="btn sm danger" data-act="deltable">${t('deleteTable')}</button></div>
        ${appState.confirmK === 'table' ? `<div class="confirm danger"><span>${t('deleteTableQ', { n: esc(tName(x)), c: x.seats.filter(Boolean).length })}</span><div class="row"><button type="button" class="btn sm danger" data-act="deltable-yes">${t('deleteTable')}</button><button type="button" class="btn sm" data-act="cancel">${t('keepIt')}</button></div></div>` : ''}`
      )}`;
    return;
  }
  if (appState.sel.kind === 'venue') {
    const v = V(appState.sel.v);
    if (!v) {
      appState.sel = { kind: null };
      return renderRight();
    }
    R.innerHTML =
      dhead(esc(v.label || t(v.type))) +
      `
      <label class="field"><span class="lbl">${t('itemName')}</span><input id="v-label" class="inp" value="${esc(v.label)}" placeholder="${esc(t(v.type))}"></label>
      <div class="row2"><div class="field"><span class="lbl">${t('width')}</span><div class="stepper"><button type="button" class="btn sm" data-vsize="w:-20">−</button><output>${v.w}</output><button type="button" class="btn sm" data-vsize="w:20">+</button></div></div>
      <div class="field"><span class="lbl">${t('height')}</span><div class="stepper"><button type="button" class="btn sm" data-vsize="h:-20">−</button><output>${v.h}</output><button type="button" class="btn sm" data-vsize="h:20">+</button></div></div></div>
      ${rotUI(v)}
      <div class="row"><button type="button" class="btn sm danger" data-act="delvenue">${t('deleteItem')}</button></div>`;
  }
}
/* Desktop: a side panel next to the plan. Phone: a modal sheet — focus moves to its heading, stays inside,
   the plan behind it is inert, and closing returns focus to whatever opened it. */
let drawerOpen = false;
function renderDrawer() {
  const open = !!appState.sel.kind || !!appState.panel,
    d = $('#drawer'),
    modal = open && isPhone(),
    was = drawerOpen;
  keepView(() => {
    d.hidden = !open;
  });
  drawerOpen = open;
  $('#left').hidden = !!appState.sel.kind || !appState.panel;
  $('#right').hidden = !appState.sel.kind;
  const L = $('#left');
  if (appState.panel && !appState.sel.kind && ['event', 'guests', 'invites', 'share'].includes(appState.panel)) {
    L.setAttribute('role', 'tabpanel');
    L.setAttribute('aria-labelledby', 'tab-' + appState.panel);
  } else {
    L.removeAttribute('role');
    L.removeAttribute('aria-labelledby');
  }
  if (modal) {
    d.setAttribute('role', 'dialog');
    d.setAttribute('aria-modal', 'true');
    d.setAttribute('aria-labelledby', 'dtitle');
  } else {
    d.removeAttribute('aria-modal');
    d.setAttribute('role', 'complementary');
    d.setAttribute('aria-label', t('details'));
    d.removeAttribute('aria-labelledby');
  }
  $('#backdrop').hidden = !modal;
  ['.bar', '#canvas'].forEach(q => {
    const el = $(q);
    if (modal) el.setAttribute('inert', '');
    else el.removeAttribute('inert');
  });
  return { opened: open && !was, closed: !open && was, modal };
}
const focusKeyOf = el => {
  if (!el || el === document.body) return null;
  if (el.id) return '#' + CSS.escape(el.id);
  const ds = Object.entries(el.dataset || {}).filter(([k]) => k !== 'h');
  if (!ds.length) return null;
  return (
    el.tagName.toLowerCase() +
    ds.map(([k, v]) => `[data-${k.replace(/[A-Z]/g, c => '-' + c.toLowerCase())}="${CSS.escape(v)}"]`).join('')
  );
};

export {
  portraitLook,
  ICON,
  OPEN,
  PDFLIB,
  XLSXLIB,
  curTheme,
  det,
  dhead,
  doFind,
  drawerOpen,
  focusKeyOf,
  guestUrl,
  hintSeen,
  loadScript,
  logSafe,
  portrait,
  radios,
  renderDrawer,
  renderLeft,
  renderRight,
  renderTop,
  setLookup,
  shareCall,
  shareInfo
};
