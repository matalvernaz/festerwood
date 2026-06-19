/**
 * Festerwood — all game content as data.
 *
 * Adding content means extending these arrays, never touching the engine.
 * `apply(mult, level)` functions mutate the multiplier bag the engine builds in
 * recompute(), so effects are always recomputed from scratch, never stored.
 * Costs/curves derive from BALANCE so the tuning lives in one place.
 *
 * Voice note: every player-facing string is gross-whimsical. A narrator
 * delighted by the disgusting. Keep it that way.
 *
 * v1 is a pure idle, single-engine game: no zones. Evolutions (biomass) and the
 * Virulence perk (strains) feed two multipliers — `spread` (how fast the infected
 * count climbs) and `biomass` (income per infected).
 */

import { BALANCE } from './balance.js';

/**
 * Evolutions — repeatable, levelled, bought with Biomass, reset each Wither.
 * Contagion speeds the spread; Potency fattens the biomass each host yields.
 * The two are the idle spend-cadence: grow faster, or earn faster.
 */
export const EVOLUTIONS = [
  {
    id: 'contagion',
    name: 'Contagion',
    flavor: 'Stickier, sneezier, altogether more sociable.',
    cost: l => Math.ceil(BALANCE.CONTAGION_COST_BASE * Math.pow(BALANCE.CONTAGION_COST_GROWTH, l)),
    desc: () => `+${Math.round((BALANCE.CONTAGION_STEP - 1) * 100)}% spread`,
    apply: (m, l) => { m.spread = m.spread.mul(Decimal.pow(BALANCE.CONTAGION_STEP, l)); },
  },
  {
    id: 'potency',
    name: 'Potency',
    flavor: 'Each host rots down into so much more usable goo.',
    cost: l => Math.ceil(BALANCE.POTENCY_COST_BASE * Math.pow(BALANCE.POTENCY_COST_GROWTH, l)),
    desc: () => `+${Math.round((BALANCE.POTENCY_STEP - 1) * 100)}% biomass`,
    apply: (m, l) => { m.biomass = m.biomass.mul(Decimal.pow(BALANCE.POTENCY_STEP, l)); },
  },
];

/**
 * Strains shop — permanent perks bought with Strains, kept through every Wither.
 * v1 ships a SINGLE perk: Virulence, the unbounded compounding spread multiplier
 * that is the game's real long-term progression. The plague comes back faster
 * every time it rots and regrows.
 */
export const PERKS = [
  {
    id: 'virulence',
    name: 'Virulence',
    cost: l => Math.ceil(BALANCE.VIR_COST_BASE * Math.pow(BALANCE.VIR_COST_GROWTH, l)),
    desc: () => `+${Math.round((BALANCE.VIR_BASE - 1) * 100)}% spread, compounding`,
    apply: (m, l) => { m.spread = m.spread.mul(Decimal.pow(BALANCE.VIR_BASE, l)); },
  },
];

/** Achievements. Some grant a real, permanent multiplier via `bonus(mult)` — milestone bonuses, not just badges. */
export const ACHIEVEMENTS = [
  { id: 'firstblood', name: 'First Blood', desc: 'Claim your very first victim.', condition: s => s.infected.gte(1), unlockText: 'Achievement: First Blood — your first victim! They were probably awful anyway.' },
  { id: 'thousand', name: 'A Thousand Sniffles', desc: 'Infect a thousand.', condition: s => s.infected.gte(1000), unlockText: 'Achievement: A Thousand Sniffles — a thousand hosts, all yours, all leaking.', bonus: m => { m.spread = m.spread.mul(1.1); } },
  { id: 'snot', name: 'Snot Going to Lie', desc: 'Hoard a thousand biomass.', condition: s => s.biomass.gte(1000), unlockText: 'Achievement: Snot Going to Lie — a thousand biomass, all yours, all wriggling.' },
  { id: 'million', name: 'Seven Figures of Sorrow', desc: 'Infect a million.', condition: s => s.infected.gte(1e6), unlockText: 'Achievement: Seven Figures of Sorrow — a million hosts. Splendid bookkeeping.', bonus: m => { m.biomass = m.biomass.mul(1.25); } },
  { id: 'wither', name: 'Compost Happens', desc: 'Wither for the first time.', condition: s => s.stats.witherCount >= 1, unlockText: 'Achievement: Compost Happens — from rot, ambition.', bonus: m => { m.spread = m.spread.mul(1.15); } },
  { id: 'worldsend', name: 'Well, That’s Everyone', desc: 'Infect more than the whole world holds.', condition: s => s.infected.gte(8e9), unlockText: 'Achievement: Well, That’s Everyone — more infected than there are people. You’re double-dipping. Glorious.', bonus: m => { m.spread = m.spread.mul(1.5); } },
];

/** Rolling news ticker — pure flavour ambience. */
export const NEWS = [
  'Local toddler officially reclassified as “a biohazard” by exhausted daycare.',
  'Man insists he “just has allergies” for ninth consecutive funeral.',
  'Hand-sanitiser sales soar; the spores send their warm regards.',
  'Scientists baffled, then sniffly, then very quiet.',
  'Local handrail named Employee of the Month.',
  'Breaking: a single sneeze achieves modest regional celebrity.',
  'Health official coughs mid-press-conference, blames “dry air.”',
  'Pigeon seen looking smug. Authorities decline to comment.',
  'Nation advised to gargle with soup. Soup does nothing. Soup is complicit.',
  'The country’s thermometers unionise, demand hazard pay.',
];
