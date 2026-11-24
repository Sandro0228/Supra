"""Two tabs or devices (risk R8, migration 010): a save never overwrites a plan that was saved elsewhere meanwhile.
With unsaved changes here the organiser chooses which version to keep; without, the tab quietly loads the newer plan."""
import json, copy
from harness import Ctx, PLAN, test

def ev(version=1):
    return [dict(id='ev1', owner='u1', name=PLAN['event']['name'], slug='guestcode1', guest_page=True,
                 data=copy.deepcopy(PLAN), public_data={}, lookup_mode='prefix', lookup_pin_hash=None,
                 show_tablemates=False, updated_at='2026-11-24T10:00:00Z', share_status='published', show_layout=True,
                 version=version)]

def editor(pw, base, **kw):
    c = Ctx(pw, base, events=ev(), **kw)
    p = c.goto('/edit/ev1', wait='#plan .tbody'); p.wait_for_timeout(250)
    return c, p

def db_ev(p):
    return json.loads(p.evaluate("localStorage.getItem('mockdb')"))['events'][0]

# Another tab or device saves a new plan name (the server bumps the version).
SAVE_ELSEWHERE = """(()=>{const d=JSON.parse(localStorage.getItem('mockdb'));const e=d.events[0];
  e.data.event.name='Other device';e.version++;e.updated_at=new Date().toISOString();
  localStorage.setItem('mockdb',JSON.stringify(d))})()"""

def edit_name(p, v):
    p.click('#tab-event'); p.wait_for_selector('#ev-name'); p.fill('#ev-name', v)

@test
def save_after_another_device_asks_and_keep_mine_wins(pw, base):
    c, p = editor(pw, base)
    p.evaluate(SAVE_ELSEWHERE)
    edit_name(p, 'Mine')
    p.wait_for_selector('#modalroot [data-cf=theirs]', timeout=6000)
    assert p.evaluate("document.activeElement.dataset.cf") == 'theirs'
    assert db_ev(p)['data']['event']['name'] == 'Other device'          # nothing overwritten
    assert 'Not saved' in p.inner_text('#savestate')
    p.click('[data-cf=mine]')
    p.wait_for_function("JSON.parse(localStorage.getItem('mockdb')).events[0].data.event.name==='Mine'", timeout=6000)
    assert db_ev(p)['version'] == 3 and p.locator('#modalroot .modal').count() == 0
    p.wait_for_function("document.getElementById('savestate').dataset.state==='ok'", timeout=6000)
    assert not c.errors, c.errors
    c.close()

@test
def use_saved_version_then_undo_brings_mine_back(pw, base):
    c, p = editor(pw, base)
    p.evaluate(SAVE_ELSEWHERE)
    edit_name(p, 'Mine')
    p.wait_for_selector('#modalroot [data-cf=theirs]', timeout=6000)
    p.click('[data-cf=theirs]')
    assert p.evaluate("window.__supraState().event.name") == 'Other device'
    assert db_ev(p)['data']['event']['name'] == 'Other device' and db_ev(p)['version'] == 2
    assert p.evaluate("localStorage.getItem('supra.draft.ev1')") is None
    p.click('#undo')
    assert p.evaluate("window.__supraState().event.name") == 'Mine'
    p.wait_for_function("JSON.parse(localStorage.getItem('mockdb')).events[0].data.event.name==='Mine'", timeout=6000)
    c.close()

@test
def closing_the_question_keeps_both_versions_until_save(pw, base):
    c, p = editor(pw, base)
    p.evaluate(SAVE_ELSEWHERE)
    edit_name(p, 'Mine')
    p.wait_for_selector('#modalroot [data-cf=theirs]', timeout=6000)
    p.keyboard.press('Escape')
    assert p.locator('#modalroot .modal').count() == 0
    p.fill('#ev-name', 'Mine again'); p.wait_for_timeout(2200)       # autosave does not overwrite or nag
    assert db_ev(p)['data']['event']['name'] == 'Other device' and p.locator('#modalroot .modal').count() == 0
    assert p.is_visible('#save') and 'changed elsewhere' in p.inner_text('#savestate')
    p.click('#save')
    p.wait_for_selector('#modalroot [data-cf=mine]', timeout=6000)
    p.click('[data-cf=mine]')
    p.wait_for_function("JSON.parse(localStorage.getItem('mockdb')).events[0].data.event.name==='Mine again'", timeout=6000)
    c.close()

@test
def coming_back_without_changes_loads_the_newer_plan(pw, base):
    c, p = editor(pw, base)
    p.evaluate(SAVE_ELSEWHERE)
    p.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
    p.wait_for_function("window.__supraState().event.name==='Other device'", timeout=6000)
    assert p.locator('#modalroot .modal').count() == 0
    assert p.evaluate("document.getElementById('undo').disabled")      # undo can't bring back a stale plan
    edit_name(p, 'After')                                              # and saving continues on the new version
    p.wait_for_function("JSON.parse(localStorage.getItem('mockdb')).events[0].data.event.name==='After'", timeout=6000)
    assert db_ev(p)['version'] == 3
    c.close()

@test
def coming_back_with_unsaved_changes_asks(pw, base):
    c, p = editor(pw, base)
    p.evaluate(SAVE_ELSEWHERE)
    edit_name(p, 'Mine')
    p.evaluate("document.dispatchEvent(new Event('visibilitychange'))")   # before the 1.5 s autosave
    p.wait_for_selector('#modalroot [data-cf=mine]', timeout=3000)
    assert db_ev(p)['data']['event']['name'] == 'Other device'
    c.close()

@test
def old_draft_on_this_device_asks_on_open(pw, base):
    draft = copy.deepcopy(PLAN); draft['event']['name'] = 'Draft from yesterday'
    js = "localStorage.setItem('supra.draft.ev1', %s);" % json.dumps(json.dumps({'base': 0, 'data': draft}))
    c = Ctx(pw, base, events=ev(version=4), extra=js)
    p = c.goto('/edit/ev1', wait='#modalroot [data-cf=theirs]')
    assert 'Guests: %d' % len(PLAN['guests']) in p.inner_text('.cfcmp')
    p.wait_for_timeout(1800)
    assert db_ev(p)['version'] == 4                                     # nothing saved while asking
    p.click('[data-cf=theirs]')
    assert p.evaluate("window.__supraState().event.name") == PLAN['event']['name']
    assert p.evaluate("localStorage.getItem('supra.draft.ev1')") is None
    c.close()

@test
def conflict_question_in_georgian(pw, base):
    c, p = editor(pw, base, extra="localStorage.setItem('supra.lang','ka');")
    p.evaluate(SAVE_ELSEWHERE)
    edit_name(p, 'ჩემი')
    p.wait_for_selector('#modalroot [data-cf=theirs]', timeout=6000)
    assert 'სხვაგან შეიცვალა' in p.inner_text('#mtitle')
    c.close()
