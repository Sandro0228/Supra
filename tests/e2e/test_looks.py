"""First guesses for a new guest's drawing: relatives look alike, grandparents get grey hair, the couple's
"Typical guests" shades are used, and looks changed by hand survive "Restyle everyone"."""
from harness import Ctx, test

GREY = ['#9B9792', '#ECE6DA']
looks = lambda p: p.evaluate("Object.fromEntries(Object.values(window.__supraState().guests).map(g=>[g.name,g.look]))")
skins = lambda p: p.evaluate("window.SUPRA_SKINS")

def editor(pw, base):
    c = Ctx(pw, base, session=True); p = c.goto('/edit/ev1', wait='#plan .tbody'); return c, p

def add(p, names):
    p.click('#tab-guests'); p.evaluate("document.querySelector('details[data-sec=add]').open=true")
    p.fill('#bulk', '\n'.join(names)); p.select_option('#bulk-t', '__wait'); p.click('[data-act=bulk]')
    p.wait_for_timeout(100)

FAMILY = ['ნინო ჯაფარიძე', 'გიორგი ჯაფარიძე', 'Levan Japaridze', 'ბებია ლია ჯაფარიძე', 'ბაბუა რევაზ ჯაფარიძე']

@test
def relatives_share_a_skin_tone_and_grandparents_are_grey(pw, base):
    c, p = editor(pw, base)
    add(p, FAMILY)
    L = looks(p)
    assert len({L[n]['skin'] for n in FAMILY}) == 1, {n: L[n]['skin'] for n in FAMILY}   # Georgian and Latin spelling too
    assert L['ბებია ლია ჯაფარიძე']['hairColor'] in GREY and L['ბაბუა რევაზ ჯაფარიძე']['hairColor'] in GREY
    assert L['ბებია ლია ჯაფარიძე']['kind'] == 'f' and L['ბაბუა რევაზ ჯაფარიძე']['kind'] == 'm'
    c.close()

@test
def typical_guests_setting_limits_new_guests_shades(pw, base):
    c, p = editor(pw, base)
    p.click('#tab-event'); p.click('[data-crowd=skin][data-i="2"]'); p.click('[data-crowd=hair][data-i="5"]')
    assert p.get_attribute('[data-crowd=skin][data-i="2"]', 'aria-pressed') == 'true'
    names = ['Guest%d Test%d' % (i, i) for i in range(12)]
    add(p, names)
    L, S = looks(p), skins(p)
    assert all(L[n]['skin'] == S[2] for n in names)
    assert all(L[n]['hairColor'] == '#B4472C' for n in names)
    p.click('#tab-event'); p.click('[data-crowd=auto]')
    assert p.evaluate("window.__supraState().event.crowd") is None
    c.close()

@test
def hand_drawn_looks_survive_restyle_and_relatives_follow_them(pw, base):
    c, p = editor(pw, base)
    S = skins(p)
    # ტატო აბაშიძე (t2 seat 5): pick a skin tone by hand in his inspector
    p.focus('.seat[data-t=t2][data-i="5"]'); p.keyboard.press('Enter'); p.wait_for_selector('#g-name')
    p.evaluate("document.querySelectorAll('#right details, #left details').forEach(d=>d.open=true)")
    p.click('[data-look=skin][data-v="%s"]' % S[5]); p.wait_for_timeout(100)
    tato = looks(p)['ტატო აბაშიძე']
    assert tato['skin'] == S[5] and tato.get('hand') is True
    p.keyboard.press('Escape')
    add(p, ['ნათია აბაშიძე'])
    assert looks(p)['ნათია აბაშიძე']['skin'] == S[5]           # a new relative takes after the hand-drawn look
    p.evaluate("document.querySelectorAll('details').forEach(d=>d.open=true)")
    p.click('[data-act=randall] >> nth=0'); p.wait_for_timeout(100)
    assert looks(p)['ტატო აბაშიძე']['skin'] == S[5]            # never restyled
    c.close()
