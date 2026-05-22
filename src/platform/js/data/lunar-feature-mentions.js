import { resolveDataPathUrl } from "../core/domain/mission-asset-resolver.js";
import { normalizeLunarFeatureMentionTimeline } from "../core/domain/lunar-feature-mention-timeline.js";
import { getMissionDataPath } from "./mission-data.js";

const LUNAR_FEATURE_MENTIONS_FILE = "lunar-feature-mentions.json";

let loadedTimelineUrl = "";
let loadedTimeline = null;
let loadingPromise = null;

function getLunarFeatureMentionTimelineUrl(dataPath = getMissionDataPath()) {
    return resolveDataPathUrl(dataPath, LUNAR_FEATURE_MENTIONS_FILE);
}

function getLocalLunarFeatureMentionTimelineUrl() {
    const missionName = String(window?.missionConfig?.missionName || window?.__MISSION_PAGE_PRESET?.folder || "").trim();
    if (!missionName) return null;
    try {
        return new URL(`assets/${missionName}/data/${LUNAR_FEATURE_MENTIONS_FILE}`, document.baseURI).href;
    } catch (_error) {
        return `assets/${missionName}/data/${LUNAR_FEATURE_MENTIONS_FILE}`;
    }
}

async function fetchLunarFeatureMentionTimeline(fetchFn, url) {
    const response = await fetchFn(url, { cache: "no-store" });
    if (response?.status === 404) return null;
    if (!response?.ok) {
        throw new Error(`Failed to load lunar feature mentions from ${url}: ${response?.status}`);
    }
    return response.json();
}

async function loadLunarFeatureMentionTimeline({
    dataPath = getMissionDataPath(),
    fetchFn = typeof fetch === "function" ? fetch : null,
} = {}) {
    const url = getLunarFeatureMentionTimelineUrl(dataPath);
    if (!url || typeof fetchFn !== "function") return null;
    if (loadedTimeline && loadedTimelineUrl === url) return loadedTimeline;
    if (loadingPromise && loadedTimelineUrl === url) return loadingPromise;

    loadedTimelineUrl = url;
    loadingPromise = fetchLunarFeatureMentionTimeline(fetchFn, url)
        .then(async (data) => {
            if (data) return data;
            const localUrl = getLocalLunarFeatureMentionTimelineUrl();
            if (!localUrl || localUrl === url) return null;
            return fetchLunarFeatureMentionTimeline(fetchFn, localUrl);
        })
        .then((data) => {
            loadedTimeline = data ? normalizeLunarFeatureMentionTimeline(data) : null;
            return loadedTimeline;
        })
        .finally(() => {
            loadingPromise = null;
        });
    return loadingPromise;
}

function setLoadedLunarFeatureMentionTimelineForTests(timeline) {
    loadedTimeline = timeline ? normalizeLunarFeatureMentionTimeline(timeline) : null;
    loadedTimelineUrl = "";
    loadingPromise = null;
}

export {
    LUNAR_FEATURE_MENTIONS_FILE,
    getLunarFeatureMentionTimelineUrl,
    loadLunarFeatureMentionTimeline,
    setLoadedLunarFeatureMentionTimelineForTests,
};
