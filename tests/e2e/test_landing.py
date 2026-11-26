"""Landing page: signed out it shows the product (hall, guest phone, place cards) in the chosen language and the
start buttons open the right form; signed in only the event list shows."""
import os
from harness import Ctx, ROOT, test

@test
def landing_shows_product_in_both_languages(pw, base):
    for lang in ('en', 'ka'):
        c = Ctx(pw, base, session=False, extra="localStorage.setItem('supra.lang','%s');" % lang)
        p = c.goto('/', '#sform'); p.wait_for_timeout(200)
        assert p.inner_text('h1').strip(), 'headline is empty'
        assert all(p.evaluate("[...document.querySelectorAll('[data-t]')].map(e=>e.textContent.trim().length>0)"))
        srcs = p.evaluate("[...document.querySelectorAll('img[data-img]')].map(i=>[i.getAttribute('src'), i.alt])")
        assert len(srcs) == 3
        for src, alt in srcs:
            assert src.endswith('-%s.webp' % lang) and alt, (src, alt)
            assert os.path.exists(os.path.join(ROOT, src.lstrip('/'))), src
        assert not p.evaluate("document.documentElement.scrollWidth > innerWidth")
        assert not c.errors, c.errors
        c.close()

@test
def start_buttons_open_sign_up_and_sign_in(pw, base):
    c = Ctx(pw, base, session=False); p = c.goto('/', '#sform')
    p.click('.hero2 [data-start=signup]'); p.wait_for_timeout(100)
    assert p.get_attribute('#tab-signup', 'aria-selected') == 'true' and p.evaluate("document.activeElement.id") == 'email'
    p.click('#hdrstart'); p.wait_for_timeout(100)
    assert p.get_attribute('#tab-signin', 'aria-selected') == 'true'
    c.close()

@test
def signed_in_shows_only_the_event_list(pw, base):
    c = Ctx(pw, base); p = c.goto('/', '.dashhead')
    assert p.evaluate("[...document.querySelectorAll('.landing')].every(e=>e.hidden)")
    assert p.is_hidden('#hdrstart') and p.is_visible('#acctbtn') and p.is_visible('#theme')
    c.close()

@test
def landing_on_a_phone_has_no_sideways_scroll(pw, base):
    for lang in ('en', 'ka'):
        c = Ctx(pw, base, session=False, viewport=(360, 740), is_mobile=True, has_touch=True, extra="localStorage.setItem('supra.lang','%s');" % lang)
        p = c.goto('/', '#sform'); p.wait_for_timeout(200)
        assert not p.evaluate("document.documentElement.scrollWidth > innerWidth"), lang
        top = p.evaluate("[...document.querySelectorAll('header > *')].filter(e=>!e.hidden && e.offsetParent).map(e=>e.getBoundingClientRect().top)")
        assert max(top) - min(top) < 20, ('header wraps', lang, top)
        c.close()
