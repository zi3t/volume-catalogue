/**
 * Captures every file a reference page actually fetches, into a hash-pinned
 * manifest. Written for press.stripe.com, but nothing here is site-specific.
 *
 * Why a browser and not `wget --mirror`: the reference is a JS application. Its
 * scene assets are requested at runtime from paths built out of a data
 * structure — `TextureLoader.load(m.path, …)` — on a different host from the
 * document. A static mirror retrieves the shell and none of the substance.
 *
 * Two phases, deliberately:
 *
 *   1. Discover.  Drive the page and record URLs from `Network.responseReceived`.
 *   2. Re-fetch.  Download each URL again with plain `fetch`.
 *
 * `Network.getResponseBody` would skip phase 2, but bodies are evicted from the
 * network cache after navigation and under memory pressure, so it fails with
 * "No resource with given identifier found" on exactly the large assets worth
 * having. Discovery and retrieval have different failure modes; keeping them
 * apart means a flaky body read cannot cost us the URL.
 *
 * Usage:
 *   deno run --allow-net --allow-read --allow-write tests/capture-reference.mjs \
 *     --port=9226 --url=https://press.stripe.com/ --out=tmp/reference-20260807
 *
 * Add --fetch-creative only for a one-time visual comparison. See the
 * classification note below.
 */

import { dirname, join } from "node:path";
import { connect } from "./cdp.mjs";

const options = Object.fromEntries(
  Deno.args
    .filter((argument) => argument.startsWith("--"))
    .map((argument) => {
      const [key, ...rest] = argument.slice(2).split("=");
      return [key, rest.length ? rest.join("=") : "true"];
    })
);

const port = options.port ?? "9226";
const entryUrl = options.url ?? "https://press.stripe.com/";
const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
const outputDirectory = options.out ?? `tmp/reference-${stamp}`;
const fetchCreative = options["fetch-creative"] === "true";
const maxRoutes = Number(options["max-routes"] ?? 12);
const scrollStep = Number(options["scroll-step"] ?? 900);
const maxScrolls = Number(options["max-scrolls"] ?? 40);

/**
 * Classification is the contract boundary made mechanical, not a caveat added
 * afterwards. `behavioral` is what docs/scene-contract.md sanctions reading:
 * code and layout, measured and translated proportionally. `creative` is
 * authored work — cover artwork, typefaces, models, marketing copy — which is
 * recorded by URL and hash but whose bytes are discarded unless explicitly
 * requested.
 *
 * Models sit in `creative` even though the contract groups geometry with
 * behaviour: a .glb is an authored asset, while the proportions measured from
 * it are the behavioural fact. Measure freely, keep the file only if asked.
 */
const CREATIVE_PATTERN = /^(image|font|video|audio)\/|\/(gltf|octet-stream)|\.(glb|gltf|obj|fbx|woff2?|ttf|otf)(\?|$)/i;

const classify = (url, mimeType) => (
  CREATIVE_PATTERN.test(mimeType ?? "") || CREATIVE_PATTERN.test(url)
    ? "creative"
    : "behavioral"
);

/** Mirrors the URL into a readable tree so a capture can be browsed by hand. */
const localPathFor = (url) => {
  const parsed = new URL(url);
  const path = parsed.pathname === "/" || parsed.pathname.endsWith("/")
    ? `${parsed.pathname}index.html`
    : parsed.pathname;
  const segments = `${parsed.host}${path}`
    .split("/")
    .map((segment) => segment.replace(/[^A-Za-z0-9._-]/g, "_"))
    .filter(Boolean);
  // Contentful serves one image at many sizes off the same path; without the
  // query folded in, every variant would overwrite the last.
  if (parsed.search) {
    const query = [...parsed.search].reduce((hash, character) => (
      (hash * 31 + character.charCodeAt(0)) >>> 0
    ), 7).toString(36);
    const last = segments.pop();
    const dot = last.lastIndexOf(".");
    segments.push(dot > 0 ? `${last.slice(0, dot)}-${query}${last.slice(dot)}` : `${last}-${query}`);
  }
  return segments.join("/");
};

const sha256 = async (bytes) => {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const cdp = await connect(port);
const responses = new Map();
const initiators = new Map();

const removeListener = cdp.on((payload) => {
  if (payload.method === "Network.requestWillBeSent") {
    initiators.set(payload.params.requestId, payload.params.initiator?.type ?? null);
    return;
  }
  if (payload.method !== "Network.responseReceived") return;
  const { response, type, requestId } = payload.params;
  if (!/^https?:/.test(response.url)) return;
  responses.set(response.url, {
    url: response.url,
    status: response.status,
    mimeType: response.mimeType,
    resourceType: type,
    initiator: initiators.get(requestId) ?? null
  });
});

/**
 * One page load is not "complete assets". The catalogue only requests a cover
 * once its book scrolls into range, and each route pulls its own chunk, so
 * completeness is decided here rather than in the recorder. This is the work
 * the missing scratchpad/refpick.mjs was meant to do.
 */
const drivePage = async () => {
  await cdp.navigate(entryUrl);
  await cdp.waitFor("document.readyState === 'complete'", 30000);
  await cdp.sleep(2500);

  let previousOffset = -1;
  for (let step = 0; step < maxScrolls; step += 1) {
    const offset = await cdp.evaluate(`(() => {
      window.scrollBy(0, ${scrollStep});
      return window.scrollY;
    })()`);
    await cdp.sleep(650);
    if (offset === previousOffset) break;
    previousOffset = offset;
  }

  // Collected after scrolling, since a lazily built shelf has more anchors at
  // the bottom than it did at the top.
  const origin = new URL(entryUrl).origin;
  const routes = await cdp.evaluate(`(() => {
    const seen = new Set();
    for (const anchor of document.querySelectorAll('a[href]')) {
      const href = anchor.href;
      if (href.startsWith(${JSON.stringify(origin)}) && !href.includes('#')) seen.add(href);
    }
    return [...seen];
  })()`);

  const visited = routes.filter((route) => route !== entryUrl).slice(0, maxRoutes);
  for (const route of visited) {
    await cdp.navigate(route);
    await cdp.waitFor("document.readyState === 'complete'", 20000);
    await cdp.sleep(1800);
    await cdp.evaluate("window.scrollBy(0, 1200)").catch(() => {});
    await cdp.sleep(600);
  }
  return { discoveredRoutes: routes.length, visitedRoutes: visited };
};

try {
  // Recorded rather than required: asset URLs do not change with the renderer,
  // so a software fallback still yields a valid capture. It is noted in the
  // manifest because any *visual* reading of these files would be void.
  const renderer = await cdp.rendererInfo().catch((error) => ({ error: String(error) }));
  await cdp.send("Network.clearBrowserCache").catch(() => {});

  const drive = await drivePage();
  removeListener();

  const discovered = [...responses.values()].sort((first, second) => (
    first.url < second.url ? -1 : first.url > second.url ? 1 : 0
  ));

  const entries = [];
  let written = 0;
  let recordedOnly = 0;

  for (const response of discovered) {
    const entryClass = classify(response.url, response.mimeType);
    const entry = { ...response, class: entryClass, sha256: null, path: null, bytes: null };

    try {
      // Bytes are fetched for every entry because a hash requires them. Only
      // behavioral files reach the disk unless --fetch-creative is passed.
      const fetched = await fetch(response.url, {
        headers: { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" }
      });
      entry.refetchStatus = fetched.status;
      if (fetched.ok) {
        const bytes = new Uint8Array(await fetched.arrayBuffer());
        entry.sha256 = await sha256(bytes);
        entry.bytes = bytes.byteLength;
        if (entryClass === "behavioral" || fetchCreative) {
          const relative = localPathFor(response.url);
          const absolute = join(outputDirectory, "files", relative);
          await Deno.mkdir(dirname(absolute), { recursive: true });
          await Deno.writeFile(absolute, bytes);
          entry.path = join("files", relative);
          written += 1;
        } else {
          recordedOnly += 1;
        }
      }
    } catch (error) {
      entry.refetchError = String(error);
    }
    entries.push(entry);
  }

  const manifest = {
    capturedAt: new Date().toISOString(),
    entryUrl,
    renderer,
    viewport: { width: 1568, height: 894 },
    drive,
    fetchCreative,
    counts: {
      discovered: entries.length,
      behavioral: entries.filter((entry) => entry.class === "behavioral").length,
      creative: entries.filter((entry) => entry.class === "creative").length,
      written,
      recordedOnly
    },
    entries
  };

  await Deno.mkdir(outputDirectory, { recursive: true });
  await Deno.writeTextFile(
    join(outputDirectory, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`
  );

  const hosts = entries.reduce((tally, entry) => {
    const host = new URL(entry.url).host;
    tally[host] = (tally[host] ?? 0) + 1;
    return tally;
  }, {});
  console.log(JSON.stringify({ outputDirectory, ...manifest.counts, hosts }, null, 2));
} finally {
  removeListener();
  await cdp.close();
}
