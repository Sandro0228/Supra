"""Arrange tables (rows, orientation, aisles) and swapping two tables."""
import copy
from harness import Ctx, test, PLAN

def big_plan(n=9):
    plan = copy.deepcopy(PLAN)
    for i in range(3, n + 1):
        plan['tables'].append({'id': 't%d' % i, 'name': 'Table %d' % i, 'shape': 'round' if i % 3 == 0 else 'rect',
                               'deco': 'flowers', 'seats': [None] * 8, 'x': i * 37, 'y': i * 53})
    return plan

def editor(pw, base, plan=None, **kw):
    ev = [dict(id='ev1', owner='u1', name='x', slug='guestcode1', guest_page=True, data=plan or big_plan(), public_data={},
               lookup_mode='prefix', lookup_pin_hash=None, show_tablemates=False, updated_at='seed')]
    c = Ctx(pw, base, session=True, events=ev, **kw)
    p = c.goto('/edit/ev1', wait='#plan .tbody'); p.wait_for_timeout(200)
    return c, p

state = lambda p: p.evaluate("JSON.parse(JSON.stringify(window.__supraState()))")

def boxes(st):
    """Rough footprints of guest tables after arranging, to check rows, columns and gaps."""
    return {x['id']: (x['x'], x['y'], x.get('rot', 0)) for x in st['tables'] if x['shape'] != 'head'}

@test
def arrange_into_rows_with_aisles(pw, base):
    c, p = editor(pw, base)
    before = state(p)
    p.click('#quickadd [data-act=arr-open]'); p.wait_for_selector('.arrprev')
    assert state(p)['tables'] == before['tables'], 'opening the panel must not move anything'
    # 9 guest tables: choose 3 rows -> 3 columns
    while p.inner_text('#left .stepper output') != '3':
        p.click('[data-act="arr-rows%s"]' % ('-' if int(p.inner_text('#left .stepper output')) > 3 else '+'))
    assert '3 rows × 3 columns' in p.inner_text('#left')
    p.click('[data-aisle="row:0"]'); p.click('[data-aisle="col:1"]'); p.click('[data-arr-aisle=xwide]')
    p.click('[data-act=arr-apply]'); p.wait_for_timeout(200)
    st = state(p); b = boxes(st)
    ys = sorted({round(v[1]) for v in b.values()}); xs = sorted({round(v[0]) for v in b.values()})
    assert len(ys) == 3 and len(xs) == 3, (ys, xs)
    # wider gap after row 1 than after row 2, wider after column 2 than after column 1
    assert ys[1] - ys[0] > ys[2] - ys[1] + 100, ys
    assert xs[2] - xs[1] > xs[1] - xs[0] + 100, xs
    head = next(x for x in st['tables'] if x['shape'] == 'head')
    assert head['y'] < min(ys), 'head table stays on top'
    assert all(v[2] == 0 for v in b.values())
    assert st['layout']['rows'] == 3 and st['layout']['rowAisles'] == [0]
    # undo restores the old positions
    p.click('#undo'); p.wait_for_timeout(100)
    assert [(x['x'], x['y']) for x in state(p)['tables']] == [(x['x'], x['y']) for x in before['tables']]
    c.close()

@test
def vertical_rotates_long_tables_and_settings_are_remembered(pw, base):
    c, p = editor(pw, base)
    p.click('#quickadd [data-act=arr-open]'); p.wait_for_selector('.arrprev')
    p.click('[data-arr-orient=vertical]'); p.click('[data-act=arr-apply]'); p.wait_for_timeout(200)
    st = state(p)
    for x in st['tables']:
        if x['shape'] == 'rect': assert x['rot'] == 90, x
        if x['shape'] == 'round': assert x.get('rot', 0) == 0
    # tables never overlap after arranging
    ov = p.evaluate("""(()=>{const r=[...document.querySelectorAll('#plan .tbody')].map(e=>e.getBoundingClientRect());let n=0;
      for(let i=0;i<r.length;i++)for(let j=i+1;j<r.length;j++){const a=r[i],b=r[j];if(a.left<b.right-1&&b.left<a.right-1&&a.top<b.bottom-1&&b.top<a.bottom-1)n++}return n})()""")
    assert ov == 0, ov
    p.click('#quickadd [data-act=arr-open]'); p.wait_for_selector('.arrprev')
    assert p.get_attribute('[data-arr-orient=vertical]', 'aria-checked') == 'true'
    c.close()

@test
def swap_two_tables_by_clicking(pw, base):
    c, p = editor(pw, base)
    t1 = next(x for x in state(p)['tables'] if x['id'] == 't1'); t2 = next(x for x in state(p)['tables'] if x['id'] == 't2')
    p.focus('.tbody[data-table=t1]'); p.keyboard.press('Enter'); p.wait_for_selector('[data-act=swap]')
    p.click('[data-act=swap]'); p.wait_for_selector('#swapbar:not([hidden])')
    assert 'Table 1' in p.inner_text('#swapbar')
    p.focus('.tbody[data-table=t2]'); p.keyboard.press('Enter'); p.wait_for_timeout(150)
    st = state(p); n1 = next(x for x in st['tables'] if x['id'] == 't1'); n2 = next(x for x in st['tables'] if x['id'] == 't2')
    assert (n1['x'], n1['y']) == (t2['x'], t2['y']) and (n2['x'], n2['y']) == (t1['x'], t1['y'])
    assert n1['seats'] == t1['seats'], 'guests stay with their table'
    assert p.is_hidden('#swapbar')
    # Escape cancels a swap
    p.focus('.tbody[data-table=t1]'); p.keyboard.press('Enter'); p.click('[data-act=swap]'); p.keyboard.press('Escape')
    assert p.is_hidden('#swapbar')
    c.close()

@test
def arrange_panel_on_phone_in_georgian(pw, base):
    c, p = editor(pw, base, viewport=(320, 640), has_touch=True, is_mobile=True, extra="localStorage.setItem('supra.lang','ka');")
    p.click('#quickadd [data-act=arr-open]'); p.wait_for_selector('#drawer[aria-modal=true] .arrprev')
    assert p.evaluate('document.documentElement.scrollWidth') <= 320
    assert 'მაგიდების განლაგება' in p.inner_text('#dtitle')
    c.close()
