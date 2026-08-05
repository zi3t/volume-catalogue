import { mkdir, writeFile } from "node:fs/promises";

const options = Object.fromEntries(Deno.args.map((argument) => {
  const [key, ...parts] = argument.replace(/^--/, "").split("=");
  return [key, parts.join("=") || true];
}));
const port = String(options.port || "9225");
const normalizePath = (path) => path === "/" ? "/" : `${path.replace(/\/+$/, "")}/`;
const catalogueUrl = new URL(String(options.url || "http://127.0.0.1:4173/press/"));
catalogueUrl.pathname = normalizePath(catalogueUrl.pathname);
const url = catalogueUrl.href;
const cataloguePath = catalogueUrl.pathname;
const volumePaths = Object.fromEntries(
  ["refly", "arm", "telemetry", "practice", "field-notes"]
    .map((slug) => [slug, new URL(`${slug}/`, catalogueUrl).pathname])
);
const screenshotDirectory = options.screenshots ? String(options.screenshots) : "";


const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
const page = pages.find((entry) => entry.type === "page");
if (!page) throw new Error(`No Chrome page target found on port ${port}`);

const socket = new WebSocket(page.webSocketDebuggerUrl);
const pending = new Map();
const runtimeErrors = [];
let sequence = 0;
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

socket.addEventListener("message", (event) => {
  const payload = JSON.parse(event.data);
  if (payload.id && pending.has(payload.id)) {
    const callbacks = pending.get(payload.id);
    pending.delete(payload.id);
    if (payload.error) callbacks.reject(new Error(payload.error.message));
    else callbacks.resolve(payload.result);
    return;
  }
  if (payload.method === "Runtime.exceptionThrown") {
    runtimeErrors.push(payload.params.exceptionDetails.text || "Runtime exception");
  }
  if (payload.method === "Runtime.consoleAPICalled" && payload.params.type === "error") {
    runtimeErrors.push(payload.params.args.map((item) => item.value || item.description).join(" "));
  }
});

const send = (method, params = {}) => {
  const id = ++sequence;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
};
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const evaluate = async (expression) => {
  const response = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.text || "Evaluation failed");
  }
  return response.result.value;
};
const waitFor = async (expression, timeout = 5000) => {
  const started = performance.now();
  while (performance.now() - started < timeout) {
    if (await evaluate(expression)) return true;
    await wait(50);
  }
  return false;
};
const setViewport = async (width, height) => {
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false
  });
};
const setReducedMotion = async (enabled) => {
  await send("Emulation.setEmulatedMedia", {
    media: "",
    features: [{
      name: "prefers-reduced-motion",
      value: enabled ? "reduce" : "no-preference"
    }]
  });
};
const navigateHome = async () => {
  const previousTimeOrigin = await evaluate("performance.timeOrigin");
  await send("Page.navigate", { url });
  const committed = await waitFor(`performance.timeOrigin !== ${previousTimeOrigin}`, 15000);
  if (!committed) throw new Error("Home navigation did not commit");
  const ready = await waitFor(`
    document.readyState === 'complete'
    && location.pathname === ${JSON.stringify(cataloguePath)}
    && document.documentElement.classList.contains('press-scene-ready')
    && Boolean(document.querySelector('.press-hold-caption'))
  `, 15000);
  if (!ready) throw new Error("Press scene did not become ready");
  await evaluate("window.scrollTo({ top: 0, behavior: 'instant' })");
  await wait(1250);
};
const firstBookCenter = () => evaluate(`(() => {
  const rect = document.querySelector('.press-volume-book').getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    expectedLeft: (document.documentElement.clientWidth - rect.width) / 2
  };
})()`);
const mouse = (type, x, y, buttons = 0) => send("Input.dispatchMouseEvent", {
  type,
  x,
  y,
  button: type === "mouseMoved" ? "none" : "left",
  buttons,
  clickCount: type === "mouseMoved" ? 0 : 1
});
const dragPointer = async (center, dx, dy) => {
  const end = { x: center.x + dx, y: center.y + dy };
  for (let step = 1; step <= 12; step += 1) {
    const progress = step / 12;
    await mouse(
      "mouseMoved",
      center.x + dx * progress,
      center.y + dy * progress,
      1
    );
    await wait(17);
  }
  return end;
};
const captureDragAngle = async (name, dx, dy) => {
  const angleCenter = await firstBookCenter();
  await mouse("mouseMoved", angleCenter.x, angleCenter.y);
  await wait(120);
  await mouse("mousePressed", angleCenter.x, angleCenter.y, 1);
  await wait(180);
  const end = await dragPointer(angleCenter, dx, dy);
  await wait(380);
  await capture(name);
  await mouse("mouseReleased", end.x, end.y, 0);
  await wait(1000);
};
const capture = async (name) => {
  if (!screenshotDirectory) return;
  await mkdir(screenshotDirectory, { recursive: true });
  const result = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false
  });
  await writeFile(`${screenshotDirectory}/${name}.png`, Buffer.from(result.data, "base64"));
};
const FIGURE_COVERAGE_FLOOR = 0.12;
const SECTION_GROUND_COVERAGE_FLOOR = 0.985;
const screenshotBookCoverage = async (name) => {
  const result = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false
  });
  if (screenshotDirectory) {
    await mkdir(screenshotDirectory, { recursive: true });
    await writeFile(`${screenshotDirectory}/${name}.png`, Buffer.from(result.data, "base64"));
  }
  const source = JSON.stringify(`data:image/png;base64,${result.data}`);
  return evaluate(`(async () => {
    const canvas = document.querySelector('.press-scene-canvas');
    const book = document.querySelector('.press-volume-book');
    if (!canvas || !book) {
      return { available: false, coverage: 0, groundCoverage: 0, contextLost: true };
    }
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return { available: false, coverage: 0, groundCoverage: 0, contextLost: true };
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
    // Sample an unobstructed upper-right patch as a visual companion to the
    // computed body colour. A transparent body reports correctly through CSS
    // but captures as the browser's white canvas — the regression this guards.
    const groundX = Math.min(bitmap.width - 1, 1220);
    const groundY = Math.min(bitmap.height - 1, 150);
    const groundWidth = Math.max(1, Math.min(84, bitmap.width - groundX));
    const groundHeight = Math.max(1, Math.min(84, bitmap.height - groundY));
    const groundPixels = context.getImageData(
      groundX,
      groundY,
      groundWidth,
      groundHeight
    ).data;
    let matchingGround = 0;
    for (let index = 0; index < groundPixels.length; index += 4) {
      const distance = Math.abs(groundPixels[index] - 32)
        + Math.abs(groundPixels[index + 1] - 24)
        + Math.abs(groundPixels[index + 2] - 25);
      if (groundPixels[index + 3] > 240 && distance <= 12) matchingGround += 1;
    }
    bitmap.close();
    return {
      available: true,
      coverage: painted / (width * height),
      groundCoverage: matchingGround / (groundWidth * groundHeight),
      contextLost: gl.isContextLost()
    };
  })()`);
};

await send("Page.enable");
await send("Runtime.enable");
// The scene only exposes `__pressDebug` when something opts in before it loads,
// so a visitor never gets it. Injected at document-start, which survives every
// navigation this gate makes without decorating any URL.
const debugOptIn = await send("Page.addScriptToEvaluateOnNewDocument", {
  source: "window.__pressDebugEnabled = true;"
});
// A headful Chrome window that is not frontmost has its animation frames
// throttled, which stalls every damped state this gate measures — held
// isolation, the caption, the return. Failures then land together in one run
// and vanish in the next, reporting the window manager rather than the scene.
await send("Emulation.setFocusEmulationEnabled", { enabled: true });
await send("Network.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });

const checks = [];
const check = (name, passed, details = undefined) => {
  checks.push({ name, passed: Boolean(passed), ...(details === undefined ? {} : { details }) });
};

try {
  const rootResponse = await fetch(new URL("/", catalogueUrl));
  const rootHtml = await rootResponse.text();
  check("the site root stays a lightweight access point", (
    rootResponse.ok
    && rootHtml.length < 10_000
    && rootHtml.includes('href="/press/"')
    && !rootHtml.includes("home-press-scene")
    && !rootHtml.includes("press-volume-list")
    && !rootHtml.includes("three.module")
  ), {
    status: rootResponse.status,
    bytes: rootHtml.length,
    linksPress: rootHtml.includes('href="/press/"')
  });

  const standaloneSpecs = [
    ["/refly/", 'class="evidence-shell"'],
    ["/arm/", 'id="viewport"'],
    ["/telemetry/", 'class="lab-shell"']
  ];
  const standalonePages = await Promise.all(standaloneSpecs.map(async ([path, marker]) => {
    const response = await fetch(new URL(path, catalogueUrl));
    const html = await response.text();
    return {
      path,
      status: response.status,
      marker: html.includes(marker),
      pressShell: html.includes("data-press-volumes") || html.includes("home-press-scene"),
      transitionShim: html.includes("press-transition")
    };
  }));
  check("project URLs remain standalone outside the Press namespace", (
    standalonePages.every((page) => (
      page.status === 200
      && page.marker
      && !page.pressShell
      && !page.transitionShim
    ))
  ), standalonePages);

  await setReducedMotion(false);
  await setViewport(1568, 894);
  await navigateHome();
  const desktop = await evaluate(`(() => ({
    books: document.querySelectorAll('.press-volume').length,
    canvases: document.querySelectorAll('.press-scene-canvas').length,
    caption: Boolean(document.querySelector('.press-hold-caption')),
    railDisplay: getComputedStyle(document.querySelector('.press-rail')).display,
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    rowRect: document.querySelector('.press-volume-item').getBoundingClientRect().toJSON(),
    linkRect: document.querySelector('.press-volume').getBoundingClientRect().toJSON(),
    bookRect: document.querySelector('.press-volume-book').getBoundingClientRect().toJSON(),
    bodyBackground: getComputedStyle(document.body).backgroundColor,
    cursor: getComputedStyle(document.querySelector('.press-volume')).cursor,
    catalogCursor: getComputedStyle(document.querySelector('.press-catalog')).cursor
  }))()`);
  const center = await firstBookCenter();
  check("desktop semantic books remain present", desktop.books === 5, desktop.books);
  check("one progressive WebGL canvas is mounted", desktop.canvases === 1, desktop.canvases);
  check("hold caption is mounted", desktop.caption);
  const terminalSurfaces = await evaluate(`({
    signature: Boolean(document.querySelector('.signature-section')),
    closing: Boolean(document.querySelector('.home-closing')),
    footer: Boolean(document.querySelector('.home-footer'))
  })`);
  check("desktop rail and terminal handoff remain present", (
    desktop.railDisplay !== "none"
    && terminalSurfaces.signature
    && terminalSurfaces.closing
    && terminalSurfaces.footer
  ), { railDisplay: desktop.railDisplay, ...terminalSurfaces });
  check("desktop first-book geometry is calibrated", (
    Math.abs(center.left - center.expectedLeft) <= 5
    && center.top >= 330 && center.top <= 340
    && center.width >= 724 && center.width <= 735
  ), center);
  // The row is sized in `vw`, which counts the scrollbar gutter, so it is
  // deliberately wider than the content box and overhangs it symmetrically.
  // That overhang is not reachable — `.home-page`'s `overflow-x: hidden`
  // propagates to the viewport and clips it, verified with `scrollTo` — so the
  // assertion is coverage of every pointer-reachable column, i.e. the client
  // width. Comparing against the viewport width only passed because the old
  // SwiftShader runs were launched with `--hide-scrollbars`.
  check("desktop book row owns the full pointer width", (
    desktop.rowRect.left <= 1
    && desktop.rowRect.right >= desktop.clientWidth - 1
    && desktop.linkRect.left <= 1
    && desktop.linkRect.right >= desktop.clientWidth - 1
    && desktop.bookRect.width >= 724
    && desktop.bookRect.width <= 735
  ), {
    clientWidth: desktop.clientWidth,
    scrollWidth: desktop.scrollWidth,
    rowRect: desktop.rowRect,
    linkRect: desktop.linkRect,
    bookRect: desktop.bookRect
  });
  check("catalogue uses pointer semantics without a grab cursor", (
    desktop.cursor === "pointer" && desktop.catalogCursor !== "grab"
  ), { cursor: desktop.cursor, catalogCursor: desktop.catalogCursor });
  await capture("desktop-base");

  const backgroundPoint = { x: 1220, y: 170 };
  const backgroundScrollBefore = await evaluate("window.scrollY");
  await mouse("mouseMoved", backgroundPoint.x, backgroundPoint.y);
  await mouse("mousePressed", backgroundPoint.x, backgroundPoint.y, 1);
  const backgroundDragEnd = await dragPointer(backgroundPoint, 0, 90);
  await mouse("mouseReleased", backgroundDragEnd.x, backgroundDragEnd.y, 0);
  await wait(180);
  const backgroundDrag = await evaluate(`({
    scrollY: window.scrollY,
    dragging: document.querySelector('.press-catalog').classList.contains('is-dragging')
  })`);
  check("background pointer drag does not synthesize scrolling", (
    Math.abs(backgroundDrag.scrollY - backgroundScrollBefore) <= 1
    && !backgroundDrag.dragging
  ), { before: backgroundScrollBefore, ...backgroundDrag });

  await wait(1000);
  const desktopIdle2250 = await screenshotBookCoverage("desktop-idle-2250");
  check("catalogue rests on the opaque Stripe Press ground", (
    desktop.bodyBackground === "rgb(32, 24, 25)"
    && desktopIdle2250.groundCoverage > SECTION_GROUND_COVERAGE_FLOOR
  ), {
    bodyBackground: desktop.bodyBackground,
    groundCoverage: Number(desktopIdle2250.groundCoverage.toFixed(5))
  });
  check("desktop canvas survives 2.25 seconds idle", (
    desktopIdle2250.available
    && !desktopIdle2250.contextLost
    && desktopIdle2250.coverage > 0.08
  ), desktopIdle2250);
  await wait(2750);
  const desktopIdle5000 = await screenshotBookCoverage("desktop-idle-5000");
  check("desktop canvas survives 5 seconds idle", (
    desktopIdle5000.available
    && !desktopIdle5000.contextLost
    && desktopIdle5000.coverage > 0.08
  ), desktopIdle5000);

  await mouse("mouseMoved", center.x, center.y);
  await wait(500);
  await capture("desktop-hover");
  await mouse("mousePressed", center.x, center.y, 1);
  await wait(90);
  await capture("desktop-stack-evacuating");
  // Held and evacuated are damped states, not instant ones. Sampling them on a
  // fixed delay made this check report the clock rather than the behaviour; the
  // negative assertion below is still read at the moment they settle.
  const heldSettled = await waitFor(`
    document.querySelector('.press-catalog').classList.contains('is-book-held')
    && document.querySelector('.press-catalog').classList.contains('is-stack-evacuated')
  `, 3000);
  const pressed = await evaluate(`({
    stage: document.querySelector('.press-catalog').classList.contains('is-book-held'),
    dragging: document.querySelector('.press-catalog').classList.contains('is-book-dragging'),
    body: document.body.classList.contains('press-book-held'),
    stackEvacuated: document.querySelector('.press-catalog').classList.contains('is-stack-evacuated'),
    cursor: getComputedStyle(document.querySelector('.press-volume')).cursor
  })`);
  check("pointer press evacuates the stack into held state", (
    heldSettled && pressed.stage && pressed.body && pressed.stackEvacuated && !pressed.dragging
  ), { heldSettled, ...pressed });
  check("held book retains the pointer cursor", pressed.cursor === "pointer", pressed.cursor);
  await capture("desktop-pressed");

  const dragEnd = await dragPointer(center, 140, -62);
  await wait(350);
  // The caption fades in and flips to whichever half the held volume leaves
  // free, so its box is only measurable once it has arrived.
  const captionSettled = await waitFor(`
    Number(getComputedStyle(document.querySelector('.press-hold-caption')).opacity) > 0.95
  `, 3000);
  await wait(120);
  const dragged = await evaluate(`({
    path: location.pathname,
    stage: document.querySelector('.press-catalog').classList.contains('is-book-dragging'),
    body: document.body.classList.contains('press-book-dragging'),
    captionOpacity: Number(getComputedStyle(document.querySelector('.press-hold-caption')).opacity),
    captionLines: document.querySelector('.press-hold-caption').getBoundingClientRect().height
  })`);
  check("drag crosses into 3D presentation state", dragged.stage && dragged.body, dragged);
  check("drag keeps the catalogue URL", dragged.path === cataloguePath, dragged.path);
  check("held-state caption is visible", (
    captionSettled && dragged.captionOpacity > 0.95 && dragged.captionLines > 90
  ), { captionSettled, ...dragged });
  await capture("desktop-dragged");

  await mouse("mouseReleased", dragEnd.x, dragEnd.y, 0);
  await wait(80);
  const releasedEarly = await evaluate(`({
    path: location.pathname,
    dragging: document.querySelector('.press-catalog').classList.contains('is-book-dragging'),
    held: document.querySelector('.press-catalog').classList.contains('is-book-held')
  })`);
  check("drag release suppresses navigation", releasedEarly.path === cataloguePath, releasedEarly.path);
  check("release starts a reverse state", !releasedEarly.dragging && releasedEarly.held, releasedEarly);
  await capture("desktop-release-80");
  await wait(820);
  const releasedLate = await evaluate(`({
    path: location.pathname,
    held: document.querySelector('.press-catalog').classList.contains('is-book-held'),
    dragging: document.querySelector('.press-catalog').classList.contains('is-book-dragging')
  })`);
  check("reverse animation settles back to catalogue", (
    releasedLate.path === cataloguePath && !releasedLate.held && !releasedLate.dragging
  ), releasedLate);
  await capture("desktop-release-900");

  const rowFlank = { x: 1320, y: center.y };
  await mouse("mouseMoved", rowFlank.x, rowFlank.y);
  await mouse("mousePressed", rowFlank.x, rowFlank.y, 1);
  await wait(120);
  const rowDragEnd = await dragPointer(rowFlank, 120, -48);
  await wait(220);
  const rowDragged = await evaluate(`({
    path: location.pathname,
    held: document.querySelector('.press-catalog').classList.contains('is-book-held'),
    dragging: document.querySelector('.press-catalog').classList.contains('is-book-dragging')
  })`);
  await capture("desktop-row-dragged");
  await mouse("mouseReleased", rowDragEnd.x, rowDragEnd.y, 0);
  await wait(80);
  const rowReleased = await evaluate(`({
    path: location.pathname,
    held: document.querySelector('.press-catalog').classList.contains('is-book-held'),
    dragging: document.querySelector('.press-catalog').classList.contains('is-book-dragging')
  })`);
  check("full-width pointer row controls the selected book", (
    rowDragged.path === cataloguePath && rowDragged.held && rowDragged.dragging
  ), rowDragged);
  check("full-width row drag suppresses navigation on release", (
    rowReleased.path === cataloguePath && rowReleased.held && !rowReleased.dragging
  ), rowReleased);
  await wait(820);

  await captureDragAngle("desktop-drag-left-up", -140, -62);
  await captureDragAngle("desktop-drag-right-down", 140, 82);
  await captureDragAngle("desktop-drag-up", 0, -180);
  await captureDragAngle("desktop-drag-down", 0, 170);
  await captureDragAngle("desktop-drag-orbit-up", 0, -350);
  await captureDragAngle("desktop-drag-orbit-reverse", 620, 0);

  const terminalPositions = await evaluate(`(() => {
    const catalogueMaximum = innerHeight * 0.213 * 4;
    const maximum = document.querySelector('main').scrollHeight - innerHeight;
    const terminalLength = maximum - catalogueMaximum;
    return {
      signature: catalogueMaximum + terminalLength * 0.3,
      closing: maximum
    };
  })()`);
  await evaluate(`window.scrollTo({ top: ${terminalPositions.signature}, behavior: 'instant' })`);
  await waitFor(`Number(getComputedStyle(document.querySelector('.signature-section')).opacity) > 0.92`, 5000);
  await capture("desktop-terminal-signature");
  await evaluate(`window.scrollTo({ top: ${terminalPositions.closing}, behavior: 'instant' })`);
  await waitFor(`
    document.body.classList.contains('press-terminal-closing')
    && Number(getComputedStyle(document.querySelector('.home-closing')).opacity) > 0.92
  `, 5000);
  await capture("desktop-terminal-closing");
  await evaluate("window.scrollTo({ top: 0, behavior: 'instant' })");
  await waitFor(`
    scrollY < 2
    && !document.body.classList.contains('press-terminal-active')
    && !document.querySelector('.press-volume-item').inert
  `, 5000);
  await wait(120);

  // Two-document checks. A book URL is a position in the *volumes* document, so
  // there is no route to open, no flight to time and no layer to assert. What
  // replaces them: scrolling the catalogue stays on the catalogue, a pick opens
  // the volumes and lands on one, the address follows the scroll only in there,
  // history is a mode switch and a scroll, and each section draws its volume.
  const sectionGeometry = () => evaluate(`(() => {
    const sections = Array.from(document.querySelectorAll('.press-volume-section'));
    return sections.map((section) => ({
      address: section.dataset.pressVolume,
      top: Math.round(section.getBoundingClientRect().top + scrollY),
      figure: (() => {
        const rect = section.querySelector('.press-volume-figure')?.getBoundingClientRect();
        return rect ? { width: Math.round(rect.width), height: Math.round(rect.height) } : null;
      })()
    }));
  })()`);

  // The rendered-silhouette check the contract has carried as missing: sample
  // the figure column out of a real frame and require the volume to be painted
  // there, measured against that section's own ground rather than the stage.
  // The same frame also samples a quiet strip at the right edge. Stripe gives
  // every product section its own opaque ground; a light/theme sheet or a
  // leaking neighbouring section therefore fails here even when the book is
  // otherwise visible.
  //
  // The book fills about .43 of the column, but a volume whose cover sits close
  // to its own ground colour reads lower — practice measures .20 where refly
  // measures .37. FIGURE_COVERAGE_FLOOR is set to separate a drawn volume from
  // an absent one (which measures ~0), not to police the silhouette's area.
  const figureCoverage = async (index, name) => {
    const result = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    if (screenshotDirectory) {
      await mkdir(screenshotDirectory, { recursive: true });
      await writeFile(`${screenshotDirectory}/${name}.png`, Buffer.from(result.data, "base64"));
    }
    const source = JSON.stringify(`data:image/png;base64,${result.data}`);
    return evaluate(`(async () => {
      const section = document.querySelectorAll('.press-volume-section')[${index}];
      const figure = section?.querySelector('.press-volume-figure');
      if (!figure) return { available: false, coverage: 0, groundCoverage: 0 };
      const blob = await fetch(${source}).then((response) => response.blob());
      const bitmap = await createImageBitmap(blob);
      const sample = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = sample.getContext('2d', { willReadFrequently: true });
      context.drawImage(bitmap, 0, 0);
      const rect = figure.getBoundingClientRect();
      const x = Math.max(0, Math.round(rect.left));
      const y = Math.max(0, Math.round(rect.top));
      const width = Math.max(1, Math.min(bitmap.width - x, Math.round(rect.width)));
      const height = Math.max(1, Math.min(bitmap.height - y, Math.round(rect.height)));
      const ground = getComputedStyle(section).backgroundColor;
      const colourSample = new OffscreenCanvas(1, 1);
      const colourContext = colourSample.getContext('2d', { willReadFrequently: true });
      colourContext.fillStyle = ground;
      colourContext.fillRect(0, 0, 1, 1);
      const [gr, gg, gb] = colourContext.getImageData(0, 0, 1, 1).data;
      const pixels = context.getImageData(x, y, width, height).data;
      let painted = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        const distance = Math.abs(pixels[index] - gr)
          + Math.abs(pixels[index + 1] - gg)
          + Math.abs(pixels[index + 2] - gb);
        if (pixels[index + 3] > 240 && distance > 24) painted += 1;
      }
      const groundX = Math.max(0, bitmap.width - 116);
      const groundY = Math.min(bitmap.height - 1, 132);
      const groundWidth = Math.max(1, Math.min(84, bitmap.width - groundX));
      const groundHeight = Math.max(1, Math.min(132, bitmap.height - groundY));
      const groundPixels = context.getImageData(
        groundX,
        groundY,
        groundWidth,
        groundHeight
      ).data;
      let matchingGround = 0;
      for (let index = 0; index < groundPixels.length; index += 4) {
        const distance = Math.abs(groundPixels[index] - gr)
          + Math.abs(groundPixels[index + 1] - gg)
          + Math.abs(groundPixels[index + 2] - gb);
        if (groundPixels[index + 3] > 240 && distance <= 12) matchingGround += 1;
      }
      bitmap.close();
      return {
        available: true,
        coverage: painted / (width * height),
        groundCoverage: matchingGround / (groundWidth * groundHeight)
      };
    })()`);
  };

  // The reference's catalogue is ~7 viewports whose address never changes
  // however far it is scrolled, and it contains no book sections at all. This
  // is the check the previous gate had backwards — it asserted the address
  // changing on a catalogue scroll.
  const catalogueHistory = await evaluate("history.length");
  const cataloguePaths = new Set();
  const catalogueEnd = await evaluate("document.documentElement.scrollHeight - innerHeight");
  for (let offset = 0; offset <= catalogueEnd; offset += 220) {
    await evaluate(`window.scrollTo({ top: ${offset}, behavior: 'instant' })`);
    await wait(90);
    cataloguePaths.add(await evaluate("location.pathname"));
  }
  const catalogueDrift = await evaluate("history.length") - catalogueHistory;
  const collapsed = await evaluate(`({
    display: getComputedStyle(document.querySelector('.press-volumes')).display,
    sectionHeight: Math.round(
      document.querySelector('.press-volume-section').getBoundingClientRect().height
    )
  })`);
  check("scrolling the catalogue never leaves the catalogue", (
    cataloguePaths.size === 1
    && cataloguePaths.has(cataloguePath)
    && catalogueDrift === 0
    && collapsed.display === "none"
    && collapsed.sectionHeight === 0
  ), { paths: [...cataloguePaths], catalogueDrift, ...collapsed, catalogueEnd });

  await evaluate("window.scrollTo({ top: 0, behavior: 'instant' })");
  await waitFor(`
    scrollY < 2
    && !document.body.classList.contains('press-terminal-active')
    && !document.querySelector('.press-volume-item').inert
  `, 5000);
  await wait(200);

  // A deliberate pick opens the volumes document and lands on its section, and
  // it pushes exactly one entry so Back can undo it. Scrolling never pushes.
  const clickCenter = await firstBookCenter();
  const rowClick = { x: 1320, y: clickCenter.y };
  await mouse("mouseMoved", rowClick.x, rowClick.y);
  await mouse("mousePressed", rowClick.x, rowClick.y, 1);
  await wait(40);
  await mouse("mouseReleased", rowClick.x, rowClick.y, 0);
  const picked = await waitFor(
    `location.pathname === ${JSON.stringify(volumePaths.refly)}`,
    8000
  );
  await wait(600);
  // Measured here, not before the pick: in the catalogue the sections are
  // collapsed and every one of them reports zero height at offset zero.
  const sections = await sectionGeometry();
  const pickState = await evaluate(`({
    path: location.pathname,
    scrollY: Math.round(scrollY),
    routeLayer: Boolean(document.querySelector('.press-route-layer')),
    pushedState: history.state?.pressVolume ?? null,
    volumesDisplay: getComputedStyle(document.querySelector('.press-volumes')).display
  })`);
  const reflyCoverage = await figureCoverage(0, "desktop-section-refly");
  check("a catalogue pick opens the volumes document on its section", (
    picked
    && pickState.path === volumePaths.refly
    && !pickState.routeLayer
    && pickState.pushedState === 0
    && pickState.volumesDisplay === "block"
    && Math.abs(pickState.scrollY - sections[0].top) < 4
    && reflyCoverage.coverage > FIGURE_COVERAGE_FLOOR
  ), { ...pickState, sectionTop: sections[0].top, coverage: Number(reflyCoverage.coverage.toFixed(5)) });

  check("the volumes document assembles five sections with a figure column", (
    sections.length === 5
    && sections.every((section) => section.figure && section.figure.height > 200)
    && sections.every((section, index) => index === 0 || section.top > sections[index - 1].top)
  ), sections);

  // Back closes the volumes document and restores the catalogue; Forward
  // reopens it on the same volume.
  await evaluate("history.back()");
  await wait(90);
  const browserBackFlight = await evaluate(`(() => {
    const book = window.__pressDebug().books[0];
    return {
      dx: Number(Math.abs(book.position.x - book.layout.x).toFixed(2)),
      dy: Number(Math.abs(book.position.y - book.layout.y).toFixed(2)),
      scale: book.scale
    };
  })()`);
  const backHome = await waitFor(`
    location.pathname === ${JSON.stringify(cataloguePath)}
    && scrollY < 4
    && getComputedStyle(document.querySelector('.press-volumes')).display === 'none'
  `, 6000);
  await wait(400);
  await evaluate("history.forward()");
  const forwardVolume = await waitFor(`
    location.pathname === ${JSON.stringify(volumePaths.refly)}
    && Math.abs(scrollY - ${sections[0].top}) < 4
    && getComputedStyle(document.querySelector('.press-volumes')).display === 'block'
  `, 6000);
  check("history moves the reader between the catalogue and the volume", (
    backHome && forwardVolume && (browserBackFlight.dx > 2 || browserBackFlight.dy > 2)
  ), { backHome, forwardVolume, browserBackFlight, path: await evaluate("location.pathname") });

  // Inside the volumes document the address follows the scroll: each section
  // owns it while it holds the middle of the viewport, and none of that may push
  // a history entry.
  const historyBeforeScroll = await evaluate("history.length");
  const addressTrail = [];
  const sectionCoverage = [];
  const sectionGroundCoverage = [];
  const sectionSettled = [];
  for (let index = 0; index < sections.length; index += 1) {
    const expectedPath = new URL(sections[index].address, "http://x").pathname;
    await evaluate(`window.scrollTo({ top: ${sections[index].top + 200}, behavior: 'instant' })`);
    const settled = await waitFor(`(() => {
      const debug = window.__pressDebug?.();
      const book = debug?.books?.[${index}];
      return location.pathname === ${JSON.stringify(expectedPath)}
        && debug?.currentIndex === ${index}
        && book?.visible
        && book.sectionWeight > 0.99
        && Math.abs(book.position.x - book.layout.x) < 1.5
        && Math.abs(book.position.y - book.layout.y) < 1.5
        && Math.abs(book.scale - book.layoutScale) < 0.015;
    })()`, 6000);
    sectionSettled.push(settled);
    await wait(120);
    addressTrail.push(await evaluate("location.pathname"));
    const coverage = await figureCoverage(index, `desktop-section-${sections[index].address.replace(/\//g, "")}`);
    sectionCoverage.push(Number(coverage.coverage.toFixed(5)));
    sectionGroundCoverage.push(Number(coverage.groundCoverage.toFixed(5)));
  }
  // The top of the volumes document is the first volume, not the catalogue —
  // the catalogue is not in this document to scroll back into.
  await evaluate("window.scrollTo({ top: 0, behavior: 'instant' })");
  await wait(400);
  addressTrail.push(await evaluate("location.pathname"));
  const scrollHistoryDelta = await evaluate("history.length") - historyBeforeScroll;
  check("the address follows the scroll without pushing history", (
    addressTrail.join(" ") === sections.map((section) => section.address).concat(volumePaths.refly).join(" ")
    && scrollHistoryDelta === 0
  ), { addressTrail, scrollHistoryDelta });

  check("every section draws its own volume", (
    sectionCoverage.length === 5
    && sectionSettled.every(Boolean)
    && sectionCoverage.every((coverage) => coverage > FIGURE_COVERAGE_FLOOR)
  ), { sectionCoverage, sectionSettled });

  check("every section owns an opaque full-width ground", (
    sectionGroundCoverage.length === 5
    && sectionGroundCoverage.every((coverage) => coverage > SECTION_GROUND_COVERAGE_FLOOR)
  ), sectionGroundCoverage);

  // The pinned hero keeps its anchors' on-screen bounds while a section covers
  // it, so "invisible" is not enough — the shelf has to leave the tab order too.
  await evaluate(`window.scrollTo({ top: ${sections[1].top + 200}, behavior: 'instant' })`);
  await waitFor(`location.pathname === ${JSON.stringify(volumePaths.arm)}`, 4000);
  await wait(400);
  const covered = await evaluate(`(() => {
    document.body.focus();
    return {
      itemsInert: Array.from(document.querySelectorAll('.press-volume-item')).map((item) => item.inert),
      railVisibility: getComputedStyle(document.querySelector('.press-rail')).visibility,
      railPointer: getComputedStyle(document.querySelector('.press-rail')).pointerEvents,
      backDisplay: getComputedStyle(document.querySelector('.press-back')).display,
      helpVisibility: getComputedStyle(document.querySelector('.press-help')).visibility,
      cataloguePointer: getComputedStyle(document.querySelector('.press-catalog')).pointerEvents
    };
  })()`);
  const tabTrail = [];
  for (let step = 0; step < 6; step += 1) {
    for (const type of ["rawKeyDown", "keyUp"]) {
      await send("Input.dispatchKeyEvent", {
        type, key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9
      });
    }
    await wait(90);
    tabTrail.push(await evaluate(`(() => {
      const active = document.activeElement;
      return {
        label: active?.getAttribute('aria-label') || active?.textContent?.trim().slice(0, 28) || active?.tagName,
        onShelf: Boolean(active?.closest('.press-volume-list'))
      };
    })()`));
  }
  // The rail and the help marker stay reachable — the reference keeps its index
  // and its "?" on screen inside a book — so what has to leave is the covered
  // shelf itself: five book links a reader would tab through without ever
  // seeing them.
  check("the covered catalogue leaves the tab order", (
    covered.itemsInert.every(Boolean)
    && covered.railVisibility === "visible"
    && covered.railPointer === "auto"
    && covered.backDisplay === "block"
    && covered.helpVisibility === "visible"
    && covered.cataloguePointer === "none"
    && tabTrail.every((stop) => !stop.onShelf)
  ), { ...covered, tabTrail: tabTrail.map((stop) => stop.label) });

  // The rail works from inside a volume too, which is the reference's own
  // arrangement — its index stays in the left margin of a book page.
  await evaluate(`window.scrollTo({ top: ${sections[0].top}, behavior: 'instant' })`);
  await wait(400);
  const liveRailPoint = await evaluate(`(() => {
    const button = document.querySelectorAll('.press-rail-item')[3];
    const rect = button.getBoundingClientRect();
    const x = Math.round(rect.left + Math.min(8, rect.width / 2));
    const y = Math.round(rect.top + rect.height / 2);
    return {
      x, y,
      hit: document.elementFromPoint(x, y)?.closest('.press-rail-item') === button
    };
  })()`);
  await mouse("mouseMoved", liveRailPoint.x, liveRailPoint.y);
  await mouse("mousePressed", liveRailPoint.x, liveRailPoint.y, 1);
  await mouse("mouseReleased", liveRailPoint.x, liveRailPoint.y, 0);
  const railInVolumes = await waitFor(`
    location.pathname === ${JSON.stringify(volumePaths.practice)}
    && Math.abs(scrollY - ${sections[3].top}) < 4
  `, 8000);
  // Hovering the rail previews the *shelf*: it scrims the stage and dims the
  // canvas to .28. There is no shelf to preview inside a volume, and the scrim is
  // `position: fixed`, so an unguarded preview drops 72% black over the section
  // the reader is on.
  const railPreview = await evaluate(`(() => {
    document.querySelectorAll('.press-rail-item')[2]
      .dispatchEvent(new PointerEvent('pointerenter', { bubbles: false }));
    return {
      scrim: Number(getComputedStyle(document.querySelector('.press-index-scrim')).opacity),
      canvas: Number(getComputedStyle(document.querySelector('.press-scene-canvas')).opacity),
      preview: document.querySelector('.press-catalog').classList.contains('is-index-preview')
    };
  })()`);
  check("the rail moves between volumes without leaving the volumes document", (
    railInVolumes
    && liveRailPoint.hit
    && await evaluate("getComputedStyle(document.querySelector('.press-volumes')).display") === "block"
    && railPreview.scrim === 0
    && railPreview.canvas === 1
    && !railPreview.preview
  ), {
    railInVolumes,
    liveRailPoint,
    path: await evaluate("location.pathname"),
    scrollY: await evaluate("Math.round(scrollY)"),
    ...railPreview
  });

  // The volume in a section is a live object, not a picture of one. Rates are
  // the reference's: .00015 rad/px following the pointer, .003 dragging,
  // .0008 per pixel scrolled, and a release throws it.
  const liveRotation = () => evaluate(
    "Number(window.__pressDebug().books[window.__pressDebug().currentIndex].rotationY.toFixed(4))"
  );
  await evaluate(`window.scrollTo({ top: ${sections[3].top}, behavior: 'instant' })`);
  await wait(600);
  const restRotation = await liveRotation();
  await mouse("mouseMoved", 220, 200);
  await wait(320);
  const followLeft = await liveRotation();
  await mouse("mouseMoved", 1340, 780);
  await wait(320);
  const followRight = await liveRotation();
  check("the volume follows the pointer", (
    followLeft < restRotation
    && followRight > restRotation
    && Math.abs(followRight - followLeft) > 0.05
    && Math.abs(followRight - followLeft) < 0.6
  ), { restRotation, followLeft, followRight });

  const figureCentre = await evaluate(`(() => {
    const rect = document.querySelectorAll('.press-volume-figure')[3].getBoundingClientRect();
    return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
  })()`);
  await mouse("mouseMoved", figureCentre.x, figureCentre.y);
  await wait(200);
  const beforeDrag = await liveRotation();
  await mouse("mousePressed", figureCentre.x, figureCentre.y, 1);
  for (let step = 1; step <= 6; step += 1) {
    await mouse("mouseMoved", figureCentre.x + step * 30, figureCentre.y, 1);
    await wait(50);
  }
  await wait(150);
  const coverDragged = await liveRotation();
  const centrePivot = await evaluate(`(() => {
    const book = window.__pressDebug().books[window.__pressDebug().currentIndex];
    return {
      dx: Number(Math.abs(book.position.x - book.layout.x).toFixed(3)),
      dy: Number(Math.abs(book.position.y - book.layout.y).toFixed(3))
    };
  })()`);
  const dragCursor = await evaluate("getComputedStyle(document.body).cursor");
  await mouse("mouseReleased", figureCentre.x + 180, figureCentre.y, 0);
  await wait(140);
  const thrown = await liveRotation();
  await waitFor("window.__pressDebug().cover.twirl === 0", 4000);
  const coverSettled = await liveRotation();
  check("the volume is draggable and a release throws it", (
    coverDragged - beforeDrag > 0.35
    && centrePivot.dx < 0.01
    && centrePivot.dy < 0.01
    && dragCursor === "grabbing"
    && thrown > coverDragged
    && coverSettled >= thrown
    && await evaluate("getComputedStyle(document.body).cursor") !== "grabbing"
  ), { beforeDrag, coverDragged, centrePivot, thrown, coverSettled, dragCursor });

  // Scrolling the section turns it: .0008 rad per pixel read past its top.
  const beforeScrollTurn = await liveRotation();
  await evaluate(`window.scrollTo({ top: ${sections[3].top + 500}, behavior: 'instant' })`);
  await wait(500);
  const afterScrollTurn = await liveRotation();
  check("scrolling a section turns its volume", (
    Math.abs((afterScrollTurn - beforeScrollTurn) - 0.4) < 0.12
  ), { beforeScrollTurn, afterScrollTurn, delta: Number((afterScrollTurn - beforeScrollTurn).toFixed(4)) });

  // Arrow keys step between volumes, as the reference's handler does, and stop
  // at the ends rather than wrapping.
  const arrowStart = await evaluate("window.__pressDebug().currentIndex");
  const pressKey = async (key, code) => {
    for (const type of ["rawKeyDown", "keyUp"]) {
      await send("Input.dispatchKeyEvent", { type, key, code, windowsVirtualKeyCode: key === "ArrowDown" ? 40 : 38, nativeVirtualKeyCode: key === "ArrowDown" ? 40 : 38 });
    }
    await wait(600);
  };
  await pressKey("ArrowDown", "ArrowDown");
  const afterDown = await evaluate("location.pathname");
  await pressKey("ArrowUp", "ArrowUp");
  const afterUp = await evaluate("location.pathname");
  await evaluate(`window.scrollTo({ top: ${sections[4].top}, behavior: 'instant' })`);
  await wait(500);
  await pressKey("ArrowDown", "ArrowDown");
  const atEnd = await evaluate("location.pathname");
  check("arrow keys step between volumes and stop at the ends", (
    afterDown === volumePaths["field-notes"]
    && afterUp === volumePaths.practice
    && atEnd === volumePaths["field-notes"]
  ), { arrowStart, afterDown, afterUp, atEnd });

  await evaluate(`window.scrollTo({ top: ${sections[3].top}, behavior: 'instant' })`);
  await waitFor(`location.pathname === ${JSON.stringify(volumePaths.practice)}`, 4000);
  await wait(400);

  // The fixed side control is the product-list exit. It uses the same damped
  // homeward pose as Escape and lands on the active book's shelf slot instead
  // of merely walking to the preceding volume in browser history.
  const backPoint = await evaluate(`(() => {
    const button = document.querySelector('.press-back');
    const rect = button.getBoundingClientRect();
    const x = Math.round(rect.left + rect.width / 2);
    const y = Math.round(rect.top + rect.height / 2);
    return {
      x, y,
      hit: document.elementFromPoint(x, y)?.closest('.press-back') === button
    };
  })()`);
  await mouse("mouseMoved", backPoint.x, backPoint.y);
  await mouse("mousePressed", backPoint.x, backPoint.y, 1);
  await mouse("mouseReleased", backPoint.x, backPoint.y, 0);
  const escaped = await waitFor(
    `location.pathname === ${JSON.stringify(cataloguePath)}`,
    5000
  );
  await wait(900);
  const escapeState = await evaluate(`({
    path: location.pathname,
    mode: window.__pressDebug().mode,
    scrollY: Math.round(scrollY),
    slot: Math.round(innerHeight * 0.213 * 3),
    volumesDisplay: getComputedStyle(document.querySelector('.press-volumes')).display,
    backDisplay: getComputedStyle(document.querySelector('.press-back')).display
  })`);
  check("sidebar back returns the volume to the shelf, on its own slot", (
    escaped
    && backPoint.hit
    && escapeState.mode === "catalogue"
    && escapeState.volumesDisplay === "none"
    && escapeState.backDisplay === "none"
    && Math.abs(escapeState.scrollY - escapeState.slot) < 6
  ), { ...escapeState, backPoint });

  // From the catalogue it is a pick like any other, and Back undoes it. Back
  // until the catalogue is reached rather than a fixed number of times: how many
  // entries the volumes document put behind us depends on where the scroll went.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (await evaluate(`location.pathname === ${JSON.stringify(cataloguePath)}`)) break;
    await evaluate("history.back()");
    await wait(700);
  }
  const reachedCatalogue = await waitFor(
    `location.pathname === ${JSON.stringify(cataloguePath)}`,
    4000
  );
  if (!reachedCatalogue) throw new Error("Back did not reach the catalogue");
  const railTargets = [];
  const railReturns = [];
  for (let index = 1; index < 5; index += 1) {
    // From a different catalogue offset each time, so the Back below is a real
    // restoration rather than a return to the top of the document.
    const leftAt = index * 90;
    await evaluate(`window.scrollTo({ top: ${leftAt}, behavior: 'instant' })`);
    await wait(200);
    await evaluate(`document.querySelectorAll('.press-rail-item')[${index}].click()`);
    const arrived = await waitFor(`
      location.pathname === '${new URL(sections[index].address, "http://x").pathname}'
      && Math.abs(scrollY - ${sections[index].top}) < 4
    `, 8000);
    await wait(400);
    railTargets.push({
      index,
      arrived,
      path: await evaluate("location.pathname"),
      expected: new URL(sections[index].address, "http://x").pathname,
      scrollY: await evaluate("Math.round(scrollY)"),
      expectedScrollY: sections[index].top
    });
    await evaluate("history.back()");
    await waitFor(`location.pathname === ${JSON.stringify(cataloguePath)}`, 6000);
    await wait(300);
    railReturns.push({ leftAt, returnedTo: await evaluate("Math.round(scrollY)") });
  }
  check("the rail reaches every volume", railTargets.every((target) => (
    target.arrived
    && target.path === target.expected
    && Math.abs(target.scrollY - target.expectedScrollY) < 4
  )), railTargets);

  // Back does not merely close the volumes: it puts the catalogue back where the
  // reader left it, which is what the reference does too — a pick made at
  // scrollY 762 returns to scrollY 762, not to the top.
  check("back restores the catalogue where the reader left it", railReturns.every(
    (entry) => Math.abs(entry.returnedTo - entry.leftAt) < 4
  ), railReturns);

  await evaluate("window.scrollTo({ top: 0, behavior: 'instant' })");
  await waitFor("scrollY < 2", 4000);
  await wait(200);

  // A deep link opens the volumes document at scroll 0 and lands on its section
  // once there are frames to measure against, so every address it writes in
  // between is visible in the address bar. Recorded from inside the page: a
  // sample taken after it settles cannot see a brief flip through another
  // volume address.
  const deepLinkUrl = new URL("field-notes/", catalogueUrl).href;
  const recorder = await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      window.__addressTrail = [];
      const stamp = () => window.__addressTrail.push(location.pathname);
      const replace = history.replaceState.bind(history);
      const push = history.pushState.bind(history);
      history.replaceState = (state, title, target) => { const r = replace(state, title, target); stamp(); return r; };
      history.pushState = (state, title, target) => { const r = push(state, title, target); stamp(); return r; };
      stamp();
    `
  });
  const deepOrigin = await evaluate("performance.timeOrigin");
  await send("Page.navigate", { url: deepLinkUrl });
  await waitFor(`performance.timeOrigin !== ${deepOrigin}`, 15000);
  await waitFor("document.documentElement.classList.contains('press-scene-ready')", 15000);
  await wait(2200);
  await send("Page.removeScriptToEvaluateOnNewDocument", { identifier: recorder.identifier });
  const deepTrail = await evaluate("JSON.stringify(window.__addressTrail || [])").then(JSON.parse);
  const deepState = await evaluate(`({
    path: location.pathname,
    scrollY: Math.round(scrollY),
    sectionTop: Math.round(
      document.querySelectorAll('.press-volume-section')[4].getBoundingClientRect().top
    ),
    volumesDisplay: getComputedStyle(document.querySelector('.press-volumes')).display
  })`);
  check("a deep link lands on its volume without claiming another address", (
    deepTrail.every((path) => path === volumePaths["field-notes"])
    && deepState.path === volumePaths["field-notes"]
    && deepState.volumesDisplay === "block"
    && Math.abs(deepState.sectionTop) < 4
  ), { deepTrail, ...deepState });

  await navigateHome();

  await setReducedMotion(true);
  await setViewport(1568, 894);
  await navigateHome();
  const reducedCenter = await firstBookCenter();
  await mouse("mouseMoved", reducedCenter.x, reducedCenter.y);
  await mouse("mousePressed", reducedCenter.x, reducedCenter.y, 1);
  await mouse("mouseMoved", reducedCenter.x + 90, reducedCenter.y - 40, 1);
  await wait(120);
  const reduced = await evaluate(`({
    held: document.querySelector('.press-catalog').classList.contains('is-book-held'),
    dragging: document.querySelector('.press-catalog').classList.contains('is-book-dragging'),
    mainHeight: document.querySelector('main').getBoundingClientRect().height
  })`);
  await mouse("mouseReleased", reducedCenter.x + 90, reducedCenter.y - 40, 0);
  check("reduced motion disables hold choreography", !reduced.held && !reduced.dragging, reduced);
  await navigateHome();
  // Under reduced motion the hero cannot stay pinned, so the sections are plain
  // document: the figure column is dropped and no volume is posed into it. A
  // pick still opens the volumes document and lands on the section.
  const reducedCollapsed = await evaluate(
    "getComputedStyle(document.querySelector('.press-volumes')).display"
  );
  await evaluate("document.querySelector('.press-volume').click()");
  const reducedPick = await waitFor(
    `location.pathname === ${JSON.stringify(volumePaths.refly)}`,
    8000
  );
  await wait(400);
  const reducedSections = await evaluate(`(() => {
    const section = document.querySelector('.press-volume-section');
    const figure = section?.querySelector('.press-volume-figure');
    return {
      sections: document.querySelectorAll('.press-volume-section').length,
      figureDisplay: figure ? getComputedStyle(figure).display : 'missing',
      routeLayer: Boolean(document.querySelector('.press-route-layer')),
      volumesDisplay: getComputedStyle(document.querySelector('.press-volumes')).display,
      sectionTop: Math.round(section.getBoundingClientRect().top)
    };
  })()`);
  check("reduced motion removes the long scroll journey and keeps the volumes readable", (
    reduced.mainHeight <= 900
    && reducedCollapsed === "none"
    && reducedPick
    && reducedSections.sections === 5
    && reducedSections.figureDisplay === "none"
    && !reducedSections.routeLayer
    && reducedSections.volumesDisplay === "block"
    && Math.abs(reducedSections.sectionTop) < 4
  ), { mainHeight: reduced.mainHeight, reducedCollapsed, reducedPick, ...reducedSections });

  await setReducedMotion(false);
  await setViewport(390, 844);
  await navigateHome();
  await wait(3750);
  const compactIdle5000 = await screenshotBookCoverage("compact-idle-5000");
  check("compact canvas survives 5 seconds idle", (
    compactIdle5000.available
    && !compactIdle5000.contextLost
    && compactIdle5000.coverage > 0.08
  ), compactIdle5000);
  const compactCenter = await firstBookCenter();
  await mouse("mouseMoved", compactCenter.x, compactCenter.y);
  await mouse("mousePressed", compactCenter.x, compactCenter.y, 1);
  await mouse("mouseMoved", compactCenter.x + 70, compactCenter.y - 30, 1);
  await wait(120);
  const compact = await evaluate(`({
    held: document.querySelector('.press-catalog').classList.contains('is-book-held'),
    dragging: document.querySelector('.press-catalog').classList.contains('is-book-dragging'),
    railDisplay: getComputedStyle(document.querySelector('.press-rail')).display,
    captionDisplay: getComputedStyle(document.querySelector('.press-hold-caption')).display,
    mainHeight: document.querySelector('main').getBoundingClientRect().height,
    volumeHeight: document.querySelector('.press-volume-item').getBoundingClientRect().height,
    firstTop: document.querySelectorAll('.press-volume-item')[0].getBoundingClientRect().top,
    secondTop: document.querySelectorAll('.press-volume-item')[1].getBoundingClientRect().top,
    visibleBooks: Array.from(document.querySelectorAll('.press-volume-item')).filter((item) => {
      const rect = item.getBoundingClientRect();
      return rect.bottom > 0 && rect.top < innerHeight;
    }).length
  })`);
  await mouse("mouseReleased", compactCenter.x + 70, compactCenter.y - 30, 0);
  check("compact layout disables pointer-hold choreography", !compact.held && !compact.dragging, compact);
  await navigateHome();
  check("compact layout keeps an oversized scrolling catalogue", (
    compact.mainHeight >= 1500
    && compact.volumeHeight >= 180
    && compact.firstTop >= 270 && compact.firstTop <= 292
    && compact.secondTop >= 468 && compact.secondTop <= 490
    && compact.visibleBooks === 3
  ), compact);
  await evaluate("window.scrollTo({ top: innerHeight * 0.45, behavior: 'instant' })");
  await wait(240);
  const compactScrollIndex = await evaluate(`Array.from(document.querySelectorAll('.press-rail-item'))
    .findIndex((item) => item.getAttribute('aria-current') === 'true')`);
  check("compact scroll advances the genuine catalogue", compactScrollIndex === 2, compactScrollIndex);
  await capture("compact-scroll-mid");
  await evaluate("window.scrollTo({ top: 0, behavior: 'instant' })");
  await wait(180);
  await navigateHome();
  // Compact: a pick is the same scroll, into the single-column figure the
  // compact stage lays out for it.
  await evaluate("document.querySelector('.press-volume').click()");
  const compactPicked = await waitFor(
    `location.pathname === ${JSON.stringify(volumePaths.refly)}`,
    15000
  );
  await wait(900);
  const compactSection = await evaluate(`(() => {
    const section = document.querySelector('.press-volume-section');
    const figure = section?.querySelector('.press-volume-figure');
    const rect = figure?.getBoundingClientRect();
    return {
      path: location.pathname,
      routeLayer: Boolean(document.querySelector('.press-route-layer')),
      sectionTop: Math.round(section.getBoundingClientRect().top),
      figureWidth: Math.round(rect?.width || 0),
      figureHeight: Math.round(rect?.height || 0),
      stageColumns: getComputedStyle(document.querySelector('.press-volume-stage')).gridTemplateColumns
    };
  })()`);
  const compactCoverage = await figureCoverage(0, "compact-section-refly");
  await capture("compact-volume-section");
  check("a compact pick scrolls to the volume's single-column section", (
    compact.railDisplay === "none" && compact.captionDisplay === "none"
    && compactPicked
    && !compactSection.routeLayer
    && Math.abs(compactSection.sectionTop) < 4
    && compactSection.figureWidth >= 340
    && compactSection.stageColumns.split(" ").length === 1
    && compactCoverage.coverage > FIGURE_COVERAGE_FLOOR
  ), { ...compact, compactPicked, ...compactSection, coverage: Number(compactCoverage.coverage.toFixed(5)) });

  // The debug hook is opt-in. Drop the opt-in, reload, and confirm a visitor
  // gets no hook at all — otherwise "gated" is a claim rather than a fact.
  await send("Page.removeScriptToEvaluateOnNewDocument", { identifier: debugOptIn.identifier });
  await navigateHome();
  const hookForVisitors = await evaluate("typeof window.__pressDebug");
  check("the debug hook is absent without an explicit opt-in", (
    hookForVisitors === "undefined"
  ), { hookForVisitors });

  check("no page runtime errors were emitted", runtimeErrors.length === 0, runtimeErrors);
} finally {
  await setReducedMotion(false);
  await setViewport(1568, 894);
  socket.close();
}

const failures = checks.filter((item) => !item.passed);
console.log(JSON.stringify({
  result: failures.length ? "FAIL" : "PASS",
  checks,
  runtimeErrors
}, null, 2));
if (failures.length) Deno.exit(1);
