/**
 * Festerwood — all game content as data.
 *
 * Adding content means extending these arrays, never touching the engine.
 * Costs are plain numbers (the engine wraps them in Decimal at point of use);
 * `apply(mult)` functions mutate the multiplier bag the engine builds in
 * recompute(), so effects are always recomputed from scratch, never stored.
 *
 * Voice note: every player-facing string is gross-whimsical. A narrator
 * delighted by the disgusting. Keep it that way.
 */

/** Producer cascade. Index 0 (Mold) makes Spores; each higher tier makes the tier below. */
export const GENERATORS = [
  { id: 'mold', name: 'Mold', baseCost: 10, prod: 0.1, makes: 'spores', desc: 'A cheerful patch of mildew that exhales spores.' },
  { id: 'fungus', name: 'Fungus', baseCost: 120, prod: 0.1, makes: 'Mold', desc: 'Sprouts fresh Mold whenever no one is looking.' },
  { id: 'pustule', name: 'Pustule', baseCost: 1400, prod: 0.1, makes: 'Fungus', desc: 'Buds new Fungus with a deeply satisfying squelch.' },
  { id: 'tumour', name: 'Tumour', baseCost: 20000, prod: 0.1, makes: 'Pustules', desc: 'An ambitious lump with a five-year plan to grow Pustules.' },
];

/**
 * The Mutation Tree — bought with Biomass, reset each Wither (a per-run build).
 * `prereqs` form the tree (a node is locked until its parents are owned).
 * Three branches plus a cross-branch apex.
 */
export const MUTATIONS = [
  // Transmission — raises infectivity (spread)
  { id: 't1', name: 'Sticky Handshake', branch: 'Transmission', cost: 5, prereqs: [], effect: '+100% infectivity', flavor: 'Everyone insists on shaking hands. How thoughtful.', apply: m => { m.infectivity = m.infectivity.mul(2); } },
  { id: 't2', name: 'Airborne Giggles', branch: 'Transmission', cost: 50, prereqs: ['t1'], effect: '+150% infectivity', flavor: 'It rides out on every snicker and snort.', apply: m => { m.infectivity = m.infectivity.mul(2.5); } },
  { id: 't3', name: 'Viral Tweet', branch: 'Transmission', cost: 600, prereqs: ['t2'], effect: '+300% infectivity', flavor: 'Technically a meme now. Engagement is through the roof.', apply: m => { m.infectivity = m.infectivity.mul(4); } },

  // Symptoms — raises lethality AND biomass yield (tempting, but dead hosts stop spreading)
  { id: 's1', name: 'Explosive Sneezing', branch: 'Symptoms', cost: 8, prereqs: [], effect: '+50% lethality, +50% biomass', flavor: 'Bless you. Bless ALL of you.', apply: m => { m.lethality = m.lethality.mul(1.5); m.biomass = m.biomass.mul(1.5); } },
  { id: 's2', name: 'Liquefaction', branch: 'Symptoms', cost: 80, prereqs: ['s1'], effect: '+100% lethality, +100% biomass', flavor: 'The hosts become so much more... portable.', apply: m => { m.lethality = m.lethality.mul(2); m.biomass = m.biomass.mul(2); } },
  { id: 's3', name: 'Total Organ Confusion', branch: 'Symptoms', cost: 900, prereqs: ['s2'], effect: '+200% lethality, +200% biomass', flavor: 'The spleen is doing the lungs’ job now. Nobody is happy.', apply: m => { m.lethality = m.lethality.mul(3); m.biomass = m.biomass.mul(3); } },

  // Resilience — raises spore production
  { id: 'r1', name: 'Spore Hardening', branch: 'Resilience', cost: 6, prereqs: [], effect: '+100% spore production', flavor: 'Little spores in little raincoats.', apply: m => { m.spore = m.spore.mul(2); } },
  { id: 'r2', name: 'Antiseptic Indifference', branch: 'Resilience', cost: 70, prereqs: ['r1'], effect: '+150% spore production', flavor: 'It read the disinfectant label and laughed.', apply: m => { m.spore = m.spore.mul(2.5); } },
  { id: 'r3', name: 'Hand-Sanitizer Shrug', branch: 'Resilience', cost: 800, prereqs: ['r2'], effect: '+300% spore production', flavor: 'A whole pump of the stuff. It didn’t even flinch.', apply: m => { m.spore = m.spore.mul(4); } },

  // Apex — needs the tip of all three branches
  { id: 'apex', name: 'Sentient Mucus', branch: 'Apex', cost: 5000, prereqs: ['t3', 's3', 'r3'], effect: 'Doubles everything', flavor: 'It has opinions now. They are all phlegm-based.', apply: m => { m.infectivity = m.infectivity.mul(2); m.lethality = m.lethality.mul(2); m.biomass = m.biomass.mul(2); m.spore = m.spore.mul(2); } },
];

/**
 * Arenas — progressive populations. Clear one to Expand to the next.
 * `immunity` divides the transmission rate and scales steeply, so a single
 * un-prestiged run walls out partway: that wall is what drives the
 * Wither → Strains → perks → re-climb loop (the long game).
 */
export const ARENAS = [
  { id: 'household', name: 'the Henderson Household', population: 5, immunity: 1, blurb: 'Five people and a dog’s water bowl. A cosy place to begin.' },
  { id: 'block', name: 'Maple Street', population: 120, immunity: 6, blurb: 'A whole cul-de-sac of generously shared doorknobs.' },
  { id: 'town', name: 'the town of Drearyford', population: 8000, immunity: 20, blurb: 'One supermarket, one school, infinite handrails.' },
  { id: 'city', name: 'the city of Grimewick', population: 600000, immunity: 120, blurb: 'Public transport! Oh, you’ll love public transport.' },
  { id: 'country', name: 'the nation of Blandia', population: 40000000, immunity: 600, blurb: 'Borders are merely a suggestion to an airborne giggle.' },
  { id: 'world', name: 'the whole wide World', population: 8000000000, immunity: 2000, blurb: 'Everything. Everyone. All of it. Yum.' },
];

/** Strains shop — permanent perks bought with Strains, kept through every Wither. cost(level) & desc(level) are functions. */
export const PERKS = [
  { id: 'sporous', name: 'Sporious Output', maxLevel: 30, cost: l => Math.ceil(2 * Math.pow(1.35, l)), desc: l => `+${25 * l}% spore production`, apply: (m, l) => { m.spore = m.spore.mul(1 + 0.25 * l); } },
  { id: 'marrow', name: 'Rich Marrow', maxLevel: 30, cost: l => Math.ceil(2 * Math.pow(1.35, l)), desc: l => `+${25 * l}% biomass`, apply: (m, l) => { m.biomass = m.biomass.mul(1 + 0.25 * l); } },
  { id: 'infectious', name: 'Born Infectious', maxLevel: 30, cost: l => Math.ceil(3 * Math.pow(1.4, l)), desc: l => `+${30 * l}% infectivity`, apply: (m, l) => { m.infectivity = m.infectivity.mul(1 + 0.3 * l); } },
  { id: 'virulent', name: 'Naturally Nasty', maxLevel: 30, cost: l => Math.ceil(3 * Math.pow(1.4, l)), desc: l => `+${30 * l}% lethality`, apply: (m, l) => { m.lethality = m.lethality.mul(1 + 0.3 * l); } },
];

/** Achievements. Some grant a real, permanent multiplier via `bonus(mult)` — milestone bonuses, not just badges. */
export const ACHIEVEMENTS = [
  { id: 'firstblood', name: 'First Blood', desc: 'Claim your very first victim.', condition: s => s.stats.totalDeadAllTime.gte(1), unlockText: 'Achievement: First Blood — your first victim! They were probably awful anyway.' },
  { id: 'snot', name: 'Snot Going to Lie', desc: 'Hoard a thousand spores.', condition: s => s.spores.gte(1000), unlockText: 'Achievement: Snot Going to Lie — a thousand spores, all yours, all wriggling.' },
  { id: 'family', name: 'Family Misfortune', desc: 'Ruin the Henderson Household.', condition: s => s.stats.highestArena >= 1, unlockText: 'Achievement: Family Misfortune — the Hendersons are no more. The dog is fine.', bonus: m => { m.spore = m.spore.mul(1.1); } },
  { id: 'million', name: 'Seven Figures of Sorrow', desc: 'Kill a million people, all time.', condition: s => s.stats.totalDeadAllTime.gte(1e6), unlockText: 'Achievement: Seven Figures of Sorrow — a million souls. Splendid bookkeeping.', bonus: m => { m.biomass = m.biomass.mul(1.25); } },
  { id: 'wither', name: 'Compost Happens', desc: 'Wither for the first time.', condition: s => s.stats.witherCount >= 1, unlockText: 'Achievement: Compost Happens — from rot, ambition.', bonus: m => { m.spore = m.spore.mul(1.15); } },
  { id: 'worldsend', name: 'Well, That’s Everyone', desc: 'Bring the whole World to ruin.', condition: s => s.population.total >= 8e9 && s.population.dead >= 8e9 * 0.999, unlockText: 'Achievement: Well, That’s Everyone — the World is a charming ruin.', bonus: m => { m.spore = m.spore.mul(1.5); m.biomass = m.biomass.mul(1.5); } },
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
