# Structural Refactor Plan Template

Copy this template into a scoped implementation plan before moving code.
The file-size threshold is a review guard, not the reason to refactor.

## Problem and boundary

- What responsibility is mixed, duplicated, or owned by the wrong layer?
- Which changes currently require editing unrelated behavior together?
- What state, effects, lifecycle, and dependency directions will the new owners have?

## Proposed structure

List each resulting owner, its public interface, and the dependencies it may
use. Explain how callers migrate and which compatibility adapter remains, if
any. Avoid moving a large method behind a thin forwarding wrapper and calling
that an ownership change.

## Size commitment

Count physical source lines before editing. Include every resulting piece of
the original responsibility, even when it is placed in a newly named file.

| Original file | Before lines | Maximum allowed largest piece (floor of 70%) | Resulting files and expected lines |
| --- | ---: | ---: | --- |
| `path/to/file.js` | 1,100 | 770 | `owner-a.js` (estimate), `owner-b.js` (estimate) |

The final review records actual counts and confirms that the **largest**
resulting piece is at most 70% of the original. A 1,100-line file split into
990 and 110 lines does not pass; a split into two 550-line pieces does. Larger
reductions are welcome. If the design cannot support the minimum reduction,
defer the split and document a smaller, independently useful change without
claiming the structural refactor is complete.

## Verification and completion

- Name focused behavior tests and any required real-route browser check.
- State how disposal, persistence, and error behavior remain owned and tested.
- Record before/after dependency direction and any new import cycles.
- If an oversized baseline cap changes, add a `completedRefactors` record to
  `scripts/source-structure-baseline.json` with this plan path and every
  resulting source file. The structure guard checks the 30% arithmetic.
- Record remaining debt in the owning scoped plan and repository roadmap.
