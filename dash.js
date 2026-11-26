(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s =>
    String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const CFG = window.SUPRA_CONFIG || {},
    L = window.SUPRA_I18N;
  let lang =
    (() => {
      try {
        return localStorage.getItem('supra.lang');
      } catch (e) {
        return null;
      }
    })() || ((navigator.language || '').startsWith('ka') ? 'ka' : 'en');
  const t = (k, v) => {
    let s = (L[lang] || L.en)[k] ?? L.en[k] ?? k;
    if (v) for (const x in v) s = s.split('{' + x + '}').join(v[x]);
    return s;
  };
  const tn = (k, n) => {
    const f = new Intl.PluralRules(lang).select(n),
      D = L[lang] || L.en;
    return t(D[k + '_' + f] !== undefined ? k + '_' + f : k, { count: n });
  };
  const next = (() => {
    const n = new URLSearchParams(location.search).get('next');
    return n && n.startsWith('/') && !n.startsWith('//') ? n : null;
  })();
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
  const fmtDate = d => {
    if (!d) return '';
    const [y, m, day] = String(d).slice(0, 10).split('-').map(Number);
    if (!y || !m || !day) return '';
    return lang === 'ka'
      ? `${day} ${KA_MONTHS[m - 1]}, ${y}`
      : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(
          new Date(String(d).slice(0, 10) + 'T12:00')
        );
  };
  const rand = n => {
    const a = 'abcdefghjkmnpqrstuvwxyz23456789';
    let s = '';
    crypto.getRandomValues(new Uint8Array(n)).forEach(v => (s += a[v % a.length]));
    return s;
  };
  function toast(m) {
    const d = document.createElement('div');
    d.className = 'toast';
    d.setAttribute('role', 'status');
    d.textContent = m;
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 2400);
  }

  /* ---------------- auth state machine ----------------
   initializing → anonymous | authenticated | error
   anonymous → authenticating → anonymous (with a form error) | authenticated
   Every auth change bumps `gen`; an async result is applied only if gen has not moved since it started,
   so a slow session restore or a late failed sign-in can never overwrite a newer state. */
  const A = { state: 'initializing', session: null, gen: 0, busy: null, formError: null, initError: null };
  let SB = null,
    sub = null;
  const F = { mode: 'signin', email: '', sent: false, recovery: false }; // sign-in form state survives re-renders and language changes
  const D = {
    events: null,
    trash: [],
    plans: null, // the owner's entitlements (migration 011); null = unknown
    invites: [], // invitation replies per event (migration 008): id, event_id, name, members, state, revoked
    replies: [], // the latest guest answers across all events (invite_log)
    menuId: null, // the event whose ⋯ menu is open
    trashOpen: false,
    forever: null,
    fverr: '',
    loadErr: false,
    confirmId: null,
    name: '',
    date: '',
    nerr: '',
    newOpen: false
  }; // dashboard state

  function setAuth(state, patch) {
    Object.assign(A, patch || {}, { state });
    render();
  }
  function sessionValid(s) {
    return !!(s && s.user && (!s.expires_at || s.expires_at * 1000 > Date.now() - 5000));
  }
  function onAuthEvent(ev, s) {
    if (ev === 'INITIAL_SESSION' && !sessionValid(s)) return; // the explicit restore() decides the anonymous case
    if (ev === 'TOKEN_REFRESHED' && A.state === 'authenticated' && sessionValid(s)) {
      A.session = s;
      return;
    }
    A.gen++;
    if (ev === 'PASSWORD_RECOVERY') {
      F.recovery = true;
      F.mode = 'signin';
      setAuth('anonymous', { session: null, busy: null, formError: null });
      return;
    }
    if (F.recovery && ev !== 'SIGNED_OUT') return;
    if (sessionValid(s)) {
      const was = A.state === 'authenticated';
      if (next && !was) {
        location.replace(next);
        return;
      }
      setAuth('authenticated', { session: s, busy: null, formError: null });
      if (!was) loadEvents();
      return;
    }
    D.events = null;
    F.sent = false;
    setAuth('anonymous', { session: null, busy: null });
  }
  function withTimeout(p, ms) {
    return Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('timeout')), ms))]);
  }
  async function restore() {
    const gen = ++A.gen;
    setAuth('initializing', { initError: null });
    try {
      const { data, error } = await withTimeout(SB.auth.getSession(), 12000);
      if (gen !== A.gen) return;
      const s = data && data.session;
      if (!error && sessionValid(s)) {
        if (next) {
          location.replace(next);
          return;
        }
        setAuth('authenticated', { session: s });
        loadEvents();
        return;
      }
      setAuth('anonymous', { session: null });
    } catch (e) {
      if (gen !== A.gen) return;
      setAuth('error', { initError: (e && e.message) || 'error' });
    }
  }

  /* ---------------- chrome ---------------- */
  const SUN =
      '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    MOON =
      '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
  const curTheme = () =>
    document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  function chrome() {
    // setting lang, even to the same value, restyles the whole page: only on change
    if (document.documentElement.lang !== lang) document.documentElement.lang = lang;
    document.title = t('dTitle');
    const md = document.querySelector('meta[name=description]');
    if (md) md.content = t('dMeta');
    const th = $('#theme'),
      dark = curTheme() === 'dark';
    th.innerHTML = dark ? SUN : MOON;
    th.removeAttribute('aria-pressed');
    th.setAttribute('aria-label', t(dark ? 'toLight' : 'toDark'));
    th.title = t(dark ? 'toLight' : 'toDark');
    $('#lang').setAttribute('aria-label', t('language'));
    document.querySelector('.hdrnav')?.setAttribute('aria-label', t('lpNavA11y'));
    $('#lang').innerHTML = [
      ['en', 'EN', 'English'],
      ['ka', 'ქარ', 'ქართული']
    ]
      .map(
        ([k, s, full]) =>
          `<button type="button" role="radio" data-lang="${k}" aria-checked="${lang === k}" tabindex="${lang === k ? 0 : -1}" aria-label="${full}" lang="${k}"><span class="full">${full}</span><span class="short" aria-hidden="true">${s}</span></button>`
      )
      .join('');
    // landing page: text and pictures in the chosen language; signed in, only the event list shows
    document.querySelectorAll('[data-t]').forEach(el => (el.textContent = t(el.dataset.t)));
    document.querySelectorAll('img[data-img]').forEach(img => {
      const k = img.dataset.img,
        src = `/landing/${k}-${lang === 'ka' ? 'ka' : 'en'}.webp`;
      if (img.getAttribute('src') !== src) img.setAttribute('src', src);
      img.alt = t('lpAlt_' + k);
    });
    const authed = A.state === 'authenticated';
    document.body.classList.toggle('signedin', authed);
    document.querySelectorAll('.landing').forEach(el => (el.hidden = authed));
    $('#hdrstart').hidden = authed;
    // signed in: the account menu behind the initials button holds account, plans and sign out
    $('#acct').hidden = !authed;
    const email = authed ? A.session.user.email || '' : '',
      init = (email.trim()[0] || '·').toUpperCase();
    $('#who').textContent = email;
    $('#acctbtn').textContent = init;
    document.querySelector('.acctinit').textContent = init;
    $('#acctbtn').setAttribute('aria-label', t('acMenuA11y', { email }));
    $('#signout').textContent = t('dSignOut');
  }
  function render() {
    chrome();
    if (A.state === 'initializing') return renderLoading();
    if (A.state === 'error') return renderInitError();
    if (A.state === 'authenticated') return ROUTE === 'account' ? renderAccount() : renderDash();
    if (ROUTE === 'account') {
      // the account page needs a signed-in user: sign in first, then come back here
      location.replace('/?next=/account');
      return;
    }
    renderSignIn();
  }
  function renderLoading() {
    $('#main').innerHTML =
      `<div class="card signin loading" role="status" aria-live="polite"><span class="spinner" aria-hidden="true"></span><span>${esc(t('dLoading'))}</span></div>`;
  }
  function renderInitError() {
    $('#main').innerHTML =
      `<div class="card signin" role="alert"><p class="msg err">${esc(t('dInitErr'))}</p><button type="button" class="btn primary" data-act="retry">${esc(t('dRetry'))}</button></div>`;
  }

  /* ---------------- sign-in ---------------- */
  function friendly(err) {
    const m = ((err && err.message) || '').toLowerCase();
    if (m.includes('invalid login')) return { text: t('dBadLogin'), field: 'pw' };
    if (m.includes('already registered') || m.includes('already been registered'))
      return { text: t('dExists'), field: 'email' };
    if (m.includes('rate limit')) return { text: t('dRate'), field: null };
    if (m.includes('password') && (m.includes('least') || m.includes('weak') || m.includes('short')))
      return { text: t('dWeak'), field: 'pw' };
    if (m.includes('not confirmed')) return { text: t('dUnconfirmed'), field: 'email' };
    if (m.includes('fetch') || m.includes('network') || m.includes('timeout'))
      return { text: t('dNetErr'), field: null };
    return { text: t('dErr'), field: null };
  }
  function renderSignIn() {
    const fe = A.formError,
      busy = A.state === 'authenticating';
    const errFor = f => (fe && fe.field === f ? ` aria-invalid="true" aria-describedby="ferr"` : '');
    const submitLbl = F.recovery
      ? 'dSavePw'
      : F.mode === 'signup'
        ? 'dCreateAcct'
        : F.mode === 'forgot'
          ? 'dSendReset'
          : F.mode === 'link'
            ? 'dSend'
            : 'dSignIn';
    const emailF = `<label class="field"><span class="lbl">${esc(t('dEmail'))}</span><input class="inp" id="email" name="email" type="email" autocomplete="email" required value="${esc(F.email)}" placeholder="name@example.com"${errFor('email')}></label>`;
    const pwF = `<label class="field"><span class="lbl">${esc(t('dPassword'))}</span><input class="inp" id="pw" name="password" type="password" autocomplete="${F.mode === 'signup' || F.recovery ? 'new-password' : 'current-password'}" minlength="6" required${errFor('pw')}${F.mode === 'signup' || F.recovery ? ' aria-describedby="pwhint' + (fe && fe.field === 'pw' ? ' ferr' : '') + '"' : ''}>${F.mode === 'signup' || F.recovery ? `<span class="small" id="pwhint">${esc(t('dPwHint'))}</span>` : ''}</label>`;
    let body;
    if (F.recovery) body = `<h2 id="ftitle">${esc(t('dNewPw'))}</h2>${pwF}`;
    else if (F.sent)
      body = `<p class="msg" role="status">${esc(t(F.mode === 'forgot' ? 'dResetSent' : F.mode === 'signup' ? 'dConfirm' : 'dSent'))}</p><button type="button" class="linkish" data-mode="signin">${esc(t('dBack'))}</button>`;
    else if (F.mode === 'link' || F.mode === 'forgot')
      body = `<h2 id="ftitle">${esc(t(F.mode === 'forgot' ? 'dForgotTitle' : 'dLinkTitle'))}</h2>${emailF}`;
    else
      body = `<div class="tabs2" role="tablist" aria-label="${esc(t('dAccount'))}">${[
        ['signin', 'dSignIn'],
        ['signup', 'dSignUp']
      ]
        .map(
          ([k, l]) =>
            `<button type="button" role="tab" class="tabbtn" id="tab-${k}" data-mode="${k}" aria-selected="${F.mode === k}" aria-controls="authpanel" tabindex="${F.mode === k ? 0 : -1}">${esc(t(l))}</button>`
        )
        .join('')}</div>${emailF}${pwF}`;
    const showSubmit = !F.sent;
    const extra =
      !F.recovery && !F.sent
        ? F.mode === 'link' || F.mode === 'forgot'
          ? `<button type="button" class="linkish" data-mode="signin">${esc(t('dBack'))}</button>`
          : `<div class="row2l">${F.mode === 'signin' ? `<button type="button" class="linkish" data-mode="forgot">${esc(t('dForgot'))}</button>` : '<span></span>'}<button type="button" class="linkish" data-mode="link">${esc(t('dUseLink'))}</button></div>
    ${CFG.googleSignIn ? `<div class="or">${esc(t('dOr'))}</div><button class="btn" type="button" id="google">${esc(t('dGoogle'))}</button>` : ''}`
        : '';
    const tp = F.mode === 'signin' || F.mode === 'signup';
    $('#main').innerHTML =
      `${tp ? `<div role="tabpanel" id="authpanel" aria-labelledby="tab-${F.mode}">` : ''}<form class="card signin" id="sform" novalidate aria-labelledby="${tp ? 'tab-' + F.mode : 'ftitle'}">${body}
    ${fe ? `<p class="msg err" id="ferr" role="alert">${esc(fe.text)}</p>` : ''}
    ${showSubmit ? `<button class="btn primary" type="submit" ${busy ? 'disabled aria-busy="true"' : ''}>${busy ? `<span class="spinner sm" aria-hidden="true"></span>` : ''}${esc(t(submitLbl))}</button>` : ''}${extra}</form>${tp ? '</div>' : ''}`;
  }
  function focusAfterRender(field) {
    const el = field === 'email' ? $('#email') : field === 'pw' ? $('#pw') : null;
    (el || $('#email') || $('#pw'))?.focus();
  }

  async function submitAuth() {
    const email = ($('#email')?.value || '').trim(),
      pw = $('#pw')?.value || '';
    F.email = email;
    const needEmail = !F.recovery,
      needPw = F.recovery || F.mode === 'signin' || F.mode === 'signup';
    const bad = (text, field) => {
      A.formError = { text, field };
      if (field === 'pw' || needPw) {
        /* never keep a password in the DOM after a failure */
      }
      render();
      if ($('#pw')) $('#pw').value = '';
      focusAfterRender(field);
    };
    if (needEmail && !/^\S+@\S+\.\S+$/.test(email)) return bad(t('dEmailBad'), 'email');
    if (needPw && pw.length < 6) return bad(t('dWeak'), 'pw');
    const gen = ++A.gen;
    A.state = 'authenticating';
    A.formError = null;
    A.busy = F.recovery ? 'recovery' : F.mode;
    $('#ferr')?.remove();
    $('#email')?.removeAttribute('aria-invalid');
    $('#pw')?.removeAttribute('aria-invalid');
    const sb = $('#sform [type=submit]');
    if (sb) {
      sb.disabled = true;
      sb.setAttribute('aria-busy', 'true');
      sb.insertAdjacentHTML('afterbegin', '<span class="spinner sm" aria-hidden="true"></span>');
    }
    let res;
    try {
      if (F.recovery) res = await SB.auth.updateUser({ password: pw });
      else if (F.mode === 'signin') res = await SB.auth.signInWithPassword({ email, password: pw });
      else if (F.mode === 'signup')
        res = await SB.auth.signUp({
          email,
          password: pw,
          options: { emailRedirectTo: location.origin + (next || '/') }
        });
      else if (F.mode === 'forgot')
        res = await SB.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/' });
      else res = await SB.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + (next || '/') } });
    } catch (e) {
      res = { error: e };
    }
    if (gen !== A.gen) return; // a newer auth change (e.g. a restored session) already decided the screen
    if (res && res.error) {
      const f = friendly(res.error);
      A.state = 'anonymous';
      A.busy = null;
      A.formError = f;
      render();
      if ($('#pw')) $('#pw').value = '';
      focusAfterRender(f.field || 'pw');
      return;
    }
    if (F.recovery) {
      F.recovery = false;
      history.replaceState(null, '', '/');
      const { data } = await SB.auth.getSession();
      if (gen !== A.gen) return;
      setAuth(sessionValid(data.session) ? 'authenticated' : 'anonymous', { session: data.session, busy: null });
      if (A.state === 'authenticated') loadEvents();
      return;
    }
    const s = res && res.data && res.data.session;
    if (sessionValid(s)) {
      A.gen++;
      if (next) {
        location.replace(next);
        return;
      }
      setAuth('authenticated', { session: s, busy: null });
      loadEvents();
      return;
    }
    F.sent = F.mode !== 'signin';
    setAuth('anonymous', { busy: null });
  }

  /* ---------------- dashboard ---------------- */
  const SOON = ['birthday', 'corporate', 'baby', 'anniv'];
  /* Signed in: "Your events". Couples usually have one wedding, so each event is a full card that leads to the
     planner (cover in the wedding's palette with the couple's initials, date and countdown, how many guests are
     seated, whether the guest page is live). Creating an event is a panel that opens on demand, or straight away
     when there are no events yet. */
  const PAL = { blush: '#B4506F', sage: '#5E7E5A', navy: '#2E4A7A', wine: '#7B2F3D' };
  const initials = nm => {
    const parts = String(nm || '')
      .split(/\s*(?:&|\+|და|and)\s*/i)
      .map(s => s.trim())
      .filter(Boolean)
      .slice(0, 2);
    return parts.length ? parts.map(p => [...p][0].toUpperCase()).join(' & ') : '✿';
  };
  const daysTo = d => {
    if (!d) return null;
    const t0 = new Date();
    t0.setHours(12, 0, 0, 0);
    return Math.round((new Date(String(d).slice(0, 10) + 'T12:00') - t0) / 864e5);
  };
  function newPanel(first) {
    const today = new Date().toISOString().slice(0, 10);
    return `<form class="newp${first ? ' first' : ''}" id="nform" novalidate aria-labelledby="newh">
    <div class="newhead"><h2 id="newh">${esc(t(first ? 'dFirstH' : 'dNew'))}</h2><p class="small">${esc(t('dFirstP'))}</p></div>
    <div class="newgrid">
      <label class="field"><span class="lbl">${esc(t('eventName'))}</span><input class="inp" id="nname" value="${esc(D.name)}" placeholder="${esc(t('dNamePh'))}" ${D.nerr ? 'aria-invalid="true" aria-describedby="nerr"' : ''}></label>
      <label class="field"><span class="lbl">${esc(t('date'))}</span><input class="inp" id="ndate" type="date" min="${today}" value="${esc(D.date)}" aria-describedby="ndate-txt"><span class="small" id="ndate-txt">${esc(fmtDate(D.date))}</span></label>
      <button class="btn primary" type="submit">${esc(t('dCreate'))}</button>
    </div>
    ${D.nerr ? `<p class="msg err" id="nerr" role="alert">${esc(D.nerr)}</p>` : ''}
    <div class="newfoot">
      <div class="filepick"><input type="file" id="nfile" class="fileinput" accept=".json,application/json" aria-label="${esc(t('dImport'))}" aria-describedby="nfilehint"><label for="nfile" class="linkish" id="nfile-btn" aria-hidden="true">${esc(t('dImportOpen'))}</label><span class="small fname" id="nfile-name" aria-live="polite"></span></div>
      <span class="small" id="nfilehint">${esc(t('dImportHint'))}</span>
      ${(D.events || []).some(isSample) ? '' : `<button type="button" class="linkish smp" data-sample>${esc(t('smpTry'))}</button>`}
      <span class="small soon">${esc(t('soonLine'))} ${SOON.map(k => esc(t(k))).join(', ')}.</span>
      ${first ? '' : `<button type="button" class="btn sm" data-newclose>${esc(t('dCancel'))}</button>`}
    </div>
  </form>`;
  }
  function renderDash() {
    const evs = D.events,
      first = evs !== null && !D.loadErr && !evs.length,
      list = D.loadErr
        ? `<div class="empty" role="alert"><p>${esc(t('dLoadErr'))}</p><button type="button" class="btn sm" data-act="reload">${esc(t('dRetry'))}</button></div>`
        : evs === null
          ? `<p class="empty" role="status"><span class="spinner" aria-hidden="true"></span> ${esc(t('dLoadingEvents'))}</p>`
          : evs.length
            ? `<ul class="events${evs.length === 1 ? ' one' : ''}" role="list">${evs.map(evCard).join('')}</ul>`
            : '';
    const hero = evs && evs.length && !D.loadErr ? homeHero(nextEvent(evs)) : '',
      H = hero ? 'h2' : 'h1';
    $('#main').innerHTML = `<div class="dash">${hero}${hero ? activity() : ''}
  <div class="dashhead"><${H} id="yourh">${esc(t('dYour'))}</${H}>${first || D.newOpen ? '' : `<button type="button" class="btn${hero ? '' : ' primary'}" data-newopen>${PLUS}${esc(t('dNew'))}</button>`}</div>
  ${first || D.newOpen ? newPanel(first) : ''}
  <section aria-labelledby="yourh" class="yours">${list}</section>${D.trash.length ? trashSection() : ''}</div>`;
    showFeast();
  }
  /* The top of "Your events": a greeting, the next wedding large, and the one next step for it. The feast painting
     (art/feast.webp, made from the Gemini prompt in docs) appears above it once the file exists. */
  const FEAST = '/art/feast.webp';
  function showFeast() {
    const img = document.querySelector('.feast img');
    if (!img) return;
    const show = () => (img.closest('.feast').hidden = false);
    if (img.complete && img.naturalWidth) show();
    else img.addEventListener('load', show, { once: true });
  }
  // the nearest wedding still to come; otherwise the one edited last (the list is sorted by last edit)
  function nextEvent(evs) {
    const real = evs.filter(e => !isSample(e));
    if (real.length) evs = real; // the sample wedding comes first only when it is the only one
    const up = evs
      .filter(e => e.event_date && daysTo(e.event_date) >= 0)
      .sort((a, b) => (a.event_date < b.event_date ? -1 : 1));
    return up[0] || evs[0];
  }
  function greeting() {
    const h = new Date().getHours();
    return t(h >= 5 && h < 12 ? 'hiMorning' : h >= 12 && h < 18 ? 'hiAfternoon' : 'hiEvening');
  }
  const guestCount = e => (e.guests ? Object.keys(e.guests).length : 0),
    seatedCount = e => (e.tables || []).reduce((a, x) => a + (x.seats || []).filter(Boolean).length, 0);
  /* The checklist on each card, in the order a wedding plan comes together. nextStep() below picks the first open
     step of the same list, so the card and the hero never disagree. */
  function steps(e) {
    const n = guestCount(e);
    return [
      { k: 'ckGuests', done: n > 0, panel: 'guests' },
      { k: 'ckSeat', done: n > 0 && seatedCount(e) >= n, panel: '' },
      { k: 'ckPublish', done: pubOf(e), panel: 'share' },
      { k: 'ckDate', done: !!e.event_date, panel: 'event' }
    ];
  }
  // what to do next for this event, in the order a wedding plan comes together
  function nextStep(e) {
    const n = guestCount(e),
      open = Math.max(0, n - seatedCount(e)),
      go = (panel, label) =>
        `<a class="btn primary" href="/edit/${esc(e.id)}${panel ? '?panel=' + panel : ''}">${esc(t(label))}</a>`;
    if (!n) return { text: t('nsGuests'), btn: go('guests', 'nsGuestsBtn') };
    if (open) return { text: tn('nsSeat', open), btn: go('', 'nsSeatBtn') };
    if (!pubOf(e)) return { text: t('nsPublish'), btn: go('share', 'nsPublishBtn') };
    if (!e.event_date) return { text: t('nsDate'), btn: go('event', 'nsDateBtn') };
    return {
      text: t('nsDone'),
      btn: `<button type="button" class="btn primary" data-copy="${esc(e.slug)}">${LINK}${esc(t('dCopyLink'))}</button>`
    };
  }
  function homeHero(e) {
    const nm = e.name || '—',
      dd = daysTo(e.event_date),
      when = dd === null ? '' : dd === 0 ? t('dToday') : dd > 0 ? tn('dInDays', dd) : tn('dDaysAgo', -dd),
      step = nextStep(e);
    return `<section class="home" aria-labelledby="homeh">
    <figure class="feast" hidden><img src="${FEAST}" alt="${esc(t('feastAlt'))}" width="2400" height="800" decoding="async"></figure>
    <div class="homerow">
      <div class="hometext"><p class="hello">${esc(greeting())}</p><h1 id="homeh">${esc(nm)}</h1>
        ${e.event_date ? `<p class="homewhen"><span>${esc(fmtDate(e.event_date))}</span>${when ? `<span class="count">${esc(when)}</span>` : ''}</p>` : ''}</div>
      <div class="nextstep" role="group" aria-label="${esc(t('nsA11y'))}"><p>${esc(step.text)}</p>${step.btn}${quick(e, step)}</div>
    </div></section>`;
  }
  /* Quick actions for the next wedding, under its next step: copy the guest link (unless that is the next step),
     place cards (the planner opens them straight away with ?do=cards) and the Invitations panel. */
  function quick(e, step) {
    const acts = [];
    if (pubOf(e) && !step.btn.includes('data-copy'))
      acts.push(
        `<button type="button" class="linkish" data-copy="${esc(e.slug)}">${LINK}${esc(t('dCopyLink'))}</button>`
      );
    if (seatedCount(e))
      acts.push(`<a class="linkish" href="/edit/${esc(e.id)}?do=cards">${CARDS}${esc(t('qaCards'))}</a>`);
    if (guestCount(e))
      acts.push(`<a class="linkish" href="/edit/${esc(e.id)}?panel=invites">${MAIL}${esc(t('qaInvites'))}</a>`);
    return acts.length ? `<div class="quick" role="group" aria-label="${esc(t('qaA11y'))}">${acts.join('')}</div>` : '';
  }
  /* Recent replies: the latest answers guests sent from their invitation links, across all events. The couple's own
     edits are left out (they know about those). Nothing shows until someone has answered. */
  const REPLIES = 6;
  function ago(at) {
    const s = Math.max(0, (Date.now() - new Date(at).getTime()) / 1000);
    return s < 60
      ? t('agoNow')
      : s < 3600
        ? tn('agoMin', Math.round(s / 60))
        : s < 86400
          ? tn('agoHour', Math.round(s / 3600))
          : tn('agoDay', Math.round(s / 86400));
  }
  function activity() {
    const evs = D.events || [],
      byId = new Map(evs.map(e => [e.id, e])),
      invs = new Map((D.invites || []).map(i => [i.id, i])),
      L = (D.replies || []).filter(r => byId.has(r.event_id) && invs.has(r.invite_id));
    if (!L.length) return '';
    const many = new Set(L.map(r => r.event_id)).size > 1 || evs.length > 1;
    const who = (i, e) => {
      const g = e.guests || {};
      return (i.name || '').trim() || (i.members || []).map(id => g[id]?.name).filter(Boolean)[0] || t('rpSomeone');
    };
    return `<section class="activity" aria-labelledby="acth"><h2 id="acth">${esc(t('rpTitle'))}</h2><ul role="list">${L.map(
      r => {
        const e = byId.get(r.event_id),
          what = r.state_after === 'coming' ? tn('invComingN', r.coming_after || 0) : t('rs_declined');
        return `<li class="${r.state_after === 'coming' ? 'yes' : 'no'}"><a href="/edit/${esc(e.id)}?panel=invites"><b>${esc(who(invs.get(r.invite_id), e))}</b>: ${esc(what)}</a><span class="small">${many ? `${esc(e.name || '—')} · ` : ''}<time datetime="${esc(r.at)}">${esc(ago(r.at))}</time></span></li>`;
      }
    ).join('')}</ul></section>`;
  }
  /* Trash: deleted events stay 30 days (the server empties it), can be restored, or deleted for good after typing
     the event's name. */
  const TRASH_DAYS = 30;
  const trashLeft = e => Math.max(0, TRASH_DAYS - Math.floor((Date.now() - new Date(e.deleted_at).getTime()) / 864e5));
  const foreverWord = e => (e.name || '').trim() || t('dForeverWord');
  const same = (a, b) => {
    const n = s =>
      String(s || '')
        .normalize('NFC')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    return n(a) === n(b);
  };
  function trashSection() {
    const n = D.trash.length;
    return `<section class="trash" aria-labelledby="trashh"><h2 class="trashh" id="trashh"><button type="button" class="trashtog" data-trashtog aria-expanded="${D.trashOpen}" aria-controls="trashlist">${TRASH}<span>${esc(t('dTrash'))}</span><span class="tcount">${n}</span></button></h2>
    <div id="trashlist"${D.trashOpen ? '' : ' hidden'}><p class="small">${esc(t('dTrashHint'))}</p><ul class="tlist" role="list">${D.trash.map(trashItem).join('')}</ul></div></section>`;
  }
  function trashItem(e) {
    const nm = e.name || '—',
      left = trashLeft(e),
      w = foreverWord(e);
    return `<li class="titem"><div class="tmain"><span class="tname">${esc(nm)}</span><span class="small">${esc(t('dTrashedOn', { d: fmtDate(String(e.deleted_at).slice(0, 10)) }))} · ${esc(left ? tn('dTrashLeft', left) : t('dTrashLeft0'))}</span></div>
      <div class="tact"><button type="button" class="btn sm" data-restore="${esc(e.id)}" aria-label="${esc(t('dRestore') + ': ' + nm)}">${esc(t('dRestore'))}</button><button type="button" class="linkish danger" data-forever="${esc(e.id)}" aria-label="${esc(t('dForever') + ': ' + nm)}">${esc(t('dForever'))}</button></div>
      ${
        D.forever === e.id
          ? `<form class="confirm" id="fvform" data-id="${esc(e.id)}" novalidate aria-labelledby="fvq"><p id="fvq">${esc(t('dForeverQ', { n: nm }))}</p>
        <label class="field"><span class="lbl">${esc(t('dForeverType', { n: '\u0000' })).replace('\u0000', `<b class="fvword" lang="${lang}">${esc(w)}</b>`)}</span><input class="inp" id="fvname" autocomplete="off" spellcheck="false"${D.fverr ? ' aria-invalid="true" aria-describedby="fverr"' : ''}></label>
        ${D.fverr ? `<p class="msg err" id="fverr" role="alert">${esc(D.fverr)}</p>` : ''}
        <div class="row"><button type="submit" class="btn sm danger">${esc(t('dForever'))}</button><button type="button" class="btn sm" data-fvcancel>${esc(t('dKeep'))}</button></div></form>`
          : ''
      }</li>`;
  }
  // Plans (migration 011): free events seat up to 40 guests; an event pass or Pro removes the limit.
  const FREE_LIMIT = 40;
  const planOf = e => {
    const now = Date.now(),
      on = x =>
        x.status === 'active' &&
        new Date(x.starts_at).getTime() <= now &&
        (!x.ends_at || new Date(x.ends_at).getTime() > now);
    if (D.plans === null) return null; // unknown (older database): show nothing
    if (D.plans.some(x => x.kind === 'pro' && on(x))) return 'pro';
    return D.plans.some(x => x.kind === 'event_pass' && x.event_id === e.id && on(x)) ? 'pass' : 'free';
  };
  function planPill(e, n) {
    const p = planOf(e);
    if (!p) return '';
    if (p !== 'free') return `<span class="pill plan paid">${esc(t(p === 'pro' ? 'dPlanPro' : 'dPlanPass'))}</span>`;
    return `<span class="pill plan${n > FREE_LIMIT ? ' over' : ''}">${esc(t('dPlanFree', { n, max: FREE_LIMIT }))}</span>`;
  }
  const pubOf = e => (e.share_status || (e.guest_page ? 'published' : 'draft')) === 'published';
  // "Edited today / yesterday / 3 days ago", then the date after a month. Nothing for an unreadable time.
  function editedText(ts) {
    const d = new Date(ts);
    if (!ts || isNaN(d)) return '';
    const day = x => {
        const c = new Date(x);
        c.setHours(12, 0, 0, 0);
        return c;
      },
      ago = Math.round((day(Date.now()) - day(d)) / 864e5);
    const when = ago <= 0 ? t('dEditedToday') : ago <= 30 ? tn('dDaysAgo', ago) : fmtDate(d.toISOString());
    return t('dEdited', { when: ago > 30 ? when : when.charAt(0).toLowerCase() + when.slice(1) });
  }
  // A ring that fills as the checklist is done, with the open steps as links to the planner panel that does them.
  const RING_R = 15,
    RING_C = 2 * Math.PI * RING_R;
  function checklist(e) {
    const L = steps(e),
      done = L.filter(x => x.done).length,
      all = done === L.length,
      label = t('ckDone', { a: done, b: L.length }),
      off = (RING_C * (1 - done / L.length)).toFixed(2);
    return `<div class="ck${all ? ' all' : ''}">
      <svg class="ring" viewBox="0 0 36 36" width="40" height="40" role="img" aria-label="${esc(label)}"><circle class="trk" cx="18" cy="18" r="${RING_R}"/><circle class="val" cx="18" cy="18" r="${RING_R}" stroke-dasharray="${RING_C.toFixed(2)}" stroke-dashoffset="${off}" transform="rotate(-90 18 18)"/><text x="18" y="18" aria-hidden="true">${done}/${L.length}</text></svg>
      <ul class="cklist" role="list" aria-label="${esc(t('ckA11y'))}">${L.map(x =>
        x.done
          ? `<li class="done">${CHECK}<span class="vh">${esc(t('ckDoneItem'))} </span>${esc(t(x.k))}</li>`
          : `<li><span class="dot" aria-hidden="true"></span><a href="/edit/${esc(e.id)}${x.panel ? '?panel=' + x.panel : ''}">${esc(t(x.k))}</a></li>`
      ).join('')}</ul></div>`;
  }
  /* Invitation replies, counted by household like the planner's Invitations panel. Nothing until the couple has
     made invitations (or on an older database without the invites table). */
  function rsvpLine(e) {
    const L = (D.invites || []).filter(i => i.event_id === e.id && !i.revoked);
    if (!L.length) return '';
    const n = k => L.filter(i => i.state === k).length;
    return `<a class="rsvpline" href="/edit/${esc(e.id)}?panel=invites" aria-label="${esc(t('rsA11y', { a: n('coming'), b: n('declined'), c: n('pending') }))}">${[
      'coming',
      'declined',
      'pending'
    ]
      .map(k => `<span class="rs rs-${k}"><b>${n(k)}</b> ${esc(t('rs_' + k))}</span>`)
      .join('')}</a>`;
  }
  function evCard(e) {
    const n = guestCount(e),
      seated = seatedCount(e),
      free = (e.tables || []).reduce((a, x) => a + (x.seats || []).filter(s => !s).length, 0),
      edited = editedText(e.updated_at),
      nm = e.name || '—',
      pal = PAL[e.ev?.palette] || PAL.blush,
      dd = daysTo(e.event_date),
      when = dd === null ? t('dNoDate') : dd === 0 ? t('dToday') : dd > 0 ? tn('dInDays', dd) : tn('dDaysAgo', -dd),
      pub = pubOf(e),
      pct = n ? Math.round((Math.min(seated, n) / n) * 100) : 0;
    return `<li class="ev" style="--pal:${pal};--pal-d:color-mix(in srgb,${pal} 55%,#FFFFFF)">
    <a class="cover" href="/edit/${esc(e.id)}" tabindex="-1" aria-hidden="true">${FLOWERS ? `<img src="${FLOWERS}" alt="" class="fl">` : ''}<span class="mono">${esc(initials(isSample(e) ? sampleCouple() : nm))}</span></a>
    <div class="evbody">
      <span class="pill status${pub ? ' on' : ''}">${esc(t(pub ? 'dPubOn' : 'dPubOff'))}${isSample(e) ? `<span class="smptag">${esc(t('smpTag'))}</span>` : ''}</span>
      <h2 class="evname"><a href="/edit/${esc(e.id)}">${esc(nm)}</a></h2>
      <p class="when">${e.event_date ? `<span class="date">${esc(fmtDate(e.event_date))}</span>` : ''}<span class="count${dd !== null && dd >= 0 && dd <= 30 ? ' soon' : ''}">${esc(when)}</span>${edited ? `<span class="edited">${esc(edited)}</span>` : ''}</p>
      ${n ? `<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${n}" aria-valuenow="${Math.min(seated, n)}" aria-label="${esc(t('dSeated', { a: Math.min(seated, n), b: n }))}"><i style="width:${pct}%"></i></div>` : ''}
      <p class="facts progtxt"><span class="seated">${esc(n ? t('dSeated', { a: Math.min(seated, n), b: n }) : t('dNoGuests'))}</span><span>${esc(tn('nTables', (e.tables || []).length))}</span>${free ? `<span>${esc(tn('nFree', free))}</span>` : ''}${planPill(e, n)}</p>
      ${checklist(e)}${rsvpLine(e)}
      <div class="evact"><a class="btn primary" href="/edit/${esc(e.id)}" aria-label="${esc(t('dOpenPlanner') + ': ' + nm)}">${esc(t('dOpenPlanner'))}</a>${pub ? `<button type="button" class="btn" data-copy="${esc(e.slug)}" aria-label="${esc(t('dCopyLink') + ': ' + nm)}">${LINK}${esc(t('dCopyLink'))}</button>` : ''}
        <div class="evmore"><button type="button" class="btn more" data-more="${esc(e.id)}" aria-haspopup="menu" aria-expanded="${D.menuId === e.id}" aria-label="${esc(t('dMore', { n: nm }))}">${DOTS}</button>
        ${
          D.menuId === e.id
            ? `<div class="evmenu" role="menu" aria-label="${esc(t('dMore', { n: nm }))}">${pub ? `<a role="menuitem" tabindex="-1" href="/e/${esc(e.slug)}" target="_blank" rel="noopener noreferrer">${esc(t('dOpenGuestPage'))}</a>` : ''}<button type="button" role="menuitem" tabindex="-1" class="danger" data-del="${esc(e.id)}">${TRASH}${esc(t('dToTrash'))}</button></div>`
            : ''
        }</div></div>
      ${D.confirmId === e.id ? `<div class="confirm" role="alertdialog" aria-label="${esc(t('dDelete'))}"><span>${esc(t('dDeleteQ', { n: nm }))}</span><div class="row"><button type="button" class="btn sm danger" data-delyes="${esc(e.id)}">${esc(t('dToTrash'))}</button><button type="button" class="btn sm" data-cancel>${esc(t('dKeep'))}</button></div></div>` : ''}
    </div></li>`;
  }
  const PLUS =
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    LINK =
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>',
    DOTS =
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
    TRASH =
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
    CARDS =
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9l9-5 9 5"/><rect x="4" y="9" width="16" height="10" rx="1.5"/><path d="M8 14h8"/></svg>',
    MAIL =
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
    CHECK =
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    FLOWERS = (window.SUPRA_IMG_FILES || {}).flowers_top || '';
  let loadGen = 0;
  async function loadEvents() {
    const g = ++loadGen;
    D.loadErr = false;
    const plans = SB.from('entitlements').select('kind,event_id,status,starts_at,ends_at'),
      invites = SB.from('invites').select('id,event_id,name,members,state,revoked'),
      replies = SB.from('invite_log')
        .select('invite_id,event_id,at,state_after,coming_after')
        .eq('by', 'guest')
        .order('at', { ascending: false })
        .limit(REPLIES);
    const { data, error } = await SB.from('events')
      .select(
        'id,name,event_date,slug,guest_page,share_status,updated_at,deleted_at,guests:data->guests,tables:data->tables,ev:data->event'
      )
      .order('updated_at', { ascending: false });
    const pr = await plans,
      ir = await invites,
      lr = await replies;
    if (g !== loadGen || A.state !== 'authenticated') return;
    D.plans = pr.error ? null : pr.data || [];
    D.invites = ir.error ? [] : ir.data || [];
    D.replies = lr.error ? [] : lr.data || [];
    if (error) {
      D.loadErr = true;
      D.events = [];
      D.trash = [];
    } else {
      D.events = (data || []).filter(e => !e.deleted_at);
      D.trash = (data || []).filter(e => e.deleted_at).sort((a, b) => (a.deleted_at < b.deleted_at ? 1 : -1));
      if (!D.trash.length) D.trashOpen = false;
    }
    render();
  }
  /* A4 sample wedding: a ready plan to explore (32 guests, five tables, a few still unseated, meals, one seating rule),
     created as an ordinary event in the account and marked with event.sample. Under the free limit on purpose. The
     planner gives each guest a drawing on first open (guests here are made without one). */
  const SAMPLE = {
    en: {
      couple: ['Nino Beridze', 'Giorgi Kapanadze'],
      fam: ['Beridze', 'Kapanadze', 'Lomidze', 'Japaridze', 'Tsereteli', 'Abashidze'],
      f: ['Ana', 'Mariam', 'Tamar', 'Natia', 'Salome', 'Eka', 'Teona', 'Ketevan', 'Elene', 'Sopo', 'Lela', 'Nana'],
      m: ['Levan', 'Davit', 'Irakli', 'Lasha', 'Zurab', 'Nika', 'Aleksandre', 'Beka', 'Tornike', 'Vakhtang', 'Guram'],
      groups: ["Bride's family", "Groom's family", 'University friends', 'Work'],
      tables: ['Head table', 'Family', 'Family', 'Friends', 'Colleagues']
    },
    ka: {
      couple: ['ნინო ბერიძე', 'გიორგი კაპანაძე'],
      fam: ['ბერიძე', 'კაპანაძე', 'ლომიძე', 'ჯაფარიძე', 'წერეთელი', 'აბაშიძე'],
      f: ['ანა', 'მარიამ', 'თამარ', 'ნათია', 'სალომე', 'ეკა', 'თეონა', 'ქეთევან', 'ელენე', 'სოფო', 'ლელა', 'ნანა'],
      m: ['ლევან', 'დავით', 'ირაკლი', 'ლაშა', 'ზურაბ', 'ნიკა', 'ალექსანდრე', 'ბექა', 'თორნიკე', 'ვახტანგ', 'გურამ'],
      groups: ['პატარძლის ოჯახი', 'სიძის ოჯახი', 'უნივერსიტეტის მეგობრები', 'სამსახური'],
      tables: ['მთავარი მაგიდა', 'ოჯახი', 'ოჯახი', 'მეგობრები', 'კოლეგები']
    }
  };
  function samplePlan() {
    const L = SAMPLE[lang] || SAMPLE.en,
      guests = {},
      meals = ['meat', 'meat', 'fish', 'meat', 'veg', 'meat', 'fish', 'vegan'];
    let n = 0;
    const add = (name, side, group, extra) => {
      const id = 's' + String(++n).padStart(2, '0');
      guests[id] = Object.assign(
        { id, name, side, group, kid: false, meal: meals[n % meals.length], allergies: '' },
        extra || {}
      );
      return id;
    };
    const head = [add(L.couple[0], 'bride', L.groups[0]), add(L.couple[1], 'groom', L.groups[1])];
    // family tables: each side's relatives share a surname; friends and colleagues mix
    const people = (k, side, group, fam0, i0) =>
      Array.from({ length: k }, (_, i) => {
        const j = i0 + i,
          nm = (j % 2 ? L.f[j % L.f.length] : L.m[j % L.m.length]) + ' ' + L.fam[fam0 + (i % 2)];
        return add(nm, side, group);
      });
    const t1 = people(6, 'bride', L.groups[0], 0, 0),
      t2 = people(6, 'groom', L.groups[1], 1, 3),
      t3 = people(7, 'both', L.groups[2], 2, 7),
      t4 = people(7, 'both', L.groups[3], 4, 13),
      waiting = people(4, 'both', L.groups[2], 3, 20);
    guests[t1[1]].kid = true;
    guests[t1[1]].meal = 'kids';
    guests[t3[2]].allergies = lang === 'ka' ? 'თხილი' : 'Nuts';
    const pad = (seats, k) => seats.concat(Array(Math.max(0, k - seats.length)).fill(null));
    return {
      event: { name: t('smpName'), type: 'wedding', palette: 'sage', lang, sample: true },
      guests,
      waiting,
      rules: [{ type: 'apart', a: t2[0], b: t4[0] }],
      venue: [{ id: 'v1', type: 'dance', label: '', x: 0, y: 380, w: 300, h: 170 }],
      tables: [
        { id: 'th', name: L.tables[0], shape: 'head', deco: 'flowers', seats: head },
        { id: 't1', name: L.tables[1], shape: 'round', deco: 'flowers', seats: pad(t1, 8) },
        { id: 't2', name: L.tables[2], shape: 'round', deco: 'greenery', seats: pad(t2, 8) },
        { id: 't3', name: L.tables[3], shape: 'rect', deco: 'mixed', seats: pad(t3, 8) },
        { id: 't4', name: L.tables[4], shape: 'rect', deco: 'flowers', seats: pad(t4, 8) }
      ]
    };
  }
  const isSample = e => !!(e && e.ev && e.ev.sample),
    // the sample's cover shows its couple's initials, like any other wedding (its name has no "&" to split)
    sampleCouple = () => (SAMPLE[lang] || SAMPLE.en).couple.map(x => x.split(' ')[0]).join(' & ');
  async function createSample() {
    const d = new Date();
    d.setDate(d.getDate() + 90);
    const plan = samplePlan();
    plan.event.date = d.toISOString().slice(0, 10);
    await create({ name: plan.event.name, type: 'wedding', event_date: plan.event.date, data: plan });
  }
  async function create(fields) {
    for (let i = 0; i < 4; i++) {
      const { data, error } = await SB.from('events')
        .insert(Object.assign({ slug: rand(10) }, fields))
        .select('id')
        .single();
      if (!error) {
        location.href = '/edit/' + data.id;
        return;
      }
      if (error.code !== '23505') {
        toast(t('dErr'));
        return;
      }
    }
  }

  async function deleteForever(id) {
    const ev = D.trash.find(x => x.id === id),
      typed = $('#fvname')?.value || '';
    if (!ev) return;
    if (!same(typed, foreverWord(ev))) {
      D.fverr = t('dForeverBad');
      render();
      const i = $('#fvname');
      if (i) {
        i.value = typed;
        i.focus();
      }
      return;
    }
    const btn = $('#fvform [type=submit]');
    if (btn) btn.disabled = true;
    const { error } = await SB.from('events').delete().eq('id', id);
    D.forever = null;
    D.fverr = '';
    if (error) toast(t('dErr'));
    else toast(t('dDeletedForever'));
    await loadEvents();
    ($('[data-trashtog]') || $('#yourh'))?.focus();
  }

  /* ---------------- account (/account) ----------------
     Email, password, sign out everywhere, plans, "download all my data" and "delete my account" (migration 012). */
  const ROUTE = location.pathname.replace(/\/+$/, '') === '/account' ? 'account' : 'home';
  const AC = { data: null, loading: false, err: false, pwErr: '', pwOk: false, delOpen: false, delErr: '' };
  async function loadAccount() {
    AC.loading = true;
    const [ev, pl] = await Promise.all([
      SB.from('events').select('id,name,deleted_at'),
      SB.from('entitlements').select('kind,event_id,status,starts_at,ends_at')
    ]);
    AC.loading = false;
    if (A.state !== 'authenticated') return;
    AC.err = !!ev.error;
    AC.data = { events: ev.data || [], plans: pl.error ? null : pl.data || [] };
    render();
  }
  const fmtDay = iso => fmtDate(String(iso || '').slice(0, 10));
  function plansList() {
    const P = AC.data.plans;
    if (P === null) return '';
    const now = Date.now(),
      on = x => x.status === 'active' && new Date(x.starts_at) <= now && (!x.ends_at || new Date(x.ends_at) > now);
    const pro = P.filter(x => x.kind === 'pro' && on(x)).sort((a, b) => (a.ends_at < b.ends_at ? 1 : -1))[0];
    const names = Object.fromEntries(AC.data.events.map(e => [e.id, e.name || '—']));
    const passes = P.filter(x => x.kind === 'event_pass' && on(x) && names[x.event_id]);
    const rows = [];
    if (pro)
      rows.push(
        `<li><b>${esc(t('dPlanPro'))}</b> <span class="small">${esc(t('acProUntil', { d: fmtDay(pro.ends_at) }))}</span></li>`
      );
    passes.forEach(x =>
      rows.push(`<li><b>${esc(t('dPlanPass'))}</b> <span class="small">${esc(names[x.event_id])}</span></li>`)
    );
    return `<section class="acsec" aria-labelledby="ac-plans"><h2 id="ac-plans">${esc(t('acPlans'))}</h2>
      ${rows.length ? `<ul class="aclist" role="list">${rows.join('')}</ul>` : `<p class="small">${esc(t('acNoPlans'))}</p>`}
      <p><a href="/pricing">${esc(t('lpPricing'))}</a></p></section>`;
  }
  function renderAccount() {
    if (!AC.data && !AC.loading) loadAccount();
    const email = A.session.user.email || '';
    const body = !AC.data
      ? `<p class="empty" role="status"><span class="spinner" aria-hidden="true"></span> ${esc(t('dLoading'))}</p>`
      : `
    <section class="acsec" aria-labelledby="ac-signin"><h2 id="ac-signin">${esc(t('acSignIn'))}</h2>
      <p>${esc(t('acEmail'))}: <b>${esc(email)}</b></p>
      <form id="pwform" class="acform" novalidate aria-labelledby="ac-pw"><h3 id="ac-pw">${esc(t('acPwTitle'))}</h3>
        <label class="field"><span class="lbl">${esc(t('acPwNew'))}</span><input class="inp" id="pw1" type="password" autocomplete="new-password" minlength="6"${AC.pwErr ? ' aria-invalid="true" aria-describedby="pwerr"' : ''}></label>
        <label class="field"><span class="lbl">${esc(t('acPwAgain'))}</span><input class="inp" id="pw2" type="password" autocomplete="new-password" minlength="6"${AC.pwErr ? ' aria-invalid="true" aria-describedby="pwerr"' : ''}></label>
        ${AC.pwErr ? `<p class="msg err" id="pwerr" role="alert">${esc(AC.pwErr)}</p>` : ''}${AC.pwOk ? `<p class="msg" role="status">${esc(t('acPwDone'))}</p>` : ''}
        <div class="row"><button type="submit" class="btn">${esc(t('acPwSave'))}</button></div></form>
      <div class="row"><button type="button" class="btn" data-acglobal>${esc(t('acSignOutAll'))}</button><span class="small">${esc(t('acSignOutAllHint'))}</span></div>
    </section>
    ${plansList()}
    <section class="acsec" aria-labelledby="ac-data"><h2 id="ac-data">${esc(t('acData'))}</h2>
      <p class="small">${esc(t('acExportHint'))}</p>
      <div class="row"><button type="button" class="btn" data-acexport>${esc(t('acExport'))}</button><a href="/privacy">${esc(t('acPrivacy'))}</a></div>
    </section>
    <section class="acsec danger" aria-labelledby="ac-del"><h2 id="ac-del">${esc(t('acDelete'))}</h2>
      <p class="small">${esc(t('acDeleteHint'))}</p>
      ${
        AC.delOpen
          ? `<form class="confirm" id="delform" novalidate aria-labelledby="ac-delq"><p id="ac-delq">${esc(t('acDeleteQ'))}</p>
        <label class="field"><span class="lbl">${esc(t('dForeverType', { n: '\u0000' })).replace('\u0000', `<b class="fvword">${esc(email)}</b>`)}</span><input class="inp" id="delemail" type="email" autocomplete="off" spellcheck="false"${AC.delErr ? ' aria-invalid="true" aria-describedby="delerr"' : ''}></label>
        ${AC.delErr ? `<p class="msg err" id="delerr" role="alert">${esc(AC.delErr)}</p>` : ''}
        <div class="row"><button type="submit" class="btn sm danger">${esc(t('acDeleteBtn'))}</button><button type="button" class="btn sm" data-acdelcancel>${esc(t('dKeep'))}</button></div></form>`
          : `<div class="row"><button type="button" class="btn danger" data-acdel>${esc(t('acDeleteBtn'))}</button></div>`
      }
    </section>`;
    $('#main').innerHTML =
      `<div class="dash account"><div class="dashhead"><h1 id="ach">${esc(t('acTitle'))}</h1><a class="btn" href="/">${esc(t('myEvents'))}</a></div>${body}</div>`;
  }
  async function savePassword() {
    const a = $('#pw1').value,
      b = $('#pw2').value;
    AC.pwOk = false;
    AC.pwErr = a.length < 6 ? t('dWeak') : a !== b ? t('acPwMismatch') : '';
    if (!AC.pwErr) {
      const { error } = await SB.auth.updateUser({ password: a });
      if (error) AC.pwErr = friendly(error).text;
      else AC.pwOk = true;
    }
    render();
    (AC.pwErr ? $('#pw1') : $('#pwform [type=submit]'))?.focus();
  }
  async function exportAll() {
    const [ev, inv, log, pl] = await Promise.all([
      SB.from('events').select('*'),
      SB.from('invites').select('*'),
      SB.from('invite_log').select('*'),
      SB.from('entitlements').select('*')
    ]);
    if (ev.error) {
      toast(t('dErr'));
      return;
    }
    const out = {
      exported_at: new Date().toISOString(),
      account: { email: A.session.user.email || '' },
      events: ev.data || [],
      invitations: inv.data || [],
      invitation_changes: log.data || [],
      plans: pl.data || []
    };
    const u = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' })),
      a = document.createElement('a');
    a.href = u;
    a.download = 'supra-data-' + out.exported_at.slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 4000);
    toast(t('acExported'));
  }
  async function deleteAccount() {
    const typed = $('#delemail')?.value || '';
    if (!same(typed, A.session.user.email || '')) {
      AC.delErr = t('acDeleteBad');
      render();
      const i = $('#delemail');
      if (i) {
        i.value = typed;
        i.focus();
      }
      return;
    }
    const btn = $('#delform [type=submit]');
    if (btn) btn.disabled = true;
    const { error } = await SB.rpc('delete_my_account');
    if (error) {
      AC.delErr = t('dErr');
      render();
      return;
    }
    try {
      await SB.auth.signOut();
    } catch (e) {}
    location.replace('/?deleted=1');
  }

  // The account menu (initials button): same keyboard behaviour as the card's ⋯ menu.
  function setAcctMenu(open, focusButton) {
    const m = $('#acctmenu'),
      b = $('#acctbtn');
    if (!m || !b) return;
    m.hidden = !open;
    b.setAttribute('aria-expanded', String(open));
    if (!open && focusButton) b.focus();
  }
  document.addEventListener('pointerdown', e => {
    if (!$('#acctmenu')?.hidden && !e.target.closest('#acct')) setAcctMenu(false);
  });
  document.addEventListener('focusin', e => {
    if (!$('#acctmenu')?.hidden && !e.target.closest('#acct')) setAcctMenu(false);
  });
  document.addEventListener('keydown', e => {
    if ($('#acctmenu')?.hidden || !e.target.closest('#acct')) return;
    const items = [...document.querySelectorAll('#acctmenu [role=menuitem]')],
      i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      setAcctMenu(false, true);
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      const j =
        e.key === 'Home'
          ? 0
          : e.key === 'End'
            ? items.length - 1
            : (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[j].focus();
    }
  });
  // The card's ⋯ menu closes without redrawing the list, so focus moving out of it (Tab, a click elsewhere) stays put.
  function closeMenu(focusButton) {
    const id = D.menuId;
    if (!id) return;
    D.menuId = null;
    document.querySelector('.evmenu')?.remove();
    const b = document.querySelector(`[data-more="${CSS.escape(id)}"]`);
    if (b) {
      b.setAttribute('aria-expanded', 'false');
      if (focusButton) b.focus();
    }
  }
  document.addEventListener('pointerdown', e => {
    if (D.menuId && !e.target.closest('.evmore')) closeMenu(false);
  });
  document.addEventListener('focusin', e => {
    if (D.menuId && !e.target.closest('.evmore')) closeMenu(false);
  });
  document.addEventListener('keydown', e => {
    if (!D.menuId || !e.target.closest('.evmore')) return;
    const items = [...document.querySelectorAll('.evmenu [role=menuitem]')],
      i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      closeMenu(true);
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key) && items.length) {
      e.preventDefault();
      const j =
        e.key === 'Home'
          ? 0
          : e.key === 'End'
            ? items.length - 1
            : (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[j].focus();
    }
  });

  /* ---------------- events ---------------- */
  document.addEventListener('submit', e => {
    e.preventDefault();
    if (e.target.id === 'sform') {
      if (A.state !== 'authenticating') submitAuth();
      return;
    }
    if (e.target.id === 'pwform') {
      savePassword();
      return;
    }
    if (e.target.id === 'delform') {
      deleteAccount();
      return;
    }
    if (e.target.id === 'fvform') {
      deleteForever(e.target.dataset.id);
      return;
    }
    if (e.target.id === 'nform') {
      const name = $('#nname').value.trim();
      D.name = name;
      D.date = $('#ndate').value;
      if (!name) {
        D.nerr = t('dNameReq');
        render();
        $('#nname').focus();
        return;
      }
      D.nerr = '';
      create({ name, type: 'wedding', event_date: D.date || null });
    }
  });
  document.addEventListener('input', e => {
    if (e.target.id === 'email') F.email = e.target.value;
    if (e.target.id === 'fvname' && D.fverr) {
      D.fverr = '';
      e.target.removeAttribute('aria-invalid');
      e.target.removeAttribute('aria-describedby');
      $('#fverr')?.remove();
    }
    if (e.target.id === 'nname') {
      D.name = e.target.value;
      if (D.nerr) {
        D.nerr = '';
        e.target.removeAttribute('aria-invalid');
        $('#nerr')?.remove();
      }
    }
    if (e.target.id === 'ndate') {
      D.date = e.target.value;
      const x = $('#ndate-txt');
      if (x) x.textContent = fmtDate(D.date);
    }
    if ((e.target.id === 'email' || e.target.id === 'pw') && A.formError && A.formError.field) {
      A.formError = null;
      $('#ferr')?.remove();
      e.target.removeAttribute('aria-invalid');
    }
  });
  document.addEventListener('change', async e => {
    if (e.target.id !== 'nfile') return;
    const f = e.target.files[0];
    {
      const n = $('#nfile-name');
      if (n) n.textContent = f ? f.name : t('noFile');
    }
    if (!f) return;
    try {
      const plan = JSON.parse(await f.text());
      if (!plan || !Array.isArray(plan.tables) || typeof plan.guests !== 'object') throw 0;
      delete plan.savedAt;
      if (plan.event) delete plan.event.shareLink;
      toast(t('dImported'));
      create({
        name: plan.event?.name || f.name.replace(/\.json$/, ''),
        type: 'wedding',
        event_date: plan.event?.date || null,
        data: plan
      });
    } catch (err) {
      toast(t('dBadFile'));
      e.target.value = '';
    }
  });
  document.addEventListener('click', async e => {
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if ('sample' in d) {
      b.disabled = true;
      await createSample();
      b.disabled = false;
      return;
    }
    if ('newopen' in d || 'newclose' in d) {
      D.newOpen = 'newopen' in d;
      D.nerr = '';
      render();
      (D.newOpen ? $('#nname') : $('[data-newopen]'))?.focus();
      return;
    }
    if (d.start) {
      // "Start your plan" / "Sign in" on the landing page: open that form and go to it
      if (A.state === 'authenticating') return;
      F.mode = d.start;
      F.sent = false;
      A.formError = null;
      render();
      $('#start').scrollIntoView({
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
      });
      $('#email')?.focus({ preventScroll: true });
      return;
    }
    if (d.mode) {
      if (A.state === 'authenticating') return;
      const wasTab = b.getAttribute('role') === 'tab';
      F.mode = d.mode;
      F.sent = false;
      A.formError = null;
      render();
      (wasTab ? $('#tab-' + F.mode) : $('#email'))?.focus();
      return;
    }
    if (d.lang) {
      if (d.lang === lang) return;
      lang = d.lang;
      try {
        localStorage.setItem('supra.lang', lang);
      } catch (x) {}
      const ae = document.activeElement?.id;
      render();
      ($('#' + ae) || $(`[data-lang="${lang}"]`))?.focus();
      return;
    }
    if (b.id === 'acctbtn') {
      const open = $('#acctmenu').hidden;
      setAcctMenu(open);
      if (open) $('#acctmenu [role=menuitem]')?.focus();
      return;
    }
    if (b.id === 'theme') {
      const n = curTheme() === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = n;
      try {
        localStorage.setItem('supra.theme', n);
      } catch (x) {}
      chrome();
      return;
    }
    if (b.id === 'signout') {
      b.disabled = true;
      await SB.auth.signOut();
      return;
    }
    if (b.id === 'google') {
      SB.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + (next || '/') } });
      return;
    }
    if (d.act === 'retry') {
      restore();
      return;
    }
    if (d.act === 'reload') {
      D.events = null;
      render();
      loadEvents();
      return;
    }
    if (d.copy) {
      const u = location.origin + '/e/' + d.copy;
      navigator.clipboard?.writeText(u).then(
        () => toast(t('dCopied')),
        () => toast(u)
      );
      return;
    }
    if (d.more) {
      if (D.menuId === d.more) return closeMenu(true);
      D.menuId = d.more;
      render();
      $('.evmenu [role=menuitem]')?.focus();
      return;
    }
    if (d.del) {
      D.menuId = null;
      D.confirmId = d.del;
      render();
      $('[data-cancel]')?.focus();
      return;
    }
    if (d.cancel !== undefined) {
      const id = D.confirmId;
      D.confirmId = null;
      render();
      $(`[data-more="${id}"]`)?.focus();
      return;
    }
    if ('acexport' in d) {
      b.disabled = true;
      await exportAll();
      b.disabled = false;
      return;
    }
    if ('acglobal' in d) {
      b.disabled = true;
      await SB.auth.signOut({ scope: 'global' });
      return;
    }
    if ('acdel' in d || 'acdelcancel' in d) {
      AC.delOpen = 'acdel' in d;
      AC.delErr = '';
      render();
      (AC.delOpen ? $('#delemail') : $('[data-acdel]'))?.focus();
      return;
    }
    if (d.delyes) {
      b.disabled = true;
      const { error } = await SB.rpc('trash_event', { p_event: d.delyes });
      D.confirmId = null;
      if (error) toast(t('dErr'));
      else toast(t('dTrashed'));
      await loadEvents();
      ($('[data-trashtog]') || $('#yourh'))?.focus();
      return;
    }
    if ('trashtog' in d) {
      D.trashOpen = !D.trashOpen;
      D.forever = null;
      render();
      $('[data-trashtog]')?.focus();
      return;
    }
    if (d.restore) {
      b.disabled = true;
      const ev = D.trash.find(x => x.id === d.restore);
      const { error } = await SB.rpc('restore_event', { p_event: d.restore });
      if (error) {
        toast(t('dErr'));
        b.disabled = false;
        return;
      }
      toast(t('dRestored', { n: ev?.name || '—' }));
      await loadEvents();
      ($(`.ev .evname a[href="/edit/${d.restore}"]`) || $('#yourh'))?.focus();
      return;
    }
    if (d.forever) {
      D.forever = d.forever;
      D.fverr = '';
      render();
      $('#fvname')?.focus();
      return;
    }
    if ('fvcancel' in d) {
      const id = D.forever;
      D.forever = null;
      D.fverr = '';
      render();
      $(`[data-forever="${id}"]`)?.focus();
      return;
    }
  });
  // Arrow keys inside radio groups and tab lists.
  document.addEventListener('keydown', e => {
    const grp = e.target.closest('[role=radiogroup],[role=tablist]');
    if (!grp) return;
    const items = [...grp.querySelectorAll('[role=radio],[role=tab]')],
      i = items.indexOf(e.target);
    if (i < 0) return;
    let j = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % items.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + items.length) % items.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = items.length - 1;
    if (j === null) return;
    e.preventDefault();
    items[j].click();
    requestAnimationFrame(() => {
      const sel = grp.id
        ? document.querySelector('#' + grp.id + ' [aria-checked=true],#' + grp.id + ' [aria-selected=true]')
        : null;
      (sel || items[j]).focus();
    });
  });
  window.addEventListener('pagehide', () => {
    try {
      sub && sub.unsubscribe();
    } catch (e) {}
  });

  function boot() {
    if (new URLSearchParams(location.search).get('deleted')) {
      history.replaceState(null, '', '/');
      setTimeout(() => toast(t('acDeletedDone')), 0);
    }
    render();
    if (!CFG.supabaseUrl || CFG.supabaseUrl.startsWith('YOUR_')) {
      $('#main').innerHTML = '<p class="empty">Supra is not connected to its database yet.</p>';
      return;
    }
    SB = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
    const r = SB.auth.onAuthStateChange((ev, s) => onAuthEvent(ev, s));
    sub = r && r.data && r.data.subscription;
    restore();
  }
  window.__supraAuth = () => ({ state: A.state, gen: A.gen, authed: A.state === 'authenticated' });
  boot();
})();
