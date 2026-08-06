import * as THREE from "three";

import { createCleanRoomBook, type CleanRoomBook } from "./geometry";
import { createCleanRoomLightRig } from "./lighting";
import { cleanRoomProfiles, type CleanRoomVolumeProfile } from "./profiles";
import {
  createSharedTextures,
  createSurfaceTextures,
  type CleanRoomMetadata
} from "./textures";

declare global {
  interface Window {
    __pressDebugEnabled?: boolean;
    __pressCleanRoomDebug?: () => CleanRoomDebugSnapshot;
  }
}

interface CleanRoomEntry {
  readonly profile: CleanRoomVolumeProfile;
  readonly target: HTMLElement;
  readonly book: CleanRoomBook;
}

interface CleanRoomDebugSnapshot {
  readonly renderer: "clean-room";
  readonly books: readonly {
    readonly slug: string;
    readonly position: readonly [number, number, number];
    readonly scale: number;
  }[];
  readonly render: {
    readonly calls: number;
    readonly triangles: number;
  };
}

const getMetadata = (item: HTMLElement, index: number): CleanRoomMetadata => ({
  title: item.querySelector("strong")?.textContent?.trim() ?? "",
  eyebrow: item.querySelector("small")?.textContent?.trim() ?? "",
  serial: item.querySelector("b")?.textContent?.trim()
    ?? String(index + 1).padStart(2, "0")
});

const pointOnDepthPlane = (
  camera: THREE.PerspectiveCamera,
  viewportWidth: number,
  viewportHeight: number,
  screenX: number,
  screenY: number,
  depth: number
): THREE.Vector3 => {
  const point = new THREE.Vector3(
    screenX / viewportWidth * 2 - 1,
    -(screenY / viewportHeight) * 2 + 1,
    0.5
  ).unproject(camera);
  const direction = point.sub(camera.position).normalize();
  const distance = (depth - camera.position.z) / direction.z;
  return camera.position.clone().add(direction.multiplyScalar(distance));
};

const worldUnitsPerPixel = (
  camera: THREE.PerspectiveCamera,
  viewportHeight: number,
  depth: number
): number => {
  const distance = camera.position.z - depth;
  return 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5))
    * distance
    / viewportHeight;
};

export const mountCleanRoomCatalogue = (): boolean => {
  const stage = document.querySelector<HTMLElement>(".press-catalog");
  const items = Array.from(document.querySelectorAll<HTMLElement>(".press-volume-item"));
  if (!stage || items.length !== cleanRoomProfiles.length) return false;

  THREE.ColorManagement.enabled = false;

  const compact = window.matchMedia("(max-width: 899px)");
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer: !compact.matches
    });
  } catch (error) {
    console.warn("Clean-room Press renderer unavailable; retaining the DOM catalogue.", error);
    return false;
  }

  renderer.setClearColor(0x201819, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.domElement.className = "press-scene-canvas press-scene-canvas--clean-room";
  renderer.domElement.setAttribute("aria-hidden", "true");
  stage.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(12, 1, 1, 650);
  camera.position.set(0, 6.5, 100);
  camera.rotation.x = -0.06;
  const lights = createCleanRoomLightRig(scene);

  let layoutFrame = 0;
  const render = (): void => {
    renderer.render(scene, camera);
  };
  const shared = createSharedTextures(renderer, render);

  const entries = items.map((item, index): CleanRoomEntry => {
    const profile = cleanRoomProfiles[index];
    if (!profile) throw new Error(`Missing clean-room profile ${index}`);
    const link = item.querySelector<HTMLElement>(".press-volume");
    const target = link?.querySelector<HTMLElement>(".press-volume-book") ?? link;
    if (!target) throw new Error(`Missing clean-room layout target ${index}`);
    const metadata = getMetadata(item, index);
    const surfaces = createSurfaceTextures(renderer, profile, metadata, render);
    const book = createCleanRoomBook(profile, surfaces, shared);
    scene.add(book.root);
    return { profile, target, book };
  });

  const layout = (): void => {
    layoutFrame = 0;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    renderer.setSize(viewportWidth, viewportHeight, false);
    camera.aspect = viewportWidth / viewportHeight;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    lights.updateCameraY(camera.position.y);

    entries.forEach((entry, index) => {
      const rect = entry.target.getBoundingClientRect();
      const depth = -3 - index * 0.012;
      const center = pointOnDepthPlane(
        camera,
        viewportWidth,
        viewportHeight,
        rect.left + rect.width * 0.5,
        rect.top + rect.height * 0.5,
        depth
      );
      const scale = rect.width
        * worldUnitsPerPixel(camera, viewportHeight, depth)
        * (compact.matches ? 0.985 : 1);
      entry.book.root.position.copy(center);
      entry.book.root.position.z = depth;
      entry.book.root.scale.setScalar(scale);
    });

    render();
  };

  const scheduleLayout = (): void => {
    if (layoutFrame) return;
    layoutFrame = window.requestAnimationFrame(layout);
  };
  window.addEventListener("resize", scheduleLayout, { passive: true });
  compact.addEventListener("change", scheduleLayout);

  layout();
  document.documentElement.dataset.pressRenderer = "clean-room";
  document.documentElement.classList.add("press-scene-ready", "press-entry-complete");

  if (window.__pressDebugEnabled) {
    window.__pressCleanRoomDebug = () => ({
      renderer: "clean-room",
      books: entries.map(({ profile, book }) => ({
        slug: profile.slug,
        position: [
          Number(book.root.position.x.toFixed(4)),
          Number(book.root.position.y.toFixed(4)),
          Number(book.root.position.z.toFixed(4))
        ],
        scale: Number(book.root.scale.x.toFixed(4))
      })),
      render: {
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles
      }
    });
  }

  return true;
};
