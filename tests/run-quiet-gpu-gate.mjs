/**
 * Runs one package browser gate against a hidden, headful Chrome instance.
 *
 * macOS headless Chrome uses SwiftShader, so `--headless` cannot validate the
 * catalogue's materials or lighting. `open -gjn` gives Chrome a real Metal
 * window surface while launching it hidden and without activating the app.
 * CDP targets are background tabs as well, so a test never steals the current
 * workspace.
 *
 * Usage:
 *   deno run --allow-net --allow-read --allow-write --allow-run \
 *     tests/run-quiet-gpu-gate.mjs tests/qa-clean-room-routing.mjs
 */

import { connect } from "./cdp.mjs";

const [gate, ...gateArguments] = Deno.args;
if (!gate) {
  console.error("Usage: run-quiet-gpu-gate.mjs <gate.mjs> [gate arguments...]");
  Deno.exit(2);
}
if (Deno.build.os !== "darwin") {
  console.error("The quiet real-GPU launcher currently supports macOS Chrome only.");
  Deno.exit(2);
}

const reservation = Deno.listen({ hostname: "127.0.0.1", port: 0 });
const port = reservation.addr.port;
reservation.close();
const profile = await Deno.makeTempDir({ prefix: "zi3t-quiet-gpu-" });

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const waitForBrowser = async () => {
  const deadline = performance.now() + 12_000;
  while (performance.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return;
    } catch {
      // Chrome has not opened the debugging socket yet.
    }
    await sleep(100);
  }
  throw new Error(`Quiet Chrome did not open port ${port}`);
};

const closeBrowser = async () => {
  try {
    const version = await fetch(`http://127.0.0.1:${port}/json/version`).then((response) => (
      response.json()
    ));
    const socket = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    socket.send(JSON.stringify({ id: 1, method: "Browser.close" }));
    await sleep(250);
    socket.close();
  } catch {
    // A gate may have already closed the dedicated browser after a fatal error.
  }
};

let exitCode = 1;
try {
  const launch = await new Deno.Command("open", {
    args: [
      "-gjn",
      "-a",
      "Google Chrome",
      "--args",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
      "--window-size=1568,894",
      "about:blank"
    ],
    stdout: "piped",
    stderr: "piped"
  }).output();
  if (!launch.success) {
    throw new Error(new TextDecoder().decode(launch.stderr).trim() || "Chrome launch failed");
  }

  await waitForBrowser();
  const probe = await connect(String(port));
  const gpu = await probe.requireHardwareGpu();
  await probe.close();
  console.error(`[quiet-gpu] ${gpu.renderer}`);

  const child = new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "--allow-net",
      "--allow-read",
      "--allow-write",
      gate,
      String(port),
      ...gateArguments
    ],
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit"
  }).spawn();
  exitCode = (await child.status).code;
} finally {
  await closeBrowser();
  await sleep(150);
  await Deno.remove(profile, { recursive: true }).catch(() => {});
}

Deno.exit(exitCode);
