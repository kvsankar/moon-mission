# Mobile Experience Follow-Ups

## Purpose

Track unresolved intent and implementation gaps identified while reconciling
[Mobile Experience V1](../../specs/mobile-experience-v1-spec.md) with the
current runtime.

## Current Assessment

| Original outcome | Current state | Follow-up |
| --- | --- | --- |
| Four tabs: Mission, Orbit, Views, Compose | Runtime has Mission, Views, and feature-gated Compose; only Mission and Views are visible | Implement the required dedicated Orbit tab |
| Orbit card with 2D/3D, origin, axes, and `More` | Essential controls remain in the repositioned shared header strip | Implement the Orbit card and `More` drawer over shared state |
| Mission status, event countdown, compact timeline, transport | Metrics, active-event text, transport, and the global compact timeline are shipped; next-event countdown is absent | Decide and implement next-event countdown if retained |
| Three Views sub-cards with one active renderer | Three segmented presets operate one shared renderer | Treat the shared-renderer architecture as the current implementation |
| Earth Rise Composer dependent on worktree integration | Markup, state, controls, and tests are landed; feature gate is hard-disabled | Decide enablement and final naming relative to `Frame & Shoot` |
| Artemis II Flyby and Splashdown mobile panels | Desktop workflows are shipped but hidden at mobile widths | Preserve Flyby launch/composer semantics; implement Splashdown auto-open, left event sidebar, right map/globe, second/minute controls, RTC-3-through-return events, dual-unit metrics, and generated-descent provenance |
| `44px` touch targets | Several controls are `22px` to `34px` high | Remediate hit areas and add browser assertions |
| Mobile performance on mid-tier hardware | Off-screen auxiliary renderers are avoided; no representative device budget is recorded | Define and measure a practical performance budget |

## Preserved Rollout Slices

The original rollout sequence is retained here with its reconciled state:

1. **Shell and navigation**: shipped in an evolved three-card architecture.
2. **Mission and Orbit core**: Mission is substantially shipped; dedicated
   Orbit card and `More` drawer remain unimplemented.
3. **Views**: shipped through shared-camera presets rather than sub-renderers.
4. **Compose integration**: code and tests landed; user-facing enablement and
   naming remain pending.
5. **Polish and QA**: touch ergonomics, broader browser coverage, and measured
   performance remain pending.

## Delivery Queue

- [ ] Implement the required dedicated Orbit tab.
- [ ] Implement the mobile `More` drawer for secondary controls.
- [ ] Decide whether to add a next-event countdown to Mission.
- [ ] Decide the composition card name and enablement policy.
- [ ] Design and implement the required mobile Artemis II Flyby and Splashdown
  workflows without dropping their specified content.
- [ ] Bring all interactive hit areas to at least `44px`.
- [ ] Add browser coverage for navigation completeness, touch targets, overlay
  dismissal, and desktop-state restoration.
- [ ] Establish and measure a representative mobile performance budget.

## Verification

Current automated coverage includes tab normalization/synchronization, mission
card state, Views presets and FoV, Compose state and controls, layout
synchronization, transport synchronization, Moon visibility, and desktop-state
restoration. Browser coverage currently verifies only a narrow shared-camera
stability path during Mission/Views churn.

Do not mark this plan complete until every retained outcome is implemented and
independently reviewed, or explicitly rejected as a product decision.
