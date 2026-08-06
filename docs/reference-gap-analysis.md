# Reference gap analysis

Comparison captured on the same 1568×894 headful Chrome/Apple M1 Pro Metal
environment on 2026-08-07. The reference facts come from the
[Extraction Sheet](reference-extraction-sheet.md); ZI3T GPU values come from
[`reference/gl-draw-readings-zi3t-20260807.json`](reference/gl-draw-readings-zi3t-20260807.json)
(`O-GL`). Current implementation citations point to
[`src/runtime/catalogue.ts`](../src/runtime/catalogue.ts).

Classification is binding for this analysis:

- **Adopt** — translate the measured mechanism proportionally; “closed” means
  the current implementation already does.
- **Reject** — preserve an explicit contract decision. A Reject cannot become
  an Adopt silently; it requires contrary evidence, the affected contract
  entry, and a new user decision.
- **Undecided** — evidence is sufficient, but scope or art direction still
  belongs to the user.

This extraction does not overturn an existing Reject.

## Prioritized gaps

Rows are ordered by expected visible improvement per unit of work, followed by
already-closed alignments and deliberate divergences. Costs are relative
engineering effort and include proportional real-GPU verification.

| Rank / layer | Decision | Reference | ZI3T now | Visible difference | Cost to close | Evidence |
|---|---|---|---|---|---|---|
| 1 · Material | **Adopt** | Seven-map cover model and 19 texture-correlated scalar profiles: base/custom diffuse, base/custom bump, foil, gloss, glitter. | Five genuinely distinct profiles already exist, but the patched Phong path exposes only foil, sheen, and one bump map. | **High.** Reference books vary from dry cloth to wet gloss, negative bump, emissive foil, and glitter; ours varies cloth/foil but has fewer independently masked responses. | **Medium.** Add clean-room gloss/glitter and split bump masks derived from original ZI3T art; retune all five states. | [Sheet §3](reference-extraction-sheet.md#3-material-model); `O-GL` program 3; [profiles](../src/runtime/catalogue.ts#L329) |
| 2 · Texture | **Adopt** | Most cover maps upload at 1920×1600; diffuse unit 1 is the per-volume material join key. | Procedural/original textures are commonly 500×400, 512-square, 768-wide, or 128-square; five volumes are still independently keyed. | **Medium–high** on held and route close-ups; low on the shelf. Resolution alone is not the goal—the missing independent masks are. | **Medium**, shared with rank 1. Generate route-resolution masks from original SVG/cloth sources and retain lazy loading. | [Sheet §5](reference-extraction-sheet.md#5-texture-pipeline); `O-GL` `textures`; [texture creation](../src/runtime/catalogue.ts#L767) |
| 3 · Compact camera | **Undecided** | FOV changes from 12° to 15° below 600 px. | FOV remains 12°; compact geometry and hit regions were calibrated around that lens. | **Medium** on narrow phones: 15° adds perspective and changes apparent depth. | **Low code / high QA risk.** One constant, but every compact silhouette, route ground, and hit target must be re-baselined. | [Sheet §1](reference-extraction-sheet.md#1-scene-graph-and-camera); [camera](../src/runtime/catalogue.ts#L1505); [contract](scene-contract.md) compact checkpoints |
| 4 · Material architecture | **Undecided** | Dedicated custom cover `ShaderMaterial`, one shared program with per-book uniforms. | `MeshPhongMaterial.onBeforeCompile` keeps Three's standard chunks and injects ZI3T foil/sheen uniforms. | Potentially **high**, but only if rank 1 cannot reproduce the reference's masked response. A program rewrite has no automatic visual value. | **High.** Clean-room equation rewrite, cache keys, transparency, all five materials, and cross-browser requalification. | [Sheet §3](reference-extraction-sheet.md#program-structure); `O-GL` programs 0–4; [shader patch](../src/runtime/catalogue.ts#L1236) |
| 5 · Current component scope | **Undecided** | August adds film overlay/detail, menu, loader, footer/newsletter, and podcast scene around 19 books. | Five original volumes, the existing terminal character study/closing, rail, and genuine project/note content. | **High** as product scope, not as book-render fidelity. | **Very high/content-bound.** New genuine media, copy, accessibility, responsive behavior, and QA are prerequisites. | [Sheet §8](reference-extraction-sheet.md#8-content-architecture); [contract](scene-contract.md) terminal/content decisions |
| 6 · Light rig | **Adopt — closed** | Ambient `.52π`; key `.6π`; back `#211815 × .5π` with palette lerp; mint rake `.75π→.05π`. | Same constants, positions translated by `camera.z/100`, palette-driven back light, and held rake dimming. `O-GL` confirms ambient, key, and back uploads. | No material visible gap established in this capture. | None unless rank 1 exposes a new interaction. | [Sheet §2](reference-extraction-sheet.md#2-light-rig); [rig](../src/runtime/catalogue.ts#L1505); [layout](../src/runtime/catalogue.ts#L2298) |
| 7 · Colour/render pipeline | **Adopt — closed** | Color management off; linear output; no tone mapping; no environment or shadow inputs. | Same non-colour-managed linear passthrough, no tone mapping, no IBL, no shadows. | None established. | None. | [Sheet §§2–3](reference-extraction-sheet.md#2-light-rig); [pipeline](../src/runtime/catalogue.ts#L18); [renderer](../src/runtime/catalogue.ts#L1491) |
| 8 · Flight recurrence | **Adopt — closed** | Product activation resets the universal approach, then ramps `+.006` per frame to `.15`. | Picked-volume flight uses frame-normalized `.006/.15` constants and stops when it lands. | None in the mechanism. | None. | [Sheet §6](reference-extraction-sheet.md#6-animation-rig-and-timing); [constants](../src/runtime/catalogue.ts#L80); [flight](../src/runtime/catalogue.ts#L3311) |
| 9 · Hover z easing | **Adopt — closed** | Hovered spine z uses fixed `.1` per frame. | Same frame-normalized `.1` approach, with screen-space depth calibrated to ZI3T's thicker volumes. | No timing gap; projected size intentionally differs from the literal source z. | None. | [Sheet §6](reference-extraction-sheet.md#6-animation-rig-and-timing); [constants](../src/runtime/catalogue.ts#L37); [pose](../src/runtime/catalogue.ts#L3219) |
| 10 · Scroll/idle | **Adopt — closed** | `delta × .003`, decay `.4` per frame, tilt inside the damped target; rendering stops 1200 ms after movement. | Same law, frame normalized and clamped to ±1 for trackpad safety; desktop buffer is preserved for idle presentation. | None established. | None. | [Sheet §7](reference-extraction-sheet.md#7-scroll-and-navigation-pipeline); [constants](../src/runtime/catalogue.ts#L96); [decay](../src/runtime/catalogue.ts#L3030) |
| 11 · Navigation model | **Adopt — closed** | Catalogue scrolling stays on `/`; a deliberate pick pushes a book document; centered sections replace the address; Back restores list state. | Catalogue and volume modes are distinct; pick pushes, in-volume movement replaces, `popstate` restores mode/offset, and deep links settle to their volume. | None in the model. The implementations differ because ZI3T assembles genuine project/note pages. | None. | [Sheet §§7–8](reference-extraction-sheet.md#7-scroll-and-navigation-pipeline); [history](../src/runtime/catalogue.ts#L2537); [popstate](../src/runtime/catalogue.ts#L2853) |
| 12 · Scene proportions | **Reject** | Shared OBJ ratio `.6718` width/height and thickness/width `.2121`; one triangulated case mesh. | Original volumes use per-book proportions and separately shaded cover, boards, page block, fore-edge, underside/endpaper, and headbands. They are visibly wider/thicker by design. | **High**, deliberately. Literal source proportions would distort ZI3T's cover art and erase accepted physical layering. | Not applicable. | [Sheet §4](reference-extraction-sheet.md#4-geometry-and-proportion); [geometry](../src/runtime/catalogue.ts#L1856); [contract](scene-contract.md) geometry rejections |
| 13 · Literal material scalars | **Reject** | Some profiles use negative bump, opacity, emissive, or specular inputs specific to the reference equations. | ZI3T scalars are authored for its own masks and patched Phong equations. | Copying numbers would be visibly wrong and may invert effects. | Not applicable; translate response, not constants. | [Sheet §3 table](reference-extraction-sheet.md#per-volume-scalar-profiles); [profiles](../src/runtime/catalogue.ts#L329) |
| 14 · Release easing | **Reject** | Drag release resets the universal speed to zero; twirl delta is ±.3 and decays `.95` per frame. | Twirl limit/decay are adopted, but the accepted reversible release profile preserves the measured early/late keyframes instead of globally restarting every channel. | **High** during release; deliberate. | Reopening requires a new timing trace and user approval. | [Sheet §6](reference-extraction-sheet.md#6-animation-rig-and-timing); [twirl](../src/runtime/catalogue.ts#L85); [contract](scene-contract.md) release decision |
| 15 · Literal hover/held scale | **Reject** | Source hover/active z values operate on a thinner mesh and its own camera basis. | Projected scale is 1.033 hover / 1.035 hold, calibrated to the accepted ZI3T silhouette. | Literal import over-scales the thicker volumes. | Not applicable. | [Sheet §§1,4,6](reference-extraction-sheet.md#1-scene-graph-and-camera); [calibration](../src/runtime/catalogue.ts#L37); [contract](scene-contract.md) held silhouette |
| 16 · Camera-follow ratio | **Reject** | Camera y follows source scroll through `cameraScrollRatio`. | Camera y cancels DOM shift 1:1 so each mesh remains bound to its semantic row/section. | Literal `.0222/.027`-style ratios would unpin the books from their hit areas. | Not applicable. | [Sheet §7](reference-extraction-sheet.md#7-scroll-and-navigation-pipeline); [camera placement](../src/runtime/catalogue.ts#L2144); [contract](scene-contract.md) camera-ratio rejection |
| 17 · Entry choreography | **Reject** | Current durable evidence exposes universal recurrence but no independent trace-backed entry duration. | Entry deliberately starts after shader compile, then uses 54 ms delay, 72 ms stagger, 492 ms spring, and a measured settlement gate before rail reveal. | **High**, deliberately authored to avoid cold compilation consuming the reveal. | Reopening requires a reference entry trace plus all first-load/browser checks. | [Sheet §6](reference-extraction-sheet.md#6-animation-rig-and-timing); [entry constants](../src/runtime/catalogue.ts#L46); [contract](scene-contract.md) first-load recording |
| 18 · Spotlight decay literal | **Reject** | Program 1 uploads default decay `2`, but distance is `0`, so falloff is inert in r151. | r171 spotlight explicitly uses decay `0`; distance is also `0`. | None; copying `2` into r171 would reintroduce physical inverse-square behavior if distance semantics change. | None. | [Sheet §2](reference-extraction-sheet.md#2-light-rig); [spotlight](../src/runtime/catalogue.ts#L1527); [contract](scene-contract.md) r151/r171 unit law |
| 19 · Podcast scissor | **Reject** | Book and podcast scenes share one canvas with scroll-controlled scissors. | One scene is split by catalogue/volume mode; no podcast scene exists. | None until genuine podcast content exists. | High and coupled to rank 5. | [Sheet §§1,7,8](reference-extraction-sheet.md#1-scene-graph-and-camera); [mode render](../src/runtime/catalogue.ts#L2995) |
| 20 · Pixel ratio | **Reject** | Reference uses uncapped device pixel ratio. | Renderer caps DPR at 1.75 as a performance hardening decision. | Small sharpness difference above 1.75 DPR; potentially large GPU-cost difference. | Low code / medium performance risk. | [Sheet §1](reference-extraction-sheet.md#1-scene-graph-and-camera); [DPR cap](../src/runtime/catalogue.ts#L1491); [contract](scene-contract.md) performance hardening |

## What the new evidence changes

The material question is no longer “does the reference vary by book?” It does:
19 bound diffuse identities produce 19 scalar profiles in one cover program,
and sampled PCA, BOOM, and WIP profiles remain exact across rest, hover, and
held-drag. That supports a per-volume material pass, but not a literal number
port. The geometry, shader equations, and original artwork differ too much for
the raw values to be portable.

The extraction does not reveal an architectural mismatch large enough to
justify a rebuild by itself. The current scene already matches the reference's
legacy light units, colour pipeline, camera basis, scroll law, idle behavior,
flight recurrence, two-document history model, and per-volume authorship.

## Decision memo

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
the contract and real-GPU gates. Every Reject in this analysis remains binding;
Option B is permission to replace the implementation, not to erase prior art-
direction or behavior decisions.

**Checkpoint update 2026-08-07:** the opt-in clean-room renderer has earned the
rank-1 material architecture checkpoint: seven independently derived sampler
roles and five original response profiles pass their hardware gate. This does
not close the row for the shipping scene or make the replacement the default;
interaction and route close-ups have not yet earned visual parity.
