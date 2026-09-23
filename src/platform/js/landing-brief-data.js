import { asTrimmedString, normalizeKey, ensureTrailingPeriod } from "./landing-text.js";
import { pickSummaryFromMetadata, buildTimelineSegments } from "./landing-catalog.js";

let DEFAULT_BRIEF_IMAGES_BY_FOLDER = {
    "artemis1": [
        {
            url: "https://upload.wikimedia.org/wikipedia/commons/7/7b/Kennedy_Space_Center%2C_Orion_Multi-Purpose_Crew_Vehicle.JPG",
            attribution: "Wikimedia Commons contributors",
            license: "CC BY-SA 4.0",
            sourceUrl: "https://commons.wikimedia.org/wiki/File:Kennedy_Space_Center,_Orion_Multi-Purpose_Crew_Vehicle.JPG",
            caption: "Orion Multi-Purpose Crew Vehicle at Kennedy Space Center."
        }
    ]
};
let missionBriefCache = new Map();
let missionBriefTextPromise = null;
let missionImageTextPromise = null;
function fetchMissionBriefTextMap() {
    if (missionBriefTextPromise) return missionBriefTextPromise;
    missionBriefTextPromise = fetch("assets/mission-briefs.json", { cache: "no-store" })
        .then(function(response) {
            if (!response.ok) throw new Error("mission briefs missing");
            return response.json();
        })
        .catch(function() {
            missionBriefTextPromise = null;
            return {};
        });
    return missionBriefTextPromise;
}

function fetchMissionImageMap() {
    if (missionImageTextPromise) return missionImageTextPromise;
    missionImageTextPromise = fetch("assets/mission-images.json", { cache: "no-store" })
        .then(function(response) {
            if (!response.ok) throw new Error("mission images missing");
            return response.json();
        })
        .catch(function() {
            missionImageTextPromise = null;
            return {};
        });
    return missionImageTextPromise;
}

function getAuthoredBriefEntry(briefTextMap, row) {
    if (!briefTextMap || typeof briefTextMap !== "object") return null;
    var folder = normalizeKey(row && row.folder);
    if (!folder) return null;
    return briefTextMap[folder] || null;
}

function getAuthoredImageEntries(imageMap, row) {
    if (!imageMap || typeof imageMap !== "object") return null;
    var folder = normalizeKey(row && row.folder);
    if (!folder) return null;
    return imageMap[folder] || null;
}

function normalizeBriefImages(images, row) {
    if (!Array.isArray(images)) return [];
    var title = asTrimmedString(row && row.title) || "Mission";
    return images
        .filter(function(image) {
            return image && typeof image === "object" && asTrimmedString(image.url);
        })
        .map(function(image) {
            return {
                url: asTrimmedString(image.url),
                attribution: asTrimmedString(image.attribution) || "Wikimedia Commons contributors",
                license: asTrimmedString(image.license) || "",
                sourceUrl: asTrimmedString(image.sourceUrl),
                caption: asTrimmedString(image.caption),
                alt: asTrimmedString(image.alt) || (title + " image")
            };
        });
}

function buildBriefFromMetadata(row, meta, authoredEntry, authoredImages) {
    var summary = pickSummaryFromMetadata(meta, row.description);
    var authored = authoredEntry && typeof authoredEntry === "object" ? authoredEntry : {};
    var title = asTrimmedString(row && row.title) || "Mission";
    var missionText = asTrimmedString(authored.mission) || asTrimmedString(authored.missionStory) || (title + " mission details will be added.");
    var horizonsData = asTrimmedString(authored.horizonsData) || asTrimmedString(authored.horizonsScope) || "HORIZONS object coverage details for this mission entry will be added.";
    var timelinesNote = asTrimmedString(authored.timelines) || asTrimmedString(authored.missionTimeline) || "The timeline bars compare mission timeline, HORIZONS availability, and animation coverage.";
    var images = normalizeBriefImages(authoredImages || DEFAULT_BRIEF_IMAGES_BY_FOLDER[row.folder] || [], row);
    return {
        mission: missionText,
        horizonsData: horizonsData,
        timelines: timelinesNote,
        timelineSegments: buildTimelineSegments(row, meta),
        summary: summary,
        images: images,
        image: images[0] || null,
        sourceUrl: "assets/horizons-blurbs/metadata/" + row.horizonsMetadataFile + ".json",
        sourceLabel: "HORIZONS metadata"
    };
}

function buildFallbackBrief(row, authoredEntry, authoredImages) {
    var summary = ensureTrailingPeriod(row.description || "Mission timeline.");
    var authored = authoredEntry && typeof authoredEntry === "object" ? authoredEntry : {};
    var title = asTrimmedString(row && row.title) || "Mission";
    var missionText = asTrimmedString(authored.mission) || asTrimmedString(authored.missionStory) || (title + " mission details will be added.");
    var horizonsData = asTrimmedString(authored.horizonsData) || asTrimmedString(authored.horizonsScope) || "HORIZONS object coverage details for this mission entry will be added.";
    var timelinesNote = asTrimmedString(authored.timelines) || asTrimmedString(authored.missionTimeline) || "The timeline bars compare mission timeline, HORIZONS availability, and animation coverage.";
    var images = normalizeBriefImages(authoredImages || DEFAULT_BRIEF_IMAGES_BY_FOLDER[row.folder] || [], row);
    return {
        mission: missionText,
        horizonsData: horizonsData,
        timelines: timelinesNote,
        timelineSegments: buildTimelineSegments(row, null),
        summary: summary,
        images: images,
        image: images[0] || null,
        sourceUrl: "",
        sourceLabel: "Mission catalog"
    };
}

function fetchMissionBrief(row) {
    var key = row.folder || row.title;
    if (missionBriefCache.has(key)) {
        return Promise.resolve(missionBriefCache.get(key));
    }

    return Promise.all([fetchMissionBriefTextMap(), fetchMissionImageMap()]).then(function(results) {
        var briefTextMap = results[0];
        var imageMap = results[1];
        var authoredEntry = getAuthoredBriefEntry(briefTextMap, row);
        var authoredImages = getAuthoredImageEntries(imageMap, row);
        if (!row.horizonsMetadataFile) {
            var fallback = buildFallbackBrief(row, authoredEntry, authoredImages);
            missionBriefCache.set(key, fallback);
            return fallback;
        }

        var metadataUrl = "assets/horizons-blurbs/metadata/" + row.horizonsMetadataFile + ".json";
        return fetch(metadataUrl, { cache: "no-store" })
            .then(function(response) {
                if (!response.ok) throw new Error("metadata missing");
                return response.json();
            })
            .then(function(meta) {
                var brief = buildBriefFromMetadata(row, meta, authoredEntry, authoredImages);
                missionBriefCache.set(key, brief);
                return brief;
            })
            .catch(function() {
                var fallback = buildFallbackBrief(row, authoredEntry, authoredImages);
                missionBriefCache.set(key, fallback);
                return fallback;
            });
    });
}

export { fetchMissionBrief };
