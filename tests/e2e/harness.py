"""Tiny browser-test harness: serves the site with the same routes as vercel.json and swaps in the test double.
Usage: python3 tests/e2e/run_all.py   (needs Python Playwright with Chromium)."""
import http.server, threading, re, os, json, socketserver, traceback
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
MOCK = open(os.path.join(os.path.dirname(__file__), 'mock-supabase.js')).read()
PLAN = json.load(open(os.path.join(os.path.dirname(__file__), 'fixture-plan.json')))
CONFIG = "window.SUPRA_CONFIG={supabaseUrl:'https://x.supabase.co',supabaseAnonKey:'k'}"

class H(http.server.SimpleHTTPRequestHandler):
    def __init__(s, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def do_GET(s):
        p = s.path.split('?')[0]
        if re.match(r'^/(edit|e)/[\w-]+$', p): s.path = '/app.html'
        elif p == '/app': s.path = '/app.html'
        elif p == '/': s.path = '/index.html' + ('?' + s.path.split('?', 1)[1] if '?' in s.path else '')
        return super().do_GET()
    def log_message(s, *a): pass

def serve():
    srv = socketserver.ThreadingTCPServer(('127.0.0.1', 0), H); srv.daemon_threads = True
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, 'http://127.0.0.1:%d' % srv.server_address[1]

def seed_script(session=True, cfg=None, events=None, extra=''):
    if events is None:
        events = [dict(id='ev1', owner='u1', name=PLAN['event']['name'], slug='guestcode1', guest_page=True, data=PLAN,
                       public_data={}, lookup_mode='prefix', lookup_pin_hash=None, show_tablemates=False, updated_at='seed')]
    return ("if(!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1');localStorage.clear();"
            + ("localStorage.setItem('mocksess','1');" if session else "")
            + "localStorage.setItem('mockcfg',%s);localStorage.setItem('mockdb',%s);%s}" % (
                json.dumps(json.dumps(cfg or {})), json.dumps(json.dumps({'events': events})), extra))

class Ctx:
    def __init__(s, pw, base, viewport=(1440, 900), **kw):
        s.browser = pw.chromium.launch()
        opts = dict(viewport={'width': viewport[0], 'height': viewport[1]})
        for k in ('color_scheme', 'reduced_motion', 'device_scale_factor', 'has_touch', 'is_mobile', 'locale'):
            if k in kw: opts[k] = kw.pop(k)
        s.ctx = s.browser.new_context(**opts)
        s.ctx.route('**/supabase.min.js', lambda r: r.fulfill(body=MOCK, content_type='text/javascript'))
        s.ctx.route('**/config.js', lambda r: r.fulfill(body=CONFIG, content_type='text/javascript'))
        s.ctx.route(re.compile(r'https://(fonts\.googleapis|fonts\.gstatic|cdnjs\.cloudflare)\.com/.*'), lambda r: r.abort())
        s.ctx.add_init_script(seed_script(**kw))
        s.page = s.ctx.new_page(); s.errors = []
        s.page.on('pageerror', lambda e: s.errors.append(str(e)))
        s.base = base
    def goto(s, path, wait=None):
        s.page.goto(s.base + path)
        if wait: s.page.wait_for_selector(wait, timeout=8000)
        return s.page
    def close(s): s.browser.close()

RESULTS = []
def test(fn):
    RESULTS.append(fn); return fn

def run(pw, base):
    failed = 0
    for fn in RESULTS:
        try:
            fn(pw, base); print('  ok  ', fn.__name__)
        except Exception as e:
            failed += 1; print('  FAIL', fn.__name__, '-', e); traceback.print_exc(limit=2)
    return failed
