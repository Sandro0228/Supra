"""Big weddings (R9): plans with hundreds of guests redraw only what changed, keep one Tab stop per table, and the
organiser search finds tables and zooms in. Structural checks, not timings (timings depend on the machine)."""
from harness import Ctx, test
from bigplan import big_event

def editor(pw, base, n=500):
    c = Ctx(pw, base, events=[big_event(n)], viewport=(1440, 900))
    p = c.goto('/edit/ev1', wait='#plan .tbody'); p.wait_for_timeout(300)
    return c, p

MARK = "document.querySelectorAll('#plan > [data-chunk]').forEach(g => g.__old = true)"
OLD = "[...document.querySelectorAll('#plan > [data-chunk]')].filter(g => !g.__old).map(g => g.dataset.chunk)"

@test
def typing_the_event_name_redraws_only_the_title(pw, base):
    c, p = editor(pw, base)
    p.click('#tab-event'); p.wait_for_selector('#ev-name')
    p.evaluate(MARK)
    p.type('#ev-name', ' Zq', delay=20)
    p.wait_for_function("document.querySelector('#plan [data-chunk=title]').textContent.includes('Zq')")
    assert p.evaluate(OLD) == ['title'], p.evaluate(OLD)
    assert not c.errors, c.errors
    c.close()

@test
def selecting_a_seat_redraws_only_its_table(pw, base):
    c, p = editor(pw, base)
    p.evaluate(MARK)
    p.focus('#plan .seat[data-t="bt7"][data-i="0"]'); p.keyboard.press('Enter'); p.wait_for_selector('#right .dhead')
    assert p.evaluate(OLD) == ['t:bt7'], p.evaluate(OLD)
    p.evaluate(MARK)
    p.keyboard.press('Escape'); p.wait_for_timeout(150)
    assert p.evaluate(OLD) == ['t:bt7'], p.evaluate(OLD)
    c.close()

@test
def page_language_is_not_rewritten_on_every_render(pw, base):
    c, p = editor(pw, base, n=100)
    p.evaluate("window.__langMut = 0; new MutationObserver(() => window.__langMut++).observe(document.documentElement, {attributes: true, attributeFilter: ['lang']})")
    p.click('#tab-guests'); p.wait_for_selector('#find'); p.click('#tab-event'); p.wait_for_selector('#ev-name')
    assert p.evaluate("window.__langMut") == 0
    p.click('[data-lang=ka]'); p.wait_for_timeout(100)
    assert p.evaluate("window.__langMut") == 1 and p.evaluate("document.documentElement.lang") == 'ka'
    c.close()

@test
def one_tab_stop_per_table_and_arrows_between_seats(pw, base):
    c, p = editor(pw, base)
    tables = p.evaluate("document.querySelectorAll('#plan .tbody').length")
    assert p.evaluate("document.querySelectorAll('#plan .seat[tabindex=\"0\"]').length") == tables
    p.focus('#plan .seat[data-t="bt2"][data-i="0"]')
    p.keyboard.press('ArrowRight')
    assert p.evaluate("[document.activeElement.dataset.t, document.activeElement.dataset.i]") == ['bt2', '1']
    p.keyboard.press('End'); assert p.evaluate("document.activeElement.dataset.i") == '9'
    p.keyboard.press('ArrowRight'); assert p.evaluate("document.activeElement.dataset.i") == '0'     # wraps
    p.keyboard.press('ArrowLeft'); p.keyboard.press('ArrowUp')
    assert p.evaluate("document.activeElement.dataset.i") == '8'
    assert p.evaluate("document.querySelectorAll('#plan .seat[data-t=\"bt2\"][tabindex=\"0\"]').length") == 1
    # the seat you were on stays the table's Tab stop after a redraw
    p.keyboard.press('Enter'); p.wait_for_selector('#right .dhead'); p.keyboard.press('Escape'); p.wait_for_timeout(150)
    assert p.get_attribute('#plan .seat[data-t="bt2"][data-i="8"]', 'tabindex') == '0'
    assert p.get_attribute('#plan .seat[data-t="bt2"][data-i="0"]', 'tabindex') == '-1'
    c.close()

@test
def search_finds_tables_caps_results_and_zooms_in(pw, base):
    c, p = editor(pw, base, n=1000)
    p.click('#tab-guests'); p.wait_for_selector('#find')
    p.fill('#find', '12'); p.wait_for_selector('#findres [data-gototable]')
    assert p.inner_text('#findres [data-gototable]').startswith('Table 12')
    s0 = p.evaluate("parseFloat(document.getElementById('zpct').textContent)")
    p.click('#findres [data-gototable]'); p.wait_for_timeout(400)
    assert p.evaluate("parseFloat(document.getElementById('zpct').textContent)") > s0 * 2
    p.keyboard.press('Escape'); p.wait_for_timeout(150)                 # closes the table panel
    if not p.is_visible('#find'): p.click('#tab-guests'); p.wait_for_selector('#find')
    p.fill('#find', 'guest'); p.wait_for_timeout(100)
    assert p.locator('#findres button').count() == 50 and 'more' in p.inner_text('#findres')
    # jumping to a guest from the fitted view zooms in to their table
    p.click('#zall'); p.wait_for_timeout(150)
    p.fill('#find', 'Guest 777')
    p.wait_for_selector('#findres [data-goto]'); z0 = p.evaluate("parseFloat(document.getElementById('zpct').textContent)")
    p.click('#findres [data-goto]'); p.wait_for_timeout(400)
    assert p.evaluate("parseFloat(document.getElementById('zpct').textContent)") > z0 * 2
    c.close()
