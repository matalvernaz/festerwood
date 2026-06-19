# Festerwood

A lovingly disgusting little incremental game. You are a small, ambitious
disease: cough yourself into a population, spread, harvest hosts for biomass,
and evolve your way from one household to the whole wide world. Gross, whimsical,
and — unusually for the genre — built to be fully playable with a screen reader.

> *"Plague Tree, but funnier, deeper, and one you can actually play blind."*

## Play

It's static files, no build step:

```sh
cd festerwood
python3 -m http.server 8000
# open http://localhost:8000
```

## The loop (v1)

One engine: the infection. No producers, no second currency to juggle.

- **Cough** to seed an infection; it then spreads on its own through an arena's
  population: **Susceptible → Infected → Dead**.
- Every host you infect yields **Biomass**.
- Biomass buys **Evolutions** — a flat list that each simply make you spread
  faster. Faster is always better; there's no trap pick.
- Clear an arena to **Expand** to a bigger one, up to the whole World.
- When a place turns stubborn, **Wither**: rot the run down for **Strains**, then
  spend them on **Virulence** — a permanent, compounding spread boost. The wall
  lives at the World; prestige is how you break through it.

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
<kbd>E</kbd> Expand · <kbd>W</kbd> Wither.

## Tests

```sh
node test/imports.mjs && node test/sim.mjs && node test/dom-smoke.mjs
```

`sim.mjs` drives the pure engine headlessly — the single-engine loop, flat
evolutions, prestige, big-number speech, and a **greedy-bot pacing harness** that
prints arena clear times, the wall depth, and withers-to-World (the balance
constants in `balance.js` are tuned from its output). `dom-smoke.mjs` stubs the
DOM to check render + progressive disclosure; `imports.mjs` is the module-load
canary.

## Architecture

Vanilla JS ES modules, no bundler. `break_eternity.js` (vendored) provides the
`Decimal` global so currencies never hit the float ceiling.

| File | Role |
|---|---|
| `balance.js` | every tunable constant |
| `content.js` | all content as data (evolutions, arenas, the Virulence perk, achievements, news) |
| `state.js` | default state factory |
| `population.js` | the S-I-D epidemic model |
| `engine.js` | tick, recompute, buying, prestige — pure, no DOM |
| `a11y.js` | `announce()` + `speakNumber()`/`fmt()` |
| `ui.js` | semantic DOM, render-in-place, hotkeys |
| `save.js` | Decimal-aware save/load, export/import, migration |
| `main.js` | load, offline catch-up, tick loop, autosave |

## Roadmap

- **v1 (this):** the legible single engine — spread, biomass, a flat evolution
  list, the arena ladder, and one prestige (Strains → Virulence).
- **M2:** the **Mild/Nasty stance** (a real in-run decision — the lethality
  trade-off, done legibly), the evolution **tree** growing out of the flat list,
  automation/auto-buyers, events, a second prestige layer, more arenas.
- **M3:** the race against humanity — a **cure** that fights back (the adversarial
  counter-currency).
