import {
    normalizeComparisonAlignmentEventKey,
    normalizeComparisonMissionParam,
} from "../core/domain/comparison-overlay.js";
import { isCompareRuntimeMode } from "../core/domain/runtime-mode.js";
import { assembleMissionConfig } from "../core/domain/mission-config-assembly.js";
import {
    resolveMissionConfigUrl,
    resolveMissionManifestUrl,
} from "../core/domain/mission-asset-resolver.js";
import { resolveRuntimeAssetUrl } from "../core/domain/runtime-asset-url.js";
import {
    buildComparisonOverlayAugmentation,
    mergeComparisonOverlayIntoBaseConfig,
} from "./comparison-overlay-model.js";

class ComparisonLoadError extends Error {
    constructor(message, { mission = null, cause } = {}) {
        super(message, { cause });
        this.name = "ComparisonLoadError";
        this.mission = mission;
    }
}

function comparisonFailure(mission, detail, cause = new Error(detail)) {
    const target = mission ? ` with '${mission}'` : "";
    return new ComparisonLoadError(`Could not initialize comparison${target}: ${detail}`, { mission, cause });
}

function asTrimmedString(value, fallback = "") {
    if (typeof value !== "string") return fallback;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
}

function parseCurrentMissionFolder(dataPath) {
    const normalizedDataPath = asTrimmedString(dataPath).replace(/\\/g, "/");
    const match = normalizedDataPath.match(/assets\/([^/]+)\/data\/?$/i);
    return match?.[1] || "";
}

function buildMissionDataPath(folder, windowRef = typeof window !== "undefined" ? window : null) {
    const normalizedFolder = asTrimmedString(folder);
    if (!normalizedFolder) return null;

    const currentDataPath = asTrimmedString(windowRef?.missionConfig?.dataPath).replace(/\\/g, "/");
    const siblingDataPath = currentDataPath.replace(
        /assets\/[^/]+\/data\/?$/i,
        `assets/${normalizedFolder}/data/`,
    );
    if (siblingDataPath !== currentDataPath) {
        return siblingDataPath;
    }

    return resolveRuntimeAssetUrl(`assets/${normalizedFolder}/data/`, {
        baseUrl: windowRef?.missionConfig?.assetBaseUrl,
        globalObject: windowRef || undefined,
    });
}

async function fetchComparisonJson(url, fetchImpl, { mission, label, optional = false }) {
    if (!url) throw comparisonFailure(mission, `The ${label} location is unavailable.`);
    let response;
    try {
        response = await fetchImpl(url, { cache: "no-store" });
    } catch (cause) {
        throw comparisonFailure(mission, `The ${label} request could not be completed.`, cause);
    }
    if (!response?.ok) {
        // Absence is optional; unavailable or malformed metadata is not evidence
        // that it is safe to synthesize replacement asset paths.
        if (optional && response?.status === 404) return undefined;
        const status = Number.isInteger(response?.status) ? ` (HTTP ${response.status})` : "";
        throw comparisonFailure(mission, `The ${label} request failed${status}.`);
    }
    try {
        const payload = await response.json();
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
            throw new Error(`The ${label} must be a JSON object.`);
        }
        return payload;
    } catch (cause) {
        throw comparisonFailure(mission, `The ${label} response is not valid configuration data.`, cause);
    }
}

function resolveSelectedAlignmentEventKeys(params) {
    return {
        selectedPrimaryAlignmentEventKey: normalizeComparisonAlignmentEventKey(
            params?.get("comparePrimaryEvent"),
        ),
        selectedComparisonAlignmentEventKey: normalizeComparisonAlignmentEventKey(
            params?.get("compareSecondaryEvent"),
        ),
    };
}

function validateComparisonManifest(manifest, mission) {
    if (manifest === undefined) return; // Optional 404, not a malformed response.
    const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);
    const isPath = value => typeof value === "string" && value.trim().length > 0;
    const invalid = field => {
        throw comparisonFailure(mission, "The ephemeris manifest is malformed.",
            new Error(`Invalid ephemeris manifest field: ${field}`));
    };
    if (!Object.hasOwn(manifest, "phases")) return;
    if (!isRecord(manifest.phases)) invalid("phases");
    // Match the resolver's structured and legacy phase-level artifact forms.
    // Do not require optional artifacts or impose schemas on unused metadata.
    const artifactKeys = ["json", "chebyshev", "npz", "meta", "sun_chebyshev"];
    for (const [phaseKey, phase] of Object.entries(manifest.phases)) {
        if (!isRecord(phase)) invalid(`phases.${phaseKey}`);
        if (Object.hasOwn(phase, "artifacts") && !isRecord(phase.artifacts)) {
            invalid(`phases.${phaseKey}.artifacts`);
        }
        const artifacts = phase.artifacts || phase;
        for (const key of artifactKeys) {
            if (!Object.hasOwn(artifacts, key)) continue;
            const artifact = artifacts[key];
            if (typeof artifact === "string") {
                if (!isPath(artifact)) invalid(`phases.${phaseKey}.${key}`);
            } else {
                if (!isRecord(artifact)) invalid(`phases.${phaseKey}.${key}`);
                for (const pathKey of ["runtime", "path"]) {
                    if (Object.hasOwn(artifact, pathKey) && !isPath(artifact[pathKey])) {
                        invalid(`phases.${phaseKey}.${key}.${pathKey}`);
                    }
                }
            }
        }
    }
}

async function loadComparisonMissionConfig({
    compareMission,
    comparisonDataPath,
    fetchImpl,
}) {
    const comparisonConfigUrl = resolveMissionConfigUrl(comparisonDataPath);
    const comparisonManifestUrl = resolveMissionManifestUrl(comparisonDataPath);
    const mission = compareMission.folder;
    const baseConfig = await fetchComparisonJson(comparisonConfigUrl, fetchImpl, {
        mission, label: "secondary mission configuration",
    });
    const manifestData = await fetchComparisonJson(comparisonManifestUrl, fetchImpl, {
        mission, label: "ephemeris manifest", optional: true,
    });
    validateComparisonManifest(manifestData, mission);
    let config;
    try {
        ({ config } = assembleMissionConfig({ baseConfig, manifestData }));
    } catch (cause) {
        throw comparisonFailure(mission, "The secondary mission configuration is invalid.", cause);
    }

    return {
        compareMission,
        comparisonDataPath,
        comparisonConfig: config,
    };
}

async function loadComparisonOverlayConfig({
    baseConfig,
    windowRef = typeof window !== "undefined" ? window : null,
    fetchImpl = typeof fetch === "function" ? fetch.bind(globalThis) : null,
    createUTCTimestamp,
}) {
    const params = new URLSearchParams(windowRef?.location?.search || "");
    if (!isCompareRuntimeMode(params.get("mode"))) {
        return baseConfig;
    }

    const normalizedCompareMission = normalizeComparisonMissionParam(params.get("compareMission"));
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(normalizedCompareMission)) {
        throw comparisonFailure(null, "A valid secondary mission must be selected.");
    }
    if (!baseConfig || typeof fetchImpl !== "function") {
        throw comparisonFailure(normalizedCompareMission, "Required mission loading dependencies are unavailable.");
    }

    try {
        const compareMission = {
            folder: normalizedCompareMission,
            missionName: normalizedCompareMission,
        };
        const comparisonDataPath = buildMissionDataPath(compareMission?.folder, windowRef);
        if (!comparisonDataPath) {
            throw comparisonFailure(normalizedCompareMission, "The secondary mission data location is unavailable.");
        }

        const comparisonMissionConfig = await loadComparisonMissionConfig({
            compareMission,
            comparisonDataPath,
            fetchImpl,
        });
        const currentMissionFolder = parseCurrentMissionFolder(windowRef?.missionConfig?.dataPath);
        const {
            selectedPrimaryAlignmentEventKey,
            selectedComparisonAlignmentEventKey,
        } = resolveSelectedAlignmentEventKeys(params);
        const augmentation = buildComparisonOverlayAugmentation({
            baseConfig,
            comparisonConfig: comparisonMissionConfig.comparisonConfig,
            comparisonDataPath,
            compareMission,
            currentMissionFolder,
            createUTCTimestamp,
            selectedPrimaryAlignmentEventKey,
            selectedComparisonAlignmentEventKey,
        });
        if (!augmentation) {
            throw comparisonFailure(normalizedCompareMission, "The mission pair does not provide usable comparison metadata.");
        }
        return mergeComparisonOverlayIntoBaseConfig(baseConfig, augmentation);
    } catch (error) {
        if (error instanceof ComparisonLoadError) throw error;
        throw comparisonFailure(normalizedCompareMission, "Comparison metadata could not be prepared.", error);
    }
}

export { ComparisonLoadError, loadComparisonOverlayConfig };
