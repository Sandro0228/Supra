import { $, appState, esc, t } from './core.js';
import { modal } from './files.js';
/* Plans (migration 011): a free event seats up to 40 guests; an event pass or Pro removes the limit. The planner
   stops new guests past the limit (commit() in state.js undoes the step and opens the "get the pass" panel); the
   server refuses publishing and invitations for a free event above it. Editing, saving and guests added by RSVP
   answers are never blocked, so nobody loses work. Part of the planner (app.html); see js/README.md. */

const FREE_LIMIT = 40;
const PASS_PRICE = 79,
  PRO_PRICE = 99;

// appState.ACCESS = {plan: 'free'|'pass'|'pro', limit, guests}. Unknown (older database, network) = no limit.
async function loadAccess() {
  appState.ACCESS = null;
  if (!appState.SB || !appState.ROW) return;
  try {
    const { data, error } = await appState.SB.rpc('event_access', { p_event: appState.ROW.id });
    if (!error && data && data.plan) appState.ACCESS = data;
  } catch (e) {
    /* keep null: no limit */
  }
}
const guestCount = () => Object.keys(appState.S?.guests || {}).length;
const isFree = () => appState.ACCESS?.plan === 'free';
const guestLimit = () => appState.ACCESS?.limit || FREE_LIMIT;
// A step that added guests and ended above the free limit.
const overAfter = before => isFree() && guestCount() > guestLimit() && guestCount() > before;
const needsPass = err => /event pass required/i.test(err?.message || '');

// Guests panel: how much room the free plan has left.
function planMeter() {
  if (!isFree()) return '';
  const n = guestCount(),
    max = guestLimit(),
    full = n >= max;
  return `<div class="planmeter${full ? ' full' : ''}"><div class="pmtop"><span>${esc(t('plFreeCount', { n, max }))}</span><button type="button" class="btn sm${full ? ' primary' : ''}" data-act="getpass">${esc(t('plGetPass'))}</button></div><div class="pmbar" role="progressbar" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${Math.min(n, max)}" aria-label="${esc(t('plFreeCount', { n, max }))}"><i style="width:${Math.min(100, Math.round((n / max) * 100))}%"></i></div></div>`;
}

// why: 'limit' (adding guests), 'publish' (guest page), 'invite' (RSVP links) or 'info' (opened from the meter).
function paywall(why) {
  const mail = (window.SUPRA_CONFIG || {}).supportEmail || '';
  const reason = why === 'publish' ? 'plWhyPublish' : why === 'invite' ? 'plWhyInvite' : 'plWhyLimit';
  modal(`<h2>${esc(t(why === 'info' ? 'plTitleInfo' : 'plTitle', { max: guestLimit() }))}</h2>
    ${why === 'info' ? '' : `<p>${esc(t(reason, { max: guestLimit() }))}</p>`}
    <div class="passcard"><div class="passhead"><span class="passname">${esc(t('plPass'))}</span><span class="passprice">${esc(t('plPrice', { p: PASS_PRICE }))}</span></div>
      <p class="muted">${esc(t('plPassSub'))}</p>
      <ul class="ticks2"><li>${esc(t('plPerk1'))}</li><li>${esc(t('plPerk2'))}</li><li>${esc(t('plPerk3'))}</li></ul></div>
    <p class="muted">${esc(t('plPro', { p: PRO_PRICE }))}</p>
    <p class="paysoon" role="note">${esc(t('plSoon'))}${mail ? ' ' + t('plWrite', { mail: `<a href="mailto:${esc(mail)}?subject=${encodeURIComponent('Supra event pass ' + (appState.ROW?.id || ''))}">${esc(mail)}</a>` }) : ''}</p>
    <div class="row"><a class="btn" href="/pricing" target="_blank" rel="noopener">${esc(t('plSeePricing'))}</a></div>`);
}

export { FREE_LIMIT, PASS_PRICE, PRO_PRICE, guestLimit, isFree, loadAccess, needsPass, overAfter, paywall, planMeter };
