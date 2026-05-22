import { requestSceneOrbitOverlapRefinement } from "./orbit-overlap-manager.js";

export function createZoomActions({
    d3,
    getSvgContainer,
    getCurrentDimension,
    animationScenes,
    getConfig,
    getZoomFactor,
    setZoomFactor,
    getPanX,
    setPanX,
    getPanY,
    setPanY,
    getOffsetX,
    getOffsetY,
    adjustLabelLocations,
    showGreenwichLongitude,
    getOrbitStyle,
    refreshOrbitMilestones2D = null,
}) {
    function zoomChangeTransform(t) {
        // Only process in 2D mode when svgContainer exists
        const svgContainer = getSvgContainer();
        if (!svgContainer || getCurrentDimension() !== "2D") {
            return;
        }

        const config = getConfig();
        const zoomFactor = getZoomFactor();
        const panx = getPanX();
        const pany = getPanY();
        const offsetx = getOffsetX();
        const offsety = getOffsetY();

        var cy3x = 0;
        var cy3y = 0;

        if (animationScenes[config].lockOnSC) {
            const activeCraftId = animationScenes[config].activeCraftId || "SC";
            var scElement = d3.select("#" + activeCraftId);
            if (!scElement.empty()) {
                cy3x = parseFloat(scElement.attr("cx"));
                cy3y = parseFloat(scElement.attr("cy"));
            }
        }

        if (animationScenes[config].lockOnMoon) {
            var moonElement = d3.select("#MOON");
            if (!moonElement.empty()) {
                cy3x = parseFloat(moonElement.attr("cx"));
                cy3y = parseFloat(moonElement.attr("cy"));
            }
        }

        if (animationScenes[config].lockOnEarth) {
            var earthElement = d3.select("#EARTH");
            if (!earthElement.empty()) {
                cy3x = parseFloat(earthElement.attr("cx"));
                cy3y = parseFloat(earthElement.attr("cy"));
            }
        }

        var container = svgContainer;
        // if (t != 0) {
        //     container = svgContainer.transition().delay(t);
        // }

        container.attr(
            "transform",
            "matrix(" +
                zoomFactor +
                ", 0" +
                ", 0" +
                ", " +
                zoomFactor +
                ", " +
                (offsetx +
                    panx +
                    cy3x -
                    zoomFactor * cy3x -
                    cy3x) +
                ", " +
                (offsety +
                    pany +
                    cy3y -
                    zoomFactor * cy3y -
                    cy3y) +
                ")",
        );
        animationScenes[config].orbitSvgTransformMatrix = container.attr("transform") || "";
        requestSceneOrbitOverlapRefinement({
            scene: animationScenes[config],
            dimension: "2D",
            orbitStyle: getOrbitStyle?.() || "trail",
        });
        refreshOrbitMilestones2D?.();

        // var zoom = d3.zoom().on("zoom", handleZoom).on("end", adjustLabelLocations);

        // sychronize D3's state // TODO
        // svgRect && svgRect
        //     .call(zoom.transform,
        //         d3.zoomIdentity
        //         .translate([offsetx+panx, offsety+pany])
        //         .scale(zoomFactor));
    }

    function zoomChange(t) {
        zoomChangeTransform(t);
        showGreenwichLongitude();
    }

    function handleZoom(_event) {
        var x = d3.event.translate[0];
        var y = d3.event.translate[1];
        setZoomFactor(d3.event.scale);
        setPanX(x - getOffsetX());
        setPanY(y - getOffsetY());
        zoomChangeTransform();
    }

    function handleZoomNew(event) {
        // console.log(event);
        const x = event.transform.x || 0;
        const y = event.transform.y || 0;
        setZoomFactor(event.transform.k || 1);
        setPanX(x - getOffsetX());
        setPanY(y - getOffsetY());
        zoomChangeTransform();
    }

    function zoomEnd() {
        adjustLabelLocations();
    }

    return {
        handleZoom,
        handleZoomNew,
        zoomEnd,
        zoomChangeTransform,
        zoomChange,
    };
}
