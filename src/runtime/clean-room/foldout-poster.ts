import * as THREE from "three";

import posterArtwork from "../../assets/media/shutdown-sequence-poster.webp?url";
import { clamp, mix, smooth } from "./motion";

export interface CleanRoomFoldoutPosterSnapshot {
  readonly ready: boolean;
  readonly progress: number;
  readonly targetProgress: number;
  readonly panelCount: 4;
}

export interface CleanRoomFoldoutPosterController {
  readonly setProgress: (progress: number) => void;
  readonly snapshot: () => CleanRoomFoldoutPosterSnapshot;
}

const BAND_COUNT = 4;
const POSTER_WIDTH = 20;
const POSTER_HEIGHT = POSTER_WIDTH * 4 / 3;

/**
 * The terminal object is one continuous paper mesh. Its vertices form a
 * shallow horizontal zig-zag, so the print, silhouette, and light all remain
 * continuous while the sheet opens along three physical crease lines.
 */
export const mountCleanRoomFoldoutPoster = (): CleanRoomFoldoutPosterController => {
  const host = document.querySelector<HTMLElement>(".press-film-poster");
  if (!host) {
    return {
      setProgress: () => undefined,
      snapshot: () => ({ ready: false, progress: 0, targetProgress: 0, panelCount: 4 })
    };
  }

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  } catch {
    return {
      setProgress: () => undefined,
      snapshot: () => ({ ready: false, progress: 0, targetProgress: 0, panelCount: 4 })
    };
  }

  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = "press-foldout-canvas";
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 120);
  camera.position.set(0, 0, 51);

  scene.add(new THREE.HemisphereLight(0xf7eed7, 0x080b12, 1.72));
  const rake = new THREE.DirectionalLight(0xfff0ce, 3.15);
  rake.position.set(-16, 20, 24);
  scene.add(rake);
  const edge = new THREE.DirectionalLight(0x79adbd, 0.64);
  edge.position.set(17, -14, 18);
  scene.add(edge);

  const root = new THREE.Group();
  scene.add(root);

  let ready = false;
  let progress = 0;
  let targetProgress = 0;
  let frame = 0;
  let previousTime = performance.now();

  const texture = new THREE.TextureLoader().load(posterArtwork, () => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    ready = true;
    host.classList.add("is-foldout-ready");
    schedule();
  });
  texture.colorSpace = THREE.SRGBColorSpace;

  const geometry = new THREE.PlaneGeometry(
    POSTER_WIDTH,
    POSTER_HEIGHT,
    32,
    BAND_COUNT * 16
  );
  const positions = geometry.getAttribute("position") as THREE.BufferAttribute;
  const basePositions = new Float32Array(positions.array as ArrayLike<number>);
  const paper = new THREE.MeshStandardMaterial({
    map: texture,
    color: 0xffffff,
    roughness: 0.9,
    metalness: 0,
    side: THREE.DoubleSide
  });
  const sheet = new THREE.Mesh(geometry, paper);
  root.add(sheet);

  const applyFold = (value: number): void => {
    const opened = smooth(clamp(value, 0, 1));
    const foldDepth = mix(2.85, 0.58, opened);
    const verticalScale = mix(0.68, 0.94, opened);
    const edgeCurl = mix(0.42, 0.12, opened);

    for (let index = 0; index < positions.count; index += 1) {
      const offset = index * 3;
      const baseX = basePositions[offset] ?? 0;
      const baseY = basePositions[offset + 1] ?? 0;
      const vertical = clamp(baseY / POSTER_HEIGHT + 0.5, 0, 1);
      const bandPosition = Math.min(BAND_COUNT - 0.00001, vertical * BAND_COUNT);
      const band = Math.floor(bandPosition);
      const local = bandPosition - band;
      const startDepth = band % 2 === 0 ? -foldDepth : foldDepth;
      const endDepth = -startDepth;
      const planarDepth = mix(startDepth, endDepth, local);
      const xNormal = baseX / (POSTER_WIDTH * 0.5);
      const softBow = Math.sin(local * Math.PI)
        * Math.cos(xNormal * Math.PI * 0.5)
        * foldDepth
        * 0.08;
      const curledEdge = Math.pow(Math.abs(xNormal), 7)
        * edgeCurl
        * (band % 2 === 0 ? -1 : 1);

      positions.setXYZ(
        index,
        baseX * (1 - Math.pow(Math.abs(xNormal), 8) * 0.012),
        baseY * verticalScale,
        planarDepth + softBow + curledEdge
      );
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();

    root.rotation.set(
      mix(-0.055, -0.018, opened),
      mix(0.065, 0.022, opened),
      mix(-0.012, -0.004, opened)
    );
    root.position.y = mix(-0.24, 0, opened);
  };

  const resize = (): void => {
    const bounds = host.getBoundingClientRect();
    const width = Math.max(1, Math.round(bounds.width));
    const height = Math.max(1, Math.round(bounds.height));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    schedule();
  };

  const render = (now: number): void => {
    frame = 0;
    const delta = Math.min(0.05, Math.max(1 / 240, (now - previousTime) / 1000));
    previousTime = now;
    const approach = 1 - Math.exp(-9 * delta);
    progress += (targetProgress - progress) * approach;
    if (Math.abs(targetProgress - progress) < 0.0005) progress = targetProgress;
    applyFold(progress);
    renderer.render(scene, camera);
    if (Math.abs(targetProgress - progress) >= 0.0005) schedule();
  };

  function schedule(): void {
    if (!frame) frame = window.requestAnimationFrame(render);
  }

  const observer = new ResizeObserver(resize);
  observer.observe(host);
  applyFold(0);
  resize();

  return {
    setProgress: (value) => {
      targetProgress = clamp(value, 0, 1);
      schedule();
    },
    snapshot: () => ({
      ready,
      progress: Number(progress.toFixed(4)),
      targetProgress: Number(targetProgress.toFixed(4)),
      panelCount: 4
    })
  };
};
