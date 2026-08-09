import * as THREE from "three";

import bumpBuckramUrl from "../../assets/textures/shared-bump-buckram.jpg?url";
import bumpCardboardUrl from "../../assets/textures/shared-bump-cardboard.jpg?url";
import bumpNoneUrl from "../../assets/textures/shared-bump-none.jpg?url";
import bumpPaperUrl from "../../assets/textures/shared-bump-paper.jpg?url";
import diffuseOverlayUrl from "../../assets/textures/shared-diffuse-overlay.jpg?url";
import glitterUrl from "../../assets/textures/shared-glitter.png?url";
import type { CleanRoomBaseBump, CleanRoomVolumeProfile } from "./profiles";

export interface CleanRoomMetadata {
  readonly title: string;
  readonly eyebrow: string;
  readonly serial: string;
}

export interface CleanRoomSharedTextures {
  readonly diffuseOverlay: THREE.Texture;
  readonly bumps: Readonly<Record<CleanRoomBaseBump, THREE.Texture>>;
  readonly glitter: THREE.Texture;
}

export interface CleanRoomMaterialMaps {
  readonly baseDiffuse: THREE.Texture;
  readonly customDiffuse: THREE.CanvasTexture;
  readonly baseBump: THREE.Texture;
  readonly customBump: THREE.CanvasTexture;
  readonly foil: THREE.CanvasTexture;
  readonly gloss: THREE.CanvasTexture;
  readonly glitter: THREE.Texture;
  readonly dimensions: readonly [1920, 1600];
}

interface AtlasCanvases {
  readonly diffuse: HTMLCanvasElement;
  readonly customBump: HTMLCanvasElement;
  readonly foil: HTMLCanvasElement;
  readonly gloss: HTMLCanvasElement;
}

const ATLAS_WIDTH = 1920;
const ATLAS_HEIGHT = 1600;
// The authored page-edge island ends at atlas row 320. Stripe starts the
// wrapped-cover artwork on that exact boundary; starting it any earlier paints
// the lower part of the exposed page block as cloth.
const WRAP_TOP = 320;
const SPINE_LEFT = 874;
const SPINE_RIGHT = 1046;
const FRONT_LEFT = 1040;
const FOIL_TILE_WIDTH = Math.round(ATLAS_WIDTH * 0.14);
const FOIL_TILE_HEIGHT = Math.round(ATLAS_HEIGHT * 0.19);
// The authored OBJ packs its small sewn endband into this isolated swatch.
// Keep ink inside these bounds: neighboring white UV islands are the page
// block, so an oversized swatch prints across the visible fore edge.
const ENDBAND_LEFT = 421;
const ENDBAND_TOP = 197;
const ENDBAND_WIDTH = 195;
const ENDBAND_HEIGHT = 52;
const ENDBAND_STITCH_COUNT = 12;

const configureTexture = (
  texture: THREE.Texture,
  renderer: THREE.WebGLRenderer,
  name: string
): THREE.Texture => {
  texture.name = name;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  texture.colorSpace = THREE.NoColorSpace;
  texture.generateMipmaps = true;
  return texture;
};

const loadTexture = (
  loader: THREE.TextureLoader,
  renderer: THREE.WebGLRenderer,
  url: string,
  name: string,
  invalidate: () => void
): THREE.Texture => configureTexture(loader.load(url, invalidate), renderer, name);

export const createSharedTextures = (
  renderer: THREE.WebGLRenderer,
  invalidate: () => void
): CleanRoomSharedTextures => {
  const loader = new THREE.TextureLoader();
  return {
    diffuseOverlay: loadTexture(
      loader,
      renderer,
      diffuseOverlayUrl,
      "book-shared-diffuse-overlay",
      invalidate
    ),
    bumps: {
      none: loadTexture(loader, renderer, bumpNoneUrl, "book-shared-bump-none", invalidate),
      buckram: loadTexture(
        loader,
        renderer,
        bumpBuckramUrl,
        "book-shared-bump-buckram",
        invalidate
      ),
      paper: loadTexture(
        loader,
        renderer,
        bumpPaperUrl,
        "book-shared-bump-paper",
        invalidate
      ),
      cardboard: loadTexture(
        loader,
        renderer,
        bumpCardboardUrl,
        "book-shared-bump-cardboard",
        invalidate
      )
    },
    glitter: loadTexture(
      loader,
      renderer,
      glitterUrl,
      "book-shared-glitter",
      invalidate
    )
  };
};

const createCanvas = (): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  canvas.width = ATLAS_WIDTH;
  canvas.height = ATLAS_HEIGHT;
  return canvas;
};

const createAtlasCanvases = (): AtlasCanvases => ({
  diffuse: createCanvas(),
  customBump: createCanvas(),
  foil: createCanvas(),
  gloss: createCanvas()
});

const contextFor = (
  canvas: HTMLCanvasElement,
  label: string
): CanvasRenderingContext2D => {
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error(`2D canvas is unavailable for ${label}`);
  return context;
};

const reset = (
  context: CanvasRenderingContext2D,
  color: string
): void => {
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalAlpha = 1;
  context.globalCompositeOperation = "source-over";
  context.fillStyle = color;
  context.fillRect(0, 0, ATLAS_WIDTH, ATLAS_HEIGHT);
};

const paintFoilPalette = (
  context: CanvasRenderingContext2D,
  colors: readonly [string, string]
): void => {
  const gradient = context.createLinearGradient(0, 0, FOIL_TILE_WIDTH, FOIL_TILE_HEIGHT);
  gradient.addColorStop(0, colors[0]);
  gradient.addColorStop(0.35, colors[1]);
  gradient.addColorStop(0.7, colors[0]);
  gradient.addColorStop(1, colors[1]);
  context.fillStyle = gradient;
  context.fillRect(0, 0, FOIL_TILE_WIDTH, FOIL_TILE_HEIGHT);
};

const paintEndband = (
  context: CanvasRenderingContext2D,
  color: string
): void => {
  const pitch = ENDBAND_WIDTH / ENDBAND_STITCH_COUNT;
  context.save();
  context.fillStyle = color;
  for (let index = 0; index < ENDBAND_STITCH_COUNT; index += 1) {
    const x = ENDBAND_LEFT + index * pitch;
    const top = ENDBAND_TOP + (index % 3 === 1 ? 1 : 0);
    const bottom = ENDBAND_TOP + ENDBAND_HEIGHT - (index % 4 === 2 ? 1 : 0);
    context.beginPath();
    context.moveTo(x + 2, top);
    context.lineTo(x + pitch * 0.72, top + 2);
    context.lineTo(x + pitch * 0.58, top + ENDBAND_HEIGHT * 0.36);
    context.lineTo(x + pitch * 0.76, top + ENDBAND_HEIGHT * 0.58);
    context.lineTo(x + pitch * 0.55, bottom);
    context.lineTo(x, bottom - 2);
    context.lineTo(x + pitch * 0.12, top + ENDBAND_HEIGHT * 0.62);
    context.lineTo(x - 1, top + ENDBAND_HEIGHT * 0.34);
    context.closePath();
    context.fill();
  }
  context.restore();
};

const wrapText = (
  context: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  startY: number,
  maxWidth: number,
  lineHeight: number
): void => {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  });
  if (line) lines.push(line);
  lines.forEach((value, index) => {
    context.fillText(value, centerX, startY + index * lineHeight, maxWidth);
  });
};

const paintFrontTypography = (
  context: CanvasRenderingContext2D,
  metadata: CleanRoomMetadata,
  color: string
): void => {
  const left = FRONT_LEFT + 72;
  context.fillStyle = color;
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.font = '700 23px ui-monospace, SFMono-Regular, Menlo, monospace';
  context.globalAlpha = 0.7;
  context.fillText(metadata.eyebrow.toUpperCase(), left, WRAP_TOP + 92, 700);
  context.font = '600 52px "Iowan Old Style", Baskerville, Georgia, serif';
  context.globalAlpha = 1;
  context.fillText(metadata.title, left, WRAP_TOP + 160, 720);
};

const paintBackTypography = (
  context: CanvasRenderingContext2D,
  profile: CleanRoomVolumeProfile
): void => {
  context.save();
  context.fillStyle = profile.ink;
  context.textAlign = "center";
  context.textBaseline = "alphabetic";
  context.globalAlpha = 0.92;
  context.font = 'italic 500 36px "Iowan Old Style", Baskerville, Georgia, serif';
  wrapText(context, profile.caption, 430, 760, 560, 46);
  context.font = '700 18px ui-monospace, SFMono-Regular, Menlo, monospace';
  context.globalAlpha = 0.72;
  context.fillText(`ZI3T / ${profile.slug.toUpperCase()}`, 430, 1470);
  context.restore();
};

const paintSpineTypography = (
  context: CanvasRenderingContext2D,
  profile: CleanRoomVolumeProfile,
  metadata: CleanRoomMetadata,
  color: string
): void => {
  const centerX = (SPINE_LEFT + SPINE_RIGHT) * 0.5;
  const centerY = (WRAP_TOP + ATLAS_HEIGHT) * 0.5;
  context.save();
  context.translate(centerX, centerY);
  context.rotate(Math.PI / 2);
  const length = ATLAS_HEIGHT - WRAP_TOP;
  context.fillStyle = color;
  context.textBaseline = "middle";
  context.font = '700 22px ui-monospace, SFMono-Regular, Menlo, monospace';
  context.textAlign = "left";
  context.globalAlpha = 0.72;
  context.fillText(metadata.eyebrow.toUpperCase(), -length * 0.44, 0, length * 0.22);
  context.font = '600 49px "Iowan Old Style", Baskerville, Georgia, serif';
  context.textAlign = "center";
  context.globalAlpha = 1;
  context.fillText(metadata.title, profile.spineNote ? -70 : 0, 0, length * 0.45);
  if (profile.spineNote) {
    context.font = 'italic 600 26px "Iowan Old Style", Baskerville, Georgia, serif';
    context.globalAlpha = 0.82;
    context.fillText(profile.spineNote, length * 0.3, 0, length * 0.18);
  }
  context.textAlign = "right";
  context.font = '700 19px ui-monospace, SFMono-Regular, Menlo, monospace';
  context.globalAlpha = 0.72;
  context.fillText(metadata.serial, length * 0.45, 0);
  context.restore();
};

const paintArtwork = (
  context: CanvasRenderingContext2D,
  artwork: HTMLImageElement
): void => {
  context.drawImage(
    artwork,
    FRONT_LEFT,
    WRAP_TOP,
    ATLAS_WIDTH - FRONT_LEFT,
    ATLAS_HEIGHT - WRAP_TOP
  );
};

const createArtworkMask = (
  artwork: HTMLImageElement,
  color = "#ffffff"
): HTMLCanvasElement => {
  const canvas = createCanvas();
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas is unavailable for the artwork mask");
  paintArtwork(context, artwork);
  context.globalCompositeOperation = "source-in";
  context.fillStyle = color;
  context.fillRect(0, 0, ATLAS_WIDTH, ATLAS_HEIGHT);
  return canvas;
};

const paintAtlas = (
  canvases: AtlasCanvases,
  profile: CleanRoomVolumeProfile,
  metadata: CleanRoomMetadata,
  artwork: HTMLImageElement | null
): void => {
  const diffuse = contextFor(canvases.diffuse, "the unified diffuse atlas");
  reset(diffuse, profile.paper);
  diffuse.fillStyle = profile.cloth;
  diffuse.fillRect(0, WRAP_TOP, ATLAS_WIDTH, ATLAS_HEIGHT - WRAP_TOP);
  paintFoilPalette(diffuse, profile.material.foil.colors);
  paintEndband(diffuse, profile.headband[0]);
  if (artwork) paintArtwork(diffuse, artwork);
  paintBackTypography(diffuse, profile);
  paintFrontTypography(diffuse, metadata, profile.ink);
  paintSpineTypography(diffuse, profile, metadata, profile.ink);

  const bump = contextFor(canvases.customBump, "the unified custom-bump atlas");
  const foil = contextFor(canvases.foil, "the unified foil atlas");
  const gloss = contextFor(canvases.gloss, "the unified gloss atlas");
  reset(bump, "#808080");
  reset(foil, "#000000");
  reset(gloss, "#000000");

  if (artwork) {
    const bumpInk = profile.material.bump.custom < 0 ? "#000000" : "#ffffff";
    const bumpMask = createArtworkMask(artwork, bumpInk);
    const foilMask = createArtworkMask(artwork);
    bump.save();
    bump.globalAlpha = 0.9;
    bump.drawImage(bumpMask, 0, 0);
    bump.restore();
    foil.save();
    foil.globalAlpha = 0.92;
    foil.drawImage(foilMask, 0, 0);
    foil.restore();
  }

  const bumpInk = profile.material.bump.custom < 0 ? "#000000" : "#ffffff";
  paintFrontTypography(bump, metadata, bumpInk);
  paintSpineTypography(bump, profile, metadata, bumpInk);
  paintFrontTypography(foil, metadata, "#ffffff");
  paintSpineTypography(foil, profile, metadata, "#ffffff");
};

const makeCanvasTexture = (
  renderer: THREE.WebGLRenderer,
  canvas: HTMLCanvasElement,
  name: string
): THREE.CanvasTexture => {
  const texture = new THREE.CanvasTexture(canvas);
  configureTexture(texture, renderer, name);
  texture.needsUpdate = true;
  return texture;
};

const invalidateMaps = (maps: CleanRoomMaterialMaps): void => {
  maps.customDiffuse.needsUpdate = true;
  maps.customBump.needsUpdate = true;
  maps.foil.needsUpdate = true;
  maps.gloss.needsUpdate = true;
};

export const createSurfaceTextures = (
  renderer: THREE.WebGLRenderer,
  profile: CleanRoomVolumeProfile,
  metadata: CleanRoomMetadata,
  shared: CleanRoomSharedTextures,
  invalidate: () => void
): CleanRoomMaterialMaps => {
  const canvases = createAtlasCanvases();
  paintAtlas(canvases, profile, metadata, null);

  const maps: CleanRoomMaterialMaps = {
    baseDiffuse: shared.diffuseOverlay,
    customDiffuse: makeCanvasTexture(
      renderer,
      canvases.diffuse,
      `book-${profile.slug}-custom-diffuse`
    ),
    baseBump: shared.bumps[profile.material.baseBump],
    customBump: makeCanvasTexture(
      renderer,
      canvases.customBump,
      `book-${profile.slug}-custom-bump`
    ),
    foil: makeCanvasTexture(renderer, canvases.foil, `book-${profile.slug}-foil`),
    gloss: makeCanvasTexture(renderer, canvases.gloss, `book-${profile.slug}-gloss`),
    glitter: shared.glitter,
    dimensions: [ATLAS_WIDTH, ATLAS_HEIGHT]
  };

  const artwork = new Image();
  artwork.decoding = "async";
  artwork.addEventListener("load", () => {
    paintAtlas(canvases, profile, metadata, artwork);
    invalidateMaps(maps);
    invalidate();
  }, { once: true });
  artwork.src = profile.artworkUrl;

  return maps;
};
