"""Big wedding fixtures for performance tests and measurements: N guests at round tables of 10 in a grid."""
import copy, json, os
from harness import PLAN

def big_plan(n, per=10, seed_name='Guest'):
    d = copy.deepcopy(PLAN)
    looks = [g['look'] for g in PLAN['guests'].values()]
    head = [t for t in d['tables'] if t.get('shape') == 'head']
    keep = set(s for t in head for s in t['seats'] if s)
    d['guests'] = {k: v for k, v in d['guests'].items() if k in keep}
    d['tables'] = head
    d['waiting'] = []
    d['rules'] = []
    i = len(d['guests'])
    cols = 6
    tno = 0
    while i < n:
        tno += 1
        seats = []
        for _ in range(per):
            if i >= n: seats.append(None); continue
            gid = 'b%d' % i
            d['guests'][gid] = dict(id=gid, name='%s %d' % (seed_name, i), group='Family %d' % (i // 6), side=['bride', 'groom', 'both'][i % 3],
                                    kid=False, meal='', allergies='', look=copy.deepcopy(looks[i % len(looks)]))
            seats.append(gid); i += 1
        r, c = divmod(tno - 1, cols)
        d['tables'].append(dict(id='bt%d' % tno, name='Table %d' % tno, shape='round', deco='flowers', seats=seats,
                                x=300 + c * 420, y=700 + r * 420))
    return d

def big_event(n, **kw):
    e = dict(id='ev1', owner='u1', name='Big wedding', slug='guestcode1', guest_page=True, data=big_plan(n), public_data={},
             lookup_mode='prefix', lookup_pin_hash=None, show_tablemates=False, updated_at='seed', share_status='published',
             show_layout=True, version=1)
    e.update(kw); return e
