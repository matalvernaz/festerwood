/**
 * Festerwood — default game state factory.
 *
 * The live game state is a single plain object, mutated in place by the engine
 * (its identity is stable, so the UI can close over it). Multipliers are NOT
 * stored here — they live in `mult`, rebuilt from scratch by engine.recompute()
 * on load and after every purchase, which is what keeps saves robust.
 */

import { SAVE_VERSION } from './balance.js';
import { GENERATORS, ARENAS } from './content.js';

export function defaultState() {
  const generators = {};
  for (const g of GENERATORS) generators[g.id] = { count: new Decimal(0), bought: new Decimal(0) };

  const total = ARENAS[0].population;

  return {
    version: SAVE_VERSION,

    // unbounded currencies (Decimal)
    spores: new Decimal(0),
    biomass: new Decimal(0),
    strains: new Decimal(0),

    // run tracking
    arenaIndex: 0,
    totalDeadThisRun: new Decimal(0),
    sporesPerSec: new Decimal(0), // derived each tick, for display + the status hotkey

    // population: plain numbers, bounded by the current arena
    population: { susceptible: total, infected: 0, dead: 0, total },

    // purchases
    generators, // id -> { count, bought }  (count includes cascade-produced units)
    mutations: {}, // id -> true (this run; cleared on Wither)
    perks: {}, // id -> level (permanent)
    achievements: {}, // id -> true (permanent)

    // permanent stats
    stats: {
      totalDeadAllTime: new Decimal(0),
      totalCoughs: 0,
      witherCount: 0,
      highestArena: 0,
      playSeconds: 0,
      maxSpores: new Decimal(0), // lifetime peak — makes producer reveals sticky
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
