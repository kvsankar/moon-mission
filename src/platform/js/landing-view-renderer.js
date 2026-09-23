import { asTrimmedString, normalizeKey } from "./landing-text.js";
import { buildLanes, createCard, flagForCountry, iconForCraftClass } from "./landing-card-model.js";

export function createLandingViewRenderer({
    viewRoot,
    sortControls,
    filterCraft,
    filterCrew,
    columnSelector,
    tableColumns,
    viewButtons,
    getMissionRows,
    getCurrentView,
    getCurrentTableSortField,
    getCurrentTableSortOrder,
    setCurrentTableSortField,
    setCurrentTableSortOrder,
    getDefaultSortFieldValue,
    getDefaultSortOrderValue,
    syncLandingCompareUi,
    createCompareToggleButton,
    clearOrbitCardPreviews,
    visibleTableColumns,
    syncColumnSelectorUi,
    tableCellValue,
    compareRowsByTableColumn,
    createOrbitCard,
    openMissionBrief,
}) {
    function renderSummary(rows) {
        var knownYears = rows.filter(function(r) { return !!r.startYear; });
        var minYear = knownYears.length ? Math.min.apply(null, knownYears.map(function(r) { return r.startYear; })) : null;
        var maxYear = knownYears.length ? Math.max.apply(null, knownYears.map(function(r) { return r.endYear || r.startYear; })) : null;
        var countries = new Set(rows.map(function(r) { return r.country; }));

        var summary = document.createElement("div");
        summary.className = "landing-summary";
        [
            { label: "Missions", value: String(rows.length) },
            { label: "Countries", value: String(countries.size) },
            { label: "Timeline Span", value: minYear && maxYear ? (minYear + " - " + maxYear) : "N/A" }
        ].forEach(function(item) {
            var kpi = document.createElement("div");
            kpi.className = "landing-kpi";
            var l = document.createElement("p");
            l.className = "landing-kpi__label";
            l.textContent = item.label;
            var v = document.createElement("p");
            v.className = "landing-kpi__value";
            v.textContent = item.value;
            kpi.appendChild(l);
            kpi.appendChild(v);
            summary.appendChild(kpi);
        });
        viewRoot.appendChild(summary);
    }

    function renderCategorizedLanes(rows, cardBuilder, gridClassName) {
        var laneShell = document.createElement("div");
        laneShell.className = "landing-default-lanes";
        buildLanes(rows).forEach(function(lane) {
            var laneNode = document.createElement("section");
            laneNode.className = "landing-lane";

            var title = document.createElement("h3");
            title.className = "landing-lane__title";
            title.textContent = lane.label;
            laneNode.appendChild(title);

            var grid = document.createElement("div");
            grid.className = gridClassName || "landing-grid";
            lane.rows.forEach(function(row) { grid.appendChild(cardBuilder(row)); });
            laneNode.appendChild(grid);
            laneShell.appendChild(laneNode);
        });
        viewRoot.appendChild(laneShell);
    }

    function renderDefault(rows) {
        renderSummary(rows);
        renderCategorizedLanes(rows, function(row) {
            return createCard(row, openMissionBrief, createCompareToggleButton);
        }, "landing-grid");
    }

    function renderOrbits(rows) {
        renderSummary(rows);
        renderCategorizedLanes(rows, function(row) {
            return createOrbitCard(row, openMissionBrief, orbitCardPreviewStops, createCompareToggleButton);
        }, "landing-grid landing-grid--orbits");
    }

    function renderTiles(rows) {
        var grid = document.createElement("div");
        grid.className = "landing-grid";
        rows.forEach(function(row) { grid.appendChild(createCard(row, openMissionBrief, createCompareToggleButton)); });
        viewRoot.appendChild(grid);
    }

    function renderTable(rows) {
        function createTableActionButton(text, onClick, launchHref) {
            var el;
            if (launchHref) {
                el = document.createElement("a");
                el.href = launchHref;
            } else {
                el = document.createElement("button");
                el.type = "button";
            }
            el.className = "landing-table-action";
            el.textContent = text;
            if (onClick) {
                el.addEventListener("click", onClick);
            }
            return el;
        }

        function setCellText(cell, text) {
            var value = typeof text === "string" ? text : String(text);
            cell.textContent = value;
            cell.title = value;
        }

        var wrap = document.createElement("div");
        wrap.className = "landing-table-wrap";
        var table = document.createElement("table");
        table.className = "landing-table";
        var columns = visibleTableColumns();
        var head = document.createElement("thead");
        var hr = document.createElement("tr");
        columns.forEach(function(column) {
            var th = document.createElement("th");
            th.setAttribute("data-col-key", column.key);
            if (column.minWidth) th.style.minWidth = column.minWidth;
            if (column.sortField) {
                var isActiveSort = getCurrentTableSortField() === column.sortField;
                th.classList.toggle("is-active-sort", isActiveSort);
                th.setAttribute("aria-sort", isActiveSort ? (getCurrentTableSortOrder() === "asc" ? "ascending" : "descending") : "none");
                var sortButton = document.createElement("button");
                sortButton.type = "button";
                sortButton.className = "landing-table-sort";
                if (isActiveSort) {
                    sortButton.classList.add("is-active");
                }
                sortButton.setAttribute("aria-label", "Sort by " + column.label);
                sortButton.addEventListener("click", function() {
                    if (getCurrentTableSortField() === column.sortField) {
                        setCurrentTableSortOrder(getCurrentTableSortOrder() === "asc" ? "desc" : "asc");
                    } else {
                        setCurrentTableSortField(column.sortField);
                        setCurrentTableSortOrder("asc");
                    }
                    render();
                });
                var label = document.createElement("span");
                label.textContent = column.label;
                var indicator = document.createElement("span");
                indicator.className = "landing-table-sort__indicator";
                if (isActiveSort) {
                    indicator.textContent = getCurrentTableSortOrder() === "asc" ? "↑" : "↓";
                } else {
                    indicator.textContent = "↕";
                }
                sortButton.appendChild(label);
                sortButton.appendChild(indicator);
                th.appendChild(sortButton);
            } else {
                th.textContent = column.label;
            }
            hr.appendChild(th);
        });
        head.appendChild(hr);
        table.appendChild(head);

        var body = document.createElement("tbody");
        rows.forEach(function(row) {
            var tr = document.createElement("tr");
            columns.forEach(function(column) {
                var td = document.createElement("td");
                td.setAttribute("data-col-key", column.key);
                if (column.minWidth) td.style.minWidth = column.minWidth;
                if (column.key === "mission") {
                    td.title = row.title;
                    var missionCell = document.createElement("div");
                    missionCell.className = "landing-table-mission-cell";
                    var missionTitle = document.createElement("span");
                    missionTitle.className = "landing-table-mission-title";
                    missionTitle.textContent = row.title;
                    missionTitle.title = row.title;
                    var missionActions = document.createElement("div");
                    missionActions.className = "landing-table-mission-actions";
                    var briefBtn = createTableActionButton("Brief", function() {
                        openMissionBrief(row);
                    });
                    var compareBtn = createCompareToggleButton(row, {
                        className: "landing-table-action landing-card__btn--compare",
                        label: "Compare",
                    });
                    var openBtn = createTableActionButton("Launch", null, row.href);
                    openBtn.title = "Open animation for " + row.title;
                    missionActions.appendChild(briefBtn);
                    missionActions.appendChild(compareBtn);
                    missionActions.appendChild(openBtn);
                    missionCell.appendChild(missionTitle);
                    missionCell.appendChild(missionActions);
                    td.appendChild(missionCell);
                } else {
                    setCellText(td, tableCellValue(column.key, row));
                }
                tr.appendChild(td);
            });
            body.appendChild(tr);
        });
        table.appendChild(body);
        wrap.appendChild(table);
        viewRoot.appendChild(wrap);
    }

    function renderTimeline(rows) {
        var groups = {};
        rows.forEach(function(row) {
            var year = row.startYear ? String(row.startYear) : "Unknown";
            groups[year] = groups[year] || [];
            groups[year].push(row);
        });

        var years = Object.keys(groups).sort(function(a, b) {
            if (a === "Unknown") return 1;
            if (b === "Unknown") return -1;
            return parseInt(a, 10) - parseInt(b, 10);
        });

        years.forEach(function(year) {
            var g = document.createElement("div");
            g.className = "landing-timeline-group";
            var h = document.createElement("h3");
            h.className = "landing-timeline-year";
            h.textContent = year;
            g.appendChild(h);

            var list = document.createElement("div");
            list.className = "landing-timeline-list";
            groups[year].forEach(function(row) {
                var chip = document.createElement("button");
                chip.className = "landing-timeline-chip";
                chip.type = "button";
                var timelineFlag = flagForCountry(row.country);
                var timelineCraft = iconForCraftClass(row.craftClass);
                chip.textContent =
                    (timelineFlag ? (timelineFlag + " ") : "") +
                    (timelineCraft ? (timelineCraft + " ") : "") +
                    row.title +
                    " • " +
                    row.country;
                chip.addEventListener("click", function() {
                    openMissionBrief(row);
                });
                var chipWrap = document.createElement("div");
                chipWrap.className = "landing-timeline-chip-wrap";
                var chipLaunch = document.createElement("a");
                chipLaunch.className = "landing-timeline-chip-launch";
                chipLaunch.href = row.href;
                chipLaunch.textContent = "Open";
                chipLaunch.title = "Open animation for " + row.title;
                var chipCompare = createCompareToggleButton(row, {
                    className: "landing-timeline-chip-launch landing-timeline-chip-compare",
                    label: "Compare",
                });
                chipWrap.appendChild(chip);
                chipWrap.appendChild(chipCompare);
                chipWrap.appendChild(chipLaunch);
                list.appendChild(chipWrap);
            });
            g.appendChild(list);
            viewRoot.appendChild(g);
        });
    }

    function setFilterOptions(selectEl, values, allLabel) {
        if (!selectEl) return;
        var previous = normalizeKey(selectEl.value);
        selectEl.innerHTML = "";

        var defaultOption = document.createElement("option");
        defaultOption.value = "";
        defaultOption.textContent = allLabel;
        selectEl.appendChild(defaultOption);

        values.forEach(function(value) {
            var option = document.createElement("option");
            option.value = value;
            option.textContent = value;
            selectEl.appendChild(option);
        });
        if (previous && values.some(function(value) { return normalizeKey(value) === previous; })) {
            var restored = values.find(function(value) { return normalizeKey(value) === previous; });
            selectEl.value = restored;
        }
    }

    function populateTableFilters(rows) {
        var craftSet = new Set();
        var crewSet = new Set();
        rows.forEach(function(row) {
            if (asTrimmedString(row.craftClass)) craftSet.add(row.craftClass);
            if (asTrimmedString(row.crewProfile)) crewSet.add(row.crewProfile);
        });

        var craftOptions = Array.from(craftSet).sort(function(a, b) { return a.localeCompare(b); });
        var crewOptions = Array.from(crewSet).sort(function(a, b) { return a.localeCompare(b); });
        setFilterOptions(filterCraft, craftOptions, "All Craft Classes");
        setFilterOptions(filterCrew, crewOptions, "All Crew Profiles");
    }

    function rowsForActiveView() {
        var rows = getMissionRows().slice();
        if (getCurrentView() === "default" || getCurrentView() === "orbits") {
            return rows.sort(function(a, b) { return a.index - b.index; });
        }

        var craftFilter = normalizeKey(filterCraft && filterCraft.value);
        var crewFilter = normalizeKey(filterCrew && filterCrew.value);
        rows = rows.filter(function(row) {
            if (craftFilter && normalizeKey(row.craftClass) !== craftFilter) return false;
            if (crewFilter && normalizeKey(row.crewProfile) !== crewFilter) return false;
            return true;
        });

        if (getCurrentView() === "table") {
            var tableColumn = tableColumns.find(function(column) {
                return column.sortField === getCurrentTableSortField();
            }) || tableColumns[0];
            var tableDirection = getCurrentTableSortOrder() === "desc" ? -1 : 1;
            return rows.sort(function(a, b) {
                return compareRowsByTableColumn(a, b, tableColumn, tableDirection);
            });
        }

        var field = getDefaultSortFieldValue();
        var dir = getDefaultSortOrderValue() === "desc" ? -1 : 1;
        return rows.sort(function(a, b) {
            var av = a[field];
            var bv = b[field];
            if (
                field === "title" ||
                field === "country" ||
                field === "missionType" ||
                field === "craftClass" ||
                field === "crewProfile"
            ) {
                av = (av || "").toLowerCase();
                bv = (bv || "").toLowerCase();
            } else {
                av = Number.isFinite(av) ? av : -Infinity;
                bv = Number.isFinite(bv) ? bv : -Infinity;
            }
            if (av < bv) return -1 * dir;
            if (av > bv) return 1 * dir;
            return (a.index - b.index) * dir;
        });
    }

    function render() {
        viewButtons.forEach(function(btn) {
            btn.classList.toggle("landing-view-button--active", btn.dataset.view === getCurrentView());
        });
        sortControls.style.display = (getCurrentView() === "default" || getCurrentView() === "orbits") ? "none" : "flex";
        if (columnSelector) {
            columnSelector.style.display = getCurrentView() === "table" ? "block" : "none";
            if (getCurrentView() !== "table") {
                columnSelector.open = false;
            }
        }
        syncColumnSelectorUi();
        clearOrbitCardPreviews();
        viewRoot.innerHTML = "";
        var rows = rowsForActiveView();
        if (getCurrentView() === "orbits") {
            renderOrbits(rows);
        } else if (getCurrentView() === "tiles") {
            renderTiles(rows);
        } else if (getCurrentView() === "table") {
            renderTable(rows);
        } else if (getCurrentView() === "timeline") {
            renderTimeline(rows);
        } else {
            renderDefault(rows);
        }
        syncLandingCompareUi();
    }

    return { populateTableFilters, render };
}
