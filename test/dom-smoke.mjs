/**
 * Festerwood — headless DOM smoke test.
 *
 * A browser can't be launched here, so we stub exactly the DOM surface ui.js and
 * a11y.js touch, then actually run buildUI()/render() against real game state
 * across the interesting branches (locked vs affordable mutations, a maxed perk,
 * an exhausted arena). This won't prove NVDA behaviour, but it proves the build
 * and render paths don't throw and do populate the accessible text.
 *
 * Run: node test/dom-smoke.mjs
 */

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
globalThis.Decimal = require('../vendor/break_eternity.min.js');

class El {
  constructor(tag) {
    this.tagName = (tag || 'div').toUpperCase();
    this.children = []; this.dataset = {}; this.style = {};
    this._text = ''; this._html = '';
    this.disabled = false; this.hidden = false; this.className = ''; this.value = ''; this.type = ''; this.id = '';
    this._listeners = {};
  }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text; }
  set innerHTML(v) { this._html = String(v); this.children = []; }
  get innerHTML() { return this._html; }
  append(...k) { this.children.push(...k); }
  appendChild(k) { this.children.push(k); return k; }
  addEventListener(t, fn) { (this._listeners[t] ||= []).push(fn); }
  focus() {} select() {} closest() { return null; }
}

const byId = {};
const IDS = ['status-line', 'arena-line', 'biomass-line', 'strain-line', 'gen-list', 'mut-tree',
  'perk-list', 'ach-list', 'expand-btn', 'wither-btn', 'news', 'save-io', 'verbosity',
  'cough-btn', 'status-btn', 'export-btn', 'import-btn', 'hardreset-btn', 'help', 'sr-polite', 'sr-assertive'];
for (const id of IDS) { const e = new El('div'); e.id = id; byId[id] = e; }

globalThis.document = {
  getElementById: id => byId[id] || (byId[id] = new El('div')),
  createElement: t => new El(t),
  addEventListener: () => {},
};
globalThis.window = { confirm: () => true, addEventListener: () => {} };
globalThis.requestAnimationFrame = () => 0;
globalThis.performance = { now: () => 0 };
globalThis.localStorage = {
  _m: new Map(),
  getItem(k) { return this._m.has(k) ? this._m.get(k) : null; },
  setItem(k, v) { this._m.set(k, v); },
  removeItem(k) { this._m.delete(k); },
};

const { defaultState } = await import('../state.js');
const E = await import('../engine.js');
const { initA11y } = await import('../a11y.js');
const { buildUI, render, rotateNews } = await import('../ui.js');

let fails = 0;
const assert = (c, m) => { if (c) console.log('  ok  —', m); else { console.error('  FAIL —', m); fails++; } };

console.log('Festerwood DOM smoke test\n');

const s = defaultState();
E.recompute(s);
initA11y();
buildUI(s);
render(s);

assert(byId['gen-list'].children.length === 4, 'four generator cards built');
assert(byId['mut-tree'].children.length > 0, 'mutation tree built');
assert(byId['perk-list'].children.length === 4, 'four perk cards built');
assert(byId['status-line']._text.includes('Spores'), 'status line populated');

// Wealthy mid-game: exercises affordable buttons, an owned mutation + unlocked child.
s.spores = new Decimal(1e9);
s.biomass = new Decimal(1e4);
s.strains = new Decimal(1e9);
E.buyGenerator(s, 'mold', 'max');
E.buyMutation(s, 't1');
for (let i = 0; i < 30; i++) E.buyPerk(s, 'sporous'); // hits the maxed-perk branch
render(s);
assert(true, 'render survives wealthy state (no throw)');

// Exhaust the arena to surface the Expand button.
s.population.dead = s.population.total;
s.population.susceptible = 0;
s.population.infected = 0;
render(s);
assert(byId['expand-btn'].hidden === false, 'Expand button shows when arena is cleared');

rotateNews(s);
assert(byId['news']._text.length > 0, 'news ticker populated');

console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nDOM SMOKE PASSED');
process.exit(fails ? 1 : 0);
