import { appState, esc, t } from './core.js';
import { commit, normalize, toast } from './state.js';
import { renderLeft } from './panels.js';
/* Version history (migration 013). The server keeps earlier versions of the plan (automatically at most every
   30 minutes while saving, and restore points before risky steps). The Event panel lists them; Restore loads one as
   a normal, undoable change that saves like any other (with the 010 version check), and is never refused by the
   free guest limit. Part of the planner (app.html); see js/README.md. */

const H = { list: null, loading: false, err: false };
const REASON = {
  auto: 'verAuto',
  manual: 'verManual',
  import: 'verImport',
  clear: 'verClear',
  conflict: 'verConflict',
  restore: 'verRestore'
};
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

async function loadVersions() {
  if (!appState.SB || !appState.ROW || H.loading) return;
  H.loading = true;
  const { data, error } = await appState.SB.from('event_versions')
    .select('id,saved_at,reason,guests,tables')
    .eq('event_id', appState.ROW.id)
    .order('saved_at', { ascending: false })
    .limit(60);
  H.loading = false;
  H.err = !!error;
  H.list = error ? null : data || [];
  if (appState.panel === 'event') renderLeft();
}

// A copy of the plan as this tab has it (or as saved, when data is omitted). Failures are quiet: history is a safety
// net, and an older database without migration 013 simply has none.
async function addRestorePoint(reason, data) {
  if (!appState.SB || !appState.ROW || appState.readOnly) return false;
  try {
    const { error } = await appState.SB.rpc('add_restore_point', {
      p_event: appState.ROW.id,
      p_reason: reason,
      p_data: data ? JSON.parse(JSON.stringify(data)) : null
    });
    if (!error && H.list) loadVersions();
    return !error;
  } catch (e) {
    return false;
  }
}

function historyBody() {
  const items = H.err
    ? `<p class="muted small" role="alert">${esc(t('verErr'))}</p>`
    : H.list === null
      ? `<p class="muted small" role="status">${esc(t('verLoading'))}</p>`
      : H.list.length
        ? `<ul class="verlist" role="list">${H.list
            .map(
              v =>
                `<li><div class="vmain"><span>${esc(when(v.saved_at))}</span><span class="muted small">${esc(t(REASON[v.reason] || 'verAuto'))} · ${esc(t('cfCount', { g: v.guests, t: v.tables }))}</span></div><button type="button" class="btn sm" data-ver="${v.id}" aria-label="${esc(t('verRestoreBtn') + ': ' + when(v.saved_at))}">${esc(t('verRestoreBtn'))}</button></li>`
            )
            .join('')}</ul>`
        : `<p class="muted small">${esc(t('verEmpty'))}</p>`;
  return `<p class="muted small">${esc(t('verHint'))}</p>${items}<div class="row"><button type="button" class="btn sm" data-act="ver-save">${esc(t('verSave'))}</button></div>`;
}

async function saveVersionNow(btn) {
  if (btn) btn.disabled = true;
  const ok = await addRestorePoint('manual', appState.S);
  if (btn) btn.disabled = false;
  toast(t(ok ? 'verSaved' : 'verErr'));
}

async function restoreVersion(id) {
  const v = (H.list || []).find(x => String(x.id) === String(id));
  const { data, error } = await appState.SB.from('event_versions').select('data').eq('id', id).maybeSingle();
  if (error || !data || !data.data || !Array.isArray(data.data.tables)) {
    toast(t('verErr'));
    return;
  }
  addRestorePoint('restore', appState.S);
  commit(
    () => {
      appState.S = normalize(JSON.parse(JSON.stringify(data.data)));
      appState.sel = { kind: null };
    },
    { allowOver: true }
  );
  toast(t('verRestored', { time: v ? when(v.saved_at) : '' }));
}

export { addRestorePoint, historyBody, loadVersions, restoreVersion, saveVersionNow };
