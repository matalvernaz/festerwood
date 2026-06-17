# Festerwood

A lovingly disgusting little incremental game. You are a small, ambitious
disease: grow producers, spread through a population, harvest the dead for
biomass, and mutate your way from one household to the whole wide world. Gross,
whimsical, and — unusually for the genre — built to be fully playable with a
screen reader.

> *"Plague Tree, but funnier, deeper, and one you can actually play blind."*

## Play

It's static files, no build step:

```sh
cd festerwood
python3 -m http.server 8000
# open http://localhost:8000
```

## The loop (Milestone 1)

- **Producers** (Mold → Fungus → Pustule → Tumour) cascade into **Spores**.
- Spores spread you through an arena's population: **Susceptible → Infected → Dead**.
- Deaths (and, more slowly, the living infected) yield **Biomass**.
- Biomass buys the **Mutation Tree** — Transmission, Symptoms, Resilience, and a capstone.
- **The one real decision:** dead hosts don't spread you. High lethality banks
  biomass fast but throttles your own spread; mild and patient infects everyone.
- Clear an arena to **Expand** to a bigger one. **Wither** rots the whole run down
  for **Strains** — permanent perks that make the next climb faster.

## Accessibility

This is a first-class concern, not a coat of paint:

- Every control is a real `<button>`/`<select>`; nothing is a mouse-only node.
- Cost, owned count, affordability and locked/unlocked all live in each control's
  **accessible name** — never colour alone.
- Discrete events go to `aria-live` regions; we **never** announce per tick. Press
  <kbd>S</kbd> for an on-demand status read.
- `speakNumber()` renders even tetrational values pronounceably ("ten to the ten
  to the…") instead of "ee15".

**Keys:** <kbd>C</kbd> cough · <kbd>1</kbd>–<kbd>4</kbd> grow a producer ·
<kbd>M</kbd> buy max · <kbd>S</kbd> status · <kbd>E</kbd> Expand · <kbd>W</kbd> Wither.

## Tests

```sh
node test/sim.mjs
```

Drives the pure engine headlessly: the core loop, buy-max, the lethality-vs-spread
tension, prestige, and big-number speech.

## Architecture

Vanilla JS ES modules, no bundler. `break_eternity.js` (vendored) provides the
`Decimal` global so currencies never hit the float ceiling.

| File | Role |
|---|---|
| `balance.js` | every tunable constant |
| `content.js` | all content as data (generators, mutations, arenas, perks, achievements, news) |
| `state.js` | default state factory |
| `population.js` | the S-I-D epidemic model |
| `engine.js` | tick, recompute, buying, prestige — pure, no DOM |
| `a11y.js` | `announce()` + `speakNumber()`/`fmt()` |
| `ui.js` | semantic DOM, render-in-place, hotkeys |
| `save.js` | Decimal-aware save/load, export/import, migration |
| `main.js` | load, offline catch-up, tick loop, autosave |

## Roadmap

- **M1 (this):** the plague tree — producers, S-I-D population, mutation tree, one prestige.
- **M2:** more arenas, automation/auto-buyers, events, a second prestige layer.
- **M3:** the race against humanity — a **cure** that fights back (the adversarial counter-currency).
