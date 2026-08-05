/**
 * Minimal Chrome DevTools Protocol driver for press-scene probes.
 *
 * Companion to `qa-press-scene.mjs`: that script is the fixed regression gate,
 * this module is for the one-off measurements a diagnosis needs. It exists so a
 * probe is five lines instead of a hand-rolled WebSocket client each time.
 *
 * Runtime is Deno, matching the gate. No harness-specific dependencies.
 *
 *   deno run --allow-net --allow-read --allow-write probe.mjs
 *
 *   import { connect } from "./cdp.mjs";
 *   const cdp = await connect("9226");
 *   await cdp.navigate("http://127.0.0.1:4173/press/");
 *   await cdp.waitFor("document.documentElement.classList.contains('press-scene-ready')");
 *   console.log(await cdp.evaluate("document.title"));
 *   await cdp.close();
 *
 * Read `docs/real-gpu-harness.md` first. A probe that reports the GPU is
 * only meaningful once the renderer string has been checked, and timing read
 * from `screenshot()` cadence is not a measurement of the scene — captures
 * block, so they report the harness. Use a trace for timing.
 */

const SOFTWARE_RENDERERS = ["swiftshader", "llvmpipe", "softwarerasterizer"];

/**
 * Attaches to a Chrome instance already listening with remote debugging, and
 * opens its own page target so a probe never disturbs a tab someone else is on.
 */
export async function connect(port = "9226", { width = 1568, height = 894 } = {}) {
  const version = await fetch(`http://127.0.0.1:${port}/json/version`).then((response) => response.json());
  const socket = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  let sequence = 0;
  const pending = new Map();
  const listeners = new Set();
  socket.addEventListener("message", (event) => {
    const payload = JSON.parse(event.data);
    if (payload.id && pending.has(payload.id)) {
      const callbacks = pending.get(payload.id);
      pending.delete(payload.id);
      if (payload.error) callbacks.reject(new Error(`${callbacks.method}: ${payload.error.message}`));
      else callbacks.resolve(payload.result);
      return;
    }
    if (payload.method) listeners.forEach((listener) => listener(payload));
  });

  const call = (method, params = {}, sessionId) => {
    const id = ++sequence;
    const message = { id, method, params };
    if (sessionId) message.sessionId = sessionId;
    socket.send(JSON.stringify(message));
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject, method }));
  };

  const { targetId } = await call("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await call("Target.attachToTarget", { targetId, flatten: true });
  const send = (method, params) => call(method, params, sessionId);

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Log.enable").catch(() => {});
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false
  });

  // An unfocused window throttles animation frames, which makes any damped
  // state report the window manager instead of the scene. The gate sets this
  // for the same reason.
  await send("Emulation.setFocusEmulationEnabled", { enabled: true }).catch(() => {});

  const runtimeErrors = [];
  listeners.add((payload) => {
    if (payload.method === "Runtime.exceptionThrown") {
      runtimeErrors.push(payload.params.exceptionDetails?.text || "Runtime exception");
    }
    if (payload.method === "Runtime.consoleAPICalled" && payload.params.type === "error") {
      runtimeErrors.push(payload.params.args.map((item) => item.value || item.description).join(" "));
    }
    if (payload.method === "Log.entryAdded" && payload.params.entry?.level === "error") {
      runtimeErrors.push(payload.params.entry.text);
    }
  });

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

  const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

  /** Waits for a condition instead of sampling a damped state on a fixed delay. */
  const waitFor = async (expression, timeout = 30000) => {
    const started = performance.now();
    while (performance.now() - started < timeout) {
      try {
        if (await evaluate(expression)) return true;
      } catch {
        // Navigation can tear down the context mid-poll; keep waiting.
      }
      await sleep(120);
    }
    return false;
  };

  const navigate = async (url) => {
    await send("Page.navigate", { url });
  };

  const screenshot = async (path) => {
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    await Deno.writeFile(path, Uint8Array.from(atob(data), (character) => character.charCodeAt(0)));
    return path;
  };

  /**
   * Subscribes to raw protocol events for measurements such as screencasts.
   * The returned function removes the listener, so one-off probes cannot leak
   * handlers into later navigation or trace work.
   */
  const on = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  /**
   * Reads the unmasked WebGL renderer. Every visual finding depends on this:
   * a headless Chrome on macOS silently falls back to software rasterisation,
   * so lighting, material and smoothness claims taken there describe SwiftShader.
   */
  const rendererInfo = async () => {
    const info = await evaluate(`(() => {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!gl) return { error: 'no webgl context' };
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        renderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        vendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
        version: gl.getParameter(gl.VERSION)
      };
    })()`);
    const renderer = String(info.renderer || "").toLowerCase();
    return { ...info, software: SOFTWARE_RENDERERS.some((name) => renderer.includes(name)) };
  };

  /** Throws unless this is a real GPU, so a probe cannot quietly report software GL. */
  const requireHardwareGpu = async () => {
    const info = await rendererInfo();
    if (info.software || info.error) {
      throw new Error(
        `Software renderer (${info.renderer || info.error}). Launch Chrome headful — ` +
        `see docs/real-gpu-harness.md.`
      );
    }
    return info;
  };

  /**
   * Records a performance trace across an action. This is the honest way to
   * measure first-load and animation timing; screenshot cadence is not.
   */
  const trace = async (action, categories = ["devtools.timeline", "blink.user_timing"]) => {
    const events = [];
    const collect = (payload) => {
      if (payload.method === "Tracing.dataCollected") events.push(...payload.params.value);
    };
    listeners.add(collect);
    const complete = new Promise((resolve) => {
      const done = (payload) => {
        if (payload.method === "Tracing.tracingComplete") {
          listeners.delete(done);
          resolve();
        }
      };
      listeners.add(done);
    });
    await call("Tracing.start", { traceConfig: { includedCategories: categories } });
    await action();
    await call("Tracing.end");
    await complete;
    listeners.delete(collect);
    return events;
  };

  const close = async () => {
    await call("Target.closeTarget", { targetId }).catch(() => {});
    socket.close();
  };

  return {
    send,
    evaluate,
    navigate,
    waitFor,
    sleep,
    screenshot,
    on,
    rendererInfo,
    requireHardwareGpu,
    trace,
    errors: runtimeErrors,
    sessionId,
    targetId,
    close
  };
}
