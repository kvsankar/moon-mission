import { describe, expect, it } from "vitest";
import { createServer } from "vite";
import config from "../vite.config.js";
import { get } from "node:http";
import { join } from "node:path";

// The wider suite deliberately stubs/removes browser globals. Use an explicit
// Node HTTP dependency so this server-policy check is order-independent.
function request(url, headers = {}) {
    return new Promise((resolve, reject) => {
        const pending = get(url, { headers }, response => {
            let body = "";
            response.setEncoding("utf8");
            response.on("data", chunk => { body += chunk; });
            response.on("error", reject);
            response.on("end", () => resolve({ status: response.statusCode, headers: response.headers, body }));
        });
        pending.on("error", reject);
        pending.setTimeout(10000, () => pending.destroy(new Error("Local policy request timed out")));
    });
}

describe("local development server policy", () => {
    it("binds to loopback without browser cross-origin access", () => {
        expect(config.server.host).toBe("127.0.0.1");
        expect(config.server.cors).toBe(false);
        expect(config.server.allowedHosts).not.toBe(true);
        expect(config.server.watch.ignored).toContain("**/coverage/**");
        expect(config.server.watch.ignored).toContain("**/.tmp/**");
    });

    it("serves local mission/source routes without granting unrelated origins CORS access", async () => {
        const server = await createServer({
            ...config, configFile: false,
            // Do not invalidate a concurrently running developer/browser-test
            // server's dependency cache with this minimal HTTP-only config.
            cacheDir: join(process.cwd(), ".tmp", "vite-cors-policy", String(process.pid)),
            // This checks HTTP policy, not bundling. Avoid an unrelated async
            // dependency scan racing server teardown after the final response.
            optimizeDeps: { ...config.optimizeDeps, noDiscovery: true, include: [] },
            server: { ...config.server, port: 0, open: false, watch: null, hmr: false },
        });
        try {
            await server.listen();
            const { port } = server.httpServer.address();
            const base = `http://127.0.0.1:${port}`;
            for (const route of ["/chandrayaan3/", "/src/platform/js/core/domain/dockview-policy.js"]) {
                const response = await request(`${base}${route}`, { Origin: "https://unrelated.example" });
                expect(response.status, route).toBe(200);
                expect(response.headers["access-control-allow-origin"], route).toBeUndefined();
                expect(response.body.length).toBeGreaterThan(0);
            }
            const local = await request(`${base}/artemis2/`);
            expect(local.status).toBe(200);
            expect(local.body).toContain("mission-loading-overlay");
        } finally { await server.close(); }
    }, 30000);
});
