# Source Structure And Runtime Architecture Review — 2026-09-23

## Scope and evidence

Reviewed authored JavaScript under `src/`, mission `assets/*/js/`, `scripts/`
and `test/`; the auxiliary-camera refactor; the runtime architecture design and
boundary specification; the local hook and CI workflow; and the focused/unit and
browser verification from the refactor. This is a structural review, not a
claim that every runtime effect or state transition has been audited.

The auxiliary-camera implementation now spans 29 `auxiliary-camera-*.js` files.
All are below 1,000 physical lines; the largest is
`auxiliary-camera-shared.js` at 977. The public entry module is 164 lines.
Against the original 11,392-line file, the largest resulting piece is 91.4%
smaller. That measures the full campaign; the final small extractions that
merely brought individual intermediate files below 1,000 lines would not, by
themselves, satisfy the new 30% structural-refactor rule. STR-01/02 remain open
because a size reduction does not prove narrow ownership.
The refactor's focused suite passed 262 tests, the full unit suite passed 3,820
tests with six skipped, and the ten auxiliary-panel browser interaction tests
passed after the module export correction. The production build passed, but it
did not detect that duplicate export; the real mission route did.

The source inventory found 17 production modules and nine test files above
1,000 lines. The largest active application modules are
`index-landing.js` (3,782), `media-browser-panel.js` (3,696), and
`media-timeline-coordination.js` (3,618). Two rendering files are large static
catalogs (`star-catalog-hipparcos.js` at 5,068 and
`star-name-cross-index.js` at 2,923); line count alone is not a reason to
split those tables. The other oversized files and their exact current caps are
listed in `scripts/source-structure-baseline.json`.

## Findings and disposition

| ID | Finding | Why it matters | Disposition |
| --- | --- | --- | --- |
| STR-01 | The auxiliary-camera entry composes nine method objects onto one manager prototype with `Object.assign`. | Files are smaller, but method ownership, initialization order, and cross-method contracts remain implicit. | Track a bounded owner/lifecycle redesign in the runtime architecture plan. Preserve the public manager API while replacing one mixin group at a time with a named component. |
| STR-02 | `auxiliary-camera-shared.js` is a 977-line import/re-export hub and the companion dependency module passes broad bundles into extracted functions. Across this family, static references include hundreds of distinct `panelState.*` and `this.*` names. | Most modules still share the same mutable manager and panel state. A change can cross several files without an explicit interface. | Group dependencies by panel lifecycle, composer controls, rendering, and timeline. Define the small state/effect ports before removing wrappers or moving code again. |
| STR-03 | Several actively edited runtime modules remain far above the cap; large test files also contain multiple concerns. | Reviews and focused tests are harder when unrelated behavior changes in one file. | Ratchet existing sizes immediately. Prioritize active modules using change frequency, ownership boundaries, and uncovered behavior; treat static catalog tables separately. |
| STR-04 | `core/domain/active-event-ui-state.js` imports `app/burn-event-metadata.js`. | This is the known inward dependency violation in the current static import inventory. | Keep one exact temporary exception in the guard and remove it when burn metadata policy moves inward. Existing architecture plan item 1 owns the fix. |
| STR-05 | `npm run build` completed while the runtime auxiliary-camera shared module contained a duplicate ES export. The Artemis II page then remained in loading state. | The build does not validate every runtime-served module in this app's current script arrangement. | Parse every authored JS module in the pre-commit/CI structure check. Keep a real mission-route smoke check for structural runtime changes, and investigate build coverage in the startup-diagnostics workstream. |
| STR-06 | Auxiliary-camera modules under `app/` directly construct DOM, bind listeners and mutate Three.js render state. | These are shell effects under the target architecture, although their current file placement is `app/`. | Move effects behind named shell owners as STR-01/02 progress; do not infer conformance from a smaller file or a directory name. |

Static relative-import inspection found no cycles in the 373 current
`src/platform/js` modules (673 resolved edges), including the auxiliary-camera
family. The repository-wide structure check now rejects newly introduced
cycles. The import check covers ES import/export declarations and literal
dynamic imports; it does not prove functional-core purity or detect effects
hidden behind callbacks and browser globals.

## Guardrail decision

`scripts/check-source-structure.mjs` enforces a 1,000-line cap on new authored
JavaScript, ceilings on the 26 existing oversized files, module syntax, and
the core-to-effect dependency rule. Its repository-wide mode also checks for
import cycles. The pre-commit hook checks staged blobs, so an unstaged edit
cannot silently satisfy a staged check. CI runs the full mode because local
hooks are optional.

The size cap is not a refactor completion target. A planned structural
refactor must identify a new ownership boundary and reduce its largest
resulting piece by at least 30% of the original physical lines. A changed
oversized baseline requires a completed-refactor record naming the plan and
all resulting files; the guard checks its arithmetic. Routine small edits may
shrink an oversized file without claiming that the structural work is done.
The [plan template](../../plans/templates/structural-refactor.md) and PR
template require reviewers to assess ownership, behavior, and completeness;
no static check can infer whether a split is architecturally meaningful.

This guard prevents growth and new structural regressions. It does not certify
that the present split has narrow ownership; STR-01 and STR-02 remain open.
