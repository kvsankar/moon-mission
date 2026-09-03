# Panel Progressive Disclosure Plan

Specification:
[Panel Progressive Disclosure](../../specs/ui/panel-progressive-disclosure.md)

## Preserved Work Tracker

Status values in the source tracker:

- `Done`: completed and verified.
- `Next`: the next implementation slice.
- `Pending`: planned but not started.
- `Deferred`: intentionally out of the current slice.

| Historical status | Item | Notes |
| --- | --- | --- |
| Done | Analyze current Mission Media thumbnail behavior | Existing resize, placement, collapse, and horizontal compact/minimal behavior were documented in the specification. |
| Done | Implement derived thumbnail disclosure levels | Added resolver/helper in `media-browser-panel.js` and level classes in `mission-panels.css`. |
| Done | Add unit coverage for horizontal levels | Extended `test/media-browser-panel.test.js`. |
| Done | Add unit coverage for vertical levels | Ensures left/right placement is no longer exempt. |
| Done | Verify targeted Mission Media unit tests | Source tracker reports `npm run test:unit -- test/media-browser-panel.test.js` passed. |
| Done | Add/adjust Playwright resize coverage | Added real Artemis II geometry coverage in `test/auxiliary-panel-resize-interaction.test.js`. |
| Done | Tune thresholds against Artemis II media | Source tracker reports verification against `/artemis2/?legacyPanels=1`. |
| Done | Replace clipped thumbnail dates with MET | Cards expose compact/full MET labels and keep absolute times in details. |
| Done | Add structured thumbnail details popup | Hover/focus shows timing and available media details. |
| Done | Remove thumbnail title/file-name display | Thumbnail text uses MET; title/source remain in popup and accessible label. |
| Done | Replace visible LLM terminology with AI | App-facing generated-metadata terminology uses AI. |
| Done | Keep thumbnail popup clear of its anchor | Placement tries non-overlapping positions before least-overlap clamping. |
| Done | Preserve transport-control clearance | Docked and floating bounds account for transport plus timeline dock. |
| Done | Mark Mission Media thumbnail strip complete | Source tracker reports unit and targeted browser coverage. |
| Deferred | Apply disclosure model to other panels | Select and specify panels individually. |

## Historical Deferred Idea

For each selected panel, prepare a specification change covering:

- current behavior
- target disclosure levels
- content priority
- interaction requirements
- acceptance criteria
- regression coverage

If this work is revived, create a new panel-specific plan rather than adding a
delivery slice to this archived plan.
