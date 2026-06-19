/**
 * Festerwood — central balance constants.
 *
 * Every tunable number in the game lives here, so the rest of the code carries
 * no magic numbers. Unbounded currencies (biomass, strains) are break_eternity
 * Decimals; the epidemic itself uses plain JS numbers, because a population is
 * bounded per arena and the S-I-D maths stays far clearer (and exact) in
 * doubles. `Decimal` is the global installed by vendor/break_eternity.
 *
 * v1 is a SINGLE-ENGINE design: the infection is the only growth engine. There
 * is no spore/producer economy. The loop is spread -> biomass -> evolutions ->
 * clear arenas -> Wither -> Virulence -> re-climb. See WALL KNOB below.
 */

export const SAVE_VERSION = 2;

export const BALANCE = {
  // --- loop timing ---
  TICK_STEP: 0.25, // seconds per simulation sub-step (keeps the epidemic stable under large dt)
  OFFLINE_CAP_SECONDS: 8 * 3600, // most catch-up we grant for time away
  AUTOSAVE_SECONDS: 15,
  NEWS_ROTATE_SECONDS: 8,

  // --- manual action (the accessible primary button) ---
  COUGH_SEED: 1, // susceptibles shoved straight into "infected" per cough — bootstraps a run

  // --- epidemiology (a game model, deliberately not realistic SIR) ---
  // Force of infection = power × (PRESSURE + CONTAGION × infectedShare), where
  // power = infectivity ÷ arena immunity. PRESSURE is the always-on floor that
  // guarantees a clear always *finishes* (no herd-immunity stall). CONTAGION is
  // the mid-clear acceleration from the currently infected. Tail clear time of
  // any arena ≈ 75 ÷ power seconds.
  PRESSURE: 0.04,
  CONTAGION: 0.5,
  BASE_INFECTIVITY: 1, // a fresh, evolution-less plague's spread
  BASE_LETHALITY: 0.008, // FIXED, no multiplier. Cosmetic rot only — can never outpace spread, so no stall.
  EXHAUST_FRACTION: 0.95, // arena cleared once 95% have ever caught it (infected + dead)

  // --- biomass (the evolution fuel) ---
  BIOMASS_PER_VICTIM: 1, // biomass per newly-infected host, flat across arenas (population provides the scale)

  // --- evolutions (flat list; reset on Wither) ---
  EVO_BASE_COST: 3, // C0 in cost(k) = ceil(C0 × G^k)
  EVO_COST_GROWTH: 8, // G
  EVO_SPREAD_MULT: 2.5, // each evolution multiplies infectivity. 2.5^10 ≈ 9537× cap.

  // --- prestige (Wither -> Strains -> Virulence) ---
  STRAIN_DIVISOR: 1e4, // strains = floor((everInfectedThisRun / DIVISOR)^EXP)
  STRAIN_EXP: 0.30, // sublinear so the World isn't a one-Wither jackpot
  MIN_INFECTED_TO_WITHER: 1e3, // below this ever-infected, a Wither yields nothing
  VIR_BASE: 1.20, // Virulence: infectivity ×= VIR_BASE^level  (+20% compounding per level)
  VIR_COST_BASE: 1, // VC0 — Virulence level cost = ceil(VC0 × VG^level) strains
  VIR_COST_GROWTH: 1.7, // VG
};

// WALL KNOB: the fresh-run wall lives at the World and is set by one ratio,
// EVO_SPREAD_MULT^10 ÷ ARENAS[last].immunity (currently ≈ 9537 / 2e6 ≈ 0.0048).
// Tuned via the greedy bot in test/sim.mjs to ~3 withers / ~90 min to the first
// World clear. Lower the ratio (bigger top immunity) → more withers, and below a
// point the World starves biomass for the top evolutions (1e7 broke it); higher
// → fewer withers (1e6 → a single wither); above ~0.14 the World auto-clears and
// there is no wall. Keep EVO_SPREAD_MULT and the top arena's immunity locked
// together — do not let them drift apart during content tuning.
