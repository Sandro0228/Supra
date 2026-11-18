"""Makes the landing-page pictures (landing/{hall,phone,cards}-{en,ka}.webp) from a demo wedding in the real app.
Usage: python3 tools/landing_shots.py   (needs Python Playwright with Chromium, and Pillow)
Re-run it after changing how the hall, the guest page or the place cards look."""
import sys, json, copy
import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tests', 'e2e'))
from harness import serve, seed_script, MOCK, CONFIG, PLAN
from playwright.sync_api import sync_playwright
def shoot(OUT, LANG):
    base_look = list(PLAN['guests'].values())[0]['look']
    F = ['ნინო','ანა','მარიამ','თამარ','ნათია','სალომე','ეკა','ლიკა','თეონა','მაკა','ქეთევან','ელენე','სოფო','ია','ლელა','ნანა']
    M = ['გიორგი','ლევან','დავით','ირაკლი','ლაშა','ზურაბ','ნიკა','ალექსანდრე','გოგა','ბექა','თორნიკე','ვახტანგ','გურამ','ოთარ']
    SUR = ['ბერიძე','კაპანაძე','ლომიძე','ჯაფარიძე','ხუციშვილი','გელაშვილი','აბაშიძე','წერეთელი','ქავთარაძე','მაისურაძე']
    guests, n = {}, 0
    def g(name, side='', group=''):
        nonlocal n
        n += 1; gid = 'd%02d' % n
        guests[gid] = dict(id=gid, name=name, side=side, group=group, kid=False, meal='', allergies='', look=copy.deepcopy(base_look))
        return gid
    head = [g('ლუკა მაისურაძე','groom'), g('გიორგი ბერიძე','groom'), g('ნინო კაპანაძე','bride'), g('ანა ლომიძე','bride')]
    def fill(k, i0):
        out=[]
        for i in range(k):
            j=i0+i
            nm = (F[j % len(F)] if j % 2 else M[j % len(M)]) + ' ' + SUR[(j // 3) % len(SUR)]
            out.append(g(nm, ['bride','groom','both'][j % 3]))
        return out
    tables = [
      dict(id='th', name='Head table', shape='head', deco='flowers', seats=head, x=0, y=130),
      dict(id='t1', name='Table 1', shape='rect', deco='flowers', seats=fill(8, 0), x=-330, y=620),
      dict(id='t2', name='Table 2', shape='rect', deco='greenery', seats=fill(8, 8), x=330, y=620),
      dict(id='t3', name='Table 3', shape='round', deco='mixed', seats=fill(8, 16), x=-330, y=1000),
      dict(id='t4', name='Table 4', shape='round', deco='flowers', seats=fill(8, 24), x=330, y=1000),
    ]
    plan = dict(event=dict(name='Nino & Giorgi', type='wedding', date='2027-06-12', palette='blush', lang=LANG),
                guests=guests, waiting=[], rules=[], tables=tables,
                venue=[dict(id='v1', type='dance', label='', x=0, y=380, w=300, h=170)])
    ev = [dict(id='ev1', owner='u1', name='Nino & Giorgi', slug='guestcode1', guest_page=True, data=plan, public_data={},
               lookup_mode='prefix', lookup_pin_hash=None, show_tablemates=True, updated_at='seed', share_status='published', show_layout=True)]
    JS = """async () => {
      const c = await import('/js/core.js'), st = await import('/js/state.js');
      st.commit(() => {
        const S = window.__supraState();
        for (const g of Object.values(S.guests)) g.look = c.smartLook(g.name, g.group, {r: c.rng(g.name + 'x')});
        const [luka, giorgi, nino, ana] = ['d01','d02','d03','d04'].map(k => S.guests[k]);
        Object.assign(giorgi.look, {outfit:'tuxedo', beard:'short', hair:'sidepart', glasses:'none'});
        Object.assign(nino.look, {outfit:'gown', hair:'bun', glasses:'none'});
        Object.assign(luka.look, {outfit:'suit', outfitColor:'#1E2A3D'});
        Object.assign(ana.look, {outfit:'dress', outfitColor:'#E2A9BA'});
      });
    }"""
    srv, base = serve()
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        cx = b.new_context(viewport={'width': 1500, 'height': 1300}, device_scale_factor=2)
        cx.route('**/supabase.min.js', lambda r: r.fulfill(body=MOCK, content_type='text/javascript'))
        cx.route('**/config.js', lambda r: r.fulfill(body=CONFIG, content_type='text/javascript'))
        cx.add_init_script(seed_script(events=ev, extra="localStorage.setItem('supra.celebrated.ev1','1');localStorage.setItem('supra.lang','%s');" % LANG))
        p = cx.new_page(); errs = []; p.on('pageerror', lambda e: errs.append(str(e)))
        p.goto(base + '/edit/ev1'); p.wait_for_selector('#plan .tbody'); p.wait_for_timeout(1200)
        p.evaluate(JS); p.wait_for_timeout(2500)        # save to the mock database, let the settle animation finish
        p.click('#zall'); p.wait_for_timeout(600)
        p.evaluate("document.querySelectorAll('.float,#hint,.toast').forEach(e=>e.remove())")
        p.locator('#plan').screenshot(path=OUT + '/hall.png')
        p.evaluate("import('/js/files.js').then(f=>f.placeCards())"); p.wait_for_selector('#cardpages img', timeout=20000)
        import base64
        u = p.evaluate("document.querySelector('#cardpages img').src")
        open(OUT + '/cards.png', 'wb').write(base64.b64decode(u.split(',', 1)[1]))
        # the guest's phone: find my seat
        m = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=3, is_mobile=True, has_touch=True)
        m.route('**/supabase.min.js', lambda r: r.fulfill(body=MOCK, content_type='text/javascript'))
        m.route('**/config.js', lambda r: r.fulfill(body=CONFIG, content_type='text/javascript'))
        db = p.evaluate("localStorage.getItem('mockdb')")
        m.add_init_script("if(!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1');localStorage.clear();localStorage.setItem('mockdb',%s);localStorage.setItem('supra.lang','%s')}" % (json.dumps(db), LANG))
        q = m.new_page(); q.on('pageerror', lambda e: errs.append(str(e)))
        q.goto(base + '/e/guestcode1'); q.wait_for_timeout(1500)
        q.screenshot(path=OUT + '/phone_search.png')
        inp = q.locator('input').first; inp.fill('ნინო კაპ'); q.locator('button[type=submit]').first.click(); q.wait_for_timeout(1500)
        q.screenshot(path=OUT + '/phone_typed.png', full_page=True)
        opt = q.locator('#gres button').first
        if opt.count(): opt.click(); q.wait_for_timeout(2000)
        q.screenshot(path=OUT + '/phone_found.png', full_page=True)
        assert not errs, errs
        b.close()


def crop_all(src, lang):
    from PIL import Image
    out = os.path.join(ROOT, 'landing')
    h = Image.open(f'{src}/hall.png').convert('RGB'); W, H = h.size
    h.crop((0, 0, W, int(H * 0.62))).resize((1400, int(H * 0.62 * 1400 / W)), Image.LANCZOS).save(f'{out}/hall-{lang}.webp', 'WEBP', quality=82, method=6)
    ph = Image.open(f'{src}/phone_typed.png').convert('RGB')
    ph.crop((0, 1180, 1170, 1180 + 2420)).resize((600, 1241), Image.LANCZOS).save(f'{out}/phone-{lang}.webp', 'WEBP', quality=84, method=6)
    c = Image.open(f'{src}/cards.png').convert('RGB')
    c.crop((60, 60, 1530, 900)).resize((980, 560), Image.LANCZOS).save(f'{out}/cards-{lang}.webp', 'WEBP', quality=84, method=6)

if __name__ == '__main__':
    import tempfile
    for lang in ('en', 'ka'):
        with tempfile.TemporaryDirectory() as d:
            shoot(d, lang)
            crop_all(d, lang)
            print('landing pictures made:', lang)
