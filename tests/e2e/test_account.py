"""Account page (/account) and privacy page (/privacy): password, sign out everywhere, plans, download all data,
delete account with typed email (migration 012)."""
import json
from harness import Ctx, PLAN, test

def account(pw, base, **kw):
    c = Ctx(pw, base, **kw); p = c.goto('/account', '#ach')
    p.wait_for_selector('#ac-data')
    return c, p

def calls(p, name):
    return [x for x in p.evaluate('window.__mockCalls') if x[0] == name]

@test
def account_menu_opens_the_account_page(pw, base):
    c = Ctx(pw, base); p = c.goto('/', '.ev')
    b = p.locator('#acctbtn')
    assert b.inner_text() == 'S' and b.get_attribute('aria-haspopup') == 'menu' and 'sandro@example.com' in b.get_attribute('aria-label')
    b.focus(); p.keyboard.press('Enter')
    assert b.get_attribute('aria-expanded') == 'true' and p.evaluate("document.activeElement.getAttribute('role')") == 'menuitem'
    assert 'sandro@example.com' in p.inner_text('#acctmenu')
    p.keyboard.press('End'); assert p.evaluate("document.activeElement.id") == 'signout'
    p.keyboard.press('ArrowDown'); assert p.evaluate("document.activeElement.getAttribute('href')") == '/'   # wraps
    p.keyboard.press('Escape')
    assert p.is_hidden('#acctmenu') and p.evaluate("document.activeElement.id") == 'acctbtn'
    p.click('#theme')                                                   # the theme switch stays in the header
    assert p.evaluate("document.documentElement.dataset.theme") in ('dark', 'light')
    p.click('#acctbtn'); p.click('#acctlink'); p.wait_for_selector('#ach')
    assert p.inner_text('#ach') == 'Account' and 'sandro@example.com' in p.inner_text('.account')
    assert p.locator('.account a[href="/"]').count() >= 1
    assert not c.errors, c.errors
    c.close()

@test
def signed_out_account_goes_to_sign_in_and_back(pw, base):
    c = Ctx(pw, base, session=False); p = c.goto('/account', '#sform')
    assert '/?next=/account' in p.url
    p.fill('#email', 'sandro@example.com'); p.fill('#pw', 'secret1'); p.click('#sform [type=submit]')
    p.wait_for_selector('#ach')
    assert p.url.endswith('/account')
    c.close()

@test
def change_password_checks_both_fields(pw, base):
    c, p = account(pw, base)
    p.fill('#pw1', 'newpass1'); p.fill('#pw2', 'other'); p.click('#pwform [type=submit]')
    assert p.get_attribute('#pw1', 'aria-invalid') == 'true' and "don't match" in p.inner_text('#pwerr')
    assert p.evaluate("document.activeElement.id") == 'pw1' and not calls(p, 'updateUser')
    p.fill('#pw1', 'newpass1'); p.fill('#pw2', 'newpass1'); p.click('#pwform [type=submit]')
    p.wait_for_selector('text=Password changed.')
    assert calls(p, 'updateUser') == [['updateUser', ['password']]]
    c.close()

@test
def plans_list_and_sign_out_everywhere(pw, base):
    c, p = account(pw, base)
    assert 'Event pass' in p.inner_text('.acsec:has(#ac-plans)') and PLAN['event']['name'] in p.inner_text('.aclist')
    p.click('[data-acglobal]'); p.wait_for_selector('#sform')
    assert p.evaluate("localStorage.getItem('mocklastsignout')") == 'global' and '/?next=/account' in p.url
    c.close()

@test
def download_all_my_data(pw, base):
    c, p = account(pw, base)
    with p.expect_download() as dl:
        p.click('[data-acexport]')
    f = dl.value
    assert f.suggested_filename.startswith('supra-data-') and f.suggested_filename.endswith('.json')
    out = json.load(open(f.path()))
    assert out['account']['email'] == 'sandro@example.com'
    assert out['events'][0]['data']['guests'] == PLAN['guests']
    assert set(out) >= {'events', 'invitations', 'invitation_changes', 'plans', 'exported_at'}
    c.close()

@test
def delete_account_needs_the_typed_email(pw, base):
    c, p = account(pw, base)
    p.click('[data-acdel]')
    assert p.evaluate("document.activeElement.id") == 'delemail'
    assert 'sandro@example.com' in p.inner_text('#delform .fvword')
    p.fill('#delemail', 'someone@else.com'); p.click('#delform [type=submit]')
    assert p.get_attribute('#delemail', 'aria-invalid') == 'true' and not calls(p, 'delete_my_account')
    p.click('[data-acdelcancel]')
    assert p.evaluate("document.activeElement.hasAttribute('data-acdel')")
    p.click('[data-acdel]'); p.fill('#delemail', ' SANDRO@example.com '); p.click('#delform [type=submit]')
    p.wait_for_selector('#sform')                                       # signed out, back on the start page
    assert p.url.rstrip('/').endswith(base.split('//')[1]) or p.url.endswith('/')
    assert json.loads(p.evaluate("localStorage.getItem('mockdb')"))['events'] == []
    assert 'deleted' in p.inner_text('body')
    c.close()

@test
def account_page_in_georgian(pw, base):
    c, p = account(pw, base, extra="localStorage.setItem('supra.lang','ka');")
    assert p.inner_text('#ach') == 'ანგარიში' and 'ჩემი ანგარიშის წაშლა' in p.inner_text('.account')
    c.close()

@test
def privacy_page_in_both_languages(pw, base):
    c = Ctx(pw, base, session=False); p = c.goto('/privacy', '#h')
    txt = p.inner_text('main')
    for s in ('90 days', '30 days', 'one day', 'Supabase', 'Google Fonts', 'no analytics'):
        assert s in txt, s
    assert p.is_hidden('#ask')                                          # no contact email configured in tests
    p.click('[data-lang=ka]')
    assert 'როგორ ეპყრობა Supra' in p.inner_text('#h') and p.title() == 'კონფიდენციალურობა · Supra'
    assert not c.errors, c.errors
    c.close()
