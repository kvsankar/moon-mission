import { resolveRuntimeAssetUrl } from "../core/domain/runtime-asset-url.js";

const LUNAR_FEATURE_CATALOG_PATH = "assets/lunar-features.json";

let loadedCatalog = null;
const catalogsByUrl = new Map();
const promisesByUrl = new Map();

function validateLunarFeatureCatalog(catalog, url) {
    if (!catalog || !Array.isArray(catalog.features)) {
        throw new Error(`Invalid lunar feature catalog at ${url}`);
    }
    return catalog;
}

function getLoadedLunarFeatureCatalog() {
    return loadedCatalog;
}

function setLoadedLunarFeatureCatalogForTests(catalog) {
    loadedCatalog = catalog || null;
    catalogsByUrl.clear();
    promisesByUrl.clear();
}

async function loadLunarFeatureCatalog({
    fetchFn = typeof fetch === "function" ? fetch : null,
    path = LUNAR_FEATURE_CATALOG_PATH,
    url = null,
    globalObject = typeof window !== "undefined" ? window : globalThis,
} = {}) {
    const isDefaultRequest = url == null && path === LUNAR_FEATURE_CATALOG_PATH;
    if (isDefaultRequest && loadedCatalog) {
        return loadedCatalog;
    }
    if (typeof fetchFn !== "function") {
        throw new Error("Lunar feature catalog loading requires fetch support");
    }

    const resolvedUrl = url || resolveRuntimeAssetUrl(path, { globalObject });
    if (catalogsByUrl.has(resolvedUrl)) return catalogsByUrl.get(resolvedUrl);
    if (promisesByUrl.has(resolvedUrl)) return promisesByUrl.get(resolvedUrl);
    const loadingPromise = fetchFn(resolvedUrl, { cache: "no-store" })
        .then((response) => {
            if (!response?.ok) {
                throw new Error(`Failed to load lunar feature catalog from ${resolvedUrl}: ${response?.status}`);
            }
            return response.json();
        })
        .then((catalog) => {
            const validated = validateLunarFeatureCatalog(catalog, resolvedUrl);
            catalogsByUrl.set(resolvedUrl, validated);
            if (isDefaultRequest) loadedCatalog = validated;
            return validated;
        })
        .finally(() => {
            if (promisesByUrl.get(resolvedUrl) === loadingPromise) promisesByUrl.delete(resolvedUrl);
        });
    promisesByUrl.set(resolvedUrl, loadingPromise);
    return loadingPromise;
}

export {
    LUNAR_FEATURE_CATALOG_PATH,
    getLoadedLunarFeatureCatalog,
    loadLunarFeatureCatalog,
    setLoadedLunarFeatureCatalogForTests,
};
