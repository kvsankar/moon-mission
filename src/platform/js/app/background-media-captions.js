import {
    findTranscriptSegmentAtTime,
    formatTranscriptSegmentCaption,
    normalizeTranscriptDocument,
} from "../core/domain/media-transcript.js";
import { getNode, setNodeText, setNodeHidden } from "./background-media-dom.js";

const captionCueCache = new Map();
const transcriptDocumentCache = new Map();

function parseVttTimestamp(value = "") {
    const match = String(value || "").trim().match(/^(?:(\d+):)?(\d{2}):(\d{2})\.(\d{3})$/);
    if (!match) return Number.NaN;
    const hours = Number(match[1] || 0);
    const minutes = Number(match[2]);
    const seconds = Number(match[3]);
    const milliseconds = Number(match[4]);
    if (![hours, minutes, seconds, milliseconds].every(Number.isFinite)) return Number.NaN;
    return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
}

function decodeCaptionText(value = "") {
    return String(value || "")
        .replace(/<[^>]+>/g, "")
        .replaceAll("&lt;", "<")
        .replaceAll("&gt;", ">")
        .replaceAll("&amp;", "&")
        .replace(/\s+/g, " ")
        .trim();
}

function parseWebVttCues(value = "") {
    return String(value || "")
        .replace(/^\uFEFF/u, "")
        .split(/\r?\n\r?\n/u)
        .map((block) => block.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean))
        .map((lines) => {
            const timingIndex = lines.findIndex((line) => line.includes("-->"));
            if (timingIndex < 0) return null;
            const [startText, endAndSettings] = lines[timingIndex].split("-->");
            const endText = String(endAndSettings || "").trim().split(/\s+/u)[0];
            const startSeconds = parseVttTimestamp(startText);
            const endSeconds = parseVttTimestamp(endText);
            const text = decodeCaptionText(lines.slice(timingIndex + 1).join(" "));
            if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || endSeconds <= startSeconds || !text) {
                return null;
            }
            return {
                startSeconds,
                endSeconds,
                text,
            };
        })
        .filter(Boolean);
}

function getDefaultCaptionTrack(item) {
    const tracks = Array.isArray(item?.captionTracks) ? item.captionTracks : [];
    return tracks.find((track) => track?.default === true) || tracks[0] || null;
}

function findCaptionCue(cues, seconds) {
    const safeSeconds = Number(seconds);
    if (!Array.isArray(cues) || !Number.isFinite(safeSeconds)) return null;
    return cues.find((cue) => safeSeconds >= cue.startSeconds && safeSeconds < cue.endSeconds) || null;
}

function setCaptionText(text = "") {
    const node = getNode("background-media-caption-text");
    if (!node) return;
    const normalized = String(text || "").trim();
    setNodeText(node, normalized);
    setNodeHidden(node, !normalized);
}

function getTranscriptSegmentKey(segment) {
    const id = segment?.id;
    if (id != null && String(id).trim()) return String(id);
    return `${Number(segment?.displayStartSeconds ?? segment?.startSeconds) || 0}`;
}

function getTranscriptSegmentStartSeconds(segment) {
    const displayStartSeconds = Number(segment?.displayStartSeconds);
    if (Number.isFinite(displayStartSeconds)) return displayStartSeconds;
    const startSeconds = Number(segment?.startSeconds);
    return Number.isFinite(startSeconds) ? startSeconds : Number.NaN;
}

function getTranscriptSpeakerLabel(segment) {
    return String(segment?.displaySpeaker || segment?.speaker || "Unidentified").trim()
        || "Unidentified";
}

function ensureCaptionCuesLoaded(sourceUrl, onLoaded) {
    const url = String(sourceUrl || "").trim();
    if (!url) return null;
    const cached = captionCueCache.get(url);
    if (cached) return cached;

    const entry = {
        status: "loading",
        cues: [],
    };
    captionCueCache.set(url, entry);
    if (typeof globalThis.fetch !== "function") {
        entry.status = "error";
        return entry;
    }
    const request = globalThis.fetch(url);
    if (!request || typeof request.then !== "function") {
        entry.status = "error";
        captionCueCache.delete(url);
        return entry;
    }
    request
        .then((response) => (response?.ok === true ? response.text() : ""))
        .then((text) => {
            entry.cues = parseWebVttCues(text);
            entry.status = "ready";
            if (typeof onLoaded === "function") onLoaded();
        })
        .catch(() => {
            entry.status = "error";
            captionCueCache.delete(url);
        });
    return entry;
}

function ensureTranscriptDocumentLoaded(sourceUrl, onLoaded) {
    const url = String(sourceUrl || "").trim();
    if (!url) return null;
    const cached = transcriptDocumentCache.get(url);
    if (cached) return cached;

    const entry = {
        status: "loading",
        document: normalizeTranscriptDocument(null),
    };
    transcriptDocumentCache.set(url, entry);
    if (typeof globalThis.fetch !== "function") {
        entry.status = "error";
        return entry;
    }
    const request = globalThis.fetch(url);
    if (!request || typeof request.then !== "function") {
        entry.status = "error";
        transcriptDocumentCache.delete(url);
        return entry;
    }
    request
        .then((response) => (response?.ok === true ? response.json() : null))
        .then((data) => {
            entry.document = normalizeTranscriptDocument(data);
            entry.status = "ready";
            if (typeof onLoaded === "function") onLoaded();
        })
        .catch(() => {
            entry.status = "error";
            transcriptDocumentCache.delete(url);
        });
    return entry;
}

function removeCaptionTrackNodes(video) {
    const existingTracks = Array.from(
        video?.querySelectorAll?.('track[data-background-media-caption-track="true"]') || [],
    );
    existingTracks.forEach((track) => {
        if (typeof track.remove === "function") {
            track.remove();
        } else if (track.parentNode && typeof track.parentNode.removeChild === "function") {
            track.parentNode.removeChild(track);
        }
    });
}

function getCaptionTrackAttribution(item) {
    const tracks = Array.isArray(item?.captionTracks) ? item.captionTracks : [];
    return tracks.map((track) => String(track?.attribution || "").trim()).find(Boolean) || "";
}

function syncCaptionAttribution(item = null, captionsEnabled = true) {
    const attribution = String(item?.transcriptDoc?.attribution || "").trim()
        || getCaptionTrackAttribution(item);
    const overlay = getNode("background-media-caption-attribution");
    if (overlay) {
        setNodeText(overlay, "");
        setNodeHidden(overlay, true);
    }
    const note = getNode("background-media-transcript-note");
    if (!note) return;
    setNodeText(note, attribution);
    setNodeHidden(note, captionsEnabled !== true || !attribution);
}

function syncRenderedTranscriptCaption(item, offsetSeconds, onLoaded) {
    const sourceUrl = String(item?.transcriptDoc?.sourceUrl || "").trim();
    if (!sourceUrl) return false;
    const entry = ensureTranscriptDocumentLoaded(sourceUrl, onLoaded);
    if (entry?.status !== "ready") return false;
    const segment = findTranscriptSegmentAtTime(entry.document?.segments, offsetSeconds);
    setCaptionText(formatTranscriptSegmentCaption(segment));
    return true;
}

function syncRenderedCaption(item, offsetSeconds, onLoaded, captionsEnabled = true) {
    if (captionsEnabled !== true) {
        setCaptionText("");
        return;
    }
    if (syncRenderedTranscriptCaption(item, offsetSeconds, onLoaded)) {
        return;
    }
    const track = getDefaultCaptionTrack(item);
    if (!track?.sourceUrl) {
        setCaptionText("");
        return;
    }
    const entry = ensureCaptionCuesLoaded(track.sourceUrl, onLoaded);
    if (entry?.status !== "ready") {
        setCaptionText("");
        return;
    }
    setCaptionText(findCaptionCue(entry.cues, offsetSeconds)?.text || "");
}

function syncVideoCaptionTracks(video, item, captionsEnabled = true) {
    if (!video) return;
    removeCaptionTrackNodes(video);
    const tracks = Array.isArray(item?.captionTracks) ? item.captionTracks : [];
    if (tracks.length === 0) {
        syncCaptionAttribution(null, captionsEnabled);
        return;
    }

    // The app renders captions itself so it can include speaker labels and match the panel layout.
    // Avoid attaching native <track> nodes, otherwise browsers render a second subtitle layer.
    syncCaptionAttribution(item, captionsEnabled);
}
export {
    parseVttTimestamp,
    decodeCaptionText,
    parseWebVttCues,
    getDefaultCaptionTrack,
    findCaptionCue,
    setCaptionText,
    getTranscriptSegmentKey,
    getTranscriptSegmentStartSeconds,
    getTranscriptSpeakerLabel,
    ensureCaptionCuesLoaded,
    ensureTranscriptDocumentLoaded,
    removeCaptionTrackNodes,
    getCaptionTrackAttribution,
    syncCaptionAttribution,
    syncRenderedTranscriptCaption,
    syncRenderedCaption,
    syncVideoCaptionTracks,
};
