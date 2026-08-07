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
// STATUS: scores our own scene correctly. NOT yet calibrated for the reference.
// Case isolation samples the ground from pixel (4,4), which on press.stripe.com
// is the page chrome rather than the shelf ground, so nearly every pixel reads
// as ground and the largest component comes back as a ~17px fragment of the
// left index. Longer settle and a scroll into the shelf did not change that —
// the ground sample is the fault, not the timing. Fix by sampling the ground
// from inside the shelf band, or by passing an explicit case rect per side,
// before treating any cross-site number here as a comparison.
//
// Usage:
//   deno run --allow-net --allow-read --allow-write tests/measure-surface-response.mjs \
//     --url=https://press.stripe.com/ --label=reference
//   deno run ... --url='http://127.0.0.1:4173/press/?press-renderer=clean-room' --label=clean-room

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
// The reference runs an entry sequence and only paints cases once the shelf is
// in view, so a fixed wait at scroll 0 measures whatever is on screen instead —
// a first attempt scored a 17x4 fragment this way. Scroll into the shelf, then
// settle long enough for the entry to finish and the damped pose to stop.
await cdp.evaluate(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(2500);
  window.scrollTo({ top: ${Number(args.get("scroll") ?? 900)}, behavior: "instant" });
  await sleep(${Number(args.get("settle") ?? 6500)});
  return "settled";
})()`);

const path = await Deno.makeTempFile({ suffix: ".png" });
await cdp.screenshot(path);
const bytes = await Deno.readFile(path);
await Deno.remove(path).catch(() => {});
let binary = "";
for (let i = 0; i < bytes.length; i += 0x8000) {
  binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
}
const b64 = btoa(binary);

const metrics = await cdp.evaluate(`(async () => {
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

  // Ground sampled from a corner; cases are whatever departs from it. Restrict
  // to the shelf band so route copy and the rail stay out of the statistics.
  const gi = (4*w + 4)*4;
  const g = [d[gi], d[gi+1], d[gi+2]];
  const y0 = Math.floor(h*0.18), y1 = Math.floor(h*0.78);

  const mask = new Uint8Array(w*h);
  for (let y=y0; y<y1; y++) for (let x=0; x<w; x++) {
    const i=(y*w+x)*4;
    if (Math.abs(d[i]-g[0])+Math.abs(d[i+1]-g[1])+Math.abs(d[i+2]-g[2]) > 26) mask[y*w+x]=1;
  }

  // Largest connected case, so one book is scored rather than the whole stack.
  const seen = new Uint8Array(w*h), st = new Int32Array(w*h);
  let best = null;
  for (let s=0;s<w*h;s++) {
    if (!mask[s]||seen[s]) continue;
    let sp=0; st[sp++]=s; seen[s]=1;
    const px=[]; let l=1e9,t=1e9,r=-1,bt=-1;
    while(sp>0){
      const p=st[--sp], y=(p/w)|0, x=p-y*w;
      px.push(p); if(x<l)l=x; if(x>r)r=x; if(y<t)t=y; if(y>bt)bt=y;
      if(x+1<w&&mask[p+1]&&!seen[p+1]){seen[p+1]=1;st[sp++]=p+1;}
      if(x-1>=0&&mask[p-1]&&!seen[p-1]){seen[p-1]=1;st[sp++]=p-1;}
      if(y+1<h&&mask[p+w]&&!seen[p+w]){seen[p+w]=1;st[sp++]=p+w;}
      if(y-1>=0&&mask[p-w]&&!seen[p-w]){seen[p-w]=1;st[sp++]=p-w;}
    }
    if(!best||px.length>best.px.length) best={px,l,t,r,bt};
  }
  if(!best) return JSON.stringify({error:"no case found"});

  const L = best.px.map((p) => lum(p*4));
  L.sort((a,b)=>a-b);
  const pct = (q) => L[Math.min(L.length-1, Math.floor(q*L.length))];
  const mean = L.reduce((a,b)=>a+b,0)/L.length;
  const sd = Math.sqrt(L.reduce((a,b)=>a+(b-mean)*(b-mean),0)/L.length);

  // Rake: how bright the top of the distribution gets, and how little of the
  // case it covers. A narrow bright highlight and a broad dim wash differ here
  // even when their mean luminance matches.
  const hiCut = mean + 2*sd;
  const highlightArea = L.filter((v)=>v>hiCut).length / L.length;

  // Weave: mean |Laplacian| inside the case. Fine visible cloth raises it;
  // a muddy uniform surface does not.
  let lap=0, lapN=0;
  for (const p of best.px) {
    const y=(p/w)|0, x=p-y*w;
    if(x<1||y<1||x>=w-1||y>=h-1) continue;
    if(!mask[p-1]||!mask[p+1]||!mask[p-w]||!mask[p+w]) continue;
    lap += Math.abs(4*lum(p*4) - lum((p-1)*4) - lum((p+1)*4) - lum((p-w)*4) - lum((p+w)*4));
    lapN++;
  }

  // Ink contrast: darkest decile against the case's own median cloth.
  const inkContrast = (pct(0.5) + 1) / (pct(0.05) + 1);

  return JSON.stringify({
    case: { left: best.l, top: best.t, width: best.r-best.l+1, height: best.bt-best.t+1, pixels: L.length },
    luminance: {
      p05: +pct(0.05).toFixed(2), median: +pct(0.5).toFixed(2),
      p95: +pct(0.95).toFixed(2), p99: +pct(0.99).toFixed(2),
      mean: +mean.toFixed(2), sd: +sd.toFixed(2)
    },
    rake: { peak: +pct(0.99).toFixed(2), highlightArea: +highlightArea.toFixed(4) },
    weave: { laplacian: +(lap/Math.max(1,lapN)).toFixed(3), samples: lapN },
    ink: { contrast: +inkContrast.toFixed(3) }
  });
})()`);

const payload = {
  measuredAt: new Date().toISOString(),
  label: LABEL,
  url: URL_,
  renderer: renderer.renderer,
  metrics: JSON.parse(metrics)
};
console.log(JSON.stringify(payload, null, 2));
if (OUT) await Deno.writeTextFile(OUT, JSON.stringify(payload, null, 2));

await cdp.close();
