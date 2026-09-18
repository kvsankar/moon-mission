import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installFakeDom } from "./helpers/fake-dom.js";
import {
    applyDynamicLabels,
    applyMissionMetadata,
    computeDynamicLabels,
} from "../src/platform/js/app/mission-metadata.js";

let dom = null;

function labelText(labels, id) {
    return labels.labelElements.find((entry) => entry.id === id)?.text;
}

beforeEach(() => {
    dom = installFakeDom([
        { id: "mission-link", tag: "a" },
        { id: "mission-summary", tag: "p" },
        {
            id: "meta-description",
            tag: "meta",
            attrs: { name: "description", content: "old" },
        },
        {
            id: "meta-og",
            tag: "meta",
            attrs: { property: "og:description", content: "old" },
        },
    ]);
});

afterEach(() => {
    dom?.restore();
    dom = null;
});

describe("computeDynamicLabels", () => {
    it("returns nothing without a mission config", () => {
        expect(computeDynamicLabels({ globalConfig: null })).toBeNull();
    });

    it("derives every label from the mission name", () => {
        const labels = computeDynamicLabels({
            globalConfig: { mission_name: "Artemis II", mission_name_short: "A2" },
        });

        expect(labels.pageTitle).toBe("Artemis II - Orbit Animation");
        expect(labels.headerTitle).toBe("Artemis II");
        expect(labels.spacecraftShort).toBe("A2");
        expect(labelText(labels, "label-lock-spacecraft")).toBe("Artemis II");
        expect(labelText(labels, "label-orbit")).toBe("A2 Orbit");
        expect(labelText(labels, "label-orbit-descent")).toBe("A2 Descent Orbit");
    });

    it("falls back to the spacecraft mnemonic for the short name", () => {
        const labels = computeDynamicLabels({
            globalConfig: { mission_name: "Chandrayaan 3", spacecraft_mnemonic: "CY3" },
        });

        expect(labels.spacecraftShort).toBe("CY3");
        expect(labelText(labels, "label-orbit")).toBe("CY3 Orbit");
    });

    it("falls back to generic names for a bare config", () => {
        const labels = computeDynamicLabels({ globalConfig: {} });

        expect(labels.headerTitle).toBe("Spacecraft");
        expect(labels.spacecraftShort).toBe("SC");
        expect(labels.missionUrl).toBe("#");
    });

    it("lets the UI block override the derived titles", () => {
        const labels = computeDynamicLabels({
            globalConfig: {
                mission_name: "Artemis II",
                ui: {
                    pageTitle: "Custom Page",
                    headerTitle: "Custom Header",
                    lockOnLabel: "Lock Orion",
                    orbitLabel: "Orion Path",
                    descentOrbitLabel: "Orion Descent",
                },
            },
        });

        expect(labels.pageTitle).toBe("Custom Page");
        expect(labels.headerTitle).toBe("Custom Header");
        expect(labelText(labels, "label-lock-spacecraft")).toBe("Lock Orion");
        expect(labelText(labels, "label-orbit")).toBe("Orion Path");
        expect(labelText(labels, "label-orbit-descent")).toBe("Orion Descent");
    });

    it("names the secondary craft toggle from the crafts list", () => {
        const labels = computeDynamicLabels({
            globalConfig: {
                mission_name: "Chandrayaan 3",
                crafts: [
                    { id: "PM", primary: true, name: "Propulsion Module" },
                    { id: "LM", viewLabel: "Lander" },
                ],
            },
        });

        expect(labelText(labels, "label-additional-crafts")).toBe("Show Lander");
    });

    it("works down the secondary craft naming fallbacks", () => {
        const byName = computeDynamicLabels({
            globalConfig: { crafts: [{ primary: true }, { name: "Vikram" }] },
        });
        expect(labelText(byName, "label-additional-crafts")).toBe("Show Vikram");

        const byMnemonic = computeDynamicLabels({
            globalConfig: { crafts: [{ primary: true }, { mnemonic: "VKM" }] },
        });
        expect(labelText(byMnemonic, "label-additional-crafts")).toBe("Show VKM");

        const byId = computeDynamicLabels({
            globalConfig: { crafts: [{ primary: true }, { id: "LM" }] },
        });
        expect(labelText(byId, "label-additional-crafts")).toBe("Show LM");
    });

    it("falls back to a generic secondary craft label", () => {
        const labels = computeDynamicLabels({ globalConfig: { crafts: [{ primary: true }] } });

        expect(labelText(labels, "label-additional-crafts")).toBe("Show Secondary Craft");
    });

    it("lets the UI block override the whole toggle label", () => {
        const labels = computeDynamicLabels({
            globalConfig: {
                crafts: [{ primary: true }, { name: "Vikram" }],
                ui: { additionalCraftToggleLabel: "Second craft" },
            },
        });

        expect(labelText(labels, "label-additional-crafts")).toBe("Second craft");
    });

    it("prefers the mission description over the UI summary", () => {
        const labels = computeDynamicLabels({
            globalConfig: {
                mission_description: "A crewed lunar flyby.",
                ui: { headerSummary: "ignored", metaDescription: "ignored too" },
            },
        });

        expect(labels.headerSummary).toBe("A crewed lunar flyby.");
        expect(labels.metaDescription).toBe("A crewed lunar flyby.");
    });

    it("falls back to the authored defaults with no description at all", () => {
        const labels = computeDynamicLabels({ globalConfig: {} });

        expect(labels.headerSummary).toContain("Sankar Viswanathan");
        expect(labels.metaDescription).toContain("lunar mission orbit visualizations");
    });
});

describe("applyDynamicLabels", () => {
    function makeSinks() {
        return {
            updateMultipleElementsText: vi.fn(),
            updateSpacecraftMnemonic: vi.fn(),
        };
    }

    it("does nothing without labels", () => {
        const sinks = makeSinks();

        applyDynamicLabels({ labels: null, document: dom.document, ...sinks });

        expect(sinks.updateMultipleElementsText).not.toHaveBeenCalled();
    });

    it("writes the page title, header link and summary", () => {
        const labels = computeDynamicLabels({
            globalConfig: {
                mission_name: "Artemis II",
                mission_url: "https://example.test/artemis2",
                mission_description: "A crewed lunar flyby.",
            },
        });
        const sinks = makeSinks();

        applyDynamicLabels({ labels, document: dom.document, ...sinks });

        expect(dom.document.title).toBe("Artemis II - Orbit Animation");
        expect(dom.document.getElementById("mission-link").textContent).toBe("Artemis II");
        expect(dom.document.getElementById("mission-link").href)
            .toBe("https://example.test/artemis2");
        expect(dom.document.getElementById("mission-summary").textContent)
            .toBe("A crewed lunar flyby.");
    });

    it("updates every description meta tag that exists", () => {
        const labels = computeDynamicLabels({
            globalConfig: { mission_description: "A crewed lunar flyby." },
        });

        applyDynamicLabels({ labels, document: dom.document, ...makeSinks() });

        expect(dom.document.getElementById("meta-description").getAttribute("content"))
            .toBe("A crewed lunar flyby.");
        expect(dom.document.getElementById("meta-og").getAttribute("content"))
            .toBe("A crewed lunar flyby.");
    });

    it("hands the label list and mnemonic to the DOM sinks", () => {
        const labels = computeDynamicLabels({
            globalConfig: { mission_name: "Artemis II", mission_name_short: "A2" },
        });
        const sinks = makeSinks();

        applyDynamicLabels({ labels, document: dom.document, ...sinks });

        expect(sinks.updateMultipleElementsText).toHaveBeenCalledWith(labels.labelElements, true);
        expect(sinks.updateSpacecraftMnemonic).toHaveBeenCalledWith("A2");
    });

    it("tolerates a page without the header elements", () => {
        dom.restore();
        dom = installFakeDom();
        const labels = computeDynamicLabels({ globalConfig: { mission_name: "Artemis II" } });

        expect(() => applyDynamicLabels({ labels, document: dom.document, ...makeSinks() }))
            .not.toThrow();
        expect(dom.document.title).toBe("Artemis II - Orbit Animation");
    });
});

describe("applyMissionMetadata", () => {
    it("announces the UI block to interested listeners", () => {
        const seen = [];
        dom.document.addEventListener("mission-ui-config-updated", (event) => seen.push(event.detail));

        applyMissionMetadata({
            globalConfig: { mission_name: "Artemis II", ui: { pageTitle: "A2" } },
            planetProperties: { SC: { name: "SC" } },
            document: dom.document,
            updateMultipleElementsText: vi.fn(),
            updateSpacecraftMnemonic: vi.fn(),
        });

        expect(seen).toEqual([{ ui: { pageTitle: "A2" } }]);
    });

    it("announces an empty UI block when the mission has none", () => {
        const seen = [];
        dom.document.addEventListener("mission-ui-config-updated", (event) => seen.push(event.detail));

        applyMissionMetadata({
            globalConfig: { mission_name: "Artemis II" },
            planetProperties: { SC: { name: "SC" } },
            document: dom.document,
            updateMultipleElementsText: vi.fn(),
            updateSpacecraftMnemonic: vi.fn(),
        });

        expect(seen).toEqual([{ ui: {} }]);
    });

    it("renames the legacy craft entry from the mission mnemonic", () => {
        const planetProperties = { SC: { name: "SC" } };

        applyMissionMetadata({
            globalConfig: { mission_name: "Chandrayaan 3", spacecraft_mnemonic: "CY3" },
            planetProperties,
            document: dom.document,
            updateMultipleElementsText: vi.fn(),
            updateSpacecraftMnemonic: vi.fn(),
        });

        expect(planetProperties.SC.name).toBe("CY3");
    });

    it("leaves the legacy craft entry alone without a mnemonic", () => {
        const planetProperties = { SC: { name: "SC" } };

        applyMissionMetadata({
            globalConfig: { mission_name: "Artemis II" },
            planetProperties,
            document: dom.document,
            updateMultipleElementsText: vi.fn(),
            updateSpacecraftMnemonic: vi.fn(),
        });

        expect(planetProperties.SC.name).toBe("SC");
    });
});
