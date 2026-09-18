import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installFakeDom } from "./helpers/fake-dom.js";
import {
    clearEventInfo,
    clearProgressLabel,
    d3Select,
    d3SelectAll,
    getElementById,
    setFPSCounterVisibility,
    updateD3ElementAttribute,
    updateD3ElementHTML,
    updateD3ElementProperty,
    updateD3ElementStyle,
    updateD3ElementText,
    updateElementHTML,
    updateElementStyle,
    updateElementText,
    updateEventInfo,
    updateFPSCounter,
    updateMultipleElementsHTML,
    updateMultipleElementsText,
    updateProgressLabel,
    updateSpacecraftMnemonic,
} from "../src/platform/js/core/dom.js";

let dom = null;
let warn = null;

beforeEach(() => {
    dom = installFakeDom([
        { id: "fps-counter", tag: "div" },
        { id: "spacecraft-mnemonic", tag: "span" },
        { id: "eventinfo", tag: "div" },
        { id: "progressbar-label", tag: "div" },
        { id: "row-a", tag: "div", className: "row" },
        { id: "row-b", tag: "div", className: "row" },
    ]);
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
    warn?.mockRestore();
    warn = null;
    dom?.restore();
    dom = null;
});

describe("element lookup", () => {
    it("returns the element and stays quiet when it exists", () => {
        expect(getElementById("fps-counter")).toBe(dom.document.getElementById("fps-counter"));
        expect(warn).not.toHaveBeenCalled();
    });

    it("warns once for a missing element", () => {
        expect(getElementById("no-such-element")).toBeNull();
        expect(warn).toHaveBeenCalledWith("Element with ID 'no-such-element' not found");
    });

    it("can be told to stay quiet about a missing element", () => {
        expect(getElementById("no-such-element", true)).toBeNull();
        expect(warn).not.toHaveBeenCalled();
    });
});

describe("direct element updates", () => {
    it("reports success after writing text", () => {
        expect(updateElementText("fps-counter", "hello")).toBe(true);
        expect(dom.document.getElementById("fps-counter").textContent).toBe("hello");
    });

    it("reports failure for a missing element", () => {
        expect(updateElementText("missing", "hello", true)).toBe(false);
        expect(updateElementHTML("missing", "<b>x</b>", true)).toBe(false);
        expect(updateElementStyle("missing", "display", "none", true)).toBe(false);
    });

    it("writes HTML and style properties", () => {
        expect(updateElementHTML("eventinfo", "<b>burn</b>")).toBe(true);
        expect(dom.document.getElementById("eventinfo").innerHTML).toBe("<b>burn</b>");

        expect(updateElementStyle("eventinfo", "display", "none")).toBe(true);
        expect(dom.document.getElementById("eventinfo").style.display).toBe("none");
    });

    it("counts only the bulk text updates that landed", () => {
        const count = updateMultipleElementsText([
            { id: "row-a", text: "A" },
            { id: "missing", text: "B" },
            { id: "row-b", text: "C" },
        ], true);

        expect(count).toBe(2);
        expect(dom.document.getElementById("row-a").textContent).toBe("A");
        expect(dom.document.getElementById("row-b").textContent).toBe("C");
    });

    it("counts only the bulk HTML updates that landed", () => {
        const count = updateMultipleElementsHTML([
            { id: "row-a", html: "<i>A</i>" },
            { id: "missing", html: "<i>B</i>" },
        ], true);

        expect(count).toBe(1);
        expect(dom.document.getElementById("row-a").innerHTML).toBe("<i>A</i>");
    });
});

describe("d3 selection helpers", () => {
    it("returns a live selection and stays quiet when it matches", () => {
        expect(d3Select("#fps-counter").empty()).toBe(false);
        expect(d3SelectAll(".row").size()).toBe(2);
        expect(warn).not.toHaveBeenCalled();
    });

    it("warns about an empty selection", () => {
        d3Select("#nothing");
        d3SelectAll(".nothing");

        expect(warn).toHaveBeenCalledWith("D3 selection '#nothing' is empty");
        expect(warn).toHaveBeenCalledWith("D3 selectAll '.nothing' is empty");
    });

    it("can be told to stay quiet about an empty selection", () => {
        d3Select("#nothing", true);
        d3SelectAll(".nothing", true);

        expect(warn).not.toHaveBeenCalled();
    });

    it("writes text, HTML, attributes, styles and properties", () => {
        expect(updateD3ElementText("#row-a", "text")).toBe(true);
        expect(updateD3ElementHTML("#row-b", "<i>html</i>")).toBe(true);
        expect(updateD3ElementAttribute("#row-a", "data-state", "ready")).toBe(true);
        expect(updateD3ElementStyle("#row-a", "color", "red")).toBe(true);
        expect(updateD3ElementProperty("#row-a", "checked", true)).toBe(true);

        const rowA = dom.document.getElementById("row-a");
        expect(rowA.textContent).toBe("text");
        expect(dom.document.getElementById("row-b").innerHTML).toBe("<i>html</i>");
        expect(rowA.getAttribute("data-state")).toBe("ready");
        expect(rowA.style.getPropertyValue("color")).toBe("red");
        expect(rowA.checked).toBe(true);
    });

    it("reports failure for every empty d3 update", () => {
        expect(updateD3ElementText("#nothing", "x", true)).toBe(false);
        expect(updateD3ElementHTML("#nothing", "x", true)).toBe(false);
        expect(updateD3ElementAttribute("#nothing", "a", "x", true)).toBe(false);
        expect(updateD3ElementStyle("#nothing", "color", "red", true)).toBe(false);
        expect(updateD3ElementProperty("#nothing", "checked", true, true)).toBe(false);
    });
});

describe("mission readouts", () => {
    it("rounds the FPS readout to whole frames", () => {
        expect(updateFPSCounter(59.6)).toBe(true);
        expect(dom.document.getElementById("fps-counter").textContent).toBe("FPS: 60");
    });

    it("toggles the FPS counter without removing it", () => {
        setFPSCounterVisibility(false);
        expect(dom.document.getElementById("fps-counter").style.display).toBe("none");

        setFPSCounterVisibility(true);
        expect(dom.document.getElementById("fps-counter").style.display).toBe("block");
    });

    it("writes the spacecraft mnemonic", () => {
        expect(updateSpacecraftMnemonic("ORION")).toBe(true);
        expect(dom.document.getElementById("spacecraft-mnemonic").textContent).toBe("ORION");
    });

    it("keeps the event info tooltip in step with its text", () => {
        expect(updateEventInfo("Trans-lunar injection")).toBe(true);

        const element = dom.document.getElementById("eventinfo");
        expect(element.textContent).toBe("Trans-lunar injection");
        expect(element.title).toBe("Trans-lunar injection");
    });

    it("coerces a missing event message to an empty tooltip", () => {
        updateEventInfo(null);
        expect(dom.document.getElementById("eventinfo").title).toBe("");
    });

    it("clears both the event text and its tooltip", () => {
        updateEventInfo("Burn");

        expect(clearEventInfo()).toBe(true);

        const element = dom.document.getElementById("eventinfo");
        expect(element.textContent).toBe("");
        expect(element.title).toBe("");
    });

    it("writes and clears the progress label", () => {
        expect(updateProgressLabel("Loading orbits")).toBe(true);
        expect(dom.document.getElementById("progressbar-label").innerHTML).toBe("Loading orbits");

        expect(clearProgressLabel()).toBe(true);
        expect(dom.document.getElementById("progressbar-label").innerHTML).toBe("");
    });

    it("stays quiet when the readouts are not on the page", () => {
        dom.restore();
        dom = installFakeDom();

        expect(updateFPSCounter(30)).toBe(false);
        expect(updateSpacecraftMnemonic("ORION")).toBe(false);
        expect(updateEventInfo("Burn")).toBe(false);
        expect(clearEventInfo()).toBe(false);
        expect(updateProgressLabel("x")).toBe(false);
        expect(warn).not.toHaveBeenCalled();
    });
});
