---
doc_class: evidence
status: current
scope: repository.documentation.migration.feature-specifications
target_revision: working-tree
base_head: e5c242788868012d41e51f8c49a806ced0549bd5
disposition: documentation-closed-runtime-findings-promoted
promoted_to: docs/plans/implementation/panel-runtime-regressions.md
---

# Feature Specification Migration Review

Review date: 2026-09-02 (IST)

## Scope

This unit migrated six stable documents from `docs/design/specs/` into the
domain-based `docs/specs/` tree:

- camera state transitions;
- Frame and Shoot lighting/exposure;
- lunar feature controls;
- panel progressive disclosure;
- Panel System V1; and
- timeline/media playback.

The unit extracted delivery content into implementation plans, retained
routing-only pointers for frozen-roadmap continuity, and updated ordinary
inbound links. The actively modified orbit-milestones specification was
explicitly excluded.

## Review Process

1. Initial migration preserved all source bodies and extracted implementation
   or deferred material from mixed specifications.
2. Independent content/runtime and structural/link reviews were performed.
3. Verified findings were corrected.
4. Focused unit suites were run.
5. An exhaustive closure review compared all six specs with runtime/tests and
   evaluated the scoped link/metadata graph.
6. Two remaining contract findings were corrected.
7. A final documentation-only independent re-review passed with no findings.

No reviewer edited repository files.

## Documentation Findings And Fixes

| Finding | Severity | Disposition |
| --- | --- | --- |
| Camera target did not match the shipped two-axis position/look model | High | Camera document changed to `review-required`, ownership removed, and a current reconciliation plan added. |
| Frame and Shoot documented `+6 EV` while runtime/tests use `+5 EV` | High | Corrected to `+5 EV`. |
| Progressive disclosure described shipped vertical/live-geometry behavior as an open gap | Medium | Rewritten as current behavior. |
| Progressive levels contradicted title/detail visibility | Medium | Full/compact now consistently show MET; title/source/camera details remain in structured popup. |
| Panel V1 specified a retired header `Panels` launcher | High | Corrected to the embedded Advanced-settings `Panels` management fieldset. |
| Frame and Shoot suppressed Earth-occluder auto exposure contrary to runtime/tests | Medium | Corrected to visible active Earth-or-Moon occluder eligibility. |

## Extracted Delivery Material

- Frame and Shoot implementation sequence:
  `docs/plans/implementation/frame-and-shoot-lighting.md`
- Progressive-disclosure tracker and future intake:
  `docs/plans/implementation/panel-progressive-disclosure.md`
- Camera model reconciliation:
  `docs/plans/implementation/camera-state-transition-reconciliation.md`
- Panel V1 deferred targets:
  `docs/plans/implementation/panel-system-v1-followups.md`

The extracted plans preserve historical status as review-required unless they
were created specifically to reconcile a verified authority gap.

## Verification

- Final documentation-only re-review: PASS; no high, medium, or low findings.
- Scoped local link review: 230 links checked, 0 broken.
- Metadata scan: 54 metadata-bearing docs, no missing class/status in scope.
- Ownership scan: 23 `canonical_for` scopes, 0 duplicates.
- Six compatibility pointers and targets validated as routing-only.
- Frozen roadmap links: 38 checked, 0 broken.
- Focused local unit run: 11 files, 243 tests passed.
- Reviewer pure-unit run: 5 files, 113 tests passed.
- `git diff --check`: passed.
- Frozen roadmap hash:
  `f6079ee27e7db5dd036471ea490e04cb22d4f077`.
- Orbit-milestone spec remained at pre-existing hash
  `3037c6c7f4f5109e0f3e646afb81f8bb4f9bb85d` and diff `+16/-4`.

## External Runtime Findings

Browser verification exposed existing runtime failures not caused by this
documentation-only migration:

1. Default right auxiliary stack header gap measured `45px` where coverage
   expected at most `10px`.
2. Frame and Shoot resize-grip hit testing reached the canvas instead of the
   corner grip in normal and maximized states (two assertions).

Browser result: 5 of 8 tests passed; 3 failed across the two categories above.
These findings remain evidence pending reproduction and remediation. No runtime
code was changed in this migration.

### Reproduction Record

Test file:
`test/auxiliary-panel-resize-interaction.test.js`

Focused command sequence:

```bash
node test/server-manager.js start
npx vitest run test/auxiliary-panel-resize-interaction.test.js --reporter=verbose
node test/server-manager.js stop
```

Route and viewports:

- `/artemis2/` at `1920x1080` and `1366x768` for default stack alignment;
- `/artemis2/` at `1280x800` for normal and maximized Frame and Shoot resize.

Failed test titles:

- `top-aligns the default right auxiliary stack without covering header controls`
- `resizes the Frame and Shoot panel through the real bottom-right corner while textures are deferred`
- `lets a maximized Frame and Shoot panel be resized from a corner`

Relevant working-tree content hashes:

| Path | Git blob hash |
| --- | --- |
| `test/auxiliary-panel-resize-interaction.test.js` | `5d4ce36dcd800c332fbee8e2b23035cd32505e73` |
| `src/platform/js/app/auxiliary-camera-views.js` | `ce69a3c98acebb9274f7755ddae484df1502eedd` |
| `src/platform/js/app/panel-manager.js` | `b7608b7fad5656e285b00c59dd44964a0015a850` |
| `src/platform/css/mission-panels.css` | `8afa0b8cd55684409cf8b9159a8e235ad63c48a2` |

The findings were accepted for remediation and promoted to
[Panel Runtime Regressions](../../plans/implementation/panel-runtime-regressions.md).

The full repository test suite, full Playwright suite, and visual baseline suite
were not run. The reviewer-created Vite server on port 8111 was verified and
stopped after review.

## Closure Boundary

The documentation migration is closed. This evidence remains active because:

- the migration is not committed yet; and
- the promoted runtime findings remain open in their implementation plan.

After an isolated commit, record its revision here. Move this review through the
archive lifecycle only after the promoted runtime findings are closed or linked
to a successor evidence record with an explicit disposition.
