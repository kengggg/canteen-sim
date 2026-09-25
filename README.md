# Canteen Sim

A 3D simulation that tests one question: does informal table reservation (leaving a bottle, umbrella or lanyard on a
table before buying food) make an office canteen less efficient than free flow?

Two identical canteens run side by side on the **same crowd**: the same people arrive at the same moments and
have the same tastes (only a longer queue can send someone to a different stall). In canteen **A** a share of groups
reserve a whole table first. In canteen **B** nobody reserves. Everything else, every random draw included, is
identical. Evidence comes from many paired lunches with 95% confidence intervals on four primary endpoints fixed in
advance: walk-aways, time from entrance to seat (or giving up), peak seat utilization and peak throughput.

- **Live page (private claude.ai artifact):** https://claude.ai/artifact/7NBZqCJ7HxeGJ2LCNSnfNv
- **Design spec:** [`docs/superpowers/specs/2026-09-24-canteen-sim-design.md`](docs/superpowers/specs/2026-09-24-canteen-sim-design.md)
- **Assumptions and fairness ledger:** spec §15, also shown in the app's **Assumptions** panel.
- **Findings:** the app's **Findings** panel (or the page URL with `#findings`) explains what the default evidence
  shows, in plain words with charts; its extra figures live in `src/generated/findings.json` (spec §10.9, §11.13).
  After `npm run precompute`, run `npm run findings` too: a test fails until the two files agree.
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
npm run findings       # Findings panel figures (instrumented sweep + 8 other settings) into src/generated/findings.json (~6 min)
npm run golden:update  # Node reference hashes for the cross-browser self-test
npm run build          # dist/index.html — one self-contained file
npm run build:pages    # the same, checked self-contained (≤ 1.5 MB): what Cloudflare Pages builds
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

## Host on Cloudflare Pages (canteen.lab.patipat.org)

The whole sim is one plain HTML file: code, styles, the batch worker and the precomputed evidence are all inside
`dist/index.html`, and it makes no network requests. Any static host works, and so does opening the file from disk. The
site is served by Cloudflare Pages, built from `main`.

**One-time setup in the Cloudflare dashboard**

1. Merge into `main` first: the Cloudflare project deploys `main` as production.
2. **Workers & Pages → Create → Pages → Connect to Git.** Install the *Cloudflare Workers and Pages* GitHub app and give
   it access to only `kengggg/canteen-sim` (private repositories work on the free plan). Use Connect to Git, not Direct
   Upload: a Direct Upload project can never be switched to Git later.
3. Build settings: production branch `main`, framework preset *None*, build command `npm run build:pages`, build output
   directory `dist`. `.node-version` pins Node 22; also set the variable `NODE_VERSION` = `22` for both Production and
   Preview, since Cloudflare's docs do not say which of the two wins. Dependencies install with `npm ci`, so keep
   `package-lock.json` in sync.
4. **Custom domains → Set up a custom domain → `canteen.lab.patipat.org`.** `patipat.org` is a zone on the same
   Cloudflare account, so Pages adds the DNS record itself and issues a certificate for that exact name. This works on
   the free plan even though the zone's free certificate covers only one level (`*.patipat.org`). Do not create the DNS
   record by hand first (that gives a 522 error), and keep CAA records, redirects, Workers or Access rules from
   blocking `/.well-known/acme-challenge/` while the certificate is issued.

Notes:

- Every other branch, and every pull request opened from this repository, gets a public preview at
  `<hash>.canteen-sim.pages.dev` (plus `<branch>.canteen-sim.pages.dev`). Limit or turn them off under the project's
  branch control settings, or protect them with Cloudflare Access.
- Cloudflare's build runs only `npm run build:pages`. The tests run in GitHub Actions: [`ci.yml`](.github/workflows/ci.yml)
  checks lint, types, unit tests and the build on every pull request and every push to `main`. Require that check
  before merging (branch protection) so untested code never reaches production.
- Free plan: 500 builds a month, one at a time, 20 minutes each; this build takes well under a minute.
- On the site the page runs as an ordinary website: shared `#v=…` links load their settings, `#findings` opens the
  Findings panel, **Download** saves files, batches run in Web Workers, and `?selftest=1` runs the determinism
  self-test.

## Or host on GitHub Pages

[`.github/workflows/pages.yml`](.github/workflows/pages.yml) builds the page and deploys it to GitHub Pages when run by
hand (**Actions → Deploy to GitHub Pages → Run workflow**); pushes do not trigger it. One-time setup: **Settings → Pages
→ Build and deployment → Source: GitHub Actions**. The site appears at https://kengggg.github.io/canteen-sim/. A
hostname can point at only one host, so keep `canteen.lab.patipat.org` on Cloudflare and use the github.io address here.

- GitHub Pages on a **private** repository needs GitHub Pro, Team or Enterprise. On a free plan, make the repository
  public or publish `dist/index.html` from a separate public repository.
- **Manual.** Run `npm run build:pages` and upload `dist/index.html` (with `dist/.nojekyll` when deploying from a
  branch) to any static host.

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
| `src/render` | three.js scenes (two scissored viewports), instanced people, overlays, cameras, picking |
| `src/ui` | Preact panels, playback controller, charts |
| `tests` | Vitest unit/rule tests, `tests/sanity` (model sanity), `tests/e2e` (Playwright), golden files |
