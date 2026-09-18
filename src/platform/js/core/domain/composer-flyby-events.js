const COMPOSER_FLYBY_WINDOW_PADDING_MS = 5 * 60 * 1000;

const FLYBY_EVENT_PILL_SPECS = Object.freeze([
    {
        id: "lunarSoiEntry",
        title: "Lunar SOI In",
        matchKeys: ["lunarsoientry", "lunarsoiin", "moonsoientry", "moonsoiin"],
        matchLabels: ["lunar soi in", "lunar soi entry", "moon soi in", "moon soi entry"],
    },
    {
        id: "earthSet",
        title: "Earthset",
        matchKeys: ["earthset"],
        matchLabels: ["earthset", "earth set"],
    },
    {
        id: "closestApproach",
        title: "Closest Approach",
        matchKeys: ["closestapproach", "lunarflyby"],
        matchLabels: ["closest approach", "lunar flyby", "flyby"],
    },
    {
        id: "maxDistanceEarth",
        title: "Max Distance",
        matchKeys: ["maxdistanceearth", "maxdistance"],
        matchLabels: ["max distance"],
    },
    {
        id: "earthRise",
        title: "Earthrise",
        matchKeys: ["earthrise"],
        matchLabels: ["earthrise", "earth rise"],
    },
    {
        id: "eclipseStart",
        title: "Eclipse Start",
        matchKeys: ["eclipsestart", "eclipsein"],
        matchLabels: ["eclipse in", "eclipse start", "enters solar eclipse"],
    },
    {
        id: "eclipseEnd",
        title: "Eclipse End",
        matchKeys: ["eclipseend", "eclipseout"],
        matchLabels: ["eclipse out", "eclipse end", "exits solar eclipse"],
    },
    {
        id: "lunarSoiExit",
        title: "Lunar SOI Out",
        matchKeys: ["lunarsoiexit", "lunarsoiout", "moonsoiexit", "moonsoiout"],
        matchLabels: ["lunar soi out", "lunar soi exit", "moon soi out", "moon soi exit"],
    },
]);

function resolveEventStartTimeMs(eventInfo) {
    const startTime = eventInfo?.startTime;
    if (startTime instanceof Date) {
        const timeMs = startTime.getTime();
        return Number.isFinite(timeMs) ? timeMs : Number.NaN;
    }
    if (typeof startTime === "string") {
        const parsed = Date.parse(startTime);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    const numeric = Number(startTime);
    return Number.isFinite(numeric) ? numeric : Number.NaN;
}

function resolveLunarFlybyTimeMs(eventInfos) {
    if (!Array.isArray(eventInfos) || eventInfos.length === 0) {
        return Number.NaN;
    }
    let best = null;
    for (const eventInfo of eventInfos) {
        const timeMs = resolveEventStartTimeMs(eventInfo);
        if (!Number.isFinite(timeMs)) {
            continue;
        }
        const key = eventInfo?.key || "";
        const label = eventInfo?.label || "";
        const hoverText = eventInfo?.hoverText || "";
        const infoText = eventInfo?.infoText || "";
        const burnFlag = eventInfo?.burnFlag === true;
        const keyLabelCorpus = `${key} ${label}`.toLowerCase();
        const narrativeCorpus = `${hoverText} ${infoText}`.toLowerCase();

        const hasMoonKeyLabel = /\b(moon|lunar)\b/.test(keyLabelCorpus);
        const hasFlybyKeyLabel = /\bflyby\b/.test(keyLabelCorpus);
        const hasClosestKeyLabel = /\b(closest approach|closestapproach|perilune|periselene|pericynthion)\b/.test(keyLabelCorpus);
        const explicitLunarFlybyKeyLabel = /\b(lunar flyby|moon flyby)\b/.test(keyLabelCorpus);
        const keySuggestsClosest = /\bclosest\b/.test(key.toLowerCase()) && /\b(approach|peri)\b/.test(key.toLowerCase());
        const hasMoonNarrative = /\b(moon|lunar)\b/.test(narrativeCorpus);
        const hasFlybyNarrative = /\bflyby\b/.test(narrativeCorpus);
        const hasClosestNarrative = /\b(closest approach|perilune|periselene|pericynthion)\b/.test(narrativeCorpus);
        let score = 0;
        if (keySuggestsClosest || hasClosestKeyLabel) {
            score = 220;
        } else if (explicitLunarFlybyKeyLabel) {
            score = 210;
        } else if (hasMoonKeyLabel && hasFlybyKeyLabel) {
            score = 200;
        } else if (!burnFlag && hasMoonNarrative && hasClosestNarrative) {
            score = 120;
        } else if (!burnFlag && hasMoonNarrative && hasFlybyNarrative) {
            score = 110;
        }
        if (score <= 0) {
            continue;
        }
        if (
            !best ||
            score > best.score ||
            (score === best.score && burnFlag === false && best.burnFlag === true) ||
            (score === best.score && burnFlag === best.burnFlag && timeMs < best.timeMs)
        ) {
            best = { score, timeMs, burnFlag };
        }
    }
    return best ? best.timeMs : Number.NaN;
}

function resolveLunarSoiBoundaryTimeMs(eventInfos, boundary) {
    if (!Array.isArray(eventInfos) || eventInfos.length === 0) {
        return Number.NaN;
    }
    const wantEntry = boundary === "entry";
    const boundaryWords = wantEntry
        ? /\b(in|entry|enter|ingress)\b/
        : /\b(out|exit|leave|egress)\b/;
    const explicitKeyPattern = wantEntry
        ? /(?:lunar|moon)soi(?:entry|in)|soi(?:entry|in)(?:lunar|moon)?/
        : /(?:lunar|moon)soi(?:exit|out)|soi(?:exit|out)(?:lunar|moon)?/;
    const explicitLabelPattern = wantEntry
        ? /\b(?:lunar|moon)\s+soi\s+(?:in|entry)\b/
        : /\b(?:lunar|moon)\s+soi\s+(?:out|exit)\b/;
    const boundaryNarrativePattern = wantEntry
        ? /\b(?:enters?|entry|ingress)\b/
        : /\b(?:exits?|leave|egress)\b/;

    let best = null;
    for (const eventInfo of eventInfos) {
        const timeMs = resolveEventStartTimeMs(eventInfo);
        if (!Number.isFinite(timeMs)) {
            continue;
        }
        const key = String(eventInfo?.key || "");
        const label = String(eventInfo?.label || "");
        const hoverText = String(eventInfo?.hoverText || "");
        const infoText = String(eventInfo?.infoText || "");
        const keyLabelCorpus = `${key} ${label}`.toLowerCase();
        const narrativeCorpus = `${hoverText} ${infoText}`.toLowerCase();
        const compactKeyLabel = keyLabelCorpus.replace(/[^a-z0-9]+/g, "");

        const hasMoonKeyLabel = /\b(moon|lunar)\b/.test(keyLabelCorpus);
        const hasMoonNarrative = /\b(moon|lunar)\b/.test(narrativeCorpus);
        const hasSoiKeyLabel = /\bsoi\b/.test(keyLabelCorpus);
        const hasSoiNarrative = /\b(soi|sphere of influence)\b/.test(narrativeCorpus);

        let score = 0;
        if (explicitKeyPattern.test(compactKeyLabel)) {
            score = 320;
        } else if (explicitLabelPattern.test(keyLabelCorpus)) {
            score = 300;
        } else if (hasMoonKeyLabel && hasSoiKeyLabel && boundaryWords.test(keyLabelCorpus)) {
            score = 260;
        } else if (hasMoonNarrative && hasSoiNarrative && boundaryNarrativePattern.test(narrativeCorpus)) {
            score = 220;
        }

        if (score <= 0) {
            continue;
        }
        if (
            !best ||
            score > best.score ||
            (score === best.score && wantEntry && timeMs < best.timeMs) ||
            (score === best.score && !wantEntry && timeMs > best.timeMs)
        ) {
            best = { score, timeMs };
        }
    }
    return best ? best.timeMs : Number.NaN;
}

function resolveLunarFlybyWindowMs(eventInfos) {
    const startMs = resolveLunarSoiBoundaryTimeMs(eventInfos, "entry");
    const endMs = resolveLunarSoiBoundaryTimeMs(eventInfos, "exit");
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
        return { startMs: Number.NaN, endMs: Number.NaN };
    }
    return {
        startMs: startMs - COMPOSER_FLYBY_WINDOW_PADDING_MS,
        endMs: endMs + COMPOSER_FLYBY_WINDOW_PADDING_MS,
    };
}

function resolveFlybyPlannerEvents(eventInfos) {
    if (!Array.isArray(eventInfos) || eventInfos.length === 0) {
        return [];
    }
    const indexedEvents = eventInfos
        .map((eventInfo) => {
            const timeMs = resolveEventStartTimeMs(eventInfo);
            if (!Number.isFinite(timeMs)) {
                return null;
            }
            return {
                key: String(eventInfo?.key || "").toLowerCase(),
                label: String(eventInfo?.label || "").toLowerCase(),
                timeMs,
                rawLabel: String(eventInfo?.label || "").trim(),
            };
        })
        .filter(Boolean);
    const resolved = [];
    for (const spec of FLYBY_EVENT_PILL_SPECS) {
        const match = indexedEvents.find((eventInfo) => {
            const compactKey = eventInfo.key.replace(/[^a-z0-9]+/g, "");
            if (spec.matchKeys.includes(compactKey)) {
                return true;
            }
            return spec.matchLabels.some((needle) => eventInfo.label.includes(needle));
        });
        if (!match) {
            continue;
        }
        resolved.push({
            id: spec.id,
            title: spec.title,
            timeMs: match.timeMs,
            sourceLabel: match.rawLabel,
        });
    }
    return resolved;
}

export {
    resolveFlybyPlannerEvents,
    resolveLunarFlybyTimeMs,
    resolveLunarFlybyWindowMs,
};
