import { asTrimmedString, normalizeKey } from "./landing-text.js";
import { getCatalogModel } from "./landing-catalog.js";

function createLaunchButton(row, label, hrefOverride) {
    var launch = document.createElement("a");
    launch.className = "landing-card__btn landing-card__btn--launch";
    launch.href = hrefOverride || row.href;
    launch.textContent = label || "Launch";
    launch.title = "Open animation for " + row.title;
    return launch;
}

function createCard(row, onOpenBrief, createCompareToggleButton) {
    var card = document.createElement("article");
    card.className = "landing-card";
    card.style.borderColor = row.accent + "66";
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-label", "Open brief for " + row.title);
    card.addEventListener("click", function() {
        onOpenBrief(row);
    });
    card.addEventListener("keydown", function(event) {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpenBrief(row);
        }
    });

    var t = document.createElement("h3");
    t.className = "landing-card__title";
    var titleFlag = document.createElement("span");
    titleFlag.className = "landing-flag";
    titleFlag.textContent = flagForCountry(row.country);
    if (titleFlag.textContent) t.appendChild(titleFlag);
    t.appendChild(document.createTextNode(row.title));

    var m = document.createElement("p");
    m.className = "landing-card__meta";
    var cardCraftIcon = iconForCraftClass(row.craftClass);
    m.textContent =
        row.country +
        " • " +
        (cardCraftIcon ? (cardCraftIcon + " ") : "") +
        row.craftClass +
        " • " +
        row.rangeLabel;

    var d = document.createElement("p");
    d.className = "landing-card__desc";
    d.textContent = row.description;

    var actions = document.createElement("div");
    actions.className = "landing-card__actions";
    var briefBtn = document.createElement("button");
    briefBtn.type = "button";
    briefBtn.className = "landing-card__btn";
    briefBtn.textContent = "Brief";
    briefBtn.addEventListener("click", function(event) {
        event.preventDefault();
        event.stopPropagation();
        onOpenBrief(row);
    });
    var launchBtn = createLaunchButton(row, "Launch");
    launchBtn.addEventListener("click", function(event) {
        event.stopPropagation();
    });
    var compareBtn = typeof createCompareToggleButton === "function"
        ? createCompareToggleButton(row, { stopPropagation: true })
        : null;
    actions.appendChild(briefBtn);
    if (compareBtn) actions.appendChild(compareBtn);
    actions.appendChild(launchBtn);

    card.appendChild(t);
    card.appendChild(m);
    card.appendChild(d);
    card.appendChild(actions);
    return card;
}

function flagForCountry(country) {
    var key = normalizeKey(country);
    if (key === "india") return "🇮🇳";
    if (key === "united states") return "🇺🇸";
    if (key === "japan") return "🇯🇵";
    if (key === "south korea") return "🇰🇷";
    return "";
}

function iconForCraftClass(craftClass) {
    var key = normalizeKey(craftClass);
    if (key === "orbiter") return "🛰️";
    if (key === "lander") return "🛬";
    if (key === "impactor") return "☄️";
    if (key === "stage") return "🚀";
    if (key === "lunar module") return "🚀";
    if (key === "capsule") return "🛰️";
    if (key === "cubesat") return "🧊";
    if (key === "pathfinder") return "🧭";
    if (key === "propulsion module") return "🔥";
    return "";
}

function buildLanes(rows) {
    var defaultCfg = getCatalogModel().views && getCatalogModel().views.default ? getCatalogModel().views.default : {};
    var laneOrder = Array.isArray(defaultCfg.laneOrder)
        ? defaultCfg.laneOrder.map(normalizeKey)
        : ["chandrayaan", "artemis", "apollo", "other"];
    var laneLabels = defaultCfg.laneLabels || {};
    var laneMembership = defaultCfg.laneMembership || {};

    var rowsByFolder = new Map();
    rows.forEach(function(row) {
        rowsByFolder.set(normalizeKey(row.entry.folder), row);
    });

    var explicitLanes = {};
    var usedFolders = new Set();
    Object.keys(laneMembership).forEach(function(laneKey) {
        var normalizedLane = normalizeKey(laneKey);
        var folderList = Array.isArray(laneMembership[laneKey]) ? laneMembership[laneKey] : [];
        explicitLanes[normalizedLane] = folderList
            .map(function(folder) { return rowsByFolder.get(normalizeKey(folder)); })
            .filter(Boolean);
        explicitLanes[normalizedLane].forEach(function(row) {
            usedFolders.add(normalizeKey(row.entry.folder));
        });
    });

    var otherRows = rows
        .filter(function(row) { return !usedFolders.has(normalizeKey(row.entry.folder)); })
        .sort(function(a, b) {
            var ay = Number.isFinite(a.startYear) ? a.startYear : 99999;
            var by = Number.isFinite(b.startYear) ? b.startYear : 99999;
            if (ay !== by) return ay - by;
            return (a.title || "").localeCompare(b.title || "");
        });

    var lanes = [];
    laneOrder.forEach(function(laneKey) {
        if (!laneKey) return;
        var laneRows = laneKey === "other" ? otherRows : (explicitLanes[laneKey] || []);
        if (!laneRows.length) return;
        lanes.push({
            key: laneKey,
            label: asTrimmedString(laneLabels[laneKey]) || (laneKey === "other" ? "Other Missions" : laneKey),
            rows: laneRows
        });
    });

    if (laneOrder.indexOf("other") < 0 && otherRows.length) {
        lanes.push({ key: "other", label: "Other Missions", rows: otherRows });
    }

    return lanes;
}

export { createCard, flagForCountry, iconForCraftClass, buildLanes };
