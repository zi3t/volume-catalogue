import { mkdir } from "node:fs/promises";

import { connect } from "./cdp.mjs";

const [
  port = "9226",
  url = "http://127.0.0.1:4173/press/?press-renderer=clean-room",
  screenshotDirectory = "/tmp/zi3t-clean-room-journey"
] = Deno.args;

const cdp = await connect(port, { width: 1568, height: 894 });
const checks = [];
const check = (name, passed, details = undefined) => {
  checks.push({ name, passed: Boolean(passed), ...(details === undefined ? {} : { details }) });
};
const state = () => cdp.evaluate("window.__pressCleanRoomDebug?.()");
const setViewport = (width, height) => cdp.send("Emulation.setDeviceMetricsOverride", {
  width,
  height,
  deviceScaleFactor: 1,
  mobile: false
});
const setReducedMotion = (enabled) => cdp.send("Emulation.setEmulatedMedia", {
  media: "",
  features: [{
    name: "prefers-reduced-motion",
    value: enabled ? "reduce" : "no-preference"
  }]
});
const loadCatalogue = async () => {
  const previousOrigin = await cdp.evaluate("performance.timeOrigin");
  await cdp.navigate(url);
  const ready = await cdp.waitFor(`(
    performance.timeOrigin !== ${previousOrigin}
    && document.documentElement.dataset.pressRenderer === "clean-room"
    && document.documentElement.classList.contains("press-entry-complete")
    && window.__pressCleanRoomDebug?.().state.mode === "catalogue"
  )`, 15_000);
  await cdp.evaluate("window.scrollTo({ top: 0, behavior: 'instant' })");
  await cdp.sleep(120);
  return ready;
};
const canvasCoverage = () => cdp.evaluate(`(() => {
  const canvas = document.querySelector('.press-scene-canvas--clean-room');
  const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
  if (!canvas || !gl) return { available: false, coverage: 0, contextLost: true };
  const pixel = new Uint8Array(4);
  let painted = 0;
  let samples = 0;
  for (let y = 8; y < canvas.height; y += Math.max(12, Math.floor(canvas.height / 24))) {
    for (let x = 8; x < canvas.width; x += Math.max(12, Math.floor(canvas.width / 36))) {
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      if (pixel[3] > 8) painted += 1;
      samples += 1;
    }
  }
  return {
    available: true,
    coverage: samples ? painted / samples : 0,
    contextLost: gl.isContextLost()
  };
})()`);
const screenshotBookCoverage = async (name) => {
  const result = await cdp.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false
  });
  await Deno.writeFile(
    `${screenshotDirectory}/${name}.png`,
    Uint8Array.from(atob(result.data), (character) => character.charCodeAt(0))
  );
  const source = JSON.stringify(`data:image/png;base64,${result.data}`);
  return cdp.evaluate(`(async () => {
    const canvas = document.querySelector('.press-scene-canvas--clean-room');
    const book = document.querySelector('.press-volume-book');
    if (!canvas || !book) return { available: false, coverage: 0, contextLost: true };
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return { available: false, coverage: 0, contextLost: true };
    const blob = await fetch(${source}).then((response) => response.blob());
    const bitmap = await createImageBitmap(blob);
    const sample = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = sample.getContext('2d', { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0);
    const rect = book.getBoundingClientRect();
    const x = Math.max(0, Math.round(rect.left));
    const y = Math.max(0, Math.round(rect.top));
    const width = Math.max(1, Math.min(bitmap.width - x, Math.round(rect.width)));
    const height = Math.max(1, Math.min(bitmap.height - y, Math.round(rect.height)));
    const pixels = context.getImageData(x, y, width, height).data;
    let painted = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const distance = Math.abs(pixels[index] - 32)
        + Math.abs(pixels[index + 1] - 24)
        + Math.abs(pixels[index + 2] - 25);
      if (pixels[index + 3] > 240 && distance > 24) painted += 1;
    }
    bitmap.close();
    return {
      available: true,
      coverage: painted / (width * height),
      contextLost: gl.isContextLost()
    };
  })()`);
};

try {
  await mkdir(screenshotDirectory, { recursive: true });
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: "window.__pressDebugEnabled = true;"
  });
  await setReducedMotion(false);
  await setViewport(1568, 894);
  const desktopReady = await loadCatalogue();
  check("the clean-room desktop catalogue settles for the journey gate", desktopReady);

  const gpu = await cdp.requireHardwareGpu();
  check("the journey gate is running on hardware WebGL", !gpu.software, gpu);

  const desktopBase = await state();
  const desktopGeometry = await cdp.evaluate(`(() => ({
    mainHeight: Math.round(document.querySelector('.home-page main').getBoundingClientRect().height),
    documentMaximum: document.documentElement.scrollHeight - innerHeight,
    expectedMain: Math.round(innerHeight + innerHeight * .213 * 4 + innerHeight * 2.18),
    path: location.pathname + location.search
  }))()`);
  check(
    "desktop scroll length contains five shelf stops and the 2.18-viewport terminal only",
    Math.abs(desktopGeometry.mainHeight - desktopGeometry.expectedMain) <= 2
      && Math.abs(desktopGeometry.documentMaximum - (desktopGeometry.expectedMain - 894)) <= 2
      && desktopGeometry.path === "/press/?press-renderer=clean-room",
    desktopGeometry
  );

  const basePitch = desktopBase.books[0].rotation[0];
  await cdp.evaluate("window.scrollTo({ top: innerHeight * .213 * 2, behavior: 'instant' })");
  // A fixed millisecond sleep can observe the scroll listener before hidden
  // Chrome has presented the corresponding WebGL frame. Wait for two real
  // animation frames so this samples the fan impulse after the renderer has
  // consumed it, independent of background-window scheduling.
  await cdp.evaluate(`new Promise((resolve) => requestAnimationFrame(() => {
    requestAnimationFrame(resolve);
  }))`);
  const fan = await state();
  const railIndex = await cdp.evaluate(`Array.from(document.querySelectorAll('.press-rail-item'))
    .findIndex((button) => button.getAttribute('aria-current') === 'true')`);
  check(
    "native catalogue scroll advances the genuine rail and keeps translated DOM anchoring",
    fan.state.currentIndex === 2
      && railIndex === 2
      && fan.scroll.stackShift > 100
      && Math.abs(fan.scroll.cameraY - 6.5) < 0.02,
    { state: fan.state, scroll: fan.scroll, railIndex }
  );
  check(
    "scroll injects the extracted fan impulse into the shelf tilt",
    Math.abs(fan.scroll.scrollVelocity) > 0.001
      && Math.abs(fan.books[0].rotation[0] - basePitch) > 0.003,
    {
      basePitch,
      fanPitch: fan.books[0].rotation[0],
      velocity: fan.scroll.scrollVelocity
    }
  );
  await cdp.screenshot(`${screenshotDirectory}/desktop-fan-mid.png`);
  await cdp.sleep(900);
  const fanSettled = await state();
  check(
    "the fan decays by the clean-room frame-normalized .4 recurrence back to rest",
    fanSettled.scroll.scrollVelocity === 0
      && Math.abs(fanSettled.books[0].rotation[0] - basePitch) < 0.01,
    {
      basePitch,
      settledPitch: fanSettled.books[0].rotation[0],
      velocity: fanSettled.scroll.scrollVelocity
    }
  );

  const terminalPositions = await cdp.evaluate(`(() => {
    const catalogueMaximum = innerHeight * .213 * 4;
    const maximum = document.documentElement.scrollHeight - innerHeight;
    const terminalLength = maximum - catalogueMaximum;
    return {
      signature: catalogueMaximum + terminalLength * .3,
      closing: maximum
    };
  })()`);
  await cdp.evaluate(`window.scrollTo({ top: ${terminalPositions.signature}, behavior: 'instant' })`);
  const signatureReady = await cdp.waitFor(`(
    document.body.classList.contains('press-terminal-active')
    && Number(getComputedStyle(document.querySelector('.signature-section')).opacity) > .92
    && window.__pressCleanRoomDebug?.().scroll.terminalSceneOpacity < .01
  )`, 5_000);
  const signatureState = await cdp.evaluate(`({
    path: location.pathname + location.search,
    closing: document.body.classList.contains('press-terminal-closing'),
    itemsInert: Array.from(document.querySelectorAll('.press-volume-item')).every((item) => item.inert),
    signatureOpacity: Number(getComputedStyle(document.querySelector('.signature-section')).opacity)
  })`);
  check(
    "the terminal hands the fifth book to the genuine signature without changing address",
    signatureReady
      && !signatureState.closing
      && signatureState.itemsInert
      && signatureState.path === "/press/?press-renderer=clean-room",
    signatureState
  );
  await cdp.screenshot(`${screenshotDirectory}/desktop-terminal-signature.png`);

  await cdp.evaluate(`window.scrollTo({ top: ${terminalPositions.closing}, behavior: 'instant' })`);
  const closingReady = await cdp.waitFor(`(
    document.body.classList.contains('press-terminal-closing')
    && Number(getComputedStyle(document.querySelector('.home-closing')).opacity) > .92
  )`, 5_000);
  const closingState = await cdp.evaluate(`({
    closingInert: document.querySelector('.home-closing').inert,
    footerInert: document.querySelector('.home-footer').inert,
    closingOpacity: Number(getComputedStyle(document.querySelector('.home-closing')).opacity),
    footerOpacity: Number(getComputedStyle(document.querySelector('.home-footer')).opacity)
  })`);
  check(
    "the terminal closing and footer become visible and keyboard-reachable together",
    closingReady
      && !closingState.closingInert
      && !closingState.footerInert
      && closingState.footerOpacity > .92,
    closingState
  );
  await cdp.screenshot(`${screenshotDirectory}/desktop-terminal-closing.png`);

  await cdp.evaluate("window.scrollTo({ top: 0, behavior: 'instant' })");
  const terminalReset = await cdp.waitFor(`(
    scrollY < 2
    && !document.body.classList.contains('press-terminal-active')
    && !document.querySelector('.press-volume-item').inert
  )`, 5_000);
  check("returning to the shelf resets terminal paint and accessibility state", terminalReset);

  const idleReached = await cdp.waitFor(
    "window.__pressCleanRoomDebug?.().render.idlePaused === true",
    7_000
  );
  const idleBefore = await state();
  const idleCoverage = await canvasCoverage();
  await cdp.sleep(600);
  const idleAfter = await state();
  check(
    "desktop preserves its settled drawing buffer and suspends animation at idle",
    idleReached
      && idleBefore.render.preserveDrawingBuffer
      && idleAfter.render.idlePaused
      && idleAfter.render.animationFrames === idleBefore.render.animationFrames
      && idleAfter.render.presentedFrames === idleBefore.render.presentedFrames
      && idleCoverage.available
      && !idleCoverage.contextLost
      && idleCoverage.coverage > 0.05,
    { before: idleBefore.render, after: idleAfter.render, coverage: idleCoverage }
  );
  await cdp.screenshot(`${screenshotDirectory}/desktop-idle.png`);
  await cdp.evaluate("window.scrollTo({ top: 1, behavior: 'instant' })");
  const woke = await cdp.waitFor(`(
    window.__pressCleanRoomDebug?.().render.idlePaused === false
    && window.__pressCleanRoomDebug?.().render.presentedFrames > ${idleAfter.render.presentedFrames}
  )`, 3_000);
  check("a native scroll wakes the suspended desktop scene", woke);

  await setReducedMotion(true);
  await setViewport(1568, 894);
  const reducedReady = await loadCatalogue();
  const reducedBase = await state();
  const reducedDom = await cdp.evaluate(`(() => {
    const link = document.querySelector('.press-volume');
    link.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, clientX: 784, clientY: 400, pointerType: 'mouse', buttons: 1
    }));
    link.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true, clientX: 900, clientY: 330, pointerType: 'mouse', buttons: 1
    }));
    return {
      mainHeight: Math.round(document.querySelector('.home-page main').getBoundingClientRect().height),
      held: document.querySelector('.press-catalog').classList.contains('is-book-held'),
      dragging: document.querySelector('.press-catalog').classList.contains('is-book-dragging'),
      terminalDisplay: getComputedStyle(document.querySelector('.signature-section')).display
    };
  })()`);
  check(
    "reduced motion collapses the journey and disables shelf choreography",
    reducedReady
      && reducedDom.mainHeight <= 900
      && !reducedDom.held
      && !reducedDom.dragging
      && reducedDom.terminalDisplay === "none"
      && reducedBase.scroll.stackShift === 0,
    { dom: reducedDom, scroll: reducedBase.scroll }
  );
  await cdp.evaluate("document.querySelector('.press-volume').click()");
  const reducedVolumeReady = await cdp.waitFor(`(
    location.pathname + location.search === "/press/refly/?press-renderer=clean-room"
    && window.__pressCleanRoomDebug?.().state.mode === "volumes"
  )`, 8_000);
  const reducedVolume = await cdp.evaluate(`({
    mainHeight: Math.round(document.querySelector('.home-page main').getBoundingClientRect().height),
    sectionTop: Math.round(document.querySelector('.press-volume-section').getBoundingClientRect().top),
    figureDisplay: getComputedStyle(document.querySelector('.press-volume-figure')).display,
    itemsInert: Array.from(document.querySelectorAll('.press-volume-item')).every((item) => item.inert)
  })`);
  const reducedVolumeState = await state();
  check(
    "reduced-motion volume routes remain readable without a posed canvas book",
    reducedVolumeReady
      && reducedVolume.mainHeight <= 900
      && Math.abs(reducedVolume.sectionTop) <= 2
      && reducedVolume.figureDisplay === "none"
      && reducedVolume.itemsInert
      && reducedVolumeState.books.every((book) => book.opacity < .001),
    reducedVolume
  );
  await cdp.screenshot(`${screenshotDirectory}/reduced-volume.png`);

  await setReducedMotion(false);
  await setViewport(390, 844);
  const compactReady = await loadCatalogue();
  const compactBase = await state();
  const compactBounds = compactBase?.books?.[0]?.screenBounds;
  const compactDom = await cdp.evaluate(`(() => {
    const link = document.querySelector('.press-volume');
    link.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, clientX: 195, clientY: 360, pointerType: 'mouse', buttons: 1
    }));
    link.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true, clientX: 260, clientY: 320, pointerType: 'mouse', buttons: 1
    }));
    const rows = Array.from(document.querySelectorAll('.press-volume-item'));
    return {
      mainHeight: Math.round(document.querySelector('.home-page main').getBoundingClientRect().height),
      firstTop: rows[0].getBoundingClientRect().top,
      secondTop: rows[1].getBoundingClientRect().top,
      visibleBooks: rows.filter((row) => {
        const rect = row.getBoundingClientRect();
        return rect.bottom > 0 && rect.top < innerHeight;
      }).length,
      held: document.querySelector('.press-catalog').classList.contains('is-book-held'),
      dragging: document.querySelector('.press-catalog').classList.contains('is-book-dragging'),
      railDisplay: getComputedStyle(document.querySelector('.press-rail')).display,
      captionDisplay: getComputedStyle(document.querySelector('.press-hold-caption')).display,
      terminalDisplay: getComputedStyle(document.querySelector('.signature-section')).display
    };
  })()`);
  check(
    "compact keeps the oversized genuine catalogue without hold or fabricated terminal",
    compactReady
      && Math.abs(compactDom.mainHeight - 1604) <= 2
      && compactDom.firstTop >= 270 && compactDom.firstTop <= 292
      && compactDom.secondTop >= 468 && compactDom.secondTop <= 490
      && Math.abs(compactBounds?.top - 278) <= 8
      && Math.abs(compactBounds?.width - 432) <= 10
      && Math.abs(compactBounds?.height - 180) <= 8
      && compactDom.visibleBooks === 3
      && !compactDom.held
      && !compactDom.dragging
      && compactDom.railDisplay === "none"
      && compactDom.captionDisplay === "none"
      && compactDom.terminalDisplay === "none",
    {
      ...compactDom,
      screenBounds: compactBounds,
      referenceVisibleBounds: { left: 0, top: 277, width: 390, height: 182 }
    }
  );
  const compactFramesBefore = compactBase.render.presentedFrames;
  await cdp.sleep(600);
  const compactLive = await state();
  const compactCoverage = await screenshotBookCoverage("compact-idle");
  check(
    "compact keeps presenting because its drawing buffer is intentionally unpreserved",
    !compactLive.render.preserveDrawingBuffer
      && !compactLive.render.idlePaused
      && compactLive.render.presentedFrames > compactFramesBefore
      && compactCoverage.available
      && !compactCoverage.contextLost
      && compactCoverage.coverage > 0.05,
    { before: compactFramesBefore, after: compactLive.render, coverage: compactCoverage }
  );
  await cdp.evaluate("window.scrollTo({ top: innerHeight * .45, behavior: 'instant' })");
  await cdp.sleep(180);
  const compactScroll = await state();
  const compactRailIndex = await cdp.evaluate(`Array.from(document.querySelectorAll('.press-rail-item'))
    .findIndex((button) => button.getAttribute('aria-current') === 'true')`);
  check(
    "compact native scroll advances the real selected volume and stays on the catalogue",
    compactScroll.state.currentIndex === 2
      && compactRailIndex === 2
      && await cdp.evaluate("location.pathname + location.search") === "/press/?press-renderer=clean-room",
    { state: compactScroll.state, scroll: compactScroll.scroll, compactRailIndex }
  );
  await cdp.screenshot(`${screenshotDirectory}/compact-scroll.png`);
  await cdp.evaluate("window.scrollTo({ top: 0, behavior: 'instant' })");
  await cdp.sleep(120);
  await cdp.evaluate("document.querySelector('.press-volume').click()");
  const compactVolumeReady = await cdp.waitFor(`(
    location.pathname + location.search === "/press/refly/?press-renderer=clean-room"
    && window.__pressCleanRoomDebug?.().state.mode === "volumes"
    && window.__pressCleanRoomDebug?.().books[0].sectionVisible === true
  )`, 10_000);
  const compactVolume = await cdp.evaluate(`(() => {
    const figure = document.querySelector('.press-volume-figure').getBoundingClientRect();
    return {
      sectionTop: Math.round(document.querySelector('.press-volume-section').getBoundingClientRect().top),
      figureWidth: Math.round(figure.width),
      figureHeight: Math.round(figure.height),
      columns: getComputedStyle(document.querySelector('.press-volume-stage')).gridTemplateColumns
    };
  })()`);
  const compactVolumeState = await state();
  const compactVolumeBounds = compactVolumeState?.books?.[0]?.screenBounds;
  check(
    "a compact pick opens the matched single-column live-volume document",
    compactVolumeReady
      && Math.abs(compactVolume.sectionTop) <= 2
      && compactVolume.figureWidth >= 340
      && compactVolume.columns.split(" ").length === 1
      && Math.abs(compactVolumeBounds?.left - 35) <= 8
      && Math.abs(compactVolumeBounds?.top - 89) <= 8
      && Math.abs(compactVolumeBounds?.width - 323) <= 10
      && Math.abs(compactVolumeBounds?.height - 408) <= 10,
    {
      ...compactVolume,
      screenBounds: compactVolumeBounds,
      referenceBounds: { left: 35, top: 89, width: 323, height: 408 }
    }
  );
  await cdp.screenshot(`${screenshotDirectory}/compact-volume.png`);

  check("the complete journey runtime reports no browser errors", cdp.errors.length === 0, cdp.errors);

  const failed = checks.filter((entry) => !entry.passed);
  console.log(JSON.stringify({ gpu, checks }, null, 2));
  if (failed.length) throw new Error(`${failed.length} clean-room journey check(s) failed`);
} finally {
  await cdp.close();
}
