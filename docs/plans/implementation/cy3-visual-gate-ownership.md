# CY3 Visual Gate Ownership

Status: visual gate split complete (2026-09-23)

## Problem and boundary

`test/ui.test.js` is 4,284 lines. The CY3 SSIM disposition retained nine
visual checks; the historical replaced/retired cases remain in the file only
as skipped test bodies. Those cases have named semantic replacement evidence
in `test/support/cy3-ssim-disposition.js` and the roadmap. Remove the skipped
legacy test bodies and their now-dead helpers, while preserving all nine
retained baselines, suite ordering and setup/cleanup behavior. Place the
remaining screenshot/profile helpers in focused support modules if needed,
leaving the browser test file as an executable visual-gate specification.

## Size commitment

| Original | Before | Maximum largest piece (70%) | Expected largest piece |
| --- | ---: | ---: | ---: |
| `ui.test.js` | 4,284 | 2,998 | Under 1,000 |

## Verification

- Confirm precisely nine active visual cases remain and no retained case or
  baseline is removed. Do not regenerate baselines.
- Run the focused browser visual gate on the real `/chandrayaan3/` route,
  full unit gate, source-structure check, and static build.
- Keep reviewed CY3 replacement/retirement evidence intact.

## Result

| Resulting file | Physical lines |
| --- | ---: |
| `ui.test.js` | 804 |
| `support/cy3-visual-config.js` | 104 |
| `support/cy3-visual-screenshots.js` | 289 |
| `support/cy3-visual-controls.js` | 428 |
| `support/cy3-visual-profile.js` | 297 |

The largest piece is 804 lines, 81.2% smaller than the original and below
both the 1,000-line cap and committed 2,998-line maximum. Removed the
historical skipped test bodies whose behavior is covered by the reviewed
CY3 SSIM disposition; these deletions are recoverable from Git history.
The nine retained visual cases, baselines, ordering and suite hooks remain.
Screenshot scoring, configuration, browser controls and profile preparation
now have separate support owners. `vitest list` reports exactly nine cases.
The full nine-case browser gate passed on the second complete run at unchanged
thresholds. The first complete run passed eight cases but captured a transient
wrong relative-frame image (0.845 SSIM); the relative case passed alone and
in a five-case Earth/Moon/relative sequence (0.999 SSIM). This intermittent
readiness/state issue is not considered closed by the structural refactor.
