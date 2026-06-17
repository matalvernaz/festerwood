/**
 * Festerwood — headless DOM smoke + progressive-disclosure test.
 *
 * Stubs the DOM surface ui.js/a11y.js use, then drives buildUI()/render()
 * against real state and asserts: nothing throws, and content is hidden until
 * earned then revealed + announced on threshold.
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
globalThis.document = {
  getElementById: id => byId[id] || (byId[id] = new El()),
  createElement: t => new El(t),
  addEventListener: () => {},
};
globalThis.window = { confirm: () => true, addEventListener: () => {} };
globalThis.requestAnimationFrame = () => 0;
globalThis.performance = { now: () => 0 };
globalThis.localStorage = { _m: new Map(), getItem(k) { return this._m.has(k) ? this._m.get(k) : null; }, setItem(k, v) { this._m.set(k, v); }, removeItem(k) { this._m.delete(k); } };
const wait = ms => new Promise(r => setTimeout(r, ms));

const { defaultState } = await import('../state.js');
const E = await import('../engine.js');
const { initA11y } = await import('../a11y.js');
const { buildUI, render } = await import('../ui.js');

let fails = 0;
const assert = (c, m) => { if (c) console.log('  ok  —', m); else { console.error('  FAIL —', m); fails++; } };

console.log('Festerwood DOM smoke + disclosure test\n');

const s = defaultState();
E.recompute(s);
initA11y();
buildUI(s);
render(s);

assert(byId['gen-list'].children.length === 4, 'four generator cards built');
assert(byId['mut-tree'].children.length > 0, 'mutation tree built');
assert(byId['status-line']._text.includes('Spores'), 'status line populated');

// --- disclosure: fresh game hides everything not yet relevant ---
assert(byId['mut-sec'].hidden === true, 'Mutation section hidden at start');
assert(byId['perk-sec'].hidden === true, 'Strains section hidden at start');
assert(byId['ach-sec'].hidden === true, 'Achievements section hidden at start');
assert(byId['gen-list'].children[0].hidden === false, 'Mold (tier 0) shown at start');
assert(byId['gen-list'].children[1].hidden === true, 'Fungus hidden at start');

// --- reveal on thresholds ---
s.stats.maxSpores = new Decimal(200); // >= 50% of Fungus baseCost (120)
render(s);
assert(byId['gen-list'].children[1].hidden === false, 'Fungus revealed once spores approach its cost');

s.stats.totalDeadAllTime = new Decimal(5); // first death
render(s);
assert(byId['mut-sec'].hidden === false, 'Mutation section revealed after first death');

s.stats.witherCount = 1; // first wither
render(s);
assert(byId['perk-sec'].hidden === false, 'Strains section revealed after first Wither');

s.achievements = { firstblood: true };
render(s);
assert(byId['ach-sec'].hidden === false, 'Achievements section revealed after first achievement');

await wait(60);
assert(/Unlocked:/.test(byId['sr-polite']._text), 'a reveal was announced to the screen reader');

// --- wealthy state still renders without throwing; Expand surfaces when cleared ---
s.spores = new Decimal(1e9); s.biomass = new Decimal(1e4); s.strains = new Decimal(1e6);
E.buyGenerator(s, 'mold', 'max');
E.buyMutation(s, 't1');
for (let i = 0; i < 30; i++) E.buyPerk(s, 'sporous');
render(s);
assert(true, 'render survives wealthy state (no throw)');

s.population.dead = s.population.total; s.population.susceptible = 0; s.population.infected = 0;
render(s);
assert(byId['expand-btn'].hidden === false, 'Expand button shows when arena is cleared');

console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nDOM SMOKE + DISCLOSURE PASSED');
process.exit(fails ? 1 : 0);
