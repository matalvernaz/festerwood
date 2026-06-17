/**
 * Festerwood — the accessibility layer.
 *
 * Two jobs:
 *  1. announce() — push discrete events to a screen reader via aria-live regions.
 *     We never announce per tick; only on real events and on the status hotkey.
 *  2. speakNumber() — turn a break_eternity Decimal into something *pronounceable*.
 *     Visual notation like "ee15" or "(10^^7.3)1.2e3" is meaningless aloud, so we
 *     translate it into "ten to the ten to the…". This bignum↔speech problem is
 *     one almost no incremental solves; here it's a first-class concern.
 */

const SCALE_NAMES = ['', ' thousand', ' million', ' billion', ' trillion',
  ' quadrillion', ' quintillion', ' sextillion', ' septillion',
  ' octillion', ' nonillion', ' decillion']; // 1e0, 1e3, … 1e33
const SCALE_SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

let politeRegion = null;
let assertiveRegion = null;
let verbosity = 'normal'; // 'quiet' | 'normal' | 'chatty'

export function initA11y() {
  politeRegion = document.getElementById('sr-polite');
  assertiveRegion = document.getElementById('sr-assertive');
}

export function setVerbosity(v) {
  verbosity = v;
}

/**
 * Announce text to a screen reader. Polite by default; assertive interrupts.
 * Clears then re-sets the region so identical consecutive messages still fire.
 */
export function announce(text, assertive = false) {
  if (!text) return;
  if (verbosity === 'quiet' && !assertive) return;
  const region = assertive ? assertiveRegion : politeRegion;
  if (!region) return;
  region.textContent = '';
  // a tick later so the DOM mutation is observed as a change
  setTimeout(() => { region.textContent = text; }, 30);
}

// --------------------------------------------------------------------------
// Number formatting
// --------------------------------------------------------------------------

/** Compact *visual* notation: 1.50M, 1.23e45, or break_eternity's own tower notation. */
export function fmt(value) {
  const d = value instanceof Decimal ? value : new Decimal(value);
  if (d.sign < 0) return '-' + fmt(d.abs());
  if (d.eq(0)) return '0';
  if (d.lt(1000)) return trimSmall(d.toNumber());

  const log = d.log10();
  if (log.lt(1e15)) {
    const e = log.toNumber();
    const tier = Math.floor(e / 3);
    if (tier < SCALE_SUFFIX.length) {
      const mant = d.div(Decimal.pow(10, tier * 3)).toNumber();
      return `${mant.toFixed(2)}${SCALE_SUFFIX[tier]}`;
    }
    const exp = Math.floor(e);
    const mant = Math.pow(10, e - exp);
    return `${mant.toFixed(2)}e${exp}`;
  }
  return d.toString(); // exponent itself is astronomically large → let break_eternity render it
}

/** Pronounceable *spoken* form for screen readers. */
export function speakNumber(value) {
  const d = value instanceof Decimal ? value : new Decimal(value);
  if (d.sign < 0) return 'minus ' + speakNumber(d.abs());
  if (d.eq(0)) return 'zero';
  if (d.lt(1000)) return trimSmall(d.toNumber());

  const log = d.log10();
  if (log.lt(1e15)) {
    const e = log.toNumber();
    const tier = Math.floor(e / 3);
    if (tier < SCALE_NAMES.length) {
      const mant = d.div(Decimal.pow(10, tier * 3)).toNumber();
      return `${mant.toFixed(2)}${SCALE_NAMES[tier]}`;
    }
    const exp = Math.floor(e);
    const mant = Math.pow(10, e - exp);
    return `${mant.toFixed(2)} times ten to the ${speakExponent(exp)}`;
  }

  // The exponent itself is huge. value = 10^log.
  if (d.layer <= 1) return `ten to the ${speakNumber(log)}`;
  // Tetrational: a tower of tens.
  return `a tower of about ${d.layer + 1} tens — ten, to the ten, to the ten, and so on`;
}

function speakExponent(exp) {
  // Small exponents read fine as plain digits ("ten to the 1000"); large ones
  // are clearer with scale names ("ten to the 1.50 quadrillion").
  return exp < 1e6 ? String(exp) : speakNumber(new Decimal(exp));
}

function trimSmall(n) {
  return Math.abs(n - Math.round(n)) < 1e-9 ? String(Math.round(n)) : n.toFixed(2);
}
