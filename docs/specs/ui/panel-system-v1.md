---
doc_class: spec
status: current
scope: ui.panels.v1
canonical_for:
  - panel-system-v1-behavior
---

# Panel System V1 Spec

> Status: this document describes the desktop panel foundation that is currently shipped, and separates that from deferred panel work.

## Purpose

Unify the app's desktop panel experience under one panel framework that supports:

- common shell chrome and interaction behavior
- mission-defined built-in panel defaults
- per-mission layout persistence
- an embedded `Panels` management section inside Advanced settings

This spec is desktop-only for V1.

## Current V1 Scope

The current shipped V1 scope is:

- shared shell behavior for desktop panels
- mission-config-driven default visibility for built-in panels
- persisted per-mission desktop layout
- an embedded `Panels` fieldset in Advanced settings instead of a floating or
  header-launched manager
- built-in auxiliary view panels plus workflow panels
- shared `Zoom`/FoV control semantics across the main view and panel views

## Deferred Beyond Current V1

Deferred targets are not part of the V1 contract. They are tracked in
[Panel System V1 Follow-Ups](../../plans/implementation/panel-system-v1-followups.md).

## Panel Types

### 1. Auxiliary view panels

- Render additional built-in mission scene views.
- Artemis II currently includes:
  - `Craft -> Earth`
  - `Craft -> Moon`
  - `Earth -> Moon`
- These panels use the shared shell and keep panel-local presentation state.
- Identity is currently defined by the built-in panel preset, not by a user-editable `viewSignature` flow yet.

### 2. Workflow panels

- Mission- or feature-specific panels that do not map cleanly to a simple built-in aux view.
- Current examples:
  - `Flyby in Focus`
  - `Splashdown in Spotlight`
  - `Mission Media`
  - `Flyby Broadcast`
- These use the shared shell, but own specialized internal UI and behavior.
- On desktop, the Dockview workspace is the default layout. The main mission view is the center pane, `Flyby Broadcast` and `Mission Media` open in the left rail, and `Frame and Shoot` plus a vertical aux stack (`Craft -> Moon`, `Craft -> Earth`, `Orbit`) open in the right rail. `Splashdown in Spotlight` remains closed until requested. Legacy overlay behavior remains available during rollout with `?legacyPanels=1` or `?dockPanels=0`.
- Workflow panels may define panel-specific default geometry for the legacy overlay path. In the Dockview path, panel geometry is owned by Dockview while panel-specific content state remains owned by the panel module.

### 3. `Panels` management surface

- Desktop V1 embeds panel management in the global Advanced settings panel.
- The `Panels` fieldset lists mission panels, shows their state, and exposes:
  - `Info`
  - `Restore` / `Open` / `Add` / `Focus` as the primary action, depending on panel state
- Closed/non-open panels, open panels, and unavailable panels are grouped into
  separate sections.

## Core Concepts

### Panel shell

- Shared outer frame and interactions.
- Responsible for:
  - title bar
  - panel title
  - info
  - minimize
  - expand / restore
  - close
  - delete
  - drag
  - resize
  - focus / z-order
  - persisted geometry

### Panel content

- The inner implementation for a specific panel type.
- Responsible for:
  - rendering
  - panel-specific controls
  - panel-specific state
  - mission-specific UI behavior

### Panel instance

- A concrete panel on screen.
- Has runtime state plus persisted mission-layout state.

### Layout

- The set of built-in panel instances for a mission, including:
  - which panels are present in the layout
  - open / minimized / closed / deleted state
  - geometry
  - maximize state
  - z-order
- panel-local mutable settings

### Dockview workflow workspace

- Desktop workflow panels use `dockview-core` through `src/platform/js/app/panel-layout-host.js`.
- Feature modules must not import Dockview directly; they add/focus/close panels through the layout host exposed by the workspace.
- The workspace persists Dockview layout JSON separately from legacy panel geometry.
- Closing a Dockview tab maps back to the panel registry `close` action.
- The first-load desktop layout opens the left and right rails by default:
  - left: `Flyby Broadcast` above `Mission Media`
  - center: main mission view
  - right: `Frame and Shoot` beside a vertical aux stack with `Craft -> Moon`, `Craft -> Earth`, and `Orbit`
- The temporary fallback flags are:
  - `?legacyPanels=1`
  - `?dockPanels=0`
  - `?dockPanels=1` to force the Dockview workspace on narrow viewports during testing.

## Mission Configuration

Each mission may declare default built-in panel behavior in mission config.

Current shape:

```json
{
  "ui": {
    "panels": {
      "defaults": {
        "aux:earth": {
          "enabled": true,
          "defaultState": "open"
        },
        "aux:moon": {
          "enabled": true,
          "defaultState": "minimized"
        },
        "workflow:splashdown": {
          "enabled": true,
          "defaultState": "closed",
          "autoOpenBeforeEvent": true
        },
        "workflow:media-browser": {
          "enabled": true,
          "defaultState": "closed"
        }
      }
    }
  }
}
```

Rules:

- Defaults are keyed by panel registry id.
- If a saved mission layout exists, it wins over config defaults.
- If no saved layout exists, built-in panel visibility initializes from mission config.
- Built-in panel availability remains mission-owned rather than hardcoded in generic UI.
- Config-gated workflow panels should stay dormant when absent or disabled. For example, `workflow:media-browser` should not load a media manifest or render timeline media markers unless enabled.

## Current Lifecycle Semantics

### `open`

- Panel is visible in the workspace.
- It appears in the `Open` section of the `Panels` menu.

### `minimized`

- Panel stays alive but leaves the workspace.
- It appears in the non-open section of the `Panels` menu and can be restored.

### `closed`

- Panel is hidden but retained in the current mission layout.
- It can be reopened from the `Panels` menu.

### `deleted`

- Panel is removed from the current mission layout.
- For built-in panels, `Delete` removes the instance from the saved layout but the panel remains re-addable from the `Panels` menu.
- `Delete` is destructive-looking and confirmed.
- `Panel Manager`-specific delete semantics are no longer relevant because V1 no longer uses a manager panel.

### `maximized`

- Panel expands into the usable desktop viewport band.
- Restoring exits to the previous saved frame.
- Some workflow panels default to this state on a clean layout; others use a panel-specific compact frame.

## Shared Shell Requirements

Visual consistency across current desktop panel types:

- same border language
- same title bar layout
- same icon-button treatment
- same drag affordance
- same resize affordance
- same focus treatment
- same spacing and radius tokens

Functional consistency:

- click brings panel to front
- drag from title bar
- resize from shell edge / corner
- shell actions use the same meaning everywhere
- delete confirmation copy is consistent

Shared shell controls:

- title
- info
- minimize
- expand / restore
- close
- delete

## `Panels` Management Behavior

The current management surface must:

- appear as a `Panels` fieldset inside Advanced settings on desktop
- list all mission panels that are available to the current mission
- show the panel state badge for each row
- show built-in status
- expose `Info` plus one primary lifecycle action per row
- group unavailable panels separately when present

Recommended row contents, matching current behavior:

- title
- state badge
- built-in badge when applicable
- `Info`
- one state-dependent primary action

## Layout Persistence

Scope:

- per mission only
- desktop only

Persistence currently includes:

- panel presence in the mission layout
- built-in vs mission-defined availability
- visibility state:
  - open
  - minimized
  - closed
  - deleted
  - maximized
- geometry:
  - x
  - y
  - width
  - height
- z-order
- panel-local mutable settings needed by the current panel implementations

Storage key:

```text
moon-mission:panel-layout:v1:<missionKey>
```

Rules:

- save on meaningful layout changes
- clamp offscreen panels on restore and resize
- if layout data is partially invalid, recover gracefully and rebuild from defaults where needed

## Default Layout Behavior

On a clean mission load with no saved panel layout:

- built-in panel lifecycle state comes from mission config
- auxiliary view panels are placed in a right-aligned, non-overlapping stack
- on wide desktop layouts, 1600px and wider, the top visible auxiliary view panel starts just below the About/Hide button; on narrower laptop layouts, the stack stays below the header controls
- default auxiliary and Frame and Shoot panel geometry must stay above the main transport controls and timeline dock
- if the viewport is too short for a single column, auxiliary defaults wrap into additional columns to the left
- workflow panel geometry follows the mission config plus the panel's preset

Saved layouts override these clean-load defaults.

## Current Info Behavior

The current shared info UI shows consistent panel metadata.

Today that means:

- title
- panel type
- built-in vs user-created status
- internal id

For current built-in panels, this is enough to identify the panel instance. Future user-created view panels will extend this with immutable `viewSignature` details.

## Current Acceptance Criteria

- A mission can define default built-in panel states in config.
- On first desktop load, built-in panels appear with consistent shared shell styling and behavior.
- Auxiliary view panels are right-aligned by default without overlap.
- Workflow panels participate in the same shell model while keeping panel-specific default geometry.
- Config-gated workflow panels such as `Mission Media` can remain closed by default while still being available from the `Panels` management section.
- The user can drag, resize, minimize, expand, close, delete, and restore the currently supported desktop panels consistently.
- The `Panels` management section can inspect and reopen the current mission's panels.
- The app restores the same desktop panel layout when reloading the same mission.
