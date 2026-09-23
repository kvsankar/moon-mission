import { asTrimmedString } from "./landing-text.js";

const BRIEF_ORBIT_MODES = [
    {
        key: "geo",
        label: "Earth",
        centerBodyKey: "EARTH",
        secondaryBodyKey: "MOON",
        secondaryLabel: "Moon"
    },
    {
        key: "lunar",
        label: "Moon",
        centerBodyKey: "MOON",
        secondaryBodyKey: "EARTH",
        secondaryLabel: "Earth"
    },
    {
        key: "relative",
        label: "Relative",
        centerBodyKey: "EARTH",
        secondaryBodyKey: "MOON",
        secondaryLabel: "Moon"
    }
];
const BRIEF_ORBIT_PLANES = [
    { key: "XY", label: "XY" },
    { key: "YZ", label: "YZ" },
    { key: "ZX", label: "ZX" }
];

function toJulianDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
    return date.getTime() / 86400000 + 2440587.5;
}

function fromIsoToJulianDate(isoText) {
    var dt = parseEventDate(isoText);
    return dt ? toJulianDate(dt) : null;
}

function julianDateToDate(jd) {
    if (!Number.isFinite(jd)) return null;
    var ms = (jd - 2440587.5) * 86400000;
    var dt = new Date(ms);
    return Number.isNaN(dt.getTime()) ? null : dt;
}

function formatPreviewDateTimeUtc(jd) {
    var dt = julianDateToDate(jd);
    if (!dt) return "";
    var day = String(dt.getUTCDate()).padStart(2, "0");
    var monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    var mon = monthNames[dt.getUTCMonth()];
    var year = dt.getUTCFullYear();
    var hh = String(dt.getUTCHours()).padStart(2, "0");
    var mm = String(dt.getUTCMinutes()).padStart(2, "0");
    return day + " " + mon + " " + year + " " + hh + ":" + mm + " UTC";
}

function meanOf(values) {
    if (!Array.isArray(values) || !values.length) return null;
    var sum = values.reduce(function(acc, value) { return acc + value; }, 0);
    return sum / values.length;
}

function quantileOf(values, percentile) {
    if (!Array.isArray(values) || !values.length) return null;
    var sorted = values
        .filter(function(value) { return Number.isFinite(value); })
        .slice()
        .sort(function(a, b) { return a - b; });
    if (!sorted.length) return null;
    var clamped = Math.max(0, Math.min(1, percentile));
    var index = Math.round((sorted.length - 1) * clamped);
    return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

function getBriefOrbitMode(modeKey) {
    for (var i = 0; i < BRIEF_ORBIT_MODES.length; i += 1) {
        if (BRIEF_ORBIT_MODES[i].key === modeKey) return BRIEF_ORBIT_MODES[i];
    }
    return BRIEF_ORBIT_MODES[0];
}

function rewriteOrbitFileBase(orbitsFile, modeKey) {
    var raw = asTrimmedString(orbitsFile);
    if (!raw) return "";
    if (/^(geo|lunar|relative)-/i.test(raw)) {
        return raw.replace(/^(geo|lunar|relative)-/i, modeKey + "-");
    }
    return modeKey + "-" + raw;
}

function evaluateCheb(coeffs, x) {
    if (!Array.isArray(coeffs) || !coeffs.length) return 0;
    if (coeffs.length === 1) return coeffs[0];
    var bK1 = 0;
    var bK2 = 0;
    for (var k = coeffs.length - 1; k >= 1; k -= 1) {
        var bK = coeffs[k] + 2 * x * bK1 - bK2;
        bK2 = bK1;
        bK1 = bK;
    }
    return coeffs[0] + x * bK1 - bK2;
}

function findChebSegment(segments, jd) {
    if (!Array.isArray(segments) || !segments.length) return null;
    var low = 0;
    var high = segments.length - 1;
    var eps = 1e-8;
    while (low <= high) {
        var mid = Math.floor((low + high) / 2);
        var seg = segments[mid];
        if (jd < seg.t_start - eps) {
            high = mid - 1;
        } else if (jd > seg.t_end + eps) {
            low = mid + 1;
        } else {
            return seg;
        }
    }
    return null;
}

function getChebPosition(series, jd) {
    var seg = findChebSegment(series && series.segments, jd);
    if (!seg) return null;
    var tSpan = seg.t_end - seg.t_start;
    var tNorm = 2 * (jd - seg.t_start) / tSpan - 1;
    if (tNorm < -1) tNorm = -1;
    if (tNorm > 1) tNorm = 1;
    return {
        x: evaluateCheb(seg.cx, tNorm),
        y: evaluateCheb(seg.cy, tNorm),
        z: evaluateCheb(seg.cz, tNorm)
    };
}

export { BRIEF_ORBIT_MODES, BRIEF_ORBIT_PLANES, toJulianDate, fromIsoToJulianDate, julianDateToDate, formatPreviewDateTimeUtc, meanOf, quantileOf, getBriefOrbitMode, rewriteOrbitFileBase, evaluateCheb, findChebSegment, getChebPosition };
