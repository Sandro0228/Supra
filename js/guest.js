'use strict';
/* The public "find my seat" page (/e/<token>). Part of the planner (app.html); see js/README.md. */
/* ---------------- guest "find my seat" view ----------------
   The public page never receives the guest list. It gets a sanitized layout (public_plan) and asks the server
   for one name at a time (find_seat), which returns only name, drawing, table and seat. */
let GROOM = false,
  GL = { mode: 'prefix', pin: false },
  GQ = '',
  GPIN = '',
  gseq = 0,
  gT = null,
  GS = { status: 'idle', matches: [], chosen: -1 };
const gnorm = s =>
  String(s || '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
/* Dates: "31 ოქტომბერი, 2026" / "31 October 2026". Georgian is spelled out here because some browsers ship without Georgian date data. */
const KA_MONTHS = [
  'იანვარი',
  'თებერვალი',
  'მარტი',
  'აპრილი',
  'მაისი',
  'ივნისი',
  'ივლისი',
  'აგვისტო',
  'სექტემბერი',
  'ოქტომბერი',
  'ნოემბერი',
  'დეკემბერი'
];
function fmtDate(d) {
  if (!d) return '';
  const [y, m, day] = d.split('-').map(Number);
  if (!y || !m || !day) return '';
  return UL() === 'ka'
    ? `${day} ${KA_MONTHS[m - 1]}, ${y}`
    : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(
        new Date(d + 'T12:00')
      );
}
function gDate() {
  return fmtDate(S.event.date);
}
function guestMeta() {
  document.documentElement.lang = UL();
  document.title = PREVIEW
    ? t('pvTitle') + ' · ' + (S.event.name || 'Supra')
    : [t('fgTitle'), S.event.name, 'Supra'].filter(Boolean).join(' · ');
  let m = document.querySelector('meta[name=description]');
  if (!m) {
    m = document.createElement('meta');
    m.name = 'description';
    document.head.appendChild(m);
  }
  m.content = t('fgMeta', { event: S.event.name || 'Supra' });
}
function guestRender() {
  document.body.classList.add('guestmode');
  guestMeta();
  const date = gDate(),
    hint = GL.mode === 'exact' ? t('fgHintExact') : t('fgHintPrefix');
  $('#guest').innerHTML =
    `<div class="gwrap">${PREVIEW ? `<div class="gpreview" role="status"><b>${t('pvTitle')}</b><span>${esc(t('pvHint', { status: t('st_' + PREVIEW) }))}</span></div>` : ''}
    <div class="glang" role="radiogroup" aria-label="${esc(t('language'))}">${[
      ['en', 'English'],
      ['ka', 'ქართული']
    ]
      .map(
        ([k, l]) =>
          `<button type="button" role="radio" data-glang="${k}" aria-checked="${UL() === k}" tabindex="${UL() === k ? 0 : -1}" lang="${k}">${l}</button>`
      )
      .join('')}</div>
    ${date ? `<p class="gdate"><time datetime="${esc(S.event.date)}">${esc(date)}</time></p>` : ''}<h1>${esc(S.event.name || 'Supra')}</h1>
    <form id="gform" class="gform" role="search" autocomplete="off" novalidate>
      <h2 id="gtitle">${t('fgTitle')}</h2>
      ${GL.pin ? `<label class="gfield"><span>${t('fgPin')}</span><input id="gpin" class="ginput" type="text" inputmode="text" autocomplete="one-time-code" maxlength="12" value="${esc(GPIN)}" aria-describedby="gpinhint"><small id="gpinhint">${t('fgPinNeed')}</small></label>` : ''}
      <label class="gfield"><span>${t('fgLabel')}</span><input id="gq" class="ginput" type="search" placeholder="${esc(t(GL.mode === 'exact' ? 'fgPhFull' : 'fgPh'))}" value="${esc(GQ)}" aria-describedby="ghint gerr" spellcheck="false" autocapitalize="words"${GERR ? ' aria-invalid="true"' : ''}></label>
      <small id="ghint" class="ghint">${hint}</small>
      <p id="gerr" class="gerr" role="alert">${GERR ? esc(t(GERR)) : ''}</p>
      <button type="submit" class="btn primary gfind">${t('fgFind')}</button>
    </form>
    <div id="gres" class="gres" aria-live="polite"></div><div id="gmap" class="gmap"></div>
    ${MODE === 'edit' ? `<button type="button" class="linkbtn" data-gback>${t('fgBack')}</button>` : ''}
    <footer class="gpowered"><span>${esc(t('poweredBy'))}</span>${SupraLogo({ kind: 'full', width: 100, alt: UL() === 'ka' ? '' : 'Supra', cls: 'gplogo' })}</footer></div>`;
  guestShow();
}
function guestStatusMsg(st) {
  const w = GS.retry || 0;
  return (
    {
      short: t('fgShort'),
      many: t('fgMany'),
      rate_limited: w ? t(w < 90 ? 'fgRateSec' : 'fgRateMin', { n: w < 90 ? w : Math.ceil(w / 60) }) : t('fgRate'),
      pin: GPIN ? t('fgPinBad') : t('fgPinNeed'),
      not_found: t('fgUnavailable'),
      unavailable: t('fgUnavailable'),
      error: t('fgErr'),
      none: t('fgNone'),
      searching: t('fgSearching')
    }[st] || ''
  );
}
function guestShow() {
  const res = $('#gres'),
    map = $('#gmap');
  if (!res) return;
  const st = GS.status,
    ms = GS.matches;
  map.innerHTML = '';
  if (st === 'idle') {
    res.innerHTML = '';
    return;
  }
  if (st !== 'ok') {
    res.innerHTML = `<p class="gnone ${st === 'searching' ? 'gwait' : ''}" ${['rate_limited', 'error', 'pin', 'unavailable'].includes(st) ? 'role="alert"' : ''}>${esc(guestStatusMsg(st))}</p>`;
    return;
  }
  if (!ms.length) {
    res.innerHTML = `<div class="gempty"><p class="gnone">${esc(t('fgNone'))}</p></div>`;
    return;
  }
  if (ms.length > 1 && GS.chosen < 0) {
    res.innerHTML = `<p class="gnone">${esc(t('fgPick'))}</p><ul class="ghits">${ms.map((m, i) => `<li><button type="button" class="ghit" data-ghit="${i}">${portrait(m, 44)}<span class="gname">${esc(m.name)}</span><span class="gtable">${esc(gTableName(m))}${m.seat != null && seatMode() === 'seat' ? ` · ${esc(t('seatN', { number: m.seat }))}` : ''}</span></button></li>`).join('')}</ul>`;
    return;
  }
  const m = ms[Math.max(0, GS.chosen)],
    mates = Array.isArray(m.mates) ? m.mates.filter(Boolean) : [];
  res.innerHTML = `<div class="gcard" tabindex="-1" id="gcard"><div class="gchar">${portrait(m, 132, t('fgPortrait', { name: m.name }))}</div><span class="lbl">${t('fgTable')}</span><div class="gbig">${esc(gTableName(m))}</div>
    <div class="gname">${esc(m.name)}${m.seat != null && seatMode() === 'seat' ? ` · <span class="gseat">${esc(t('seatN', { number: m.seat }))}</span>` : ''}</div>
    ${m.seat == null || seatMode() === 'table' ? `<p class="gfree"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3h10l-1 9H8z"/><path d="M6 12h12M8 12l-1 9M16 12l1 9"/></svg><span>${t('fgAnySeat')}</span></p>` : ''}
    ${mates.length ? `<h3 class="lbl">${t('fgWith')}</h3><p class="gwith">${mates.map(esc).join(' · ')}</p>` : ''}
    <div class="row gacts">${ms.length > 1 ? `<button type="button" class="linkbtn" data-gall>${t('fgNotYou')}</button>` : ''}<button type="button" class="linkbtn" data-gagain>${t('fgAgain')}</button></div></div>`;
  gMap(m);
}
function gTableName(m) {
  const x = S.tables[m.table];
  return x ? tName(x) : tName({ shape: m.tableName === 'Head table' ? 'head' : '', name: m.tableName || '' });
}
function gMap(m) {
  const x = S.tables[m.table];
  if (!x) return;
  const own = m.seat != null && seatMode() === 'seat';
  if (!own) {
    const keepSel = sel;
    sel = { kind: null };
    const { B, inner } = withView(() => planSVG({ guest: true, dim: x.id }));
    sel = keepSel;
    return gMapShow(x, B, inner, t('fgMapAltTable', { table: tName(x) }));
  }
  const keepSeat = x.seats[m.seat - 1],
    keepSel = sel;
  S.guests.__hit = {
    id: '__hit',
    name: m.name,
    look: m.look || randLook(guessKind(m.name)),
    kid: !!m.kid,
    side: '',
    group: '',
    meal: '',
    allergies: ''
  };
  x.seats[m.seat - 1] = '__hit';
  sel = { kind: null };
  const { B, inner } = withView(() => planSVG({ guest: true, dim: x.id, hi: '__hit' }));
  x.seats[m.seat - 1] = keepSeat;
  delete S.guests.__hit;
  sel = keepSel;
  gMapShow(x, B, inner, t('fgMapAlt', { table: tName(x), seat: m.seat }));
}
function gMapShow(x0, B, inner, alt) {
  const x = withView(() => T(x0.id));
  // Start close on the guest's table so names stay readable on phones; the whole room is one tap away.
  const [w, h] = dims(x),
    pad = 70,
    vb = GROOM
      ? `${B.x} ${B.y} ${B.w} ${B.h}`
      : `${x.x - w / 2 - pad} ${x.y - h / 2 - pad} ${w + 2 * pad} ${h + 2 * pad}`;
  $('#gmap').innerHTML =
    `<svg viewBox="${vb}" role="img" aria-label="${esc(alt)}"><title>${esc(alt)}</title>${inner}</svg>
    <div class="gmapbtns"><button type="button" class="linkbtn" data-groom aria-pressed="${GROOM}">${GROOM ? t('fgMyTable') : t('fgRoom')}</button><button type="button" class="linkbtn" data-grot>${ICON.turn}<span>${t('rotView')}</span></button></div>`;
}
/* Owner's preview (#find inside the editor) uses the same rules locally, without the PIN. */
function findLocal(q) {
  const qn = gnorm(q);
  if (qn.replace(/ /g, '').length < 3) return { status: 'short', matches: [] };
  const sw = qn.replace(/^(\S+) (.+)$/, '$2 $1'),
    rows = [];
  S.tables.forEach((x, ti) =>
    x.seats.forEach((id, si) => {
      const g = id && S.guests[id];
      if (g && !g.anon) rows.push({ g, ti, si, nn: gnorm(g.name) });
    })
  );
  const hit = r =>
    GL.mode === 'exact' ? r.nn === qn || r.nn === sw : r.nn.startsWith(qn) || (' ' + r.nn).includes(' ' + qn);
  const ms = rows.filter(hit);
  if (ms.length > 5) return { status: 'many', matches: [] };
  return {
    status: 'ok',
    matches: ms.map(r => ({
      name: r.g.name,
      look: r.g.look,
      kid: r.g.kid,
      table: r.ti,
      tableName: S.tables[r.ti].name,
      seat: seatMode() === 'table' ? null : r.si + 1,
      mates: ROW?.show_tablemates ? rows.filter(o => o.ti === r.ti && o.si !== r.si).map(o => o.g.name) : null
    }))
  };
}
/* Guests search on submit only: nothing is sent while typing, so the page can't be used as an autocomplete. */
let GERR = '';
function setGuestErr(k) {
  GERR = k;
  const i = $('#gq'),
    e = $('#gerr');
  if (e) e.textContent = k ? t(k) : '';
  if (i) {
    k ? i.setAttribute('aria-invalid', 'true') : i.removeAttribute('aria-invalid');
  }
}
async function guestSearch() {
  GQ = $('#gq')?.value || '';
  GPIN = $('#gpin')?.value || '';
  const qn = gnorm(GQ);
  if (!qn) {
    setGuestErr('fgEmpty');
    GS = { status: 'idle', matches: [], chosen: -1 };
    guestShow();
    $('#gq')?.focus();
    return;
  }
  if (qn.replace(/ /g, '').length < 3) {
    setGuestErr('fgShort');
    GS = { status: 'idle', matches: [], chosen: -1 };
    guestShow();
    $('#gq')?.focus();
    return;
  }
  setGuestErr('');
  const my = ++gseq;
  if (MODE !== 'guest') {
    const r = findLocal(GQ);
    GS = { status: r.status, matches: r.matches, chosen: r.matches.length === 1 ? 0 : -1 };
    guestShow();
    return;
  }
  GS = { status: 'searching', matches: [], chosen: -1 };
  guestShow();
  let r;
  try {
    const { data, error } = PREVIEW
      ? await SB.rpc('preview_find_seat', { p_event: PREVIEW_ID, p_query: GQ })
      : await SB.rpc('find_seat', { p_slug: SLUG, p_query: GQ, p_pin: GL.pin ? GPIN : null });
    if (error) throw error;
    r = data || { status: 'error', matches: [] };
  } catch (e) {
    logSafe('lookup', e);
    r = { status: 'error', matches: [] };
  }
  if (my !== gseq) return; // a newer search is on its way
  if (r.status === 'ok' && !(r.matches || []).length) r.status = 'none';
  GS = {
    status: r.status || 'error',
    matches: r.matches || [],
    chosen: (r.matches || []).length === 1 ? 0 : -1,
    retry: r.retry_after
  };
  guestShow();
  if (r.status === 'pin') $('#gpin')?.focus();
}
function guestClick(e) {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.ghit !== undefined) {
    GS.chosen = +b.dataset.ghit;
    guestShow();
    $('#gcard')?.focus();
    return;
  }
  if (b.dataset.grot !== undefined) {
    const n = turnView();
    guestShow();
    $('[data-grot]')?.focus();
    return;
  }
  if (b.dataset.groom !== undefined) {
    GROOM = !GROOM;
    guestShow();
    $('[data-groom]')?.focus();
    return;
  }
  if (b.dataset.gagain !== undefined) {
    GQ = '';
    GS = { status: 'idle', matches: [], chosen: -1 };
    GROOM = false;
    const q = $('#gq');
    q.value = '';
    guestShow();
    q.focus();
    return;
  }
  if (b.dataset.gall !== undefined) {
    GS.chosen = -1;
    guestShow();
    $('.ghit')?.focus();
    return;
  }
  if (b.dataset.glang) {
    const a = document.activeElement?.id;
    setLang(b.dataset.glang);
    guestRender();
    (a ? document.getElementById(a) : $(`[data-glang="${b.dataset.glang}"]`))?.focus();
    return;
  }
  if (b.dataset.gback !== undefined) {
    history.replaceState(null, '', location.pathname + location.search);
    route();
  }
}
document.addEventListener('submit', e => {
  if (e.target.id === 'gform') {
    e.preventDefault();
    guestSearch();
  }
});
function route() {
  $('#loading').hidden = true;
  guestMode = MODE === 'guest' || MODE === 'rsvp' || location.hash === '#find';
  $('#app').hidden = guestMode;
  $('#guest').hidden = !guestMode;
  if (MODE === 'rsvp') {
    rsvpRender();
    return;
  }
  if (guestMode) {
    if (MODE === 'edit') GL = { mode: ROW?.lookup_mode || 'prefix', pin: false };
    guestRender();
    if (MODE === 'guest' || !GQ) $('#gq')?.focus({ preventScroll: true });
  } else {
    document.body.classList.remove('guestmode');
    renderAll();
  }
}
window.addEventListener('hashchange', route);
