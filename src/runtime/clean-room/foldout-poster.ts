import * as THREE from "three";

import posterArtwork from "../../assets/media/shutdown-sequence-poster.webp?url";
import { clamp, mix } from "./motion";

export interface CleanRoomFoldoutPosterSnapshot {
  readonly ready: boolean;
  readonly deformation: number;
  readonly position: readonly [number, number, number];
  readonly targetY: number;
  readonly vertexCount: 10000;
  readonly resetGap: -33;
}

interface CleanRoomFoldoutPosterLayout {
  readonly targetY: number;
  readonly smallScreen: boolean;
}

interface CleanRoomFoldoutPosterFrame {
  readonly deformation: number;
  readonly terminalTravelWorld: number;
  readonly returnApproach: number | null;
  readonly visible: boolean;
}

interface CleanRoomFoldoutPosterOptions {
  readonly camera: THREE.PerspectiveCamera;
  readonly scene: THREE.Scene;
  readonly renderer: THREE.WebGLRenderer;
  readonly onWake: () => void;
}

export interface CleanRoomFoldoutPosterController {
  readonly setLayout: (layout: CleanRoomFoldoutPosterLayout | null) => void;
  readonly stageListReturn: () => void;
  readonly advance: (frame: CleanRoomFoldoutPosterFrame) => number;
  readonly snapshot: () => CleanRoomFoldoutPosterSnapshot;
}

// Current Stripe Press film-mesh constants, read from its live Canvas bundle.
const GRID_SIZE = 100;
const FILM_WIDTH = 22;
const FILM_HEIGHT = 30;
const FILM_RESET_GAP = -33;
const FILM_TILT_LIMIT = 0.3;
const MIN_DEFORMATION = 0.08;
const MAX_DEFORMATION = 1.4;

interface FilmDeltas {
  readonly positionY: Float64Array;
  readonly positionZ: Float64Array;
  readonly normalX: Float64Array;
  readonly normalY: Float64Array;
  readonly normalZ: Float64Array;
}

/**
 * Stripe recomputes these terms inside updateFilmPosters. They depend only on
 * the fixed 100x100 grid, so cache them once and retain the identical
 * deformation while keeping Safari's scroll path free of trigonometry.
 */
const createFilmDeltas = (): FilmDeltas => {
  const vertexCount = GRID_SIZE * GRID_SIZE;
  const positionY = new Float64Array(vertexCount);
  const positionZ = new Float64Array(vertexCount);
  const normalX = new Float64Array(vertexCount);
  const normalY = new Float64Array(vertexCount);
  const normalZ = new Float64Array(vertexCount);
  const foldPeriod = 20;
  const halfPeriod = foldPeriod / 2;
  const horizontalCrease = GRID_SIZE / 2;
  const verticalCrease = GRID_SIZE / 5;
  let foldParity = 1;
  let creaseParity = 1;
  let accumulatedY = 0;

  for (let row = 0; row < GRID_SIZE; row += 1) {
    const fold = Math.abs((row / 2) % foldPeriod - halfPeriod);
    accumulatedY += Math.cos(Math.atan(fold / row)) / 5;
    if (fold >= halfPeriod || fold <= 0) foldParity *= -1;

    for (let column = 0; column < GRID_SIZE; column += 1) {
      const horizontalBoundary = column % horizontalCrease === 0;
      const verticalBoundary = row % verticalCrease === 0;
      if (horizontalBoundary) creaseParity *= -1;
      const crease = horizontalBoundary || verticalBoundary
        ? 0.2 * creaseParity
        : 0;
      const ripple = (
        Math.sin(Math.abs((column / GRID_SIZE * 8) % 8) - 4)
        + Math.sin(
          Math.abs((row / GRID_SIZE * 16) % 16) - 8 - row / 1.5
        )
      ) * 0.07 * foldParity;
      const vertex = row * GRID_SIZE + column;
      const foldNormal = fold / halfPeriod * foldParity;

      positionY[vertex] = accumulatedY;
      positionZ[vertex] = fold + ripple * 4 + crease;
      normalX[vertex] = foldNormal + ripple + crease;
      normalY[vertex] = foldNormal * ripple + crease;
      normalZ[vertex] = foldNormal + ripple + crease;
    }
  }

  return { positionY, positionZ, normalX, normalY, normalZ };
};

/**
 * Build the film as a persistent product mesh in the catalogue scene. Stripe
 * uses PlaneGeometry(22, 30, 99, 99), a transparent double-sided basic
 * material, and the same transition-speed recurrence that returns its books.
 */
export const mountCleanRoomFoldoutPoster = (
  options: CleanRoomFoldoutPosterOptions
): CleanRoomFoldoutPosterController => {
  const host = document.querySelector<HTMLElement>(".press-film-poster");
  if (!host) {
    return {
      setLayout: () => undefined,
      stageListReturn: () => undefined,
      advance: () => 0,
      snapshot: () => ({
        ready: false,
        deformation: MAX_DEFORMATION,
        position: [0, -200, -200],
        targetY: -200,
        vertexCount: 10000,
        resetGap: FILM_RESET_GAP
      })
    };
  }

  let ready = false;
  let layoutReady = false;
  let deformation = Number.NaN;
  let targetY = -200;
  let smallScreen = false;
  let pointerX = 0;
  let pointerY = 0;

  const texture = new THREE.TextureLoader().load(posterArtwork, () => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = options.renderer.capabilities.getMaxAnisotropy();
    ready = true;
    host.classList.add("is-foldout-ready");
    options.renderer.initTexture(texture);
    const wasVisible = film.visible;
    film.visible = true;
    options.renderer.compile(options.scene, options.camera);
    film.visible = wasVisible;
    options.onWake();
  });
  texture.colorSpace = THREE.SRGBColorSpace;

  const geometry = new THREE.PlaneGeometry(
    FILM_WIDTH,
    FILM_HEIGHT,
    GRID_SIZE - 1,
    GRID_SIZE - 1
  );
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0
  });
  const film = new THREE.Mesh(geometry, material);
  film.name = "film-poster";
  film.position.set(0, -200, -200);
  film.visible = false;
  options.scene.add(film);

  const positions = geometry.getAttribute("position") as THREE.BufferAttribute;
  const normals = geometry.getAttribute("normal") as THREE.BufferAttribute;
  const initialPositions = new Float32Array(positions.array as ArrayLike<number>);
  const initialNormals = new Float32Array(normals.array as ArrayLike<number>);
  const deltas = createFilmDeltas();

  const applyDeformation = (value: number): void => {
    const next = clamp(value, MIN_DEFORMATION, MAX_DEFORMATION);
    if (Math.abs(next - deformation) < 0.00001) return;
    deformation = next;
    const positionArray = positions.array as Float32Array;
    const normalArray = normals.array as Float32Array;
    for (let vertex = 0; vertex < GRID_SIZE * GRID_SIZE; vertex += 1) {
      const offset = vertex * 3;
      positionArray[offset] = initialPositions[offset]!;
      positionArray[offset + 1] = initialPositions[offset + 1]!
        + deltas.positionY[vertex]! * deformation;
      positionArray[offset + 2] = initialPositions[offset + 2]!
        + deltas.positionZ[vertex]! * deformation;
      normalArray[offset] = initialNormals[offset]!
        + deltas.normalX[vertex]! * deformation;
      normalArray[offset + 1] = initialNormals[offset + 1]!
        + deltas.normalY[vertex]! * deformation;
      normalArray[offset + 2] = initialNormals[offset + 2]!
        + deltas.normalZ[vertex]! * deformation;
    }
    positions.needsUpdate = true;
    normals.needsUpdate = true;
  };

  const rotateWithPointer = (event: MouseEvent): void => {
    pointerX = event.pageX - window.innerWidth * 0.5;
    pointerY = event.pageY - window.scrollY - window.innerHeight * 0.5;
  };
  window.addEventListener("mousemove", rotateWithPointer, { passive: true });

  applyDeformation(MAX_DEFORMATION);

  return {
    setLayout: (layout) => {
      layoutReady = Boolean(layout);
      if (!layout) {
        film.visible = false;
        return;
      }
      const firstLayout = targetY === -200;
      targetY = layout.targetY;
      smallScreen = layout.smallScreen;
      if (firstLayout) film.position.y = targetY;
    },
    stageListReturn: () => {
      film.position.y = targetY + FILM_RESET_GAP;
    },
    advance: (frame) => {
      applyDeformation(frame.deformation);
      const nextY = targetY + frame.terminalTravelWorld;
      film.position.y = frame.returnApproach === null
        ? nextY
        : mix(film.position.y, nextY, frame.returnApproach);
      film.position.z = (smallScreen ? -60 : -18)
        - (1 - deformation) * 50;
      film.rotation.x = pointerY / Math.max(1, window.innerHeight) * FILM_TILT_LIMIT;
      film.rotation.y = pointerX / Math.max(1, window.innerWidth) * FILM_TILT_LIMIT;
      film.rotation.z = deformation / 25;
      film.visible = ready && layoutReady && frame.visible;
      material.opacity = film.visible ? 1 : 0;
      return frame.returnApproach === null ? 0 : Math.abs(film.position.y - nextY);
    },
    snapshot: () => ({
      ready,
      deformation: Number((Number.isFinite(deformation) ? deformation : 0).toFixed(4)),
      position: [
        Number(film.position.x.toFixed(4)),
        Number(film.position.y.toFixed(4)),
        Number(film.position.z.toFixed(4))
      ],
      targetY: Number(targetY.toFixed(4)),
      vertexCount: 10000,
      resetGap: FILM_RESET_GAP
    })
  };
};
