/**
 * Hardware-GPU performance profile for the Worker-composed Press scene.
 *
 * Launch Wrangler and a headful Chrome first (docs/real-gpu-harness.md), then:
 *
 *   npm run profile -- --port=9226 --url=http://127.0.0.1:4173/press/ \
 *     --output=/tmp/zi3t-press-profile.json
 *
 * The trace separates visible entry work, a settled idle window, and sustained
 * scrolling. Screenshot cadence is deliberately absent: captures block and do
 * not form a trustworthy animation timeline.
 */
import { writeFile } from "node:fs/promises";
import { connect } from "./cdp.mjs";

const options = Object.fromEntries(Deno.args.map((argument) => {
  const [key, ...parts] = argument.replace(/^--/, "").split("=");
  return [key, parts.join("=") || true];
}));
const port = String(options.port || "9226");
const url = String(options.url || "http://127.0.0.1:4173/press/");
const output = options.output ? String(options.output) : "";
const IDLE_WINDOW_MS = 5_000;
const TRACE_CATEGORIES = [
  "blink.user_timing",
  "devtools.timeline",
  "toplevel"
];

const cdp = await connect(port);
const renderer = await cdp.requireHardwareGpu();
console.error(`hardware renderer: ${renderer.renderer}`);
await cdp.send("Performance.enable");
await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
  source: `(() => {
    window.__pressDebugEnabled = true;
    window.__pressProfile = {
      classes: {},
      paints: [],
      lcp: [],
      longTasks: [],
      shifts: []
    };
    const observe = (type, target) => {
      try {
        new PerformanceObserver((list) => {
          window.__pressProfile[target].push(...list.getEntries().map((entry) => ({
            name: entry.name,
            startTime: entry.startTime,
            duration: entry.duration,
            value: entry.value,
            hadRecentInput: entry.hadRecentInput
          })));
        }).observe({ type, buffered: true });
      } catch {}
    };
    observe('paint', 'paints');
    observe('largest-contentful-paint', 'lcp');
    observe('longtask', 'longTasks');
    observe('layout-shift', 'shifts');
    const markClasses = () => {
      for (const name of ['press-scene-ready', 'press-entry-complete']) {
        if (!window.__pressProfile.classes[name]
            && document.documentElement.classList.contains(name)) {
          window.__pressProfile.classes[name] = performance.now();
        }
      }
    };
    const install = () => {
      markClasses();
      new MutationObserver(markClasses).observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class']
      });
    };
    if (document.documentElement) install();
    else document.addEventListener('readystatechange', install, { once: true });
  })();`
});

const rendererThreadFor = (events) => {
  const threads = [...new Set(events.filter((event) => (
    event.ph === "M"
    && event.name === "thread_name"
    && event.args?.name === "CrRendererMain"
  )).map((event) => event.tid))];
  return threads.sort((left, right) => {
    const score = (tid) => events.filter((event) => (
      event.tid === tid && (
        event.name === "FireAnimationFrame"
        || event.name === "AnimationFrame::Presentation"
      )
    )).length;
    return score(right) - score(left);
  })[0];
};

const quantile = (values, fraction) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
};

const analyseTrace = (events) => {
  const rendererMain = rendererThreadFor(events);
  const rendererEvents = rendererMain === undefined
    ? events
    : events.filter((event) => event.tid === rendererMain);
  const tasks = rendererEvents.filter((event) => (
    event.ph === "X" && (event.name === "RunTask" || event.name === "ThreadControllerImpl::RunTask")
  ));
  const animationFrames = rendererEvents.filter((event) => (
    event.ph === "X" && event.name === "FireAnimationFrame"
  ));
  const presentationFrames = rendererEvents.filter((event) => (
    event.name === "AnimationFrame::Presentation"
  ));
  const taskDurations = tasks.map((event) => (event.dur || 0) / 1_000);
  const frameDurations = animationFrames.map((event) => (event.dur || 0) / 1_000);
  return {
    eventCount: events.length,
    rendererMainThread: rendererMain ?? null,
    taskCount: tasks.length,
    taskCpuMs: Number(taskDurations.reduce((total, value) => total + value, 0).toFixed(2)),
    taskP95Ms: Number(quantile(taskDurations, 0.95).toFixed(3)),
    taskMaxMs: Number(Math.max(0, ...taskDurations).toFixed(3)),
    animationFrameCallbacks: animationFrames.length,
    animationFrameP95Ms: Number(quantile(frameDurations, 0.95).toFixed(3)),
    animationFrameMaxMs: Number(Math.max(0, ...frameDurations).toFixed(3)),
    presentationFrames: presentationFrames.length
  };
};

const collectPageMetrics = () => cdp.evaluate(`(() => {
  const navigation = performance.getEntriesByType('navigation')[0];
  const resources = performance.getEntriesByType('resource').map((entry) => ({
    name: entry.name,
    initiatorType: entry.initiatorType,
    startTime: entry.startTime,
    duration: entry.duration,
    transferSize: entry.transferSize,
    encodedBodySize: entry.encodedBodySize,
    decodedBodySize: entry.decodedBodySize
  }));
  const profile = window.__pressProfile || {};
  const renderer = window.__pressDebug?.().renderer || null;
  return {
    navigation: navigation ? {
      responseStart: navigation.responseStart,
      domContentLoaded: navigation.domContentLoadedEventEnd,
      load: navigation.loadEventEnd,
      transferSize: navigation.transferSize,
      encodedBodySize: navigation.encodedBodySize,
      decodedBodySize: navigation.decodedBodySize
    } : null,
    classes: profile.classes || {},
    paints: profile.paints || [],
    lcp: profile.lcp || [],
    longTasks: profile.longTasks || [],
    layoutShift: (profile.shifts || [])
      .filter((entry) => !entry.hadRecentInput)
      .reduce((total, entry) => total + (entry.value || 0), 0),
    resources,
    jsHeap: performance.memory ? {
      usedBytes: performance.memory.usedJSHeapSize,
      totalBytes: performance.memory.totalJSHeapSize,
      limitBytes: performance.memory.jsHeapSizeLimit
    } : null,
    renderer
  };
})()`);

const entryTraceEvents = await cdp.trace(async () => {
  console.error("trace: cold entry");
  await cdp.navigate(url);
  const ready = await cdp.waitFor(
    "document.documentElement.classList.contains('press-entry-complete')",
    30_000
  );
  if (!ready) throw new Error("Press entry did not complete");
  await cdp.sleep(1_500);
}, TRACE_CATEGORIES);

const coldLoad = await collectPageMetrics();
console.error("collect: memory and idle baseline");
const performanceMetrics = await cdp.send("Performance.getMetrics");
const domCounters = await cdp.send("Memory.getDOMCounters");

await cdp.sleep(2_000);
const idleBefore = await cdp.evaluate("window.__pressDebug().renderer");
const idleTraceEvents = await cdp.trace(
  () => cdp.sleep(IDLE_WINDOW_MS),
  TRACE_CATEGORIES
);
console.error("trace: sustained scroll");
const idleAfter = await cdp.evaluate("window.__pressDebug().renderer");

await cdp.evaluate("window.scrollTo({ top: 0, behavior: 'instant' })");
await cdp.sleep(250);
const scrollBefore = await cdp.evaluate("window.__pressDebug().renderer");
const sustainedTraceEvents = await cdp.trace(async () => {
  for (let step = 0; step < 360; step += 1) {
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseWheel",
      x: 784,
      y: 447,
      deltaX: 0,
      deltaY: step < 180 ? 18 : -18
    });
    await cdp.sleep(16);
  }
}, TRACE_CATEGORIES);
const scrollAfter = await cdp.evaluate("window.__pressDebug().renderer");

const report = {
  measuredAt: new Date().toISOString(),
  url,
  renderer,
  coldLoad: {
    ...coldLoad,
    trace: analyseTrace(entryTraceEvents)
  },
  memory: {
    performanceMetrics: Object.fromEntries(
      performanceMetrics.metrics.map((metric) => [metric.name, metric.value])
    ),
    domCounters
  },
  idle: {
    durationMs: IDLE_WINDOW_MS,
    before: idleBefore,
    after: idleAfter,
    presentedFrameDelta: idleAfter.presentedFrames - idleBefore.presentedFrames,
    animationFrameDelta: idleAfter.animationFrames - idleBefore.animationFrames,
    trace: analyseTrace(idleTraceEvents)
  },
  sustainedScroll: {
    durationMs: 360 * 16,
    before: scrollBefore,
    after: scrollAfter,
    presentedFrameDelta: scrollAfter.presentedFrames - scrollBefore.presentedFrames,
    animationFrameDelta: scrollAfter.animationFrames - scrollBefore.animationFrames,
    trace: analyseTrace(sustainedTraceEvents)
  },
  runtimeErrors: cdp.errors
};

const serialized = JSON.stringify(report, null, 2);
if (output) {
  await writeFile(output, serialized + "\n");
  console.log(`profile written to ${output}`);
} else {
  console.log(serialized);
}
await cdp.close();
