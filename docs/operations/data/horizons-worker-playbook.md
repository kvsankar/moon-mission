# HORIZONS Mission Worker Playbook

Data requirements and ownership:
[App And Data Repository Boundary](../../specs/data/repository-boundary.md)

This playbook is the reusable prompt template for sub-agents working on Moon missions that have confirmed `HORIZONS` coverage.

Use it in two modes:

- `Existing mission mode`: re-verify an already-present mission and enrich its sourcing/config/events/data.
- `New mission mode`: onboard a mission that does not yet exist in the repo.

## Assignment Header

Copy this header into each worker prompt and fill it in:

```text
Mission(s): <list of mission names>
Mode: <existing|new>
Owned app-repo paths:
  - <assets/<mission>>
  - <other mission-local files only>
Owned data-repo paths:
  - ../moon-mission-data/assets/<mission>/data/*
Shared files reserved for main agent:
  - assets/mission-catalog.json
  - assets/mission-briefs.json
  - assets/mission-images.json
  - mission.html
  - index.html
  - docs/research/mission-sourcing/horizons-lunar-missions.md
Branch policy:
  - Do not commit or push unless explicitly told you own finalization for this batch.
```

## Core Mission

Your job is to bring assigned HORIZONS-backed missions to a production-ready state for this repo.

Work should include, when applicable:

1. Search and fetch preliminary mission information from authoritative sources.
2. Fetch or verify the HORIZONS blurb / metadata source.
3. Determine timeline windows and event metadata.
4. Form or refine mission configuration files.
5. Fetch orbit data from HORIZONS.
6. Post-process orbit data into repo-compatible products.
7. Self-review and verify.
8. If explicitly assigned finalization ownership, commit and push.

## Repo Boundary Rules

- App repo: current workspace (`moon-mission`)
- Data repo: sibling workspace (`../moon-mission-data`)
- Generated orbit artifacts such as `*-cheb.json`, `*-cheb.json.gz`, `*.npz`, `*-meta.json`, and orbit style sidecars belong in the sibling data repo unless this repo already tracks an exception.
- Before assuming a generated file belongs in this repo, verify with `git ls-files`.
- Do not revert unrelated user or other-agent changes.
- You are not alone in the codebase. Adjust to others' edits and do not overwrite their work.
- Orbit sampling policy:
  - Default `geo` and `lunar` sampling is `60` seconds.
  - Dedicated landing slices may use `1` second sampling, but only for short terminal segments.
  - Do not coarsen orbit sampling above `60` seconds to work around HORIZONS output limits.
  - If `60` second sampling is too large for one fetch, preserve fidelity and split the window into smaller mission-appropriate slices instead.

## Existing Mission Mode

Use this when the mission already has an `assets/<mission>/` folder.

### Goals

- Re-verify HORIZONS IDs, time windows, and mission-source references.
- Improve mission-local sourcing notes in `assets/<mission>/data/config.json5` under the sourcing snapshot comment block.
- Verify that `assets/<mission>/data/config.json` still matches the best currently available HORIZONS timeline and craft structure.
- Verify events, labels, and `eventConfigs`.
- Preserve mission events even when they occur outside the sampled ephemeris window.
- Re-run pipeline steps when needed, transfer generated outputs to
  `../moon-mission-data`, audit the boundary, and only then stage runtime data.
- Leave the mission in a cleaner, more trustworthy state than you found it.

### Required Checks

1. Inspect the existing mission-local files:
   - `assets/<mission>/data/config.json5`
   - `assets/<mission>/data/config.json`
   - `assets/<mission>/data/ephemeris-manifest.json`
   - related `assets/horizons-blurbs/markdown/*.md` or metadata if present
2. Confirm spacecraft IDs and HORIZONS object names.
3. Confirm start/stop windows and whether the selected interesting window is still justified.
   - Keep `geo`/`lunar` cadence at `60` seconds unless there is an explicitly documented exception approved by the main agent.
   - Keep dedicated landing slices at `1` second resolution.
4. Confirm event times and whether each event should be a burn, marker, or dynamic boundary.
   - If launch or another mission event occurs before `geo`/`lunar` data availability begins, keep the event in `config.json` anyway.
   - If a mission-significant event falls just after the last sampled orbit-data timestamp, keep it as well.
   - Document both the mission event time and the first/last usable HORIZONS orbit-data times in the `config.json5` sourcing snapshot comment block.
   - Do not delete out-of-window events just because they cannot be shown immediately; runtime gating infra will handle visibility.
5. Keep config authoring aligned with current repo rules:
   - edit `assets/<mission>/data/config.json5` as the source of truth
   - run `npm run configs:compile`
   - run `npm run configs:lint` before finalizing mission-local config work
   - annotate phase/span blocks with explicit `time_scale` (`TDB` or `UTC`) and keep the `events` block explicitly `UTC`
6. Prefer the one-shot pipeline unless you are intentionally rerunning only one stage:
   - `python scripts/run-mission-pipeline.py --missions <mission>`
7. Re-run only the manual pipeline steps needed when partial recovery is preferable:
   - `python scripts/orbits.py --mission <mission>`
   - `python scripts/compress-orbits.py --mission <mission>`
   - `python scripts/generate-relative-orbits.py --mission <mission> --force`
   - `python scripts/compress-chebyshev-gzip.py --mission <mission> --force`
8. Verify generated outputs land in the correct repo.
9. Write down what changed and what still needs shared-file integration.

### Preferred Outputs

- Updated sourcing snapshot comments in `assets/<mission>/data/config.json5`
- Updated mission-local `config.json` / manifest as needed
- Generated data transferred to `../moon-mission-data`
- A concise verification report with:
  - HORIZONS IDs confirmed
  - timeline window used
  - events confirmed or changed
  - files changed
  - residual risks

## New Mission Mode

Use this when the mission is missing from `assets/`.

### Goals

- Create a new mission folder and mission-local sourcing/config files.
- Fetch enough metadata to make the mission pipeline runnable.
- Generate orbit products and transfer them to `../moon-mission-data`.
- Leave clear integration notes for shared catalog/landing-page updates.

### Required Workflow

1. Research and identify:
   - canonical mission name
   - folder slug
   - spacecraft mnemonic(s)
   - HORIZONS ID(s)
   - launch time
   - trajectory coverage start/end
   - major timeline events worth exposing
   - whether any important events occur outside the usable HORIZONS sample window
2. Create mission-local files:
   - `assets/<mission>/data/config.json5`
   - `assets/<mission>/data/config.json`
   - `assets/<mission>/data/ephemeris-manifest.json`
3. Model the config on the closest existing mission:
   - single-craft orbiter: use `clementine`, `lunar-prospector`, `ladee`, `lro`, `slim`, or `capstone`
   - multi-craft mission: use `chandrayaan2`, `chandrayaan3`, or split missions like `lcross-*`
   - keep `geo`/`lunar` `step_size_in_seconds` at `60`, and use `1` only for short landing slices
4. Keep mission-local UI text minimal but coherent:
   - page title
   - header title
   - lock-on/orbit labels
5. Add a reasonable event set:
   - `missionStart`
   - one or more mission-specific events
   - `now`
   - `<mnemonic>DataEnd`
   - Keep out-of-window events if they are mission-significant, even when orbit samples start later or stop earlier.
6. Compile and lint config state before data generation:
   - `npm run configs:compile`
   - `npm run configs:lint`
   - explicitly annotate phase/span blocks with `time_scale`
   - keep the `events` block explicitly `UTC`
7. Run the preferred one-shot pipeline:
   - `python scripts/run-mission-pipeline.py --missions <mission>`
8. Use manual steps only when partial reruns are the better recovery path:
   - `python scripts/orbits.py --mission <mission>`
   - `python scripts/compress-orbits.py --mission <mission>`
   - `python scripts/generate-relative-orbits.py --mission <mission> --force`
   - `python scripts/compress-chebyshev-gzip.py --mission <mission> --force`
9. Transfer each generated artifact to the matching
   `../moon-mission-data/assets/<mission>/data/` path, then run
   `make data-audit`. Use [Repo Sync Playbook](repo-sync-playbook.md) for the
   no-loss transfer and runtime staging sequence.
10. Leave integration notes for main-agent-owned shared files:
   - `assets/mission-catalog.json`
   - `assets/mission-briefs.json`
   - `assets/mission-images.json`
   - `mission.html`

### Preferred Outputs

- New `assets/<mission>/data/config.json`
- New `assets/<mission>/data/ephemeris-manifest.json`
- New `assets/<mission>/data/config.json5`
- Generated artifacts transferred to `../moon-mission-data`
- Integration note covering:
  - title/subtitle/description proposal
  - aliases/queryValue proposal
  - mission type / craft class / crew profile
  - any special caveats

## Research Standards

- Prefer primary sources:
  - JPL HORIZONS
  - official mission sites
  - NASA/JAXA/ESA/KARI/etc. mission pages
  - existing repo HORIZONS blurbs and metadata
- Be conservative with inferred dates and event labels.
- Treat mission chronology and orbit-data chronology as related but distinct. A mission event can be valid even if the orbit animation starts later or ends earlier.
- If HORIZONS aliases are messy, record both the user-facing mission name and the precise object names/IDs used.

## Verification Checklist

Before declaring the mission batch done:

- Confirm HORIZONS object IDs used by the config actually resolve.
- Confirm `config.json` has the correct body IDs and `planets` arrays.
- Confirm `eventConfigs` reference only events that exist.
- Confirm important out-of-window events were preserved rather than dropped.
- Confirm mission-local docs explain the chosen time-window strategy.
- Confirm generated files are in the right repo.
- Confirm no shared files were edited if they were reserved for the main agent.
- Review your own diff for accidental unrelated changes.

## Reporting Format

End with:

```text
Completed:
- <bullet list>

Changed files:
- <absolute or repo-relative paths>

Generated/transferred files:
- <paths, especially in ../moon-mission-data>

Verification:
- <commands run>

Open issues / main-agent follow-up:
- <shared-file integration, blockers, or caveats>
```

## Mission Inventory (live, not hardcoded)

Mission lists evolve quickly; avoid hardcoded “N missions” tables in worker prompts.

Use live inventory from:
- `assets/mission-catalog.json`
- `docs/research/mission-sourcing/horizons-lunar-missions.md`

Helpful checks:

```powershell
# Missions currently onboarded in app repo
rg --files assets -g "*/data/config.json"

# Missions currently covered by generated HORIZONS product metadata
$index = Get-Content assets/horizons-blurbs/mission-index.json -Raw | ConvertFrom-Json
$index.missions.Count
```

Refresh HORIZONS blurb product data independently of orbit generation:

```powershell
python scripts/fetch-mission-blurbs.py
```
