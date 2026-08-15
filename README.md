# ZI3T Volume Catalogue

A portable Three.js book catalogue with a self-contained five-volume demo.
The package owns the renderer, geometry, materials, interactions, route
lifecycle, styles, and demo fixtures. It does not fetch or embed content from
the host application.

The package is public for inspection but remains `private` and `UNLICENSED`.

## Commands

```sh
npm install
npm run dev
npm run typecheck
npm run build
npm run build:site
```

- `dev` serves the package demo. Open `/press/`.
- `build` creates the reusable browser package in `dist/`.
- `build:site` builds the package, copies its browser assets into a sibling
  `zi3t` checkout, and replaces that site's `/press/` shell from this demo.
- `check` runs type checking and the production build.

Set `ZI3T_SITE_ROOT=/absolute/path/to/zi3t` when the repositories are not
siblings.

## Package boundary

The shipping renderer reads ordinary semantic catalogue markup:

```html
<li class="press-volume-item">
  <a class="press-volume"
     href="/catalogue/example/"
     data-press-route="/catalogue/example/">
    <span class="press-volume-book">
      <small>Category</small>
      <strong>Example volume</strong>
      <b>01</b>
    </span>
  </a>
</li>
```

The host supplies ordered anchors and optional detail sections. The package
supplies the WebGL scene and enhances those anchors without replacing their
fallback navigation or accessibility semantics.

```ts
import {
  mountVolumeCatalogue,
  type CleanRoomVolumeProfile
} from "@zi3t/volume-catalogue";

const profiles: readonly CleanRoomVolumeProfile[] = [/* host visuals */];
mountVolumeCatalogue({ profiles });
```

`demoVolumes` and `demoVolumeProfiles` are package-owned fixtures. They show
materials, shared geometry, shelf interaction, route lifecycle, and host
integration without referring to zi3t.io projects or engineering notes.

## Architecture

- `src/runtime/clean-room/` owns the shipping renderer and interaction state.
- `src/content/volumes.ts` owns only the self-contained demo route metadata.
- `src/runtime/clean-room/profiles.ts` owns the demo's visual profiles.
- `src/adapters/cloudflare-worker.ts` optionally serves the same static shell
  for catalogue deep links; it never fetches or parses host pages.
- `index.html` is the semantic, no-WebGL-capable demo shell.
- `src/styles/` and `src/assets/` travel with the package build.

One authored book mesh and one seven-map material are reused for every volume.
Cover, spine, page block, joints, and headbands occupy regions of the shared UV
atlas. Thickness changes through a material uniform instead of separate meshes.

## Site integration

The zi3t site keeps a stable symlink to this sibling package and commits the
generated `/press/` shell and browser assets. Its Worker only provides deep-link
fallback and metadata rewriting. The site's notes and project pages have no
catalogue markup or transition hooks.

## Licensing

The original ZI3T code and artwork are published without a license. The scanned
cloth and paper sources retain the CC0 provenance recorded in
`src/assets/textures/README.md`.
