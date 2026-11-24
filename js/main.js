/* Entry point of the planner, the guest page and the RSVP page (app.html loads only this file).
   Importing every module first means they have all run before boot() starts; see js/README.md. */
import './core.js';
import './state.js';
import './layout.js';
import './draw.js';
import './panels.js';
import './actions.js';
import './files.js';
import './conflict.js';
import './access.js';
import './history.js';
import './guest.js';
import './rsvp.js';
import './invites.js';
import { boot } from './boot.js';
import { planSVG } from './draw.js';
import { catererModal } from './files.js';

// For the browser tests and for debugging in the console.
window.__supra = { planSVG, catererModal };

boot();
