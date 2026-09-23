import {
    asTrimmedString,
    parseMediaTimestamp,
    parseDurationSeconds,
    normalizeSourceMetadata,
    normalizeBackgroundPlayback,
    normalizeStreamSourceType,
    resolveMediaAssetUrl,
    normalizeTextArray,
    normalizeCaptionTracks,
    normalizeMediaResourceRef,
    normalizeStreamPartOffsets,
    toFiniteNumber,
    normalizePlaybackRoles,
    applyMediaMetadata,
    resolveMediaMetadata,
    resolveThumbnailConventionAssetUrl,
    buildMediaThumbnailKey,
    normalizeMediaMainBody,
    normalizeMediaCompositionHints,
} from "./media-manifest-fields.js";

function normalizeMediaStream(stream, index, dataPath, metadataByKey = new Map()) {
    if (!stream || typeof stream !== "object" || Array.isArray(stream)) {
        return null;
    }

    const id = asTrimmedString(stream.id) || `media-stream-${index + 1}`;
    const startTimeMs = parseMediaTimestamp(stream.startTime);
    if (!Number.isFinite(startTimeMs)) {
        return null;
    }
    const endTimeMs = parseMediaTimestamp(stream.endTime);
    const explicitDurationSeconds = parseDurationSeconds(stream.durationSeconds || stream.duration);
    const derivedDurationSeconds = (
        Number.isFinite(endTimeMs) && endTimeMs > startTimeMs
            ? (endTimeMs - startTimeMs) / 1000
            : Number.NaN
    );
    const durationSeconds = Number.isFinite(explicitDurationSeconds)
        ? explicitDurationSeconds
        : derivedDurationSeconds;
    const source = normalizeSourceMetadata(stream.source);
    const backgroundPlayback = normalizeBackgroundPlayback(stream.backgroundPlayback);

    const normalizedItem = {
        id,
        enabled: stream.enabled !== false,
        title: asTrimmedString(stream.title || id),
        description: asTrimmedString(stream.description || stream.desc),
        streamKind: asTrimmedString(stream.streamKind || "video") || "video",
        sourceType: normalizeStreamSourceType(stream.sourceType),
        sourceUrl: asTrimmedString(stream.sourceUrl),
        posterAssetUrl: resolveMediaAssetUrl(stream.posterAsset, dataPath),
        captions: normalizeTextArray(stream.captions),
        captionTracks: normalizeCaptionTracks(stream.captionTracks || stream.transcriptTracks, dataPath),
        transcriptDoc: normalizeMediaResourceRef(
            stream.transcriptDoc || stream.transcriptDocument,
            dataPath,
            `${id}-transcript`,
        ),
        searchIndex: normalizeMediaResourceRef(
            stream.searchIndex || stream.entityIndex,
            dataPath,
            `${id}-search-index`,
        ),
        partOffsets: normalizeStreamPartOffsets(stream.partOffsets),
        startTimeMs,
        endTimeMs,
        durationSeconds,
        syncMode: asTrimmedString(stream.syncMode || "missionClock") || "missionClock",
        syncStatus: asTrimmedString(stream.syncStatus),
        syncAnchors: normalizeMediaStreamSyncAnchors(stream.syncAnchors),
        timeOffsetSeconds: Number.isFinite(toFiniteNumber(stream.timeOffsetSeconds))
            ? toFiniteNumber(stream.timeOffsetSeconds)
            : 0,
        sourceLabel: asTrimmedString(stream.sourceLabel || source.label),
        sourcePageUrl: asTrimmedString(stream.sourcePageUrl || source.url),
        sourceCredit: asTrimmedString(stream.sourceCredit),
        license: asTrimmedString(stream.license),
        defaultPanelState: asTrimmedString(stream.defaultPanelState || "closed") || "closed",
        playbackRoles: normalizePlaybackRoles(stream.playbackRoles, { backgroundPlayback }),
        backgroundPlayback,
    };
    return applyMediaMetadata(
        normalizedItem,
        resolveMediaMetadata(metadataByKey, {
            id,
            fileName: stream.posterAsset || stream.sourceUrl,
            thumbnailKey: stream.thumbnailKey,
        }),
    );
}

function normalizeMediaStreamSyncAnchors(syncAnchors = []) {
    if (!Array.isArray(syncAnchors)) return [];
    return syncAnchors
        .map((anchor) => {
            if (!anchor || typeof anchor !== "object" || Array.isArray(anchor)) return null;
            const missionTimeMs = parseMediaTimestamp(anchor.missionTime || anchor.time);
            const streamTimeSeconds = toFiniteNumber(anchor.streamTimeSeconds);
            if (!Number.isFinite(missionTimeMs) || !Number.isFinite(streamTimeSeconds)) {
                return null;
            }
            return {
                label: asTrimmedString(anchor.label || anchor.id),
                missionTimeMs,
                streamTimeSeconds,
                note: asTrimmedString(anchor.note),
            };
        })
        .filter(Boolean)
        .sort((a, b) => a.streamTimeSeconds - b.streamTimeSeconds);
}

function normalizeMediaStreamItem(stream, index, dataPath, thumbnailConfig = {}) {
    if (!stream || stream.enabled === false || stream.streamKind !== "video") {
        return null;
    }
    const id = asTrimmedString(stream.id) || `media-stream-${index + 1}`;
    const assetUrl = resolveMediaAssetUrl(stream.sourceUrl, dataPath);
    if (!assetUrl) {
        return null;
    }
    const posterAssetUrl = asTrimmedString(stream.posterAssetUrl);
    const thumbnailAssetUrl = posterAssetUrl || resolveThumbnailConventionAssetUrl(
        thumbnailConfig,
        {
            id,
            kind: "videoClip",
            fileName: id,
            thumbnailKey: id,
        },
        dataPath,
    );

    return {
        id,
        kind: "videoClip",
        mediaStream: true,
        playbackRoles: normalizePlaybackRoles(stream.playbackRoles, { backgroundPlayback: stream.backgroundPlayback }),
        backgroundPlayback: stream.backgroundPlayback || normalizeBackgroundPlayback(),
        enabled: stream.enabled !== false,
        startTimeMs: stream.startTimeMs,
        endTimeMs: stream.endTimeMs,
        durationSeconds: stream.durationSeconds,
        captureTimeMs: Number.NaN,
        effectiveTimeOffsetSeconds: Number.isFinite(toFiniteNumber(stream.timeOffsetSeconds))
            ? toFiniteNumber(stream.timeOffsetSeconds)
            : 0,
        timeOffsetNote: stream.syncStatus
            ? `Stream sync status: ${stream.syncStatus}.`
            : "",
        timeSource: "timelineTime",
        title: asTrimmedString(stream.title || id),
        description: asTrimmedString(stream.description),
        sourceLabel: asTrimmedString(stream.sourceLabel || stream.license || "Mission stream"),
        sourceUrl: asTrimmedString(stream.sourcePageUrl || stream.sourceUrl),
        assetUrl,
        posterAssetUrl,
        thumbnailAssetUrl: thumbnailAssetUrl || assetUrl,
        thumbnailKey: buildMediaThumbnailKey(id),
        streamSourceType: asTrimmedString(stream.sourceType),
        sourceType: asTrimmedString(stream.sourceType),
        photographer: asTrimmedString(stream.sourceCredit),
        cameraId: "mission-stream",
        cameraLabel: "Mission stream",
        location: "",
        fileName: asTrimmedString(stream.sourceUrl),
        settings: asTrimmedString(stream.sourceType),
        tags: [...new Set(["stream", ...normalizeTextArray(stream.tags)])],
        metadataTags: normalizeTextArray(stream.metadataTags),
        subjects: normalizeTextArray(stream.subjects),
        bodies: normalizeTextArray(stream.bodies),
        mainBody: normalizeMediaMainBody(stream.mainBody),
        sceneType: asTrimmedString(stream.sceneType),
        shortDescription: asTrimmedString(stream.shortDescription),
        compositionHints: normalizeMediaCompositionHints(stream.compositionHints),
        qualityNotes: asTrimmedString(stream.qualityNotes),
        crewCaptured: false,
        external: true,
        batch: 0,
        availabilityStartPolicy: "",
        syncStatus: asTrimmedString(stream.syncStatus),
        syncAnchors: Array.isArray(stream.syncAnchors) ? stream.syncAnchors : [],
        captionTracks: Array.isArray(stream.captionTracks) ? stream.captionTracks : [],
        transcriptDoc: stream.transcriptDoc || null,
        searchIndex: stream.searchIndex || null,
        partOffsets: stream.partOffsets && typeof stream.partOffsets === "object" ? stream.partOffsets : {},
        defaultPanelState: asTrimmedString(stream.defaultPanelState),
    };
}

export {
    normalizeMediaStream,
    normalizeMediaStreamItem,
};
