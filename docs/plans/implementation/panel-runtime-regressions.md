---
doc_class: plan
status: current
scope: ui.panels.runtime-regressions
canonical_for:
  - panel-runtime-regression-remediation
---

# Panel Runtime Regressions

## Source Evidence

[Feature Specification Migration Review](../../evidence/reviews/documentation-migration-feature-specifications-2026-09-02.md)

Browser verification during specification review produced three failed
assertions in two panel-runtime areas. The documentation migration did not
change runtime code.

## Requirement Owners

- Default panel placement:
  [Panel System V1 - Default Layout Behavior](../../specs/ui/panel-system-v1.md#default-layout-behavior)
- Panel corner/edge resizing:
  [Panel System V1 - Shared Shell Requirements](../../specs/ui/panel-system-v1.md#shared-shell-requirements)

The current specification owns accepted behavior. This plan owns reproduction,
diagnosis, implementation sequencing, and closure only. Any new numeric geometry
or canvas hit-testing requirement must be accepted in the specification before
implementation.

## Reproduction Context

Test file: `test/auxiliary-panel-resize-interaction.test.js`

Route: `/artemis2/`

Focused command sequence:

```bash
node test/server-manager.js start
npx vitest run test/auxiliary-panel-resize-interaction.test.js --reporter=verbose
node test/server-manager.js stop
```

Viewports:

- auxiliary stack alignment: `1920x1080` and `1366x768`;
- normal and maximized Frame and Shoot resize cases: `1280x800`.

Failed test titles:

- `top-aligns the default right auxiliary stack without covering header controls`
- `resizes the Frame and Shoot panel through the real bottom-right corner while textures are deferred`
- `lets a maximized Frame and Shoot panel be resized from a corner`

## Regression 1: Auxiliary Stack Header Gap

Observed:

- default right auxiliary stack header gap: `45px`;
- browser-test expectation: at most `10px`.

First decision:

- reproduce from a clean, warmed server and default layout;
- confirm whether the current layout specification still requires the `10px`
  bound or whether the test encodes obsolete geometry; and
- update specification before implementation if the accepted product behavior
  changes.

## Regression 2: Frame And Shoot Resize-Grip Hit Target

Observed in normal and maximized states:

- pointer probing at the expected corner reaches the canvas;
- the resize grip is not the top hit target; and
- two browser assertions fail.

The Panel V1 shared-shell contract owns edge/corner resize behavior. Diagnosis
must determine why the canvas wins hit testing at the expected grip location in
normal and maximized states without weakening canvas interaction elsewhere.

## Delivery Sequence

1. Reproduce both failures from a clean, warmed local server.
2. Record viewport, route, panel layout state, geometry, and hit-test evidence.
3. Decide whether each failure is implementation drift, stale test expectation,
   or both.
4. Update the owning specification first if accepted behavior changes.
5. Implement the smallest panel-layout/hit-target correction.
6. Run focused unit and browser tests.
7. Run relevant Playwright and visual checks for normal and maximized layouts.
8. Have the correction independently reviewed and fix all findings.
9. Update the source evidence with the final revision and disposition.
10. Close the roadmap item only after both regressions are resolved.

## Exit Criteria

- Both failures reproduce deterministically or are rejected with documented
  evidence explaining the original result.
- The accepted auxiliary-stack geometry has a specification-backed assertion.
- The Frame and Shoot corner hit target reaches the resize grip in normal and
  maximized states.
- Canvas controls remain usable outside the grip hit area.
- Targeted browser tests pass on a warmed server.
- Relevant broader Playwright/visual checks pass or approved intentional visual
  changes are documented.
- Independent review reports no open high or medium finding.
