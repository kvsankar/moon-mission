import { asTrimmedString, normalizeKey } from "./landing-text.js";
import { getCatalogModel, loadCatalog, hydrateRowWithConfigTiming, toRow } from "./landing-catalog.js";
import { fetchMissionBrief } from "./landing-brief-data.js";
import { flagForCountry, iconForCraftClass } from "./landing-card-model.js";
import { buildBriefPanelContent, mountBriefImageCarousel } from "./landing-brief-view.js";
import { mountOrbitCardPreviewController } from "./landing-orbit-card-controller.js";
import { createLandingBriefOrbitAnimation } from "./landing-brief-orbit-animation.js";
import { createLandingViewRenderer } from "./landing-view-renderer.js";

(function() {
    window.__landingCatalogV2 = true;

    document.addEventListener("DOMContentLoaded", function() {
        var viewRoot = document.getElementById("landing-view-root");
        var sortControls = document.getElementById("landing-sort-controls");
        var compareTray = document.getElementById("landing-compare-tray");
        var compareSummary = document.getElementById("landing-compare-summary");
        var compareSelection = document.getElementById("landing-compare-selection");
        var compareClearButton = document.getElementById("landing-compare-clear");
        var compareOpenButton = document.getElementById("landing-compare-open");
        var filterCraft = document.getElementById("landing-filter-craft");
        var filterCrew = document.getElementById("landing-filter-crew");
        var resetControls = document.getElementById("landing-controls-reset");
        var columnSelector = document.getElementById("landing-column-selector");
        var columnSummary = document.getElementById("landing-column-summary");
        var columnOptions = document.getElementById("landing-column-options");
        var viewButtons = Array.from(document.querySelectorAll(".landing-view-button"));
        var briefOverlay = document.getElementById("landing-brief-overlay");
        var briefPanel = document.getElementById("landing-brief-panel");

        var currentView = "default";
        var missionRows = [];
        var defaultSortFieldValue = "title";
        var defaultSortOrderValue = "asc";
        var activeBriefRow = null;
        const briefOrbitAnimation = createLandingBriefOrbitAnimation({ buildMissionLaunchHref });
        var activeBriefIndex = -1;
        var activeBriefSequence = [];
        var activeBriefRequestId = 0;
        var orbitCardPreviewStops = [];
        var compareSelectionKeys = [];
        var currentTableSortField = "title";
        var currentTableSortOrder = "asc";
        var tableColumns = [
            { key: "mission", label: "Mission", alwaysVisible: true, minWidth: "220px", sortField: "title", sortType: "alpha" },
            { key: "country", label: "Country", minWidth: "132px", sortField: "country", sortType: "alpha" },
            { key: "craft", label: "Craft", minWidth: "132px", sortField: "craftClass", sortType: "alpha" },
            { key: "crew", label: "Crew", minWidth: "90px", sortField: "crewProfile", sortType: "alpha" },
            { key: "launch", label: "Launch (UTC)", minWidth: "132px", sortField: "launchSortKey", sortType: "numeric" },
            { key: "tli", label: "TLI (UTC)", minWidth: "132px", sortField: "tliSortKey", sortType: "numeric" },
            { key: "loi", label: "LOI (UTC)", minWidth: "132px", sortField: "loiSortKey", sortType: "numeric" },
            { key: "landing", label: "Landing (UTC)", minWidth: "132px", sortField: "landingSortKey", sortType: "numeric" },
            { key: "dataStart", label: "Data Start (UTC)", minWidth: "132px", sortField: "dataStartSortKey", sortType: "numeric" },
            { key: "dataEnd", label: "Data End (UTC)", minWidth: "132px", sortField: "dataEndSortKey", sortType: "numeric" },
            { key: "dataDuration", label: "Data Duration", minWidth: "90px", sortField: "dataDurationSortKey", sortType: "numeric" },
            { key: "timeline", label: "Timeline", minWidth: "132px", sortField: "startYear", sortType: "numeric" },
            { key: "duration", label: "Mission Duration", minWidth: "90px", sortField: "durationSortKey", sortType: "numeric" }
        ];
        var tableColumnState = {};

        tableColumns.forEach(function(column) {
            tableColumnState[column.key] = column.alwaysVisible ? true : column.defaultVisible !== false;
        });

        const { populateTableFilters, render } = createLandingViewRenderer({
            viewRoot, sortControls, filterCraft, filterCrew, columnSelector, tableColumns, viewButtons,
            getMissionRows: () => missionRows,
            getCurrentView: () => currentView,
            getCurrentTableSortField: () => currentTableSortField,
            getCurrentTableSortOrder: () => currentTableSortOrder,
            setCurrentTableSortField: (value) => { currentTableSortField = value; },
            setCurrentTableSortOrder: (value) => { currentTableSortOrder = value; },
            getDefaultSortFieldValue: () => defaultSortFieldValue,
            getDefaultSortOrderValue: () => defaultSortOrderValue,
            syncLandingCompareUi,
            createCompareToggleButton,
            clearOrbitCardPreviews,
            visibleTableColumns,
            syncColumnSelectorUi,
            tableCellValue,
            compareRowsByTableColumn,
            createOrbitCard,
            openMissionBrief,
        });

        function rowIdentity(row) {
            return normalizeKey(
                (row && row.folder) ||
                (row && row.entry && row.entry.folder) ||
                (row && row.title) ||
                ""
            );
        }

        function getCompareSelectionKey(row) {
            return normalizeKey(getMissionSlug(row) || rowIdentity(row));
        }

        function findRowByCompareSelectionKey(compareKey) {
            return missionRows.find(function(row) {
                return getCompareSelectionKey(row) === compareKey;
            }) || null;
        }

        function pruneCompareSelections() {
            compareSelectionKeys = compareSelectionKeys.filter(function(compareKey, index, allKeys) {
                return (
                    !!compareKey &&
                    allKeys.indexOf(compareKey) === index &&
                    !!findRowByCompareSelectionKey(compareKey)
                );
            }).slice(0, 2);
        }

        function getSelectedCompareRows() {
            pruneCompareSelections();
            return compareSelectionKeys
                .map(findRowByCompareSelectionKey)
                .filter(Boolean);
        }

        function isCompareSelected(row) {
            var compareKey = getCompareSelectionKey(row);
            return !!compareKey && compareSelectionKeys.indexOf(compareKey) >= 0;
        }

        function syncCompareToggleButton(button) {
            if (!button) return;
            var compareKey = normalizeKey(button.getAttribute("data-landing-compare-toggle"));
            var buttonLabel = asTrimmedString(button.getAttribute("data-compare-label")) || "Compare";
            var row = findRowByCompareSelectionKey(compareKey);
            var selected = compareSelectionKeys.indexOf(compareKey) >= 0;
            var atLimit = compareSelectionKeys.length >= 2 && !selected;
            button.classList.toggle("is-selected", selected);
            button.disabled = atLimit;
            button.setAttribute("aria-pressed", selected ? "true" : "false");
            button.textContent = selected ? "Selected" : buttonLabel;
            if (selected) {
                button.title = "Remove " + (row ? row.title : "mission") + " from compare";
            } else if (atLimit) {
                button.title = "Remove one selected mission before adding another";
            } else {
                button.title = "Add " + (row ? row.title : "mission") + " to compare";
            }
        }

        function syncCompareToggleButtons() {
            Array.from(document.querySelectorAll("[data-landing-compare-toggle]")).forEach(syncCompareToggleButton);
        }

        function renderCompareSelectionTray() {
            var selectedRows = getSelectedCompareRows();
            if (compareTray) {
                compareTray.hidden = selectedRows.length === 0;
            }
            if (compareSelection) {
                compareSelection.innerHTML = "";
                if (!selectedRows.length) {
                    var empty = document.createElement("span");
                    empty.className = "landing-compare-tray__empty";
                    empty.textContent = "No missions selected yet.";
                    compareSelection.appendChild(empty);
                } else {
                    selectedRows.forEach(function(row, index) {
                        var chip = document.createElement("div");
                        chip.className = "landing-compare-chip";

                        var role = document.createElement("span");
                        role.className = "landing-compare-chip__role";
                        role.textContent = index === 0 ? "Primary" : "Other";

                        var title = document.createElement("span");
                        title.className = "landing-compare-chip__title";
                        title.textContent = row.title;
                        title.title = row.title;

                        var remove = document.createElement("button");
                        remove.type = "button";
                        remove.className = "landing-compare-chip__remove";
                        remove.setAttribute("aria-label", "Remove " + row.title + " from compare");
                        remove.title = "Remove " + row.title;
                        remove.textContent = "×";
                        remove.addEventListener("click", function() {
                            toggleCompareSelection(row);
                        });

                        chip.appendChild(role);
                        chip.appendChild(title);
                        chip.appendChild(remove);
                        compareSelection.appendChild(chip);
                    });
                }
            }

            if (compareSummary) {
                if (selectedRows.length >= 2) {
                    compareSummary.textContent =
                        "Ready to compare " +
                        selectedRows[0].title +
                        " against " +
                        selectedRows[1].title +
                        " in Relative mode.";
                } else if (selectedRows.length === 1) {
                    compareSummary.textContent =
                        selectedRows[0].title +
                        " is set as the primary mission. Select one more mission to compare.";
                } else {
                    compareSummary.textContent =
                        "Select up to two missions to launch a side-by-side comparison in Relative mode.";
                }
            }

            if (compareClearButton) {
                compareClearButton.disabled = selectedRows.length === 0;
                compareClearButton.title = selectedRows.length ? "Clear selected missions" : "No missions selected";
            }

            if (compareOpenButton) {
                compareOpenButton.disabled = selectedRows.length < 2;
                compareOpenButton.title = selectedRows.length >= 2
                    ? ("Open " + selectedRows[0].title + " and " + selectedRows[1].title + " in compare mode")
                    : "Select two missions to launch compare mode";
            }
        }

        function syncLandingCompareUi() {
            renderCompareSelectionTray();
            syncCompareToggleButtons();
        }

        function toggleCompareSelection(row) {
            var compareKey = getCompareSelectionKey(row);
            if (!compareKey) return;
            var selectedIndex = compareSelectionKeys.indexOf(compareKey);
            if (selectedIndex >= 0) {
                compareSelectionKeys.splice(selectedIndex, 1);
            } else if (compareSelectionKeys.length < 2) {
                compareSelectionKeys.push(compareKey);
            } else {
                return;
            }
            syncLandingCompareUi();
        }

        function clearCompareSelection() {
            compareSelectionKeys = [];
            syncLandingCompareUi();
        }

        function launchSelectedCompare() {
            var selectedRows = getSelectedCompareRows();
            if (selectedRows.length < 2) return;
            window.location.assign(buildMissionCompareHref(selectedRows[0], selectedRows[1]));
        }

        function createCompareToggleButton(row, options) {
            var opts = options || {};
            var button = document.createElement("button");
            button.type = "button";
            button.className = opts.className || "landing-card__btn landing-card__btn--compare";
            button.setAttribute("data-landing-compare-toggle", getCompareSelectionKey(row));
            button.setAttribute("data-compare-label", asTrimmedString(opts.label) || "Compare");
            button.addEventListener("click", function(event) {
                event.preventDefault();
                if (opts.stopPropagation) {
                    event.stopPropagation();
                }
                toggleCompareSelection(row);
            });
            syncCompareToggleButton(button);
            return button;
        }

        function getBriefSequence() {
            return (missionRows || []).slice().sort(function(a, b) {
                return (a.index || 0) - (b.index || 0);
            });
        }

        function findBriefIndex(sequence, row) {
            if (!Array.isArray(sequence) || !sequence.length || !row) return -1;
            var id = rowIdentity(row);
            if (!id) return -1;
            for (var i = 0; i < sequence.length; i += 1) {
                if (rowIdentity(sequence[i]) === id) return i;
            }
            return -1;
        }

        function clearOrbitCardPreviews() {
            orbitCardPreviewStops.forEach(function(stop) {
                if (typeof stop === "function") {
                    stop();
                }
            });
            orbitCardPreviewStops = [];
        }

        function isTableColumnVisible(columnKey) {
            var column = tableColumns.find(function(item) { return item.key === columnKey; });
            if (!column) return false;
            if (column.alwaysVisible) return true;
            return tableColumnState[columnKey] !== false;
        }

        function visibleTableColumns() {
            return tableColumns.filter(function(column) {
                return isTableColumnVisible(column.key);
            });
        }

        function resetTableColumnState() {
            tableColumns.forEach(function(column) {
                tableColumnState[column.key] = column.alwaysVisible ? true : column.defaultVisible !== false;
            });
        }

        function syncColumnSelectorUi() {
            if (!columnOptions) return;
            Array.from(columnOptions.querySelectorAll("input[data-column-key]")).forEach(function(input) {
                input.checked = isTableColumnVisible(input.getAttribute("data-column-key"));
            });
            if (columnSummary) {
                var optionalColumns = tableColumns.filter(function(column) { return !column.alwaysVisible; });
                var visibleCount = optionalColumns.filter(function(column) {
                    return isTableColumnVisible(column.key);
                }).length;
                columnSummary.textContent = "Columns " + visibleCount + "/" + optionalColumns.length;
            }
        }

        function populateColumnSelector() {
            if (!columnOptions) return;
            columnOptions.innerHTML = "";
            tableColumns.forEach(function(column) {
                if (column.alwaysVisible) return;
                var label = document.createElement("label");
                label.className = "landing-column-selector__option";
                var input = document.createElement("input");
                input.type = "checkbox";
                input.setAttribute("data-column-key", column.key);
                input.checked = isTableColumnVisible(column.key);
                input.addEventListener("change", function() {
                    tableColumnState[column.key] = input.checked;
                    syncColumnSelectorUi();
                    render();
                });
                var text = document.createElement("span");
                text.textContent = column.label;
                label.appendChild(input);
                label.appendChild(text);
                columnOptions.appendChild(label);
            });
            syncColumnSelectorUi();
        }

        function tableCellValue(columnKey, row) {
            if (columnKey === "mission") return row.title;
            if (columnKey === "country") {
                var countryFlag = flagForCountry(row.country);
                return countryFlag ? (countryFlag + " " + row.country) : row.country;
            }
            if (columnKey === "craft") {
                var craftIcon = iconForCraftClass(row.craftClass);
                return craftIcon ? (craftIcon + " " + row.craftClass) : row.craftClass;
            }
            if (columnKey === "crew") return row.crewProfile;
            if (columnKey === "launch") return row.launchTime;
            if (columnKey === "tli") return row.tliTime;
            if (columnKey === "loi") return row.loiTime;
            if (columnKey === "landing") return row.landingTime;
            if (columnKey === "dataStart") return row.dataStartTime;
            if (columnKey === "dataEnd") return row.dataEndTime;
            if (columnKey === "dataDuration") return row.dataDurationLabel || "N/A";
            if (columnKey === "timeline") return row.rangeLabel;
            if (columnKey === "duration") return row.durationLabel || "N/A";
            return "";
        }

        function findTableColumn(columnKey) {
            return tableColumns.find(function(column) { return column.key === columnKey; }) || null;
        }

        function compareRowsByTableColumn(a, b, column, direction) {
            if (!column || !column.sortField) return (a.index - b.index) * direction;
            var av = a[column.sortField];
            var bv = b[column.sortField];
            var aMissing = av === null || av === undefined || av === "" || av === -Infinity || Number.isNaN(av);
            var bMissing = bv === null || bv === undefined || bv === "" || bv === -Infinity || Number.isNaN(bv);
            if (aMissing && bMissing) return (a.index - b.index) * direction;
            if (aMissing) return 1;
            if (bMissing) return -1;

            if (column.sortType === "numeric") {
                if (av < bv) return -1 * direction;
                if (av > bv) return 1 * direction;
                return (a.index - b.index) * direction;
            }

            av = String(av).toLowerCase();
            bv = String(bv).toLowerCase();
            if (av < bv) return -1 * direction;
            if (av > bv) return 1 * direction;
            return (a.index - b.index) * direction;
        }

        function createOrbitCard(row, onOpenBrief, orbitStops, createCompareToggleButton) {
            var card = document.createElement("article");
            card.className = "landing-card landing-card--orbit";
            card.style.borderColor = row.accent + "66";

            var title = document.createElement("h3");
            title.className = "landing-card__title";
            var titleFlag = document.createElement("span");
            titleFlag.className = "landing-flag";
            titleFlag.textContent = flagForCountry(row.country);
            if (titleFlag.textContent) title.appendChild(titleFlag);
            title.appendChild(document.createTextNode(row.title));

            var meta = document.createElement("p");
            meta.className = "landing-card__preview-meta";
            var cardCraftIcon = iconForCraftClass(row.craftClass);
            meta.textContent =
                row.country +
                " • " +
                (cardCraftIcon ? (cardCraftIcon + " ") : "") +
                row.craftClass +
                " • Earth origin • XY";

            var previewWrap = document.createElement("div");
            previewWrap.className = "landing-card__preview";
            var previewControls = document.createElement("div");
            previewControls.className = "landing-card__preview-controls";
            var modePicker = document.createElement("div");
            modePicker.className = "landing-brief-segmented";
            modePicker.setAttribute("role", "group");
            modePicker.setAttribute("aria-label", row.title + " orbit origin");
            var planePicker = document.createElement("div");
            planePicker.className = "landing-brief-segmented";
            planePicker.setAttribute("role", "group");
            planePicker.setAttribute("aria-label", row.title + " orbit plane");
            var previewHost = document.createElement("div");
            previewHost.className = "landing-card__preview-host";
            previewControls.appendChild(modePicker);
            previewControls.appendChild(planePicker);
            previewWrap.appendChild(previewControls);
            previewWrap.appendChild(previewHost);

            var actions = document.createElement("div");
            actions.className = "landing-card__actions";
            var briefBtn = document.createElement("button");
            briefBtn.type = "button";
            briefBtn.className = "landing-card__btn";
            briefBtn.textContent = "Brief";
            briefBtn.addEventListener("click", function() {
                onOpenBrief(row);
            });
            var launchBtn = createLaunchButton(row, "Launch", buildMissionLaunchHref(row, "geo"));
            var compareBtn = typeof createCompareToggleButton === "function"
                ? createCompareToggleButton(row)
                : null;
            actions.appendChild(briefBtn);
            if (compareBtn) actions.appendChild(compareBtn);
            actions.appendChild(launchBtn);

            card.appendChild(title);
            card.appendChild(meta);
            card.appendChild(previewWrap);
            card.appendChild(actions);

            if (Array.isArray(orbitStops)) {
                orbitStops.push(mountOrbitCardPreviewController({
                    row: row,
                    host: previewHost,
                    modePicker: modePicker,
                    planePicker: planePicker,
                    launchLink: launchBtn,
                    metaLabel: meta
                }, { buildMissionLaunchHref }));
            }

            return card;
        }

        function copyLandingRuntimeParams(url) {
            if (!url || !url.searchParams) return url;
            var currentParams = new URLSearchParams(window.location.search || "");
            var testMode = asTrimmedString(currentParams.get("testMode"));
            if (testMode) {
                url.searchParams.set("testMode", testMode);
            }
            return url;
        }

        function getMissionSlug(row) {
            return asTrimmedString(
                row && row.folder
            ) || asTrimmedString(
                row && row.entry && row.entry.folder
            );
        }

        function buildMissionLaunchHref(row, modeKey) {
            var missionFolder = getMissionSlug(row);
            var url = new URL(
                missionFolder ? (encodeURIComponent(missionFolder) + "/") : "./",
                window.location.href,
            );
            if (modeKey === "relative") {
                url.searchParams.set("mode", "relative");
                url.searchParams.delete("origin");
            } else if (modeKey === "lunar") {
                url.searchParams.delete("mode");
                url.searchParams.set("origin", "lunar");
            } else {
                url.searchParams.delete("mode");
                url.searchParams.delete("origin");
            }
            copyLandingRuntimeParams(url);
            return url.toString();
        }

        function buildMissionCompareHref(primaryRow, secondaryRow) {
            var secondaryMission = getMissionSlug(secondaryRow);
            var primaryFolder = asTrimmedString(
                primaryRow && primaryRow.entry && primaryRow.entry.folder
            ) || asTrimmedString(
                primaryRow && primaryRow.folder
            );
            var url = new URL(
                primaryFolder ? (encodeURIComponent(primaryFolder) + "/") : "./",
                window.location.href
            );
            if (secondaryMission) {
                url.searchParams.set("compareMission", secondaryMission);
            }
            url.searchParams.set("mode", "compare");
            url.searchParams.set("origin", "relative");
            copyLandingRuntimeParams(url);
            return url.toString();
        }

        function updateBriefQuery(row) {
            var params = new URLSearchParams(window.location.search);
            if (row) {
                params.set("panel", "brief");
                params.set("brief", row.folder || row.entry.folder || "");
            } else {
                params.delete("panel");
                params.delete("brief");
            }
            var nextQuery = params.toString();
            var nextUrl = window.location.pathname + (nextQuery ? ("?" + nextQuery) : "");
            window.history.replaceState({}, "", nextUrl);
        }

        function closeMissionBrief(options) {
            var opts = options || {};
            activeBriefRow = null;
            activeBriefIndex = -1;
            activeBriefSequence = [];
            briefOrbitAnimation.stop();
            if (briefPanel) {
                briefPanel.classList.remove("is-open");
                briefPanel.setAttribute("aria-hidden", "true");
            }
            if (briefOverlay) {
                briefOverlay.classList.remove("is-open");
                briefOverlay.setAttribute("aria-hidden", "true");
            }
            document.body.style.overflow = "";
            if (!opts.keepQuery) {
                updateBriefQuery(null);
            }
        }

        function navigateBrief(delta) {
            if (!Array.isArray(activeBriefSequence) || !activeBriefSequence.length || !Number.isFinite(activeBriefIndex)) return;
            var total = activeBriefSequence.length;
            var nextIndex = (activeBriefIndex + delta + total) % total;
            var nextRow = activeBriefSequence[nextIndex];
            if (!nextRow) return;
            openMissionBrief(nextRow, { sequence: activeBriefSequence, index: nextIndex });
        }

        function bindBriefControls() {
            var closeBtn = document.getElementById("landing-brief-close");
            if (closeBtn) {
                closeBtn.addEventListener("click", function() { closeMissionBrief(); });
            }
            var closeFooterBtn = document.getElementById("landing-brief-close-footer");
            if (closeFooterBtn) {
                closeFooterBtn.addEventListener("click", function() { closeMissionBrief(); });
            }
            var navButtons = briefPanel ? Array.from(briefPanel.querySelectorAll("[data-brief-nav]")) : [];
            navButtons.forEach(function(button) {
                button.addEventListener("click", function() {
                    var delta = parseInt(button.getAttribute("data-brief-nav"), 10);
                    if (delta === -1 || delta === 1) navigateBrief(delta);
                });
            });
        }

        function openMissionBrief(row, options) {
            var opts = options || {};
            if (!row || !briefPanel || !briefOverlay) return;
            var sequence = Array.isArray(opts.sequence) && opts.sequence.length ? opts.sequence : getBriefSequence();
            var nextIndex = Number.isFinite(opts.index) ? opts.index : findBriefIndex(sequence, row);
            if (nextIndex < 0 && sequence.length) nextIndex = 0;
            var resolvedRow = sequence[nextIndex] || row;

            activeBriefSequence = sequence;
            activeBriefIndex = nextIndex;
            activeBriefRow = resolvedRow;
            var requestId = activeBriefRequestId + 1;
            activeBriefRequestId = requestId;

            briefOverlay.classList.add("is-open");
            briefPanel.classList.add("is-open");
            briefOverlay.setAttribute("aria-hidden", "false");
            briefPanel.setAttribute("aria-hidden", "false");
            document.body.style.overflow = "hidden";
            updateBriefQuery(resolvedRow);

            briefPanel.innerHTML = "<p class=\"landing-brief-summary\">Loading mission brief...</p>";
            fetchMissionBrief(resolvedRow).then(function(brief) {
                if (requestId !== activeBriefRequestId) return;
                briefPanel.innerHTML = buildBriefPanelContent(resolvedRow, brief, activeBriefIndex, activeBriefSequence.length || 1);
                mountBriefImageCarousel(brief && Array.isArray(brief.images) ? brief.images : [], briefPanel);
                briefOrbitAnimation.mount(resolvedRow);
                bindBriefControls();
            });
        }

        if (briefOverlay) {
            briefOverlay.addEventListener("click", function() {
                closeMissionBrief();
            });
        }
        document.addEventListener("keydown", function(event) {
            if (event.key === "Escape") {
                closeMissionBrief();
                return;
            }
            if (!briefPanel || !briefPanel.classList.contains("is-open")) return;
            if (event.key === "ArrowLeft") {
                event.preventDefault();
                navigateBrief(-1);
                return;
            }
            if (event.key === "ArrowRight") {
                event.preventDefault();
                navigateBrief(1);
            }
        });

        function openBriefFromQueryIfPresent() {
            var params = new URLSearchParams(window.location.search);
            if (params.get("panel") !== "brief") return;
            var briefKey = normalizeKey(params.get("brief"));
            if (!briefKey) return;
            var row = missionRows.find(function(item) {
                return briefKey === normalizeKey(item.folder || "");
            });
            if (row) {
                openMissionBrief(row);
            }
        }

        viewButtons.forEach(function(button) {
            button.addEventListener("click", function() {
                currentView = button.dataset.view || "default";
                render();
            });
        });
        if (filterCraft) filterCraft.addEventListener("change", render);
        if (filterCrew) filterCrew.addEventListener("change", render);
        if (resetControls) {
            resetControls.addEventListener("click", function() {
                if (filterCraft) filterCraft.value = "";
                if (filterCrew) filterCrew.value = "";
                currentTableSortField = defaultSortFieldValue;
                currentTableSortOrder = defaultSortOrderValue;
                resetTableColumnState();
                if (columnSelector) columnSelector.open = false;
                render();
            });
        }
        if (compareClearButton) {
            compareClearButton.addEventListener("click", clearCompareSelection);
        }
        if (compareOpenButton) {
            compareOpenButton.addEventListener("click", launchSelectedCompare);
        }

        populateColumnSelector();
        syncLandingCompareUi();

        loadCatalog()
            .then(function(entries) {
                missionRows = entries.map(toRow);
                populateTableFilters(missionRows);
                var tableCfg = (getCatalogModel().views && getCatalogModel().views.table) || {};
                var defaultSortField = asTrimmedString(tableCfg.defaultSortField);
                var defaultSortOrder = asTrimmedString(tableCfg.defaultSortOrder);
                if (defaultSortField) defaultSortFieldValue = defaultSortField;
                if (defaultSortOrder) defaultSortOrderValue = defaultSortOrder;
                currentTableSortField = defaultSortFieldValue;
                currentTableSortOrder = defaultSortOrderValue;
                render();
                openBriefFromQueryIfPresent();

                Promise.all(missionRows.map(hydrateRowWithConfigTiming))
                    .then(function(hydratedRows) {
                        missionRows = hydratedRows;
                        render();
                        if (activeBriefRow) {
                            openMissionBrief(activeBriefRow);
                        } else {
                            openBriefFromQueryIfPresent();
                        }
                    })
                    .catch(function() {
                        /* keep baseline timing placeholders */
                    });
            })
            .catch(function(error) {
                console.error(error);
                viewRoot.innerHTML = "<p style=\"color:#ff9aa5;\">Mission catalog failed to load.</p>";
            });
    });
})();
