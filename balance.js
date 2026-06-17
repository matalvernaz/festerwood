/**
 * Festerwood — central balance constants.
 *
 * Every tunable number in the game lives here, so the rest of the code carries
 * no magic numbers. Unbounded currencies (spores, biomass, strains) are
 * break_eternity Decimals; the epidemic itself uses plain JS numbers, because a
 * population is bounded per arena and the S-I-D maths stays far clearer (and
 * exact) in doubles. `Decimal` is the global installed by vendor/break_eternity.
 */

export const SAVE_VERSION = 1;

export const BALANCE = {
  // --- loop timing ---
  TICK_STEP: 0.25, // seconds per simulation sub-step (keeps the cascade + epidemic stable under large dt)
  OFFLINE_CAP_SECONDS: 8 * 3600, // most catch-up we grant for time away
  AUTOSAVE_SECONDS: 15,
  NEWS_ROTATE_SECONDS: 8,

  // --- manual action (the accessible primary button) ---
  COUGH_SPORES: new Decimal(1), // spores granted per cough (×spore multiplier), bootstraps the early game
  COUGH_SEED: 1, // susceptibles shoved straight into "infected" per cough

  // --- generators (cascade: Tumour -> Pustule -> Fungus -> Mold -> Spores) ---
  GEN_COST_MULT: 1.15, // each successive unit costs 1.15× the last

  // --- epidemiology (a game model, deliberately not realistic SIR) ---
  // Force of infection = power × (PRESSURE + CONTAGION × infectedShare), where
  // power = infectivity × sporeFactor ÷ arena immunity. PRESSURE is your spore
  // cloud infecting hosts directly — always on, so a clear always *finishes*
  // (no herd-immunity stall). CONTAGION is the bonus from the currently infected,
  // and it's what lethality erodes: kill hosts too fast and you lose this term.
  PRESSURE: 0.04,
  CONTAGION: 0.5,
  SPORE_FACTOR_LOG: 0.03, // spread bonus per order-of-magnitude of spores/sec
  BASE_LETHALITY: 0.02, // base infected -> dead hazard per second
  EXHAUST_FRACTION: 0.95, // arena cleared once 95% have ever caught it (infected + dead)

  // --- biomass (the mutation-tree fuel, harvested from humans) ---
  BIOMASS_PER_DEATH: new Decimal(1),
  BIOMASS_PER_INFECTED: new Decimal(0.02), // per infected per second, so a pure-spread build isn't starved

  // --- prestige (Wither / Expand -> Strains) ---
  STRAIN_DIVISOR: new Decimal(100), // deaths-per-strain scaling base
  STRAIN_EXP: 0.5, // strains gained on Wither = (totalDead / DIVISOR)^EXP × (1 + highestArena)
  MIN_DEAD_TO_WITHER: new Decimal(100), // below this, a Wither yields nothing
};
