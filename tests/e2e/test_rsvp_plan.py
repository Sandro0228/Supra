"""RSVP M4: answers flow into the seating plan (meals, extra guests, "can't come" on seats, caterer allergies)."""
import json, copy
from harness import Ctx, test, PLAN
from test_invites import event, invite

ANS = {'members': {'g01': {'coming': True, 'meal': 'fish'}, 'g09': {'coming': False, 'meal': ''}},
       'extras': [{'name': 'Nika Beridze', 'meal': 'kids'}], 'allergies': 'peanuts (Nika)', 'message': 'See you!'}

def answered(**kw):
    d = dict(answer=copy.deepcopy(ANS), state='coming', coming_count=2, answered_at='2026-11-15T10:00:00Z', applied_at=None)
    d.update(kw); return invite(**d)

def planner(pw, base, invites, ev=None, **kw):
    c = Ctx(pw, base, session=True, viewport=(1440, 900), events=[ev or event()], invites=invites, **kw)
    p = c.goto('/edit/ev1', wait='#plan .tbody')
    return c, p

def state(p):
    return p.evaluate("window.__supraState()")

def wait_applied(p):
    p.wait_for_function("()=>JSON.parse(localStorage.getItem('mockdb')).invites.every(i=>!i.answer||i.applied_at)", timeout=8000)

def seat_of(p, gid):
    return p.evaluate("g=>{for(const x of window.__supraState().tables){const i=x.seats.indexOf(g);if(i>=0)return[x.id,i]}return null}", gid)

@test
def answers_are_added_to_the_plan_once(pw, base):
    c, p = planner(pw, base, [answered()])
    wait_applied(p)
    s = state(p)
    assert s['guests']['g01']['meal'] == 'fish'
    extra = [g for g in s['guests'].values() if g['name'] == 'Nika Beridze']
    assert len(extra) == 1 and extra[0]['meal'] == 'kids' and extra[0]['id'] in s['waiting']
    assert s['rsvpExtra'][extra[0]['id']] == {'inv': 'i1', 'name': 'Nika Beridze'}
    assert 'added to the plan' in p.inner_text('body')
    # the answer is applied once: opening the planner again adds nobody twice
    p.wait_for_timeout(1800)
    p = c.goto('/edit/ev1', wait='#plan .tbody'); p.wait_for_timeout(800)
    assert [g['name'] for g in state(p)['guests'].values()].count('Nika Beridze') == 1
    assert not c.errors, c.errors
    c.close()

@test
def undo_takes_the_answers_back_out(pw, base):
    c, p = planner(pw, base, [answered()])
    wait_applied(p)
    p.click('#undo')
    s = state(p)
    assert s['guests']['g01']['meal'] == '' and not any(g['name'] == 'Nika Beridze' for g in s['guests'].values())
    c.close()

@test
def a_changed_answer_is_applied_again(pw, base):
    c, p = planner(pw, base, [answered()])
    wait_applied(p); p.wait_for_timeout(1800)
    p.evaluate("""const d=JSON.parse(localStorage.getItem('mockdb'));const i=d.invites[0];
      i.answer.members.g01.meal='meat';i.answered_at=new Date(Date.now()+1000).toISOString();localStorage.setItem('mockdb',JSON.stringify(d))""")
    p = c.goto('/edit/ev1', wait='#plan .tbody')
    p.wait_for_function("()=>window.__supraState().guests.g01.meal==='meat'", timeout=8000)
    c.close()

@test
def cant_come_is_shown_on_the_seat_and_can_be_unseated(pw, base):
    c, p = planner(pw, base, [answered()])
    wait_applied(p)
    t, i = seat_of(p, 'g09')
    seat = p.locator('.seat[data-t="%s"][data-i="%d"]' % (t, i))
    assert seat.locator('.rsvpbadge').count() == 1 and "(Can't come)" in seat.get_attribute('aria-label')
    t1, i1 = seat_of(p, 'g01')
    assert p.locator('.seat[data-t="%s"][data-i="%d"] .rsvpbadge' % (t1, i1)).count() == 0
    # never in exported or printed plans
    assert 'rsvpbadge' not in p.evaluate("planSVG().inner")
    # the guest's panel names the invitation and its answer
    seat.click(); p.wait_for_selector('#right .invg')
    assert 'Invitation: Beridze family' in p.inner_text('#right .invg') and "Can't come" in p.inner_text('#right .invg')
    p.click('[data-act=close]')
    p.click('#tab-guests')
    assert "1 seated guest said they can't come" in p.inner_text('#left')
    p.click('[data-inv="move-declined"]')
    s = state(p)
    assert seat_of(p, 'g09') is None and 'g09' in s['waiting']
    assert 'moved to Unseated guests' in p.inner_text('body') and p.locator('#left [data-inv="move-declined"]').count() == 0
    c.close()

@test
def household_allergies_reach_the_caterer(pw, base):
    c, p = planner(pw, base, [answered(), invite(id='i2', token='t2', name='Gelashvili family', members=['g10', 'g11'],
                   answer={'members': {'g10': {'coming': False}, 'g11': {'coming': False}}, 'allergies': 'gluten'}, state='declined',
                   answered_at='2026-11-15T10:00:00Z')])
    wait_applied(p)
    p.evaluate("catererModal()"); p.wait_for_selector('.al')
    body = p.inner_text('body')
    assert 'Allergies from invitations' in body and 'Beridze family · peanuts (Nika)' in body
    assert 'gluten' not in body                                  # nobody from that household is coming
    c.close()

@test
def plan_without_invitations_is_unchanged(pw, base):
    c, p = planner(pw, base, [])
    p.wait_for_timeout(600)
    assert p.locator('.rsvpbadge').count() == 0 and 'rsvpExtra' not in state(p)
    assert p.evaluate("window.__mockCalls.filter(c=>c[0]==='update:invites').length") == 0
    c.close()
