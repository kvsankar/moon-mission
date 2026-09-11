// Pan is measured in viewport fractions so URLs survive resizing.
export function normalizeImageView(view = {}) {
    const bounded = (value, low, high, fallback) => Number.isFinite(Number(value))
        ? Math.max(low, Math.min(high, Number(value))) : fallback;
    return {
        zoom: bounded(view.zoom ?? 1, 0.25, 12, 1),
        x: bounded(view.x ?? 0, -4, 4, 0),
        y: bounded(view.y ?? 0, -4, 4, 0),
    };
}

export function zoomImageAt(view, zoom, anchor = { x: 0, y: 0 }) {
    const next = normalizeImageView({ ...view, zoom });
    const ratio = next.zoom / view.zoom;
    return normalizeImageView({
        zoom: next.zoom,
        x: anchor.x - (anchor.x - view.x) * ratio,
        y: anchor.y - (anchor.y - view.y) * ratio,
    });
}

export function fullMoonVerticalFov(distanceInRadii, aspect, diskFraction = 0.82) {
    // Include relief above the reference sphere and fit the limiting dimension.
    const halfAngle = Math.asin(Math.min(0.999, 1.02 / distanceInRadii));
    return 2 * Math.atan(Math.tan(halfAngle) / (diskFraction * Math.min(1, aspect))) * 180 / Math.PI;
}

export function bindImageNavigation({ viewport, controls, getView, setView, fit }) {
    const zoom = (factor, anchor) => setView(zoomImageAt(getView(), getView().zoom * factor, anchor));
    controls.querySelectorAll('[data-zoom]').forEach(button => {
        button.addEventListener('click', () => zoom(Number(button.dataset.zoom)));
    });
    controls.querySelector('[data-fit]').addEventListener('click', fit);
    controls.querySelectorAll('[data-pan]').forEach(button => {
        button.addEventListener('click', () => {
            const [x, y] = button.dataset.pan.split(',').map(Number);
            setView(normalizeImageView({ ...getView(), x: getView().x + x, y: getView().y + y }));
        });
    });
    viewport.addEventListener('wheel', event => {
        event.preventDefault();
        const bounds = viewport.getBoundingClientRect();
        const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? bounds.height : 1);
        zoom(Math.exp(-Math.max(-150, Math.min(150, delta)) * 0.002), {
            x: (event.clientX - bounds.left) / bounds.width - 0.5,
            y: (event.clientY - bounds.top) / bounds.height - 0.5,
        });
    }, { passive: false });
    let drag = null;
    viewport.addEventListener('pointerdown', event => {
        if (event.button !== 0 || drag) return;
        drag = { id: event.pointerId, x: event.clientX, y: event.clientY, view: { ...getView() } };
        viewport.setPointerCapture(event.pointerId);
        viewport.classList.add('is-dragging');
        event.preventDefault();
    });
    viewport.addEventListener('pointermove', event => {
        if (!drag || drag.id !== event.pointerId) return;
        const bounds = viewport.getBoundingClientRect();
        setView(normalizeImageView({ ...drag.view,
            x: drag.view.x + (event.clientX - drag.x) / bounds.width,
            y: drag.view.y + (event.clientY - drag.y) / bounds.height,
        }));
    });
    const endDrag = event => {
        if (!drag || drag.id !== event.pointerId) return;
        drag = null;
        viewport.classList.remove('is-dragging');
        if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    };
    viewport.addEventListener('pointerup', endDrag);
    viewport.addEventListener('pointercancel', endDrag);
    viewport.addEventListener('lostpointercapture', endDrag);
    viewport.addEventListener('keydown', event => {
        const movement = { ArrowLeft: [-0.04, 0], ArrowRight: [0.04, 0], ArrowUp: [0, -0.04], ArrowDown: [0, 0.04] }[event.key];
        if (movement) {
            event.preventDefault();
            setView(normalizeImageView({ ...getView(), x: getView().x + movement[0], y: getView().y + movement[1] }));
        } else if (['+', '=', '-'].includes(event.key)) {
            event.preventDefault(); zoom(event.key === '-' ? 0.8 : 1.25);
        } else if (event.key === 'Home') { event.preventDefault(); fit(); }
    });
}
