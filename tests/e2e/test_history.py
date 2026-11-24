"""Version history (migration 013): the Event panel lists earlier versions; Restore is an undoable change that saves;
restore points are kept before clearing, importing and choosing the other version in a save conflict."""
import json, copy
from harness import Ctx, PLAN, test

def older():
    d = copy.deepcopy(PLAN); d['event']['name'] = 'Old name'
    gid = sorted(d['guests'])[-1]
    del d['guests'][gid]
    for t in d['tables']: t['seats'] = [None if s == gid else s for s in t['seats']]
    d['waiting'] = [w for w in d.get('waiting', []) if w != gid]
    return d

SEED = """(()=>{const d=JSON.parse(localStorage.getItem('mockdb'));d.event_versions=[
  {id:7,event_id:'ev1',saved_at:'2026-11-20T10:00:00Z',reason:'auto',guests:%d,tables:%d,data:%s},
  {id:6,event_id:'ev1',saved_at:'2026-11-19T09:00:00Z',reason:'import',guests:0,tables:1,data:{tables:[{id:'t',name:'Table 1',shape:'rect',deco:'flowers',seats:[null]}],guests:{},waiting:[],rules:[],venue:[],event:{name:'Empty'}}}];
  localStorage.setItem('mockdb',JSON.stringify(d))})();"""

def editor(pw, base, **kw):
    o = older()
    c = Ctx(pw, base, extra=SEED % (len(o['guests']), len(o['tables']), json.dumps(o)), **kw)
    p = c.goto('/edit/ev1', wait='#plan .tbody'); p.wait_for_timeout(250)
    return c, p

def open_history(p):
    if not p.is_visible('#ev-name'): p.click('#tab-event')
    p.wait_for_selector('details[data-sec=history]')
    p.evaluate("document.querySelector('details[data-sec=history]').open=true")
    p.wait_for_selector('.verlist li')

def db(p):
    return json.loads(p.evaluate("localStorage.getItem('mockdb')"))

@test
def history_lists_versions_with_reason_and_counts(pw, base):
    c, p = editor(pw, base)
    open_history(p)
    items = p.locator('.verlist li').all_inner_texts()
    assert len(items) == 2 and 'Saved automatically' in items[0] and 'Before an import' in items[1], items
    assert 'Guests: %d · Tables: %d' % (len(PLAN['guests']) - 1, len(PLAN['tables'])) in items[0]
    assert '20 Nov 2026' in items[0]
    assert p.get_attribute('[data-ver="7"]', 'aria-label').startswith('Restore: ')
    assert not c.errors, c.errors
    c.close()

@test
def restore_is_an_undoable_saved_change(pw, base):
    c, p = editor(pw, base)
    open_history(p)
    p.click('[data-ver="7"]')
    p.wait_for_function("window.__supraState().event.name==='Old name'")
    assert len(p.evaluate("window.__supraState().guests")) == len(PLAN['guests']) - 1
    assert 'Undo brings back' in p.inner_text('body')
    p.wait_for_function("JSON.parse(localStorage.getItem('mockdb')).events[0].data.event.name==='Old name'", timeout=6000)
    assert any(v['reason'] == 'restore' and v['data']['event']['name'] == PLAN['event']['name'] for v in db(p)['event_versions'])
    p.click('#undo')
    assert p.evaluate("window.__supraState().event.name") == PLAN['event']['name']
    p.wait_for_function("JSON.parse(localStorage.getItem('mockdb')).events[0].data.event.name===%s" % json.dumps(PLAN['event']['name']), timeout=6000)
    c.close()

@test
def save_this_version_now(pw, base):
    c, p = editor(pw, base)
    open_history(p)
    p.click('[data-act=ver-save]')
    p.wait_for_function("document.querySelectorAll('.verlist li').length===3")
    assert 'Saved by you' in p.locator('.verlist li').first.inner_text()
    c.close()

@test
def clearing_the_plan_keeps_a_restore_point(pw, base):
    c, p = editor(pw, base)
    p.click('#tab-guests'); p.wait_for_selector('#find')
    p.evaluate("document.querySelectorAll('#left details').forEach(d=>d.open=true)")
    p.click('[data-act=reset]'); p.click('[data-act=reset-yes]')
    p.wait_for_function("(JSON.parse(localStorage.getItem('mockdb')).event_versions||[]).some(v=>v.reason==='clear')", timeout=4000)
    v = [x for x in db(p)['event_versions'] if x['reason'] == 'clear'][0]
    assert len(v['data']['guests']) == len(PLAN['guests'])
    c.close()

@test
def history_in_georgian(pw, base):
    c, p = editor(pw, base)
    p.evaluate("localStorage.setItem('supra.lang','ka')"); p.reload(); p.wait_for_selector('#plan .tbody')
    open_history(p)
    assert 'ავტომატურად შენახული' in p.inner_text('.verlist') and p.locator('[data-ver]').first.inner_text() == 'აღდგენა'
    c.close()
