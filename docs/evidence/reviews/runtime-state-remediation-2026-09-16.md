# Runtime State Remediation — 2026-09-16

The [audit](runtime-state-audit-2026-09-16.md) identifies the findings; the
[scoped plan](../../plans/implementation/runtime-architecture-followups.md)
tracks delivery under the single roadmap. This log records red tests, minimal
fixes, review corrections and verification for each subsequently closed item.
The user explicitly requires TDD and review/fixes before closing each item.
SA-01 evidence is in the original audit. No deployment is authorized.

## SA-02 — Foreground Playback Session Ownership

Status: complete after independent review and correction of both findings.

Red: ten of the first twelve `media-playback-session.test.js` cases failed
against the original code. They cover retired audio A-B/A-B-A events, same-ID
restart settlement and Pause followed by a late playing event. A further native
video boundary test failed when retired item A replaced focused B.

Implementation: playback sessions capture element/item/kind identity; each
play request has its own token. Only the current owner may change pending,
selection, clock or playback state. Retired audio listeners are removed and
queued copies still check ownership. Pausing suspends transport without
discarding selection. Current native video can explicitly adopt a session;
frame-scrub resume retains its existing path. Panel events carry element identity
and validate the current focused source and transport state.

Independent review found two additional races before closure:

1. Animation Pause before `playing` failed to invalidate pending/buffering work.
2. Queued video buffering/readiness/time events could affect suspended playback.

Both were reproduced with new failing tests, then fixed. Final focused review
reported no remaining actionable findings; all 90 tests across the three media
suites pass. Final full suite: **1,660 passed, six skipped, 221 files**.
Browser foreground playback: **one passed** (simulated media transport, not
real decoding/HLS validation). No thresholds, production data or baselines changed.

Fixture corrections preserve behavior assertions: the buffering unit fixture
now exposes its actual current video and a coherent playing clock. The browser
fixture's synthetic play/pause/end events now update paused/ended properties.
Its old “2 videos” count included a background-role stream, contrary to the
already-existing foreground exclusion contract; the check now requires the
single foreground video. The card locator uses the existing stable media ID
instead of obsolete title text (cards now display mission elapsed time), and
the selection uses a visible Playwright click. No production filter policy
was changed. Foreground playback/browser interaction: one test passes.
