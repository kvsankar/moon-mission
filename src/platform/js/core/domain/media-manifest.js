import {
    asTrimmedString,
    normalizeCameraProfiles,
    normalizeThumbnailConfig,
    normalizeMediaMetadataMap,
    normalizeMediaItem,
} from "./media-manifest-fields.js";

import { normalizeArtemisTimelineMediaItems, normalizeArtemisTimelineAudioItems } from "./media-manifest-artemis.js";

import { normalizeMediaStream, normalizeMediaStreamItem } from "./media-manifest-streams.js";

function normalizeMissionMediaManifest(manifestData, { dataPath = "" } = {}) {
    const manifest = manifestData && typeof manifestData === "object" ? manifestData : {};
    const cameraProfilesById = normalizeCameraProfiles(manifest.cameraProfiles);
    const thumbnailConfig = normalizeThumbnailConfig(manifest.thumbnails);
    const metadataByKey = normalizeMediaMetadataMap(manifest.mediaMetadata);
    const mediaStreams = (Array.isArray(manifest.mediaStreams) ? manifest.mediaStreams : [])
        .map((stream, index) => normalizeMediaStream(stream, index, dataPath, metadataByKey))
        .filter(Boolean)
        .sort((a, b) => a.startTimeMs - b.startTimeMs);
    const streamMediaItems = mediaStreams
        .map((stream, index) => normalizeMediaStreamItem(stream, index, dataPath, thumbnailConfig))
        .filter(Boolean);
    const mediaItems = [
        ...(Array.isArray(manifest.mediaItems) ? manifest.mediaItems : [])
            .map((item, index) => normalizeMediaItem(
                item,
                index,
                cameraProfilesById,
                dataPath,
                thumbnailConfig,
                metadataByKey,
            ))
            .filter(Boolean),
        ...normalizeArtemisTimelineMediaItems(manifest, dataPath, cameraProfilesById, thumbnailConfig, metadataByKey),
        ...streamMediaItems,
    ].sort((a, b) => a.startTimeMs - b.startTimeMs);
    const audioItems = [
        ...(Array.isArray(manifest.audioItems) ? manifest.audioItems : [])
            .map((item, index) => normalizeMediaItem({
                ...item,
                kind: "audioClip",
            }, index, cameraProfilesById, dataPath, thumbnailConfig, metadataByKey))
            .filter(Boolean),
        ...normalizeArtemisTimelineAudioItems(manifest, dataPath, thumbnailConfig, metadataByKey),
    ].sort((a, b) => a.startTimeMs - b.startTimeMs);

    return {
        title: asTrimmedString(manifest.title || manifest.ui?.title || "Mission Media"),
        ui: manifest.ui && typeof manifest.ui === "object" ? manifest.ui : {},
        filters: manifest.filters && typeof manifest.filters === "object" ? manifest.filters : {},
        provenance: manifest.provenance && typeof manifest.provenance === "object"
            ? manifest.provenance
            : {},
        thumbnails: thumbnailConfig,
        cameraProfilesById,
        mediaItems,
        audioItems,
        mediaStreams,
    };
}

export {
    normalizeMissionMediaManifest,
};
export { buildMediaThumbnailKey, parseMediaTimestamp } from "./media-manifest-fields.js";
