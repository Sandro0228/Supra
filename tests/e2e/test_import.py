"""Guest import (R10): a preview before anything changes, column mapping, duplicates (skip / update / add again),
seats, the free limit, undo, and Georgian text in CSV (UTF-8 with or without BOM, UTF-16, comma/semicolon/tab)."""
import json, copy, subprocess, os
from harness import Ctx, PLAN, test, ROOT

def editor(pw, base, events=None, **kw):
    c = Ctx(pw, base, events=events, **kw)
    p = c.goto('/edit/ev1', wait='#plan .tbody'); p.wait_for_timeout(250)
    return c, p

def open_import(p):
    if not p.is_visible('#find'): p.click('#tab-guests'); p.wait_for_selector('#find')
    p.evaluate("document.querySelectorAll('#left details').forEach(d=>d.open=true)")
    p.click('[data-act=import]'); p.wait_for_selector('#xfile', state='attached')

def upload(p, name, data, mime='text/csv'):
    p.set_input_files('#xfile', files=[{'name': name, 'mimeType': mime, 'buffer': data}])
    p.wait_for_selector('#xprev .imstats, #xprev .msg.err, #xinfo:not(:empty)')

def S(p): return p.evaluate("window.__supraState()")
def names(p): return sorted(g['name'] for g in S(p)['guests'].values())

def strings():
    out = subprocess.run(['node', '-e', "global.window={};eval(require('fs').readFileSync('i18n.js','utf8'));console.log(JSON.stringify(window.SUPRA_I18N))"],
                         cwd=ROOT, capture_output=True, text=True, check=True).stdout
    return json.loads(out)

def empty_event():
    d = copy.deepcopy(PLAN)
    head = [t for t in d['tables'] if t.get('shape') == 'head']
    keep = {s for t in head for s in t['seats'] if s}
    d['guests'] = {k: v for k, v in d['guests'].items() if k in keep}
    d['tables'] = head; d['waiting'] = []; d['rules'] = []
    return [dict(id='ev1', owner='u1', name='x', slug='guestcode1', guest_page=True, data=d, public_data={},
                 lookup_mode='prefix', lookup_pin_hash=None, show_tablemates=False, updated_at='seed',
                 share_status='published', show_layout=True)]

@test
def georgian_csv_without_bom_preview_then_import(pw, base):
    c, p = editor(pw, base)
    open_import(p)
    csv = 'სახელი,მაგიდა,ჯგუფი,კვება\r\n"ნიკა ლომიძე",,"ლომიძეები, ქუთაისი",თევზი\r\nანა გელაშვილი,,,\r\n,,,\r\n'.encode('utf-8')
    n0 = len(S(p)['guests'])
    upload(p, 'guests.csv', csv)
    assert len(S(p)['guests']) == n0                                     # nothing changes before Import
    assert '2 guests in the file' in p.inner_text('.imstats')
    assert 'ნიკა ლომიძე' in p.inner_text('.imtab') and 'ლომიძეები, ქუთაისი' in p.inner_text('.imtab')
    assert p.eval_on_selector('[data-imcol="0"]', 'e=>e.value') == 'name' and p.eval_on_selector('[data-imcol="3"]', 'e=>e.value') == 'meal'
    assert p.inner_text('#xgo') == 'Import 2 guests'
    p.click('#xgo'); p.wait_for_selector('#modalroot .modal', state='detached')
    g = [x for x in S(p)['guests'].values() if x['name'] == 'ნიკა ლომიძე'][0]
    assert g['meal'] == 'fish' and g['group'] == 'ლომიძეები, ქუთაისი' and g['id'] in S(p)['waiting']
    assert 'Undo takes it back' in p.inner_text('body')
    p.click('#undo'); assert len(S(p)['guests']) == n0
    assert not c.errors, c.errors
    c.close()

@test
def utf16_tab_and_semicolon_files_with_seats(pw, base):
    c, p = editor(pw, base, events=empty_event())
    open_import(p)
    txt = 'Name\tTable\tSeat\r\nლაშა\t5\t3\r\nთეო\t5\t1\r\n'
    upload(p, 'guests.txt', b'\xff\xfe' + txt.encode('utf-16le'), 'text/plain')
    assert 'ლაშა' in p.inner_text('.imtab')
    p.click('#xgo'); p.wait_for_selector('#modalroot .modal', state='detached')
    t5 = [x for x in S(p)['tables'] if x['name'] == 'Table 5'][0]
    by = {S(p)['guests'][g]['name']: i for i, g in enumerate(t5['seats']) if g}
    assert by == {'ლაშა': 2, 'თეო': 0}, by                              # seat numbers are kept
    open_import(p)
    upload(p, 'eu.csv', '﻿Name;Table\nმარიამი;5\n'.encode('utf-8'))
    p.click('#xgo'); p.wait_for_selector('#modalroot .modal', state='detached')
    t5 = [x for x in S(p)['tables'] if x['name'] == 'Table 5'][0]
    assert S(p)['guests'][t5['seats'][1]]['name'] == 'მარიამი'          # first free seat
    c.close()

@test
def georgian_round_trip_with_supras_own_headings(pw, base):
    ka = strings()['ka']
    cols = [ka[k] for k in ('colName', 'colTable', 'colSeat', 'colGroup', 'colSide', 'colMeal', 'colChild', 'colAllergies')]
    rows = [cols, ['ნათია ხუციშვილი', 'მაგიდა 2', 4, 'ხუციშვილები', ka['bride'], ka['veg'], '', 'თხილი'],
            ['ლუკა ხუციშვილი', 'მაგიდა 2', 1, 'ხუციშვილები', ka['groom'], ka['kidsMenu'], ka['yes'], '']]
    csv = '\n'.join(','.join('"%s"' % str(v).replace('"', '""') for v in r) for r in rows).encode('utf-8')
    c, p = editor(pw, base, events=empty_event(), extra="localStorage.setItem('supra.lang','ka');")
    open_import(p); upload(p, 'export.csv', csv)
    assert [p.eval_on_selector('[data-imcol="%d"]' % i, 'e=>e.value') for i in range(8)] == \
        ['name', 'table', 'seat', 'group', 'side', 'meal', 'kid', 'allergies']
    p.click('#xgo'); p.wait_for_selector('#modalroot .modal', state='detached')
    s = S(p); g = {x['name']: x for x in s['guests'].values()}
    nino, luka = g['ნათია ხუციშვილი'], g['ლუკა ხუციშვილი']
    assert (nino['side'], nino['meal'], nino['allergies'], nino['kid']) == ('bride', 'veg', 'თხილი', False), (nino, [ka['bride'], ka['veg'], ka['kidsMenu'], ka['yes']])
    assert (luka['side'], luka['meal'], luka['kid']) == ('groom', 'kids', True)
    t2 = [x for x in s['tables'] if x['name'] in ('მაგიდა 2', 'Table 2')]
    assert len(t2) == 1 and t2[0]['seats'][3] == nino['id'] and t2[0]['seats'][0] == luka['id']
    c.close()

@test
def guests_already_in_the_plan_skip_update_or_add(pw, base):
    a, b = [PLAN['guests'][k]['name'] for k in sorted(PLAN['guests'])[:2]]
    csv = ('Name,Meal\n%s,vegan\n%s,\nNew Person,\nNew Person,\n' % (a, b)).encode('utf-8')
    c, p = editor(pw, base)
    n0 = len(S(p)['guests'])
    open_import(p); upload(p, 'again.csv', csv)
    st = p.inner_text('.imstats')
    assert '2 are already in your plan' in st and '1 name appears twice' in st, st
    assert p.locator('.imtab tr.dup').count() == 2 and p.inner_text('#xgo') == 'Import 2 guests'
    p.check('input[name=xdupes][value=update]')
    assert p.inner_text('#xgo') == 'Import 2 guests' and 'Updates the guest' in p.inner_text('.imtab')
    assert p.evaluate("document.activeElement.value") == 'update'      # focus stays on the choice
    p.click('#xgo'); p.wait_for_selector('#modalroot .modal', state='detached')
    assert len(S(p)['guests']) == n0 + 2 and [g for g in S(p)['guests'].values() if g['name'] == a][0]['meal'] == 'vegan'
    assert 'updated 2' in p.inner_text('body')
    open_import(p); upload(p, 'again.csv', csv)
    p.check('input[name=xdupes][value=add]')
    assert p.inner_text('#xgo') == 'Import 4 guests'
    c.close()

@test
def wrong_column_guess_can_be_corrected(pw, base):
    c, p = editor(pw, base, events=empty_event())
    open_import(p)
    upload(p, 'notes.csv', 'Guest,Notes\nდათო,კაკალი\n'.encode('utf-8'))
    assert p.eval_on_selector('[data-imcol="1"]', 'e=>e.value') == ''           # "Notes" isn't guessed
    p.select_option('[data-imcol="1"]', 'allergies')
    assert p.evaluate("document.activeElement.dataset.imcol") == '1'
    p.select_option('[data-imcol="0"]', '')                                  # no name column: can't import
    assert p.locator('#xgo').count() == 0 and 'Choose which column has the names' in p.inner_text('#xprev')
    p.select_option('[data-imcol="0"]', 'name')
    p.click('#xgo'); p.wait_for_selector('#modalroot .modal', state='detached')
    assert [g for g in S(p)['guests'].values() if g['name'] == 'დათო'][0]['allergies'] == 'კაკალი'
    c.close()

@test
def headless_file_first_text_column_is_names(pw, base):
    c, p = editor(pw, base, events=empty_event())
    open_import(p); upload(p, 'plain.csv', '3,ქეთი\n3,გიორგი\n'.encode('utf-8'))
    assert p.eval_on_selector('[data-imcol="0"]', 'e=>e.value') == 'table' and p.eval_on_selector('[data-imcol="1"]', 'e=>e.value') == 'name'
    assert '2 guests in the file' in p.inner_text('.imstats')
    c.close()

@test
def free_plan_limit_is_shown_before_importing(pw, base):
    ev = copy.deepcopy(empty_event()); ev[0]['plan'] = 'free'
    c, p = editor(pw, base, events=ev)
    open_import(p)
    upload(p, 'many.csv', ('Name\n' + '\n'.join('Guest %d' % i for i in range(45))).encode('utf-8'))
    assert 'free plan has room for 40' in p.inner_text('#xprev .msg.err') and p.is_disabled('#xgo')
    c.close()

@test
def excel_files_go_through_the_spreadsheet_library(pw, base):
    c = Ctx(pw, base, events=empty_event())
    rows = [['Name', 'Table'], ['ელენე', 7], ['Irakli', 7]]
    stub = "window.XLSX={read:()=>({SheetNames:['s'],Sheets:{s:{}}}),utils:{sheet_to_json:()=>%s}};window.__loaded=window.__loaded||{};" % json.dumps(rows, ensure_ascii=False)
    c.ctx.route('**/xlsx.full.min.js', lambda r: r.fulfill(body=stub, content_type='text/javascript'))
    p = c.goto('/edit/ev1', wait='#plan .tbody')
    open_import(p)
    upload(p, 'guests.xlsx', b'PK\x03\x04fake', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    assert '2 guests in the file' in p.inner_text('.imstats')
    p.click('#xgo'); p.wait_for_selector('#modalroot .modal', state='detached')
    t7 = [x for x in S(p)['tables'] if x['name'] == 'Table 7'][0]
    assert sorted(S(p)['guests'][g]['name'] for g in t7['seats'] if g) == ['Irakli', 'ელენე']
    c.close()
