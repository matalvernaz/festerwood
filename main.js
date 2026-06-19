/**
 * Festerwood — entry point. Loads the save, runs offline catch-up, starts the
 * tick loop, and autosaves. The only module that owns the wall clock (the engine
 * is deliberately clock-agnostic so tests can drive it deterministically).
 */

import { defaultState } from './state.js';
import { recompute, tick, enterArena } from './engine.js';
import { ARENAS } from './content.js';
import { initA11y, announce, setVerbosity, fmt } from './a11y.js';
import { load, save } from './save.js';
import { buildUI, render, rotateNews, pushRecent } from './ui.js';
import { BALANCE } from './balance.js';

const loaded = load();
const state = loaded || defaultState();

// A save from before population existed, or a brand-new game: seat the arena.
if (!state.population || !state.population.total) enterArena(state, state.arenaIndex || 0);

recompute(state);
setVerbosity(state.settings.announceVerbosity);

initA11y();
buildUI(state);
render(state);

let greeted = false;

// First load under the v2 remake: announce once, and skip offline catch-up — the
// run was reset, so there is nothing meaningful to catch up on.
if (state._worldRemade) {
  announce('Festerwood has been remade, smaller and meaner. Your banked strains carried over; everything else begins fresh.', true);
  pushRecent(state, 'The world was remade — smaller and meaner. Banked strains carried over.');
  delete state._worldRemade;
  greeted = true;
} else if (loaded && state.lastTick) {
  // Offline catch-up — only for a genuine returning save.
  const offline = (Date.now() - state.lastTick) / 1000;
  if (offline > 5) {
    const before = { biomass: state.biomass, dead: state.stats.totalDeadAllTime };
    const evs = tick(state, offline); // capped at BALANCE.OFFLINE_CAP_SECONDS inside
    render(state);
    const mins = offline < 90 ? `${Math.round(offline)}s` : offline < 5400 ? `${Math.round(offline / 60)}m` : `${Math.round(offline / 3600)}h`;
    let msg = `Welcome back. While you were away (${mins}): +${fmt(state.biomass.sub(before.biomass))} biomass, ${fmt(state.stats.totalDeadAllTime.sub(before.dead))} more dead.`;
    const cleared = evs.find(e => e.type === 'arena' || e.type === 'victory');
    if (cleared) msg += ' ' + cleared.text;
    announce(msg, true);
    pushRecent(state, msg);
    greeted = true;
  }
}
// Orient a screen-reader user on arrival — otherwise the page is silent on load.
if (!greeted) {
  announce('Festerwood. You are a small and ambitious disease. Press C to cough, S to hear your status, and the question mark key for help.', true);
}
state.lastTick = Date.now();

let last = performance.now();
let saveAcc = 0;
let newsAcc = 0;

function loop(now) {
  const dt = Math.max(0, (now - last) / 1000);
  last = now;

  const events = tick(state, dt);
  for (const e of events) { announce(e.text, e.assertive); pushRecent(state, e.text); }
  render(state);

  saveAcc += dt;
  if (saveAcc >= BALANCE.AUTOSAVE_SECONDS) { saveAcc = 0; state.lastTick = Date.now(); save(state); }

  newsAcc += dt;
  if (newsAcc >= BALANCE.NEWS_ROTATE_SECONDS) { newsAcc = 0; rotateNews(state); }

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

window.addEventListener('beforeunload', () => { state.lastTick = Date.now(); save(state); });
