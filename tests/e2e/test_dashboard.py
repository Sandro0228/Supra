"""Signed in, "Your events": event cards with seating progress and countdown; the new-event panel opens on demand,
or straight away when there are no events yet."""
from harness import Ctx, PLAN, test

@test
def event_card_shows_progress_status_and_actions(pw, base):
    c = Ctx(pw, base); p = c.goto('/', '.dashhead')
    p.wait_for_selector('.ev')
    assert p.locator('.ev').count() == 1 and p.locator('.events.one').count() == 1
    n = len(PLAN['guests']); seated = sum(1 for x in PLAN['tables'] for s in x['seats'] if s)
    bar = p.locator('.ev [role=progressbar]')
    assert bar.get_attribute('aria-valuenow') == str(min(seated, n)) and bar.get_attribute('aria-valuemax') == str(n)
    assert p.inner_text('.ev .mono').strip() == 'N & G'
    assert p.locator('.ev .pill.on').count() == 1                     # fixture event is published
    assert p.locator('.ev [data-copy]').count() == 1
    assert p.get_attribute('.ev .evact a.btn.primary', 'href') == '/edit/ev1'
    assert not p.is_visible('#nform')                                  # create panel only on demand
    c.close()

@test
def new_event_panel_opens_closes_and_creates(pw, base):
    c = Ctx(pw, base); p = c.goto('/', '.dashhead')
    p.click('[data-newopen]'); p.wait_for_selector('#nform')
    assert p.evaluate("document.activeElement.id") == 'nname'
    p.click('[data-newclose]'); assert not p.is_visible('#nform')
    assert p.evaluate("document.activeElement.hasAttribute('data-newopen')")
    p.click('[data-newopen]'); p.click('#nform [type=submit]')
    assert p.get_attribute('#nname', 'aria-invalid') == 'true'          # name is required
    c.close()

@test
def first_run_shows_the_create_panel(pw, base):
    c = Ctx(pw, base, events=[]); p = c.goto('/', '.dashhead')
    p.wait_for_selector('#nform.first')
    assert p.locator('[data-newopen]').count() == 0 and p.locator('[data-newclose]').count() == 0
    c.close()

@test
def countdown_and_no_date(pw, base):
    import datetime, copy, json
    soon = (datetime.date.today() + datetime.timedelta(days=1)).isoformat()
    evs = []
    for i, d in enumerate([soon, None]):
        evs.append(dict(id='e%d' % i, owner='u1', name='Ana & Levan', event_date=d, slug='s%d' % i, guest_page=False,
                        data=copy.deepcopy(PLAN), public_data={}, lookup_mode='prefix', lookup_pin_hash=None,
                        show_tablemates=False, updated_at='u%d' % i, share_status='draft', show_layout=True))
    c = Ctx(pw, base, events=evs); p = c.goto('/', '.dashhead'); p.wait_for_selector('.ev')
    txt = p.locator('.ev .count').all_inner_texts()
    assert 'Tomorrow' in txt and 'No date yet' in txt, txt
    assert p.locator('.ev [data-copy]').count() == 0                   # drafts have no guest link
    c.close()

@test
def cards_show_when_last_edited_and_free_seats(pw, base):
    import datetime, copy
    now = datetime.datetime.now(datetime.timezone.utc)
    evs = []
    for i, days in enumerate([0, 1, 3, 60]):
        evs.append(dict(id='e%d' % i, owner='u1', name='Wedding %d' % i, event_date=None, slug='s%d' % i, guest_page=False,
                        data=copy.deepcopy(PLAN), public_data={}, lookup_mode='prefix', lookup_pin_hash=None,
                        show_tablemates=False, updated_at=(now - datetime.timedelta(days=days)).isoformat(),
                        share_status='draft', show_layout=True))
    c = Ctx(pw, base, events=evs); p = c.goto('/', '.ev'); p.wait_for_selector('.ev .edited')
    txt = p.locator('.ev .edited').all_inner_texts()
    assert txt[:3] == ['Edited today', 'Edited yesterday', 'Edited 3 days ago'], txt
    assert txt[3].startswith('Edited ') and str((now - datetime.timedelta(days=60)).year) in txt[3], txt
    free = sum(1 for x in PLAN['tables'] for s in x['seats'] if not s)
    prog = p.inner_text('.ev .progtxt')
    assert (('%d free seat' % free) in prog) if free else ('free' not in prog), prog
    p.click('[data-lang=ka]')
    assert p.locator('.ev .edited').first.inner_text() == 'შეიცვალა დღეს'
    c.close()

@test
def card_without_a_readable_edit_time_shows_nothing(pw, base):
    c = Ctx(pw, base); p = c.goto('/', '.ev')                          # the fixture's updated_at is 'seed'
    assert p.locator('.ev .edited').count() == 0
    c.close()
