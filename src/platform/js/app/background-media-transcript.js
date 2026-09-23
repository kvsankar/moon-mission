import { findTranscriptSegmentForHighlight } from "../core/domain/media-transcript.js";
import { getDocumentRef, getNode, setNodeHidden, setNodeText, setClassToggled } from "./background-media-dom.js";
import {
    ensureTranscriptDocumentLoaded,
    getTranscriptSegmentKey,
    getTranscriptSegmentStartSeconds,
    getTranscriptSpeakerLabel,
} from "./background-media-captions.js";
import { formatStatusTime } from "./background-media-policy.js";

export function createBackgroundTranscriptPresenter({
    getPanel,
    isDockviewBackgroundMediaPanelEnabled,
    isTimelineRunning,
    onJumpToTime,
}) {
    let transcriptRenderSourceUrl = "";
    let transcriptRowsByKey = new Map();
    let activeTranscriptRow = null;
    let activeTranscriptSegmentKey = "";
    let transcriptSeekItem = null;

    function getTranscriptPanel() {
        return getNode("background-media-transcript");
    }

    function getTranscriptList() {
        return getNode("background-media-transcript-list");
    }

    function getTranscriptStatus() {
        return getNode("background-media-transcript-status");
    }

    function clearActiveTranscriptRow() {
        if (activeTranscriptRow) {
            activeTranscriptRow.classList?.remove?.("background-media-panel__transcript-row--active");
            activeTranscriptRow.removeAttribute?.("aria-current");
            if (activeTranscriptRow.dataset) activeTranscriptRow.dataset.active = "false";
        }
        activeTranscriptRow = null;
        activeTranscriptSegmentKey = "";
    }

    function clearTranscriptPanel() {
        const panel = getTranscriptPanel();
        setNodeHidden(panel, true);
        setClassToggled(getPanel(), "background-media-panel--with-transcript", false);
        setNodeText(getTranscriptStatus(), "");
        getTranscriptList()?.replaceChildren?.();
        transcriptRenderSourceUrl = "";
        transcriptRowsByKey = new Map();
        transcriptSeekItem = null;
        clearActiveTranscriptRow();
    }

    function seekToTranscriptSegment(segment) {
        const startSeconds = getTranscriptSegmentStartSeconds(segment);
        const startTimeMs = Number(transcriptSeekItem?.startTimeMs);
        if (!Number.isFinite(startSeconds) || !Number.isFinite(startTimeMs)) return;
        onJumpToTime(startTimeMs + startSeconds * 1000, transcriptSeekItem);
    }

    function appendTranscriptCell(row, className, text) {
        const node = getDocumentRef()?.createElement?.("span");
        if (!node) return null;
        node.className = className;
        node.textContent = text;
        row.appendChild?.(node);
        return node;
    }

    function createTranscriptRow(segment) {
        const row = getDocumentRef()?.createElement?.("button");
        if (!row) return null;
        const key = getTranscriptSegmentKey(segment);
        const startSeconds = getTranscriptSegmentStartSeconds(segment);
        row.type = "button";
        row.className = "background-media-panel__transcript-row";
        row.dataset.segmentId = key;
        row.dataset.startSeconds = Number.isFinite(startSeconds) ? String(startSeconds) : "";
        row.setAttribute?.("role", "listitem");
        row.setAttribute?.("aria-current", "false");
        row.addEventListener?.("click", () => seekToTranscriptSegment(segment));
        appendTranscriptCell(row, "background-media-panel__transcript-time", formatStatusTime(startSeconds));
        appendTranscriptCell(row, "background-media-panel__transcript-speaker", getTranscriptSpeakerLabel(segment));
        appendTranscriptCell(row, "background-media-panel__transcript-text", String(segment?.text || "").trim());
        return row;
    }

    function renderTranscriptRows(sourceUrl, transcriptDocument) {
        const list = getTranscriptList();
        if (!list || transcriptRenderSourceUrl === sourceUrl) return;
        const segments = Array.isArray(transcriptDocument?.segments) ? transcriptDocument.segments : [];
        const rowsByKey = new Map();
        const rows = segments
            .map((segment) => {
                const row = createTranscriptRow(segment);
                if (row) rowsByKey.set(getTranscriptSegmentKey(segment), row);
                return row;
            })
            .filter(Boolean);
        if (typeof list.replaceChildren === "function") {
            list.replaceChildren(...rows);
        } else {
            while (list.firstChild) list.removeChild?.(list.firstChild);
            rows.forEach((row) => list.appendChild?.(row));
        }
        transcriptRenderSourceUrl = sourceUrl;
        transcriptRowsByKey = rowsByKey;
        activeTranscriptRow = null;
        activeTranscriptSegmentKey = "";
    }

    function syncActiveTranscriptRow(segment) {
        const key = segment ? getTranscriptSegmentKey(segment) : "";
        if (key && key === activeTranscriptSegmentKey) return;
        clearActiveTranscriptRow();
        if (!key) return;
        const row = transcriptRowsByKey.get(key) || null;
        if (!row) return;
        row.classList?.add?.("background-media-panel__transcript-row--active");
        row.setAttribute?.("aria-current", "true");
        if (row.dataset) row.dataset.active = "true";
        activeTranscriptRow = row;
        activeTranscriptSegmentKey = key;
        row.scrollIntoView?.({
            block: "center",
            behavior: isTimelineRunning() ? "smooth" : "auto",
        });
    }

    function syncTranscriptPanel(item, offsetSeconds, onLoaded) {
        const sourceUrl = String(item?.transcriptDoc?.sourceUrl || "").trim();
        transcriptSeekItem = item || null;
        if (!sourceUrl) {
            clearTranscriptPanel();
            return;
        }
        const panel = getTranscriptPanel();
        const status = getTranscriptStatus();
        setNodeHidden(panel, false);
        setClassToggled(
            getPanel(),
            "background-media-panel--with-transcript",
            !isDockviewBackgroundMediaPanelEnabled(),
        );
        const entry = ensureTranscriptDocumentLoaded(sourceUrl, onLoaded);
        if (entry?.status !== "ready") {
            setNodeText(status, entry?.status === "error" ? "Transcript unavailable" : "Loading transcript");
            syncActiveTranscriptRow(null);
            return;
        }
        const segments = Array.isArray(entry.document?.segments) ? entry.document.segments : [];
        renderTranscriptRows(sourceUrl, entry.document);
        setNodeText(status, `${segments.length.toLocaleString()} lines`);
        syncActiveTranscriptRow(findTranscriptSegmentForHighlight(segments, offsetSeconds));
    }

    return { clearTranscriptPanel, syncTranscriptPanel };
}
