function buildPanelStructuralRenderSignature(viewModel = {}, { panelTitle, mediaCountLabel } = {}) {
    return JSON.stringify({
        panelTitle: viewModel.panelTitle || panelTitle,
        mediaCountLabel: viewModel.mediaCountLabel || mediaCountLabel,
        statusText: String(viewModel.statusText || "").trim(),
        manifestRetryAvailable: viewModel.manifestRetryAvailable === true,
        activeItem: viewModel.activeItem || null,
        descriptionEmptyText: viewModel.descriptionEmptyText || "",
        emptyText: viewModel.emptyText || "",
        stageEmptyText: viewModel.stageEmptyText || "",
        seedNote: viewModel.seedNote || "",
        filterSummaryLabel: viewModel.filterSummaryLabel || "",
        filterModel: viewModel.filterModel || null,
        navigationModel: viewModel.navigationModel || null,
        thumbnailItems: viewModel.thumbnailItems || [],
    });
}

function resolveCompactTimeLabel(timeLabel) {
    const text = String(timeLabel || "").trim();
    if (!text) return "--";
    return text.split(" • ")[0]?.trim() || text;
}

function formatMediaDetailList(values) {
    const parts = (Array.isArray(values) ? values : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean);
    return parts.length ? parts.join(", ") : "--";
}

function formatCompositionHintLabel(hint = {}) {
    const target = String(hint?.suggestedLockTarget || hint?.lockTarget || "").trim();
    const confidence = Number(hint?.confidence);
    const reason = String(hint?.reason || "").trim();
    const targetLabel = target ? `Lock ${target}` : "";
    const confidenceLabel = Number.isFinite(confidence) ? `${Math.round(confidence * 100)}%` : "";
    return [
        targetLabel,
        confidenceLabel,
        reason,
    ].filter(Boolean).join(" - ") || "--";
}

export { buildPanelStructuralRenderSignature, resolveCompactTimeLabel, formatMediaDetailList, formatCompositionHintLabel };
