import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const BLURB_ROOT = join(ROOT, "assets", "horizons-blurbs");

function basenames(directory, extension) {
    return readdirSync(join(BLURB_ROOT, directory))
        .filter((name) => name.endsWith(extension))
        .map((name) => name.slice(0, -extension.length))
        .sort();
}

describe("HORIZONS blurb product data", () => {
    it("keeps raw, metadata, and Markdown layers aligned", () => {
        const raw = basenames("raw", ".txt");
        const metadata = basenames("metadata", ".json");
        const markdown = basenames("markdown", ".md");

        expect(metadata).toEqual(raw);
        expect(markdown).toEqual(raw);
        expect(raw).toHaveLength(38);
    });

    it("indexes every generated metadata document", () => {
        const index = JSON.parse(
            readFileSync(join(BLURB_ROOT, "mission-index.json"), "utf8"),
        );
        const metadataDocuments = readdirSync(join(BLURB_ROOT, "metadata"))
            .filter((name) => name.endsWith(".json"))
            .sort()
            .map((name) => JSON.parse(
                readFileSync(join(BLURB_ROOT, "metadata", name), "utf8"),
            ));

        expect(index.mission_count).toBe(metadataDocuments.length);
        expect(index.missions).toEqual(metadataDocuments);
    });

    it("rebuilds the index from all metadata already present", () => {
        const temporaryRoot = mkdtempSync(join(tmpdir(), "moon-mission-horizons-"));
        const temporaryMetadata = join(temporaryRoot, "metadata");
        mkdirSync(temporaryMetadata);

        try {
            const sourceFiles = readdirSync(join(BLURB_ROOT, "metadata"))
                .filter((name) => name.endsWith(".json"))
                .sort()
                .slice(0, 2);
            for (const name of sourceFiles) {
                copyFileSync(
                    join(BLURB_ROOT, "metadata", name),
                    join(temporaryMetadata, name),
                );
            }

            const result = spawnSync(
                "python",
                [
                    join(ROOT, "scripts", "fetch-mission-blurbs.py"),
                    "--output-dir",
                    temporaryRoot,
                    "--rebuild-index-only",
                ],
                { cwd: ROOT, encoding: "utf8" },
            );
            expect(result.status, result.stderr).toBe(0);

            const rebuilt = JSON.parse(
                readFileSync(join(temporaryRoot, "mission-index.json"), "utf8"),
            );
            const expected = sourceFiles.map((name) => JSON.parse(
                readFileSync(join(temporaryMetadata, name), "utf8"),
            ));
            expect(rebuilt.mission_count).toBe(sourceFiles.length);
            expect(rebuilt.missions).toEqual(expected);
        } finally {
            rmSync(temporaryRoot, { recursive: true, force: true });
        }
    });

    it("uses the canonical asset path in producers and runtime consumers", () => {
        const fetcher = readFileSync(join(ROOT, "scripts", "fetch-mission-blurbs.py"), "utf8");
        const scaffolder = readFileSync(
            join(ROOT, "scripts", "scaffold-pending-horizons-missions.py"),
            "utf8",
        );
        const landing = readFileSync(join(ROOT, "src", "platform", "js", "index-landing.js"), "utf8");
        const build = readFileSync(join(ROOT, "scripts", "build.py"), "utf8");

        expect(fetcher).toContain("default=Path('assets/horizons-blurbs')");
        expect(scaffolder).toContain('PROJECT_ROOT / "assets" / "horizons-blurbs"');
        expect(landing).toContain('"assets/horizons-blurbs/metadata/"');
        expect(build).toContain('project_root_path / "assets" / "horizons-blurbs"');

        for (const source of [fetcher, scaffolder, landing, build]) {
            expect(source).not.toContain("docs/horizons-blurbs");
        }
    });
});
