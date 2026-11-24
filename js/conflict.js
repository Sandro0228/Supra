import { $, appState, esc, t } from './core.js';
import { clearDraft, hist, normalize, toast } from './state.js';
import { renderAll } from './actions.js';
import { renderTop } from './panels.js';
import { isSaving, modal, savePlan } from './files.js';
import { addRestorePoint } from './history.js';
/* Two tabs or devices editing one plan (risk R8, migration 010). The server counts plan changes in events.version;
   savePlan() saves only on top of the version it loaded. When another tab or device saved first, nothing is
   overwritten: if this tab has no unsaved changes it quietly loads the newer plan, otherwise the organiser chooses
   which version to keep. Part of the planner (app.html); see js/README.md. */

const sizes = p => ({ g: Object.keys(p?.guests || {}).length, t: (p?.tables || []).length });
const when = iso => {
  try {
    return new Intl.DateTimeFormat(appState.LANG === 'ka' ? 'ka-GE' : 'en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(iso));
  } catch (e) {
    return '';
  }
};
const versioned = () => appState.ROW && appState.ROW.version !== undefined && appState.ROW.version !== null;

async function latestRow() {
  const { data, error } = await appState.SB.from('events').select('*').eq('id', appState.ROW.id).maybeSingle();
  if (error) throw error;
  return data;
}

// The plan from the server replaces this tab's plan. Undo history is dropped: it belongs to the old version.
function adopt(row, keepUndo) {
  if (keepUndo) hist.push(JSON.stringify(appState.S));
  else hist.length = 0;
  appState.S = normalize(row.data && row.data.tables ? row.data : appState.S);
  appState.ROW = row;
  appState.dirty = false;
  appState.conflict = null;
  appState.saveState = 'idle';
  appState.sel = { kind: null };
  clearDraft();
  renderAll();
}

function showConflict(row) {
  appState.conflict = row;
  appState.saveState = 'conflict';
  renderTop();
  const here = sizes(appState.S),
    there = sizes(row.data);
  const shut = modal(`<h2>${esc(t('cfTitle'))}</h2><p>${esc(t('cfBody', { time: when(row.updated_at) }))}</p>
    <dl class="cfcmp"><div><dt>${esc(t('cfHere'))}</dt><dd>${esc(t('cfCount', here))}</dd></div><div><dt>${esc(t('cfThere'))}</dt><dd>${esc(t('cfCount', there))}</dd></div></dl>
    <div class="cfopts">
      <div><button type="button" class="btn primary" data-cf="theirs" aria-describedby="cf-theirs">${esc(t('cfTheirs'))}</button><p class="muted" id="cf-theirs">${esc(t('cfTheirsHint'))}</p></div>
      <div><button type="button" class="btn" data-cf="mine" aria-describedby="cf-mine">${esc(t('cfMine'))}</button><p class="muted" id="cf-mine">${esc(t('cfMineHint'))}</p></div>
    </div>`);
  $('#modalroot [data-cf=theirs]').onclick = () => {
    shut();
    addRestorePoint('conflict', appState.S); // the discarded version stays in the history too
    adopt(row, true);
    toast(t('cfTheirsDone'));
  };
  $('#modalroot [data-cf=mine]').onclick = () => {
    shut();
    appState.ROW.version = row.version;
    appState.ROW.updated_at = row.updated_at;
    appState.conflict = null;
    appState.saveState = 'idle';
    savePlan();
  };
  $('#modalroot [data-cf=theirs]').focus();
}

// A save found a newer version (or the organiser pressed Save while a choice is pending): ask with the latest row.
async function resolveConflict() {
  let row;
  try {
    row = await latestRow();
  } catch (e) {
    row = null;
  }
  if (!row) {
    appState.saveState = 'error';
    renderTop();
    toast(t('couldntSave'));
    return;
  }
  if (!appState.dirty && !appState.conflict) adopt(row);
  else showConflict(row);
}

// Coming back to the tab: has the plan been saved elsewhere meanwhile?
let checking = false;
async function checkRemote() {
  if (checking || appState.MODE !== 'edit' || appState.readOnly || !versioned() || !appState.SB) return;
  if (appState.conflict || isSaving() || document.querySelector('#modalroot .modal')) return;
  checking = true;
  try {
    const { data, error } = await appState.SB.from('events').select('version').eq('id', appState.ROW.id).maybeSingle();
    if (error || !data || data.version === appState.ROW.version || isSaving()) return;
    const row = await latestRow();
    if (!row || row.version === appState.ROW.version) return;
    if (appState.dirty) showConflict(row);
    else {
      adopt(row);
      toast(t('cfUpdated'));
    }
  } catch (e) {
    /* offline: the next save will find out */
  } finally {
    checking = false;
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkRemote();
});
window.addEventListener('focus', () => checkRemote());

export { checkRemote, resolveConflict, showConflict, versioned };
