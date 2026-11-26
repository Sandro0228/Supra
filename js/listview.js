/* List view (C2): the same plan as a list, one section per table with its guests in seat order, then the guests
   without a seat. Easier than the drawing on a phone, with a screen reader, or in a 300-guest hall. Rows use the
   plan's own handlers (clickSeat, selectItem, the waiting list), so the inspector does all the editing. */
import { $, MEAL_LBL, SIDE_COL, appState, esc, t, tn } from './core.js';
import { tName } from './state.js';

const VIEW_KEY = 'supra.view';
function storedView() {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'plan';
  } catch (e) {
    return 'plan';
  }
}
function setView(v) {
  appState.view = v === 'list' ? 'list' : 'plan';
  try {
    localStorage.setItem(VIEW_KEY, appState.view);
  } catch (e) {}
}

// "Plan | List" over the canvas
function renderViewSwitch() {
  const sw = $('#viewsw');
  if (!sw) return;
  sw.setAttribute('aria-label', t('lvSwitch'));
  sw.innerHTML = [
    ['plan', 'lvPlan'],
    ['list', 'lvList']
  ]
    .map(
      ([k, l]) =>
        `<button type="button" role="radio" data-view="${k}" aria-checked="${appState.view === k}" tabindex="${appState.view === k ? 0 : -1}">${esc(t(l))}</button>`
    )
    .join('');
  const list = appState.view === 'list';
  $('#canvas').classList.toggle('listmode', list);
  $('#listview').hidden = !list;
}

const sideTxt = g =>
  g.side ? `<i class="dot" style="background:${SIDE_COL[g.side]}" aria-hidden="true"></i>${esc(t(g.side))}` : '';
const mealTxt = g => (g.meal ? esc(t(MEAL_LBL[g.meal] || g.meal)) : '');
function row(g, cells, cls) {
  return `<tr${cls ? ` class="${cls}"` : ''}>${cells}<td class="lvside">${g ? sideTxt(g) : ''}</td><td class="lvgroup">${g ? esc(g.group || '') : ''}</td><td class="lvmeal">${g ? mealTxt(g) : ''}</td><td class="lvallergy">${g ? esc(g.allergies || '') : ''}</td></tr>`;
}
const head = first =>
  `<thead><tr><th scope="col" class="lvnum">${esc(first)}</th><th scope="col">${esc(t('lvGuest'))}</th><th scope="col" class="lvside">${esc(t('lvSide'))}</th><th scope="col" class="lvgroup">${esc(t('lvGroup'))}</th><th scope="col" class="lvmeal">${esc(t('lvMeal'))}</th><th scope="col" class="lvallergy">${esc(t('allergies'))}</th></tr></thead>`;

function tableSection(x) {
  const S = appState.S,
    sel = appState.sel,
    taken = x.seats.filter(Boolean).length,
    free = x.seats.length - taken,
    picked = sel.kind === 'table' && sel.t === x.id,
    hid = 'lvh-' + x.id;
  const rows = x.seats
    .map((id, i) => {
      const g = id && S.guests[id],
        on = sel.kind === 'seat' && sel.t === x.id && sel.i === i,
        label = g ? esc(g.name) : `<span class="muted">${esc(t(appState.waitSel ? 'lvSeatHere' : 'lvEmpty'))}</span>`;
      return row(
        g,
        `<td class="lvnum">${i + 1}</td><td><button type="button" class="lvname" data-lseat="${esc(x.id)}:${i}" aria-current="${on}">${label}</button></td>`,
        (on ? 'on' : '') + (g ? '' : ' empty')
      );
    })
    .join('');
  return `<section class="lvtable${picked ? ' on' : ''}" aria-labelledby="${hid}">
    <h3 id="${hid}"><button type="button" class="lvtname" data-ltable="${esc(x.id)}" aria-current="${picked}">${esc(tName(x))}</button><span class="muted small">${esc(tn('nSeatsTaken', taken))}${free ? ` · ${esc(tn('nFree', free))}` : ''}</span></h3>
    <table class="lvgrid">${head(t('lvSeat'))}<tbody>${rows}</tbody></table></section>`;
}
function waitingSection() {
  const S = appState.S;
  if (!S.waiting.length) return '';
  const rows = S.waiting
    .map(id => {
      const g = S.guests[id];
      if (!g) return '';
      const on = appState.waitSel === id;
      return row(
        g,
        `<td class="lvnum">–</td><td><button type="button" class="lvname" data-wait="${esc(id)}" aria-pressed="${on}">${esc(g.name)}</button></td>`,
        on ? 'on' : ''
      );
    })
    .join('');
  return `<section class="lvtable lvwait" aria-labelledby="lvh-wait"><h3 id="lvh-wait"><span>${esc(t('waitingTitle'))}</span><span class="muted small">${esc(tn('nUnseated', S.waiting.length))}</span></h3>
    <p class="muted small">${esc(t(appState.waitSel ? 'lvPickSeat' : 'lvPickGuest'))}</p>
    <table class="lvgrid">${head('')}<tbody>${rows}</tbody></table></section>`;
}
function renderList() {
  const box = $('#listview');
  if (!box) return;
  const S = appState.S;
  box.setAttribute('aria-label', t('lvA11y'));
  box.innerHTML = `<div class="lvinner">${waitingSection()}${S.tables.map(tableSection).join('')}${
    S.tables.length ? '' : `<p class="muted">${esc(t('lvNoTables'))}</p>`
  }</div>`;
}

export { renderList, renderViewSwitch, setView, storedView };
