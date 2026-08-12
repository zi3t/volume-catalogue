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
  CLEAN_ROOM_REFERENCE,
  clamp,
  damp,
  frameApproach,
  mix,
  smooth,
  wrapRotation
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
    readonly coverPosition: readonly [number, number, number];
    readonly coverRotation: readonly [number, number, number];
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
      readonly architecture: "reference-book-shader-material";
      readonly mapCount: 7;
      readonly atlasSize: readonly [1920, 1600];
      readonly thickness: number;
      readonly baseBump: CleanRoomVolumeProfile["material"]["baseBump"];
      readonly responseSignature: string;
    };
    readonly geometry: {
      readonly meshCount: 1;
      readonly vertexCount: number;
      readonly triangleCount: number;
      readonly objectName: "book";
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
    readonly terminalTravel: number;
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
  // Stripe's book shader is fully opaque. Transitions move or hide the mesh;
  // applying fractional surface alpha makes rear faces and page edges print
  // through the cover.
  entry.book.root.visible = next > 0.001;
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
  const signaturePanel = document.querySelector<HTMLElement>(".signature-section");
  const signatureRow = signaturePanel?.querySelector<HTMLElement>(".signature-row");
  const closingPanel = document.querySelector<HTMLElement>(".home-closing");
  const footerPanel = document.querySelector<HTMLElement>(".home-footer");

  THREE.ColorManagement.enabled = false;

  const compact = window.matchMedia("(max-width: 899px)");
  const narrow = window.matchMedia("(max-width: 599px)");
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
  renderer.setPixelRatio(window.devicePixelRatio || 1);
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
  camera.position.set(
    0,
    CLEAN_ROOM_REFERENCE.cameraY,
    CLEAN_ROOM_REFERENCE.cameraBaseZ
  );
  camera.rotation.x = CLEAN_ROOM_REFERENCE.cameraPitch;
  const lights = createCleanRoomLightRig(scene);

  let frameRequest = 0;
  let layoutFrame = 0;
  let entryComplete = reducedMotion.matches;
  let entrySpeed = 0;
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

  const shelfCoverOffset = (): number => CLEAN_ROOM_REFERENCE.shelfCoverOffsetX;

  const setShelfEulerOrders = (book: CleanRoomBook): void => {
    if (book.root.rotation.order !== "XYZ") book.root.rotation.reorder("XYZ");
    if (book.cover.rotation.order !== "ZYX") book.cover.rotation.reorder("ZYX");
  };

  const setActiveEulerOrders = (book: CleanRoomBook): void => {
    if (book.root.rotation.order !== "XYZ") book.root.rotation.reorder("XYZ");
    if (book.cover.rotation.order !== "XYZ") book.cover.rotation.reorder("XYZ");
  };

  const activePosition = (): THREE.Vector3 => {
    if (compact.matches) {
      return new THREE.Vector3(
        CLEAN_ROOM_REFERENCE.compactActiveX,
        CLEAN_ROOM_REFERENCE.compactActiveY,
        CLEAN_ROOM_REFERENCE.compactActiveZ
      );
    }
    const canvasWidth = Math.min(
      CLEAN_ROOM_REFERENCE.canvasMaxWidth,
      viewportWidth
    );
    const ratio = canvasWidth / CLEAN_ROOM_REFERENCE.positionReferenceWidth;
    return new THREE.Vector3(
      Math.max(
        CLEAN_ROOM_REFERENCE.activeX,
        CLEAN_ROOM_REFERENCE.activeX * ratio
      ),
      CLEAN_ROOM_REFERENCE.activeY,
      CLEAN_ROOM_REFERENCE.activeZ
    );
  };

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
    const book = createCleanRoomBook(profile, surfaces);
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
      initialized: false
    };
    setBookOpacity(entry, 1);
    return entry;
  });

  const syncInteractionBounds = (): void => {
    if (pressMode !== "catalogue") return;
    const itemRects = entries.map((entry) => entry.item.getBoundingClientRect());
    const screenBounds = entries.map((entry) => (
      projectedBookBounds(entry.book, camera, viewportWidth, viewportHeight)
    ));
    entries.forEach((entry, index) => {
      const itemRect = itemRects[index];
      const bounds = screenBounds[index];
      if (!itemRect || !bounds) return;
      entry.link.style.setProperty(
        "--press-hit-left",
        `${(bounds.left - itemRect.left).toFixed(2)}px`
      );
      entry.link.style.setProperty(
        "--press-hit-top",
        `${(bounds.top - itemRect.top).toFixed(2)}px`
      );
      entry.link.style.setProperty("--press-hit-width", `${bounds.width.toFixed(2)}px`);
      entry.link.style.setProperty("--press-hit-height", `${bounds.height.toFixed(2)}px`);
    });

    // Keep the terminal surfaces in the same virtual document as the fifth
    // book. Their current screen positions are derived from the projected book
    // rather than a viewport percentage, so the measured gap survives Safari
    // chrome, short displays and every responsive shelf calibration.
    const lastBounds = screenBounds.at(-1);
    if (lastBounds && signaturePanel && signatureRow && closingPanel && footerPanel) {
      const signatureHeight = Math.min(viewportHeight * 0.78, 700);
      const signatureBaseTop = (viewportHeight - signatureHeight) / 2;
      const bookToSignatureGap = 24;
      const signatureToClosingGap = Math.max(72, viewportHeight * 0.12);
      const signatureTop = lastBounds.top + lastBounds.height + bookToSignatureGap;
      const signatureShift = signatureTop - signatureBaseTop;
      const closingShift = signatureTop + signatureHeight + signatureToClosingGap;
      signaturePanel.style.setProperty(
        "--press-terminal-signature-shift",
        `${signatureShift.toFixed(2)}px`
      );
      closingPanel.style.setProperty("--press-terminal-shift", `${closingShift.toFixed(2)}px`);
      footerPanel.style.setProperty("--press-terminal-shift", `${closingShift.toFixed(2)}px`);
    }
  };

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
    setShelfEulerOrders(entry.book);
    entry.book.root.position.copy(entry.homePosition);
    entry.book.root.scale.setScalar(entry.homeScale);
    entry.book.root.rotation.set(
      CLEAN_ROOM_REFERENCE.shelfRootRotationX,
      0,
      CLEAN_ROOM_REFERENCE.shelfRootRotationZ
    );
    entry.book.cover.position.set(shelfCoverOffset(), 0, 0);
    entry.book.cover.rotation.set(
      0,
      CLEAN_ROOM_REFERENCE.coverBaseRotationY,
      0
    );
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
      backdropColor.set(entry.profile.cloth);
      document.body.style.setProperty("--press-held-background", entry.profile.cloth);
      document.body.style.setProperty("--press-held-ink", entry.profile.ink);
      holdCaption.textContent = entry.profile.caption;
      catalogueStage.classList.add("is-book-held");
      document.body.classList.add("press-book-held");
    },
    onMove: (gesture, startedDragging) => {
      const entry = entries[gesture.index];
      if (!entry) return;
      if (startedDragging) {
        catalogueStage.classList.add("is-book-dragging");
        document.body.classList.add("press-book-dragging");
      }
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
    camera.fov = narrow.matches ? 15 : 12;
    const canvasWidth = Math.min(
      CLEAN_ROOM_REFERENCE.canvasMaxWidth,
      viewportWidth
    );
    const canvasScale = narrow.matches
      ? 1
      : Math.max(
        1,
        viewportHeight
          * (CLEAN_ROOM_REFERENCE.canvasMaxWidth
            / CLEAN_ROOM_REFERENCE.canvasReferenceHeight)
          / canvasWidth
          * CLEAN_ROOM_REFERENCE.canvasOverscan
      );
    camera.position.z = CLEAN_ROOM_REFERENCE.cameraBaseZ * canvasScale;
    camera.updateProjectionMatrix();
    const catalogueMaximum = catalogueScroll.snapshot().currentScrollStep
      * Math.max(0, entries.length - 1);
    const catalogueScrollY = Math.min(window.scrollY, catalogueMaximum);
    const cameraScrollRatio = CLEAN_ROOM_REFERENCE.catalogueCameraScroll
      / (viewportHeight / CLEAN_ROOM_REFERENCE.canvasReferenceHeight)
      * canvasScale;
    camera.position.y = pressMode === "catalogue"
      ? CLEAN_ROOM_REFERENCE.cameraY - catalogueScrollY * cameraScrollRatio
      : CLEAN_ROOM_REFERENCE.cameraY;
    camera.updateMatrixWorld(true);
    lights.update(camera.position.y, pressMode === "volumes" ? 1 : holdPresentation);

    const sectionTarget = activePosition();
    const shelfCenterDepth = CLEAN_ROOM_REFERENCE.shelfRootZ - 11;
    entries.forEach((entry, index) => {
      const shelfGap = narrow.matches ? -7 : -6;
      entry.homePosition.set(
        0,
        index * shelfGap,
        CLEAN_ROOM_REFERENCE.shelfRootZ
      );
      entry.homeScale = CLEAN_ROOM_REFERENCE.modelScale;

      const figureRect = entry.figure?.getBoundingClientRect() ?? null;
      const sectionEligible = pressMode === "volumes"
        && Boolean(figureRect);
      if (figureRect) {
        entry.sectionPosition.copy(sectionTarget);
        if (index !== currentRouteIndex && !compact.matches) {
          entry.sectionPosition.z = CLEAN_ROOM_REFERENCE.inactiveZ;
        }
        entry.sectionScale = CLEAN_ROOM_REFERENCE.modelScale;
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
        unitsPerPixel = worldUnitsPerPixel(camera, viewportHeight, shelfCenterDepth);
        if (entry.sectionWeight > 0 && entry.index === currentRouteIndex) {
          setActiveEulerOrders(entry.book);
          entry.book.root.position.copy(entry.sectionPosition);
          entry.book.root.scale.setScalar(entry.sectionScale);
          entry.book.root.rotation.set(
            CLEAN_ROOM_REFERENCE.activeRotationX
              + (narrow.matches ? CLEAN_ROOM_REFERENCE.narrowActivePitchOffset : 0),
            CLEAN_ROOM_REFERENCE.activeRotationY + entry.sectionTurnY,
            CLEAN_ROOM_REFERENCE.activeRotationZ
          );
          entry.book.cover.position.set(0, 0, 0);
          entry.book.cover.rotation.set(
            0,
            CLEAN_ROOM_REFERENCE.coverBaseRotationY,
            0
          );
        } else {
          setShelfEulerOrders(entry.book);
          entry.book.root.position.set(
            entry.homePosition.x,
            reducedMotion.matches
              ? entry.homePosition.y
              : CLEAN_ROOM_MOTION.entryInitialY
                - index * CLEAN_ROOM_MOTION.entryInitialGap,
            reducedMotion.matches
              ? entry.homePosition.z
              : CLEAN_ROOM_MOTION.entryInitialZ
                - Math.sin(index / entries.length)
                  * CLEAN_ROOM_MOTION.entryInitialDepthArc
          );
          entry.book.root.scale.setScalar(entry.homeScale);
          entry.book.root.rotation.set(
            CLEAN_ROOM_REFERENCE.shelfRootRotationX,
            0,
            CLEAN_ROOM_REFERENCE.shelfRootRotationZ
          );
          entry.book.cover.position.set(shelfCoverOffset(), 0, 0);
          entry.book.cover.rotation.set(
            0,
            CLEAN_ROOM_REFERENCE.coverBaseRotationY,
            0
          );
        }
        entry.initialized = true;
      }
    });
    unitsPerPixel = worldUnitsPerPixel(camera, viewportHeight, shelfCenterDepth);
    syncInteractionBounds();
    wake(720);
  }

  const scheduleLayout = (): void => {
    if (layoutFrame) return;
    layoutFrame = window.requestAnimationFrame(layout);
  };
  requestRelayout = scheduleLayout;

  function animate(now: number): void {
    frameRequest = 0;
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

    const entryFrames = clamp(deltaSeconds * 60, 0.25, 4);
    if (!entryComplete && pressMode === "catalogue") {
      entrySpeed = Math.min(
        CLEAN_ROOM_MOTION.flightEaseCeiling,
        entrySpeed + CLEAN_ROOM_MOTION.flightEaseStep * entryFrames
      );
    }
    const entryApproach = entryComplete || reducedMotion.matches
      ? 1
      : 1 - Math.pow(1 - entrySpeed, entryFrames);
    let entryResidual = 0;
    entries.forEach((entry, index) => {
      if (pressMode === "volumes") {
        if (entry.sectionWeight <= 0) {
          setBookOpacity(entry, 0);
          return;
        }
        const live = index === currentRouteIndex;
        const targetRootRotationX = live
          ? CLEAN_ROOM_REFERENCE.activeRotationX
            + (narrow.matches ? CLEAN_ROOM_REFERENCE.narrowActivePitchOffset : 0)
          : 0;
        const targetRootRotationY = live
          ? CLEAN_ROOM_REFERENCE.activeRotationY + entry.sectionTurnY
          : 0;
        const targetRootRotationZ = live
          ? CLEAN_ROOM_REFERENCE.activeRotationZ
          : 0;
        const targetCoverRotationX = live ? volumePose.rotationX : 0;
        const targetCoverRotationY = CLEAN_ROOM_REFERENCE.coverBaseRotationY
          + (live ? volumePose.rotationY : 0);
        setActiveEulerOrders(entry.book);
        if (activeFlight?.direction === "to-volume" && activeFlight.index === index) {
          const approach = activeFlight.approach;
          entry.book.root.position.lerp(entry.sectionPosition, approach);
          const nextScale = mix(entry.book.root.scale.x, entry.sectionScale, approach);
          entry.book.root.scale.setScalar(nextScale);
          entry.book.root.rotation.x = mix(
            entry.book.root.rotation.x,
            targetRootRotationX,
            approach
          );
          entry.book.root.rotation.y = mix(
            entry.book.root.rotation.y,
            targetRootRotationY,
            approach
          );
          entry.book.root.rotation.z = mix(
            entry.book.root.rotation.z,
            targetRootRotationZ,
            approach
          );
          entry.book.cover.position.x = mix(
            entry.book.cover.position.x,
            0,
            approach
          );
          entry.book.cover.rotation.x = mix(
            entry.book.cover.rotation.x,
            targetCoverRotationX,
            approach
          );
          entry.book.cover.rotation.y = mix(
            entry.book.cover.rotation.y,
            targetCoverRotationY,
            approach
          );
          entry.book.cover.rotation.z = mix(entry.book.cover.rotation.z, 0, approach);
          const residual = Math.max(
            entry.book.root.position.distanceTo(entry.sectionPosition),
            Math.abs(entry.book.root.scale.x - entry.sectionScale) * 20,
            Math.abs(entry.book.root.rotation.x - targetRootRotationX) * 10,
            Math.abs(entry.book.root.rotation.y - targetRootRotationY) * 10,
            Math.abs(entry.book.root.rotation.z - targetRootRotationZ) * 10,
            Math.abs(entry.book.cover.position.x) * 10,
            Math.abs(entry.book.cover.rotation.x - targetCoverRotationX) * 10,
            Math.abs(entry.book.cover.rotation.y - targetCoverRotationY) * 10
          );
          entryResidual = Math.max(entryResidual, residual);
          if (residual < 0.012 && flight === activeFlight) flight = null;
        } else {
          entry.book.root.position.copy(entry.sectionPosition);
          entry.book.root.scale.setScalar(entry.sectionScale);
          entry.book.root.rotation.set(
            targetRootRotationX,
            targetRootRotationY,
            targetRootRotationZ
          );
          entry.book.cover.position.set(0, 0, 0);
          entry.book.cover.rotation.set(
            targetCoverRotationX,
            targetCoverRotationY,
            0
          );
        }
        setBookOpacity(entry, entry.sectionVisible ? 1 : 0);
        return;
      }

      const returnFlight = activeFlight?.direction === "to-catalogue"
        ? activeFlight
        : null;
      if (returnFlight) {
        const shelfY = entry.homePosition.y;
        setShelfEulerOrders(entry.book);
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
          entry.book.root.rotation.x = mix(
            entry.book.root.rotation.x,
            CLEAN_ROOM_REFERENCE.shelfRootRotationX,
            approach
          );
          entry.book.root.rotation.y = mix(entry.book.root.rotation.y, 0, approach);
          entry.book.root.rotation.z = mix(
            entry.book.root.rotation.z,
            CLEAN_ROOM_REFERENCE.shelfRootRotationZ,
            approach
          );
          entry.book.cover.position.x = mix(
            entry.book.cover.position.x,
            shelfCoverOffset(),
            approach
          );
          entry.book.cover.rotation.x = mix(entry.book.cover.rotation.x, 0, approach);
          entry.book.cover.rotation.y = mix(
            entry.book.cover.rotation.y,
            CLEAN_ROOM_REFERENCE.coverBaseRotationY,
            approach
          );
          entry.book.cover.rotation.z = mix(entry.book.cover.rotation.z, 0, approach);
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
          entry.book.root.rotation.set(
            CLEAN_ROOM_REFERENCE.shelfRootRotationX,
            0,
            CLEAN_ROOM_REFERENCE.shelfRootRotationZ
          );
          entry.book.cover.position.set(shelfCoverOffset(), 0, 0);
          entry.book.cover.rotation.set(
            0,
            CLEAN_ROOM_REFERENCE.coverBaseRotationY,
            0
          );
          setBookOpacity(entry, stackOpacity);
        }
        entryResidual = Math.max(
          entryResidual,
          Math.abs(entry.book.root.position.x - entry.homePosition.x),
          Math.abs(entry.book.root.position.y - shelfY),
          Math.abs(entry.book.root.position.z - entry.homePosition.z),
          Math.abs(entry.book.root.scale.x - entry.homeScale) * 20,
          Math.abs(
            entry.book.root.rotation.x - CLEAN_ROOM_REFERENCE.shelfRootRotationX
          ) * 10,
          Math.abs(entry.book.root.rotation.y) * 10,
          Math.abs(
            entry.book.root.rotation.z - CLEAN_ROOM_REFERENCE.shelfRootRotationZ
          ) * 10,
          Math.abs(entry.book.cover.position.x - shelfCoverOffset()) * 10,
          Math.abs(entry.book.cover.rotation.x) * 10,
          Math.abs(
            entry.book.cover.rotation.y - CLEAN_ROOM_REFERENCE.coverBaseRotationY
          ) * 10,
          Math.abs(entry.opacity - 1) * 10
        );
        return;
      }

      const activelyHeld = gesture?.index === index;
      const interactive = !reducedMotion.matches && (
        interactionSnapshot.hoverIndex === index
        || interactionSnapshot.focusIndex === index
        || activelyHeld
      );
      const holdTarget = activelyHeld
        || (index === returningIndex && returningPresentation);
      setShelfEulerOrders(entry.book);
      entry.hover = damp(entry.hover, interactive ? 1 : 0, interactive ? 9.2 : 6.8, deltaSeconds);
      entry.hold = damp(entry.hold, holdTarget ? 1 : 0, holdTarget ? 15 : 6.5, deltaSeconds);

      const evictionPixels = index === activeIndex
        ? 0
        : (activeIndex - index)
          * viewportHeight
          * CLEAN_ROOM_MOTION.stackEvictionViewports
          * holdIsolation;
      const targetY = entry.homePosition.y
        + (
          entry.hold * CLEAN_ROOM_MOTION.heldLiftPixels
        ) * unitsPerPixel
        + catalogueMotion.terminalTravel * unitsPerPixel
        + evictionPixels * unitsPerPixel;
      const targetDepth = entry.homePosition.z
        + (CLEAN_ROOM_REFERENCE.shelfHoverZ - entry.homePosition.z)
          * Math.max(entry.hover, entry.hold);

      const shelfApproach = entryComplete ? null : entryApproach;
      entry.book.root.position.x = shelfApproach === null
        ? damp(entry.book.root.position.x, entry.homePosition.x, 11.5, deltaSeconds)
        : mix(entry.book.root.position.x, entry.homePosition.x, shelfApproach);
      entry.book.root.position.y = shelfApproach === null
        ? damp(entry.book.root.position.y, targetY, 11.5, deltaSeconds)
        : mix(entry.book.root.position.y, targetY, shelfApproach);
      entry.book.root.position.z = shelfApproach === null
        ? frameApproach(
          entry.book.root.position.z,
          targetDepth,
          CLEAN_ROOM_MOTION.spineZEase,
          deltaSeconds
        )
        : mix(entry.book.root.position.z, targetDepth, shelfApproach);
      const nextScale = shelfApproach === null
        ? damp(entry.book.root.scale.x, entry.homeScale, 11, deltaSeconds)
        : mix(entry.book.root.scale.x, entry.homeScale, shelfApproach);
      entry.book.root.scale.setScalar(nextScale);
      entry.book.cover.position.x = damp(
        entry.book.cover.position.x,
        shelfCoverOffset(),
        13,
        deltaSeconds
      );
      entry.book.cover.position.y = 0;
      entry.book.cover.position.z = 0;
      entry.book.root.rotation.x = damp(
        entry.book.root.rotation.x,
        CLEAN_ROOM_REFERENCE.shelfRootRotationX
          + catalogueMotion.scrollVelocity * (1 - entry.hold),
        13,
        deltaSeconds
      );
      entry.book.root.rotation.y = damp(
        entry.book.root.rotation.y,
        0,
        13,
        deltaSeconds
      );
      entry.book.root.rotation.z = damp(
        entry.book.root.rotation.z,
        CLEAN_ROOM_REFERENCE.shelfRootRotationZ,
        13,
        deltaSeconds
      );
      if (activelyHeld && gesture) {
        entry.book.cover.rotation.x = wrapRotation(
          gesture.dx * CLEAN_ROOM_MOTION.volumeDragRate
        );
        entry.book.cover.rotation.y = wrapRotation(
          CLEAN_ROOM_REFERENCE.coverBaseRotationY
            - gesture.dy * CLEAN_ROOM_MOTION.volumeDragRate
        );
        entry.book.cover.rotation.z = 0;
      } else {
        entry.book.cover.rotation.x = damp(
          entry.book.cover.rotation.x,
          0,
          7.5,
          deltaSeconds
        );
        entry.book.cover.rotation.y = damp(
          entry.book.cover.rotation.y,
          CLEAN_ROOM_REFERENCE.coverBaseRotationY,
          7.5,
          deltaSeconds
        );
        entry.book.cover.rotation.z = damp(
          entry.book.cover.rotation.z,
          0,
          7.5,
          deltaSeconds
        );
      }
      setBookOpacity(entry, catalogueMotion.terminalSceneOpacity);

      entryResidual = Math.max(
        entryResidual,
        Math.abs(entry.book.root.position.y - targetY),
        Math.abs(entry.book.root.position.z - targetDepth),
        Math.abs(entry.book.root.scale.x - entry.homeScale)
      );
    });

    syncInteractionBounds();

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
      && entryResidual <= CLEAN_ROOM_MOTION.entrySettleEpsilon
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
  narrow.addEventListener("change", scheduleLayout);
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
          Number(book.root.rotation.x.toFixed(4)),
          Number(book.root.rotation.y.toFixed(4)),
          Number(book.root.rotation.z.toFixed(4))
        ],
        coverPosition: [
          Number(book.cover.position.x.toFixed(4)),
          Number(book.cover.position.y.toFixed(4)),
          Number(book.cover.position.z.toFixed(4))
        ],
        coverRotation: [
          Number(book.cover.rotation.x.toFixed(4)),
          Number(book.cover.rotation.y.toFixed(4)),
          Number(book.cover.rotation.z.toFixed(4))
        ],
        opacity: Number(opacity.toFixed(4)),
        material: {
          architecture: book.materialModel.architecture,
          mapCount: book.materialModel.mapCount,
          atlasSize: book.materialModel.atlasSize,
          thickness: book.materialModel.thickness,
          baseBump: book.materialModel.baseBump,
          responseSignature: book.materialModel.responseSignature
        },
        geometry: {
          meshCount: book.geometryModel.meshCount,
          vertexCount: book.geometryModel.vertexCount,
          triangleCount: book.geometryModel.triangleCount,
          objectName: book.geometryModel.objectName
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
        terminalTravel: Number(scroll.terminalTravel.toFixed(4)),
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
