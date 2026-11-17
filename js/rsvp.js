import { $, MEAL_LBL, UL, appState, esc, setLang, t, tn, uid } from './core.js';
import { toast } from './state.js';
import { logSafe, portrait } from './panels.js';
import { fname, offerFile } from './files.js';
import { fmtDate } from './guest.js';
import { fatal } from './boot.js';
/* The household RSVP page (/r/<token>). Part of the planner (app.html); see js/README.md. */
/* ---------------- RSVP: /r/<token> ----------------
   One household's invitation. The server sends only this household (rsvp_get) and checks every answer and the
   deadline itself (rsvp_answer); this page helps people answer and keeps their typing across language switches. */
let REDIT = false,
  RBUSY = false,
  RERR = '';
const RMEALS = ['', 'meat', 'fish', 'veg', 'vegan', 'kids'];
const mealName = m => t(MEAL_LBL[m] || m);
/* Times are shown in Tbilisi time, where the wedding is, whatever the guest's phone is set to. */
function tbParts(iso) {
  const p = {};
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tbilisi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  })
    .formatToParts(new Date(iso))
    .forEach(x => (p[x.type] = x.value));
  return p;
}
function fmtWhen(iso) {
  if (!iso) return '';
  const p = tbParts(iso);
  return t('rsvpAt', { date: fmtDate(`${p.year}-${p.month}-${p.day}`), time: `${p.hour}:${p.minute}` });
}
function rsvpDraftFrom(a) {
  const inv = appState.R.invite;
  return {
    members: Object.fromEntries(
      inv.members.map(m => {
        const x = a?.members?.[m.id];
        return [m.id, { coming: x ? !!x.coming : null, meal: x?.meal || '' }];
      })
    ),
    extras: (a?.extras || []).map(x => ({ name: x.name || '', meal: x.meal || '' })),
    allergies: a?.allergies || '',
    message: a?.message || ''
  };
}
const mealSelect = (attr, val) =>
  `<select ${attr}>${RMEALS.map(k => `<option value="${k}"${val === k ? ' selected' : ''}>${esc(mealName(k))}</option>`).join('')}</select>`;
function rsvpForm() {
  const inv = appState.R.invite,
    d = appState.RD,
    left = inv.extraAllowed - d.extras.length;
  return `<form id="rform" class="rform" novalidate aria-labelledby="rformh">
    <div class="rintro"><h2 id="rformh">${esc(inv.name || t('rsvpTitle'))}</h2><p class="rlead">${t('rsvpLead')}</p></div>
    <ul class="rmembers">${inv.members
      .map(m => {
        const x = d.members[m.id],
          c = x.coming;
        return `<li class="rmember${c === true ? ' ryes' : c === false ? ' rno' : ''}" data-mid="${esc(m.id)}">
        <div class="rface">${portrait(m, 72)}</div>
        <fieldset class="rpick"><legend class="rname">${esc(m.name)}</legend>
          <label class="rchoice rc-yes"><input type="radio" name="c-${esc(m.id)}" value="yes"${c === true ? ' checked' : ''}><span>${t('rsvpYes')}</span></label>
          <label class="rchoice rc-no"><input type="radio" name="c-${esc(m.id)}" value="no"${c === false ? ' checked' : ''}><span>${t('rsvpNo')}</span></label>
        </fieldset>
        <label class="rmeal"${c === true ? '' : ' hidden'}><span>${t('meal')}</span>${mealSelect(`data-meal="${esc(m.id)}"`, x.meal)}</label>
      </li>`;
      })
      .join('')}</ul>
    ${
      inv.extraAllowed
        ? `<section class="rextras" aria-labelledby="rxh"><h3 id="rxh">${t('rsvpExtrasTitle')}</h3>
      <p class="rnote rleft">${esc(left > 0 ? tn('rsvpExtraLeft', left) : t('rsvpExtraFull'))}</p>
      ${d.extras
        .map(
          (
            x,
            i
          ) => `<div class="rextra"><label class="gfield"><span>${t('rsvpExtraName')}</span><input class="ginput rin" data-xname="${i}" value="${esc(x.name)}" maxlength="80" autocomplete="off" autocapitalize="words" spellcheck="false"></label>
        <label class="rmeal"><span>${t('meal')}</span>${mealSelect(`data-xmeal="${i}"`, x.meal)}</label>
        <button type="button" class="linkbtn rdel" data-xdel="${i}" aria-label="${esc(t('rsvpExtraRemoveA11y', { name: x.name || t('rsvpExtraName') }))}">${t('rsvpExtraRemove')}</button></div>`
        )
        .join('')}
      ${left > 0 ? `<button type="button" class="btn" data-xadd>${t('rsvpExtraAdd')}</button>` : ''}</section>`
        : ''
    }
    <label class="gfield"><span>${t('rsvpAllergies')} <span class="ropt">${t('rsvpOptional')}</span></span><textarea id="rall" class="ginput rin" maxlength="500" rows="2" aria-describedby="rallh">${esc(d.allergies)}</textarea><small id="rallh">${t('rsvpAllergiesHint')}</small></label>
    <label class="gfield"><span>${t('rsvpMessage')} <span class="ropt">${t('rsvpOptional')}</span></span><textarea id="rmsg" class="ginput rin" maxlength="1000" rows="3">${esc(d.message)}</textarea></label>
    <p id="rerr" class="gerr" role="alert" tabindex="-1">${esc(RERR)}</p>
    <button type="submit" class="btn primary rsend"${RBUSY ? ' aria-busy="true" disabled' : ''}>${RBUSY ? t('rsvpSending') : REDIT ? t('rsvpSave') : t('rsvpSend')}</button>
    ${REDIT ? `<button type="button" class="linkbtn" data-rcancel>${t('rsvpCancel')}</button>` : ''}
    ${appState.R.deadline ? `<p class="rnote">${esc(t('rsvpUntil', { when: fmtWhen(appState.R.deadline) }))}</p>` : ''}
  </form>`;
}
function rsvpDone() {
  const inv = appState.R.invite,
    a = inv.answer || { members: {}, extras: [] },
    ex = a.extras || [],
    n = inv.members.filter(m => a.members[m.id]?.coming).length + ex.length;
  return `<section class="rdone" id="rdone" tabindex="-1" aria-labelledby="rdoneh">
    <div class="rfaces" aria-hidden="true">${inv.members.map(m => `<span class="${a.members[m.id]?.coming ? '' : 'rno'}">${portrait(m, 64)}</span>`).join('')}</div>
    <h2 id="rdoneh">${n ? esc(tn('rsvpThanksYes', n)) : t('rsvpThanksNo')}</h2>
    <ul class="rsum">${inv.members
      .map(m => {
        const x = a.members[m.id];
        return `<li><span class="rn">${esc(m.name)}</span><span class="${x?.coming ? 'ryes' : 'rnot'}">${!x ? t('rsvpNoAnswer') : x.coming ? t('rsvpYes') : t('rsvpNo')}${x?.coming && x.meal ? `<small>${esc(mealName(x.meal))}</small>` : ''}</span></li>`;
      })
      .join('')}
      ${ex.map(x => `<li><span class="rn">${esc(x.name)}</span><span class="ryes">${t('rsvpYes')}${x.meal ? `<small>${esc(mealName(x.meal))}</small>` : ''}</span></li>`).join('')}</ul>
    ${a.allergies ? `<div class="rextra-text"><h3>${t('rsvpAllergies')}</h3><p>${esc(a.allergies)}</p></div>` : ''}
    ${a.message ? `<div class="rextra-text"><h3>${t('rsvpMessage')}</h3><p>${esc(a.message)}</p></div>` : ''}
    <div class="racts">${appState.R.closed ? '' : `<button type="button" class="btn" data-rchange>${t('rsvpChange')}</button>`}${appState.R.event.startsAt ? `<button type="button" class="btn" data-rics>${t('rsvpCalendar')}</button>` : ''}</div>
    <p class="rnote">${appState.R.closed ? t('rsvpClosed') : appState.R.deadline ? esc(t('rsvpUntil', { when: fmtWhen(appState.R.deadline) })) : ''}</p>
  </section>`;
}
function rsvpRender() {
  document.body.classList.add('guestmode');
  document.documentElement.lang = UL();
  const ev = appState.R.event,
    a = appState.R.invite.answer;
  document.title = [t('rsvpTitle'), ev.name, 'Supra'].filter(Boolean).join(' · ');
  const when = ev.startsAt ? fmtWhen(ev.startsAt) : fmtDate(ev.date);
  const body = appState.R.closed
    ? a
      ? rsvpDone()
      : `<p class="gnone rclosed" role="status">${t('rsvpClosed')}</p>`
    : !a || REDIT
      ? rsvpForm()
      : rsvpDone();
  $('#guest').innerHTML = `<div class="gwrap rwrap">
    <div class="glang" role="radiogroup" aria-label="${esc(t('language'))}">${[
      ['en', 'English'],
      ['ka', 'ქართული']
    ]
      .map(
        ([k, l]) =>
          `<button type="button" role="radio" data-glang="${k}" aria-checked="${UL() === k}" tabindex="${UL() === k ? 0 : -1}" lang="${k}">${l}</button>`
      )
      .join('')}</div>
    <header class="rhead">${when ? `<p class="gdate">${esc(when)}</p>` : ''}<h1>${esc(ev.name || 'Supra')}</h1>
      ${ev.venue || ev.mapUrl ? `<p class="rvenue">${esc(ev.venue || '')}${ev.mapUrl ? `${ev.venue ? ' ' : ''}<a href="${esc(ev.mapUrl)}" target="_blank" rel="noopener noreferrer">${t('rsvpMap')}</a>` : ''}</p>` : ''}</header>
    ${body}
    <footer class="gpowered"><span>${esc(t('poweredBy'))}</span>${SupraLogo({ kind: 'full', width: 100, alt: UL() === 'ka' ? '' : 'Supra', cls: 'gplogo' })}</footer></div>`;
}
function rsvpInput(e) {
  const el = e.target;
  if (!appState.RD) return;
  if (el.type === 'radio' && el.name.startsWith('c-')) {
    const li = el.closest('[data-mid]'),
      yes = el.value === 'yes';
    appState.RD.members[li.dataset.mid].coming = yes;
    li.classList.toggle('ryes', yes);
    li.classList.toggle('rno', !yes);
    const ml = li.querySelector('.rmeal');
    if (ml) ml.hidden = !yes;
    if (RERR) {
      RERR = '';
      const p = $('#rerr');
      if (p) p.textContent = '';
    }
    return;
  }
  if (el.dataset.meal !== undefined) {
    appState.RD.members[el.dataset.meal].meal = el.value;
    return;
  }
  if (el.dataset.xname !== undefined) {
    appState.RD.extras[+el.dataset.xname].name = el.value;
    return;
  }
  if (el.dataset.xmeal !== undefined) {
    appState.RD.extras[+el.dataset.xmeal].meal = el.value;
    return;
  }
  if (el.id === 'rall') appState.RD.allergies = el.value;
  else if (el.id === 'rmsg') appState.RD.message = el.value;
}
function rsvpCheck() {
  for (const m of appState.R.invite.members)
    if (appState.RD.members[m.id].coming === null)
      return { msg: t('rsvpPickAll', { name: m.name }), focus: `input[name="c-${CSS.escape(m.id)}"]` };
  for (let i = 0; i < appState.RD.extras.length; i++)
    if (!appState.RD.extras[i].name.trim()) return { msg: t('rsvpNameNeeded'), focus: `[data-xname="${i}"]` };
  return null;
}
async function rsvpSend() {
  if (RBUSY) return;
  const bad = rsvpCheck();
  if (bad) {
    RERR = bad.msg;
    rsvpRender();
    document.querySelector(bad.focus)?.focus();
    return;
  }
  RBUSY = true;
  RERR = '';
  rsvpRender();
  const ans = {
    members: Object.fromEntries(
      Object.entries(appState.RD.members).map(([k, v]) => [k, { coming: v.coming, meal: v.coming ? v.meal : '' }])
    ),
    extras: appState.RD.extras.map(x => ({ name: x.name.trim(), meal: x.meal })),
    allergies: appState.RD.allergies.trim(),
    message: appState.RD.message.trim()
  };
  let r;
  try {
    const { data, error } = await appState.SB.rpc('rsvp_answer', { p_token: appState.RTOK, p_answer: ans });
    if (error) throw error;
    r = data || { status: 'error' };
  } catch (e) {
    logSafe('rsvp', e);
    r = { status: 'error' };
  }
  RBUSY = false;
  if (r.status === 'ok' || r.status === 'closed') {
    appState.R = r;
    REDIT = false;
    appState.RD = rsvpDraftFrom(appState.R.invite.answer);
    rsvpRender();
    if (r.status === 'ok') toast(t('rsvpSaved'));
    ($('#rdone') || $('.rclosed'))?.focus();
    return;
  }
  if (r.status === 'unavailable') {
    fatal(t('rsvpUnavailable'));
    return;
  }
  RERR = t(r.status === 'rate_limited' ? 'rsvpRate' : 'rsvpErr');
  rsvpRender();
  $('#rerr')?.focus();
}
function rsvpIcs() {
  const ev = appState.R.event,
    s = new Date(ev.startsAt),
    e = new Date(s.getTime() + 6 * 3600e3),
    f = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const tx = v =>
    String(v || '')
      .replace(/[\;,]/g, m => '\\' + m)
      .replace(/\r?\n/g, '\\n');
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Supra//RSVP//EN',
    'BEGIN:VEVENT',
    'UID:supra-' + uid() + uid() + '@supra',
    'DTSTAMP:' + f(new Date()),
    'DTSTART:' + f(s),
    'DTEND:' + f(e),
    'SUMMARY:' + tx(ev.name),
    ev.venue ? 'LOCATION:' + tx(ev.venue) : '',
    ev.mapUrl ? 'URL:' + ev.mapUrl : '',
    'END:VEVENT',
    'END:VCALENDAR'
  ]
    .filter(Boolean)
    .join('\r\n');
  offerFile(fname('.ics'), new Blob([ics], { type: 'text/calendar' }));
}
function rsvpClick(e) {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.glang) {
    setLang(b.dataset.glang);
    rsvpRender();
    $(`[data-glang="${b.dataset.glang}"]`)?.focus();
    return;
  }
  if (b.dataset.xadd !== undefined) {
    appState.RD.extras.push({ name: '', meal: '' });
    rsvpRender();
    $(`[data-xname="${appState.RD.extras.length - 1}"]`)?.focus();
    return;
  }
  if (b.dataset.xdel !== undefined) {
    appState.RD.extras.splice(+b.dataset.xdel, 1);
    rsvpRender();
    ($('[data-xadd]') || $('#rall'))?.focus();
    return;
  }
  if (b.dataset.rchange !== undefined) {
    REDIT = true;
    RERR = '';
    appState.RD = rsvpDraftFrom(appState.R.invite.answer);
    rsvpRender();
    $('#rform input[type=radio]:checked, #rform input[type=radio]')?.focus();
    return;
  }
  if (b.dataset.rcancel !== undefined) {
    REDIT = false;
    RERR = '';
    appState.RD = rsvpDraftFrom(appState.R.invite.answer);
    rsvpRender();
    $('[data-rchange]')?.focus();
    return;
  }
  if (b.dataset.rics !== undefined) rsvpIcs();
}
document.addEventListener('submit', e => {
  if (e.target.id === 'rform') {
    e.preventDefault();
    rsvpSend();
  }
});

export { fmtWhen, rsvpClick, rsvpDraftFrom, rsvpInput, rsvpRender };
