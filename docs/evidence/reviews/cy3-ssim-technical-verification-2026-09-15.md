# CY3 SSIM And Technical Verification — 2026-09-15

Follow-up to `de34d71` (visual tokens and progressive workspace UX). The user
confirmed that SSIM is CY3-only and must be able to disable Dockview through
configuration. This is technical verification, not the deferred human UX review.

## Implemented Contract

- `ui.dockviewEnabled: false` in CY3's `config.ssim.json` selects legacy layout
  before the Dockview module is imported/mounted. A shared policy preserves
  normal desktop/mobile defaults and explicit URL overrides.
- SSIM uses a fixed 1280x720 viewport at device scale 1 and asserts CY3 plus
  legacy layout. Both images use the same scene crop below the header and
  above bottom controls. Baseline PNG writes require `UPDATE_SSIM_BASELINES=true`;
  `make baseline` no longer deletes the baseline directory contents.
- Artemis II mobile camera checks were extracted to a functional browser
  suite, preserving the closest-approach epoch and mounted-camera invariants.
  Chrome screenshots use pixel differences, not SSIM.
- Playback checks use the current transport state, events are made accessible,
  hidden mirrored guide inputs use the existing state helper, and completion
  uses the absolute mission-time bounds rather than a zoomed slider range.
- XY screenshot fixtures now reset manual camera mode before choosing the
  plane, rather than overwriting its up vector afterwards.

## Independent Review

The independent reviewer inspected the implementation and verified fixes in
the browser. Three medium-priority findings were fixed and cleared:

1. Native popover invokers now let keyboard focus enter compact Frame and Shoot
   controls, with Escape returning focus to the launcher.
2. The host is sized before saved-layout restoration and preserves the raw
   expanded snapshot through a constrained reload.
3. Rejected/corrupt persisted layouts do not seed the progressive controller;
   default layout recovery remains usable.

The reviewer also checked the CY3/layout guards, explicit baseline-write
policy, shared Dockview resolver, and extracted Artemis functional coverage.

## Verification

- Unit suite: **208 files passed; 1,496 passed, six skipped**.
- `npm run configs:lint`: passed all 40 JSON5 artifacts and time-scale checks.
- Full strict CY3 run: **39 passed, 15 failed** in 705 seconds, before the final
  hidden-input and XY fixture corrections. All four complete Earth/Moon,
  2D/3D playback runs reached the end and passed their image comparisons.
- Focused camera rerun passed both Earth and Moon 3D -> 2D -> 3D tests against
  unchanged baselines. Initial XY: Earth 0.9928, Moon 0.9801; restored 3D:
  Earth 0.9932, Moon 0.9801 (existing threshold 0.98).
- Chrome suite: three passed against unchanged baselines. Artemis mobile:
  one passed. Auxiliary suite: eight passed initially; divider/maximize check
  passed at both widths after waiting for the final default workspace and
  choosing a drag direction that respects the composer's minimum width.
- Progressive transitions, keyboard controls and reload coverage: three passed
  across focused runs. Reload asserts exact persisted geometry while
  constrained, then restored proportions at the actual host width (accounting
  for a disappearing scrollbar). Final combined focused rerun: three passed
  (reload plus both CY3 mode-switch tests), 54 unrelated tests skipped.
- `git diff --check` and local links in all nine edited Markdown files passed.

Ignored diagnostics: `.tmp/cy3-ssim-results.json`,
`.tmp/ui-verification-results.json`, `.tmp/final-focused-results.json`, and
`test/screenshots/current/`.
The latest SSIM file is overwritten by focused runs; use the full-run JSON
for its original failure list.

## Outstanding Scene Verification

The complete strict suite is **not green**. In addition to stale control/pose
fixtures addressed above, failures include Joy Ride, lunar plane/guide views,
descent and landing, relative views, and the committed score-history gate.
The original strict run reported 51 score-history regressions, including
images that individually met the absolute threshold. No threshold was relaxed,
no PNG baseline was replaced, and no committed score history was changed.

Historical checks show Landing and relative Moon-to-Earth PNGs date to
`d5a11fe` (April 16), and Joy Ride to `4c83a68` (April 17). Physical Moon
consolidation (`e7c20ac`, September 11) and camera/rendering changes postdate
them. These explain some drift but are not approval for all differences:
the landing capture's harsh close-up terrain and changed craft appearance
still need explicit disposition. Do not treat image age as acceptance.

There is also an unvalidated relative-view fixture: its reset calls
`setCameraParameters(true)` and then overwrites the configured look target with
`(0,0,0)`. Confirm the intended framing before treating relative-view failures
as rendering-only drift.

Next: isolate remaining fixture versus rendering changes, review each affected
scene, update only accepted baselines/history, and rerun the complete strict
CY3 suite. Roadmap priority 1 stays open. The human UX review remains deferred
until the other roadmap items are finished.
