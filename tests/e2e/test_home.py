"""Signed-in home: greeting, the next wedding up front with one next step, the planner opening on that panel, and the
feast painting frame staying hidden until the picture exists."""
import copy, datetime, json
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

@test
def card_checklist_ring_and_open_steps(pw, base):
    c, p = home(pw, base, [ev(status='draft')])                        # guests seated, not published, no date
    assert p.get_attribute('.ev .ring', 'aria-label') == '2 of 4 steps done'
    assert p.locator('.ev .cklist li.done').count() == 2
    links = p.eval_on_selector_all('.ev .cklist a', 'as => as.map(a => [a.textContent, a.getAttribute("href")])')
    assert links == [['Guest page published', '/edit/ev1?panel=share'], ['Wedding date', '/edit/ev1?panel=event']], links
    assert p.locator('.ev .rsvpline').count() == 0                     # no invitations yet: no replies line
    assert not c.errors, c.errors
    c.close()
    c, p = home(pw, base, [ev(date=day(30))])
    assert p.get_attribute('.ev .ring', 'aria-label') == '4 of 4 steps done'
    assert p.locator('.ev .ck.all').count() == 1 and p.locator('.ev .cklist a').count() == 0
    c.close()

def inv(id, state, n=0, event='ev1', revoked=False):
    return dict(id=id, event_id=event, token='t' + id, name='H' + id, members=[], extra_allowed=0, lang='en', sent=[],
                answer=None, coming_count=n, state=state, revoked=revoked)

@test
def card_shows_invitation_replies(pw, base):
    invs = [inv('1', 'coming', 2), inv('2', 'coming', 3), inv('3', 'declined'), inv('4', 'pending'), inv('5', 'pending'),
            inv('6', 'pending', revoked=True), inv('7', 'coming', 1, event='other')]
    c = Ctx(pw, base, events=[ev(date=day(30))], invites=invs); p = c.goto('/', '.home')
    line = p.locator('.ev .rsvpline')
    assert line.inner_text().split() == ['2', 'coming', '1', "can't", 'come', '2', 'no', 'answer', 'yet'], line.inner_text()
    assert line.get_attribute('href') == '/edit/ev1?panel=invites'
    assert line.get_attribute('aria-label').startswith('Invitation replies: 2 coming, 1 can’t come, 2 no answer yet')
    assert not c.errors, c.errors
    c.close()

@test
def card_checklist_in_georgian(pw, base):
    c = Ctx(pw, base, events=[ev(status='draft')], invites=[inv('1', 'declined')],
            extra="localStorage.setItem('supra.lang','ka');")
    p = c.goto('/', '.home')
    assert p.get_attribute('.ev .ring', 'aria-label') == '4 ნაბიჯიდან შესრულებულია 2'
    assert 'ვერ მოდის' in p.inner_text('.ev .rsvpline')
    c.close()

def log(inv_id, state, n, ago_s, event='ev1', by='guest'):
    at = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(seconds=ago_s)).isoformat()
    return dict(id=ago_s, invite_id=inv_id, event_id=event, at=at, by=by, state_after=state, coming_after=n)

def with_log(entries):
    return "var d=JSON.parse(localStorage.getItem('mockdb'));d.invite_log=%s;localStorage.setItem('mockdb',JSON.stringify(d));" % json.dumps(entries)

@test
def recent_replies_from_guests(pw, base):
    invs = [inv('1', 'coming', 2), inv('2', 'declined'), inv('3', 'coming', 1)]
    invs[0]['name'] = 'Beridze family'
    entries = [log('1', 'coming', 2, 120), log('2', 'declined', 0, 7200), log('3', 'coming', 1, 30, by='couple')]
    c = Ctx(pw, base, events=[ev(date=day(30))], invites=invs, extra=with_log(entries)); p = c.goto('/', '.home')
    items = p.locator('.activity li')
    assert items.count() == 2, p.inner_text('.activity')              # the couple's own edit is left out
    assert items.nth(0).inner_text().startswith('Beridze family: 2 coming') and '2 minutes ago' in items.nth(0).inner_text()
    assert "can't come" in items.nth(1).inner_text() and '2 hours ago' in items.nth(1).inner_text()
    assert items.nth(0).locator('a').get_attribute('href') == '/edit/ev1?panel=invites'
    assert not c.errors, c.errors
    c.close()
    c, p = home(pw, base, [ev(date=day(30))])
    assert p.locator('.activity').count() == 0                         # no replies yet: no section
    c.close()

@test
def quick_actions_under_the_next_step(pw, base):
    c, p = home(pw, base, [ev(status='draft', date=day(30))])
    q = p.eval_on_selector_all('.quick a, .quick button', 'xs => xs.map(x => [x.textContent.trim(), x.getAttribute("href")])')
    assert q == [['Place cards', '/edit/ev1?do=cards'], ['Invitations', '/edit/ev1?panel=invites']], q   # not published: no link to copy
    c.close()
    c, p = home(pw, base, [ev(date=None)])                              # published, next step is the date
    assert p.locator('.quick [data-copy]').count() == 1
    c.close()
    c, p = home(pw, base, [ev(date=day(30))])                           # copying the link is already the next step
    assert p.locator('.quick [data-copy]').count() == 0 and p.locator('.nextstep > [data-copy]').count() == 1
    c.close()

@test
def place_cards_quick_action_opens_the_cards(pw, base):
    c, p = home(pw, base, [ev(status='draft', date=day(30))])
    p.click('.quick a[href$="do=cards"]')
    p.wait_for_selector('#cardpages')
    assert 'do=cards' not in p.url, p.url                               # a reload won't open them again
    assert not c.errors, c.errors
    c.close()
