import { MEDIA_IMAGE_MIN_ZOOM, MEDIA_IMAGE_MAX_ZOOM, MEDIA_IMAGE_ZOOM_STEP } from "./media-browser-config.js";
import { createDefaultMediaImageViewState, clampMediaImagePan, zoomMediaImageViewState } from "./media-browser-policy.js";
import { getWindowRef, isObjectLike, isElementLike, isImageLike } from "./media-browser-dom.js";

export function createMediaBrowserImageView({ getNode, getImageStageSize }) {
    let imageViewState = createDefaultMediaImageViewState();
    let imagePanDragState = null;
    let imageViewAssetUrl = "";

    function isImageViewAvailable() {
        const image = getNode("media-browser-image");
        return isImageLike(image) && image.hidden !== true && !!imageViewAssetUrl;
    }

    function syncImageViewControls() {
        const stage = getNode("media-browser-stage");
        const controls = getNode("media-browser-image-controls");
        const zoomOutButton = getNode("media-browser-image-zoom-out");
        const zoomInButton = getNode("media-browser-image-zoom-in");
        const resetButton = getNode("media-browser-image-reset");
        const zoomLabel = getNode("media-browser-image-zoom-label");
        const available = isImageViewAvailable();
        const isZoomed = imageViewState.zoom > MEDIA_IMAGE_MIN_ZOOM;

        if (controls) {
            controls.hidden = !available;
        }
        if (zoomLabel) {
            zoomLabel.textContent = `${Math.round(imageViewState.zoom * 100)}%`;
        }
        if (zoomOutButton) {
            zoomOutButton.disabled = !available || imageViewState.zoom <= MEDIA_IMAGE_MIN_ZOOM;
        }
        if (zoomInButton) {
            zoomInButton.disabled = !available || imageViewState.zoom >= MEDIA_IMAGE_MAX_ZOOM;
        }
        if (resetButton) {
            resetButton.disabled = !available || (
                !isZoomed
                && imageViewState.panX === 0
                && imageViewState.panY === 0
            );
        }
        if (isElementLike(stage)) {
            stage.classList.toggle("is-pan-enabled", available && isZoomed);
            stage.classList.toggle("is-panning", imagePanDragState != null);
        }
    }

    function applyImageViewState(nextState, {
        animate = true,
    } = {}) {
        imageViewState = clampMediaImagePan(nextState, getImageStageSize());
        const image = getNode("media-browser-image");
        if (isImageLike(image)) {
            image.style.transition = animate ? "" : "none";
            image.style.transform = `translate3d(${imageViewState.panX}px, ${imageViewState.panY}px, 0) scale(${imageViewState.zoom})`;
            if (!animate && imagePanDragState == null) {
                getWindowRef()?.requestAnimationFrame?.(() => {
                    image.style.transition = "";
                });
            }
        }
        syncImageViewControls();
    }

    function resetImageView(options = {}) {
        imagePanDragState = null;
        applyImageViewState(createDefaultMediaImageViewState(), options);
    }

    function zoomImageView(zoomMultiplier) {
        if (!isImageViewAvailable()) return;
        applyImageViewState(zoomMediaImageViewState(
            imageViewState,
            zoomMultiplier,
            getImageStageSize(),
        ));
    }

    function shouldIgnoreImageGesture(event) {
        if (!isObjectLike(event?.target)) return false;
        if (typeof event.target.closest !== "function") return false;
        return !!event.target.closest("button, input, select, option, label, output, a, summary, details");
    }

    function bindImageViewControls() {
        const stage = getNode("media-browser-stage");
        const zoomOutButton = getNode("media-browser-image-zoom-out");
        const zoomInButton = getNode("media-browser-image-zoom-in");
        const resetButton = getNode("media-browser-image-reset");

        zoomOutButton?.addEventListener?.("click", () => zoomImageView(1 / MEDIA_IMAGE_ZOOM_STEP));
        zoomInButton?.addEventListener?.("click", () => zoomImageView(MEDIA_IMAGE_ZOOM_STEP));
        resetButton?.addEventListener?.("click", () => resetImageView());

        stage?.addEventListener?.("wheel", (event) => {
            if (!isImageViewAvailable()) return;
            const deltaY = Number(event.deltaY);
            if (!Number.isFinite(deltaY) || deltaY === 0) return;
            event.preventDefault();
            zoomImageView(deltaY < 0 ? MEDIA_IMAGE_ZOOM_STEP : 1 / MEDIA_IMAGE_ZOOM_STEP);
        }, { passive: false });

        stage?.addEventListener?.("pointerdown", (event) => {
            if (!isImageViewAvailable() || imageViewState.zoom <= MEDIA_IMAGE_MIN_ZOOM) return;
            if (event.button !== 0 || shouldIgnoreImageGesture(event)) return;
            imagePanDragState = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                panX: imageViewState.panX,
                panY: imageViewState.panY,
            };
            stage.setPointerCapture?.(event.pointerId);
            syncImageViewControls();
            event.preventDefault();
        });

        stage?.addEventListener?.("pointermove", (event) => {
            if (!imagePanDragState || imagePanDragState.pointerId !== event.pointerId) return;
            applyImageViewState({
                zoom: imageViewState.zoom,
                panX: imagePanDragState.panX + (event.clientX - imagePanDragState.startX),
                panY: imagePanDragState.panY + (event.clientY - imagePanDragState.startY),
            }, { animate: false });
        });

        const releasePan = (event) => {
            if (!imagePanDragState || imagePanDragState.pointerId !== event.pointerId) return;
            stage.releasePointerCapture?.(event.pointerId);
            imagePanDragState = null;
            applyImageViewState(imageViewState, { animate: false });
        };

        stage?.addEventListener?.("pointerup", releasePan);
        stage?.addEventListener?.("pointercancel", releasePan);
        syncImageViewControls();
    }

    return {
        applyImageViewState,
        resetImageView,
        bindImageViewControls,
        getState: () => imageViewState,
        getAssetUrl: () => imageViewAssetUrl,
        setAssetUrl: (url) => { imageViewAssetUrl = url || ""; },
    };
}
