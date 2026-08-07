import * as THREE from "three";

import { installCleanRoomCatalogueScroll } from "./catalogue-scroll";
import { createCleanRoomBook, type CleanRoomBook } from "./geometry";
import {
  installCleanRoomInteraction,
  type CleanRoomHoldGesture,
  type CleanRoomInteractionSnapshot
} from "./interaction";
import { createCleanRoomLightRig } from "./lighting";
import {
  CLEAN_ROOM_MOTION,
  clamp,
  damp,
  frameApproach,
  heldOrbitAngle,
  mix,
  smooth,
  spring
} from "./motion";
import { cleanRoomProfiles, type CleanRoomVolumeProfile } from "./profiles";
import {
  installCleanRoomRouting,
  type CleanRoomPressMode
} from "./routing";
import {
  createSharedTextures,
  createSurfaceTextures,
  type CleanRoomMetadata
} from "./textures";
import { installCleanRoomVolumeInteraction } from "./volume-interaction";

declare global {
  interface Window {
    __pressDebugEnabled?: boolean;
    __pressCleanRoomDebug?: () => CleanRoomDebugSnapshot;
  }
}

interface CleanRoomEntry {
  readonly index: number;
  readonly profile: CleanRoomVolumeProfile;
  readonly item: HTMLElement;
  readonly link: HTMLElement;
  readonly target: HTMLElement;
  readonly book: CleanRoomBook;
  readonly homePosition: THREE.Vector3;
  readonly sectionPosition: THREE.Vector3;
  readonly figure: HTMLElement | null;
  homeScale: number;
  sectionScale: number;
  sectionTurnY: number;
  sectionVisible: boolean;
  sectionWeight: number;
  opacity: number;
  hover: number;
  hold: number;
  holdRotationX: number;
  holdRotationY: number;
  holdTargetRotationX: number;
  holdTargetRotationY: number;
  initialized: boolean;
}

interface CleanRoomFlight {
  readonly index: number;
  readonly direction: "to-volume" | "to-catalogue";
  speed: number;
  approach: number;
  progress: number;
}

interface CleanRoomDebugSnapshot {
  readonly renderer: "clean-room";
  readonly state: {
    readonly entryComplete: boolean;
    readonly hoverIndex: number;
    readonly focusIndex: number;
    readonly heldIndex: number;
    readonly dragging: boolean;
    readonly returningIndex: number;
    readonly isolation: number;
    readonly presentation: number;
    readonly backdrop: number;
    readonly mode: CleanRoomPressMode;
    readonly currentIndex: number;
    readonly flightIndex: number;
    readonly flightDirection: CleanRoomFlight["direction"] | null;
    readonly flightProgress: number;
    readonly pendingDeepLinkIndex: number;
    readonly coverRotation: readonly [number, number];
    readonly coverDragging: boolean;
    readonly coverTwirl: readonly [number, number];
  };
  readonly books: readonly {
    readonly slug: string;
    readonly position: readonly [number, number, number];
    readonly homePosition: readonly [number, number, number];
    readonly scale: number;
    readonly homeScale: number;
    readonly rotation: readonly [number, number, number];
    readonly opacity: number;
    readonly sectionPosition: readonly [number, number, number];
    readonly sectionScale: number;
    readonly sectionWeight: number;
    readonly sectionVisible: boolean;
    readonly screenBounds: {
      readonly left: number;
      readonly top: number;
      readonly width: number;
      readonly height: number;
    } | null;
    readonly material: {
      readonly architecture: "clean-room-shader-material";
      readonly coverMaps: 7;
      readonly spineMaps: 7;
      readonly coverDiffuseSize: readonly [number, number];
      readonly coverMaskSize: readonly [number, number];
      readonly textureFamily: CleanRoomVolumeProfile["material"]["texture"]["family"];
      readonly textureTransform: CleanRoomVolumeProfile["material"]["texture"]["cover"];
      readonly responseSignature: string;
    };
    readonly binding: {
      readonly spineSegments: number;
      readonly coverJointCount: 2;
      readonly spineHubCount: 0;
      readonly coverJointInset: number;
      readonly coverJointWidth: number;
      readonly coverJointDepth: number;
      readonly coverSkinOffset: number;
      readonly boardCornerRadius: number;
      readonly pageBlockInset: number;
      readonly spineEndCapCount: 2;
      readonly spineEndCapDepth: number;
      readonly headbandCount: 2;
    };
  }[];
  readonly render: {
    readonly calls: number;
    readonly triangles: number;
    readonly programs: number;
    readonly animationFrames: number;
    readonly presentedFrames: number;
    readonly idlePaused: boolean;
    readonly preserveDrawingBuffer: boolean;
  };
  readonly light: {
    readonly rakeTarget: readonly [number, number, number];
    readonly rakeIntensity: number;
    readonly backColor: string;
  };
  readonly scroll: {
    readonly y: number;
    readonly documentHeight: number;
    readonly currentScrollStep: number;
    readonly stackShift: number;
    readonly scrollVelocity: number;
    readonly terminalProgress: number;
    readonly terminalSceneOpacity: number;
    readonly mainHeight: number;
    readonly cameraY: number;
  };
}

const LEGACY_LIGHT_SCALE = Math.PI;
const BACK_LIGHT_REST = new THREE.Color(0x211815);

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

const setBookOpacity = (entry: CleanRoomEntry, opacity: number): void => {
  const next = clamp(opacity, 0, 1);
  entry.opacity = next;
  entry.book.root.visible = next > 0.001;
  entry.book.materials.forEach((material) => {
    material.opacity = next;
    if (material instanceof THREE.ShaderMaterial) {
      const opacityUniform = material.uniforms.opacity;
      if (opacityUniform) opacityUniform.value = next;
    }
  });
};

const screenCenterY = (
  entry: CleanRoomEntry,
  camera: THREE.PerspectiveCamera,
  viewportHeight: number
): number => {
  const projected = entry.book.root.position.clone().project(camera);
  return (1 - projected.y) * viewportHeight * 0.5;
};

const projectedBookBounds = (
  book: CleanRoomBook,
  camera: THREE.PerspectiveCamera,
  viewportWidth: number,
  viewportHeight: number
): { left: number; top: number; width: number; height: number } | null => {
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  book.root.updateWorldMatrix(true, true);
  book.root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const geometry = object.geometry as THREE.BufferGeometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const bounds = geometry.boundingBox;
    if (!bounds) return;
    for (const x of [bounds.min.x, bounds.max.x]) {
      for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) {
          const point = new THREE.Vector3(x, y, z)
            .applyMatrix4(object.matrixWorld)
            .project(camera);
          const screenX = (point.x + 1) * viewportWidth * 0.5;
          const screenY = (1 - point.y) * viewportHeight * 0.5;
          left = Math.min(left, screenX);
          top = Math.min(top, screenY);
          right = Math.max(right, screenX);
          bottom = Math.max(bottom, screenY);
        }
      }
    }
  });
  if (!Number.isFinite(left)) return null;
  return {
    left: Number(left.toFixed(2)),
    top: Number(top.toFixed(2)),
    width: Number((right - left).toFixed(2)),
    height: Number((bottom - top).toFixed(2))
  };
};

export const mountCleanRoomCatalogue = (): boolean => {
  const stage = document.querySelector<HTMLElement>(".press-catalog");
  const items = Array.from(document.querySelectorAll<HTMLElement>(".press-volume-item"));
  if (!stage || items.length !== cleanRoomProfiles.length) return false;
  const catalogueStage = stage;

  const links = items.map((item) => item.querySelector<HTMLAnchorElement>(".press-volume"));
  if (links.some((link) => !link)) return false;
  const ownedLinks = links as HTMLAnchorElement[];
  const volumeFigures = Array.from(
    document.querySelectorAll<HTMLElement>(".press-volume-figure")
  );

  THREE.ColorManagement.enabled = false;

  const compact = window.matchMedia("(max-width: 899px)");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const preserveDrawingBuffer = !compact.matches;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer
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
  catalogueStage.prepend(renderer.domElement);

  const holdCaption = document.createElement("aside");
  holdCaption.className = "press-hold-caption";
  holdCaption.setAttribute("aria-hidden", "true");
  catalogueStage.append(holdCaption);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(12, 1, 1, 650);
  camera.position.set(0, 6.5, 100);
  camera.rotation.x = -0.06;
  const lights = createCleanRoomLightRig(scene);

  let frameRequest = 0;
  let layoutFrame = 0;
  let entryStartedAt = 0;
  let entryComplete = reducedMotion.matches;
  let lastFrameAt = 0;
  let animationFrames = 0;
  let presentedFrames = 0;
  let lastEntryResidual = Number.POSITIVE_INFINITY;
  let renderUntil = performance.now() + 1800;
  let viewportWidth = window.innerWidth;
  let viewportHeight = window.innerHeight;
  let unitsPerPixel = 0.024;
  let returningIndex = -1;
  let releasedAt = 0;
  let releasedFromDrag = false;
  let holdIsolation = 0;
  let holdPresentation = 0;
  let holdBackdrop = 0;
  let holdClassTimer = 0;
  let pressMode: CleanRoomPressMode = cleanRoomProfiles.some(
    (profile) => window.location.pathname.endsWith(`/press/${profile.slug}/`)
  ) ? "volumes" : "catalogue";
  let currentRouteIndex = Math.max(0, cleanRoomProfiles.findIndex(
    (profile) => window.location.pathname.endsWith(`/press/${profile.slug}/`)
  ));
  let routeFrames = 0;
  let returningRouteIndex = -1;
  let flight: CleanRoomFlight | null = null;
  let requestRelayout = (): void => undefined;
  let resetVolumeInput = (): void => undefined;
  let interactionSnapshot: CleanRoomInteractionSnapshot = {
    hoverIndex: -1,
    focusIndex: -1,
    gesture: null
  };
  const backdropColor = new THREE.Color(0x201819);
  const backLightTarget = new THREE.Color(0x211815);

  const shelfPitch = (entry: CleanRoomEntry): number => (
    entry.profile.shelfPitch
      + (compact.matches
        ? CLEAN_ROOM_MOTION.compactShelfPitchOffset
        : CLEAN_ROOM_MOTION.desktopShelfPitchOffset)
  );
  const sectionObjectScaleX = (): number => (
    compact.matches
      ? CLEAN_ROOM_MOTION.sectionCompactObjectScaleX
      : CLEAN_ROOM_MOTION.sectionObjectScaleX
  );
  const objectThicknessScaleY = (): number => (
    compact.matches ? CLEAN_ROOM_MOTION.compactThicknessScale : 1
  );
  const catalogueRestLift = (): number => (
    compact.matches
      ? CLEAN_ROOM_MOTION.compactCatalogueRestLiftPixels
      : CLEAN_ROOM_MOTION.catalogueRestLiftPixels
  );

  const renderOnce = (): void => {
    renderer.render(scene, camera);
  };
  const shared = createSharedTextures(renderer, () => {
    renderUntil = Math.max(renderUntil, performance.now() + 300);
    if (!frameRequest) frameRequest = window.requestAnimationFrame(animate);
  });

  const entries = items.map((item, index): CleanRoomEntry => {
    const profile = cleanRoomProfiles[index];
    const link = ownedLinks[index];
    if (!profile || !link) throw new Error(`Missing clean-room volume ${index}`);
    const target = link.querySelector<HTMLElement>(".press-volume-book") ?? link;
    const metadata = getMetadata(item, index);
    const surfaces = createSurfaceTextures(renderer, profile, metadata, shared, () => {
      renderUntil = Math.max(renderUntil, performance.now() + 300);
      if (!frameRequest) frameRequest = window.requestAnimationFrame(animate);
    });
    const book = createCleanRoomBook(profile, surfaces, shared);
    scene.add(book.root);
    const entry: CleanRoomEntry = {
      index,
      profile,
      item,
      link,
      target,
      book,
      homePosition: new THREE.Vector3(),
      sectionPosition: new THREE.Vector3(),
      figure: volumeFigures[index] ?? null,
      homeScale: 1,
      sectionScale: 1,
      sectionTurnY: 0,
      sectionVisible: false,
      sectionWeight: 0,
      opacity: 0,
      hover: 0,
      hold: 0,
      holdRotationX: 0,
      holdRotationY: 0,
      holdTargetRotationX: 0,
      holdTargetRotationY: 0,
      initialized: false
    };
    setBookOpacity(entry, entryComplete ? 1 : 0);
    return entry;
  });

  const wake = (duration = 720): void => {
    renderUntil = Math.max(renderUntil, performance.now() + duration);
    if (!frameRequest) frameRequest = window.requestAnimationFrame(animate);
  };

  const clearHoldClasses = (immediate = false): void => {
    window.clearTimeout(holdClassTimer);
    const remove = (): void => {
      catalogueStage.classList.remove("is-book-held", "is-book-dragging");
      document.body.classList.remove("press-book-held", "press-book-dragging");
    };
    if (immediate) remove();
    else holdClassTimer = window.setTimeout(remove, CLEAN_ROOM_MOTION.releaseClassDelay);
  };

  const snapToShelf = (entry: CleanRoomEntry): void => {
    if (!entry.initialized) return;
    entry.book.root.position.copy(entry.homePosition);
    entry.book.root.scale.setScalar(entry.homeScale);
    entry.book.root.rotation.set(0, 0, 0);
    entry.book.object.rotation.x = shelfPitch(entry);
    entry.book.object.scale.x = 1;
    entry.book.object.scale.y = objectThicknessScaleY();
    entry.sectionWeight = 0;
    entry.sectionVisible = false;
    setBookOpacity(entry, 1);
  };

  const routing = installCleanRoomRouting({
    items,
    links: ownedLinks,
    onBeforeVolume: (index, source) => {
      clearHoldClasses(true);
      returningIndex = -1;
      releasedAt = 0;
      releasedFromDrag = false;
      returningRouteIndex = -1;
      resetVolumeInput();
      flight = reducedMotion.matches || compact.matches || source === "deep-link"
        ? null
        : {
          index,
          direction: "to-volume",
          speed: 0,
          approach: 0,
          progress: 0
        };
    },
    onBeforeCatalogue: (index) => {
      resetVolumeInput();
      returningRouteIndex = index;
      const animateReturn = !reducedMotion.matches && !compact.matches;
      flight = animateReturn
        ? {
          index,
          direction: "to-catalogue",
          speed: 0,
          approach: 0,
          progress: 0
        }
        : null;
      // Compact and reduced-motion routes intentionally cut directly to their
      // destination. Desktop keeps the selected route pose intact so the same
      // universal recurrence that opened it can carry it home; neighbours stay
      // absent until the latter half of that return.
      if (!animateReturn) entries.forEach(snapToShelf);
    },
    onModeChange: (mode) => {
      pressMode = mode;
      routeFrames = 0;
      if (mode === "volumes") {
        entryComplete = true;
        document.documentElement.classList.add("press-entry-complete");
      }
      requestRelayout();
      wake(1800);
    },
    onIndexChange: (index) => {
      if (index !== currentRouteIndex) resetVolumeInput();
      currentRouteIndex = index;
      requestRelayout();
      wake(900);
    },
    onWake: wake
  });
  pressMode = routing.snapshot().mode;
  currentRouteIndex = routing.snapshot().currentIndex;

  const catalogueScroll = installCleanRoomCatalogueScroll({
    items,
    stage: catalogueStage,
    compact,
    reducedMotion,
    mode: () => pressMode,
    onCurrentIndex: routing.setCatalogueIndex
  });

  const volumeInteraction = installCleanRoomVolumeInteraction({
    figures: routing.figures,
    canInteract: () => (
      pressMode === "volumes"
      && !compact.matches
      && !reducedMotion.matches
      && !flight
    ),
    flightActive: () => Boolean(flight),
    onWake: wake
  });
  resetVolumeInput = volumeInteraction.reset;

  const interactionState = installCleanRoomInteraction({
    items,
    links: ownedLinks,
    canHold: () => (
      pressMode === "catalogue" && !compact.matches && !reducedMotion.matches
    ),
    onBegin: (gesture) => {
      clearHoldClasses(true);
      returningIndex = gesture.index;
      releasedAt = 0;
      releasedFromDrag = false;
      const entry = entries[gesture.index];
      if (!entry) return;
      entry.holdRotationX = 0;
      entry.holdRotationY = 0;
      entry.holdTargetRotationX = 0;
      entry.holdTargetRotationY = 0;
      backdropColor.set(entry.profile.cloth);
      document.body.style.setProperty("--press-held-background", entry.profile.cloth);
      document.body.style.setProperty("--press-held-ink", entry.profile.ink);
      holdCaption.textContent = entry.profile.caption;
      catalogueStage.classList.add("is-book-held");
      document.body.classList.add("press-book-held");
    },
    onMove: (gesture, startedDragging) => {
      const entry = entries[gesture.index];
      if (!entry || !gesture.moved) return;
      if (startedDragging) {
        catalogueStage.classList.add("is-book-dragging");
        document.body.classList.add("press-book-dragging");
        holdCaption.classList.toggle(
          "is-low",
          screenCenterY(entry, camera, viewportHeight) < viewportHeight * 0.5
        );
      }
      const distance = Math.hypot(gesture.dx, gesture.dy);
      const reveal = smooth(clamp(
        (distance - CLEAN_ROOM_MOTION.dragThreshold)
          / (CLEAN_ROOM_MOTION.revealDistance - CLEAN_ROOM_MOTION.dragThreshold),
        0,
        1
      ));
      const directionalPitch = heldOrbitAngle(
        gesture.dy,
        entry.profile.drag.verticalResponse
      );
      const revealPitch = gesture.dy > 0
        ? entry.profile.drag.revealPitch * 0.16
        : entry.profile.drag.revealPitch;
      entry.holdTargetRotationX = clamp(
        reveal * revealPitch + directionalPitch,
        -CLEAN_ROOM_MOTION.orbitLimit,
        CLEAN_ROOM_MOTION.orbitLimit
      );
      entry.holdTargetRotationY = heldOrbitAngle(
        gesture.dx,
        entry.profile.drag.yawResponse
      );
    },
    onFinish: (gesture) => {
      returningIndex = gesture.index;
      releasedAt = performance.now();
      releasedFromDrag = gesture.moved;
      catalogueStage.classList.remove("is-book-dragging");
      document.body.classList.remove("press-book-dragging");
      clearHoldClasses(false);
    },
    onHover: () => undefined,
    onFocus: () => undefined,
    onActivate: (index, event) => {
      routing.activate(index, event);
    },
    onWake: wake
  });

  function layout(): void {
    layoutFrame = 0;
    routing.updateLayout();
    viewportWidth = window.innerWidth;
    viewportHeight = window.innerHeight;
    catalogueScroll.update();
    renderer.setSize(viewportWidth, viewportHeight, false);
    camera.aspect = viewportWidth / viewportHeight;
    camera.updateProjectionMatrix();
    // This scene uses normalized camera space and reprojects every shifted DOM
    // rect directly. Moving the camera by the CSS pixel shift as well would
    // apply the accepted pixel-world cancellation twice and blank the shelf.
    camera.position.y = 6.5;
    camera.updateMatrixWorld(true);
    lights.update(camera.position.y, pressMode === "volumes" ? 1 : holdPresentation);

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
      entry.homePosition.copy(center);
      entry.homePosition.z = depth;
      entry.homeScale = scale;

      const figureRect = entry.figure?.getBoundingClientRect() ?? null;
      const sectionEligible = pressMode === "volumes"
        && !reducedMotion.matches
        && Boolean(figureRect);
      if (figureRect) {
        const sectionX = compact.matches
          ? figureRect.left + figureRect.width * 0.5 + 5
          : figureRect.left + figureRect.width * 0.608;
        const sectionY = figureRect.top + figureRect.height * 0.5
          - (compact.matches ? 40 : 10);
        entry.sectionPosition.copy(pointOnDepthPlane(
          camera,
          viewportWidth,
          viewportHeight,
          sectionX,
          sectionY,
          depth
        ));
        entry.sectionPosition.z = depth;
        const sectionUnits = worldUnitsPerPixel(camera, viewportHeight, depth);
        const heightLimited = viewportHeight
          * CLEAN_ROOM_MOTION.sectionCoverViewportHeight
          * sectionUnits;
        const widthLimited = figureRect.width
          * 0.95
          * sectionUnits
          / entry.profile.depthRatio;
        entry.sectionScale = Math.min(heightLimited, widthLimited)
          * (compact.matches ? 1 : 0.897);
        entry.sectionWeight = sectionEligible && figureRect.top < viewportHeight * 1.25 ? 1 : 0;
        entry.sectionVisible = entry.sectionWeight > 0
          && figureRect.bottom > -180
          && figureRect.top < viewportHeight + 180;
        entry.sectionTurnY = entry.index === currentRouteIndex && !compact.matches
          ? (
            viewportHeight * 0.5
            - (figureRect.top + figureRect.height * 0.5)
          ) * CLEAN_ROOM_MOTION.volumeScrollTurn
          : 0;
      } else {
        entry.sectionPosition.copy(entry.homePosition);
        entry.sectionScale = entry.homeScale;
        entry.sectionWeight = 0;
        entry.sectionVisible = false;
        entry.sectionTurnY = 0;
      }
      if (!entry.initialized) {
        unitsPerPixel = worldUnitsPerPixel(camera, viewportHeight, depth);
        if (entry.sectionWeight > 0 && entry.index === currentRouteIndex) {
          entry.book.root.position.copy(entry.sectionPosition);
          entry.book.root.scale.setScalar(entry.sectionScale);
          entry.book.root.rotation.set(
            0,
            CLEAN_ROOM_MOTION.sectionCoverYaw,
            CLEAN_ROOM_MOTION.sectionCoverRoll
          );
          entry.book.object.rotation.x = Math.PI / 2
            - CLEAN_ROOM_MOTION.sectionCoverPitchShortfall;
          entry.book.object.scale.x = sectionObjectScaleX();
          entry.book.object.scale.y = objectThicknessScaleY();
        } else {
          entry.book.root.position.copy(center);
          entry.book.root.position.y -= reducedMotion.matches ? 0 : 28 * unitsPerPixel;
          entry.book.root.position.z -= reducedMotion.matches ? 0 : camera.position.z * 0.012;
          entry.book.root.scale.setScalar(scale);
          entry.book.object.rotation.x = entry.profile.shelfPitch;
          entry.book.object.scale.y = objectThicknessScaleY();
        }
        entry.initialized = true;
      }
    });
    unitsPerPixel = worldUnitsPerPixel(camera, viewportHeight, -3);
    wake(720);
  }

  const scheduleLayout = (): void => {
    if (layoutFrame) return;
    layoutFrame = window.requestAnimationFrame(layout);
  };
  requestRelayout = scheduleLayout;

  function animate(now: number): void {
    frameRequest = 0;
    if (!entryStartedAt) entryStartedAt = now;
    const rawDelta = lastFrameAt ? (now - lastFrameAt) / 1000 : 1 / 60;
    const deltaSeconds = clamp(rawDelta, 1 / 240, 0.25);
    lastFrameAt = now;
    interactionSnapshot = interactionState();
    const catalogueMotion = catalogueScroll.advance(deltaSeconds);
    if (pressMode === "volumes") volumeInteraction.advanceTwirl(deltaSeconds);
    const volumePose = volumeInteraction.snapshot();

    const gesture = interactionSnapshot.gesture;
    const activeIndex = gesture?.index ?? returningIndex;
    const holding = Boolean(gesture);
    // The current live reference enters the selected-cloth presentation on
    // pointer down. The four-pixel boundary still owns orbiting and click
    // suppression; it does not delay the physical pick-up state.
    const presenting = holding;
    const releaseElapsed = releasedAt ? now - releasedAt : Infinity;
    const isolating = holding
      || (releasedFromDrag && releaseElapsed < CLEAN_ROOM_MOTION.releaseIsolation);
    const returningPresentation = releasedFromDrag
      && releaseElapsed < CLEAN_ROOM_MOTION.releasePresentation;
    const backingPresentation = presenting
      || (releasedFromDrag && releaseElapsed < CLEAN_ROOM_MOTION.releaseBackdrop);

    holdIsolation = damp(holdIsolation, isolating ? 1 : 0, isolating ? 14 : 6, deltaSeconds);
    holdPresentation = damp(
      holdPresentation,
      presenting || returningPresentation ? 1 : 0,
      presenting || returningPresentation ? 7.8 : 4.6,
      deltaSeconds
    );
    holdBackdrop = damp(
      holdBackdrop,
      backingPresentation ? 1 : 0,
      backingPresentation ? 12.5 : 7,
      deltaSeconds
    );
    catalogueStage.classList.toggle(
      "is-stack-evacuated",
      activeIndex >= 0 && holdIsolation > 0.9
    );

    const activeFlight = flight;
    const flightMatchesMode = activeFlight && (
      (activeFlight.direction === "to-volume" && pressMode === "volumes")
      || (activeFlight.direction === "to-catalogue" && pressMode === "catalogue")
    );
    if (activeFlight && flightMatchesMode) {
      const frames = clamp(deltaSeconds * 60, 0.25, 4);
      activeFlight.speed = Math.min(
        CLEAN_ROOM_MOTION.flightEaseCeiling,
        activeFlight.speed + CLEAN_ROOM_MOTION.flightEaseStep * frames
      );
      activeFlight.approach = 1 - Math.pow(1 - activeFlight.speed, frames);
      activeFlight.progress = 1 - (
        (1 - activeFlight.progress) * Math.pow(1 - activeFlight.speed, frames)
      );
    } else if (activeFlight && !flightMatchesMode) {
      flight = null;
    }

    let allEntryCurvesComplete = true;
    let entryResidual = 0;
    entries.forEach((entry, index) => {
      const entryLinear = reducedMotion.matches || pressMode === "volumes"
        ? 1
        : clamp(
          (now - entryStartedAt - CLEAN_ROOM_MOTION.entryDelay
            - index * CLEAN_ROOM_MOTION.entryStagger)
            / CLEAN_ROOM_MOTION.entryDuration,
          0,
          1
        );
      const entryDrive = reducedMotion.matches ? 1 : spring(entryLinear);
      const entryOpacity = reducedMotion.matches
        ? 1
        : smooth(clamp(entryLinear / 0.72, 0, 1));
      if (entryLinear < 1) allEntryCurvesComplete = false;

      if (pressMode === "volumes") {
        if (entry.sectionWeight <= 0) {
          setBookOpacity(entry, 0);
          return;
        }
        const live = index === currentRouteIndex;
        const targetRotationY = CLEAN_ROOM_MOTION.sectionCoverYaw
          + entry.sectionTurnY
          + (live ? volumePose.rotationY : 0);
        const targetRotationZ = CLEAN_ROOM_MOTION.sectionCoverRoll;
        const targetObjectRotationX = Math.PI / 2
          - CLEAN_ROOM_MOTION.sectionCoverPitchShortfall
          + (live ? volumePose.rotationX : 0);
        if (activeFlight?.direction === "to-volume" && activeFlight.index === index) {
          const approach = activeFlight.approach;
          entry.book.root.position.lerp(entry.sectionPosition, approach);
          const nextScale = mix(entry.book.root.scale.x, entry.sectionScale, approach);
          entry.book.root.scale.setScalar(nextScale);
          entry.book.root.rotation.x = mix(entry.book.root.rotation.x, 0, approach);
          entry.book.root.rotation.y = mix(
            entry.book.root.rotation.y,
            targetRotationY,
            approach
          );
          entry.book.root.rotation.z = mix(
            entry.book.root.rotation.z,
            targetRotationZ,
            approach
          );
          entry.book.object.rotation.x = mix(
            entry.book.object.rotation.x,
            targetObjectRotationX,
            approach
          );
          entry.book.object.scale.x = mix(
            entry.book.object.scale.x,
            sectionObjectScaleX(),
            approach
          );
          entry.book.object.scale.y = objectThicknessScaleY();
          const residual = Math.max(
            entry.book.root.position.distanceTo(entry.sectionPosition),
            Math.abs(entry.book.root.scale.x - entry.sectionScale) * 20,
            Math.abs(entry.book.object.rotation.x - targetObjectRotationX) * 10
          );
          entryResidual = Math.max(entryResidual, residual);
          if (residual < 0.012 && flight === activeFlight) flight = null;
        } else {
          entry.book.root.position.copy(entry.sectionPosition);
          entry.book.root.scale.setScalar(entry.sectionScale);
          entry.book.root.rotation.set(0, targetRotationY, targetRotationZ);
          entry.book.object.rotation.x = targetObjectRotationX;
          entry.book.object.scale.x = sectionObjectScaleX();
          entry.book.object.scale.y = objectThicknessScaleY();
        }
        setBookOpacity(entry, entry.sectionVisible ? 1 : 0);
        return;
      }

      const returnFlight = activeFlight?.direction === "to-catalogue"
        ? activeFlight
        : null;
      if (returnFlight) {
        const shelfY = entry.homePosition.y + catalogueRestLift() * unitsPerPixel;
        const targetPitch = shelfPitch(entry);
        if (index === returnFlight.index) {
          const approach = returnFlight.approach;
          entry.book.root.position.x = mix(
            entry.book.root.position.x,
            entry.homePosition.x,
            approach
          );
          entry.book.root.position.y = mix(entry.book.root.position.y, shelfY, approach);
          entry.book.root.position.z = mix(
            entry.book.root.position.z,
            entry.homePosition.z,
            approach
          );
          const nextScale = mix(entry.book.root.scale.x, entry.homeScale, approach);
          entry.book.root.scale.setScalar(nextScale);
          entry.book.root.rotation.x = mix(entry.book.root.rotation.x, 0, approach);
          entry.book.root.rotation.y = mix(entry.book.root.rotation.y, 0, approach);
          entry.book.root.rotation.z = mix(entry.book.root.rotation.z, 0, approach);
          entry.book.object.rotation.x = mix(
            entry.book.object.rotation.x,
            targetPitch,
            approach
          );
          entry.book.object.scale.x = mix(entry.book.object.scale.x, 1, approach);
          entry.book.object.scale.y = mix(
            entry.book.object.scale.y,
            objectThicknessScaleY(),
            approach
          );
          setBookOpacity(entry, 1);
        } else {
          const settled = returnFlight.progress >= CLEAN_ROOM_MOTION.returnFlightSettleProgress;
          const stackProgress = settled ? 1 : smooth(clamp(
            (returnFlight.progress - CLEAN_ROOM_MOTION.returnStackStart)
              / (1 - CLEAN_ROOM_MOTION.returnStackStart),
            0,
            1
          ));
          const stackOpacity = settled ? 1 : smooth(clamp(
            (returnFlight.progress - CLEAN_ROOM_MOTION.returnStackFadeStart)
              / (1 - CLEAN_ROOM_MOTION.returnStackFadeStart),
            0,
            1
          ));
          const evacuation = (returnFlight.index - index)
            * viewportHeight
            * CLEAN_ROOM_MOTION.stackEvictionViewports
            * unitsPerPixel;
          entry.book.root.position.set(
            entry.homePosition.x,
            mix(shelfY + evacuation, shelfY, stackProgress),
            entry.homePosition.z
          );
          entry.book.root.scale.setScalar(entry.homeScale);
          entry.book.root.rotation.set(0, 0, 0);
          entry.book.object.rotation.x = targetPitch;
          entry.book.object.scale.x = 1;
          entry.book.object.scale.y = objectThicknessScaleY();
          setBookOpacity(entry, stackOpacity);
        }
        entryResidual = Math.max(
          entryResidual,
          Math.abs(entry.book.root.position.x - entry.homePosition.x),
          Math.abs(entry.book.root.position.y - shelfY),
          Math.abs(entry.book.root.position.z - entry.homePosition.z),
          Math.abs(entry.book.root.scale.x - entry.homeScale) * 20,
          Math.abs(entry.book.root.rotation.y) * 10,
          Math.abs(entry.book.root.rotation.z) * 10,
          Math.abs(entry.book.object.rotation.x - targetPitch) * 10,
          Math.abs(entry.opacity - 1) * 10
        );
        return;
      }

      const activelyHeld = gesture?.index === index;
      const pressedWithoutDrag = activelyHeld && !gesture?.moved;
      const interactive = !reducedMotion.matches && (
        interactionSnapshot.hoverIndex === index
        || interactionSnapshot.focusIndex === index
        || activelyHeld
      );
      const holdTarget = activelyHeld
        || (index === returningIndex && returningPresentation);
      entry.hover = damp(entry.hover, interactive ? 1 : 0, interactive ? 9.2 : 6.8, deltaSeconds);
      entry.hold = damp(entry.hold, holdTarget ? 1 : 0, holdTarget ? 15 : 6.5, deltaSeconds);
      entry.holdRotationX = damp(
        entry.holdRotationX,
        activelyHeld || returningPresentation ? entry.holdTargetRotationX : 0,
        activelyHeld ? 14.5 : 7.5,
        deltaSeconds
      );
      entry.holdRotationY = damp(
        entry.holdRotationY,
        activelyHeld || returningPresentation ? entry.holdTargetRotationY : 0,
        activelyHeld ? 14.5 : 7.5,
        deltaSeconds
      );

      const evictionPixels = index === activeIndex
        ? 0
        : (activeIndex - index)
          * viewportHeight
          * CLEAN_ROOM_MOTION.stackEvictionViewports
          * holdIsolation;
      const targetY = entry.homePosition.y
        + (
          catalogueRestLift()
            + entry.hold * CLEAN_ROOM_MOTION.heldLiftPixels
            + (pressedWithoutDrag
              ? entry.hold * CLEAN_ROOM_MOTION.pressPickLiftPixels
              : 0)
        ) * unitsPerPixel
        - (1 - entryDrive) * 28 * unitsPerPixel
        + evictionPixels * unitsPerPixel;
      const hoverDepth = camera.position.z
        * (1 - 1 / CLEAN_ROOM_MOTION.hoverProjectedScale);
      const holdDepth = camera.position.z
        * (1 - 1 / CLEAN_ROOM_MOTION.holdProjectedScale);
      const entryDepth = -camera.position.z * 0.012 * (1 - smooth(entryLinear));
      const targetDepth = entry.homePosition.z
        + entryDepth
        + mix(entry.hover * hoverDepth, holdDepth, entry.hold);

      entry.book.root.position.x = damp(
        entry.book.root.position.x,
        entry.homePosition.x,
        11.5,
        deltaSeconds
      );
      entry.book.root.position.y = damp(
        entry.book.root.position.y,
        targetY,
        11.5,
        deltaSeconds
      );
      entry.book.root.position.z = frameApproach(
        entry.book.root.position.z,
        targetDepth,
        CLEAN_ROOM_MOTION.spineZEase,
        deltaSeconds
      );
      const nextScale = damp(
        entry.book.root.scale.x,
        entry.homeScale,
        11,
        deltaSeconds
      );
      entry.book.root.scale.setScalar(nextScale);
      const heldForeshorten = clamp(
        Math.abs(entry.holdRotationY) / CLEAN_ROOM_MOTION.heldForeshortenAngle,
        0,
        1
      ) * entry.hold;
      entry.book.object.scale.x = damp(
        entry.book.object.scale.x,
        mix(1, CLEAN_ROOM_MOTION.heldLongAxisForeshorten, heldForeshorten),
        11,
        deltaSeconds
      );
      entry.book.object.scale.y = damp(
        entry.book.object.scale.y,
        objectThicknessScaleY(),
        11,
        deltaSeconds
      );
      entry.book.root.rotation.y = damp(
        entry.book.root.rotation.y,
        entry.holdRotationY * entry.hold,
        13,
        deltaSeconds
      );
      entry.book.root.rotation.z = damp(
        entry.book.root.rotation.z,
        -entry.holdRotationY * entry.hold * 0.038
          + (1 - entryDrive) * (index % 2 ? -0.008 : 0.008),
        13,
        deltaSeconds
      );
      entry.book.object.rotation.x = damp(
        entry.book.object.rotation.x,
        shelfPitch(entry)
          + catalogueMotion.scrollVelocity * (1 - entry.hold)
          + entry.holdRotationX * entry.hold
          + (pressedWithoutDrag
            ? CLEAN_ROOM_MOTION.pressPickPitch * entry.hold
            : 0),
        13,
        deltaSeconds
      );
      setBookOpacity(entry, entryOpacity * catalogueMotion.terminalSceneOpacity);

      entryResidual = Math.max(
        entryResidual,
        Math.abs(entry.book.root.position.y - targetY),
        Math.abs(entry.book.root.position.z - targetDepth),
        Math.abs(entry.book.root.scale.x - entry.homeScale)
      );
    });

    if (
      activeFlight?.direction === "to-catalogue"
      && activeFlight.progress >= CLEAN_ROOM_MOTION.returnFlightSettleProgress
      && entryResidual <= CLEAN_ROOM_MOTION.entrySettleEpsilon
      && flight === activeFlight
    ) flight = null;

    if (
      pressMode === "catalogue"
      && returningRouteIndex >= 0
      && !flight
      && entryResidual <= CLEAN_ROOM_MOTION.entrySettleEpsilon
    ) returningRouteIndex = -1;

    if (
      !entryComplete
      && allEntryCurvesComplete
      && (
        entryResidual <= CLEAN_ROOM_MOTION.entrySettleEpsilon
        || now - entryStartedAt > CLEAN_ROOM_MOTION.entrySettleTimeout
      )
    ) {
      entryComplete = true;
      document.documentElement.classList.add("press-entry-complete");
    }

    renderer.setClearColor(backdropColor, holdBackdrop);
    const routePresentation = pressMode === "volumes" ? 1 : holdPresentation;
    lights.update(camera.position.y, routePresentation);
    const activeEntry = pressMode === "volumes"
      ? entries[currentRouteIndex]
      : activeIndex >= 0 ? entries[activeIndex] : undefined;
    if (activeEntry && routePresentation > 0.001) {
      backLightTarget.set(activeEntry.profile.cloth).lerp(
        BACK_LIGHT_REST,
        1 - routePresentation
      );
    } else {
      backLightTarget.copy(BACK_LIGHT_REST);
    }
    lights.back.color.lerp(backLightTarget, 1 - Math.exp(-5.2 * deltaSeconds));
    lights.rake.intensity = damp(
      lights.rake.intensity,
      mix(0.75, 0.05, routePresentation) * LEGACY_LIGHT_SCALE,
      5.2,
      deltaSeconds
    );

    if (!holding && holdIsolation < 0.002 && holdPresentation < 0.002 && holdBackdrop < 0.002) {
      returningIndex = -1;
      releasedAt = 0;
      releasedFromDrag = false;
      catalogueStage.classList.remove("is-stack-evacuated");
    }

    lastEntryResidual = entryResidual;
    const latestVolumePose = volumeInteraction.snapshot();
    const idlePaused = preserveDrawingBuffer
      && entryComplete
      && !interactionSnapshot.gesture
      && returningIndex < 0
      && returningRouteIndex < 0
      && !flight
      && !latestVolumePose.dragging
      && !latestVolumePose.twirlX
      && !latestVolumePose.twirlY
      && routing.snapshot().pendingDeepLinkIndex < 0
      && catalogueMotion.scrollVelocity === 0
      && entryResidual <= CLEAN_ROOM_MOTION.entrySettleEpsilon
      && now > renderUntil + CLEAN_ROOM_MOTION.idlePauseAfter;
    if (document.visibilityState !== "hidden" && !idlePaused) {
      renderOnce();
      presentedFrames += 1;
    }
    animationFrames += 1;
    routeFrames += 1;
    if (routeFrames >= 3 && routing.settlePendingDeepLink()) {
      routeFrames = 0;
      requestRelayout();
    }
    if (!idlePaused && !frameRequest) frameRequest = window.requestAnimationFrame(animate);
  }

  window.addEventListener("resize", scheduleLayout, { passive: true });
  window.addEventListener("scroll", scheduleLayout, { passive: true });
  compact.addEventListener("change", scheduleLayout);
  reducedMotion.addEventListener("change", scheduleLayout);

  layout();
  document.documentElement.dataset.pressRenderer = "clean-room";
  document.documentElement.classList.remove("press-entry-complete");
  document.documentElement.classList.add("press-scene-ready");
  if (entryComplete) document.documentElement.classList.add("press-entry-complete");

  if (window.__pressDebugEnabled) {
    window.__pressCleanRoomDebug = () => {
      const volume = volumeInteraction.snapshot();
      const scroll = catalogueScroll.snapshot();
      const idlePaused = preserveDrawingBuffer
        && entryComplete
        && !interactionSnapshot.gesture
        && returningIndex < 0
        && returningRouteIndex < 0
        && !flight
        && !volume.dragging
        && !volume.twirlX
        && !volume.twirlY
        && routing.snapshot().pendingDeepLinkIndex < 0
        && scroll.scrollVelocity === 0
        && lastEntryResidual <= CLEAN_ROOM_MOTION.entrySettleEpsilon
        && performance.now() > renderUntil + CLEAN_ROOM_MOTION.idlePauseAfter;
      return ({
      renderer: "clean-room",
      state: {
        entryComplete,
        hoverIndex: interactionSnapshot.hoverIndex,
        focusIndex: interactionSnapshot.focusIndex,
        heldIndex: interactionSnapshot.gesture?.index ?? -1,
        dragging: Boolean(interactionSnapshot.gesture?.moved),
        returningIndex,
        isolation: Number(holdIsolation.toFixed(4)),
        presentation: Number(holdPresentation.toFixed(4)),
        backdrop: Number(holdBackdrop.toFixed(4)),
        mode: pressMode,
        currentIndex: currentRouteIndex,
        flightIndex: flight?.index ?? -1,
        flightDirection: flight?.direction ?? null,
        flightProgress: Number((flight?.progress ?? 0).toFixed(4)),
        pendingDeepLinkIndex: routing.snapshot().pendingDeepLinkIndex,
        coverRotation: [
          Number(volume.rotationX.toFixed(4)),
          Number(volume.rotationY.toFixed(4))
        ],
        coverDragging: volume.dragging,
        coverTwirl: [
          Number(volume.twirlX.toFixed(4)),
          Number(volume.twirlY.toFixed(4))
        ]
      },
      books: entries.map(({
        profile,
        book,
        homePosition,
        sectionPosition,
        homeScale,
        sectionScale,
        sectionWeight,
        sectionVisible,
        opacity
      }) => ({
        slug: profile.slug,
        position: [
          Number(book.root.position.x.toFixed(4)),
          Number(book.root.position.y.toFixed(4)),
          Number(book.root.position.z.toFixed(4))
        ],
        homePosition: [
          Number(homePosition.x.toFixed(4)),
          Number(homePosition.y.toFixed(4)),
          Number(homePosition.z.toFixed(4))
        ],
        scale: Number(book.root.scale.x.toFixed(4)),
        homeScale: Number(homeScale.toFixed(4)),
        sectionPosition: [
          Number(sectionPosition.x.toFixed(4)),
          Number(sectionPosition.y.toFixed(4)),
          Number(sectionPosition.z.toFixed(4))
        ],
        sectionScale: Number(sectionScale.toFixed(4)),
        sectionWeight: Number(sectionWeight.toFixed(4)),
        sectionVisible,
        screenBounds: projectedBookBounds(book, camera, viewportWidth, viewportHeight),
        rotation: [
          Number(book.object.rotation.x.toFixed(4)),
          Number(book.root.rotation.y.toFixed(4)),
          Number(book.root.rotation.z.toFixed(4))
        ],
        opacity: Number(opacity.toFixed(4)),
        material: {
          architecture: book.materialModel.cover.architecture,
          coverMaps: book.materialModel.cover.mapCount,
          spineMaps: book.materialModel.spine.mapCount,
          coverDiffuseSize: book.materialModel.cover.diffuseSize,
          coverMaskSize: book.materialModel.cover.maskSize,
          textureFamily: book.materialModel.cover.textureFamily,
          textureTransform: book.materialModel.cover.textureTransform,
          responseSignature: book.materialModel.cover.responseSignature
        },
        binding: {
          spineSegments: book.bindingModel.spineSegments,
          coverJointCount: book.bindingModel.coverJointCount,
          spineHubCount: book.bindingModel.spineHubCount,
          coverJointInset: book.bindingModel.coverJointInset,
          coverJointWidth: book.bindingModel.coverJointWidth,
          coverJointDepth: book.bindingModel.coverJointDepth,
          coverSkinOffset: book.bindingModel.coverSkinOffset,
          boardCornerRadius: book.bindingModel.boardCornerRadius,
          pageBlockInset: book.bindingModel.pageBlockInset,
          spineEndCapCount: book.bindingModel.spineEndCapCount,
          spineEndCapDepth: book.bindingModel.spineEndCapDepth,
          headbandCount: book.bindingModel.headbandCount
        }
      })),
      render: {
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        programs: renderer.info.programs?.length ?? 0,
        animationFrames,
        presentedFrames,
        idlePaused,
        preserveDrawingBuffer
      },
      light: {
        rakeTarget: [
          Number(lights.rakeTarget.position.x.toFixed(4)),
          Number(lights.rakeTarget.position.y.toFixed(4)),
          Number(lights.rakeTarget.position.z.toFixed(4))
        ],
        rakeIntensity: Number(lights.rake.intensity.toFixed(4)),
        backColor: `#${lights.back.color.getHexString()}`
      },
      scroll: {
        y: window.scrollY,
        documentHeight: document.documentElement.scrollHeight,
        currentScrollStep: Number(scroll.currentScrollStep.toFixed(4)),
        stackShift: Number(scroll.stackShift.toFixed(4)),
        scrollVelocity: Number(scroll.scrollVelocity.toFixed(4)),
        terminalProgress: Number(scroll.terminalProgress.toFixed(4)),
        terminalSceneOpacity: Number(scroll.terminalSceneOpacity.toFixed(4)),
        mainHeight: Number(scroll.mainHeight.toFixed(4)),
        cameraY: Number(camera.position.y.toFixed(4))
      }
      });
    };
  }

  wake(1800);
  return true;
};
