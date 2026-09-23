import { normalizeMissionMediaManifest } from "../core/domain/media-manifest.js";
import { getMissionDataPath } from "../data/mission-data.js";
import { getMissionMediaDataPath, getMissionMediaManifestUrl, loadMissionMediaManifest } from "../data/mission-media.js";

export function createMediaManifestOwner({ runtimeMediaState, invalidateMediaDataCaches, onOwnerReplaced, isDisposed }) {
    let manifestPromise = null;
    let manifestOwner = null;
    let manifestAttempt = null;

    function syncManifestOwner() {
        const url = getMissionMediaManifestUrl() || "";
        if (manifestOwner?.url === url) return;
        const previousOwner = manifestOwner;
        manifestOwner = { url, dataPath: getMissionMediaDataPath() || getMissionDataPath() || "" };
        manifestAttempt = null;
        manifestPromise = null;
        runtimeMediaState.setManifest(null);
        runtimeMediaState.setLoadState("idle");
        runtimeMediaState.setActiveItemId("");
        invalidateMediaDataCaches();
        if (previousOwner) onOwnerReplaced();
    }

    async function ensureManifestLoaded({ retry = false } = {}) {
        if (isDisposed()) return null;
        syncManifestOwner();
        const loadState = runtimeMediaState.getLoadState();
        if (loadState === "ready" || loadState === "unavailable" || (loadState === "error" && !retry)) {
            return runtimeMediaState.getManifest();
        }
        if (manifestPromise) {
            return manifestPromise;
        }

        const owner = manifestOwner;
        const attempt = {};
        manifestAttempt = attempt;
        const isCurrent = () => !isDisposed() && manifestOwner === owner && manifestAttempt === attempt &&
            (getMissionMediaManifestUrl() || "") === owner.url;
        runtimeMediaState.setLoadState("loading");
        manifestPromise = loadMissionMediaManifest()
            .then((manifestData) => {
                if (!isCurrent()) return null;
                if (!manifestData) {
                    runtimeMediaState.setManifest(null);
                    runtimeMediaState.setLoadState("unavailable");
                    invalidateMediaDataCaches();
                    return null;
                }
                const normalizedManifest = normalizeMissionMediaManifest(manifestData, {
                    dataPath: owner.dataPath,
                });
                runtimeMediaState.setManifest(normalizedManifest);
                runtimeMediaState.setLoadState("ready");
                invalidateMediaDataCaches();
                return normalizedManifest;
            })
            .catch(() => {
                if (!isCurrent()) return null;
                runtimeMediaState.setManifest(null);
                runtimeMediaState.setLoadState("error");
                invalidateMediaDataCaches();
                return null;
            })
            .finally(() => {
                if (manifestAttempt === attempt) manifestPromise = null;
            });

        return manifestPromise;
    }

    return { syncManifestOwner, ensureManifestLoaded };
}
