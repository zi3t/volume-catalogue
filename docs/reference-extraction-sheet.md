# Stripe Press reference extraction sheet

Research capture from 2026-08-07. This is a description of the current runtime,
not a rebuild specification and not permission to copy Stripe artwork, fonts,
copy, logos, or shader source.

## Evidence ledger

All reference claims below point to one of these durable records. Bundle names
are included only to identify the manifest row; the SHA-256 is the durable
identity.

| ID | Durable evidence |
|---|---|
| **R-HTML** | [`reference/manifest-20260807.json`](reference/manifest-20260807.json), `https://press.stripe.com/`, SHA-256 `43b6fea3a47d7524283b99861ca5541c9cfc9856ecc7e9c98da71cb5b73e4306` |
| **R-SCENE** | Same manifest, current scene controller `v1-chunk-C6COBQDB.js`, SHA-256 `2de6a1c463bc7ea966bb7042eb074984edab1a925869a41209db37a4ac8c931e` |
| **R-MATERIAL** | Same manifest, embedded OBJ and material program `v1-chunk-DDDINZUK.js`, SHA-256 `d63d9521755eafc7a4d32be8ced74bc57ef9a404a38bad4790eae8b05aefb2ec` |
| **R-THREE** | Same manifest, Three.js r151 `v1-chunk-2PON3HJD.js`, SHA-256 `8a665fad5c6d69644fd6557808c4869a0ad3c234a90f805defdeae8eee9d7138` |
| **R-PAGE** | Same manifest, page controller `v1-Page-DS72ESRF.js`, SHA-256 `085b6ccc6efb5b0d429e38b0f6945ed8260a6f8475f5df5c4e17b209b75cfafc` |
| **R-GL** | [`reference/gl-draw-readings-20260807.json`](reference/gl-draw-readings-20260807.json), hardware WebGL2 on Apple M1 Pro Metal; cover program **1**, 22,011 draws, 42 uniforms, shader lengths recorded but shader source excluded |

`R-GL` contains 1,200 raw per-draw samples compacted to 179 entries by keeping
the first exact draw per state/material/texture signature. The capture drove all
19 books at rest and drove books 0, 4, and 10 through rest, hover, and held-drag.
The driver-state title says which row was being exercised; the bound custom
diffuse texture, not that title, identifies the material being drawn. Evidence:
**R-GL**, `snapshotConfig` and `drawSnapshotCompaction`.

## 1. Scene graph and camera

| Entry | Extracted value | Evidence |
|---|---|---|
| Renderer/canvas | One alpha WebGL renderer, scissor test enabled, `autoClear=false`; the book scene and podcast sub-scene share the canvas through separate scissors. | **R-SCENE** |
| Main scene | Books are cloned roots added directly to one `Scene`. Each root contains the mesh named `book`; the per-book material is installed on that mesh. There is no rotated master shelf group. | **R-SCENE**, **R-MATERIAL** |
| Camera | `PerspectiveCamera`; desktop FOV `12°`, FOV `15°` below 600 px, near `1`, far `650`. Nominal position is `(0, 6.5, 100)` and pitch is `−0.06` rad. Desktop z scales from the 100-unit basis with canvas height/scale. | **R-SCENE** |
| Scene tilt | The global six-degree-down presentation comes from camera pitch `−0.06`; shelf orientation comes from each book root's rest rotation. No scene-root rotation was found. | **R-SCENE** |
| Light parenting | Ambient, two directional lights, spotlight, and spotlight target are scene children. The spotlight and its target follow camera y each frame, preserving their direction while the camera scrolls. | **R-SCENE** |
| DOM-to-scene ownership | Each `.PressHomepageBook` row owns interaction; the fixed canvas paints the corresponding mesh. At 1568×894 the capture discovered 19 rows, each spanning the viewport width. | **R-GL**, `snapshotStates` |

## 2. Light rig

The renderer is the r151 legacy-light pipeline: light colour is uploaded as
`colour × intensity × π`. Dividing the captured uniforms by π recovers the
authored values below. Evidence: **R-THREE**, **R-GL** program 1.

| Light | Authored rig | GPU confirmation at rest | Evidence |
|---|---|---|---|
| Ambient | White, intensity `.52`. | `[1.63362818, 1.63362818, 1.63362818]`, exactly `.52π`. | **R-GL** p1/draw 1857 |
| Key/left directional | White, intensity `.6`, position `(4, 9.5, 4.5)`. | Direction `[.355643, .819142, .450028]`; colour `[1.884956, 1.884956, 1.884956]`, exactly `.6π`. | **R-SCENE**; **R-GL** p1/draw 1857 |
| Back directional | Constructed with neutral `#211815`, intensity `.5`, position `(−32, 12, −16)`. The separately configured `#ffe6cc` value is dead data. Its colour lerps toward the active book's background palette; drag can target the hovered book's palette. | At rest, direction `[−.847998, .342852, −.404168]`; colour `[.203280, .147840, .129360]`, exactly raw `#211815 × .5π`. | **R-SCENE**; **R-GL** p1/draw 1857 |
| Rake spotlight | `#cceecc`, intensity `.75` at rest and `.05` active; position `(24, cameraY, 1)`, angle `.36`, penumbra `1`, target `(−6, cameraY−6.5, −6.5)` and active target `(−14.3, ·, −61)`. | Colour `[1.884956, 2.199115, 1.884956]`; `coneCos=.935896824` gives `.36` rad; distance `0`. Captured default decay is `2`, but distance zero makes the falloff term inert. | **R-SCENE**; **R-GL** p1/draw 1857 |
| Environment/shadows | No environment-map sampler, light-probe contribution, or shadow-map input participates in cover program 1. `lightProbe[0]` is all zero. | Uniform inventory and values. | **R-GL** program 1 |

## 3. Material model

### Program structure

| Stage | Inputs and operation | Evidence |
|---|---|---|
| Vertex thickness | Uniform `thickness` changes the x-extents around a built-in `modelThickness=3.374`; vertices with x above `1` or below `−1` move by half the delta. | **R-MATERIAL** |
| Diffuse | `diffuseMapBase` and `diffuseMapCustom` are overlay-blended; `diffuseBaseColor` is the fallback when the result is black. | **R-MATERIAL** |
| Relief | Shared and custom bump maps use independent `bumpScaleBase` and `bumpScaleCustom`. Their contribution is reduced beneath foil, gloss, and glitter coverage. | **R-MATERIAL** |
| Foil | `foilMap` supplies coverage. `foilDetail` changes the animated palette lookup; `foilOpacity` blends it; `foilSpecular` adds to specular strength; `foilEmissive` controls its emissive term. Foil colour is sampled from a `14% × 19%` palette region in the custom diffuse atlas. | **R-MATERIAL** |
| Gloss | `glossMap`, `glossOpacity`, `glossSpecular`, and `glossEmissive` add independently masked wet-looking colour/specular/emissive terms. | **R-MATERIAL** |
| Glitter | `glitterMap`, `glitterOpacity`, `glitterSpecular`, and `glitterEmissive` add the third independently masked effect. | **R-MATERIAL** |
| Lighting | The three coverage systems feed a custom Phong-style direct-light pass with `specular`, `shininess`, and `reflectiveness`; program 1 has no environment reflection input. | **R-MATERIAL**, **R-GL** program 1 |

### Per-volume scalar profiles

This closes the plan's last-write-wins ambiguity. Nineteen distinct bound custom
diffuse assets resolve to nineteen distinct scalar profiles in one run and one
program. PCA, BOOM, and WIP each appear during rest, hover, and held-drag with
exactly one material profile, so the scalar variation is per-volume rather than
an interaction-state effect. Evidence: **R-GL** program 1.

Columns are `t` thickness, `sh` shininess, `r` reflectiveness, `b` base/custom
bump, `f` foil detail/opacity/emissive/specular, `g` gloss opacity/specular, and
`gl` glitter opacity/specular.

| Book | Asset | t | sh | r | b | f | g | gl | Exact draw |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Poor Charlie's Almanack | PCA | 3.4 | 3 | .6 | −.02/−.04 | 2/0/0/.2 | 1/.1 | .3/.2 | **R-GL** p1/1857 |
| Maintenance | MOE | 3 | 2 | .1 | .04/.25 | 2.6/.6/0/1 | 1/.1 | 0/0 | **R-GL** p1/1858 |
| The Origins of Efficiency | OOE | 3.4 | 1.2 | .8 | .015/.14 | 1.5/−1/−1/.3 | 1/.1 | 0/0 | **R-GL** p1/1859 |
| The Scaling Era | TSE | 3.4 | 1 | .6 | .015/.12 | 1/.8/.45/−.45 | 1/.1 | 0/0 | **R-GL** p1/1860 |
| Boom | BOOM | 3.4 | 1 | .6 | .04/−.04 | .8/1.3/.2/−1.3 | 1/.1 | 0/0 | **R-GL** p1/1861 |
| Scaling People | SP | 3.4 | 3 | .6 | .03/.04 | 2/1.1/0/0 | .03/.6 | 0/0 | **R-GL** p1/1862 |
| Pieces of the Action | POTA | 3.4 | 12 | .2 | .04/.07 | 2/.9/0/.6 | .05/.2 | 0/0 | **R-GL** p1/5681 |
| Where Is My Flying Car? | WIMFC | 2.85 | 8 | .1 | .04/.1 | 1/.85/0/.3 | 1/.1 | 0/0 | **R-GL** p1/7735 |
| The Big Score | TBS | 3.4 | 7 | .2 | .06/.05 | 3/1.5/0/.4 | 1/.1 | 0/0 | **R-GL** p1/9861 |
| Scientific Freedom | SF | 2.4 | 10 | .1 | .03/.02 | 4/1.5/0/.6 | 1/.1 | 0/0 | **R-GL** p1/12023 |
| Working in Public | WIP | 2.4 | 8 | .1 | .04/.1 | .5/1/0/.1 | 1/.1 | 0/0 | **R-GL** p1/14162 |
| The Art of Doing Science and Engineering | TADSE | 3.4 | 12 | .1 | .05/.1 | 1/.75/0/.4 | 1/.1 | 0/0 | **R-GL** p1/16324 |
| The Making of Prince of Persia | POP | 3.4 | 10 | .03 | .05/.1 | .5/1/0/.1 | 1/.1 | 0/0 | **R-GL** p1/18463 |
| Get Together | GT | 2.4 | 20 | .1 | .07/.1 | 1.5/1/.5/−.1 | 1/.1 | 0/0 | **R-GL** p1/20625 |
| An Elegant Puzzle | AEP | 3.4 | 8 | .04 | .04/.05 | 1/1/0/.1 | 1/.1 | 0/0 | **R-GL** p1/22764 |
| The Revolt of the Public | ROTP | 3.4 | 11 | .1 | .05/.05 | 3/1.2/.2/−.3 | 1/.1 | 0/0 | **R-GL** p1/24926 |
| Stubborn Attachments | SA | 2.4 | 14 | .1 | .06/.3 | 4/.2/0/.35 | 1/.1 | 0/0 | **R-GL** p1/27088 |
| The Dream Machine | TDM | 3.4 | 10 | .3 | .05/.1 | 1/.8/.25/−.25 | 1/.1 | 0/0 | **R-GL** p1/29250 |
| High Growth Handbook | HGH | 3.4 | 10 | .1 | .05/.3 | .5/1/0/.1 | 1/.1 | 0/0 | **R-GL** p1/31389 |

The table does not imply that these numbers should be copied into ZI3T. Several
negative values are intentional inputs to this shader's blend equations and are
not portable to a different material equation. Evidence: **R-MATERIAL** and
**R-GL** program 1.

## 4. Geometry and proportion

| Entry | Extracted value | Evidence |
|---|---|---|
| Source mesh | One embedded OBJ object named `book`: 1,138 positions, 1,138 UVs, 845 normals, and 1,978 triangular faces. | **R-MATERIAL** |
| Object bounds | x `−1.687236…1.687236` (3.374472), y `−11.838970…11.838970` (23.677940), z `−7.947264…7.959763` (15.907027). | **R-MATERIAL** |
| Proportion | Long-axis/cover-width `1.488521`; cover-width/long-axis `.671808`; base thickness/cover-width `.212137`. | Bounds derived from **R-MATERIAL** |
| Construction | A single detailed triangulated case mesh supplies spine, boards, page block, and rounded edge topology; the runtime does not assemble separate box primitives per volume. | **R-MATERIAL**, **R-SCENE** |
| Variable thickness | The common mesh is deformed only along x by the `thickness` uniform. Captured per-volume thickness ranges from `2.4` to `3.4`, around model thickness `3.374`. | **R-MATERIAL**, **R-GL** program 1 |
| Shelf pose | Root rotation `(−π/2, 0, +π/2)`; cover y rotation `−π/2`, x position `11`, order ZYX. Rest z is `−3`; regular gap is `−6` and compact gap `−7`. | **R-SCENE** |
| Active pose | Desktop active root position `(−13, −4, −56)` with rotation `(−.5, .35, .15)`; inactive roots use `(−13, −4, −50)`. Compact active position is `(0, 3, −90)`. | **R-SCENE** |

The OBJ bounds are the recoverable source proportions. Pixel dimensions in a
particular frame also depend on camera scale and the active/rest pose, so no
single screenshot width is promoted to a geometry constant. Evidence:
**R-SCENE**, **R-MATERIAL**.

## 5. Texture pipeline

| Entry | Extracted value | Evidence |
|---|---|---|
| Asset family | Contentful supplies per-volume diffuse, bump, foil, and optional gloss maps plus shared diffuse overlay, shared bump variants, and shared glitter. | **R-SCENE**, **R-GL** program 1 bindings |
| Variant rule | Default request width is `1920`; WebP-capable paths use `fm=webp&q=60` where configured. Safari 13/14 switches format to JPEG and width to `2000`. | **R-SCENE** |
| Loading | Four books' spine assets are available first; complete per-book sets load lazily near the camera or on activation. Texture anisotropy is `8`. | **R-SCENE** |
| Healthy WebGL2 upload | The run recorded 7 one-pixel `texImage2D` placeholders, then 66 `texStorage2D` allocations and 66 matching `texSubImage2D` uploads. Of the real upload events, 118 were 1920×1600. | **R-GL**, `counts` and `textures` |
| Sampler units | Base diffuse `0`; custom diffuse `1`; base bump `2`; custom bump `3`; foil `4`; gloss `5`; glitter `6`. | **R-GL** p1/draw 1857 |
| Per-volume identity | Nineteen distinct custom diffuse textures were observed in program 1. The texture bound to unit 1 is the reliable join key from a draw to its material profile. | **R-GL** program 1 |
| Colour pipeline | Textures have no sRGB encoding conversion; r151 defaults shade the bytes in the linear-pass-through pipeline. | **R-SCENE**, **R-THREE** |

## 6. Animation rig and timing

The current controller is primarily a state recurrence, not a collection of
fixed-duration tweens. No wall-clock duration is inferred from screenshot
cadence here.

| Motion | Extracted law | Evidence |
|---|---|---|
| Universal approach | Every transformed channel approaches its target using `speed = min(.15/fpsRatio, speed + .006/fpsRatio)`. Speed resets to `0` on drag release and product activation. | **R-SCENE**, **R-PAGE** |
| Entry | Books start from separated y/z positions and converge through the universal approach. No independent, trace-backed entry duration is present in the durable evidence, so none is claimed. | **R-SCENE** |
| Hover | Hover target is z `6`, rotation x `−.45π`; the spine z channel uses a fixed `.1` approach per frame. | **R-SCENE** |
| Press/drag | Four-pixel Manhattan threshold. Shelf cover drag maps pointer travel at `.003` rad/px; neighbors separate by `30` scene units. | **R-SCENE**, **R-PAGE** |
| Passive cover follow | In the active document, unheld pointer follow is `.00015` rad/px from canvas centre; compact multiplies it by three. | **R-PAGE** |
| Release | The last pointer-rotation delta is clamped to `±.3`, then multiplied by `.95` per frame until negligible. Resetting the universal speed to zero adds the slow-start return. | **R-SCENE**, **R-PAGE** |
| Route activation | Path/mode change resets the same `.006→.15` approach; active and inactive target poses differ, but there is no separate route-easing function or fixed-duration tween. | **R-SCENE**, **R-PAGE** |
| Idle | Page movement keeps rendering alive; `isMoving` clears 1200 ms after the last movement and the idle loop stops. This is a source timer, not a screenshot-derived duration. | **R-PAGE** |

## 7. Scroll and navigation pipeline

| Entry | Extracted value | Evidence |
|---|---|---|
| Scroll source | Native `window.scrollY` and a debounced scroll listener drive the scene; the canvas itself is fixed. | **R-PAGE**, **R-SCENE** |
| Shelf fan | While no product is active, a scroll event sets `scrollVelocity = scrollDelta × .003`; render multiplies it by `.4` per frame and adds it inside the spine-tilt target. | **R-SCENE** |
| Camera follow | Camera y is `6.5 − scrollY × cameraScrollRatio`; the light rig follows camera y. | **R-SCENE** |
| Scissors | Scroll position updates book/podcast scissors so both sub-scenes can share the fixed canvas without overwriting each other. | **R-SCENE**, **R-PAGE** |
| Catalogue document | Scrolling the root product list never activates a book URL. A deliberate click/Enter calls product activation and pushes the selected slug. | **R-PAGE**, **R-HTML** |
| Book document | The same shell switches to the product-details list. As the centered product changes, the current slug is replaced rather than pushed; ArrowUp/ArrowDown step products and Escape returns to the list. | **R-PAGE** |
| History | Deliberate mode changes use `pushState`; in-document centered-product changes use `replaceState`; `popstate` either restores the list or reloads when the path is outside the current host mode. | **R-PAGE** |

## 8. Content architecture

| Entry | Extracted value | Evidence |
|---|---|---|
| Book catalogue | Current root contains 19 `.PressHomepageBook` rows. The capture records all 19 public titles and slugs without retaining cover artwork. | **R-HTML**, **R-GL** `snapshotStates` |
| Additional media | The current shell also contains film and podcast regions handled after the book list; the renderer owns separate film meshes and a podcast sub-scene. | **R-HTML**, **R-SCENE**, **R-PAGE** |
| Two logical documents | One `PressHomepageWrapper` carries both product-list and product-detail structures. Navigation switches which structure owns layout: list on `/`, details on a book slug. It is a mode change, not a scroll from the end of one into the other. | **R-HTML**, **R-PAGE** |
| Route assembly | Menu slug lookup supplies paths. A click/Enter selects an indexed product, sets its URL, reveals nearby detail sections, sets scroll to that product's detail offset, and gives the matching mesh the active pose. | **R-PAGE**, **R-SCENE** |
| Current component surface | The August build includes menu, loader, footer/newsletter, film overlay, and film-detail modules in addition to the book catalogue. Their presence is content scope, not evidence that ZI3T needs equivalents. | **R-HTML**, **R-PAGE**, **R-SCENE** |

## Evidence limits

- The material experiment discriminates per-volume from interaction-state
  variation for PCA, BOOM, and WIP. It does not establish that light-transition
  values sampled 300 ms into held-drag are settled targets; light targets come
  from **R-SCENE**, while exact sampled light uniforms remain in **R-GL**.
- Shader source was used transiently to derive the program structure and then
  excluded. The repository retains only its manifest hash and numeric GL
  readings: **R-MATERIAL**, **R-GL**.
- No trace artifact was committed for entry or route wall-clock timing.
  Consequently this sheet records the source recurrences and the explicit
  1200 ms idle timer, but no visual settle duration: **R-SCENE**, **R-PAGE**.
