"""Women's and men's names decide how new guests are drawn; existing drawings can be matched to names."""
import subprocess, os, json
from harness import Ctx, test
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))

def guesses(names):
    js = "global.window={};eval(require('fs').readFileSync('names.js','utf8'));console.log(JSON.stringify(%s.map(n=>window.SupraNames.guess(n))))" % json.dumps(names)
    return json.loads(subprocess.run(['node', '-e', js], cwd=ROOT, capture_output=True, text=True, check=True).stdout)

@test
def names_are_recognised(pw, base):
    women = ['ნინო ბერიძე', 'ბერიძე ნინო', 'ქეთევან ლორთქიფანიძე', 'სოფო გელაშვილი', 'თამთა', 'ხათუნა', 'Nino Beridze', 'Tamta Gabelia',
             'Ketevan', 'Нино Беридзе', 'Анна Иванова', 'Elizabeth Taylor', 'დეიდა ლია', 'ქ-ნი ნანა', 'Mrs Smith', 'Lusine Grigoryan']
    men = ['გიორგი ლომიძე', 'ლაშა ბერიძე', 'ირაკლი ჟორჟოლიანი', 'ზურაბ მაჭავარიანი', 'ლუკა ჯანაშია', 'ტატო აბაშიძე', 'Giorgi Lomidze',
           'Irakli Zhorzholiani', 'Vakhtang', 'Vaxtang', 'Георгий', 'Давид Беридзе', 'ბატონი ზურა', 'ბიძია გია', 'John Smith', 'Armen Sargsyan']
    unsure = ['მეზობელი 1', 'სტუმარი 5', 'Neighbour 3', 'Sasha Petrov', 'Alex']
    assert guesses(women) == ['f'] * len(women), list(zip(women, guesses(women)))
    assert guesses(men) == ['m'] * len(men), list(zip(men, guesses(men)))
    assert guesses(unsure) == [None] * len(unsure), list(zip(unsure, guesses(unsure)))

def editor(pw, base):
    c = Ctx(pw, base, session=True); p = c.goto('/edit/ev1', wait='#plan .tbody'); return c, p
kinds = lambda p: p.evaluate("Object.fromEntries(Object.values(window.__supraState().guests).map(g=>[g.name,g.look.kind]))")

@test
def added_guests_are_drawn_by_name(pw, base):
    c, p = editor(pw, base)
    p.click('#tab-guests'); p.evaluate("document.querySelector('details[data-sec=add]').open=true")
    p.fill('#bulk', 'ნინო გაბელია\nგიორგი ქავთარაძე\nKetevan Abashidze\nLevan Kapanadze'); p.select_option('#bulk-t', '__wait'); p.click('[data-act=bulk]')
    k = kinds(p)
    assert (k['ნინო გაბელია'], k['გიორგი ქავთარაძე'], k['Ketevan Abashidze'], k['Levan Kapanadze']) == ('f', 'm', 'f', 'm'), k
    c.close()

@test
def renaming_redraws_and_undo_keeps_old(pw, base):
    c, p = editor(pw, base)
    p.focus('.seat[data-t=t2][data-i="5"]'); p.keyboard.press('Enter'); p.wait_for_selector('#g-name')   # ტატო აბაშიძე, drawn as a man
    p.fill('#g-name', 'ნათია აბაშიძე'); p.press('#g-name', 'Tab'); p.wait_for_timeout(150)
    assert kinds(p)['ნათია აბაშიძე'] == 'f'
    p.click('#undo'); p.wait_for_timeout(100)
    assert kinds(p)['ნათია აბაშიძე'] == 'm', 'undo keeps the name but restores the old drawing'
    c.close()

@test
def match_all_skips_hand_picked(pw, base):
    c, p = editor(pw, base)
    # pick 'woman' by hand for გიორგი (fixture draws him as a woman already): switch to man, then back to woman
    p.focus('.seat[data-t=th][data-i="2"]'); p.keyboard.press('Enter'); p.wait_for_selector('[data-act=kind]')
    p.click('[data-act=kind]'); p.click('[data-act=kind]'); p.wait_for_timeout(100)
    assert kinds(p)['გიორგი ლომიძე'] == 'f'
    p.click('[data-act=close]'); p.click('#tab-guests'); p.wait_for_selector('.confirm [data-act=matchlooks]')
    assert '8 guests' in p.inner_text('.confirm'), p.inner_text('.confirm')
    p.click('.confirm [data-act=matchlooks]'); p.wait_for_timeout(150)
    k = kinds(p)
    assert k['ლაშა ბერიძე'] == 'm' and k['ანა ხუციშვილი'] == 'f' and k['ლევან გელაშვილი'] == 'm' and k['მარიამ ტაბატაძე'] == 'f'
    assert k['გიორგი ლომიძე'] == 'f', 'a drawing switched by hand is left alone'
    assert p.locator('.confirm [data-act=matchlooks]').count() == 0
    c.close()
