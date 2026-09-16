const DEFAULT_FOLLOW_PILL_PAIRS = [
    ["follow-pill-none", "manual"],
    ["follow-pill-earth", "earth"],
    ["follow-pill-moon", "moon"],
    ["follow-pill-craft", "spacecraft"],
];

const DEFAULT_VIEW_PILL_PAIRS = [
    ["view-pill-free", "manual", "manual"],
    ["view-pill-earth-moon", "earth", "moon"],
    ["view-pill-moon-earth", "moon", "earth"],
    ["view-pill-craft-moon", "spacecraft", "moon"],
    ["view-pill-craft-earth", "spacecraft", "earth"],
];

export function createCameraPillController(deps = {}) {
    const documentRef = deps.documentRef || document;
    const controlBackend = deps.controlBackend || {};
    const followPillPairs = deps.followPillPairs || DEFAULT_FOLLOW_PILL_PAIRS;
    const viewPillPairs = deps.viewPillPairs || DEFAULT_VIEW_PILL_PAIRS;

    const commitCameraPositionMode =
        typeof controlBackend.commitCameraPositionMode === "function"
            ? controlBackend.commitCameraPositionMode
            : () => {};
    const commitCameraLookMode =
        typeof controlBackend.commitCameraLookMode === "function"
            ? controlBackend.commitCameraLookMode
            : () => {};
    const commitCameraPair =
        typeof controlBackend.commitCameraPair === "function"
            ? controlBackend.commitCameraPair
            : () => {};

    let bound = false;

    function getSelectedCameraPillValue(name) {
        const pair = controlBackend.getCameraState?.() || { positionMode: "manual", lookMode: "manual" };
        if (name === "camera-position-pill") {
            return pair.positionMode;
        }
        if (name === "camera-look-pill") {
            return pair.lookMode;
        }
        const selected = documentRef.querySelector?.(`input[name="${name}"]:checked`);
        return selected?.value || "manual";
    }

    function syncFollowPillState() {
        const positionValue = getSelectedCameraPillValue("camera-position-pill");
        const lookValue = getSelectedCameraPillValue("camera-look-pill");
        followPillPairs.forEach(([pillId, value]) => {
            const pill = documentRef.getElementById(pillId);
            if (!pill) return;
            const isActive = positionValue === "manual" && lookValue === value;
            pill.classList.toggle("is-active", isActive);
            pill.setAttribute("aria-pressed", isActive ? "true" : "false");
        });
    }

    function syncViewPillState() {
        const positionValue = getSelectedCameraPillValue("camera-position-pill");
        const lookValue = getSelectedCameraPillValue("camera-look-pill");
        viewPillPairs.forEach(([pillId, position, look]) => {
            const pill = documentRef.getElementById(pillId);
            if (!pill) return;
            const isActive = positionValue === position && lookValue === look;
            pill.classList.toggle("is-active", isActive);
            pill.setAttribute("aria-pressed", isActive ? "true" : "false");
        });
    }

    function sync() {
        syncFollowPillState();
        syncViewPillState();
    }

    function bind() {
        if (bound) return;
        bound = true;

        const positionSelect = documentRef.getElementById("camera-position");
        if (positionSelect) {
            positionSelect.addEventListener("change", (event) => {
                commitCameraPositionMode(event?.target?.value || "manual", {
                    sourceId: "camera-position",
                    sourceName: "camera-position",
                    preserveManualRelease: event?.detail?.preserveManualRelease === true,
                });
                sync();
            });
        }

        const lookSelect = documentRef.getElementById("camera-look");
        if (lookSelect) {
            lookSelect.addEventListener("change", (event) => {
                commitCameraLookMode(event?.target?.value || "manual", {
                    sourceId: "camera-look",
                    sourceName: "camera-look",
                    preserveManualRelease: event?.detail?.preserveManualRelease === true,
                });
                sync();
            });
        }

        const positionPillInputs = documentRef.querySelectorAll?.('input[name="camera-position-pill"]')
            || [];
        positionPillInputs.forEach((input) => input.addEventListener("change", (event) => {
            commitCameraPositionMode(event?.target?.value || "manual", {
                sourceId: "camera-position-pill",
                sourceName: "camera-position-pill",
                preserveManualRelease: event?.detail?.preserveManualRelease === true,
            });
            sync();
        }));

        const lookPillInputs = documentRef.querySelectorAll?.('input[name="camera-look-pill"]')
            || [];
        lookPillInputs.forEach((input) => input.addEventListener("change", (event) => {
            commitCameraLookMode(event?.target?.value || "manual", {
                sourceId: "camera-look-pill",
                sourceName: "camera-look-pill",
                preserveManualRelease: event?.detail?.preserveManualRelease === true,
            });
            sync();
        }));

        followPillPairs.forEach(([pillId, value]) => {
            const pill = documentRef.getElementById(pillId);
            if (!pill) return;
            pill.addEventListener("click", () => {
                const positionValue = getSelectedCameraPillValue("camera-position-pill");
                const lookValue = getSelectedCameraPillValue("camera-look-pill");
                const isAlreadyActive = positionValue === "manual" && lookValue === value;
                commitCameraPair(
                    "manual",
                    isAlreadyActive ? "manual" : value,
                    { preserveManualRelease: isAlreadyActive },
                );
                sync();
            });
        });

        viewPillPairs.forEach(([pillId, position, look]) => {
            const pill = documentRef.getElementById(pillId);
            if (!pill) return;
            pill.addEventListener("click", () => {
                const positionValue = getSelectedCameraPillValue("camera-position-pill");
                const lookValue = getSelectedCameraPillValue("camera-look-pill");
                const isAlreadyActive = positionValue === position && lookValue === look;
                const nextPosition = isAlreadyActive ? "manual" : position;
                const nextLook = isAlreadyActive ? "manual" : look;
                commitCameraPair(nextPosition, nextLook);
                sync();
            });
        });

        documentRef.addEventListener("camera-from-to-ui-updated", sync);

        sync();
    }

    return {
        bind,
        sync,
    };
}
