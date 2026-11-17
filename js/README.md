# Planner code (`app.html`)

The planner, the public "find my seat" page and the RSVP page are one program split into files by topic. `app.html` loads them in this order:

| File | What it holds |
|---|---|
| `core.js` | Shared helpers (`$`, `esc`, `uid`), text (`t`, `tn`, `UL`), name matching (`skel`), choices (`OPT`, meals, palettes) and the character drawing |
| `state.js` | The plan in memory (`S`), selection, undo history, `markDirty`, drafts, toasts |
| `layout.js` | Table geometry, "Arrange tables", view rotation, seating rules |
| `draw.js` | Drawing the plan as SVG (`planSVG`, `renderPlan`) |
| `panels.js` | Top bar, side panels (Event, Guests, Share), guest-link settings, inspector |
| `actions.js` | `renderAll` and every click, key and input handler in the planner |
| `files.js` | Saving (`savePlan`), downloads (PNG, PDF, place cards, caterer list, CSV), the modal |
| `guest.js` | Public "find my seat" page (`/e/<token>`) |
| `rsvp.js` | Household RSVP page (`/r/<token>`) |
| `boot.js` | Startup: picks the page (planner, guest page or RSVP) and loads its data |

## How the files share code
They are plain scripts, not ES modules. Their top-level `const`, `let` and `function` names live in one shared scope, so any file can use any other file's names inside functions. There is no build step.

Two rules keep that working:
1. **Code that runs while a file loads** (outside any function) may only use names from the **same or an earlier file**. A file can't use a later file's function at load time. Wrap it instead: `$('#save').onclick=()=>savePlan()`, not `=savePlan`. Code inside functions can use anything, because it runs after every file has loaded.
2. **Every top-level name must be unique** across these files and must not clash with a browser global (`opener`, `name`, `status`, `top`, `find`, `close`…). A clash is a `SyntaxError` that stops the page.

A broken rule shows up as a page error in the browser tests (`python3 tests/e2e/run_all.py`): every test fails on any page error.

New code goes in the file for its topic. If a file grows past roughly 400 lines, split it the same way.
