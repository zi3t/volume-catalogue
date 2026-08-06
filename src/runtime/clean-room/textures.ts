import * as THREE from "three";

import clothColourUrl from "../../assets/textures/polyhaven-book-pattern-colour-1k.jpg?url";
import clothHeightUrl from "../../assets/textures/polyhaven-book-pattern-height-1k.jpg?url";
import paperColourUrl from "../../assets/textures/Paper001_1K-JPG_Color.jpg?url";
import type { CleanRoomVolumeProfile } from "./profiles";

export interface CleanRoomMetadata {
  readonly title: string;
  readonly eyebrow: string;
  readonly serial: string;
}

export interface CleanRoomSharedTextures {
  readonly clothDiffuse: THREE.Texture;
  readonly clothBump: THREE.Texture;
  readonly glitter: THREE.DataTexture;
  readonly paper: THREE.Texture;
}

export interface CleanRoomMaterialMaps {
  readonly baseDiffuse: THREE.Texture;
  readonly customDiffuse: THREE.CanvasTexture;
  readonly baseBump: THREE.Texture;
  readonly customBump: THREE.CanvasTexture;
  readonly foil: THREE.CanvasTexture;
  readonly gloss: THREE.CanvasTexture;
  readonly glitter: THREE.DataTexture;
  readonly dimensions: {
    readonly diffuse: readonly [number, number];
    readonly masks: readonly [number, number];
  };
}

export interface CleanRoomSurfaceTextures {
  readonly cover: CleanRoomMaterialMaps;
  readonly spine: CleanRoomMaterialMaps;
}

interface SurfaceCanvases {
  readonly diffuse: HTMLCanvasElement;
  readonly customBump: HTMLCanvasElement;
  readonly foil: HTMLCanvasElement;
  readonly gloss: HTMLCanvasElement;
}

const COVER_DIFFUSE_SIZE = [1600, 1280] as const;
const COVER_MASK_SIZE = [800, 640] as const;
const SPINE_DIFFUSE_SIZE = [1536, 240] as const;
const SPINE_MASK_SIZE = [768, 120] as const;

const createRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
};

const paintCloth = (
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  color: string,
  seed: number
): void => {
  context.fillStyle = color;
  context.fillRect(0, 0, width, height);

  const random = createRandom(seed);
  context.save();
  context.globalCompositeOperation = "soft-light";
  for (let y = 0; y < height; y += 4 + random() * 2.2) {
    context.globalAlpha = 0.045 + random() * 0.035;
    context.strokeStyle = random() > 0.5 ? "#ffffff" : "#000000";
    context.lineWidth = 0.45;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y + (random() - 0.5) * 1.6);
    context.stroke();
  }
  for (let x = 0; x < width; x += 4 + random() * 2.5) {
    context.globalAlpha = 0.035 + random() * 0.03;
    context.strokeStyle = random() > 0.5 ? "#ffffff" : "#000000";
    context.lineWidth = 0.4;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x + (random() - 0.5) * 1.6, height);
    context.stroke();
  }
  context.restore();
};

const configureTexture = (
  texture: THREE.Texture,
  renderer: THREE.WebGLRenderer,
  repeatX = 1,
  repeatY = 1
): void => {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  texture.colorSpace = THREE.NoColorSpace;
};

const createGlitterTexture = (renderer: THREE.WebGLRenderer): THREE.DataTexture => {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  const random = createRandom(0x5eedf11e);
  for (let index = 0; index < size * size; index += 1) {
    const roll = random();
    const value = roll > 0.987 ? 255 : roll > 0.975 ? 92 : 0;
    const offset = index * 4;
    data[offset] = value;
    data[offset + 1] = value;
    data[offset + 2] = value;
    data[offset + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.name = "clean-room-glitter";
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  configureTexture(texture, renderer);
  return texture;
};

export const createSharedTextures = (
  renderer: THREE.WebGLRenderer,
  invalidate: () => void
): CleanRoomSharedTextures => {
  const loader = new THREE.TextureLoader();
  const clothDiffuse = loader.load(clothColourUrl, invalidate);
  clothDiffuse.name = "clean-room-base-diffuse";
  configureTexture(clothDiffuse, renderer);

  const clothBump = loader.load(clothHeightUrl, invalidate);
  clothBump.name = "clean-room-base-bump";
  configureTexture(clothBump, renderer);

  const paper = loader.load(paperColourUrl, invalidate);
  paper.name = "clean-room-paper";
  configureTexture(paper, renderer, 2.4, 2.4);

  return {
    clothDiffuse,
    clothBump,
    glitter: createGlitterTexture(renderer),
    paper
  };
};

const createCanvas = (width: number, height: number): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

const getContext = (
  canvas: HTMLCanvasElement,
  label: string
): CanvasRenderingContext2D => {
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error(`2D canvas is unavailable for ${label}`);
  return context;
};

const resetCanvas = (
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  color: string
): void => {
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalAlpha = 1;
  context.globalCompositeOperation = "source-over";
  context.fillStyle = color;
  context.fillRect(0, 0, canvas.width, canvas.height);
};

const withCoverSpace = (
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  paint: (width: number, height: number, scale: number) => void
): void => {
  context.save();
  context.translate(0, canvas.height);
  context.rotate(-Math.PI / 2);
  const width = canvas.height;
  const height = canvas.width;
  paint(width, height, width / 800);
  context.restore();
};

const paintCoverTypography = (
  context: CanvasRenderingContext2D,
  metadata: CleanRoomMetadata,
  color: string,
  opacity = 1
): void => {
  const scale = context.canvas.height / 800;
  const width = context.canvas.height;
  context.fillStyle = color;
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.globalAlpha = opacity;
  context.font = `600 ${31 * scale}px "Iowan Old Style", Baskerville, Georgia, serif`;
  context.fillText(metadata.title, 82 * scale, 142 * scale, width - 164 * scale);
  context.font = `600 ${15 * scale}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  context.globalAlpha = opacity * 0.66;
  context.fillText(metadata.eyebrow.toUpperCase(), 84 * scale, 93 * scale, width - 168 * scale);
  context.globalAlpha = 1;
};

const createArtworkSilhouette = (
  canvas: HTMLCanvasElement,
  artwork: HTMLImageElement
): HTMLCanvasElement => {
  const layer = createCanvas(canvas.width, canvas.height);
  const context = layer.getContext("2d");
  if (!context) throw new Error("2D canvas is unavailable for the artwork mask");
  withCoverSpace(context, layer, (width, height) => {
    context.drawImage(artwork, 0, 0, width, height);
    context.globalCompositeOperation = "source-in";
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
  });
  return layer;
};

const paintCover = (
  canvases: SurfaceCanvases,
  profile: CleanRoomVolumeProfile,
  metadata: CleanRoomMetadata,
  artwork: HTMLImageElement | null
): void => {
  const diffuse = getContext(canvases.diffuse, "the cover diffuse texture");
  resetCanvas(diffuse, canvases.diffuse, profile.cloth);
  withCoverSpace(diffuse, canvases.diffuse, (width, height) => {
    paintCloth(diffuse, width, height, profile.cloth, metadata.serial.charCodeAt(0) * 97);
    if (artwork) diffuse.drawImage(artwork, 0, 0, width, height);
    paintCoverTypography(diffuse, metadata, profile.ink);
  });

  const bump = getContext(canvases.customBump, "the cover custom-bump mask");
  const foil = getContext(canvases.foil, "the cover foil mask");
  const gloss = getContext(canvases.gloss, "the cover gloss mask");
  resetCanvas(bump, canvases.customBump, "#000000");
  resetCanvas(foil, canvases.foil, "#000000");
  resetCanvas(gloss, canvases.gloss, "#000000");

  if (artwork) {
    for (const [context, canvas, opacity] of [
      [bump, canvases.customBump, 0.78],
      [foil, canvases.foil, 0.46],
      [gloss, canvases.gloss, 0.62]
    ] as const) {
      context.save();
      context.globalAlpha = opacity;
      context.drawImage(createArtworkSilhouette(canvas, artwork), 0, 0);
      context.restore();
    }
  }

  withCoverSpace(bump, canvases.customBump, () => {
    paintCoverTypography(bump, metadata, "#ffffff", 0.92);
  });
  withCoverSpace(foil, canvases.foil, () => {
    paintCoverTypography(foil, metadata, "#ffffff", 0.84);
  });
  withCoverSpace(gloss, canvases.gloss, (width, height) => {
    const field = gloss.createLinearGradient(0, 0, width, height);
    field.addColorStop(0, "#080808");
    field.addColorStop(0.42, "#303030");
    field.addColorStop(0.72, "#141414");
    field.addColorStop(1, "#000000");
    gloss.globalCompositeOperation = "screen";
    gloss.fillStyle = field;
    gloss.fillRect(0, 0, width, height);
  });
};

const paintSpineTypography = (
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  metadata: CleanRoomMetadata,
  color: string,
  opacity = 1
): void => {
  const scale = canvas.width / 1536;
  context.fillStyle = color;
  context.textBaseline = "middle";
  context.textAlign = "left";
  context.font = `700 ${22 * scale}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  context.globalAlpha = opacity * 0.7;
  context.fillText(metadata.eyebrow.toUpperCase(), 62 * scale, canvas.height / 2);
  context.globalAlpha = opacity;
  context.textAlign = "center";
  context.font = `500 ${47 * scale}px "Iowan Old Style", Baskerville, Georgia, serif`;
  context.fillText(metadata.title, canvas.width * 0.52, canvas.height / 2, canvas.width * 0.56);
  context.textAlign = "right";
  context.font = `700 ${23 * scale}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  context.globalAlpha = opacity * 0.72;
  context.fillText(metadata.serial, canvas.width - 64 * scale, canvas.height / 2);
  context.globalAlpha = 1;
};

const paintSpine = (
  canvases: SurfaceCanvases,
  profile: CleanRoomVolumeProfile,
  metadata: CleanRoomMetadata
): void => {
  const diffuse = getContext(canvases.diffuse, "the spine diffuse texture");
  resetCanvas(diffuse, canvases.diffuse, profile.cloth);
  paintCloth(
    diffuse,
    canvases.diffuse.width,
    canvases.diffuse.height,
    profile.cloth,
    metadata.serial.charCodeAt(0) * 131
  );
  paintSpineTypography(diffuse, canvases.diffuse, metadata, profile.ink);
  const edge = diffuse.createLinearGradient(0, 0, 0, canvases.diffuse.height);
  edge.addColorStop(0, "rgba(255,255,255,.16)");
  edge.addColorStop(0.12, "rgba(255,255,255,0)");
  edge.addColorStop(0.88, "rgba(0,0,0,0)");
  edge.addColorStop(1, "rgba(0,0,0,.18)");
  diffuse.fillStyle = edge;
  diffuse.fillRect(0, 0, canvases.diffuse.width, canvases.diffuse.height);

  const bump = getContext(canvases.customBump, "the spine custom-bump mask");
  const foil = getContext(canvases.foil, "the spine foil mask");
  const gloss = getContext(canvases.gloss, "the spine gloss mask");
  resetCanvas(bump, canvases.customBump, "#000000");
  resetCanvas(foil, canvases.foil, "#000000");
  resetCanvas(gloss, canvases.gloss, "#000000");
  paintSpineTypography(bump, canvases.customBump, metadata, "#ffffff", 0.9);
  paintSpineTypography(foil, canvases.foil, metadata, "#ffffff", 0.82);
  const glossField = gloss.createLinearGradient(0, 0, 0, canvases.gloss.height);
  glossField.addColorStop(0, "#060606");
  glossField.addColorStop(0.5, "#505050");
  glossField.addColorStop(1, "#040404");
  gloss.fillStyle = glossField;
  gloss.fillRect(0, 0, canvases.gloss.width, canvases.gloss.height);
};

const makeCanvasTexture = (
  canvas: HTMLCanvasElement,
  renderer: THREE.WebGLRenderer,
  name: string
): THREE.CanvasTexture => {
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = name;
  texture.colorSpace = THREE.NoColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  texture.generateMipmaps = true;
  return texture;
};

const createCanvases = (
  diffuseSize: readonly [number, number],
  maskSize: readonly [number, number]
): SurfaceCanvases => ({
  diffuse: createCanvas(...diffuseSize),
  customBump: createCanvas(...maskSize),
  foil: createCanvas(...maskSize),
  gloss: createCanvas(...maskSize)
});

const makeMaterialMaps = (
  renderer: THREE.WebGLRenderer,
  shared: CleanRoomSharedTextures,
  canvases: SurfaceCanvases,
  slug: string,
  surface: "cover" | "spine"
): CleanRoomMaterialMaps => ({
  baseDiffuse: shared.clothDiffuse,
  customDiffuse: makeCanvasTexture(
    canvases.diffuse,
    renderer,
    `clean-room-${slug}-${surface}-custom-diffuse`
  ),
  baseBump: shared.clothBump,
  customBump: makeCanvasTexture(
    canvases.customBump,
    renderer,
    `clean-room-${slug}-${surface}-custom-bump`
  ),
  foil: makeCanvasTexture(canvases.foil, renderer, `clean-room-${slug}-${surface}-foil`),
  gloss: makeCanvasTexture(canvases.gloss, renderer, `clean-room-${slug}-${surface}-gloss`),
  glitter: shared.glitter,
  dimensions: {
    diffuse: [canvases.diffuse.width, canvases.diffuse.height],
    masks: [canvases.foil.width, canvases.foil.height]
  }
});

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
): CleanRoomSurfaceTextures => {
  const coverCanvases = createCanvases(COVER_DIFFUSE_SIZE, COVER_MASK_SIZE);
  const spineCanvases = createCanvases(SPINE_DIFFUSE_SIZE, SPINE_MASK_SIZE);
  paintCover(coverCanvases, profile, metadata, null);
  paintSpine(spineCanvases, profile, metadata);

  const cover = makeMaterialMaps(renderer, shared, coverCanvases, profile.slug, "cover");
  const spine = makeMaterialMaps(renderer, shared, spineCanvases, profile.slug, "spine");

  const artwork = new Image();
  artwork.decoding = "async";
  artwork.addEventListener("load", () => {
    paintCover(coverCanvases, profile, metadata, artwork);
    invalidateMaps(cover);
    invalidate();
  }, { once: true });
  artwork.src = profile.artworkUrl;

  return { cover, spine };
};
