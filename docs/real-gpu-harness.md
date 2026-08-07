# Real-GPU verification harness

The skill has always required physical-GPU verification (see `SKILL.md` §4 and
remaining-work item 6) without saying how to get one. This is the how.

Everything here is plain shell plus Deno so it runs under any agent harness.

## The trap this document exists to prevent

**On macOS, headless Chrome falls back to software rasterisation.** A
`--headless=new` instance reports a SwiftShader renderer even when passed
`--enable-gpu`, because there is no window surface to bind a GPU context to.
Every lighting, material, sheen, depth and smoothness observation taken there
describes SwiftShader, not the scene a visitor sees.

A **headful** browser gets the real device. The window does not need to become
frontmost: the clean-room gates launch Chrome hidden, keep their CDP targets in
the background, and disable background-frame throttling so animation timing
still describes the scene.

Do not iterate headless GPU flags looking for a combination that works. On macOS
that search does not converge, and each round costs a review cycle. Use a
hidden headful browser for automation and a visible headful browser for manual
review.

This trap is expensive because it is silent: the page renders, the screenshots
look plausible, the gate passes, and the conclusions are void.

## Routine clean-room gates

Start the assembled Worker site, then run any package gate directly:

```bash
npx wrangler dev --port 4173 --ip 127.0.0.1

npm run qa:clean-room
npm run qa:clean-room:interaction
npm run qa:clean-room:routing
npm run qa:clean-room:volume
npm run qa:clean-room:journey
```

`tests/run-quiet-gpu-gate.mjs` creates a temporary Chrome profile and random
debugging port, launches the app with macOS `open -gjn`, and verifies the GL
renderer before starting the gate. `-j` keeps the app hidden and `-g` avoids
activation. Background timer, renderer, and occluded-window throttling are
disabled so requestAnimationFrame remains measurable. The browser and profile
are removed after the run, including failure paths.

The targets created by `tests/cdp.mjs` use `background: true`, so repeated QA
runs do not steal keyboard focus or interrupt another application. This is
still headful Chrome and still real Metal; it is not headless mode.

## Visible manual review

```bash
# 1. The site. wrangler is required, not optional: the volume sections are
#    assembled by the worker, so a plain static server serves an empty document.
npx wrangler dev --port 4173 --ip 127.0.0.1

# 2. Visible headful Chrome with remote debugging on its own profile.
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9226 \
  --user-data-dir=/tmp/zi3t-chrome-gpu \
  --no-first-run \
  --no-default-browser-check \
  about:blank
```

Use this visible instance only when a person wants to watch the frames under
review or run an exploratory probe. Routine package gates should use the quiet
launcher above.

`--user-data-dir` keeps this instance separate from the browser someone is
actually using, so cleanup never closes their tabs. Kill only your own:

```bash
pkill -f "zi3t-chrome-gpu"
```

## Confirm the renderer before trusting any visual finding

This gate is not optional. Run it first, every session.

```bash
deno run --allow-net --allow-read --allow-write - <<'EOF'
import { connect } from "./packages/volume-catalogue/tests/cdp.mjs";
const cdp = await connect("9226");
console.log(await cdp.rendererInfo());
await cdp.close();
EOF
```

Accept only a hardware string. Reject anything containing `swiftshader`,
`llvmpipe` or `softwarerasterizer`.

- Verified good, 2026-07-31, Apple M1 Pro headful:
  `ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Unspecified Version)`
- Verified bad: any `--headless=new` instance on the same machine.

`cdp.requireHardwareGpu()` throws on software GL — call it at the top of a probe
so a run cannot quietly report the wrong thing.

## Ports

| Port | Owner | Notes |
| --- | --- | --- |
| 4173 | `npx wrangler dev` | Worker assembles sections; a static server will not do |
| 9225 | gate Chrome | used by `qa-press-scene.mjs` — **also headful** |
| 9226 | review Chrome | headful, real GPU |
| random loopback port | `qa:clean-room*` | hidden headful Chrome, allocated and closed per gate |
| 8080 | **the user's own server** | never start, stop or assume anything about it |

## The gate needs the real GPU too

`qa-press-scene.mjs` is calibrated for hardware. Launch a headful browser on
9225 exactly as above and point the gate at it.

On a software-GL headless shell the gate throws "Press scene did not become
ready" before its first assertion, which reads exactly like a code regression
and is not one: the scene is healthy at that moment (`press-scene-ready` set,
hold caption present, five volumes, canvas present, zero errors), but
`document.readyState === 'complete'` lands at ~27.8s against a 15s budget,
because shader compilation saturates the main thread and delays the `load`
event.

The budget is correct. Do not raise it to accommodate software GL, and do not
report such a run as a failing gate.

Last known good: **47/47, zero runtime errors, 2026-07-31**, headful on Apple
M1 Pro under `/press/`, after the portable package extraction. Accepted
evidence: `/tmp/zi3t-volume-package-qa-v2`. The original 45 scene checks still
pass; two route-boundary checks also protect the lightweight root and
standalone project documents. The earlier 45/45 matches commit `7b9fb6d` on
2026-07-29.

## Measurement discipline

**`Page.captureScreenshot` blocks.** A loop that alternates evaluate and capture
measures the capture round-trip, not the scene. Screenshot cadence is not a
timeline, and a gap between two captures is not evidence of a stall.

This is not hypothetical. On 2026-07-31 a probe of first load appeared to show a
~1.6 s window with no samples. The probe interleaved blocking captures, so the
number described the harness. It was recorded as *unmeasured* rather than as a
defect, specifically so no later pass would go hunting a bug that may not exist.

For anything time-shaped — entry choreography, flight duration, idle pause,
frame cost — use a trace:

```js
const events = await cdp.trace(async () => {
  await cdp.navigate("http://127.0.0.1:4173/press/");
  await cdp.waitFor("document.documentElement.classList.contains('press-entry-complete')");
});
```

or record the window in real time and read the recording.

Rules that follow from this:

- Screenshots are for **appearance**. Traces and recordings are for **timing**.
- Say which method produced each number when reporting.
- Wait for a state; never sample a damped state on a fixed delay.
- A number taken on software GL is not comparable to one taken on hardware. Do
  not put them in the same table.

## What to re-check on real hardware

The gate must run on hardware GL. The 2026-07-31 package-extraction pass covered
the full state/geometry sequence on Apple Metal; repeat these after relevant
changes, highest value first:

1. First-load entry order and smoothness (trace, not screenshots).
2. The four-light rig, cloth/foil response and per-volume gloss — remaining-work
   item 3 is explicitly waiting on this.
3. Scroll and address behaviour through the volumes document.
4. Deep-link composition at a book URL, and a rapid Back during the flight.
5. Escape returning to the catalogue.

One additional harness edge is now confirmed: `Page.captureScreenshot` can
emit a synthetic `pointermove` at the physical cursor with `buttons: 0`.
Screenshots taken while a pointer is held must not be interpreted as drag
input. The scene enforces the correct contract—a drag transition requires the
primary button to remain down.

## Gate blind spot to respect

The QA gate passed a real regression twice because its checks asserted *state*
without asserting *geometry*: an open route had left the canvas positioned at
`top: -571px`, and every state assertion still read as correct.

When adding a check, give it a geometry or timing companion — that a thing is
visible and where it actually sits. Never relax an assertion to turn a run
green; a behaviour change earns a new assertion instead.
