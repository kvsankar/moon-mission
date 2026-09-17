# CY3 SSIM Coverage Disposition

Date: 2026-09-17

## Outcome

All 86 tracked CY3 scene baselines now have an explicit, executable
disposition in `test/support/cy3-ssim-disposition.js`:

| Disposition | Count | Meaning |
| --- | ---: | --- |
| Retain | 14 | Pixel comparison still protects a distinct rendering concern. |
| Replace | 71 | Named semantic tests own the behavior represented by the old screenshot. |
| Retire | 1 | Exact duplicate of another retained checkpoint. |

`test/ssim-coverage-disposition.test.js` compares that registry to the files in
`test/screenshots/baseline/`. It fails on omissions, duplicates, unknown
replacement evidence or growth beyond the reviewed 5–15 image visual set.

This slice does not delete a baseline or change the default SSIM gate. The
existing suite remains intact until the harness is split according to this
inventory and the retained captures are reviewed as one coherent set.

## Retained Visual Set

The proposed small set keeps:

- one Earth 3D, Moon 3D and relative 3D overview;
- one Earth 2D and Moon 2D frame;
- three Moon relief/profile frames;
- four terminal mission frames, pending a smaller deterministic endpoint
  fixture; and
- enabled landing and lunar-location overlays because they add unique scene
  geometry.

These are image questions: semantic assertions cannot detect incorrect
lighting, texture, relief, line geometry or framing.

## Replaced Behavioral Families

The registry links every replaced group to existing executable evidence:

- origin/dimension and warm/cold scene transitions;
- plane selection and stale-completion ownership;
- poles, axes, reference-plane and SOI visibility;
- primary/descent orbit visibility and late geometry installation;
- joyride and mounted-camera semantics;
- location disable behavior; and
- repeated-sequence state stability.

The audit found one integration gap in the plane family. Unit tests covered
the plane controller, scene state and stale asynchronous completions, but the
normal Dockview browser suite did not drive all visible plane controls.
`test/runtime-transition-interaction.test.js` now exercises all seven plane
presets in Earth 3D plus signed Earth 2D and Moon 2D changes. It verifies:

- progressive View disclosure is used when the plane strip is hidden;
- the scene-owned plane selection and hidden compatibility control agree;
- plane variables are finite;
- the active render surface is valid; and
- plane changes do not advance mission time.

## TDD Evidence

1. The inventory test initially failed because the disposition registry did
   not exist.
2. The completed 86-baseline registry made all three inventory assertions
   pass.
3. The new browser test initially failed by attempting to click a progressively
   hidden plane button.
4. Routing interaction through the visible View disclosure made the browser
   regression pass without bypassing the responsive UX contract.

## Remaining Migration Work

- Split the monolithic legacy suite so the 14 retained frames are the visual
  gate and behavioral families run as semantic tests.
- Replace the historical “score must never decrease” comparison with direct
  reviewed-baseline thresholds; SSIM is similarity, not a quality score.
- Review whether four expensive full-run screenshots can be reduced after a
  deterministic terminal-state fixture proves playback completion separately
  from final pixels.
- Run and review the retained set before deleting obsolete PNGs and committed
  score-history entries.

No deployment was performed.
