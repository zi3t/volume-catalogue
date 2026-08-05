# ZI3T Press scene contract

## Purpose

This is the continuation record for the standalone interactive book catalogue
under `/press/`. The site root is a separate lightweight access point. This
record separates confirmed behavior from approximation so future work starts
from the current evidence.

Historical checkpoints are retained as provenance, but their old path names
and pre-renderer-gate SwiftShader/headless visual claims do not override the
current file map or hardware-only verification rule below.

## Authoritative evidence

Use sources in this order:

1. User-supplied screenshots or recordings at a known viewport.
2. The current live Stripe Press interaction: https://press.stripe.com/
3. Stripe's current page and canvas bundles when implementation behavior is ambiguous (hashes rotated; verified live 2026-07-23 and fully dissected — see "Extracted reference facts"):
   - https://b.stripecdn.com/mkt-statics-srv/assets/v1-Canvas-J3BILW2E.js — facade; real code in `v1-chunk-J2DM35LM.js` (scene controller), `v1-chunk-DDDINZUK.js` (OBJLoader + embedded book OBJ + cover GLSL), `v1-chunk-HT3MKZNK.js` (podcast/medallion sub-scene), `v1-chunk-2PON3HJD.js` (three.js r151)
   - https://b.stripecdn.com/mkt-statics-srv/assets/v1-Page-UQGXZSLU.js — PressHomepage controller (scroll, drag, twirl, control panel)
   - The 2026-07-23 page capture (script registry, 21-book `materialsArray`, debug ControlPanel DOM with slider domains) is archived locally at `tmp/stripe.js`; beautified bundles at `tmp/stripe-bundles-20260723/` (untracked scratch — never commit or serve)
4. The Reddit discussion is useful context, not authoritative implementation evidence: https://www.reddit.com/r/web_design/comments/q2lpxl/how_did_stripe_go_about_implementing_something/

The Reddit diagnosis is directionally correct: the surface is a persistent WebGL scene with client-side URL/history control. The exact constants below were confirmed from the official bundles, not inferred from Reddit.

## File map

- `public/index.html` — lightweight no-JavaScript landing and access point.
- `public/press/index.html` — semantic catalogue, real anchors, rail controls, fallback content.
- `packages/volume-catalogue/src/runtime/catalogue.ts` — Three.js scene,
  per-volume authored material profiles/maps, geometry, lighting, scroll,
  pointer state, history, and route transition.
- `packages/volume-catalogue/src/content/volumes.ts` — ordered shared route and
  content manifest.
- `packages/volume-catalogue/src/styles/` — package-owned base, fallback,
  calibration, and section styles.
- `packages/volume-catalogue/src/assets/` — original ZI3T cover artwork and CC0
  surface scans, with provenance.
- `packages/volume-catalogue/src/adapters/cloudflare-worker.ts` — portable
  server-side content assembly.
- `packages/volume-catalogue/tests/qa-press-scene.mjs` — deterministic
  interaction and regression gate; `tests/cdp.mjs` is the one-off probe driver.
- `public/press-assets/` — generated package output; rebuild with
  `npm run build:site`, never edit it directly.
- `worker/index.js` — thin site binding for the package's Cloudflare adapter.

## Sacred boundaries

- `.press-volume` anchors, hrefs, labels, focus rings, and keyboard activation remain functional.
- `/` remains the lightweight access point and never loads Press scene code.
- `/refly/`, `/arm/`, and `/telemetry/` remain genuine standalone documents.
  The Worker only assembles `/press/` and `/press/<book>/`.
- The DOM catalogue remains readable if WebGL fails.
- Existing project destinations and project count remain genuine. Never add fake books merely to copy Stripe's nineteen-item scroll length.
- After the fifth volume, only genuine ZI3T editorial/closing content may extend the journey.
- A drag never activates a link; a click without drag does.
- Browser Back and Forward must work during and after the opening animation.
- `prefers-reduced-motion` and layouts below 900px do not run the pointer-held choreography.
- Do not deploy until the user explicitly lifts the deployment hold.
- Do not copy Stripe's logo, book artwork, marketing copy, or proprietary textures.

## Extracted reference behavior

### Official scene constants

- Camera: `fov: 12`, nominal position `y: 6.5`, `z: 100`, scene rotation `x: -0.06` in Stripe's coordinate system.
- Normal book depth position: `z: -3`.
- Hover book depth position: `z: 6`.
- Drag movement threshold: `> 4px`.
- Pointer rotation sensitivity: `.003 radians per pixel`.
- Dragging gap between nonselected books: `30` scene units.
- Ambient light: white, intensity `.52`.
- Back light: selected book background, intensity `.5`, position `(-32, 12, -16)`.
- Left light: white, intensity `.6`, position `(4, 9.5, 4.5)`.
- Spotlight: color `13430476`, angle `.36`, position `(24, 5.4, 1)`, intensity `.75`, active `.05`, penumbra `1`, target `(-6, -4, -6.5)`.

Coordinate values are reference facts, not copy-paste values: ZI3T uses pixel-like world units and must translate them proportionally.

### Pointer state sequence

1. **Hover:** selected book draws toward the viewer; the stack stays planted.
2. **Pressed, no movement:** selected book remains at hover depth; other books isolate/fade; URL does not change.
3. **Dragging after 4px:** selected mesh moves closer, yaw/pitch follow pointer displacement, background becomes the selected cloth color, key light sweeps across the book, and the caption appears.
4. **Release at 80ms:** selected book and cloth background remain almost fully presented; other books remain absent.
5. **Release at ~880ms:** background, lighting, book pose, masthead, and stack have returned to idle.
6. **Click without drag:** normal SPA-style book navigation begins.

Stripe's source mapping is approximately:

```text
rotationX = (mouseX - mouseDownX) * .003
rotationY = normalRotationY - (mouseY - mouseDownY) * .003
wasDragging = distance > 4px
```

ZI3T maps the same intent to its differently oriented geometry. Do not force the literal axes if that produces the wrong visual pose.

### Route-transition sequence

The current Stripe bundle does not use a short high-overshoot route spring. Its
book interpolation starts at zero, adds approximately `.006` per reference
frame, caps at `.15`, and then converges toward the active or shelf pose. At
1568×894, isolated live captures at 80, 220, 420, 700, 1100, 1600, and 2200ms
show the selected book still making meaningful forward progress through roughly
1600ms and settled by roughly 2200ms. On Back, the detail surface leaves first,
the selected book remains dominant through the early return, and neighboring
books rebuild the shelf during the latter half. Treat those capture times as
phase evidence rather than universal wall-clock constants; the source curve is
frame-rate corrected and software WebGL capture can delay presentation.

## Extracted reference facts — 2026-07-23 Canvas/Page bundles

Ground truth from the live `v1-chunk-J2DM35LM.js` (scene), `v1-chunk-DDDINZUK.js` (GLSL + OBJ), `v1-chunk-2PON3HJD.js` (three.js r151), and `v1-Page-UQGXZSLU.js` (controller). Line references are into the beautified copies in `tmp/stripe-bundles-20260723/*.pretty.js`. This supersedes all earlier guesses about environment, shadows, and tone mapping.

### 1. There is no environment, no shadows, no tone mapping

- **No IBL of any kind.** Zero hits for envMap/PMREM/cube/equirect/matcap in all Canvas chunks. Every prior "what feeds the foil reflections?" guess (PMREM room, photographic reflection maps as env textures) was wrong.
- **No shadow code of any kind.** No shadow maps, no contact shadows, no AO. Grounding comes from the dark page background, the covers' own Phong shading, and the back light lerping toward the active book's palette.
- **No tone mapping and no output encoding.** The renderer never sets `toneMapping`/`outputEncoding`; r151 defaults apply: `NoToneMapping`, `outputEncoding = LinearEncoding` (2PON3HJD.pretty.js:15996). Textures never get an encoding either (J2DM35LM:1622-1638). The whole pipeline is the classic non-color-managed one: sRGB texture bytes are shaded raw and land on screen unconverted. `canvasProperties.exposure: 1` is a plain multiplier on spotlight intensity (J2DM35LM:1595-1602), not renderer exposure.

### 2. Light-unit law (legacy lights ×π)

- r151 defaults `useLegacyLights = true` (2PON3HJD:15997). In `WebGLLights.setup`, every ambient/directional/spot/point light uniform is `color × intensity × π` when legacy (2PON3HJD:13221, 13233, 13248, 13280).
- With `LEGACY_LIGHTS` defined and light `distance = 0` (the scene never sets distance), `getDistanceAttenuation` returns `1.0` — **no distance falloff for the spotlight** (2PON3HJD:6985).
- Consequence for ZI3T (three r171, physical lights only): reproducing reference brightness requires intensity ×π (ambient .52→1.634, back .5→1.571, key .6→1.885, spot .75→2.356 idle / .05→.157 held) **and** `decay = 0` on the spotlight, else r171's inverse-square falloff divides the rake by distance² and no intensity constant can compensate. This is the quantitative root of the historical "tuned five times, still flat" cycle.

### 3. Cover material: custom Phong ShaderMaterial (the entire depth look)

`createBookMaterial` (J2DM35LM:1664-1708): `ShaderMaterial` with `lights: true`, defines `USE_UV/USE_MAP/USE_BUMPMAP`, derivatives on, uniforms merged with `UniformsLib.lights`. Defaults: `specular #ffffff`, `shininess 10`, `reflectiveness .1`, `thickness 1.4`, base maps `shared_diffuse_overlay`/`shared_bump_buckram`. The GLSL (DDDINZUK:5580-5940, shipped with its comments intact):

- **Vertex** (5580-5616): passes `vUv`, view-space `vNormal`, `vViewPosition`; spine thickness is a vertex trick on the shared OBJ — `modelThickness = 3.374` cm; vertices with `|x| > 1` shift outward by `(thickness − 3.374) / 2`. Covers rigid, spine width per book.
- **Fragment combine order** (5845-5940), pseudo-math:
  1. `normal` = bump-perturbed (screen-space derivative bump; dual maps blended with **overlay** blend, base bump suppressed where foil/gloss/glitter cover: `inverseFoilCoverage = 1 − foilMap.r × foilOpacity`, gloss uses ×10 on its opacity, scales normalized by `max(bumpScaleBase, bumpScaleCustom)`).
  2. `diffuse` = `blendOverlay(diffuseMapBase, diffuseMapCustom)` (Photoshop overlay per channel, alpha averaged); pure-black result falls back to `diffuseBaseColor`.
  3. **Foil** — the signature trick: `foilIndex = (sin(−normal.y·foilDetail + viewPos.y·foilDetail/10), cos(−normal.x·foilDetail + viewPos.x·foilDetail/10))/2`, mapped into a fixed atlas window `foilUvSize = (0.14, −0.19)` anchored at UV `(0,1)` → the shader samples **a pre-painted sheen palette strip occupying the top-left 14%×19% of the book's own diffuse atlas** (verified by pixel inspection of `PCA_diffuse.png`: gold gradient, luminance 195-245). `diffuse = mix(diffuse, foilColor, foilMap.r × foilOpacity)`. There is no reflection probe — foil "reflections" are this normal-driven palette lookup.
  4. **Gloss**: procedural interference color from `sin` of normal×viewPos products; `mix(diffuse, glossColor, glossMap.r × glossOpacity)`.
  5. **Glitter**: glitter map tiled `fract(vUv × 30)`; `mix(diffuse, glitterColor × 0.3, glitterCoverage × 0.3)`.
  6. **Specular**: `specularStrength = reflectiveness + foilCoverage×foilSpecular + glossCoverage×glossSpecular + glitterCoverage×glitterSpecular×glitterOpacity` — signed params are additive terms (negatives subtract shine where masked); then standard three Blinn-Phong light loop (`lights_phong_fragment` + begin/maps/end) with `specular` color and `shininess` exponent.
  7. Final emissive mix multiplies foil **and** gloss **and** glitter coverage/emissive/opacity together (5936) — effectively a no-op for nearly every book (any zero factor kills it).
- ControlPanel slider domains (page capture L12087-12205): shininess 0.2–5, reflectiveness −3.2–3.2, thickness −6–6, foilDetail 0.2–16, foilOpacity −8–8, foilSpecular/foilEmissive −5–5, gloss −5–5, glitter 0–1, bumpScales −2–2.

### 4. Renderer, camera, canvas

- `WebGLRenderer({ antialias: isChrome, alpha: true, preserveDrawingBuffer: !isSmallScreen })` (J2DM35LM:1474-1478); `setClearColor(0x211815, 0)` — transparent canvas over the DOM page background; `setPixelRatio(devicePixelRatio)` uncapped; `setScissorTest(true)`, `autoClear false` (book scissor + podcast scissor share one canvas); `powerPreference "high-performance"`.
- Camera `fov 12` (15 below 600px), `near 1`, `far 650`, `rotation.x −.06`, `y = 6.5 − scrollY × cameraScrollRatio`, `z = 100 × canvasHeightScalar × canvasScale` (plain 100 below 600px). Canvas width `min(2000, screenWidth)`; reference height basis 1018.
- `cameraScrollRatio`: main list `.0222`, active details `.027`, `.046` variant, all `/ screenHeightRatio × canvasScale` (Page:165-167, 1054-1059).

### 5. Lights (verified against the accepted four-light rig)

`canvasProperties` (J2DM35LM:1452-1465) confirms ambient white `.52`; back `.5` at `(−32,12,−16)`; key white `.6` at `(4,9.5,4.5)`; spot `#cceecc` angle `.36` penumbra `1` intensity `.75`→`.05` active, position `(24, cameraY, 1)`, target `(−6, cameraY−6.5, −6.5)` → active target `(−14.3, ·, −61)` (film posters `−85`). Two corrections to earlier extraction:

- The configured back-light color `#ffe6cc` (16770764) is **never applied** — the light is constructed with `#211815` and its color continuously lerps toward the active/hovered book's `palette.backgroundColor` at `currentTransitionSpeed` (J2DM35LM:1480, 1580-1588). The warm tint on hold comes from book palettes, not a fixed lamp color.
- The spotlight follows `camera.y` every frame (target too), so the rake is scroll-invariant by construction (J2DM35LM:1590-1604).

### 6. Textures

Contentful CDN, per-book `{SLUG}_{diffuse|bump|foil|gloss}` at `w=1920` (Safari 13/14 UA: jpg `w=2000`, else webp `q=60` where `fm` used); `anisotropy 8`; no encoding set (linear pipeline); shared assets: `shared_diffuse_overlay` (paper grain overlay base), `shared_bump_buckram/paper/none`, `shared_glitter`. Only the first 4 books' spine textures load eagerly; full sets lazy-load on approach/activation (`ensureBookTexturesLoaded`, J2DM35LM:1852, 1991-2008). Each diffuse atlas reserves its top-left 14%×19% for the foil palette strip.

### 7. Scroll pipeline (recorded only — native scroll stays)

Native `window.scrollY` (debounced scroll listener), same architecture as ZI3T — the reference validates the kept decision. `scrollVelocity = scrollDelta × .003` (desktop, only while no book is active), decays `× .4` per frame, and is added **inside** the damped approach to the spine-tilt target (the stack "fans" under scroll; J2DM35LM:1789, 1902, 2112). Camera y follows scroll linearly (§4). Scissors split the fixed canvas between book scene and podcast scene by scroll position (J2DM35LM:2118-2127). **The render loop pauses 1200 ms after the last scroll/pointer movement** (`isMoving` timeout, Page:933-941) — the reference does not render at idle.

### 8. Animation rig (recorded only)

- Universal easing: every transform lerps toward its target at `currentTransitionSpeed`, ramped per frame `min(.15/fpsRatio, current + .006/fpsRatio)` and **reset to 0** on drag release/product activation — every gesture re-enters with a slow-start ease (J2DM35LM:1796; Page:958).
- Rest pose: book group rotation `(−π/2, 0, +π/2)`, cover rotated `y −π/2` at `cover.position.x = 11`, order ZYX; gaps `−6` (`−7` below 600px), `draggingGap 30`, rest `z −3`.
- Hover: `z 6`, `rotation.x −.45π`; hovered spine z eases at fixed `.1` per frame (J2DM35LM:1862).
- Active book: position `(−13,−4,−56)` (x clamped `max(−13, −13×canvasScale)`), rotation `(−.5,.35,.15)` order XYZ; inactive `(−13,−4,−50)`; small screens `(0,3,−90)`.
- Drag: `.003 rad/px` both axes (spine drag maps horizontal→x, vertical negated→y); threshold 4px Manhattan; non-drag cover follow `.00015 rad/px` (×3 below 600px).
- Release twirl: inertial spin = clamped `±.3` of the last pointer-rotation delta, decays `× .95` per frame — there is no autonomous idle animation (Page:975-1002).

### 9. Contradictions with accepted ZI3T decisions (kept until user review)

- **Pipeline**: ZI3T shipped ACES `1.32` + SRGB output + color management; the reference ships NoToneMapping + linear passthrough. **User decision 2026-07-23: adopt the reference pipeline** (NoToneMapping, color management disabled, linear output, textures untagged) so ported constants and painted sheen behave 1:1.
- **Light units**: ZI3T's r171 physical lights run the accepted `.52/.6/.5/.75` raw — π dimmer than the reference's effective values, and the rake spot suffers inverse-square decay the reference never had.
- **Back light color**: the accepted rig fixes `#ffe6cc`; the reference never uses it (palette-driven lerp instead).
- Hover projection: reference hover is `z −3→6` ≈ 1.096× projected; ZI3T keeps the accepted `1.033/1.035` screen-space calibration (silhouette boundary).

## Pixel extraction at 1568×894

Approximate ±3px reference targets:

| State | Target |
|---|---|
| First anchor rect | left ≈ 412px when a scrollbar is present (≈ 419px with no scrollbar), top ≈ 335px, width ≈ 729px, height ≈ 134px |
| Stripe pressed book | x ≈ 380–1189px |
| Stripe dragged book | x ≈ 342–1243px, y ≈ 285–499px |
| Held caption | left ≈ 854px, top ≈ 179px, width ≈ 400px, height ≈ 119px |
| Rail start | x ≈ 29px, y ≈ 330px |

Reference capture gesture: begin at the center of the first book, then drag `+140px` horizontally and `−62px` vertically.

## Current checkpoint — 2026-07-20

Implemented:

- Persistent fixed Three.js canvas behind semantic DOM anchors.
- Five original ZI3T book volumes with individual cover art and authored cloth, paper, foil, board, resting-pose, and lighting profiles.
- Per-volume diffuse, roughness, bump, foil/metalness, paper-edge, page-response, and underside maps derived deterministically from the original ZI3T artwork and each volume's material profile. Paper roughness, variation, and bump are authored independently for every volume.
- Bevelled book geometry with separately shaded spine, cover, page block, fore-edge, and mapped underside/endpaper.
- Hover draw-toward-viewer behavior.
- Stripe-style stack evacuation on press and route activation: books above the selected volume move beyond the upper viewport edge, books below move beyond the lower edge, and edge fading begins only after spatial clearance. The selected route flight delays its major rotation until that corridor is clear; Back and Escape reverse the sequence with the selected book returning before the stack.
- Route motion uses a frame-rate-independent sample of Stripe's `.006` to `.15` interpolation ramp instead of the previous overshooting spring. The forward flight is authored at 1900ms, reveals the integrated right-hand content after the stack corridor clears, and enables book/frame interaction only when the physical flight completes. Back and Escape remove the detail surface immediately, return the selected volume over 2100ms, and bring solid neighboring volumes in during the latter half. Reduced-motion and compact layouts remain immediate.
- Per-volume resting yaw/roll, top-plane reveal, light anchor, idle-key intensity, page glint, and lower bounce. The localized light is visible on the active scroll volume before hover or hold, then intensifies continuously through the held state.
- Mouse press isolation and direction-preserving held-book yaw/pitch after a 4px threshold. Horizontal travel maps to yaw and vertical travel maps to pitch. The measured `.003` rad/px response remains linear through 180px, then gains progressively so viewport-edge travel can expose the reverse surfaces within a safety limit of ±π.
- Two-axis moving spotlight, a page-only moving glint, direction-aware lower bounce, selected cloth background, and held caption. Both the lower board and page block remain readable while the highlight travels across four drag directions.
- Delayed reversible release choreography matching 80ms and 880ms keyframes.
- Drag navigation suppression; ordinary click navigation preserved.
- Scroll-linked stack/rail choreography and background drag scrolling, with a damped scroll-tilt impulse instead of a frame-rate-sensitive snap.
- Honest terminal choreography after the fifth volume: the existing ZI3T 16×16 character study becomes a dark full-viewport interstitial, followed by the existing closing statement, profile links, and footer on a light paper field. No extra volumes or Stripe media are fabricated.
- SPA-like `pushState`/`popstate`, direct route frames, Back, Forward, Escape-to-shelf from either the parent or focused iframe, and route-state-bound rapid-Back cleanup. A late iframe/flight callback cannot reopen an already-closing route.
- Persistent project routes for Re-fly, Arm, Telemetry, and Resume: the selected WebGL volume remains on the left while the genuine live DOM destination occupies the right 45.5%. The standalone URLs remain usable as direct-entry documents.
- Persistent note-reading route: the selected note mesh remains in the left WebGL scene, the note's DOM content occupies the right 45.5%, the book remains draggable, and the original note/direct URL remains the canonical content source.
- Split-route geometry calibrated to the supplied detail reference: the first project volume is approximately `x=275–718`, content begins approximately `x=876`, and the first headline begins near `y=190` at 1568×894. The remaining project and note volumes use the same visual footprint with per-volume pose offsets.
- The visible split layer drops its completed no-op transform so a live iframe and the moving parent WebGL canvas remain on stable compositor planes during a held route pose.
- Entry time begins on the first shader-compiled animation frame, then books settle top-to-bottom with a 72ms stagger and 492ms spring. Rail/help controls begin only after the final volume settles. This prevents cold compilation from consuming the visible sequence.
- Elapsed-time catch-up for release and route flights so throttled frames cannot strand interaction or history state.
- Reduced-motion and compact-layout fallbacks.
- Deterministic QA matrix: all 19 behavioral checks plus the runtime-error gate pass across the shelf, pointer state machine, stack evacuation, timed Back/Forward/Escape choreography, history, compact/reduced modes, and terminal surfaces. The current SwiftShader run measured Forward at 2017ms, Back at 2764ms, and Escape at 2697ms including polling and compositor overhead.
- Accepted 1568×894 evidence set: `desktop-base`, `desktop-hover`, `desktop-pressed`, `desktop-dragged`, `desktop-release-80`, and `desktop-release-900`; `desktop-stack-evacuating` records the visible outgoing motion and `desktop-route-stack-clearing` records the activation corridor; directional evidence adds left/up, right/down, straight-up, and straight-down states; route continuity adds resting and dragged Re-fly and note states plus resting Arm, Telemetry, and Resume states; terminal evidence adds `desktop-terminal-signature` and `desktop-terminal-closing`. The passing capture directory is `/tmp/zi3t-press-route-timing-pass1`; isolated forward/reverse comparison frames are in `/tmp/zi3t-press-route-timing-isolated`.

The canonical held keyframe is approximately 900px wide at 1568×894, with its left/right and top edges closely aligned to the supplied reference. Its lower edge remains about 20–30px deeper because the genuine ZI3T source volume is thicker. This is a translation using ZI3T artwork, not a copied Stripe asset.

## Current checkpoint — 2026-07-21

Corrected a rejected geometry pass while retaining its independent shadow fix:

- **Kept the shadow-system removal.** The black radial sprite, its per-book state, and its route/release updates remain removed. Stack evacuation and return now rely on the book lighting and real surface separation, so no detached oval shadows cross the selected volume.
- **Rejected the narrow, over-thick rounded-block silhouette.** The altered per-volume width, height, top-plane, and depth ratios produced a suitcase-like object and a blank diagonal route face. The accepted source-proportion values, shelf spacing, grab cursor, drag-axis mapping, and cover-facing route pose are restored.
- **Rebuilt only the visible spine surface.** The hardback core again uses the restrained 0.72/0.68 single-segment bevel and square shoulders. The mapped spine is a ten-segment shallow convex cloth surface with a 0.72–1.2 scene-unit crown; it catches a restrained center highlight without changing the book's thickness.
- **Separated mapped faces without inflating the mesh.** Cover, underside, spine, and page faces sit 2.1 scene units clear of the triangulated core. This removes the route-pose z-fighting seen at the tighter offset while preserving the slim silhouette.
- **Kept the scrollbar-aware QA measurement.** The first-book left target remains derived from `document.documentElement.clientWidth`, avoiding a false failure when the scrollbar reduces the layout viewport.

The deterministic QA matrix passes (`result: PASS`) with all 19 behavioral checks plus the runtime-error gate. The accepted SwiftShader run measured Forward at ~2176ms, Back at ~2697ms, and Escape at ~3078ms including polling and compositor overhead. The six canonical states and the additional stack, directional, route, compact, reduced-motion, and terminal states were captured at 1568×894 in `/tmp/zi3t-press-spine-pass2`. The rejected-state baseline is retained at `/tmp/zi3t-press-kimi-baseline` for direct comparison.

## Current checkpoint — 2026-07-21 lighting and full-orbit calibration

- **Corrected vertical pointer direction.** Upward pointer travel now raises the grabbed edge and exposes the lower board; downward travel presents the cover. Shelf and integrated-route holds use the same direction without changing the 4px drag threshold or click suppression.
- **Opened the held orbit without making the canonical pose twitchy.** Travel through 180px preserves Stripe's measured `.003` rad/px response. A smooth 220px acceleration band then adds range, capped at ±π, so a 350px upward drag reaches the lower-board view and a 620px horizontal drag reaches the fore-edge/reverse side.
- **Re-scaled the localized key to ZI3T's pixel-like world.** The previous `.36` spotlight angle copied Stripe's coordinate-space value into a much larger scene and washed the full spine. The held key now uses a `.085` angle with `.96` penumbra; its source stays predominantly upper-right while the target travels with the pointer. The page-only glint uses a separate `.072` cone.
- **Kept unswept material readable.** Held ambient/key targets settle at `.70`/`.98`, the authored underside emissive floor is `.20`, and a book-targeted lower directional fill strengthens as upward travel reveals the underside. These values retain contrast outside the hotspot without restoring the old flat cream wash.
- **Hardened rapid route reversal.** If Back fires while the opening flight still owns `is-stack-clearing`, the return transition removes that class immediately. Completion and timeout cleanup now remove all clearing/cleared/returning classes idempotently.
- **Expanded evidence without weakening the gate.** The bundled suite still contains 19 behavioral checks plus the runtime-error gate, and now folds rapid Back into the existing history assertion. It also captures `desktop-drag-orbit-up` and `desktop-drag-orbit-reverse` alongside the six canonical and four directional states.

The final SwiftShader run passes (`result: PASS`): Forward ~1968ms, Back ~2660ms, and Escape ~2781ms including polling/compositor overhead; rapid Back also returns to a class-clean catalogue. Direct `/arm/` entry exposes its genuine heading/viewer, and keyboard Tab lands on a visible 2px focus outline. Accepted 1568×894 evidence is in `/tmp/zi3t-press-light-orbit-final`; the untouched pre-change baseline is `/tmp/zi3t-press-light-orbit-baseline`.

## Current checkpoint — 2026-07-21 window-edge rake and resting angle

Reworked the resting/idle shelf so it reads as daylight raking in at ~45° from a window edge, with each book sitting at a slight 3/4 angle instead of head-on flat. The held/dragged choreography is intentionally unchanged; it is dominated by the pointer-tracked `interactionLight`, and the two static held targets are preserved.

- **Angled the resting book.** All five `pose.restYaw` values are now a uniform `0.12` (≈6.9°, was alternating ±0.008–0.012 ≈ ±0.5°), turning each cover's right/near edge toward the viewer. `restRoll` left at its near-zero values. The slight yaw keeps each `.press-volume` DOM hit-area covered (telephoto fov 12 gives negligible parallax); verified aligned at 1568×894 and 390×844.
- **Made the whole-shelf light a directional 45° rake.** `keyLight` moved from upper-left `(-850, 920, 2800)` to upper-right `(1200, 1250, 1750)` and its resting intensity raised `1.58 → 1.75` (held target unchanged at `0.98`). Directional rays on the now-yawed covers produce the diagonal falloff.
- **Cut the flat wash.** Hemisphere ambient dropped `1.02 → 0.66` at rest so the key's directionality reads; the held ambient target is unchanged (`mix(0.66, 0.70, holdPresentation)` still settles to `0.70` on hold, so the accepted held look is preserved).
- **One window, one side.** `rimLight` x flipped `1050 → -1050` so the cool fill sits opposite the new upper-right key. The featured-book `interactionLight` source was already upper-right, so the static key, the featured spot, and the held sweep now agree on one light side (no cross-lighting).
- **Compensated the dark navy cover.** Telemetry's per-volume `light.keyIntensity 3.8 → 4.8` and `idleKey 0.28 → 0.46` so the rake reads on dark cloth when it is the active volume. Straw/oxblood/amber covers read well on the global values without blowing out.
- **Assumption — window edge is upper-right.** The user's "like this" reference image was not visible to the implementer; upper-right was chosen because it matches this doc's held-state art direction and the existing featured-spot side. Flipping to upper-left is one sign change per lever: negate `keyLight.x`, negate `rimLight.x`, and flip the five `restYaw` back to negative.

QA gate `result: PASS` with 20/20 behavioral checks and zero runtime errors (SwiftShader). Inspected at 1568×894: base, hover, pressed, dragged, right-down and up drags, orbit-up underside reveal, release, project split-route, and the active navy Telemetry volume; plus a 390×844 compact base for the angle. New accepted evidence is `/tmp/zi3t-press-window-light`; compare against the prior baseline `/tmp/zi3t-press-light-orbit-final`. Deployment remains held.

## Current checkpoint — 2026-07-22 renderer, surface, and compact parity

Re-audited the live Stripe Press catalogue at 1568×894 and 390×844, then corrected the regressions that had moved the implementation away from the reference architecture.

- **Kept the WebGL frame alive at rest.** The scene now renders every visible animation frame instead of stopping when the motion accumulator settles. Screenshot sampling still finds the first volume after both 2.25s and 5s of desktop idle (`0.91947` sampled coverage), and after 5s compact idle (`0.92329`), with no lost WebGL context. Hidden tabs continue to rely on the browser's animation-frame suspension.
- **Removed the synthetic studio/material look.** Cloth threads and slubs are sparser and irregular; the baked diagonal albedo ramp is gone; paper uses a warm edge gradient with restrained sheet lines and response maps; material bump/roughness amplitudes are lower; and the underside now blends each genuine ZI3T cover source into its authored board/endpaper treatment. Hemisphere, directional, rim, held spot, page glint, and lower bounce were rebalanced around the reference's soft ambient presentation. Page and underside emissive floors preserve readable physical surfaces through the complete drag orbit.
- **Closed the false slab seams.** Mapped face clearance is `1.05` scene units (down from `2.1`) with polygon offset on the mapped surfaces. The six canonical screenshots and both extended-orbit captures show neither the former floating slabs nor z-fighting.
- **Restored a genuine compact catalogue journey.** At 390×844 the semantic main is `1604px` tall, the volume is `189.89px` high, the first two anchors begin at `276.83px` and `470.22px`, and three genuine project volumes are visible on first load. Compact scrolling advances the real selected-volume rail index; no placeholder books or fake terminal length were added.
- **Matched the compact route architecture.** The selected physical volume owns the upper `62.5svh`; genuine route content begins at `527.5px` and fills the remaining `316.5px`. Back and route rail controls reappear over the book stage while pointer-hold controls stay disabled. The measured selected-volume projection is `left=36.49`, `top=59.12`, `right=354.84`, `bottom=497.73`, against the live reference's approximate `35–358 × 58–498px` footprint.
- **Calibrated the desktop route without source distortion.** The settled first volume projects to `left=294.23`, `top=166.48`, `right=743.10`, `bottom=717.98`; the live reference is approximately `297–738 × 167–720px`. The right content inset and clean split plane now begin at the same visual column as the reference. The route retains the existing 1900ms forward flight, 2100ms return, same-document history, and Back/Forward/Escape behavior.
- **Calibrated the held pose by translation only.** The reference-aligned center and upper edge were recovered without altering the original ZI3T volume proportions. The slightly wider/deeper lower silhouette remains an intentional source-art difference covered by the sacred boundaries.
- **Expanded deterministic regression coverage.** The suite now verifies late-idle screenshot coverage, compact scroll and route geometry, measured desktop route geometry, reduced motion, rapid Back, every genuine project route, and runtime errors. The final SwiftShader run passes all `25/25` checks: Forward `1909ms`, Back `2157ms`, and Escape `2171ms`, including polling/compositor overhead.

Accepted evidence is `/tmp/zi3t-press-fidelity-final`: the six canonical desktop states, evacuation/route-clearing frames, four directional and two extended-orbit drags, route continuity for every genuine destination, compact idle/scroll/route states, and both terminal surfaces. Deployment remains held.

## Current checkpoint — 2026-07-23 Safari pointer and shelf parity

Replaced the anchor-dependent drag race with a row-owned pointer state machine and brought the idle/held presentation back toward the current live reference.

- **Made gesture completion independent of anchor capture.** Desktop pointer movement, release, and cancellation are tracked at `window` capture scope. Element capture remains an optimization, but a browser may decline or lose it without losing the drag result. The old 480ms `suppressedClick` token is gone; a completed pointer gesture persists until its corresponding click is consumed or the next gesture begins.
- **Kept real navigation semantics.** `.press-volume` remains a genuine anchor with its href, label, focus ring, keyboard activation, and modified-click behavior. Unmodified row/anchor clicks are routed only after drag discrimination; every drag click is cancelled before native or SPA navigation can occur.
- **Matched Stripe's row-owned hit architecture without changing mesh measurements.** At 1568×894 the first `.press-volume-item` now owns `x=0–1568` while its semantic anchor remains `left=419.41`, `top=334.92`, `width=729.19`, `height=134.36`. Geometry continues to derive from the anchor rectangle. A right-flank press at `x=1320` controls the same physical volume, and both its drag and release remain at `/`.
- **Restored a front-on shelf.** All five resting yaw values are `0`, superseding the 0.12 window-rake checkpoint. This removes the persistent end-block wedge and returns the idle volumes to the reference's near-orthographic spine presentation without altering route yaw.
- **Removed accelerated long-drag orbiting.** Pointer angle is again a linear `.003 rad/px` base response across the viewport, with a uniform 1.3 vertical geometry correction for ZI3T's differently oriented mesh. The 4px boundary now uses Stripe's current Manhattan-distance test. A 620px horizontal drag reaches the fore-edge/reverse transition instead of snapping to a capped half-turn.
- **Softened the physical presentation.** Tone exposure is `1.16`; the resting hemisphere/key/rim are `.86`/`1.28`/`.22`; a white `.26` ambient fill lifts dark cloth without flattening the covers. Held spot/page cones are `.115`/`.088`, their strength multipliers are `.64`/`.46`, and page/underside emissive floors are `.44`/`.30`. The base navy volume remains readable, while the canonical held key retains a localized warm sweep without the former white page block and broad glare.
- **Busted the two changed homepage assets.** The calibration stylesheet and module scene URL carry the `20260723` query so Safari cannot continue running a cached pre-fix pointer handler after refresh.
- **Expanded regression coverage.** The deterministic gate now measures the full-width row separately from the anchor, drags from the row flank, verifies flank-release navigation suppression, and activates the SPA route from the flank click. The final SwiftShader run passes all `28/28` checks with zero runtime errors: Forward `1949ms`, Back `2195ms`, and Escape `2183ms`, including polling/compositor overhead. Compact route projection is `left=34.82`, `top=58.22`, `right=356.51`, `bottom=499.56` at 390×844.

Accepted evidence is `/tmp/zi3t-press-safari-pointer-final`: the seven canonical/row states, evacuation and route clearing, four directional and two linear extended-orbit drags, every genuine split route, compact and reduced-motion states, and both terminal surfaces. The previous baseline remains `/tmp/zi3t-press-user-audit`. Deployment remains held.

## Current checkpoint — 2026-07-23 environment, shadows, and reference light rig

Restored the two rendering layers the reference depends on that were entirely absent, and replaced the accreted global rig with the source scene's own constants. This closes the root causes behind the "tuned five times, still flat" cycle: foil metal had no environment to reflect, stacked books cast nothing, and every retune adjusted punctual lights that could not supply either.

- **Image-based lighting.** The scene builds a small original emissive room (warm window panel on the key/rake side, cool fill opposite, warm floor bounce) and PMREM-filters it into `scene.environment`. Foil `metalnessMap` regions finally have something to mirror. `envMapIntensity`: cover/spine `1.15`, cloth core `0.5`, pages `0.3`, underside `0.35`. The flat emissive floors dropped (pages `.44→.26`, underside `.30→.18`) because the environment now carries the ambient term. This is an original stand-in for the reference's photographic reflection maps, not a copied asset.
- **Real shadows.** `PCFSoftShadowMap`; the white key and the rake spot cast, book cores cast/receive, mapped faces receive, and a `ShadowMaterial` catcher plane (opacity `.16`) behind the stack grounds the pile. A core stops casting below `.35` opacity so the shadow pass cannot betray an evacuated volume.
- **Reference rig transplant (verified against the current Canvas bundle).** White ambient `.52`; back light `#ffe6cc` `.5` at `(-32, 12, -16)`; key white `.6` at `(4, 9.5, 4.5)`; rake spot `#cceecc`, angle `.36`, penumbra `1`, intensity `.75` idle → `.05` while a book is presented or routed, from `(24, 5.4, 1)` toward `(-6, -4, -6.5)`. **Unit law:** one source unit is `camera.z / 100` pixels (the source viewport is 21 units tall at fov 12), so scaling every position by that factor transfers the `.36` cone by construction — the earlier "washed the full spine" failure came from copying coordinates without the unit law. The rig lives in a group tracking `camera.y`, making the window geometry scroll-invariant. The hemisphere/white-fill/cool-rim lights and their damp targets were removed; hold targets are ambient `.52→.44`, key `.6→.42`, back `.5→.34`.
- **Reference interaction pop.** Hover/hold projected scale corrected `1.033/1.035 → 1.096/1.104`; the source draws a spine from `z:-3` to `z:6` with its camera at `z:100`, a 1.096× projected growth.
- **Resting three-quarter pose restored.** Uniform `restYaw 0.105` supersedes the front-on `0` checkpoint. With shadows and environment shading, the yaw now has visible lighting consequences instead of reading as an unshaded wedge; anchor coverage held at 1568×894 and 390×844.
- **Additional extracted reference facts:** back-light color `16770764` (`#ffe6cc`); left/key light white; spotlight `13430476` (`#cceecc`); the per-frame book easing adds scroll velocity directly to the spine-tilt target (the stack "fans" under scroll); active-book pose `(-0.5, .35, .15)`; dragged neighbor gap `30`; the material schema layers diffuse/bump/foil/glitter/gloss maps per book, with each palette driving the page `--backgroundColor`.

QA gate `result: PASS`, 28/28 behavioral checks, zero runtime errors — on a real-GPU headless run rather than SwiftShader. Evidence: `/tmp/zi3t-press-rig-final` (full set) and `/tmp/zi3t-press-reference-rig` (first pass). Inspected: base, hover, dragged, stack-clearing flight, orbit-up, and terminal frames. Honest remaining differences: the idle rake gradient is present but soft; the underside at extreme orbit reads flatter than the previous emissive wash; inter-volume gaps remain the accepted DOM-anchor layout rather than the reference's tighter pile. Deployment remains held.

## Current checkpoint — 2026-07-23 scoped four-light material rebuild

Supersedes the immediately preceding environment/shadow transplant after visual and deterministic review. The accepted rebuild keeps the extracted camera/light/material technique inside the scene core while preserving the Safari pointer state machine, semantic anchors, native scroll, route choreography, and calibrated ZI3T silhouettes.

- **Kept one four-light rig.** Resting values remain the extracted white ambient `.52`, warm back light `#ffe6cc` `.5`, white key `.6`, and pale-mint rake spot `#cceecc` `.75` with angle `.36` and penumbra `1`. The rake damps to `.05` only through held presentation. Source positions are normalized by `camera.z / 100`, anchored at ZI3T's genuine spine plane, and grouped with `camera.y`; the existing key changes direction around the selected volume during a drag instead of introducing separate spot, page-glint, or bounce lights.
- **Removed speculative studio layers.** The PMREM room, environment panels, shadow catcher, shadow maps, and mesh cast/receive flags are gone. Their first-pass capture added an unrelated black wedge, made the idle stack read as a staged product render, and repeated a shadow system already rejected by the silhouette checkpoint.
- **Built the material stack on original sources.** Spine and cover use `MeshPhysicalMaterial` with per-volume foil metalness, clearcoat gloss/roughness, reflectiveness, and sparse deterministic sparkle. Procedural response maps now press the original ZI3T typography into the bump layer. A small custom shader term multiplies the sampled diffuse atlas, retaining pale-cloth readability under the low reference lights without washing out ink as a flat emissive color would. No Stripe texture, cover, font, or code is copied.
- **Kept screen-space calibration honest.** Resting yaw remains `0`; hover/hold projection remains `1.033/1.035`. Literal imports of `0.105` yaw and `1.096/1.104` projection exaggerated the end block and pushed the canonical held volume beyond the accepted ~900px footprint because ZI3T's genuine meshes are wider and deeper than the source volumes.
- **Recalibrated only the compact route footprint.** The compact desired cover width is `min(260px, 66vw)`. At 390×844 the selected volume measures `left=34.62`, `top=51.56`, `right=356.78`, `bottom=502.61`, preserving the physical stage above genuine content without changing desktop route geometry (`left=294.23`, `top=166.48`, `right=743.10`, `bottom=717.98`).
- **Kept the Safari interaction checkpoint intact.** The full-width row still owns pointer press/drag/release, the 4px discrimination boundary and `.003 rad/px` orbit remain unchanged, drag release never navigates, and genuine anchors/history continue to serve clicks, keyboard activation, Back, Forward, Escape, compact, and reduced-motion paths.

The isolated SwiftShader gate passes all `28/28` checks with zero runtime errors: Forward `1930ms`, Back `2639ms`, and Escape `2851ms`, including polling/compositor overhead. Accepted evidence is `/tmp/zi3t-press-core-final`; inspected frames include the canonical shelf/held set, four drag directions, both extreme orbits, every project and note route, compact idle/scroll/route, reduced motion, and both terminal surfaces. Deployment remains held.

## Current checkpoint — 2026-07-23 ground-truthed Phong rebuild on the reference pipeline

Supersedes the scoped four-light material rebuild's material/pipeline layer after dissecting the live Canvas/Page bundles (see "Extracted reference facts"). The user approved adopting the reference pipeline. Interaction, scroll, route, silhouette, and pointer layers are untouched.

- **Reference pipeline adopted.** `THREE.ColorManagement.enabled = false` before any color/texture exists; renderer runs `NoToneMapping` with `LinearSRGBColorSpace` output; all canvas textures are `NoColorSpace`. Authored hex values now shade and display byte-for-byte like the source's non-color-managed r151 pipeline. ACES `1.32` and the emissive floors it required are gone.
- **Light-unit law applied.** All four rig intensities carry the legacy `×π` upload factor (`LEGACY_LIGHT_SCALE`): ambient `.52π`, key `.6π`, back `.5π`, rake `.75π→.05π` held. The rake spot keeps `distance 0, decay 0`, matching the reference's no-falloff legacy attenuation. Positions still go through the `camera.z / 100` unit law; the drag-tracked key behavior is unchanged.
- **Back light corrected to evidence.** Constructed at the near-black neutral `#211815` (its configured `#ffe6cc` is dead data in the source) and its color lerps toward the presented volume's cloth background with hold presentation, returning to neutral at rest.
- **Cover/spine materials are now Phong with the ported combine.** `MeshPhongMaterial` (specular `#ffffff`, per-volume `shininess`) plus an `onBeforeCompile` port of the reference terms: additive specular strength `reflectiveness + foilCoverage × foilSpecular` replacing `specularmap_fragment`, and the normal-driven sheen lookup `(sin(−n.y·detail + viewPos.y·detail/10), cos(−n.x·detail + viewPos.x·detail/10))/2` mixed into the diffuse after bump perturbation. Shader cache key `press-phong-book-v4`. The PBR-era metalness/clearcoat/roughness maps and the `0.46` base-diffuse add are retired; `createRoughnessTexture` was removed.
- **Sheen palette strips are standalone original textures.** Stripe reserves a painted 14%×19% strip inside each diffuse atlas; ZI3T's covers map their full canvas, so each volume gets a `createSheenTexture` 128×128 gradient authored from its own `material.phong.sheen` palette — same math, same role, no copied art. Five volumes carry authored `material.phong` blocks (shininess 1.4–3, reflectiveness .25–.6, foilDetail 2–3.6, foilSpecular .18–.5, foilOpacity .32–.62), all inside the reference ControlPanel domains.
- **Pages, underside, core follow the same model.** Phong with dim specular; page (`.44`) and underside (`.30`) emissive floors are gone — brightness now comes from the ×π rig, as in the source.

Environment maps and shadows are confirmed absent from the reference (facts §1); the prior PMREM/shadow experiments are closed permanently, not merely reverted.

User-review fixes accepted into this checkpoint after Viet's inspection of the first build:

- **Sheen dot-lattice root cause.** The ported `foilDetail/10` term consumes view-space *distances*, which never transfer raw: unscaled `vViewPosition` (pixel-world, hundreds of units) swept the sin/cos through dozens of radians across a face, aliasing into a regular dot grid wherever foil coverage existed. The shader now divides view position by the shared `pressUnitScale` uniform (`camera.z / 100`, updated on resize), restoring the reference's slow parallax sweep. Shader cache key `press-phong-book-v5`. Two related mask fixes: the art-derived foil mask derives its background reference from the artwork's dominant (mode) color instead of pixel (0,0) — refly's top band sits at the corner and had flooded the whole cover into the mask — and an interim bump-damping patch was reverted once the true cause fell.
- **Route-open smoothness (Re-fly).** `refly-demo.js` boots its WASM replay and three viewers at parse time, which contended with the 1900 ms flight. While embedded, the demo now defers `init()` until the scene posts `press:reveal` (sent when both the frame is loaded and the flight has landed; 2200 ms fallback for foreign embedders). The page's script tag gained a cache-buster so the deferral actually reaches returning visitors.
- **Return pace.** `ROUTE_RETURN_DURATION` 2100 → 1450 ms; the reference's `.006→.15` settle reads visually complete well inside 1.5 s and Viet flagged the old return as slower than the source.
- **Two-position hold caption.** The caption now takes whichever vertical half the held volume does not occupy (projected center vs. viewport midline → `is-low` flips `top` to `bottom: 13svh`), matching the reference's placement and keeping the note off the book.

Second follow-up round ("fix what you can"), same checkpoint:

- **Routed palette is now THREE-parseable.** `prepareProjectFrame`/`prepareReadingFrame` inject pre-resolved hex via `mixHex` (per-channel sRGB lerp — exactly `color-mix(in srgb, …)` for opaque endpoints) instead of `color-mix()` strings, which `THREE.Color` cannot parse. The two formerly transparent mixes (`--rule`, `--rule-strong`) flatten against the volume's paper background — visually equivalent where those rules render, and the value the framed GridHelpers actually want. Fixes the long-standing `THREE.Color: Unknown color color-mix(…)` warnings/white-fallback in `/refly/` and `/arm/`. Verified: injected `--muted/--rule/--paper-deep` read back as hex in-frame; zero warnings across forced theme flips.
- **/arm/ boots behind `press:reveal` like Re-fly.** The inline viewer module is wrapped in `boot()` with the synchronous embed gate (message listener + 2200 ms fallback; errors still surface through the page's `fatal`). Deliberate constraint: the gate must not top-level `await` — that would hold the iframe `load` event the parent's reveal signal waits on. Verified: frame `load` fires promptly, no viewer canvas mid-flight, canvas + cleared loading state after landing, zero errors; the deferral also means `makeGrid` now always reads the injected route palette.

Still intentionally untouched: telemetry-lab's parse-time boot (light DOM-only), the static `inert` on volume items 3–4 (initial below-fold state of the dynamic viewport culling both scene and fallback maintain).

## Current checkpoint — 2026-07-24 in-route scroll hand-off

Viet asked for the reference's in-route scroll behavior (on a book page, scrolling advances to the next book and changes the URL) and chose full continuous parity.

- **Route scroll-lock: attempted, then reverted (2026-07-24).** `press-route-open` applies `overflow: hidden` to `<body>` while the document scroller is `<html>`, so the catalogue behind an open route can still scroll. Locking `documentElement` fixed that but **knocked the scene canvas out of its viewport-pinned position**: a split route paints its background with the canvas, so any volume opened at a non-zero scroll offset rendered a thin sliver over page background (measured canvas `top: -571px`, height 894, on the fourth volume; removing the class snapped it back to `top: 0`). The leak it prevented is invisible — the canvas does not move with scroll and `homeScrollY` is restored on close — so the lock is **not worth the regression and must not be reintroduced**. A `<body>`-fixed lock (`position: fixed; top: -scrollY`) is the only variant worth trying if containment is ever genuinely needed.
- **Gate now asserts canvas coverage.** The suite checked route paths and classes but never geometry, so it passed this regression twice. Each project route now also asserts the scene canvas still covers the viewport.
- **Scroll hand-off between volumes.** At the end of a routed page, continued scrolling hands off to the next volume; at the top, scrolling back returns to the previous one. `swapRouteTo()` flies the outgoing volume out along the direction of travel while the incoming one arrives from the opposite edge (`animateRouteSwap`, `ROUTE_SWAP_DURATION` 1140ms), pushes a history entry, and moves the rail via `setCurrentIndex` — the two routes read as one continuous scroll instead of a close-then-open round trip.
- **Where the trigger lives.** A wheel over a same-origin frame is delivered *inside* that frame, never to the route layer, so `attachFrameScrollAdvance` binds to `frame.contentWindow`. It only consumes scroll once the content is parked at the matching extreme (`ROUTE_ADVANCE_THRESHOLD` 240px accumulated; doubled when the page is shorter than the frame and therefore at both extremes from the first frame), and it is armed only `ROUTE_ADVANCE_ARMING_DELAY` (520ms) after the flight lands so an arriving route cannot instantly skip a volume.
- **Deliberate exemption:** wheel over a `canvas` never hands off — `/arm/` and `/refly/` zoom their own viewers on wheel, and stealing that would break the live tools. On those routes the hand-off is driven by scrolling over the surrounding content rather than the viewer.
- **Boundaries honour the contract.** Past the last volume nothing happens — no sixth book is invented. Scrolling back past the first volume returns to the catalogue via `closeRoute({ replace: true })`; `history.back()` is deliberately *not* used there because after a hand-off chain the previous entry is another volume.
- **History.** Each hand-off pushes an entry, so browser Back walks the volume chain; the `popstate` handler gained a branch to swap while a route is open (it previously only acted when no route existed).
- **Compact and reduced-motion no-op** — both keep click/rail navigation as the only route change.
- **Deep-link:** superseded on 2026-07-24 — see the next checkpoint. The earlier decision (keep genuine pages, no compositing) was reversed once measurement showed how the reference actually serves its book URLs.

## Current checkpoint — 2026-07-24 deep-link compositing

Viet asked for deep-links so the reference's feel survives a shared URL, and asked which of the two candidate approaches actually matches the original.

**Measured, not assumed.** `press.stripe.com/boom` returns **200 with the identical `PressHome` shell** as `/` — same `data-js-controller`, all book slugs inline, differing by ~177 bytes of `canonical`/title/OG. There is no redirect anywhere, and no routing marker in the body: the client reads `location.pathname` to pick the active volume. So the reference server-routes one shell to every book URL, and the redirect option was rejected as architecturally opposite (3xx moving the address bar, collapsing per-book canonicals, adding a round trip).

- **Worker.** `wrangler.jsonc` gains `main` + `assets.binding`; `worker/index.js` answers a document navigation to a book URL with the homepage shell (200) and rewrites `canonical`/title/OG per volume with `HTMLRewriter`. A matching static asset is otherwise served *without invoking the worker*, so `run_worker_first` is scoped to the three volumes whose book URL and project page share an address.
- **`?press-page=1`, not a request header.** Assets are cached per URL, so a header-keyed decision (`Sec-Fetch-Dest`) risks handing a cached shell to the panel or the reverse. A distinct query string is a distinct cache key. The panel, the no-script fallback, and the frame-failure escape all use it.
- **Route URL vs content URL.** A volume now carries both: `routeUrl` (address bar, history, deep link) and `contentUrl` (the genuine page in the panel, and still the anchor's `href` so the destination stays real without JavaScript). Volumes 3–4 get dedicated book URLs — `/practice/` → `/resume/`, `/field-notes/` → `/notes/counterfactual-replay/` — because those two pages are also linked from the nav and the notes index and must keep working standalone. This mirrors the reference, where a book URL is only ever a book.
- **Deep-link boot is sequenced, not inline.** Opening the route synchronously during boot forced every volume's shader compile, texture upload and the panel's load into one tick *before anything had been drawn*, blocking the main thread ~24s — and same-origin frames share that thread, so the panel could never finish. The shelf is hidden immediately and the route opens after the renderer has drawn three frames. The panel also composes as soon as its document is parsed (the initial `about:blank` is skipped explicitly) rather than waiting on every subresource, with the hard escape raised to 20s.
- **Returning to the catalogue never walks the hand-off chain.** Escape, the back arrow, and in-frame links to `/` all used `history.back()`, whose previous entry is another volume once a scroll hand-off has pushed entries — so Escape stepped back a book instead of leaving. All three now use `closeRoute({ replace: true })`, matching the rule already applied to scrolling up past the first volume.
- **The rail works inside a route.** It stays visible there (as in the reference) but `openRoute` refuses to run while a route is open, so clicking a volume in the index did nothing — inert exactly where the reference leans on it. Rail picks now go through `swapRouteTo`.
- **Entry is one sequence, not two.** The rail used to fade in as a block. The shelf and the index now run strictly in order: rail ticks cascade only once every volume has settled (`press-entry-complete`, which is set when each book's entry reaches 1), with the volumes' own easing — five items at 0/46/92/138/184ms, the ghost column continuing to 568ms, and the help mark last at 640ms.
- **Verified** under `wrangler dev`: all five book URLs composite with the correct panel and rail; `/resume/` and `/notes/…` still serve as plain standalone pages; panel requests get the real page; a `/refly/ → /arm/ → /telemetry/` hand-off chain followed by Escape lands on `/`; zero runtime errors. Timings are SwiftShader-dominated (~27s to compose, same software-GL cost that makes the full gate take minutes) and need the pending real-GPU pass to be judged.

Verification: the isolated gate passes all `31/31` checks with zero runtime errors on **SwiftShader** (the suite has grown from the 28 checks cited by earlier checkpoints; nothing regressed). A `shaderSource` hook positively confirmed the injected foil terms (`pressSheenColor`, the additive specular line) compile into the live cover/spine program. Baseline evidence `/tmp/zi3t-press-groundtruth-baseline`, accepted evidence `/tmp/zi3t-press-groundtruth-final`, live-reference capture `/tmp/zi3t-press-reference-live`. Honest limits: this is SwiftShader-only — per remaining-work #3/#6, real-GPU, Safari/Firefox, and Viet's own eye must judge the adopted pipeline (watch for highlight clipping on the straw/oxblood cloth under ×π ambient with no filmic rolloff) before any per-volume `phong` retuning, which must not be done against SwiftShader. Known pre-existing issue observed while probing (out of scope, untouched): `refly-demo.js` passes CSS `color-mix()` strings to `THREE.Color`, which cannot parse them. Deployment remains held.

## Current checkpoint — 2026-07-25 real-GPU pass

Viet installed Google Chrome and reported the shipped features were "still buggy as hell". The pending real-GPU pass finally ran: headed Chrome 150 on **ANGLE Metal, Apple M1 Pro, ~101 fps**, against `wrangler dev`. **The gate's canonical environment is now real-GPU Chrome. Every timing number derived under SwiftShader is void** — it passed `31/31` there while four checks failed here, and it had also been launched with `--hide-scrollbars`, which hid a layout difference from every previous run.

**Confirmed and fixed**

- **The wheel trap — the real "buggy as hell".** Both embedded viewers build `OrbitControls`, whose wheel handler calls `preventDefault()` on every notch. Once the demo canvas scrolled under the cursor it swallowed the wheel outright: the panel dead-stopped (`scrollY` frozen at 440 of 2674) and never scrolled again, so the volume hand-off could never arm. Proven, not inferred — an instrumented listener inside the frame reported `defaultPrevented: true, cancelable: true` on every canvas wheel. Embedded viewers now set `controls.enableZoom = !embedded`; drag still orbits. Standalone pages keep wheel zoom.
- **The hand-off's canvas exemption was the second half of the same bug.** `attachFrameScrollAdvance` skipped any wheel whose target was inside a `canvas`, which also swallowed plain scrolling over one. It now tests `event.defaultPrevented`, so a viewer that genuinely wants the wheel keeps it and everything else scrolls and hands off. Verified: the panel now scrolls 220 → 2640 cleanly and `/refly/ → /arm/`, `/arm/ → /telemetry/`, `/practice/ → /field-notes/` all hand off from both a catalogue click and a deep link.
- **Entry was not actually sequential.** `press-entry-complete` fired the moment `entryLinear` reached 1, but every pose it drives is reached through `damp`, which approaches asymptotically — so the rail cascade started while the books were still visibly sliding. The gate now also requires the worst remaining book offset to fall under `ENTRY_SETTLE_EPSILON` (with `ENTRY_SETTLE_TIMEOUT` as a ceiling so a pointer arriving mid-entry cannot strand the rail). Measured: hand-off moved from 736 ms to 950 ms, with the rail cascading after.
- **`bookBounds` was a drifting measurement, not a pose.** It was snapshotted once, 900 ms after flight-complete, while the route pose was still damping — so the published bounds moved between runs (334.47 vs 336.77 px) and the gate was calibrating against the drift. It now resamples until the pose parks. The compact pose is bit-identical across three runs (316.71 × 443.41 at 37.34, 55.42) and lands inside the existing band: **the band was right, the measurement was not.** No band was hand-tuned.
- **Gate timing floors re-derived from the source.** `1800/1600/1800 ms` were SwiftShader artifacts rejecting correct behaviour: the declared return is `ROUTE_RETURN_DURATION + ROUTE_RETURN_DELAY = 1490 ms`, and real Chrome returns in ~1525 ms. The floors now derive from `ROUTE_OPEN_DURATION`/`ROUTE_RETURN_DURATION` with slack, so they still catch a snapped transition without re-encoding whichever machine last ran.
- **Row-width assertion.** `rowRect.right >= 1567` only ever passed because `--hide-scrollbars` was set; the row is sized in `vw` and deliberately overhangs the content box. It now asserts coverage of `clientWidth`.

**Investigated and rejected — do not "fix" these again**

- **The horizontal overflow is a phantom.** `documentElement.scrollWidth` (1561) exceeding `clientWidth` (1553) looks like an overflow bug but is unreachable: `.home-page`'s `overflow-x: hidden` propagates to the viewport and clips it. Proven with `scrollTo(400, 0)` → `scrollX` stays `0`. Adding `overflow-x: clip` to `<html>` to "fix" it **re-created the canvas regression** — the viewport-pinned scene canvas was knocked to `top: -190/-381/-571 px` on the rail-reached volumes, the exact signature of the reverted scroll-lock. Reverted; the `canvasCover` assertion caught it. `clip` on the root is no safer than `hidden` here.
- **Deep-link compositing, Escape-to-root, and canvas coverage are not broken.** All three composite to full opacity with real panel content in ~800 ms. Early screenshots that looked blank or washed out were the probe capturing mid-fade at 355 ms, not a defect.
- **Volume 5 not handing off forward is deliberate** (`advanceRoute`: no sixth book), not a bug.
- **dpr is not implicated.** Re-checked at `deviceScaleFactor: 2`; the foil/sheen and cover art are indistinguishable from dpr 1 (the renderer caps its pixel ratio at 1.75).

**Still open, needs Viet's eye — the one thing not fixed**

The top face carries the full cover art including its title typography, while the front face carries the same title again. At the resting tilt (`asin(topDepth/depth)`, clamped to 0.45 rad) the top face is crushed to a thin band, so on high-contrast covers the two titles collide into an illegible smear — clearest on GLUON, where "ROBOTICS / RUST" ghosts through "GLUON kinematics"; nearly invisible on Re-fly, whose art is faint. Present identically at dpr 1 and 2, so it is art direction, not a renderer bug. Three levers: drop the title from the top-face art and let the front face own it; raise the tilt so the cover reads; or accept it. This is a design call and was left untouched.

Verification: **`31/31` PASS on real-GPU Chrome**, zero runtime errors. Deployment remains held.

## Current checkpoint — 2026-07-25 restack after a hand-off chain, and the cover face

Viet reported that deep-linking, scrolling through one or two volumes and then leaving for the shelf came back wrong — volumes left tumbling at route scale and rotation instead of restacking — and chose both remaining cover levers.

**Two separate defects, both in returning to the catalogue**

- **The squeeze.** `layoutBooks(snap)` restored position, root scale, root rotation and `object.rotation.x`, but never `object.scale.x`. The route cover pose narrows the object on x (`objectScaleX` 0.86), and `animateBookHome` — the only other restorer — runs for the *closing* volume alone. Any volume the hand-off swapped *away* from therefore stayed squeezed on the shelf for the rest of the session. Reset in the snap block, with a damped safety net in the home branch so a non-snap path also unwinds.
- **The tumble — the one in Viet's screenshot.** `closeRoute` never cancelled an in-flight swap. `animateRouteSwap` owns the single `sceneAnimation` slot and restores both volumes only inside its `linear >= 1` branch, so leaving mid-swap let `animateBookHome` replace that slot and the completion never ran: both volumes kept the route's scale and rotation, `routeSwapping` stayed latched — silently disabling *every later hand-off* — and the outgoing layer was orphaned in the DOM. `closeRoute` now retires the swap, clears `routePose` on all five volumes, and removes stray layers. Verified by interrupting a swap 300 ms in: the shelf restacks, zero layers survive, and a subsequent `/refly/ → /telemetry/` hand-off still works, proving the latch is gone.

**Cover face — both levers applied**

- **No typography on the cover.** The top face carried the title *and* the meta line, both of which the front face already carries; at the shelf's shallow angle they collapsed into the front face's text and over the artwork's own labels as a doubled smear. The cover now carries artwork and the publisher mark only; the front face owns the words. Applied to the albedo and the foil mask together so the emboss stays registered.
- **`topRatio` raised** (0.252/0.276/0.258/0.248/0.322 → 0.4/0.42/0.4/0.4/0.45), which is the only lever that gives the cover more room. **Raising the tilt alone is impossible by construction:** the tilt is *derived* as `asin(topDepth / depth)`, so the top face always projects to exactly `topDepth` pixels whatever angle it is held at. Spending more of the volume's height on the cover is the change; the front face stays the larger of the two and keeps the title.

**Measurement note.** The gate asserts DOM rects and never inspects the rendered scene, which is why it passed `31/31` throughout both defects. The restack was verified instead by decoding the screenshots and comparing book silhouettes against a never-routed control (`scratchpad/silhouette.py`): the swapped-through volumes now match the control to the pixel, and the one wider band is the focus ring Escape restores to the returned volume. **A future gate check should measure the rendered silhouette, not just the DOM.**

The compact route pose moved to a stable `313.96 × 442.34` (identical across three runs) with the raised ratios, so the width floor was lowered `315 → 305`. That is the gate reporting an intentional design change, not drift.

Verification: **`31/31` PASS on real-GPU Chrome**, zero runtime errors. Deployment remains held.

## Current checkpoint — 2026-07-25 deep-link cache poisoning and the compact rail

Two loose ends raised after the restack work. Both were reported from a single observation each; measuring them changed what each one actually was.

**Deep links failed on every other load — a cache bug, not a flake.** A direct load of `/refly/` alternated deterministically between the composited shell and the bare project page (`body ''`, 3 scripts instead of 5). It was not the intermittent dev-server error seen earlier: `curl` was always consistent, and with `Network.setCacheDisabled` all six loads were correct while cache-enabled loads alternated 6/6. The cause is that a book URL returned **two different documents under one URL**, discriminated by `sec-fetch-dest`, with no `Vary` — so the browser reused whichever body it had cached. This is exactly the hazard `worker/index.js` warns about in its own header comment; the `?press-page=1` marker had fixed it for the panel but the `!== "iframe"` test left one header-keyed decision behind.

- A book URL now composes for **every** GET, with no header consulted, so the URL has exactly one body. Everything wanting the page behind it — panel, no-script fallback, frame-failure escape — already asks with `?press-page=1`, a distinct cache key.
- The composed response also carried `/index.html`'s `etag`/`last-modified`, which after HTMLRewriter no longer describe the body and would advertise one book's document under another's identity (and let a revalidation refresh a stale entry in place). Both validators are dropped and the shell is served `cache-control: no-cache`.
- The hover/focus prefetch pointed at the bare book URL, fetching a second copy of the shell; it now warms the `?press-page=1` URL the route actually loads, matching the rail.
- Verified: 6/6 correct **with cache enabled**, where it previously alternated.

**"Escape leaves the URL at the book path" was a symptom of the above, not a separate bug.** On the poisoned loads the browser had the standalone project page, which carries none of the scene's JavaScript — so nothing handled Escape. No change needed once the document is right.

**The rail: mostly a misreading, with one real residue.** The claim that the rail is inert *on deep-linked routes* was wrong on both counts. On desktop the rail is `opacity: 0; pointer-events: none` inside any route — **hidden by design, not a bug**; the earlier "rail works inside a route" note was equally wrong, an artifact of `element.click()` bypassing hit-testing and inertness. The real defect is compact-only: the compact media query brings the rail back for a route but restored **only the opacity**, leaving a rail you could see and not press. Three things blocked it, all now fixed:

- `pointer-events: auto` restored alongside the opacity (compact only — desktop still hides it).
- `homeFrame.inert = true` took the rail out with the rest of the shelf. `inert` is inherited and cannot be undone on a descendant, so `setShelfInert` marks the siblings along the rail's ancestor chain instead, leaving exactly the rail reachable. `inert` already hides a subtree from assistive tech, so the blanket `aria-hidden` is gone.
- The route's back arrow shares the left column and its box overlapped the first tick, swallowing its clicks; the compact rail is nudged `+14px` clear of it.

Verified with a **real pointer click** (not `element.click()`): a compact rail pick inside a route hands off `/refly/ → /telemetry/`, which was previously impossible. All five ticks hit-test to the rail with no inert ancestor.

**Method note.** Both of these were invisible to the gate and to `element.click()`. Reachability has to be checked with `elementFromPoint` plus a dispatched pointer event, and cache-shaped bugs need the cache left *enabled* — the natural instinct to disable it hides them.

Verification: **`31/31` PASS on real-GPU Chrome**, zero runtime errors. Deployment remains held.

## Current checkpoint — 2026-07-25 phase 2, the volume in its section

Continuous-scroll rebuild, phase 2 (plan: `references/continuous-scroll-plan.md`). Each volume is now drawn into its own assembled section instead of only onto the catalogue shelf. Two attempts before this one guessed at the cause and were discarded; this pass measured it first, and the measurement is recorded in the plan.

**What the probe found.** Not the `homeMotionActive` gate the hand-off suspected: inside a section the gate is open and every book's `root.position.y` already equals its `layout.y`. `layoutTarget` was assigned once to the shelf slot and `stackShift` freezes past the catalogue, so nothing ever retargeted — the pose was absent, not broken. `terminalSceneOpacity` was ruled out in one read.

- **A book has two homes.** `layoutBooks` computes both — the shelf slot and its section's `.press-volume-figure` — and blends between them by `sectionWeight`. The section pose is placed, not damped: its target moves with the scroll, so damping would leave the volume trailing its own hero. Cover geometry comes from `routeCoverTarget`'s constants minus its screen placement; the shelf's `centerOffset`/`yOffset` calibrate the shelf tilt and do not survive a cover-on book.
- **Applied outside `homeMotionActive`.** That gate only stays open for `wakeScene`'s window after an input. A scene driven from scroll position must not sit behind it.
- **Volume 1 travels, the rest are switched.** Volume 1's two homes are both on screen across the 132px between the catalogue's scroll range ending and the first ground arriving, so it flies between them. The other four switch when their figure is about to enter from below, by which point their shelf slot is under a section's ground.
- **The ground still cuts the shelf, by scissor.** The canvas paints above the sections' grounds, so a section rising over the catalogue can no longer occlude the books left on it. `drawFrame` splits the frame the way §4/§7 of the extracted facts say the reference does — one fixed canvas, `setScissorTest(true)`, `autoClear` false, split by scroll position: shelf volumes get a pass clipped to the strip still above the ground, volumes that have left for their own section get an unclipped one. A book crossing the ground edge is cut by it exactly as it was when the ground painted on top. The buffer is cleared before the scissor goes on, or the strip outside it keeps the previous frame. A route takes the unsplit path — it clears the whole canvas to its volume's colour and must never be clipped by a ground behind the route layer.
  - An opacity fade was tried first and rejected on measurement: keyed off the ground's distance from a book, it dimmed the **resting** catalogue, where the ground sits exactly at the fold. At `scrollY 0` the telemetry volume rendered at `0.298` and the two below it at `0`. The gate could not see it — its idle-coverage checks sample the first volume only, which was at `1`. Scissoring has no such tuning constant.
- **Paint order, without moving the canvas.** `.press-catalog` sets `perspective`, so it is the containing block for any fixed descendant, and a body-level canvas would rise above the scrim, hold caption, help, rail and route layer — the route layer still matters, phase 3 has not run. Instead the section layer is split around the pinned hero: each section's ground is a `::before` at `z-index: -1` (under the hero, so under the canvas), each section's content is positioned (later in tree order, so above it). `.home-page` and `.home-hero` give up their opaque background to `body`, whose background paints under the negative-z pass. Nothing between them may create a stacking context. All of this lives in `home-press-volumes.css`, which only the assembled document loads, so `/index.html` on its own is unchanged.
- **The pinned hero stops claiming the pointer** once a section owns the viewport (`press-in-volumes`), and the rail and help fade with it.
- **Reduced motion keeps the scene in the catalogue.** That path caps `main` at `100svh`, so the hero stops sticking and the canvas leaves with it; a volume could not be drawn into a section below even if it were posed there. Restoring the pin would reinstate the long journey reduced motion exists to remove. The sections stay plain document and the figure column is dropped so it is not a held-open gap.

Verified at 1568×894 on real-GPU Chrome: **`31/31` PASS**, zero runtime errors, one volume drawn per section, the resting catalogue back to full opacity on every visible volume, `/arm/` and `/field-notes/` deep links landing on their section with the volume posed and no route layer, and 390×844 compact posing into its single-column figure. Screenshots inspected at all five section heroes, mid-content of three sections (where the sections' new stacking rules meet the assembled pages' own CSS — clean), the hand-off band, the catalogue end, and the terminal.

**Known gaps.** The section cover shows its artwork rotated 90° — this is the existing route cover pose reproduced exactly, not a phase-2 regression, and it should be corrected for both at once. Volume content inherits its page's own text colours into the section palette, so some passages are low contrast; that is phase 1's stylesheet-collision risk and is still open. `window.__pressDebug` is deliberately left in the scene until phase 5. Deployment remains held.

## Current checkpoint — 2026-07-25 phase 3, the address follows the scroll

Continuous-scroll rebuild, phase 3, plus the parts of phase 5 it invalidated. The route model is gone: **930 lines** of route machinery removed from `home-press-scene.js` (3605 → 2529) and its stylesheet block from `home-press-calibration.css`.

- **A book URL is a position, so a pick is a scroll.** `openVolume` and `goToRailVolume` scroll to the section. The anchors stay real: without the assembled sections nothing is prevented and the browser follows the href.
- **The address follows the scroll.** One `IntersectionObserver` with `rootMargin: "-50% 0px -50% 0px"` — whichever section holds the middle of the viewport owns the address, the catalogue owns it when none does. Always `replaceState`: scrolling past five volumes must not bury the entry the reader arrived on. A deliberate pick uses `pushState`, so Back undoes the pick but never a scroll.
- **History is a scroll.** `popstate` scrolls to the section named by the path, or back to the offset parked on the entry. `history.scrollRestoration` stays manual, so the offset is restored by hand.
- **Retired:** `openRoute`, `closeRoute`, `swapRouteTo`, `advanceRoute`, `animateBookToCover`, `animateRouteSwap`, `animateBookHome`, `createRoute` and the iframe, `prepareReadingFrame`/`prepareProjectFrame` and their ~250 lines of injected embed CSS, the wheel hand-off, Escape, `setShelfInert`, `focusRoute`, the `press-page=1` prefetch, `routeEase`, the six `ROUTE_*` timing constants, and the now-unreachable `transitionStarted` / `sceneAnimation` / `route` state with every branch that tested them.
- **Kept deliberately:** the worker is untouched — it still answers a book URL with the assembled shell, and `?press-page=1` still reaches the genuine page even though nothing asks for it now. `data-press-route` still supplies each volume's address. The no-WebGL fallback (`home-press.js`) still departs to a real page, so its `is-transitioning` rule was restored minus the route selector it shared.

**Gate rewritten around the new model — `34/34` PASS, four consecutive clean runs.** The route checks became: a catalogue pick scrolls to its section and takes its address (proved by the pushed `history.state`, not by `history.length`, which stays put when a push truncates a forward entry); history moves the reader between catalogue and volume; the address follows the scroll through all five volumes and back to `/` without pushing; the rail reaches every volume; section geometry; and — closing a gap the contract has carried since the beginning — **the rendered-silhouette check**, sampling each section's figure column out of a real frame against that section's own ground.

**Two determinism fixes the rewrite forced, both worth keeping.** An unfocused headful Chrome window has its animation frames throttled, so every damped state this gate measures — held isolation, the caption, the return — stalled together in one run and passed in the next; `Emulation.setFocusEmulationEnabled` removes it. And three checks sampled damped state on a fixed delay; they now wait for it, keeping their negative assertions at the moment it settles. Before these, the gate failed intermittently on checks phase 3 never touched.

- **The covered catalogue leaves the tab order.** The pinned hero keeps its anchors' on-screen bounds while a section covers it — the stack is frozen, not scrolled away — so `updateAccess`'s viewport test never retired them and `pointer-events: none` only stopped the mouse. Measured inside `/arm/`: Tab walked five invisible rail items and three invisible catalogue links before reaching the section's own content. `updateAccess` now marks the shelf inert whenever a section owns the viewport, and the faded rail and help take `visibility: hidden` (delayed by their fade, so the transition still plays). The gate asserts the inert state and tabs six times to confirm nothing lands on the shelf.

**Known gaps.** **The live demos do not run in the assembled document.** `assembleVolumes` inlines each page's `<main>` inner HTML plus the five stylesheets, but nothing carries the pages' `<script>` tags, so `refly-demo.js`, the arm viewer and `telemetry-lab.js` are absent from the shell — the sections show those pages' static placeholders. Phase 4 is therefore *making them run*, lazily on approach, not throttling something already running; the three-live-contexts risk is unrealised. (An earlier version of this checkpoint claimed the opposite; it was inferred from the placeholder text rather than measured.) The section cover artwork is still rotated 90° — inherited from the route pose that has now been deleted, so it is the scene's own to fix. Volume content still inherits its page's text colours into the section palette. `window.__pressDebug` is still in the scene. Deployment remains held.

## Current checkpoint — 2026-07-26 two documents, not one scroll

**Phase 3 shipped the wrong model, and the gate certified it.** Scrolling `/` walked into the volume sections and handed the address to `/refly/`. The reference does not do that, and this was measured rather than argued — Chrome on a real GPU at 1568×894, against `press.stripe.com` itself:

| | reference `/` | reference `/boom` | ours before | ours now |
| --- | --- | --- | --- | --- |
| document height | 6956 (7.8 vp) | 59529 (66.6 vp) | 15604 (17.5 vp) | `/` 3605, volumes 15604 |
| address while scrolling the whole document | never leaves `/` | follows the section | **left `/` at 894px** | never leaves `/` |
| `history.length` drift over that scroll | 0 | 0 | 0 | 0 |

The reference's own DOM says what the arrangement is: the same `PressHomepageWrapper` element is 6932px on `/` and 59529px on a book, and its `PressHomepageProductList__container` goes **5846px → 0**. One DOM, two documents, switched by navigation. A pick is instant — 120 ms after the click it already had the new address, the new document height *and* scrollY 12148 — and Back returns to `/` at the offset the pick was made from.

**So the scene gained a mode**, `pressMode`, switched only by a pick, a `popstate` or a deep link, and never by scrolling:

- **Catalogue.** `.press-volumes` is `display: none`; `main` is the shelf journey plus the terminal journey and nothing else; the address observer is inert. This is what keeps scrolling `/` inside `/`.
- **Volumes.** The sections are shown, the hero's in-flow height is taken away (`height: 0`, `overflow: visible`, `.press-catalog` re-given `100svh`) so volume one starts at offset 0 the way the reference's book document opens on the book you picked, and the terminal panels are hidden — their reveal is driven by a scroll range this document does not have, and the footer is `position: fixed` in the closing panel's ink. The fixed masthead is the way out, which is the reference's arrangement too.

**Three things that would each have silently defeated it**, all caught by measurement:

1. `display: none` does not make a figure rect null — it makes it *zero*, which reads as "this section's ground is at the top of the viewport" rather than "there is no ground". `sectionHandoff` and `sectionWeightFor` gate on the mode, not on the geometry; verified at `/` that all five weights are 0 and `sectionGroundTop` is `Infinity`, so `drawFrame` takes its unscissored early return.
2. `behavior: "auto"` means *defer to CSS*, and `site.css` sets `scroll-behavior: smooth` on `html`. The pick was animating for **1.5 s** and replacing four addresses on the way past. Traced from inside the page; `"instant"` makes it one replace, one push, one scroll, 11 ms.
3. Order matters in both directions: expand before reading a section offset (collapsed, they all report 0), and collapse **after** restoring the scroll on the way back (the catalogue is the shorter document, so the browser would clamp an offset restored into a document about to shrink).

**The scissored two-pass render is gone.** It existed because the catalogue/volumes boundary could sit mid-viewport and a book crossing it had to be cut by it. With two documents there is no such boundary — the sections begin at offset 0, so `volumes.getBoundingClientRect().top` is never positive and the clipped pass had become unreachable. `drawFrame` now splits by mode: the catalogue draws its whole shelf, the volumes document draws only the books that have reached a figure. (The reference's own scissoring, recorded in extracted facts §4/§7, is unaffected — that is a record of its engine, not of ours.)

**Gate: `38/38` PASS on three consecutive real-GPU runs, zero runtime errors.** The check that encoded the bug — "the address follows the scroll" starting at `/` — is now two: **scrolling the catalogue never leaves the catalogue** (walk the whole document 220px at a time; assert one path, zero history drift, sections collapsed to zero height), and the address trail measured *inside* the volumes document, which now ends at `/refly/` rather than `/` because the catalogue is not in that document to scroll back into. Section geometry is measured after the pick for the same reason. Also new: **Back restores the catalogue where the reader left it** (four rail picks from four different offsets, each returning to its own), and **a deep link lands on its volume without claiming another address**. That last one caught a real defect: the address observer delivers at the end of the first frame, but the deep link cannot land until there are frames to measure against, so `/field-notes/` flipped to `/refly/` at 224 ms and back at 234 ms — the reported bug in miniature. Only visible by recording `history.replaceState` from inside the page; every settled-state sample says it never happened. The rail check now runs from `/` between Backs, because the rail is hidden once a section owns the viewport — a real reader can only reach it there.

**Known gaps.** Unchanged from phase 3: the demos still do not run in the assembled document (phase 4), the section cover artwork is still rotated 90°, volume content still inherits its page's text colours, `window.__pressDebug` is still in the scene. New and honest: **a pick is now a hard cut** — the reference carries the book across that switch in the canvas, and the animation that used to do that here was deleted with the route. Deployment remains held.

## Current checkpoint — 2026-07-26 the volume in its section, posed and flown

Asked to prioritise replicating the reference, three of its behaviours were still missing. All three were already recorded in extracted facts §8 and had simply not been applied.

**1. The cover pose, and the sideways artwork.** §8: rest rotation `(−π/2, 0, +π/2)` → active `(−.5, .35, .15)`. **The reference sheds its quarter-turn roll when a book stands up.** This scene had no rest roll and *added* `π/2` here, which stood the volume portrait and took its landscape-authored artwork around with it — that is the whole of the "cover renders rotated 90°" gap carried since phase 2. It was never a texture bug. Now `SECTION_COVER_ROLL/YAW/PITCH_SHORTFALL`. **Only the yaw is §8's literal value**; the two rigs do not share an axis convention, so roll and pitch are calibrated by eye and should be treated as such. The reference frame they were calibrated against is not kept in the repository — it is a capture of Stripe's page, and this project does not carry the reference's assets. Reproduce it with `scratchpad/refpick.mjs` (drive `press.stripe.com`, scroll a book anchor into view, click, screenshot at `t+2400ms`, 1568×894) and compare against these measurements taken from it:

| | reference | ZI3T after this pass |
| --- | --- | --- |
| cover quad | ~305–745 × 168–715 → 440 × 550 | 519 × 415 (landscape) |
| long axis ÷ viewport height | .615 | .615 |
| in-plane tilt | top edge falls ~1.5° to the right | −.04 rad, same direction |
| side face | left visible, ~20° yaw | .35 rad | Size comes from the viewport as the reference's does — its cover measures `.615` of viewport height on its long axis — capped by the figure column so a 390×844 viewport does not get a 519px cover on a 342px column.

**ZI3T's volumes are landscape where the reference's are portrait**, because the cover artwork is authored landscape. Rotating five covers to portrait would make the shelf show them sideways, which is exactly what the reference does — but it is an artwork change, not a pose change, and the artwork is ZI3T's own. Recorded as a divergence, not a defect.

**2. The pick flies.** §8: every transform lerps toward its target at a speed that ramps `+.006` per frame to a `.15` ceiling and is **reset to 0 on activation** — so the reference's "transition" is not a bespoke animation at all, it is the universal ease restarting slowly. Measured on the reference: at `t+120ms` the book is already large and mid-turn, settled by `t+600ms`. Reproduced with `FLIGHT_EASE_STEP`/`FLIGHT_EASE_CEILING` over the picked volume only, frame-rate normalised, ending when it lands so that scrolling still places the pose exactly. Two things it needed: the shelf's damped pose chain must skip the flying book (the release wakes the scene, and both were writing `object.rotation.x` — they settled on a blend, which is what the first attempt rendered), and `setPressMode("catalogue")` must clear the flight and snap, or a Back mid-flight parks the volume half-posed.

**3. The rail and the help marker stay on screen inside a volume.** Both are in the reference's book frame, in the same left margin they occupy on the catalogue. They had been hidden with the rest of the covered chrome. The shelf's *book links* still leave the tab order — those are genuinely covered — so the accessibility fix stands and the gate now asserts the narrower, correct thing.

**Gate: `39/39` PASS on consecutive real-GPU runs, zero runtime errors.** The rendered-silhouette coverage rose across every volume (`.20–.37` → `.29–.52`) — the volumes are simply more present. New check: the rail moves between volumes without leaving the volumes document.

**Known gaps.** The demos still do not run in the assembled document (phase 4). Volume content still inherits its page's text colours into the section palette. `window.__pressDebug` is still in the scene. Landscape-vs-portrait volumes as above. Deployment remains held.

## Current checkpoint — 2026-07-26 the volume stays live in its section

The section volume was a still: it could not be turned, it did not answer the pointer, and scrolling past it did nothing. Four behaviours added, all read out of the reference's own page module rather than estimated — `v1-Page-UQGXZSLU`, `handleMousemoveCover` and `handleMouseup`, with the constants declared at the top of that file:

| behaviour | reference | ours |
| --- | --- | --- |
| pointer follow, nothing held | `dt = 15e-5` rad/px, from canvas centre | `COVER_FOLLOW_RATE`, measured ±.084 rad across the viewport |
| drag | `x = .003` rad/px, anchored on the grab | `COVER_DRAG_RATE`, measured +.54 rad over 180px |
| release throw | last delta clamped ±`.3`, decayed `×.95` a frame until under `.001` | `COVER_TWIRL_*`, measured .83 → 1.93 → 3.77 then stopped |
| scroll turn | `st = 8e-4` × `activeScrollY`, added to the **active book's Y target only** | `COVER_SCROLL_TURN`, measured delta .4 over 500px |

Vertical pointer travel turns the cover about the horizontal axis and horizontal travel about the vertical one, as the reference maps them; a release re-anchors so the orientation survives and free-follow resumes from it; and the offset resets when the active volume changes, which is what `resetDragRotation()` does there.

**Escape returns the volume to the shelf.** The reference's `handleKeyUp` maps `Escape` to `activateProductList()`, which restarts the ease, clears the drag rotation and scrolls to **that book's own slot in the list** — not to wherever the reader had been. So the shelf comes back with the volume you were reading under the cursor. Verified landing on slot 571 of 571 for volume 3. The same handler maps `ArrowUp`/`ArrowDown` to stepping between volumes; **not adopted** — our sections carry long-form reading and taking the arrow keys from a keyboard reader costs more than the shortcut is worth.

**Two bugs this surfaced.** `boot()` ended with `setCurrentIndex(0)` *after* the deep-link handler had already named its volume, so every deep link told the scene volume 0 was current — the rail marked the wrong volume, and once the pose went live the pointer was turning a book off screen. And the first cut of the live pose wrote its offsets in `layoutBooks`, which only runs on scroll and resize: pointer movement recomputed nothing. The offsets are applied at draw time; the scroll term, which does change with scroll, stays in the layout pass.

**Gate: `43/43` PASS on consecutive real-GPU runs, zero runtime errors** — four new checks, one per behaviour, asserting the measured rates rather than "something moved".

## Current checkpoint — 2026-07-26 portrait volumes, one ink per section, and the debt

**The volumes are portrait now.** `depthRatio` went from ~.70 to ~1.25 of width across all five, so the cover's long axis is its height, as the reference's is. The change is free on the shelf, and the reason is worth keeping: `tilt = asin(topDepth / depth)`, so the top face projects to exactly `topDepth` pixels *whatever* the depth — a deeper book simply lies back at a shallower angle. Measured before and after at 1568×894, the shelf silhouette is identical to the pixel: **1567×189 both times.** The section cover sizing moved with it, from `dimensions.width` to `dimensions.depth`, capped by the figure column.

**The artwork was then re-authored into that shape.** All five SVGs go from `viewBox="0 0 1200 260"` — a 4.6:1 strip drawn for the shelf's top band — to `0 0 800 1000`, and none of them paints a background rect any more, so the volume's own cloth and threads show through the line work instead of being covered by it. Each draws what its volume is about rather than decorating it: refly's one tape replayed and then diverging after the checkpoint that changed; arm's six-axis chain with its joint axes and tool frame; telemetry's ordered event path against what arrived out of order, bounded by the replayed window; practice's boundary rings around a contract with the evidence ruled beneath; notes' working page with the correction drawn under the measurement it replaced.

**The cover carries its own title now**, which it could not while the face was landscape — the previous code says so in a comment, and it was right: a title across the middle of a landscape face collapsed into the front face's and read as a doubled smear on the shelf. Three things had to be true before it could work, and each was found by looking rather than reasoning:

1. *The title band belongs on the cover's far edge*, which is the most compressed part of the shelf pose. That is where the reference puts its own.
2. *It has to be small* — a real cover's title is small against its board. The first pass used ~10% of cover width and reproduced exactly the doubling the old comment warned about; it is 5.8% now, and reads as texture on the shelf and as a title face-on.
3. *The bump map presses nothing.* It is a 128×128 tiling cloth weave, not a registered decal surface, so the same relative layout lands somewhere else entirely on an 800×1000 albedo and lifted a second, offset copy of every letter out of the board. The old code got away with pressing the mark there because a small mark passes as texture.

The albedo highlight was also re-fitted: its stops were tuned for a landscape face and covered far more of a portrait one, washing the artwork out.

**Every section is one ground and one ink.** The five genuine pages carry their own themes into the assembled document, and it measured as badly as it looked: **23 failing selectors, ratios down to 1.11:1** — body copy on refly and arm was effectively invisible. Now **0 failing selectors across all five**. Two decisions behind that:

- *Hierarchy is never carried by fading the ink.* A muted tier is the ink blended toward its own ground, so its contrast is bounded well under the palette's — pure black at 72% over the notes tan measures 4.25:1, still short. Full ink everywhere means each section only has to clear the bar once, in its palette, and size/weight/letter-spacing carry the hierarchy. This is also what the reference does.
- *The notes palette itself failed* at 3.62:1, so `--press-notes-ink` went `#26333d` → `#161d23` (4.76:1). The other four already cleared: refly 6.88, arm 6.42, telemetry 8.21, practice 4.98.

The pages' dark cards are gone too — flat ground, thin rules at 24% ink, ruled links and actions with no fill, which is the reference's book-page character. `.project-visual` is exempt: those are authored diagrams, not page chrome.

**Back control added**, sitting directly above the rail where the reference's does, on the same `returnToCatalogue` path as Escape. It exists only in the volumes document; `display: none` on the catalogue keeps it out of the tab order rather than leaving an invisible stop. Its ink cannot be inherited — it sits in the pinned hero *below* the sections — so the scene publishes the active volume's ink as `--press-active-ink`.

**Debt cleared: `window.__pressDebug` is opt-in.** The scene installs it only when `window.__pressDebugEnabled` is set before it loads; the gate sets that through `Page.addScriptToEvaluateOnNewDocument`, which survives every navigation without decorating URLs. The gate now drops the opt-in, reloads, and asserts the hook is `undefined` — so "gated" is a fact, not a claim.

**Gate: `45/45` PASS on consecutive real-GPU runs, zero runtime errors.** Rendered-silhouette coverage rose again with the portrait covers — `.37–.54` across the five, from `.29–.52`.

**`ArrowUp`/`ArrowDown` step between volumes**, as the reference's `handleKeyUp` does. Adopted on request, with the cost stated rather than hidden: it takes the arrow keys away from scrolling inside a volume. Mitigated by stopping at the ends instead of wrapping, and by ignoring the keys whenever the target is an input, a textarea, a select or anything `contenteditable` — a volume's content is real page content and may contain all four.

**The §7 idle render pause is still not done, and there is now a reason rather than a preference.** `render()` deliberately keeps presenting while the page is visible, and the comment above it records why: the default WebGL drawing buffer is not guaranteed to survive compositing, so an idle catalogue that stops drawing can clear. The reference pauses after 1200ms of no movement; adopting that here trades a real blank-canvas risk for power, and it needs a pass that establishes which browsers actually preserve the buffer before it can be taken.

## Current checkpoint — 2026-07-26 the spine goes back on the long edge

**The portrait flip put the binding on the wrong edge, and it took a reader to see it.** The mesh is unambiguous once read: `spine` is a `width × thickness` plane at `z = +depth/2`, so **the spine's length is `width`**. Raising `depthRatio` past 1 made `width` the *short* axis, which is a volume bound along its short edge — a landscape book stood on end. The cover looked right face-on, which is exactly why it survived a gate run and two screenshots.

**The fix restores the original architecture rather than patching around it.** `depthRatio` goes back below 1 (~.80, the reference's own cover proportion), so `width` is the long axis the volume is bound along, and the section pose stands that axis upright with a **π/2 roll** — which is what extracted facts §8 has been saying all along: rest `(−π/2, 0, +π/2)` → active `(−.5, .35, .15)`. The rest roll lays the spine horizontal for the shelf; standing the book up takes it off. The earlier reading of that line — "the roll is dropped, therefore the section needs no roll" — was half right: the roll is dropped *from the rest pose*, and the rest pose is the shelf.

So the honest sequence across today is: the cover artwork was authored for an unrolled face, the roll was removed to make it read, the geometry was flipped to keep the silhouette portrait, and that moved the binding. Removing the roll was the wrong half of the fix; the artwork was always the thing that was wrong.

**The composition now happens in the final orientation.** The cover face is `width × depth` — landscape, long axis first — so its texture is landscape too, and everything is painted into a rotated space inside it. That is the only arrangement where the artwork, the typography and the standing volume agree. The sheen mask needed the same rotation: it builds its foil mask from the artwork pixel by pixel, and unrotated it painted a second copy of the cover across the rolled one.

**On the shelf the cover artwork now lies sideways**, which is correct and is what the reference does — its own covers read vertically in the top band. The titled long edge faces the reader, as a spine on a shelf should. Shelf silhouette measured **1567×189**, unchanged through all of it.

**Gate: `45/45` PASS on consecutive real-GPU runs, zero runtime errors.**

### The volume as a bound book, not a printed one

Three passes, each found by looking at a capture rather than reasoning:

- **The spine's reading direction is decided by the roll**, not by the spine texture. It already ran along the long edge; rolling one way climbs bottom-to-top, the other runs top-to-bottom. Flipping it means flipping the cover composition with it — artwork, typography and the sheen mask all compose in the rolled space — or the cover lands upside down.
- **A hardback is a case around a smaller block.** The boards overhang the pages on the three unbound edges (the binder's *squares*) and are flush at the spine, which is bound and has none. The book was one box with the cover painted onto planes lying flush on its faces, so every edge met the boards dead flat. The boards and spine keep the calibrated outer size; the block is inset inside them. **The squares are on those three edges only** — insetting the block vertically as well opened a cavity, and with nothing standing in for the case's walls an orbit under the volume looked into a hollow box.
- **The page edge is the edge of every leaf in the block.** It was drawn at ~.05 alpha, invisible against the boards, which left the block reading as a solid cream slab — the single thing that most stopped the volume reading as bound. Now stacked at 2px with gathered signatures every ninth of the canvas, and repeated 3.4× so the leaves stack across the block's thickness rather than spanning it.

**A layout bug the covers were hiding.** `drawCoverTypography` measured itself against `context.canvas`, which is the landscape texture — but it draws into the *rotated portrait composition* inside it. Every margin and baseline was laid out transposed: the credit line came out about a fifth of the cover too high and sat inside the artwork, which read as an art collision rather than a coordinate one. It takes the composition's dimensions now. Two artworks were also moved off the credit line, and the meta line lifted clear of long titles' ascenders.

**Thickness came from a silhouette-neutral lever.** `topDepth + thickness` always sums to `totalHeight`, so lowering `topRatio` (.40 → .30) thickens the volume and shallows its top band **without moving the shelf at all** — measured `1567×189` before and after, as through every change in this sequence.

## Current checkpoint — 2026-07-28 standalone sections, §7 fan and idle pause, §8 spine ease

Viet redirected the remaining work: the homepage is a standalone project like refly/arm/telemetry, so the assembled sections will **not** run the live demos (plan phase 4 is cancelled). The sections' dead demo placeholders were replaced with genuine content, and the recorded-but-unadopted §7–§9 calibration constants were evaluated and adopted where the accepted choreography allowed.

**Standalone section content.** Each demo page now marks its live-demo shell `data-press-demo` and carries a static `data-press-brief hidden` summary; the worker strips the one and unhides the other at assembly, so the page stays the single source and renders unchanged on its own address. Refly loses the run-grid/playback/tape shell (keeps hero + implementation); arm loses `#viewport`/`#panel` (keeps hero + implementation); telemetry loses `.lab-shell` and gains a fuller brief — its page had no editorial content at all. Verified assembled: 3 briefs, 0 demo shells, 0 stray `hidden`; verified standalone: all three demos still boot behind the escape hatch with zero console errors (refly "bit-exact", telemetry "12 unique events").

**`?press-page=1` restored.** It had been fully removed with the route machinery, which left the live demos *unreachable* — the worker composed the shell on every GET of their addresses. The worker now bypasses composition when the query is present (a distinct cache key, the documented hazard this marker exists to avoid), and the briefs link to it. The plan's "`?press-page=1` disappears entirely" goal was a casualty of the cancelled phase 4 and is reversed deliberately.

**§7 scroll-velocity fan — adopted.** The old `scrollDelta × .00235` clamp-to-±.2 target chased by two damps is replaced by the reference's own law: a scroll event sets `scrollVelocity = scrollDelta × .003` (catalogue document only — the reference runs it while no book is active), it decays ×.4 per frame (frame-normalized), and it is added to the spine-tilt target *inside* the damped approach. One addition the source does not need: a ±1 rad safety limit, because a trackpad flick delivers far larger single deltas than the source's debounced listener ever sees. Measured visually: mid-scroll the spines fan to expose the undersides, settled 1.2s later the stack is back at rest tilt (`/tmp/zi3t-fan-mid.png` vs `/tmp/zi3t-fan-settled.png`).

**§7 idle render pause — adopted, with the buffer question answered.** The blocker recorded 2026-07-26 ("which browsers actually preserve the buffer") is answered by doing what the reference does: `preserveDrawingBuffer: !compact` (its own `!isSmallScreen`), so the settled frame survives compositing by contract rather than by observation. The loop now skips `drawFrame()` once idle for 1200ms past `renderUntil`, only when nothing is held, returning, flying, or twirling; any input re-wakes through `renderUntil`. Compact layouts keep presenting — an unpreserved buffer going blank is the risk the pause was avoiding. The gate's idle-coverage checks are now the standing test: `desktop-idle-2250`/`desktop-idle-5000` show a fully painted shelf after the pause (coverage .92), identical to `desktop-base`.

**§7 camera-follow ratios — evaluated, not adopted.** `.0222/.027` source-units-per-pixel belongs to a camera travelling through a 3D-spaced stack; ZI3T's shelf is anchored to real DOM rects, and `camera.y = −shift` at 1:1 px *is* the translation of that follow law into this architecture (the source even divides its ratio by its canvas scale to keep books pinned to layout). A literal import would unpin every anchor.

**§8 spine-z ease — adopted.** The z channel eases at a fixed `.1` per frame (frame-normalized) instead of `damp(10.5)`. Hover draw-in is slightly gentler; the accepted hover/held silhouettes are unchanged (they are screen-space placements, not rates).

**§8 universal-ease reset — evaluated, partially present.** The reset-to-0 on *activation* is already the flight (adopted 2026-07-26). The same reset on *release* is deliberately not added: the release choreography is calibrated to the measured 80ms/880ms reference keyframes, and a slow-start ramp there would move exactly those profiles.

**Gate: `45/45` PASS on two consecutive real-GPU Chrome runs, zero runtime errors.** Evidence `/tmp/zi3t-press-standalone-pass1`, `/tmp/zi3t-press-standalone-pass2`; baseline `/tmp/zi3t-press-standalone-baseline3`.

**Two environment lessons, worth keeping.** The gate reuses whatever tab it finds on the debug port, and its `history.back()` checks then walk *the previous run's* session history — a second run on the same tab failed 13 checks in a cascade that was history pollution, not scene state. **Fresh tab per gate run.** And a headed Chrome on the desktop accepts the physical mouse: one baseline run failed "pointer press evacuates the stack" with `dragging: true` because a real pointer event crossed the 4px threshold mid-check.

**Firefox smoke (Developer Edition, real GPU).** The scene renders: context, shelf, layout, palette all correct; entry completes. It reads darker/flatter than Chrome under the same linear pipeline — recorded as the cross-browser nuance remaining-work #3 predicts, not tuned against a single capture. Safari and touch remain unprofiled; driving either past macOS permission dialogs was declined (a system screen-recording prompt was left for Viet).

**Known gaps.** The section cover typography mixes each volume page's own display faces (refly/arm sans hero against the serif section furniture) — genuine page character, left as is. Everything previously listed (demo scripts in sections, rotated cover art, inherited text colours) is closed or cancelled.

## Current checkpoint — 2026-07-28 deployed: pre-deploy verification and the lifted hold

Viet approved the final path (Safari + touch smoke → first-load recording → briefs review → lift the hold). Results:

- **Safari (macOS, real GPU).** Catalogue renders and the entry completes with the rail cascade; a capture taken four minutes after load shows the shelf fully painted — the §7 idle pause plus `preserveDrawingBuffer` behaves in WebKit. Deep link `/arm/` boots into the volumes document with the volume posed, the worker's metadata rewrite intact, and the back control present. The live-demo escape `/arm/?press-page=1` boots the WASM kinematics and the three.js viewer with working sliders. Safari's *interactive* drag paths were not re-driven (no automation permission; the user declined nothing — macOS prompts were left for them), but the pointer state machine is unchanged since the 2026-07-23 Safari-parity checkpoint, and today's changes (velocity fan, idle pause, spine ease) are the parts that were exercised.
- **Touch (CDP mobile emulation, 390×844, real touch events).** Compact catalogue shows three volumes on load (anchors 277/470); a genuine `touchStart`/`touchEnd` tap opens the volumes document at `/refly/` with no held/dragging classes — the pointer-hold choreography stays off for touch as designed. Brief displays, zero demo shells, zero errors.
- **First-load real-time recording (CDP screencast, cold cache, 1568×894).** 208 frames over 2.75s at ~120fps: first paint 580ms after navigation; books fade in staggered by 682ms, settled with full colour by ~1250ms with the rail still absent; rail ticks cascade from ~1690ms; rail complete with the help mark by ~2690ms. The cold shader compile lands *before* the visible sequence and never consumes it. `/tmp/zi3t-firstload/`.
- **Firefox** remains as recorded earlier today: correct but darker/flatter; not tuned from a single capture.

**Deployment: hold lifted by Viet, deployed 2026-07-28.** Version `4ee347af-4362-406e-a79f-b48d2a89ee3b` on zi3t.io. Production verified: `/` composes 5 sections with 3 briefs and 0 demo shells; `/telemetry/` carries its volume title/metadata; `/refly/?press-page=1` serves the live demo; `/resume/` standalone 200; the deployed scene is `home-press-scene.js?v=20260726e`. The brief copy is reproduced in the session summary for Viet's eye; any copy edits land as a follow-up commit, not a rollback.

## Current checkpoint — 2026-07-28 the case gets its boards

Viet asked whether the volumes could render as realistically as the reference's — "thick cover, etc." The honest audit: the pipeline (Phong + ported foil/sheen + ×π rig) was already the reference's, but the *structure* was not a hardback's — the boards were zero-thickness art planes floating 1.05 units over a full-height page brick, so any off-shelf angle showed a paper sheet, not a case. Environment/shadow lighting was already tried and rejected (staged-product look; the reference has neither), so the realism had to come from geometry.

- **Thick boards.** `boardThickness = clamp(thickness × .1, 3.5, 10)` — the binder's ~2.5mm greyboard against a ~28mm block. Two `BoxGeometry` slabs span the full case footprint; the block yields its top and bottom to them and embeds 0.3 into each (no coplanar faces — the z-fight rule). Box faces are multi-material: cloth wrap (new `boardEdgeMaterial` — cover cloth darkened ×.82 with the weave bump) on every outer face, the volume's own `underside.endpaper` tone as the pastedown facing the block. The calibrated art planes, spine surface, and all `faceOffset` values are untouched, so the shelf silhouette and section cover quad are bit-identical — only off-axis views changed.
- **Headbands.** Two 4×5-unit cords at the block's head and tail, tucked against the bound edge and peeking 1.5 units into the square gap, striped from each profile's hinge/endpaper pair (`createHeadbandTexture`). Subtle; it is the detail a head/tail orbit was missing.
- **The block's spine face** is pulled 0.3 back from the boards' spine faces — they would otherwise share `z = +depth/2` exactly and flicker through the gap behind the spine plane.
- All three materials join `book.materials` (they fade with the volume) and the geometries join the disposal list (shared geometry instances registered once).

**What was deliberately not done:** chunkier overall proportions (moves the accepted shelf silhouette — the thickness lever `topRatio` is silhouette-neutral but the block is already at the calibrated share); scanned cloth/foil textures (remaining-work #1 — procedural recipes stay until real scans exist; CC0 third-party scans are admissible, Stripe's are not); rounded-back block (the case spine's crown already reads).

Gate: **`45/45` PASS on real-GPU Chrome, zero runtime errors.** Evidence `/tmp/zi3t-press-boards`; the orbit-up (case interior: board frame, pastedown, hinge) and orbit-reverse (pages visibly sandwiched between two cloth-wrapped boards) captures are the before/after that matter. Inspected: shelf base (silhouette unchanged), refly/arm section poses (thick case edge reads), both orbits. Not yet deployed — visual change awaits Viet's eye.

## Current checkpoint — 2026-07-29 scan integration fixes: de-tile, re-level, quiet type zones

Viet's review of the scanned-surfaces pass found three tells, all in how the
scan was *composited* rather than in the scans themselves. Fixed in the map
pipeline; no geometry, material, or calibration change.

- **Pinstripe spines — the scan was stretched, not tiled.**
  `paintScanLuminosity` drew the square 1K scan with `drawImage(image, 0, 0, w, h)`,
  squashing it 6.4:1 onto the 1536×240 spine canvas — the weave became vertical
  stripes. It now draws aspect-preserved cover crops, two decorrelated passes
  (the second mirrored) from a deterministic per-volume phase at slightly
  different scales, so no repeat reads and no two volumes share a phase.
- **Muddy light cloths — the composite dragged the mean.** A `luminosity`
  composite pulls the cloth's brightness toward the scan's darker mean. The
  scan is now pre-baked per cloth (`bakeNormalizedScan`): luminance extracted,
  its mean re-levelled to the volume's own cloth luminance (gain clamped
  0.7–1.7), gentle contrast kept around that level. Variation without the mean
  shift — the straw and cream covers are luminous again, the navy is
  unchanged. Baked to a canvas rather than `context.filter`, which older
  Safari ignores; the fallback threads still cover a decode failure.
- **Type fighting grain — feathered calm zones.** `subdueScanUnder` paints a
  soft elliptical cloud of the cloth colour (radial falloff to zero) over the
  measured text bands — spine meta/title, cover title block, meta, and credit
  — before the ink. First attempt used a hard rect plus shadowBlur halo and
  read as a masked patch; the elliptical falloff is the version that reads as
  calmer cloth. The bump map's foil press is untouched (deliberate emboss).

Gate: **`45/45` PASS on real-GPU Chrome, zero runtime errors.** Evidence
`/tmp/zi3t-press-scanfixes`; before/after crops in the session record
(spine pinstripe → irregular cloth with a calm title zone; straw/cream
luminosity restored).

## Current checkpoint — 2026-07-29 CC0 scanned cloth and paper surfaces

Viet approved the measured-surface path: keep the DOM-calibrated parametric
case, use licensed scans for its surface information, and defer importing a
fixed stock mesh. The selected sources are deliberately third-party CC0
materials, not Stripe assets: Poly Haven's *Book Pattern* provides colour and
height maps for the cloth case; ambientCG's *Paper001* provides the paper
fibre. Exact URLs, licence, and per-file use are recorded in
`public/assets/textures/README.md`.

- **Real cloth, authored identity retained.** The colour scan is converted to
  luminance and composited into each volume's own cloth hue before original
  artwork and type are drawn. It supplies irregular yarn, dye, and wear detail
  on cover, spine, and board-edge maps without turning every book olive green.
  The cloth height scan now supplies the bump response; the deterministic weave
  remains only as a decode-failure fallback rather than doubling a visible
  synthetic lattice over the scan.
- **Real paper below physical leaf structure.** Paper001's fibre/mottling is
  folded under the per-volume page gradient, fine leaf lines, and signature
  bands. The surface is scan-level while the page edge retains the deliberate
  construction that identifies a text block rather than a sheet of paper.
- **No calibration or interaction change.** Board/slab dimensions, mapped art
  planes, camera, light rig, route poses, drag state machine, and accessibility
  anchors are untouched. The only added board map is a darkened re-tinted cloth
  face, so it does not multiply the cloth hue a second time.

Gate: **`45/45` PASS on real-GPU Chrome, zero runtime errors.** Baseline:
`/tmp/zi3t-press-texture-baseline`; candidate:
`/tmp/zi3t-press-scanned-surfaces`. Inspected: desktop shelf base, Re-fly
standing section, and reverse orbit. The shelf now reads as woven cloth at
normal viewing distance, while the reverse orbit retains the existing physical
case/page separation. Deployment remains held for Viet's visual review.

## Current checkpoint — 2026-07-29 incremental C: rounded headband cords

The next geometry refinement stays deliberately small: each headband is now a
ten-sided, 2.15-unit-radius cord running the text-block height instead of a
4×5 rectangular plug. The existing stripe map wraps the cord, so its changing
facet catches the scanned-cloth light at the head/tail gap without altering the
case, page block, board thickness, or accepted screen-space silhouette.

- **Rounded-board experiment rejected.** A rounded-outline `ExtrudeGeometry`
  board was tested at the same outer dimensions, with cloth perimeter and
  pastedown caps. At `desktop-drag-orbit-up` it replaced the existing visible
  interior layering with a broad flat board face. The deterministic gate still
  passed, but the real visual comparison was a regression, so the experiment
  was removed rather than committed.
- **Preserved case layering.** Boards remain the established six-face slabs:
  cloth on their outer faces, pastedown toward the block. This retains the
  orbit-up board frame/endpaper and reverse-orbit page sandwich that the prior
  checkpoint accepted.

Gate: **`45/45` PASS on real-GPU Chrome, zero runtime errors.** Baseline:
`/tmp/zi3t-press-rounded-boards-baseline`; accepted C evidence:
`/tmp/zi3t-press-rounded-headbands`. Inspected: shelf base, orbit-up, and
orbit-reverse. Deployment remains held.

## Current checkpoint — 2026-07-29 route pose and return fidelity

Viet approved the scanned-surface pass, then supplied fresh route captures and
asked for the detail view to behave like the reference rather than merely look
like it. The resulting changes preserve ZI3T's authored covers and parametric
case, but make the shared book-document frame more deliberate.

- **Universal opening pose.** Every book URL now clears a prior volume's live
  turn and opens in the same portrait presentation: its long axis occupies
  `.685` of the viewport (up from the former `.615` calibration), with the
  established yaw, roll and shallow pitch. This is the supplied opening frame,
  applied consistently to direct links and in-document selections.
- **Route chrome is a route concern.** The catalogue-only “Systems for
  progress” tagline is hidden while a volume document is open; the name and
  mark remain as the quiet fixed masthead. The return arrow and index now share
  the reference's left alignment and vertical cadence.
- **One return movement, three triggers.** Escape and the side control return
  the current volume to its own shelf slot. Browser Back now performs the same
  damped return instead of snapping its section pose to the catalogue. The
  side control intentionally returns to the product list rather than stepping
  into a preceding volume URL after in-document navigation.
- **Centre-pivot cover drag.** A detail-book drag now turns around one stable
  point at the case's geometric centre. Drag changes its yaw and pitch only;
  the route position remains fixed, so the book does not slide under the
  reader's hand while it turns.
- **A real fixed route layer.** The catalogue has perspective so it can host
  the shelf fallback, but that property also trapped the route's “fixed” canvas
  and controls inside a zero-height ancestor. In a long book document they
  could visibly drift, disappear with the book, and be painted below the figure
  despite looking present. The volume canvas is now viewport-bound; Back and
  the rail are relocated into a fixed sibling layer at the end of `main`, above
  section content but below no reading surface. They receive real pointer hits
  at desktop and narrow portrait widths.
- **Direct-entry scroll settlement.** After browser scroll restoration has
  completed, a direct book URL re-lands on its own section. This prevents a
  restored offset from showing only the masthead and controls while the book is
  already outside the viewport.
- **Gate coverage added.** The real-browser gate now asserts a non-zero
  browser-Back return flight, a side-control return, and that a live drag
  retains its exact route-centre position. Existing screen-space, history,
  reduced-motion and runtime-error checks remain intact.

Gate: **`45/45` PASS on real-GPU Chrome, zero runtime errors.** Evidence:
`/tmp/zi3t-press-release-gate-20260729`. Inspected: Telemetry's expanded
opening pose and its route-only masthead/rail screenshot, plus the directional
drag set. Follow-up route-layer evidence:
`/tmp/zi3t-route-controls-237x724-dpr2.png`; direct Chrome pointer checks
opened `/telemetry/` from the rail and returned `/` from Back. The previous
release remains live; this follow-up awaits Viet's deploy instruction.

## Current checkpoint — 2026-07-29 deployed: boards, scans, and fixes live

PR #28 merged and deployed as version `1558d942-5897-41c2-901e-d0ff4b52c5d3`
on zi3t.io. Production verified: scene `v=20260729b`, all three CC0 scans
serving (200, 273–398 KB), composition intact (5 sections, 3 briefs, 0 demo
shells), and a live capture shows the luminous de-tiled cloth with calm title
zones. This closes the realistic-render arc: reference pipeline (2026-07-23),
bound structure (2026-07-26), thick boards + headbands (2026-07-28), scanned
cloth/paper with composite fixes (2026-07-29). Remaining-work #1 is now
"scan-level surfaces" only in that the scans are 1K and one cloth family —
more variety is available if wanted, not needed.

## Current checkpoint — 2026-07-31 real-GPU harness, and one number deliberately not recorded

A hardware-renderer review harness now exists and is documented in
[real-gpu-harness.md](real-gpu-harness.md), with a reusable protocol driver at
`scripts/cdp.mjs`. This closes the long-standing gap where the skill required
physical-GPU verification (remaining-work #6) without saying how to obtain one.

Verified this session:

- Headful Chrome on macOS binds the real device:
  `ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Unspecified Version)`.
  A `--headless=new` instance on the same machine reports SwiftShader even with
  `--enable-gpu`, because there is no window surface to bind a GPU context to.
  This silently invalidated earlier visual review; every lighting, material and
  smoothness conclusion drawn headless describes the software rasteriser.
- A cold load of `/` on hardware raises zero runtime errors.

**Entry timing: still unmeasured, and deliberately not recorded as a defect.**
A probe of first load appeared to show a ~1.6s window with no samples, which
would suggest a blocked main thread. That probe interleaved blocking
`Page.captureScreenshot` calls with evaluates, so the gap plausibly describes
the capture round-trip rather than the scene — the exact anti-pattern this
skill already prohibits ("do not infer its smoothness from blocking screenshot
calls"). The number is therefore discarded rather than handed forward. First
real measurement must come from a performance trace via `cdp.trace()`.

Recording an unconfirmed lead as a finding would send a later pass hunting a
bug that may not exist; recording it as unmeasured costs nothing.

**The gate itself must be run on a hardware renderer.** Confirmed this session
by getting it wrong first, which is worth recording because the failure looks
like a code regression and is not one.

Run headful against port 9225: **45/45 PASS, zero runtime errors**, matching the
2026-07-29 run recorded in `7b9fb6d`.

Run against a SwiftShader headless shell, the same gate throws "Press scene did
not become ready" before its first assertion. Diagnosed rather than assumed:

- The scene is healthy at the point of failure — `press-scene-ready` set,
  `.press-hold-caption` present, five volumes, canvas present, zero errors.
- The failing clause is `document.readyState === 'complete'`, which `navigateHome`
  allows 15s. On software GL no resource is pending (27/27 loaded) and
  `readyState` reaches `complete` at **~27.8s**: the main thread is saturated by
  shader compilation, so the `load` event simply fires late.
- Removing CPU contention did not change it.

So the 15s budget is correct and calibrated for hardware. Do not raise it, and
do not read a software-GL failure here as a regression. This is the same lesson
as the renderer gate above, arriving one level up: software GL does not merely
distort the pixels, it invalidates the harness that judges them.

At this checkpoint, the four historically fragile areas had not yet been
re-run on hardware. The later portable-package checkpoint records the complete
47-check Apple Metal pass; first-load timing remains unmeasured until traced.

Handoff material for a fresh session is [next-run-prompt.md](next-run-prompt.md).

## Current checkpoint — 2026-07-31 standalone Press namespace and restored landing

Viet rejected the Press scene as the site's landing architecture. The scene is
preserved as an experiment, but it no longer owns the site or the genuine
project URLs.

- **`/` is the lightweight access point again.** `public/index.html` restores
  the old link-hub structure: one shared stylesheet, no executable JavaScript,
  and direct links to the Press catalogue, the three public tools, the latest
  note, résumé, GitHub, RSS, and LinkedIn. The gate measured 3023 response
  bytes. Desktop 1568×894 and mobile 390×844 captures were inspected; mobile
  `scrollWidth` equals `clientWidth` at 390px.
- **The experiment owns `/press/**` only.** The former homepage shell moved to
  `public/press/index.html`. The catalogue is `/press/`; its five book
  positions are `/press/refly/`, `/press/arm/`, `/press/telemetry/`,
  `/press/practice/`, and `/press/field-notes/`. The scene reads the catalogue
  path from `data-press-catalogue` instead of treating `/` as a global constant.
- **The project pages are standalone again.** `/refly/`, `/arm/`, and
  `/telemetry/` now serve their genuine documents directly. Their obsolete
  Press flight scripts and stylesheet were removed, and the assembled briefs
  link to the normal project URLs without `?press-page=1`. The résumé also
  drops the unused flight shim.
- **Worker scope is explicit.** `worker/index.js` assembles the Press shell from
  the genuine pages while leaving every path outside `/press/**` to
  `env.ASSETS`. `wrangler.jsonc` restricts `run_worker_first` to `/press` and
  `/press/*`; `/` is therefore asset-first and cannot be broken by the
  experiment's composition path. A running Wrangler process must be restarted
  after changing this route table — asset hot reload alone retained the old
  matchers during this pass.
- **The gate encodes the boundary.** All prior 45 scene checks were made
  catalogue-path-neutral, then two assertions were added: the root stays under
  10 KB with no Press/Three scene code, and the three project paths contain
  their genuine interactive markers with no Press shell or transition shim.

Verification: **`47/47` PASS on headful real-GPU Chrome**, Apple M1 Pro via
ANGLE Metal, zero runtime errors. Evidence:
`/tmp/zi3t-press-standalone-qa`; inspected base, hover, pressed, dragged,
standing section, compact section, and terminal closing captures. The
lightweight landing captures are `/tmp/zi3t-lightweight-root.png` and
`/tmp/zi3t-lightweight-root-390.png`. Nothing was deployed.

## Current checkpoint — 2026-07-31 portable volume-catalogue package

The Press experiment is now an internal standalone package rather than a loose
set of site assets.

- **Portable build boundary.** `packages/volume-catalogue/` owns Vite 8.2,
  TypeScript 7, pinned Three.js r171, the exact calibrated browser coordinator,
  fallback/reveal entries, CSS, original volume art, CC0 scans, manifest,
  Cloudflare adapter, and QA tools. It has a standalone Vite dev shell and
  explicit ES-module entries. It remains `private: true` and `UNLICENSED` until
  the public repository name and license are deliberately chosen.
- **No cross-project renderer dependency.** The scene no longer imports
  `/arm/vendor/three.module.min.js` or `/assets/textures/**`. Vite emits the
  scans as independently cached assets rather than inlining them. The minified
  scene/Three chunk is 561.47 kB (146.06 kB gzip); core CSS is 67.08 kB
  (13.73 kB gzip). The first attempted library-mode build inlined the three
  scans into a 2.06 MB JavaScript chunk and was rejected.
- **One manifest and one adapter.** `worker/index.js` is now only the binding of
  the shared volume manifest to the package's generic Cloudflare adapter.
  Wrangler 4.116 dry-run resolves the TypeScript source, reads 112 static
  assets, and produces a 9.06 kB Worker upload (2.77 kB gzip).
- **Generated site assets only.** `npm run build:site` safely replaces only
  `public/press-assets/`. The obsolete duplicate Press JS, CSS, SVG, and scan
  files under `public/assets/` were removed; the shared `site.css`,
  `press-transition.*`, and `book-grain.svg` used by genuine pages remain.
  Skill-local QA/CDP files are compatibility wrappers, so there is one
  executable copy of each tool.
- **Screenshot-induced drag fixed at the contract.** A first hardware gate run
  exposed that `Page.captureScreenshot` can emit a synthetic `pointermove` at
  the physical cursor with `buttons: 0`. A stationary held press therefore
  became a drag before the gate's intentional movement. A focused CDP probe
  recorded the exact event sequence. The renderer now transitions to dragging
  only while the primary button remains down; the assertion was not weakened.

Verification: package TypeScript checks pass; Vite production build passes;
Wrangler `deploy --dry-run` passes; and the unchanged scene gate is **`47/47`
PASS on headful Apple Metal with zero runtime errors**. Evidence:
`/tmp/zi3t-volume-package-qa-v2`. Inspected: base, hover, pressed, dragged,
80/900 ms release, all five standing sections, compact catalogue and section,
signature, and closing/footer. Nothing was deployed.

## Current checkpoint — 2026-07-31 public repository and sibling integration

The package source now lives in its own public repository,
`https://github.com/zi3t/volume-catalogue`, beside the `zi3t` site checkout.
The site retains the stable path `packages/volume-catalogue/` as a relative
symlink to that sibling repository, so the Worker and Press skill do not gain
machine-specific absolute paths.

- The standalone `check` command owns only package typechecking and production
  output. A package clone no longer assumes that the site repository exists.
- The optional `build:site` integration resolves a sibling `zi3t` checkout or
  an explicit `ZI3T_SITE_ROOT`, then replaces only
  `public/press-assets/`.
- The public GitHub repository remains `private: true` at the npm layer and
  `UNLICENSED`. Public visibility does not silently choose redistribution
  terms.
- The site continues to commit generated Press browser assets. GitHub or CI
  builds of the site must restore the sibling package checkout before invoking
  Wrangler, because Git records the symlink rather than its target contents.

No renderer, interaction, route, geometry, or generated browser asset changed
in this checkpoint. Deployment remains held.

## Current checkpoint — 2026-08-05 opaque section grounds

The volumes document now gives every product section its own direct, opaque
background, matching the live Stripe Press product-section composition. The
previous `z-index: -1` pseudo-element ground was removed: it depended on an
uncontained negative stack and could expose the site's light canvas or a
neighbouring section as a sheet across the active volume.

The assembled document's layers are now explicit: section ground at the base,
the collapsed pinned hero and WebGL canvas at `z-index: 1`, and the section
stage/content at `z-index: 2`. Standalone project pages remain untouched.

The real-GPU gate now waits for the address, active index, section weight, and
physical book pose to settle before sampling each section. From the same frame
it verifies both the rendered book silhouette and an unobstructed right-edge
strip against the section's computed background. This removes the old 260 ms
race without weakening the volume assertion and adds a regression check for
light/theme bleed.

Verification: **`48/48` PASS on headful Apple Metal with zero runtime errors**.
All five section grounds measured `1.0` coverage; their book silhouette
coverages were `.62637`, `.60541`, `.47563`, `.46749`, and `.56153`. Evidence:
`/tmp/zi3t-press-ground-fixed-4`. All five standing-section captures were
inspected. Nothing was deployed.

## Current checkpoint — 2026-08-05 opaque catalogue ground

The catalogue's rest canvas now owns the same flat oxblood-black ground as the
live Stripe Press homepage. A live computed-style probe at 1568×894 measured
Stripe's body as `rgb(32, 24, 25)` (`#201819`), which was already ZI3T's
`--press-stage` token.

The mismatch was cascade ownership, not colour selection:
`volume-sections.css` made both `.home-hero` and `.home-page` transparent, but
`.home-page` is the `<body>` itself. In catalogue mode that exposed the
browser's default white canvas. The body now keeps `var(--press-stage)` while
only the pinned hero stays transparent for direct section grounds.

The real-GPU gate now pairs the computed body colour with an unobstructed
upper-right screenshot sample and requires at least `.985` ground coverage.
This makes a transparent body fail even when the scene, books, and section
grounds remain otherwise healthy.

## Current checkpoint — 2026-08-05 browser and performance hardening

The full scene gate passes **49/49** on headful Chrome 150 with the Apple M1 Pro
Metal renderer and zero runtime errors. Its 28 captures cover entry, idle,
pointer hold/drag/release, row control, section routing, every section ground,
reduced motion, the compact layout, and both terminal surfaces. Evidence:
`/tmp/zi3t-press-hardening-qa-20260805`.

Fresh engine/device probes also passed:

- Firefox Developer Edition 154 rendered WebGL2 on `Apple M1, or similar`, kept
  the canvas and context alive through five seconds idle, retained the exact
  `rgb(32, 24, 25)` ground, and emitted no browser or runtime errors. Evidence:
  `/tmp/zi3t-firefox-press.png` and
  `/tmp/zi3t-firefox-press-idle-5000.png`.
- Safari 26.5.2 rendered the catalogue against the correct opaque ground. A
  native Safari history traversal completed catalogue → Re-fly → Back →
  catalogue → Forward → Re-fly, and the restored catalogue remained painted.
  Evidence: `/tmp/zi3t-safari-press.png` and
  `/tmp/zi3t-safari-press-after-back.png`. WebDriver's system-wide “Allow
  Remote Automation” preference and macOS keystroke injection were left
  disabled; the literal physical trackpad swipe remains a manual gesture check,
  while the Back/Forward lifecycle it exercises is covered.
- A CDP touch probe at 390×844 with five emulated touch points scrolled the
  genuine compact catalogue, left no held/dragging state behind, and routed a
  tap to `/press/refly/` with zero runtime errors. Evidence:
  `/tmp/zi3t-touch-390.png`.

The hardware performance profile records the reason for the chosen changes.
The final cold load transfers 1,220,351 bytes: the flagged scene chunk is
562,324 bytes decoded but only 145,543 bytes over the wire, while the three
immediately visible scanned textures account for about 1.03 MB. First paint was
596 ms, FCP 1,116 ms, scene ready 281 ms, entry complete 1,530 ms, CLS zero,
and the single long task was 163 ms. Renderer diagnostics reported 23
geometries, 68 textures, five programs, about 49.6 MB of mipmapped texture
surfaces, and about 36.3 MB of used JS heap.

Desktop idle now suspends the animation-frame loop instead of continuing to
wake JavaScript after WebGL presentation has stopped. Across the same
five-second window, the baseline's 619 animation-frame callbacks and 75.95 ms
of renderer-main work became zero callbacks, zero presentations, and 0.6 ms of
task work. A wheel input immediately restarted the loop. Sustained scroll stayed
inside budget: animation callback p95 1.662 ms, max 2.758 ms, renderer-task max
5.557 ms, and zero runtime errors. Reports:
`/tmp/zi3t-press-profile-baseline.json` and
`/tmp/zi3t-press-profile-final-v2.json`.

`tests/profile-press-scene.mjs` makes the hardware timing, memory, idle, and
scroll profile repeatable. `tests/record-press-first-load.mjs` adds a real-time
hardware-GPU screencast; the inspected H.264 recording is
`/tmp/zi3t-press-first-load.mp4` with its renderer/timing manifest at
`/tmp/zi3t-press-first-load.json`. The host site now serves fingerprinted scene
chunks and assets with one-year immutable browser caching, while stable entry
files continue to revalidate.

The transfer evidence does not support delaying the visible renderer through
code splitting or degrading its scanned covers through another texture pass.
No cover, material, logo, or typography refinement was made here; that final
visual pass remains deliberately last. Deployment remains held.

## Remaining fidelity work

Prioritize these only when the user asks to continue:

1. **Incremental case/cover refinement:** CC0 cloth and paper scans now supply the primary surface detail while original cover art remains authored SVG. A generic rounded-board extrusion was measured and rejected because it flattened the extreme-orbit interior; any later board bevel needs a purpose-built layered mesh that preserves that view. The next low-risk visual work is a design pass on the five original covers. Do not import a fixed stock mesh unless the calibrated parametric route/section poses are deliberately reworked.
2. **Source-proportion silhouette:** the canonical held lower edge and some extreme-angle right-edge slopes remain a few to a few-dozen pixels different from the Poor Charlie references because the genuine ZI3T book is wider and thicker. Do not distort the original artwork merely to erase that difference.
3. **Real-GPU lighting nuance:** the resting, four-direction, extended-orbit,
   and five section sets now verify the four-light key/rake placement and
   layered cloth/foil response on Apple Metal. Safari/Firefox and real-time
   physical-GPU recordings may still justify small per-volume gloss,
   diffuse-base, cone, or roughness adjustments.
4. **Terminal content breadth:** the five-volume journey now resolves into an original two-surface ZI3T afterword. It intentionally does not reproduce Stripe's longer film, podcast, or publishing modules; expand it only with genuine ZI3T work.
5. **Typography:** Iowan/Baskerville approximates the reference's Ivar family. Only change this with a properly licensed font and a fresh metric audit.
6. **Browser/device profiling:** done 2026-08-05 on real Apple M1 GPU hardware — Safari Back/Forward lifecycle, Firefox WebGL2, touch input, GPU/heap accounting, idle power, sustained frame time, and a first-load recording are captured above. Keep a literal physical Safari trackpad swipe as a manual pre-deploy gesture check; software-GL screenshots remain inadmissible evidence.
7. **Logo geometry:** the ZI3T mark is intentionally original; its held-background knockout can be refined without imitating Stripe's mark.
8. **Scroll-feel calibration from the extracted pipeline:** done 2026-07-28 — the `.003`/`.4` velocity fan and the 1200ms idle pause (with `preserveDrawingBuffer`) are adopted; the `.0222/.027` camera ratios were evaluated and rejected as the DOM-anchored follow is their translation.
9. **Animation-rig calibration from the extracted rig:** done 2026-07-28 — hover spine-z `.1`/frame adopted; twirl and cover-follow were already in; the universal-ease reset is present at activation (flight) and deliberately absent at release, whose 80/880ms profile is measured.

## Quality gate

Before claiming completion:

- Run the skill QA script and require `PASS`.
- Inspect its six desktop screenshots rather than relying only on DOM assertions.
- Inspect `desktop-stack-evacuating` and `desktop-route-stack-clearing`; verify that neighboring volumes move away from the selected index and never intersect its route-flight silhouette.
- Inspect the four directional drag captures; resting and dragged Re-fly and note captures; and the Arm, Telemetry, and Resume route captures when material, lighting, or detail continuity changes.
- Inspect `desktop-drag-orbit-up` and `desktop-drag-orbit-reverse` whenever pointer mapping, geometry visibility, or held lighting changes.
- Inspect the signature and closing terminal captures after scroll choreography changes.
- Record first load in real time when entry order or delays change; do not infer its smoothness from blocking screenshot calls.
- Verify focus-visible navigation manually.
- Verify a direct deep link and a rapid Back during the opening flight.
- Verify reduced motion and a 390×844 viewport.
- Report remaining visual differences honestly.
- Keep deployment held unless the user explicitly says otherwise.
