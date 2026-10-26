"""Georgian interface: language choice carries across pages, counters, dates and wording."""
import json, re, subprocess, os
from harness import Ctx, test

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
KA = "localStorage.setItem('supra.lang','ka');"

def strings():
    out = subprocess.run(['node', '-e', "global.window={};eval(require('fs').readFileSync('i18n.js','utf8'));console.log(JSON.stringify(window.SUPRA_I18N))"],
                         cwd=ROOT, capture_output=True, text=True, check=True).stdout
    return json.loads(out)

@test
def every_key_translated_with_same_placeholders(pw, base):
    L = strings()
    assert set(L['en']) == set(L['ka'])
    for k in L['en']:
        assert L['ka'][k].strip(), k
        assert set(re.findall(r'\{\w+\}', L['en'][k])) == set(re.findall(r'\{\w+\}', L['ka'][k])), k
    # informal singular tone only
    formal = [k for k, v in L['ka'].items() if re.search(r'(აირჩიეთ|დააჭირეთ|შეიყვანეთ|ჩაწერეთ|სცადეთ|შეამოწმეთ|გადაამოწმეთ|დაამატეთ|გთხოვთ|თქვენ)', v)]
    assert not formal, formal

@test
def georgian_choice_carries_from_dashboard_to_editor(pw, base):
    c = Ctx(pw, base, session=True, viewport=(1280, 720))
    p = c.goto('/', wait='#nform')
    p.click('[data-lang=ka]'); p.wait_for_timeout(100)
    p.goto(base + '/edit/ev1'); p.wait_for_selector('#plan .tbody')
    assert p.evaluate('document.documentElement.lang') == 'ka'
    assert 'დასხდომის გეგმა' in p.title(), p.title()
    stats = p.inner_text('#stats')
    assert '18 ადგილიდან 18 დაკავებულია' in stats, stats
    p.click('#tab-event'); p.wait_for_selector('#ev-date-txt')
    assert p.inner_text('#ev-date-txt') == '12 ივნისი, 2027'
    txt = p.inner_text('body')
    assert 'June' not in txt and 'Empty seat' not in txt
    assert p.get_attribute('#undo', 'aria-label') == 'ბოლო მოქმედების გაუქმება'
    assert 'ნეფე-პატარძლის მაგიდა' in p.evaluate("document.getElementById('plan').textContent")
    # switching language in the planner is remembered and doesn't touch the saved plan
    p.click('[data-lang=en]'); p.wait_for_timeout(200)
    assert p.evaluate("localStorage.getItem('supra.lang')") == 'en'
    assert p.evaluate("window.__supraState().event.lang") == json.load(open(os.path.join(ROOT, 'tests/e2e/fixture-plan.json')))['event']['lang']
    c.close()

@test
def guest_page_follows_visitor_choice_and_counts_in_georgian(pw, base):
    c = Ctx(pw, base, session=False, extra=KA)
    p = c.goto('/e/guestcode1', wait='#gq')
    assert p.evaluate('document.documentElement.lang') == 'ka'
    assert p.get_attribute('#gq', 'placeholder') == 'შეიყვანე შენი სახელი ან გვარი'
    assert p.inner_text('.gdate') == '12 ივნისი, 2027'
    p.fill('#gq', 'ლუკა'); p.press('#gq', 'Enter'); p.wait_for_selector('#gcard')
    assert 'ადგილი 5' in p.inner_text('#gcard')
    p.click('[data-gagain]'); assert p.input_value('#gq') == '' and p.evaluate("document.activeElement.id") == 'gq'
    p.fill('#gq', 'ზზზზ'); p.press('#gq', 'Enter'); p.wait_for_timeout(200)
    assert 'სტუმარი ვერ მოიძებნა' in p.inner_text('#gres')
    c.close()

@test
def share_sets_guest_page_language_and_clear_plan_wording(pw, base):
    c = Ctx(pw, base, session=True, extra=KA)
    p = c.goto('/edit/ev1', wait='#plan .tbody')
    p.click('#tab-share'); p.wait_for_selector('[data-glangset]')
    p.click('[data-glangset=ka]'); p.wait_for_timeout(100)
    assert p.evaluate("window.__supraState().event.lang") == 'ka'
    assert 'ილუსტრაციები' in p.inner_text('#privacy-controls')
    p.click('#tab-guests'); p.evaluate("document.querySelectorAll('details').forEach(d=>d.open=true)")
    p.click('[data-act=reset]'); q = p.inner_text('.confirm.danger')
    assert 'დარბაზის ყველა ელემენტი' in q and 'ბოლო მოქმედების გაუქმება' in q
    p.click('[data-act=reset-yes]'); p.wait_for_timeout(100)
    assert p.evaluate("window.__supraState().tables.length") == 1
    p.click('#undo'); p.wait_for_timeout(100)
    assert p.evaluate("window.__supraState().tables.length") == 3, 'clearing must be undoable as the message says'
    c.close()
