# Runtime Architecture Follow-Ups

Requirements:
[Runtime Architecture Boundaries](../../specs/runtime/architecture-boundaries.md)

Design:
[Runtime Target Architecture](../../designs/runtime/target-architecture.md)

Review evidence:
[Runtime Architecture Reconciliation](../../evidence/reviews/runtime-architecture-reconciliation-2026-09-03.md)

## Reconciliation Outcome

The May 2026 assessment described most structural work as essentially complete.
Current review rejects that conclusion: meaningful dependency, effect, and
composition gaps remain. The historical assessment is preserved below, while
the current queue owns delivery.

## Current Verified Queue

### State ownership campaign — 2026-09-16

The user requested a full state-problem inventory and sequential remediation.
The [state audit](../../evidence/reviews/runtime-state-audit-2026-09-16.md)
owns findings and proof; the [roadmap](../roadmap.md) remains the only
cross-workstream priority queue. This campaign takes precedence over the
generic historical cleanup list below. Do not implement multiple findings in
one undifferentiated refactor.

Delivery order (one bounded fix, independent review and verification per row):

| Order | Audit IDs | Outcome | Status |
| --- | --- | --- | --- |
| 1 | SA-01 | Owned configuration activation, shared loading and bounded supersession recovery | Complete; see audit verification |
| 2 | SA-02, then SA-07 | Retired media sessions cannot change selection/time; disposal remains terminal | Both complete; separate TDD/review evidence |
| 3 | SA-03 / RTA-06 | Latest camera intent owns retries; semantic state independent of controls | Complete; normalized state port and reviewed lifecycle guards |
| 4 | SA-04 | Temporary annotation presentation always restores main-scene state | Complete; real-builder and exception regressions reviewed |
| 5 | SA-05 | Cancelled/replaced curve work cannot publish resources or readiness | Complete; owned outcomes/resources and re-entrant cleanup reviewed |
| 6 | SA-06 | Explicit acceptance/disposal ownership at texture handoff | Complete after SA-17/18; real producer/init/disposal path verifies receiver cleanup |
| 6a | SA-17 | Last-consumer ownership for shared Moon textures, including scene-held inputs | Complete; shared leases, real-consumer and cleanup-reentry regressions reviewed |
| 6b | SA-18 | Terminal/idempotent scene disposal, including accepted textures not adopted by a renderer | Complete; scene-owned cancellation and real-adapter readiness reviewed |
| 7 | SA-09 | Commit restart time before notifying playback consumers | Complete; real callback and synchronous browser event ordering verified |
| 8 | SA-10 | Mobile FoV work cannot write after desktop takes ownership | Complete; queued work and real viewport round-trip verified |
| 9 | SA-15 | Required comparison error with Retry, per user decision | Complete; strict loading/validation, cached primary reuse and browser Retry verified |
| 10 | SA-08 | Distinguish absent/error manifest state and permit explicit recovery | Complete; URL-owned caches, explicit Retry and browser recovery verified |
| 11 | SA-13, then SA-12 | Hidden panels surrender keyboard ownership; Reset View clears tool selection | Both complete; keyboard, pending-tool and real Reset View regressions verified |
| 11a | SA-21 | Owned workspace initialization, disposal and focus routing | Complete; deterministic late-host startup, registry Focus and owner cleanup verified |
| 12 | SA-11 | Persist explicit constrained-layout edits without saving automatic collapse | Complete; explicit sash/tab provenance and real compact reload/expand verified |
| 13 | SA-14 | Detached controls use their owning window geometry/lifecycle | Complete; real 480px popout and adoption back to opener verified |
| 14 | SA-20 | Panel snapshots do not expose writable registry data | Complete; nested input/read/subscriber isolation verified |
| 15 | SA-16/19/22 | Reproduce/disposition scene mirrors, dormant caches and viewport capability contracts | SA-16/19 complete; SA-22 pending |

The inventory contains 16 confirmed module/browser defects or approved behavior
gaps, plus six risk areas. It does not certify an exhaustive absence of other
state defects. Keep new findings in the same audit/plan rather than creating
another roadmap. Any new product choice needed by a risk must be resolved
before implementing it. The broader architecture list below remains context,
not a competing priority queue.

On 2026-09-16 the user explicitly authorized fixing all items with TDD and
code review before closing each item. For every slice: record a failing
behavioral regression, implement the smallest fix, independently review it,
reproduce/fix review findings, rerun focused and proportional broader checks,
then close, commit and push. Risk items first require a reproduction or an
explicitly justified no-change disposition. Record outcomes in the
[remediation log](../../evidence/reviews/runtime-state-remediation-2026-09-16.md).
Do not stop at a plan or close an item solely because a first test run passes.

### Broader architectural context

The user requested a new transition/lifecycle audit alongside test-harness
modernization on 2026-09-15. See the
[paired plan](runtime-transition-audit-and-tests.md) and
[current evidence](../../evidence/reviews/runtime-transition-audit-2026-09-15.md).
Its concrete stale-completion, camera-order, failure/retry and landing-readiness
findings take precedence over generic structural cleanup in this workstream.
The queue below remains the broader architectural context, not a claim that
those defects are fixed.

1. Remove the domain-to-app dependency from
   `core/domain/active-event-ui-state.js` to `app/burn-event-metadata.js` by
   moving reusable burn metadata policy inward or reclassifying the caller.
2. Extract direct DOM, D3, renderer, and browser effects from application
   services, beginning with settings, initialization, and media coordination.
3. Reduce `mission.js` ownership and repeated composition-context remapping
   without adding another wrapper-only layer.
4. Update layer placement for the panel framework, comparison pipeline, lunar
   features, orbit milestones, and mobile composition as those seams evolve.
5. Add automated dependency-boundary enforcement for core-to-app imports and
   direct browser effects in application services.
6. Reassess legacy state mirrors and scene-scoped fallbacks when product work
   touches those state paths.
7. Run focused wiring/behavior tests and independent architecture review for
   each delivery slice.

## Preserved Slice Status

Seven planned refactor slices tracked the bulk of the work:

| Slice | Historical status | Summary |
| --- | --- | --- |
| 1. Split the state facade | essentially done | Narrow runtime stores exist; `mission-state-access.js` owns compatibility; `mission-state-cell-groups.js` owns the runtime compatibility buckets; `mission-state-store.js` is a thin wrapper. Open lever: shrink the compatibility contract when future features touch it. |
| 2. Separate settings intent from effects | in progress | View planning/application split landed. Settings changes still fan out through wider runtime wiring. |
| 3. Finish the frame pipeline split | close to done | `frame-plan.js`, transient event planning, `scene-frame-plan.js`, and the scene telemetry/phase/event UI split are in place. Final composition wrapper shape is the only remaining call. |
| 4. Make scene view state truly scene-scoped | close to done | Structure exists; transform reads are scene-first. Remaining work: isolate mirrored legacy compatibility paths. |
| 5. Collapse redundant composition layers | essentially done | Runtime wiring, root assembly, playback bootstrap, scene composition, legacy binding maps, state-access builders, and root-context shaping are thinner. Remaining broad surfaces are intentional compatibility bridges. |
| 6. Split data loading from data normalization | close to done | Pure config/source helpers, config assembly, and generic cached loader mechanics have explicit seams. Open question: whether further split in `mission-data.js` reduces real coupling or just adds indirection. |
| 7. Break up large shell modules | essentially done | `mission.js` is much smaller; the scene/UI shell is decomposed; `ui/event-handlers.js` now behaves like a composition seam. |

## Preserved Open Work

### Settings service surface

Historical sources:
`app/settings-actions.js`, `app/view-application-plan.js`, and
`app/scene-view-plan-application.js`.

Proposed outcome:

- keep view-setting interpretation in a settings service; and
- move remaining SVG, Three.js, sky, helper, and orbit synchronization into
  effect modules so settings become state-driven.

### Legacy global mirror cleanup

Historical source: `app/scene-view-state.js`.

Proposed outcome: move legacy zoom, pan, and plane fallback behind an explicit
compatibility adapter so scene-scoped state is the only source of truth.

### Scene UI composition tail

Historical source: `app/scene-ui-update-actions.js`.

Proposed outcome: decide whether the remaining composition wrapper stays as a
small seam or folds into `scene-frame-ui-actions.js`.

## Optional Follow-Ups

These matter only if coupling starts drifting again.

1. Keep shrinking the compatibility surface in
   `app/mission-state-access.js`, `app/mission-state-cell-groups.js`, and
   `mission.js` when product work naturally touches those seams.
2. Split `data/mission-data.js` further only if generic loader or policy
   coupling returns; keep cached-loader mechanics in dedicated helpers.
3. Keep `ui/event-handlers.js` and `app/runtime-ui-controls.js` as thin
   bind/composition seams rather than rebuilding broad controller hubs.

## Delivery Rule

Before a queue item starts:

1. compare the historical status with current code and tests;
2. identify the smallest independently useful outcome;
3. confirm the design still requires it;
4. define focused verification; and
5. independently review the implementation and resulting architecture map.
