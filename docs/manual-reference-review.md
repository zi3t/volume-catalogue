# Manual reference review

Visual parity is reviewed in a hardware-backed browser against the current
`press.stripe.com` implementation. Synthetic image scores and scripted
interaction assertions are not release gates.

## Review conditions

- Use the same browser, viewport, device-pixel ratio, zoom, and GPU for both
  pages.
- Confirm Chrome reports the physical GPU rather than SwiftShader.
- Capture the live reference first so a later upstream deploy cannot silently
  change the comparison.
- Compare stable resting frames and the visible path between them. A matching
  endpoint does not excuse different drag, release, entry, or scroll motion.
- Inspect the catalogue, a held and dragged volume, a direct volume route,
  compact layout, native shelf scroll, and the terminal hand-off.
- Treat differences in genuine ZI3T cover artwork and copy as content, while
  matching their placement, physical response, typography hierarchy, and scene
  choreography.

## Useful local URLs

```text
http://127.0.0.1:4173/press/
http://127.0.0.1:4173/press/refly/
http://127.0.0.1:4173/press/arm/
http://127.0.0.1:4173/press/telemetry/
```

The renderer is the default and internal navigation uses clean paths. No
`press-renderer` query parameter is required.

## Source of truth

Use [`reference-extraction-sheet.md`](reference-extraction-sheet.md) for source
constants and mechanisms. Use [`current-parity.md`](current-parity.md) for the
latest visible checkpoint. If the live reference changes, update the extraction
sheet or add a dated evidence artifact; do not tune against memory.
