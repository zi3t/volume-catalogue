# Reference extraction plan

A handoff for the next agent session. The job is **research, not construction**:
produce an Extraction Sheet describing how the reference scene actually works,
then a gap analysis against ours, then stop and let the user choose the build
scope. Do not start a rebuild. Do not modify `src/runtime/catalogue.ts`.

The user has explicitly deferred the build decision until the analysis exists.
Delivering code instead of analysis is the one way to fail this task.

## Read before you touch anything

1. `docs/scene-contract.md` — the authority. Read it end to end.
2. `docs/real-gpu-harness.md` — required before any lighting or material claim.
3. `.agents/skills/zi3t-press-scene/SKILL.md` — how to work on this scene.

Treat every summary as suspect, including this file. The contract is the only
authority on current architecture.

## What evidence exists now

Captured 2026-08-07 from `press.stripe.com`.

**Committed, and therefore safe to cite** — these are measurements and asset
metadata, holding none of Stripe's code or artwork:

| File | Contents |
|---|---|
| `docs/reference/manifest-20260807.json` | 250 URLs with SHA-256, mime type, class, size |
| `docs/reference/gl-readings-20260807.json` | Three GL runs: per-program draw counts, uniform values, texture sizes. Shader source deliberately excluded |

**Working capture, gitignored and disposable** — under `$ZI3T_TMP`, which is
`tmp/reference-20260807/` in the sibling `zi3t.io` checkout:

| File | Contents |
|---|---|
| `files/` | 135 behavioral files (JS/CSS/HTML) mirrored by host and path |
| `glframe-stripe-run{1,2,3}.json` | Raw GL captures, including shader source |

Cite the committed files. If you need the raw capture and it is gone, re-run the
tools — that is why they exist. Do not add a citation to a path under `$ZI3T_TMP`
in any committed document; a previous session did exactly that and the evidence
evaporated, which is why `scene-contract.md` once pointed at a script nobody
could find.

Three runs of the GL capture exist deliberately. **Diffing them is what showed
the material scalars are not global**; a single run reads as a clean material
table and is misleading. Always capture at least twice.

The July 2026-07-23 bundles in `tmp/stripe-bundles-20260723/` are still live at
`b.stripecdn.com/mkt-statics-srv/assets/<name>.js`, so the two builds can be
diffed directly. The current build has rotated hashes and gained components the
July capture never saw: `FilmOverlay`, `FilmDetailsHero`, `Menu`, `Loader`,
`Footer`, `FooterNewsletter`.

## Tools

Both are Deno, both run on `tests/cdp.mjs`, both need headful Chrome on 9226
(`docs/real-gpu-harness.md`). Port 8080 belongs to the user — never touch it.

```bash
# Point at the gitignored tmp/ of the sibling zi3t.io checkout.
ZI3T_TMP=../zi3t.io/tmp/reference-$(date +%Y%m%d)

npm run capture:reference -- --port=9226 --url=https://press.stripe.com/ --out="$ZI3T_TMP"
npm run capture:glframe   -- --port=9226 --url=https://press.stripe.com/ --out="$ZI3T_TMP/glframe-1.json"
```

The `npm run ... -- --flags` passthrough is verified working; both scripts also
run directly under `deno run --allow-net --allow-read --allow-write`.

Point either at `http://127.0.0.1:4173/press/` (with `wrangler dev` running) to
capture our own scene for comparison.

## Established facts — do not re-derive

Confirmed by runtime capture on Apple M1 hardware, agreeing with the contract's
independent bundle extraction:

- **The r151 π premultiply is real.** Divide any captured light colour by π to
  recover the authored intensity. Verified exact at two decimal places.
- **Ambient 0.52**, **left directional 0.6** — both recover exactly.
- **Spotlight**: captured `colour/π = [0.6, 0.7, 0.6]`, which is the contract's
  documented `0xCCEECC × 0.75` to full precision. `coneCos` → `acos` = 0.36 rad.
- Both directional light directions match the contract's documented positions
  once normalised.
- **The light rig is stable across runs.** Material scalars are not.

## Traps that cost a session already

1. **A flat uniform map blends programs.** The page runs nine WebGL programs and
   three.js names uniforms identically across them, so a single
   `spotLights[0].color` key gets overwritten by whichever drew last. The first
   capture attempt produced a plausible, entirely wrong material table this way.
   Attribute per program and sort by draw count; the cover material is the one
   carrying both `foilMap` and `spotLights[0]`.
2. **A program that never drew is not the material on screen** whatever its
   uniform names suggest. Check `draws`.
3. **All-1×1 texture uploads mean you hooked the wrong call.** Those are
   three.js placeholders. Real artwork arrives via `texStorage2D` +
   `texSubImage2D` on a WebGL2 context. The capture now hooks all four upload
   calls; if `sawRealTexture` is false the run is not usable for material work.
   A healthy run shows both — currently 7 placeholders and ~130 real uploads,
   dominated by 1920×1600 covers.
4. **Never read a texture width by scanning args for the first number.** These
   calls take `internalformat` before `width`, and both are numbers, so a scan
   records `GL_RGBA8` (32856) as a dimension and every upload looks huge and
   real. Index by call signature. This bug briefly made `sawRealTexture`
   trivially true, disabling the check in trap 3.
5. **Never call `getParameter(CURRENT_PROGRAM)` per draw.** It forces a
   synchronous GPU round-trip and hangs the page. Track `useProgram` instead.
6. **`.min.js` is our local naming, not Stripe's.** Their path is
   `<name>.js`. A 403 usually means a wrong path, not a rotated hash.
7. **No source maps ship** (verified 403). Use `webcrack` on captured bundles.
8. **Headless Chrome on macOS silently reports SwiftShader.** Findings taken
   there describe SwiftShader. Go headful.

## Deliverable 1 — the Extraction Sheet

Write to `docs/reference-extraction-sheet.md`. One section per layer. Every
entry cites its evidence: a manifest SHA-256, a GL capture path plus program id,
or a measured screenshot. **An entry without a citation does not go in.**

The seven-layer discipline in `.agents/skills/pixel-perfect` assumes a static
image; these layers are its equivalent for a runtime scene.

1. **Scene graph and camera** — object hierarchy, camera type and parameters,
   scene-level rotation, what is parented to what.
2. **Light rig** — largely done above; extend with the back light's colour and
   intensity, which is the one documented value still unrecovered.
3. **Material model** — the cover shader's inputs and how they combine. Name the
   uniform set and what each controls. See the open problem below.
4. **Geometry and proportion** — book dimensions, aspect ratios, spine and board
   construction, segment counts.
5. **Texture pipeline** — how covers are requested, sized, and uploaded; the
   Contentful variant scheme; texture unit assignment.
6. **Animation rig and timing** — entry choreography, hover, drag, release,
   route flight. Durations and easing, measured by trace, never by screenshot
   cadence.
7. **Scroll and navigation pipeline** — velocity mapping, damping, idle
   behaviour, history handling, address updates.
8. **Content architecture** — DOM structure, the two-document model, how routes
   assemble.

### The open problem worth solving first

Material scalars (`foilOpacity`, `glossOpacity`, `reflectiveness`, `shininess`,
`bumpScale*`) differ between runs because one program draws every book and the
capture keeps only the last value written. The contract's item 3 asks for
exactly this — "per-volume gloss, diffuse-base, cone, or roughness adjustments"
— so the reference genuinely varies material per book, and recovering the
per-book table is the single highest-value extraction available.

Extend `tests/capture-glframe.mjs` to snapshot the uniform set at each draw call
rather than keeping last-write-wins, keyed by draw index. Correlate draws to
books by the texture bound at that draw. This is an additive change to the
capture script and does not touch the scene.

The July build's `materialsArray` held 21 books, so 21 distinct parameter sets is
a reasonable starting expectation — but that evidence is stale, the build has
rotated, and the count may have changed. Treat it as a sanity check, not a
target.

Note what this experiment must actually settle. Two runs differing proves the
scalars are **not global**. It does not distinguish per-volume variation from
per-interaction-state variation (resting, hover, held), because the runs did not
scroll to the same place. Design the capture so the two are separable: record the
bound texture and the interaction state alongside each snapshot.

## Deliverable 2 — the gap analysis

Write to `docs/reference-gap-analysis.md`. Capture our own `/press/` with the
same tools, then for each Extraction Sheet layer record: reference value, our
value, whether the difference is visible, and the cost to close it.

Sort by visible difference per unit of work. Mark each row as one of:

- **Adopt** — a measurable fact we should translate proportionally.
- **Reject** — differs for a deliberate reason already recorded in the contract
  (the ZI3T book is genuinely wider and thicker; the covers are original art).
- **Undecided** — needs the user.

Do not silently reclassify an existing Reject as an Adopt. Several contract
entries record rejections with reasoning; if new evidence overturns one, say so
explicitly and cite it.

## Deliverable 3 — the decision memo

Two pages at most, at the end of the gap analysis. Present the build options
with honest cost and risk, and a recommendation:

- Re-derive the material and lighting layer only, keeping architecture and the
  QA gate.
- Full clean-room reimplementation against the Extraction Sheet.
- Extend scope to the components new since July.

Then stop and ask. The user decides.

## Guardrails

- **Research only.** No scene changes this session.
- **Deployment stays held.** A hold lifted in an earlier session does not carry
  forward.
- The QA gate at `tests/qa-press-scene.mjs` must keep passing; do not modify or
  relax an assertion. Any new check needs a geometry or timing companion — the
  gate has already passed a real regression twice by asserting state without
  geometry.
- Stripe's artwork, fonts, marketing copy, logo, and shader source are studied,
  never copied into the repo and never shipped. `capture-reference.mjs` enforces
  this by default: creative assets are recorded as URL plus SHA-256 with their
  bytes discarded unless `--fetch-creative` is passed. Keep it that way.
- Everything captured lives in gitignored `tmp/`. Never commit it.
- Cite manifest hashes, not bundle filenames — the filenames rotate.
