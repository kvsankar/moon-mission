# Documentation Guide

This directory is organized by each document's primary purpose. Mixed
documents live in the category that best represents their main use.

## How To Use This Set

Use the docs in this order when you are getting oriented:

- Start with [operations/contributor/developer.md](operations/contributor/developer.md) for day-to-day repo workflow, commands, and contribution expectations.
- Use [specs/data/repository-boundary.md](specs/data/repository-boundary.md) for
  authoritative app/data ownership rules,
  [operations/data/repo-sync-playbook.md](operations/data/repo-sync-playbook.md)
  for the sync procedure, and
  [evidence/baselines/mission-data-state-2026-05-15.md](evidence/baselines/mission-data-state-2026-05-15.md)
  only for the dated extraction record.
- Use [designs/README.md](designs/README.md) for runtime architecture, product-surface structure, and deeper design notes.
- Use [designs/runtime/target-architecture.md](designs/runtime/target-architecture.md) for the runtime target and [plans/implementation/runtime-architecture-followups.md](plans/implementation/runtime-architecture-followups.md) for current reconciliation; older refactor plans under [archive/](archive/) are historical only.

## Start Here

- Contributor workflow and repo conventions: [operations/contributor/developer.md](operations/contributor/developer.md)
- Documentation maintenance: [operations/contributor/documentation-maintenance.md](operations/contributor/documentation-maintenance.md)
- System architecture and design map: [designs/README.md](designs/README.md)

## Plans

Current work, sequencing, and follow-up lists live under [plans/](plans/):

- Repository roadmap: [plans/roadmap.md](plans/roadmap.md)
- Documentation classification status: [plans/implementation/documentation-classification-tracker.md](plans/implementation/documentation-classification-tracker.md)
- Artemis II media, streams, transcripts, attribution, and launch work: [plans/breakdown/artemis2-media.md](plans/breakdown/artemis2-media.md)
- Performance and responsiveness optimization queue: [plans/breakdown/performance.md](plans/breakdown/performance.md)
- Timekeeping, mission-clock sync, UTC/TDB, and media clock decisions: [plans/breakdown/time-synchronization.md](plans/breakdown/time-synchronization.md)

## Operations

Repeatable contributor, data, deployment, and media procedures live under
[operations/](operations/):

- Contributor workflow: [operations/contributor/developer.md](operations/contributor/developer.md)
- AI/tooling notes: [operations/contributor/ai-tools.md](operations/contributor/ai-tools.md)
- Testing strategy and commands: [operations/contributor/testing.md](operations/contributor/testing.md)
- Repo boundary and sync workflow: [operations/data/repo-sync-playbook.md](operations/data/repo-sync-playbook.md)
- Public R2 asset serving contract: [operations/deployment/r2-asset-hosting.md](operations/deployment/r2-asset-hosting.md)
- Moon render asset provenance and maintenance: [operations/data/moon-render-assets.md](operations/data/moon-render-assets.md)
- Artemis II media asset source and maintenance notes: [operations/media/artemis2-media-assets.md](operations/media/artemis2-media-assets.md)

## Specifications

Behavioral and ownership contracts live under [specs/](specs/):

- Mobile experience v1: [specs/mobile-experience-v1-spec.md](specs/mobile-experience-v1-spec.md)
- Orbit milestones: [specs/orbit-milestones-spec.md](specs/orbit-milestones-spec.md)
- Repository documentation classification: [specs/repository-documentation-classification-and-lifecycle.md](specs/repository-documentation-classification-and-lifecycle.md)
- Runtime UX: [specs/ui/runtime-ux.md](specs/ui/runtime-ux.md)
- Artemis real-time experience: [specs/ui/artemis-real-time-experience.md](specs/ui/artemis-real-time-experience.md)
- Runtime style and interaction: [specs/ui/runtime-style-and-interaction.md](specs/ui/runtime-style-and-interaction.md)
- Runtime architecture boundaries: [specs/runtime/architecture-boundaries.md](specs/runtime/architecture-boundaries.md)
- App/data repository boundary: [specs/data/repository-boundary.md](specs/data/repository-boundary.md)
- Chebyshev ephemeris format: [specs/data/chebyshev-ephemeris-format.md](specs/data/chebyshev-ephemeris-format.md)
- Relative mode: [specs/modes/relative-mode.md](specs/modes/relative-mode.md)
- Orbit comparison mode: [specs/modes/orbit-comparison.md](specs/modes/orbit-comparison.md)
- Camera state transitions: [specs/camera/state-transitions.md](specs/camera/state-transitions.md)
- Frame and Shoot lighting/exposure: [specs/rendering/frame-and-shoot-lighting-and-exposure.md](specs/rendering/frame-and-shoot-lighting-and-exposure.md)
- Lunar feature controls: [specs/ui/lunar-feature-controls.md](specs/ui/lunar-feature-controls.md)
- Panel progressive disclosure: [specs/ui/panel-progressive-disclosure.md](specs/ui/panel-progressive-disclosure.md)
- Panel System V1: [specs/ui/panel-system-v1.md](specs/ui/panel-system-v1.md)
- Clock authority: [specs/time/clock-authority.md](specs/time/clock-authority.md)
- Timeline and media playback: [specs/time/timeline-and-media-playback.md](specs/time/timeline-and-media-playback.md)

## Designs

Architecture, component responsibilities, execution flows, and accepted
technical decisions live under [designs/](designs/). The design hub is
[designs/README.md](designs/README.md).

Key architecture entry points:

- Runtime architecture target: [designs/runtime/target-architecture.md](designs/runtime/target-architecture.md)
- Runtime system overview: [designs/runtime/system-overview.md](designs/runtime/system-overview.md)
- Runtime architecture reconciliation: [plans/implementation/runtime-architecture-followups.md](plans/implementation/runtime-architecture-followups.md)
- Time synchronization architecture: [designs/time/synchronization.md](designs/time/synchronization.md)

## Mission Sourcing

Mission onboarding, HORIZONS sourcing, and generated product data:

- Worker playbook: [operations/data/horizons-worker-playbook.md](operations/data/horizons-worker-playbook.md)
- Mission coverage inventory: [research/mission-sourcing/horizons-lunar-missions.md](research/mission-sourcing/horizons-lunar-missions.md)
- HORIZONS blurb product data: [assets/horizons-blurbs/](../assets/horizons-blurbs/)

## Research

Scientific investigations, source surveys, implementation experiments, and
reference corpora:

- [research/](research/)
- Lunar feature datasets and Artemis II map reference links:
  [research/mission-sourcing/lunar-feature-and-artemis2-reference-sources.md](research/mission-sourcing/lunar-feature-and-artemis2-reference-sources.md)

## Evidence

Point-in-time audits, reviews, handoffs, baselines, and measurements:

- [evidence/](evidence/)

## Archive

Historical proposals and superseded planning material:

- [archive/](archive/)

Most refactor-era plans and architecture proposals now live only here. Keep them for context, but prefer the active docs above for current guidance.
