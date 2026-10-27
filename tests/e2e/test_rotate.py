"""Rotate view: turns the picture in 90° steps for this viewer only; the saved plan never changes."""
from harness import Ctx, test
from test_arrange import editor, state
from test_guest import search

def table_box(p, tid):
    return p.evaluate("""id=>{const r=document.querySelector(`.tbody[data-table="${id}"]`).getBoundingClientRect();return [r.width,r.height,r.x+r.width/2,r.y+r.height/2]}""", tid)

@test
def rotate_view_turns_picture_not_plan(pw, base):
    c, p = editor(pw, base)
    before = state(p)
    rect = next(x for x in before['tables'] if x['shape'] == 'rect' and not x.get('rot'))
    w0, h0, _, _ = table_box(p, rect['id'])
    assert w0 > h0
    p.click('#zrot'); p.wait_for_timeout(200)
    assert '90°' in p.inner_text('.toast')
    w1, h1, _, _ = table_box(p, rect['id'])
    assert h1 > w1, 'a long table lies the other way once the view is turned'
    assert state(p)['tables'] == before['tables'], 'turning the view must not move or rotate anything'
    assert p.evaluate("localStorage.getItem('supra.view.ev1')") == '90'
    # labels stay upright
    lbl = p.evaluate("""()=>{const t=[...document.querySelectorAll('#plan text')].find(e=>/Table/.test(e.textContent));const r=t.getBoundingClientRect();return [r.width,r.height]}""")
    assert lbl[0] > lbl[1], lbl
    # survives a reload, and three more turns come back to the start
    p.reload(); p.wait_for_selector('#plan .tbody'); p.wait_for_timeout(200)
    w2, h2, _, _ = table_box(p, rect['id']); assert h2 > w2
    for _ in range(3): p.click('#zrot'); p.wait_for_timeout(120)
    w3, h3, _, _ = table_box(p, rect['id']); assert w3 > h3
    assert c.errors == [], c.errors
    c.close()

@test
def dragging_in_a_turned_view_moves_the_way_the_mouse_goes(pw, base):
    c, p = editor(pw, base)
    p.click('#zrot'); p.wait_for_timeout(200)  # 90° clockwise
    t = state(p)['tables'][1]; tid, x0, y0 = t['id'], t['x'], t['y']
    _, _, cx, cy = table_box(p, tid)
    p.mouse.move(cx, cy); p.mouse.down(); p.mouse.move(cx + 40, cy, steps=5); p.mouse.move(cx + 120, cy, steps=5); p.mouse.up(); p.wait_for_timeout(200)
    _, _, cx2, cy2 = table_box(p, tid)
    assert cx2 - cx > 60 and abs(cy2 - cy) < 15, (cx, cy, cx2, cy2)
    t2 = next(x for x in state(p)['tables'] if x['id'] == tid)
    # screen right in a view turned 90° clockwise is "up" (smaller y) in the saved plan
    assert t2['y'] < y0 - 30 and abs(t2['x'] - x0) <= 10, (x0, y0, t2['x'], t2['y'])
    # arrow keys follow the screen too
    p.focus(f'.tbody[data-table="{tid}"]'); p.keyboard.press('ArrowDown'); p.wait_for_timeout(100)
    t3 = next(x for x in state(p)['tables'] if x['id'] == tid)
    assert t3['x'] == t2['x'] + 10 and t3['y'] == t2['y'], (t2, t3)
    assert c.errors == [], c.errors
    c.close()

@test
def guest_map_can_be_turned(pw, base):
    c = Ctx(pw, base, session=False)
    p = c.goto('/e/guestcode1', wait='#gq')
    search(p, 'ლუკა'); p.wait_for_selector('#gmap svg')
    vb0 = p.get_attribute('#gmap svg', 'viewBox')
    p.click('[data-grot]'); p.wait_for_timeout(150)
    vb1 = p.get_attribute('#gmap svg', 'viewBox')
    assert vb0 != vb1
    assert p.evaluate('document.activeElement.hasAttribute("data-grot")')
    w = p.evaluate('document.documentElement.scrollWidth'); assert w <= 1440
    assert c.errors == [], c.errors
    c.close()
