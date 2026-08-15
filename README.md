# ZI3T Volume Catalogue

An independent, Stripe Press–inspired WebGL book-catalogue study built as a
portable Three.js package.

- [Live demo](https://zi3t.io/press/)
- [Source](https://github.com/zi3t/volume-catalogue)
- Package: `@zi3t/volume-catalogue`

> This is an independent technical study. It is not affiliated with, sponsored
> by, or endorsed by Stripe. “Stripe” and “Stripe Press” are used only to
> identify the public experience that informed the study.

## Purpose

This repository is a reusable renderer and interaction demo, not a publishing
platform and not a mirror of Stripe Press content. It explores five mechanics:

- a persistent Three.js scene shared across catalogue and detail routes;
- one reusable book mesh with per-volume material profiles;
- pointer, touch, keyboard, focus, hold, and drag interaction;
- deep links, History API transitions, and return-to-shelf state; and
- semantic HTML that remains navigable when WebGL is unavailable.

The self-contained demo uses neutral package fixtures for materials, geometry,
interaction, routing, and host integration. It does not fetch or embed zi3t.io
projects, engineering notes, Stripe Press books, book covers, editorial copy,
logos, films, or podcasts.

## Current status

The package is public for inspection but remains `private` and `UNLICENSED`.
Source visibility is not permission to copy, redistribute, or publish a derived
package.

The current repository is **not yet cleared for a wider public release**. The
publication gate in [Rights, provenance, and release gate](#rights-provenance-and-release-gate)
must be resolved before publishing a package release or describing the project
as legally cleared.

## Quick start

```sh
npm install
npm run dev
```

Open `http://127.0.0.1:5173/press/`.

```sh
npm run typecheck
npm run build
npm run check
npm run build:site
```

- `build` creates the reusable browser package in `dist/`.
- `build:site` also copies the browser assets and generated `/press/` shell into
  a sibling `zi3t` checkout.
- Set `ZI3T_SITE_ROOT=/absolute/path/to/zi3t` when the repositories are not
  siblings.

## Host contract

The renderer enhances ordinary catalogue markup:

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
supplies rendering, materials, input handling, route state, and geometry while
retaining the anchors as fallback navigation and accessible interaction targets.

```ts
import {
  mountVolumeCatalogue,
  type CleanRoomVolumeProfile
} from "@zi3t/volume-catalogue";

const profiles: readonly CleanRoomVolumeProfile[] = [/* host visuals */];
mountVolumeCatalogue({ profiles });
```

`demoVolumes` and `demoVolumeProfiles` are package fixtures. A consumer can
replace them without changing the renderer.

## Architecture

- `src/runtime/clean-room/` contains the renderer and interaction state.
- `src/content/volumes.ts` contains only demo route metadata.
- `src/runtime/clean-room/profiles.ts` contains demo visual profiles.
- `src/adapters/cloudflare-worker.ts` optionally serves one static shell for
  catalogue deep links without reading host pages.
- `index.html` is the semantic, no-WebGL-capable demo shell.
- `src/styles/` and `src/assets/` travel with the package build.

The zi3t site keeps a symlink to this sibling repository and commits the
generated shell and browser assets. Its Worker provides deep-link fallback and
route metadata only; site notes and project pages are not catalogue inputs.

## SEO and naming

The source-identifying name remains **ZI3T Volume Catalogue** and the package
name remains `@zi3t/volume-catalogue`. “Stripe Press–inspired” appears only in
descriptive copy so readers can understand the reference accurately.

Do not rename the package, repository, domain, or social account to include
“Stripe” or “Stripe Press”; do not use Stripe logos; do not present the Stripe
reference more prominently than the ZI3T project name; and do not imply an
official relationship. These boundaries follow
[Stripe's Mark Usage Terms](https://stripe.com/legal/marks).

## Reference credit and non-affiliation

[Stripe Press](https://press.stripe.com/) is a Stripe publishing project. Its
current site footer states `© 2026 Stripe, LLC`.

Public creator credits consulted for this project:

- [Yuin Chien](https://yuinchien.com/p/stripe-press) says he led the 2021 3D web
  design in collaboration with Nick Jones and Philipp Antoni.
- [Nick Jones](https://www.narrowdesign.com/) describes bringing the Stripe
  Press books to life in 3D and lists Yuin Chien, Devin Jacoviello, Philipp
  Antoni, Kate Lee, Tamara Winter, and Patrick Collison as collaborators. He
  also credits the referenced Stripe Press book covers to Tyler Thompson.

Those are public self-credits, not an official or exhaustive production credit
list. Please open an issue if a verified credit is missing or inaccurate.

Stripe, Stripe Press, their marks, original site, books, cover designs, and
editorial material remain the property of their respective owners. Attribution
does not grant a licence and does not cure unauthorized copying.

## Rights, provenance, and release gate

Recorded project-owned or permitted material:

- neutral demo names, text, SVG fixtures, and colour palettes are ZI3T work;
- terminal images are project-specific generated assets documented in
  `src/assets/media/README.md`;
- Three.js is used under its MIT licence; and
- the historical Poly Haven and ambientCG surface scans were CC0, but those
  files were later removed and do **not** establish the provenance of the
  current replacement textures.

The following current shipping inputs lack sufficient source/licence records in
this repository and block a legal-clearance claim:

| Scope | Unresolved record |
| --- | --- |
| `src/assets/book.obj` | Original author/source and licence are not recorded. |
| `src/runtime/clean-room/book.vert.glsl` | Authorship or permitted source is not recorded. |
| `src/runtime/clean-room/book.frag.glsl` | Authorship or permitted source is not recorded. |
| `src/assets/textures/shared-*` | Source and licence for the current atlas-derived maps are not recorded. |
| Exact live-reference values in `motion.ts`, `foldout-poster.ts`, and `scene.ts` | A qualified review must distinguish uncopyrightable observations/interfaces from protected expression or copied implementation. |

Before a wider release, complete one of these paths for every unresolved item:

1. record verifiable original authorship and source history;
2. replace it with independently created material and preserve that provenance;
3. document a compatible third-party licence; or
4. obtain written permission from the relevant rights holder.

Then obtain a qualified trademark/copyright review for the intended countries
and use. Stripe directs mark-usage questions to `trademarks@stripe.com`.

Until that gate is complete, do not publish a package release, sell or
merchandise the work, claim Stripe approval, or label the implementation
“legally cleared.”
