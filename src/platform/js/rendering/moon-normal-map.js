import * as THREE from "three";
import { buildPhysicalMoonNormalData } from "./moon-physical-normal-data.js";
import { downsampleMoonHeightData, MOON_HEIGHT_SCALE } from "./moon-terrain-package.js";

export const DEFAULT_MOON_NORMAL_MAP_SETTINGS = Object.freeze({
    normalMapMaxWidth: 5760,
    physicalNormalHeightScale: MOON_HEIGHT_SCALE,
    physicalNormalSlopeBoost: 1,
    physicalNormalSlopeBoostStart: 0.16,
    physicalNormalSlopeBoostEnd: 0.34,
});

// Fallback for supplied physical height textures. Runtime profiles normally
// arrive with worker-decoded/prepared normals and never run this on the UI thread.
export function buildMoonNormalMapFromHeightTexture(heightTexture, renderSettings = {}) {
    const source = heightTexture?.image;
    if (!source || !(source.data instanceof Float32Array) || source.width < 2 || source.height < 2) return null;
    const settings = { ...DEFAULT_MOON_NORMAL_MAP_SETTINGS, ...renderSettings };
    if (!(settings.physicalNormalHeightScale > 0)) return null;
    const width = Math.min(source.width, Math.max(2, Math.round(settings.normalMapMaxWidth)));
    const height = Math.max(2, Math.round(source.height * width / source.width));
    const heightData = width === source.width ? source.data
        : downsampleMoonHeightData(source.data, source.width, source.height, width, height);
    const startedAt = globalThis.performance?.now?.() ?? Date.now();
    const normalData = buildPhysicalMoonNormalData({
        heightData, width, height, physicalHeightScale: settings.physicalNormalHeightScale,
        flipY: heightTexture.flipY !== false,
        slopeBoost: settings.physicalNormalSlopeBoost,
        slopeBoostStart: settings.physicalNormalSlopeBoostStart,
        slopeBoostEnd: settings.physicalNormalSlopeBoostEnd,
    });
    const texture = new THREE.DataTexture(normalData, width, height, THREE.RGBAFormat, THREE.HalfFloatType);
    texture.flipY = heightTexture.flipY !== false;
    texture.wrapS = heightTexture.wrapS;
    texture.wrapT = heightTexture.wrapT;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.userData = { buildMilliseconds: (globalThis.performance?.now?.() ?? Date.now()) - startedAt, moonNormalEncoding: "physical-spherical-half-float" };
    texture.needsUpdate = true;
    return texture;
}
