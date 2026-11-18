"""Planner motion and the room: guests settle into seats, empty seats glow while someone needs one,
petals fall once when the last guest is seated, and the hall drawings are only decoration."""
import copy, json
from harness import Ctx, PLAN, test

def two_waiting():
    plan = copy.deepcopy(PLAN)
    t1 = plan['tables'][1]
    plan['waiting'] = [t1['seats'][1], t1['seats'][2]]
    t1['seats'][1] = t1['seats'][2] = None
    return [dict(id='ev1', owner='u1', name=plan['event']['name'], slug='guestcode1', guest_page=True, data=plan,
                 public_data={}, lookup_mode='prefix', lookup_pin_hash=None, show_tablemates=False,
                 updated_at='seed', share_status='published', show_layout=True)]

def seat_next(p):
    p.click('#tab-guests'); p.locator('.wchip').first.click()
    assert p.evaluate("document.querySelector('#plan').classList.contains('seekseat')")
    p.locator('#plan .seat.empty').first.click(); p.wait_for_timeout(80)

@test
def seated_guest_settles_and_empty_seats_glow(pw, base):
    c = Ctx(pw, base, events=two_waiting()); p = c.goto('/edit/ev1', '#plan .tbody'); p.wait_for_timeout(300)
    assert p.locator('#plan .fig.settle').count() == 0          # nothing moves on first load
    assert p.locator('#plan .seat.empty').count() == 2
    seat_next(p)
    assert p.locator('#plan .fig.settle').count() == 1          # only the guest who was just seated
    assert not p.evaluate("document.querySelector('#plan').classList.contains('seekseat')")
    assert p.locator('.petals').count() == 0                     # one guest still waiting
    seat_next(p)
    assert p.locator('.petals i').count() > 0                    # the last guest is seated
    assert not c.errors, c.errors
    c.close()

@test
def petals_only_once_per_event(pw, base):
    c = Ctx(pw, base, events=two_waiting(), extra="localStorage.setItem('supra.celebrated.ev1','1');")
    p = c.goto('/edit/ev1', '#plan .tbody'); p.wait_for_timeout(300)
    seat_next(p); seat_next(p)
    assert p.locator('.petals').count() == 0
    c.close()

@test
def reduced_motion_turns_animations_off(pw, base):
    c = Ctx(pw, base, events=two_waiting(), reduced_motion='reduce')
    p = c.goto('/edit/ev1', '#plan .tbody'); p.wait_for_timeout(300)
    seat_next(p)
    assert p.evaluate("getComputedStyle(document.querySelector('#plan .fig.settle')).animationName") == 'none'
    seat_next(p)
    assert p.locator('.petals').count() == 0
    c.close()

@test
def hall_drawings_are_drawn_and_do_not_catch_clicks(pw, base):
    c = Ctx(pw, base); p = c.goto('/edit/ev1', '#plan .tbody'); p.wait_for_timeout(300)
    hrefs = p.evaluate("[...document.querySelectorAll('#plan use')].map(u=>u.getAttribute('href'))")
    for k in ('#I_floor', '#I_tree_top', '#I_flowers_top', '#I_runner'):
        assert k in hrefs, k
    # the seats are still what you hit, not the room behind them
    box = p.locator('#plan .seat').first.bounding_box()
    hit = p.evaluate("([x,y])=>!!document.elementFromPoint(x,y).closest('.seat')", [box['x'] + box['width'] / 2, box['y'] + box['height'] / 2])
    assert hit
    c.close()
