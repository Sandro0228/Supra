"""Editor: panels as tabs and as a phone sheet, keyboard use, zoom and language switching."""
from harness import Ctx, test

PHONES = [(320, 568), (375, 812), (390, 844), (430, 932)]

def editor(pw, base, vp=(1440, 900), **kw):
    c = Ctx(pw, base, session=True, viewport=vp, **kw)
    p = c.goto('/edit/ev1', wait='#plan .tbody'); p.wait_for_timeout(250)
    return c, p

def active(p):
    return p.evaluate("(()=>{const a=document.activeElement;return a.id||a.getAttribute('data-panel')||a.className.baseVal||a.className})()")

@test
def panels_are_tabs_with_arrow_keys(pw, base):
    c, p = editor(pw, base)
    assert p.get_attribute('#nav', 'role') == 'tablist'
    assert p.locator('#nav [role=tab]').count() == 3
    p.focus('#tab-event'); p.keyboard.press('ArrowRight'); assert active(p) == 'tab-guests'
    p.keyboard.press('End'); assert active(p) == 'tab-share'
    p.keyboard.press('ArrowRight'); assert active(p) == 'tab-event'
    p.keyboard.press('Home'); p.keyboard.press('ArrowLeft'); assert active(p) == 'tab-share'
    p.keyboard.press('Enter'); p.wait_for_selector('#left[role=tabpanel]')
    assert p.get_attribute('#tab-share', 'aria-selected') == 'true'
    assert p.get_attribute('#left', 'aria-labelledby') == 'tab-share'
    # desktop keeps focus where the person is; panel is a side region, not a modal
    assert p.get_attribute('#drawer', 'aria-modal') is None
    p.keyboard.press('Escape'); p.wait_for_timeout(100)
    assert p.is_hidden('#drawer') and active(p) == 'tab-share'
    c.close()

@test
def language_and_style_are_radio_groups(pw, base):
    c, p = editor(pw, base)
    assert p.get_attribute('#lang', 'role') == 'radiogroup'
    p.focus('[data-lang=en]'); p.keyboard.press('ArrowRight'); p.wait_for_timeout(150)
    assert p.evaluate('document.documentElement.lang') == 'ka'
    assert p.get_attribute('[data-lang=ka]', 'aria-checked') == 'true' and active(p) == ''  or p.evaluate("document.activeElement.dataset.lang") == 'ka'
    p.click('#tab-event'); p.wait_for_selector('[data-pal]')
    g = p.locator('[role=radiogroup]:has([data-pal])')
    assert g.count() == 1 and g.get_attribute('aria-label')
    p.focus('[data-pal][aria-checked=true]'); p.keyboard.press('ArrowRight'); p.wait_for_timeout(150)
    assert p.evaluate("document.activeElement.dataset.pal") == 'sage'
    assert p.get_attribute('[data-pal=sage]', 'aria-checked') == 'true'
    c.close()

@test
def every_button_has_a_type_and_a_name(pw, base):
    c, p = editor(pw, base)
    for tab in ['event', 'guests', 'share']:
        p.click('#tab-' + tab); p.wait_for_timeout(100)
        p.evaluate("document.querySelectorAll('details').forEach(d=>d.open=true)")
        bad = p.evaluate("""[...document.querySelectorAll('button')].filter(b=>!b.getAttribute('type')||!(b.getAttribute('aria-label')||b.textContent.trim())).map(b=>b.outerHTML.slice(0,80))""")
        assert not bad, bad
    p.click('.seat >> nth=0'); p.wait_for_selector('#right .dhead')
    p.evaluate("document.querySelectorAll('details').forEach(d=>d.open=true)")
    bad = p.evaluate("""[...document.querySelectorAll('button')].filter(b=>!b.getAttribute('type')||!(b.getAttribute('aria-label')||b.textContent.trim())).map(b=>b.outerHTML.slice(0,80))""")
    assert not bad, bad
    names = p.evaluate("[...document.querySelectorAll('#plan .seat,#plan .tbody,#plan .venue')].map(e=>e.getAttribute('aria-label'))")
    assert all(names) and any('Empty seat' in n or 'Table 1' in n for n in names), names[:5]
    assert p.get_attribute('#scroller', 'role') == 'region' and p.get_attribute('#scroller', 'aria-label')
    c.close()

@test
def keyboard_selects_and_moves_tables(pw, base):
    c, p = editor(pw, base)
    p.focus('#plan .tbody[data-table=t1]')
    x0 = p.evaluate("window.__supraState().tables[1].x")
    p.keyboard.press('ArrowRight'); p.keyboard.press('Shift+ArrowRight')
    assert p.evaluate("window.__supraState().tables[1].x") == x0 + 60
    assert p.evaluate("document.activeElement.dataset.table") == 't1'
    p.keyboard.press('Enter'); p.wait_for_selector('#t-name')
    p.keyboard.press('Escape'); p.wait_for_timeout(100)
    assert p.evaluate("document.activeElement.dataset.table") == 't1'
    c.close()

@test
def phone_sheet_is_modal_and_returns_focus(pw, base):
    for vp in PHONES:
        c, p = editor(pw, base, vp, has_touch=True, is_mobile=True)
        p.click('#tab-guests'); p.wait_for_selector('#drawer[aria-modal=true]')
        assert active(p) == 'dtitle', active(p)
        assert p.evaluate("document.querySelector('#canvas').inert && document.querySelector('.bar').inert")
        box = p.locator('#drawer').bounding_box()
        assert box['y'] >= 0 and box['y'] + box['height'] <= vp[1] + 1, box
        close = p.locator('#drawer [data-act=close]').bounding_box()
        assert close['width'] >= 44 and close['height'] >= 44, close
        assert p.get_attribute('#drawer [data-act=close]', 'aria-label') == 'Close panel'
        # focus stays inside the sheet
        for _ in range(12): p.keyboard.press('Tab')
        assert p.evaluate("document.getElementById('drawer').contains(document.activeElement)")
        p.keyboard.press('Shift+Tab')
        assert p.evaluate("document.getElementById('drawer').contains(document.activeElement)")
        p.click('#backdrop', position={'x': 10, 'y': 10}); p.wait_for_timeout(150)
        assert p.is_hidden('#drawer') and active(p) == 'tab-guests', active(p)
        assert not p.evaluate("document.querySelector('#canvas').inert")
        w = p.evaluate('document.documentElement.scrollWidth')
        assert w <= vp[0], (vp, w)
        c.close()

@test
def zoom_survives_panels_and_has_keyboard_and_fit(pw, base):
    c, p = editor(pw, base)
    width = lambda: p.evaluate("document.querySelector('#plan').getBoundingClientRect().width")
    p.click('#zin'); p.click('#zin'); w0 = width()
    p.click('#tab-event'); p.wait_for_timeout(100); assert abs(width() - w0) < 1
    p.click('[data-act=close]'); p.wait_for_timeout(100); assert abs(width() - w0) < 1
    p.focus('#scroller'); p.keyboard.press('-'); assert width() < w0
    p.keyboard.press('+'); assert abs(width() - w0) < 2
    p.click('#zall'); fit = p.locator('#plan').bounding_box(); sc = p.locator('#scroller').bounding_box()
    assert fit['height'] <= sc['height'] and fit['width'] <= sc['width'], (fit, sc)
    p.click('#zwidth'); assert width() >= fit['width']
    # ctrl + wheel (also what trackpad pinch sends)
    w1 = width(); p.mouse.move(700, 450); p.keyboard.down('Control'); p.mouse.wheel(0, -200); p.keyboard.up('Control'); p.wait_for_timeout(100)
    assert width() > w1
    c.close()

@test
def phone_starts_fit_to_width_and_pinch_zooms(pw, base):
    c, p = editor(pw, base, (390, 844), has_touch=True, is_mobile=True)
    w0 = p.evaluate("document.querySelector('#plan').getBoundingClientRect().width")
    assert w0 > 390, w0  # fit width uses what is in the room, so names are larger than a whole-page fit
    p.evaluate("""(()=>{const el=document.getElementById('scroller');
      const mk=(id,x,y)=>new Touch({identifier:id,target:el,clientX:x,clientY:y});
      el.dispatchEvent(new TouchEvent('touchstart',{touches:[mk(1,150,400),mk(2,250,400)],bubbles:true}));
      el.dispatchEvent(new TouchEvent('touchmove',{touches:[mk(1,100,400),mk(2,300,400)],bubbles:true,cancelable:true}));
      el.dispatchEvent(new TouchEvent('touchend',{touches:[],bubbles:true}));})()""")
    w1 = p.evaluate("document.querySelector('#plan').getBoundingClientRect().width")
    assert w1 > w0 * 1.8, (w0, w1)
    # help button brings the gesture tip back after it was dismissed
    if p.is_visible('#hint'): p.click('[data-act=hintok]')
    assert p.is_hidden('#hint') and active(p) == 'help'
    p.click('#help'); assert p.is_visible('#hint') and p.get_attribute('#help', 'aria-expanded') == 'true'
    c.close()

@test
def language_switch_keeps_search_selection_panel_and_zoom(pw, base):
    c, p = editor(pw, base)
    p.click('#zin'); w0 = p.evaluate("document.querySelector('#plan').getBoundingClientRect().width")
    p.click('#tab-guests'); p.fill('#find', 'მარ')
    p.click('[data-lang=ka]'); p.wait_for_timeout(150)
    assert p.input_value('#find') == 'მარ' and p.get_attribute('#tab-guests', 'aria-selected') == 'true'
    assert abs(p.evaluate("document.querySelector('#plan').getBoundingClientRect().width") - w0) < 1
    assert p.evaluate('document.documentElement.lang') == 'ka' and 'დასხდომის' in p.title()
    assert p.get_attribute('#zin', 'aria-label') == 'გადიდება'
    p.click('.seat >> nth=2'); p.wait_for_selector('#right .dhead')
    sel = p.evaluate("document.querySelector('#dtitle').textContent")
    p.click('[data-lang=en]'); p.wait_for_timeout(150)
    assert p.evaluate("document.querySelector('#dtitle').textContent") == sel
    c.close()

@test
def editor_dark_reduced_motion_and_200_percent(pw, base):
    c, p = editor(pw, base, (720, 450), color_scheme='dark', reduced_motion='reduce')
    assert p.evaluate("getComputedStyle(document.body).backgroundColor") != 'rgb(238, 240, 234)'
    p.click('#tab-share'); p.wait_for_selector('#privacy-controls')
    w = p.evaluate('document.documentElement.scrollWidth'); assert w <= 720, w
    c.close()
