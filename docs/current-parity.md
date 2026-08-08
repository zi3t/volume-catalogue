# Current reference-parity checkpoint

Checkpoint: 2026-08-08, Chrome on Apple M1 Pro / Metal.

The package now ships one renderer. Its layout and motion follow the current
Stripe Press implementation, while the cover art and route content remain the
real ZI3T projects.

The final manual pass covered the resting catalogue, 190 px shelf scroll,
terminal hand-off, direct Re-fly route, held drag, and 390 × 844 route. Chrome
reported the Apple Metal renderer, emitted no console or runtime errors, and
normalized the former `?press-renderer=clean-room` address to `/press/refly/`.

## Closed in this checkpoint

- Shelf bounds, spacing, depth, camera framing, and the compact 15° camera.
- Source entry recurrence: initial `y = 3 - index × 3`, depth arc from `-50`,
  and shared `.006` to `.15` approach speed.
- Native shelf-scroll camera follow, `.003` fan impulse, `.4` decay, and exact
  `-6`/`-7` shelf homes.
- Pointer hold, two-axis drag, release/twirl response, route flight, Back,
  history, and clean route addresses.
- Scissor-style terminal hand-off without translucent books printing through
  the following surface.
- Desktop and compact direct-route book placement, title/byline/action rhythm,
  promoted authored lead, rail, and Back control.
- One curved case silhouette with independent boards and text block; no fake
  shader crown or duplicate cloth weave.
- Per-volume diffuse, bump, foil, gloss, glitter, and material scalars derived
  from the shared artwork masks.
- Paper-edge headroom and denser signatures, avoiding the former clipped-white
  page block.

## Intentional content differences

- Five ZI3T volumes replace Stripe's product catalogue.
- Titles, bylines, cover artwork, descriptions, and linked pages describe the
  actual projects.
- There is no invented film, podcast, newsletter, or publisher content.

These are content substitutions, not visual exceptions: visible geometry,
surface behavior, type hierarchy, and interaction remain reference-led.

## Ongoing review

There is no synthetic pass/fail claim. Review the canonical states described in
[`manual-reference-review.md`](manual-reference-review.md) whenever the live
reference or the book assets change. Any reproducible visible delta is ordinary
implementation work, not a protected design decision.
