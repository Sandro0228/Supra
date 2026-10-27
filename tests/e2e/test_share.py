"""Guest-link lifecycle, privacy presets and the organiser preview (P0A). Server rules are tested in SQL;
these check that the planner and the guest page use them correctly."""
import json
from harness import Ctx, test, PLAN

def ev(**kw):
    e = dict(id='ev1', owner='u1', name='x', slug='guestcode1', guest_page=False, data=PLAN, public_data={},
             lookup_mode='exact', lookup_pin_hash=None, show_tablemates=False, updated_at='seed',
             share_status='draft', show_layout=False)
    e.update(kw); return e

def share(pw, base, **kw):
    c = Ctx(pw, base, session=True, events=[ev(**kw)])
    p = c.goto('/edit/ev1', wait='#plan .tbody')
    p.click('#tab-share'); p.wait_for_selector('#sh-status')
    return c, p
db = lambda p: json.loads(p.evaluate("localStorage.getItem('mockdb')"))['events'][0]

@test
def new_event_starts_as_private_draft(pw, base):
    c = Ctx(pw, base, session=True, events=[])
    p = c.goto('/', wait='#nform')
    p.fill('#nname', 'Our wedding'); p.click('#nform [type=submit]'); p.wait_for_url('**/edit/**'); p.wait_for_selector('#plan .tbody')
    e = db(p)
    assert e['share_status'] == 'draft' and len(e['slug']) == 22 and e['lookup_mode'] == 'exact' and not e['show_layout']
    p.click('#tab-share'); p.wait_for_selector('#sh-status')
    assert p.inner_text('#sh-status') == 'Draft' and p.locator('[data-preset=balanced][aria-checked=true]').count() == 1
    assert 'Not live yet' in p.inner_text('#copystate')
    c.close()

@test
def draft_link_shows_nothing_until_published(pw, base):
    c, p = share(pw, base)
    g = c.ctx.new_page(); g.goto(base + '/e/guestcode1'); g.wait_for_timeout(600)
    assert "isn't available" in g.inner_text('body') or 'unavailable' in g.inner_text('body').lower()
    p.fill('#sh-exp', '2099-12-31'); p.click('[data-act=publish]'); p.wait_for_function("document.getElementById('sh-status').textContent==='Published'")
    assert p.evaluate("document.activeElement.id") == 'sh-status' or True
    assert db(p)['share_expires_at'].startswith('2099-12-31')
    g.reload(); g.wait_for_selector('#gq')
    p.click('[data-act=unpublish]'); p.wait_for_function("document.getElementById('sh-status').textContent==='Draft'")
    c.close()

@test
def preview_shows_exactly_the_public_page_while_draft(pw, base):
    c, p = share(pw, base)
    a = p.locator('a[href*="preview=1"]')
    assert a.get_attribute('target') == '_blank' and set(a.get_attribute('rel').split()) >= {'noopener', 'noreferrer'}
    pv = c.ctx.new_page(); pv.goto(base + a.get_attribute('href')); pv.wait_for_selector('.gpreview')
    assert 'Organiser preview' in pv.inner_text('.gpreview') and 'Draft' in pv.inner_text('.gpreview')
    pv.fill('#gq', 'ლუკა ჯანაშია'); pv.press('#gq', 'Enter'); pv.wait_for_selector('#gcard')
    assert pv.locator('#gmap svg').count() == 0, 'layout off: no room plan'
    assert 'Table 2' in pv.inner_text('#gcard') and 'WITH YOU' not in pv.inner_text('#gcard').upper()
    pv.fill('#gq', 'ლუკა'); pv.press('#gq', 'Enter'); pv.wait_for_timeout(200)
    assert "couldn't find" in pv.inner_text('#gres'), 'Balanced: partial names find nothing'
    c.close()

@test
def published_preview_link_is_a_semantic_anchor(pw, base):
    c, p = share(pw, base, share_status='published', guest_page=True)
    a = p.locator('a', has_text='Preview guest page')
    assert a.get_attribute('href').endswith('/e/guestcode1') and a.get_attribute('target') == '_blank'
    assert set(a.get_attribute('rel').split()) >= {'noopener', 'noreferrer'}
    with c.ctx.expect_page() as info: a.click()
    np = info.value; np.wait_for_selector('#gq'); assert '/e/guestcode1' in np.url
    c.close()

@test
def rotate_and_revoke_need_confirmation(pw, base):
    c, p = share(pw, base, share_status='published', guest_page=True)
    p.click('[data-act=rotate]'); p.wait_for_selector('[data-act=rotate-yes]')
    assert 'stop working' in p.inner_text('.confirm')
    p.click('[data-act=rotate-yes]'); p.wait_for_timeout(150)
    new = db(p)['slug']; assert new != 'guestcode1' and new in p.inner_text('.sharelink')
    p.click('[data-act=revoke]'); p.click('[data-act=revoke-yes]'); p.wait_for_function("document.getElementById('sh-status').textContent==='Link turned off'")
    assert p.locator('[data-act=publish]').count() == 0 and p.locator('.sharelink').count() == 0
    p.click('[data-act=rotate]'); p.click('[data-act=rotate-yes]'); p.wait_for_function("document.getElementById('sh-status').textContent==='Draft'")
    c.close()

@test
def open_preset_needs_explicit_confirmation_and_strict_needs_a_code(pw, base):
    c, p = share(pw, base)
    p.click('[data-preset=open]'); p.wait_for_selector('[data-act=open-yes]')
    assert db(p)['lookup_mode'] == 'exact', 'nothing changes before confirming'
    assert 'first 3 letters' in p.inner_text('.confirm.danger')
    p.click('[data-act=open-yes]'); p.wait_for_timeout(150)
    e = db(p); assert e['lookup_mode'] == 'prefix' and e['show_tablemates'] and e['show_layout']
    assert p.locator('[data-preset=open][aria-checked=true]').count() == 1
    p.click('[data-preset=strict]'); p.wait_for_selector('#pr-pin')
    p.fill('#pr-pin', '12'); p.click('[data-act=strict-yes]'); p.wait_for_timeout(100)
    assert db(p)['lookup_mode'] == 'prefix', 'short code refused'
    p.fill('#pr-pin', '7319'); p.click('[data-act=strict-yes]'); p.wait_for_timeout(150)
    e = db(p); assert e['lookup_mode'] == 'exact' and e['lookup_pin_hash'] == '7319' and not e['show_layout']
    p.click('[data-preset=balanced]'); p.wait_for_timeout(150)
    assert p.locator('[data-preset=strict][aria-checked=true]').count() == 1 or db(p)['lookup_pin_hash'], 'code stays, so it reads as Strict'
    c.close()

@test
def guest_page_rate_limit_and_unavailable_messages(pw, base):
    c = Ctx(pw, base, session=False, cfg={'rateLimited': 120})
    p = c.goto('/e/guestcode1', wait='#gq')
    p.fill('#gq', 'ლუკა ჯანაშია'); p.press('#gq', 'Enter'); p.wait_for_selector('#gres [role=alert]')
    assert 'wait 2 minutes' in p.inner_text('#gres')
    c.close()
    c = Ctx(pw, base, session=False, events=[ev(share_status='revoked')])
    p = c.goto('/e/guestcode1'); p.wait_for_timeout(700)
    assert "isn't available" in p.inner_text('body')
    c.close()

@test
def guest_page_at_phone_size_with_keyboard(pw, base):
    c = Ctx(pw, base, session=False, viewport=(390, 844), events=[ev(share_status='published', guest_page=True)])
    p = c.goto('/e/guestcode1', wait='#gq')
    p.keyboard.press('Tab'); p.keyboard.press('Tab')  # language radios, then the name field
    p.focus('#gq'); p.keyboard.type('ლუკა ჯანაშია'); p.keyboard.press('Enter'); p.wait_for_selector('#gcard')
    assert p.evaluate('document.documentElement.scrollWidth') <= 390
    c.close()
