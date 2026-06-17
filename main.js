/**
 * Festerwood — entry point. Loads the save, runs offline catch-up, starts the
 * tick loop, and autosaves. The only module that owns the wall clock (the engine
 * is deliberately clock-agnostic so tests can drive it deterministically).
 */

import { defaultState } from './state.js';
import { recompute, tick, enterArena } from './engine.js';
import { initA11y, announce, setVerbosity } from './a11y.js';
import { load, save } from './save.js';
import { buildUI, render, rotateNews } from './ui.js';
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

// Offline catch-up — only for a genuine returning save.
if (loaded && state.lastTick) {
  const offline = (Date.now() - state.lastTick) / 1000;
  if (offline > 5) {
    tick(state, offline); // capped at BALANCE.OFFLINE_CAP_SECONDS inside
    render(state);
    announce('While you were away, the rot quietly continued. Welcome back.', true);
  }
}
state.lastTick = Date.now();

let last = performance.now();
let saveAcc = 0;
let newsAcc = 0;

function loop(now) {
  const dt = Math.max(0, (now - last) / 1000);
  last = now;

  const events = tick(state, dt);
  for (const e of events) announce(e.text, e.assertive);
  render(state);

  saveAcc += dt;
  if (saveAcc >= BALANCE.AUTOSAVE_SECONDS) { saveAcc = 0; state.lastTick = Date.now(); save(state); }

  newsAcc += dt;
  if (newsAcc >= BALANCE.NEWS_ROTATE_SECONDS) { newsAcc = 0; rotateNews(state); }

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

window.addEventListener('beforeunload', () => { state.lastTick = Date.now(); save(state); });
