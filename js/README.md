# Planner code (`app.html`)

The planner, the public "find my seat" page and the RSVP page are one program made of ES modules. `app.html` loads only `main.js`, which imports the others and then calls `boot()`.

| File | What it holds |
|---|---|
| `main.js` | Entry point: imports every module, exposes `window.__supra` for tests, calls `boot()` |
| `core.js` | Shared helpers (`$`, `esc`, `uid`), text (`t`, `tn`, `UL`), name matching (`skel`), choices (`OPT`, meals, palettes), the character drawing, drawings loading (`loadImages`, `lookImages`), and **`appState`** |
| `state.js` | Plan helpers: `mkGuest`, `normalize`, `markDirty`, `commit`, `undo`, drafts, toasts |
| `layout.js` | Table geometry, "Arrange tables", view rotation, seating rules |
| `draw.js` | Drawing the plan as SVG (`planSVG`) |
| `panels.js` | Top bar, side panels (Event, Guests, Invitations, Share), guest-link settings, inspector, `ICON` |
| `actions.js` | `renderAll`, `renderPlan` and every click, key and input handler in the planner |
| `files.js` | Saving (`savePlan`), downloads (PNG, PDF, place cards, caterer list, CSV, Excel export), the modal |
| `access.js` | Plans: the event's plan (`loadAccess`), the free guest limit used by `commit()`, the Guests-panel meter and the "get the event pass" panel |
| `import.js` | Guest import: reading Excel/CSV (own CSV reader for Georgian text), column detection, the preview with column mapping and duplicates, applying it as one undoable change |
| `history.js` | Version history: the History section of the Event panel, Restore, restore points (`addRestorePoint`) |
| `conflict.js` | Two tabs or devices: the version check behind `savePlan`, the "which version to keep" question, loading a newer plan when the tab comes back |
| `guest.js` | Public "find my seat" page (`/e/<token>`), `route()` |
| `rsvp.js` | Household RSVP page (`/r/<token>`) |
| `listview.js` | List view (C2): "Plan / List" switch (`appState.view`, remembered per device), the plan as tables of guests; rows reuse `clickSeat` / `selectItem` / the waiting list |
| `invites.js` | Invitations tab, `eventCols()`, and answers flowing into the plan (`invRefresh`, `invApply`) |
| `boot.js` | `boot()`: picks the page (planner, guest page or RSVP) and loads its data |

## Rules
1. **Each file imports what it uses and exports what others use.** `import { renderAll } from './actions.js';`. Circular imports are fine for functions.
2. **State that several files change lives in `appState`** (`core.js`): the plan `appState.S`, the selection `appState.sel`, the open `appState.panel`, `appState.MODE` and so on. A module can't reassign another module's variable, so never add a top-level `let` that other files need to change. Add it to `appState` instead. A `let` that only its own file changes is fine and can still be exported for reading.
3. **Nothing runs at load time except definitions and event-listener setup.** Modules run in dependency order, not file order, so code at the top of a file must not call into other files or read their `const`/`let` values. Startup work belongs in `boot()`. (Assigning `onclick = () => …` is fine: it runs later.)
4. **Don't name a local variable `appState`.** It would hide the shared one.
5. Classic scripts loaded before the modules (`config.js`, `assets.js`, `names.js`, `i18n.js`, `brand.js`) put their values on `window` (`SUPRA_CONFIG`, `SUPRA_IMG`, `SupraNames`, `SUPRA_I18N`, `SupraLogo`). Modules use them from there.

A broken import or load-order mistake shows up as a page error in the browser tests (`python3 tests/e2e/run_all.py`): every test fails on any page error.

New code goes in the file for its topic. If a file grows past roughly 400 lines of logic, split it by topic and import from the new file.
