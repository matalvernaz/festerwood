/**
 * Festerwood — the engine. Pure game logic, no DOM.
 *
 * Every mutating action returns plain data (and tick() returns an events array);
 * the UI/main layer is responsible for announcing things. Keeping the engine
 * DOM-free is what lets test/sim.mjs drive it headlessly under Node.
 *
 * v1 is single-engine: the infection is the only growth engine. `infectivity`
 * is the one multiplier that matters — evolutions (biomass) and Virulence
 * (strains) both feed it. Biomass is earned per newly-infected host; deaths are
 * cosmetic. Prestige pays out on ever-infected, not deaths.
 */

import { BALANCE } from './balance.js';
import { EVOLUTIONS, ARENAS, ACHIEVEMENTS, PERKS } from './content.js';
import { stepEpidemic, isArenaExhausted } from './population.js';

const EVO_BY_ID = Object.fromEntries(EVOLUTIONS.map(e => [e.id, e]));
const PERK_BY_ID = Object.fromEntries(PERKS.map(p => [p.id, p]));

// --------------------------------------------------------------------------
// Multipliers — rebuilt from scratch every time, never stored in the save.
// --------------------------------------------------------------------------

/** Recompute `state.mult` from permanent perks, this-run evolutions, and achievement bonuses. */
export function recompute(state) {
  const mult = {
    infectivity: new Decimal(1), // the one multiplier: scales spread (power)
  };

  for (const p of PERKS) {
    const lvl = state.perks[p.id] || 0;
    if (lvl > 0) p.apply(mult, lvl);
  }
  for (const e of EVOLUTIONS) {
    if (state.evolutions[e.id]) e.apply(mult);
  }
  for (const a of ACHIEVEMENTS) {
    if (state.achievements[a.id] && a.bonus) a.bonus(mult);
  }

  state.mult = mult;
  return mult;
}

/** The current Virulence multiplier (the prestige axis), for display. */
export function currentVirulence(state) {
  const lvl = state.perks.virulence || 0;
  return Decimal.pow(BALANCE.VIR_BASE, lvl);
}

/** The epidemic's live parameters for the current arena: spread `power` and the fixed death hazard. */
function epiParams(state) {
  const arena = ARENAS[state.arenaIndex];
  const power = (BALANCE.BASE_INFECTIVITY * state.mult.infectivity.toNumber()) / arena.immunity;
  const lethality = BALANCE.BASE_LETHALITY; // fixed; cosmetic; never outpaces spread
  return { power, lethality };
}

/** Estimated biomass income per second right now (Decimal) — for "affordable in ~Ns" readouts. */
export function biomassRate(state) {
  const pop = state.population;
  if (pop.total <= 0) return new Decimal(0);
  const { power } = epiParams(state);
  const foi = power * (BALANCE.PRESSURE + BALANCE.CONTAGION * (pop.infected / pop.total));
  const newInfPerSec = pop.susceptible * foi;
  return new Decimal(newInfPerSec).mul(BALANCE.BIOMASS_PER_VICTIM);
}

// --------------------------------------------------------------------------
// The tick
// --------------------------------------------------------------------------

/**
 * Advance the whole game by dt seconds (clamped to the offline cap). Subdivides
 * into fixed sub-steps so the epidemic stays stable even for a large offline dt.
 * Returns an array of {type, text, assertive} events.
 */
export function tick(state, dtSeconds) {
  const events = [];
  let dt = Math.min(Math.max(0, dtSeconds), BALANCE.OFFLINE_CAP_SECONDS);
  if (dt <= 0) return events;

  state.stats.playSeconds += dt;
  const startS = state.population.susceptible;

  let remaining = dt;
  while (remaining > 1e-9) {
    const sdt = Math.min(BALANCE.TICK_STEP, remaining);
    remaining -= sdt;
    simStep(state, sdt);
  }

  // Clear ETA for the accessible arena readout: time until 95% ever-infected.
  const pop = state.population;
  const dS = (startS - pop.susceptible) / dt; // susceptibles consumed per second
  const target = (1 - BALANCE.EXHAUST_FRACTION) * pop.total;
  state.clearEtaSeconds = pop.susceptible <= target ? 0 : (dS > 1e-9 ? (pop.susceptible - target) / dS : Infinity);

  // Progress milestones (skip trivially small arenas where they'd just be noise).
  if (!state._arenaMilestones) state._arenaMilestones = [];
  if (pop.total > 50) {
    const everPct = ((pop.total - pop.susceptible) / pop.total) * 100;
    for (const thr of [50, 90]) {
      if (everPct >= thr && !state._arenaMilestones.includes(thr)) {
        state._arenaMilestones.push(thr);
        events.push({ type: 'milestone', assertive: false, text: `${thr}% of ${ARENAS[state.arenaIndex].name} has caught it.` });
      }
    }
  }

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

/** One fixed-size simulation sub-step: the epidemic, and the biomass it pays. */
function simStep(state, dt) {
  const pop = state.population;
  const { power, lethality } = epiParams(state);
  const { newInfections, deaths } = stepEpidemic(pop, { power, lethality }, dt);

  // Biomass is paid once, when a host first catches it — so income tracks spread,
  // the one thing the player improves. Ever-infected is also the prestige metric.
  if (newInfections > 0) {
    const ni = new Decimal(newInfections);
    state.biomass = state.biomass.add(ni.mul(BALANCE.BIOMASS_PER_VICTIM));
    state.totalEverInfectedThisRun = state.totalEverInfectedThisRun.add(ni);
  }
  // Deaths are cosmetic flavour + feed the death-count achievements.
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
// Evolutions (Biomass, flat this-run list)
// --------------------------------------------------------------------------

/** Flat list: every evolution is available to buy once the section is revealed. */
export function evolutionUnlocked(state, id) {
  return !!EVO_BY_ID[id];
}

export function canBuyEvolution(state, id) {
  const e = EVO_BY_ID[id];
  if (!e || state.evolutions[id]) return false;
  return state.biomass.gte(e.cost);
}

export function buyEvolution(state, id) {
  if (!canBuyEvolution(state, id)) return false;
  const e = EVO_BY_ID[id];
  state.biomass = state.biomass.sub(e.cost);
  state.evolutions[id] = true;
  recompute(state);
  return true;
}

// --------------------------------------------------------------------------
// Perks (Strains, permanent shop — v1 ships only Virulence)
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

/** The Cough button: hand-seed an infection to bootstrap a run before contagion takes over. The accessible primary action. */
export function cough(state) {
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

/** Reset population to arena `idx` (fresh hosts). Does not touch evolutions/perks. */
export function enterArena(state, idx) {
  state.arenaIndex = idx;
  const total = ARENAS[idx].population;
  state.population = { susceptible: total, infected: 0, dead: 0, total };
  state._exhaustedAnnounced = false;
  state._arenaMilestones = [];
}

/** Strains a Wither would pay out right now. Exported so the UI can preview it and gate the button. */
export function witherGain(state) {
  const ever = state.totalEverInfectedThisRun;
  if (ever.lt(BALANCE.MIN_INFECTED_TO_WITHER)) return new Decimal(0);
  return ever.div(BALANCE.STRAIN_DIVISOR).pow(BALANCE.STRAIN_EXP).floor();
}

export function canExpand(state) {
  return isArenaExhausted(state.population) && state.arenaIndex < ARENAS.length - 1;
}

/**
 * Advance to the next arena. Pure progression — keeps evolutions and pays NO
 * strains (Wither is the sole strain source).
 */
export function expand(state) {
  if (!canExpand(state)) return null;
  const next = state.arenaIndex + 1;
  state.stats.highestArena = Math.max(state.stats.highestArena, next);
  enterArena(state, next);
  recompute(state);
  return { arena: ARENAS[next] };
}

/** You may Wither once you've made any real progress. */
export function canWither(state) {
  return state.arenaIndex >= 1 || isArenaExhausted(state.population);
}

/** Hard reset of the run layer (evolutions, biomass, arena, run counters) in exchange for a big Strains payout. */
export function wither(state) {
  if (!canWither(state)) return null;
  const gain = witherGain(state);
  state.strains = state.strains.add(gain);
  state.stats.witherCount++;

  state.biomass = new Decimal(0);
  state.totalDeadThisRun = new Decimal(0);
  state.totalEverInfectedThisRun = new Decimal(0);
  state.evolutions = {};
  enterArena(state, 0);
  recompute(state);
  return { gain };
}
