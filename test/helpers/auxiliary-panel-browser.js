import { chromium } from "playwright";

export function launchAuxiliaryPanelBrowser() {
    return chromium.launch({
        headless: process.env.HEADLESS !== "false",
        args: [
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--enable-webgl",
            "--ignore-gpu-blocklist",
            "--disable-gpu-sandbox",
            "--use-angle=gl",
            "--enable-unsafe-swiftshader",
        ],
    });
}
