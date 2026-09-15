export async function readMountedCameraInvariantSnapshot(page) {
  return await page.evaluate(() => {
    const origin = document.querySelector('#origin-relative:checked')
      ? 'relative'
      : document.querySelector('#origin-moon:checked')
        ? 'lunar'
        : 'geo';
    const scene = window.animationScenes?.[origin];
    const controller = scene?.cameraController;
    const mountPos = controller?._resolveTargetWorld?.('spacecraft', controller._mountWorld) ?? null;
    const lookPos = controller?._resolveTargetWorld?.('moon', controller._lookWorld) ?? null;
    const camera = scene?.camera ?? null;
    const target = controller?.controls?.target ?? null;

    return {
      origin,
      positionMode: document.getElementById('camera-position')?.value || null,
      lookMode: document.getElementById('camera-look')?.value || null,
      cameraFov: camera?.fov ?? null,
      timelineLabel: document.getElementById('date')?.textContent || null,
      timelineSliderValue: document.getElementById('timeline-slider')?.value || null,
      mountOffsetLength: controller?.mountOffset?.length?.() ?? null,
      cameraToMountDistance: mountPos && camera?.position?.distanceTo
        ? camera.position.distanceTo(mountPos)
        : null,
      cameraToLookDistance: lookPos && camera?.position?.distanceTo
        ? camera.position.distanceTo(lookPos)
        : null,
      targetToLookDistance: lookPos && target?.distanceTo
        ? target.distanceTo(lookPos)
        : null,
      noRotate: controller?.controls?.noRotate ?? null,
      noPan: controller?.controls?.noPan ?? null,
    };
  });
}
