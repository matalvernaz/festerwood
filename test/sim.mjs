/**
 * Festerwood — headless sim, sanity, and pacing test.
 *
 * Run: node test/sim.mjs
 *
 * break_eternity is a UMD bundle, so we require() it and install it as the
 * global `Decimal` BEFORE importing any game module (they reference the global,
 * exactly as the browser does via the <script> tag). Then we drive the pure
 * engine and assert the single-engine loop, evolutions, prestige, and a
 * greedy-bot pacing harness (constants in balance.js are tuned from its output).
 */

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
globalThis.Decimal = require('../vendor/break_eternity.min.js');

const { defaultState } = await import('../state.js');
const {
  recompute, tick, cough, expand, canExpand,
  canBuyEvolution, buyEvolution, canBuyPerk, buyPerk,
  canWither, wither, witherGain, currentVirulence,
} = await import('../engine.js');
const { EVOLUTIONS, ARENAS } = await import('../content.js');
const { isArenaExhausted } = await import('../population.js');
const { BALANCE } = await import('../balance.js');

const LAST = ARENAS.length - 1;

let fails = 0;
function assert(cond, msg) {
  if (cond) { console.log('  ok  —', msg); } else { console.error('  FAIL —', msg); fails++; }
}

console.log('Festerwood sim test\n');

// --- core loop: infection is the only engine ---------------------------------
{
  const s = defaultState();
  recompute(s);

  const r = cough(s);
  assert(r.seeded >= 1, 'a cough seeds an infection');
  assert(s.population.susceptible < s.population.total, 'seeding moves a host out of susceptible');

  tick(s, 10);
  assert(s.biomass.gt(0), 'spreading alone earns biomass (no producers needed)');
  assert(s.totalEverInfectedThisRun.gt(0), 'ever-infected is tracked (the prestige metric)');
  assert(s.totalDeadThisRun.gte(0), 'deaths are tracked');
}

// --- single-engine clear: an arena clears from the epidemic alone ------------
function clearTime(infectivityMult, maxSeconds = 600) {
  const s = defaultState();
  recompute(s);
  s.mult.infectivity = new Decimal(infectivityMult);
  cough(s);
  let t = 0;
  while (t < maxSeconds && !isArenaExhausted(s.population)) { tick(s, 1); t += 1; }
  return { cleared: isArenaExhausted(s.population), t };
}
{
  const slow = clearTime(1);
  const fast = clearTime(20);
  assert(slow.cleared, 'the Henderson Household clears with no evolutions at all');
  console.log(`     clear @×1: ${slow.t}s,  clear @×20: ${fast.t}s`);
  assert(fast.t <= slow.t, 'more infectivity clears at least as fast (faster spread is simply better)');
}

// --- flat evolutions: no tree, buy in any order ------------------------------
{
  const s = defaultState();
  recompute(s);
  s.biomass = new Decimal(1e12);
  const before = s.mult.infectivity.toNumber();

  assert(canBuyEvolution(s, 'e0'), 'first evolution is buyable with biomass');
  buyEvolution(s, 'e0');
  assert(s.mult.infectivity.toNumber() > before, 'buying an evolution raises infectivity');

  // No prerequisites: a later evolution is buyable without owning the ones before it.
  assert(canBuyEvolution(s, 'e5') && buyEvolution(s, 'e5'), 'a later evolution buys with no prereq (tree is gone)');
  assert(s.evolutions.e0 && s.evolutions.e5 && !s.evolutions.e3, 'only the bought evolutions are owned');
}

// --- prestige: Wither pays on ever-infected, resets run, keeps perks ---------
{
  const s = defaultState();
  recompute(s);
  // Simulate a productive run.
  s.totalEverInfectedThisRun = new Decimal(5e6);
  s.biomass = new Decimal(500);
  buyEvolution(s, 'e0');
  s.arenaIndex = 2;

  const preview = witherGain(s);
  assert(preview.gt(0), 'a productive run previews a positive Wither payout');
  assert(canWither(s), 'can Wither after real progress');

  wither(s);
  assert(s.strains.gte(preview), 'Wither banks the previewed strains');
  assert(s.biomass.eq(0) && Object.keys(s.evolutions).length === 0, 'Wither resets biomass + evolutions');
  assert(s.arenaIndex === 0 && s.totalEverInfectedThisRun.eq(0), 'Wither resets the run to arena 0');
  assert(s.stats.witherCount === 1, 'Wither is counted');

  const v0 = currentVirulence(s).toNumber();
  s.strains = new Decimal(1e6);
  assert(canBuyPerk(s, 'virulence') && buyPerk(s, 'virulence'), 'Virulence is buyable with strains');
  assert(currentVirulence(s).toNumber() > v0, 'Virulence raises the permanent spread multiplier');
}

// --- prestige: Expand advances arenas ----------------------------------------
{
  const e = defaultState();
  recompute(e);
  e.population.susceptible = 0;
  e.population.infected = 0;
  e.population.dead = e.population.total;
  assert(canExpand(e), 'an exhausted arena allows Expand');
  const res = expand(e);
  assert(res !== null && e.arenaIndex === 1, 'Expand advances to the next arena');
  assert(e.stats.highestArena === 1, 'Expand records the highest arena reached');
}

// --- greedy-bot pacing harness ----------------------------------------------
// A pure-logic bot: each second, buy every affordable evolution + Virulence,
// Expand when an arena clears, Wither when an arena resists past WALL_SECONDS.
// Prints pacing; asserts the robust invariants. Tune balance.js from the print.
const STEP = 1;
const WALL_SECONDS = 20 * 60; // a human's patience on one arena before they'd prestige

function buyAll(s) {
  let any = true;
  while (any) {
    any = false;
    for (const e of EVOLUTIONS) if (canBuyEvolution(s, e.id)) { buyEvolution(s, e.id); any = true; }
    while (canBuyPerk(s, 'virulence')) { buyPerk(s, 'virulence'); any = true; }
  }
}
function sDrains(s) {
  // The PRESSURE-floor guarantee: while S >= 1, S strictly decreases.
  const pop = s.population;
  if (pop.total <= 0) return true;
  const power = (BALANCE.BASE_INFECTIVITY * s.mult.infectivity.toNumber()) / ARENAS[s.arenaIndex].immunity;
  const foi = power * (BALANCE.PRESSURE + BALANCE.CONTAGION * (pop.infected / pop.total));
  return pop.susceptible * foi > 0;
}

/** Run one fresh climb from the given (persistent) state until World cleared or walled. */
function climbOnce(s, report) {
  cough(s);
  let inArena = 0;
  let evolutionsOwnedBeforeWall = true;
  for (let guard = 0; guard < 5_000_000; guard++) {
    buyAll(s);
    if (s.population.susceptible >= 1 && !sDrains(s)) report.stallViolations++;
    tick(s, STEP);
    inArena += STEP; report.totalTime += STEP;
    if (s.arenaIndex === LAST && isArenaExhausted(s.population)) {
      report.arenaTimes[s.arenaIndex] = inArena;
      return { cleared: true };
    }
    if (canExpand(s)) {
      report.arenaTimes[s.arenaIndex] = inArena;
      expand(s);
      inArena = 0;
    }
    if (inArena > WALL_SECONDS) {
      // Walled here. Did biomass gate us, or immunity? (all evos owned => immunity.)
      evolutionsOwnedBeforeWall = EVOLUTIONS.every(e => s.evolutions[e.id]);
      return { cleared: false, walledArena: s.arenaIndex, evolutionsOwnedBeforeWall };
    }
  }
  return { cleared: false, walledArena: s.arenaIndex, evolutionsOwnedBeforeWall };
}

function fullClimb() {
  const s = defaultState();
  recompute(s);
  const report = { totalTime: 0, arenaTimes: {}, stallViolations: 0, withers: 0 };
  let firstWall = null;
  const MAX_WITHERS = 20;
  for (;;) {
    const run = climbOnce(s, report);
    if (run.cleared) return { ...report, cleared: true, firstWall };
    if (!firstWall) firstWall = { arena: run.walledArena, evolutionsOwnedBeforeWall: run.evolutionsOwnedBeforeWall };
    if (!canWither(s) || report.withers >= MAX_WITHERS) return { ...report, cleared: false, firstWall };
    wither(s);
    report.withers++;
  }
}

{
  const r = fullClimb();
  const mins = x => (x / 60).toFixed(1) + 'm';
  console.log('     fresh-run arena clear times:');
  for (let i = 0; i <= LAST; i++) if (r.arenaTimes[i] != null) console.log(`       ${ARENAS[i].name}: ${mins(r.arenaTimes[i])}`);
  console.log(`     first wall: ${r.firstWall ? ARENAS[r.firstWall.arena].name : '(none — cleared fresh)'}`);
  console.log(`     withers to first World clear: ${r.withers}`);
  console.log(`     cumulative time to World clear: ${mins(r.totalTime)}`);

  assert(r.stallViolations === 0, 'no-stall invariant: S always drains while S ≥ 1 (every clear finishes)');
  assert(r.cleared, `the World is eventually cleared via prestige (within the wither cap)`);
  assert(!r.firstWall || r.firstWall.arena === LAST, 'a fresh run walls at the World, not earlier');
  assert(!r.firstWall || r.firstWall.evolutionsOwnedBeforeWall, 'all evolutions are owned before the wall (immunity-gated, not biomass-starved)');
}

// --- determinism -------------------------------------------------------------
{
  const a = fullClimb();
  const b = fullClimb();
  assert(a.withers === b.withers && a.totalTime === b.totalTime, 'two identical climbs produce identical pacing');
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
