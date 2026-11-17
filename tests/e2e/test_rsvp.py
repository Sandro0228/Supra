"""RSVP page /r/<token>: one household answers, changes its mind, deadline, privacy, errors, languages and phones."""
import json, copy, datetime
from harness import Ctx, test, PLAN

def iso(hours):
    return (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=hours)).isoformat()

def event(**kw):
    ev = dict(id='ev1', owner='u1', name='x', slug='guestcode1', guest_page=True, data=PLAN, public_data={},
              lookup_mode='prefix', lookup_pin_hash=None, show_tablemates=False, updated_at='seed', share_status='published',
              starts_at='2027-06-12T14:00:00Z', venue_name='Restaurant Iveria', venue_map_url='https://maps.example/iveria',
              rsvp_open=True, rsvp_deadline=None, rsvp_no_deadline=False)
    ev.update(kw); return ev

def invite(**kw):
    i = dict(id='i1', event_id='ev1', token='tokBeridze', name='Beridze family', members=['g01', 'g09'], extra_allowed=1,
             phone='+995555123456', email='beridze@example.com', lang='en', answer=None, revoked=False)
    i.update(kw); return i

def rsvp(pw, base, inv=None, ev=None, vp=(390, 844), **kw):
    c = Ctx(pw, base, session=False, viewport=vp, events=[ev or event()], invites=[inv or invite()], **kw)
    p = c.goto('/r/' + (inv or invite())['token'], wait='#guest:not([hidden]) h1')
    return c, p

def stored(p):
    return p.evaluate("JSON.parse(localStorage.getItem('mockdb')).invites[0]")

def member(p, gid):
    return p.locator('[data-mid="%s"]' % gid)

def choose(p, gid, yes):
    member(p, gid).locator('.rc-yes' if yes else '.rc-no').click()

@test
def household_answers_and_sees_a_summary(pw, base):
    c, p = rsvp(pw, base)
    assert 'Nino & Giorgi' in p.inner_text('.rhead h1') and 'Your invitation' in p.title()
    head = p.inner_text('.rhead')
    assert '12 june 2027, 18:00' in head.lower() and 'Restaurant Iveria' in head, head   # 14:00 UTC is 18:00 in Tbilisi
    assert p.get_attribute('.rvenue a', 'href') == 'https://maps.example/iveria'
    assert 'Beridze family' in p.inner_text('#rformh')
    # nothing chosen yet: the page says whose answer is missing and puts focus there
    p.click('.rsend')
    assert 'ლაშა ბერიძე' in p.inner_text('#rerr')
    assert p.evaluate("document.activeElement.name") == 'c-g01'
    assert p.evaluate("window.__mockCalls.filter(c=>c[0]==='rsvp_answer').length") == 0
    choose(p, 'g01', True)
    assert member(p, 'g01').locator('.rmeal').is_visible()
    p.select_option('[data-meal=g01]', 'fish')
    choose(p, 'g09', False)
    assert 'rno' in member(p, 'g09').get_attribute('class') and not member(p, 'g09').locator('.rmeal').is_visible()
    p.click('[data-xadd]'); p.fill('[data-xname="0"]', '  Nika  Beridze ')
    assert p.locator('[data-xadd]').count() == 0 and "everyone" in p.inner_text('.rextras')
    p.fill('#rall', 'peanuts'); p.fill('#rmsg', 'Congratulations!')
    p.click('.rsend'); p.wait_for_selector('#rdone')
    assert "We'll save 2 seats" in p.inner_text('#rdoneh')
    s = p.inner_text('#rdone')
    assert 'Fish' in s and 'Nika Beridze' in s and 'peanuts' in s and 'Congratulations!' in s, s
    assert p.evaluate("document.activeElement.id") == 'rdone'
    a = stored(p)['answer']
    assert a['members'] == {'g01': {'coming': True, 'meal': 'fish'}, 'g09': {'coming': False, 'meal': ''}}, a
    assert a['extras'] == [{'name': 'Nika Beridze', 'meal': ''}], a
    assert not c.errors, c.errors
    c.close()

@test
def page_holds_only_this_household(pw, base):
    c, p = rsvp(pw, base, inv=invite(members=['g06']))
    dump = p.evaluate("JSON.stringify(window.__supraState())+document.getElementById('guest').innerHTML.replace(/data:image[^\"]*/g,'')")
    assert 'მარიამ ტაბატაძე' in dump
    for bad in ['SECRET', '+995', 'example.com', 'ლაშა', 'ნინო', 'Neighbour', 'guestcode1']:
        assert bad not in dump, bad
    assert 'fish' not in json.dumps(p.evaluate("window.__supraState()")), 'private meal from the plan reached the page'
    c.close()

@test
def household_changes_its_mind(pw, base):
    ans = {'members': {'g01': {'coming': True, 'meal': 'meat'}, 'g09': {'coming': True, 'meal': ''}}, 'extras': [], 'allergies': '', 'message': ''}
    c, p = rsvp(pw, base, inv=invite(answer=ans))
    assert "We'll save 2 seats" in p.inner_text('#rdoneh')
    assert 'until 11 June 2027, 18:00' in p.inner_text('#rdone')       # 24 h before the start, Tbilisi time
    p.click('[data-rchange]')
    assert member(p, 'g01').locator('input[value=yes]').is_checked() and p.input_value('[data-meal=g01]') == 'meat'
    # cancelling keeps the old answer
    choose(p, 'g01', False); p.click('[data-rcancel]')
    assert "We'll save 2 seats" in p.inner_text('#rdoneh')
    p.click('[data-rchange]')
    choose(p, 'g01', False); choose(p, 'g09', False)
    assert p.inner_text('.rsend') == 'Save changes'
    p.click('.rsend'); p.wait_for_selector('#rdone')
    assert 'Thank you for letting us know' in p.inner_text('#rdoneh')
    assert p.locator('.rfaces .rno').count() == 2
    p.click('[data-rchange]'); choose(p, 'g09', True); p.click('.rsend'); p.wait_for_selector('#rdone')
    assert "We'll save 1 seat." in p.inner_text('#rdoneh')
    assert stored(p)['answer']['members']['g09']['coming'] is True
    c.close()

@test
def answers_close_at_the_deadline(pw, base):
    ans = {'members': {'g01': {'coming': True, 'meal': ''}, 'g09': {'coming': False, 'meal': ''}}, 'extras': [], 'allergies': '', 'message': ''}
    c, p = rsvp(pw, base, inv=invite(answer=ans), ev=event(starts_at=iso(23)))
    assert 'Answers are closed' in p.inner_text('#rdone') and p.locator('[data-rchange]').count() == 0
    assert "We'll save 1 seat." in p.inner_text('#rdoneh')
    c.close()
    c, p = rsvp(pw, base, ev=event(starts_at=iso(23)))
    assert 'Answers are closed' in p.inner_text('.rclosed') and p.locator('#rform').count() == 0
    c.close()
    # the couple moved the deadline later, or switched it off
    c, p = rsvp(pw, base, ev=event(starts_at=iso(23), rsvp_no_deadline=True))
    assert p.locator('#rform').count() == 1 and p.locator('#rform > .rnote').count() == 0
    c.close()
    # closed while the page was open: the server's answer wins
    c, p = rsvp(pw, base, ev=event(starts_at=iso(30)))
    p.evaluate("const d=JSON.parse(localStorage.getItem('mockdb'));d.events[0].rsvp_open=false;localStorage.setItem('mockdb',JSON.stringify(d))")
    choose(p, 'g01', True); choose(p, 'g09', True); p.click('.rsend')
    p.wait_for_selector('.rclosed')
    assert stored(p)['answer'] is None
    c.close()

@test
def inactive_link_explains_itself(pw, base):
    c = Ctx(pw, base, session=False, viewport=(390, 844), events=[event()], invites=[invite(revoked=True)])
    p = c.goto('/r/tokBeridze', wait='#guest:not([hidden]) h1')
    assert 'no longer active' in p.inner_text('#guest')
    p = c.goto('/r/unknownToken123', wait='#guest:not([hidden]) h1')
    assert 'no longer active' in p.inner_text('#guest')
    c.close()

@test
def failures_keep_what_was_typed(pw, base):
    c, p = rsvp(pw, base, cfg={'rsvp': 'net'})
    choose(p, 'g01', True); choose(p, 'g09', True)
    p.fill('#rmsg', 'See you!'); p.click('.rsend')
    p.wait_for_function("document.getElementById('rerr').textContent.length>0")
    assert "wasn't sent" in p.inner_text('#rerr') and p.input_value('#rmsg') == 'See you!'
    assert member(p, 'g01').locator('input[value=yes]').is_checked()
    c.close()
    c, p = rsvp(pw, base, cfg={'rsvp': 'rate'})
    choose(p, 'g01', True); choose(p, 'g09', True); p.click('.rsend')
    p.wait_for_function("document.getElementById('rerr').textContent.length>0")
    assert 'Too many changes' in p.inner_text('#rerr')
    c.close()

@test
def extra_guest_needs_a_name(pw, base):
    c, p = rsvp(pw, base)
    choose(p, 'g01', True); choose(p, 'g09', True)
    p.click('[data-xadd]'); p.click('.rsend')
    assert "guest's name" in p.inner_text('#rerr') and p.evaluate("document.activeElement.dataset.xname") == '0'
    p.click('[data-xdel="0"]')
    assert p.locator('[data-xadd]').count() == 1
    p.click('.rsend'); p.wait_for_selector('#rdone')
    assert stored(p)['answer']['extras'] == []
    c.close()

@test
def georgian_invitation_and_language_switch(pw, base):
    c, p = rsvp(pw, base, inv=invite(lang='ka'))
    assert p.evaluate('document.documentElement.lang') == 'ka'
    assert '12 ივნისი, 2027, 18:00' in p.inner_text('.rhead') and 'მოვა' in p.inner_text('#rform')
    assert member(p, 'g01').locator('.rc-yes').inner_text() == 'მოვა'; choose(p, 'g01', True); p.fill('#rmsg', 'გილოცავთ!')
    p.click('[data-glang=en]')
    assert p.evaluate('document.documentElement.lang') == 'en' and 'Coming' in p.inner_text('#rform')
    assert p.input_value('#rmsg') == 'გილოცავთ!' and member(p, 'g01').locator('input[value=yes]').is_checked()
    c.close()

@test
def rsvp_fits_phones_and_is_labelled(pw, base):
    for w in (320, 390):
        c, p = rsvp(pw, base, vp=(w, 700), is_mobile=True, has_touch=True)
        p.click('[data-xadd]')
        assert p.evaluate("document.documentElement.scrollWidth") <= w, w
        assert p.evaluate("Math.min(...[...document.querySelectorAll('.rchoice span')].map(e=>e.getBoundingClientRect().height))") >= 44
        bad = p.evaluate("""[...document.querySelectorAll('button')].filter(b=>!b.getAttribute('type')||!(b.getAttribute('aria-label')||b.textContent.trim())).map(b=>b.outerHTML.slice(0,80))""")
        assert not bad, bad
        assert p.locator('fieldset.rpick legend').count() == 2
        assert p.evaluate("[...document.querySelectorAll('#rform input,#rform select,#rform textarea')].every(e=>e.closest('label'))")
        c.close()

@test
def add_to_calendar_downloads_an_event_file(pw, base):
    ans = {'members': {'g01': {'coming': True, 'meal': ''}, 'g09': {'coming': True, 'meal': ''}}, 'extras': [], 'allergies': '', 'message': ''}
    c, p = rsvp(pw, base, inv=invite(answer=ans))
    with p.expect_download() as d:
        p.click('[data-rics]')
    body = open(d.value.path(), encoding='utf-8').read()
    assert 'DTSTART:20270612T140000Z' in body and 'SUMMARY:Nino & Giorgi' in body and 'LOCATION:Restaurant Iveria' in body, body
    assert d.value.suggested_filename.endswith('.ics')
    c.close()
