import { mkdir } from "node:fs/promises";

import { connect } from "./cdp.mjs";

const [
  port = "9226",
  url = "http://127.0.0.1:4173/press/?press-renderer=clean-room",
  screenshotDirectory = "/tmp/zi3t-clean-room-interaction"
] = Deno.args;

const cdp = await connect(port, { width: 1568, height: 894 });
const checks = [];
const check = (name, passed, details = undefined) => {
  checks.push({ name, passed: Boolean(passed), ...(details === undefined ? {} : { details }) });
};

const state = () => cdp.evaluate("window.__pressCleanRoomDebug?.()");
const within = (actual, expected, tolerance) => (
  Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance
);
const dispatchMouse = (type, x, y, options = {}) => cdp.send("Input.dispatchMouseEvent", {
  type,
  x,
  y,
  pointerType: "mouse",
  ...options
});

try {
  await mkdir(screenshotDirectory, { recursive: true });
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: "window.__pressDebugEnabled = true;"
  });
  await cdp.navigate(url);

  const ready = await cdp.waitFor(`(
    document.documentElement.dataset.pressRenderer === "clean-room"
    && document.documentElement.classList.contains("press-entry-complete")
    && window.__pressCleanRoomDebug?.().state.entryComplete === true
  )`, 15_000);
  check("the authored entry sequence settles before controls are released", ready);

  const gpu = await cdp.requireHardwareGpu();
  check("the interaction gate is running on hardware WebGL", !gpu.software, gpu);

  // Chrome retains the host cursor position across fresh CDP targets. Move it
  // clear of the shelf before asserting the unhovered semantic home pose.
  await dispatchMouse("mouseMoved", 10, 10, { button: "none", buttons: 0 });
  await cdp.waitFor(`window.__pressCleanRoomDebug?.().books.every((book) => (
    Math.abs(book.position[2] - book.homePosition[2]) < .02
  ))`, 4_000);
  const base = await state();
  const baseBounds = base?.books?.[0]?.screenBounds;
  check(
    "all five books settle on the calibrated shelf after entry",
    base?.books?.length === 5 && base.books.every((book) => (
      Math.abs(book.position[0] - book.homePosition[0]) < 0.02
      && Math.abs(book.position[2] - book.homePosition[2]) < 0.02
      && Math.abs(book.scale - book.homeScale) < 0.02
      && book.opacity > 0.999
    ))
      && within(baseBounds?.left, 394, 8)
      && within(baseBounds?.top, 332, 8)
      && within(baseBounds?.width, 780, 8)
      && within(baseBounds?.height, 128, 8),
    { books: base?.books, referenceBounds: { left: 394, top: 332, width: 780, height: 128 } }
  );
  await cdp.screenshot(`${screenshotDirectory}/desktop-base.png`);

  const target = await cdp.evaluate(`(() => {
    const rect = document.querySelector('.press-volume-book').getBoundingClientRect();
    const row = document.querySelector('.press-volume-item').getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      rowY: row.top + row.height / 2
    };
  })()`);
  await dispatchMouse("mouseMoved", target.x, target.y, { button: "none", buttons: 0 });
  const hovered = await cdp.waitFor(`(() => {
    const debug = window.__pressCleanRoomDebug?.();
    const book = debug?.books?.[0];
    return debug?.state.hoverIndex === 0
      && book.position[2] > book.homePosition[2] + 2.7;
  })()`, 4_000);
  const hoverState = await state();
  check("hover uses the accepted projected-depth pop", hovered, hoverState?.books?.[0]);
  await cdp.screenshot(`${screenshotDirectory}/desktop-hover.png`);

  await dispatchMouse("mousePressed", target.x, target.y, {
    button: "left",
    buttons: 1,
    clickCount: 1
  });
  const isolated = await cdp.waitFor(`(() => {
    const debug = window.__pressCleanRoomDebug?.();
    return debug?.state.heldIndex === 0
      && debug.state.dragging === false
      && debug.state.isolation > .9
      && document.querySelector('.press-catalog').classList.contains('is-stack-evacuated');
  })()`, 4_000);
  const pressedState = await state();
  const neighbourTravel = Math.abs(
    (pressedState?.books?.[1]?.position?.[1] ?? 0)
      - (pressedState?.books?.[1]?.homePosition?.[1] ?? 0)
  );
  check(
    "pointer press isolates the selected volume without becoming a drag",
    isolated && neighbourTravel > 15,
    { state: pressedState?.state, neighbourTravel }
  );
  await cdp.screenshot(`${screenshotDirectory}/desktop-pressed.png`);

  await dispatchMouse("mouseMoved", target.x + 2, target.y + 1, {
    button: "none",
    buttons: 1
  });
  await cdp.sleep(80);
  const belowThreshold = await state();
  check(
    "travel inside the 4px Manhattan boundary remains a press",
    belowThreshold?.state?.dragging === false,
    belowThreshold?.state
  );

  // This is the matched live-reference gesture used for the canonical held
  // silhouette capture. Keep the pointer delta coupled to that evidence.
  const dragPoint = { x: target.x + 140, y: target.y - 62 };
  await dispatchMouse("mouseMoved", dragPoint.x, dragPoint.y, {
    button: "none",
    buttons: 1
  });
  const dragged = await cdp.waitFor(`(() => {
    const debug = window.__pressCleanRoomDebug?.();
    const rotation = debug?.books?.[0]?.rotation;
    return debug?.state.dragging === true
      && debug.state.presentation > .85
      && debug.state.backdrop > .9
      && rotation[0] < -.15
      && rotation[1] > .38;
  })()`, 4_000);
  const dragState = await state();
  const dragBounds = dragState?.books?.[0]?.screenBounds;
  const dragDom = await cdp.evaluate(`(() => ({
    path: location.pathname + location.search,
    stage: document.querySelector('.press-catalog').classList.contains('is-book-dragging'),
    body: document.body.classList.contains('press-book-dragging'),
    captionOpacity: Number(getComputedStyle(document.querySelector('.press-hold-caption')).opacity)
  }))()`);
  check(
    "drag maps pointer travel into the held orbit and presentation backdrop",
    dragged && dragDom.stage && dragDom.body
      && within(dragBounds?.left, 345, 10)
      && within(dragBounds?.top, 284, 10)
      && within(dragBounds?.width, 906, 10)
      && within(dragBounds?.height, 213, 10),
    {
      state: dragState?.state,
      rotation: dragState?.books?.[0]?.rotation,
      screenBounds: dragBounds,
      referenceBounds: { left: 340, top: 285, width: 904, height: 214 },
      dom: dragDom
    }
  );
  check(
    "the held caption occupies the presentation and the catalogue URL stays put",
    dragDom.captionOpacity > 0.95
      && dragDom.path === "/press/?press-renderer=clean-room",
    dragDom
  );
  await cdp.screenshot(`${screenshotDirectory}/desktop-dragged.png`);

  await dispatchMouse("mouseReleased", dragPoint.x, dragPoint.y, {
    button: "left",
    buttons: 0,
    clickCount: 1
  });
  await cdp.sleep(80);
  const releaseEarly = await state();
  await cdp.screenshot(`${screenshotDirectory}/desktop-release-80.png`);
  check(
    "release starts from the held pose without snapping or navigating",
    releaseEarly?.state?.heldIndex === -1
      && releaseEarly.state.returningIndex === 0
      && releaseEarly.state.isolation > 0.2
      && Math.abs(releaseEarly.books[0].rotation[0]) > 0.12
      && await cdp.evaluate("location.pathname + location.search")
        === "/press/?press-renderer=clean-room",
    { state: releaseEarly?.state, rotation: releaseEarly?.books?.[0]?.rotation }
  );

  await dispatchMouse("mouseMoved", 10, 10, { button: "none", buttons: 0 });
  const returned = await cdp.waitFor(`(() => {
    const debug = window.__pressCleanRoomDebug?.();
    const book = debug?.books?.[0];
    return debug?.state.returningIndex === -1
      && debug.state.isolation < .01
      && debug.state.presentation < .01
      && debug.state.backdrop < .01
      && debug.state.focusIndex === 0
      && Math.abs(book.rotation[0] + .005) < .015
      && Math.abs(book.rotation[1]) < .015
      && Math.abs((book.position[2] - book.homePosition[2]) - 3.2) < .05
      && Math.abs(book.screenBounds.left - 380) < 8
      && Math.abs(book.screenBounds.top - 337) < 8
      && Math.abs(book.screenBounds.width - 808) < 8
      && Math.abs(book.screenBounds.height - 133) < 8;
  })()`, 4_000);
  const returnedState = await state();
  check(
    "release reverses rotation and stack evacuation to the focused shelf pose",
    returned,
    returnedState?.books?.[0]
  );
  await cdp.screenshot(`${screenshotDirectory}/desktop-release-settled.png`);

  const flank = { x: 1320, y: target.rowY };
  await dispatchMouse("mouseMoved", flank.x, flank.y, { button: "none", buttons: 0 });
  await dispatchMouse("mousePressed", flank.x, flank.y, {
    button: "left",
    buttons: 1,
    clickCount: 1
  });
  await dispatchMouse("mouseMoved", flank.x + 90, flank.y + 28, {
    button: "none",
    buttons: 1
  });
  const flankDragged = await cdp.waitFor(`(() => {
    const state = window.__pressCleanRoomDebug?.().state;
    return state?.heldIndex === 0 && state.dragging === true;
  })()`, 3_000);
  await dispatchMouse("mouseReleased", flank.x + 90, flank.y + 28, {
    button: "left",
    buttons: 0,
    clickCount: 1
  });
  const flankPath = await cdp.evaluate("location.pathname + location.search");
  check(
    "the full-width row owns drag and suppresses flank navigation",
    flankDragged && flankPath === "/press/?press-renderer=clean-room",
    { flankDragged, flankPath }
  );

  check("the interaction runtime reports no browser errors", cdp.errors.length === 0, cdp.errors);

  const failed = checks.filter((entry) => !entry.passed);
  console.log(JSON.stringify({ gpu, checks }, null, 2));
  if (failed.length) throw new Error(`${failed.length} clean-room interaction check(s) failed`);
} finally {
  await cdp.close();
}
