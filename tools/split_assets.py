"""Turns the embedded images in assets.js into separate files under img/ (run once; re-run after changing images).

assets.js used to hold every drawing as base64 data (about 1.1 MB) and was loaded by every page. Now:
  img/<key>.<hash>.webp       one file per drawing, named by content so browsers can cache it for a year
  assets.js                   only sizes (SUPRA_FIT, SUPRA_NAT), skin colours and the file list (SUPRA_IMG_FILES)
Pages load only the files they draw (js/core.js loadImages). To change a drawing: put the new .webp in img/
under its key name (img/<key>.webp), run `python3 tools/split_assets.py --from-dir`, and commit.
"""
import base64, hashlib, json, os, re, sys, glob

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS, IMG = os.path.join(ROOT, 'assets.js'), os.path.join(ROOT, 'img')

def read_globals(src):
    out, dec = {}, json.JSONDecoder()
    for m in re.finditer(r'window\.(SUPRA_[A-Z_]+)=', src):
        out[m.group(1)] = dec.raw_decode(src, m.end())[0]
    return out

def webp_size(b):
    '''Width and height of a WebP file (lossy VP8, lossless VP8L or extended VP8X).'''
    kind = b[12:16]
    if kind == b'VP8X':
        return 1 + int.from_bytes(b[24:27], 'little'), 1 + int.from_bytes(b[27:30], 'little')
    if kind == b'VP8L':
        n = int.from_bytes(b[21:25], 'little')
        return 1 + (n & 0x3FFF), 1 + ((n >> 14) & 0x3FFF)
    return int.from_bytes(b[26:28], 'little') & 0x3FFF, int.from_bytes(b[28:30], 'little') & 0x3FFF

def main():
    g = read_globals(open(ASSETS, encoding='utf-8').read())
    os.makedirs(IMG, exist_ok=True)
    if '--from-dir' in sys.argv:          # images already split: rebuild names from img/<key>.webp files
        data = {}
        for f in glob.glob(os.path.join(IMG, '*.webp')):
            key = os.path.basename(f).split('.')[0]
            data[key] = open(f, 'rb').read()
    else:
        data = {k: base64.b64decode(v.split(',', 1)[1]) for k, v in g.pop('SUPRA_IMG').items()}
    for f in glob.glob(os.path.join(IMG, '*.webp')):
        os.remove(f)
    files = {}
    for k, b in sorted(data.items()):
        name = '%s.%s.webp' % (k, hashlib.sha256(b).hexdigest()[:10])
        open(os.path.join(IMG, name), 'wb').write(b)
        files[k] = '/img/' + name
    # New plain drawings (not character parts, which are placed by SUPRA_FIT) get their natural size recorded,
    # and drawings that no longer exist are dropped from both size tables.
    nat, fit = g.setdefault('SUPRA_NAT', {}), g.setdefault('SUPRA_FIT', {})
    for k, b in data.items():
        if k not in fit and k not in nat:
            nat[k] = list(webp_size(b))
    for table in (nat, fit):
        for k in [k for k in table if k not in data]:
            del table[k]
    g.pop('SUPRA_IMG', None)
    g['SUPRA_IMG_FILES'] = files
    head = '/* Drawing sizes, skin colours and the image files (made by tools/split_assets.py; do not edit by hand). */\n'
    open(ASSETS, 'w', encoding='utf-8').write(head + ''.join('window.%s=%s;\n' % (k, json.dumps(v, separators=(',', ':'))) for k, v in g.items()))
    print('%d images, %d KB in img/; assets.js is now %d bytes' % (len(files), sum(len(b) for b in data.values()) // 1024, os.path.getsize(ASSETS)))

main()
