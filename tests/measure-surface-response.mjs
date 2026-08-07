// Surface-response metrics for the audit's §6 rows.
//
// "Cloth reads muddy", "the rake is broad and dim", "weak leaf separation" and
// "ink is low contrast" are the last open parity rows, and each is currently a
// judgement. Each is also a statistic over the pixels inside the case, so it
// can be scored on both sides and compared.
//
// Nothing here copies the reference. It reads aggregate statistics — percentile
// luminance, highlight area fraction, Laplacian energy, ink/cloth contrast —
// from a capture that stays in the untracked scratch tree. Only the numbers
// leave this script, which is the same boundary capture-reference.mjs enforces.
//
// Reading this output, in order of what has burned a session:
//
// 1. CHECK `case.fill` BEFORE BELIEVING ANY STATISTIC. A bump scale raised too
//    far crushed the case into the dark ground; only ~2.5% of the rect survived,
//    and that fragment scored sigma 38.5 and Laplacian 20.8 — better than the
//    reference on both. `--min-fill` (default .8) now fails the run instead, and
//    gates the un-eroded mask only: a 3px erode on 780x128 mechanically retains
//    94.6%, so gating the eroded pass would fire on arithmetic, not a defect.
//
// 2. THE TWO SIDES MUST BE MASKED THE SAME WAY. Ground defaulted to pixel (4,4),
//    which on press.stripe.com is page chrome rather than shelf ground. The
//    2026-08-07 readings kept 98.9% of the reference rect against 97.8% of ours,
//    so the reference counted dark page background in the rect corners that we
//    dropped — 1-2% of the rect, enough to inflate sigma, not enough to explain
//    p05 66.89 at rank ~4940 of 98786. Pass `--ground=r,g,b` per side.
//
// 3. `eroded` AND `ring` SAY WHETHER A DARK TAIL IS REAL. `ring` is the 3px
//    perimeter that erosion removes — where background contamination lives. If
//    p05 sits in `ring` and `eroded` comes back bright, the tail is masking, not
//    surface. `rows` catches the same thing spatially: a background band holds
//    its pixel count while its mean collapses.
//
// Case rects come from measure-visual-parity.mjs, which locates cases correctly
// on both sides. This script only scores what it is handed.
//
// Usage:
//   deno run --allow-net --allow-read --allow-write tests/measure-surface-response.mjs \
//     --url=https://press.stripe.com/ --label=reference --case-rect=394,332,780,128
//   deno run ... --url='http://127.0.0.1:4173/press/' --label=clean-room \
//     --case-rect=393,332,782,128 --ground=32,24,21

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
const MIN_FILL = Number(args.get("min-fill") ?? 0.8);
const ERODE = Number(args.get("erode") ?? 3);
const GROUND = (args.get("ground") ?? "").split(",").map(Number).filter((n) => !Number.isNaN(n));

if (!URL_) {
  console.error("--url is required");
  Deno.exit(1);
}

const cdp = await connect(PORT, { width: 1568, height: 894 });

const renderer = await cdp.rendererInfo();
if (renderer.software) {
  console.error("REFUSING: software renderer. Surface response measured here is SwiftShader's.");
  await cdp.close();
  Deno.exit(2);
}

await cdp.navigate(URL_);
// `desktop.firstRestBook` is measured at scroll 0 — measure-visual-parity.mjs
// gives that state no scroll and no prepare step, and scroll 0 reproduces the
// recorded 2026-08-07 clean-room reading exactly (97946 px, sd 19.11, ink
// 1.154). The old default of 900 landed mid-journey behind a dark scrim and
// scored a different scene state entirely.
await cdp.evaluate(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(2500);
  window.scrollTo({ top: ${Number(args.get("scroll") ?? 0)}, behavior: "instant" });
  await sleep(${Number(args.get("settle") ?? 6500)});
  return "settled";
})()`);

// The reference's render loop pauses 1200 ms after the last scroll or pointer
// movement (scene contract §7 — it does not render at idle), so after a long
// settle its canvas is blank and the rect scores as pure ground. That is a race,
// not a stable property: two parity runs minutes apart returned 98786 px and
// then `book: null` on the same URL. Nudge scroll and pointer, then capture
// inside the 1200 ms window, and retry while the rect comes back empty.
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
  const lum = (i) => 0.2126*d[i] + 0.7152*d[i+1] + 0.0722*d[i+2];

  // The case rect is supplied per side rather than discovered. Isolating it by
  // departure from a corner-sampled ground worked here and failed on the
  // reference, where the corner is page chrome — every pixel then reads as
  // ground and the largest component is a fragment of the left index.
  // measure-visual-parity.mjs already locates cases correctly on both sides,
  // so its box is the input and this script only scores what is inside it.
  const rect = ${JSON.stringify(
    (args.get("case-rect") ?? "").split(",").map(Number).filter((n) => !Number.isNaN(n))
  )};
  if (rect.length !== 4) return JSON.stringify({ error: "--case-rect=left,top,width,height required" });
  const sc = w / 1568;
  const [rl, rt, rw, rh] = rect.map((v) => Math.round(v * sc));

  // Ground defaults to the page corner. Sampling just above the case looks
  // safer and is not: the shelf stacks cases tightly, so ten pixels above one
  // case is the next case, and matching against it discards most of the surface
  // — the reference scored sigma 0.39 over a fifth of the rect that way. But the
  // corner is page chrome on the reference and shelf ground on ours, which is
  // the asymmetry note 2 describes, so --ground overrides it per side.
  const explicitGround = ${JSON.stringify(GROUND)};
  const gi = (4*w + 4)*4;
  const g = explicitGround.length === 3 ? explicitGround : [d[gi], d[gi+1], d[gi+2]];

  const px = [];
  const mask = new Uint8Array(w*h);
  for (let y=Math.max(0,rt); y<Math.min(h,rt+rh); y++) {
    for (let x=Math.max(0,rl); x<Math.min(w,rl+rw); x++) {
      const i=(y*w+x)*4;
      if (Math.abs(d[i]-g[0])+Math.abs(d[i+1]-g[1])+Math.abs(d[i+2]-g[2]) <= 26) continue;
      mask[y*w+x]=1; px.push(y*w+x);
    }
  }
  if(!px.length) return JSON.stringify({error:"case rect holds no non-ground pixels", ground:g});

  // Erosion by Chebyshev radius, run separably. Pixels outside the rect are 0,
  // so this also trims the rect perimeter — which is the point: that ring is
  // where background contamination sits.
  const erodeMask = (src, radius) => {
    if (radius <= 0) return src;
    const passA = new Uint8Array(w*h), out = new Uint8Array(w*h);
    for (const p of px) {
      const y=(p/w)|0, x=p-y*w;
      let keep = 1;
      for (let k=-radius; k<=radius && keep; k++) {
        const xx = x+k;
        if (xx<0 || xx>=w || !src[y*w+xx]) keep = 0;
      }
      passA[p] = keep;
    }
    for (const p of px) {
      if (!passA[p]) continue;
      const y=(p/w)|0;
      let keep = 1;
      for (let k=-radius; k<=radius && keep; k++) {
        const yy = y+k;
        if (yy<0 || yy>=h || !passA[yy*w + (p-y*w)]) keep = 0;
      }
      out[p] = keep;
    }
    return out;
  };

  // The five §6 metrics over an arbitrary pixel set. Laplacian needs the mask
  // its set came from so it never differences across a boundary.
  const scoreSet = (pixels, m) => {
    if (!pixels.length) return null;
    const L = pixels.map((p) => lum(p*4));
    L.sort((a,b)=>a-b);
    const pct = (q) => L[Math.min(L.length-1, Math.floor(q*L.length))];
    const mean = L.reduce((a,b)=>a+b,0)/L.length;
    const sd = Math.sqrt(L.reduce((a,b)=>a+(b-mean)*(b-mean),0)/L.length);

    // Rake: how bright the top of the distribution gets, and how little of the
    // case it covers. A narrow bright highlight and a broad dim wash differ here
    // even when their mean luminance matches. Note this threshold is relative —
    // it is a distribution-shape statistic, not an absolute area.
    const hiCut = mean + 2*sd;
    const highlightArea = L.filter((v)=>v>hiCut).length / L.length;

    // Weave: mean |Laplacian| inside the case. Fine visible cloth raises it;
    // a muddy uniform surface does not.
    let lap=0, lapN=0;
    for (const p of pixels) {
      const y=(p/w)|0, x=p-y*w;
      if(x<1||y<1||x>=w-1||y>=h-1) continue;
      if(!m[p-1]||!m[p+1]||!m[p-w]||!m[p+w]) continue;
      lap += Math.abs(4*lum(p*4) - lum((p-1)*4) - lum((p+1)*4) - lum((p-w)*4) - lum((p+w)*4));
      lapN++;
    }

    // Ink contrast: darkest decile against the case's own median cloth.
    const inkContrast = (pct(0.5) + 1) / (pct(0.05) + 1);

    // 32 bins over 0..255, so the shape behind highlightArea is visible rather
    // than inferred from four percentiles.
    const hist = new Array(32).fill(0);
    for (const v of L) hist[Math.min(31, Math.max(0, Math.floor(v/8)))] += 1;

    return {
      pixels: L.length,
      luminance: {
        p05: +pct(0.05).toFixed(2), median: +pct(0.5).toFixed(2),
        p95: +pct(0.95).toFixed(2), p99: +pct(0.99).toFixed(2),
        mean: +mean.toFixed(2), sd: +sd.toFixed(2)
      },
      rake: { peak: +pct(0.99).toFixed(2), highlightArea: +highlightArea.toFixed(4) },
      weave: { laplacian: +(lap/Math.max(1,lapN)).toFixed(3), samples: lapN },
      ink: { contrast: +inkContrast.toFixed(3) },
      histogram: hist
    };
  };

  const eroded = erodeMask(mask, ${ERODE});
  const interiorPx = px.filter((p) => eroded[p]);
  const ringMask = new Uint8Array(w*h);
  const ringPx = [];
  for (const p of px) if (!eroded[p]) { ringMask[p]=1; ringPx.push(p); }

  // Per-row masked count and mean luminance. A background band or corner wedge
  // holds its pixel count while its mean collapses; contiguous dark surface
  // content does not. Bounding boxes cannot tell those apart — both bbox to
  // nearly the whole rect.
  const rows = [];
  for (let y=Math.max(0,rt); y<Math.min(h,rt+rh); y++) {
    let n=0, sum=0;
    for (let x=Math.max(0,rl); x<Math.min(w,rl+rw); x++) {
      const p=y*w+x;
      if(!mask[p]) continue;
      n++; sum += lum(p*4);
    }
    rows.push({ y, n, mean: n ? +(sum/n).toFixed(1) : 0 });
  }

  const rectArea = Math.min(w,rl+rw)-Math.max(0,rl);
  const rectRows = Math.min(h,rt+rh)-Math.max(0,rt);
  return JSON.stringify({
    case: {
      left: rl, top: rt, width: rw, height: rh,
      pixels: px.length,
      rectPixels: rectArea*rectRows,
      fill: +(px.length/(rectArea*rectRows)).toFixed(4),
      ground: g,
      groundSource: explicitGround.length === 3 ? "--ground" : "corner(4,4)"
    },
    ...scoreSet(px, mask),
    eroded: { radius: ${ERODE}, ...scoreSet(interiorPx, eroded) },
    ring: { ...scoreSet(ringPx, ringMask) },
    rows
  });
})()`);

// An empty rect means the scene had not drawn, which for the reference is the
// idle-pause race above rather than a defect. Retry those. A rect that draws but
// comes back under the floor is a real collapse and must not be retried away.
let parsed = null;
let attempts = 0;
while (attempts < 5) {
  attempts += 1;
  parsed = JSON.parse(await score(await capture()));
  if (!parsed.error && parsed.case.fill >= 0.05) break;
  if (attempts < 5) await new Promise((r) => setTimeout(r, 1200));
}
const payload = {
  measuredAt: new Date().toISOString(),
  label: LABEL,
  url: URL_,
  renderer: renderer.renderer,
  minFill: MIN_FILL,
  scroll: Number(args.get("scroll") ?? 0),
  captureAttempts: attempts,
  metrics: parsed
};
if (OUT) await Deno.writeTextFile(OUT, JSON.stringify(payload, null, 2));
await cdp.close();

if (parsed.error) {
  console.error(`FAIL: ${parsed.error}`);
  Deno.exit(3);
}

const row = (name, m) =>
  `${name.padEnd(9)} px=${String(m.pixels).padStart(6)}  ` +
  `p05=${String(m.luminance.p05).padStart(6)} med=${String(m.luminance.median).padStart(6)} ` +
  `p99=${String(m.luminance.p99).padStart(6)} sd=${String(m.luminance.sd).padStart(6)}  ` +
  `lap=${String(m.weave.laplacian).padStart(6)} hi=${String(m.rake.highlightArea).padStart(6)} ` +
  `ink=${String(m.ink.contrast).padStart(5)}`;

console.log(`\n${LABEL} — ${URL_}`);
console.log(`case ${parsed.case.width}x${parsed.case.height} @ ${parsed.case.left},${parsed.case.top}  ` +
  `fill=${parsed.case.fill}  ground=[${parsed.case.ground}] via ${parsed.case.groundSource}`);
console.log(row("full", parsed));
console.log(row(`eroded${parsed.eroded.radius}`, parsed.eroded));
if (parsed.ring.pixels) console.log(row("ring", parsed.ring));

// The darkest rows, which is where a background band or corner wedge shows up:
// its pixel count stays full while its mean collapses.
const darkest = [...parsed.rows].sort((a, b) => a.mean - b.mean).slice(0, 5);
console.log(`darkest rows: ${darkest.map((r) => `y${r.y} n=${r.n} L=${r.mean}`).join("  ")}`);

// Trap 3: a bump scale raised too far crushed the case into the ground and the
// surviving 2.5% fragment outscored the reference on sigma and Laplacian. Every
// statistic above is void below this floor, so fail rather than print it as a
// result. Gates the un-eroded mask only — erosion trims the perimeter by
// construction.
if (parsed.case.fill < MIN_FILL) {
  console.error(
    `\nFAIL: case fill ${parsed.case.fill} is below --min-fill ${MIN_FILL}. ` +
    `The rect kept ${parsed.case.pixels}/${parsed.case.rectPixels} px, so the case has ` +
    `collapsed into the ground and every statistic above describes a fragment.`
  );
  Deno.exit(4);
}
console.log("");
