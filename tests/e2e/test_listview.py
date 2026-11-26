"""List view (C2): the plan as tables of guests, the same selection and seating as the drawing, remembered per device."""
from harness import Ctx, test
from test_filters import plan

def open_plan(pw, base, lang='', vp=(1440, 900), list_view=False):
    ev = dict(id='ev1', owner='u1', name='Nino & Giorgi', slug='guestcode1', guest_page=True, data=plan(), public_data={},
              lookup_mode='prefix', lookup_pin_hash=None, show_tablemates=False, updated_at='seed', share_status='published', show_layout=True)
    extra = ("localStorage.setItem('supra.lang','%s');" % lang if lang else '') + ("localStorage.setItem('supra.view','list');" if list_view else '')
    c = Ctx(pw, base, viewport=vp, events=[ev], extra=extra)
    p = c.goto('/edit/ev1', wait='#viewsw [data-view]')
    return c, p

@test
def switch_to_the_list_and_back(pw, base):
    c, p = open_plan(pw, base)
    assert p.get_attribute('[data-view=plan]', 'aria-checked') == 'true' and p.is_hidden('#listview')
    p.click('[data-view=list]')
    assert p.is_visible('#listview') and p.is_hidden('#scroller') and p.is_hidden('#zoombar')
    heads = p.eval_on_selector_all('#listview h3', 'hs => hs.map(h => h.textContent)')
    assert heads[0].startswith('Unseated guests') and 'Head table' in heads[1] and len(heads) == 4, heads
    S = p.evaluate('window.__supraState()')
    first = [S['guests'][g]['name'] if g else 'Empty seat' for g in S['tables'][1]['seats']]
    assert p.eval_on_selector_all('#lvh-t1 ~ table .lvname', 'bs => bs.map(b => b.textContent)') == first
    assert 'Nuts' in p.inner_text('#listview')                         # allergies, meals, groups in columns
    p.reload(); p.wait_for_selector('#listview:not([hidden])')         # remembered on this device
    p.focus('[data-view=list]'); p.keyboard.press('ArrowLeft')         # a radio group with arrow keys
    p.wait_for_selector('#listview', state='hidden')
    assert p.is_visible('#plan .tbody') and p.evaluate('document.activeElement.dataset.view') == 'plan'
    assert not c.errors, c.errors
    c.close()

@test
def a_guest_row_opens_the_inspector_and_focus_comes_back(pw, base):
    c, p = open_plan(pw, base, list_view=True)
    row = p.locator('#listview .lvname[data-lseat]').filter(has_text='მარიამ ნოზაძე')
    key = row.get_attribute('data-lseat')
    row.click(); p.wait_for_selector('#g-name')
    assert p.input_value('#g-name') == 'მარიამ ნოზაძე'
    assert p.get_attribute(f'[data-lseat="{key}"]', 'aria-current') == 'true'
    p.click('#right [data-act=close], #left [data-act=close]')
    p.wait_for_selector('#g-name', state='detached')
    assert p.evaluate('document.activeElement.dataset.lseat') == key
    p.click('[data-ltable=t2]'); p.wait_for_selector('#t-name')            # a table heading selects the table
    assert p.is_hidden('#selbar')                                       # its tools are in the inspector here
    assert not c.errors, c.errors
    c.close()

@test
def seat_an_unseated_guest_from_the_list(pw, base):
    c, p = open_plan(pw, base, list_view=True)
    p.click('#listview [data-wait=g09]')
    assert p.get_attribute('#listview [data-wait=g09]', 'aria-pressed') == 'true'
    assert 'Now pick an empty seat' in p.inner_text('.lvwait')
    p.locator('#listview tr.empty .lvname').first.click()
    p.wait_for_function("!window.__supraState().waiting.includes('g09')")
    S = p.evaluate('window.__supraState()')
    assert any('g09' in t['seats'] for t in S['tables']) and S['waiting'] == ['g10']
    p.click('#undo')                                                    # one undoable step, as on the plan
    p.wait_for_function("window.__supraState().waiting.includes('g09')")
    assert not c.errors, c.errors
    c.close()

@test
def list_view_on_a_phone_and_in_georgian(pw, base):
    c, p = open_plan(pw, base, vp=(375, 812), list_view=True)
    assert p.evaluate('document.documentElement.scrollWidth <= innerWidth')
    assert p.evaluate("document.getElementById('listview').scrollWidth <= document.getElementById('listview').clientWidth")
    c.close()
    c, p = open_plan(pw, base, lang='ka', list_view=True)
    assert p.inner_text('[data-view=list]') == 'სია' and p.inner_text('[data-view=plan]') == 'გეგმა'
    assert p.get_attribute('#listview', 'aria-label') == 'სტუმრები მაგიდების მიხედვით'
    c.close()
