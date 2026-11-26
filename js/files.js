import { $, MEALS, MEAL_LBL, SIDE_COL, UL, allDefs, appState, esc, person, seatMode, shade, t } from './core.js';
import { P, clearDraft, tName, toast } from './state.js';
import { BODYFONT, NAMEFONT, planSVG } from './draw.js';
import { PDFLIB, XLSXLIB, loadScript, logSafe, renderTop } from './panels.js';
import { gDate } from './guest.js';
import { INV, eventCols } from './invites.js';
import { resolveConflict, versioned } from './conflict.js';
/* Saving, downloads (PNG, PDF, place cards, caterer list, CSV) and the modal. Part of the planner (app.html); see js/README.md. */
/* ---------------- saving ---------------- */
let savingNow = false,
  saveAgain = false;
const isSaving = () => savingNow;
/* manual: the organiser pressed Save. While a conflict waits for the organiser's choice (js/conflict.js), only
   Save reopens it; automatic saves leave both versions alone. */
async function savePlan(manual) {
  clearTimeout(appState.saveT);
  if (!appState.SB || !appState.ROW || appState.readOnly) return;
  if (appState.conflict) {
    appState.saveState = 'conflict';
    renderTop();
    if (manual === true) resolveConflict();
    return;
  }
  if (savingNow) {
    saveAgain = true;
    return;
  }
  savingNow = true;
  appState.saveState = 'saving';
  renderTop();
  const snapshot = JSON.stringify(appState.S),
    v = versioned();
  let conflict = false;
  try {
    let q = appState.SB.from('events')
      .update({
        data: appState.S,
        name: appState.S.event.name || '',
        event_date: appState.S.event.date || null,
        type: appState.S.event.type,
        ...eventCols()
      })
      .eq('id', appState.ROW.id);
    // Save only on top of the version this tab loaded (migration 010); without the column, last write wins.
    if (v) q = q.eq('version', appState.ROW.version);
    const { data, error } = await q.select(v ? 'updated_at,version' : 'updated_at').maybeSingle();
    if (error) throw error;
    if (!data) {
      if (!v) throw new Error('no row updated');
      conflict = true;
      throw new Error('conflict');
    }
    appState.ROW.updated_at = data.updated_at;
    if (v) appState.ROW.version = data.version;
    if (JSON.stringify(appState.S) === snapshot) {
      appState.dirty = false;
      clearDraft();
    }
    appState.saveState = 'idle';
  } catch (err) {
    if (!conflict) {
      appState.saveState = 'error';
      logSafe('save', err);
      toast(t('couldntSave'));
    }
  }
  savingNow = false;
  if (conflict) {
    saveAgain = false;
    await resolveConflict();
    return;
  }
  renderTop();
  if (saveAgain || (appState.dirty && appState.saveState !== 'error')) {
    saveAgain = false;
    if (appState.dirty) appState.saveT = setTimeout(savePlan, 800);
  }
}
window.addEventListener('beforeunload', e => {
  if (appState.dirty && appState.MODE === 'edit') {
    savePlan();
    e.preventDefault();
    e.returnValue = '';
  }
});

/* ---------------- files out ---------------- */
async function offerFile(name, blob) {
  const u = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = u;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 4000);
}
function svgToPng(inner, vb, W, H, scale = 2) {
  return new Promise((ok, no) => {
    const src = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${vb}" width="${W}" height="${H}">${inner}</svg>`;
    const im = new Image();
    im.onload = () => {
      const c = document.createElement('canvas');
      c.width = W * scale;
      c.height = H * scale;
      const x = c.getContext('2d');
      x.scale(scale, scale);
      x.drawImage(im, 0, 0);
      c.toBlob(b => (b ? ok({ blob: b, url: c.toDataURL('image/png') }) : no()), 'image/png');
    };
    im.onerror = no;
    im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(src);
  });
}
const fname = s =>
  (appState.S.event.name || t('fileBase'))
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() + s;
async function planImage() {
  const keep = appState.sel;
  appState.sel = { kind: null };
  const { B, inner } = planSVG();
  appState.sel = keep;
  try {
    const r = await svgToPng(allDefs() + inner, `${B.x} ${B.y} ${B.w} ${B.h}`, B.w, B.h, 2);
    offerFile(fname('-' + t('fileSeating') + '.png'), r.blob, r.url);
  } catch (e) {
    toast(t('couldntSave'));
  }
}
/* ---------------- PDF ----------------
   Pages are pictures (the plan, place cards) or lists drawn on a canvas with the page's own fonts, so Georgian
   names print correctly without embedding a font in the PDF. A4, 72pt per inch. */
const A4 = { w: 595.28, h: 841.89 };
async function savePdf(pages, name, title) {
  await loadScript(PDFLIB);
  const { jsPDF } = window.jspdf;
  let doc = null;
  for (const pg of pages) {
    const land = pg.w > pg.h && !pg.fill,
      W = land ? A4.h : A4.w,
      H = land ? A4.w : A4.h;
    if (!doc)
      doc = new jsPDF({ orientation: land ? 'landscape' : 'portrait', unit: 'pt', format: 'a4', compress: true });
    else doc.addPage('a4', land ? 'landscape' : 'portrait');
    const m = pg.fill ? 0 : 28,
      sc = Math.min((W - 2 * m) / pg.w, (H - 2 * m) / pg.h),
      iw = pg.w * sc,
      ih = pg.h * sc;
    doc.addImage(
      pg.url,
      pg.url.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG',
      (W - iw) / 2,
      pg.fill ? 0 : m,
      iw,
      ih,
      undefined,
      'FAST'
    );
  }
  doc.setProperties({ title: title || 'Supra', creator: 'Supra' });
  offerFile(name, doc.output('blob'));
}
/* Lists for the plan PDF: each table in number order (for the venue staff), then everyone A–Z (for the entrance). */
function listPages() {
  const W = 1588,
    H = 2246,
    M = 120,
    F = "'Noto Sans Georgian', system-ui, sans-serif",
    FD = "Marcellus, 'Noto Serif Georgian', Georgia, serif",
    p = P();
  const rows = [];
  appState.S.tables.forEach(x =>
    x.seats.forEach((id, i) => {
      const g = id && appState.S.guests[id];
      if (g) rows.push({ name: g.name, table: tName(x), seat: i + 1 });
    })
  );
  const coll = new Intl.Collator(UL() === 'ka' ? 'ka' : 'en', { sensitivity: 'base' });
  rows.sort((a, b) => coll.compare(a.name, b.name));
  const pages = [];
  let c, x, y, col;
  const page = heading => {
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    c = cv.getContext('2d');
    c.fillStyle = '#FFFFFF';
    c.fillRect(0, 0, W, H);
    c.fillStyle = p.ink;
    c.font = `56px ${FD}`;
    c.textBaseline = 'alphabetic';
    c.fillText(appState.S.event.name || 'Supra', M, M + 40);
    c.fillStyle = p.accent;
    c.font = `30px ${F}`;
    c.fillText([gDate(), heading].filter(Boolean).join('  ·  '), M, M + 96);
    c.strokeStyle = p.accent;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(M, M + 124);
    c.lineTo(W - M, M + 124);
    c.stroke();
    pages.push(cv);
    col = 0;
    x = M;
    y = M + 200;
  };
  const fit = (txt, max) => {
    if (c.measureText(txt).width <= max) return txt;
    while (txt.length > 1 && c.measureText(txt + '…').width > max) txt = txt.slice(0, -1);
    return txt + '…';
  };
  // by table first (for the venue staff): head table(s), then Table 1, 2, … 10 in number order; a block never splits across columns
  const colW = (W - 2 * M - 60) / 2,
    num = new Intl.Collator(UL() === 'ka' ? 'ka' : 'en', { numeric: true, sensitivity: 'base' });
  const ordered = [...appState.S.tables].sort(
    (a, b) => (b.shape === 'head') - (a.shape === 'head') || num.compare(tName(a), tName(b))
  );
  page(t('pdfByTable'));
  ordered.forEach(tb => {
    const names = tb.seats
      .map((id, i) =>
        id && appState.S.guests[id]
          ? seatMode() === 'table'
            ? `• ${appState.S.guests[id].name}`
            : `${i + 1}. ${appState.S.guests[id].name}`
          : null
      )
      .filter(Boolean);
    if (!names.length) return;
    const need = 70 + names.length * 50 + 40;
    if (y + need > H - M) {
      if (col === 0) {
        col = 1;
        x = M + colW + 60;
        y = M + 200;
      } else page(t('pdfByTable'));
    }
    c.fillStyle = p.accent;
    c.font = `40px ${FD}`;
    c.fillText(fit(tName(tb), colW), x, y);
    c.font = `26px ${F}`;
    c.fillStyle = '#8A8580';
    c.fillText(t('statSeats', { occupied: names.length, capacity: tb.seats.length }), x, y + 40);
    y += 90;
    c.fillStyle = p.ink;
    c.font = `30px ${F}`;
    names.forEach(n => {
      c.fillText(fit(n, colW), x, y);
      y += 50;
    });
    y += 40;
  });
  // then everyone A–Z (for the entrance): two columns, name left, table and seat right
  // two lines per guest so long names and long table names both stay whole
  const lh = 96;
  page(t('pdfAZ'));
  rows.forEach(r => {
    if (y + lh - 40 > H - M) {
      if (col === 0) {
        col = 1;
        x = M + colW + 60;
        y = M + 200;
      } else page(t('pdfAZ'));
    }
    c.fillStyle = p.ink;
    c.font = `34px ${F}`;
    c.fillText(fit(r.name, colW), x, y);
    c.fillStyle = p.accent;
    c.font = `27px ${F}`;
    c.fillText(
      fit(seatMode() === 'table' ? r.table : `${r.table} · ${t('seatN', { number: r.seat })}`, colW),
      x,
      y + 38
    );
    c.strokeStyle = '#E6E1DA';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(x, y + 60);
    c.lineTo(x + colW, y + 60);
    c.stroke();
    y += lh;
  });
  // page numbers (the plan itself is page 1)
  pages.forEach((cv, i) => {
    const g = cv.getContext('2d');
    g.fillStyle = '#8A8580';
    g.font = `24px ${F}`;
    const s = t('pageN', { n: i + 2, of: pages.length + 1 });
    g.fillText(s, W - M - g.measureText(s).width, H - 60);
  });
  return pages.map(cv => ({ url: cv.toDataURL('image/png'), w: W, h: H }));
}
async function planPdf() {
  const btn = document.querySelector('[data-act=planpdf]');
  if (btn) {
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
  }
  toast(t('pdfMaking'));
  try {
    await document.fonts?.ready;
    const keep = appState.sel;
    appState.sel = { kind: null };
    const { B, inner } = planSVG();
    appState.sel = keep;
    const r = await svgToPng(allDefs() + inner, `${B.x} ${B.y} ${B.w} ${B.h}`, B.w, B.h, 2);
    await savePdf(
      [{ url: r.url, w: B.w, h: B.h }, ...listPages()],
      fname('-' + t('fileSeating') + '.pdf'),
      (appState.S.event.name || 'Supra') + ' · ' + t('planLabel')
    );
  } catch (e) {
    logSafe('pdf', e);
    toast(t('pdfFail'));
  }
  if (btn) {
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
  }
}
async function dlQR() {
  const c = $('#qr canvas');
  if (!c) return;
  const pad = document.createElement('canvas');
  pad.width = c.width + 80;
  pad.height = c.height + 120;
  const x = pad.getContext('2d');
  x.fillStyle = '#FFFFFF';
  x.fillRect(0, 0, pad.width, pad.height);
  x.drawImage(c, 40, 40);
  x.fillStyle = '#24302A';
  x.font = '600 20px Noto Sans Georgian, sans-serif';
  x.textAlign = 'center';
  x.fillText(t('fgTitle'), pad.width / 2, c.height + 80);
  pad.toBlob(b => offerFile(fname('-' + t('qrFile') + '.png'), b, pad.toDataURL()), 'image/png');
}

/* place cards */
async function placeCards() {
  const list = [];
  appState.S.tables.forEach(x =>
    x.seats.forEach(id => {
      if (id) list.push({ G: appState.S.guests[id], x });
    })
  );
  const per = 10,
    pages = Math.ceil(list.length / per),
    p = P();
  modal(
    `<h2>${t('cardsTitle')}</h2><p class="muted">${list.length} · ${pages} ${t('page').toLowerCase()}</p><div id="cardpages" class="cardpages">${t('loadingLib')}</div>`
  );
  const out = [];
  for (let pg = 0; pg < pages; pg++) {
    let s = `<rect width="794" height="1123" fill="#FFFFFF"/>`;
    list.slice(pg * per, pg * per + per).forEach((c, k) => {
      const cx = 40 + (k % 2) * 367,
        cy = 40 + Math.floor(k / 2) * 209;
      s += `<g transform="translate(${cx} ${cy})"><rect width="347" height="189" rx="10" fill="${p.cloth}" stroke="${p.edge}" stroke-width="1.5"/><rect x="8" y="8" width="331" height="173" rx="6" fill="none" stroke="${p.accent}" stroke-width=".8" stroke-dasharray="3 4"/>
      <g transform="translate(62 104) scale(1.6)">${person(c.G, p, false)}</g>
      ${c.G.side ? `<circle cx="320" cy="28" r="6" fill="${SIDE_COL[c.G.side]}"/>` : ''}
      <text x="226" y="82" text-anchor="middle" font-family="${NAMEFONT}" font-weight="700" font-size="${c.G.name.length > 18 ? 17 : 21}" fill="${p.ink}">${esc(c.G.name.split(/\s+/)[0])}</text>
      <text x="226" y="106" text-anchor="middle" font-family="${BODYFONT}" font-size="14" fill="${shade(p.ink, 25)}">${esc(c.G.name.split(/\s+/).slice(1).join(' '))}</text>
      <path d="M176,122 H276" stroke="${p.accent}"/>
      <text x="226" y="146" text-anchor="middle" font-family="Marcellus, Noto Serif Georgian, serif" font-size="${Math.min(17, Math.floor(310 / Math.max(1, tName(c.x).length)))}" fill="${p.accent}">${esc(tName(c.x))}</text>
      ${c.G.meal ? `<text x="226" y="167" text-anchor="middle" font-family="${BODYFONT}" font-size="11" fill="${shade(p.ink, 35)}">${esc(t(MEAL_LBL[c.G.meal] || c.G.meal))}</text>` : ''}</g>`;
    });
    try {
      out.push(await svgToPng(allDefs() + s, '0 0 794 1123', 794, 1123, 2));
    } catch (e) {}
  }
  const box = $('#cardpages');
  if (!box) return;
  box.insertAdjacentHTML(
    'beforebegin',
    `<div class="row"><button type="button" class="btn primary" id="cardspdf">${t('cardsPdf')}</button></div>`
  );
  $('#cardspdf').onclick = async () => {
    const b = $('#cardspdf');
    b.disabled = true;
    b.setAttribute('aria-busy', 'true');
    try {
      await savePdf(
        out.map(r => ({ url: r.url, w: 794, h: 1123, fill: true })),
        fname('-' + t('fileCards') + '.pdf'),
        t('cardsTitle')
      );
    } catch (e) {
      logSafe('pdf', e);
      toast(t('pdfFail'));
    }
    b.disabled = false;
    b.removeAttribute('aria-busy');
  };
  box.innerHTML = out
    .map(
      (r, i) =>
        `<figure><img src="${r.url}" alt="${t('page')} ${i + 1}"><button type="button" class="btn sm" data-dlcard="${i}">${t('download')} · ${t('page')} ${i + 1}</button></figure>`
    )
    .join('');
  box.onclick = e => {
    const b = e.target.closest('[data-dlcard]');
    if (b) {
      const i = +b.dataset.dlcard;
      offerFile(fname(`-${t('fileCards')}-${i + 1}.png`), out[i].blob, out[i].url);
    }
  };
}

/* caterer */
function catererData() {
  const rows = [];
  appState.S.tables.forEach(x => {
    const c = { table: tName(x), total: 0, kids: 0, meals: {} };
    x.seats.forEach(id => {
      const g = id && appState.S.guests[id];
      if (!g) return;
      c.total++;
      if (g.kid) c.kids++;
      const m = g.meal || '';
      c.meals[m] = (c.meals[m] || 0) + 1;
    });
    rows.push(c);
  });
  return rows;
}
function catererModal() {
  const rows = catererData(),
    tot = { total: 0, kids: 0, meals: {} };
  rows.forEach(r => {
    tot.total += r.total;
    tot.kids += r.kids;
    for (const m in r.meals) tot.meals[m] = (tot.meals[m] || 0) + r.meals[m];
  });
  const al = [];
  appState.S.tables.forEach(x =>
    x.seats.forEach(id => {
      const g = id && appState.S.guests[id];
      if (g && g.allergies.trim()) al.push(`<li><b>${esc(g.name)}</b> · ${esc(tName(x))} · ${esc(g.allergies)}</li>`);
    })
  );
  const head = `<tr><th>${t('table')}</th><th>${t('total')}</th>${MEALS.map(m => `<th>${t(MEAL_LBL[m] || m)}</th>`).join('')}<th>${t('children')}</th></tr>`;
  const tr = r =>
    `<tr><td>${esc(r.table)}</td><td>${r.total}</td>${MEALS.map(m => `<td>${r.meals[m] || ''}</td>`).join('')}<td>${r.kids || ''}</td></tr>`;
  modal(`<h2>${t('catTitle')}</h2><div class="tablewrap"><table class="cat">${head}${rows.map(tr).join('')}<tr class="tot">${tr(Object.assign({ table: t('total') }, tot)).slice(4)}</table></div>
  <h3>${t('allergyList')}</h3>${al.length ? `<ul class="al">${al.join('')}</ul>` : `<p class="muted">${t('noAllergies')}</p>`}
  ${(() => {
    const h = (INV.list || []).filter(i => !i.revoked && i.state === 'coming' && i.answer?.allergies);
    return h.length
      ? `<h3>${t('invAllergyList')}</h3><ul class="al">${h.map(i => `<li><b>${esc(i.name)}</b> · ${esc(i.answer.allergies)}</li>`).join('')}</ul>`
      : '';
  })()}
  <div class="row"><button type="button" class="btn primary" id="dlcsv">${t('dlCSV')}</button></div>`);
  $('#dlcsv').onclick = () => {
    const L = [
      ['colTable', 'colSeat', 'colName', 'colMeal', 'colChild', 'colAllergies', 'colSide', 'colGroup'].map(k => t(k))
    ];
    appState.S.tables.forEach(x =>
      x.seats.forEach((id, i) => {
        const g = id && appState.S.guests[id];
        if (g)
          L.push([
            tName(x),
            i + 1,
            g.name,
            t(MEAL_LBL[g.meal] || g.meal),
            g.kid ? t('yes') : '',
            g.allergies,
            g.side ? t(g.side) : '',
            g.group
          ]);
      })
    );
    const csv = '﻿' + L.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    offerFile(fname('-' + t('fileCaterer') + '.csv'), new Blob([csv], { type: 'text/csv' }));
  };
}

/* excel */
async function exportX() {
  try {
    await loadScript(XLSXLIB);
  } catch (e) {
    return toast(t('couldntSave'));
  }
  // Headings and values follow the interface language; the importer reads both languages back.
  const L = [
    ['colName', 'colTable', 'colSeat', 'colGroup', 'colSide', 'colMeal', 'colChild', 'colAllergies'].map(k => t(k))
  ];
  const row = (g, tb, i) => [
    g.name,
    tb,
    i,
    g.group,
    g.side ? t(g.side) : '',
    g.meal ? t(MEAL_LBL[g.meal] || g.meal) : '',
    g.kid ? t('yes') : '',
    g.allergies
  ];
  appState.S.tables.forEach(x =>
    x.seats.forEach((id, i) => {
      const g = id && appState.S.guests[id];
      if (g) L.push(row(g, tName(x), i + 1));
    })
  );
  appState.S.waiting.forEach(id => {
    const g = appState.S.guests[id];
    if (g) L.push(row(g, '', ''));
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(L), t('sheetGuests').slice(0, 31));
  offerFile(
    fname('-' + t('fileGuests') + '.xlsx'),
    new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    })
  );
}
/* ---------------- modal ---------------- */
/* File inputs keep the browser's own control (keyboard, screen readers, drag-and-drop) with the chosen file's name
   shown next to an interface-language button (see js/import.js). */
document.addEventListener(
  'change',
  e => {
    const i = e.target;
    if (i.classList?.contains('fileinput')) {
      const n = document.getElementById(i.id + '-name');
      if (n) n.textContent = i.files[0]?.name || t('noFile');
    }
  },
  true
);
function modal(html) {
  const r = $('#modalroot'),
    back = document.activeElement;
  r.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="mtitle"><div class="box" tabindex="-1">${html.replace('<h2>', '<h2 id="mtitle">')}<div class="row end"><button type="button" class="btn" data-close>${t('close')}</button></div></div></div>`;
  const shut = () => {
    r.innerHTML = '';
    document.removeEventListener('keydown', key, true);
    back && back.focus && back.focus();
  };
  const key = e => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      shut();
    }
    if (e.key === 'Tab') {
      const f = [...r.querySelectorAll('button,[href],input,select,textarea')].filter(el => !el.disabled);
      if (!f.length) return;
      if (e.shiftKey && (document.activeElement === f[0] || !r.contains(document.activeElement))) {
        e.preventDefault();
        f[f.length - 1].focus();
      } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
        e.preventDefault();
        f[0].focus();
      }
    }
  };
  document.addEventListener('keydown', key, true);
  r.querySelector('[data-close]').onclick = shut;
  r.querySelector('.modal').onclick = e => {
    if (e.target.classList.contains('modal')) shut();
  };
  r.querySelector('.box').focus();
  return shut;
}

export { catererModal, dlQR, exportX, fname, isSaving, modal, offerFile, placeCards, planImage, planPdf, savePlan };
