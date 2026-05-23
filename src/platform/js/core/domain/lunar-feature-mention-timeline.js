const DEFAULT_VISIBLE_WINDOW_SECONDS = 300;
const DEFAULT_ACTIVE_LEAD_SECONDS = 10;
const DEFAULT_ACTIVE_TRAIL_SECONDS = 20;

function asTrimmedString(value) {
    return typeof value === "string" ? value.trim() : "";
}

function toFiniteNumber(value, fallback = Number.NaN) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
}

function toPositiveNumber(value, fallback) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function normalizeSlugList(value) {
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(
        value
            .map((entry) => asTrimmedString(entry))
            .filter(Boolean),
    ));
}

function parseTimeMs(value) {
    const parsed = Date.parse(asTrimmedString(value));
    return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function normalizeFeature(slug, value = {}) {
    const safeSlug = asTrimmedString(slug);
    if (!safeSlug) return null;
    return {
        slug: safeSlug,
        displayName: asTrimmedString(value.displayName) || safeSlug,
        catalogName: asTrimmedString(value.catalogName),
    };
}

export function normalizeLunarFeatureMentionTimeline(data = {}) {
    const features = {};
    const sourceFeatures = data?.features && typeof data.features === "object" && !Array.isArray(data.features)
        ? data.features
        : {};
    for (const [slug, value] of Object.entries(sourceFeatures)) {
        const feature = normalizeFeature(slug, value);
        if (feature) features[feature.slug] = feature;
    }

    const mentions = (Array.isArray(data?.mentions) ? data.mentions : [])
        .map((mention, index) => {
            const timeSeconds = toFiniteNumber(mention?.timeSeconds);
            const featureSlugs = normalizeSlugList(mention?.featureSlugs)
                .filter((slug) => features[slug]);
            if (!Number.isFinite(timeSeconds) || timeSeconds < 0 || featureSlugs.length === 0) {
                return null;
            }
            return {
                id: asTrimmedString(mention.id) || `mention-${index + 1}`,
                timeSeconds,
                featureSlugs,
                speaker: asTrimmedString(mention.speaker),
                summary: asTrimmedString(mention.summary),
            };
        })
        .filter(Boolean)
        .sort((a, b) => a.timeSeconds - b.timeSeconds);

    const defaults = data?.defaults && typeof data.defaults === "object" ? data.defaults : {};
    return {
        schemaVersion: toFiniteNumber(data?.schemaVersion, 1),
        source: asTrimmedString(data?.source),
        mediaStreamId: asTrimmedString(data?.mediaStreamId),
        streamStartTime: asTrimmedString(data?.streamStartTime),
        streamStartMs: parseTimeMs(data?.streamStartTime),
        defaults: {
            visibleWindowSeconds: toPositiveNumber(
                defaults.visibleWindowSeconds,
                DEFAULT_VISIBLE_WINDOW_SECONDS,
            ),
            activeLeadSeconds: toPositiveNumber(
                defaults.activeLeadSeconds,
                DEFAULT_ACTIVE_LEAD_SECONDS,
            ),
            activeTrailSeconds: toPositiveNumber(
                defaults.activeTrailSeconds,
                DEFAULT_ACTIVE_TRAIL_SECONDS,
            ),
        },
        features,
        mentions,
    };
}

function formatSignedMetLabel(deltaMs) {
    const safeDelta = Number(deltaMs);
    if (!Number.isFinite(safeDelta)) return "";
    const sign = safeDelta < 0 ? "-" : "+";
    let totalSeconds = Math.floor(Math.abs(safeDelta) / 1000);
    const days = Math.floor(totalSeconds / 86400);
    totalSeconds -= days * 86400;
    const hours = Math.floor(totalSeconds / 3600);
    totalSeconds -= hours * 3600;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds - (minutes * 60);
    const pad = (value) => String(value).padStart(2, "0");
    return `MET ${sign}${days}d ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
}

function resolveFeatureList(timeline, featureSlugs) {
    return featureSlugs
        .map((slug) => timeline.features[slug])
        .filter(Boolean);
}

export function resolveLunarFeatureMentionView(timelineInput = {}, options = {}) {
    const timeline = timelineInput?.mentions ? timelineInput : normalizeLunarFeatureMentionTimeline(timelineInput);
    const currentTimeMs = toFiniteNumber(options.currentTimeMs);
    const streamStartMs = toFiniteNumber(options.streamStartMs, timeline.streamStartMs);
    const missionStartMs = toFiniteNumber(options.missionStartMs);
    if (!Number.isFinite(currentTimeMs) || !Number.isFinite(streamStartMs)) {
        return {
            available: timeline.mentions.length > 0,
            inRange: false,
            currentStreamSeconds: Number.NaN,
            items: [],
            activeItems: [],
            activeFeatureSlugs: [],
            activeCatalogNames: [],
        };
    }

    const visibleWindowSeconds = toPositiveNumber(
        options.visibleWindowSeconds,
        timeline.defaults.visibleWindowSeconds,
    );
    const activeLeadSeconds = toPositiveNumber(
        options.activeLeadSeconds,
        timeline.defaults.activeLeadSeconds,
    );
    const activeTrailSeconds = toPositiveNumber(
        options.activeTrailSeconds,
        timeline.defaults.activeTrailSeconds,
    );
    const currentStreamSeconds = (currentTimeMs - streamStartMs) / 1000;
    const halfWindow = visibleWindowSeconds / 2;
    const windowStartSeconds = currentStreamSeconds - halfWindow;
    const windowEndSeconds = currentStreamSeconds + halfWindow;
    const activeFeatureSlugs = new Set();
    const activeCatalogNames = new Set();

    const items = timeline.mentions
        .filter((mention) => mention.timeSeconds >= windowStartSeconds && mention.timeSeconds <= windowEndSeconds)
        .map((mention) => {
            const active = currentStreamSeconds >= mention.timeSeconds - activeLeadSeconds &&
                currentStreamSeconds <= mention.timeSeconds + activeTrailSeconds;
            const features = resolveFeatureList(timeline, mention.featureSlugs);
            if (active) {
                for (const feature of features) {
                    activeFeatureSlugs.add(feature.slug);
                    if (feature.catalogName) activeCatalogNames.add(feature.catalogName);
                }
            }
            const missionTimeMs = streamStartMs + (mention.timeSeconds * 1000);
            return {
                ...mention,
                active,
                missionTimeMs,
                metMs: Number.isFinite(missionStartMs) ? missionTimeMs - missionStartMs : Number.NaN,
                metLabel: Number.isFinite(missionStartMs) ? formatSignedMetLabel(missionTimeMs - missionStartMs) : "",
                features,
                featureLabel: features.map((feature) => feature.displayName).join(", "),
            };
        });

    return {
        available: timeline.mentions.length > 0,
        inRange: currentStreamSeconds >= 0,
        currentStreamSeconds,
        windowStartSeconds,
        windowEndSeconds,
        visibleWindowSeconds,
        activeLeadSeconds,
        activeTrailSeconds,
        items,
        activeItems: items.filter((item) => item.active),
        activeFeatureSlugs: Array.from(activeFeatureSlugs),
        activeCatalogNames: Array.from(activeCatalogNames),
    };
}
