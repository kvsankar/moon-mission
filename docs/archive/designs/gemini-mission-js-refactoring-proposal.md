# Refactoring Proposal for mission.js (Revised)

## 1. Introduction

The current `mission.js` file is a 4,875-line monolithic script handling 3D rendering, UI, data loading, and state management. This makes the code difficult to maintain and extend. This proposal outlines a comprehensive, iterative plan to refactor `mission.js` into a modular, plugin-driven architecture.

This revised proposal incorporates ideas from an alternative proposal, aiming to combine the strengths of both approaches to create a robust, scalable, and practical solution. The goal is to support multiple planets, interchangeable 3D models (including from sources like CesiumJS), and new missions with ease.

## 2. Problems with the Current Architecture

*   **Monolithic Structure:** A single file makes navigation, understanding, and modification difficult.
*   **Global State Pollution:** Heavy reliance on global variables creates hidden dependencies and unpredictable behavior.
*   **Tight Coupling:** Rendering, UI, and data logic are intertwined, preventing independent changes.
*   **Poor Extensibility:** The current design is not built to accommodate new planets, missions, or features without significant effort.

## 3. Proposed Architecture: A Plugin-Driven Approach

We propose a modular architecture centered around a plugin system. This will provide a clean separation of concerns and allow for easy extension.

### 3.1. Core Principles

*   **Single Responsibility:** Each module will have one clear purpose.
*   **Plugin Architecture:** Missions, celestial bodies, and other components will be treated as plugins, allowing for easy addition and removal.
*   **Dependency Inversion:** High-level modules will not depend on low-level implementation details.
*   **Iterative Refactoring:** The transition will happen in small, safe steps, ensuring the application remains functional after each iteration.

### 3.2. Proposed Module Structure

```
assets/platform/js/
├── main.js                 # Main application entry point
├── core/
│   ├── config-manager.js   # Handles loading and accessing configuration
│   ├── event-manager.js    # Simple pub/sub event bus for module communication
│   ├── plugin-manager.js   # Registers and manages plugins
│   └── constants.js        # Global constants (physics, etc.)
├── data/
│   ├── data-loader.js      # Handles fetching data (JSON, NPY, NPZ)
│   └── data-adapter.js     # Adapts different data formats (e.g., for Cesium)
├── rendering/
│   ├── scene-manager.js    # Manages the core THREE.js scene, renderer, and lights
│   ├── camera-controller.js# Handles camera logic (locking, movement)
│   └── model-factory.js    # Creates and manages 3D models
├── components/
│   ├── celestial-body.js   # Class for planets, moons, etc.
│   ├── spacecraft.js       # Class for the spacecraft
│   └── orbit.js            # Class for orbit curves
├── ui/
│   ├── ui-manager.js       # Manages all UI components and interactions
│   └── ui-state.js         # Manages the state of the UI
├── plugins/
│   ├── missions/
│   │   ├── chandrayaan3.js # The default mission plugin
│   │   └── apollo.js         # Example of a new mission plugin
│   └── celestial-bodies/
│       ├── earth.js        # Earth plugin
│       └── mars.js         # Example of a new celestial body plugin
└── utils/
    ├── math-utils.js       # Math utility functions
    └── dom-utils.js        # DOM manipulation helpers
```

### 3.3. Key Components

#### `core/plugin-manager.js`

This will be the heart of the new architecture. It will allow us to register and retrieve different types of plugins.

```javascript
export class PluginManager {
    constructor() {
        this.plugins = new Map();
    }

    register(type, id, plugin) {
        if (!this.plugins.has(type)) {
            this.plugins.set(type, new Map());
        }
        this.plugins.get(type).set(id, plugin);
    }

    get(type, id) {
        return this.plugins.get(type)?.get(id);
    }
}
```

#### `main.js` (New Entry Point)

The new `main.js` will be responsible for initializing the application and wiring together the different modules.

```javascript
import { PluginManager } from './core/plugin-manager.js';
import { SceneManager } from './rendering/scene-manager.js';
// ... other imports

class MissionControl {
    constructor(container, missionId) {
        this.pluginManager = new PluginManager();
        this.sceneManager = new SceneManager(container);
        // ... initialize other managers

        this.loadPlugins();
        this.startMission(missionId);
    }

    loadPlugins() {
        // Register mission and celestial body plugins
        this.pluginManager.register('mission', 'chandrayaan3', new Chandrayaan3Mission());
        this.pluginManager.register('celestial-body', 'earth', new EarthPlugin());
    }

    startMission(missionId) {
        const mission = this.pluginManager.get('mission', missionId);
        if (mission) {
            mission.init(this); // Pass the main controller to the mission
        }
    }
}
```

## 4. Iterative Refactoring Plan

This plan is designed to be incremental and low-risk. Each iteration results in a fully working application.

### Iteration 1: Utilities & Constants (2-3 days)

*   **Goal:** Extract pure functions and constants that have no dependencies on the rest of the codebase.
*   **Tasks:**
    1.  Create `utils/math-utils.js` and move relevant math functions into it.
    2.  Create `core/constants.js` and move all physical and mathematical constants there.
    3.  Update `mission.js` to import from these new modules.
*   **Verification:** The application runs and functions identically to the baseline.

### Iteration 2: Configuration Management (2 days)

*   **Goal:** Externalize all hardcoded configuration values.
*   **Tasks:**
    1.  Create `core/config-manager.js`.
    2.  Create a `config.json` file and move all configuration into it.
    3.  Implement the `ConfigManager` to load and provide access to the config.
    4.  Update `mission.js` to use the `ConfigManager`.
*   **Verification:** The application runs and functions identically.

### Iteration 3: Data Loading (3 days)

*   **Goal:** Isolate all data fetching logic.
*   **Tasks:**
    1.  Create `data/data-loader.js`.
    2.  Move the `fetchJson`, `fetchNPY`, and `fetchNPZ` functions into the `DataLoader`.
    3.  Update `mission.js` to use the `DataLoader`.
*   **Verification:** All data is loaded and processed correctly.

### Iteration 4: Core Rendering Setup (3-4 days)

*   **Goal:** Isolate the core THREE.js scene setup and rendering loop.
*   **Tasks:**
    1.  Create `rendering/scene-manager.js`.
    2.  Move the `SceneHandler` class into the `SceneManager`.
    3.  Refactor `mission.js` to delegate scene management to the `SceneManager`.
*   **Verification:** The 3D scene is created and rendered correctly.

### Iteration 5: UI Management (4-5 days)

*   **Goal:** Decouple UI logic from the main application logic.
*   **Tasks:**
    1.  Create `ui/ui-manager.js` and `ui/ui-state.js`.
    2.  Create `core/event-manager.js`.
    3.  Move all jQuery code and UI event handlers to the `UIManager`.
    4.  Use the `EventManager` to communicate between the UI and the rest of the app.
*   **Verification:** All UI elements are functional and correctly update the application state.

### Iteration 6: Component Abstraction (5-7 days)

*   **Goal:** Abstract the creation of scene components (Celestial Bodies, Spacecraft, Orbits).
*   **Tasks:**
    1.  Create the `components/celestial-body.js`, `components/spacecraft.js`, and `components/orbit.js` modules.
    2.  Create classes for each component, encapsulating their creation and behavior logic from the old `AnimationScene` class.
    3.  Refactor `mission.js` to use these new component classes.
*   **Verification:** All 3D objects are rendered and behave correctly.

### Iteration 7: Plugin System (5-7 days)

*   **Goal:** Introduce the plugin system and refactor the default mission into a plugin.
*   **Tasks:**
    1.  Create `core/plugin-manager.js`.
    2.  Create `plugins/missions/chandrayaan3.js`.
    3.  Move the logic for the Chandrayaan-3 mission from the main application logic into the `Chandrayaan3Mission` plugin.
    4.  Create a new `main.js` entry point that initializes the `PluginManager` and loads the default mission.
*   **Verification:** The Chandrayaan-3 mission runs correctly using the new plugin system.

### Iteration 8: Add a New Mission (3-4 days)

*   **Goal:** Prove the extensibility of the new architecture by adding a new mission.
*   **Tasks:**
    1.  Create a new mission plugin (e.g., `plugins/missions/apollo.js`).
    2.  Add the necessary data and models for the new mission.
    3.  Add a mechanism to the UI to switch between missions.
*   **Verification:** Both the Chandrayaan-3 and the new Apollo mission can be loaded and run.

## 5. Risk Mitigation

*   **Technical Risk:** The iterative approach ensures that the application is always in a working state, minimizing the risk of a broken build.
*   **Timeline Risk:** The work is broken down into small, manageable iterations, making it easier to track progress and identify potential delays early.
*   **Performance Risk:** Performance will be benchmarked before and after each iteration to ensure no regressions are introduced.

## 6. Success Metrics

*   **Quantitative:**
    *   Lines of code in `main.js` reduced by >90%.
    *   All modules under 500 lines of code.
    *   Cyclomatic complexity of all functions < 10.
    *   Adding a new mission takes < 3 days.
*   **Qualitative:**
    *   Improved developer productivity and ease of onboarding.
    *   Reduced bug rate due to better separation of concerns.
    *   Clear and well-documented module APIs.

## 7. Conclusion

This revised proposal presents a robust, scalable, and low-risk path to refactoring `mission.js`. By adopting a plugin-driven architecture and an iterative approach, we can transform the codebase into a modern, maintainable, and extensible application that is ready for future growth.