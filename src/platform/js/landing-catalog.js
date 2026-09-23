import { asTrimmedString, normalizeKey, ensureTrailingPeriod, cleanMetadataText, sentenceSplit } from "./landing-text.js";

const CATALOG_URL = "assets/mission-catalog.json";
let catalogModel = { views: {}, missions: [] };
const HORIZONS_METADATA_BY_FOLDER = {
    "apollo8-sivb": "apollo-8-s-ivb",
    "apollo9-sivb": "apollo-9-s-ivb",
    "apollo10-lm": "apollo-10-lm-snoopy",
    "apollo10-sivb": "apollo-10-s-ivb",
    "apollo11-sivb": "apollo-11-s-ivb",
    "apollo12-sivb": "apollo-12-s-ivb",
    "artemis": "artemis-p1",
    "artemis-overview": "artemis-p1",
    "artemis-lagrange": "artemis-p1",
    "artemis-lunar-capture": "artemis-p1",
    "artemis1": "artemis-1-orion",
    "artemis2": "artemis-2-orion",
    "capstone": "capstone",
    "chandrayaan1": "chandrayaan-1",
    "chandrayaan2": "chandrayaan-2-orbiter",
    "chandrayaan3": "chandrayaan-3-propulsion-module",
    "clementine": "clementine",
    "grail": "grail-a-ebb",
    "grail-ss-stage": "grail-ss-stage",
    "hgs1": "hgs-1",
    "isee3": "isee-3-ice",
    "juice": "juice",
    "kplo-danuri": "kplo-danuri",
    "ladee": "ladee",
    "lcross-centaur": "lcross-centaur",
    "lcross-shepherd": "lcross-shepherd",
    "lro": "lro",
    "lunar-flashlight": "lunar-flashlight",
    "lunar-prospector": "lunar-prospector",
    "lunar-trailblazer": "lunar-trailblazer",
    "nozomi": "nozomi",
    "slim": "slim",
    "stereo": "stereo-a",
    "tess": "tess",
    "wind": "wind",
    "wmap": "wmap"
};
function pickSummaryFromMetadata(meta, fallback) {
    var rawSections = meta && meta.raw_sections ? meta.raw_sections : {};
    var sectionsToTry = [
        rawSections.BACKGROUND,
        rawSections.PURPOSE,
        rawSections["MISSION GOALS"],
        rawSections.MISSION
    ];
    for (var i = 0; i < sectionsToTry.length; i += 1) {
        var sectionText = cleanMetadataText(sectionsToTry[i]);
        if (!sectionText) continue;
        var sentences = sentenceSplit(sectionText);
        if (!sentences.length) continue;
        return ensureTrailingPeriod(sentences.slice(0, 2).join(" "));
    }
    return ensureTrailingPeriod(fallback || "Mission timeline from NASA JPL Horizons ephemeris metadata.");
}

function parseCatalogUtc(value) {
    var raw = asTrimmedString(value);
    if (!raw || raw === "N/A") return null;
    var dt = new Date(raw.replace(" ", "T") + "Z");
    if (Number.isNaN(dt.getTime())) return null;
    return dt;
}

function formatUtcHuman(value) {
    var dt = value instanceof Date ? value : parseCatalogUtc(value);
    if (!dt) return asTrimmedString(value);
    var datePart = dt.toLocaleDateString("en-US", {
        timeZone: "UTC",
        year: "numeric",
        month: "short",
        day: "numeric"
    });
    var hh = String(dt.getUTCHours()).padStart(2, "0");
    var mm = String(dt.getUTCMinutes()).padStart(2, "0");
    return datePart + " " + hh + ":" + mm + " UTC";
}

function parseMonthNameIndex(name) {
    var m = normalizeKey(name).slice(0, 3);
    var map = {
        jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
        jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
    };
    return Number.isFinite(map[m]) ? map[m] : null;
}

function parseHorizonsDateTime(value) {
    var raw = asTrimmedString(value);
    if (!raw) return null;
    var m = raw.match(/^(\d{4})[-\s]([A-Za-z]{3,})[-\s](\d{1,2})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if (!m) return null;
    var year = parseInt(m[1], 10);
    var month = parseMonthNameIndex(m[2]);
    var day = parseInt(m[3], 10);
    var hour = m[4] ? parseInt(m[4], 10) : 0;
    var minute = m[5] ? parseInt(m[5], 10) : 0;
    var second = m[6] ? parseInt(m[6], 10) : 0;
    if (!Number.isFinite(year) || month === null || !Number.isFinite(day) || !Number.isFinite(hour) || !Number.isFinite(minute) || !Number.isFinite(second)) {
        return null;
    }
    var dt = new Date(Date.UTC(year, month, day, hour, minute, second));
    return Number.isNaN(dt.getTime()) ? null : dt;
}

function parseHorizonsDateWithFallbackYear(value, fallbackYear) {
    var raw = asTrimmedString(value);
    if (!raw) return null;
    var withYear = parseHorizonsDateTime(raw);
    if (withYear) return withYear;
    var m = raw.match(/^([A-Za-z]{3,})\s+(\d{1,2})(?:\s*@?\s*(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if (!m || !Number.isFinite(fallbackYear)) return null;
    var month = parseMonthNameIndex(m[1]);
    var day = parseInt(m[2], 10);
    var hour = m[3] ? parseInt(m[3], 10) : 0;
    var minute = m[4] ? parseInt(m[4], 10) : 0;
    var second = m[5] ? parseInt(m[5], 10) : 0;
    if (month === null || !Number.isFinite(day) || !Number.isFinite(hour) || !Number.isFinite(minute) || !Number.isFinite(second)) {
        return null;
    }
    var dt = new Date(Date.UTC(fallbackYear, month, day, hour, minute, second));
    return Number.isNaN(dt.getTime()) ? null : dt;
}

function extractApolloMissionBounds(meta, row) {
    var background = asTrimmedString(meta && meta.raw_sections && meta.raw_sections.BACKGROUND);
    if (!background) return null;
    var launchDate = asTrimmedString(meta && meta.launch_date);
    var launchYearMatch = launchDate.match(/(\d{4})/);
    var year = launchYearMatch ? parseInt(launchYearMatch[1], 10) : (row && row.startYear ? row.startYear : null);
    if (!Number.isFinite(year)) return null;

    var launchMatch = background.match(/Launch\s+([A-Za-z]+)\s+(\d{1,2})\s+(\d{2}:\d{2}:\d{2})/i);
    var splashMatch = background.match(/Splashdown\s+([A-Za-z]+)\s+(\d{1,2})\s+(\d{2}:\d{2}:\d{2})/i);
    if (!launchMatch || !splashMatch) return null;

    var launchMonth = parseMonthNameIndex(launchMatch[1]);
    var splashMonth = parseMonthNameIndex(splashMatch[1]);
    if (launchMonth === null || splashMonth === null) return null;

    var launchParts = launchMatch[3].split(":").map(function(v) { return parseInt(v, 10); });
    var splashParts = splashMatch[3].split(":").map(function(v) { return parseInt(v, 10); });
    if (launchParts.length !== 3 || splashParts.length !== 3) return null;

    var startDate = new Date(Date.UTC(year, launchMonth, parseInt(launchMatch[2], 10), launchParts[0], launchParts[1], launchParts[2]));
    var endDate = new Date(Date.UTC(year, splashMonth, parseInt(splashMatch[2], 10), splashParts[0], splashParts[1], splashParts[2]));
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;

    return {
        startDate: startDate,
        endDate: endDate,
        startLabel: formatUtcHuman(startDate),
        endLabel: formatUtcHuman(endDate)
    };
}

function inferMissionWindow(row, meta) {
    var apolloBounds = extractApolloMissionBounds(meta, row);
    if (apolloBounds) return apolloBounds;

    var missionEndDate = parseCatalogUtc(row && row.missionEndTime);
    var launchDate = parseCatalogUtc(row && row.launchTime);
    var dataStart = parseCatalogUtc(row && row.dataStartTime);
    var landingDate = parseCatalogUtc(row && row.landingTime);
    var dataEnd = parseCatalogUtc(row && row.dataEndTime);
    var startDate = launchDate && dataStart
        ? new Date(Math.min(launchDate.getTime(), dataStart.getTime()))
        : (launchDate || dataStart);
    var endCandidates = [missionEndDate, landingDate, dataEnd].filter(Boolean);
    var endDate = endCandidates.length
        ? new Date(Math.max.apply(null, endCandidates.map(function(dt) { return dt.getTime(); })))
        : null;

    return {
        startDate: startDate,
        endDate: endDate,
        startLabel: startDate ? formatUtcHuman(startDate) : "the mission start (UTC)",
        endLabel: endDate ? formatUtcHuman(endDate) : "the mission end (UTC)"
    };
}

function daysInUtcMonth(year, monthIndex) {
    return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function formatDurationYmd(startDate, endDate) {
    if (!(startDate instanceof Date) || Number.isNaN(startDate.getTime())) return "N/A";
    if (!(endDate instanceof Date) || Number.isNaN(endDate.getTime())) return "N/A";

    var start = new Date(Date.UTC(
        startDate.getUTCFullYear(),
        startDate.getUTCMonth(),
        startDate.getUTCDate()
    ));
    var end = new Date(Date.UTC(
        endDate.getUTCFullYear(),
        endDate.getUTCMonth(),
        endDate.getUTCDate()
    ));

    if (end.getTime() < start.getTime()) return "N/A";

    var years = end.getUTCFullYear() - start.getUTCFullYear();
    var months = end.getUTCMonth() - start.getUTCMonth();
    var days = end.getUTCDate() - start.getUTCDate();

    if (days < 0) {
        var borrowMonth = end.getUTCMonth() - 1;
        var borrowYear = end.getUTCFullYear();
        if (borrowMonth < 0) {
            borrowMonth = 11;
            borrowYear -= 1;
        }
        days += daysInUtcMonth(borrowYear, borrowMonth);
        months -= 1;
    }

    if (months < 0) {
        months += 12;
        years -= 1;
    }

    if (years < 0) return "N/A";
    return years + "y " + months + "m " + days + "d";
}

function computeRowDurationLabel(row) {
    var missionWindow = inferMissionWindow(row, null);
    return formatDurationYmd(missionWindow.startDate, missionWindow.endDate);
}

function computeRowDataDurationLabel(row) {
    return formatDurationYmd(
        parseCatalogUtc(row && row.dataStartTime),
        parseCatalogUtc(row && row.dataEndTime)
    );
}

function computeDurationSortKey(startDate, endDate) {
    if (!(startDate instanceof Date) || Number.isNaN(startDate.getTime())) return null;
    if (!(endDate instanceof Date) || Number.isNaN(endDate.getTime())) return null;
    var delta = endDate.getTime() - startDate.getTime();
    return delta >= 0 ? delta : null;
}

function computeRowDurationSortKey(row) {
    var missionWindow = inferMissionWindow(row, null);
    return computeDurationSortKey(missionWindow.startDate, missionWindow.endDate);
}

function computeRowDataDurationSortKey(row) {
    return computeDurationSortKey(
        parseCatalogUtc(row && row.dataStartTime),
        parseCatalogUtc(row && row.dataEndTime)
    );
}

function buildTimelineSegments(row, meta) {
    var missionWindow = inferMissionWindow(row, meta);
    var horizonsStart = parseHorizonsDateTime(meta && meta.trajectory_start);
    var horizonsEnd = parseHorizonsDateTime(meta && meta.trajectory_end);
    if ((!horizonsStart || !horizonsEnd) && meta) {
        var inferred = inferHorizonsRangeFromRawSections(meta);
        if (inferred) {
            if (!horizonsStart) horizonsStart = inferred.startDate;
            if (!horizonsEnd) horizonsEnd = inferred.endDate;
        }
    }
    var coverageStart = parseCatalogUtc(row && row.dataStartTime);
    var coverageEnd = parseCatalogUtc(row && row.dataEndTime);

    var segments = [
        {
            key: "mission",
            label: "Mission Timeline (config/events JSON)",
            color: "#7cb3ff",
            startDate: missionWindow.startDate,
            endDate: missionWindow.endDate
        },
        {
            key: "horizons",
            label: "HORIZONS Availability (metadata JSON)",
            color: "#8dcf8d",
            startDate: horizonsStart,
            endDate: horizonsEnd
        },
        {
            key: "coverage",
            label: "Animation Coverage (config JSON)",
            color: "#f4b55f",
            startDate: coverageStart,
            endDate: coverageEnd
        }
    ];

    var allDates = [];
    segments.forEach(function(segment) {
        if (segment.startDate) allDates.push(segment.startDate.getTime());
        if (segment.endDate) allDates.push(segment.endDate.getTime());
    });
    var domainMin = allDates.length ? Math.min.apply(null, allDates) : null;
    var domainMax = allDates.length ? Math.max.apply(null, allDates) : null;
    if (domainMin !== null && domainMax !== null && domainMax <= domainMin) {
        domainMax = domainMin + 1;
    }

    segments.forEach(function(segment) {
        segment.startLabel = segment.startDate ? formatUtcHuman(segment.startDate) : "Not available";
        segment.endLabel = segment.endDate ? formatUtcHuman(segment.endDate) : "Not available";
        segment.available = Boolean(segment.startDate && segment.endDate);
        if (!segment.available || domainMin === null || domainMax === null) {
            segment.leftPct = 0;
            segment.widthPct = 0;
            return;
        }
        var startMs = segment.startDate.getTime();
        var endMs = segment.endDate.getTime();
        if (endMs < startMs) {
            var tmp = startMs;
            startMs = endMs;
            endMs = tmp;
        }
        var left = ((startMs - domainMin) / (domainMax - domainMin)) * 100;
        var right = ((endMs - domainMin) / (domainMax - domainMin)) * 100;
        segment.leftPct = Math.max(0, Math.min(100, left));
        segment.widthPct = Math.max(1.2, Math.min(100 - segment.leftPct, right - left));
    });

    return segments;
}

function inferHorizonsRangeFromRawSections(meta) {
    var rawSections = meta && meta.raw_sections ? meta.raw_sections : {};
    var candidates = [
        rawSections["SPACECRAFT TRAJECTORY"],
        rawSections.TRAJECTORY
    ];
    var fromCandidates = candidates.filter(function(v) { return asTrimmedString(v); }).join("\n");
    var rawText = asTrimmedString(fromCandidates) || Object.keys(rawSections).map(function(key) {
        return asTrimmedString(rawSections[key]);
    }).filter(Boolean).join("\n");
    if (!rawText) return null;

    var dates = [];
    var fullTokenRegex = /(\d{4}[-\s][A-Za-z]{3,}[-\s]\d{1,2}(?:\s+\d{2}:\d{2}(?::\d{2})?)?)/g;
    var fullMatch;
    while ((fullMatch = fullTokenRegex.exec(rawText)) !== null) {
        var dt = parseHorizonsDateTime(fullMatch[1]);
        if (dt) dates.push(dt);
    }

    var mixedRangeRegex = /(\d{4}-[A-Za-z]{3,}-\d{1,2}\s+\d{2}:\d{2}(?::\d{2})?)\s+to\s+([A-Za-z]{3,}\s+\d{1,2}\s*@?\s*\d{2}:\d{2}(?::\d{2})?)/gi;
    var mixedMatch;
    while ((mixedMatch = mixedRangeRegex.exec(rawText)) !== null) {
        var start = parseHorizonsDateTime(mixedMatch[1]);
        if (start) {
            dates.push(start);
            var end = parseHorizonsDateWithFallbackYear(mixedMatch[2], start.getUTCFullYear());
            if (end) dates.push(end);
        }
    }

    if (!dates.length) return null;
    dates.sort(function(a, b) { return a.getTime() - b.getTime(); });
    return {
        startDate: dates[0],
        endDate: dates[dates.length - 1]
    };
}

function parseYear(value) {
    var n = parseInt(value, 10);
    return Number.isFinite(n) ? n : null;
}

function parseEventDate(value) {
    var raw = asTrimmedString(value);
    if (!raw || raw === "dynamic") return null;
    var dt = new Date(raw);
    if (Number.isNaN(dt.getTime())) return null;
    return dt;
}

function parseConfigDateTime(section, prefix) {
    if (!section || typeof section !== "object") return null;
    var exactKey = prefix === "start" ? "startTime" : (prefix === "stop" ? "endTime" : "");
    var exactValue = exactKey ? asTrimmedString(section[exactKey]) : "";
    if (exactValue) {
        var exactDate = parseEventDate(exactValue);
        if (exactDate) return exactDate;
    }
    var year = parseInt(section[prefix + "_year"], 10);
    var month = parseInt(section[prefix + "_month"], 10);
    var day = parseInt(section[prefix + "_day"], 10);
    var hour = parseInt(section[prefix + "_hour"], 10);
    var minute = parseInt(section[prefix + "_minute"], 10);
    if (![year, month, day, hour, minute].every(Number.isFinite)) return null;
    return new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
}

function formatUtcDateTime(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "N/A";
    var yyyy = String(date.getUTCFullYear()).padStart(4, "0");
    var mm = String(date.getUTCMonth() + 1).padStart(2, "0");
    var dd = String(date.getUTCDate()).padStart(2, "0");
    var hh = String(date.getUTCHours()).padStart(2, "0");
    var mi = String(date.getUTCMinutes()).padStart(2, "0");
    return yyyy + "-" + mm + "-" + dd + " " + hh + ":" + mi;
}

function findFirstMatchingEventDate(events, predicate) {
    if (!events || typeof events !== "object") return null;
    var matches = [];
    Object.keys(events).forEach(function(eventKey) {
        var eventDef = events[eventKey];
        if (!eventDef || typeof eventDef !== "object") return;
        var eventDate = parseEventDate(eventDef.startTime);
        if (!eventDate) return;
        if (!predicate(eventKey, eventDef)) return;
        matches.push(eventDate);
    });
    if (!matches.length) return null;
    matches.sort(function(a, b) { return a.getTime() - b.getTime(); });
    return matches[0];
}

function findEarliestEventDate(events) {
    return findFirstMatchingEventDate(events, function() { return true; });
}

function toCatalogEntry(raw, index) {
    var folder = normalizeKey(raw && raw.folder);
    if (!folder) return null;
    var dimensions = raw && raw.dimensions ? raw.dimensions : {};
    var missionType = asTrimmedString(dimensions.missionType || raw && raw.missionType) || "Unknown";
    var craftClass = asTrimmedString(dimensions.craftClass || missionType) || "Unknown";
    var crewProfile = asTrimmedString(dimensions.crewProfile || raw && raw.crewProfile) || "Robotic";
    var isDisabled = !!(raw && (raw.disabled === true || raw.enabled === false));
    return {
        order: Number.isFinite(raw && raw.order) ? raw.order : index,
        folder: folder,
        disabled: isDisabled,
        card: {
            title: asTrimmedString(raw && raw.title) || folder,
            subtitle: asTrimmedString(raw && raw.subtitle) || "Moon Mission",
            description: asTrimmedString(raw && raw.description) || "Mission timeline",
            accent: asTrimmedString(raw && raw.accent) || "#4a90d9"
        },
        meta: {
            country: asTrimmedString(raw && raw.country) || "Unknown",
            lane: normalizeKey(raw && raw.lane),
            startYear: parseYear(raw && raw.startYear),
            endYear: parseYear(raw && raw.endYear),
            missionType: missionType,
            craftClass: craftClass,
            crewProfile: crewProfile
        }
    };
}

function loadCatalog() {
    return fetch(CATALOG_URL, { cache: "no-store" })
        .then(function(response) {
            if (!response.ok) {
                throw new Error("Failed to load mission catalog: " + response.status);
            }
            return response.json();
        })
        .then(function(raw) {
            var missions = Array.isArray(raw && raw.missions) ? raw.missions : [];
            var seenFolders = new Set();
            catalogModel = {
                defaultMissionFolder: normalizeKey(raw && raw.defaultMissionFolder),
                views: raw && raw.views ? raw.views : {},
                missions: missions
                    .map(toCatalogEntry)
                    .filter(Boolean)
                    .filter(function(entry) { return !entry.disabled; })
                    .filter(function(entry) {
                        if (!entry.folder || seenFolders.has(entry.folder)) {
                            return false;
                        }
                        seenFolders.add(entry.folder);
                        return true;
                    })
                    .sort(function(a, b) { return a.order - b.order; })
            };
            return catalogModel.missions;
        });
}

function getTimingFromConfig(config) {
    var events = config && typeof config.events === "object" ? config.events : {};

    var launchDate =
        findFirstMatchingEventDate(events, function(eventKey) {
            var k = normalizeKey(eventKey);
            return k === "missionstart" || k === "launch" || k === "trackingstart";
        }) || findEarliestEventDate(events);

    var tliDate = findFirstMatchingEventDate(events, function(eventKey, eventDef) {
        var keyText = normalizeKey(eventKey);
        var labelText = normalizeKey(eventDef.label);
        var infoText = normalizeKey(eventDef.infoText);
        return keyText.indexOf("tli") >= 0 || labelText.indexOf("tli") >= 0 || infoText.indexOf("trans-lunar") >= 0;
    });

    var loiDate = findFirstMatchingEventDate(events, function(eventKey, eventDef) {
        var keyText = normalizeKey(eventKey);
        var labelText = normalizeKey(eventDef.label);
        var infoText = normalizeKey(eventDef.infoText);
        return (
            keyText.indexOf("loi") >= 0 ||
            labelText.indexOf("loi") >= 0 ||
            keyText.indexOf("lunarorbit") >= 0 ||
            infoText.indexOf("lunar orbit insertion") >= 0
        );
    });

    var landingDate =
        findFirstMatchingEventDate(events, function(eventKey, eventDef) {
            var keyText = normalizeKey(eventKey);
            var labelText = normalizeKey(eventDef.label);
            return (
                keyText.indexOf("landing") >= 0 ||
                keyText.indexOf("touchdown") >= 0 ||
                keyText.indexOf("softlanding") >= 0 ||
                labelText.indexOf("landing") >= 0 ||
                labelText.indexOf("touchdown") >= 0
            );
        }) ||
        findFirstMatchingEventDate(events, function(eventKey, eventDef) {
            var keyText = normalizeKey(eventKey);
            var labelText = normalizeKey(eventDef.label);
            return keyText.indexOf("impact") >= 0 || labelText.indexOf("impact") >= 0;
        });

    var missionEndDate =
        findFirstMatchingEventDate(events, function(eventKey, eventDef) {
            var keyText = normalizeKey(eventKey);
            var labelText = normalizeKey(eventDef.label);
            return keyText === "missionend" || labelText.indexOf("mission end") >= 0;
        }) ||
        findFirstMatchingEventDate(events, function(eventKey, eventDef) {
            var keyText = normalizeKey(eventKey);
            var labelText = normalizeKey(eventDef.label);
            return keyText === "dataend" || labelText.indexOf("data end") >= 0;
        });

    var geoStart = parseConfigDateTime(config && config.geo, "start");
    var lunarStart = parseConfigDateTime(config && config.lunar, "start");
    var geoEnd = parseConfigDateTime(config && config.geo, "stop");
    var lunarEnd = parseConfigDateTime(config && config.lunar, "stop");

    var startCandidates = [geoStart, lunarStart].filter(Boolean);
    var endCandidates = [geoEnd, lunarEnd].filter(Boolean);
    var dataStart = startCandidates.length
        ? startCandidates.sort(function(a, b) { return a.getTime() - b.getTime(); })[0]
        : null;
    var dataEnd = endCandidates.length
        ? endCandidates.sort(function(a, b) { return b.getTime() - a.getTime(); })[0]
        : null;

    return {
        launchDate: launchDate,
        tliDate: tliDate,
        loiDate: loiDate,
        landingDate: landingDate,
        missionEndDate: missionEndDate,
        dataStart: dataStart,
        dataEnd: dataEnd
    };
}

function hydrateRowWithConfigTiming(row) {
    var configUrl = "assets/" + row.entry.folder + "/data/config.json";
    return fetch(configUrl, { cache: "no-store" })
        .then(function(response) {
            if (!response.ok) throw new Error("missing config");
            return response.json();
        })
        .then(function(config) {
            var timing = getTimingFromConfig(config);
            var nextRow = Object.assign({}, row, {
                launchTime: formatUtcDateTime(timing.launchDate),
                tliTime: formatUtcDateTime(timing.tliDate),
                loiTime: formatUtcDateTime(timing.loiDate),
                landingTime: formatUtcDateTime(timing.landingDate),
                missionEndTime: formatUtcDateTime(timing.missionEndDate),
                dataStartTime: formatUtcDateTime(timing.dataStart),
                dataEndTime: formatUtcDateTime(timing.dataEnd),
                launchSortKey: timing.launchDate ? timing.launchDate.getTime() : -Infinity,
                tliSortKey: timing.tliDate ? timing.tliDate.getTime() : -Infinity,
                loiSortKey: timing.loiDate ? timing.loiDate.getTime() : -Infinity,
                landingSortKey: timing.landingDate ? timing.landingDate.getTime() : -Infinity,
                missionEndSortKey: timing.missionEndDate ? timing.missionEndDate.getTime() : -Infinity,
                dataStartSortKey: timing.dataStart ? timing.dataStart.getTime() : -Infinity,
                dataEndSortKey: timing.dataEnd ? timing.dataEnd.getTime() : -Infinity
            });
            nextRow.durationLabel = computeRowDurationLabel(nextRow);
            nextRow.dataDurationLabel = computeRowDataDurationLabel(nextRow);
            nextRow.durationSortKey = computeRowDurationSortKey(nextRow);
            nextRow.dataDurationSortKey = computeRowDataDurationSortKey(nextRow);
            return nextRow;
        })
        .catch(function() {
            return row;
        });
}

function toRow(entry, index) {
    var startYear = entry.meta.startYear;
    var endYear = entry.meta.endYear || startYear;
    var range = startYear
        ? (endYear && endYear !== startYear ? (startYear + " - " + endYear) : String(startYear))
        : "Unknown";
    var folder = normalizeKey(entry.folder);
    var href = folder ? (folder + "/") : "";

    return {
        index: index,
        entry: entry,
        href: href,
        folder: folder,
        horizonsMetadataFile: HORIZONS_METADATA_BY_FOLDER[folder] || "",
        title: entry.card.title,
        description: entry.card.description,
        country: entry.meta.country || "Unknown",
        lane: entry.meta.lane || "",
        missionType: entry.meta.missionType || "Unknown",
        craftClass: entry.meta.craftClass || "Unknown",
        crewProfile: entry.meta.crewProfile || "Robotic",
        startYear: startYear,
        endYear: endYear,
        rangeLabel: range,
        spanYears: startYear && endYear ? Math.max(0, endYear - startYear) : 0,
        durationLabel: "N/A",
        dataDurationLabel: "N/A",
        durationSortKey: null,
        dataDurationSortKey: null,
        launchTime: "N/A",
        tliTime: "N/A",
        loiTime: "N/A",
        landingTime: "N/A",
        missionEndTime: "N/A",
        dataStartTime: "N/A",
        dataEndTime: "N/A",
        launchSortKey: -Infinity,
        tliSortKey: -Infinity,
        loiSortKey: -Infinity,
        landingSortKey: -Infinity,
        missionEndSortKey: -Infinity,
        dataStartSortKey: -Infinity,
        dataEndSortKey: -Infinity,
        accent: entry.card.accent || "#4a90d9"
    };
}

function getCatalogModel() { return catalogModel; }

export { getCatalogModel, pickSummaryFromMetadata, buildTimelineSegments,
    loadCatalog, hydrateRowWithConfigTiming, toRow };
