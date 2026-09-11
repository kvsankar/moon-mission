#!/usr/bin/env node
import { build } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = path.join(root, "src/platform/js/workers/moon-dem-worker.js");
const flag = process.argv.indexOf("--out-dir");
const outDir = path.resolve(flag >= 0 ? process.argv[flag + 1] : path.join(root, ".tmp/moon-worker"));
if (outDir === path.dirname(entry)) throw new Error("Worker output must not overwrite its source.");
const result = await build({
    root, configFile: false, envFile: false,
    build: {
        outDir, emptyOutDir: false, target: "es2020", minify: true,
        lib: { entry, formats: ["es"], fileName: () => "moon-dem-worker.js" },
        rollupOptions: { output: { inlineDynamicImports: true } },
    },
});
for (const bundle of Array.isArray(result) ? result : [result]) {
    for (const file of bundle.output || []) {
        if (file.type === "chunk" && (file.imports.length || file.dynamicImports.length)) {
            throw new Error("The static-site Moon worker must be self-contained.");
        }
    }
}
