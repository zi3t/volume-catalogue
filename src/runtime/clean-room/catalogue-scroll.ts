import { CLEAN_ROOM_MOTION, clamp, mix, smooth } from "./motion";
import type { CleanRoomPressMode } from "./routing";

export interface CleanRoomCatalogueScrollSnapshot {
  readonly currentIndex: number;
  readonly currentScrollStep: number;
  readonly stackShift: number;
  readonly scrollVelocity: number;
  readonly terminalProgress: number;
  readonly terminalTravel: number;
  readonly terminalSceneOpacity: number;
  readonly mainHeight: number;
}

interface CleanRoomCatalogueScrollOptions {
  readonly items: readonly HTMLElement[];
  readonly stage: HTMLElement;
  readonly compact: MediaQueryList;
  readonly reducedMotion: MediaQueryList;
  readonly mode: () => CleanRoomPressMode;
  readonly onCurrentIndex: (index: number) => void;
}

export interface CleanRoomCatalogueScrollController {
  update: () => CleanRoomCatalogueScrollSnapshot;
  advance: (deltaSeconds: number) => CleanRoomCatalogueScrollSnapshot;
  snapshot: () => CleanRoomCatalogueScrollSnapshot;
}

const emptySnapshot = (): CleanRoomCatalogueScrollSnapshot => ({
  currentIndex: 0,
  currentScrollStep: 1,
  stackShift: 0,
  scrollVelocity: 0,
  terminalProgress: 0,
  terminalTravel: 0,
  terminalSceneOpacity: 1,
  mainHeight: 0
});

export const installCleanRoomCatalogueScroll = (
  options: CleanRoomCatalogueScrollOptions
): CleanRoomCatalogueScrollController => {
  const main = document.querySelector<HTMLElement>(".home-page main");
  const list = document.querySelector<HTMLElement>(".press-volume-list");
  const volumes = document.querySelector<HTMLElement>(".press-volumes");
  const signaturePanel = document.querySelector<HTMLElement>(".signature-section");
  const signalPanel = document.querySelector<HTMLElement>(".press-signal-section");
  const closingPanel = document.querySelector<HTMLElement>(".home-closing");
  const footerPanel = document.querySelector<HTMLElement>(".home-footer");
  let state = emptySnapshot();
  let lastScrollY = window.scrollY;
  let reportedIndex = -1;

  document.body.classList.remove("press-terminal-active", "press-terminal-closing");
  if (closingPanel) closingPanel.inert = true;
  if (footerPanel) footerPanel.inert = true;

  const updateTerminal = (progress: number): void => {
    const terminalProgress = clamp(progress, 0, 1);
    const terminalTravel = terminalProgress
      * window.innerHeight
      * CLEAN_ROOM_MOTION.terminalScrollViewports;
    const terminalScreens = terminalTravel / Math.max(1, window.innerHeight);
    // The reference keeps the outgoing object and the next scene on one
    // continuous vertical track. The film poster starts immediately after the
    // fifth book. The signal environment and light closing surface follow it
    // on that same one-pixel-per-pixel track.
    const terminalActive = terminalTravel > 0.5;
    const terminalOpacity = smooth(clamp(terminalScreens / 0.06, 0, 1));
    const terminalSceneOpacity = 1;

    signaturePanel?.style.setProperty("--press-terminal-opacity", terminalOpacity.toFixed(4));
    signalPanel?.style.setProperty("--press-terminal-opacity", terminalOpacity.toFixed(4));
    options.stage.style.setProperty("--press-terminal-book-clip", "0%");
    closingPanel?.style.setProperty("--press-terminal-opacity", terminalOpacity.toFixed(4));
    footerPanel?.style.setProperty("--press-terminal-opacity", terminalOpacity.toFixed(4));
    const controlsOpacity = 1 - smooth(clamp((terminalScreens - 2.08) / 0.34, 0, 1));
    options.stage.style.setProperty(
      "--press-terminal-controls-opacity",
      controlsOpacity.toFixed(4)
    );
    document.documentElement.style.setProperty(
      "--press-terminal-controls-opacity",
      controlsOpacity.toFixed(4)
    );

    const active = terminalActive;
    // Keep the masthead and controls in their dark-surface colours while the
    // light page is only entering at the bottom. They switch only when that
    // surface reaches the fixed header, as on the reference.
    const closing = terminalScreens > 2.42;
    document.body.classList.toggle("press-terminal-active", active);
    document.body.classList.toggle("press-terminal-closing", closing);
    if (closingPanel) closingPanel.inert = !closing;
    if (footerPanel) footerPanel.inert = !closing;
    state = { ...state, terminalProgress, terminalTravel, terminalSceneOpacity };
  };

  const updateAccess = (mode: CleanRoomPressMode): void => {
    options.items.forEach((item) => {
      item.inert = mode === "volumes"
        || state.terminalProgress > 0.04;
    });
  };

  const reportCurrentIndex = (index: number): void => {
    if (index === reportedIndex) return;
    reportedIndex = index;
    options.onCurrentIndex(index);
  };

  const update = (): CleanRoomCatalogueScrollSnapshot => {
    const mode = options.mode();
    const nextScrollY = window.scrollY;
    const scrollDelta = lastScrollY - nextScrollY;
    lastScrollY = nextScrollY;

    if (!main || !list || options.reducedMotion.matches) {
      main?.style.removeProperty("height");
      list?.style.setProperty("--press-stack-shift", "0px");
      state = {
        ...state,
        currentIndex: 0,
        currentScrollStep: 1,
        stackShift: 0,
        scrollVelocity: 0,
        mainHeight: main?.getBoundingClientRect().height ?? 0
      };
      updateTerminal(0);
      if (mode === "catalogue") reportCurrentIndex(0);
      updateAccess(mode);
      return state;
    }

    const compact = options.compact.matches;
    const currentScrollStep = window.innerHeight * (compact ? 0.225 : 0.213);
    if (mode === "volumes") {
      const volumeHeight = volumes?.offsetHeight ?? 0;
      main.style.height = `${Math.ceil(volumeHeight)}px`;
      list.style.setProperty("--press-stack-shift", "0px");
      state = {
        ...state,
        currentScrollStep,
        stackShift: 0,
        scrollVelocity: 0,
        mainHeight: main.getBoundingClientRect().height
      };
      updateTerminal(0);
      updateAccess(mode);
      return state;
    }

    if (Math.abs(scrollDelta) > 0.01) {
      state = {
        ...state,
        scrollVelocity: clamp(
          scrollDelta * CLEAN_ROOM_MOTION.scrollVelocityPerPixel,
          -CLEAN_ROOM_MOTION.scrollVelocityLimit,
          CLEAN_ROOM_MOTION.scrollVelocityLimit
        )
      };
    }
    const catalogueMaximum = currentScrollStep * Math.max(0, options.items.length - 1);
    const terminalLength = compact
      ? 0
      : window.innerHeight * CLEAN_ROOM_MOTION.terminalScrollViewports;
    main.style.height = `${Math.round(window.innerHeight + catalogueMaximum + terminalLength)}px`;
    const catalogueScroll = Math.min(window.scrollY, catalogueMaximum);
    const floatingIndex = clamp(
      catalogueScroll / currentScrollStep,
      0,
      Math.max(0, options.items.length - 1)
    );
    const lower = Math.floor(floatingIndex);
    const upper = Math.min(options.items.length - 1, lower + 1);
    const local = floatingIndex - lower;
    const lowerOffset = options.items[lower]?.offsetTop ?? 0;
    const upperOffset = options.items[upper]?.offsetTop ?? lowerOffset;
    const stackShift = mix(lowerOffset, upperOffset, local);
    const currentIndex = Math.round(floatingIndex);
    list.style.setProperty("--press-stack-shift", `${-stackShift.toFixed(2)}px`);
    state = {
      ...state,
      currentIndex,
      currentScrollStep,
      stackShift,
      mainHeight: main.getBoundingClientRect().height
    };
    reportCurrentIndex(currentIndex);
    updateTerminal(
      compact || terminalLength <= 0
        ? 0
        : (window.scrollY - catalogueMaximum) / terminalLength
    );
    updateAccess(mode);
    return state;
  };

  const advance = (deltaSeconds: number): CleanRoomCatalogueScrollSnapshot => {
    const frames = clamp(deltaSeconds * 60, 0.25, 4);
    const velocity = state.scrollVelocity
      * Math.pow(CLEAN_ROOM_MOTION.scrollVelocityDecay, frames);
    state = {
      ...state,
      scrollVelocity: Math.abs(velocity) < 0.0001 ? 0 : velocity
    };
    return state;
  };

  return {
    update,
    advance,
    snapshot: () => state
  };
};
