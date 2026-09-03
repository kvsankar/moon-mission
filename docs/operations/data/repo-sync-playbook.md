# Repo Sync Playbook

This document implements the safe synchronization procedure between:

- `moon-mission` - app/runtime repo
- `moon-mission-data` - generated orbit-data repo

Ownership rules are specified in
[App And Data Repository Boundary](../../specs/data/repository-boundary.md), and
their structural rationale is in
[Repository Boundary Design](../../designs/data/repository-boundary.md).

Use this document to audit, transfer, stage, verify, and publish data without
loss. It is not a branch-status record.

## Source Of Truth Layers

There are two live repos we work with:

- `moon-mission`
  - the app/runtime repo and integration point
  - the place for runtime code, mission config source, catalog metadata, and UI assets
- `moon-mission-data`
  - the generated runtime-artifact repo
  - the place for generated `*.npz`, `*-cheb.json`, `*-meta.json`, and orbit-style sidecars

In short:

- curated mission semantics live on `moon-mission`
- generated runtime artifacts come from `moon-mission-data`
- `moon-mission` and `moon-mission-data` should stay boundary-clean and manifest-aligned

**Last updated:** 2026-05-08

## Ownership Model

Within `assets/<mission>/data/`, files fall into three categories.

### App-only

These belong in `moon-mission` and should not be committed to `moon-mission-data`:

- `config.json`
- `media-manifest.json`

### Review-needed maintainer source

These also belong in `moon-mission`, but the current boundary-audit rules intentionally leave them in the `unknown` bucket so they are reviewed explicitly instead of being auto-classified:

- `config.json5`
- `media-manifest.json5`
- `config.ssim.json`

### Mirrored

These are expected in both repos and should stay byte-identical:

- `ephemeris-manifest.json`

### Data-only

These belong in `moon-mission-data` and should not be tracked in `moon-mission`:

- `*.npz`
- `*-cheb.json`
- `*-cheb.json.gz`
- `*-meta.json`
- `*-style.json`
- `README-spice-export.md`
- `geo-style.json`
- `lunar-style.json`

Generated Artemis II thumbnails, stream payloads, and transcript artifacts are
data-repo-owned. See [Artemis II Media Assets](../media/artemis2-media-assets.md)
before changing media payload ownership.

## No-Loss Sync Policy

Never delete a mission-data file from either repo until it has first been classified.

Use this order:

1. Run the boundary audit.
2. Classify each file as `app-only`, `mirrored`, `data-only`, or `unknown`.
3. For `data-only` files found in `moon-mission`, copy or preserve them in `moon-mission-data` before cleanup.
4. For `mirrored` files, make the content identical in both repos in the same work session.
5. For `unknown` files, do not delete them immediately.
6. Decide whether each `unknown` file is:
   - a new supported boundary type to encode in the rules file
   - a temporary local export that should be archived or ignored
   - a misplaced artifact that should move to `moon-mission-data`
7. Only after preservation and re-audit should cleanup happen.

## Required Commands

### 1. Audit the app vs generated-data boundary

```bash
python scripts/audit-data-repo-boundary.py --data-root ../moon-mission-data
```

JSON output is available with:

```bash
python scripts/audit-data-repo-boundary.py --data-root ../moon-mission-data --format json
```

Wrapper commands are also available:

```bash
make data-audit
# or
npm run audit:data-boundary
```

The audit also validates active-mission orbit completeness:

- `geo`, `lunar`, and `relative` compressed Chebyshev coverage
- body coverage per origin: mission craft body/bodies plus the required celestial bodies, excluding the origin-degenerate body
- `relative-*.npz` support files alongside relative-mode Chebyshev payloads

To fail a CI or pre-push style check when drift exists:

```bash
python scripts/audit-data-repo-boundary.py --data-root ../moon-mission-data --fail-on-drift
```

### 1b. Compare app onboarding and runtime-data expectations

Use current `moon-mission` config/manifests, catalog metadata, and committed sourcing notes as the authority when deciding whether a mission folder, event model, or manifest expectation is stale.

Typical checks:

- compare `assets/<mission>/data/config.json`
- compare `assets/<mission>/data/ephemeris-manifest.json`
- compare mission family structure such as merged-vs-standalone folders
- compare catalog/brief/image references after mission-family refactors
- compare expected `geo`/`lunar`/`relative` runtime artifacts against what exists in `moon-mission-data`

### 2. Stage runtime assets from the data repo

For a deployment-shaped local tree, build the app shell first:

```bash
python scripts/build.py --dist dist-pages
```

```bash
python scripts/stage-ephemeris-data.py --app-root . --data-root ../moon-mission-data --target-root dist-pages
```

### 3. Verify staged runtime assets

```bash
python scripts/verify-staged-runtime-assets.py --staged-root dist-pages --runtime-manifest dist-pages/runtime-asset-manifest.json
```

### 4. Upload staged public assets to R2

Production runtime assets are served from `https://assets.sankara.net/moon-mission/`.
After staging and verification, upload the staged public asset roots:

```bash
python scripts/upload-r2-assets.py --source-root dist-pages --prefix moon-mission/ --roots assets images third-party
```

See [R2 Asset Hosting](../deployment/r2-asset-hosting.md) for required environment values,
cache behavior, and the deploy-workflow contract.

## Recommended Working Process

### When app code changes but orbit data does not

1. Update `config.json`, mission docs, UI, tests, or catalog files in `moon-mission`.
2. If media metadata changed, update `media-manifest.json5` and run `npm run configs:compile`.
3. Re-run the audit.
4. Confirm there are no new `data-only` files in `moon-mission`.

### When orbit generation changes

1. Generate or refresh orbit artifacts locally.
2. Copy each generated `data-only` output to its matching path in
   `../moon-mission-data`. In PowerShell, for example:

   ```powershell
   Copy-Item -LiteralPath "assets/<mission>/data/<artifact>" -Destination "../moon-mission-data/assets/<mission>/data/<artifact>"
   ```

3. If `ephemeris-manifest.json` changed, mirror the same bytes into both repos.
4. Re-run the audit until:
   - no mirrored mismatches remain
   - no required artifacts are missing from `moon-mission-data`
   - no unexpected `data-only` files remain in `moon-mission`
5. Commit the app-repo and data-repo slices separately, but from the same audited state.

### When mission structure or semantics change

1. Update the app-side mission truth first in `moon-mission`:
   - mission `config.json`
   - mission `config.json5`
   - `ephemeris-manifest.json`
   - optional `media-manifest.json5` and compiled `media-manifest.json`
   - event and timeline semantics
   - mission-family folder structure
   - landing-page/catalog metadata
2. Only after that compare `moon-mission` against `moon-mission-data`.
3. Resolve any remaining artifact gaps by either:
   - generating missing runtime artifacts into `moon-mission-data`, or
   - relaxing stale app manifest expectations if the curated source no longer requires them

### Before release or baseline regeneration

1. Audit repo boundary.
2. Stage runtime assets from `moon-mission-data`.
3. Verify staged runtime assets.
4. Upload public runtime assets to R2 when the release changes assets.
5. Run SSIM / test workflow.

## Tooling Added For Drift Control

- [audit-data-repo-boundary.py](../../../scripts/audit-data-repo-boundary.py)
  - audits ownership, mirrored-file equality, and missing required artifacts
- [data-repo-boundary-rules.json](../../../scripts/data-repo-boundary-rules.json)
  - central fixture for the boundary rules
- [stage-ephemeris-data.py](../../../scripts/stage-ephemeris-data.py)
  - stages deploy/runtime assets from `moon-mission-data`
- [verify-staged-runtime-assets.py](../../../scripts/verify-staged-runtime-assets.py)
  - verifies a staged runtime tree against checksums
