/**
 * Festerwood — persistence.
 *
 * State holds break_eternity Decimals, which JSON can't round-trip on its own,
 * so we tag them as {__d: "<string>"} on the way out and revive them on the way
 * in. Saves are base64-wrapped JSON in localStorage. Loading deep-merges over a
 * fresh defaultState() so new fields added in later versions can't break an old
 * save. Multipliers are never trusted from a save — main recomputes them.
 */

import { SAVE_VERSION } from './balance.js';
import { defaultState } from './state.js';

const KEY = 'festerwood';

function tag(v) {
  if (v instanceof Decimal) return { __d: v.toString() };
  if (Array.isArray(v)) return v.map(tag);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k in v) o[k] = tag(v[k]);
    return o;
  }
  return v;
}

function untag(v) {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const keys = Object.keys(v);
    if (keys.length === 1 && keys[0] === '__d') return new Decimal(v.__d);
    const o = {};
    for (const k in v) o[k] = untag(v[k]);
    return o;
  }
  if (Array.isArray(v)) return v.map(untag);
  return v;
}

function serialize(state) {
  // Skip the derived multiplier bag; it's rebuilt on load.
  const { mult, ...rest } = state;
  return JSON.stringify(tag(rest));
}

function deserialize(str) {
  return untag(JSON.parse(str));
}

function toB64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}
function fromB64(b64) {
  return decodeURIComponent(escape(atob(b64)));
}

function deepMerge(base, over) {
  if (over === undefined) return base;
  if (base instanceof Decimal) return over instanceof Decimal ? over : base;
  if (over === null) return base;
  if (over instanceof Decimal) return over;
  if (Array.isArray(base)) return Array.isArray(over) ? over : base;
  if (base && typeof base === 'object') {
    const o = {};
    for (const k in base) o[k] = k in over ? deepMerge(base[k], over[k]) : base[k];
    for (const k in over) if (!(k in o)) o[k] = over[k]; // dynamic maps (mutations/perks/achievements)
    return o;
  }
  return over;
}

function migrate(saved) {
  const merged = deepMerge(defaultState(), saved);
  merged.version = SAVE_VERSION;
  return merged;
}

export function save(state) {
  try {
    localStorage.setItem(KEY, toB64(serialize(state)));
  } catch (e) {
    /* quota exceeded / private mode — nothing we can do but carry on */
  }
}

export function load() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return migrate(deserialize(fromB64(raw)));
  } catch (e) {
    console.error('Festerwood: could not load save —', e);
    return null;
  }
}

export function exportSave(state) {
  return toB64(serialize(state));
}

export function importSave(str) {
  return migrate(deserialize(fromB64(str.trim())));
}

export function hardReset() {
  localStorage.removeItem(KEY);
}

/** Persist an already-encoded save string verbatim (used by the Import flow before a reload). */
export function writeRawSave(b64) {
  localStorage.setItem(KEY, b64);
}
