"""Public guest page: privacy of what reaches the browser, search states, titles and language switching."""
import json, copy
from harness import Ctx, test, PLAN

PRIVATE = ['SECRET_ALLERGY_PEANUTS', 'SECRET_GROUP_X', 'g06', '"th"', '"t1"']
OTHER_NAMES = ['ზურაბ', 'ქეთევან', 'ლაშა ბერიძე', 'ეკა დოლიძე']

def page_dump(p):
    """Everything the page holds: drawn DOM, plan state and every RPC response it received."""
    return p.evaluate("""JSON.stringify({dom:document.getElementById("guest").innerHTML.replace(/data:image[^"]*/g,""),state:window.__supraState&&window.__supraState(),title:document.title})""")

def search(p, q):
    p.fill('#gq', q); p.press('#gq', 'Enter'); p.wait_for_timeout(250)

@test
def guest_page_receives_no_private_data(pw, base):
    c = Ctx(pw, base, session=False)
    rpc = []
    c.page.on('console', lambda m: None)
    p = c.goto('/e/guestcode1', wait='#gq')
    p.evaluate("""(()=>{const o=window.supabase;})()""")
    dump = page_dump(p)
    for s in PRIVATE + OTHER_NAMES:
        assert s not in dump, 'leaked before search: ' + s
    search(p, 'ზურაბ')
    dump = page_dump(p)
    for s in PRIVATE + ['ქეთევან', 'ლაშა ბერიძე', 'ეკა დოლიძე']:
        assert s not in dump, 'leaked after search: ' + s
    assert 'ზურაბ მაჭავარიანი' in p.inner_text('#gres')
    assert not c.errors, c.errors; c.close()

@test
def short_query_never_calls_server(pw, base):
    c = Ctx(pw, base, session=False)
    p = c.goto('/e/guestcode1', wait='#gq')
    p.fill('#gq', 'მა'); p.wait_for_timeout(700)
    assert not [x for x in p.evaluate('window.__mockCalls') if x[0] == 'find_seat']
    p.press('#gq', 'Enter'); p.wait_for_timeout(100)
    assert '3' in p.inner_text('#gres')
    c.close()

@test
def duplicates_list_with_table_context_and_no_empty_tablemates(pw, base):
    c = Ctx(pw, base, session=False)
    p = c.goto('/e/guestcode1', wait='#gq')
    search(p, 'მარიამ')
    hits = p.locator('.ghit')
    assert hits.count() == 4, hits.count()
    txt = p.inner_text('#gres')
    assert 'Table 1' in txt and 'Table 2' in txt, txt
    hits.nth(3).click(); p.wait_for_selector('#gcard')
    assert p.evaluate("document.activeElement.id") == 'gcard'
    card = p.inner_text('#gcard')
    assert 'At your table' not in card and 'AT YOUR TABLE' not in card.upper(), card
    alt = p.get_attribute('#gmap svg', 'aria-label')
    assert 'Table 2' in alt and 'seat 1' in alt, alt
    p.click('[data-gall]'); assert p.locator('.ghit').count() == 4
    c.close()

@test
def no_results_and_tablemates_only_when_enabled(pw, base):
    ev = dict(id='ev1', owner='u1', name='x', slug='guestcode1', guest_page=True, data=PLAN, public_data={},
              lookup_mode='prefix', lookup_pin_hash=None, show_tablemates=True, updated_at='seed')
    c = Ctx(pw, base, session=False, events=[ev])
    p = c.goto('/e/guestcode1', wait='#gq')
    search(p, 'Nobody')
    assert "find" in p.inner_text('#gres').lower() or p.locator('.gempty').count() == 1
    search(p, 'ლუკა')
    card = p.inner_text('#gcard')
    assert 'ტატო აბაშიძე' in card and 'AT YOUR TABLE' in card.upper(), card
    c.close()

@test
def exact_mode_and_invitation_code(pw, base):
    ev = dict(id='ev1', owner='u1', name='x', slug='guestcode1', guest_page=True, data=PLAN, public_data={},
              lookup_mode='exact', lookup_pin_hash='4321', show_tablemates=False, updated_at='seed')
    c = Ctx(pw, base, session=False, events=[ev])
    p = c.goto('/e/guestcode1', wait='#gpin')
    assert 'full name' in p.inner_text('#ghint')
    search(p, 'ლუკა ჯანაშია')
    assert p.get_attribute('#gres [role=alert]', 'role') == 'alert'
    assert p.evaluate("document.activeElement.id") == 'gpin'
    p.fill('#gpin', '1111'); search(p, 'ლუკა ჯანაშია')
    assert "doesn't match" in p.inner_text('#gres')
    p.fill('#gpin', '4321'); search(p, 'ლუკა')
    assert p.locator('#gcard').count() == 0
    search(p, 'ჯანაშია ლუკა')
    assert 'ლუკა ჯანაშია' in p.inner_text('#gcard')
    c.close()

@test
def title_meta_and_language_switch_keep_search(pw, base):
    c = Ctx(pw, base, session=False)
    p = c.goto('/e/guestcode1', wait='#gq')
    assert p.title() == 'Find your seat · Nino & Giorgi · Supra', p.title()
    assert 'Nino & Giorgi' in p.get_attribute('meta[name=description]', 'content')
    search(p, 'ლუკა'); p.wait_for_selector('#gcard')
    p.click('[data-glang=ka]'); p.wait_for_timeout(100)
    assert p.evaluate('document.documentElement.lang') == 'ka'
    assert p.input_value('#gq') == 'ლუკა' and p.locator('#gcard').count() == 1
    assert 'იპოვე' in p.title()
    c.close()

@test
def guest_page_fits_small_phones(pw, base):
    for vp in [(320, 568), (390, 844), (768, 1024), (1440, 900)]:
        c = Ctx(pw, base, session=False, viewport=vp)
        p = c.goto('/e/guestcode1', wait='#gq')
        search(p, 'ლუკა'); p.wait_for_selector('#gmap svg')
        w = p.evaluate('document.documentElement.scrollWidth')
        assert w <= vp[0], (vp, w)
        c.close()

@test
def saving_never_writes_guests_to_public_copy(pw, base):
    c = Ctx(pw, base, session=True)
    p = c.goto('/edit/ev1', wait='#plan')
    p.wait_for_timeout(300)
    p.evaluate("window.__mockCalls.length=0")
    p.click('[data-panel=event]'); p.fill('#ev-name', 'Nino & Giorgi!'); p.wait_for_timeout(2200)
    ups = [x[1] for x in p.evaluate('window.__mockCalls') if x[0] == 'update']
    assert ups and all('public_data' not in u for u in ups), ups
    c.close()

@test
def share_panel_explains_public_data_and_saves_lookup(pw, base):
    c = Ctx(pw, base, session=True)
    p = c.goto('/edit/ev1', wait='#plan')
    p.click('[data-panel=share]'); p.wait_for_selector('#privacy-controls')
    txt = p.inner_text('#privacy-controls')
    assert 'Never shown' in txt and 'allergies' in txt
    assert 'guestcode1' in p.inner_text('.sharelink')
    # copy and preview come before the QR code
    order = p.evaluate("[...document.querySelectorAll('[data-act=copylink],#qr')].map(e=>e.id||'copy')")
    assert order == ['copy', 'qr'], order
    p.check('[name=lk-mode][value=exact]'); p.wait_for_timeout(200)
    p.fill('#lk-pin', '12'); p.click('[data-act=setpin]'); p.wait_for_timeout(100)
    p.fill('#lk-pin', '2468'); p.click('[data-act=setpin]'); p.wait_for_timeout(200)
    ev = json.loads(p.evaluate("localStorage.getItem('mockdb')"))['events'][0]
    assert ev['lookup_mode'] == 'exact' and ev['lookup_pin_hash'] == '2468', ev
    assert p.locator('[data-act=rmpin]').count() == 1
    p.check('#lk-mates'); p.wait_for_timeout(200)
    assert 'everyone else' in p.inner_text('#privacy-controls')
    c.close()
