"""PDF downloads: the seating plan (plan, per-table lists in number order, then A–Z) and place cards in one file."""
from harness import Ctx, test

# Stand-in for jsPDF (the real one comes from cdnjs): records what the app puts on each page.
FAKE_JSPDF = """window.jspdf={jsPDF:function(o){window.__pdf={pages:[{orientation:o.orientation,images:[]}],props:null};
  this.addPage=(f,orient)=>{window.__pdf.pages.push({orientation:orient,images:[]});return this};
  this.addImage=(url,type,x,y,w,h)=>{window.__pdf.pages[window.__pdf.pages.length-1].images.push({type,x,y,w,h,len:url.length});return this};
  this.setProperties=p=>{window.__pdf.props=p};this.output=()=>new Blob(['%PDF-fake'],{type:'application/pdf'})}};"""
CAPTURE = """window.__downloads=[];HTMLAnchorElement.prototype.click=function(){if(this.download)window.__downloads.push(this.download)};"""

def start(pw, base, **kw):
    c = Ctx(pw, base, session=True, **kw)
    c.ctx.route('**/jspdf.umd.min.js', lambda r: r.fulfill(body=FAKE_JSPDF, content_type='text/javascript'))
    c.ctx.add_init_script(CAPTURE)
    return c

@test
def plan_pdf_has_plan_then_lists(pw, base):
    c = start(pw, base)
    p = c.goto('/edit/ev1', wait='#plan .tbody')
    p.click('#tab-share'); p.evaluate("document.querySelector('details[data-sec=print]').open=true")
    p.click('[data-act=planpdf]'); p.wait_for_function("window.__downloads.length>0", timeout=15000)
    assert p.evaluate("window.__downloads[0]").endswith('.pdf')
    pdf = p.evaluate("window.__pdf")
    assert len(pdf['pages']) >= 3, len(pdf['pages'])            # plan, by table, A–Z
    assert pdf['pages'][0]['orientation'] == 'portrait'          # this plan is taller than wide
    for pg in pdf['pages']:
        assert len(pg['images']) == 1 and pg['images'][0]['len'] > 1000
        im = pg['images'][0]
        assert im['x'] >= 0 and im['x'] + im['w'] <= 595.3 + 0.1 and im['y'] + im['h'] <= 841.9 + 0.1
    assert 'Nino & Giorgi' in pdf['props']['title']
    assert not p.is_disabled('[data-act=planpdf]')
    c.close()

@test
def place_cards_as_one_pdf(pw, base):
    c = start(pw, base)
    p = c.goto('/edit/ev1', wait='#plan .tbody')
    p.click('#tab-share'); p.evaluate("document.querySelector('details[data-sec=print]').open=true")
    p.click('[data-act=cards]'); p.wait_for_selector('#cardspdf', timeout=15000)
    p.click('#cardspdf'); p.wait_for_function("window.__downloads.some(d=>d.endsWith('.pdf'))", timeout=15000)
    pdf = p.evaluate("window.__pdf")
    assert len(pdf['pages']) == 2   # 18 guests, 10 cards a page
    im = pdf['pages'][0]['images'][0]
    assert abs(im['w'] - 595.28) < 1 and abs(im['x']) < 1   # A4 card sheet fills the page edge to edge
    c.close()

@test
def georgian_pdf_names(pw, base):
    c = start(pw, base, extra="localStorage.setItem('supra.lang','ka');")
    p = c.goto('/edit/ev1', wait='#plan .tbody')
    p.click('#tab-share'); p.evaluate("document.querySelector('details[data-sec=print]').open=true")
    assert p.inner_text('[data-act=planpdf]') == 'PDF-ის ჩამოტვირთვა'
    p.click('[data-act=planpdf]'); p.wait_for_function("window.__downloads.length>0", timeout=15000)
    assert p.evaluate("window.__downloads[0]") == 'nino-giorgi-დასხდომის-გეგმა.pdf'
    c.close()

@test
def by_table_lists_come_first_in_number_order(pw, base):
    import copy
    from harness import PLAN
    plan = copy.deepcopy(PLAN)
    g = next(iter(plan['guests']))
    order = [10, 2, 1, 12, 3]
    for n in order:
        gid = 'gx%d' % n
        plan['guests'][gid] = dict(copy.deepcopy(plan['guests'][g]), id=gid, name='Guest %02d' % n)
        plan['tables'].append({'id': 'tx%d' % n, 'name': 'Table %d' % n, 'shape': 'round', 'deco': 'none', 'seats': [gid, None], 'x': n * 400, 'y': 900})
    for x in plan['tables']:
        if x['id'] not in ['tx%d' % n for n in order] and x['shape'] != 'head': x['seats'] = [None] * len(x['seats'])
    ev = [dict(id='ev1', owner='u1', name='x', slug='guestcode1', guest_page=True, data=plan, public_data={},
               lookup_mode='prefix', lookup_pin_hash=None, show_tablemates=False, updated_at='seed')]
    c = start(pw, base, events=ev)
    c.ctx.add_init_script("window.__txt=[];const f=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(s,...a){window.__txt.push(String(s));return f.call(this,s,...a)}")
    p = c.goto('/edit/ev1', wait='#plan .tbody')
    p.click('#tab-share'); p.evaluate("document.querySelector('details[data-sec=print]').open=true")
    p.click('[data-act=planpdf]'); p.wait_for_function("window.__downloads.length>0", timeout=15000)
    txt = p.evaluate("window.__txt")
    heads = [t for t in txt if t.startswith('Table ') or t == 'Head table']
    # the by-table section lists table names as headings, in order; the A–Z section repeats them under names
    first = heads[:heads.index('Table 12') + 1]
    assert first[0] == 'Head table' and first[1:] == ['Table 1', 'Table 2', 'Table 3', 'Table 10', 'Table 12'], first
    i_bt = next(i for i, t in enumerate(txt) if 'by table' in t)
    i_az = next(i for i, t in enumerate(txt) if 'A–Z' in t)
    assert i_bt < i_az, 'tables come before the alphabetical list'
    c.close()
