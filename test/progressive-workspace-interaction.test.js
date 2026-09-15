import { chromium } from "playwright";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { getEffectiveTestBaseUrl } from "./local-test-config.js";

let browser;
const captureDir = join(process.cwd(), "test/screenshots/current/progressive-ux");
async function ready(page) {
    await page.goto(`${getEffectiveTestBaseUrl()}/artemis2/`, { waitUntil:"domcontentloaded" });
    await page.waitForFunction(()=>document.querySelector("#mission-loading-overlay")?.dataset.blocking==="false");
    await page.waitForFunction(()=>window.__moonMissionDockviewSpike?.api?.panels.length >= 8);
    await page.evaluate(()=>document.fonts.ready);
    await page.waitForFunction(() => window.__moonMissionDockviewSpike.api
        .getPanel("aux:earth-rise-composer")?.group.id === "right-frame-shoot");
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function state(page) {
    return page.evaluate(()=>{
        const workspace=window.__moonMissionDockviewSpike;
        return {
            level:document.body.dataset.workspaceSpace,
            visible:workspace.api.groups.filter(g=>g.api.isVisible).flatMap(g=>g.panels.map(p=>p.id)).sort(),
            panels:workspace.api.panels.map(p=>p.id).sort(),
            time:document.querySelector("#timeline-slider").value,
            saved:JSON.parse(localStorage.getItem(workspace.storageKey)),
        };
    });
}
describe("progressive workspace UX",()=>{
    beforeAll(async()=>{
        mkdirSync(captureDir,{recursive:true});
        browser=await chromium.launch({headless:true,args:["--no-sandbox","--enable-webgl","--ignore-gpu-blocklist","--use-angle=gl","--enable-unsafe-swiftshader"]});
    });
    afterAll(async()=>{await browser?.close();});
    it("shows progressively fewer panels and restores the expanded layout without resetting time",async()=>{
        const page=await browser.newPage({viewport:{width:1920,height:1080}});
        try {
            await ready(page);
            await page.waitForFunction(()=>document.body.dataset.workspaceSpace==="full");
            const initial=await state(page);
            for(const [width,height,level,count] of [[1920,1080,"full",8],[1366,768,"compact",4],[1100,700,"minimal",2],[800,700,"focused",1]]) {
                await page.setViewportSize({width,height});
                await page.waitForFunction(({level,count})=>document.body.dataset.workspaceSpace===level && window.__moonMissionDockviewSpike.api.groups.filter(g=>g.api.isVisible).length===count,{level,count});
                const current=await state(page);
                expect(current.panels).toEqual(initial.panels);
                expect(current.time).toBe(initial.time);
                expect(current.saved.grid.width).toBe(initial.saved.grid.width);
                expect(current.visible).toContain("mission:main-view");
                expect(await page.locator("#animate").isVisible()).toBe(true);
                await page.screenshot({path:join(captureDir,`${level}-${width}.png`)});
            }
            await page.locator(".workspace-tools__summary").click();
            await page.locator('[data-workspace-panel="aux:moon"]').click();
            await page.waitForFunction(()=>window.__moonMissionDockviewSpike.api.getPanel("aux:moon").api.isVisible);
            expect((await state(page)).visible).toEqual(["aux:moon"]);
            await page.evaluate(()=>window.__moonMissionDockviewSpike.layoutHost.closePanel("aux:moon"));
            await page.waitForFunction(()=>window.__moonMissionDockviewSpike.api.getPanel("mission:main-view").api.isVisible);
            await page.locator(".workspace-tools__summary").click();
            await page.locator('[data-workspace-panel="aux:moon"]').click();
            await page.waitForFunction(()=>window.__moonMissionDockviewSpike.api.getPanel("aux:moon")?.api.isVisible);
            await page.locator(".workspace-scene-return").click();
            expect((await state(page)).visible).toEqual(["mission:main-view"]);
            await page.setViewportSize({width:390,height:844});
            await page.waitForFunction(()=>document.body.classList.contains("mobile-shell-enabled"));
            expect((await state(page)).visible).toEqual(["mission:main-view"]);
            expect(await page.locator("#mobile-control-play").isVisible()).toBe(true);
            await page.waitForFunction(()=>{
                const canvas=document.querySelector("#canvas-wrapper canvas");
                const r=canvas?.getBoundingClientRect();
                return r?.width>=300 && r.height>=250;
            });
            await page.screenshot({path:join(captureDir,"desktop-to-mobile.png")});
            await page.setViewportSize({width:1920,height:1080});
            await page.waitForFunction(()=>document.body.dataset.workspaceSpace==="full");
            await page.waitForFunction(()=>window.__moonMissionDockviewSpike.api.groups.filter(g=>g.api.isVisible).length===8, null, {timeout:5000}).catch(async()=>{
                const current=await state(page);
                throw new Error(`Restore mismatch: ${JSON.stringify({level:current.level,visible:current.visible,panels:current.panels,savedRoot:current.saved.grid.root})}`);
            });
            const restored=await state(page);
            expect(restored.panels).toEqual(initial.panels);
            expect(restored.time).toBe(initial.time);
            expect(restored.saved.grid.root.data.map(n=>n.type)).toEqual(initial.saved.grid.root.data.map(n=>n.type));
            await page.setViewportSize({width:1920,height:550});
            await page.waitForFunction(()=>document.body.dataset.workspaceSpace==="focused");
            expect((await state(page)).visible).toEqual(["mission:main-view"]);
        } finally {await page.close();}
    },180000);
    it("keeps compact composer view and time controls separate, reachable, and keyboard dismissible",async()=>{
        const page=await browser.newPage({viewport:{width:1366,height:768}});
        try {
            await ready(page);
            const composer=page.locator(".aux-camera-view--composer");
            const viewButton=composer.getByRole("button",{name:"View options",exact:true});
            await viewButton.waitFor({state:"visible"});
            await viewButton.focus();
            await viewButton.press("Enter");
            const view=page.locator(`#${await viewButton.getAttribute("aria-controls")}`);
            expect(await view.evaluate(e=>e.matches(":popover-open"))).toBe(true);
            await page.keyboard.press("Tab");
            expect(await view.evaluate(e=>e.contains(document.activeElement)), "Tab should enter the opened popover").toBe(true);
            const lunar=composer.getByRole("button",{name:"Open Frame and Shoot lunar feature controls",exact:true});
            await lunar.click({timeout:5000});
            expect(await lunar.getAttribute("aria-expanded")).toBe("true");
            const lunarPanel=page.locator(`#${await lunar.getAttribute("aria-controls")}`);
            await page.waitForFunction(id=>{
                const e=document.getElementById(id),r=e.getBoundingClientRect();
                return r.bottom<=innerHeight && e.contains(document.elementFromPoint(r.left+r.width/2,r.bottom-10));
            },await lunar.getAttribute("aria-controls"));
            await page.screenshot({path:join(captureDir,"compact-composer-options.png")});
            await page.keyboard.press("Escape");
            await page.keyboard.press("Escape");
            expect(await viewButton.evaluate(e=>e===document.activeElement), "Escape should restore the invoker").toBe(true);
            await composer.getByRole("button",{name:"Time controls",exact:true}).click();
            const time=page.locator('.aux-camera-view__composer-sky-timeline:popover-open');
            await time.waitFor({state:"visible"});
            await page.screenshot({path:join(captureDir,"compact-composer-time.png")});
            await page.keyboard.press("Escape");
            expect(await time.count()).toBe(0);
            await viewButton.click();
            await composer.getByRole("button",{name:"Open Frame and Shoot Moon render controls",exact:true}).click();
            const moonRender=page.locator("#moon-render-pipeline-panel");
            await moonRender.waitFor({state:"visible"});
            expect(await moonRender.evaluate(e=>{
                const r=e.getBoundingClientRect();
                return e.contains(document.elementFromPoint(r.left+r.width/2,r.top+20));
            })).toBe(true);
            await page.keyboard.press("Escape");
        } finally {await page.close();}
    },120000);
    it("preserves expanded geometry when a constrained window is reloaded", async () => {
        const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
        try {
            await ready(page);
            const reference = await state(page);
            const widths = reference.saved.grid.root.data.map(node => node.size);
            await page.setViewportSize({ width: 800, height: 700 });
            await page.waitForFunction(() => document.body.dataset.workspaceSpace === "focused");
            await page.reload({ waitUntil: "domcontentloaded" });
            await page.waitForFunction(() => document.querySelector("#mission-loading-overlay")?.dataset.blocking === "false"
                && document.body.dataset.workspaceSpace === "focused");
            const reloaded = await state(page);
            expect(reloaded.saved.grid.width).toBe(reference.saved.grid.width);
            expect(reloaded.saved.grid.root.data.map(node => node.size)).toEqual(widths);
            await page.setViewportSize({ width: 1920, height: 1080 });
            await page.waitForFunction(() => document.body.dataset.workspaceSpace === "full"
                && window.__moonMissionDockviewSpike.api.groups.filter(g => g.api.isVisible).length === 8);
            const restored = await state(page);
            expect(restored.panels).toEqual(reference.panels);
            // A transient page scrollbar can change the actual host width by
            // 16px despite identical window sizes. Compare restored proportions;
            // the raw saved widths above must still survive reload exactly.
            const scale = restored.saved.grid.width / reference.saved.grid.width;
            restored.saved.grid.root.data.forEach((node, i) => expect(Math.abs(node.size - widths[i] * scale), JSON.stringify({ widths, restored: restored.saved.grid })).toBeLessThanOrEqual(2));
        } finally { await page.close(); }
    }, 120000);
});
