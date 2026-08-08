# ZI3T Volume Catalogue

The WebGL book catalogue behind `zi3t.io/press`, extracted as a portable
browser package. It owns the Three.js scene, book geometry and materials,
artwork, interaction model, route composition, and an optional Cloudflare
Worker adapter.

The package is public for inspection but remains `private` and `UNLICENSED`.

## Commands

```sh
npm install
npm run dev
npm run typecheck
npm run build
npm run build:site
```

- `build` creates the browser package in `dist/`.
- `build:site` builds and replaces `public/press-assets/` in a sibling `zi3t`
  checkout. Set `ZI3T_SITE_ROOT=/absolute/path/to/zi3t` when the repositories
  are not siblings.
- `check` remains a convenience alias for typecheck plus production build. It
  is not a visual-parity verdict.

The old synthetic screenshot and interaction gates are not authoritative and
are not exposed as package commands. Pixel parity is judged from explicit
frames captured in a hardware-backed browser against the current live
reference. Files retained under `tests/` are archival probes, are not shipped,
and must not be treated as release gates.

## Site integration

The repositories are siblings and the site keeps a stable symlink to this
package:

```text
workspace/
├── volume-catalogue/
└── zi3t/
    └── packages/
        └── volume-catalogue -> ../../volume-catalogue
```

The site commits generated browser output under `public/press-assets/`. Its
Worker imports the package adapter and content manifest through the symlink, so
remote builds restore both repositories before running Wrangler.

## Architecture

- `src/content/volumes.ts` owns ordered routes, copy, and visual identities.
- `src/runtime/clean-room/` owns the only shipping renderer and interaction
  state machine. The directory name records its origin, not an alternative
  runtime or a constraint on reference parity.
- `src/runtime/fallback.ts` keeps the semantic catalogue usable when WebGL
  cannot boot.
- `src/adapters/cloudflare-worker.ts` composes the real project pages into the
  book-detail document.
- `src/styles/` and `src/assets/` are package-owned and travel with the build.
- `docs/reference-extraction-sheet.md` records the durable facts recovered from
  the live reference. `docs/current-parity.md` records the current manual
  checkpoint.

## Browser contract

The scene enhances semantic anchors rather than replacing them. A host shell
provides `.press-catalog`, ordered `.press-volume-item` elements, matching
`.press-rail-item` buttons, and optional assembled `.press-volume-section`
content. Each anchor retains a normal `href` and exposes its catalogue route
through `data-press-route`.

DOM order must match `volumes`; that order selects both route content and the
book's authored material profile. Section-content CSS is emitted separately as
`volume-catalogue-volumes.css` and loaded after embedded page styles so the
catalogue composition owns its geometry.

## Licensing

The original ZI3T code and artwork are published without a license. The scanned
cloth and paper sources retain the CC0 provenance recorded in
`src/assets/textures/README.md`.
