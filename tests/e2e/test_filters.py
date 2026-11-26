"""Guests panel filters (C1): without a seat, a side, a group, allergies; with each other and with the search text."""
import copy
from harness import Ctx, PLAN, test

def plan():
    P = copy.deepcopy(PLAN)
    G = P['guests']
    G['g03']['group'] = G['g04']['group'] = 'Work'
    G['g05']['group'] = 'Family'
    G['g07']['allergies'] = 'Nuts'
    G['g09']['side'] = 'bride'
    for t in P['tables']: t['seats'] = [None if s in ('g09', 'g10') else s for s in t['seats']]
    P['waiting'] = ['g09', 'g10']
    return P

def open_guests(pw, base, lang=''):
    ev = dict(id='ev1', owner='u1', name='Nino & Giorgi', slug='guestcode1', guest_page=True, data=plan(), public_data={},
              lookup_mode='prefix', lookup_pin_hash=None, show_tablemates=False, updated_at='seed', share_status='published', show_layout=True)
    c = Ctx(pw, base, events=[ev], extra="localStorage.setItem('supra.lang','%s');" % lang if lang else '')
    p = c.goto('/edit/ev1?panel=guests', wait='#find')
    return c, p

names = lambda p: p.eval_on_selector_all('#findres button span', 'xs => xs.map(x => x.textContent)')

@test
def filter_guests_without_a_seat_by_side_and_group(pw, base):
    c, p = open_guests(pw, base)
    assert p.inner_text('#findres') == ''                              # nothing chosen: no list
    p.click('[data-ff=unseated]')
    assert p.get_attribute('[data-ff=unseated]', 'aria-pressed') == 'true'
    assert sorted(names(p)) == sorted(['თეონა ბერიძე', 'ლევან გელაშვილი']) and '2 guests' in p.inner_text('#findres')
    p.click('[data-ff=bride]')
    assert names(p) == ['თეონა ბერიძე']                                # filters combine
    p.click('[data-ff=bride]'); p.click('[data-ff=unseated]')          # pressing again turns a filter off
    p.select_option('#ffgroup', 'Work')
    assert sorted(names(p)) == ['ანა ხუციშვილი', 'გიორგი ლომიძე']
    assert p.evaluate("document.activeElement.id") == 'ffgroup'
    p.fill('#find', 'ანა')
    assert names(p) == ['ანა ხუციშვილი']                               # and with the typed text
    assert p.locator('#findres [data-gototable]').count() == 0          # tables only for a plain search
    p.click('[data-ff=clear]')
    assert p.locator('#ffgroup').input_value() == '' and p.locator('[data-ff][aria-pressed=true]').count() == 0
    assert not c.errors, c.errors
    c.close()

@test
def allergy_filter_shows_the_allergy(pw, base):
    c, p = open_guests(pw, base)
    p.click('[data-ff=allergy]')
    txt = p.inner_text('#findres')
    assert 'მარიამ ნოზაძე' in txt and 'Nuts' in txt and 'SECRET_ALLERGY_PEANUTS' in txt, txt
    p.click('[data-ff=groom]')
    assert p.inner_text('#findres').strip() == 'No guests match these filters.'
    c.close()

@test
def a_filtered_guest_takes_you_to_their_seat(pw, base):
    c, p = open_guests(pw, base)
    p.click('[data-ff=allergy]')
    p.click('#findres [data-goto]:has-text("მარიამ ნოზაძე")')
    p.wait_for_selector('#g-name')
    assert p.input_value('#g-name') == 'მარიამ ნოზაძე'
    c.close()

@test
def filters_in_georgian(pw, base):
    c, p = open_guests(pw, base, 'ka')
    assert p.inner_text('[data-ff=unseated]') == 'ადგილის გარეშე'
    p.click('[data-ff=unseated]')
    assert '2 სტუმარი' in p.inner_text('#findres')
    assert p.inner_text('[data-ff=clear]') == 'ყველას ჩვენება'
    c.close()
