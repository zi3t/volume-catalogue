# Reference gap analysis

Comparison captured on the same 1568×894 headful Chrome/Apple M1 Pro Metal
environment on 2026-08-07. The reference facts come from the
[Extraction Sheet](reference-extraction-sheet.md); ZI3T GPU values come from
[`reference/gl-draw-readings-zi3t-20260807.json`](reference/gl-draw-readings-zi3t-20260807.json)
(`O-GL`). Current implementation citations point to
[`src/runtime/catalogue.ts`](../src/runtime/catalogue.ts).

The binding objective is screenshot-space pixel parity with the live reference.
Every reproducible visual fact is an **Adopt**. Earlier Reject, local-art,
performance-hardening, and “do not distort” decisions are superseded wherever
they produce a measurable pixel delta. Accessibility, valid navigation, and
content integrity remain requirements, but they are not exemptions from visual
parity.

## Prioritized gaps

Rows are ordered by expected visible improvement per unit of work, followed by
already-closed alignments and deliberate divergences. Costs are relative
engineering effort and include proportional real-GPU verification.

| Rank / layer | Decision | Reference | ZI3T now | Visible difference | Cost to close | Evidence |
|---|---|---|---|---|---|---|
| 1 · Material | **Adopt** | Seven-map cover model and 19 texture-correlated scalar profiles: base/custom diffuse, base/custom bump, foil, gloss, glitter. | Five genuinely distinct profiles already exist, but the patched Phong path exposes only foil, sheen, and one bump map. | **High.** Reference books vary from dry cloth to wet gloss, negative bump, emissive foil, and glitter; ours varies cloth/foil but has fewer independently masked responses. | **Medium.** Add clean-room gloss/glitter and split bump masks derived from original ZI3T art; retune all five states. | [Sheet §3](reference-extraction-sheet.md#3-material-model); `O-GL` program 3; [profiles](../src/runtime/catalogue.ts#L329) |
| 2 · Texture | **Adopt** | Most cover maps upload at 1920×1600; diffuse unit 1 is the per-volume material join key. | Procedural/original textures are commonly 500×400, 512-square, 768-wide, or 128-square; five volumes are still independently keyed. | **Medium–high** on held and route close-ups; low on the shelf. Resolution alone is not the goal—the missing independent masks are. | **Medium**, shared with rank 1. Generate route-resolution masks from original SVG/cloth sources and retain lazy loading. | [Sheet §5](reference-extraction-sheet.md#5-texture-pipeline); `O-GL` `textures`; [texture creation](../src/runtime/catalogue.ts#L767) |
| 3 · Compact camera | **Adopt — closed** | FOV changes from 12° to 15° below 600 px. | The clean-room camera now switches to 15° below 600 px. | None in the lens rule. | Closed. | [Sheet §1](reference-extraction-sheet.md#1-scene-graph-and-camera); [camera](../src/runtime/clean-room/scene.ts) |
| 4 · Material architecture | **Adopt** | Dedicated custom cover `ShaderMaterial`, one shared program with per-book uniforms. | The clean-room renderer exposes the seven mapped response channels in a dedicated shader material. | Remaining differences are profile and texture authoring, not permission to diverge. | Continue until cross-site pixels match. | [Sheet §3](reference-extraction-sheet.md#program-structure); [shader](../src/runtime/clean-room/material.ts) |
| 5 · Current component scope | **Adopt when measured** | The reference includes the surrounding film, menu, loader, footer/newsletter, and podcast composition. | The local document currently carries five project volumes and its own content. | Any visible frame-level delta remains open; content substitutions must preserve accessibility and valid destinations. | Content-bound. | [Sheet §8](reference-extraction-sheet.md#8-content-architecture) |
| 6 · Light rig | **Adopt — closed** | Ambient `.52π`; key `.6π`; back `#211815 × .5π` with palette lerp; mint rake `.75π→.05π`. | Same constants, positions translated by `camera.z/100`, palette-driven back light, and held rake dimming. `O-GL` confirms ambient, key, and back uploads. | No material visible gap established in this capture. | None unless rank 1 exposes a new interaction. | [Sheet §2](reference-extraction-sheet.md#2-light-rig); [rig](../src/runtime/catalogue.ts#L1505); [layout](../src/runtime/catalogue.ts#L2298) |
| 7 · Colour/render pipeline | **Adopt — closed** | Color management off; linear output; no tone mapping; no environment or shadow inputs. | Same non-colour-managed linear passthrough, no tone mapping, no IBL, no shadows. | None established. | None. | [Sheet §§2–3](reference-extraction-sheet.md#2-light-rig); [pipeline](../src/runtime/catalogue.ts#L18); [renderer](../src/runtime/catalogue.ts#L1491) |
| 8 · Flight recurrence | **Adopt — closed** | Product activation resets the universal approach, then ramps `+.006` per frame to `.15`. | Picked-volume flight uses frame-normalized `.006/.15` constants and stops when it lands. | None in the mechanism. | None. | [Sheet §6](reference-extraction-sheet.md#6-animation-rig-and-timing); [constants](../src/runtime/catalogue.ts#L80); [flight](../src/runtime/catalogue.ts#L3311) |
| 9 · Hover z easing | **Adopt — closed** | Hovered spine z uses fixed `.1` per frame. | Same frame-normalized `.1` approach, with screen-space depth calibrated to ZI3T's thicker volumes. | No timing gap; projected size intentionally differs from the literal source z. | None. | [Sheet §6](reference-extraction-sheet.md#6-animation-rig-and-timing); [constants](../src/runtime/catalogue.ts#L37); [pose](../src/runtime/catalogue.ts#L3219) |
| 10 · Scroll/idle | **Adopt — closed** | `delta × .003`, decay `.4` per frame, tilt inside the damped target; rendering stops 1200 ms after movement. | Same law, frame normalized and clamped to ±1 for trackpad safety; desktop buffer is preserved for idle presentation. | None established. | None. | [Sheet §7](reference-extraction-sheet.md#7-scroll-and-navigation-pipeline); [constants](../src/runtime/catalogue.ts#L96); [decay](../src/runtime/catalogue.ts#L3030) |
| 11 · Navigation model | **Adopt — closed** | Catalogue scrolling stays on `/`; a deliberate pick pushes a book document; centered sections replace the address; Back restores list state. | Catalogue and volume modes are distinct; pick pushes, in-volume movement replaces, `popstate` restores mode/offset, and deep links settle to their volume. | None in the model. The implementations differ because ZI3T assembles genuine project/note pages. | None. | [Sheet §§7–8](reference-extraction-sheet.md#7-scroll-and-navigation-pipeline); [history](../src/runtime/catalogue.ts#L2537); [popstate](../src/runtime/catalogue.ts#L2853) |
| 12 · Scene proportions | **Adopt — calibrated in clean room** | Shared OBJ ratio `.6718` width/height and thickness/width `.2121`; one continuous case silhouette. | The live quarter-turn establishes the renderer-basis depth at `.792` and outer thickness at `.1672` (`.2111` of visible depth); board and text-block thickness are independent, and one U-shell carries the structural silhouette. | Continue screenshot tuning, but no local-proportion exemption remains. | Closed architecturally. | [Sheet §4](reference-extraction-sheet.md#4-geometry-and-proportion); [geometry](../src/runtime/clean-room/geometry.ts) |
| 13 · Material scalars | **Adopt by rendered response** | Profiles include negative bump, opacity, emissive, and specular values in the reference equation. | Scalars are translated through the local shader until the resulting pixels match. | Raw numeric equality is secondary to shader-output equality. | Per profile. | [Sheet §3 table](reference-extraction-sheet.md#per-volume-scalar-profiles); [profiles](../src/runtime/clean-room/profiles.ts) |
| 14 · Release easing | **Adopt** | Drag release resets the universal speed to zero; twirl delta is ±.3 and decays `.95` per frame. | Any unmatched local release curve is open work. | Motion deltas are no longer accepted as art direction. | Requires a matched trace. | [Sheet §6](reference-extraction-sheet.md#6-animation-rig-and-timing) |
| 15 · Hover/held scale | **Adopt** | Source hover/active z values determine the screenshot silhouette. | Tune in screenshot space against matched pointer travel. | No thicker-volume exemption remains. | Low after a reproducible capture. | [Sheet §§1,4,6](reference-extraction-sheet.md#1-scene-graph-and-camera) |
| 16 · Camera-follow ratio | **Adopt** | Camera y follows source scroll through `cameraScrollRatio`. | Preserve semantic hit alignment while reproducing the same projected motion. | Any visible scroll delta remains open. | Medium. | [Sheet §7](reference-extraction-sheet.md#7-scroll-and-navigation-pipeline) |
| 17 · Entry choreography | **Adopt** | Entry follows the reference recurrence and timing. | Local compile readiness may gate start, but not alter visible timing after the first painted frame. | Any timing delta remains open. | Requires a matched first-load trace. | [Sheet §6](reference-extraction-sheet.md#6-animation-rig-and-timing) |
| 18 · Spotlight decay | **Adopt by rendered response** | Program 1 uploads decay `2` with distance `0`. | Equivalent inert falloff is acceptable only while its pixels remain equivalent. | None currently measured. | None until output differs. | [Sheet §2](reference-extraction-sheet.md#2-light-rig) |
| 19 · Podcast scissor | **Adopt when that frame is in scope** | Book and podcast scenes share one canvas with scroll-controlled scissors. | Missing visible composition remains an open scope row rather than a protected divergence. | Frame-level difference when reached. | High and content-bound. | [Sheet §§1,7,8](reference-extraction-sheet.md#1-scene-graph-and-camera) |
| 20 · Pixel ratio | **Adopt — closed in clean room** | Reference uses uncapped device pixel ratio. | Clean-room renderer uses the full device pixel ratio. | None in the DPR rule. | Closed. | [Sheet §1](reference-extraction-sheet.md#1-scene-graph-and-camera); [renderer](../src/runtime/clean-room/scene.ts) |

## What the new evidence changes

The material question is no longer “does the reference vary by book?” It does:
19 bound diffuse identities produce 19 scalar profiles in one cover program,
and sampled PCA, BOOM, and WIP profiles remain exact across rest, hover, and
held-drag. That supports a per-volume material pass. Scalar values may be
translated when shader equations differ, but only the rendered reference
response decides whether that translation is complete.

The extraction does not reveal an architectural mismatch large enough to
justify a rebuild by itself. The current scene already matches the reference's
legacy light units, colour pipeline, camera basis, scroll law, idle behavior,
flight recurrence, two-document history model, and per-volume authorship.

## Superseded decision memo

The options below are retained as history only. The 2026-08-08 parity directive
selects whatever implementation closes the measured delta; it removes the
independent-art and protected-divergence restrictions that separated A from B.

Cost ranges below are focused engineering time assuming the existing hardware
harness, original ZI3T assets, and 49-check QA gate remain available. They
exclude waiting for subjective review and, for new media, content production.

### Option A — re-derive material and lighting only

Keep the current scene graph, parametric books, motion, navigation, semantic
anchors, and QA gate. Use the new profile table as evidence for *which controls
must vary*, then derive clean-room gloss, glitter, and split bump masks from the
five original covers. Preserve the now-confirmed four-light rig; only retune it
if the richer masks expose a measured lighting problem.

- Estimated cost: **4–7 focused engineering days**.
- Main risk: overfitting one held frame and making the shelf or route views
  worse. The existing rest/hover/drag/route matrix contains that risk.
- Expected return: highest. It addresses the clearest visible deficit without
  reopening navigation, accessibility, history, or original book construction.

### Option B — full clean-room reimplementation

Rebuild the renderer and state machine against the Extraction Sheet while
retaining only independently authored assets and behavior tests. This would
re-earn the 49 checks for entry, hold/drag/release, route flight, Back/Forward,
deep links, idle, reduced motion, compact layout, section grounds, and terminal
content.

- Estimated cost: **4–6 engineering weeks**.
- Main risk: high regression surface with no evidence that the current scene
  graph is the cause of the remaining visible difference.
- Expected return: uncertain. It can produce a cleaner internal model, but most
  reference mechanisms it would rediscover are already present.

### Option C — extend scope to the components new since July

Add equivalents for the current reference's film, podcast, overlay, loader,
menu, and newsletter/footer surface. This is additive to A or B, not a material
fidelity shortcut. It is valid only where genuine ZI3T work and copy exist;
placeholder media would contradict the existing content rule.

- Estimated cost: **an additional 2–4 engineering weeks after content and
  rights decisions**, with content production outside that range.
- Main risk: the project becomes a facsimile of Stripe's information
  architecture rather than a catalogue of ZI3T's actual work.
- Expected return: product breadth, not closer book rendering.

### Recommendation and decision

Choose **Option A**. It is the only option directly strengthened by the new
same-run evidence, and it preserves the parts already proved on real hardware.
Choose B only if replacing the current implementation is itself the goal.
Choose C only with named, genuine film/podcast/newsletter content.

**Decision recorded 2026-08-07: Option B.** The clean-room implementation starts
on `feature/press-clean-room`, stacked above `feature/reference-capture`. The
existing scene remains the default until the replacement independently earns
the contract and real-GPU gates. The 2026-08-08 directive supersedes every
former visual Reject in this analysis: Option B may replace implementation,
geometry, textures, art direction, and motion wherever that closes a measured
reference delta.

**Checkpoint update 2026-08-07:** the opt-in clean-room renderer has earned the
rank-1 material architecture checkpoint: seven independently derived sampler
roles and five original response profiles pass their hardware gate. This does
not close the row for the shipping scene or make the replacement the default;
interaction and route close-ups have not yet earned visual parity.

**Checkpoint update 2026-08-07:** the replacement has now mechanically earned
the single-shell catalogue/volume route, deep-link, history, rail, five-figure
flight, and live-volume interaction contract on hardware WebGL. This still does
not close the shipping rows: the renderer remains opt-in, catalogue
scroll/terminal and compact/reduced/idle work remain, and route close-ups are
visibly darker and flatter than the accepted implementation—most clearly the
ochre Field Notes cover.

**Checkpoint update 2026-08-07:** the clean-room replacement has now earned its
remaining catalogue contract on hardware WebGL: five native shelf stops, the
`.003`/`.4` fan, the genuine two-surface terminal, desktop idle suspension,
compact continuous presentation, reduced motion, inertness, and live compact
routes. Its dedicated journey gate passes 18/18 alongside the 10/10, 12/12,
15/15, and 8/8 clean-room gates; the untouched renderer still passes 49/49.
Aligned route captures narrow the visual residual to softer clean-room
specular/highlight response, most visibly on Re-fly and Arm. Field Notes is not
a unique outlier when both renderers are captured at the same scroll offset.
At that checkpoint no Reject changed classification; that limitation is now
superseded. A global material gain was not adopted because it makes the closer
covers worse. **Correction after user review:**
this comparison used the accepted ZI3T renderer rather than the live Stripe
scene, so it cannot close Option B. The matched live audit now records FAILs
for the desktop route grid, compact shelf, held silhouette, typography, and
physical surface response. See
[`clean-room-live-visual-audit.md`](clean-room-live-visual-audit.md).
