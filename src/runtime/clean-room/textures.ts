import * as THREE from "three";

import clothHeightUrl from "../../assets/textures/polyhaven-book-pattern-height-1k.jpg?url";
import paperColourUrl from "../../assets/textures/Paper001_1K-JPG_Color.jpg?url";
import type { CleanRoomVolumeProfile } from "./profiles";

export interface CleanRoomMetadata {
  readonly title: string;
  readonly eyebrow: string;
  readonly serial: string;
}

export interface CleanRoomSharedTextures {
  readonly clothBump: THREE.Texture;
  readonly paper: THREE.Texture;
}

export interface CleanRoomSurfaceTextures {
  readonly cover: THREE.CanvasTexture;
  readonly spine: THREE.CanvasTexture;
}

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
  repeatX: number,
  repeatY: number
): void => {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  texture.colorSpace = THREE.NoColorSpace;
};

export const createSharedTextures = (
  renderer: THREE.WebGLRenderer,
  invalidate: () => void
): CleanRoomSharedTextures => {
  const loader = new THREE.TextureLoader();
  const clothBump = loader.load(clothHeightUrl, invalidate);
  configureTexture(clothBump, renderer, 5.8, 2.4);

  const paper = loader.load(paperColourUrl, invalidate);
  configureTexture(paper, renderer, 2.4, 2.4);

  return { clothBump, paper };
};

const makeCanvasTexture = (
  canvas: HTMLCanvasElement,
  renderer: THREE.WebGLRenderer
): THREE.CanvasTexture => {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  texture.generateMipmaps = true;
  return texture;
};

const paintCover = (
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  profile: CleanRoomVolumeProfile,
  metadata: CleanRoomMetadata,
  artwork: HTMLImageElement | null
): void => {
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.translate(0, canvas.height);
  context.rotate(-Math.PI / 2);

  const width = canvas.height;
  const height = canvas.width;
  paintCloth(context, width, height, profile.cloth, metadata.serial.charCodeAt(0) * 97);
  if (artwork) context.drawImage(artwork, 0, 0, width, height);

  context.fillStyle = profile.ink;
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.font = '600 31px "Iowan Old Style", Baskerville, Georgia, serif';
  context.fillText(metadata.title, 82, 142, width - 164);
  context.font = "600 15px ui-monospace, SFMono-Regular, Menlo, monospace";
  context.globalAlpha = 0.66;
  context.fillText(metadata.eyebrow.toUpperCase(), 84, 93, width - 168);
  context.globalAlpha = 1;
};

const paintSpine = (
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  profile: CleanRoomVolumeProfile,
  metadata: CleanRoomMetadata
): void => {
  context.setTransform(1, 0, 0, 1, 0, 0);
  paintCloth(context, canvas.width, canvas.height, profile.cloth, metadata.serial.charCodeAt(0) * 131);
  context.fillStyle = profile.ink;
  context.textBaseline = "middle";
  context.font = "700 22px ui-monospace, SFMono-Regular, Menlo, monospace";
  context.globalAlpha = 0.7;
  context.fillText(metadata.eyebrow.toUpperCase(), 62, canvas.height / 2);
  context.globalAlpha = 1;
  context.textAlign = "center";
  context.font = '500 47px "Iowan Old Style", Baskerville, Georgia, serif';
  context.fillText(metadata.title, canvas.width * 0.52, canvas.height / 2, canvas.width * 0.56);
  context.textAlign = "right";
  context.font = "700 23px ui-monospace, SFMono-Regular, Menlo, monospace";
  context.globalAlpha = 0.72;
  context.fillText(metadata.serial, canvas.width - 64, canvas.height / 2);
  context.globalAlpha = 1;

  const edge = context.createLinearGradient(0, 0, 0, canvas.height);
  edge.addColorStop(0, "rgba(255,255,255,.16)");
  edge.addColorStop(0.12, "rgba(255,255,255,0)");
  edge.addColorStop(0.88, "rgba(0,0,0,0)");
  edge.addColorStop(1, "rgba(0,0,0,.18)");
  context.fillStyle = edge;
  context.fillRect(0, 0, canvas.width, canvas.height);
};

export const createSurfaceTextures = (
  renderer: THREE.WebGLRenderer,
  profile: CleanRoomVolumeProfile,
  metadata: CleanRoomMetadata,
  invalidate: () => void
): CleanRoomSurfaceTextures => {
  const coverCanvas = document.createElement("canvas");
  coverCanvas.width = 1000;
  coverCanvas.height = 800;
  const coverContext = coverCanvas.getContext("2d", { alpha: false });
  if (!coverContext) throw new Error("2D canvas is unavailable for the cover texture");
  paintCover(coverContext, coverCanvas, profile, metadata, null);
  const cover = makeCanvasTexture(coverCanvas, renderer);

  const spineCanvas = document.createElement("canvas");
  spineCanvas.width = 1536;
  spineCanvas.height = 240;
  const spineContext = spineCanvas.getContext("2d", { alpha: false });
  if (!spineContext) throw new Error("2D canvas is unavailable for the spine texture");
  paintSpine(spineContext, spineCanvas, profile, metadata);
  const spine = makeCanvasTexture(spineCanvas, renderer);

  const artwork = new Image();
  artwork.decoding = "async";
  artwork.addEventListener("load", () => {
    paintCover(coverContext, coverCanvas, profile, metadata, artwork);
    cover.needsUpdate = true;
    invalidate();
  }, { once: true });
  artwork.src = profile.artworkUrl;

  return { cover, spine };
};
