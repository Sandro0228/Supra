"""Seating rules list (C5): every rule in words, broken first with where the guests sit, "Show me", and the
top-bar warning that opens the rules."""
from harness import Ctx, test
from test_filters import plan

def open_rules(pw, base, lang='', vp=(1440, 900), path='/edit/ev1?panel=guests'):
    P = plan()   # g09 and g10 unseated; rule r1: g06 and g07 apart, both at Table 1
    P['rules'] += [dict(id='r2', type='together', a='g01', b='g13'),   # Head table / Table 2: broken
                   dict(id='r3', type='apart', a='g09', b='g02'),      # g09 unseated: not seated yet
                   dict(id='r4', type='together', a='g03', b='g04')]   # both at the head table: ok
    ev = dict(id='ev1', owner='u1', name='Nino & Giorgi', slug='guestcode1', guest_page=True, data=P, public_data={},
              lookup_mode='prefix', lookup_pin_hash=None, show_tablemates=False, updated_at='seed', share_status='published', show_layout=True)
    c = Ctx(pw, base, viewport=vp, events=[ev], extra="localStorage.setItem('supra.lang','%s');" % lang if lang else '')
    p = c.goto(path, wait='#stats')
    return c, p

rows = lambda p: p.eval_on_selector_all('.rules li', 'ls => ls.map(l => l.querySelector(".rtxt").innerText.replace(/\\s+/g, " ").trim())')

@test
def rules_in_words_broken_first(pw, base):
    c, p = open_rules(pw, base)
    p.click('[data-sec=rules] summary')
    r = rows(p)
    assert r[0].startswith('მარიამ ტაბატაძე and მარიამ ნოზაძე at different tables') and 'Both at Table 1 now' in r[0], r
    assert 'at the same table' in r[1] and 'At Head table and Table 2 now' in r[1], r
    assert p.locator('.rules li').nth(2).locator('.pill').inner_text() == 'Not seated yet'
    assert p.locator('.rules li').nth(3).locator('.pill').inner_text() == 'OK'
    assert p.locator('.rules [data-rshow]').count() == 2                 # only broken rules get "Show me"
    assert p.get_attribute('.rules li [data-delrule]', 'aria-label') == 'Remove this rule'
    assert not c.errors, c.errors
    c.close()

@test
def show_me_goes_to_the_guest(pw, base):
    c, p = open_rules(pw, base)
    p.click('[data-sec=rules] summary')
    p.click('.rules [data-rshow=r2]'); p.wait_for_selector('#g-name')
    assert p.input_value('#g-name') == 'ლაშა ბერიძე'
    p.click('#right [data-act=close]'); p.wait_for_selector('#g-name', state='detached')
    c.close()
    c, p = open_rules(pw, base, path='/edit/ev1')                     # in the list view too
    p.click('[data-view=list]'); p.click('#tab-guests'); p.click('[data-sec=rules] summary')
    p.click('.rules [data-rshow=r1]'); p.wait_for_selector('#g-name')
    assert p.input_value('#g-name') == 'მარიამ ტაბატაძე'
    assert p.get_attribute('#listview [data-lseat="t1:1"]', 'aria-current') == 'true'
    assert not c.errors, c.errors
    c.close()

@test
def the_warning_opens_the_rules(pw, base):
    c, p = open_rules(pw, base, path='/edit/ev1')
    w = p.locator('#stats .warn')
    assert w.get_attribute('aria-label') == '2 seating rules are broken'
    w.click(); p.wait_for_selector('[data-sec=rules][open]')
    assert p.get_attribute('#tab-guests', 'aria-selected') == 'true'
    w.click()                                                           # a second press keeps it open
    assert p.is_visible('[data-sec=rules][open]')
    c.close()

@test
def rules_in_georgian(pw, base):
    c, p = open_rules(pw, base, lang='ka')
    p.click('[data-sec=rules] summary')
    assert 'სხვადასხვა მაგიდასთან' in rows(p)[0] and 'მაჩვენე' in p.inner_text('.rules')
    assert p.get_attribute('#stats .warn', 'aria-label') == 'დარღვეულია 2 წესი'
    c.close()
