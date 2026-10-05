# Canteen Sim

A simulation research tool for asking **when and why informal table reservation helps or harms the whole canteen**.
Groups may leave a bottle, umbrella or lanyard on a table before buying food. Results are conditional on the stated
rules; no real pilot, empirical calibration or human-participant study is planned.

Two identical canteens run side by side on the **same crowd**: the same people arrive at the same moments and
have the same tastes (only a longer queue can send someone to a different stall). In canteen **A** a share of groups
reserve a whole table first. In canteen **B** nobody reserves. Everything else, every random draw included, is
identical. Evidence comes from many paired lunches with 95% confidence intervals on four primary endpoints fixed in
advance: people who left without eating, time carrying a plate, peak seat utilization and peak throughput.

**Model 2** (current): food comes on a plate and can't be taken away, so anyone holding food keeps looking until
seated (a group that has circled for 2 minutes accepts a table that seats only some of it). People may leave before
getting food: at the door, if the queues or the seating look too bad for the group's patience, or after queuing longer
than that. Design and the frozen rules: [`docs/superpowers/specs/2026-09-26-model-v2-plates-design.md`](docs/superpowers/specs/2026-09-26-model-v2-plates-design.md).

- **Live page (private claude.ai artifact):** https://claude.ai/artifact/7NBZqCJ7HxeGJ2LCNSnfNv
- **Design spec:** [`docs/superpowers/specs/2026-09-24-canteen-sim-design.md`](docs/superpowers/specs/2026-09-24-canteen-sim-design.md)
- **Assumptions and fairness ledger:** spec §15, also shown in the app's **Assumptions** panel.
- **Findings:** the app's **Findings** panel (or the page URL with `#findings`) explains what the default evidence
  shows, in plain words with charts; its extra figures live in `src/generated/findings.json` (spec §10.9, §11.13).
  After `npm run precompute`, run `npm run findings` too: a test fails until the two files agree.
- **Guided opening:** switch between the default door rule and a queues-only rule to see how the conclusion changes.
  Both examples compare 100% against 0% reservation using the shipped 30-lunch evidence. **Watch this comparison**
  loads the selected example and starts one live lunch; the simulator's estimate follows its current settings and
  reservation level. Uncomputed levels and other settings are labelled explicitly. **?** opens the optional help.
- **Sensitivity explorer:** **Findings → What changes the result?** compares 36 distinct settings at 50% and 100%
  reservation against free flow: 30 paired lunches per comparison, 3,240 runs in total. Explore individual assumptions
  and combinations, inspect all four headline measures, and **Watch this setting** to load an exact example.
  These are uncalibrated stress tests, with pointwise intervals for simulated variation; they do not validate real
  behaviour. The plan was fixed before this extension ran: [study plan](docs/sensitivity-study-plan.md),
  [complete results and reproduction](docs/studies/model-2-sensitivity.md), and
  [research protocol](docs/research-protocol.md).
- **Separate role experiment:** **Findings → Why does seeing farther change the result?** isolates claimer visibility,
  food-search visibility and the door seating check. Visibility roles v1 uses 600 runs on 30 fresh seeds, reports
  all 16 comparisons and 28 predefined contrasts, and preserves the Model 2 animation and evidence. At 100% reservation,
  widening only the claimer's view from 10 to 20 m increases the leaving gap by 16.23 pp [15.292, 17.159]; widening
  only the food-searcher's view changes it by 0.38 pp [−0.114, 0.884]. The clear extra leaving disappears with the
  seating check off, while food-carrying time and seat use still show costs. These findings concern the simulator,
  not a recommended policy. [Complete report](docs/studies/visibility-roles-v1.md),
  [exact audit](docs/studies/visibility-roles-v1-audit.json), [walkthrough and release review](docs/research-review.md).
  The app can copy or download the protocol and complete report.
- **Implementation plans:** [`docs/superpowers/plans/`](docs/superpowers/plans/)

## Run, test, build

Requires Node 22.

```sh
npm install
npm run dev            # development server
npm test               # unit and rule tests (Vitest)
npm run test:sanity    # model-sanity suite: 30-seed checks (every preset), 200 fast-check configs, evidence freshness (~4 min)
npm run bcheck         # the model-2 B-only check: free flow alone at the defaults (≤ 20% leave, ≤ 10 min with a plate)
npm run bench          # A (100%) and B at defaults; fails on > 10% event drift or a median over 3 s
npm run precompute     # re-run the default reservation sweep (150 runs) into src/generated/evidence.json
npm run findings       # Findings panel figures (instrumented sweep + 11 other settings) into src/generated/findings.json (~5 min)
npm run sensitivity    # 36-setting study + exact paired audit + report (~5 min with 4 local workers)
npm run sensitivity -- --check  # fresh full rerun; fail if any published study artifact differs
npm run research       # separate role experiment: 600 runs, exact audit, all contrasts and report
npm run research -- --check     # fresh reproduction of the role experiment
npm run golden:update  # Node reference hashes for the cross-browser self-test
npm run build          # dist/index.html — one self-contained file
npm run build:pages    # the same, checked self-contained (≤ 1.5 MB), plus dist/.nojekyll: what Pages deploys
npx playwright install chromium firefox webkit   # once
npm run test:e2e       # browser tests over `vite preview` of dist/ (CANTEEN_E2E_FIREFOX=0 skips Firefox)
```

After any change to simulation behaviour: bump `MODEL_VERSION` in `src/sim/version.ts`, then run
`npm run precompute`, `npm run findings`, `npm run sensitivity`, `npm run golden:update` and `npm run bench -- --update`.
The sensitivity tests check source/plan freshness and reconstruct all published numbers from the audit; the sanity
suite additionally reruns the first lunch at every setting. `CANTEEN_STUDY_WORKERS=1` limits study CPU use; 1–4 workers
are supported. After an interrupted run, `npm run sensitivity -- --resume` reuses only checkpoints with the identical
source digest and plan. The full `--check` never reuses them.

The research-only `researchVisibility` engine option is named and versioned; `createEngine`, settings codes, workers
and the interactive simulator do not activate it. Equal role ranges reproduce Model 2 exactly. Adding this option
did not change Model 2 rules or hashes, so its version stays at 2; the conservative sensitivity source digest was
refreshed by a full rerun. Future changes to experimental rules require a new experiment version and protocol.
`npm run research -- --from-audit` reconstructs outputs from a provenance-checked audit without simulating again.

## Reproducing a result

A result is fully determined by the **settings code** (⚙ → *Copy settings code*), which includes the seed, plus the
`MODEL_VERSION` shown in the page footer. Paste the code into ⚙ → *Load settings code* on any copy of the page with the
same model version and press **Restart**: every event, and therefore every hash and metric, is identical in Node,
Chromium, Firefox and WebKit, on the main thread and in workers. Batch results add the number of lunches; batch seeds
are derived from the live seed (spec §10.1).

## Host on GitHub Pages (canteen.lab.patipat.org)

The whole sim is one plain HTML file: code, styles, the batch worker and the precomputed evidence are all inside
`dist/index.html`, and it makes no network requests. Any static host works, and so does opening the file from disk.

The site is https://canteen.lab.patipat.org, deployed by [`.github/workflows/pages.yml`](.github/workflows/pages.yml)
on every push to `main` after lint, type checks, unit/sanity tests, browser regressions and the single-file build pass.
[`ci.yml`](.github/workflows/ci.yml) runs the same checks on every pull request. Chromium covers the complete browser
suite; Firefox and WebKit cover determinism, the guided opening, sensitivity and research flows. On macOS builds
where Playwright Firefox reports “Could not find profile folder”, `CANTEEN_E2E_FIREFOX=0` skips it explicitly; this
does not verify Firefox. CI on Linux keeps Firefox enabled.

**One-time setup**

1. The repository is public: GitHub Pages on a private repository needs GitHub Pro, Team or Enterprise.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**, and **Custom domain:
   `canteen.lab.patipat.org`**. Add the custom domain here *before* the DNS record, so no other Pages site can claim
   the name.
3. `patipat.org`'s DNS is at Cloudflare. Add a record there: type **CNAME**, name **`canteen.lab`**, target
   **`kengggg.github.io`**, proxy status **DNS only** (grey cloud). A proxied record would fail: Cloudflare's free
   certificate covers only one level of subdomain (`*.patipat.org`). With DNS only, GitHub issues the certificate.
4. Once GitHub shows the certificate, tick **Enforce HTTPS**.
5. Optional: verify `patipat.org` under your GitHub account's **Settings → Pages → Verified domains** (one TXT record at
   Cloudflare), so no other account's Pages site can use its subdomains.

Notes:

- On the site the page runs as an ordinary website: shared `#v=…` links load their settings, `#findings` opens the
  Findings panel, **Download** saves files, batches run in Web Workers, and `?selftest=1` runs the determinism
  self-test.
- **Other hosts.** Run `npm run build:pages` and upload `dist/index.html` anywhere. On Cloudflare Pages, connect the
  repository with build command `npm run build:pages`, output directory `dist` and `NODE_VERSION` = `22`; `.node-version`
  pins the same version.

## Publishing (claude.ai artifact)

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
| `src/research` | Separately versioned experiment plans, paired contrasts, diagnostics and execution |
| `src/render` | three.js scenes (two scissored viewports), instanced people, overlays, cameras, picking |
| `src/ui` | Preact panels, playback controller, charts |
| `tests` | Vitest unit/rule tests, `tests/sanity` (model sanity), `tests/e2e` (Playwright), golden files |
