# Option B clean-room checkpoints

Option B was selected on 2026-08-07. The replacement is being built beside the
accepted renderer and does not become the default until it independently earns
the scene contract and real-GPU gate. The Reject rows in
[`reference-gap-analysis.md`](reference-gap-analysis.md) remain binding.

## Checkpoint 0 — executable scene foundation

The opt-in URL is `/press/?press-renderer=clean-room`. Normal `/press/` visits
continue to load the accepted renderer.

Implemented:

- a separate, dynamically loaded, strictly typed runtime;
- the extracted 12-degree perspective camera and four-light legacy-unit rig;
- five separate ZI3T scene roots aligned to their semantic DOM rows;
- independently authored proportions and layered boards, page block, cover,
  underside, and spine geometry;
- original ZI3T SVG cover art, generated spine art, cloth relief, and paper;
- an opt-in debug snapshot and a hardware-only foundation smoke gate.

Measured at 1568×894 on headful Chrome/Apple M1 Pro Metal:

- one canvas;
- five book roots in source order;
- 30 draw calls and 210 triangles after texture settlement;
- no runtime errors.

Reproduce with the Worker running on port 4173 and review Chrome on 9226:

```sh
npm run qa:clean-room -- 9226 \
  'http://127.0.0.1:4173/press/?press-renderer=clean-room'
```

Not yet claimed:

- the seven-map custom material model;
- entry, hover, hold, drag, release, or route animation;
- catalogue scroll, volume mode, history, terminal choreography, compact parity,
  or reduced-motion parity;
- visual-diff parity with the accepted renderer or the extracted reference.

The next material checkpoint should add independently derived custom diffuse,
custom bump, foil, gloss, and glitter masks to this scene without copying shader
source or literal reference scalars.

## Checkpoint 1 — independently derived seven-map material

The clean-room cover and spine now use one shared custom `ShaderMaterial`
architecture with the seven evidenced sampler roles:

1. shared cloth diffuse;
2. per-surface custom diffuse;
3. shared cloth bump;
4. registered custom bump;
5. registered foil;
6. registered gloss; and
7. shared sparse glitter.

The shader starts from Three.js's public Phong chunks, then supplies original
ZI3T equations for dual relief, finish-mask relief suppression, foil palette
sweep, gloss, glitter, emissive response, and additive specular strength. No
reference shader source or literal reference scalar profile is present.

The custom diffuse canvases are 1600×1280 for covers and 1536×240 for spines.
Registered cover masks are 800×640; the smaller scalar masks retain normalized
registration while keeping the all-five-books GPU footprint proportional. The
base layers remain the committed CC0 cloth scans, and every custom mask is
derived from original ZI3T SVG artwork and generated typography.

Five response signatures are independently authored. Re-fly emphasizes foil,
Arm stays dry, Telemetry carries the strongest foil/glitter response, Practice
has the broadest gloss response, and Field Notes retains the deepest cloth
relief with restrained finish.

Measured at 1568×894 on headful Chrome/Apple M1 Pro Metal:

- clean-room material gate: **10/10 PASS**, zero runtime errors;
- five distinct response signatures;
- seven cover maps and seven spine maps per volume;
- four compiled programs, 30 draw calls, and 210 triangles; and
- unchanged default-renderer gate: **49/49 PASS**, zero runtime errors.

Evidence is `/tmp/zi3t-clean-room-material-final.png` and
`/tmp/zi3t-clean-room-material-accepted-gate`. The clean-room renderer remains
opt-in. This checkpoint does not claim entry, interaction, volume-mode, compact,
reduced-motion, terminal, accessibility, or full visual-diff parity.

## Checkpoint 2 — entry and desktop shelf interaction

The clean-room scene now owns its catalogue motion instead of borrowing the
accepted runtime's state. The authored entry places the five books below their
rows, fades and lifts them into their DOM-derived homes, then emits
`press-entry-complete` only after every volume has settled.

Each full-width semantic book row owns one pointer state machine. On a desktop
mouse it provides:

- a restrained hover depth pop;
- press isolation before the gesture becomes a drag;
- the recorded 4px Manhattan drag threshold and `.003` radians-per-pixel orbit;
- stack evacuation, cloth backdrop, held caption, light-rake response, and
  vertical drag correction during presentation; and
- a continuous release reversal that suppresses navigation after a drag.

The interaction remains attached to the existing anchors rather than a canvas
hit map, and window-level pointer capture plus a `buttons & 1` guard keeps a
release outside the row from leaving a book held. A sub-threshold move remains
a press, while a drag beginning on either flank of the full-width row rotates
the same selected volume and cannot synthesize a click.

Measured at 1568×894 on headful Chrome/Apple M1 Pro Metal:

- clean-room foundation/material gate: **10/10 PASS**, zero runtime errors;
- clean-room desktop interaction gate: **12/12 PASS**, zero runtime errors;
- five volumes settle to their measured homes after entry and release; and
- unchanged default-renderer gate: **49/49 PASS**, zero runtime errors.

Evidence is `/tmp/zi3t-clean-room-interaction-pass2`,
`/tmp/zi3t-clean-room-interaction-foundation-final.png`, and
`/tmp/zi3t-clean-room-interaction-accepted-gate`. The clean-room renderer
remains opt-in. This checkpoint does not claim clean-room click routing,
volume-mode flight, section scroll/history, rail navigation, compact or
reduced-motion parity, terminal choreography, accessibility completion, or a
final visual diff.

## Checkpoint 3 — route document and live volume

The clean-room renderer now keeps catalogue and volume reading as two modes of
one shell while preserving `?press-renderer=clean-room` on every internal
address. A deliberate shelf pick pushes one history entry; section-centering
scroll replaces the current address; the rail and arrow keys move between all
five volumes; and Back/Forward restores both the prior document mode and the
catalogue offset. A direct volume URL settles on its named section without
claiming another address during startup.

The selected book flies from its DOM-derived shelf slot into the section figure
with the extracted `.006`/`.15` recurrence, then remains the live scene object
for that section. All five figures own an independently posed volume, covered
shelf anchors leave the tab order, and the sidebar control returns the current
volume to its original shelf slot.

The live cover interaction is independently implemented from the numeric
capture:

- passive pointer follow at `.00015` radians per pixel;
- figure drag at `.003` radians per pixel around a fixed centre;
- release from a last-delta clamp of `.3`, decaying by `.95` per 60Hz frame;
  and
- active-section scroll turn at `.0008` radians per pixel.

Measured at 1568×894 on headful Chrome/Apple M1 Pro Metal:

- clean-room foundation/material gate: **10/10 PASS**, zero runtime errors;
- clean-room desktop interaction gate: **12/12 PASS**, zero runtime errors;
- clean-room route/history gate: **15/15 PASS**, zero runtime errors;
- clean-room live-volume gate: **8/8 PASS**, zero runtime errors; and
- unchanged default-renderer gate: **49/49 PASS**, zero runtime errors.

Evidence is `/tmp/zi3t-clean-room-routing-pass5`,
`/tmp/zi3t-clean-room-volume-final`,
`/tmp/zi3t-clean-room-route-interaction-final`, and
`/tmp/zi3t-clean-room-routing-accepted-gate`. The clean-room renderer remains
opt-in. Its route close-ups are still darker and flatter than the accepted
renderer, most visibly on the ochre Field Notes cover; this checkpoint claims
mechanics, not final lighting parity. Catalogue scroll/terminal choreography,
compact and reduced-motion parity, complete accessibility/idle behavior, and a
final visual diff remain unclaimed.

## Checkpoint 4 — behavior-complete catalogue journey and fallback contract

The opt-in clean-room renderer now owns the rest of the catalogue document.
At 1568×894 the semantic main is exactly `3605px` tall (`2711px` of native
scroll), with five shelf stops spaced by `.213` viewport heights and a genuine
terminal journey spanning `2.18` viewports. Native catalogue scroll never
claims a volume address. Its shelf fan uses the extracted `delta × .003` law,
clamped to ±1 for trackpad safety and decayed by `.4` per frame inside the
damped pitch target.

The terminal reuses the existing ZI3T signature study and closing statement;
no reference film, podcast, newsletter, or placeholder volume was fabricated.
Only the currently visible shelf, section, or terminal controls remain in the
interaction and tab order. Covered shelf anchors and offscreen closing links
are inert until their surfaces become available.

The fallback paths are now independently earned:

- at 390×844 the compact catalogue remains the measured `1604px` document,
  with its first two anchors at `276.83px` and `470.22px`, three genuine books
  visible on load, no held choreography, and no fabricated terminal length;
- compact routes place the live volume in the existing single-column figure
  and keep presenting because their WebGL buffer is intentionally unpreserved;
- reduced motion collapses the catalogue to `100svh`, removes the long terminal
  journey and live figure volumes, and keeps navigation immediate; and
- desktop preserves the drawing buffer, stops animation and presentation after
  1200ms of settled idle, then wakes immediately on scroll or pointer input.

One visual review found a false literal translation before this checkpoint was
accepted: applying the reference's pixel-space camera-follow ratio directly to
the normalized scene moved every book out of frame during scroll. The binding
camera-follow Reject is now expressed as DOM-rect reprojection while the
normalized camera stays at `y=6.5`. The journey gate keeps this failure visible
through desktop scroll coverage and compact presentation assertions.

Measured on headful Chrome/Apple M1 Pro Metal, with zero runtime errors:

- foundation/material: **10/10 PASS**;
- desktop interaction: **12/12 PASS**;
- route/history: **15/15 PASS**;
- live volume: **8/8 PASS**;
- catalogue journey/fallbacks: **18/18 PASS**; and
- unchanged default renderer: **49/49 PASS**.

Evidence is `/tmp/zi3t-clean-room-functional-final.png`,
`/tmp/zi3t-clean-room-functional-interaction-final`,
`/tmp/zi3t-clean-room-functional-routing-final`,
`/tmp/zi3t-clean-room-functional-volume-final`,
`/tmp/zi3t-clean-room-journey-pass3`, and
`/tmp/zi3t-clean-room-functional-accepted-gate`. The aligned five-route visual
set is `/tmp/zi3t-clean-room-visual-sections`, captured at the same section-top
plus 200px offset as `/tmp/zi3t-clean-room-routing-accepted-gate`.

The comparison used here was against the accepted ZI3T renderer, not the live
Stripe reference. User review rejected that comparator on 2026-08-07. A fresh
matched hardware capture in
[`clean-room-live-visual-audit.md`](clean-room-live-visual-audit.md) fails the
desktop route grid, compact shelf, held silhouette, typography, and physical
surface rows. This checkpoint closes behavior only; it does not complete
Option B or establish clone fidelity. Nothing was pushed or deployed.
