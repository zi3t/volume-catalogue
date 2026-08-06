import { connect } from "./cdp.mjs";

const [
  port = "9226",
  url = "http://127.0.0.1:4173/press/?press-renderer=clean-room",
  screenshotPath = ""
] = Deno.args;

const cdp = await connect(port, { width: 1568, height: 894 });
const checks = [];
const check = (name, passed, details = undefined) => {
  checks.push({ name, passed: Boolean(passed), ...(details === undefined ? {} : { details }) });
};

try {
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: "window.__pressDebugEnabled = true;"
  });
  await cdp.navigate(url);

  const ready = await cdp.waitFor(`(
    document.documentElement.dataset.pressRenderer === "clean-room"
    && document.documentElement.classList.contains("press-scene-ready")
    && Number.parseFloat(
      getComputedStyle(document.querySelector("canvas.press-scene-canvas"))?.opacity || "0"
    ) > 0.99
  )`, 15_000);
  check("the opt-in clean-room renderer reaches its settled presentation", ready);

  const artworkReady = await cdp.waitFor(`(
    performance.getEntriesByType("resource").filter((entry) => (
      entry.name.includes("-volume-") && entry.name.endsWith(".svg")
    )).length >= 5
  )`, 10_000);
  check("all five independently authored cover artworks load", artworkReady);

  const gpu = await cdp.requireHardwareGpu();
  check("the smoke gate is running on hardware WebGL", !gpu.software, gpu);

  const state = await cdp.evaluate(`(() => ({
    marker: document.documentElement.dataset.pressRenderer,
    canvases: document.querySelectorAll("canvas.press-scene-canvas").length,
    debug: window.__pressCleanRoomDebug?.()
  }))()`);
  const slugs = state.debug?.books?.map((book) => book.slug) ?? [];
  check("one canvas owns the scene", state.canvases === 1, state.canvases);
  check(
    "the scene contains the five ZI3T volumes in source order",
    JSON.stringify(slugs) === JSON.stringify([
      "refly",
      "arm",
      "telemetry",
      "practice",
      "field-notes"
    ]),
    slugs
  );
  check(
    "the clean-room renderer submits real geometry",
    state.debug?.render?.calls > 0 && state.debug?.render?.triangles > 0,
    state.debug?.render
  );
  check("the runtime reports no browser errors", cdp.errors.length === 0, cdp.errors);

  if (screenshotPath) await cdp.screenshot(screenshotPath);

  const failed = checks.filter((entry) => !entry.passed);
  console.log(JSON.stringify({ gpu, state, checks }, null, 2));
  if (failed.length) {
    throw new Error(`${failed.length} clean-room foundation check(s) failed`);
  }
} finally {
  await cdp.close();
}
