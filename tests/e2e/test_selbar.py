"""Selection toolbar (redesign step 8): the selected table's quick actions float next to it on the plan."""
from harness import Ctx, test

def editor(pw, base, vp=(1440, 900)):
    c = Ctx(pw, base, viewport=vp)
    p = c.goto('/edit/ev1', wait='#plan .tbody'); p.wait_for_timeout(300)
    return c, p

def S(p): return p.evaluate("window.__supraState()")

@test
def selecting_a_table_shows_its_actions_next_to_it(pw, base):
    c, p = editor(pw, base)
    assert p.is_hidden('#selbar')
    tid = S(p)['tables'][1]['id']
    p.focus('#plan .tbody[data-table="%s"]' % tid); p.keyboard.press('Enter')
    p.wait_for_selector('#selbar:not([hidden])')
    assert p.get_attribute('#selbar', 'role') == 'toolbar' and 'Actions for' in p.get_attribute('#selbar', 'aria-label')
    bar = p.locator('#selbar').bounding_box(); tb = p.locator('#plan .tgrp[data-tg="%s"]' % tid).bounding_box()
    assert abs((bar['x'] + bar['width'] / 2) - (tb['x'] + tb['width'] / 2)) < 4 or bar['x'] <= 16, (bar, tb)   # centred on the table
    assert bar['y'] + bar['height'] <= tb['y'] + 2 or bar['y'] >= tb['y'] + tb['height'] - 2, (bar, tb)    # above or below it
    rot0 = S(p)['tables'][1].get('rot', 0)
    p.click('#selbar [data-rot]')
    assert S(p)['tables'][1]['rot'] == (rot0 + 15) % 360 and p.is_visible('#selbar')
    n = len(S(p)['tables'])
    p.click('#selbar [data-act=dup]')
    assert len(S(p)['tables']) == n + 1 and S(p)['tables'][2]['id'] != tid           # the copy is selected now
    p.keyboard.press('Escape'); p.wait_for_timeout(150)
    assert p.is_hidden('#selbar')
    assert not c.errors, c.errors
    c.close()

@test
def toolbar_follows_the_table_when_scrolling(pw, base):
    c, p = editor(pw, base)
    p.click('#zin'); p.click('#zin'); p.wait_for_timeout(200)
    tid = S(p)['tables'][1]['id']
    p.focus('#plan .tbody[data-table="%s"]' % tid); p.keyboard.press('Enter'); p.wait_for_selector('#selbar:not([hidden])')
    rel = lambda: p.locator('#selbar').bounding_box()['y'] - p.locator('#plan .tgrp[data-tg="%s"]' % tid).bounding_box()['y']
    r0 = rel(); y0 = p.locator('#selbar').bounding_box()['y']
    p.evaluate("document.getElementById('scroller').scrollTop += 25"); p.wait_for_timeout(150)
    assert abs(rel() - r0) < 2 and abs(p.locator('#selbar').bounding_box()['y'] - y0) > 20     # it moved with the table
    c.close()

@test
def phones_use_the_sheet_instead(pw, base):
    c, p = editor(pw, base, vp=(390, 844))
    p.locator('#plan .tbody').first.click(); p.wait_for_timeout(300)
    assert not p.is_visible('#selbar')
    c.close()
