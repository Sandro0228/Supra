import { $, MEAL_LBL, appState, esc, skel, t, tn, uid } from './core.js';
import { commit, mkGuest, tName, toast } from './state.js';
import { autoArrange } from './layout.js';
import { XLSXLIB, loadScript } from './panels.js';
import { isFree, guestLimit } from './access.js';
import { addRestorePoint } from './history.js';
import { modal } from './files.js';
/* Importing guests from a spreadsheet (R10). Nothing changes until the organiser has seen a preview: which column
   is which (they can correct it), how many guests, which ones are already in the plan (skip, update or add again),
   rows without a name, and the free-plan limit. The import is one undoable change; "replace" also keeps a restore
   point. CSV/TXT files are read here (UTF-8 with or without BOM, UTF-16 from Excel's "Unicode text"; comma,
   semicolon or tab), so Georgian names survive; Excel files go through SheetJS. Part of the planner; see
   js/README.md. */

const FIELDS = ['name', 'table', 'seat', 'group', 'side', 'meal', 'kid', 'allergies'];
const HEAD = {
  name: /^(name|names|full name|guest|სახელი|სტუმარი)/i,
  table: /(table|მაგიდ)/i,
  seat: /^(seat|chair|ადგილ|სკამ)/i,
  group: /(group|family|ჯგუფ|ოჯახ)/i,
  side: /(side|მხარე)/i,
  meal: /(meal|menu|food|კერძ|კვებ|მენიუ)/i,
  kid: /(child|kid|ბავშ)/i,
  allergies: /(allerg|ალერგ)/i
};
const FIELD_LBL = {
  name: 'colName',
  table: 'colTable',
  seat: 'colSeat',
  group: 'colGroup',
  side: 'colSide',
  meal: 'colMeal',
  kid: 'colChild',
  allergies: 'colAllergies'
};
const sideOf = v => {
  v = String(v || '').toLowerCase();
  return /bride|პატარძ/.test(v) ? 'bride' : /groom|სიძ|ნეფ/.test(v) ? 'groom' : /both|ორივ/.test(v) ? 'both' : '';
};
const mealOf = v => {
  v = String(v || '').toLowerCase();
  return /meat|ხორც/.test(v)
    ? 'meat'
    : /fish|თევზ/.test(v)
      ? 'fish'
      : /vegan|ვეგან/.test(v)
        ? 'vegan'
        : /veg|ვეგეტ/.test(v)
          ? 'veg'
          : /kid|child|საბავშ/.test(v)
            ? 'kids'
            : '';
};
const yes = v => /^(y|yes|1|true|x|✓|კი|დიახ)/i.test(String(v || '').trim());
const str = v => (v === null || v === undefined ? '' : String(v)).replace(/\s+/g, ' ').trim();

/* ---------- reading a file into rows ---------- */
function decode(buf) {
  const b = new Uint8Array(buf);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b.subarray(2));
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b.subarray(2));
  return new TextDecoder('utf-8').decode(b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf ? b.subarray(3) : b);
}
// RFC 4180-style: quotes, doubled quotes, separators and line breaks inside quotes.
function parseDelimited(text) {
  const first = text.split(/\r?\n/, 1)[0] || '';
  const count = ch =>
    first
      .split('"')
      .filter((_, i) => i % 2 === 0)
      .join('')
      .split(ch).length - 1;
  const sep = [',', ';', '\t'].sort((a, b) => count(b) - count(a))[0];
  const rows = [];
  let row = [],
    cell = '',
    q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter(r => r.some(v => str(v)));
}
async function readRows(file) {
  const buf = await file.arrayBuffer();
  if (/\.(csv|txt|tsv)$/i.test(file.name) || /^text\//.test(file.type)) return parseDelimited(decode(buf));
  await loadScript(XLSXLIB);
  const wb = XLSX.read(buf);
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, blankrows: false });
}

/* ---------- which column is which ---------- */
function detect(rows) {
  let hr = -1;
  for (let r = 0; r < Math.min(rows.length, 10) && hr < 0; r++)
    if ((rows[r] || []).some(c => typeof c === 'string' && HEAD.name.test(c.trim()))) hr = r;
  const map = {};
  if (hr >= 0) {
    (rows[hr] || []).forEach((c, i) => {
      if (typeof c !== 'string') return;
      const f = FIELDS.find(k => !Object.values(map).includes(k) && HEAD[k].test(c.trim()));
      if (f) map[i] = f;
    });
  } else {
    // no heading row: first text column = names, first number column = tables
    const r0 = rows[0] || [];
    r0.forEach((v, i) => {
      if (!Object.values(map).includes('name') && typeof v === 'string' && /\D/.test(v)) map[i] = 'name';
      else if (!Object.values(map).includes('table') && (typeof v === 'number' || /^\d+$/.test(str(v))))
        map[i] = 'table';
    });
  }
  return { hr, map };
}
function records(rows, hr, map) {
  const col = {};
  Object.entries(map).forEach(([i, f]) => f && (col[f] = +i));
  const out = [];
  let noName = 0;
  rows.slice(hr + 1).forEach((r, k) => {
    const get = f => (col[f] === undefined ? '' : r[col[f]]);
    const name = str(get('name')).slice(0, 80);
    if (!name) {
      if (r.some(v => str(v))) noName++;
      return;
    }
    const seat = parseInt(str(get('seat')), 10);
    out.push({
      line: hr + 2 + k,
      name,
      table: str(get('table')),
      seat: seat > 0 && seat < 200 ? seat : 0,
      group: str(get('group')).slice(0, 80),
      side: sideOf(get('side')),
      meal: mealOf(get('meal')),
      kid: col.kid !== undefined && yes(get('kid')),
      allergies: str(get('allergies')).slice(0, 300)
    });
  });
  return { list: out, noName };
}
// Who is already in the plan (same name, also across Georgian/Latin spelling) or repeated in the file.
function analyze(list, replace) {
  const have = new Map();
  if (!replace) Object.entries(appState.S.guests).forEach(([id, g]) => have.set(skel(g.name), id));
  const seen = new Set();
  list.forEach(r => {
    const k = skel(r.name);
    r.existing = have.get(k) || null;
    r.repeat = seen.has(k);
    seen.add(k);
  });
  return {
    existing: list.filter(r => r.existing).length,
    repeats: list.filter(r => r.repeat && !r.existing).length
  };
}

/* ---------- applying ---------- */
function tableFor(label, made) {
  const nm = /^\d+$/.test(label) ? 'Table ' + label : label;
  let x = appState.S.tables.find(
    y => y.name.toLowerCase() === nm.toLowerCase() || tName(y).toLowerCase() === nm.toLowerCase()
  );
  if (!x) {
    x = { id: uid(), name: nm, shape: 'rect', deco: 'flowers', seats: [] };
    appState.S.tables.push(x);
    made.push(x);
  }
  return x;
}
function place(x, id, seat) {
  if (seat) {
    while (x.seats.length < seat) x.seats.push(null);
    if (!x.seats[seat - 1]) return (x.seats[seat - 1] = id);
  }
  const i = x.seats.indexOf(null);
  if (i < 0) x.seats.push(id);
  else x.seats[i] = id;
}
function apply(list, mode, dupes) {
  let added = 0,
    updated = 0;
  const ok = commit(() => {
    if (mode === 'replace') {
      const keep = new Set(appState.S.tables.filter(x => x.shape === 'head').flatMap(x => x.seats.filter(Boolean)));
      Object.keys(appState.S.guests).forEach(id => {
        if (!keep.has(id)) delete appState.S.guests[id];
      });
      appState.S.waiting = [];
      appState.S.rules = appState.S.rules.filter(r => keep.has(r.a) && keep.has(r.b));
      appState.S.tables = appState.S.tables.filter(x => x.shape === 'head');
    }
    const made = [];
    list.forEach(r => {
      if (r.existing && mode !== 'replace' && dupes !== 'add') {
        if (dupes === 'update') {
          const g = appState.S.guests[r.existing];
          if (!g) return;
          ['group', 'side', 'meal', 'allergies'].forEach(f => r[f] && (g[f] = r[f]));
          if (r.kid) g.kid = true;
          updated++;
        }
        return;
      }
      const id = mkGuest(r.name, null, {
        group: r.group,
        side: r.side,
        meal: r.meal,
        kid: r.kid,
        allergies: r.allergies
      });
      added++;
      if (r.table) place(tableFor(r.table, made), id, r.seat);
      else appState.S.waiting.push(id);
    });
    if (made.length || mode === 'replace') autoArrange();
  });
  return ok ? { added, updated } : null;
}

/* ---------- the dialog ---------- */
function importModal() {
  modal(`<h2>${t('importTitle')}</h2><p class="muted">${t('imHint')}</p>
  <div class="field"><span class="lbl" id="xfile-l">${t('chooseFile')}</span>${filePick()}</div>
  <p id="xinfo" class="muted" role="status"></p>
  <div id="xprev"></div>`);
  const st = { rows: null, hr: -1, map: {}, mode: 'add', dupes: 'skip' };
  $('#xfile').onchange = async e => {
    const f = e.target.files[0];
    $('#xfile-name').textContent = f ? f.name : t('noFile');
    if (!f) return;
    $('#xinfo').textContent = t('loadingLib');
    $('#xprev').innerHTML = '';
    try {
      st.rows = await readRows(f);
      Object.assign(st, detect(st.rows));
    } catch (err) {
      st.rows = null;
    }
    if (!st.rows || !st.rows.length) {
      $('#xinfo').textContent = t('imUnreadable');
      return;
    }
    $('#xinfo').textContent = '';
    preview(st);
  };
}
const filePick = () =>
  `<div class="filepick"><input type="file" id="xfile" accept=".xlsx,.xls,.csv,.txt,.tsv" class="fileinput" aria-labelledby="xfile-l xfile-btn"><label for="xfile" class="btn" id="xfile-btn" aria-hidden="true">${t('pickFile')}</label><span class="fname" id="xfile-name" aria-live="polite">${t('noFile')}</span></div>`;

function preview(st) {
  const { list, noName } = records(st.rows, st.hr, st.map);
  const replace = st.mode === 'replace';
  const a = analyze(list, replace);
  const dupSkip = !replace && st.dupes !== 'add';
  const willAdd = list.filter(r => !(r.existing && dupSkip)).length,
    willUpdate = !replace && st.dupes === 'update' ? a.existing : 0;
  const keepHead = replace
    ? appState.S.tables.filter(x => x.shape === 'head').reduce((n, x) => n + x.seats.filter(Boolean).length, 0)
    : Object.keys(appState.S.guests).length;
  const total = keepHead + willAdd,
    over = isFree() && total > guestLimit();
  // columns that have something in them (heading or values in the first rows)
  const width = Math.max(...st.rows.slice(0, 30).map(r => r.length));
  const cols = [];
  for (let i = 0; i < width; i++) {
    const head = st.hr >= 0 ? str(st.rows[st.hr][i]) : '';
    const sample = st.rows
      .slice(st.hr + 1, st.hr + 4)
      .map(r => str(r[i]))
      .filter(Boolean);
    if (head || sample.length) cols.push({ i, head, sample });
  }
  const letter = i => (i < 26 ? String.fromCharCode(65 + i) : 'A' + String.fromCharCode(65 + i - 26));
  const opts = i =>
    `<option value="">${esc(t('imIgnore'))}</option>` +
    FIELDS.map(f => `<option value="${f}" ${st.map[i] === f ? 'selected' : ''}>${esc(t(FIELD_LBL[f]))}</option>`).join(
      ''
    );
  const shown = list.slice(0, 6);
  const cell = v => `<td>${esc(v)}</td>`;
  const rowsHtml = shown
    .map(
      r =>
        `<tr${r.existing && dupSkip ? ' class="dup"' : ''}>${cell(r.name)}${cell(r.table)}${cell(r.seat || '')}${cell(r.group)}${cell(r.side ? t(r.side) : '')}${cell(r.meal ? t(MEAL_LBL[r.meal] || r.meal) : '')}<td>${r.existing ? esc(t(st.dupes === 'update' && !replace ? 'imWillUpdate' : st.dupes === 'add' || replace ? 'imAgain' : 'imSkip')) : r.repeat ? esc(t('imRepeat')) : ''}</td></tr>`
    )
    .join('');
  $('#xprev').innerHTML = `
  <fieldset class="imcols"><legend>${t('imColumns')}</legend><p class="muted small">${t('imColumnsHint')}</p>
    <div class="imgrid">${cols
      .map(
        c =>
          `<label class="field"><span class="lbl">${esc(t('imColumn', { c: letter(c.i) }))}${c.head ? ' · ' + esc(c.head) : ''}</span><select data-imcol="${c.i}">${opts(c.i)}</select><span class="muted small">${esc(c.sample.join(', ').slice(0, 60))}</span></label>`
      )
      .join('')}</div></fieldset>
  ${
    Object.values(st.map).includes('name')
      ? `<ul class="imstats" role="status">
    <li><b>${esc(tn('imFound', list.length))}</b></li>
    ${a.existing ? `<li>${esc(tn('imExisting', a.existing))}</li>` : ''}
    ${a.repeats ? `<li>${esc(tn('imRepeats', a.repeats))}</li>` : ''}
    ${noName ? `<li>${esc(tn('imNoName', noName))}</li>` : ''}
  </ul>
  ${list.length ? `<div class="tablewrap"><table class="imtab"><caption class="muted small">${esc(t('imPreview', { n: shown.length, m: list.length }))}</caption><tr>${['colName', 'colTable', 'colSeat', 'colGroup', 'colSide', 'colMeal', 'imNote'].map(k => `<th scope="col">${esc(t(k))}</th>`).join('')}</tr>${rowsHtml}</table></div>` : ''}
  <div class="field"><span class="lbl">${t('importMode')}</span><label class="check"><input type="radio" name="xmode" value="add" ${!replace ? 'checked' : ''}> ${t('importAdd')}</label><label class="check"><input type="radio" name="xmode" value="replace" ${replace ? 'checked' : ''}> ${t('importReplace')}</label></div>
  ${
    a.existing && !replace
      ? `<div class="field"><span class="lbl">${esc(tn('imExistingQ', a.existing))}</span>${['skip', 'update', 'add']
          .map(
            k =>
              `<label class="check"><input type="radio" name="xdupes" value="${k}" ${st.dupes === k ? 'checked' : ''}> ${t('imDupes_' + k)}</label>`
          )
          .join('')}</div>`
      : ''
  }
  ${over ? `<p class="msg err" role="alert">${esc(t('imOver', { n: total, max: guestLimit() }))}</p>` : ''}
  <div class="row"><button type="button" class="btn primary" id="xgo" ${willAdd + willUpdate && !over ? '' : 'disabled'}>${esc(willAdd ? tn('imGo', willAdd) : willUpdate ? tn('imGoUpdate', willUpdate) : t('importGo'))}</button></div>`
      : `<p class="msg err" role="alert">${t('imNeedName')}</p>`
  }`;
  $('#xprev').onchange = e => {
    const el = e.target,
      fk =
        el.dataset.imcol !== undefined
          ? `[data-imcol="${el.dataset.imcol}"]`
          : `input[name="${el.name}"][value="${el.value}"]`;
    if (el.dataset.imcol !== undefined) {
      const i = +el.dataset.imcol;
      Object.keys(st.map).forEach(k => st.map[k] === el.value && el.value && delete st.map[k]); // one column per field
      if (el.value) st.map[i] = el.value;
      else delete st.map[i];
    }
    if (el.name === 'xmode') st.mode = el.value;
    if (el.name === 'xdupes') st.dupes = el.value;
    preview(st);
    $('#xprev ' + fk)?.focus();
  };
  const go = $('#xgo');
  if (go)
    go.onclick = () => {
      if (st.mode === 'replace') addRestorePoint('import', appState.S);
      const res = apply(list, st.mode, st.dupes);
      if (!res) return; // over the free limit: the "get the pass" panel replaced this one
      $('#modalroot').innerHTML = '';
      toast(
        res.added && res.updated
          ? t('imDoneBoth', { a: res.added, u: res.updated })
          : res.updated
            ? tn('imDoneUpdated', res.updated)
            : tn('imDone', res.added)
      );
    };
}

export { analyze, detect, importModal, parseDelimited, records };
