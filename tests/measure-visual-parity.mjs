// Screenshot-space measurement for the clean-room visual-parity gate.
//
// `clean-room-live-visual-audit.md` records its targets in SCREENSHOT space:
// `standingBookEdges` describes a WebGL-rendered silhouette, and
// `standingContentStartApprox` is an estimate read off a capture. Reading DOM
// rects instead produces numbers that look comparable and are not — the route
// detail column reports x=887 in the DOM against a recorded candidate of 815.
// Every target in that audit therefore needs measuring the way it was made.
//
// Each state is captured twice: once normally, once with the scene canvas
// hidden. The book is not the difference between them — the canvas paints the
// ground too, so differencing returns the whole viewport. The book is what
// departs from the sampled ground in the first capture and is absent from the
// second, which subtracts the DOM text a plain threshold would swallow.
//
// The result is then split into connected components and one is kept. A shelf
// shows several cases at once, and a single bounding box over every scene pixel
// spans the whole stack — reporting the correct width and twice the height.
//
// Usage:
//   deno run --allow-net --allow-read --allow-write tests/measure-visual-parity.mjs \
//     [--port=9226] [--base=http://127.0.0.1:4173] [--renderer=clean-room] [--out=path.json]

import { connect } from "./cdp.mjs";

const args = new Map(
  Deno.args
    .filter((a) => a.startsWith("--"))
    .map((a) => {
      const i = a.indexOf("=");
      return i === -1 ? [a.slice(2), "true"] : [a.slice(2, i), a.slice(i + 1)];
    })
);

const PORT = args.get("port") ?? "9226";
const BASE = args.get("base") ?? "http://127.0.0.1:4173";
const RENDERER = args.get("renderer") ?? "clean-room";
const OUT = args.get("out") ?? null;

const DESKTOP = { width: 1568, height: 894 };
const COMPACT = { width: 390, height: 844 };

// The catalogue and a route live at different paths on the reference than here,
// so both are overridable. Locating the reference's own shelf box is what makes
// a cross-site surface-response comparison possible — a rect recorded in an
// older capture does not survive into a fresh one.
const CATALOGUE_PATH = args.get("catalogue-path") ?? "/press/";
const ROUTE_PATH = args.get("route-path") ?? "/press/refly/";
const ONLY = args.get("only") ?? null;

// The shelf column, as a fraction of viewport width. The left index is a narrow
// column of ticks that survives DOM subtraction on the reference and, being
// taller than any case, wins a topmost-component search — the first run against
// the live site returned it as the "first rest book". Cases live to the right of
// it on both sides (ours starts at x=393 of 1568), so the search starts there.
const SHELF_X0 = Number(args.get("shelf-x0") ?? 0.2);

const q = (path) => {
  const url = new URL(path, BASE);
  if (RENDERER) url.searchParams.set("press-renderer", RENDERER);
  return url.href;
};

/** Settle: wait for entry to finish and for the scene to stop moving. */
const SETTLE = `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(1200);
  // Entry completes on its own event; if it already fired, the marker is set.
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) {
    if (document.documentElement.classList.contains("press-entry-complete")
      || document.body.dataset.pressEntry === "complete") break;
    await sleep(120);
  }
  await sleep(900);
  return "settled";
})()`;

/**
 * Capture the same frame twice — canvas shown, canvas hidden — and return both
 * as raw RGBA via an in-page 2D canvas. Decoding in the page avoids shipping a
 * PNG decoder and keeps the pixels in the space the audit measured.
 */
async function capturePair(cdp, viewport) {
  // `cdp.screenshot()` writes a PNG and returns the path, so round-trip through
  // a temp file and re-encode for the in-page decoder.
  const shot = async () => {
    const path = await Deno.makeTempFile({ suffix: ".png" });
    await cdp.screenshot(path);
    const bytes = await Deno.readFile(path);
    await Deno.remove(path).catch(() => {});
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  };

  const withCanvas = await shot();
  await cdp.evaluate(`(() => {
    document.querySelectorAll("canvas").forEach((c) => {
      c.dataset.parityPrevVis = c.style.visibility || "";
      c.style.visibility = "hidden";
    });
    return true;
  })()`);
  const withoutCanvas = await shot();
  await cdp.evaluate(`(() => {
    document.querySelectorAll("canvas").forEach((c) => {
      c.style.visibility = c.dataset.parityPrevVis || "";
      delete c.dataset.parityPrevVis;
    });
    return true;
  })()`);

  return { withCanvas, withoutCanvas, viewport };
}

/**
 * Analyse a capture pair in the page. Returns the book silhouette (difference
 * between the two captures) and the content start (non-ground pixels in the
 * canvas-hidden capture, which holds only DOM).
 */
async function analyse(cdp, pair, opts = {}) {
  const {
    bookRegion = null, // [x0,y0,x1,y1] fractions, restricts the silhouette search
    contentRegion = null, // same, restricts the content-start search
    diffThreshold = 12,
    groundThreshold = 26
  } = opts;

  const script = `(async () => {
    const load = (b64) => new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = "data:image/png;base64," + b64;
    });
    const A = await load(${JSON.stringify(pair.withCanvas)});
    const B = await load(${JSON.stringify(pair.withoutCanvas)});
    const w = A.width, h = A.height;
    const mk = (img) => {
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      c.getContext("2d", { willReadFrequently: true }).drawImage(img, 0, 0);
      return c.getContext("2d").getImageData(0, 0, w, h).data;
    };
    const a = mk(A), b = mk(B);

    // The capture may be at devicePixelRatio; report in CSS pixels.
    const scale = w / ${pair.viewport.width};
    const px = (v) => Math.round(v / scale);

    const clampRegion = (reg) => reg
      ? [Math.floor(reg[0]*w), Math.floor(reg[1]*h), Math.ceil(reg[2]*w), Math.ceil(reg[3]*h)]
      : [0, 0, w, h];

    const box = () => ({ l: Infinity, t: Infinity, r: -Infinity, bt: -Infinity, n: 0 });
    const add = (o, x, y) => { if (x<o.l)o.l=x; if(x>o.r)o.r=x; if(y<o.t)o.t=y; if(y>o.bt)o.bt=y; o.n++; };
    const out = (o) => (!o || o.n === 0) ? null
      : { left: px(o.l), top: px(o.t), width: px(o.r-o.l+1), height: px(o.bt-o.t+1), pixels: o.n };

    // Ground colour, sampled from a corner of each capture. The canvas paints
    // the ground, so hiding it changes the backdrop too — sample A and B apart.
    const gi = (4*w + 4)*4;
    const groundA = [a[gi], a[gi+1], a[gi+2]];
    const ground = [b[gi], b[gi+1], b[gi+2]];
    const off = (buf, i, g) =>
      Math.abs(buf[i]-g[0]) + Math.abs(buf[i+1]-g[1]) + Math.abs(buf[i+2]-g[2]);

    // 1. Book silhouette. Hiding the canvas also removes the ground it paints,
    //    so a straight A/B difference returns the whole canvas rather than the
    //    book. Take pixels that depart from A's ground instead, and subtract
    //    the DOM text — which is present in B and would otherwise widen the box.
    const [bx0,by0,bx1,by1] = clampRegion(${JSON.stringify(bookRegion)});
    const mask = new Uint8Array(w*h);
    for (let y=by0; y<by1; y++) for (let x=bx0; x<bx1; x++) {
      const i = (y*w+x)*4;
      if (off(a, i, groundA) <= ${groundThreshold}) continue;
      if (off(b, i, ground) > ${groundThreshold}) continue; // DOM, not scene
      mask[y*w+x] = 1;
    }

    // A shelf shows several cases at once, so one bounding box over every scene
    // pixel spans the whole stack — which is why a naive box reports the right
    // width and roughly twice the height. Label connected components and keep
    // one, so the measurement describes a single case the way the audit does.
    const seen = new Uint8Array(w*h);
    const components = [];
    const stack = new Int32Array(w*h);
    for (let s=0; s<w*h; s++) {
      if (!mask[s] || seen[s]) continue;
      let sp = 0; stack[sp++] = s; seen[s] = 1;
      const comp = box();
      while (sp > 0) {
        const p = stack[--sp];
        const y = (p / w) | 0, x = p - y*w;
        add(comp, x, y);
        if (x+1 < w   && mask[p+1] && !seen[p+1]) { seen[p+1]=1; stack[sp++]=p+1; }
        if (x-1 >= 0  && mask[p-1] && !seen[p-1]) { seen[p-1]=1; stack[sp++]=p-1; }
        if (y+1 < h   && mask[p+w] && !seen[p+w]) { seen[p+w]=1; stack[sp++]=p+w; }
        if (y-1 >= 0  && mask[p-w] && !seen[p-w]) { seen[p-w]=1; stack[sp++]=p-w; }
      }
      if (comp.n > 400) components.push(comp);
    }
    const mode = ${JSON.stringify(opts.mode ?? "largest")};
    let book = box();
    if (components.length) {
      book = mode === "topmost"
        ? components.reduce((m, c) => (c.t < m.t ? c : m))
        : components.reduce((m, c) => (c.n > m.n ? c : m));
    }

    // 3. Content start = first non-ground DOM pixel inside the region.
    const [cx0,cy0,cx1,cy1] = clampRegion(${JSON.stringify(contentRegion)});
    const content = box();
    for (let y=cy0; y<cy1; y++) for (let x=cx0; x<cx1; x++) {
      const i = (y*w+x)*4;
      const d = Math.abs(b[i]-ground[0]) + Math.abs(b[i+1]-ground[1]) + Math.abs(b[i+2]-ground[2]);
      if (d > ${groundThreshold}) add(content, x, y);
    }

    return JSON.stringify({
      viewport: { width: ${pair.viewport.width}, height: ${pair.viewport.height} },
      captureWidth: w, scale,
      ground: "rgb(" + ground.join(", ") + ")",
      book: out(book),
      content: out(content)
    });
  })()`;

  return JSON.parse(await cdp.evaluate(script));
}

async function measureState(cdp, { name, path, viewport, prepare, ...opts }) {
  await cdp.navigate(q(path));
  await cdp.evaluate(SETTLE);
  if (prepare) await cdp.evaluate(prepare);
  const pair = await capturePair(cdp, viewport);
  const result = await analyse(cdp, pair, opts);
  return { name, path, ...result };
}

/** Press and drag the first shelf row to reach the held silhouette. */
const HOLD_DRAG = `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const row = document.querySelector(".press-volume");
  if (!row) return "no-row";
  const r = row.getBoundingClientRect();
  const cx = r.left + r.width * 0.5, cy = r.top + r.height * 0.5;
  const ev = (type, x, y, buttonsar) => row.dispatchEvent(new PointerEvent(type, {
    bubbles: true, cancelable: true, clientX: x, clientY: y,
    pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0, buttons: buttonsar
  }));
  ev("pointerover", cx, cy, 0); ev("pointerenter", cx, cy, 0); ev("pointermove", cx, cy, 0);
  await sleep(260);
  ev("pointerdown", cx, cy, 1);
  await sleep(140);
  for (let i = 1; i <= 12; i++) {
    const x = cx + i * 9, y = cy - i * 3;
    window.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true, clientX: x, clientY: y, pointerId: 1,
      pointerType: "mouse", isPrimary: true, buttons: 1
    }));
    await sleep(45);
  }
  await sleep(700);
  return "held";
})()`;

// Recorded reference readings, so a run reports a delta rather than a number
// somebody has to look up. Sources: clean-room-live-visual-audit.md §§1,7, and
// for compact.standing a 2026-08-08 capture of press.stripe.com/boom at
// 390x844 — see docs/reference/parity-readings-20260808.json.
const REFERENCE = {
  "desktop.firstRestBook": { left: 394, top: 332, width: 780, height: 128 },
  "desktop.draggedBookEdges": { left: 340, top: 286, width: 904, height: 202 },
  "desktop.standing": { left: 305, top: 166, width: 437, height: 555 },
  "compact.firstRestBook": { left: 0, top: 277, width: 390, height: 182 },
  "compact.standing": { left: 50, top: 89, width: 308, height: 407 }
};

const STATES = [
  {
    name: "desktop.firstRestBook",
    path: CATALOGUE_PATH,
    viewport: DESKTOP,
    bookRegion: [SHELF_X0, 0.15, 1, 0.75],
    mode: "topmost"
  },
  {
    name: "desktop.draggedBookEdges",
    path: CATALOGUE_PATH,
    viewport: DESKTOP,
    prepare: HOLD_DRAG
  },
  {
    name: "desktop.standing",
    path: ROUTE_PATH,
    viewport: DESKTOP,
    bookRegion: [0, 0, 0.62, 1],
    contentRegion: [0.5, 0, 1, 1]
  },
  {
    name: "compact.firstRestBook",
    path: CATALOGUE_PATH,
    viewport: COMPACT,
    bookRegion: [SHELF_X0, 0.15, 1, 0.85],
    mode: "topmost"
  },
  {
    name: "compact.standing",
    path: ROUTE_PATH,
    viewport: COMPACT,
    bookRegion: [0, 0, 1, 0.72],
    contentRegion: [0, 0.4, 1, 1]
  }
];

/**
 * The device metrics are set once per connection, so each viewport gets its own
 * target rather than an override applied mid-run — a resize leaves the scene
 * mid-relayout and the first capture after it measures the transition.
 */
const results = [];
let renderer = null;

for (const viewport of [DESKTOP, COMPACT]) {
  const states = STATES.filter((s) => s.viewport === viewport && (!ONLY || s.name === ONLY));
  if (!states.length) continue;

  const cdp = await connect(PORT, viewport);
  if (!renderer) {
    renderer = await cdp.rendererInfo();
    if (renderer.software) {
      console.error("REFUSING: software renderer (" + renderer.renderer + ").");
      console.error("Screenshot measurements taken here describe SwiftShader. Go headful.");
      await cdp.close();
      Deno.exit(2);
    }
  }

  for (const state of states) {
    try {
      const measured = await measureState(cdp, state);
      const ref = REFERENCE[state.name] ?? null;
      const book = measured.book;
      measured.reference = ref;
      measured.delta = ref && book
        ? {
          left: book.left - ref.left,
          top: book.top - ref.top,
          width: book.width - ref.width,
          height: book.height - ref.height
        }
        : null;
      results.push(measured);
    } catch (error) {
      results.push({ name: state.name, error: String(error) });
    }
  }

  await cdp.close();
}

const payload = {
  measuredAt: new Date().toISOString(),
  base: BASE,
  renderer: renderer.renderer,
  software: renderer.software,
  note:
    "Screenshot-space measurements, comparable to clean-room-live-visual-audit.md. "
    + "Book silhouettes come from differencing canvas-shown against canvas-hidden captures.",
  results
};

console.log(JSON.stringify(payload, null, 2));
if (OUT) {
  await Deno.writeTextFile(OUT, JSON.stringify(payload, null, 2));
  console.error("wrote " + OUT);
}


