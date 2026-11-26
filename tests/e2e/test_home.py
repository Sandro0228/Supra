"""Signed-in home: greeting, the next wedding up front with one next step, the planner opening on that panel, and the
feast painting frame staying hidden until the picture exists."""
import copy, datetime
from harness import Ctx, PLAN, test

def ev(id='ev1', name='Nino & Giorgi', date=None, data=None, status='published', **kw):
    e = dict(id=id, owner='u1', name=name, event_date=date, slug='s' + id, guest_page=status == 'published',
             data=data if data is not None else copy.deepcopy(PLAN), public_data={}, lookup_mode='prefix', lookup_pin_hash=None,
             show_tablemates=False, updated_at='u', share_status=status, show_layout=True)
    e.update(kw); return e

def day(n): return (datetime.date.today() + datetime.timedelta(days=n)).isoformat()

def home(pw, base, evs):
    c = Ctx(pw, base, events=evs); p = c.goto('/', '.home')
    return c, p

@test
def greeting_and_the_nearest_wedding_come_first(pw, base):
    c, p = home(pw, base, [ev('a', 'Later wedding', day(90)), ev('b', 'Ana & Levan', day(10)), ev('c', 'Past one', day(-5))])
    assert p.inner_text('.hello') in ('Good morning', 'Good afternoon', 'Good evening')
    assert p.inner_text('#homeh') == 'Ana & Levan' and 'In 10 days' in p.inner_text('.homewhen')
    assert p.evaluate("document.querySelectorAll('h1').length - document.querySelectorAll('.landing h1').length") == 1   # one h1 on screen
    assert p.evaluate("document.getElementById('yourh').tagName") == 'H2'
    assert p.locator('.dashhead .btn.primary').count() == 0            # the next step is the one primary action
    assert p.is_hidden('.feast')                                        # no picture yet: no empty frame
    assert not c.errors, c.errors
    c.close()

@test
def the_next_step_follows_the_plan(pw, base):
    empty = copy.deepcopy(PLAN); empty['guests'] = {}
    for t in empty['tables']: t['seats'] = [None] * len(t['seats'])
    one_free = copy.deepcopy(PLAN)
    gid = next(s for t in one_free['tables'] for s in t['seats'] if s)
    for t in one_free['tables']: t['seats'] = [None if s == gid else s for s in t['seats']]
    cases = [(ev(data=empty), 'Start with your guest list', '?panel=guests'),
             (ev(data=one_free), "1 guest doesn't have a seat yet", '/edit/ev1'),
             (ev(status='draft'), 'Publish the guest page', '?panel=share'),
             (ev(), 'Add the wedding date', '?panel=event'),
             (ev(date=day(30)), 'Everything is ready', None)]
    for e, text, link in cases:
        c, p = home(pw, base, [e])
        assert text in p.inner_text('.nextstep'), (text, p.inner_text('.nextstep'))
        if link: assert p.get_attribute('.nextstep a.btn.primary', 'href').endswith(link), p.get_attribute('.nextstep a', 'href')
        else: assert p.locator('.nextstep [data-copy]').count() == 1
        c.close()

@test
def next_step_link_opens_the_planner_on_that_panel(pw, base):
    c, p = home(pw, base, [ev(status='draft', date=day(30))])
    p.click('.nextstep a.btn'); p.wait_for_selector('#plan .tbody')
    p.wait_for_selector('#left[role=tabpanel]')
    assert p.get_attribute('#tab-share', 'aria-selected') == 'true'
    c.close()

@test
def home_in_georgian(pw, base):
    c = Ctx(pw, base, events=[ev(date=day(30))], extra="localStorage.setItem('supra.lang','ka');")
    p = c.goto('/', '.home')
    assert p.inner_text('.hello') in ('დილა მშვიდობისა', 'გამარჯობა', 'საღამო მშვიდობისა')
    assert 'ყველაფერი მზადაა' in p.inner_text('.nextstep')
    c.close()
