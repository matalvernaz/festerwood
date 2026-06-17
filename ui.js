/**
 * Festerwood — UI layer (the only module that touches the DOM beyond the live
 * regions in a11y.js).
 *
 * Design rules that keep it accessible:
 *  - Every control is a real <button> / <select>; nothing is a clickable div.
 *  - All state that matters lives in each control's *text* (its accessible name):
 *    cost, owned count, affordability, locked/unlocked. Never colour-only.
 *  - We update text and `disabled` in place every frame on a fixed set of nodes
 *    (no DOM churn), so a screen reader sees stable structure.
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
const genRefs = {}; // id -> {name, b1, b10, bmax}
const mutRefs = {}; // id -> button
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
  el.perkList = $('perk-list');
  el.achList = $('ach-list');
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
    genRefs[g.id] = { name, b1, b10, bmax };
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
    next climb faster.</p>
    <p><strong>Keys:</strong></p>
    <ul>
      <li><kbd>C</kbd> — cough (make spores, seed an infection)</li>
      <li><kbd>1</kbd>–<kbd>4</kbd> — grow one of each producer</li>
      <li><kbd>M</kbd> — buy as many producers as you can afford</li>
      <li><kbd>S</kbd> — read your status aloud</li>
      <li><kbd>E</kbd> — Expand &nbsp; <kbd>W</kbd> — Wither</li>
    </ul>`;
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
  el.arena.textContent = `In ${a.name}: ${fmt(Math.floor(p.susceptible))} healthy, ${fmt(Math.floor(p.infected))} infected, ${fmt(Math.floor(p.dead))} dead, of ${fmt(p.total)}. ${a.blurb}`;

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
}

function renderGenerators(state, sporeRate) {
  for (let i = 0; i < GENERATORS.length; i++) {
    const g = GENERATORS[i];
    const ref = genRefs[g.id];
    const gen = state.generators[g.id];

    // production this tier contributes per second
    let per;
    if (i === 0) per = `${fmt(sporeRate)} spores/s`;
    else per = `${fmt(gen.count.mul(g.prod))} ${g.makes}/s`;
    ref.name.textContent = `${g.name} — ${fmt(gen.count)} owned, making ${per}. (key ${i + 1})`;

    const c1 = E.generatorCost(state, g.id, 1);
    const c10 = E.generatorCost(state, g.id, 10);
    const n = E.maxAffordable(state, g.id);

    setBtn(ref.b1, `Buy 1 — ${fmt(c1)} spores`, state.spores.lt(c1));
    setBtn(ref.b10, `Buy 10 — ${fmt(c10)} spores`, state.spores.lt(c10));
    const canMax = n.gt(0);
    setBtn(ref.bmax, canMax ? `Max (${fmt(n)}) — ${fmt(E.generatorCost(state, g.id, n))} spores` : 'Max — none affordable', !canMax);
  }
}

function renderMutations(state) {
  for (const m of MUTATIONS) {
    const b = mutRefs[m.id];
    if (state.mutations[m.id]) {
      b.textContent = `✓ ${m.name} — ${m.effect}. ${m.flavor}`;
      b.className = 'mut-node mut-owned';
      b.disabled = true;
    } else if (E.mutationUnlocked(state, m.id)) {
      const affordable = state.biomass.gte(m.cost);
      b.textContent = `${m.name} — ${m.effect} — costs ${fmt(m.cost)} biomass${affordable ? '' : ' (need more)'}. ${m.flavor}`;
      b.className = affordable ? 'mut-node go' : 'mut-node';
      b.disabled = !affordable;
    } else {
      const needs = (m.prereqs || []).map(id => MUT_BY_ID[id].name).join(', ');
      b.textContent = `🔒 ${m.name} — locked. Needs: ${needs}.`;
      b.className = 'mut-node mut-locked';
      b.disabled = true;
    }
  }
}

function renderPerks(state) {
  for (const p of PERKS) {
    const b = perkRefs[p.id];
    const lvl = state.perks[p.id] || 0;
    if (p.maxLevel && lvl >= p.maxLevel) {
      setBtn(b, `${p.name} — maxed (Lv ${lvl}). ${p.desc(lvl)}.`, true);
      continue;
    }
    const cost = E.perkCost(p, lvl);
    const affordable = state.strains.gte(cost);
    b.className = affordable ? 'go' : '';
    setBtn(b, `${p.name} (Lv ${lvl}) — next: ${p.desc(lvl + 1)} for ${fmt(cost)} strains`, !affordable);
  }
}

function renderAchievements(state) {
  for (const a of ACHIEVEMENTS) {
    const li = achRefs[a.id];
    const got = !!state.achievements[a.id];
    li.textContent = got ? `✓ ${a.name} — ${a.desc}` : `• ${a.name} — ${a.desc}`;
    li.style.opacity = got ? '1' : '0.6';
  }
}

function renderPrestige(state) {
  const canE = E.canExpand(state);
  el.expand.hidden = !canE;
  if (canE) el.expand.textContent = `Expand to ${ARENAS[state.arenaIndex + 1].name} (E)`;

  const canW = E.canWither(state);
  el.wither.hidden = !canW;
  if (canW) el.wither.textContent = `Wither for Strains (W)`;
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

  // Delegated purchases.
  document.addEventListener('click', ev => {
    const t = ev.target.closest('[data-buy],[data-mut],[data-perk]');
    if (!t) return;
    if (t.dataset.buy) onBuyGenerator(t.dataset.buy);
    else if (t.dataset.mut) onBuyMutation(t.dataset.mut);
    else if (t.dataset.perk) onBuyPerk(t.dataset.perk);
  });

  // Hotkeys.
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
    const lvl = game.perks[id];
    announce(`Strain perk: ${PERK_BY_ID[id].name}, now level ${lvl}.`);
    save(game);
    render(game);
  }
}

function doCough() {
  const r = E.cough(game);
  // Always confirm the primary action audibly (a silent cough reads as "broken"),
  // but throttle so holding C doesn't flood the screen reader.
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
  if (!E.canExpand(game)) { announce('Nothing to expand into yet — ruin the current arena first.', true); return; }
  const r = E.expand(game);
  if (r) { announce(`Expanded to ${r.arena.name}. Gained ${fmt(r.gain)} strains. Fresh hosts, how lovely.`, true); save(game); render(game); }
}

function doWither() {
  if (!E.canWither(game)) { announce('Not enough progress to Wither yet.', true); return; }
  if (!window.confirm('Wither? Your whole current run rots to mulch — producers, mutations, spores and biomass all reset — in exchange for Strains. Perks are kept.')) return;
  const r = E.wither(game);
  if (r) { announce(`Withered. Gained ${fmt(r.gain)} strains. From the muck, something wigglier begins.`, true); save(game); render(game); }
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
  announce(
    `${speakNumber(game.spores)} spores, plus ${speakNumber(rate)} per second. ` +
    `${speakNumber(Math.floor(p.infected))} infected and ${speakNumber(Math.floor(p.dead))} dead in ${a.name}, ` +
    `of ${speakNumber(p.total)}. ${speakNumber(game.biomass)} biomass. ${speakNumber(game.strains)} strains.` +
    (ss.stalling ? ' Warning: it is killing hosts faster than it spreads, and is burning out.' : ''),
    true,
  );
}

export function rotateNews(state) {
  el.news.textContent = NEWS[state.newsIndex % NEWS.length];
  state.newsIndex = (state.newsIndex + 1) % NEWS.length;
}
