/**
 * Festerwood — UI layer (the only module that touches the DOM beyond the live
 * regions in a11y.js).
 *
 * Design rules that keep it accessible:
 *  - Every control is a real <button> / <select>; nothing is a clickable div.
 *  - All state that matters lives in each control's *text* (its accessible name):
 *    cost, owned count, affordability, ETA-to-afford. Never colour-only.
 *  - Progressive disclosure: locked/future content is HIDDEN (`hidden`), not
 *    greyed — a screen reader should never have to tab past things that don't
 *    matter yet. New unlocks are announced once (politely), and a recap key
 *    reads "what changed since you last checked".
 *  - We update text/disabled/hidden in place every frame on a fixed set of
 *    nodes (no DOM churn), so a screen reader sees stable structure.
 */

import { GENERATORS, MUTATIONS, ARENAS, PERKS, ACHIEVEMENTS, NEWS } from './content.js';
import { fmt, speakNumber, announce, setVerbosity } from './a11y.js';
import { save, exportSave, importSave, hardReset, writeRawSave } from './save.js';
import * as E from './engine.js';

const GEN_NAME = Object.fromEntries(GENERATORS.map(g => [g.id, g.name]));
const MUT_BY_ID = Object.fromEntries(MUTATIONS.map(m => [m.id, m]));
const PERK_BY_ID = Object.fromEntries(PERKS.map(p => [p.id, p]));
const MUT_BRANCHES = ['Transmission', 'Symptoms', 'Resilience', 'Apex'];

let game = null;
let lastCoughAt = 0; // throttles cough announcements so holding C doesn't flood the screen reader
const el = {};
const genRefs = {}; // id -> {li, name, b1, b10, bmax}
const mutRefs = {}; // id -> button
const mutHeaderRefs = {}; // branch -> h3
const perkRefs = {}; // id -> button
const achRefs = {}; // id -> li

const $ = id => document.getElementById(id);

// --------------------------------------------------------------------------
// Build (once)
// --------------------------------------------------------------------------

export function buildUI(state) {
  game = state;

  el.status = $('status-line');
  el.arena = $('arena-line');
  el.vitals = $('vitals');
  el.biomass = $('biomass-line');
  el.strain = $('strain-line');
  el.genList = $('gen-list');
  el.mutTree = $('mut-tree');
  el.mutSec = $('mut-sec');
  el.perkList = $('perk-list');
  el.perkSec = $('perk-sec');
  el.achList = $('ach-list');
  el.achSec = $('ach-sec');
  el.achSummary = null;
  el.expand = $('expand-btn');
  el.wither = $('wither-btn');
  el.news = $('news');
  el.saveIO = $('save-io');

  buildGenerators();
  buildMutationTree();
  buildPerks();
  buildAchievements();
  buildHelp();
  wireEvents();

  $('verbosity').value = game.settings.announceVerbosity;
  seedSeen(game); // mark everything already-revealed as known, so we only announce FUTURE unlocks
  rotateNews(game);
}

function buildGenerators() {
  el.genList.innerHTML = '';
  for (let i = 0; i < GENERATORS.length; i++) {
    const g = GENERATORS[i];
    const li = document.createElement('li');
    li.className = 'card';
    const name = document.createElement('div');
    name.className = 'card-name';
    const row = document.createElement('div');
    row.className = 'row';
    const b1 = mkBuyBtn(`${g.id}:1`);
    const b10 = mkBuyBtn(`${g.id}:10`);
    const bmax = mkBuyBtn(`${g.id}:max`);
    row.append(b1, b10, bmax);
    li.append(name, row);
    el.genList.append(li);
    genRefs[g.id] = { li, name, b1, b10, bmax };
  }
}

function mkBuyBtn(dataBuy) {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.buy = dataBuy;
  return b;
}

function buildMutationTree() {
  el.mutTree.innerHTML = '';
  for (const branch of MUT_BRANCHES) {
    const muts = MUTATIONS.filter(m => m.branch === branch);
    if (!muts.length) continue;
    const h = document.createElement('h3');
    h.textContent = branch;
    el.mutTree.append(h);
    mutHeaderRefs[branch] = h;
    for (const m of muts) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mut-node';
      b.dataset.mut = m.id;
      el.mutTree.append(b);
      mutRefs[m.id] = b;
    }
  }
}

function buildPerks() {
  el.perkList.innerHTML = '';
  for (const p of PERKS) {
    const li = document.createElement('li');
    li.className = 'card';
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.perk = p.id;
    li.append(b);
    el.perkList.append(li);
    perkRefs[p.id] = b;
  }
}

function buildAchievements() {
  el.achList.innerHTML = '';
  for (const a of ACHIEVEMENTS) {
    const li = document.createElement('li');
    li.className = 'card';
    el.achList.append(li);
    achRefs[a.id] = li;
  }
  el.achSummary = document.createElement('li');
  el.achSummary.className = 'card mut-locked';
  el.achList.append(el.achSummary);
}

function buildHelp() {
  $('help').innerHTML = `
    <p>You are a small, ambitious disease. Grow producers to make <strong>spores</strong>;
    spores spread you through a population; the infected sicken and die, and every death
    feeds you <strong>biomass</strong>. Spend biomass on the <strong>Mutation Tree</strong>.</p>
    <p><strong>The one real choice:</strong> lethality earns biomass fast, but the dead can't
    spread you. Mild and patient infects everyone; nasty and impatient burns out. Find the balance.</p>
    <p>Clear an arena to <strong>Expand</strong> to a bigger one. <strong>Wither</strong> rots your
    whole run down to mulch in exchange for <strong>Strains</strong> — permanent perks that make the
    next climb faster. New things unlock as you progress; they're announced when they do.</p>
    <p><strong>Keys:</strong></p>
    <ul>
      <li><kbd>C</kbd> — cough (make spores, seed an infection)</li>
      <li><kbd>1</kbd>–<kbd>4</kbd> — grow one of each producer</li>
      <li><kbd>M</kbd> — buy as many producers as you can afford</li>
      <li><kbd>S</kbd> — read your status aloud</li>
      <li><kbd>R</kbd> — recap what's changed since you last checked</li>
      <li><kbd>E</kbd> — Expand &nbsp; <kbd>W</kbd> — Wither</li>
    </ul>`;
}

// --------------------------------------------------------------------------
// Progressive disclosure
// --------------------------------------------------------------------------

function genRevealed(state, i) {
  if (i === 0) return true; // Mold is always there
  return state.stats.maxSpores.gte(GENERATORS[i].baseCost * 0.5)
    || state.generators[GENERATORS[i - 1].id].bought.gte(10);
}
function mutationsRevealed(state) { return state.stats.totalDeadAllTime.gte(1); } // after the first death
function strainsRevealed(state) { return state.stats.witherCount >= 1 || state.strains.gt(0); } // after the first Wither
function achievementsRevealed(state) { return Object.keys(state.achievements).length > 0; }

const SECTION_LABEL = {
  'sec:mut': 'the Mutation Tree — spend biomass to evolve',
  'sec:strain': 'Strains — permanent perks bought by Withering',
  'sec:ach': 'Achievements',
};
function revealKeys(state) {
  const keys = [];
  for (let i = 0; i < GENERATORS.length; i++) if (genRevealed(state, i)) keys.push('gen:' + GENERATORS[i].id);
  if (mutationsRevealed(state)) {
    keys.push('sec:mut');
    for (const m of MUTATIONS) if (state.mutations[m.id] || E.mutationUnlocked(state, m.id)) keys.push('mut:' + m.id);
  }
  if (strainsRevealed(state)) keys.push('sec:strain');
  if (achievementsRevealed(state)) keys.push('sec:ach');
  return keys;
}
function labelFor(key) {
  if (SECTION_LABEL[key]) return SECTION_LABEL[key];
  if (key.startsWith('gen:')) return 'a new producer, ' + GEN_NAME[key.slice(4)];
  if (key.startsWith('mut:')) return 'a new mutation, ' + MUT_BY_ID[key.slice(4)].name;
  return key;
}
function seedSeen(state) {
  for (const k of revealKeys(state)) state.seen[k] = true;
}
function announceUnlocks(state) {
  const fresh = [];
  for (const k of revealKeys(state)) if (!state.seen[k]) { state.seen[k] = true; fresh.push(k); }
  if (!fresh.length) return;
  const msg = 'Unlocked: ' + fresh.map(labelFor).join('; ') + '.';
  pushRecent(state, msg);
  announce(msg); // polite, one-time
}

/** Append a notable event to the recap log (also called from main for engine events). */
export function pushRecent(state, text) {
  if (!state.recentLog) state.recentLog = [];
  state.recentLog.push(text);
  if (state.recentLog.length > 40) state.recentLog.shift();
}

// --------------------------------------------------------------------------
// Sensing helpers
// --------------------------------------------------------------------------

function fmtTime(secs) {
  if (!isFinite(secs)) return null;
  if (secs <= 0) return null;
  if (secs < 1) return 'under a second';
  if (secs < 90) return `${Math.ceil(secs)}s`;
  if (secs < 5400) return `${Math.ceil(secs / 60)}m`;
  if (secs < 1e7) return `${Math.ceil(secs / 3600)}h`;
  return 'a long while';
}
/** Time-to-afford string ("~4s") or null if already affordable / no income. */
function eta(cost, have, rate) {
  if (!rate || rate.lte(0)) return null;
  const deficit = (cost instanceof Decimal ? cost : new Decimal(cost)).sub(have);
  if (deficit.lte(0)) return null;
  return fmtTime(deficit.div(rate).toNumber());
}

// --------------------------------------------------------------------------
// Render (every frame)
// --------------------------------------------------------------------------

export function render(state) {
  game = state;
  const rate = E.currentSporeRate(state);

  el.status.textContent = `Spores: ${fmt(state.spores)} (+${fmt(rate)}/s).  Biomass: ${fmt(state.biomass)}.  Strains: ${fmt(state.strains)}.`;

  const a = ARENAS[state.arenaIndex];
  const p = state.population;
  const everPct = p.total > 0 ? ((p.total - p.susceptible) / p.total) * 100 : 0;
  const clearEta = everPct < 99.9 ? fmtTime(state.clearEtaSeconds) : null;
  el.arena.textContent = `In ${a.name}: ${fmt(Math.floor(p.susceptible))} healthy, ${fmt(Math.floor(p.infected))} infected, ${fmt(Math.floor(p.dead))} dead, of ${fmt(p.total)}. ${everPct.toFixed(1)}% have caught it${clearEta ? `, clearing in ~${clearEta}` : ''}. ${a.blurb}`;

  const ss = E.spreadStats(state);
  el.vitals.textContent = ss.stalling
    ? `⚠ Infectivity ×${fmt(ss.infectivityMult)}, lethality ×${fmt(ss.lethalityMult)}. Your hosts are dying faster than they spread it — the plague is burning out. Ease off lethality, or Wither and rebuild leaner.`
    : `Infectivity ×${fmt(ss.infectivityMult)}, lethality ×${fmt(ss.lethalityMult)}. Spreading nicely.`;

  el.biomass.textContent = `Biomass available: ${fmt(state.biomass)}.`;
  el.strain.textContent = `Strains banked: ${fmt(state.strains)}.`;

  renderGenerators(state, rate);
  renderMutations(state);
  renderPerks(state);
  renderAchievements(state);
  renderPrestige(state);

  // sections
  el.mutSec.hidden = !mutationsRevealed(state);
  el.perkSec.hidden = !strainsRevealed(state);
  el.achSec.hidden = !achievementsRevealed(state);

  announceUnlocks(state);
}

function renderGenerators(state, sporeRate) {
  for (let i = 0; i < GENERATORS.length; i++) {
    const g = GENERATORS[i];
    const ref = genRefs[g.id];
    const revealed = genRevealed(state, i);
    ref.li.hidden = !revealed;
    if (!revealed) continue;

    const gen = state.generators[g.id];
    const per = i === 0 ? `${fmt(sporeRate)} spores/s` : `${fmt(gen.count.mul(g.prod))} ${g.makes}/s`;
    ref.name.textContent = `${g.name} — ${fmt(gen.count)} owned, making ${per}. (key ${i + 1})`;

    const c1 = E.generatorCost(state, g.id, 1);
    const c10 = E.generatorCost(state, g.id, 10);
    const n = E.maxAffordable(state, g.id);
    const e1 = state.spores.lt(c1) ? eta(c1, state.spores, sporeRate) : null;

    setBtn(ref.b1, `Buy 1 — ${fmt(c1)} spores${e1 ? ` (~${e1})` : ''}`, state.spores.lt(c1));
    setBtn(ref.b10, `Buy 10 — ${fmt(c10)} spores`, state.spores.lt(c10));
    const canMax = n.gt(0);
    setBtn(ref.bmax, canMax ? `Max (${fmt(n)}) — ${fmt(E.generatorCost(state, g.id, n))} spores` : 'Max — none affordable', !canMax);
  }
}

function renderMutations(state) {
  const br = E.biomassRate(state);
  for (const branch of MUT_BRANCHES) {
    let anyVisible = false;
    for (const m of MUTATIONS) {
      if (m.branch !== branch) continue;
      const b = mutRefs[m.id];
      const owned = !!state.mutations[m.id];
      const visible = owned || E.mutationUnlocked(state, m.id);
      b.hidden = !visible;
      if (!visible) continue;
      anyVisible = true;
      if (owned) {
        b.textContent = `✓ ${m.name} — ${m.effect}. ${m.flavor}`;
        b.className = 'mut-node mut-owned';
        b.disabled = true;
      } else {
        const affordable = state.biomass.gte(m.cost);
        const e = affordable ? null : eta(m.cost, state.biomass, br);
        b.textContent = `${m.name} — ${m.effect} — ${fmt(m.cost)} biomass${affordable ? '' : (e ? ` (~${e})` : ' (need more)')}. ${m.flavor}`;
        b.className = affordable ? 'mut-node go' : 'mut-node';
        b.disabled = !affordable;
      }
    }
    if (mutHeaderRefs[branch]) mutHeaderRefs[branch].hidden = !anyVisible;
  }
}

function renderPerks(state) {
  for (const p of PERKS) {
    const b = perkRefs[p.id];
    const lvl = state.perks[p.id] || 0;
    if (p.maxLevel && lvl >= p.maxLevel) {
      setBtn(b, `${p.name} — maxed (Lv ${lvl}). ${p.desc(lvl)}.`, true);
      b.className = '';
      continue;
    }
    const cost = E.perkCost(p, lvl);
    const affordable = state.strains.gte(cost);
    b.className = affordable ? 'go' : '';
    setBtn(b, `${p.name} (Lv ${lvl}) — next: ${p.desc(lvl + 1)} for ${fmt(cost)} strains`, !affordable);
  }
}

function renderAchievements(state) {
  let earned = 0;
  for (const a of ACHIEVEMENTS) {
    const li = achRefs[a.id];
    const got = !!state.achievements[a.id];
    li.hidden = !got;
    if (got) { li.textContent = `✓ ${a.name} — ${a.desc}`; earned++; }
  }
  const remaining = ACHIEVEMENTS.length - earned;
  el.achSummary.hidden = remaining === 0;
  if (remaining > 0) el.achSummary.textContent = `${remaining} more still festering, undiscovered.`;
}

function renderPrestige(state) {
  const canE = E.canExpand(state);
  el.expand.hidden = !canE;
  if (canE) el.expand.textContent = `Expand to ${ARENAS[state.arenaIndex + 1].name} (E)`;

  const gain = E.witherGain(state);
  const canW = E.canWither(state) && gain.gte(1);
  el.wither.hidden = !canW;
  if (canW) el.wither.textContent = `Wither for ${fmt(gain)} Strains (W)`;
}

function setBtn(btn, text, disabled) {
  btn.textContent = text;
  btn.disabled = disabled;
}

// --------------------------------------------------------------------------
// Events
// --------------------------------------------------------------------------

function wireEvents() {
  $('cough-btn').addEventListener('click', doCough);
  $('status-btn').addEventListener('click', announceStatus);
  el.expand.addEventListener('click', doExpand);
  el.wither.addEventListener('click', doWither);

  $('verbosity').addEventListener('change', e => {
    game.settings.announceVerbosity = e.target.value;
    setVerbosity(e.target.value);
    save(game);
    announce('Announcement level set.', true);
  });

  $('export-btn').addEventListener('click', () => {
    el.saveIO.hidden = false;
    el.saveIO.value = exportSave(game);
    el.saveIO.focus();
    el.saveIO.select();
    announce('Save exported into the text box. Copy it somewhere safe.', true);
  });
  $('import-btn').addEventListener('click', doImport);
  $('hardreset-btn').addEventListener('click', () => {
    if (window.confirm('Hard reset? This erases everything — strains, perks, all of it. No counter-curse.')) {
      hardReset();
      location.reload();
    }
  });

  document.addEventListener('click', ev => {
    const t = ev.target.closest('[data-buy],[data-mut],[data-perk]');
    if (!t) return;
    if (t.dataset.buy) onBuyGenerator(t.dataset.buy);
    else if (t.dataset.mut) onBuyMutation(t.dataset.mut);
    else if (t.dataset.perk) onBuyPerk(t.dataset.perk);
  });

  document.addEventListener('keydown', onKey);
}

function onKey(ev) {
  const tag = (ev.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
  const k = ev.key.toLowerCase();

  if (k === 'c') doCough();
  else if (k >= '1' && k <= '4') {
    const g = GENERATORS[Number(k) - 1];
    if (g) { const r = E.buyGenerator(game, g.id, 1); if (r.bought.gt(0)) { announce(`Grew a ${GEN_NAME[g.id]}.`); save(game); } else announce(`Not enough spores for a ${GEN_NAME[g.id]}.`); render(game); }
  } else if (k === 'm') {
    let any = false;
    for (const g of GENERATORS) if (E.buyGenerator(game, g.id, 'max').bought.gt(0)) any = true;
    if (any) { announce('Bought as many producers as you can afford.'); save(game); }
    render(game);
  } else if (k === 's') announceStatus();
  else if (k === 'r') doRecap();
  else if (k === 'e') doExpand();
  else if (k === 'w') doWither();
  else if (k === '?' || k === 'h') { $('help').focus(); announce('How to play.', true); }
  else return;

  ev.preventDefault();
}

function onBuyGenerator(dataBuy) {
  const [id, amt] = dataBuy.split(':');
  const r = E.buyGenerator(game, id, amt === 'max' ? 'max' : Number(amt));
  if (r.bought.gt(0)) { announce(`Grew ${fmt(r.bought)} ${GEN_NAME[id]}.`); save(game); }
  render(game);
}

function onBuyMutation(id) {
  if (E.buyMutation(game, id)) { announce(`Mutation acquired: ${MUT_BY_ID[id].name}.`); save(game); render(game); }
}

function onBuyPerk(id) {
  if (E.buyPerk(game, id)) {
    announce(`Strain perk: ${PERK_BY_ID[id].name}, now level ${game.perks[id]}.`);
    save(game);
    render(game);
  }
}

function doCough() {
  const r = E.cough(game);
  if (game.settings.announceVerbosity !== 'quiet') {
    const now = Date.now();
    if (now - lastCoughAt > 800) {
      lastCoughAt = now;
      announce(r.seeded > 0 ? `Cough. ${fmt(game.spores)} spores, and someone caught it.` : `Cough. ${fmt(game.spores)} spores.`);
    }
  }
  render(game);
}

function doExpand() {
  if (!E.canExpand(game)) { announce('Nothing to expand into yet — get the current arena thoroughly infected first.', true); return; }
  const r = E.expand(game);
  if (r) { announce(`Expanded to ${r.arena.name}. Fresh hosts, how lovely.`, true); pushRecent(game, `Expanded to ${r.arena.name}.`); save(game); render(game); }
}

function doWither() {
  const gain = E.witherGain(game);
  if (!E.canWither(game) || gain.lt(1)) { announce('Not enough death banked to Wither yet.', true); return; }
  if (!window.confirm('Wither? Your whole current run rots to mulch — producers, mutations, spores and biomass all reset — in exchange for Strains. Perks are kept.')) return;
  const r = E.wither(game);
  if (r) { announce(`Withered. Gained ${fmt(r.gain)} strains. From the muck, something wigglier begins.`, true); pushRecent(game, `Withered for ${fmt(r.gain)} strains.`); save(game); render(game); }
}

function doImport() {
  if (el.saveIO.hidden || !el.saveIO.value.trim()) {
    el.saveIO.hidden = false;
    el.saveIO.focus();
    announce('Paste your save into the text box, then press Import again.', true);
    return;
  }
  const txt = el.saveIO.value.trim();
  try {
    importSave(txt); // throws if unreadable
    writeRawSave(txt);
    announce('Save imported. Reloading.', true);
    setTimeout(() => location.reload(), 350);
  } catch (e) {
    announce('That save data could not be read.', true);
  }
}

function announceStatus() {
  const rate = E.currentSporeRate(game);
  const a = ARENAS[game.arenaIndex];
  const p = game.population;
  const ss = E.spreadStats(game);
  const everPct = p.total > 0 ? ((p.total - p.susceptible) / p.total) * 100 : 0;
  const clearEta = everPct < 99.9 ? fmtTime(game.clearEtaSeconds) : null;
  announce(
    `${speakNumber(game.spores)} spores, plus ${speakNumber(rate)} per second. ` +
    `${a.name}: ${everPct.toFixed(0)} percent infected${clearEta ? `, clearing in about ${clearEta}` : ''}; ` +
    `${speakNumber(Math.floor(p.dead))} dead of ${speakNumber(p.total)}. ` +
    `${speakNumber(game.biomass)} biomass, ${speakNumber(game.strains)} strains.` +
    (ss.stalling ? ' Warning: it is killing hosts faster than it spreads, and is burning out.' : ''),
    true,
  );
}

function doRecap() {
  const log = game.recentLog || [];
  const fresh = log.slice(game.recentReadIdx || 0);
  game.recentReadIdx = log.length;
  if (!fresh.length) { announce('Nothing new since you last checked.', true); return; }
  announce('Recently: ' + fresh.slice(-6).join(' '), true);
}

export function rotateNews(state) {
  el.news.textContent = NEWS[state.newsIndex % NEWS.length];
  state.newsIndex = (state.newsIndex + 1) % NEWS.length;
}
