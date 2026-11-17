"""Invitations tab (RSVP M3): event details, invitations from groups, the form, sending links, answers, settings, privacy."""
import json, copy, urllib.parse
from harness import Ctx, test, PLAN

def plan():
    P = copy.deepcopy(PLAN)
    ids = list(P['guests'])
    for g in P['guests'].values():
        g['group'] = ''
    for gid in ('g01', 'g09'):
        P['guests'][gid]['group'] = 'Beridze family'
    for gid in ('g10', 'g11'):
        P['guests'][gid]['group'] = 'Gelashvili family'
    rest = [i for i in ids if i not in ('g01', 'g09', 'g10', 'g11')]
    for gid in rest[:13]:                     # 13 > 12: not a household, one invitation each
        P['guests'][gid]['group'] = 'Colleagues'
    return P

def event(**kw):
    ev = dict(id='ev1', owner='u1', name='x', slug='guestcode1', guest_page=True, data=plan(), public_data={},
              lookup_mode='prefix', lookup_pin_hash=None, show_tablemates=False, updated_at='seed', share_status='published')
    ev.update(kw); return ev

def invite(**kw):
    i = dict(id='i1', event_id='ev1', token='tokBeridze', name='Beridze family', members=['g01', 'g09'], extra_allowed=1,
             phone='+995555123456', email='beridze@example.com', lang='ka', answer=None, state='pending', coming_count=0,
             sent=[], revoked=False, created_at='2026-11-01T10:00:00Z')
    i.update(kw); return i

def open_tab(pw, base, invites=(), ev=None, vp=(1440, 900), **kw):
    c = Ctx(pw, base, session=True, viewport=vp, events=[ev or event()], invites=list(invites), **kw)
    p = c.goto('/edit/ev1', wait='#plan .tbody'); p.wait_for_timeout(200)
    p.click('#tab-invites'); p.wait_for_selector('#left .invstats')
    return c, p

def db(p, key='invites'):
    return p.evaluate("k=>JSON.parse(localStorage.getItem('mockdb'))[k]||[]", key)

def no_new_tabs(p):
    p.evaluate("document.addEventListener('click',e=>{if(e.target.closest('a[data-send]'))e.preventDefault()},true)")

def last_save(p, key):
    p.wait_for_function("k=>window.__mockCalls.some(c=>c[0]==='update'&&k in c[1])", arg=key, timeout=6000)
    return p.evaluate("()=>window.__mockCalls.filter(c=>c[0]==='update').map(c=>c[1]).pop()")

@test
def event_panel_saves_time_venue_and_map(pw, base):
    c = Ctx(pw, base, session=True, viewport=(1440, 900), events=[event()])
    p = c.goto('/edit/ev1', wait='#plan .tbody')
    p.click('#tab-event')
    p.fill('#ev-time', '18:00'); p.press('#ev-time', 'Tab')
    p.fill('#ev-venue', 'Restaurant Iveria'); p.press('#ev-venue', 'Tab')
    p.fill('#ev-map', 'maps.example/iveria'); p.press('#ev-map', 'Tab')
    assert p.get_attribute('#ev-map', 'aria-invalid') == 'true' and 'https://' in p.inner_text('#ev-map-h')
    s = last_save(p, 'starts_at')
    assert s['starts_at'] == '2027-06-12T14:00:00.000Z', s      # 18:00 in Tbilisi
    assert s['venue_name'] == 'Restaurant Iveria' and s['venue_map_url'] is None, s
    p.fill('#ev-map', 'https://maps.example/iveria'); p.press('#ev-map', 'Tab')
    assert p.get_attribute('#ev-map', 'aria-invalid') is None
    p.wait_for_function("()=>window.__mockCalls.some(c=>c[0]==='update'&&c[1].venue_map_url)", timeout=6000)
    assert not c.errors, c.errors
    c.close()

@test
def invitations_from_groups_with_a_preview(pw, base):
    c, p = open_tab(pw, base)
    n_guests = len(plan()['guests'])
    expected = 2 + (n_guests - 4)           # two families, everyone else on their own
    assert p.inner_text('[data-inv="groups"]') == 'Make %d invitations from guest groups' % expected
    p.click('[data-inv="groups"]')
    assert '%d invitations will be made' % expected in p.inner_text('#ip-h')
    assert p.evaluate("document.activeElement.dataset.inv") == 'groups-yes'
    assert len(db(p)) == 0                   # nothing is created before the couple agrees
    p.click('[data-inv="groups-yes"]'); p.wait_for_selector('.invrow')
    rows = db(p)
    assert len(rows) == expected
    fam = [r for r in rows if r['name'] == 'Beridze family'][0]
    assert sorted(fam['members']) == ['g01', 'g09'] and fam['lang'] == 'en' and fam['state'] == 'pending'
    assert not any(r['name'] == 'Colleagues' for r in rows)
    assert p.locator('.invrow').count() == expected and p.locator('[data-inv="groups"]').count() == 0
    assert 'Every guest on your list has an invitation' in p.inner_text('#left')
    assert p.inner_text('.invstat.st-pending b') == str(expected)
    c.close()

@test
def new_invitation_form_and_send_links(pw, base):
    c, p = open_tab(pw, base)
    p.click('[data-inv="new"]')
    assert p.evaluate("document.activeElement.id") == 'if-name'
    p.click('[data-inv="save"]')
    assert 'at least one guest' in p.inner_text('#if-err')
    p.fill('#if-q', 'beridze')                                 # Latin letters find Georgian names
    assert 'ლაშა ბერიძე' in p.inner_text('#if-pick') and 'ნინო' not in p.inner_text('#if-pick')
    p.check('[data-invm="g01"]'); p.check('[data-invm="g09"]')
    assert '2 guests chosen' in p.inner_text('#if-n')
    p.fill('#if-name', 'Beridze family'); p.select_option('#if-extra', '2')
    p.fill('#if-phone', '555 12 34 56'); p.fill('#if-email', 'nope')
    p.click('[data-inv="save"]')
    assert "doesn't look complete" in p.inner_text('#if-err')
    p.fill('#if-email', 'beridze@example.com'); p.click('[data-inv="save"]'); p.wait_for_selector('.invrow')
    r = db(p)[0]
    assert r['members'] == ['g01', 'g09'] and r['extra_allowed'] == 2 and r['phone'] == '555 12 34 56' and r['lang'] == 'en'
    row = p.locator('.invrow').first
    assert 'ლაშა ბერიძე, თეონა ბერიძე' in row.inner_text() and 'may bring 2 more' in row.inner_text() and 'Not sent yet' in row.inner_text()
    wa = row.locator('a[data-send=wa]').get_attribute('href')
    assert wa.startswith('https://wa.me/995555123456?text='), wa
    msg = urllib.parse.unquote(wa.split('text=', 1)[1])
    assert 'Dear Beridze family' in msg and '12 June 2027' in msg and '/r/' + r['token'] in msg, msg
    assert row.locator('a[data-send=sms]').get_attribute('href').startswith('sms:+995555123456?&body=')
    assert row.locator('a[data-send=mail]').get_attribute('href').startswith('mailto:beridze%40example.com?subject=Invitation')
    assert row.locator('a[data-send=viber]').get_attribute('href').startswith('viber://forward?text=')
    no_new_tabs(p)
    row.locator('a[data-send=wa]').click()
    p.wait_for_function("()=>JSON.parse(localStorage.getItem('mockdb')).invites[0].sent.length===1")
    assert db(p)[0]['sent'][0]['via'] == 'wa' and 'Sent via WhatsApp' in p.locator('.invrow').first.inner_text()
    c.close()

@test
def answers_totals_filters_and_recent_changes(pw, base):
    ans = {'members': {'g01': {'coming': True, 'meal': 'fish'}, 'g09': {'coming': True, 'meal': ''}},
           'extras': [{'name': 'Nika Beridze', 'meal': ''}], 'allergies': 'peanuts', 'message': 'Congratulations!'}
    invs = [invite(answer=ans, state='coming', coming_count=3),
            invite(id='i2', token='tokGel', name='Gelashvili family', members=['g10', 'g11'], state='declined', answer={'members': {'g10': {'coming': False}, 'g11': {'coming': False}}}),
            invite(id='i3', token='tokL', name='ლუკა ჯანაშია', members=['g17'])]
    c = Ctx(pw, base, session=True, viewport=(1440, 900), events=[event()], invites=invs,
            extra="const d=JSON.parse(localStorage.getItem('mockdb'));d.invite_log=[{id:1,invite_id:'i1',event_id:'ev1',at:new Date(Date.now()-7200e3).toISOString(),by:'guest',state_before:'pending',state_after:'coming',coming_after:3}];localStorage.setItem('mockdb',JSON.stringify(d));")
    p = c.goto('/edit/ev1', wait='#plan .tbody'); p.click('#tab-invites'); p.wait_for_selector('.invrow')
    assert '3 people coming' in p.inner_text('.dhead')
    assert [p.inner_text('.invstat.st-%s b' % k) for k in ('coming', 'declined', 'pending')] == ['1', '1', '1']
    row = p.locator('[data-inv-row="i1"]').inner_text()
    assert '3 coming' in row and 'Nika Beridze' in row and 'Congratulations!' in row and 'peanuts' in row, row
    p.click('[data-invf="pending"]')
    assert p.locator('.invrow').count() == 1 and 'ლუკა' in p.inner_text('.invlist')
    p.click('[data-invf="all"]'); p.fill('#inv-q', 'gelashvili')
    assert p.locator('.invrow').count() == 1 and 'Gelashvili family' in p.inner_text('.invlist')
    assert p.input_value('#inv-q') == 'gelashvili' and p.evaluate("document.activeElement.id") == 'inv-q'
    p.click('[data-sec="invlog"] summary')
    log = p.inner_text('.invlog')
    assert 'Beridze family' in log and '3 coming' in log and '2 hours ago' in log, log
    c.close()

@test
def edit_new_link_turn_off_and_delete(pw, base):
    c, p = open_tab(pw, base, invites=[invite()])
    p.click('[data-inv="edit"]')
    assert p.input_value('#if-name') == 'Beridze family' and p.is_checked('[data-invm="g01"]')
    p.uncheck('[data-invm="g09"]'); p.click('[data-inv="save"]'); p.wait_for_selector('.invrow')
    assert db(p)[0]['members'] == ['g01']
    p.click('[data-inv="edit"]'); p.click('[data-inv="rotate"]')
    assert 'old link stops working' in p.inner_text('.invform') and db(p)[0]['token'] == 'tokBeridze'
    p.click('[data-inv="rotate-yes"]'); p.wait_for_function("()=>JSON.parse(localStorage.getItem('mockdb')).invites[0].token!=='tokBeridze'")
    p.click('[data-inv="revoke"]'); p.click('[data-inv="revoke-yes"]')
    p.wait_for_function("()=>JSON.parse(localStorage.getItem('mockdb')).invites[0].revoked===true")
    assert p.locator('[data-inv="unrevoke"]').count() == 1
    p.click('[data-inv="cancel"]')
    assert 'Link off' in p.inner_text('.invrow') and p.locator('.invrow a[data-send]').count() == 0
    p.click('[data-inv="edit"]'); p.click('[data-inv="del"]')
    assert "can't be undone" in p.inner_text('.invform')
    p.click('[data-inv="del-yes"]'); p.wait_for_function("()=>JSON.parse(localStorage.getItem('mockdb')).invites.length===0")
    assert p.locator('.invrow').count() == 0 and p.locator('[data-inv="groups"]').count() == 1
    c.close()

@test
def answer_settings_are_saved_with_the_event(pw, base):
    ev = event(); ev['data'] = dict(ev['data']); ev['data']['event'] = dict(ev['data']['event'], time='18:00')
    c, p = open_tab(pw, base, invites=[invite(lang='ka')], ev=ev)
    p.click('[data-sec="invset"] summary')
    assert 'Answers close on 11 June 2027, 18:00' in p.inner_text('[data-sec="invset"]')
    p.check('input[name="rs-dl"][value="custom"]')
    p.fill('#rs-at', '2027-06-01T12:00'); p.press('#rs-at', 'Tab')
    s = last_save(p, 'rsvp_deadline')
    p.wait_for_function("()=>window.__mockCalls.some(c=>c[0]==='update'&&c[1].rsvp_deadline==='2027-06-01T08:00:00.000Z')", timeout=6000)
    p.check('input[name="rs-dl"][value="none"]')
    p.wait_for_function("()=>window.__mockCalls.some(c=>c[0]==='update'&&c[1].rsvp_no_deadline===true)", timeout=6000)
    p.uncheck('#rs-open')
    p.wait_for_function("()=>window.__mockCalls.some(c=>c[0]==='update'&&c[1].rsvp_open===false)", timeout=6000)
    assert 'Answers are closed' in p.inner_text('#left')
    # the couple's own wording, in the invitation's language
    p.fill('#rs-msg-ka', '{name}, გელოდებით! {link}'); p.press('#rs-msg-ka', 'Tab')
    href = urllib.parse.unquote(p.get_attribute('.invrow a[data-send=wa]', 'href'))
    assert 'Beridze family, გელოდებით! ' in href and '/r/tokBeridze' in href, href
    assert p.evaluate("()=>window.__supraState().event.rsvp.msg.ka").startswith('{name}')
    c.close()

@test
def contact_details_can_be_deleted(pw, base):
    c, p = open_tab(pw, base, invites=[invite()])
    p.click('[data-sec="invset"] summary'); p.click('[data-inv="clear"]')
    assert 'Answers stay' in p.inner_text('[data-sec="invset"]') and db(p)[0]['phone']
    p.click('[data-inv="clear-yes"]'); p.wait_for_function("()=>!JSON.parse(localStorage.getItem('mockdb')).invites[0].phone")
    assert db(p)[0]['email'] is None
    assert p.locator('.invrow a[data-send=wa]').get_attribute('href').startswith('https://wa.me/?text=')
    c.close()

@test
def failed_save_keeps_the_form(pw, base):
    c, p = open_tab(pw, base, cfg={'invFail': True})
    p.click('[data-inv="new"]'); p.fill('#if-name', 'Test'); p.fill('#if-q', 'ლაშა'); p.check('[data-invm="g01"]')
    p.click('[data-inv="save"]'); p.wait_for_function("document.getElementById('if-err').textContent.length>0")
    assert "didn't save" in p.inner_text('#if-err') and p.input_value('#if-name') == 'Test' and p.is_checked('[data-invm="g01"]')
    c.close()

@test
def invitations_tab_on_a_phone_in_georgian(pw, base):
    c, p = open_tab(pw, base, invites=[invite()], vp=(390, 844), is_mobile=True, has_touch=True, extra="localStorage.setItem('supra.lang','ka');")
    assert p.locator('#tab-invites').inner_text() == 'მოსაწვევები'
    assert p.evaluate("document.documentElement.scrollWidth") <= 390
    assert p.evaluate("(()=>{const n=document.getElementById('nav');return n.scrollWidth<=n.clientWidth+1})()"), 'tabs overflow'
    assert p.get_attribute('#drawer', 'aria-modal') == 'true'
    bad = p.evaluate("""[...document.querySelectorAll('#left button')].filter(b=>!b.getAttribute('type')||!(b.getAttribute('aria-label')||b.textContent.trim())).map(b=>b.outerHTML.slice(0,80))""")
    assert not bad, bad
    c.close()
