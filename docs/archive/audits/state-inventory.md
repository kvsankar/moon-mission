# State Variable Inventory - mission.js

This document catalogs all state variables in mission.js to plan the state management refactoring.

## Legend

| Column | Description |
|--------|-------------|
| **Variable** | Variable name |
| **Line** | Line number in mission.js |
| **Current Scope** | Global, Per-Config (in AnimationScene), or Derived |
| **Proposed Scope** | Where it should live after refactoring |
| **Notes** | Additional context |

---

## 1. Constants & Configuration (Read-Only)

| Variable | Line | Current | Proposed | Notes |
|----------|------|---------|----------|-------|
| `isTestMode` | 49 | Global | AppConfig | URL parameter, read-only |
| `SC` | 55 | Global | AppConfig | Default spacecraft ID |
| `craftSize` | 57 | Global | AppConfig | Pixel size constant |
| `planetProperties` | 59 | Global | AppConfig | Static planet metadata |
| `FORMAT_PERCENT` | 73 | Global | AppConfig | D3 formatter |
| `FORMAT_METRIC` | 74 | Global | AppConfig | D3 formatter |
| `planeCameraConfig` | 743 | Global | AppConfig | Camera position configs |
| `planeVariableConfig` | 757 | Global | AppConfig | Plane variable mappings |

---

## 2. Active Selection State

| Variable | Line | Current | Proposed | Notes |
|----------|------|---------|----------|-------|
| `config` | 81, 238 | Global | AppState | Active config: "geo" or "lunar" |
| `configGeo` | 236 | Global | AppState | Derived from checkbox |
| `configLunar` | 237 | Global | AppState | Derived from checkbox |
| `currentDimension` | 224 | Global | AppState | "2D" or "3D" |
| `previousDimension` | 225 | Global | AppState | For detecting changes |
| `dimensionChanged` | 226 | Global | AppState | Change flag |

---

## 3. Data Loading State

| Variable | Line | Current | Proposed | Notes |
|----------|------|---------|----------|-------|
| `orbitDataLoaded` | 83 | Global (keyed) | DataManager | `{geo: bool, lunar: bool}` |
| `orbitDataProcessed` | 84 | Global (keyed) | DataManager | `{geo: bool, lunar: bool}` |
| `orbitData` | 85 | Global | DataManager | Loaded orbit data |
| `chebyshevDataLoaded` | 92 | Global (keyed) | DataManager | `{geo: bool, lunar: bool}` |
| `chebyshevData` | 93 | Global | DataManager | `{geo: data, lunar: data}` |
| `landingDataLoaded` | 86 | Global | DataManager | Landing phase data |
| `landingDataProcessed` | 87 | Global | DataManager | Landing phase data |
| `landingData` | 88 | Global | DataManager | Landing phase data |
| `landingMetadata` | 89 | Global | DataManager | Landing phase data |
| `landingChebyshevLoaded` | 94 | Global | DataManager | Landing Chebyshev |
| `landingChebyshevData` | 95 | Global | DataManager | Landing Chebyshev |
| `nOrbitPoints` | 96 | Global | DataManager | Data stats |
| `nLandingPoints` | 97 | Global | DataManager | Data stats |
| `dataLoaded` | 184 | Global | DataManager | Overall loaded flag |
| `globalConfig` | 229 | Global | DataManager | Loaded config.json |

---

## 4. Animation/Time State

| Variable | Line | Current | Proposed | Notes |
|----------|------|---------|----------|-------|
| `animTime` | 171 | Global | AnimationController | Current animation timestamp |
| `animTimeStepMinutes` | 174 | Global | AnimationController | Speed multiplier |
| `realtimespeed` | 175 | Global | AnimationController | Realtime mode flag |
| `animationRunning` | 179 | Global | AnimationController | Play state |
| `stopAnimationFlag` | 180 | Global | AnimationController | Stop request |
| `startLandingFlag` | 181 | Global | AnimationController | Landing phase trigger |
| `prevFrameTime` | 176 | Global | AnimationController | FPS calculation |
| `curFrameTime` | 177 | Global | AnimationController | FPS calculation |
| `deltaFrameTime` | 178 | Global | AnimationController | Frame delta |
| `animateLoopCount` | 156 | Global | AnimationController | Debug counter |
| `ticksPerAnimationStep` | 185 | Global | AnimationController | Step calculation |
| `animationController` | 195 | Global | - | Already a class instance |

---

## 5. Mission Time Boundaries

| Variable | Line | Current | Proposed | Notes |
|----------|------|---------|----------|-------|
| `startTime` | 160 | Global | MissionState | Mission start timestamp |
| `endTime` | 161 | Global | MissionState | Mission end timestamp |
| `endTimeSC` | 162 | Global | MissionState | Spacecraft end time |
| `latestEndTime` | 163 | Global | MissionState | Latest of all end times |
| `startLandingTime` | 164 | Global | MissionState | Landing phase start |
| `endLandingTime` | 165 | Global | MissionState | Landing phase end |
| `epochJD` | 157 | Global | MissionState | Julian date epoch |
| `epochDate` | 158 | Global | MissionState | Epoch as Date |
| `timeTransLunarInjection` | 216 | Global | MissionState | TLI event time |
| `timeLunarOrbitInsertion` | 217 | Global | MissionState | LOI event time |
| `eventInfos` | 220 | Global | MissionState | Array of mission events |
| `timelineTotalSteps` | 167 | Global | MissionState | Timeline calculation |
| `stepsPerHop` | 168 | Global | MissionState | Timeline calculation |

---

## 6. View Settings (UI Checkboxes)

| Variable | Line | Current | Proposed | Notes |
|----------|------|---------|----------|-------|
| `viewOrbit` | 240 | Global | ViewSettings | Show orbit path |
| `viewOrbitDescent` | 241 | Global | ViewSettings | Show descent orbit |
| `viewCraters` | 244 | Global | ViewSettings | Show crater markers |
| `viewXYZAxes` | 245 | Global | ViewSettings | Show XYZ axes |
| `viewPoles` | 246 | Global | ViewSettings | Show pole markers |
| `viewPolarAxes` | 247 | Global | ViewSettings | Show polar axes |
| `viewSky` | 248 | Global | ViewSettings | Show starfield |
| `viewMoonSOI` | 249 | Global | ViewSettings | Show Moon SOI |
| `viewEclipticPlane` | 250 | Global | ViewSettings | Show ecliptic plane |
| `viewEquatorialPlane` | 251 | Global | ViewSettings | Show equatorial plane |
| `viewFPS` | 252 | Global | ViewSettings | Show FPS counter |

---

## 7. Plane/Coordinate Selection (PER-CONFIG)

| Variable | Line | Current | Proposed | Notes |
|----------|------|---------|----------|-------|
| `planeSelection` | 109 | Global | **AnimationScene** | DEFAULT, XY, YZ, ZX, etc. |
| `previousPlaneSelection` | 110 | Global | **AnimationScene** | For change detection |
| `plane` | 111 | Global | **AnimationScene** | Active plane: XY, YZ, ZX |
| `xVariable` | 112 | Global | **AnimationScene** | "x", "y", or "z" |
| `yVariable` | 113 | Global | **AnimationScene** | "x", "y", or "z" |
| `zVariable` | 114 | Global | **AnimationScene** | "x", "y", or "z" |
| `vxVariable` | 115 | Global | **AnimationScene** | Velocity mapping |
| `vyVariable` | 116 | Global | **AnimationScene** | Velocity mapping |
| `vzVariable` | 117 | Global | **AnimationScene** | Velocity mapping |
| `xFactor` | 118 | Global | **AnimationScene** | Sign factor |
| `yFactor` | 119 | Global | **AnimationScene** | Sign factor |
| `zFactor` | 120 | Global | **AnimationScene** | Sign factor |
| `planeChanged` | 102 | Global | **AnimationScene** | Change flag |
| `planeChangesPending` | 103 | Global | **AnimationScene** | Pending changes flag |

---

## 8. 2D/SVG Rendering State (MIXED)

| Variable | Line | Current | Proposed | Notes |
|----------|------|---------|----------|-------|
| `svgContainer` | 143 | Global | SVGRenderer | D3 SVG container (global) |
| `svgRect` | 144 | Global | SVGRenderer | SVG rect element (global) |
| `svgX` | 133 | Global | SVGRenderer | SVG position (global) |
| `svgY` | 134 | Global | SVGRenderer | SVG position (global) |
| `svgWidth` | 135 | Global | SVGRenderer | Canvas width (global) |
| `svgHeight` | 136 | Global | SVGRenderer | Canvas height (global) |
| `offsetx` | 137 | Global | SVGRenderer | Origin offset X (global) |
| `offsety` | 138 | Global | SVGRenderer | Origin offset Y (global) |
| `viewBoxWidth` | 145 | Global | SVGRenderer | ViewBox width (global) |
| `viewBoxHeight` | 146 | Global | SVGRenderer | ViewBox height (global) |
| `zoomFactor` | 147 | Global | **AnimationScene** | Current zoom level (per-config) |
| `panx` | 148 | Global | **AnimationScene** | Pan offset X (per-config) |
| `pany` | 149 | Global | **AnimationScene** | Pan offset Y (per-config) |
| `PIXELS_PER_AU` | 132 | Global | SVGRenderer | Scale factor (global) |
| `craftData` | 126 | Global | SVGRenderer | Spacecraft 2D position (global) |

---

## 9. 3D Scene State

| Variable | Line | Current | Proposed | Notes |
|----------|------|---------|----------|-------|
| `earthRadius` | 140 | Global | SceneConfig | Calculated radius |
| `skyRadius` | 141 | Global | SceneConfig | Calculated radius |
| `moonRadius` | 142 | Global | SceneConfig | Calculated radius |
| `trackWidth` | 139 | Global | SceneConfig | Orbit track width |
| `defaultCameraDistance` | 150 | Global | SceneConfig | Default camera distance |
| `sunLongitude` | 101 | Global | SceneState | Sun position for lighting |
| `theSceneHandler` | 227 | Global | - | Scene handler ref |
| `animationScenes` | 228 | Global | - | `{geo: AnimationScene, lunar: AnimationScene}` |

---

## 10. UI Control State

| Variable | Line | Current | Proposed | Notes |
|----------|------|---------|----------|-------|
| `mouseDown` | 106 | Global | UIState | Mouse button state |
| `mousedownTimeout` | 186 | Global | UIState | Zoom repeat timeout |
| `timeoutHandle` | 182 | Global | UIState | Animation timeout |
| `timeoutHandleZoom` | 183 | Global | UIState | Zoom timeout |
| `stopZoom` | 100 | Global | UIState | Zoom stop flag |
| `animDate` | 170 | Global | UIState | Date display element ref |

---

## 11. FPS/Performance State

| Variable | Line | Current | Proposed | Notes |
|----------|------|---------|----------|-------|
| `fpsFrameCount` | 189 | Global | FPSCounter | Frame counter |
| `fpsLastTime` | 190 | Global | FPSCounter | Last FPS calculation time |
| `fpsUpdateInterval` | 191 | Global | FPSCounter | Update interval (1000ms) |

---

## 12. Mode Flags

| Variable | Line | Current | Proposed | Notes |
|----------|------|---------|----------|-------|
| `missionStartCalled` | 82 | Global | AppState | Init flag |
| `bannerShown` | 99 | Global | AppState | One-time flag |
| `progress` | 98 | Global | AppState | Loading progress |
| `joyRideFlag` | 230 | Global | AppState | Joy ride mode |
| `landingFlag` | 231 | Global | AppState | Landing mode |
| `moonPhaseCamera` | 232 | Global | AppState | Moon phase view |
| `craftId` | 80 | Global | AppState | Active spacecraft ID |

---

## 13. Per-Config State (Already in AnimationScene)

These are already stored per-config in `animationScenes["geo"]` and `animationScenes["lunar"]`:

| Property | Notes |
|----------|-------|
| `lockOnSC`, `lockOnMoon`, `lockOnEarth` | Camera lock targets |
| `lockOnXY`, `lockOnYZ`, `lockOnZX` | Plane locks |
| `lockOnXYMinus`, `lockOnYZMinus`, `lockOnZXMinus` | Negative plane locks |
| `previousLockOn*` | Previous lock states |
| `primaryBody3D`, `secondaryBody3D` | 3D body references |
| `primaryBody`, `secondaryBody` | Body names |
| `primaryBodyRadius` | Primary body radius |
| `planetsForOrbits`, `planetsForLocations` | Planet lists |
| `orbits` | Orbit data |
| `curve`, `landingCurve` | Orbit curves |
| `curveVelocities`, `landingCurveVelocities` | Velocity data |
| `earth`, `earthContainer`, `earthAxis` | Earth 3D objects |
| `moon`, `moonContainer`, `moonAxis` | Moon 3D objects |
| `craft` | Spacecraft 3D object |
| `camera`, `cameraControls`, `cameraController` | Camera objects |
| `scene`, `renderer` | THREE.js scene/renderer |
| `skyRenderer`, `earthRenderer`, `moonRenderer` | Renderer instances |
| `spacecraftRenderer`, `lightManager`, `sceneHelpers` | More renderers |
| `locations` | Location markers |
| `stepDurationInMilliSeconds` | Time step for this config |
| `state` | Scene initialization state |
| `initialized3D` | 3D init flag |
| `stopCreationFlag` | Creation abort flag |

---

## Summary: Variable Count by Proposed Scope

| Proposed Scope | Count | Description |
|----------------|-------|-------------|
| AppConfig | 8 | Read-only constants |
| AppState | 12 | Active selections, mode flags |
| DataManager | 15 | Data loading state |
| AnimationController | 12 | Time/playback (partially exists) |
| MissionState | 12 | Mission boundaries, events |
| ViewSettings | 11 | UI checkboxes (global toggles) |
| SVGRenderer | 12 | 2D rendering state (global parts) |
| SceneConfig | 5 | 3D scene constants |
| UIState | 6 | Mouse/timeout state |
| FPSCounter | 3 | Performance tracking |
| **AnimationScene** | **47+** | Per-config (existing + plane + zoom) |

**Total: ~140 variables** (excluding AnimationScene internals)

---

## Proposed Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         GLOBAL STATE                            │
├─────────────────────────────────────────────────────────────────┤
│  AppConfig (readonly)     │  ViewSettings (UI toggles)          │
│  - planetProperties       │  - viewPoles, viewSky, viewFPS      │
│  - FORMAT_METRIC          │  - viewEclipticPlane, etc.          │
│  - planeCameraConfig      │                                     │
├───────────────────────────┼─────────────────────────────────────┤
│  AppState (active state)  │  MissionState (mission config)      │
│  - config ("geo"/"lunar") │  - startTime, endTime               │
│  - currentDimension       │  - eventInfos                       │
│  - joyRideFlag            │  - timeTransLunarInjection          │
├───────────────────────────┼─────────────────────────────────────┤
│  AnimationController      │  DataManager                        │
│  - animTime (source)      │  - chebyshevData[config]            │
│  - animTimeStepMinutes    │  - orbitDataLoaded[config]          │
│  - animationRunning       │  - globalConfig                     │
├───────────────────────────┼─────────────────────────────────────┤
│  SVGRenderer (2D global)  │  UIState                            │
│  - svgContainer           │  - mouseDown, timeoutHandle         │
│  - svgWidth, svgHeight    │                                     │
│  - PIXELS_PER_AU          │  FPSCounter                         │
│  - offsetx, offsety       │  - fpsFrameCount, fpsLastTime       │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│              PER-CONFIG STATE (AnimationScene)                  │
│                    animationScenes["geo"]                       │
│                    animationScenes["lunar"]                     │
├─────────────────────────────────────────────────────────────────┤
│  Camera/View (per-config)    │  3D Objects (existing)           │
│  - planeSelection            │  - earth, moon, craft            │
│  - plane, xVariable, etc.    │  - camera, scene, renderer       │
│  - zoomFactor, panx, pany    │  - renderers (sky, earth, etc.)  │
│  - lockOnSC, lockOnMoon      │                                  │
├──────────────────────────────┼──────────────────────────────────┤
│  Data (per-config)           │  Scene Config (per-config)       │
│  - orbits, curve             │  - primaryBody, secondaryBody    │
│  - planetsForOrbits          │  - primaryBodyRadius             │
│  - planetsForLocations       │  - stepDurationInMilliSeconds    │
└─────────────────────────────────────────────────────────────────┘
```

### State Flow

1. **User changes config (geo ↔ lunar)**
   - AppState.config changes
   - Active AnimationScene switches
   - UI updates from per-config state (zoom, plane, locks)

2. **User toggles view setting (e.g., viewPoles)**
   - ViewSettings updates
   - Applied to ALL AnimationScenes

3. **Animation tick**
   - AnimationController.animTime advances
   - Both AnimationScenes update positions (but only active one renders)

---

## Decisions Made

1. **`zoomFactor`, `panx`, `pany` → PER-CONFIG** ✅
   - Different zoom levels for Earth view vs Moon view
   - Move to AnimationScene

2. **`planeSelection` and plane variables → PER-CONFIG** ✅
   - Different camera angles for geo vs lunar
   - Move to AnimationScene

3. **View settings (viewPoles, viewSky, etc.) → GLOBAL** ✅
   - User expectation: toggle affects all views
   - Keep in ViewSettings singleton

---

## Remaining Design Questions

1. **Where does `animTime` belong?**
   - Currently synced between AnimationController and global
   - Should be single source of truth in AnimationController

2. **How to handle `config` variable?**
   - Used everywhere to index into keyed objects
   - Should be a getter from AppState

---

## Functional Inner Core Design

### Philosophy

**Functional core / imperative shell** - Pure calculation functions at the center, state updates only at the outer layer.

```
┌─────────────────────────────────────────────────────────────────┐
│                      IMPERATIVE SHELL                           │
│  (DOM updates, 3D object mutations, global state writes)        │
├─────────────────────────────────────────────────────────────────┤
│                      FUNCTIONAL CORE                            │
│  (Pure functions: time → positions, telemetry, phase)           │
└─────────────────────────────────────────────────────────────────┘
```

### Analysis of setLocation() (lines 2447-2704)

**Current structure:**
1. Ephemeris calculation → mutates `sunLongitude`
2. DOM update → `animDate.html()`
3. Light/camera updates → mutates 3D objects
4. Loop over bodies:
   - Pure: `getBodyLocation()` → position/velocity
   - Pure: coordinate transforms
   - Side effect: DOM updates (`d3.select("#...").attr()`)
   - Side effect: 3D object updates (`.position.set()`)
5. Telemetry calculations (pure) → DOM updates (side effect)
6. Phase detection (pure) → DOM updates (side effect)
7. Event detection (pure) → DOM updates (side effect)

### Pure Functions to Extract

#### 1. `computeSunLongitude(time)` → number

```javascript
// Input: time (ms since epoch)
// Output: sun longitude in radians
function computeSunLongitude(time) {
    const ephemDate = getDateComponentsUTC(time);
    $const.tlong = 0.0;
    $const.glat = 0.0;
    $processor.init();
    const ephemSun = $moshier.body.sun;
    $processor.calc(ephemDate, ephemSun);
    return degreesToRadians(ephemSun.position.apparentLongitude);
}
```

#### 2. `computeBodyState(bodyId, time, config, data)` → BodyState

```javascript
// Input: bodyId, time, config, chebyshev data
// Output: { position: Vector3, velocity: Vector3, available: boolean }
function computeBodyState(bodyId, time, config, data) {
    // Delegates to getBodyLocation() logic
    // Returns pure data object, no THREE.Vector3 dependency
    return {
        position: { x, y, z },
        velocity: { vx, vy, vz },
        available: true
    };
}
```

#### 3. `computeScreenCoordinates(position, scale)` → { x, y, z }

```javascript
// Input: position in km, scale (PIXELS_PER_AU, KM_PER_AU)
// Output: position in screen coordinates
function computeScreenCoordinates(pos, pixelsPerAU, kmPerAU) {
    return {
        x: (pos.x / kmPerAU) * pixelsPerAU,
        y: (pos.y / kmPerAU) * pixelsPerAU,
        z: (pos.z / kmPerAU) * pixelsPerAU
    };
}
```

#### 4. `projectToPlane(pos3D, planeConfig)` → { x, y, z }

```javascript
// Input: 3D position, plane selection variables
// Output: 2D projected coordinates
function projectToPlane(pos, vel, planeConfig) {
    const { xVariable, yVariable, zVariable, xFactor, yFactor, zFactor } = planeConfig;
    return {
        x: xFactor * pos[xVariable],
        y: yFactor * pos[yVariable],
        z: zFactor * pos[zVariable],
        vx: xFactor * vel[xVariable],
        vy: yFactor * vel[yVariable],
        vz: zFactor * vel[zVariable]
    };
}
```

#### 5. `computeTelemetry(scState, config, moonState, earthState)` → Telemetry

```javascript
// Input: spacecraft state, config, reference body states
// Output: computed telemetry values
function computeTelemetry(scState, config, moonState, earthState) {
    const primaryRadius = config === 'geo' ? PC.EARTH_RADIUS_KM : PC.MOON_RADIUS_KM;
    const r = magnitude(scState.position);
    const v = magnitude(scState.velocity);

    return {
        distancePrimary: r,
        altitudePrimary: r - primaryRadius,
        velocityPrimary: v,
        // Relative to secondary body
        distanceMoon: config === 'geo' && moonState ? distance(scState.position, moonState.position) : null,
        altitudeMoon: config === 'geo' && moonState ? distance(scState.position, moonState.position) - PC.MOON_RADIUS_KM : null,
        velocityMoon: config === 'geo' && moonState ? distance(scState.velocity, moonState.velocity) : null,
        distanceEarth: config === 'lunar' && earthState ? distance(scState.position, earthState.position) : null,
        altitudeEarth: config === 'lunar' && earthState ? distance(scState.position, earthState.position) - PC.EARTH_RADIUS_KM : null,
        velocityEarth: config === 'lunar' && earthState ? distance(scState.velocity, earthState.velocity) : null
    };
}
```

#### 6. `determinePhase(time, missionTimes)` → string

```javascript
// Input: time, mission time boundaries
// Output: current phase name
function determinePhase(time, missionTimes) {
    const { timeTransLunarInjection, timeLunarOrbitInsertion } = missionTimes;
    if (time < timeTransLunarInjection) return 'earth-bound';
    if (time < timeLunarOrbitInsertion) return 'lunar-bound';
    return 'lunar-orbit';
}
```

#### 7. `findActiveEvent(time, eventInfos)` → Event | null

```javascript
// Input: time, event definitions
// Output: active event or null
function findActiveEvent(time, eventInfos) {
    const BURN_WINDOW_MS = 20 * 60 * 1000; // 20 minutes
    for (const event of eventInfos) {
        if (!event.burnFlag) continue;
        const burnTime = event.startTime.getTime();
        if (Math.abs(time - burnTime) < BURN_WINDOW_MS) {
            return event;
        }
    }
    return null;
}
```

### Composite Function: `computeSceneState()`

```javascript
/**
 * Pure function that computes all scene state from time
 * @param {number} time - Animation time (ms since epoch)
 * @param {string} config - 'geo' or 'lunar'
 * @param {Object} options - Data and configuration
 * @returns {SceneState} Complete scene state for rendering
 */
function computeSceneState(time, config, options) {
    const {
        chebyshevData,
        landingChebyshevData,
        globalConfig,
        planeConfig,
        eventInfos,
        missionTimes,
        planetsForLocations
    } = options;

    // 1. Sun position
    const sunLongitude = computeSunLongitude(time);

    // 2. Body states
    const bodies = {};
    for (const bodyId of planetsForLocations) {
        bodies[bodyId] = computeBodyState(bodyId, time, config, {
            chebyshevData,
            landingChebyshevData,
            globalConfig
        });
    }

    // 3. Telemetry (for SC only)
    const telemetry = bodies.SC?.available
        ? computeTelemetry(bodies.SC, config, bodies.MOON, bodies.EARTH)
        : null;

    // 4. Phase and events
    const phase = globalConfig?.is_lunar
        ? determinePhase(time, missionTimes)
        : null;
    const activeEvent = findActiveEvent(time, eventInfos);

    return {
        time,
        config,
        sunLongitude,
        bodies,
        telemetry,
        phase,
        activeEvent
    };
}
```

### Refactored setLocation()

```javascript
function setLocation() {
    if (!orbitDataProcessed[config]) return;

    // === FUNCTIONAL CORE: Compute all state ===
    const sceneState = computeSceneState(animTime, config, {
        chebyshevData,
        landingChebyshevData,
        globalConfig,
        planeConfig: { xVariable, yVariable, zVariable, xFactor, yFactor, zFactor },
        eventInfos,
        missionTimes: { timeTransLunarInjection, timeLunarOrbitInsertion },
        planetsForLocations: animationScenes[config].planetsForLocations
    });

    // === IMPERATIVE SHELL: Apply state to DOM/3D ===
    applySceneState(sceneState, {
        dimension: currentDimension,
        animationScene: animationScenes[config],
        zoomFactor
    });
}

function applySceneState(state, renderOptions) {
    // Update date display
    animDate.html(new Date(state.time));

    // Update lighting
    if (renderOptions.dimension === '3D') {
        updateLighting(state.sunLongitude, renderOptions.animationScene);
    }

    // Update body positions
    for (const [bodyId, bodyState] of Object.entries(state.bodies)) {
        if (!bodyState.available) continue;

        if (renderOptions.dimension === '2D') {
            update2DBody(bodyId, bodyState, renderOptions);
        }
        if (renderOptions.dimension === '3D') {
            update3DBody(bodyId, bodyState, renderOptions);
        }
    }

    // Update telemetry display
    if (state.telemetry) {
        updateTelemetryDisplay(state.telemetry, state.config);
    }

    // Update phase indicator
    if (state.phase) {
        updatePhaseDisplay(state.phase);
    }

    // Update burn indicator
    updateEventDisplay(state.activeEvent, renderOptions);

    render();
}
```

### File Structure

```
assets/platform/js/
├── mission.js           # Main file (imperative shell)
├── scene-state.js       # NEW: Functional core
│   ├── computeSceneState()
│   ├── computeSunLongitude()
│   ├── computeBodyState()
│   ├── computeTelemetry()
│   ├── determinePhase()
│   └── findActiveEvent()
├── math-utils.js        # Existing
├── time-utils.js        # Existing
└── ...
```

### Benefits

1. **Testable**: Pure functions can be unit tested without DOM/3D dependencies
2. **Predictable**: Same inputs always produce same outputs
3. **Composable**: Functions can be combined for different use cases
4. **Debuggable**: State can be logged/inspected at any point
5. **Parallelizable**: Pure computations could run in web workers

---

## Pull-Based Renderer Architecture

### Design Decision

Instead of pub-sub (push), use a **pull model** where:
- Animation loop explicitly pulls state from SceneStateController
- Animation loop passes state to the appropriate renderer
- Renderers are passive - they receive state and render

### Why Pull?

1. **Only one dimension active** - No need to broadcast to multiple listeners
2. **Animation loop already exists** - It drives timing, natural place to orchestrate
3. **Simpler mental model** - State flows down, not sideways
4. **Renderers become stateless** - `render(state)` → side effects

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Animation Loop                            │
│  (orchestrates timing and rendering)                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ 1. pulls state
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SceneStateController                          │
│  computeState(time, config) → SceneState                        │
│  (pure functions from scene-state.js)                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ 2. passes state to renderer
                              ▼
        ┌─────────────────────┴─────────────────────┐
        │                                           │
        ▼                                           ▼
┌───────────────────────┐                 ┌───────────────────────┐
│ Animation2DController │                 │ Animation3DController │
│ (per config)          │                 │ (per config)          │
├───────────────────────┤                 ├───────────────────────┤
│ render(state)         │                 │ render(state)         │
│ - Updates SVG/DOM     │                 │ - Updates THREE.js    │
│ - Handles zoom/pan    │                 │ - Updates lighting    │
│ - Labels, telemetry   │                 │ - Camera, spacecraft  │
└───────────────────────┘                 └───────────────────────┘

Instances:
- animation2DControllers["geo"]
- animation2DControllers["lunar"]
- animation3DControllers["geo"]
- animation3DControllers["lunar"]
```

### Animation Loop (Refactored)

```javascript
function animate() {
    // ... timing logic ...

    // 1. Pull state from functional core
    const state = sceneStateController.computeState(animTime, config, {
        chebyshevData,
        chebyshevDataLoaded,
        landingChebyshevData,
        landingChebyshevLoaded,
        globalConfig,
        startLandingTime,
        endLandingTime,
        eventInfos,
        missionTimes: { timeTransLunarInjection, timeLunarOrbitInsertion },
        planetsForLocations: animationScenes[config].planetsForLocations
    });

    // 2. Pass state to appropriate renderer
    if (currentDimension === "3D") {
        animation3DControllers[config].render(state);
    } else {
        animation2DControllers[config].render(state);
    }

    // 3. Update shared UI (telemetry, phase, events)
    updateSharedUI(state);
}
```

### Controller Interfaces

```javascript
/**
 * Animation3DController - Renders 3D scene from state
 */
class Animation3DController {
    constructor(config, animationScene) {
        this.config = config;           // "geo" or "lunar"
        this.scene = animationScene;    // THREE.js scene wrapper
    }

    render(state) {
        // Update lighting from sun position
        this.updateLighting(state.sunLongitude);

        // Update body positions
        for (const [bodyId, bodyState] of Object.entries(state.bodies)) {
            if (!bodyState.available) continue;
            this.updateBodyPosition(bodyId, bodyState);
        }

        // Update spacecraft orientation
        this.updateSpacecraftOrientation(state);

        // Rotate Earth/Moon based on time
        this.scene.rotateEarth();
        this.scene.rotateMoon();

        // Render the scene
        this.scene.renderer.render(this.scene.scene, this.scene.camera);
    }
}

/**
 * Animation2DController - Renders 2D SVG from state
 */
class Animation2DController {
    constructor(config, planeConfig) {
        this.config = config;           // "geo" or "lunar"
        this.planeConfig = planeConfig; // xVariable, yVariable, etc.
    }

    render(state) {
        // Update body positions in SVG
        for (const [bodyId, bodyState] of Object.entries(state.bodies)) {
            if (!bodyState.available) {
                this.hideBody(bodyId);
                continue;
            }
            this.updateBodyPosition(bodyId, bodyState);
        }

        // Update labels
        this.updateLabels(state);

        // Update burn indicator
        this.updateBurnIndicator(state);

        // Apply zoom/pan transform
        this.applyTransform();
    }
}
```

### File Structure (Updated)

```
assets/platform/js/
├── mission.js                    # Animation loop, initialization
├── scene-state.js                # Functional core (state computation)
├── controllers/
│   ├── animation-3d-controller.js   # 3D rendering (per-config)
│   └── animation-2d-controller.js   # 2D rendering (per-config)
├── rendering/                    # Existing renderers (used by controllers)
│   ├── sky-renderer.js
│   ├── earth-renderer.js
│   ├── moon-renderer.js
│   └── spacecraft-renderer.js
├── utils/
│   ├── math-utils.js
│   └── time-utils.js
└── ...
```

### Migration Strategy

1. **Create Animation3DController** - Extract 3D rendering logic from setLocation()
2. **Create Animation2DController** - Extract 2D rendering logic from setLocation()
3. **Refactor animation loop** - Use pull model with controllers
4. **Deprecate setLocation()** - Replace with controller.render(state)
5. **Run visual regression tests** - Verify no changes
