# Festerwood

A lovingly disgusting little idle game. You are a small, ambitious, and
self-replicating disease: the more infected you have, the faster you spread, so
the number climbs on its own. Harvest hosts for biomass, evolve, and rot-and-regrow
your way to ever-sillier numbers. Gross, whimsical, and — unusually for the genre —
built to be fully playable with a screen reader.

> *"Plague Tree, but funnier, and one you can actually play blind."*

## Play

It's static files, no build step:

```sh
cd festerwood
python3 -m http.server 8000
# open http://localhost:8000
```

## The loop (v1)

A pure idle. One number — **infected** — climbs on its own. No zones, no caps.

- The plague is **self-replicating**: growth is `baseSpread × spreadMult ×
  infected^GROWTH_EXPONENT`. The exponent is below 1, so it accelerates as you grow
  without instantly running to infinity. **Cough** for a manual burst early on.
- The infected shed **Biomass**.
- Biomass buys repeatable **Evolutions** — *Contagion* (spread faster) and
  *Potency* (more biomass per host). Level them forever. Unlock **Autocatalysis**
  (a Strains perk) and the plague buys them itself — fully hands-free idle.
- When the numbers get silly, **Wither**: rot the run to mulch for **Strains**,
  then spend them on **Virulence** — a permanent, compounding spread boost.
- Bank enough strains and **Mutate**: a deeper reset that rots strains and
  Virulence away for **Genome**, spent on **Adaptations** (permanent global
  ×spread and ×biomass that survive every Mutate). Three nested tiers —
  Evolutions → Virulence → Adaptations — each loop re-climbing faster.

## Accessibility

This is a first-class concern, not a coat of paint:

- Every control is a real `<button>`/`<select>`; nothing is a mouse-only node.
- Cost, owned count, affordability and locked/unlocked all live in each control's
  **accessible name** — never colour alone.
- Discrete events go to `aria-live` regions; we **never** announce per tick. Press
  <kbd>S</kbd> for an on-demand status read.
- `speakNumber()` renders even tetrational values pronounceably ("ten to the ten
  to the…") instead of "ee15".

**Keys:** <kbd>C</kbd> cough · <kbd>S</kbd> status · <kbd>R</kbd> recap ·
<kbd>W</kbd> Wither · <kbd>M</kbd> Mutate.

## Tests

```sh
node test/imports.mjs && node test/sim.mjs && node test/dom-smoke.mjs
```

`sim.mjs` drives the pure engine headlessly — the self-replicating loop, that
growth stays paced (no NaN/Infinity), repeatable evolutions, prestige, big-number
speech, and an **idle pacing harness** that prints time-to-first-Wither, withers
per few hours, and final Virulence/peak (the balance constants in `balance.js` are
tuned from its output). `dom-smoke.mjs` stubs the DOM to check render + progressive
disclosure; `imports.mjs` is the module-load canary.

## Architecture

Vanilla JS ES modules, no bundler. `break_eternity.js` (vendored) provides the
`Decimal` global so currencies never hit the float ceiling.

| File | Role |
|---|---|
| `balance.js` | every tunable constant |
| `content.js` | all content as data (evolutions, the Virulence perk, achievements, news) |
| `state.js` | default state factory |
| `engine.js` | tick (paced self-replication), recompute, buying, prestige — pure, no DOM |
| `a11y.js` | `announce()` + `speakNumber()`/`fmt()` |
| `ui.js` | semantic DOM, render-in-place, hotkeys |
| `save.js` | Decimal-aware save/load, export/import, migration |
| `main.js` | load, offline catch-up, tick loop, autosave |

## Roadmap

- **v1:** the pure idle — self-replicating infected, repeatable evolutions
  (Contagion/Potency), and one prestige (Strains → Virulence).
- **M2 (in progress):** ✅ automation (Autocatalysis) and ✅ a second prestige
  layer (Mutate → Genome → Adaptations). Still to come: events, soft-caps to shape
  the prestige cadence, more repeatable upgrades, and Genome-tier automation.
- **M3:** the race against humanity — a **cure** that fights back (the adversarial
  counter-currency).
