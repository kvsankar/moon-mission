import { defineConfig } from "vite";
import { resolve } from "path";
import { cpSync, existsSync } from "fs";

import {
    getAppRoot,
    loadMissionPageContext,
    renderMissionPageForFolder,
    writeMissionPages,
} from "./scripts/lib/mission-pages.mjs";

const APP_ROOT = getAppRoot();
const DIST_ROOT = resolve(APP_ROOT, "dist");

function copyStaticDeployAssets() {
    const copyTargets = [
        {
            source: resolve(APP_ROOT, "src", "platform"),
            destination: resolve(DIST_ROOT, "src", "platform"),
        },
        {
            source: resolve(APP_ROOT, "third-party"),
            destination: resolve(DIST_ROOT, "third-party"),
        },
        {
            source: resolve(APP_ROOT, "images"),
            destination: resolve(DIST_ROOT, "images"),
        },
        {
            source: resolve(APP_ROOT, "assets"),
            destination: resolve(DIST_ROOT, "assets"),
            filter: (sourcePath) => !/[\\/]archive(?:[\\/]|$)/i.test(sourcePath),
        },
        {
            source: resolve(APP_ROOT, "favicon.ico"),
            destination: resolve(DIST_ROOT, "favicon.ico"),
        },
        {
            source: resolve(APP_ROOT, ".htaccess"),
            destination: resolve(DIST_ROOT, ".htaccess"),
        },
    ];

    for (const target of copyTargets) {
        if (!existsSync(target.source)) {
            continue;
        }
        cpSync(target.source, target.destination, {
            force: true,
            recursive: true,
            filter: target.filter,
        });
    }
}

function applyStreamingMediaHeaders(pathname, res) {
    const normalizedPath = String(pathname || "").toLowerCase();
    if (normalizedPath.endsWith(".m3u8")) {
        res.setHeader("Content-Type", "application/vnd.apple.mpegurl; charset=utf-8");
        return;
    }
    if (normalizedPath.endsWith(".m4s")) {
        res.setHeader("Content-Type", "video/iso.segment");
    }
}

function createMissionPageRoutePlugin() {
    const context = loadMissionPageContext({ appRoot: APP_ROOT });
    const missionFolders = new Set(
        (context.missions || [])
            .map((mission) => String(mission?.folder || "").trim())
            .filter(Boolean),
    );
    const missionFolderMap = new Map(
        Array.from(missionFolders).map((folder) => [folder.toLowerCase(), folder]),
    );

    function matchMissionFolder(pathname = "/") {
        const match = String(pathname).match(/^\/([^/]+?)(?:\/index\.html|\/)?$/i);
        if (!match?.[1]) {
            return "";
        }
        const folder = decodeURIComponent(match[1]);
        return missionFolders.has(folder) ? folder : "";
    }

    return {
        name: "mission-page-routes",
        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                try {
                    const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
                    applyStreamingMediaHeaders(requestUrl.pathname, res);
                    if (requestUrl.pathname === "/mission.html") {
                        const legacyMission = String(requestUrl.searchParams.get("mission") || "").trim().toLowerCase();
                        const canonicalFolder = missionFolderMap.get(legacyMission);
                        if (canonicalFolder) {
                            requestUrl.searchParams.delete("mission");
                            const nextSearch = requestUrl.searchParams.toString();
                            const location = `/${encodeURIComponent(canonicalFolder)}/${nextSearch ? `?${nextSearch}` : ""}`;
                            res.statusCode = 301;
                            res.setHeader("Location", location);
                            res.end();
                            return;
                        }
                    }

                    const folder = matchMissionFolder(requestUrl.pathname);
                    if (!folder) {
                        next();
                        return;
                    }

                    const html = renderMissionPageForFolder(folder, { appRoot: APP_ROOT });
                    if (!html) {
                        next();
                        return;
                    }

                    res.statusCode = 200;
                    res.setHeader("Content-Type", "text/html; charset=utf-8");
                    res.end(html);
                } catch (error) {
                    next(error);
                }
            });
        },
        closeBundle() {
            copyStaticDeployAssets();
            writeMissionPages({
                appRoot: APP_ROOT,
                outputRoot: DIST_ROOT,
            });
        },
    };
}

export default defineConfig({
    root: ".",
    appType: "mpa",
    publicDir: false,
    server: {
        port: 7274,
        host: "127.0.0.1",
        open: false,
        cors: true,
        fs: {
            allow: [
                ".",
                "assets",
                "third-party",
                "test",
            ],
        },
    },
    build: {
        outDir: "dist",
        assetsDir: "assets",
        rollupOptions: {
            input: {
                index: resolve(APP_ROOT, "index.html"),
                mission: resolve(APP_ROOT, "mission.html"),
                "orbit-data": resolve(APP_ROOT, "orbit-data.html"),
                "assets-status": resolve(APP_ROOT, "assets-status.html"),
                "moon-render-tuner": resolve(APP_ROOT, "moon-render-tuner.html"),
                "moon-observer-test": resolve(APP_ROOT, "moon-observer-test.html"),
                popout: resolve(APP_ROOT, "popout.html"),
                "sky-render-demo": resolve(APP_ROOT, "sky-render-demo.html"),
            },
        },
    },
    resolve: {
        alias: {
            "@": resolve(APP_ROOT, "."),
            "@assets": resolve(APP_ROOT, "assets"),
            "@third-party": resolve(APP_ROOT, "third-party"),
        },
    },
    optimizeDeps: {
        exclude: [
            "three",
        ],
        include: [],
    },
    define: {
        __DEV__: true,
    },
    plugins: [
        createMissionPageRoutePlugin(),
    ],
    test: {
        testTimeout: 120000,
        hookTimeout: 180000,
        teardownTimeout: 180000,
        browser: {
            enabled: false,
        },
        environment: "node",
        reporter: ["verbose"],
        coverage: {
            reporter: ["text", "json", "html"],
            exclude: [
                "node_modules/**",
                "test/**",
                "third-party/**",
            ],
        },
    },
});
