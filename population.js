/**
 * Festerwood — the S-I-D epidemic model (Susceptible → Infected → Dead).
 *
 * No "Recovered" compartment, because in v1 there is no cure. This is the only
 * growth engine: you spread, and spread earns biomass. Lethality is a small
 * FIXED hazard (cosmetic rot for flavour and the death-count badges); it can
 * never outpace spread, so a clear can't stall — faster spread is simply better.
 *
 * Numbers, not Decimals: a population is bounded per arena, so doubles are
 * exact and the maths stays legible. We use the exponential (closed-form)
 * update so a single large dt (offline catch-up) can't overshoot.
 */

import { BALANCE } from './balance.js';

/**
 * Advance the epidemic by dt seconds, mutating `pop` in place.
 * @param {{susceptible:number, infected:number, dead:number, total:number}} pop
 * @param {{power:number, lethality:number}} params
 *   power — infectivity ÷ arena immunity (see engine.epiParams)
 * @param {number} dt seconds
 * @returns {{newInfections:number, deaths:number}}
 */
export function stepEpidemic(pop, params, dt) {
  const { susceptible: S, infected: I, total: P } = pop;
  if (P <= 0 || dt <= 0) return { newInfections: 0, deaths: 0 };

  // Force of infection = always-on PRESSURE floor + CONTAGION from the infected.
  // The pressure term guarantees S drains to zero (every clear finishes); the
  // contagion term is the mid-clear acceleration as the infected pool grows.
  const foi = params.power * (BALANCE.PRESSURE + BALANCE.CONTAGION * (I / P));
  let newInf = Math.min(S, Math.max(0, S * (1 - Math.exp(-foi * dt))));

  // Deaths: a hazard on the infected pool (including those infected this step).
  let deaths = Math.min(I + newInf, Math.max(0, (I + newInf) * (1 - Math.exp(-params.lethality * dt))));

  pop.susceptible = S - newInf;
  pop.infected = I + newInf - deaths;
  pop.dead = pop.dead + deaths;

  if (pop.susceptible < 1e-9) pop.susceptible = 0;
  if (pop.infected < 1e-9) pop.infected = 0;

  return { newInfections: newInf, deaths };
}

/**
 * An arena is "cleared" once (almost) everyone has ever caught it. Spreading is
 * what advances you; the bigger the population, the more biomass the clear pays.
 */
export function isArenaExhausted(pop) {
  return (pop.total - pop.susceptible) >= BALANCE.EXHAUST_FRACTION * pop.total;
}
