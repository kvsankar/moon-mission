# Camera Feature Redesign Proposal

This document outlines a proposal to redesign the camera control features in the Chandrayaan-3 visualization based on a discussion about its usability. The current implementation has several issues, including confusing labels, conflicting behaviors, and bugs that create a poor user experience.

## Current Issues

*   **Confusing Labels:** The distinction between "Lock On >" and "Camera >" is not intuitive.
*   **Conflicting Functionality:** "Lock On > Moon" and "Camera > Moon" both aim to focus the view on the Moon, but they are implemented in different, conflicting ways that cause bugs.
*   **Hidden Behaviors:** The "Camera > Moon" option unexpectedly resets the camera's zoom/position to a default state without informing the user.
*   **Bugs:**
    *   Combining "Lock On > Moon" and "Camera > Moon" results in a black screen because the camera is pointed away from the scene.
    *   The "Camera > Moon" feature fights with the mouse controls (`TrackballControls`), making the camera feel stuck or unresponsive.

## Proposal 1: Simplified, Unified Controls

The first proposal aimed to simplify the existing features into a single, clear control panel to resolve the ambiguity and bugs.

---

**`CAMERA CONTROLS`**

**Focus Target:** *(What the scene revolves around)*
*   `(o)` Earth
*   `( )` Moon
*   `( )` Spacecraft

**Viewpoint:** *(Jump to a preset view)*
*   `[ Default         ▾]` (Dropdown Menu)
    *   Default
    *   Top-Down (XY)
    *   Front View (YZ)
    *   Side View (ZX)

**Tracking:** *(How the camera follows the target)*
*   `[ Manual          ▾]` (Dropdown Menu)
    *   Manual (Full user control)
    *   Always Face Target

---

## Proposal 2: Advanced "From-To" System

Following a suggestion for a more layered and powerful system, a second proposal was developed. This design allows for independent control over the camera's **location** (where it is) and its **target** (what it's looking at), creating a flexible "from-to" paradigm.

---

**`ADVANCED CAMERA CONTROLS`**

**Camera Position:** *(Mount the camera on...)*
*   `[ Manual Control    ▾]` (Dropdown Menu)
    *   **Manual Control** (Default free-roam camera)
    *   Earth
    *   Moon
    *   Spacecraft

**Look At Target:** *(Always point the camera at...)*
*   `[ Manual Aim        ▾]` (Dropdown Menu)
    *   **Manual Aim** (Default user-controlled view)
    *   Earth
    *   Moon
    *   Spacecraft

---

### How the Advanced System Would Work

This model provides a matrix of options by letting the user mix and match the camera's location and its target.

#### 1. Camera Position
This dropdown determines what the camera is "attached" to.

*   **Manual Control:** The default mode. The camera is independent, and the user has full control to move it anywhere in the scene.
*   **Earth / Moon / Spacecraft:** Selecting an object "mounts" the camera to it. The camera will travel through space *with* that object, like a chase camera.

#### 2. Look At Target
This dropdown determines what the camera is pointing at, overriding manual mouse rotation.

*   **Manual Aim:** The default mode. The user controls where the camera looks by rotating with the mouse.
*   **Earth / Moon / Spacecraft:** Selecting a target will force the camera to always stay pointed at that object. Zoom would still function, but rotation would be disabled to prevent control conflicts.

### Example Combinations:

*   **Standard Experience:**
    *   `Position: Manual Control`
    *   `Target: Manual Aim`

*   **View from Earth looking at the Moon:**
    *   `Position: Earth`
    *   `Target: Moon`

*   **A "chase cam" following the spacecraft, looking back at Earth:**
    *   `Position: Spacecraft`
    *   `Target: Earth`

This layered approach provides maximum flexibility, is far more intuitive, and would be designed to prevent the bugs and control conflicts present in the current system.

---

## Implementation Notes (Current Behavior)

To avoid ambiguous or self-referential camera states, the UI now uses a **Camera Pair** selector and enforces **valid camera pairs** only. This is a permanent behavior (not just a troubleshooting mode).

### Allowed Position → Look At pairs

*   **Manual →** Manual, Moon, Spacecraft
*   **Earth →** Moon, Spacecraft
*   **Moon →** Manual, Earth, Spacecraft
*   **Spacecraft →** Earth, Moon

**Disallowed:** Earth→Earth, Moon→Moon, Spacecraft→Spacecraft, and any other pair not listed above.

The UI exposes these as a single **Camera Pair** radio list (e.g., “Earth → Moon”) rather than two independent dropdowns.

### Lock On availability (only when Look At = Manual)

When **Look At** is not Manual, all Lock On options are disabled (greyed out).  
When **Look At** is Manual, the enabled Lock On targets depend on **Camera Position**:

*   **Camera = Manual:** Lock On → Craft, Moon, Earth
*   **Camera = Earth:** Lock On → Craft, Moon
*   **Camera = Moon:** Lock On → Craft, Earth
*   **Camera = Spacecraft:** Lock On → Earth, Moon

### Fixed FoV behavior

A **Fixed FoV** toggle is provided in the Camera section. When enabled and the **Camera Position** is **Earth** or **Moon**, the FoV is fixed to **1°** for a consistent “from the center” view.  
When the toggle is off or Camera Position is anything else, FoV returns to its prior value.
