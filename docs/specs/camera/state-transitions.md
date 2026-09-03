# Camera State Transitions

## Status

This specification describes the current shipped camera position/look model.

## Purpose

Define the valid camera position and look combinations, their normalization,
mounted-camera behavior, lock availability, and field-of-view controls.

## Camera State

Camera state has two independently selected axes:

- `positionMode`: `manual`, `earth`, `moon`, or `spacecraft`
- `lookMode`: `manual`, `earth`, `moon`, or `spacecraft`

The pair, after normalization, is the authoritative semantic camera state.
Controller offsets, targets, and FoV internals are derived state.

## Valid Pairs

| Position | Allowed look modes |
| --- | --- |
| `manual` | `manual`, `earth`, `moon`, `spacecraft` |
| `earth` | `moon`, `spacecraft` |
| `moon` | `manual`, `earth`, `spacecraft` |
| `spacecraft` | `manual`, `earth`, `moon` |

These twelve pairs are valid:

- `manual/manual`
- `manual/earth`
- `manual/moon`
- `manual/spacecraft`
- `earth/moon`
- `earth/spacecraft`
- `moon/manual`
- `moon/earth`
- `moon/spacecraft`
- `spacecraft/manual`
- `spacecraft/earth`
- `spacecraft/moon`

Self-looking mounted pairs and `earth/manual` are not valid.

## Pair Semantics

- `manual/manual` is the default free camera.
- `manual/<body>` preserves manual camera positioning while forcing the look
  target to that body.
- `<body>/manual` mounts the camera to the selected source while retaining
  manually controllable aim.
- `<body>/<other-body>` is a semantic mounted source-to-target view.

`body` means Earth, Moon, or spacecraft subject to the valid-pair table.

## Normalization

Every requested change is normalized to a valid pair.

- When the position control initiates the change, preserve the requested
  position. If the current look is invalid, select the first allowed look for
  that position.
- When the look control initiates the change, preserve the requested look. If
  the current position is invalid, select the first allowed position for that
  look.
- For initialization or a change without a recognized source, normalize look
  first against position, then position against the resulting look.
- Parsing an unknown pair key returns no selection and leaves the current pair
  unchanged. Converting unknown position/look modes to a pair key falls back to
  `manual/manual`.

The UI must reflect the normalized result. Select controls may disable invalid
options; pill controls remain selectable and rely on normalization to resolve
the resulting pair.

## Transition Behavior

- A transition to a non-manual position updates the controller's mounted
  source and look modes.
- Entering or changing a mounted semantic source-to-target view recenters the
  camera on the selected source instead of inheriting a free-camera offset.
- A mounted position with manual look may preserve its distance and offset when
  the source is unchanged. A new mounted source receives its canonical manual
  aim.
- Returning to `manual/manual` restores the standard manual controls and, for a
  normal mode selection, resets the default camera parameters.
- Releasing a follow/look pill may preserve the current camera position while
  still restoring the manual pivot and up vector.
- Recenter on a mounted camera switches look to `manual` and restores the
  source-specific default aim.
- Camera state changes must apply immediately while animation is paused.

Mounted-source visibility is derived from camera position. A craft-mounted
camera hides the craft; Earth or Moon is hidden only while its mounted camera
is inside that body, with hysteresis around the body radius.

## Manual-Look Locks

Lock controls are available only when `lookMode` is `manual`:

| Valid pair | Available locks |
| --- | --- |
| `manual/manual` | spacecraft, Moon, Earth |
| `moon/manual` | spacecraft, Earth |
| `spacecraft/manual` | Earth, Moon |

Changing to a pair where a checked lock is unavailable must clear that lock in
both UI and scene state.

## Field Of View

Desktop main-view FoV controls and wheel-to-FoV behavior are active only for
these mounted views whose look target has a known body radius:

- `earth/moon`
- `moon/earth`
- `spacecraft/earth`
- `spacecraft/moon`

They are inactive for all other valid pairs, including `earth/spacecraft` and
`moon/spacecraft`.

- FoV range is `0.1` to `179` degrees.
- Slider, value input, wheel, and automatic FoV use the same underlying state.
- Manual FoV input exits automatic mode.
- Automatic FoV fits the target into the visible mission viewport, excluding
  the header and lower control/timeline regions.
- FoV is displayed to one decimal place.
- The nonlinear zoom slider targets `35.0` degrees at its midpoint.

## Invariants

- Runtime and UI expose only a normalized valid pair.
- Position-initiated and look-initiated changes preserve the axis the user
  selected.
- Semantic mounted views do not inherit a free-camera offset.
- Manual controls are fully restored in `manual/manual`.
- Unavailable locks are disabled and cleared.
- FoV input is ignored outside the four supported mounted views.

## Required Tests

Automated coverage must verify:

- the complete allowed-pair map and reverse look-to-position map;
- source-sensitive normalization of invalid pairs;
- pair-key parsing and fallback to `manual/manual`;
- lock availability and clearing outside manual look;
- mounted recentering when source or look changes;
- restoration of manual controls and follow-release pose preservation;
- FoV enablement for exactly the four supported pairs;
- slider, value, wheel, and automatic FoV synchronization; and
- automatic fit against the visible viewport band.
