"""The seat reveal (design direction A): greeting by name, the table large, tablemates as a natural list,
"Show me on the plan", and no animation when the device asks for reduced motion."""
import copy
from harness import Ctx, test, PLAN
from test_guest import search

def ev(**kw):
    e = dict(id='ev1', owner='u1', name='x', slug='guestcode1', guest_page=True, data=PLAN, public_data={},
             lookup_mode='prefix', lookup_pin_hash=None, show_tablemates=True, updated_at='seed', share_status='published',
             show_layout=True)
    e.update(kw); return [e]

@test
def reveal_greets_by_name_and_lists_tablemates(pw, base):
    c = Ctx(pw, base, session=False, events=ev())
    p = c.goto('/e/guestcode1', wait='#gq')
    search(p, 'ლუკა'); p.wait_for_selector('#gcard.greveal')
    assert p.inner_text('#gcard .gyou').endswith(', your table is')
    assert p.inner_text('#gcard .gbig').strip()
    mates = p.inner_text('#gcard .gwith')
    assert ' and ' in mates and '·' not in mates, mates                # "A, B and C", not "A · B · C"
    assert p.evaluate("getComputedStyle(document.querySelector('#gcard .gportrait')).boxShadow") != 'none'
    # one next step: the search button steps back once a seat is shown
    assert p.evaluate("getComputedStyle(document.querySelector('.gfind')).backgroundColor") != p.evaluate("getComputedStyle(document.querySelector('[data-gshow]')).backgroundColor")
    p.click('[data-gshow]')
    assert p.evaluate("document.activeElement.id") == 'gmap'
    p.click('[data-glang=ka]'); p.wait_for_selector('#gcard')
    assert ' და ' in p.inner_text('#gcard .gwith') and p.inner_text('#gcard .gyou').endswith(', შენი მაგიდაა')
    assert not c.errors, c.errors
    c.close()

@test
def no_plan_button_when_the_layout_is_hidden(pw, base):
    c = Ctx(pw, base, session=False, events=ev(show_layout=False, show_tablemates=False))
    p = c.goto('/e/guestcode1', wait='#gq')
    search(p, 'ლუკა'); p.wait_for_selector('#gcard')
    assert p.locator('[data-gshow]').count() == 0 and p.locator('#gcard .gwithbox').count() == 0
    c.close()

@test
def reveal_is_still_under_reduced_motion(pw, base):
    c = Ctx(pw, base, session=False, events=ev(), reduced_motion='reduce')
    p = c.goto('/e/guestcode1', wait='#gq')
    search(p, 'ლუკა'); p.wait_for_selector('#gcard')
    assert p.evaluate("getComputedStyle(document.querySelector('#gcard')).animationName") == 'none'
    c.close()
