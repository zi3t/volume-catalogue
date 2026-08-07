# Next run — close the clean-room surface response

Continue the `/press/` clean-room work. The renderer is now the **default** at
`/press/` (no query parameter). It is coherent and its mechanics gates pass, but
its surfaces read flat and muddy next to the reference, and that is the job.

## Read first, in this order

1. `docs/scene-contract.md` — the authority. Read it end to end. Start at the
   **2026-08-07 clean-room GL measurement** checkpoint and read to the end.
2. `docs/clean-room-live-visual-audit.md` — read the **Correction** block at the
   top before any row. Most of the original document is stale.
3. `docs/real-gpu-harness.md` — required before any lighting or material claim.

Treat every summary as suspect, including this file.

## Where it stands

Measured, not asserted:

| Row | State |
|---|---|
| Desktop shelf, desktop route, compact shelf | **At parity** (Δ ≤ 9px, heights exact) |
| Per-volume material profiles | **Correct** — all five reach the GPU, match `profiles.ts` |
| Seven-map architecture | **Confirmed** at GL level |
| §6 cloth / rake / ink | **FAIL, scored** — see below |
| §2 typography hierarchy, compact route | **Unverified** — no instrument |
| Held silhouette | **Not a valid target** — drag travel was never recorded |

The §6 numbers, first rest case at 1568×894:

| Metric | Reference | Ours | Gap |
|---|---|---|---|
| Tonal spread σ | 40.4 | 19.1 | half |
| Weave, mean \|Laplacian\| | 14.45 | 5.43 | a third |
| Rake peak (p99) | 249.7 | 187.8 | dimmer |
| Rake highlight area | 0.015 | 0.059 | four times broader |
| Ink contrast | 2.57 | 1.15 | under half |

That table is why the site looks flat. The architecture and per-volume variation
are already right — this is a **retune of the authored spread**, not new
structure and not new scalars per volume.

## Tools

Both need headful Chrome on 9226 and `npx wrangler dev --port 4173`.

```bash
# Locate cases and score layout parity against recorded reference readings.
deno run --allow-net --allow-read --allow-write tests/measure-visual-parity.mjs
# Against the live reference:
deno run ... tests/measure-visual-parity.mjs --base=https://press.stripe.com/ \
  --renderer= --catalogue-path=/ --only=desktop.firstRestBook

# Score surface response. Feed it a case rect from the harness above.
deno run ... tests/measure-surface-response.mjs \
  --url='http://127.0.0.1:4173/press/' --case-rect=393,332,782,128
```

Gates: `npm run qa:clean-room{,:interaction,:routing,:volume,:journey}`.

## Traps that already cost a session each

1. **`npm run build` means two different things.** From the repo root it is the
   Astro build that populates `dist/`, which is what `wrangler dev` serves. From
   `packages/volume-catalogue/` it is Vite. Running only the package build
   leaves `dist/` stale and you measure the old bundle while reading new source.
   After any source change: `npm run build:site` in the package, then
   `npm run build` **from the repo root**. This produced a confident, wrong
   "the change had no effect" twice.
2. **Never attribute a draw to a book by `state.title`.** That is the book the
   capture harness was focused on, not the book being drawn. Our scene draws all
   five volumes every frame, so the first draw of every segment is the same
   volume; the reference culls, so the identical grouping is sound there. That
   asymmetry produced a fully-evidenced false claim that all five volumes shared
   one profile. Group on the bound diffuse texture, or take the distinct
   signature set without grouping.
3. **Check the pixel count before believing any surface statistic.** A bump
   scale raised too far crushed the case into the dark ground; only ~2.5% of the
   rect survived, and that fragment scored σ 38.5 and Laplacian 20.8 — *better
   than the reference on both*. Read without the pixel count it looks like a
   triumph. **Add a pixel-count floor assertion to
   `measure-surface-response.mjs` before touching `profiles.ts` again.**
4. **Bump scale is not a free lever for weave.** Past some point it removes
   light rather than adding detail; weave and luminance are coupled. Move one
   lever at a time in ~15% steps, re-measuring each time. A ×2.6 jump destroyed
   the case.
5. **Do not tune pose to a screenshot number whose input was not recorded.**
   That is what makes the held silhouette invalid as a target.
6. **Headless Chrome on macOS silently reports SwiftShader.** Every visual
   finding taken there is void. Go headful; the probes refuse to run otherwise.

## The work, in order

1. **Add the pixel-count floor to `measure-surface-response.mjs`.** Fail the run
   if the rect yields less than ~80% of its expected non-ground pixels. Do this
   first — trap 3 is waiting otherwise.
2. **Retune §6 in `src/runtime/clean-room/profiles.ts` and `material.ts`.**
   Targets are the table above. Shininess concentrates the rake (a low Phong
   exponent is literally a broad dim lobe); bump drives weave but see trap 4;
   ink contrast likely wants `baseDiffuseStrength` and the diffuse mix in
   `material.ts` rather than a scalar. Preserve the five volumes' *relative*
   character — it is already correct. Re-measure every step; re-run all five
   gates when the numbers land.
3. **Score §2 typography hierarchy.** No instrument exists. Spine type is
   generated, so connected-component heights in the spine region give a count of
   distinct type sizes per volume. Reference gives author, title, and part/mark
   distinct positions and weights; ours runs one template. Original ZI3T copy
   and the existing Iowan/Baskerville stack only — changing the family needs a
   licensed font and a fresh metric audit.
4. **Score the compact route**, the last unverified row.
5. **Regenerate `clean-room-live-visual-audit.md` from harness output** rather
   than editing its prose. It drifted because the code moved underneath it, and
   editing in place is how that happened.

## Boundaries — binding

- Original ZI3T artwork, copy, typography, logo, and the five genuine projects.
  Do not invent projects to match the reference's longer catalogue.
- Every **Reject** in `reference-gap-analysis.md` stands. Nearby ones: spotlight
  decay (18), spot position scale (6), scene proportions (12), literal material
  scalars (13), hover/held scale (15). Translate the *shape* of a response,
  never the reference's constants — the equations and artwork differ.
- Reference captures stay untracked under `tmp/`. Numbers may be committed;
  bytes may not. `capture-reference.mjs` discards creative assets by default.
- **Do not relax a QA assertion to make a change pass.** A cosmetic address
  cleanup was reverted this session for exactly this reason — in-app addresses
  still carry `press-renderer=clean-room`, which is redundant now and wants a
  change that updates the routing gate alongside it.
- Cover art is **deferred by the user's decision**, which caps
  `Physical material/texture response` no matter how the retune goes. Do not
  quietly re-scope it.
- **Ask before deploying.** The site is live. A hold lifted earlier does not
  carry forward.

## Version control

GitButler (`but`), per `AGENTS.md`. Work sits on `feature/clean-room-visual-parity`
stacked over `feature/press-clean-room` over `feature/reference-capture`, in the
**nested** `packages/volume-catalogue` repo — the parent `zi3t` repo is separate
and has its own branch. Nothing is pushed.
