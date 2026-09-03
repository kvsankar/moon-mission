# Mission Data State Baseline - 2026-05-15

This is the preserved point-in-time body of the former mutable current-state
operation. Current ownership is specified in
[App And Data Repository Boundary](../../specs/data/repository-boundary.md), and
verification uses [Repo Sync Playbook](../../operations/data/repo-sync-playbook.md).

Last updated: 2026-05-15

This document captures the **current boundary and operating model** between app code and runtime mission data.

Detailed operational process and audit-tool usage live in [Repo Sync Playbook](../../operations/data/repo-sync-playbook.md).

Use this document for:
- the current live repo/data boundary state
- the current deployment/staging reality
- the current extraction status of mission-data work already landed on `master`

Do not use this document as the step-by-step sync procedure; the playbook is the authoritative process document.

## Source of truth

- App/runtime code, mission config, and UI assets live in this repo (`moon-mission`).
- Generated runtime orbit artifacts live in sibling repo `../moon-mission-data`.
- Coverage/audit-style mission inventory is maintained in:
  - [HORIZONS Lunar Missions](../../research/mission-sourcing/horizons-lunar-missions.md)
  - `orbit-data.html` (data-source coverage view)
  - `assets-status.html` (runtime asset-size/status view)

## What belongs where

App repo (`moon-mission`) tracks:
- `assets/*/data/config.json5`
- `assets/*/data/config.json`
- optional mission media manifests such as `assets/artemis2/data/media-manifest.json5`
- compiled mission media manifests such as `assets/artemis2/data/media-manifest.json`
- `assets/*/data/ephemeris-manifest.json`
- shared authored content (`assets/mission-briefs.json`, `assets/mission-images.json`)
- tracked Moon runtime profile images under `images/moon/`
- tracked share/social images under `images/social/`
- runtime app code (`src/platform/**`)

Data repo (`moon-mission-data`) tracks:
- `*-cheb.json`
- `*-cheb.json.gz`
- `*.npz`
- `*-meta.json`
- authored style sidecars (for example `geo-style.json`, `lunar-style.json`)
- staged runtime media (`images/`, mission screenshots, optional `third-party/`)

Current Artemis II media note:
- The Mission Media browser stores only metadata in this app repo.
- The referenced photo/video assets are mirrored into the sankara.net public R2 bucket for production consistency; upstream Artemis Timeline URLs remain provenance/source references.
- Source and maintenance details live in [Artemis II Media Assets](../../operations/media/artemis2-media-assets.md).
- Curated lunar feature datasets and Artemis II map references live in [Lunar Feature And Artemis II Reference Sources](../../research/mission-sourcing/lunar-feature-and-artemis2-reference-sources.md).

## Runtime cadence policy

- Default `geo`/`lunar` sampling: `60s`.
- Landing slices (when used): `1s` for short terminal windows.
- Do not silently coarsen mission cadence above `60s` to force HORIZONS responses; split windows instead.

## Deployment/staging reality

Workflows stage mission data from the data repo before deploy:
- `.github/workflows/deploy-hetzner.yml`

The staged runtime asset tree is uploaded to the public R2 bucket at
`https://assets.sankara.net/moon-mission/`. Production app pages on
`sankara.net` resolve runtime asset URLs through that R2 asset base rather than
serving orbit/media/image payloads from the VPS origin.

Use the Hetzner deploy workflow when a change introduces app-shell updates, new missions, new manifests, or new runtime assets that need to be published to `sankara.net` and R2.

See [R2 Asset Hosting](../../operations/deployment/r2-asset-hosting.md) for the serving contract and upload workflow.

## How to verify current state quickly

```bash
# Audit app repo vs sibling data repo boundary
make data-audit
# or
npm run audit:data-boundary

# Mission config coverage in app repo
rg --files assets -g "*/data/config.json"

# Relative artifacts present in the sibling data repo
rg --files ..\moon-mission-data\assets -g "*/data/relative-*-cheb.json"
rg --files ..\moon-mission-data\assets -g "*/data/relative-*.npz"

# Generate/update asset-size status JSON for assets-status.html
python scripts/generate-assets-status.py
```

## Notes

- This file intentionally avoids static mission-by-mission “done/pending” tables because they drift quickly.
- Use the status pages and manifests as the live operational view, and keep this document focused on current-state summary rather than detailed procedure.
- The repo-boundary audit currently treats `config.json5`, `media-manifest.json5`, and a few other maintainer-source files under `assets/*/data/*` as `unknown` for manual review rather than auto-classifying them as app-only. That is expected with the current rules file; review them, but do not treat them as generated-data drift by default.
- Current CI also runs `npm run configs:lint`, so mission configs now need both compiled-sync correctness and explicit `time_scale` annotations on phase/span/events blocks.
- `npm run configs:compile` / `configs:check` now cover all supported mission JSON5 artifacts, including optional `media-manifest.json5` files.

## Slice Extraction Status

The old `mission-data-refresh` staging branch was mined in deliberate slices and then retired. The extracted work now lives directly on `master`.

Completed on `master`:
- robotic ARTEMIS naming cleanup and mission-family split presentation as `THEMIS-ARTEMIS`
- new mission slices:
  - `artemis-overview`
  - `artemis-lagrange`
  - `artemis-lunar-capture`
- story-window refinements aligned to product semantics for:
  - `SLIM`
  - `KPLO Danuri`
  - `CAPSTONE`
  - `Lunar Flashlight`
- selected single-craft config/event cleanup for:
  - `TESS`
  - `LADEE`
  - `LRO`
  - `Lunar Trailblazer`
- combined multi-craft public mission surfaces for:
  - `Chandrayaan 2`
  - `Chandrayaan 3`
- combined multi-craft public mission surface for:
  - `GRAIL`
- retirement of standalone `Vikram` mission folders as first-class app missions
- retirement of standalone `GRAIL-A Ebb` / `GRAIL-B Flow` mission folders as first-class app missions
- stricter orbit-artifact integrity auditing, including required `geo`/`lunar`/`relative` coverage and `relative-*.npz`

Still best treated as explicit follow-up slices rather than branch-merge work:
- active multi-craft UX/runtime polish
- orbit-overlap / trail-style runtime tuning and related catalog/UX cleanup
