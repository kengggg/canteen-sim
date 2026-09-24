# Canteen Sim

A 3D simulation that tests one question: does informal table reservation (leaving a bottle, umbrella or lanyard on a
table before buying food) make an office canteen less efficient than free flow?

Two identical canteens run side by side on the **same crowd**: the same people arrive at the same moments and
choose the same food. In canteen **A** a share of groups reserve a whole table first. In canteen **B** nobody reserves.
Everything else, every random draw included, is identical. Evidence comes from many paired lunches with 95%
confidence intervals on four primary endpoints fixed in advance: walk-aways, time from entrance to seat (or giving
up), peak seat utilization and peak throughput.

- **Live page (private claude.ai artifact):** https://claude.ai/artifact/7NBZqCJ7HxeGJ2LCNSnfNv
- **Design spec:** [`docs/superpowers/specs/2026-09-24-canteen-sim-design.md`](docs/superpowers/specs/2026-09-24-canteen-sim-design.md)
- **Assumptions and fairness ledger:** spec §15, also shown in the app's **Assumptions** panel.
- **Implementation plans:** [`docs/superpowers/plans/`](docs/superpowers/plans/)

## Run, test, build

Requires Node 22.

```sh
npm install
npm run dev            # development server
npm test               # unit and rule tests (Vitest)
npm run test:sanity    # model-sanity suite: 30-seed checks, 200 fast-check configs, evidence freshness (~3 min)
npm run bench          # A (100%) and B at defaults; fails on > 10% event drift or a median over 3 s
npm run precompute     # re-run the default reservation sweep (150 runs) into src/generated/evidence.json
npm run golden:update  # Node reference hashes for the cross-browser self-test
npm run build          # dist/index.html — one self-contained file
npx playwright install chromium firefox webkit   # once
npm run test:e2e       # browser tests over `vite preview` of dist/ (CANTEEN_E2E_FIREFOX=0 skips Firefox)
```

After any change to simulation behaviour: bump `MODEL_VERSION` in `src/sim/version.ts`, then run
`npm run precompute`, `npm run golden:update` and `npm run bench -- --update`.

## Reproducing a result

A result is fully determined by the **settings code** (⚙ → *Copy settings code*), which includes the seed, plus the
`MODEL_VERSION` shown in the page footer. Paste the code into ⚙ → *Load settings code* on any copy of the page with the
same model version and press **Restart**: every event, and therefore every hash and metric, is identical in Node,
Chromium, Firefox and WebKit, on the main thread and in workers. Batch results add the number of lunches; batch seeds
are derived from the live seed (spec §10.1).

## Publishing

`dist/index.html` is published as a **private claude.ai artifact**. Republishing goes to the same artifact URL so shared
links never change.

- Artifact: https://claude.ai/artifact/7NBZqCJ7HxeGJ2LCNSnfNv (private; share it from the page's Share menu)
- Update: `npm run build:artifact`, then republish `dist/artifact.html` to that URL with the `downloads`
  capability declared (the viewer blocks page-started downloads; saves go through the capability).

Inside the artifact sandbox, downloads and `#key=value` links are blocked: use **Copy** (CSV, JSON, settings code) and
share settings with the settings code. Batch runs fall back to time-sliced main-thread work if workers are unavailable.

## Layout of the code

| Directory | What |
|---|---|
| `src/sim` | The deterministic engine: layout, aisle graph, routing, movement, stalls, seating, search, behaviour, metrics |
| `src/batch` | Sweeps, paired statistics, executors (workers with fallback), CSV, precomputed evidence, self-test |
| `src/config` | Settings schema and metadata, validation, clamps, URL / settings codes / JSON, presets, assumptions |
| `src/render` | three.js scenes (two scissored viewports), instanced people, overlays, cameras, picking |
| `src/ui` | Preact panels, playback controller, charts |
| `tests` | Vitest unit/rule tests, `tests/sanity` (model sanity), `tests/e2e` (Playwright), golden files |
