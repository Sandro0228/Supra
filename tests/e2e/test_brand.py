"""Logo files and their use on each page."""
import os, re
from harness import Ctx, test
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
rd = lambda p: open(os.path.join(ROOT, p)).read()

@test
def logo_variants_differ_only_where_intended(pw, base):
    light, dark = rd('brand/supra-logo.svg'), rd('brand/supra-logo-dark.svg')
    assert 'viewBox="206 129 1573 550"' in light and '#3B2923' in light and '#C6AA78' in light
    assert re.sub(r'<desc[^<]*</desc>', '', dark) == re.sub(r'<desc[^<]*</desc>', '', light).replace('#3B2923', '#FAF8F3')
    em = rd('brand/supra-emblem.svg')
    # every emblem coordinate sits left of the wordmark, which starts at x≈722
    xs = [float(x) for x in re.findall(r'(-?\d+\.\d+) -?\d+\.\d+', ''.join(re.findall(r' d="([^"]+)"', em)))]
    assert xs and max(xs) < 700, max(xs)
    vb = [float(v) for v in re.search(r'viewBox="([^"]+)"', em).group(1).split()]
    assert abs(vb[2] - vb[3]) < 0.01, 'emblem viewBox must be square'

@test
def pages_show_the_right_logo_and_icons_load(pw, base):
    for scheme, want in [('light', 'supra-logo.svg'), ('dark', 'supra-logo-dark.svg')]:
        c = Ctx(pw, base, session=False, color_scheme=scheme)
        p = c.goto('/', wait='#sform')
        vis = p.evaluate("[...document.querySelectorAll('header .brandimg')].filter(i=>getComputedStyle(i).display!=='none').map(i=>i.src.split('/').pop())")
        assert vis == [want], vis
        for href in p.evaluate("[...document.querySelectorAll('link[rel~=icon],link[rel=apple-touch-icon]')].map(l=>l.href)"):
            assert p.request.get(href).status == 200, href
        p.goto(base + '/e/guestcode1'); p.wait_for_selector('.gpowered')
        assert p.locator('.gpowered a').count() == 0, 'guest branding must not link to the organiser dashboard'
        c.close()
    c = Ctx(pw, base, session=True)
    p = c.goto('/edit/ev1', wait='#plan .tbody')
    assert p.get_attribute('#backlink', 'aria-label') == 'Supra — My events' and p.inner_text('#backtxt') == 'My events'
    assert p.get_attribute('#backlink', 'href') == '/'
    assert p.locator('#canvas .brand').count() == 0, 'no logo over the seating canvas'
    c.close()
