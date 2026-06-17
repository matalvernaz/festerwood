/**
 * Festerwood — the S-I-D epidemic model (Susceptible → Infected → Dead).
 *
 * No "Recovered" compartment, because in Milestone 1 there is no cure. The
 * design's central tension lives right here: only the *infected* spread the
 * disease, while *lethality* converts infected into dead. Crank lethality and
 * you harvest biomass fast but burn down your own transmission engine. That
 * trade-off is what makes this a game and not a clicker.
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
 *   power — infectivity × sporeFactor ÷ immunity (see engine.epiParams)
 * @param {number} dt seconds
 * @returns {{newInfections:number, deaths:number}}
 */
export function stepEpidemic(pop, params, dt) {
  const { susceptible: S, infected: I, total: P } = pop;
  if (P <= 0 || dt <= 0) return { newInfections: 0, deaths: 0 };

  // Force of infection = always-on spore PRESSURE + CONTAGION from the infected.
  // The pressure term guarantees S drains to zero; the contagion term is the
  // bonus that lethality erodes (fewer live infected => less contagion).
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
 * An arena is "cleared" once everyone has caught it (no susceptibles left), or
 * everyone is dead. Spreading is what advances you; killing is what earns
 * Strains. The "dead don't spread" tension still applies — over-lethality
 * removes infected before they pass it on, slowing (or stalling) the clear.
 */
export function isArenaExhausted(pop) {
  return (pop.total - pop.susceptible) >= BALANCE.EXHAUST_FRACTION * pop.total;
}
