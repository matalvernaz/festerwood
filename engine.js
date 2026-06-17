/**
 * Festerwood — the engine. Pure game logic, no DOM.
 *
 * Every mutating action returns plain data (and tick() returns an events array);
 * the UI/main layer is responsible for announcing things. Keeping the engine
 * DOM-free is what lets test/sim.mjs drive it headlessly under Node.
 */

import { BALANCE } from './balance.js';
import { GENERATORS, MUTATIONS, ARENAS, ACHIEVEMENTS, PERKS } from './content.js';
import { stepEpidemic, isArenaExhausted } from './population.js';

const GEN_BY_ID = Object.fromEntries(GENERATORS.map(g => [g.id, g]));
const MUT_BY_ID = Object.fromEntries(MUTATIONS.map(m => [m.id, m]));
const PERK_BY_ID = Object.fromEntries(PERKS.map(p => [p.id, p]));

// --------------------------------------------------------------------------
// Multipliers — rebuilt from scratch every time, never stored in the save.
// --------------------------------------------------------------------------

/** Recompute `state.mult` from permanent perks, this-run mutations, and achievement bonuses. */
export function recompute(state) {
  const mult = {
    spore: new Decimal(1),
    biomass: new Decimal(1),
    infectivity: new Decimal(1), // scales transmission (beta)
    lethality: new Decimal(1), // scales the death hazard
    genCost: new Decimal(1), // multiplies generator cost (room for a future discount perk)
  };

  for (const p of PERKS) {
    const lvl = state.perks[p.id] || 0;
    if (lvl > 0) p.apply(mult, lvl);
  }
  for (const m of MUTATIONS) {
    if (state.mutations[m.id]) m.apply(mult);
  }
  for (const a of ACHIEVEMENTS) {
    if (state.achievements[a.id] && a.bonus) a.bonus(mult);
  }

  state.mult = mult;
  return mult;
}

/** Current spore production per second (Decimal), used for display and the beta bonus. */
export function currentSporeRate(state) {
  const mold = GENERATORS[0];
  return state.generators[mold.id].count.mul(mold.prod).mul(state.mult.spore);
}

/** The epidemic's live parameters for the current arena: spread `power` and death hazard. */
function epiParams(state) {
  const mult = state.mult;
  const arena = ARENAS[state.arenaIndex];
  const sporeRate = currentSporeRate(state).toNumber();
  const sporeFactor = 1 + BALANCE.SPORE_FACTOR_LOG * Math.max(0, Math.log10(sporeRate + 1));
  const power = (mult.infectivity.toNumber() * sporeFactor) / arena.immunity;
  const lethality = BALANCE.BASE_LETHALITY * mult.lethality.toNumber();
  return { power, lethality, sporeFactor };
}

/**
 * Spread/lethality snapshot for the UI. `stalling` is the legible warning: when
 * the death hazard outstrips the contagion term, hosts die before passing it on,
 * so the clear crawls along on spore pressure alone — ease off lethality.
 */
export function spreadStats(state) {
  const { power, lethality } = epiParams(state);
  return {
    infectivityMult: state.mult.infectivity,
    lethalityMult: state.mult.lethality,
    stalling: state.population.susceptible >= 1 && lethality > power * BALANCE.CONTAGION,
  };
}

// --------------------------------------------------------------------------
// The tick
// --------------------------------------------------------------------------

/**
 * Advance the whole game by dt seconds (clamped to the offline cap). Subdivides
 * into fixed sub-steps so the producer cascade and epidemic stay stable even for
 * a large offline dt. Returns an array of {type, text, assertive} events.
 */
export function tick(state, dtSeconds) {
  const events = [];
  let dt = Math.min(Math.max(0, dtSeconds), BALANCE.OFFLINE_CAP_SECONDS);
  if (dt <= 0) return events;

  state.stats.playSeconds += dt;

  let remaining = dt;
  while (remaining > 1e-9) {
    const sdt = Math.min(BALANCE.TICK_STEP, remaining);
    remaining -= sdt;
    simStep(state, sdt);
  }

  state.sporesPerSec = currentSporeRate(state);

  if (!state._exhaustedAnnounced && isArenaExhausted(state.population)) {
    state._exhaustedAnnounced = true;
    if (state.arenaIndex < ARENAS.length - 1) {
      events.push({ type: 'arena', assertive: true, text: `${ARENAS[state.arenaIndex].name} has thoroughly caught it. You may Expand to ${ARENAS[state.arenaIndex + 1].name}.` });
    } else {
      events.push({ type: 'victory', assertive: true, text: 'The whole World is a glorious ruin. You may Wither and begin anew, stronger and squelchier.' });
    }
  }

  checkAchievements(state, events);
  return events;
}

/** One fixed-size simulation sub-step. */
function simStep(state, dt) {
  const mult = state.mult;

  // Producer cascade, top-down so a unit made this step doesn't also produce this step.
  for (let i = GENERATORS.length - 1; i >= 1; i--) {
    const g = GENERATORS[i];
    const below = GENERATORS[i - 1];
    const produced = state.generators[g.id].count.mul(g.prod).mul(dt);
    state.generators[below.id].count = state.generators[below.id].count.add(produced);
  }
  // Tier 0 (Mold) -> Spores, with the spore multiplier applied.
  const mold = GENERATORS[0];
  const sporeGain = state.generators[mold.id].count.mul(mold.prod).mul(mult.spore).mul(dt);
  state.spores = state.spores.add(sporeGain);

  // Epidemic.
  const pop = state.population;
  const { power, lethality } = epiParams(state);
  const { deaths } = stepEpidemic(pop, { power, lethality }, dt);

  // Biomass: mostly from deaths (so lethality is tempting), with a trickle from
  // the living infected (so a pure-spread build still earns).
  if (deaths > 0 || pop.infected > 0) {
    const fromDeath = new Decimal(deaths).mul(BALANCE.BIOMASS_PER_DEATH);
    const fromInfected = new Decimal(pop.infected).mul(BALANCE.BIOMASS_PER_INFECTED).mul(dt);
    state.biomass = state.biomass.add(fromDeath.add(fromInfected).mul(mult.biomass));
  }
  if (deaths > 0) {
    const d = new Decimal(deaths);
    state.totalDeadThisRun = state.totalDeadThisRun.add(d);
    state.stats.totalDeadAllTime = state.stats.totalDeadAllTime.add(d);
  }
}

function checkAchievements(state, events) {
  let gotBonus = false;
  for (const a of ACHIEVEMENTS) {
    if (!state.achievements[a.id] && a.condition(state)) {
      state.achievements[a.id] = true;
      events.push({ type: 'achievement', assertive: false, text: a.unlockText || `Achievement: ${a.name}` });
      if (a.bonus) gotBonus = true;
    }
  }
  if (gotBonus) recompute(state);
}

// --------------------------------------------------------------------------
// Generators
// --------------------------------------------------------------------------

/** Total spore cost of buying `n` more of generator `id` from the current count. */
export function generatorCost(state, id, n) {
  n = new Decimal(n);
  const g = GEN_BY_ID[id];
  const r = BALANCE.GEN_COST_MULT;
  const base = new Decimal(g.baseCost).mul(state.mult.genCost);
  const rb = Decimal.pow(r, state.generators[id].bought);
  const rn = Decimal.pow(r, n);
  // base * r^bought * (r^n - 1) / (r - 1)
  return base.mul(rb).mul(rn.sub(1)).div(r - 1);
}

/** Largest `n` affordable right now (Decimal). Closed-form so it never loops. */
export function maxAffordable(state, id) {
  const g = GEN_BY_ID[id];
  const r = BALANCE.GEN_COST_MULT;
  const base = new Decimal(g.baseCost).mul(state.mult.genCost);
  const rb = Decimal.pow(r, state.generators[id].bought);
  // spores >= base*rb*(r^n-1)/(r-1)  =>  r^n <= 1 + spores*(r-1)/(base*rb)
  const rhs = state.spores.mul(r - 1).div(base.mul(rb)).add(1);
  if (rhs.lte(1)) return new Decimal(0);
  const n = rhs.ln().div(Math.log(r)).floor();
  return Decimal.max(0, n);
}

/**
 * Buy generator `id`. `amount` is a number, a Decimal, or 'max'.
 * @returns {{bought: Decimal, cost?: Decimal}}
 */
export function buyGenerator(state, id, amount) {
  let n = amount === 'max' ? maxAffordable(state, id) : new Decimal(amount);
  if (n.lte(0)) return { bought: new Decimal(0) };

  let cost = generatorCost(state, id, n);
  if (state.spores.lt(cost)) {
    // re-clamp (guards against a fixed amount you can't afford, or rounding)
    n = maxAffordable(state, id);
    if (n.lte(0)) return { bought: new Decimal(0) };
    cost = generatorCost(state, id, n);
    if (state.spores.lt(cost)) return { bought: new Decimal(0) };
  }

  state.spores = state.spores.sub(cost);
  const gen = state.generators[id];
  gen.bought = gen.bought.add(n);
  gen.count = gen.count.add(n);
  return { bought: n, cost };
}

// --------------------------------------------------------------------------
// Mutations (Biomass, this-run tree)
// --------------------------------------------------------------------------

/** Are all of a mutation's prerequisites owned (i.e. is the node visible/unlockable)? */
export function mutationUnlocked(state, id) {
  const m = MUT_BY_ID[id];
  return (m.prereqs || []).every(p => state.mutations[p]);
}

export function canBuyMutation(state, id) {
  const m = MUT_BY_ID[id];
  if (!m || state.mutations[id]) return false;
  if (!mutationUnlocked(state, id)) return false;
  return state.biomass.gte(m.cost);
}

export function buyMutation(state, id) {
  if (!canBuyMutation(state, id)) return false;
  const m = MUT_BY_ID[id];
  state.biomass = state.biomass.sub(m.cost);
  state.mutations[id] = true;
  recompute(state);
  return true;
}

// --------------------------------------------------------------------------
// Perks (Strains, permanent shop)
// --------------------------------------------------------------------------

export function perkCost(p, level) {
  return new Decimal(p.cost(level));
}

export function canBuyPerk(state, id) {
  const p = PERK_BY_ID[id];
  const lvl = state.perks[id] || 0;
  if (p.maxLevel && lvl >= p.maxLevel) return false;
  return state.strains.gte(perkCost(p, lvl));
}

export function buyPerk(state, id) {
  if (!canBuyPerk(state, id)) return false;
  const p = PERK_BY_ID[id];
  const lvl = state.perks[id] || 0;
  state.strains = state.strains.sub(perkCost(p, lvl));
  state.perks[id] = lvl + 1;
  recompute(state);
  return true;
}

// --------------------------------------------------------------------------
// Manual action
// --------------------------------------------------------------------------

/** The Cough button: a small spore burst plus a hand-seeded infection. The accessible primary action. */
export function cough(state) {
  state.spores = state.spores.add(BALANCE.COUGH_SPORES.mul(state.mult.spore));
  const pop = state.population;
  const seeded = Math.min(pop.susceptible, BALANCE.COUGH_SEED);
  pop.susceptible -= seeded;
  pop.infected += seeded;
  state.stats.totalCoughs++;
  return { seeded };
}

// --------------------------------------------------------------------------
// Prestige: Expand (advance an arena) and Wither (hard reset for Strains)
// --------------------------------------------------------------------------

/** Reset population to arena `idx` (fresh hosts). Does not touch generators/mutations. */
export function enterArena(state, idx) {
  state.arenaIndex = idx;
  const total = ARENAS[idx].population;
  state.population = { susceptible: total, infected: 0, dead: 0, total };
  state._exhaustedAnnounced = false;
}

function strainsForExpand(arenaIndex) {
  return new Decimal(Math.floor(Math.pow(1 + arenaIndex, 1.5)));
}

function strainsForWither(state) {
  const dead = state.totalDeadThisRun;
  if (dead.lt(BALANCE.MIN_DEAD_TO_WITHER)) return new Decimal(0);
  return dead.div(BALANCE.STRAIN_DIVISOR).pow(BALANCE.STRAIN_EXP).mul(1 + state.stats.highestArena).floor();
}

export function canExpand(state) {
  return isArenaExhausted(state.population) && state.arenaIndex < ARENAS.length - 1;
}

/** Advance to the next arena (keeps generators/mutations — the climb is continuous). Grants a few Strains. */
export function expand(state) {
  if (!canExpand(state)) return null;
  const next = state.arenaIndex + 1;
  const gain = strainsForExpand(next);
  state.strains = state.strains.add(gain);
  state.stats.highestArena = Math.max(state.stats.highestArena, next);
  enterArena(state, next);
  recompute(state);
  return { gain, arena: ARENAS[next] };
}

/** You may Wither once you've made any real progress. */
export function canWither(state) {
  return state.arenaIndex >= 1 || isArenaExhausted(state.population);
}

/** Hard reset of the run layers (generators, mutations, spores, biomass, arena) in exchange for a big Strains payout. */
export function wither(state) {
  if (!canWither(state)) return null;
  const gain = strainsForWither(state);
  state.strains = state.strains.add(gain);
  state.stats.witherCount++;

  state.spores = new Decimal(0);
  state.biomass = new Decimal(0);
  state.totalDeadThisRun = new Decimal(0);
  state.mutations = {};
  for (const g of GENERATORS) state.generators[g.id] = { count: new Decimal(0), bought: new Decimal(0) };
  enterArena(state, 0);
  recompute(state);
  return { gain };
}
