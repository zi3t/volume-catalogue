// Type-hierarchy metrics for the audit's §2 row.
//
// "The reference gives author, title and part/mark distinct positions and
// weights; ours runs one template" is the last unscored §2 claim, and like the
// §6 rows it was a judgement. It is also countable: spine type is a set of
// glyphs, glyphs are connected components of ink, and a hierarchy is more than
// one distinct glyph height. This scores that on both sides from pixels, so it
// works against the reference, whose DOM says nothing about type painted into
// a texture.
//
// Nothing here copies the reference. Component counts and height clusters leave
// the script; the capture stays in the untracked scratch tree, which is the
// boundary capture-reference.mjs enforces.
//
// Reading this output, in order of what will mislead you:
//
// 1. CHECK `ink.fraction` BEFORE BELIEVING THE CLUSTER COUNT. The ink mask is a
//    departure from the rect's own median, so a rect that is mostly background
//    reads as one enormous "glyph" and a rect that caught a highlight rake reads
//    as hundreds. Sane spine type sits at roughly 1-12% of the rect. Outside
//    `--min-ink`/`--max-ink` the run fails rather than reporting a number.
//
// 2. THE CLOTH IS NOT FLAT, SO THE THRESHOLD IS RELATIVE. Cover cloth carries a
//    weave whose sigma is ~40 after the 2026-08-07 retune — comparable to the
//    ink/cloth separation on a pale volume. The threshold is therefore a
//    multiple of the rect's own standard deviation, not an absolute luminance,
//    and `--ink-sigma` is the lever when a volume comes back with no components.
//
// 3. POLARITY IS PER VOLUME. Three ZI3T volumes are dark ink on pale cloth and
//    two are pale ink on dark cloth. Guessing one direction scores the cloth on
//    half the shelf, so both tails are extracted and the one with more
//    glyph-shaped components wins. `--polarity=dark|light` forces it.
//
// 4. A CLUSTER IS NOT A TYPE SIZE UNTIL IT HAS MEMBERS. One stray component at
//    an odd height is a rake artefact, not a fourth heading level. Clusters need
//    `--min-members` (default 3) before they count toward `distinctSizes`.
//
// Case rects come from measure-visual-parity.mjs, which locates cases correctly
// on both sides. This script only scores what it is handed.
//
// Usage:
//   deno run --allow-net --allow-read --allow-write tests/measure-type-hierarchy.mjs \
//     --url=https://press.stripe.com/ --label=reference --case-rect=394,332,780,128
//   deno run ... --url='http://127.0.0.1:4173/press/' --label=clean-room \
//     --case-rect=393,332,782,128

import { connect } from "./cdp.mjs";

const args = new Map(
  Deno.args.filter((a) => a.startsWith("--")).map((a) => {
    const i = a.indexOf("=");
    return i === -1 ? [a.slice(2), "true"] : [a.slice(2, i), a.slice(i + 1)];
  })
);

const PORT = args.get("port") ?? "9226";
const URL_ = args.get("url");
const LABEL = args.get("label") ?? URL_;
const OUT = args.get("out") ?? null;
const CASE_RECT = (args.get("case-rect") ?? "").split(",").map(Number).filter((n) => !Number.isNaN(n));
const INK_SIGMA = Number(args.get("ink-sigma") ?? 1.6);
const MIN_INK = Number(args.get("min-ink") ?? 0.005);
const MAX_INK = Number(args.get("max-ink") ?? 0.35);
const MIN_AREA = Number(args.get("min-area") ?? 6);
const MIN_HEIGHT = Number(args.get("min-height") ?? 3);
const TOLERANCE = Number(args.get("tolerance") ?? 0.18);
const MIN_MEMBERS = Number(args.get("min-members") ?? 3);
const POLARITY = args.get("polarity") ?? "auto";
const SCROLL = Number(args.get("scroll") ?? 0);

if (!URL_ || CASE_RECT.length !== 4) {
  console.error("usage: --url=<page> --case-rect=left,top,width,height [--label=] [--out=]");
  Deno.exit(2);
}

const cdp = await connect(PORT, { width: 1568, height: 894 });

const renderer = await cdp.rendererInfo();
if (renderer.software) {
  console.error(`refusing to score type on a software rasteriser: ${renderer.renderer}`);
  Deno.exit(3);
}

await cdp.navigate(URL_);
await cdp.waitFor("document.readyState === 'complete'", 20_000);
if (SCROLL) {
  await cdp.evaluate(`window.scrollTo({ top: ${SCROLL}, behavior: 'instant' })`);
}
await cdp.sleep(1500);

// Both sides pause their render loop ~1200ms after the last input, and a paused
// loop with preserveDrawingBuffer off presents an empty canvas. Nudge, then
// capture inside the window — the same race measure-surface-response.mjs
// documents.
const WAKE = `(() => {
  window.scrollBy(0, 1); window.scrollBy(0, -1);
  for (const [x, y] of [[780, 400], [784, 404]]) {
    window.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true, clientX: x, clientY: y,
      pointerId: 1, pointerType: "mouse", isPrimary: true, buttons: 0
    }));
  }
  return true;
})()`;

const capture = async () => {
  await cdp.evaluate(WAKE);
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

const score = async (b64) => await cdp.evaluate(`(async () => {
  const img = await new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im); im.onerror = rej;
    im.src = "data:image/png;base64,${b64}";
  });
  const w = img.width, h = img.height;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, w, h).data;

  const sc = w / 1568;
  const [rl, rt, rw, rh] = ${JSON.stringify(CASE_RECT)}.map((v) => Math.round(v * sc));
  if (rw <= 0 || rh <= 0 || rl + rw > w || rt + rh > h) {
    return JSON.stringify({ error: "case rect falls outside the capture" });
  }

  const L = new Float64Array(rw * rh);
  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      const i = ((rt + y) * w + (rl + x)) * 4;
      L[y * rw + x] = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    }
  }

  const sorted = Float64Array.from(L).sort();
  const median = sorted[Math.floor(sorted.length / 2)];
  let sum = 0;
  for (const v of L) sum += (v - median) * (v - median);
  const sd = Math.sqrt(sum / L.length);

  // Connected components over a boolean mask, 8-connected, iterative so a long
  // horizontal stroke cannot blow the stack.
  const components = (mask) => {
    const seen = new Uint8Array(rw * rh);
    const out = [];
    const stack = [];
    for (let s = 0; s < mask.length; s++) {
      if (!mask[s] || seen[s]) continue;
      stack.length = 0;
      stack.push(s);
      seen[s] = 1;
      let minX = rw, maxX = -1, minY = rh, maxY = -1, area = 0;
      while (stack.length) {
        const p = stack.pop();
        const px = p % rw, py = (p / rw) | 0;
        area++;
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = px + dx, ny = py + dy;
            if (nx < 0 || ny < 0 || nx >= rw || ny >= rh) continue;
            const n = ny * rw + nx;
            if (mask[n] && !seen[n]) { seen[n] = 1; stack.push(n); }
          }
        }
      }
      out.push({
        area,
        left: minX, top: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1
      });
    }
    return out;
  };

  // A glyph is small relative to the case and taller than a weave speckle. The
  // upper bounds matter more than the lower: without them the cloth itself, or
  // a rake band running the length of the spine, arrives as one component and
  // becomes a "type size".
  const glyphLike = (g) =>
    g.area >= ${MIN_AREA}
    && g.height >= ${MIN_HEIGHT}
    && g.height <= rh * 0.7
    && g.width <= rw * 0.5;

  const cut = ${INK_SIGMA} * sd;
  const build = (sign) => {
    const mask = new Uint8Array(rw * rh);
    let on = 0;
    for (let i = 0; i < L.length; i++) {
      const hit = sign < 0 ? L[i] < median - cut : L[i] > median + cut;
      if (hit) { mask[i] = 1; on++; }
    }
    const all = components(mask);
    return { fraction: on / L.length, all, glyphs: all.filter(glyphLike) };
  };

  const dark = build(-1);
  const light = build(1);
  const forced = ${JSON.stringify(POLARITY)};
  const chosen = forced === "dark" ? dark
    : forced === "light" ? light
    : (dark.glyphs.length >= light.glyphs.length ? dark : light);
  const polarity = chosen === dark ? "dark-on-light" : "light-on-dark";

  // Single-linkage clustering on height, with a relative tolerance so a 6px and
  // a 7px glyph group while a 6px and a 20px glyph do not. Absolute tolerance
  // would merge every large size on a tall rect.
  const heights = chosen.glyphs.map((g) => g.height).sort((a, b) => a - b);
  const clusters = [];
  for (const value of heights) {
    const last = clusters[clusters.length - 1];
    if (last && value - last.values[last.values.length - 1] <= Math.max(1, value * ${TOLERANCE})) {
      last.values.push(value);
    } else {
      clusters.push({ values: [value] });
    }
  }
  const described = clusters.map((cl) => {
    const vs = cl.values;
    const members = chosen.glyphs.filter((g) => g.height >= vs[0] && g.height <= vs[vs.length - 1]);
    const tops = members.map((m) => m.top);
    const lefts = members.map((m) => m.left);
    return {
      medianHeight: vs[Math.floor(vs.length / 2)],
      minHeight: vs[0],
      maxHeight: vs[vs.length - 1],
      members: vs.length,
      meanArea: +(members.reduce((a, m) => a + m.area, 0) / Math.max(1, members.length)).toFixed(1),
      topSpan: tops.length ? Math.max(...tops) - Math.min(...tops) : 0,
      leftSpan: lefts.length ? Math.max(...lefts) - Math.min(...lefts) : 0
    };
  });
  const scored = described.filter((cl) => cl.members >= ${MIN_MEMBERS});

  return JSON.stringify({
    rect: { left: rl, top: rt, width: rw, height: rh },
    median: +median.toFixed(2),
    sd: +sd.toFixed(2),
    cut: +cut.toFixed(2),
    polarity,
    ink: {
      fraction: +chosen.fraction.toFixed(4),
      components: chosen.all.length,
      glyphs: chosen.glyphs.length
    },
    clusters: described,
    scoredClusters: scored,
    distinctSizes: scored.length
  });
})()`);

// The reference pauses its loop and presents an empty or half-drawn canvas, so
// a single capture is a race. A fixed ink floor cannot separate the two: a
// partial draw scored 0.0059 against a settled 0.135, which clears any floor low
// enough to admit a sparse spine. Require two consecutive captures that agree
// instead — that tests settlement directly rather than guessing a threshold, and
// it cannot silently accept a frame caught mid-draw.
const agrees = (a, b) =>
  a && b && !a.error && !b.error
  && a.distinctSizes === b.distinctSizes
  && a.ink.glyphs === b.ink.glyphs
  && Math.abs(a.ink.fraction - b.ink.fraction) <= 0.1 * Math.max(a.ink.fraction, b.ink.fraction);

let parsed = null;
let previous = null;
let attempts = 0;
while (attempts < 8) {
  attempts += 1;
  parsed = JSON.parse(await score(await capture()));
  if (parsed.error) break;
  if (agrees(previous, parsed)) break;
  previous = parsed;
  if (attempts < 8) await new Promise((r) => setTimeout(r, 1200));
}
if (parsed.error) {
  console.error(parsed.error);
  Deno.exit(4);
}
if (!agrees(previous, parsed)) {
  console.error(
    `no two consecutive captures agreed in ${attempts} attempts ` +
      `(last ink=${parsed.ink.fraction}, glyphs=${parsed.ink.glyphs}). The scene never settled; ` +
      `do not record this run.`
  );
  Deno.exit(6);
}
if (parsed.ink.fraction < MIN_INK || parsed.ink.fraction > MAX_INK) {
  console.error(
    `ink fraction ${parsed.ink.fraction} outside [${MIN_INK}, ${MAX_INK}] — the mask is not type. ` +
      `Adjust --ink-sigma or the case rect rather than trusting distinctSizes.`
  );
  Deno.exit(5);
}

const payload = {
  measuredAt: new Date().toISOString(),
  label: LABEL,
  url: URL_,
  renderer: renderer.renderer,
  software: renderer.software,
  captureAttempts: attempts,
  settings: {
    caseRect: CASE_RECT,
    inkSigma: INK_SIGMA,
    minArea: MIN_AREA,
    minHeight: MIN_HEIGHT,
    tolerance: TOLERANCE,
    minMembers: MIN_MEMBERS,
    polarity: POLARITY,
    scroll: SCROLL
  },
  ...parsed
};

console.log(`${LABEL} — ${URL_}`);
console.log(
  `rect ${parsed.rect.width}x${parsed.rect.height} @ ${parsed.rect.left},${parsed.rect.top}  ` +
    `median=${parsed.median} sd=${parsed.sd} cut=${parsed.cut}  ${parsed.polarity}`
);
console.log(
  `ink fraction=${parsed.ink.fraction}  components=${parsed.ink.components}  glyph-like=${parsed.ink.glyphs}`
);
console.log(`distinct type sizes (>=${MIN_MEMBERS} members): ${parsed.distinctSizes}`);
for (const cl of parsed.clusters) {
  const mark = cl.members >= MIN_MEMBERS ? "*" : " ";
  console.log(
    ` ${mark} h=${cl.minHeight}-${cl.maxHeight} (med ${cl.medianHeight})  n=${cl.members}  ` +
      `meanArea=${cl.meanArea}  topSpan=${cl.topSpan}  leftSpan=${cl.leftSpan}`
  );
}

if (OUT) {
  await Deno.writeTextFile(OUT, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`wrote ${OUT}`);
}

await cdp.close();
