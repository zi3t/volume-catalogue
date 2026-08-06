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
