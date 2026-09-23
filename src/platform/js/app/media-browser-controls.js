import { getDocumentRef, isPictureInPictureSupported, createElement, formatMediaElapsedTime } from "./media-browser-dom.js";

export function createMediaBrowserControls({ getNode, onIntent }) {
    let filterSignature = "";

    function appendFilterButton(host, option, intentType, variant = "") {
        const button = createElement("button");
        if (!button) return;
        const count = Number(option?.count);
        button.type = "button";
        button.className = [
            "media-browser-panel__filter-button",
            variant ? `media-browser-panel__filter-button--${variant}` : "",
            option?.active ? "is-active" : "",
        ].filter(Boolean).join(" ");
        if (button.dataset) {
            button.dataset.filterId = option?.id || "";
        }
        button.textContent = option?.label || option?.id || "Filter";
        button.disabled = Number.isFinite(count) && count <= 0 && option?.active !== true && option?.id !== "all";
        button.setAttribute("aria-pressed", option?.active ? "true" : "false");
        button.title = [
            option?.title,
            Number.isFinite(count) ? `${count} matching items` : "",
        ].filter(Boolean).join(" - ");
        button.addEventListener("click", () => {
            onIntent?.({ type: intentType, value: option?.id });
        });
        host.appendChild(button);
    }

    function appendFilterFacetGroup(host, label, options, intentType, variant = "") {
        const filteredOptions = (Array.isArray(options) ? options : []).filter(Boolean);
        if (!filteredOptions.length) return;
        const group = createElement("div");
        const groupLabel = createElement("span");
        const buttons = createElement("div");
        if (!group || !groupLabel || !buttons) return;
        group.className = [
            "media-browser-panel__filter-facet",
            variant ? `media-browser-panel__filter-facet--${variant}` : "",
        ].filter(Boolean).join(" ");
        group.setAttribute("role", "group");
        group.setAttribute("aria-label", label);
        groupLabel.className = "media-browser-panel__filter-facet-label";
        groupLabel.textContent = label;
        buttons.className = "media-browser-panel__filter-facet-buttons";
        group.appendChild(groupLabel);
        group.appendChild(buttons);
        filteredOptions.forEach((option) => appendFilterButton(buttons, option, intentType, variant));
        host.appendChild(group);
    }

    function renderMediaFilterControls(filterModel) {
        const host = getNode("media-browser-filter-bar");
        if (!host) return;
        const nextSignature = JSON.stringify({
            kindPillOptions: filterModel?.kindPillOptions || [],
            subjectOptions: filterModel?.subjectOptions || filterModel?.quickOptions || [],
            cameraButtonOptions: filterModel?.cameraButtonOptions || [],
        });
        if (nextSignature === filterSignature) {
            return;
        }
        filterSignature = nextSignature;
        if (typeof host.replaceChildren === "function") {
            host.replaceChildren();
        } else {
            host.innerHTML = "";
        }

        const kindPillOptions = filterModel?.kindPillOptions || [];
        appendFilterFacetGroup(host, "Type", kindPillOptions, "toggleMediaKind", "kind-pill");

        const subjectOptions = filterModel?.subjectOptions || filterModel?.quickOptions || [];
        appendFilterFacetGroup(host, "Subject", subjectOptions, "toggleSubject", "subject");

        const cameraOptions = filterModel?.cameraButtonOptions || [];
        appendFilterFacetGroup(host, "Camera", cameraOptions, "toggleCameraFilter", "camera");
    }

    function syncMediaSearchControl(filterModel = {}) {
        const input = getNode("media-browser-search");
        if (!input) return;
        const query = String(filterModel.query || "").trim();
        if (input.value !== query) {
            input.value = query;
        }
        input.title = query ? `Searching media metadata for "${query}"` : "Search media metadata";
    }

    function syncVideoPopoutButton({ hasVideo = false } = {}) {
        const button = getNode("media-browser-media-popout");
        const video = getNode("media-browser-video");
        if (!button) return;
        const supported = hasVideo === true && isPictureInPictureSupported(video);
        button.hidden = !supported;
        button.disabled = !supported;
        const poppedOut = supported && getDocumentRef()?.pictureInPictureElement === video;
        button.textContent = poppedOut ? "Dock" : "Pop Out";
        button.title = poppedOut ? "Return video to panel" : "Pop out video";
        button.setAttribute("aria-label", button.title);
        button.setAttribute("aria-pressed", poppedOut ? "true" : "false");
    }

    async function toggleVideoPopout() {
        const video = getNode("media-browser-video");
        if (!isPictureInPictureSupported(video)) {
            syncVideoPopoutButton({ hasVideo: false });
            return;
        }
        const documentRef = getDocumentRef();
        try {
            if (documentRef?.pictureInPictureElement === video) {
                await documentRef.exitPictureInPicture?.();
            } else {
                await video.requestPictureInPicture();
            }
        } catch {
            // Browsers can reject Picture-in-Picture until metadata is ready or after a rapid source swap.
        }
        syncVideoPopoutButton({ hasVideo: video?.hidden !== true && !!video?.dataset?.mediaSourceUrl });
    }

    function syncMediaControls(playbackModel = {}) {
        const controls = getNode("media-browser-media-controls");
        const playButton = getNode("media-browser-media-play");
        const muteButton = getNode("media-browser-media-mute");
        const restartButton = getNode("media-browser-media-restart");
        const resyncButton = getNode("media-browser-media-resync");
        const elapsed = getNode("media-browser-media-elapsed");
        const slider = getNode("media-browser-media-timeline");
        const status = getNode("media-browser-media-status");
        const show = playbackModel.showControls === true;
        const isBusy = playbackModel.playing === true || playbackModel.buffering === true;
        const elapsedSeconds = Number(playbackModel.elapsedSeconds);
        const durationSeconds = Number(playbackModel.durationSeconds);
        const hasDuration = Number.isFinite(durationSeconds) && durationSeconds > 0;
        const safeElapsedSeconds = Number.isFinite(elapsedSeconds) && elapsedSeconds >= 0
            ? elapsedSeconds
            : 0;
        const clampedElapsedSeconds = hasDuration
            ? Math.min(safeElapsedSeconds, durationSeconds)
            : safeElapsedSeconds;
        if (controls) {
            controls.hidden = !show;
        }
        if (playButton) {
            playButton.disabled = !show;
            playButton.textContent = isBusy ? "⏸" : "▶";
            playButton.title = playbackModel.playTitle || (isBusy
                ? "Pause media playback"
                : "Play media from the current mission time");
            playButton.setAttribute("aria-label", playButton.title);
        }
        if (muteButton) {
            const muted = playbackModel.muted === true;
            muteButton.disabled = !show;
            muteButton.textContent = "";
            muteButton.dataset.icon = muted ? "speaker-muted" : "speaker";
            muteButton.title = muted ? "Unmute Mission Media" : "Mute Mission Media";
            muteButton.setAttribute("aria-label", muteButton.title);
            muteButton.setAttribute("aria-pressed", muted ? "true" : "false");
        }
        if (restartButton) {
            restartButton.disabled = !show;
            restartButton.title = playbackModel.restartTitle || "Play media from beginning";
            restartButton.setAttribute("aria-label", restartButton.title);
        }
        if (resyncButton) {
            resyncButton.disabled = !show;
            resyncButton.title = playbackModel.resyncTitle || "Force resync media with animation";
            resyncButton.setAttribute("aria-label", resyncButton.title);
        }
        if (elapsed) {
            const elapsedLabel = hasDuration
                ? `${formatMediaElapsedTime(clampedElapsedSeconds)} / ${formatMediaElapsedTime(durationSeconds)}`
                : `${formatMediaElapsedTime(clampedElapsedSeconds)} / --:--`;
            elapsed.textContent = show ? elapsedLabel : "";
            elapsed.title = elapsedLabel;
        }
        if (slider) {
            const seekEnabled = show && playbackModel.seekEnabled !== false && hasDuration;
            slider.hidden = !show;
            slider.disabled = !seekEnabled;
            slider.min = "0";
            slider.max = hasDuration ? String(durationSeconds) : "0";
            slider.step = "0.25";
            slider.value = String(hasDuration ? clampedElapsedSeconds : 0);
            slider.setAttribute(
                "aria-label",
                playbackModel.sliderTitle || "Selected media timeline",
            );
            slider.title = seekEnabled
                ? (playbackModel.sliderTitle || "Seek selected media")
                : "Media timeline unavailable";
        }
        if (status) {
            status.textContent = show ? String(playbackModel.statusLabel || "") : "";
            status.title = status.textContent;
        }
    }

    function syncFilterNavigation(navigationModel = {}) {
        const scroller = getNode("media-browser-filter-scroller");
        const previousButton = getNode("media-browser-filter-prev");
        const nextButton = getNode("media-browser-filter-next");
        const position = getNode("media-browser-filter-position");
        const available = navigationModel.available === true;
        if (scroller) {
            scroller.hidden = !available;
        }
        if (previousButton) {
            previousButton.disabled = !available || navigationModel.previousEnabled !== true;
            previousButton.title = navigationModel.previousTitle || "Previous filtered media";
            previousButton.setAttribute(
                "aria-label",
                navigationModel.previousTitle || "Previous filtered media",
            );
        }
        if (nextButton) {
            nextButton.disabled = !available || navigationModel.nextEnabled !== true;
            nextButton.title = navigationModel.nextTitle || "Next filtered media";
            nextButton.setAttribute(
                "aria-label",
                navigationModel.nextTitle || "Next filtered media",
            );
        }
        if (position) {
            position.textContent = navigationModel.positionLabel || "No media focused";
            position.title = position.textContent;
        }
    }

    return {
        renderMediaFilterControls,
        syncMediaSearchControl,
        syncVideoPopoutButton,
        toggleVideoPopout,
        syncMediaControls,
        syncFilterNavigation,
    };
}
