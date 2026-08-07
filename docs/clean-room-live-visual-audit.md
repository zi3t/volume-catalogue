# Clean-room live visual audit

Matched review captured 2026-08-07 at 1568×894 and 390×844 on headful
Chrome/Apple M1 Pro Metal. The current live `press.stripe.com` scene is the
visual reference. The accepted ZI3T renderer is a regression comparator only;
it cannot establish clone fidelity.

Numeric readings and capture hashes are durable in
[`reference/live-visual-readings-20260807.json`](reference/live-visual-readings-20260807.json).
Reference image bytes remain untracked under
`/tmp/zi3t-live-reference-reopen/` because Stripe's artwork and branding are
evidence, not project assets.

## Intake

| Field | Reference | Candidate |
|---|---|---|
| Image type | Live-site desktop/mobile catalogue, held gesture, and direct book route | Matched clean-room states |
| Viewports | 1568×894 and 390×844 | Same CDP device metrics |
| Theme | Oxblood catalogue; selected-cloth held and route grounds | Same high-level palette modes |
| Fidelity | Lossless PNG after settled hardware-WebGL presentation | Lossless PNG after settled hardware-WebGL presentation |
| Scope boundary | Transfer composition, physical response, hierarchy, and interaction | Keep ZI3T logo, art, copy, five genuine projects, and terminal content |

The live reference shows an editorial WebGL catalogue whose books are the
dominant visual system: quiet fixed identity, narrow left index, a measured
central shelf, richly printed case surfaces, and a selected volume that opens
into a left-object/right-reading composition. The clean-room build has the
same broad nouns, but the rendered proportions, compact stack, route grid,
surface response, and cover density are visibly different. This is a failed
replication checkpoint, not a polish pass.

## Correction, 2026-08-07 — most of this document is out of date

Re-measured with `tests/measure-visual-parity.mjs`, which scores the same
screenshot space this audit used. **Do not act on the rows below without
checking them against a fresh harness run.** Four verdicts are wrong, one
target is invalid, and two rest on a premise since retracted.

The candidate column throughout describes code that no longer exists: the
clean-room source changed materially after these captures were taken and before
the work was committed. That is the cause of the stale layout rows, not a
measurement fault in this document.

| Row | Recorded here | Re-measured | Now |
|---|---|---|---|
| §1 Desktop first rest book | FAIL, 34px too deep | Δ `-1,0 · 2×0` | **PASS** |
| §1 Desktop standing book | FAIL, centre 123px left | Δ `-9,1 · 12×0` | **PASS** — residual width is the rank-12 Reject |
| §1 Compact first rest book | FAIL, half the depth | Δ `0,1 · 0×-1` | **PASS** |
| §1 Desktop dragged silhouette | FAIL | — | **Not a valid target.** Held extent is a function of drag distance at `.003` rad/px, and no pointer travel was recorded for either side. See the scene contract. |
| §5 Book case, §6 Cloth/Rake/Ink | FAIL, "one parametric template", "muddy and uniform" | scored | **Verdicts stand; reasoning replaced.** Both were argued from all five volumes sharing one scalar profile. They do not — all five signatures reach the GPU and match `clean-room/profiles.ts`. Measured instead, the rows hold on their own evidence. |

### §6 scored, 2026-08-07

Cross-site statistics over the first rest case at 1568×894, reference
`394,332 · 780×128` against clean room `393,332 · 782×128`. Readings in
`reference/surface-response-{reference,cleanroom}-20260807.json`.

| Metric | Reference | Clean room | Row |
|---|---|---|---|
| Median luminance | 173.2 | 139.4 | — |
| Tonal spread σ | 40.4 | 19.1 | Cloth: **FAIL confirmed**, half the spread |
| Weave, mean \|Laplacian\| | 14.45 | 5.43 | Cloth: **FAIL confirmed**, a third of the detail |
| Rake peak (p99) | 249.7 | 187.8 | Rake: **FAIL confirmed**, dimmer |
| Rake highlight area | 0.015 | 0.059 | Rake: **FAIL confirmed**, four times broader |
| Ink contrast | 2.57 | 1.15 | Ink: **FAIL confirmed**, under half |

"Broad, dim response leaves the case flat" is now literal: our highlight covers
four times the area at a lower peak. The fix is a retune of the authored spread
— the architecture and per-volume variation are both already in place — not new
scalars per volume.

§2 Typography, §6 Page block / Cover art, and the compact route rows are
unverified either way — no instrument scores them yet.

`tests/measure-surface-response.mjs` was written to settle the §6 statistics
and scores our scene correctly, but is **not calibrated for the reference**: the
recorded reference case rect does not locate a case in a fresh capture, so no
cross-site §6 number exists yet. Calibrate it before reopening those rows.

## Extraction sheet

Every claim below cites the matched capture set (`R-VIS`) recorded in the JSON
above. Existing behavior facts remain cited by
[`reference-extraction-sheet.md`](reference-extraction-sheet.md) (`R-RUNTIME`).

### 1. Layout grid

| Property | Live reference | Clean room | Verdict | Evidence |
|---|---|---|---|---|
| Desktop first rest book | `394,332 · 780×128` | `393,326 · 782×162` | **FAIL** — width/centre are close, total projected depth is 34px too large | **R-VIS** `desktop.firstRestBook` |
| Desktop dragged silhouette | `340,286 · 904×202` | `330,318 · 935×178` | **FAIL** — too wide, 32px too low, and 24px too shallow | **R-VIS** `desktop.draggedBookEdges` |
| Desktop standing book | `305,166 · 437×555` | `150,174 · 502×563` | **FAIL** — object centre is about 123px too far left and 65px too wide | **R-VIS** `desktop.standingBookEdges` |
| Desktop route content start | approximately `886,188` | approximately `815,392` | **FAIL** — wrong column and 204px too low | **R-VIS** `desktop.standingContentStartApprox` |
| Compact first rest book | `0,277 · 390×182` | `0,328 · 390×91` | **FAIL** — half the required projected depth and 51px too low | **R-VIS** `compact.firstRestBook` |
| Catalogue length | 19 genuine books plus media; `6955px` desktop in this capture | five genuine books plus ZI3T terminal; `3605px` | **REJECT literal count** — do not invent projects; match cadence proportionally | **R-VIS** document heights; sacred content boundary |

### 2. Typography

| Property | Live reference | Clean room | Verdict | Evidence |
|---|---|---|---|---|
| Identity | Compact two-line publisher lockup | Original two-line ZI3T lockup | **REJECT literal brand / ADOPT scale and quietness** | **R-VIS** desktop and compact base |
| Spine hierarchy | Author, title, part/mark use distinct editorial positions and weights | Small technical meta, centred title, serial repeat one template | **FAIL** — insufficient per-volume hierarchy and density | **R-VIS** desktop base |
| Route headline | Dense display serif begins near `y=188` with italic author directly below | Project title begins near `y=392`; summary below | **FAIL** — wrong vertical rhythm and content architecture | **R-VIS** desktop route |
| Compact route | Headline begins immediately below the standing volume | Headline collides with the route rail and subsequent hero copy | **FAIL** | **R-VIS** compact route |

### 3. Colour

| Property | Live reference | Clean room | Verdict | Evidence |
|---|---|---|---|---|
| Catalogue ground | `rgb(32, 24, 25)` | `rgb(32, 24, 25)` | **PASS** | **R-VIS** `sharedGround` |
| Held ground | Selected cloth fills the viewport | Selected cloth fills the viewport | **PASS high-level role** | **R-VIS** desktop dragged |
| Ink and surface contrast | Printed ink stays legible through bright local rake and cloth variation | Re-fly ink is low contrast; underside collapses into a dark flat field | **FAIL** | **R-VIS** base and dragged |
| Route ground | One selected-cloth surface | One selected-cloth surface | **PASS high-level role** | **R-VIS** desktop route |

### 4. Spacing

| Property | Live reference | Clean room | Verdict | Evidence |
|---|---|---|---|---|
| Desktop shelf cadence | Each case has deliberate air while still reading as one stack | Similar row starts, but excessive projected cover depth compresses the gaps | **FAIL** | **R-VIS** desktop base |
| Held negative space | Book occupies the central band; caption sits upper-right | Same broad placement, but the book is lower/wider and the mass distribution differs | **FAIL** | **R-VIS** dragged bounds |
| Compact cadence | Cases form a near-continuous, edge-to-edge physical stack | Large empty bands separate shallow slabs | **FAIL** | **R-VIS** compact base |
| Route columns | Physical book left; reading begins around 56.5% viewport width | Book intrudes too far left; reading starts lower and earlier horizontally | **FAIL** | **R-VIS** desktop route |

### 5. Component inventory

| Component | Live reference | Clean room | Verdict | Evidence |
|---|---|---|---|---|
| Book case | Per-title silhouette, cloth/board/page detail, distinct printed construction | One parametric template with modest ratio changes | **FAIL** — visibly repeated slab language | **R-VIS** all shelf states |
| Left index | Dense catalogue ticks and route back control | Five genuine ticks plus ghost cadence and back control | **ADOPT proportional / REJECT fake count** | **R-VIS**, **R-RUNTIME** |
| Held caption | Approximately 400×119 editorial card upper-right | Similar box and placement with original copy | **CLOSE**, retain and refine type | **R-VIS** dragged |
| Route reading surface | Full editorial product document | Genuine project section, but its hero-first layout is not the reference grid | **FAIL architecture** | **R-VIS** route |

### 6. Atmosphere and texture

| Property | Live reference | Clean room | Verdict | Evidence |
|---|---|---|---|---|
| Cloth | Fine weave remains visible without lowering print contrast | Weave is present but reads muddy and uniform at shelf distance | **FAIL** | **R-VIS** base/dragged/route |
| Rake | Bright, narrow moving highlight describes curvature and board edges | Broad, dim response leaves the case flat | **FAIL** | **R-VIS** dragged |
| Page block | Fine layered leaf edge with warm occlusion | Smooth cream slab with weak leaf separation | **FAIL** | **R-VIS** dragged |
| Cover art | Dense title-specific illustration/print field | Sparse diagrams with large unworked cloth areas | **FAIL**, replace only with richer original ZI3T art | **R-VIS** base/route; sacred artwork boundary |
| Added effects | Flat ground; texture stays on the objects | Flat ground; no decorative noise | **PASS** | **R-VIS** |

### 7. Responsive and interaction

| State | Live reference | Clean room | Verdict | Evidence |
|---|---|---|---|---|
| Hover/press/drag mechanics | Row-owned hover, isolation, drag, selected cloth, caption | Mechanically present and hardware-gated | **PASS mechanics / FAIL frames** | **R-RUNTIME**, **R-VIS** |
| Pressed visual | Same input sequence produces selected-cloth/caption presentation | Same input sequence remains on the dark ground without the caption | **FAIL current-frame parity** | **R-VIS** desktop pressed |
| Compact shelf | Full-width cases with strong cover exposure and almost no dead cadence | Full-width but half-depth cases separated by dead space | **FAIL** | **R-VIS** compact base |
| Compact route | Standing book finishes near `y=498`; content follows cleanly | Book begins lower and the rail runs into the headline | **FAIL** | **R-VIS** compact route |

## Visual-diff gate

Superseded by the correction above. Restated against re-measured evidence:

| Category | Original | Now |
|---|---|---|
| Desktop catalogue composition | FAIL | **PASS** (harness) |
| Desktop route grid | FAIL | **PASS** (harness) |
| Compact catalogue | FAIL | **PASS** (harness) |
| Desktop held silhouette | FAIL | **No valid target** — drag travel unrecorded |
| Physical material/texture response | FAIL | **Unresolved** — premise retracted, no reference number yet |
| Typography hierarchy | FAIL | **Unverified** — no instrument |
| Compact route | FAIL | **Unverified** — no instrument |
| Exact catalogue/route grounds | PASS | PASS |
| Interaction and history mechanics | PASS separately | unchanged |
| Original identity and genuine-content boundary | PASS; binding | unchanged |

The build remains blocked from a completion claim, but for a shorter list than
this document originally gave. Remaining order: calibrate the surface-response
probe against the reference, settle §6, score typography hierarchy, then the
compact route. Cover art stays deferred by decision, which caps
`Physical material/texture response` regardless of the other rows.

Two standing cautions. A behaviour gate still cannot close a visual row. And
this document was wrong more often than right once the code moved underneath
it — regenerate rows from harness output rather than editing prose in place.
