"""Trash (migration 009): deleting an event moves it to the trash, where it can be restored for 30 days or deleted
for good after typing its name. A trashed event's guest page stops answering and the planner won't open it."""
import json, datetime
from harness import Ctx, PLAN, test

def db(p):
    return json.loads(p.evaluate("localStorage.getItem('mockdb')"))

def trash_one(p):
    p.click('[data-del=ev1]'); p.wait_for_selector('[data-delyes=ev1]')
    assert 'trash' in p.inner_text('.ev .confirm').lower()
    p.click('[data-delyes=ev1]')
    p.wait_for_selector('[data-trashtog]')

@test
def delete_moves_the_event_to_the_trash(pw, base):
    c = Ctx(pw, base); p = c.goto('/', '.ev')
    trash_one(p)
    assert p.locator('.ev').count() == 0
    e = db(p)['events'][0]
    assert e['deleted_at'] and e['share_status'] == 'draft' and e['trash_share_status'] == 'published'
    assert p.evaluate("document.activeElement.hasAttribute('data-trashtog')")
    tog = p.locator('[data-trashtog]')
    assert tog.get_attribute('aria-expanded') == 'false' and not p.is_visible('#trashlist')
    assert '1' in tog.inner_text()
    tog.click()
    assert tog.get_attribute('aria-expanded') == 'true' and p.is_visible('#trashlist')
    assert 'removed for good in 30 days' in p.inner_text('.titem')
    # the guest page and the planner no longer open it (same tab: a new tab would reseed the mock database)
    p.goto(base + '/e/guestcode1'); p.wait_for_timeout(600)
    assert "isn't available" in p.inner_text('body') or 'unavailable' in p.inner_text('body').lower()
    p.goto(base + '/edit/ev1'); p.wait_for_selector('.gnone')
    assert 'in the trash' in p.inner_text('.gnone')
    assert not c.errors, c.errors
    c.close()

@test
def restore_brings_the_event_and_its_guest_page_back(pw, base):
    c = Ctx(pw, base); p = c.goto('/', '.ev')
    trash_one(p)
    p.click('[data-trashtog]'); p.click('[data-restore=ev1]')
    p.wait_for_selector('.ev')
    assert p.locator('[data-trashtog]').count() == 0                  # trash is empty again
    e = db(p)['events'][0]
    assert not e['deleted_at'] and e['share_status'] == 'published'
    assert p.locator('.ev .pill.on').count() == 1
    assert p.evaluate("document.activeElement.getAttribute('href')") == '/edit/ev1'
    p.goto(base + '/e/guestcode1'); p.wait_for_selector('#gq')
    c.close()

@test
def delete_forever_needs_the_typed_name(pw, base):
    c = Ctx(pw, base); p = c.goto('/', '.ev')
    trash_one(p)
    p.click('[data-trashtog]'); p.click('[data-forever=ev1]')
    assert p.evaluate("document.activeElement.id") == 'fvname'
    p.fill('#fvname', 'something else'); p.click('#fvform [type=submit]')
    assert p.get_attribute('#fvname', 'aria-invalid') == 'true' and p.is_visible('#fverr')
    assert len(db(p)['events']) == 1
    p.fill('#fvname', '  ' + PLAN['event']['name'].upper() + ' ')      # case and spaces don't matter
    assert p.locator('#fverr').count() == 0                            # error clears while typing
    p.click('#fvform [type=submit]')
    p.wait_for_function("JSON.parse(localStorage.getItem('mockdb')).events.length === 0")
    p.wait_for_selector('#nform.first')                                # nothing left: first-run panel
    assert p.locator('[data-trashtog]').count() == 0
    c.close()

@test
def keep_cancels_delete_forever(pw, base):
    old = (datetime.datetime.utcnow() - datetime.timedelta(days=29, hours=1)).isoformat() + 'Z'
    ev = dict(id='t1', owner='u1', name='', slug='tt', guest_page=False, data=PLAN, public_data={}, lookup_mode='exact',
              lookup_pin_hash=None, show_tablemates=False, updated_at='u', share_status='draft', show_layout=False,
              deleted_at=old)
    c = Ctx(pw, base, events=[ev]); p = c.goto('/', '[data-trashtog]')
    p.click('[data-trashtog]')
    assert 'removed for good tomorrow' in p.inner_text('.titem')
    p.click('[data-forever=t1]')
    assert 'type: delete' in p.inner_text('#fvform').lower()           # nameless events: type the word
    p.click('[data-fvcancel]')
    assert p.locator('#fvform').count() == 0
    assert p.evaluate("document.activeElement.dataset.forever") == 't1'
    c.close()

@test
def trash_in_georgian(pw, base):
    c = Ctx(pw, base, extra="localStorage.setItem('supra.lang','ka');"); p = c.goto('/', '.ev')
    p.click('[data-del=ev1]'); p.click('[data-delyes=ev1]'); p.wait_for_selector('[data-trashtog]')
    assert 'ნაგავი' in p.inner_text('[data-trashtog]')
    c.close()
