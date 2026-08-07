# ZI3T Volume Catalogue

The WebGL book catalogue behind `zi3t.io/press`, extracted as a portable
browser package. It owns its Three.js runtime, scene assets, calibrated styles,
content manifest, QA harness, and an optional Cloudflare Worker adapter.

The source repository is public. The npm package remains marked `private` and
`UNLICENSED`: public visibility permits inspection, but no open-source license
has been granted yet.

Nothing in the standalone build depends on the ZI3T site repository. The
optional `build:site` command integrates with a sibling `zi3t` checkout.

## Commands

```sh
npm install
npm run dev
npm run typecheck
npm run build
npm run check
npm run build:site
npm run qa:clean-room
npm run qa:clean-room:interaction
npm run qa:clean-room:routing
npm run qa:clean-room:volume
npm run qa:clean-room:journey
```

- `build` creates a self-contained ES-module library in `dist/`.
- `check` runs the package-owned type and production-build gates.
- `build:site` also replaces the dedicated generated directory at
  `public/press-assets/` in a sibling `zi3t` repository. Set
  `ZI3T_SITE_ROOT=/absolute/path/to/zi3t` when the repositories are not
  siblings.
- The `qa:clean-room*` commands launch a dedicated hidden, headful Chrome,
  verify that it is using hardware WebGL, run their gate in a background
  target, and close it again. They do not activate Chrome or reuse a person's
  browser profile. The assembled Worker site must already be available at
  `http://127.0.0.1:4173`.
- `tests/qa-press-scene.mjs` is the behavioural gate. Run it only through the
  documented [real-GPU harness](docs/real-gpu-harness.md); SwiftShader
  invalidates both rendering and the WebGL assertions.

## Site integration

The expected local layout keeps project ownership separate while preserving a
stable import path inside the site:

```text
workspace/
├── volume-catalogue/
└── zi3t/
    └── packages/
        └── volume-catalogue -> ../../volume-catalogue
```

The site commits the generated browser output under `public/press-assets/`.
Its Worker imports the package adapter and content manifest through the
symlink. A remote site build therefore needs the sibling checkout restored
before running Wrangler.

## Architecture

- `src/content/volumes.ts` is the ordered route and content manifest.
- `src/runtime/catalogue.ts` preserves the calibrated interaction state
  machine. It is isolated behind `mountVolumeCatalogue()` before deeper
  refactors so visual and navigation behaviour can be compared exactly.
- `src/runtime/fallback.ts` is the CSS/DOM fallback used when WebGL cannot boot.
- `src/styles/` and `src/assets/` are package-owned; there is no dependency on
  another project's Three.js or texture directory.
- `src/adapters/cloudflare-worker.ts` assembles existing content pages into the
  catalogue shell without coupling the renderer to Cloudflare.
- `docs/scene-contract.md` is the authoritative architecture, evidence, and
  checkpoint record. Historical summaries are not.

## Browser contract

The scene enhances semantic anchors rather than replacing them. A host shell
provides `.press-catalog`, ordered `.press-volume-item` elements, matching
`.press-rail-item` buttons, and optional assembled
`.press-volume-section` content. Each anchor keeps a normal `href` and adds its
catalogue route through `data-press-route`.

The order of DOM volumes must match `volumes`. That order also selects the
calibrated physical material profile, so changing it is a contract change, not
just content editing.

The section-content CSS is intentionally emitted separately as
`volume-catalogue-volumes.css`. A server adapter must load it after each
embedded page's own stylesheet so the catalogue's geometry rules win the
cascade.

## Licensing

The original ZI3T code and artwork are currently published without a license.
The scanned cloth and paper sources retain the CC0 provenance recorded in
`src/assets/textures/README.md`.
