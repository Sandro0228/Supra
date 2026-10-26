"""Sign-in startup and race tests for the front page (dash.js)."""
from harness import Ctx, test

def surfaces(p):
    """Which surfaces have been visible, sampled every 15 ms from page start."""
    return p.evaluate("window.__seen||[]")

SAMPLER = """window.__seen=[];(function tick(){const m=document.querySelector('#main');if(m){
  const s=m.querySelector('#sform')?'signin':m.querySelector('#nform')?'dash':m.querySelector('.loading')?'loading':m.innerText.trim()?'other':'empty';
  if(window.__seen[window.__seen.length-1]!==s)window.__seen.push(s)}setTimeout(tick,15)})();"""

def start(pw, base, **kw):
    c = Ctx(pw, base, **kw); c.ctx.add_init_script("document.addEventListener('DOMContentLoaded',()=>{" + SAMPLER + "})"); return c

@test
def valid_stored_session_never_shows_sign_in(pw, base):
    c = start(pw, base, session=True, cfg={'sessionDelay': 600})
    p = c.goto('/', wait='#nform'); p.wait_for_timeout(300)
    seen = surfaces(p)
    assert 'signin' not in seen, seen
    assert seen[-1] == 'dash' and 'loading' in seen, seen
    assert p.is_visible('#signout') and 'sandro@example.com' in p.inner_text('#who')
    assert not c.errors, c.errors; c.close()

@test
def anonymous_never_sees_account_content(pw, base):
    c = start(pw, base, session=False, cfg={'sessionDelay': 400})
    p = c.goto('/', wait='#sform'); p.wait_for_timeout(300)
    seen = surfaces(p)
    assert 'dash' not in seen, seen
    assert seen[-1] == 'signin', seen
    assert p.is_hidden('#signout') and p.inner_text('#who') == ''
    c.close()

@test
def failed_sign_in_cannot_overwrite_newer_session(pw, base):
    # Visitor submits a wrong password (slow); meanwhile another tab signs in. The late error must be ignored.
    c = start(pw, base, session=False, cfg={'signinDelay': 900, 'signin': 'bad'})
    p = c.goto('/', wait='#sform')
    p.fill('#email', 'sandro@example.com'); p.fill('#pw', 'wrongpass'); p.click('#sform [type=submit]')
    p.wait_for_timeout(150)
    assert p.get_attribute('#sform [type=submit]', 'aria-busy') == 'true'
    assert p.input_value('#pw') == 'wrongpass', 'password must stay while the request runs'
    p.evaluate("localStorage.setItem('mocksess','1');window.__mockEmit('SIGNED_IN',true)")
    p.wait_for_selector('#nform'); p.wait_for_timeout(1200)
    assert p.is_visible('#nform') and not p.is_visible('#ferr'), 'late error replaced the dashboard'
    c.close()

@test
def failed_sign_in_keeps_email_clears_password_and_announces(pw, base):
    c = start(pw, base, session=False, cfg={'signinDelay': 200})
    p = c.goto('/', wait='#sform')
    p.fill('#email', 'sandro@example.com'); p.fill('#pw', 'wrongpass'); p.press('#pw', 'Enter')
    p.wait_for_selector('#ferr')
    assert p.get_attribute('#ferr', 'role') == 'alert'
    assert p.input_value('#email') == 'sandro@example.com' and p.input_value('#pw') == ''
    assert 'ferr' in (p.get_attribute('#pw', 'aria-describedby') or '') and p.get_attribute('#pw', 'aria-invalid') == 'true'
    assert p.evaluate("document.activeElement.id") == 'pw'
    assert not p.is_disabled('#sform [type=submit]')
    # bad email focuses the email field instead
    p.fill('#email', 'not-an-email'); p.fill('#pw', 'secret1'); p.press('#pw', 'Enter'); p.wait_for_timeout(100)
    assert p.evaluate("document.activeElement.id") == 'email' and p.get_attribute('#email', 'aria-invalid') == 'true'
    c.close()

@test
def successful_sign_in_then_sign_out_then_reload(pw, base):
    c = start(pw, base, session=False, cfg={})
    p = c.goto('/', wait='#sform')
    p.fill('#email', 'sandro@example.com'); p.fill('#pw', 'secret1'); p.click('#sform [type=submit]')
    p.wait_for_selector('#nform')
    p.click('#signout'); p.wait_for_selector('#sform')
    p.evaluate("window.__seen=[]"); p.reload(); p.wait_for_selector('#sform'); p.wait_for_timeout(200)
    assert 'dash' not in surfaces(p), surfaces(p)
    c.close()

@test
def expired_session_goes_to_sign_in_without_flash(pw, base):
    c = start(pw, base, session=True, cfg={'session': 'expired', 'sessionDelay': 300})
    p = c.goto('/', wait='#sform'); p.wait_for_timeout(300)
    assert 'dash' not in surfaces(p), surfaces(p)
    c.close()

@test
def slow_session_shows_branded_loading(pw, base):
    c = start(pw, base, session=True, cfg={'sessionDelay': 1500})
    p = c.goto('/'); p.wait_for_selector('.loading')
    assert p.get_attribute('.loading', 'role') == 'status'
    assert not p.is_visible('#sform') and not p.is_visible('#nform')
    p.wait_for_selector('#nform', timeout=5000)
    c.close()

@test
def rejected_session_request_offers_retry(pw, base):
    c = start(pw, base, session=True, cfg={'session': 'reject', 'sessionDelay': 100})
    p = c.goto('/'); p.wait_for_selector('[data-act=retry]')
    assert 'signin' not in surfaces(p) and 'dash' not in surfaces(p)
    p.evaluate("localStorage.setItem('mockcfg','{}')"); p.click('[data-act=retry]')
    p.wait_for_selector('#nform')
    c.close()

@test
def language_switch_keeps_typed_email_and_mode(pw, base):
    c = start(pw, base, session=False, cfg={})
    p = c.goto('/', wait='#sform')
    p.click('#tab-signup'); p.fill('#email', 'nino@example.com')
    p.click('[data-lang=ka]'); p.wait_for_timeout(100)
    assert p.evaluate("document.documentElement.lang") == 'ka'
    assert p.input_value('#email') == 'nino@example.com' and p.get_attribute('#tab-signup', 'aria-selected') == 'true'
    assert 'სტუმრების' in p.title()
    c.close()
