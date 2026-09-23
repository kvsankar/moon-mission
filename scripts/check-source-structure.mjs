import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE_PATH = "scripts/source-structure-baseline.json";
const EFFECT_ROOTS = ["app", "ui", "rendering", "data"];
const MIN_REFACTOR_REDUCTION_PERCENT = 30;

function git(args) {
    return execFileSync("git", args, {
        cwd: ROOT,
        encoding: "utf8",
        maxBuffer: 32 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
    });
}

function isAuthoredJavaScript(file) {
    if (!/\.(?:js|mjs)$/.test(file)) return false;
    return /^(?:src\/|scripts\/|test\/|assets\/[^/]+\/js\/)/.test(file);
}

function isCatalogDataJson(file) {
    return /^src\/platform\/js\/rendering\/catalog-data\/[^/]+\.json$/.test(file);
}

export function countLines(sourceText) {
    if (!sourceText) return 0;
    const lines = sourceText.split(/\r\n|\r|\n/);
    return lines.length - (lines.at(-1) === "" ? 1 : 0);
}

export function checkModuleSyntax(sourceText) {
    const result = spawnSync(process.execPath, ["--input-type=module", "--check"], {
        input: sourceText,
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
    });
    if (result.status === 0) return null;
    return result.stderr.match(/SyntaxError:[^\r\n]*/)?.[0]
        || result.stderr.trim().split(/\r?\n/).at(-1)
        || result.error?.message
        || "module syntax check failed";
}

function importedSpecifiers(sourceText, file) {
    const source = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const specifiers = [];
    function visit(node) {
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
            && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
            specifiers.push(node.moduleSpecifier.text);
        }
        if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
            && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])) {
            specifiers.push(node.arguments[0].text);
        }
        ts.forEachChild(node, visit);
    }
    visit(source);
    return specifiers;
}

export function findLayerViolations(sourceText, file, allowedLayerImports = []) {
    if (!/^src\/platform\/js\/core\/(?:domain|state)\//.test(file)) return [];
    const allowed = new Set(allowedLayerImports.map(({ from, to }) => `${from}\0${to}`));
    const violations = [];
    for (const specifier of importedSpecifiers(sourceText, file)) {
        if (!specifier.startsWith(".")) continue;
        const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
        const resolved = path.posix.extname(target) ? target : `${target}.js`;
        if (!EFFECT_ROOTS.some((root) => resolved.startsWith(`src/platform/js/${root}/`))) continue;
        if (!allowed.has(`${file}\0${resolved}`)) violations.push(resolved);
    }
    return violations;
}

export function findImportCycles(sourceByFile) {
    const files = new Set(sourceByFile.keys());
    const graph = new Map();
    for (const [file, sourceText] of sourceByFile) {
        const edges = [];
        for (const specifier of importedSpecifiers(sourceText, file)) {
            if (!specifier.startsWith(".")) continue;
            const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
            const candidates = path.posix.extname(target)
                ? [target]
                : [`${target}.js`, `${target}.mjs`, `${target}/index.js`];
            const resolved = candidates.find((candidate) => files.has(candidate));
            if (resolved) edges.push(resolved);
        }
        graph.set(file, edges);
    }

    let nextIndex = 0;
    const indices = new Map();
    const lowLinks = new Map();
    const stack = [];
    const onStack = new Set();
    const cycles = [];
    function visit(file) {
        indices.set(file, nextIndex);
        lowLinks.set(file, nextIndex);
        nextIndex += 1;
        stack.push(file);
        onStack.add(file);
        for (const target of graph.get(file) || []) {
            if (!indices.has(target)) {
                visit(target);
                lowLinks.set(file, Math.min(lowLinks.get(file), lowLinks.get(target)));
            } else if (onStack.has(target)) {
                lowLinks.set(file, Math.min(lowLinks.get(file), indices.get(target)));
            }
        }
        if (lowLinks.get(file) !== indices.get(file)) return;
        const component = [];
        let target;
        do {
            target = stack.pop();
            onStack.delete(target);
            component.push(target);
        } while (target !== file);
        if (component.length > 1 || graph.get(file)?.includes(file)) {
            cycles.push(component.sort());
        }
    }
    for (const file of graph.keys()) if (!indices.has(file)) visit(file);
    return cycles.sort((a, b) => a[0].localeCompare(b[0]));
}

function listFiles(mode) {
    const args = mode === "--staged"
        ? ["diff", "--cached", "--name-only", "-z", "--diff-filter=ACMR", "--", "src", "assets", "scripts", "test"]
        : ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "src", "assets", "scripts", "test"];
    return [...new Set(git(args).split("\0").filter(isAuthoredJavaScript))].sort();
}

function readSource(file, mode) {
    return mode === "--staged" ? git(["show", `:${file}`]) : fs.readFileSync(path.join(ROOT, file), "utf8");
}

function readBaseline(mode) {
    const sourceText = mode === "--staged"
        ? git(["show", `:${BASELINE_PATH}`])
        : fs.readFileSync(path.join(ROOT, BASELINE_PATH), "utf8");
    const baseline = JSON.parse(sourceText);
    if (!Number.isInteger(baseline.maxLines) || baseline.maxLines < 1
        || !baseline.oversizedFiles || !Array.isArray(baseline.allowedLayerImports)
        || !Array.isArray(baseline.completedRefactors)) {
        throw new Error("Invalid source structure baseline");
    }
    return baseline;
}

export function checkSource(file, sourceText, baseline, { exactBaseline = false } = {}) {
    const errors = [];
    const lines = countLines(sourceText);
    const legacyLimit = baseline.oversizedFiles[file];
    const limit = legacyLimit ?? baseline.maxLines;
    if (lines > limit) errors.push(`${file}: ${lines} lines exceeds the ${limit}-line limit`);
    if (legacyLimit != null && exactBaseline && lines <= baseline.maxLines) {
        errors.push(`${file}: now ${lines} lines; remove its oversized baseline entry and record the structural refactor`);
    }
    const syntaxError = checkModuleSyntax(sourceText);
    if (syntaxError) errors.push(`${file}: ${syntaxError}`);
    for (const target of findLayerViolations(sourceText, file, baseline.allowedLayerImports)) {
        errors.push(`${file}: core module imports effect module ${target}`);
    }
    return errors;
}

export function refactorTargetLines(beforeLines) {
    return Math.floor(beforeLines * (100 - MIN_REFACTOR_REDUCTION_PERCENT) / 100);
}

export function checkRefactorPlan(record, sourceByFile) {
    const errors = [];
    if (!record || !isAuthoredJavaScript(record.source)
        || !Number.isInteger(record.beforeLines) || record.beforeLines < 1
        || typeof record.plan !== "string" || !record.plan.startsWith("docs/plans/")
        || !record.plan.endsWith(".md") || !Array.isArray(record.resultFiles)
        || record.resultFiles.length === 0) {
        return ["invalid completed structural-refactor record"];
    }
    if (new Set(record.resultFiles).size !== record.resultFiles.length) {
        errors.push(`${record.source}: duplicate resulting file in refactor record`);
    }
    const sizes = [];
    for (const file of record.resultFiles) {
        if (!(isAuthoredJavaScript(file) || isCatalogDataJson(file)) || !sourceByFile.has(file)) {
            errors.push(`${record.source}: missing resulting source file ${file}`);
        } else {
            const lines = countLines(sourceByFile.get(file));
            sizes.push({ file, lines });
            if (isCatalogDataJson(file) && lines > 1000) {
                errors.push(`${file}: catalog shard has ${lines} lines; maximum is 1000`);
            }
        }
    }
    if (sizes.length === record.resultFiles.length) {
        const largest = sizes.reduce((max, current) => current.lines > max.lines ? current : max);
        const target = refactorTargetLines(record.beforeLines);
        if (largest.lines > target) {
            errors.push(`${record.source}: largest resulting piece ${largest.file} has ${largest.lines} lines; ${record.beforeLines} before requires at most ${target} (${MIN_REFACTOR_REDUCTION_PERCENT}% reduction)`);
        }
    }
    return errors;
}

export function checkBaselineTransitions(previous, current) {
    if (!previous) return [];
    const errors = [];
    for (const file of Object.keys(current.oversizedFiles)) {
        if (!(file in previous.oversizedFiles)) {
            errors.push(`${file}: new oversized baseline entries are not allowed`);
        }
    }
    for (const [file, beforeLines] of Object.entries(previous.oversizedFiles)) {
        const nextLimit = current.oversizedFiles[file];
        if (nextLimit === beforeLines) continue;
        if (nextLimit > beforeLines) {
            errors.push(`${file}: oversized baseline cap cannot increase from ${beforeLines} to ${nextLimit}`);
            continue;
        }
        const recorded = current.completedRefactors.some((entry) =>
            entry.source === file && entry.beforeLines === beforeLines);
        if (!recorded) {
            errors.push(`${file}: lowering/removing the ${beforeLines}-line baseline requires a structural refactor plan and result-file record`);
        }
    }
    return errors;
}

function readPreviousBaseline(mode, current) {
    const revisions = mode === "--staged" ? ["HEAD"] : ["HEAD", "HEAD^"];
    for (const revision of revisions) {
        try {
            const sourceText = git(["show", `${revision}:${BASELINE_PATH}`]);
            if (sourceText !== current) return JSON.parse(sourceText);
        } catch {
            // Initial baseline introduction, or a shallow checkout without a parent.
        }
    }
    return null;
}

function run(mode) {
    const files = listFiles(mode);
    const baselineStaged = mode === "--staged" && git([
        "diff", "--cached", "--name-only", "--", BASELINE_PATH,
    ]).trim().length > 0;
    if (mode === "--staged" && files.length === 0 && !baselineStaged) {
        console.log("structure: no staged authored JavaScript files");
        return;
    }
    const baseline = readBaseline(mode);
    const currentBaselineText = mode === "--staged"
        ? git(["show", `:${BASELINE_PATH}`])
        : fs.readFileSync(path.join(ROOT, BASELINE_PATH), "utf8");
    const previousBaseline = readPreviousBaseline(mode, currentBaselineText);
    const errors = [];
    errors.push(...checkBaselineTransitions(previousBaseline, baseline));
    const fileSet = new Set(files);
    const sourceByFile = new Map();
    for (const file of files) {
        const sourceText = readSource(file, mode);
        sourceByFile.set(file, sourceText);
        errors.push(...checkSource(file, sourceText, baseline, {
            exactBaseline: mode === "--all",
        }));
    }
    if (mode === "--all") {
        for (const cycle of findImportCycles(sourceByFile)) {
            errors.push(`import cycle: ${cycle.join(" -> ")}`);
        }
        for (const [file, limit] of Object.entries(baseline.oversizedFiles)) {
            if (!fileSet.has(file)) errors.push(`${file}: stale size baseline entry`);
            if (!Number.isInteger(limit) || limit <= baseline.maxLines) {
                errors.push(`${file}: invalid size baseline limit ${limit}`);
            }
        }
        for (const { from, to } of baseline.allowedLayerImports) {
            if (!fileSet.has(from) || !importedSpecifiers(readSource(from, mode), from).some((specifier) => {
                if (!specifier.startsWith(".")) return false;
                const target = path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier));
                return (path.posix.extname(target) ? target : `${target}.js`) === to;
            })) errors.push(`${from}: stale allowed import to ${to}`);
        }
    }
    for (const record of baseline.completedRefactors) {
        const resultSources = new Map();
        if (Array.isArray(record.resultFiles)) {
            for (const file of record.resultFiles) {
                try {
                    resultSources.set(file, sourceByFile.get(file) ?? readSource(file, mode));
                } catch {
                    // The record validator reports the missing file.
                }
            }
        }
        errors.push(...checkRefactorPlan(record, resultSources));
        if (record?.plan) {
            let planPresent = false;
            try {
                if (mode === "--staged") {
                    git(["cat-file", "-e", `:${record.plan}`]);
                    planPresent = true;
                } else {
                    planPresent = fs.existsSync(path.join(ROOT, record.plan));
                }
            } catch {
                // The plan must be present in the staged tree.
            }
            if (!planPresent) errors.push(`${record.source}: missing refactor plan ${record.plan}`);
        }
    }
    for (const error of errors) console.error(`structure: ${error}`);
    if (errors.length) {
        console.error(`structure: ${errors.length} issue(s) in ${files.length} checked file(s)`);
        process.exitCode = 1;
    } else {
        console.log(`structure: ${files.length} file(s) checked; ${baseline.maxLines}-line cap and known-debt ratchet passed`);
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const mode = process.argv[2] || "--all";
    if (!["--all", "--staged"].includes(mode)) {
        console.error("Usage: node scripts/check-source-structure.mjs [--all|--staged]");
        process.exitCode = 2;
    } else {
        try {
            run(mode);
        } catch (error) {
            console.error(`structure: ${error.message}`);
            process.exitCode = 2;
        }
    }
}
