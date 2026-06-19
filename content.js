/**
 * Festerwood — all game content as data.
 *
 * Adding content means extending these arrays, never touching the engine.
 * `apply(mult)` functions mutate the multiplier bag the engine builds in
 * recompute(), so effects are always recomputed from scratch, never stored.
 * Costs/curves derive from BALANCE so the tuning lives in one place.
 *
 * Voice note: every player-facing string is gross-whimsical. A narrator
 * delighted by the disgusting. Keep it that way.
 *
 * v1 is single-engine: the infection is the only growth engine. There are no
 * producers/spores. Evolutions (biomass) and one Virulence perk (strains) both
 * feed the single `infectivity` multiplier.
 */

import { BALANCE } from './balance.js';

/**
 * The Evolutions — a FLAT list bought with Biomass, reset each Wither.
 * Every evolution simply multiplies spread (infectivity); faster is always
 * better, so there is no trap pick and no tree to navigate. Cost follows the
 * geometric curve in BALANCE; `effect` text is derived so it can never drift
 * from `apply`.
 */
const EVO_FLAVORS = [
  { id: 'e0', name: 'Sticky Handshake', flavor: 'Everyone insists on shaking hands. How thoughtful.' },
  { id: 'e1', name: 'Airborne Giggles', flavor: 'It rides out on every snicker and snort.' },
  { id: 'e2', name: 'Explosive Sneezing', flavor: 'Bless you. Bless ALL of you.' },
  { id: 'e3', name: 'Viral Tweet', flavor: 'Technically a meme now. Engagement is through the roof.' },
  { id: 'e4', name: 'Doorknob Devotion', flavor: 'It has learned to adore a good handle and never quite let go.' },
  { id: 'e5', name: 'Liquefaction', flavor: 'The hosts become so much more... portable.' },
  { id: 'e6', name: 'Antiseptic Indifference', flavor: 'It read the disinfectant label and laughed.' },
  { id: 'e7', name: 'Hand-Sanitizer Shrug', flavor: 'A whole pump of the stuff. It didn’t even flinch.' },
  { id: 'e8', name: 'Total Organ Confusion', flavor: 'The spleen is doing the lungs’ job now. Nobody is happy.' },
  { id: 'e9', name: 'Sentient Mucus', flavor: 'It has opinions now. They are all phlegm-based.' },
];

export const EVOLUTIONS = EVO_FLAVORS.map((e, k) => ({
  ...e,
  cost: Math.ceil(BALANCE.EVO_BASE_COST * Math.pow(BALANCE.EVO_COST_GROWTH, k)),
  effect: `×${BALANCE.EVO_SPREAD_MULT} spread`,
  apply: m => { m.infectivity = m.infectivity.mul(BALANCE.EVO_SPREAD_MULT); },
}));

/**
 * Arenas — progressive populations. Clear one to Expand to the next.
 * `immunity` divides the transmission rate and climbs steeply, so a single
 * un-prestiged run reaches the World and walls there: that wall is what drives
 * the Wither → Strains → Virulence → re-climb loop (the long game). Populations
 * provide all the exponential biomass scaling; immunity provides the wall.
 */
export const ARENAS = [
  { id: 'household', name: 'the Henderson Household', population: 5, immunity: 1, blurb: 'Five people and a dog’s water bowl. A cosy place to begin.' },
  { id: 'block', name: 'Maple Street', population: 120, immunity: 10, blurb: 'A whole cul-de-sac of generously shared doorknobs.' },
  { id: 'town', name: 'the town of Drearyford', population: 8000, immunity: 120, blurb: 'One supermarket, one school, infinite handrails.' },
  { id: 'city', name: 'the city of Grimewick', population: 600000, immunity: 2000, blurb: 'Public transport! Oh, you’ll love public transport.' },
  { id: 'country', name: 'the nation of Blandia', population: 40000000, immunity: 40000, blurb: 'Borders are merely a suggestion to an airborne giggle.' },
  { id: 'world', name: 'the whole wide World', population: 8000000000, immunity: 2000000, blurb: 'Everything. Everyone. All of it. Yum.' },
];

/**
 * Strains shop — permanent perks bought with Strains, kept through every Wither.
 * v1 ships a SINGLE perk: Virulence, the unbounded compounding spread multiplier
 * that is the game's real progression axis. cost(level) & desc(level) are
 * functions; `apply` folds VIR_BASE^level into the infectivity multiplier.
 */
export const PERKS = [
  {
    id: 'virulence',
    name: 'Virulence',
    cost: l => Math.ceil(BALANCE.VIR_COST_BASE * Math.pow(BALANCE.VIR_COST_GROWTH, l)),
    desc: () => `+${Math.round((BALANCE.VIR_BASE - 1) * 100)}% spread, compounding`,
    apply: (m, l) => { m.infectivity = m.infectivity.mul(Decimal.pow(BALANCE.VIR_BASE, l)); },
  },
];

/** Achievements. Some grant a real, permanent multiplier via `bonus(mult)` — milestone bonuses, not just badges. */
export const ACHIEVEMENTS = [
  { id: 'firstblood', name: 'First Blood', desc: 'Claim your very first victim.', condition: s => s.stats.totalDeadAllTime.gte(1), unlockText: 'Achievement: First Blood — your first victim! They were probably awful anyway.' },
  { id: 'snot', name: 'Snot Going to Lie', desc: 'Hoard a thousand biomass.', condition: s => s.biomass.gte(1000), unlockText: 'Achievement: Snot Going to Lie — a thousand biomass, all yours, all wriggling.' },
  { id: 'family', name: 'Family Misfortune', desc: 'Ruin the Henderson Household.', condition: s => s.stats.highestArena >= 1, unlockText: 'Achievement: Family Misfortune — the Hendersons are no more. The dog is fine.', bonus: m => { m.infectivity = m.infectivity.mul(1.1); } },
  { id: 'million', name: 'Seven Figures of Sorrow', desc: 'Kill a million people, all time.', condition: s => s.stats.totalDeadAllTime.gte(1e6), unlockText: 'Achievement: Seven Figures of Sorrow — a million souls. Splendid bookkeeping.', bonus: m => { m.infectivity = m.infectivity.mul(1.25); } },
  { id: 'wither', name: 'Compost Happens', desc: 'Wither for the first time.', condition: s => s.stats.witherCount >= 1, unlockText: 'Achievement: Compost Happens — from rot, ambition.', bonus: m => { m.infectivity = m.infectivity.mul(1.15); } },
  { id: 'worldsend', name: 'Well, That’s Everyone', desc: 'Bring the whole World to ruin.', condition: s => s.population.total >= 8e9 && (s.population.total - s.population.susceptible) >= 8e9 * 0.95, unlockText: 'Achievement: Well, That’s Everyone — the World is a charming ruin.', bonus: m => { m.infectivity = m.infectivity.mul(1.5); } },
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
