"""Plans (migration 011): a free event seats up to 40 guests; an event pass or Pro removes the limit. Adding past the
limit is undone with the "get the pass" panel; publishing and invitations need the pass; nothing is ever lost."""
import json, copy
from harness import Ctx, PLAN, test
from test_rsvp_plan import answered, wait_applied

def ev(plan='free', guests=None, **kw):
    d = copy.deepcopy(PLAN)
    if guests is not None:
        d['guests'] = {('x%d' % i): dict(id='x%d' % i, name='Guest %d' % i, group='', side='', kid=False, meal='',
                       allergies='', look=copy.deepcopy(next(iter(PLAN['guests'].values()))['look'])) for i in range(guests)}
        for t in d['tables']: t['seats'] = [None] * len(t['seats'])
        d['waiting'] = list(d['guests'])
    e = dict(id='ev1', owner='u1', name=PLAN['event']['name'], slug='guestcode1', guest_page=False, data=d, public_data={},
             lookup_mode='exact', lookup_pin_hash=None, show_tablemates=False, updated_at='seed', share_status='draft',
             show_layout=True, plan=plan)
    e.update(kw); return [e]

def editor(pw, base, events, **kw):
    c = Ctx(pw, base, events=events, **kw)
    p = c.goto('/edit/ev1', wait='#plan .tbody'); p.wait_for_timeout(250)
    return c, p

def n_guests(p):
    return p.evaluate("Object.keys(window.__supraState().guests).length")

def bulk(p, names):
    if not p.is_visible('#find'): p.click('#tab-guests'); p.wait_for_selector('#find')
    p.evaluate("document.querySelectorAll('#left details').forEach(d=>d.open=true)")
    p.fill('#bulk', '\n'.join(names)); p.click('[data-act=bulk]')

@test
def free_plan_meter_and_adding_up_to_the_limit(pw, base):
    c, p = editor(pw, base, ev())
    n0 = len(PLAN['guests'])
    p.click('#tab-guests'); p.wait_for_selector('.planmeter')
    assert 'Free plan: %d of 40 guests' % n0 in p.inner_text('.planmeter')
    bulk(p, ['Name %d' % i for i in range(40 - n0)])
    assert n_guests(p) == 40 and p.locator('#modalroot .modal').count() == 0
    assert p.locator('.planmeter.full').count() == 1
    assert not c.errors, c.errors
    c.close()

@test
def adding_past_the_limit_is_undone_with_the_pass_panel(pw, base):
    c, p = editor(pw, base, ev())
    n0 = len(PLAN['guests'])
    bulk(p, ['Name %d' % i for i in range(41 - n0)])                  # one too many: the whole step is undone
    p.wait_for_selector('#modalroot .passcard')
    assert n_guests(p) == n0
    assert '40 guests' in p.inner_text('#mtitle') and '79 ₾' in p.inner_text('.passcard')
    assert p.get_attribute('#modalroot a[href="/pricing"]', 'rel') == 'noopener'
    assert 'Added' not in p.inner_text('body')                          # no "added" toast for an undone step
    p.keyboard.press('Escape')
    assert p.locator('#modalroot .modal').count() == 0
    p.wait_for_timeout(1800)                                            # nothing saved either
    assert len(json.loads(p.evaluate("localStorage.getItem('mockdb')"))['events'][0]['data']['guests']) == n0
    c.close()

@test
def over_the_limit_plans_stay_editable_but_need_the_pass_to_publish(pw, base):
    c, p = editor(pw, base, ev(guests=45))                              # e.g. imported from a file
    p.click('#tab-guests'); p.wait_for_selector('.planmeter.full')
    assert 'Free plan: 45 of 40 guests' in p.inner_text('.planmeter')
    p.click('#tab-event'); p.fill('#ev-name', 'Renamed')                # editing and saving still work
    p.wait_for_function("JSON.parse(localStorage.getItem('mockdb')).events[0].data.event.name==='Renamed'", timeout=6000)
    p.click('#tab-share'); p.wait_for_selector('[data-act=publish]'); p.click('[data-act=publish]')
    p.wait_for_selector('#modalroot .passcard')
    assert 'guest page' in p.inner_text('#modalroot .box')
    assert json.loads(p.evaluate("localStorage.getItem('mockdb')"))['events'][0]['share_status'] == 'draft'
    c.close()

@test
def paid_events_have_no_limit(pw, base):
    c, p = editor(pw, base, ev(plan='pass'))
    p.click('#tab-guests'); p.wait_for_selector('#find')
    assert p.locator('.planmeter').count() == 0
    bulk(p, ['Name %d' % i for i in range(60)])
    assert n_guests(p) == len(PLAN['guests']) + 60 and p.locator('#modalroot .modal').count() == 0
    c.close()

@test
def rsvp_answers_are_never_refused(pw, base):
    e = ev(guests=None)[0]
    # 40 guests incl. the invited household (g01, g09): the extra guest from the answer makes 41
    extra = 40 - len(PLAN['guests'])
    for i in range(extra):
        e['data']['guests']['y%d' % i] = dict(copy.deepcopy(PLAN['guests']['g01']), id='y%d' % i, name='Filler %d' % i)
        e['data']['waiting'].append('y%d' % i)
    c = Ctx(pw, base, events=[e], invites=[answered()])
    p = c.goto('/edit/ev1', wait='#plan .tbody')
    wait_applied(p)
    assert n_guests(p) == 41 and p.locator('#modalroot .passcard').count() == 0
    c.close()

@test
def meter_and_panel_from_the_guests_tab(pw, base):
    c, p = editor(pw, base, ev(), extra="localStorage.setItem('supra.lang','ka');")
    p.click('#tab-guests'); p.wait_for_selector('.planmeter')
    assert 'უფასო გეგმა' in p.inner_text('.planmeter')
    p.click('.planmeter [data-act=getpass]'); p.wait_for_selector('#modalroot .passcard')
    assert 'ღონისძიების პაკეტი' in p.inner_text('#modalroot .box')
    c.close()

@test
def dashboard_shows_each_events_plan(pw, base):
    evs = ev(plan='free', guests=45) + [dict(ev(plan='pass')[0], id='ev2', slug='s2')]
    c = Ctx(pw, base, events=evs); p = c.goto('/', '.ev')
    pills = p.locator('.pill.plan').all_inner_texts()
    assert 'Free · 45 of 40 guests' in pills and 'Event pass' in pills, pills
    assert p.locator('.pill.plan.over').count() == 1
    c.close()

@test
def pricing_page_in_both_languages(pw, base):
    c = Ctx(pw, base, session=False); p = c.goto('/pricing', '.plans')
    txt = p.inner_text('.plans')
    assert '79 ₾' in txt and '99 ₾' in txt and 'Up to 40 guests' in txt
    assert p.locator('.plan').count() == 3 and p.locator('.plan.best').count() == 1
    p.click('[data-lang=ka]')
    assert 'ღონისძიების პაკეტი' in p.inner_text('.plans') and p.evaluate('document.documentElement.lang') == 'ka'
    assert p.evaluate("document.activeElement.dataset.lang") == 'ka'
    p.click('#theme'); assert p.evaluate("document.documentElement.dataset.theme") in ('dark', 'light')
    assert not c.errors, c.errors
    c.close()
