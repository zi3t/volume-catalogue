/**
 * Records the Press catalogue's real-time first load through Chrome's CDP
 * screencast stream. Run this only against the headful real-GPU harness from
 * docs/real-gpu-harness.md; the script refuses software renderers.
 *
 * Usage:
 *   npm run record:first-load -- 9226 http://127.0.0.1:4173/press/ /tmp/zi3t-press-first-load.mp4
 */

import { basename, dirname, extname, join } from "node:path";
import { connect } from "./cdp.mjs";

const [
  port = "9226",
  url = "http://127.0.0.1:4173/press/",
  outputPath = "/tmp/zi3t-press-first-load.mp4"
] = Deno.args;

if (extname(outputPath).toLowerCase() !== ".mp4") {
  throw new Error("The first-load recording output must end in .mp4");
}

const outputDirectory = dirname(outputPath);
const recordingName = basename(outputPath, extname(outputPath));
const frameDirectory = join(outputDirectory, `${recordingName}-frames`);
const manifestPath = join(outputDirectory, `${recordingName}.json`);
const frameListPath = join(frameDirectory, "frames.ffconcat");
const cdp = await connect(port);
const renderer = await cdp.requireHardwareGpu();
const frames = [];

const removeScreencastListener = cdp.on((payload) => {
  if (payload.method !== "Page.screencastFrame") return;
  frames.push({
    data: payload.params.data,
    timestamp: payload.params.metadata?.timestamp ?? null
  });
  void cdp.send("Page.screencastFrameAck", {
    sessionId: payload.params.sessionId
  });
});

try {
  await Deno.mkdir(frameDirectory, { recursive: true });
  await cdp.send("Network.clearBrowserCache");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: 92,
    maxWidth: 1568,
    maxHeight: 894,
    everyNthFrame: 1
  });

  await cdp.navigate(url);
  const sceneReady = await cdp.waitFor(
    "document.documentElement.classList.contains('press-scene-ready')",
    20000
  );
  if (!sceneReady) throw new Error("Press WebGL scene did not become ready");
  const sceneReadyObserved = await cdp.evaluate("performance.now()");
  const entered = await cdp.waitFor(
    "document.documentElement.classList.contains('press-entry-complete')",
    20000
  );
  if (!entered) throw new Error("Press first-load entry did not complete");
  const entryCompleteObserved = await cdp.evaluate("performance.now()");
  await cdp.sleep(1800);
  await cdp.send("Page.stopScreencast");
  await cdp.sleep(200);

  if (frames.length < 5) {
    throw new Error(`Only ${frames.length} screencast frames were captured`);
  }

  const fileNames = frames.map((_, index) => `frame-${String(index).padStart(4, "0")}.jpg`);
  await Promise.all(frames.map((frame, index) => Deno.writeFile(
    join(frameDirectory, fileNames[index]),
    Uint8Array.from(atob(frame.data), (character) => character.charCodeAt(0))
  )));

  const frameDurations = frames.map((frame, index) => {
    const nextTimestamp = frames[index + 1]?.timestamp;
    if (frame.timestamp === null || nextTimestamp === null || nextTimestamp === undefined) {
      return 1 / 30;
    }
    return Math.min(0.25, Math.max(1 / 120, nextTimestamp - frame.timestamp));
  });
  const concatLines = ["ffconcat version 1.0"];
  fileNames.forEach((fileName, index) => {
    concatLines.push(`file '${fileName}'`);
    concatLines.push(`duration ${frameDurations[index].toFixed(6)}`);
  });
  concatLines.push(`file '${fileNames.at(-1)}'`);
  await Deno.writeTextFile(frameListPath, `${concatLines.join("\n")}\n`);

  const timings = await cdp.evaluate(`(() => ({
    firstPaint: performance.getEntriesByName('first-paint')[0]?.startTime ?? null,
    firstContentfulPaint: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null
  }))()`);
  timings.sceneReadyObserved = sceneReadyObserved;
  timings.entryCompleteObserved = entryCompleteObserved;
  const manifest = {
    capturedAt: new Date().toISOString(),
    url,
    renderer,
    viewport: { width: 1568, height: 894 },
    frames: frames.length,
    durationMs: Math.round(frameDurations.reduce((sum, duration) => sum + duration, 0) * 1000),
    timings
  };
  await Deno.writeTextFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const encoded = await new Deno.Command("ffmpeg", {
    cwd: frameDirectory,
    args: [
      "-hide_banner",
      "-loglevel", "error",
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", basename(frameListPath),
      "-vsync", "vfr",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      outputPath
    ],
    stdout: "piped",
    stderr: "piped"
  }).output();
  if (!encoded.success) {
    throw new Error(new TextDecoder().decode(encoded.stderr).trim() || "ffmpeg failed");
  }

  console.log(JSON.stringify({ outputPath, manifestPath, ...manifest }, null, 2));
  if (cdp.errors.length) {
    throw new Error(`Runtime errors during first load: ${cdp.errors.join(" | ")}`);
  }
} finally {
  removeScreencastListener();
  await cdp.send("Page.stopScreencast").catch(() => {});
  await cdp.close();
}
