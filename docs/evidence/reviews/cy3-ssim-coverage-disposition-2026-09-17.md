# CY3 SSIM Coverage Disposition

Date: 2026-09-17

## Outcome

All 86 tracked CY3 scene baselines now have an explicit, executable
disposition in `test/support/cy3-ssim-disposition.js`:

| Disposition | Count | Meaning |
| --- | ---: | --- |
| Retain | 9 | Pixel comparison still protects a distinct rendering concern. |
| Replace | 76 | Named semantic tests own the behavior represented by the old screenshot. |
| Retire | 1 | Exact duplicate of another retained checkpoint. |

`test/ssim-coverage-disposition.test.js` compares that registry to the files in
`test/screenshots/baseline/`. It fails on omissions, duplicates, unknown
replacement evidence or growth beyond the reviewed 5–15 image visual set.

Only the nine retained entries remain in `test/screenshots/baseline/`. The
default workflow registers only the nine owning test cases and passes each
image directly against its threshold. The historical prior-score comparison
and `ssim-history.json` are removed; `ssim-latest.json` remains ignored,
diagnostic output.

## Retained Visual Set

The reviewed small set keeps:

- one Earth 3D, Moon 3D and relative 3D overview;
- one Earth 2D and Moon 2D frame;
- four terminal mission frames, pending a smaller deterministic endpoint
  fixture.

These are image questions: semantic assertions cannot detect incorrect
lighting, texture, line geometry or framing.

The first retained-set run rejected three proposed visual families:

- all three Moon relief captures were black or showed only an orbit line, so
  they did not observe relief;
- the lunar-location frame primarily measured the intentional physical-terrain
  renderer change while its tiny markers already have semantic visibility
  coverage; and
- the landing frame showed severe current close-up displaced-terrain/framing
  artifacts. It was not rebaselined. The visual issue is now a named rendering
  follow-up while landing geometry/readiness remains semantically covered.

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
5. A guard expecting only retained PNGs failed against 86 legacy files; 72
   reviewed replacements and the score-history file were removed.
6. The first 14-frame candidate run failed on ineffective relief captures,
   stale renderer pixels and the landing artifact. Five more frames were
   reclassified with executable semantic evidence rather than rebaselined.
7. The final focused run passed all nine direct thresholds: five overview/2D
   frames at SSIM 0.9922–0.9990 and four terminal frames at 0.9958–0.9992.

## Remaining Work

- Review whether four expensive full-run screenshots can be reduced after a
  deterministic terminal-state fixture proves playback completion separately
  from final pixels.
- Prune skipped legacy test bodies from `test/ui.test.js`; they no longer run
  in the visual workflow and their behavior is mapped to semantic suites.
- Diagnose the landing close-up terrain/framing issue without lowering a
  threshold or restoring its obsolete baseline.

No deployment was performed.
