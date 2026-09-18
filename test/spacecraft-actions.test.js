import { describe, expect, it, vi } from "vitest";

import { createSpacecraftActions } from "../src/platform/js/app/spacecraft-actions.js";

const PLANET_PROPERTIES = {
    SC: { id: "SC", name: "Spacecraft", color: 0xffffff, orbitcolor: 0xcccccc },
};

/** Records what the renderer was asked to build without touching a GPU. */
function makeRendererClass() {
    const instances = [];
    class FakeSpacecraftRenderer {
        constructor(container, size, color, options) {
            this.container = container;
            this.size = size;
            this.color = color;
            this.options = options;
            this.craft = { tag: "craft" };
            this.craftInner = { tag: "inner" };
            this.craftEdges = { tag: "edges" };
            this.axesHelper = { tag: "axes" };
            this.drone = { tag: "drone" };
            this.built = null;
            this.disposed = false;
            instances.push(this);
        }

        createFromPlugin(pluginName, options) {
            this.built = { kind: "plugin", pluginName, options };
        }

        createSimple() {
            this.built = { kind: "simple" };
        }

        dispose() {
            this.disposed = true;
        }
    }
    return { FakeSpacecraftRenderer, instances };
}

function makeScene(bodyIds = ["SC"]) {
    return {
        motherContainer: { tag: "mother" },
        planetsForLocations: bodyIds,
    };
}

function makeActions(globalConfig, { craftSize = 4 } = {}) {
    const { FakeSpacecraftRenderer, instances } = makeRendererClass();
    const actions = createSpacecraftActions({
        SpacecraftRenderer: FakeSpacecraftRenderer,
        planetProperties: PLANET_PROPERTIES,
        getCraftSize: () => craftSize,
        getGlobalConfig: () => globalConfig,
    });
    return { actions, instances };
}

const ORION_CONFIG = {
    primaryCraftId: "SC",
    crafts: [
        { id: "SC", mnemonic: "ORION", name: "Orion", viewLabel: "Orion", primary: true },
    ],
    spacecraftModel: { enabled: true, plugin: "orion-procedural", options: { scale: 0.7 } },
};

const TWO_CRAFT_CONFIG = {
    primaryCraftId: "SC",
    crafts: [
        { id: "SC", mnemonic: "ORION", name: "Orion", viewLabel: "Orion", primary: true, color: 0x112233 },
        {
            id: "CHASER",
            mnemonic: "CHASER",
            name: "Chaser",
            viewLabel: "Chaser",
            color: 0x445566,
            orbitcolor: 0x778899,
            spacecraftModel: { enabled: true, plugin: "chaser-model", options: { scale: 2 } },
        },
    ],
    spacecraftModel: { enabled: true, plugin: "orion-procedural", options: { scale: 0.7, detail: "high" } },
};

describe("building the craft fleet", () => {
    it("builds one renderer per mission craft and indexes its parts", () => {
        const { actions, instances } = makeActions(ORION_CONFIG);
        const scene = makeScene();

        actions.addSpacecraft(scene);

        expect(instances).toHaveLength(1);
        expect(scene.spacecraftRenderersById.SC).toBe(instances[0]);
        expect(scene.craftsById.SC).toBe(instances[0].craft);
        expect(scene.craftInnersById.SC).toBe(instances[0].craftInner);
        expect(scene.craftEdgesById.SC).toBe(instances[0].craftEdges);
        expect(scene.craftAxesHelpersById.SC).toBe(instances[0].axesHelper);
        expect(scene.dronesById.SC).toBe(instances[0].drone);
    });

    it("hands the renderer the scene container and the configured craft size", () => {
        const { actions, instances } = makeActions(ORION_CONFIG, { craftSize: 12 });
        const scene = makeScene();

        actions.addSpacecraft(scene);

        expect(instances[0].container).toBe(scene.motherContainer);
        expect(instances[0].size).toBe(12);
    });

    it("marks the primary craft active", () => {
        const { actions } = makeActions(ORION_CONFIG);
        const scene = makeScene();

        actions.addSpacecraft(scene);

        expect(scene.primaryCraftId).toBe("SC");
        expect(scene.activeCraftId).toBe("SC");
        expect(scene.craft).toBe(scene.craftsById.SC);
    });

    it("builds every craft the scene carries", () => {
        const { actions, instances } = makeActions(TWO_CRAFT_CONFIG);
        const scene = makeScene(["SC", "CHASER", "MOON"]);

        actions.addSpacecraft(scene);

        expect(Object.keys(scene.spacecraftRenderersById).sort()).toEqual(["CHASER", "SC"]);
        expect(instances).toHaveLength(2);
    });

    it("falls back to a single craft when the scene lists no craft bodies", () => {
        const { actions } = makeActions(ORION_CONFIG);
        const scene = makeScene(["EARTH", "MOON"]);

        actions.addSpacecraft(scene);

        expect(Object.keys(scene.spacecraftRenderersById)).toEqual(["SC"]);
    });
});

describe("choosing the craft model", () => {
    it("uses the mission model plugin for the primary craft", () => {
        const { actions, instances } = makeActions(ORION_CONFIG);

        actions.addSpacecraft(makeScene());

        expect(instances[0].built).toEqual({
            kind: "plugin",
            pluginName: "orion-procedural",
            options: { scale: 0.7, craftId: "SC" },
        });
    });

    it("layers a craft override on top of the mission options", () => {
        const { actions, instances } = makeActions(TWO_CRAFT_CONFIG);

        actions.addSpacecraft(makeScene(["SC", "CHASER"]));

        const chaser = instances[1];
        expect(chaser.built).toEqual({
            kind: "plugin",
            pluginName: "chaser-model",
            options: { scale: 2, detail: "high", craftId: "CHASER" },
        });
    });

    it("falls back to the simple shape for a secondary craft with no model", () => {
        const config = {
            ...TWO_CRAFT_CONFIG,
            crafts: [
                TWO_CRAFT_CONFIG.crafts[0],
                { id: "CHASER", mnemonic: "CHASER", name: "Chaser", color: 0x445566 },
            ],
        };
        const { actions, instances } = makeActions(config);

        actions.addSpacecraft(makeScene(["SC", "CHASER"]));

        expect(instances[1].built).toEqual({ kind: "simple" });
    });

    it("falls back to the simple shape when the mission model is switched off", () => {
        const { actions, instances } = makeActions({
            ...ORION_CONFIG,
            spacecraftModel: { enabled: false, plugin: "orion-procedural" },
        });

        actions.addSpacecraft(makeScene());

        expect(instances[0].built).toEqual({ kind: "simple" });
    });

    it("falls back to the simple shape when a craft override is switched off", () => {
        const config = {
            ...TWO_CRAFT_CONFIG,
            crafts: [
                TWO_CRAFT_CONFIG.crafts[0],
                {
                    ...TWO_CRAFT_CONFIG.crafts[1],
                    spacecraftModel: { enabled: false, plugin: "chaser-model" },
                },
            ],
        };
        const { actions, instances } = makeActions(config);

        actions.addSpacecraft(makeScene(["SC", "CHASER"]));

        expect(instances[1].built).toEqual({ kind: "simple" });
    });

    it("falls back to the simple shape when no plugin is named", () => {
        const { actions, instances } = makeActions({
            ...ORION_CONFIG,
            spacecraftModel: { enabled: true, options: { scale: 1 } },
        });

        actions.addSpacecraft(makeScene());

        expect(instances[0].built).toEqual({ kind: "simple" });
    });

    it("accepts the legacy name field in place of plugin", () => {
        const { actions, instances } = makeActions({
            ...ORION_CONFIG,
            spacecraftModel: { enabled: true, name: "legacy-orion" },
        });

        actions.addSpacecraft(makeScene());

        expect(instances[0].built.pluginName).toBe("legacy-orion");
    });
});

describe("craft colours", () => {
    it("uses the shared spacecraft palette entry for the primary craft", () => {
        const { actions, instances } = makeActions(ORION_CONFIG);

        actions.addSpacecraft(makeScene());

        expect(instances[0].color).toBe(PLANET_PROPERTIES.SC.color);
        expect(instances[0].options.edgeColor).toBe(PLANET_PROPERTIES.SC.orbitcolor);
    });

    it("derives a secondary craft palette from its mission entry", () => {
        const { actions, instances } = makeActions(TWO_CRAFT_CONFIG);

        actions.addSpacecraft(makeScene(["SC", "CHASER"]));

        expect(instances[1].color).toBe(0x445566);
        expect(instances[1].options.edgeColor).toBe(0x778899);
        expect(instances[1].options.droneColor).toBe(0x445566);
    });

    it("prefers an explicit palette entry keyed by craft id", () => {
        const { FakeSpacecraftRenderer, instances } = makeRendererClass();
        const actions = createSpacecraftActions({
            SpacecraftRenderer: FakeSpacecraftRenderer,
            planetProperties: {
                ...PLANET_PROPERTIES,
                CHASER: { id: "CHASER", color: 0xabcdef, orbitcolor: 0xfedcba },
            },
            getCraftSize: () => 1,
            getGlobalConfig: () => TWO_CRAFT_CONFIG,
        });

        actions.addSpacecraft(makeScene(["SC", "CHASER"]));

        expect(instances[1].color).toBe(0xabcdef);
        expect(instances[1].options.edgeColor).toBe(0xfedcba);
    });

    it("falls back to the craft colour when the mission entry has no orbit colour", () => {
        const config = {
            ...TWO_CRAFT_CONFIG,
            crafts: [
                TWO_CRAFT_CONFIG.crafts[0],
                { id: "CHASER", mnemonic: "CHASER", name: "Chaser", color: 0x0f0f0f },
            ],
        };
        const { actions, instances } = makeActions(config);

        actions.addSpacecraft(makeScene(["SC", "CHASER"]));

        expect(instances[1].options.edgeColor).toBe(0x0f0f0f);
    });
});

describe("tearing the fleet down", () => {
    it("disposes every renderer and clears the scene indexes", () => {
        const { actions, instances } = makeActions(TWO_CRAFT_CONFIG);
        const scene = makeScene(["SC", "CHASER"]);
        actions.addSpacecraft(scene);

        actions.disposeSpacecraft(scene);

        expect(instances.every((renderer) => renderer.disposed)).toBe(true);
        expect(scene.spacecraftRenderersById).toEqual({});
        expect(scene.craftsById).toEqual({});
        expect(scene.craftInnersById).toEqual({});
        expect(scene.craftEdgesById).toEqual({});
        expect(scene.craftAxesHelpersById).toEqual({});
        expect(scene.dronesById).toEqual({});
    });

    it("resets the active selection back to the default craft", () => {
        const { actions } = makeActions(TWO_CRAFT_CONFIG);
        const scene = makeScene(["SC", "CHASER"]);
        actions.addSpacecraft(scene);

        actions.disposeSpacecraft(scene);

        expect(scene.primaryCraftId).toBe("SC");
        expect(scene.activeCraftId).toBe("SC");
        expect(scene.visibleCraftIds).toBeNull();
        expect(scene.craft).toBeNull();
        expect(scene.drone).toBeNull();
        expect(scene.craftVisible).toBe(false);
    });

    it("is safe on a scene that never had a fleet", () => {
        const { actions } = makeActions(ORION_CONFIG);
        const scene = makeScene();

        expect(() => actions.disposeSpacecraft(scene)).not.toThrow();
        expect(scene.spacecraftRenderersById).toEqual({});
    });

    it("tolerates a renderer with no dispose hook", () => {
        const { actions } = makeActions(ORION_CONFIG);
        const scene = makeScene();
        actions.addSpacecraft(scene);
        scene.spacecraftRenderersById.SC = { craft: null };

        expect(() => actions.disposeSpacecraft(scene)).not.toThrow();
    });

    it("can rebuild the fleet after a teardown", () => {
        const { actions, instances } = makeActions(ORION_CONFIG);
        const scene = makeScene();
        actions.addSpacecraft(scene);
        actions.disposeSpacecraft(scene);

        actions.addSpacecraft(scene);

        expect(instances).toHaveLength(2);
        expect(scene.spacecraftRenderersById.SC).toBe(instances[1]);
    });
});

describe("the injected seams", () => {
    it("reads the craft size afresh on every build", () => {
        const getCraftSize = vi.fn(() => 3);
        const { FakeSpacecraftRenderer, instances } = makeRendererClass();
        const actions = createSpacecraftActions({
            SpacecraftRenderer: FakeSpacecraftRenderer,
            planetProperties: PLANET_PROPERTIES,
            getCraftSize,
            getGlobalConfig: () => ORION_CONFIG,
        });
        const scene = makeScene();

        actions.addSpacecraft(scene);
        getCraftSize.mockReturnValue(9);
        actions.disposeSpacecraft(scene);
        actions.addSpacecraft(scene);

        expect(instances[0].size).toBe(3);
        expect(instances[1].size).toBe(9);
    });
});
