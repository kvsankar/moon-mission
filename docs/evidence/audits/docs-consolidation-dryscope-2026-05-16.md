# Documentation Consolidation Dryscope Findings

Date: 2026-05-16

## Scope

Ran `dryscope` on active documentation under `docs/`, excluding `docs/horizons-blurbs/**` and `docs/archived/**`.

The active-doc scan covered 46 documents and 845 sections. Section Match found no strict near-duplicate section pairs at the default threshold, so the problem is not copy-pasted prose. Docs Map found 108 multi-document topic clusters, so the problem is topic sprawl, unclear authority, and current-work drift.

The raw active report was generated locally as `.dryscope-docs-active-report.md` during the investigation. It is scratch output, not a durable repo doc. `dryscope` completed report generation but exited nonzero when it tried to create `.dryscope/latest` as a Windows symlink without sufficient privilege.

## Major Themes

1. Mission visualization and timeline
   - Core docs cluster around visualization design, media timeline integration, camera/view modes, and panel UI.
   - Strong overlap exists among `artemis2-media-timeline-plan.md`, `timeline-media-playback-spec.md`, `artemis2-video-sync-anchors.md`, `orbit-first-timeline-plan.md`, and media operations docs.

2. Rendering, Moon, sky, and lighting
   - Moon rendering spans research, implementation, asset operations, solar-disk physics, BRDF notes, and exposure specs.
   - Dryscope recommends separating "Moon Photometry & Shader Quality" from "Moon Texture Assets & Runtime".

3. Data, ephemeris, and timekeeping
   - Orbit data, Chebyshev format, HORIZONS sourcing, UTC/TDB, eclipse timing, and media-clock synchronization are related but scattered.
   - Dryscope specifically recommends a "Time Synchronization & Timekeeping" intermediate topic covering both physical time and media playback coordination.

4. Operations and infrastructure
   - App/data repo boundary, R2/CDN hosting, runtime asset management, deploy, testing, and repo sync are all documented, but their authority boundaries need to be sharper.
   - Current good split: `repo-sync-playbook.md` for procedure, `mission-data-current-state.md` for state, `r2-asset-hosting.md` for serving contract.

5. Planning, investigations, and handoffs
   - Open work, performance investigations, roadmaps, and temporary handoffs are mixed with longer-lived reference docs.
   - Dryscope recommends treating this branch as "Open Work & Context Switches" and archiving or retiring snapshot docs once work completes.

## Highest-Value Consolidation Moves

1. Create a single current-work authority doc
   - Recommended path: `docs/operations/current-plan.md`
   - Fold in `open-todos-2026-05-16.md` and keep active workstreams there.
   - Other docs should link to this for live TODOs instead of maintaining independent local TODO lists.

2. Create an Artemis II media workstream doc
   - Recommended path: `docs/operations/artemis2-media-workstream.md`
   - Consolidate active status from:
     - `docs/operations/artemis2-media-assets.md`
     - `docs/artemis2-media-streaming.md`
     - `docs/operations/artemis2-video-sync-anchors.md`
     - `docs/operations/artemis2-transcription-diarization-handoff.md`
     - relevant parts of `docs/design/roadmap/artemis2-media-timeline-plan.md`
   - Keep detailed specs and source notes as references, but make this the current decision and next-action surface.

3. Create a performance workstream doc
   - Recommended path: `docs/operations/performance-workstream.md`
   - Consolidate:
     - `docs/operations/performance-regression-investigation-2026-05-16.md`
     - optimization items from the current plan
     - benchmark references from `docs/design/research/runtime-animation-benchmark.md`
   - Structure it as findings, landed mitigations, pending optimization queue, measurement plan, and regression risks.

4. Add a timekeeping hub
   - Recommended path: `docs/design/architecture/time-synchronization-and-timekeeping.md`
   - Link UTC/TDB/eclipses, mission-clock state, media synchronization, event navigation, and broadcast anchor mapping.
   - This should reduce repeated "which time are we looking at?" context across media, ephemeris, and bug-investigation docs.

5. Split Moon rendering authority by reader intent
   - Keep research under `docs/research/moon-rendering/` and `docs/design/research/`.
   - Keep operational asset state in `docs/operations/moon-render-assets.md`.
   - Add explicit cross-links so readers know whether they need physics/modeling decisions or asset/deployment/runtime details.

## Keep Separate

- Do not merge HORIZONS blurbs; they are source corpus, not planning docs.
- Do not merge archived docs back into active guidance.
- Do not merge `developer.md`, `README.md`, and `design/design.md`; they serve different reader levels. Prefer sharper cross-links and shorter summaries.
- Do not merge completed investigations into workstream docs; link them as resolved evidence, then archive when stale.

## Recommended First Pass

1. Promote `open-todos-2026-05-16.md` into `docs/operations/current-plan.md`.
2. Add a "Current Workstreams" section to `docs/README.md`.
3. Create `artemis2-media-workstream.md` and move active Artemis II media TODOs there.
4. Create `performance-workstream.md` and move active optimization TODOs there.
5. Replace scattered TODO sections in feature docs with links to the current plan or owning workstream.
