import { isMissionPanelEnabled, shouldMissionPanelAutoOpenBeforeEvent } from "./panel-defaults.js";
import { resolveCurrentMissionKey } from "../core/domain/current-mission.js";
import {
    GROUND_TRACK_PANEL_REGISTRY_ID,
    GROUND_TRACK_START_EVENT_KEY,
} from "./ground-track-config.js";

function readCssPx(name, fallback = 0) {
    const value = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
    return Number.isFinite(value) ? value : fallback;
}

function parseMissionTimeMs(value) {
    if (typeof value !== "string" || value.length === 0) return Number.NaN;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function deriveGeoOrbitChebUrl(url) {
    if (typeof url !== "string" || url.length === 0) return "";
    return url.replace(/(^|[\\/])(geo|lunar|relative)-/i, "$1geo-");
}

function isLegacySplashdownMissionMatch(configData = null) {
    const currentMissionKey = resolveCurrentMissionKey(
        typeof window !== "undefined" ? window : null,
    );
    if (currentMissionKey) {
        return currentMissionKey === "artemis2";
    }
    const missionName = String(configData?.mission_name || configData?.mission_name_short || "")
        .trim()
        .toLowerCase();
    return missionName === "artemis 2" || missionName === "artemis ii";
}

function isSplashdownPanelMissionEnabled(configData = null) {
    return isMissionPanelEnabled(
        configData,
        GROUND_TRACK_PANEL_REGISTRY_ID,
        { fallbackEnabled: isLegacySplashdownMissionMatch(configData) },
    );
}

function shouldAutoOpenSplashdownPanel(configData, nowMs = Date.now()) {
    if (!isSplashdownPanelMissionEnabled(configData)) {
        return false;
    }
    const autoOpenEnabled = shouldMissionPanelAutoOpenBeforeEvent(
        configData,
        GROUND_TRACK_PANEL_REGISTRY_ID,
        { fallback: isLegacySplashdownMissionMatch(configData) },
    );
    if (!autoOpenEnabled) {
        return false;
    }
    const splashdownMs = parseMissionTimeMs(configData?.events?.splashdown?.startTime);
    if (!Number.isFinite(splashdownMs) || !Number.isFinite(nowMs)) {
        return false;
    }
    return nowMs < splashdownMs;
}

function resolveGroundTrackWindowMs(configData, phaseKey = "geo") {
    const phaseConfig = phaseKey === "lunar"
        ? (configData?.lunar || configData?.geo)
        : (configData?.geo || configData?.lunar);
    return {
        startMs: parseMissionTimeMs(configData?.events?.[GROUND_TRACK_START_EVENT_KEY]?.startTime),
        endMs: parseMissionTimeMs(phaseConfig?.endTime),
    };
}

function resolvePostHorizonExtension(configData, phaseKey = "geo") {
    if (phaseKey !== "geo" && phaseKey !== "lunar") return null;
    const extension = configData?.postHorizonExtension;
    if (!extension || typeof extension !== "object" || extension.enabled === false) {
        return null;
    }
    const sourceEndMs = parseMissionTimeMs(extension?.sourceEndTime);
    if (!Number.isFinite(sourceEndMs)) return null;
    const phaseConfig = phaseKey === "lunar"
        ? (configData?.lunar || configData?.geo)
        : (configData?.geo || configData?.lunar);
    const phaseEndMs = parseMissionTimeMs(phaseConfig?.endTime);
    if (!Number.isFinite(phaseEndMs) || phaseEndMs <= sourceEndMs) {
        return null;
    }
    const provenance = extension?.provenance && typeof extension.provenance === "object"
        ? extension.provenance
        : {};
    return {
        sourceEndMs,
        segmentLabel: String(provenance?.segmentLabel || "Ballistic splashdown continuation").trim(),
        shortLabel: String(provenance?.shortLabel || "Generated final descent").trim(),
        summary: String(provenance?.summary || "").trim(),
        uiNote: String(provenance?.uiNote || "").trim(),
    };
}
export {
    readCssPx,
    parseMissionTimeMs,
    deriveGeoOrbitChebUrl,
    isSplashdownPanelMissionEnabled,
    shouldAutoOpenSplashdownPanel,
    resolveGroundTrackWindowMs,
    resolvePostHorizonExtension,
};
