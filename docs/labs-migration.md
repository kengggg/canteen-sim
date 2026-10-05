# Patipat Labs hosting migration

## Approved structure

- `https://labs.patipat.org/`: **Patipat Labs**, English only, initially listing Canteen.
- `https://labs.patipat.org/canteen/`: this simulator, retaining its Thai default and English option.
- Separate repositories and deployments: `kengggg/labs` (`patipat-labs` Worker) and `kengggg/canteen-sim`
  (`patipat-canteen` Worker).
- Retire `canteen.lab.patipat.org` after the new site is verified. No legacy redirect.

## Deployment contract

Both Workers live in the same Cloudflare account. The Labs gateway forwards `/canteen/*` with a `CANTEEN` service binding;
the simulator packages assets at that exact prefix. The gateway normalizes `/canteen` to `/canteen/` while preserving
the query. The browser retains fragment settings through the redirect. No route rewrites model settings or downloads.

`npm run build:cloudflare` first builds and checks the portable HTML, then creates:

```text
dist-cloudflare/
  canteen/
    index.html
    og/canteen-sim-manga-v1.jpg
```

All current lint, type, unit, model-sanity and cross-browser gates remain before deployment. The release workflow
deploys the exact checked asset artifact. GitHub requires `CLOUDFLARE_API_TOKEN` as a secret and
`CLOUDFLARE_ACCOUNT_ID` as a repository variable. Worker names and the public path are version-controlled; credentials are not.

## Rollout order

1. Prepare both projects and pass local validation, including the real local Cloudflare routing chain.
2. Configure deployment access scoped to the intended Cloudflare account, then run the checked Canteen release.
3. Deploy the Labs directory and bind `labs.patipat.org`. Keep the old site available during these steps.
4. Verify HTTPS, the English directory, Thai default and English switching at `/canteen/`, the correct release SHA,
   shared `#v=` settings, `#findings`, language query parameters, downloads, a real worker batch, and the 1200 × 630 JPEG.
5. Confirm `/canteen` reaches `/canteen/` without dropping the query or fragment; missing labs and images return 404.
6. Remove **only** the old `canteen.lab.patipat.org` CNAME (`kengggg.github.io`, DNS only) from the `patipat.org` zone.
7. Disable the `kengggg/canteen-sim` GitHub Pages site and confirm its old custom-domain configuration is gone.
8. Record deployed commits/versions and final DNS/HTTPS evidence. Before step 4 succeeds, migration remains incomplete.

The old hostname uses GitHub's HTTPS certificate. Do not proxy that two-level hostname or attempt an unnecessary
redirect during retirement. Saved browser preferences belong to an origin and do not automatically migrate between
the old and new hostnames; explicit language and settings links continue to work at the new location.

## Rollback

Before retirement, the old Pages deployment remains available at its existing address. Restore the last good Worker
deployment if the new gateway or simulator fails. After retirement, roll back the affected Worker version in Cloudflare;
recreating the legacy hostname is a separate recovery choice. Keep the single-file downloadable build usable offline.

## Evidence

Migration completed on **2026-10-06 (Asia/Bangkok)**, following deployments on 2026-10-05 UTC.

- Canteen release: `2ddf7ae10e87fbd7fbff85a39d255d5588e928dd`; Cloudflare version
  `4d7cf0e3-1282-4a68-b862-988e856c0ea0`.
  [Production workflow](https://github.com/kengggg/canteen-sim/actions/runs/37340662089) passed lint, type checking,
  277 unit tests, 181 model checks, 105 Chromium/Firefox/WebKit tests, the portable build and the Wrangler dry run.
- Labs release: `f149fbb0c60efbcaa4c9843cc17adbdb1a081f10`; Cloudflare version
  `7c060244-9413-4f04-a538-5b8056396d12`.
  [Directory workflow](https://github.com/kengggg/labs/actions/runs/37343628081) passed all 11 routing tests,
  JavaScript checks and the Wrangler dry run, then deployed the custom domain. The Labs repository is private.
- Ten live HTTPS checks passed. The live Canteen HTML exactly matched the downloaded CI artifact:
  SHA-256 `fb6260f93787ffd853470b482a74a1192c66240b2cb0fd5e889bafa77b9f4314`.
  The directory, stylesheet, simulator, unchanged manga JPEG, redirects, HEAD and missing-path behavior were checked.
  See [the HTTP report](./labs-launch-http.json).
- Chrome confirmed the English directory link opens Canteen in Thai, using Noto Sans Thai Looped, with build
  `2ddf7ae`. The `/canteen` redirect retained `?lang=en#v=1&m=1&seed=7&crowd.totalPeople=900`.
  Thai/English switching retained the path, fragment, seed 7 and 900-person setting. `#findings` opened Findings directly.
- Live JSON downloaded with model 2, seed 7 and 900 people. Live CSV contained all 150 runs across five reservation
  levels, with no truncated runs. A separate 600-run batch visibly used 23 background workers and completed.
  No browser console errors were captured during these checks. Local directory layout had also passed at 390 and 320 px.
- The old `canteen.lab.patipat.org` CNAME was removed only after the live checks. Both authoritative nameservers,
  `mia.ns.cloudflare.com` and `nick.ns.cloudflare.com`, then returned `NXDOMAIN`. GitHub Pages deletion returned
  HTTP 204; a subsequent Pages API read returned HTTP 404. Both new URLs still returned HTTP 200 after retirement.
  No redirect from the old hostname was installed.

Both repositories have `CLOUDFLARE_API_TOKEN` in encrypted GitHub Actions secrets and `CLOUDFLARE_ACCOUNT_ID` as a
repository variable. The approved deployment token expires on **2027-10-06 (Asia/Bangkok)**
(`2027-10-05T23:59:59Z`). Renew it in both repositories before expiry. Its scope covers Workers scripts in the intended
account and Workers routes on `patipat.org`, with the required read permissions; it has no DNS-write permission.

This record is documentation of the verified releases above. Documentation-only commits do not change their deployed
application artifacts. Future code releases continue through the full production checks.
