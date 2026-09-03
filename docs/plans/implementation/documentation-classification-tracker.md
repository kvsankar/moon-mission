# Documentation Classification Tracker

Last updated: 2026-09-03

This is the status surface for repository documentation classification. It does
not replace the repository roadmap and does not add status metadata to the
tracked documents.

Status meanings:

- `done`: completed and supported by the noted review record or current location.
- `pending`: the document has not completed that step.
- `not needed`: the step does not apply to this retained or historical document.

`Review`, `Refactor`, and `Re-review` describe the document-content cycle, not
implementation completion. A mixed document is assigned one primary class.

Current-session evidence:

- Camera state transitions and the Chebyshev format/generation documents were
  independently reviewed on 2026-09-03. Four concrete findings were fixed.
  The focused Camera and Chebyshev test run passed 65 tests with 6
  fixture-dependent skips.

## Authored Documents

| Document | Primary class | Relocation | Review | Refactor | Re-review | Basis |
| --- | --- | --- | --- | --- | --- | --- |
| `AGENTS.md` | Repository instruction | not needed | done | not needed | done | Instruction/index reconciliation; independent re-review passed |
| `CLAUDE.md` | Repository instruction | not needed | done | done | done | Reduced to canonical routing; independent re-review passed |
| `GEMINI.md` | Repository instruction | not needed | done | done | done | Reduced to canonical routing; independent re-review passed |
| `PATHS.md` | Repository instruction | not needed | done | done | done | Volatile state made historical; independent re-review passed |
| `README.md` | Public/index | not needed | done | done | done | Public facts and authority routing reconciled; independent re-review passed |
| `docs/README.md` | Repository index | not needed | done | done | done | Category routing reconciled; independent re-review passed |
| `docs/specs/camera/state-transitions.md` | Specification | done | done | done | done | 2026-09-03 focused independent review |
| `docs/specs/data/chebyshev-ephemeris-format.md` | Specification | done | done | done | done | 2026-09-03 focused independent review |
| `docs/specs/data/repository-boundary.md` | Specification | done | done | done | done | Operations reconciliation; independent re-review passed |
| `docs/specs/mobile-experience-v1-spec.md` | Specification | done | done | done | done | Three-spec reconciliation; independent re-review passed |
| `docs/specs/modes/orbit-comparison.md` | Specification | done | done | done | done | Relative/compare/time review |
| `docs/specs/modes/relative-mode.md` | Specification | done | done | done | done | Relative/compare/time review |
| `docs/specs/orbit-milestones-spec.md` | Specification | done | done | done | done | Three-spec reconciliation; independent re-review passed |
| `docs/specs/rendering/frame-and-shoot-lighting-and-exposure.md` | Specification | done | done | done | done | Feature/Chebyshev review |
| `docs/specs/repository-documentation-classification-and-lifecycle.md` | Specification | done | done | done | done | Three-spec reconciliation; independent re-review passed |
| `docs/specs/runtime/architecture-boundaries.md` | Specification | done | done | done | done | Design reconciliation; independent re-review passed |
| `docs/specs/time/clock-authority.md` | Specification | done | done | done | done | Relative/compare/time review |
| `docs/specs/time/timeline-and-media-playback.md` | Specification | done | done | done | done | Feature/Chebyshev review |
| `docs/specs/ui/lunar-feature-controls.md` | Specification | done | done | done | done | Feature/Chebyshev review |
| `docs/specs/ui/panel-progressive-disclosure.md` | Specification | done | done | done | done | Plan disposition and future intake independently re-reviewed |
| `docs/specs/ui/panel-system-v1.md` | Specification | done | done | done | done | Feature/Chebyshev review |
| `docs/specs/ui/artemis-real-time-experience.md` | Specification | done | done | done | done | Design reconciliation; independent re-review passed |
| `docs/specs/ui/runtime-style-and-interaction.md` | Specification | done | done | done | done | Orbit trail ownership promotion independently re-reviewed |
| `docs/specs/ui/runtime-ux.md` | Specification | done | done | done | done | Design reconciliation; independent re-review passed |
| `docs/designs/documentation-architecture.md` | Design | done | done | done | done | Three-spec reconciliation; independent re-review passed |
| `docs/designs/data/repository-boundary.md` | Design | done | done | done | done | Operations reconciliation; independent re-review passed |
| `docs/designs/frames/relative-mode.md` | Design | done | done | done | done | Relative/compare/time review |
| `docs/designs/mobile-experience.md` | Design | done | done | done | done | Three-spec reconciliation; independent re-review passed |
| `docs/designs/modes/orbit-comparison.md` | Design | done | done | done | done | Relative/compare/time review |
| `docs/designs/README.md` | Design | done | done | done | done | Design reconciliation; independent re-review passed |
| `docs/designs/runtime-experience-model.md` | Design | done | done | done | done | Design reconciliation; independent re-review passed |
| `docs/designs/runtime/system-overview.md` | Design | done | done | done | done | Design reconciliation; independent re-review passed |
| `docs/designs/runtime/target-architecture.md` | Design | done | done | done | done | Design reconciliation; independent re-review passed |
| `docs/designs/rendering/orbit-milestones.md` | Design | done | done | done | done | Three-spec reconciliation; independent re-review passed |
| `docs/designs/time/synchronization.md` | Design | done | done | done | done | Relative/compare/time review |
| `docs/plans/breakdown/artemis2-media-timeline.md` | Plan | done | done | done | done | Active remainder separated; 2026-09-03 independent re-review passed |
| `docs/plans/breakdown/artemis2-media.md` | Plan | done | done | done | done | Active work verified against runtime, data, and evidence |
| `docs/plans/breakdown/artemis-real-time-experience.md` | Plan | done | done | done | done | Design reconciliation; independent re-review passed |
| `docs/plans/breakdown/main-view-photo-mode.md` | Plan | done | done | done | done | Active remainder separated; 2026-09-03 independent re-review passed |
| `docs/plans/breakdown/orbit-comparison.md` | Plan | done | done | done | done | Relative/compare/time review |
| `docs/plans/breakdown/orbit-first-timeline.md` | Plan | done | done | done | done | Active remainder separated; 2026-09-03 independent re-review passed |
| `docs/plans/breakdown/orbit-ux.md` | Plan | done | done | done | done | Active remainder separated; 2026-09-03 independent re-review passed |
| `docs/plans/breakdown/performance.md` | Plan | done | done | done | done | Landed mitigations and open queue independently re-reviewed |
| `docs/plans/breakdown/real-size-craft-follow.md` | Plan | done | done | done | done | Unimplemented current product intent independently re-reviewed |
| `docs/plans/breakdown/runtime-style-and-accessibility.md` | Plan | done | done | done | done | Design reconciliation; independent re-review passed |
| `docs/plans/breakdown/time-synchronization.md` | Plan | done | done | done | done | Relative/compare/time review |
| `docs/plans/implementation/dockview-followups.md` | Plan | done | done | done | done | Active remainder separated; 2026-09-03 independent re-review passed |
| `docs/plans/implementation/documentation-classification-tracker.md` | Plan | done | done | not needed | done | Final inventory and plan dispositions independently reviewed |
| `docs/plans/implementation/mobile-experience-followups.md` | Plan | done | done | done | done | Three-spec reconciliation; independent re-review passed |
| `docs/plans/implementation/orbit-milestones.md` | Plan | done | done | done | done | Three-spec reconciliation; independent re-review passed |
| `docs/plans/implementation/orion-model-followups.md` | Plan | done | done | done | done | Design reconciliation; independent re-review passed |
| `docs/plans/implementation/panel-runtime-regressions.md` | Plan | done | done | done | done | Planning/feature migration review |
| `docs/plans/implementation/panel-system-v1-followups.md` | Plan | done | done | done | done | Active remainder separated; 2026-09-03 independent re-review passed |
| `docs/plans/implementation/runtime-architecture-followups.md` | Plan | done | done | done | done | Design reconciliation; independent re-review passed |
| `docs/plans/roadmap.md` | Plan | done | done | done | done | All active scoped plans routed; independent governance review passed |
| `docs/research/mission-sourcing/chandrayaan1-event-sources.md` | Research | done | not needed | not needed | not needed | Non-authoritative research record |
| `docs/research/mission-sourcing/horizons-lunar-missions.md` | Research | done | not needed | not needed | not needed | Non-authoritative research record |
| `docs/research/mission-sourcing/lunar-feature-and-artemis2-reference-sources.md` | Research | done | not needed | not needed | not needed | Non-authoritative research record |
| `docs/research/corpora/sun-fov/README.md` | Research corpus | done | not needed | not needed | not needed | Non-authoritative reference corpus |
| `docs/research/moon-rendering/01-solar-disk-physics.md` | Research | done | not needed | not needed | not needed | Non-authoritative research record |
| `docs/research/moon-rendering/02-lunar-brdf.md` | Research | done | not needed | not needed | not needed | Non-authoritative research record |
| `docs/research/moon-rendering/03-techniques-survey.md` | Research | done | not needed | not needed | not needed | Non-authoritative research record |
| `docs/research/moon-rendering/research-and-plan.md` | Research | done | not needed | not needed | not needed | Mixed document classified primarily as research |
| `docs/research/performance/performance-functional-core-experiments.md` | Research | done | not needed | not needed | not needed | Non-authoritative research record |
| `docs/research/rendering/orion-visual-references.md` | Research | done | not needed | not needed | not needed | Non-authoritative source-selection record |
| `docs/designs/rendering/orion-procedural-model-generation.md` | Design | done | done | done | done | Design reconciliation; independent re-review passed |
| `docs/operations/ci/runtime-animation-benchmark.md` | Operation | done | done | done | done | Operations reconciliation; independent re-review passed |
| `docs/operations/contributor/sky-render-demo.md` | Operation | done | done | done | done | Operations reconciliation; independent re-review passed |
| `docs/research/time/eclipse-timing-tdb-2026-04.md` | Research | done | not needed | not needed | not needed | Non-authoritative research record |
| `docs/research/ui/panel-layout-library-evaluation.md` | Research | done | not needed | not needed | not needed | Non-authoritative research record |
| `docs/operations/contributor/ai-tools.md` | Operation | done | done | done | done | Operations reconciliation; independent re-review passed |
| `docs/operations/contributor/developer.md` | Operation | done | done | done | done | Operations reconciliation; independent re-review passed |
| `docs/operations/contributor/documentation-maintenance.md` | Operation | done | done | done | done | Three-spec reconciliation; independent re-review passed |
| `docs/operations/contributor/testing.md` | Operation | done | done | done | done | Operations reconciliation; independent re-review passed |
| `docs/operations/contributor/ui-review.md` | Operation | done | done | done | done | Design reconciliation; independent re-review passed |
| `docs/operations/data/chebyshev-ephemeris-generation.md` | Operation | done | done | done | done | 2026-09-03 focused independent review |
| `docs/operations/data/horizons-worker-playbook.md` | Operation | done | done | done | done | Operations reconciliation; independent re-review passed |
| `docs/operations/data/moon-render-assets.md` | Operation | done | done | done | done | Operations reconciliation; independent re-review passed |
| `docs/operations/data/relative-mode-generation.md` | Operation | done | done | done | done | Relative/compare/time review |
| `docs/operations/data/repo-sync-playbook.md` | Operation | done | done | done | done | Operations reconciliation; independent re-review passed |
| `docs/operations/deployment/r2-asset-hosting.md` | Operation | done | done | done | done | Operations reconciliation; independent re-review passed |
| `docs/operations/media/artemis2-media-assets.md` | Operation | done | done | done | done | Operations reconciliation; independent re-review passed |
| `docs/operations/media/artemis2-media-streaming.md` | Operation | done | done | done | done | Operations reconciliation; independent re-review passed |
| `docs/evidence/audits/docs-consolidation-dryscope-2026-05-16.md` | Evidence | done | done | not needed | done | Disposition reviewed: retain while outstanding work remains |
| `docs/evidence/audits/repository-documentation-classification-inventory-2026-09-02.md` | Evidence | done | done | not needed | done | Disposition reviewed: retain while outstanding work remains |
| `docs/evidence/audits/streams-worktree-session-audit-2026-05-12.md` | Evidence | done | done | not needed | done | Disposition reviewed: retain while outstanding work remains |
| `docs/evidence/baselines/artemis2-lunar-flyby-stream-package.md` | Evidence | done | done | not needed | done | Dated operation evidence retained; independent re-review passed |
| `docs/evidence/baselines/artemis2-media-import-2026-05.md` | Evidence | done | done | not needed | done | Dated operation evidence retained; independent re-review passed |
| `docs/evidence/baselines/artemis2-video-sync-anchors.md` | Evidence | done | done | not needed | done | Disposition reviewed: retain while outstanding work remains |
| `docs/evidence/baselines/mission-data-state-2026-05-15.md` | Evidence | done | done | not needed | done | Dated operation evidence retained; independent re-review passed |
| `docs/evidence/baselines/moon-render-assets-2026-04.md` | Evidence | done | done | not needed | done | Dated operation evidence retained; independent re-review passed |
| `docs/evidence/handoffs/artemis2-transcription-diarization-handoff.md` | Evidence | done | done | not needed | done | Disposition reviewed: retain while outstanding work remains |
| `docs/evidence/handoffs/artemis2-transcripts-complete-handoff.md` | Evidence | done | done | not needed | done | Disposition reviewed: retain while outstanding work remains |
| `docs/evidence/reviews/commit-review-tdb-timescale-2026-04-08.md` | Evidence | done | done | not needed | done | Disposition reviewed: retain while outstanding work remains |
| `docs/evidence/reviews/documentation-migration-feature-specifications-2026-09-02.md` | Evidence | done | done | not needed | done | Disposition reviewed: retain while outstanding work remains |
| `docs/evidence/reviews/documentation-migration-planning-authority-2026-09-02.md` | Evidence | done | done | not needed | done | Disposition reviewed: retain while outstanding work remains |
| `docs/evidence/reviews/documentation-migration-relative-compare-time-2026-09-02.md` | Evidence | done | done | not needed | done | Disposition reviewed: retain while outstanding work remains |
| `docs/evidence/reviews/performance-regression-investigation-2026-05-16.md` | Evidence | done | done | not needed | done | Disposition reviewed: retain while outstanding work remains |
| `docs/evidence/reviews/runtime-finding-promotion-2026-09-03.md` | Evidence | done | done | not needed | done | Disposition reviewed: retain while outstanding work remains |
| `docs/evidence/reviews/runtime-architecture-reconciliation-2026-09-03.md` | Evidence | done | done | not needed | done | Architecture findings retained; independent re-review passed |
| `docs/evidence/reviews/style-audit-review-report.md` | Evidence | done | done | not needed | done | Disposition reviewed: retain while outstanding work remains |
| `docs/operations/current-status-roadmap.md` | Evidence (frozen exception) | not needed | done | not needed | done | Disposition reviewed: immutable evidence retained in place |
| `docs/archive/audits/state-inventory.md` | Archive | done | not needed | not needed | not needed | Historical record |
| `docs/archive/designs/camera-redesign-proposal.md` | Archive | done | not needed | not needed | not needed | Historical record |
| `docs/archive/designs/claude-mission-js-refactoring-proposal.md` | Archive | done | not needed | not needed | not needed | Historical record |
| `docs/archive/designs/gemini-mission-js-refactoring-proposal.md` | Archive | done | not needed | not needed | not needed | Historical record |
| `docs/archive/plans/jqueryui-migration.md` | Archive | done | not needed | not needed | not needed | Historical record |
| `docs/archive/plans/modernization-plan-2026.md` | Archive | done | not needed | not needed | not needed | Historical record |
| `docs/archive/plans/artemis2-media-timeline-history-2026-09-03.md` | Archive | done | done | not needed | done | Full mixed-plan history preserved; independent re-review passed |
| `docs/archive/plans/dockview-followups-history-2026-09-03.md` | Archive | done | done | not needed | done | Full mixed-plan history preserved; independent re-review passed |
| `docs/archive/plans/frame-and-shoot-lighting.md` | Archive | done | done | not needed | done | Completed plan archived; independent re-review passed |
| `docs/archive/plans/main-view-photo-mode-history-2026-09-03.md` | Archive | done | done | not needed | done | Full mixed-plan history preserved; independent re-review passed |
| `docs/archive/plans/moon-rendering.md` | Archive | done | done | not needed | done | Superseded execution history preserved; independent re-review passed |
| `docs/archive/plans/orbit-first-timeline-history-2026-09-03.md` | Archive | done | done | not needed | done | Full mixed-plan history preserved; independent re-review passed |
| `docs/archive/plans/orbit-ux-history-2026-09-03.md` | Archive | done | done | not needed | done | Full mixed-plan history preserved; independent re-review passed |
| `docs/archive/plans/panel-progressive-disclosure.md` | Archive | done | done | not needed | done | Completed scoped plan archived; independent re-review passed |
| `docs/archive/plans/panel-system-v1-followups-history-2026-09-03.md` | Archive | done | done | not needed | done | Full mixed-plan history preserved; independent re-review passed |
| `docs/archive/reviews/functional-core-imperative-shell-report.md` | Archive | done | not needed | not needed | not needed | Historical record |
| `docs/archive/reviews/gemini-review.md` | Archive | done | not needed | not needed | not needed | Historical record |
| `docs/archive/specs/repository-documentation-classification-and-lifecycle-draft-2026-09-02.md` | Archive | done | not needed | not needed | not needed | Preserved superseded uncommitted draft |
| `docs/archive/status/current-plan-2026-05-19.md` | Archive | done | done | done | done | Planning-authority review |
| `docs/archive/status/open-todos-2026-05-16.md` | Archive | done | done | done | done | Planning-authority review |
| `scripts/moon-tune/README.md` | Colocated operation | not needed | done | done | done | Tool behavior and limitations documented; independent re-review passed |

## Non-Document Collections

The following rows apply to every file matched by each pattern. HORIZONS blurbs
are generated product data under `assets/`, not engineering documentation. The
Sun FoV support corpus remains research material under `docs/research`.

| Documents | Count | Primary class | Relocation | Review | Refactor | Re-review | Basis |
| --- | ---: | --- | --- | --- | --- | --- | --- |
| `assets/horizons-blurbs/raw/*.txt` | 38 | Generated product data | done | not needed | not needed | not needed | HORIZONS source snapshot layer |
| `assets/horizons-blurbs/metadata/*.json` | 38 | Generated product data | done | not needed | not needed | not needed | Runtime-consumed metadata layer |
| `assets/horizons-blurbs/markdown/*.md` | 38 | Generated product data | done | not needed | not needed | not needed | Human-readable generated layer |
| `assets/horizons-blurbs/mission-index.json` | 1 | Generated product data | done | not needed | not needed | not needed | Mission-scaffolding index |
| `docs/research/corpora/sun-fov/**` excluding `README.md` | 19 | Research corpus | done | not needed | not needed | not needed | Reference images and manifests |

## Relocation Record

The current paths in the inventory are authoritative. Git history and
[the classification inventory](../../evidence/audits/repository-documentation-classification-inventory-2026-09-02.md)
preserve earlier paths. No compatibility pointers are retained.
