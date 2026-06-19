/**
 * Festerwood — the engine. Pure game logic, no DOM.
 *
 * Every mutating action returns plain data (and tick() returns an events array);
 * the UI/main layer announces things. Keeping the engine DOM-free is what lets
 * test/sim.mjs drive it headlessly under Node.
 *
 * v1 is a PURE IDLE single-engine game. The infected count self-replicates at a
 * PACED rate (infected^GROWTH_EXPONENT, exponent < 1, so it accelerates without
 * running to infinity). Two multipliers: `spread` (how fast infected climbs) and
 * `biomass` (income per infected). Evolutions (biomass) and Virulence (strains)
 * feed them. Prestige pays out on peak infected.
 */

import { BALANCE } from './balance.js';
import { EVOLUTIONS, ACHIEVEMENTS, PERKS } from './content.js';

const EVO_BY_ID = Object.fromEntries(EVOLUTIONS.map(e => [e.id, e]));
const PERK_BY_ID = Object.fromEntries(PERKS.map(p => [p.id, p]));

// --------------------------------------------------------------------------
// Multipliers — rebuilt from scratch every time, never stored in the save.
// --------------------------------------------------------------------------

/** Recompute `state.mult` from permanent perks, this-run evolutions, and achievement bonuses. */
export function recompute(state) {
  const mult = {
    spread: new Decimal(1), // scales how fast infected climbs
    biomass: new Decimal(1), // scales biomass income per infected
  };

  for (const p of PERKS) {
    const lvl = state.perks[p.id] || 0;
    if (lvl > 0) p.apply(mult, lvl);
  }
  for (const e of EVOLUTIONS) {
    const lvl = state.evolutions[e.id] || 0;
    if (lvl > 0) e.apply(mult, lvl);
  }
  for (const a of ACHIEVEMENTS) {
    if (state.achievements[a.id] && a.bonus) a.bonus(mult);
  }

  state.mult = mult;
  return mult;
}

/** The current Virulence multiplier (the prestige axis), for display. */
export function currentVirulence(state) {
  return Decimal.pow(BALANCE.VIR_BASE, state.perks.virulence || 0);
}

/** Current spread, i.e. new infected per second (Decimal) — for display. */
export function spreadRate(state) {
  return new Decimal(BALANCE.BASE_SPREAD).mul(state.mult.spread).mul(state.infected.pow(BALANCE.GROWTH_EXPONENT));
}

/** Current biomass income per second (Decimal) — for display and "affordable in ~Ns" readouts. */
export function biomassRate(state) {
  return state.infected.mul(BALANCE.BASE_YIELD).mul(state.mult.biomass);
}

// --------------------------------------------------------------------------
// The tick
// --------------------------------------------------------------------------

/**
 * Advance the game by dt seconds (clamped to the offline cap). Sub-steps so a
 * large offline dt integrates cleanly. Returns an array of {type, text, assertive}.
 */
export function tick(state, dtSeconds) {
  const events = [];
  let dt = Math.min(Math.max(0, dtSeconds), BALANCE.OFFLINE_CAP_SECONDS);
  if (dt <= 0) return events;

  state.stats.playSeconds += dt;

  // Multipliers are fixed across a tick (they only change on a purchase, which
  // recomputes), so resolve the coefficients once.
  const k = new Decimal(BALANCE.BASE_SPREAD).mul(state.mult.spread);
  const yld = new Decimal(BALANCE.BASE_YIELD).mul(state.mult.biomass);

  const n = Math.min(BALANCE.MAX_SUBSTEPS, Math.max(1, Math.ceil(dt / BALANCE.TICK_STEP)));
  const sdt = dt / n;
  for (let i = 0; i < n; i++) {
    const dI = k.mul(state.infected.pow(BALANCE.GROWTH_EXPONENT)).mul(sdt);
    state.infected = state.infected.add(dI);
    state.biomass = state.biomass.add(state.infected.mul(yld).mul(sdt));
  }

  if (state.infected.gt(state.peakInfectedThisRun)) state.peakInfectedThisRun = state.infected;
  if (state.peakInfectedThisRun.gt(state.stats.peakInfectedAllTime)) state.stats.peakInfectedAllTime = state.peakInfectedThisRun;

  checkAchievements(state, events);
  return events;
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
// Evolutions (Biomass, repeatable/levelled this-run upgrades)
// --------------------------------------------------------------------------

export function evolutionCost(e, level) {
  return new Decimal(e.cost(level));
}

export function canBuyEvolution(state, id) {
  const e = EVO_BY_ID[id];
  if (!e) return false;
  return state.biomass.gte(evolutionCost(e, state.evolutions[id] || 0));
}

export function buyEvolution(state, id) {
  if (!canBuyEvolution(state, id)) return false;
  const e = EVO_BY_ID[id];
  const lvl = state.evolutions[id] || 0;
  state.biomass = state.biomass.sub(evolutionCost(e, lvl));
  state.evolutions[id] = lvl + 1;
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

/** The Cough button: a manual burst of fresh infected. The game idles fine without it; this just nudges. */
export function cough(state) {
  state.infected = state.infected.add(BALANCE.COUGH_SEED);
  if (state.infected.gt(state.peakInfectedThisRun)) state.peakInfectedThisRun = state.infected;
  state.stats.totalCoughs++;
  return { seeded: BALANCE.COUGH_SEED };
}

// --------------------------------------------------------------------------
// Prestige: Wither (reset the run for Strains)
// --------------------------------------------------------------------------

/** Strains a Wither would pay out right now, from peak infected this run. */
export function witherGain(state) {
  const peak = state.peakInfectedThisRun;
  if (peak.lt(BALANCE.MIN_PEAK_TO_WITHER)) return new Decimal(0);
  return peak.div(BALANCE.STRAIN_DIVISOR).pow(BALANCE.STRAIN_EXP).floor();
}

export function canWither(state) {
  return state.peakInfectedThisRun.gte(BALANCE.MIN_PEAK_TO_WITHER);
}

/** Rot the run down (infected, biomass, evolutions) for a Strains payout. Perks/strains/stats survive. */
export function wither(state) {
  if (!canWither(state)) return null;
  const gain = witherGain(state);
  state.strains = state.strains.add(gain);
  state.stats.witherCount++;

  state.infected = new Decimal(BALANCE.START_INFECTED);
  state.biomass = new Decimal(0);
  state.evolutions = {};
  state.peakInfectedThisRun = new Decimal(BALANCE.START_INFECTED);
  recompute(state);
  return { gain };
}
