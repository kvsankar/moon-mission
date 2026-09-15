import { describe, expect, it, vi } from "vitest";
import { createInitConfigUiActions } from "../src/platform/js/app/init-config-ui-actions.js";

function createHarness() {
    const lifecycle = [];
    const instances = [];
    class SwiperStub {
        constructor(selector, options) {
            this.selector = selector;
            this.options = options;
            this.destroyed = false;
            this.destroy = vi.fn((deleteInstance, cleanStyles) => {
                lifecycle.push(["destroy", selector, deleteInstance, cleanStyles]);
                this.destroyed = true;
            });
            this.update = vi.fn(() => lifecycle.push(["update", selector]));
            lifecycle.push(["create", selector]);
            instances.push(this);
        }
    }
    const selection = {
        html: vi.fn(() => { lifecycle.push(["render"]); return selection; }),
        append: vi.fn(() => selection),
        attr: vi.fn(() => selection),
        classed: vi.fn(() => selection),
        node: () => null,
    };
    const actions = createInitConfigUiActions({
        d3: { select: () => selection },
        getEventInfos: () => [],
        bindBurnButtons: vi.fn(() => lifecycle.push(["bind"])),
        getBurnButtonHandler: () => vi.fn(),
        SwiperClass: SwiperStub,
    });
    return { actions, instances, lifecycle };
}

describe("initial configuration Swiper lifecycle", () => {
    it("leaves event-strip gesture and focus scrolling with the native timeline controller", () => {
        const { actions, instances } = createHarness();
        actions.initializeSwipers();
        expect(instances[1].options).toMatchObject({ allowTouchMove: false, simulateTouch: false, freeMode: false, a11y: { scrollOnFocus: false } });
        expect(instances[0].options).toMatchObject({ allowTouchMove: false, a11y: { scrollOnFocus: false } });
    });
    it("destroys owned instances before replacing them on repeated initialization", () => {
        const { actions, instances, lifecycle } = createHarness();
        actions.initializeSwipers();
        actions.initializeSwipers();

        expect(instances).toHaveLength(4);
        expect(instances[0].destroy).toHaveBeenCalledExactlyOnceWith(true, true);
        expect(instances[1].destroy).toHaveBeenCalledExactlyOnceWith(true, true);
        expect(instances[2].destroy).not.toHaveBeenCalled();
        expect(instances[3].destroy).not.toHaveBeenCalled();
        expect(lifecycle).toEqual([
            ["create", ".swiper1"], ["create", ".swiper2"],
            ["destroy", ".swiper1", true, true], ["create", ".swiper1"],
            ["destroy", ".swiper2", true, true], ["create", ".swiper2"],
        ]);
    });

    it("refreshes only the current event Swiper after replacing and binding slides", () => {
        const { actions, instances, lifecycle } = createHarness();
        actions.initializeSwipers();
        actions.initializeSwipers();
        lifecycle.length = 0;

        actions.syncBurnButtons([{ key: "event", label: "Event", startTime: 0 }]);

        expect(instances[0].update).not.toHaveBeenCalled();
        expect(instances[1].update).not.toHaveBeenCalled();
        expect(instances[2].update).not.toHaveBeenCalled();
        expect(instances[3].update).toHaveBeenCalledOnce();
        expect(lifecycle.slice(-2)).toEqual([["bind"], ["update", ".swiper2"]]);
        expect(lifecycle[0]).toEqual(["render"]);
    });

    it("supports slide synchronization before Swipers are initialized", () => {
        const { actions, instances } = createHarness();
        expect(() => actions.syncBurnButtons([])).not.toThrow();
        expect(instances).toHaveLength(0);
    });

    it("does not update an event Swiper already destroyed by its host", () => {
        const { actions, instances } = createHarness();
        actions.initializeSwipers();
        instances[1].destroy(true, true);
        actions.syncBurnButtons([]);
        expect(instances[1].update).not.toHaveBeenCalled();
    });
});
