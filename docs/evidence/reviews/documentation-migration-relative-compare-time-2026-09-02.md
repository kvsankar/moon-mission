---
doc_class: evidence
status: current
scope: repository.documentation.migration.relative-compare-time
target_revision: working-tree-content-manifest
disposition: findings-closed-awaiting-commit
---

# Relative, Comparison, And Time Documentation Migration Review

Review date: 2026-09-02 (IST)

## Scope

This review covers the first authority-splitting migration unit under the
repository documentation lifecycle policy:

- Relative mode into specification, frame design, and data operation.
- Orbit comparison into specification, runtime design, and follow-up plan.
- Time synchronization into clock-authority specification, synchronization
  design, and decision plan.
- Compatibility pointers and ordinary inbound-link updates.

The immutable `docs/operations/current-status-roadmap.md` was excluded from all
edits.

## Review Process

1. Initial refactor completed from the three original documents at base HEAD
   `e5c242788868012d41e51f8c49a806ced0549bd5`.
2. One independent reviewer compared old and new content against runtime code
   and tests.
3. A second independent reviewer checked classification, pointers, inbound
   links, plan ownership, unrelated edits, and frozen-roadmap integrity.
4. All high and medium findings were corrected.
5. A third independent reviewer rechecked the corrected unit and reported no
   remaining high or medium findings and no material information loss.

No reviewer edited repository files.

## Findings And Dispositions

| Finding | Severity | Disposition |
| --- | --- | --- |
| Compare URL incorrectly exposed `origin`; runtime is always relative and sanitizes stale origin values | High | Fixed in comparison specification and example. |
| Earth/Moon/sky freezes and Earthshine disable were described as unconditional despite config overrides | High | Fixed as default display-profile behavior with supported overrides. |
| Out-of-range media behavior was promoted from an open question to settled design | Medium | Removed from design and added to time decision plan. |
| Clock specification duplicated detailed media/transcript/seek authority | Medium | Narrowed to time-domain definitions and mission-clock precedence; delegated detailed behavior to timeline/media spec. |
| Conceptual `tau = 0` did not describe stored display-clock time | Medium | Spec and design now distinguish conceptual anchor-relative `tau`, primary display timestamp, source offset mapping, and range-relative UI labels. |
| Relative-mode performance rationale and explicit selector entry points were lost | Low | Restored. |
| Compare landing-launcher/direct-entry provenance was lost | Low | Restored. |
| `docs/README.md` routed planning and architecture readers to the clock spec | Medium | Planning now routes to the decision plan; architecture routes to the design. |
| Relative/comparison pointer decisions did not match the inventory | Medium | Relative pointer removed; comparison pointer retained for previously published external continuity and recorded in inventory. |
| `doc_class: compatibility` was not declared by policy | Medium | Added as the sole permitted metadata class outside the target taxonomy. |
| Historical dryscope evidence still names the old timekeeping path | Low | Intentionally deferred to that evidence document's own migration unit; it is plain historical text, not a broken link. |
| README link edit changed punctuation unnecessarily | Low | Original punctuation restored. |
| Migration shares a dirty worktree with unrelated feature work | Low | Commit must use an explicit documentation path list; broad staging is prohibited. |

## Verification

- Independent link check: 120 local Markdown targets checked, none broken.
- Compare deferred plan: all nine original deferred outcomes retained.
- Time decision plan: all four original questions retained, plus the existing
  unresolved timeline-range/out-of-range-media decision kept explicitly open.
- Relative source: no unresolved delivery item was lost.
- Focused runtime tests: 6 files, 29 tests passed.
- `git diff --check`: passed.
- Frozen roadmap content hash remained
  `f6079ee27e7db5dd036471ea490e04cb22d4f077`.
- Final independent re-review: no remaining high/medium finding and no material
  information loss.

## Reviewed Content Manifest

| Path | Git blob hash |
| --- | --- |
| `docs/specs/modes/relative-mode.md` | `25a9cbe1f36e8fae1d7439819cfea143872300ca` |
| `docs/designs/frames/relative-mode.md` | `7d7ec734584d1055a72b9392e8f9ee1a3cebef90` |
| `docs/operations/data/relative-mode-generation.md` | `3eca405cfe9bbad97d6484012618de6af61e88d4` |
| `docs/specs/modes/orbit-comparison.md` | `53fd87d2e828e97ef14f7c60893a01d796bd12db` |
| `docs/designs/modes/orbit-comparison.md` | `7477fe19538fe3e062c3a575d10f0378e04decd9` |
| `docs/plans/breakdown/orbit-comparison.md` | `d60ee368921b464b1d4aa3297b0fa4a6db306218` |
| `docs/design/architecture/orbit-comparison-mode.md` | `e523fb8bd39455be90dcddbca34a964b59f8a53d` |
| `docs/specs/time/clock-authority.md` | `da803a1ef807277c7803294f77d7b5913f6d9f4e` |
| `docs/designs/time/synchronization.md` | `290e362f5cf92ecf79a58b902e91c28ae98f1713` |
| `docs/plans/breakdown/time-synchronization.md` | `2913b8326650ba00e8692056d06efc4a8e56b873` |
| `docs/design/architecture/time-synchronization-and-timekeeping.md` | `ecfce52fe4b06796b21a6432b9544d0b65c7c89c` |

`docs/design/architecture/relative-mode.md` is intentionally deleted. Ordinary
inbound links now target canonical documents directly.

## Closure Boundary

The content review is closed. This evidence remains active until the migration
is committed with an explicit path list and the committed revision is recorded
as `target_revision`; it can then move through the evidence archival lifecycle.
