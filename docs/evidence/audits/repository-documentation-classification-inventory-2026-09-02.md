---
doc_class: evidence
status: review-required
scope: repository.documentation.migration
target_revision: e5c242788868012d41e51f8c49a806ced0549bd5
disposition: pending-owner-review
---

# Repository Documentation Classification Inventory

Audit date: 2026-09-02 (IST)

Status: proposed dispositions only. No existing document has been moved,
archived, deleted, split, or edited by this inventory.

This is the review gate required by
[Repository Documentation Classification And Lifecycle](../../specs/repository-documentation-classification-and-lifecycle.md).
Every tracked documentation file is accounted for below, either individually
or as a named member of the HORIZONS corpus.

## Frozen Exception

`docs/operations/current-status-roadmap.md` is excluded from migration. It is
untracked in the current checkout, remains byte-for-byte unchanged during this
work, and had content hash `f6079ee27e7db5dd036471ea490e04cb22d4f077`
when this inventory began.

The `Frozen pointer` column means the immutable roadmap links directly to the
current path. If that document moves after approval, a minimal compatibility
pointer must remain at the old path.

## Decisions Recorded After Inventory

| Decision | Disposition | Date |
| --- | --- | --- |
| Target class vocabulary and lifecycle | Approved in principle; policy is current | 2026-09-02 |
| HORIZONS corpus | Classified as a governed research/source corpus; keep at current path initially | 2026-09-02 |
| Split relative mode, orbit comparison, and time synchronization by authority | Approved; migration unit executed with independent review and fixes | 2026-09-02 |
| Establish one mutable roadmap and move existing domain plans into the plan hierarchy | Approved; migration unit independently reviewed and corrected, awaiting isolated commit | 2026-09-02 |
| Consolidate six stable feature specifications; defer active orbit-milestones spec | Approved; migration independently reviewed and corrected, awaiting isolated commit | 2026-09-02 |

All other proposed dispositions remain review-required.

## Coverage

| Surface | Files accounted for |
| --- | ---: |
| Tracked files under `docs/` | 184 |
| Markdown under `docs/` | 107 |
| HORIZONS corpus (`38 raw + 38 metadata + 38 Markdown + index`) | 115 |
| Other tracked files under `docs/` | 69 |
| Tracked Markdown outside `docs/` | 9 |
| Total tracked documentation files in this inventory | 193 |
| Frozen untracked roadmap exception | 1 |
| Ignored local Sun/FoV support corpus | 20 |

The inventory covers tracked Markdown, JSON, and text documentation/source
records plus named local exceptions. Runtime HTML, mission JSON configuration,
generated ephemeris, source code comments, test fixtures, and general media
assets are outside this classification pass.

## Disposition Vocabulary

- **Keep**: path already fits the target role.
- **Move**: one document has one clear target class/path.
- **Split**: current file owns more than one class; preserve it until replacement
  owners are reviewed and complete.
- **Archive**: already non-current; move into the target archive taxonomy.
- **Reconcile**: current-looking documents overlap; choose one owner before any
  move or pointer is created.
- **Colocated**: operational/routing README remains beside what it governs.
- **Corpus hold**: move only as a complete source/generated/index unit after
  consumer and generator analysis.

## Repository-Level And Colocated Documents

| Current path | Current role | Proposed disposition | Frozen pointer |
| --- | --- | --- | --- |
| `README.md` | Public repository entrypoint plus contributor detail | Keep at root; progressively link operational detail instead of duplicating it | No |
| `AGENTS.md` | Repository instructions | Keep at root; treat as routing/guardrails, not product authority | No |
| `CLAUDE.md` | Assistant-specific repository instructions | Keep at root; reconcile duplicated detail toward canonical docs | No |
| `GEMINI.md` | Assistant-specific repository instructions | Keep at root; reconcile duplicated detail toward canonical docs | No |
| `assets/chandrayaan1/data/README-spice-export.md` | Data-local export procedure/provenance | Colocated; keep beside mission data | No |
| `assets/lunarorbiter1/data/README-spice-export.md` | Data-local export procedure/provenance | Colocated; keep beside mission data | No |
| `assets/selene/data/README-spice-export.md` | Data-local export procedure/provenance | Colocated; keep beside mission data | No |
| `assets/smart1/data/README-spice-export.md` | Data-local export procedure/provenance | Colocated; keep beside mission data | No |
| `scripts/moon-tune/README.md` | Tool-local operating guide | Colocated; keep beside scripts | No |

## Documentation Router And Root Documents

| Current path | Current role | Proposed disposition | Frozen pointer |
| --- | --- | --- | --- |
| `docs/README.md` | Current routing index | Keep; rewrite only during approved migration to route by class and exclude evidence/archive by default | No |
| `docs/developer.md` | Contributor and release operations | Move to `docs/operations/contributor/developer.md` | No |
| `docs/artemis2-media-streaming.md` | HLS packaging, hosting, source, and provisional sync reference | Move operational material to `docs/operations/media/artemis2-stream-packaging-and-hosting.md`; move provisional sync claims to evidence | No |

## Existing Archive

All eight files are already non-current. Their content remains unchanged; only
the target archive taxonomy is proposed.

| Current path | Prior role | Proposed destination | Frozen pointer |
| --- | --- | --- | --- |
| `docs/archived/camera-redesign-proposal.md` | Superseded design proposal | `docs/archive/designs/camera-redesign-proposal.md` | No |
| `docs/archived/claude-mission-js-refactoring-proposal.md` | Superseded mixed design/plan | `docs/archive/plans/claude-mission-js-refactoring-proposal.md` | No |
| `docs/archived/functional-core-imperative-shell-report.md` | Closed architecture review/backlog | `docs/archive/reviews/functional-core-imperative-shell-report.md` | No |
| `docs/archived/gemini-mission-js-refactoring-proposal.md` | Superseded mixed design/plan | `docs/archive/plans/gemini-mission-js-refactoring-proposal.md` | No |
| `docs/archived/gemini-review.md` | Closed review | `docs/archive/reviews/gemini-review.md` | No |
| `docs/archived/jqueryui-migration.md` | Completed/superseded migration plan | `docs/archive/plans/jqueryui-migration.md` | No |
| `docs/archived/modernization-plan-2026.md` | Completed/superseded modernization plan | `docs/archive/plans/modernization-plan-2026.md` | No |
| `docs/archived/state-inventory.md` | Historical state audit | `docs/archive/audits/state-inventory.md` | No |

## Specifications And Product Doctrine

| Current path | Classification finding | Proposed destination/action | Frozen pointer |
| --- | --- | --- | --- |
| `docs/specs/mobile-experience-v1-spec.md` | Current specification; already correctly classified | Keep | No |
| `docs/design/specs/camera-state-transition-spec.md` | Current behavior target despite `design` parent | Move to `docs/specs/camera/state-transitions.md` | Yes |
| `docs/design/specs/frame-and-shoot-lighting-exposure-spec.md` | Current rendering/interaction contract | Move to `docs/specs/rendering/frame-and-shoot-lighting-and-exposure.md` | Yes |
| `docs/design/specs/lunar-feature-controls-spec.md` | Current control behavior contract | Move to `docs/specs/ui/lunar-feature-controls.md` | Yes |
| `docs/design/specs/orbit-milestones-spec.md` | Current feature contract plus implementation checklist | Move contract to `docs/specs/orbit/milestones.md`; move delivery checklist to an implementation plan | Yes |
| `docs/design/specs/panel-progressive-disclosure-spec.md` | Current panel behavior contract | Move to `docs/specs/ui/panel-progressive-disclosure.md` | Yes |
| `docs/design/specs/panel-system-v1-spec.md` | Current panel behavior plus deferred backlog | Move contract to `docs/specs/ui/panel-system-v1.md`; move deferred queue to panel plan | Yes |
| `docs/design/specs/timeline-media-playback-spec.md` | Current mission-clock/media behavior contract | Move to `docs/specs/time/timeline-and-media-playback.md` | Yes |
| `docs/design/runtime-ux-doctrine.md` | Normative product/runtime behavior | Move to `docs/specs/ui/runtime-ux-doctrine.md` | No |
| `docs/design/style-typography-guide.md` | Normative style, component, and accessibility contract | Move to `docs/specs/ui/style-and-typography.md` | No |
| `docs/design/artemis-in-real-time-ux-principles.md` | Artemis-specific product requirements and principles | Move to `docs/specs/product/artemis-real-time-experience.md` | No |

## Designs And Mixed Architecture Documents

| Current path | Classification finding | Proposed destination/action | Frozen pointer |
| --- | --- | --- | --- |
| `docs/design/design.md` | Design router plus current architecture summary | Move router to `docs/designs/README.md`; retain routing-only pointer because the path was published in root contributor/assistant instructions and may have external inbound links | No; external continuity |
| `docs/design/architecture/target-architecture.md` | Dated runtime target/current-state snapshot | Move to `docs/designs/runtime/target-architecture.md` as review-required; retain frozen-roadmap pointer and reconcile current-state claims | Yes |
| `docs/design/architecture/chebyshev-format-spec.md` | Data contract incorrectly under architecture | Move to `docs/specs/data/chebyshev-ephemeris-format.md`; retain routing-only pointer because the path was published in design/tool/test references and may have external inbound links | No; external continuity |
| `docs/design/architecture/orbit-comparison-mode.md` | Mixed behavior contract and implementation design | Split into spec/design/plan owners; retain a routing-only pointer because the path was published from the root README and may have external inbound links | No; external continuity |
| `docs/design/architecture/relative-mode.md` | Mixed URL/behavior contract, frame design, and generation procedure | Split into `docs/specs/modes/relative-mode.md`, `docs/designs/frames/relative-mode.md`, and `docs/operations/data/relative-mode-generation.md`; remove old path after internal links update | No |
| `docs/design/architecture/time-synchronization-and-timekeeping.md` | Mixed normative clock rules, design hub, and open decisions | Split accepted rules into `docs/specs/time/clock-authority.md`; retain architecture in `docs/designs/time/synchronization.md`; track decisions in plans | Yes |
| `docs/design/architecture/chandrayaan1-event-sourcing.md` | Mission source research and config-authoring evidence, not architecture | Move to `docs/research/mission-sourcing/chandrayaan1-event-sources.md` | No |

## Research, Evaluations, And Technical Guides

| Current path | Classification finding | Proposed destination/action | Frozen pointer |
| --- | --- | --- | --- |
| `docs/design/research/moon-rendering-research-and-plan.md` | Mixed research synthesis and delivery plan | Split durable findings into `docs/research/moon-rendering/synthesis.md`; move accepted remaining work to a plan | No |
| `docs/design/research/orion-procedural-model-generation.md` | Implemented renderer design plus future ideas | Move design to `docs/designs/rendering/orion-procedural-model.md`; promote retained ideas to roadmap | No |
| `docs/design/research/panel-layout-library-evaluation.md` | Durable alternatives evaluation | Move to `docs/research/ui/panel-layout-library-evaluation.md` | No |
| `docs/design/research/performance-functional-core-experiments.md` | Durable experiment/measurement record | Move to `docs/research/performance/functional-core-experiments.md` | No |
| `docs/design/research/runtime-animation-benchmark.md` | Current benchmark operating procedure and measurement guidance | Move to `docs/operations/ci/runtime-animation-benchmark.md` | No |
| `docs/design/research/sky-render-demo.md` | Developer guide for a diagnostic surface | Move to `docs/operations/contributor/sky-render-demo.md` | No |
| `docs/research/moon-rendering/01-solar-disk-physics.md` | Durable scientific research | Keep | No |
| `docs/research/moon-rendering/02-lunar-brdf.md` | Durable scientific research | Keep | No |
| `docs/research/moon-rendering/03-techniques-survey.md` | Durable techniques/source survey | Keep | No |
| `docs/research/moon-rendering/04-implementation-plan.md` | Mixed implementation plan, progress evidence, and research conclusions | Split retained work into `docs/plans/implementation/moon-rendering.md`; move execution record to evidence, then archive after disposition | No |
| `docs/investigations/eclipse-timing-tdb-2026-04.md` | Resolved technical investigation with durable timekeeping knowledge | Move to `docs/research/timekeeping/eclipse-timing-tdb-2026-04.md` | No |
| `docs/mission-sourcing/horizons-lunar-missions.md` | Dated, durable source-availability survey | Move to `docs/research/mission-sourcing/horizons-lunar-missions-2026-03-31.md` | No |
| `docs/operations/lunar-feature-and-artemis2-reference-sources.md` | Source/provenance knowledge, not an operation | Move to `docs/research/sources/lunar-features-and-artemis2.md` | No |
| `docs/operations/performance-regression-investigation-2026-05-16.md` | Completed investigation; active queue lives elsewhere | Move to `docs/research/performance/regression-investigation-2026-05-16.md` | No |

## Plans And Current Workstreams

The repository-wide queue must eventually have one mutable owner at
`docs/plans/roadmap.md`. The frozen roadmap remains unchanged as historical
recovery authority, while the files below are reconciled into the future plan
hierarchy.

| Current path | Classification finding | Proposed destination/action | Frozen pointer |
| --- | --- | --- | --- |
| `docs/operations/current-plan.md` | Current repository queue in wrong class | Reconcile into `docs/plans/roadmap.md`; archive replaced status prose after item-level review | Yes |
| `docs/operations/artemis2-media-workstream.md` | Domain breakdown plan plus a few operating invariants | Move plan to `docs/plans/breakdown/artemis2-media.md`; move procedures/invariants to ops/spec owners | Yes |
| `docs/operations/performance-workstream.md` | Domain performance plan | Move to `docs/plans/breakdown/performance.md` | Yes |
| `docs/design/roadmap/artemis2-media-timeline-plan.md` | Shipped narrative plus remaining plan | Split remaining work into `docs/plans/breakdown/artemis2-media-timeline.md`; archive completed execution narrative later | Yes |
| `docs/design/roadmap/dockview-panel-layout-integration-plan.md` | Mostly completed plan plus open decisions | Move open work to `docs/plans/implementation/dockview-followups.md`; archive closed phases after verification | Yes |
| `docs/design/roadmap/main-view-photo-mode-plan.md` | Unscheduled breakdown plan | Move to `docs/plans/breakdown/main-view-photo-mode.md` | Yes |
| `docs/design/roadmap/orbit-first-timeline-plan.md` | Active product breakdown with stale checklist entries | Move reconciled plan to `docs/plans/breakdown/orbit-first-timeline.md` | Yes |
| `docs/design/roadmap/orbit-ux-and-refactor-roadmap.md` | Domain roadmap/recovery targets | Move current work to `docs/plans/breakdown/orbit-ux.md`; archive superseded branch-recovery narrative after disposition | Yes |
| `docs/design/roadmap/panel-system-v1-implementation-plan.md` | Partially completed implementation plan | Move remaining work to `docs/plans/implementation/panel-system-v1-followups.md`; archive completed foundation narrative later | Yes |
| `docs/design/roadmap/real-size-craft-follow-backlog.md` | Preserved product outcome and implementation guidance | Move to `docs/plans/breakdown/real-size-craft-follow.md` | Yes |

## Operations

| Current path | Classification finding | Proposed destination/action | Frozen pointer |
| --- | --- | --- | --- |
| `docs/guides/ai-tools.md` | Contributor operation | Move to `docs/operations/contributor/ai-tools.md` | No |
| `docs/guides/testing.md` | Test/CI operation | Move to `docs/operations/ci/testing.md` | No |
| `docs/mission-sourcing/horizons-worker-playbook.md` | Current data-research operation | Move to `docs/operations/data/horizons-worker-playbook.md` | No |
| `docs/operations/artemis2-media-assets.md` | Current media asset provenance and maintenance operation | Move to `docs/operations/media/artemis2-media-assets.md` | Yes |
| `docs/operations/mission-data-current-state.md` | Mixed current state, boundary rules, and extraction history | Split normative boundary into `docs/specs/data/repository-boundary.md`; keep procedure/state under `docs/operations/data/`; archive dated extraction narrative later | Yes |
| `docs/operations/moon-render-assets.md` | Current Moon asset operation/provenance | Move to `docs/operations/media/moon-render-assets.md` | No |
| `docs/operations/r2-asset-hosting.md` | Current deployment/hosting operation | Move to `docs/operations/deployment/r2-asset-hosting.md` | No |
| `docs/operations/repo-sync-playbook.md` | Current app/data synchronization runbook | Move to `docs/operations/data/repo-sync-playbook.md`; repair four stale `C:/sankar/projects/...` absolute links during that reviewed unit | Yes |

## Transitional Evidence And Handoffs

| Current path | Classification finding | Proposed destination/action | Frozen pointer |
| --- | --- | --- | --- |
| `docs/design/style-audit-review-report.md` | Review with open/partially closed findings | Move to `docs/evidence/reviews/runtime-style-audit-2026-05-18.md`; archive only after every finding is dispositioned and re-reviewed | Yes |
| `docs/investigations/commit-review-tdb-timescale-2026-04-08.md` | Review with open/deferred findings | Move to `docs/evidence/reviews/tdb-timescale-commit-review-2026-04-08.md` | No |
| `docs/operations/artemis2-transcription-diarization-handoff.md` | Context-switch handoff with remaining work | Move to `docs/evidence/handoffs/artemis2-transcription-diarization-2026-05.md` | No |
| `docs/operations/artemis2-transcripts-complete-handoff.md` | Detailed rebuild/verification handoff with unresolved items | Move to `docs/evidence/handoffs/artemis2-transcripts-complete-2026-05.md` | Yes |
| `docs/operations/artemis2-video-sync-anchors.md` | Provisional measured anchor ledger | Move to `docs/evidence/baselines/artemis2-video-sync-anchors.md`; archive after machine-readable mapping is accepted | Yes |
| `docs/operations/docs-consolidation-dryscope-2026-05-16.md` | Prior documentation audit whose remediation is still active | Move to `docs/evidence/audits/documentation-consolidation-2026-05-16.md`; mark its `docs/design/design.md` recommendation historical and route current readers to `docs/designs/README.md` | Yes |
| `docs/operations/streams-worktree-session-audit-2026-05-12.md` | Manual review checklist with unresolved verification | Move to `docs/evidence/reviews/streams-worktree-session-2026-05-12.md` | Yes |

## Material Ready For Archive Review

| Current path | Classification finding | Proposed destination/action | Frozen pointer |
| --- | --- | --- | --- |
| `docs/operations/open-todos-2026-05-16.md` | Explicitly superseded dated status capture | Move to `docs/archive/status/open-todos-2026-05-16.md` after confirming every item is represented in current plans | Yes |

No other current-looking plan or evidence file is marked ready for archive
without further item-level review.

## HORIZONS Source Corpus

Proposed class: durable research/source corpus.

Proposed destination after generator and consumer review:
`docs/research/corpora/horizons-blurbs/`, preserving `raw/`, `metadata/`,
`markdown/`, and `mission-index.json` as one unit.

For every identifier below, all three files are accounted for:

```text
docs/horizons-blurbs/raw/<id>.txt
docs/horizons-blurbs/metadata/<id>.json
docs/horizons-blurbs/markdown/<id>.md
```

| Identifier | Files | Disposition |
| --- | ---: | --- |
| `apollo-10-lm-snoopy` | 3 | Corpus hold |
| `apollo-10-s-ivb` | 3 | Corpus hold |
| `apollo-11-s-ivb` | 3 | Corpus hold |
| `apollo-12-s-ivb` | 3 | Corpus hold |
| `apollo-8-s-ivb` | 3 | Corpus hold |
| `apollo-9-s-ivb` | 3 | Corpus hold |
| `artemis-1-orion` | 3 | Corpus hold |
| `artemis-2-orion` | 3 | Corpus hold |
| `artemis-p1` | 3 | Corpus hold |
| `artemis-p2` | 3 | Corpus hold |
| `capstone` | 3 | Corpus hold |
| `chandrayaan-1` | 3 | Corpus hold |
| `chandrayaan-2-lander-vikram` | 3 | Corpus hold |
| `chandrayaan-2-orbiter` | 3 | Corpus hold |
| `chandrayaan-3-lander-vikram` | 3 | Corpus hold |
| `chandrayaan-3-propulsion-module` | 3 | Corpus hold |
| `clementine` | 3 | Corpus hold |
| `grail-a-ebb` | 3 | Corpus hold |
| `grail-b-flow` | 3 | Corpus hold |
| `grail-ss-stage` | 3 | Corpus hold |
| `hgs-1` | 3 | Corpus hold |
| `isee-3-ice` | 3 | Corpus hold |
| `juice` | 3 | Corpus hold |
| `kplo-danuri` | 3 | Corpus hold |
| `ladee` | 3 | Corpus hold |
| `lcross-centaur` | 3 | Corpus hold |
| `lcross-shepherd` | 3 | Corpus hold |
| `lro` | 3 | Corpus hold |
| `lunar-flashlight` | 3 | Corpus hold |
| `lunar-prospector` | 3 | Corpus hold |
| `lunar-trailblazer` | 3 | Corpus hold |
| `nozomi` | 3 | Corpus hold |
| `slim` | 3 | Corpus hold |
| `stereo-a` | 3 | Corpus hold |
| `stereo-b` | 3 | Corpus hold |
| `tess` | 3 | Corpus hold |
| `wind` | 3 | Corpus hold |
| `wmap` | 3 | Corpus hold |
| `docs/horizons-blurbs/mission-index.json` | 1 | Corpus hold; move with all triplets |

Total: 115 tracked corpus files.

Required checks before moving the corpus:

1. identify the generator and every consumer;
2. distinguish authored raw/metadata from generated Markdown/index outputs;
3. preserve relative-path assumptions or update generator and consumers in the
   same change;
4. verify all 38 triplets and the index after the move; and
5. decide whether a load-bearing corpus path should remain stable instead.

## Local Ignored Support Corpus

`docs/design/references/sun-fov/` contains 20 ignored local files: a README,
two manifests, contact sheets, and image references. It is excluded by
`.gitignore` and therefore absent from the 193 tracked-file count.

Proposed disposition: preserve in place during tracked-doc migration. Before
moving or deleting its parent tree, decide whether this is durable research,
evidence, or regenerable scratch; record source/licensing and either promote it
intentionally or relocate it outside the repository. Do not infer disposability
from Git ignore status.

## Duplicate Authority And Mixed-Purpose Findings

### Repository planning

Potential current owners overlap across `operations/current-plan.md`, media and
performance workstreams, seven design roadmaps, and the frozen recovery
roadmap. Target rule:

- `docs/plans/roadmap.md` owns the mutable repository queue;
- breakdown/implementation plans own scoped delivery detail; and
- the frozen roadmap remains an immutable September recovery baseline.

### Runtime UX, style, and controls

`runtime-ux-doctrine.md`, `style-typography-guide.md`,
`artemis-in-real-time-ux-principles.md`, feature specs, and the style audit
currently mix normative rules and review findings. Promote accepted behavior to
specifications; keep unresolved observations in evidence.

### Panels

The panel spec, panel implementation plan, Dockview plan, library evaluation,
and progressive-disclosure spec overlap by topic but have legitimate distinct
roles. Preserve those roles as contract, plan, research, and evidence rather
than merging by subject.

### Mission time and media

The timekeeping hub, timeline/media spec, media workstream, media timeline plan,
stream notes, transcript handoffs, and sync-anchor ledger overlap. Required
split:

- clock/playback rules to specifications;
- synchronization architecture to designs;
- sequencing to plans;
- packaging/hosting to operations;
- provisional anchors and handoffs to evidence.

### Moon rendering

Moon rendering spans durable physics/BRDF research, a synthesis-and-plan,
implementation progress, asset operations, benchmark evidence, and ignored
visual references. Preserve the scientific series; separate accepted renderer
requirements, current delivery work, operations, and transitional evidence.

### App/data boundary and mission sourcing

Root instructions, developer docs, mission-data status, repo-sync procedures,
mission source surveys, worker playbooks, and colocated SPICE READMEs repeat
parts of the boundary. The target owners should be:

- repository/data boundary contract in a specification;
- procedures in operations;
- source availability in research;
- dated audit results in evidence; and
- root/colocated files as concise routing and local instructions.

### Relative and comparison modes

Current architecture documents combine URL contracts, behavior, coordinate
definitions, implementation wiring, and data-generation commands. Split the
normative mode contract from structural design and operating procedures.

## Link And Compatibility Impact

Before each approved move:

1. enumerate tracked, generated, and known external inbound links;
2. update ordinary internal links in the same change;
3. leave routing-only pointer files for every moved path marked `Yes` in the
   `Frozen pointer` column;
4. verify the frozen roadmap hash is unchanged;
5. verify pointer files contain no duplicated intent or status; and
6. validate Markdown and corpus links before closing the migration unit.

## Proposed Migration Units

These are review units, not authorization:

1. **Foundation**: approve policy, inventory, metadata, target tree, and frozen
   exception.
2. **Archive taxonomy**: rename `archived` to `archive` and classify the eight
   already historical files.
3. **Specifications**: move current contracts and split checklist/backlog
   content without changing behavior.
4. **Designs**: establish `docs/designs/` and split relative/compare/timekeeping
   mixed documents.
5. **Plans**: create one mutable roadmap and scoped breakdown/implementation
   plans; reconcile stale status claims item by item.
6. **Evidence**: move audits, reviews, handoffs, anchors, and unresolved
   investigations; record target revisions and dispositions.
7. **Operations**: regroup contributor, CI, data, media, release, and deployment
   procedures.
8. **Research**: consolidate research paths without archiving by age.
9. **Corpora**: move HORIZONS and local support corpora only after generator,
   source, and consumer analysis.
10. **Routing and checks**: update `docs/README.md`, trim duplicated root-agent
    guidance, add classification/link checks, and verify frozen pointers.

## Review Questions

1. Is `docs/specs/`, `docs/designs/`, `docs/plans/`, `docs/research/`,
   `docs/operations/`, `docs/evidence/`, and `docs/archive/` the approved target
   vocabulary?
2. Should the HORIZONS corpus move under research, or remain at its stable path
   as a load-bearing corpus exception?
3. Should `orbit-comparison-mode.md`, `relative-mode.md`, and the timekeeping hub
   be split as proposed, or should one class own each document intact?
4. Should the existing `current-plan.md` seed the future mutable roadmap, with
   domain roadmaps becoming breakdown plans?
5. Are compatibility pointer files acceptable for every frozen-roadmap link?
6. Which ignored Sun/FoV reference assets should become tracked research or
   evidence?

No physical migration should begin until these dispositions are reviewed.
