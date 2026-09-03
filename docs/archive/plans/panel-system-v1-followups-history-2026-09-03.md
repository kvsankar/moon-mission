# Panel System V1 Implementation Plan

> Status: the panel-foundation work is partially landed. This plan now separates shipped work from the next panel milestones.

## Landed Foundation

The following pieces are now in the codebase:

1. Shared panel registry, launcher wiring, info popover, and mission-scoped layout persistence.
2. A header `Panels` launcher in place of the earlier floating `Panel Manager` concept.
3. Auxiliary view panels and workflow panels registered into the same lifecycle model.
4. Shared shell vocabulary across auxiliary panels and `Splashdown in Spotlight`.
5. Mission-config-driven default built-in panel state via `ui.panels.defaults`.
6. Workflow panels using panel-specific default geometry, including maximized focus workflows and compact resizable workflows.
7. Default auxiliary panel placement aligned on the right side of the viewport without overlap.
8. Shared nonlinear `Zoom` / FoV control semantics across the main semantic view and panel views.
9. Config-gated workflow panels can stay dormant until enabled, as used by Artemis II `Mission Media`.

## Current Gaps

These are still outstanding:

- `Create View`
- user-created view panels
- panel rename support
- immutable `viewSignature` surfaced through shared panel info
- moving built-in panel definitions themselves into mission config, rather than only their default state
- broader regression coverage for panel-specific layout edge cases

Additional deferred targets preserved from the V1 specification:

- a standalone manager panel
- named layouts per mission
- mobile panel UX

## Recommended Next Sequence

1. Define an explicit `viewSignature` model for built-in and future user-created view panels.
2. Add a `Create View` flow seeded from the current main semantic view.
3. Separate panel identity state from mutable per-panel presentation state.
4. Add rename support and extend shared info payloads to show immutable view identity.
5. Decide whether built-in panel definitions should move fully into mission config after the identity model is in place.

## Migration Notes

- `panel-manager.js` is now effectively a launcher/menu controller, despite the legacy filename.
- Auxiliary panels and workflow panels still own some content-specific rendering logic, but their shell lifecycle is aligned.
- Mission defaults currently cover built-in panel availability and default state, not yet arbitrary user-defined panel instances.
- `Mission Media` is a workflow panel, but its manifest loading and timeline marker coordination are intentionally owned outside the shared panel shell.

## Verification Approach

- Use `make test` when a full UI + SSIM baseline is needed.
- For targeted panel changes, rerun `npm run test:unit` plus browser smoke checks on representative mission URLs such as `mission.html?mission=artemis2`.
- Rebaseline screenshots only when visual changes are intentional and reviewed.
