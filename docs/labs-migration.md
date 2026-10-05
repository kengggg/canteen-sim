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

Implementation prepared on 2026-10-05. Production verification and retirement are pending until recorded here.
