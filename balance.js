/**
 * Festerwood — central balance constants.
 *
 * Every tunable number lives here, so the rest of the code carries no magic
 * numbers. Unbounded currencies (infected, biomass, strains) are break_eternity
 * Decimals; `Decimal` is the global installed by vendor/break_eternity.
 *
 * v1 is a PURE IDLE, single number-goes-up game. No zones. The plague is
 * self-replicating: the more infected you have, the faster it spreads. Growth is
 * paced (sub-exponential) so it accelerates without instantly running to
 * infinity — GROWTH_EXPONENT is the knob (see below). Loop: infected climbs →
 * pays biomass → buy repeatable Evolutions → climbs faster → Wither for Strains
 * → permanent Virulence → climbs faster still.
 */

export const SAVE_VERSION = 3;

export const BALANCE = {
  // --- loop timing ---
  TICK_STEP: 0.25, // seconds per simulation sub-step
  MAX_SUBSTEPS: 1200, // cap sub-steps so a huge offline dt can't lock the tab
  OFFLINE_CAP_SECONDS: 8 * 3600, // most catch-up we grant for time away
  AUTOSAVE_SECONDS: 15,
  NEWS_ROTATE_SECONDS: 8,

  // --- manual action (the accessible primary button) ---
  COUGH_SEED: 1, // infected added per cough — a manual nudge; the game idles fine without it
  START_INFECTED: 1, // seeded on a new game and after every Wither, so the plague grows from t=0

  // --- growth: infected' = BASE_SPREAD × spreadMult × infected^GROWTH_EXPONENT ---
  // GROWTH_EXPONENT < 1 is the master pacing knob: 1.0 would be true exponential
  // (runs to infinity in seconds — unplayable); lower = gentler. 0.5 makes the
  // count grow roughly quadratically in time at fixed multipliers, accelerating
  // as you buy spread. Push toward 1 for a more explosive feel.
  BASE_SPREAD: 0.15,
  GROWTH_EXPONENT: 0.5,

  // --- biomass: biomass' = infected × BASE_YIELD × biomassMult ---
  BASE_YIELD: 0.1,

  // --- evolutions (biomass, repeatable/levelled) ---
  CONTAGION_STEP: 1.25, // ×spread per level
  CONTAGION_COST_BASE: 10,
  CONTAGION_COST_GROWTH: 1.6,
  POTENCY_STEP: 1.25, // ×biomass yield per level
  POTENCY_COST_BASE: 12,
  POTENCY_COST_GROWTH: 1.6,

  // --- prestige (Wither -> Strains -> Virulence), paid on peak infected this run ---
  STRAIN_DIVISOR: 1e6,
  STRAIN_EXP: 0.22, // strains = floor((peakInfectedThisRun / DIVISOR)^EXP); lower = gentler payout
  MIN_PEAK_TO_WITHER: 1e6, // below this peak a Wither yields nothing (== where the payout first reaches 1)
  VIR_BASE: 1.20, // Virulence: spread ×= VIR_BASE^level (compounding, permanent)
  VIR_COST_BASE: 1,
  VIR_COST_GROWTH: 2.2, // steep, to brake the prestige spiral (compounding virulence runs away otherwise)
};
