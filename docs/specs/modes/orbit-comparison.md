---
doc_class: spec
status: current
scope: runtime.mode.compare
canonical_for:
  - orbit-comparison-behavior
  - orbit-comparison-url-contract
---

# Orbit Comparison Mode

## Purpose

Compare mode displays two missions in one animation so their translunar and
lunar-orbit shapes, sequences, and mission geometry can be compared.

It uses a fictional comparison clock and display normalization. It is not a new
physical ephemeris product and must never rewrite raw mission ephemeris.

The normalization and runtime structure are defined in
[Orbit Comparison Design](../../designs/modes/orbit-comparison.md). Deferred
product work is tracked in
[Orbit Comparison Plan](../../plans/breakdown/orbit-comparison.md).

## URL Contract

The landing-page launcher constructs compare URLs. They may also be entered
directly.

| Parameter | Values | Meaning |
| --- | --- | --- |
| `mission` | Mission folder under `assets/` | Primary mission and page-shell owner. |
| `mode` | `compare` | Activates compare mode. |
| `compareMission` | Mission folder under `assets/` | Secondary mission loaded as an overlay. |
| `comparePrimaryEvent` | Primary event key | Primary alignment anchor; defaults to a launch-like event. |
| `compareSecondaryEvent` | Secondary event key | Secondary alignment anchor; defaults to a launch-like event. |

Example:

```text
mission.html?mission=artemis2&mode=compare&compareMission=artemis1
```

Compare mode is always relative. Earth/Moon origin choices are unavailable,
navigation omits `origin`, and stale `origin` parameters are removed rather
than interpreted as compare-mode frame choices.

## Mission Roles

### Primary mission

The `mission` parameter selects the page shell, base config, and primary
mission. Mission-specific UI that is not compare-aware remains owned by the
primary mission.

### Comparison mission

The comparison mission contributes overlay config, craft curves, craft states,
and mapped events. It does not own the page shell. Its primary craft is exposed
to the runtime through a synthetic ID:

```text
CMP_<MISSION>_<CRAFT>
```

## Comparison Clock

Conceptually, compare mode uses fictional anchor-relative parameter `tau`. It
is neither UTC nor TDB and maps independently into each mission's native time
domain. Runtime storage retains the primary mission's display timestamp rather
than storing a zero-based scalar; the design documents that mapping.

### Single-anchor policy

1. Select one event anchor from each mission.
2. Prefer launch-like events by default; fall back to mission start.
3. Treat the aligned anchor pair as conceptual `tau = 0`.
4. Preserve each mission's native elapsed-time pace after the anchor.
5. Do not stretch shorter missions to match longer ones.

At `tau + 1 day`, each mission has advanced one day in its own chronology.

### Event interleaving

For each event:

```text
offset = eventTime - selectedAnchorTime
compareTime = compareAnchor + offset
```

Merge both missions' mapped events and sort by comparison time. Ties prefer the
primary mission, then label order for stability.

## Display Contract

Compare mode prioritizes visual comparability over physical fidelity.

Required frame behavior:

- Earth remains at `(0, 0, 0)`.
- The Earth-to-Moon line remains on `+X`.
- Displayed Earth-Moon distance remains fixed at the comparison reference
  distance.
- Each mission is sampled in its own native time domain.

The default compare display profile applies these overrides:

- Earth rotation is frozen.
- Moon rotation is frozen.
- Sky orientation is frozen.
- Sun direction can be fixed to a compare-mode direction.
- Dynamic Earthshine is disabled.

Mission compare configuration can explicitly disable the Earth, Moon, or sky
freeze flags and can keep Earthshine enabled. It can also provide the fixed Sun
direction. Whether defaulted or configured, these settings are presentation-only
and must not alter raw body-state or orbit sampling.

## Orbit And Data Rules

- Both missions render through the normal multi-craft orbit pipeline.
- Comparison transforms are deterministic from the mission pair, anchors, and
  `tau`.
- Raw mission config and ephemeris remain unchanged.
- Post-HORIZONS generated dashed overlays belong only to the primary mission.
- The comparison craft's mapped HORIZONS window renders as a normal solid
  trajectory.
- Comparison event order uses mapped comparison time, never raw cross-mission
  UTC ordering.

## Invariants

1. Raw ephemeris data remains unmodified.
2. Earth-Moon display distance is constant across the comparison window.
3. The body used to display the Moon and the body used to derive normalization
   scale come from the same mission at every sample.
4. Both missions use their own mapped sample times.
5. Any enabled freeze/fixed-lighting profile setting remains stable across the
   comparison window.
6. A compare overlay does not create a second independent mission runtime.
