// Builds the Frame-and-Shoot photo, optics and eclipse controls.
export function createComposerOpticsContent({ composerControlMatrix, composerControlsWrap }, dependencies) {
    const {
        COMPOSER_EXPOSURE_EV_MIN,
        COMPOSER_EXPOSURE_EV_MAX,
        COMPOSER_EXPOSURE_EV_DEFAULT,
        COMPOSER_OPTICS_STRENGTH_MIN,
        COMPOSER_OPTICS_STRENGTH_MAX,
        COMPOSER_OPTICS_STRENGTH_DEFAULT,
        COMPOSER_OPTICS_ADVANCED_MIN,
        COMPOSER_OPTICS_ADVANCED_MAX,
        COMPOSER_OPTICS_ADVANCED_DEFAULT,
        COMPOSER_ECLIPSE_CORONA_MIN,
        COMPOSER_ECLIPSE_CORONA_MAX,
        COMPOSER_ECLIPSE_CORONA_DEFAULT,
        COMPOSER_ECLIPSE_CORONA_VARIATION_DEFAULT,
        COMPOSER_ECLIPSE_ZODIACAL_DUST_DEFAULT,
    } = dependencies;
    let composerOpticsWrap = null;
    let composerOpticsBody = null;
    let composerExposureSlider = null;
    let composerExposureValue = null;
    let composerAutoExposureWrap = null;
    let composerAutoExposureCheckbox = null;
    let composerExposureTotalValue = null;
    let composerOpticsPhysicalButton = null;
    let composerOpticsCameraButton = null;
    let composerOpticsStrengthSlider = null;
    let composerOpticsStrengthValue = null;
    let composerOpticsAdvancedPanel = null;
    let composerOpticsHaloSlider = null;
    let composerOpticsHaloValue = null;
    let composerOpticsStarburstSlider = null;
    let composerOpticsStarburstValue = null;
    let composerOpticsFlareSlider = null;
    let composerOpticsFlareValue = null;
    let composerEclipseCoronaPanel = null;
    let composerEclipseCoronaIntensitySlider = null;
    let composerEclipseCoronaIntensityValue = null;
    let composerEclipseCoronaMotionSlider = null;
    let composerEclipseCoronaMotionValue = null;
    let composerEclipseCoronaStructureSlider = null;
    let composerEclipseCoronaStructureValue = null;
    let composerEclipseZodiacalDustSlider = null;
    let composerEclipseZodiacalDustValue = null;
    composerOpticsWrap = document.createElement("div");
    composerOpticsWrap.className = "aux-camera-view__composer-optics";

    composerOpticsBody = document.createElement("div");
    composerOpticsBody.className = "aux-camera-view__composer-optics-body";
    composerOpticsBody.hidden = false;

    const composerPhotoLabel = document.createElement("span");
    composerPhotoLabel.className = "aux-camera-view__composer-section-label";
    composerPhotoLabel.textContent = "Photo";
    composerOpticsBody.appendChild(composerPhotoLabel);

    const composerExposureRow = document.createElement("div");
    composerExposureRow.className = "aux-camera-view__composer-optics-row";
    const composerExposureLabel = document.createElement("span");
    composerExposureLabel.className = "aux-camera-view__composer-label";
    composerExposureLabel.textContent = "Exposure Comp";
    composerExposureRow.appendChild(composerExposureLabel);
    composerExposureSlider = document.createElement("input");
    composerExposureSlider.type = "range";
    composerExposureSlider.className = "aux-camera-view__composer-ambient-slider";
    composerExposureSlider.min = String(COMPOSER_EXPOSURE_EV_MIN);
    composerExposureSlider.max = String(COMPOSER_EXPOSURE_EV_MAX);
    composerExposureSlider.step = "0.1";
    composerExposureSlider.value = String(COMPOSER_EXPOSURE_EV_DEFAULT);
    composerExposureSlider.setAttribute("aria-label", "Frame and Shoot exposure compensation");
    composerExposureSlider.dataset.proofId = "exposure-ev-slider";
    composerExposureRow.appendChild(composerExposureSlider);
    composerExposureValue = document.createElement("output");
    composerExposureValue.className = "aux-camera-view__composer-ambient-value";
    composerExposureValue.value = "+0.0 EV";
    composerExposureValue.textContent = composerExposureValue.value;
    composerExposureRow.appendChild(composerExposureValue);
    composerOpticsBody.appendChild(composerExposureRow);

    composerAutoExposureWrap = document.createElement("label");
    composerAutoExposureWrap.className = "aux-camera-view__composer-grid-toggle";
    composerAutoExposureCheckbox = document.createElement("input");
    composerAutoExposureCheckbox.type = "checkbox";
    composerAutoExposureCheckbox.checked = true;
    composerAutoExposureCheckbox.setAttribute("aria-label", "Toggle Frame and Shoot eclipse auto exposure");
    composerAutoExposureCheckbox.dataset.proofId = "auto-exposure-toggle";
    const composerAutoExposureText = document.createElement("span");
    composerAutoExposureText.textContent = "Auto Exposure";
    composerExposureTotalValue = document.createElement("output");
    composerExposureTotalValue.className = "aux-camera-view__composer-auto-exposure-total";
    composerExposureTotalValue.value = "Total +0.0 EV";
    composerExposureTotalValue.textContent = composerExposureTotalValue.value;
    composerExposureTotalValue.dataset.proofId = "exposure-total-value";
    composerAutoExposureWrap.appendChild(composerAutoExposureCheckbox);
    composerAutoExposureWrap.appendChild(composerAutoExposureText);
    composerAutoExposureWrap.appendChild(composerExposureTotalValue);
    composerOpticsBody.appendChild(composerAutoExposureWrap);

    const composerOpticsHeader = document.createElement("div");
    composerOpticsHeader.className = "aux-camera-view__composer-optics-header";
    const composerOpticsLabel = document.createElement("span");
    composerOpticsLabel.className = "aux-camera-view__composer-label aux-camera-view__composer-row-label";
    composerOpticsLabel.textContent = "Sun";
    composerOpticsHeader.appendChild(composerOpticsLabel);

    composerOpticsPhysicalButton = document.createElement("button");
    composerOpticsPhysicalButton.type = "button";
    composerOpticsPhysicalButton.className = "aux-camera-view__composer-button";
    composerOpticsPhysicalButton.textContent = "Physical";
    composerOpticsPhysicalButton.setAttribute("aria-label", "Use physical sun optics profile");
    composerOpticsHeader.appendChild(composerOpticsPhysicalButton);

    composerOpticsCameraButton = document.createElement("button");
    composerOpticsCameraButton.type = "button";
    composerOpticsCameraButton.className = "aux-camera-view__composer-button";
    composerOpticsCameraButton.textContent = "Camera";
    composerOpticsCameraButton.setAttribute("aria-label", "Use camera optics profile");
    composerOpticsHeader.appendChild(composerOpticsCameraButton);
    composerOpticsBody.appendChild(composerOpticsHeader);

    const composerOpticsStrengthRow = document.createElement("div");
    composerOpticsStrengthRow.className = "aux-camera-view__composer-optics-row";
    const composerOpticsStrengthLabel = document.createElement("span");
    composerOpticsStrengthLabel.className = "aux-camera-view__composer-label";
    composerOpticsStrengthLabel.textContent = "Strength";
    composerOpticsStrengthRow.appendChild(composerOpticsStrengthLabel);
    composerOpticsStrengthSlider = document.createElement("input");
    composerOpticsStrengthSlider.type = "range";
    composerOpticsStrengthSlider.className = "aux-camera-view__composer-ambient-slider";
    composerOpticsStrengthSlider.min = String(COMPOSER_OPTICS_STRENGTH_MIN);
    composerOpticsStrengthSlider.max = String(COMPOSER_OPTICS_STRENGTH_MAX);
    composerOpticsStrengthSlider.step = "0.01";
    composerOpticsStrengthSlider.value = String(COMPOSER_OPTICS_STRENGTH_DEFAULT);
    composerOpticsStrengthSlider.setAttribute("aria-label", "Flyby Planner optics strength");
    composerOpticsStrengthRow.appendChild(composerOpticsStrengthSlider);
    composerOpticsStrengthValue = document.createElement("output");
    composerOpticsStrengthValue.className = "aux-camera-view__composer-ambient-value";
    composerOpticsStrengthValue.value = `${COMPOSER_OPTICS_STRENGTH_DEFAULT.toFixed(2)}`;
    composerOpticsStrengthValue.textContent = composerOpticsStrengthValue.value;
    composerOpticsStrengthRow.appendChild(composerOpticsStrengthValue);
    composerOpticsBody.appendChild(composerOpticsStrengthRow);

    composerOpticsAdvancedPanel = document.createElement("div");
    composerOpticsAdvancedPanel.className = "aux-camera-view__composer-optics-advanced";
    composerOpticsAdvancedPanel.hidden = false;

    const buildAdvancedRow = (
        labelText,
        {
            container = composerOpticsAdvancedPanel,
            min = COMPOSER_OPTICS_ADVANCED_MIN,
            max = COMPOSER_OPTICS_ADVANCED_MAX,
            defaultValue = COMPOSER_OPTICS_ADVANCED_DEFAULT,
            ariaLabel = "",
            proofId = "",
        } = {},
    ) => {
        const row = document.createElement("div");
        row.className = "aux-camera-view__composer-optics-row";
        const label = document.createElement("span");
        label.className = "aux-camera-view__composer-label";
        label.textContent = labelText;
        row.appendChild(label);
        const slider = document.createElement("input");
        slider.type = "range";
        slider.className = "aux-camera-view__composer-ambient-slider";
        slider.min = String(min);
        slider.max = String(max);
        slider.step = "0.01";
        slider.value = String(defaultValue);
        if (ariaLabel) {
            slider.setAttribute("aria-label", ariaLabel);
        }
        if (proofId) {
            slider.dataset.proofId = proofId;
        }
        row.appendChild(slider);
        const value = document.createElement("output");
        value.className = "aux-camera-view__composer-ambient-value";
        value.value = `${defaultValue.toFixed(2)}`;
        value.textContent = value.value;
        row.appendChild(value);
        container.appendChild(row);
        return { slider, value };
    };
    ({ slider: composerOpticsHaloSlider, value: composerOpticsHaloValue } = buildAdvancedRow("Halo"));
    ({ slider: composerOpticsStarburstSlider, value: composerOpticsStarburstValue } = buildAdvancedRow("Star"));
    ({ slider: composerOpticsFlareSlider, value: composerOpticsFlareValue } = buildAdvancedRow("Flare"));

    composerEclipseCoronaPanel = document.createElement("div");
    composerEclipseCoronaPanel.className = "aux-camera-view__composer-optics-advanced aux-camera-view__composer-eclipse-corona";
    const composerEclipseCoronaLabel = document.createElement("span");
    composerEclipseCoronaLabel.className = "aux-camera-view__composer-section-label aux-camera-view__composer-eclipse-corona-label";
    composerEclipseCoronaLabel.textContent = "Eclipse Corona";
    composerEclipseCoronaPanel.appendChild(composerEclipseCoronaLabel);
    ({
        slider: composerEclipseCoronaIntensitySlider,
        value: composerEclipseCoronaIntensityValue,
    } = buildAdvancedRow("Intensity", {
        container: composerEclipseCoronaPanel,
        min: COMPOSER_ECLIPSE_CORONA_MIN,
        max: COMPOSER_ECLIPSE_CORONA_MAX,
        defaultValue: COMPOSER_ECLIPSE_CORONA_DEFAULT,
        ariaLabel: "Frame and Shoot eclipse corona intensity",
        proofId: "eclipse-corona-intensity-slider",
    }));
    ({
        slider: composerEclipseCoronaMotionSlider,
        value: composerEclipseCoronaMotionValue,
    } = buildAdvancedRow("Motion", {
        container: composerEclipseCoronaPanel,
        min: COMPOSER_ECLIPSE_CORONA_MIN,
        max: COMPOSER_ECLIPSE_CORONA_MAX,
        defaultValue: COMPOSER_ECLIPSE_CORONA_DEFAULT,
        ariaLabel: "Frame and Shoot eclipse corona motion",
        proofId: "eclipse-corona-motion-slider",
    }));
    ({
        slider: composerEclipseCoronaStructureSlider,
        value: composerEclipseCoronaStructureValue,
    } = buildAdvancedRow("Variation", {
        container: composerEclipseCoronaPanel,
        min: COMPOSER_ECLIPSE_CORONA_MIN,
        max: COMPOSER_ECLIPSE_CORONA_MAX,
        defaultValue: COMPOSER_ECLIPSE_CORONA_VARIATION_DEFAULT,
        ariaLabel: "Frame and Shoot eclipse corona angular variation",
        proofId: "eclipse-corona-variation-slider",
    }));
    ({
        slider: composerEclipseZodiacalDustSlider,
        value: composerEclipseZodiacalDustValue,
    } = buildAdvancedRow("Zodiacal", {
        container: composerEclipseCoronaPanel,
        min: COMPOSER_ECLIPSE_CORONA_MIN,
        max: COMPOSER_ECLIPSE_CORONA_MAX,
        defaultValue: COMPOSER_ECLIPSE_ZODIACAL_DUST_DEFAULT,
        ariaLabel: "Frame and Shoot ecliptic dust glow",
        proofId: "eclipse-zodiacal-dust-slider",
    }));
    composerOpticsBody.appendChild(composerOpticsAdvancedPanel);
    composerOpticsBody.appendChild(composerEclipseCoronaPanel);
    composerOpticsWrap.appendChild(composerControlsWrap);
    composerOpticsWrap.appendChild(composerOpticsBody);

    composerControlMatrix.appendChild(composerOpticsWrap);
    return {
        composerOpticsWrap,
        composerOpticsBody,
        composerExposureSlider,
        composerExposureValue,
        composerAutoExposureWrap,
        composerAutoExposureCheckbox,
        composerExposureTotalValue,
        composerOpticsPhysicalButton,
        composerOpticsCameraButton,
        composerOpticsStrengthSlider,
        composerOpticsStrengthValue,
        composerOpticsAdvancedPanel,
        composerOpticsHaloSlider,
        composerOpticsHaloValue,
        composerOpticsStarburstSlider,
        composerOpticsStarburstValue,
        composerOpticsFlareSlider,
        composerOpticsFlareValue,
        composerEclipseCoronaPanel,
        composerEclipseCoronaIntensitySlider,
        composerEclipseCoronaIntensityValue,
        composerEclipseCoronaMotionSlider,
        composerEclipseCoronaMotionValue,
        composerEclipseCoronaStructureSlider,
        composerEclipseCoronaStructureValue,
        composerEclipseZodiacalDustSlider,
        composerEclipseZodiacalDustValue,
    };
}
