/**
 * Festerwood — module-load check. Imports every module except main.js (which
 * executes DOM code at import) with the Decimal global installed, to catch
 * syntax errors and broken imports without needing a browser.
 *
 * Run: node test/imports.mjs
 */

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
globalThis.Decimal = require('../vendor/break_eternity.min.js');

const mods = [
  '../balance.js', '../content.js', '../state.js', '../population.js',
  '../engine.js', '../a11y.js', '../save.js', '../ui.js',
];

let bad = 0;
for (const m of mods) {
  try { await import(m); console.log('  ok  —', m); }
  catch (e) { console.error('  FAIL —', m, '\n    ', e.message); bad++; }
}
console.log(bad ? `\n${bad} module(s) failed to load` : '\nALL MODULES LOADED');
process.exit(bad ? 1 : 0);
