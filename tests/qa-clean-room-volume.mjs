import { mkdir } from "node:fs/promises";

import { connect } from "./cdp.mjs";

const [
  port = "9226",
  url = "http://127.0.0.1:4173/press/shutdown-drain/?press-renderer=clean-room",
  screenshotDirectory = "/tmp/zi3t-clean-room-volume"
] = Deno.args;

const cdp = await connect(port, { width: 1568, height: 894 });
const checks = [];
const check = (name, passed, details = undefined) => {
  checks.push({ name, passed: Boolean(passed), ...(details === undefined ? {} : { details }) });
};
const angularDistance = (left, right) => {
  const distance = Math.abs(left - right) % (Math.PI * 2);
  return Math.min(distance, Math.PI * 2 - distance);
};
const state = () => cdp.evaluate("window.__pressCleanRoomDebug?.()");
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
    source: `
      window.__pressDebugEnabled = true;
      window.__pressBootSamples = [];
      const samplePressBoot = () => {
        const root = document.documentElement;
        const body = document.body;
        const canvas = document.querySelector?.('.press-scene-canvas');
        if (root && body) {
          window.__pressBootSamples.push({
            pending: root.classList.contains('press-startup-pending'),
            ready: root.classList.contains('press-startup-ready'),
            sceneReady: root.classList.contains('press-scene-ready'),
            bodyVisibility: getComputedStyle(body).visibility,
            canvasOpacity: canvas ? Number(getComputedStyle(canvas).opacity) : null,
            renderCalls: window.__pressCleanRoomDebug?.().render.calls ?? 0
          });
        }
        if (performance.now() < 6000) requestAnimationFrame(samplePressBoot);
      };
      requestAnimationFrame(samplePressBoot);
    `
  });
  await cdp.navigate(url);
  const ready = await cdp.waitFor(`(() => {
    const debug = window.__pressCleanRoomDebug?.();
    return debug?.state.mode === "volumes"
      && debug.state.currentIndex === 2
      && debug.state.pendingDeepLinkIndex === -1
      && debug.books[2].sectionVisible === true;
  })()`, 15_000);
  check("the live-volume gate opens directly on its section", ready);

  const bootSamples = await cdp.evaluate("window.__pressBootSamples ?? []");
  const pendingSamples = bootSamples.filter((sample) => sample.pending);
  const revealedSample = bootSamples.find((sample) => sample.ready);
  check(
    "the initial route keeps the assembled DOM hidden while WebGL boots",
    pendingSamples.length > 0
      && pendingSamples.every((sample) => sample.bodyVisibility === "hidden"),
    pendingSamples
  );
  check(
    "the startup gate releases only after a rendered deep-link frame",
    revealedSample?.pending === false
      && revealedSample.sceneReady === true
      && revealedSample.canvasOpacity === 1
      && revealedSample.renderCalls > 0,
    revealedSample
  );

  const gpu = await cdp.requireHardwareGpu();
  check("the live-volume gate is running on hardware WebGL", !gpu.software, gpu);

  const figure = await cdp.evaluate(`(() => {
    const rect = document.querySelectorAll('.press-volume-figure')[2].getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  const rest = await state();
  const left = await cdp.evaluate(`(() => {
    window.dispatchEvent(new PointerEvent('pointermove', {
      clientX: 484, clientY: 447, pointerType: 'mouse'
    }));
    return window.__pressCleanRoomDebug?.();
  })()`);
  const right = await cdp.evaluate(`(() => {
    window.dispatchEvent(new PointerEvent('pointermove', {
      clientX: 1084, clientY: 447, pointerType: 'mouse'
    }));
    return window.__pressCleanRoomDebug?.();
  })()`);
  check(
    "the live volume follows the pointer at the extracted passive rate",
    Math.abs(left.state.coverRotation[1] + .045) < .008
      && Math.abs(right.state.coverRotation[1] - .045) < .008,
    { left: left?.state, right: right?.state }
  );

  await dispatchMouse("mouseMoved", figure.x, figure.y, { button: "none", buttons: 0 });
  const dragBase = await state();
  await dispatchMouse("mousePressed", figure.x, figure.y, {
    button: "left",
    buttons: 1,
    clickCount: 1
  });
  const dragPoint = { x: figure.x + 180, y: figure.y + 120 };
  await dispatchMouse("mouseMoved", dragPoint.x, dragPoint.y, {
    button: "none",
    buttons: 1
  });
  const dragged = await cdp.waitFor(`(() => {
    const debug = window.__pressCleanRoomDebug?.();
    return debug?.state.coverDragging === true
      && debug.state.coverRotation[0] > .35
      && debug.state.coverRotation[1] > .45
      && document.body.classList.contains('press-cover-dragging');
  })()`, 3_000);
  const dragState = await state();
  check(
    "figure drag turns the cover around its fixed centre at .003 radians per pixel",
    dragged
      && Math.abs(
        dragState.state.coverRotation[0] - dragBase.state.coverRotation[0] - .36
      ) < .015
      && Math.abs(
        dragState.state.coverRotation[1] - dragBase.state.coverRotation[1] - .54
      ) < .015
      && Math.abs(dragState.books[2].position[0] - rest.books[2].position[0]) < .02
      && Math.abs(dragState.books[2].position[1] - rest.books[2].position[1]) < .02,
    { base: dragBase?.state, state: dragState?.state, book: dragState?.books?.[2] }
  );
  await cdp.screenshot(`${screenshotDirectory}/volume-dragged.png`);

  const rotationAtRelease = dragState.state.coverRotation;
  await dispatchMouse("mouseReleased", dragPoint.x, dragPoint.y, {
    button: "left",
    buttons: 0,
    clickCount: 1
  });
  await cdp.sleep(90);
  const thrown = await state();
  check(
    "release throws the volume from the clamped last rotation delta",
    thrown?.state?.coverDragging === false
      && !await cdp.evaluate("document.body.classList.contains('press-cover-dragging')")
      && Math.abs(thrown.state.coverRotation[0] - rotationAtRelease[0]) > .2
      && Math.abs(thrown.state.coverRotation[1] - rotationAtRelease[1]) > .2
      && Math.abs(thrown.state.coverTwirl[0]) <= .3
      && Math.abs(thrown.state.coverTwirl[1]) <= .3,
    { atRelease: rotationAtRelease, after: thrown?.state }
  );
  await cdp.screenshot(`${screenshotDirectory}/volume-thrown.png`);

  const twirlSettled = await cdp.waitFor(`(() => {
    const state = window.__pressCleanRoomDebug?.().state;
    return Math.abs(state?.coverTwirl[0] ?? 1) < .001
      && Math.abs(state?.coverTwirl[1] ?? 1) < .001;
  })()`, 5_000);
  const settled = await state();
  check(
    "the throw decays to rest without snapping its authored rotation away",
    twirlSettled
      && angularDistance(settled.state.coverRotation[0], rotationAtRelease[0]) > .2
      && angularDistance(settled.state.coverRotation[1], rotationAtRelease[1]) > .2,
    settled?.state
  );

  let resolveLoad;
  const loaded = new Promise((resolve) => { resolveLoad = resolve; });
  const stopListening = cdp.on((message) => {
    if (message.method === "Page.loadEventFired") resolveLoad();
  });
  await cdp.navigate(url);
  await Promise.race([loaded, cdp.sleep(10_000)]);
  stopListening();
  await cdp.waitFor(`(
    window.__pressCleanRoomDebug?.().state.pendingDeepLinkIndex === -1
    && window.__pressCleanRoomDebug?.().books[2].sectionVisible === true
  )`, 15_000);
  const beforeScroll = await state();
  await cdp.evaluate("window.scrollBy({ top: 500, behavior: 'instant' })");
  const heldByScroll = await cdp.waitFor(`(() => {
    const debug = window.__pressCleanRoomDebug?.();
    return debug?.state.currentIndex === 2
      && debug.books[2].sectionVisible === true
      && Math.abs(debug.books[2].rotation[1] - ${beforeScroll.books[2].rotation[1]}) < .02;
  })()`, 4_000);
  const afterScroll = await state();
  const readingLayout = await cdp.evaluate(`(() => {
    const figure = document.querySelectorAll('.press-volume-figure')[2].getBoundingClientRect();
    const content = document.querySelectorAll('.press-volume-content')[2].getBoundingClientRect();
    return {
      figure: { left: figure.left, top: figure.top, right: figure.right, bottom: figure.bottom },
      content: { left: content.left, top: content.top, right: content.right }
    };
  })()`);
  check(
    "section scroll holds the active book beside a non-overlapping copy column",
    heldByScroll
      && Math.abs(
        afterScroll.books[2].rotation[1] - beforeScroll.books[2].rotation[1]
      ) < .02
      && Math.abs(afterScroll.books[2].position[1] - beforeScroll.books[2].position[1]) < .02
      && readingLayout.content.left > readingLayout.figure.right
      && readingLayout.figure.top > 0
      && afterScroll.books.every((book, index) => index === 2 || book.opacity < .001),
    {
      before: beforeScroll?.books?.[2]?.rotation,
      after: afterScroll?.books?.[2]?.rotation,
      layout: readingLayout,
      address: await cdp.evaluate("location.pathname + location.search")
    }
  );
  await cdp.screenshot(`${screenshotDirectory}/volume-scroll-turned.png`);

  check("the live-volume runtime reports no browser errors", cdp.errors.length === 0, cdp.errors);

  const failed = checks.filter((entry) => !entry.passed);
  console.log(JSON.stringify({ gpu, checks }, null, 2));
  if (failed.length) throw new Error(`${failed.length} clean-room live-volume check(s) failed`);
} finally {
  await cdp.close();
}
