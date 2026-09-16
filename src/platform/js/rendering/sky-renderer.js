import { replaceTextureOwner, updateTextureOwner, detachTextureOwner } from "./texture-ownership.js";
/**
 * Sky Renderer - Starfield and constellation background
 *
 * Manages the celestial sphere background:
 * - Starmap texture on a large sphere
 * - Constellation overlay with additive blending
 * - Orientation aligned to Earth's axis
 * - Position tracking with camera for infinite sky effect
 */

import * as THREE from 'three';
import { PHYSICS_CONSTANTS as PC } from '../core/constants.js';

const SKY_STARMAP_OPACITY = 0.28;
const SKY_CONSTELLATION_OPACITY = 0.04;
const SKY_LOWER_SHADE_COLOR = new THREE.Color(0x02050c);
const SKY_LOWER_SHADE_ALPHA = 0.48;
const SKY_LAYER = 2;

const SKY_SHADE_VERTEX_SHADER = `
    varying vec3 vViewDir;

    void main() {
        vec4 viewPos = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(viewPos.xyz);
        gl_Position = projectionMatrix * viewPos;
    }
`;

const SKY_SHADE_FRAGMENT_SHADER = `
    uniform vec3 uShadeColor;
    uniform float uMaxAlpha;
    varying vec3 vViewDir;

    void main() {
        float lower = smoothstep(-0.06, 0.98, -vViewDir.y);
        float alpha = uMaxAlpha * pow(lower, 1.38);
        gl_FragColor = vec4(uShadeColor, alpha);
    }
`;

export class SkyRenderer {
    /**
     * @param {THREE.Object3D} parentContainer - Container to add sky to
     * @param {number} baseRadius - Base radius for calculating sky sphere size
     */
    constructor(parentContainer, baseRadius) {
        this.parentContainer = parentContainer;
        this.baseRadius = baseRadius;

        // Container and meshes
        this.container = null;
        this.skyMesh = null;
        this.constellationMesh = null;
        this.lowerShadeMesh = null;
        this.geometry = null;

        // Textures (set externally before create())
        this.skyTexture = null;
        this.constellationTexture = null;

        // Calculated radius
        this.radius = 200 * baseRadius;
    }

    /**
     * Set textures before creating the sky
     * @param {THREE.Texture} skyTexture - Starmap texture
     * @param {THREE.Texture} constellationTexture - Constellation overlay texture
     */
    _textureInputs() {
        return [this.skyTexture, this.constellationTexture,
            this.skyMesh?.material?.map, this.constellationMesh?.material?.map];
    }

    setTextures(skyTexture, constellationTexture) {
        this.skyTexture = skyTexture;
        this.constellationTexture = constellationTexture;
        replaceTextureOwner(this, this._textureInputs(), { disposePrevious: false });
    }

    /**
     * Update sky textures after creation.
     * @param {THREE.Texture} skyTexture
     * @param {THREE.Texture} constellationTexture
     * @param {{ disposePrevious?: boolean }} options
     */
    updateTextures(skyTexture, constellationTexture, { disposePrevious = true } = {}) {
        return updateTextureOwner(this, () => this._textureInputs(), () => {
            this.skyTexture = skyTexture;
            this.constellationTexture = constellationTexture;

            if (this.skyMesh?.material) {
                this.skyMesh.material.map = this.skyTexture || null;
                this.skyMesh.material.needsUpdate = true;
            }

            if (this.constellationMesh?.material) {
                this.constellationMesh.material.map = this.constellationTexture || null;
                this.constellationMesh.material.needsUpdate = true;
            }
        }, { disposePrevious });
    }

    /**
     * Create the sky sphere with starmap and constellation overlay
     * @param {boolean} visible - Initial visibility
     */
    create(visible = true) {
        // Create container tilted to Earth's axis
        this.container = new THREE.Group();
        this.container.lookAt(
            0,
            Math.sin(PC.EARTH_AXIS_INCLINATION_RADS),
            Math.cos(PC.EARTH_AXIS_INCLINATION_RADS)
        );

        this.geometry = new THREE.SphereGeometry(this.radius);

        // Starmap sphere
        const skyMaterial = new THREE.MeshBasicMaterial({
            blending: THREE.AdditiveBlending,
            map: this.skyTexture,
            opacity: SKY_STARMAP_OPACITY,
            transparent: true,
            depthWrite: false,
            toneMapped: false,
        });
        skyMaterial.side = THREE.BackSide;

        this.skyMesh = new THREE.Mesh(this.geometry, skyMaterial);
        this.skyMesh.receiveShadow = false;
        this.skyMesh.castShadow = false;
        this.skyMesh.layers.set(SKY_LAYER);
        this.skyMesh.rotateX(Math.PI / 2);  // Orient texture correctly
        this.skyMesh.renderOrder = -30;
        this.container.add(this.skyMesh);

        // Constellation overlay sphere
        const constellationMaterial = new THREE.MeshBasicMaterial({
            blending: THREE.AdditiveBlending,
            map: this.constellationTexture,
            opacity: SKY_CONSTELLATION_OPACITY,
            transparent: true,
            depthWrite: false,
            toneMapped: false,
        });
        constellationMaterial.side = THREE.BackSide;

        this.constellationMesh = new THREE.Mesh(this.geometry, constellationMaterial);
        this.constellationMesh.receiveShadow = false;
        this.constellationMesh.castShadow = false;
        this.constellationMesh.layers.set(SKY_LAYER);
        this.constellationMesh.rotateX(Math.PI / 2);  // Orient texture correctly
        this.constellationMesh.renderOrder = -29;
        this.container.add(this.constellationMesh);

        const lowerShadeMaterial = new THREE.ShaderMaterial({
            vertexShader: SKY_SHADE_VERTEX_SHADER,
            fragmentShader: SKY_SHADE_FRAGMENT_SHADER,
            uniforms: {
                uShadeColor: { value: SKY_LOWER_SHADE_COLOR.clone() },
                uMaxAlpha: { value: SKY_LOWER_SHADE_ALPHA },
            },
            side: THREE.BackSide,
            transparent: true,
            depthWrite: false,
            depthTest: true,
            toneMapped: false,
        });

        this.lowerShadeMesh = new THREE.Mesh(this.geometry, lowerShadeMaterial);
        this.lowerShadeMesh.receiveShadow = false;
        this.lowerShadeMesh.castShadow = false;
        this.lowerShadeMesh.layers.set(SKY_LAYER);
        this.lowerShadeMesh.renderOrder = -28;
        this.container.add(this.lowerShadeMesh);

        // Mirror and rotate for correct orientation
        this.container.scale.set(-1, 1, 1);
        this.container.rotateZ(Math.PI);

        this.container.visible = visible;
        this.parentContainer.add(this.container);
    }

    /**
     * Update sky position to follow camera (creates infinite sky effect)
     * @param {THREE.Camera} camera - Camera to follow
     */
    updatePosition(camera) {
        if (this.container) {
            this.container.position.setFromMatrixPosition(camera.matrixWorld);
        }
    }

    /**
     * Set visibility of the sky
     * @param {boolean} visible - Whether sky should be visible
     */
    setVisible(visible) {
        if (this.container) {
            this.container.visible = visible;
        }
    }

    /**
     * Get visibility state
     * @returns {boolean} Current visibility
     */
    isVisible() {
        return this.container ? this.container.visible : false;
    }

    /**
     * Dispose all sky resources
     */
    dispose() {
        const releaseTextures = detachTextureOwner(this, [this.skyTexture, this.constellationTexture]);
        this.skyTexture = null;
        this.constellationTexture = null;
        try {
            if (this.container) {
                // Dispose sky mesh
                if (this.skyMesh) {
                    if (this.skyMesh.material) {
                        this.skyMesh.material.dispose();
                    }
                    this.container.remove(this.skyMesh);
                    this.skyMesh = null;
                }

                // Dispose constellation mesh
                if (this.constellationMesh) {
                    if (this.constellationMesh.material) {
                        this.constellationMesh.material.dispose();
                    }
                    this.container.remove(this.constellationMesh);
                    this.constellationMesh = null;
                }

                if (this.lowerShadeMesh) {
                    if (this.lowerShadeMesh.material) {
                        this.lowerShadeMesh.material.dispose();
                    }
                    this.container.remove(this.lowerShadeMesh);
                    this.lowerShadeMesh = null;
                }

                if (this.geometry) {
                    this.geometry.dispose();
                    this.geometry = null;
                }

                // Remove container
                this.parentContainer.remove(this.container);
                this.container = null;
            }
        } finally { releaseTextures(); }
    }
}
