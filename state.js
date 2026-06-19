/**
 * Festerwood — default game state factory.
 *
 * The live game state is a single plain object, mutated in place by the engine
 * (its identity is stable, so the UI can close over it). Multipliers are NOT
 * stored here — they live in `mult`, rebuilt from scratch by engine.recompute()
 * on load and after every purchase, which is what keeps saves robust.
 *
 * v1 is single-engine: two currencies only (biomass, run; strains, prestige).
 */

import { SAVE_VERSION } from './balance.js';
import { ARENAS } from './content.js';

export function defaultState() {
  const total = ARENAS[0].population;

  return {
    version: SAVE_VERSION,

    // unbounded currencies (Decimal)
    biomass: new Decimal(0), // run — spend on evolutions
    strains: new Decimal(0), // prestige — spend on Virulence

    // run tracking
    arenaIndex: 0,
    totalDeadThisRun: new Decimal(0), // cosmetic / badges
    totalEverInfectedThisRun: new Decimal(0), // the Wither payout metric

    // population: plain numbers, bounded by the current arena
    population: { susceptible: total, infected: 0, dead: 0, total },

    // purchases
    evolutions: {}, // id -> true (this run; cleared on Wither)
    perks: {}, // id -> level (permanent)
    achievements: {}, // id -> true (permanent)

    // permanent stats
    stats: {
      totalDeadAllTime: new Decimal(0),
      totalCoughs: 0,
      witherCount: 0,
      highestArena: 0,
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
    clearEtaSeconds: Infinity, // derived each tick: time to clear the current arena
    _arenaMilestones: [], // %-infected pings already fired for the current arena

    // bookkeeping
    lastTick: 0, // ms epoch, for offline catch-up
    newsIndex: 0,
    _exhaustedAnnounced: false,
  };
}
