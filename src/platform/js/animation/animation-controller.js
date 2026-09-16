/**
 * Animation Controller Module
 *
 * Manages animation state including play/pause, speed control, and time navigation.
 * Extracted from mission.js to centralize animation logic.
 *
 * Design: The controller is decoupled from DOM and scene specifics.
 * It uses callbacks to notify when time changes or play state changes.
 */

import { TIME_CONSTANTS as TC } from "../core/constants.js";

const DISCRETE_SIM_SPEEDS = [
    { label: "1 min/sec", ratio: 60 },
    { label: "5 min/sec", ratio: 300 },
    { label: "15 min/sec", ratio: 900 },
    { label: "30 min/sec", ratio: 1800 },
    { label: "1 hr/sec", ratio: 3600 },
    { label: "3 hr/sec", ratio: 10800 },
    { label: "6 hr/sec", ratio: 21600 },
    { label: "12 hr/sec", ratio: 43200 },
    { label: "1 day/sec", ratio: 86400 },
];

/**
 * AnimationController manages the animation timeline and playback state.
 */
export class AnimationController {
    /**
     * Create an AnimationController.
     * @param {Object} options - Configuration options
     * @param {Function} options.onTimeChange - Callback when animation time changes
     * @param {Function} options.onPlayStateChange - Callback when play/pause state changes
     * @param {Function} options.onSpeedChange - Callback when speed changes
     */
    constructor(options = /** @type {any} */ ({}) ) {
        /** @type {{ onTimeChange?: Function, onPlayStateChange?: Function, onSpeedChange?: Function }} */
        const normalizedOptions = options || {};
        // Callbacks
        this.onTimeChange = normalizedOptions.onTimeChange || (() => {});
        this.onPlayStateChange = normalizedOptions.onPlayStateChange || (() => {});
        this.onSpeedChange = normalizedOptions.onSpeedChange || (() => {});

        // Time boundaries (set via configure())
        this.startTime = 0;
        this.endTime = 0;
        this.stepDurationMs = TC.ONE_MINUTE_MS;
        this.stepsPerHop = 60; // For fast forward/backward

        // Animation state
        this.currentTime = 0;
        this.isRunning = false;
        this.stopFlag = false;

        // Speed control
        this.speedIndex = 0;
        this.speedMultiplier = DISCRETE_SIM_SPEEDS[this.speedIndex].ratio;
        this.isRealtimeSpeed = true;

        // Frame timing
        this.prevFrameTime = null;
        this.deltaFrameTime = 0;

        // Timeout handle for stopping
        this.timeoutHandle = null;
    }

    /**
     * Configure the controller with mission-specific timing.
     * @param {Object} config - Configuration object
     * @param {number} config.startTime - Start time in milliseconds
     * @param {number} config.endTime - End time in milliseconds
     * @param {number} [config.stepDurationMs] - Step duration in milliseconds
     * @param {number} [config.stepsPerHop] - Number of steps for fast forward/backward
     */
    configure(config) {
        this.startTime = config.startTime;
        this.endTime = config.endTime;
        this.stepDurationMs = config.stepDurationMs || TC.ONE_MINUTE_MS;
        this.stepsPerHop = config.stepsPerHop || 60;

        // Initialize current time to start
        if (this.currentTime === 0 || this.currentTime < this.startTime) {
            this.currentTime = this.startTime;
        }
    }

    /**
     * Get the current animation time.
     * @returns {number} Current time in milliseconds
     */
    getTime() {
        return this.currentTime;
    }

    /**
     * Set the current animation time (with bounds checking).
     * @param {number} time - Time in milliseconds
     * @param {boolean} [notify=true] - Whether to trigger onTimeChange callback
     * @param {Object} [metadata] - Optional source metadata for downstream coordination
     */
    setTime(time, notify = true, metadata = {}) {
        // Clamp to valid range
        if (time < this.startTime) {
            this.currentTime = this.startTime;
        } else if (time > this.endTime) {
            this.currentTime = this.endTime;
        } else {
            this.currentTime = time;
        }

        if (notify) {
            this.onTimeChange(this.currentTime, metadata || {});
        }
    }

    /**
     * Check if animation is currently running.
     * @returns {boolean} True if running
     */
    getIsRunning() {
        return this.isRunning;
    }

    /**
     * Toggle play/pause state.
     */
    toggle() {
        if (this.isRunning) {
            this.pause();
        } else {
            this.play();
        }
    }

    /**
     * Start playing the animation.
     */
    play() {
        // If at end, restart from beginning
        if (this.currentTime >= this.endTime) {
            this.setTime(this.startTime, true, {
                source: "transport-restart",
                phase: "commit",
                commit: true,
                seekEvent: true,
            });
        }

        // Discard stale frame timing so resume-after-seek starts from a fresh baseline.
        this.prevFrameTime = null;
        this.deltaFrameTime = 0;
        this.isRunning = true;
        this.stopFlag = false;
        this.onPlayStateChange(true);
    }

    /**
     * Pause the animation.
     */
    pause() {
        this.isRunning = false;
        this.stopFlag = true;

        if (this.timeoutHandle) {
            clearTimeout(this.timeoutHandle);
            this.timeoutHandle = null;
        }

        this.onPlayStateChange(false);
    }

    /**
     * Alias for pause() - stops the animation.
     */
    stop() {
        this.pause();
    }

    /**
     * Step forward by one step.
     */
    stepForward() {
        this.setTime(this.currentTime + this.stepDurationMs, true, {
            source: "transport-forward",
            phase: "commit",
            commit: true,
            seekEvent: true,
        });
    }

    /**
     * Step backward by one step.
     */
    stepBackward() {
        this.setTime(this.currentTime - this.stepDurationMs, true, {
            source: "transport-backward",
            phase: "commit",
            commit: true,
            seekEvent: true,
        });
    }

    /**
     * Fast forward by multiple steps.
     */
    fastForward() {
        this.setTime(this.currentTime + this.stepsPerHop * this.stepDurationMs, true, {
            source: "transport-fast-forward",
            phase: "commit",
            commit: true,
            seekEvent: true,
        });
    }

    /**
     * Fast backward by multiple steps.
     */
    fastBackward() {
        this.setTime(this.currentTime - this.stepsPerHop * this.stepDurationMs, true, {
            source: "transport-fast-backward",
            phase: "commit",
            commit: true,
            seekEvent: true,
        });
    }

    /**
     * Go to the start of the animation.
     */
    goToStart() {
        this.pause();
        this.setTime(this.startTime, true, {
            source: "mission-start",
            phase: "commit",
            commit: true,
            seekEvent: true,
        });
    }

    /**
     * Go to the end of the animation.
     */
    goToEnd() {
        this.pause();
        this.setTime(this.endTime, true, {
            source: "mission-end",
            phase: "commit",
            commit: true,
            seekEvent: true,
        });
    }

    /**
     * Go to a specific event time.
     * @param {number} time - Event time in milliseconds
     * @param {Object} [metadata] - Optional source metadata for downstream coordination
     */
    goToEvent(time, metadata = {}) {
        this.setTime(time, true, {
            source: "mission-event",
            phase: "commit",
            commit: true,
            seekEvent: true,
            ...(metadata || {}),
        });
    }

    /**
     * Go to the current real-world time (if within bounds).
     */
    goToNow() {
        this.pause();
        this.setTime(Date.now(), true, {
            source: "mission-now",
            phase: "commit",
            commit: true,
            seekEvent: true,
        });
    }

    /**
     * Increase animation speed.
     */
    faster() {
        if (this.isRealtimeSpeed) {
            this.isRealtimeSpeed = false;
            this.speedIndex = 0;
            this.speedMultiplier = DISCRETE_SIM_SPEEDS[this.speedIndex].ratio;
        } else {
            this.speedIndex = Math.min(this.speedIndex + 1, DISCRETE_SIM_SPEEDS.length - 1);
            this.speedMultiplier = DISCRETE_SIM_SPEEDS[this.speedIndex].ratio;
        }
        this.onSpeedChange(this.speedMultiplier, this.isRealtimeSpeed);
    }

    /**
     * Decrease animation speed.
     */
    slower() {
        if (this.isRealtimeSpeed) {
            this.onSpeedChange(this.speedMultiplier, this.isRealtimeSpeed);
            return;
        } else if (this.speedIndex <= 0) {
            this.isRealtimeSpeed = true;
        } else {
            this.speedIndex -= 1;
            this.speedMultiplier = DISCRETE_SIM_SPEEDS[this.speedIndex].ratio;
        }
        this.onSpeedChange(this.speedMultiplier, this.isRealtimeSpeed);
    }

    /**
     * Reset speed to 1 min/sec.
     */
    resetSpeed() {
        this.isRealtimeSpeed = false;
        this.speedIndex = 0;
        this.speedMultiplier = DISCRETE_SIM_SPEEDS[this.speedIndex].ratio;
        this.onSpeedChange(this.speedMultiplier, this.isRealtimeSpeed);
    }

    /**
     * Set realtime speed mode.
     */
    setRealtimeSpeed() {
        this.isRealtimeSpeed = true;
        this.onSpeedChange(this.speedMultiplier, this.isRealtimeSpeed);
    }

    /**
     * Get current speed multiplier.
     * @returns {number} Speed multiplier
     */
    getSpeedMultiplier() {
        return this.speedMultiplier;
    }

    /**
     * Check if in realtime speed mode.
     * @returns {boolean} True if realtime
     */
    getIsRealtimeSpeed() {
        return this.isRealtimeSpeed;
    }

    /**
     * Called each animation frame to advance time if running.
     * Should be called from the main animation loop.
     * @param {number} currentFrameTime - Current timestamp from performance.now() or Date.now()
     * @returns {boolean} True if time was updated
     */
    tick(currentFrameTime) {
        // Calculate delta time
        if (this.prevFrameTime !== null) {
            this.deltaFrameTime = currentFrameTime - this.prevFrameTime;
        } else {
            this.deltaFrameTime = 0;
        }
        this.prevFrameTime = currentFrameTime;

        if (!this.isRunning) {
            return false;
        }

        // Advance time based on speed mode
        let newTime;
        if (this.isRealtimeSpeed) {
            newTime = this.currentTime + this.deltaFrameTime;
        } else {
            // speedMultiplier is "sim-seconds per real-second"
            // e.g. 60 means 1 min/sec => advance by deltaFrameTime * 60.
            newTime = this.currentTime + this.deltaFrameTime * this.speedMultiplier;
        }

        // Check bounds
        if (newTime > this.endTime) {
            newTime = this.endTime;
            this.currentTime = newTime;
            this.pause(); // Stop at end
            this.onTimeChange(this.currentTime, {
                source: "animation-tick",
                seekEvent: false,
            });
            return true;
        }

        this.currentTime = newTime;
        this.onTimeChange(this.currentTime, {
            source: "animation-tick",
            seekEvent: false,
        });
        return true;
    }

    /**
     * Dispose of the controller and clean up.
     */
    dispose() {
        this.pause();
        this.onTimeChange = () => {};
        this.onPlayStateChange = () => {};
        this.onSpeedChange = () => {};
    }
}
