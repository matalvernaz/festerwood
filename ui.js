/**
 * Festerwood — UI layer (the only module that touches the DOM beyond the live
 * regions in a11y.js).
 *
 * Design rules that keep it accessible:
 *  - Every control is a real <button> / <select>; nothing is a clickable div.
 *  - All state that matters lives in each control's *text* (its accessible name):
 *    level, cost, affordability, ETA-to-afford. Never colour-only. Status figures
 *    are plain readout text, never buttons.
 *  - Progressive disclosure: locked/future content is HIDDEN (`hidden`), not
 *    greyed. New unlocks are announced once (politely); a recap key reads "what
 *    changed since you last checked".
 *  - We update text/disabled/hidden in place every frame on a fixed set of nodes
 *    (no DOM churn), so a screen reader sees stable structure.
 */

import { EVOLUTIONS, PERKS, ACHIEVEMENTS, NEWS } from './content.js';
import { fmt, speakNumber, announce, setVerbosity } from './a11y.js';
import { save, exportSave, importSave, hardReset, writeRawSave } from './save.js';
import * as E from './engine.js';

const EVO_BY_ID = Object.fromEntries(EVOLUTIONS.map(e => [e.id, e]));
const PERK_BY_ID = Object.fromEntries(PERKS.map(p => [p.id, p]));

let game = null;
let lastCoughAt = 0; // throttles cough announcements so holding C doesn't flood the screen reader
const el = {};
const evoRefs = {}; // id -> button
const perkRefs = {}; // id -> button
const achRefs = {}; // id -> li

const $ = id => document.getElementById(id);

// --------------------------------------------------------------------------
// Build (once)
// --------------------------------------------------------------------------

export function buildUI(state) {
  game = state;

  el.status = $('status-line');
  el.rates = $('rates');
  el.biomass = $('biomass-line');
  el.strain = $('strain-line');
  el.evoList = $('evo-list');
  el.evoSec = $('evo-sec');
  el.perkList = $('perk-list');
  el.perkSec = $('perk-sec');
  el.achList = $('ach-list');
  el.achSec = $('ach-sec');
  el.achSummary = null;
  el.wither = $('wither-btn');
  el.news = $('news');
  el.saveIO = $('save-io');

  buildEvolutions();
  buildPerks();
  buildAchievements();
  buildHelp();
  wireEvents();

  $('verbosity').value = game.settings.announceVerbosity;
  seedSeen(game); // mark everything already-revealed as known, so we only announce FUTURE unlocks
  rotateNews(game);
}

function buildEvolutions() {
  el.evoList.innerHTML = '';
  for (const ev of EVOLUTIONS) {
    const li = document.createElement('li');
    li.className = 'card';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'evo-node';
    b.dataset.evo = ev.id;
    li.append(b);
    el.evoList.append(li);
    evoRefs[ev.id] = b;
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
  el.achSummary.className = 'card';
  el.achList.append(el.achSummary);
}

function buildHelp() {
  $('help').innerHTML = `
    <p>You are a small, ambitious disease, and you are <strong>self-replicating</strong>:
    the more <strong>infected</strong> you have, the faster you spread. It grows on its own —
    this is an idle game, so the number climbs whether you're watching or not. <strong>Cough</strong>
    to give it an early nudge.</p>
    <p>The infected shed <strong>biomass</strong>. Spend it on <strong>Evolutions</strong> —
    <em>Contagion</em> spreads you faster, <em>Potency</em> fattens every host's yield. Both are
    repeatable; buy them forever.</p>
    <p>When the numbers get silly, <strong>Wither</strong>: rot the whole run down to mulch for
    <strong>Strains</strong>, then spend them on <strong>Virulence</strong> — a permanent, compounding
    spread boost that carries across every Wither. That's the long game: rot, regrow, faster each time.</p>
    <p><strong>Keys:</strong></p>
    <ul>
      <li><kbd>C</kbd> — cough (a burst of fresh infected)</li>
      <li><kbd>S</kbd> — read your status aloud</li>
      <li><kbd>R</kbd> — recap what's changed since you last checked</li>
      <li><kbd>W</kbd> — Wither</li>
    </ul>`;
}

// --------------------------------------------------------------------------
// Progressive disclosure
// --------------------------------------------------------------------------

function evolutionsRevealed(state) { return Object.keys(state.evolutions).length > 0 || state.biomass.gte(EVOLUTIONS[0].cost(0) * 0.5); }
function strainsRevealed(state) { return state.stats.witherCount >= 1 || state.strains.gt(0); }
function achievementsRevealed(state) { return Object.keys(state.achievements).length > 0; }

const SECTION_LABEL = {
  'sec:evo': 'Evolutions — spend biomass to spread faster',
  'sec:strain': 'Strains — permanent Virulence, bought by Withering',
  'sec:ach': 'Achievements',
};
function revealKeys(state) {
  const keys = [];
  if (evolutionsRevealed(state)) keys.push('sec:evo');
  if (strainsRevealed(state)) keys.push('sec:strain');
  if (achievementsRevealed(state)) keys.push('sec:ach');
  return keys;
}
function labelFor(key) {
  return SECTION_LABEL[key] || key;
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

  el.status.textContent = `Infected: ${fmt(state.infected)}.  Biomass: ${fmt(state.biomass)}.  Strains: ${fmt(state.strains)}.  Virulence ×${fmt(E.currentVirulence(state))}.`;
  el.rates.textContent = `Spreading +${fmt(E.spreadRate(state))} infected/s. Harvesting +${fmt(E.biomassRate(state))} biomass/s.`;

  el.biomass.textContent = `Biomass available: ${fmt(state.biomass)}.`;
  el.strain.textContent = `Strains banked: ${fmt(state.strains)}.`;

  renderEvolutions(state);
  renderPerks(state);
  renderAchievements(state);
  renderPrestige(state);

  // sections
  el.evoSec.hidden = !evolutionsRevealed(state);
  el.perkSec.hidden = !strainsRevealed(state);
  el.achSec.hidden = !achievementsRevealed(state);

  announceUnlocks(state);
}

function renderEvolutions(state) {
  const br = E.biomassRate(state);
  for (const ev of EVOLUTIONS) {
    const b = evoRefs[ev.id];
    const lvl = state.evolutions[ev.id] || 0;
    const cost = E.evolutionCost(ev, lvl);
    const affordable = state.biomass.gte(cost);
    const e = affordable ? null : eta(cost, state.biomass, br);
    b.className = affordable ? 'evo-node go' : 'evo-node';
    setBtn(b, `${ev.name} (Lv ${lvl}) — ${ev.desc(lvl)} — ${fmt(cost)} biomass${affordable ? '' : (e ? ` (~${e})` : '')}. ${ev.flavor}`, !affordable);
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
    const t = ev.target.closest('[data-evo],[data-perk]');
    if (!t) return;
    if (t.dataset.evo) onBuyEvolution(t.dataset.evo);
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
  else if (k === 's') announceStatus();
  else if (k === 'r') doRecap();
  else if (k === 'w') doWither();
  else if (k === '?' || k === 'h') { const d = $('help-sec'); if (d) d.open = true; $('help').focus(); announce('How to play.', true); }
  else return;

  ev.preventDefault();
}

function onBuyEvolution(id) {
  if (E.buyEvolution(game, id)) { announce(`Evolved: ${EVO_BY_ID[id].name}, now level ${game.evolutions[id]}.`); save(game); render(game); }
}

function onBuyPerk(id) {
  if (E.buyPerk(game, id)) {
    announce(`Strain perk: ${PERK_BY_ID[id].name}, now level ${game.perks[id]}.`);
    save(game);
    render(game);
  }
}

function doCough() {
  E.cough(game);
  if (game.settings.announceVerbosity !== 'quiet') {
    const now = Date.now();
    if (now - lastCoughAt > 800) {
      lastCoughAt = now;
      announce(`Cough — a fresh gout of infection. ${fmt(game.infected)} infected.`);
    }
  }
  render(game);
}

function doWither() {
  const gain = E.witherGain(game);
  if (!E.canWither(game) || gain.lt(1)) { announce('Not enough spread banked to Wither yet.', true); return; }
  if (!window.confirm('Wither? Your whole current run rots to mulch — infected, biomass and evolutions all reset — in exchange for Strains. Virulence is kept.')) return;
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
  announce(
    `${speakNumber(game.infected)} infected, spreading ${speakNumber(E.spreadRate(game))} per second. ` +
    `${speakNumber(game.biomass)} biomass, plus ${speakNumber(E.biomassRate(game))} per second. ` +
    `${speakNumber(game.strains)} strains, virulence ${speakNumber(E.currentVirulence(game))}.`,
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
  el.news.textContent = 'Newsflash: ' + NEWS[state.newsIndex % NEWS.length];
  state.newsIndex = (state.newsIndex + 1) % NEWS.length;
}
