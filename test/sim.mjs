/**
 * Festerwood — headless sim, sanity, and pacing test (pure idle model).
 *
 * Run: node test/sim.mjs
 *
 * break_eternity is a UMD bundle, so we require() it and install it as the global
 * `Decimal` BEFORE importing any game module. Then we drive the pure engine and
 * assert the self-replicating loop, evolutions, prestige, and an idle pacing
 * harness (balance.js constants are tuned from its output).
 */

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
globalThis.Decimal = require('../vendor/break_eternity.min.js');

const { defaultState } = await import('../state.js');
const {
  recompute, tick, cough, spreadRate, biomassRate, currentVirulence,
  canBuyEvolution, buyEvolution, canBuyPerk, buyPerk, autoBuy,
  canWither, wither, witherGain,
  canMutate, mutate, mutateGain, canBuyMeta, buyMeta,
} = await import('../engine.js');
const { EVOLUTIONS } = await import('../content.js');
const { BALANCE } = await import('../balance.js');

let fails = 0;
function assert(cond, msg) {
  if (cond) { console.log('  ok  —', msg); } else { console.error('  FAIL —', msg); fails++; }
}
const finite = d => d instanceof Decimal && !Number.isNaN(d.mantissa) && d.mantissa !== Infinity;

console.log('Festerwood sim test\n');

// --- core idle loop: the plague self-replicates with no input ----------------
{
  const s = defaultState();
  recompute(s);
  const start = s.infected;
  tick(s, 10);
  assert(s.infected.gt(start), 'infected grows on its own (self-replicating, idle)');
  assert(s.biomass.gt(0), 'the infected shed biomass');
  assert(s.peakInfectedThisRun.gte(s.infected), 'peak infected tracks the climb');

  const before = s.infected;
  cough(s);
  assert(s.infected.gt(before), 'a cough adds a burst of infected');
}

// --- growth is PACED, not runaway -------------------------------------------
{
  const s = defaultState();
  recompute(s);
  tick(s, 3600); // an hour at base multipliers
  assert(finite(s.infected) && s.infected.gt(1), 'an hour of growth stays finite (no NaN/Infinity)');
  assert(s.infected.lt(new Decimal('1e12')), 'paced: an hour at base rate does NOT explode to infinity');
}

// --- evolutions: repeatable, levelled, both multipliers ----------------------
{
  const s = defaultState();
  recompute(s);
  s.biomass = new Decimal(1e9);
  const spread0 = s.mult.spread.toNumber();
  const bio0 = s.mult.biomass.toNumber();

  assert(canBuyEvolution(s, 'contagion') && buyEvolution(s, 'contagion'), 'Contagion is buyable with biomass');
  assert(s.evolutions.contagion === 1 && s.mult.spread.toNumber() > spread0, 'Contagion levels up and raises spread');
  const c0 = EVOLUTIONS.find(e => e.id === 'contagion').cost(0);
  const c1 = EVOLUTIONS.find(e => e.id === 'contagion').cost(1);
  assert(c1 > c0, 'each Contagion level costs more than the last');

  buyEvolution(s, 'potency');
  assert(s.mult.biomass.toNumber() > bio0, 'Potency raises biomass yield');
}

// --- prestige: Wither pays on peak infected, resets run, keeps perks ---------
{
  const s = defaultState();
  recompute(s);
  s.peakInfectedThisRun = new Decimal(1e9);
  s.biomass = new Decimal(500);
  buyEvolution(s, 'contagion');

  const preview = witherGain(s);
  assert(preview.gt(0), 'a productive run previews a positive Wither payout');
  assert(canWither(s), 'can Wither after real progress');

  wither(s);
  assert(s.strains.gte(preview), 'Wither banks the previewed strains');
  assert(s.biomass.eq(0) && Object.keys(s.evolutions).length === 0, 'Wither resets biomass + evolutions');
  assert(s.infected.eq(BALANCE.START_INFECTED) && s.peakInfectedThisRun.eq(BALANCE.START_INFECTED), 'Wither reseeds the infection');
  assert(s.stats.witherCount === 1, 'Wither is counted');

  const v0 = currentVirulence(s).toNumber();
  s.strains = new Decimal(1e6);
  assert(canBuyPerk(s, 'virulence') && buyPerk(s, 'virulence'), 'Virulence is buyable with strains');
  assert(currentVirulence(s).toNumber() > v0, 'Virulence raises the permanent spread multiplier');
}

// --- second prestige: Mutate resets layer 1 for Genome; Adaptations persist --
{
  const s = defaultState();
  recompute(s);
  s.strains = new Decimal(1e6);
  s.perks.virulence = 5;
  s.perks.autobuy = 1; // meta perk — should survive Mutate
  recompute(s);

  assert(canMutate(s) && mutateGain(s).gt(0), 'Mutate unlocks once strains are banked');
  const g = mutateGain(s);
  mutate(s);
  assert(s.genome.gte(g), 'Mutate banks the previewed genome');
  assert(s.strains.eq(0) && !s.perks.virulence, 'Mutate resets strains and Virulence (layer 1)');
  assert(s.perks.autobuy === 1, 'Autocatalysis (meta) survives Mutate');
  assert(s.infected.eq(BALANCE.START_INFECTED), 'Mutate reseeds the infection');

  s.genome = new Decimal(100);
  const spread0 = s.mult.spread.toNumber();
  assert(canBuyMeta(s, 'adaptation') && buyMeta(s, 'adaptation'), 'Adaptation is buyable with genome');
  assert(s.mult.spread.toNumber() > spread0, 'Adaptation raises the spread multiplier');
  s.strains = new Decimal(1e6); recompute(s);
  mutate(s);
  assert((s.metaPerks.adaptation || 0) >= 1, 'Adaptation survives a Mutate');
}

// --- automation: Autocatalysis auto-buys evolutions in the tick --------------
{
  const s = defaultState();
  recompute(s);
  s.biomass = new Decimal(1e6);
  tick(s, 0.1);
  assert((s.evolutions.contagion || 0) === 0 && (s.evolutions.potency || 0) === 0, 'no auto-buy without Autocatalysis');

  s.perks.autobuy = 1;
  recompute(s);
  s.biomass = new Decimal(1e6);
  const n = autoBuy(s);
  assert(n > 0 && ((s.evolutions.contagion || 0) > 0 || (s.evolutions.potency || 0) > 0), 'Autocatalysis auto-buys evolutions');
  assert(s.biomass.lt(1e6), 'auto-buy actually spends biomass');
}

// --- idle pacing harness -----------------------------------------------------
// A greedy bot: each sim-second buy every affordable evolution + Virulence, and
// Wither when a Wither would at least double total strains. Prints pacing; the
// balance constants are tuned from this. Asserts the loop converges and climbs.
const STEP = 1;
const BUDGET = 3 * 3600; // 3 sim-hours

function buyAll(s) {
  let any = true;
  while (any) {
    any = false;
    for (const e of EVOLUTIONS) if (canBuyEvolution(s, e.id)) { buyEvolution(s, e.id); any = true; }
    while (canBuyPerk(s, 'virulence')) { buyPerk(s, 'virulence'); any = true; }
    if (canBuyPerk(s, 'autobuy')) { buyPerk(s, 'autobuy'); any = true; }
    while (canBuyMeta(s, 'adaptation')) { buyMeta(s, 'adaptation'); any = true; }
  }
}

function climb() {
  const s = defaultState();
  recompute(s);
  let t = 0, withers = 0, firstWither = null;
  let monotoneOk = true;
  for (; t < BUDGET; t += STEP) {
    buyAll(s);
    const before = s.infected;
    tick(s, STEP);
    if (s.infected.lt(before)) monotoneOk = false; // infected only ever climbs within a run
    const gain = witherGain(s);
    if (canWither(s) && gain.gte(1) && gain.gt(s.strains)) { // wither when it at least doubles strains
      wither(s);
      withers++;
      if (firstWither == null) firstWither = t;
    }
  }
  return {
    t, withers, firstWither, monotoneOk,
    virulence: s.perks.virulence || 0,
    strains: s.strains,
    peak: s.stats.peakInfectedAllTime,
  };
}

{
  const r = climb();
  const mins = x => x == null ? 'never' : (x / 60).toFixed(1) + 'm';
  console.log(`     time to first Wither: ${mins(r.firstWither)}`);
  console.log(`     withers in ${BUDGET / 3600}h: ${r.withers}`);
  console.log(`     final Virulence level: ${r.virulence}`);
  console.log(`     final strains: ${r.strains.toString()}`);
  console.log(`     peak infected (all time): ${r.peak.toString()}`);

  assert(r.monotoneOk, 'infected only ever climbs within a run (numbers go up)');
  assert(r.firstWither != null && r.firstWither > 60, 'first Wither is reachable but not instant');
  assert(r.withers >= 2, 'the prestige loop runs more than once over a few hours');
  assert(r.virulence > 0, 'Virulence compounds across withers');
  assert(finite(r.peak) && finite(r.strains), 'no NaN/Infinity after a long idle climb');
}

// --- determinism -------------------------------------------------------------
{
  const a = climb();
  const b = climb();
  assert(a.withers === b.withers && a.virulence === b.virulence, 'two identical climbs produce identical pacing');
}

// --- big-number speech sanity (no NaN / no raw "ee" leaking) ------------------
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
