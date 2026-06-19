/**
 * Festerwood — default game state factory.
 *
 * The live game state is a single plain object, mutated in place by the engine
 * (its identity is stable, so the UI can close over it). Multipliers are NOT
 * stored here — they live in `mult`, rebuilt from scratch by engine.recompute()
 * on load and after every purchase, which is what keeps saves robust.
 *
 * v1 is a pure idle: one headline number (infected) that climbs, a spendable
 * (biomass), and a prestige currency (strains). No population, no zones.
 */

import { SAVE_VERSION, BALANCE } from './balance.js';

export function defaultState() {
  return {
    version: SAVE_VERSION,

    // the headline number (unbounded, Decimal) — the plague itself
    infected: new Decimal(BALANCE.START_INFECTED),

    // currencies (Decimal)
    biomass: new Decimal(0), // run — spend on evolutions
    strains: new Decimal(0), // prestige — spend on Virulence

    // run tracking — peak infected this run is the Wither payout metric
    peakInfectedThisRun: new Decimal(BALANCE.START_INFECTED),

    // purchases
    evolutions: {}, // id -> level (this run; cleared on Wither)
    perks: {}, // id -> level (permanent)
    achievements: {}, // id -> true (permanent)

    // permanent stats
    stats: {
      totalCoughs: 0,
      witherCount: 0,
      peakInfectedAllTime: new Decimal(BALANCE.START_INFECTED),
      playSeconds: 0,
    },

    settings: {
      announceVerbosity: 'normal', // 'quiet' | 'normal' | 'chatty'
      notation: 'short',
    },

    // derived; never trusted from a save (recomputed on load)
    mult: null,

    // progressive disclosure + sensing
    seen: {}, // reveal-keys already announced (lifetime; stops re-announcing on reload)
    recentLog: [], // recent notable events, for the recap key
    recentReadIdx: 0, // how far through recentLog the player has heard
    milestonePow: 3, // next power-of-ten infected milestone to announce (1e3 first)

    // bookkeeping
    lastTick: 0, // ms epoch, for offline catch-up
    newsIndex: 0,
  };
}
