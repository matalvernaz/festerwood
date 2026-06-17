/**
 * Festerwood — headless determinism / sanity test.
 *
 * Run: node test/sim.mjs
 *
 * break_eternity is a UMD bundle, so we require() it and install it as the
 * global `Decimal` BEFORE importing any game module (they reference the global,
 * exactly as the browser does via the <script> tag). Then we drive the pure
 * engine and assert the loop, the lethality-vs-spread tension, and prestige.
 */

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
globalThis.Decimal = require('../vendor/break_eternity.min.js');

const { defaultState } = await import('../state.js');
const {
  recompute, tick, buyGenerator, cough, expand, canExpand,
} = await import('../engine.js');

let fails = 0;
function assert(cond, msg) {
  if (cond) { console.log('  ok  —', msg); } else { console.error('  FAIL —', msg); fails++; }
}

console.log('Festerwood sim test\n');

// --- core loop ----------------------------------------------------------
{
  const s = defaultState();
  recompute(s);

  cough(s);
  assert(s.spores.gte(1), 'a cough yields at least one spore');
  assert(s.population.infected >= 1 || s.population.susceptible < s.population.total, 'a cough seeds an infection');

  s.spores = new Decimal(1e6);
  const r = buyGenerator(s, 'mold', new Decimal(10));
  assert(r.bought.gte(1), 'can buy Mold with spores');

  const before = s.spores;
  tick(s, 10);
  assert(s.spores.gt(before), 'spores are produced over time');
  assert(s.totalDeadThisRun.gte(0), 'deaths are tracked');
}

// --- buy max ------------------------------------------------------------
{
  const s = defaultState();
  recompute(s);
  s.spores = new Decimal(1e9);
  const r = buyGenerator(s, 'mold', 'max');
  assert(r.bought.gt(10), 'buy-max buys a sensible bulk amount');
  assert(s.spores.gte(0), 'buy-max never overspends into the negative');
}

// --- the central tension: dead hosts don't spread -----------------------
function run(lethalMult) {
  const t = defaultState();
  recompute(t);
  t.spores = new Decimal(1e9);
  buyGenerator(t, 'mold', new Decimal(50));
  t.mult.infectivity = new Decimal(5); // make it spread briskly
  t.mult.lethality = new Decimal(lethalMult);
  cough(t);
  let peakInfected = 0;
  for (let i = 0; i < 200; i++) {
    tick(t, 1);
    peakInfected = Math.max(peakInfected, t.population.infected);
  }
  return { peakInfected, dead: t.population.dead };
}
{
  const mild = run(1);
  const lethal = run(25);
  console.log(`     mild peak infected:   ${mild.peakInfected.toFixed(1)}`);
  console.log(`     lethal peak infected: ${lethal.peakInfected.toFixed(1)}`);
  assert(lethal.peakInfected < mild.peakInfected, 'higher lethality => smaller infected peak (dead hosts stop spreading)');
}

// --- prestige -----------------------------------------------------------
{
  const e = defaultState();
  recompute(e);
  e.population.dead = e.population.total;
  e.population.susceptible = 0;
  e.population.infected = 0;
  assert(canExpand(e), 'an exhausted arena allows Expand');
  const res = expand(e);
  assert(res !== null && e.arenaIndex === 1, 'Expand advances to the next arena');
  assert(e.stats.highestArena === 1, 'Expand records the highest arena reached');
}

// --- big-number speech sanity (no NaN / no raw "ee" leaking) -------------
{
  const { speakNumber, fmt } = await import('../a11y.js');
  const samples = [new Decimal(42), new Decimal(1.5e6), new Decimal('1e45'), new Decimal('1e1000'), Decimal.pow(10, new Decimal('1e20'))];
  let allGood = true;
  for (const d of samples) {
    const spoken = speakNumber(d);
    const vis = fmt(d);
    if (/NaN|undefined/.test(spoken) || /NaN|undefined/.test(vis)) allGood = false;
    console.log(`     ${vis}  ->  "${spoken}"`);
  }
  assert(allGood, 'speakNumber/fmt render every scale without NaN/undefined');
}

console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
process.exit(fails ? 1 : 0);
