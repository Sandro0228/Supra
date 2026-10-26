"""PDF downloads: the seating plan (plan + A–Z + per-table lists) and place cards in one file."""
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
    assert len(pdf['pages']) >= 3, len(pdf['pages'])            # plan, A–Z, by table
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
