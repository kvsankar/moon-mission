import { buildTimelineEventInfos } from "./comparison-timeline.js";

export function createMissionTimelineSource({
    getConfig,
    getGlobalConfig,
    getPrimaryEventInfos,
    isCompareMode,
    onMediaMarkersChanged,
}) {
    let timelineEventInfosCache = {
        compareMode: null,
        config: null,
        globalConfig: null,
        eventInfos: null,
        result: [],
    };
    let timelineMediaMarkers = [];

    function setTimelineMediaMarkers(nextMarkers) {
        timelineMediaMarkers = Array.isArray(nextMarkers) ? nextMarkers : [];
        onMediaMarkersChanged?.();
    }

    function getTimelineEventInfos() {
        const currentConfig = getConfig();
        const globalConfig = getGlobalConfig();
        const eventInfos = getPrimaryEventInfos();
        if (
            timelineEventInfosCache.compareMode === isCompareMode &&
            timelineEventInfosCache.config === currentConfig &&
            timelineEventInfosCache.globalConfig === globalConfig &&
            timelineEventInfosCache.eventInfos === eventInfos
        ) {
            return timelineEventInfosCache.result;
        }

        const result = buildTimelineEventInfos({
            compareMode: isCompareMode,
            globalConfig,
            config: currentConfig,
            primaryEventInfos: eventInfos,
        });
        timelineEventInfosCache = {
            compareMode: isCompareMode,
            config: currentConfig,
            globalConfig,
            eventInfos,
            result,
        };
        return result;
    }

    return {
        setTimelineMediaMarkers,
        getTimelineEventInfos,
        getTimelineMediaMarkers: () => timelineMediaMarkers,
    };
}
