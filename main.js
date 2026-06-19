/**
 * Festerwood — entry point. Loads the save, runs offline catch-up, starts the
 * tick loop, and autosaves. The only module that owns the wall clock (the engine
 * is deliberately clock-agnostic so tests can drive it deterministically).
 */

import { defaultState } from './state.js';
import { recompute, tick } from './engine.js';
import { initA11y, announce, setVerbosity, fmt, speakNumber } from './a11y.js';
import { load, save } from './save.js';
import { buildUI, render, rotateNews, pushRecent } from './ui.js';
import { BALANCE } from './balance.js';

const loaded = load();
const state = loaded || defaultState();

recompute(state);
setVerbosity(state.settings.announceVerbosity);

initA11y();
buildUI(state);
render(state);

let greeted = false;

// First load under the v3 remake: announce once, and skip offline catch-up — the
// run was reset, so there is nothing meaningful to catch up on.
if (state._worldRemade) {
  announce('Festerwood has been remade as a pure idle plague. Your banked strains carried over; the infection begins fresh.', true);
  pushRecent(state, 'The world was remade — a pure idle plague now. Banked strains carried over.');
  delete state._worldRemade;
  greeted = true;
} else if (loaded && state.lastTick) {
  // Offline catch-up — only for a genuine returning save.
  const offline = (Date.now() - state.lastTick) / 1000;
  if (offline > 5) {
    const before = { infected: state.infected, biomass: state.biomass };
    tick(state, offline); // capped at BALANCE.OFFLINE_CAP_SECONDS inside
    render(state);
    const mins = offline < 90 ? `${Math.round(offline)}s` : offline < 5400 ? `${Math.round(offline / 60)}m` : `${Math.round(offline / 3600)}h`;
    const msg = `Welcome back. While you were away (${mins}): the infected grew by ${fmt(state.infected.sub(before.infected))}, and you banked ${fmt(state.biomass.sub(before.biomass))} biomass.`;
    announce(msg, true);
    pushRecent(state, msg);
    greeted = true;
  }
}
// Orient a screen-reader user on arrival — otherwise the page is silent on load.
if (!greeted) {
  announce('Festerwood. You are a small and ambitious disease. It spreads on its own; press C to cough it along, S to hear your status, and the question mark key for help.', true);
}
state.lastTick = Date.now();

let last = performance.now();
let saveAcc = 0;
let newsAcc = 0;

/** Announce each new power-of-a-thousand the infected count crosses (idle satisfaction, debounced). */
function checkMilestones() {
  if (state.infected.lt(Decimal.pow(10, state.milestonePow))) return;
  let p = state.milestonePow;
  while (state.infected.gte(Decimal.pow(10, p + 3)) && p < 3003) p += 3; // jump to the top crossed (no spam on offline)
  state.milestonePow = p + 3;
  const reached = Decimal.pow(10, p);
  announce(`Milestone: ${speakNumber(reached)} infected.`);
  pushRecent(state, `Reached ${fmt(reached)} infected.`);
}

function loop(now) {
  const dt = Math.max(0, (now - last) / 1000);
  last = now;

  const events = tick(state, dt);
  for (const e of events) { announce(e.text, e.assertive); pushRecent(state, e.text); }
  checkMilestones();
  render(state);

  saveAcc += dt;
  if (saveAcc >= BALANCE.AUTOSAVE_SECONDS) { saveAcc = 0; state.lastTick = Date.now(); save(state); }

  newsAcc += dt;
  if (newsAcc >= BALANCE.NEWS_ROTATE_SECONDS) { newsAcc = 0; rotateNews(state); }

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

window.addEventListener('beforeunload', () => { state.lastTick = Date.now(); save(state); });
