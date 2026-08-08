export type CleanRoomPressMode = "catalogue" | "volumes";

export type CleanRoomRouteSource =
  | "pick"
  | "rail"
  | "keyboard"
  | "back-control"
  | "popstate"
  | "deep-link"
  | "scroll";

export interface CleanRoomRouteSnapshot {
  readonly mode: CleanRoomPressMode;
  readonly currentIndex: number;
  readonly currentAddress: string;
  readonly pendingDeepLinkIndex: number;
  readonly catalogueScrollY: number;
}

interface CleanRoomRouteCallbacks {
  readonly items: readonly HTMLElement[];
  readonly links: readonly HTMLAnchorElement[];
  readonly onBeforeVolume: (index: number, source: CleanRoomRouteSource) => void;
  readonly onBeforeCatalogue: (index: number, source: CleanRoomRouteSource) => void;
  readonly onModeChange: (
    mode: CleanRoomPressMode,
    previous: CleanRoomPressMode,
    source: CleanRoomRouteSource
  ) => void;
  readonly onIndexChange: (index: number, source: CleanRoomRouteSource) => void;
  readonly onWake: (duration?: number) => void;
}

export interface CleanRoomRouteController {
  readonly sections: readonly HTMLElement[];
  readonly figures: readonly (HTMLElement | null)[];
  readonly available: boolean;
  snapshot: () => CleanRoomRouteSnapshot;
  activate: (index: number, event?: MouseEvent) => boolean;
  setCatalogueIndex: (index: number) => void;
  settlePendingDeepLink: () => boolean;
  updateLayout: () => void;
}

interface ModifiedInputEvent {
  readonly button?: number;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
}

const hasModifiedClick = (event: ModifiedInputEvent): boolean => (
  (event.button ?? 0) > 0
  || event.metaKey
  || event.ctrlKey
  || event.shiftKey
  || event.altKey
);

const instantScroll = (top: number): void => {
  window.scrollTo({ top, behavior: "instant" });
};

export const installCleanRoomRouting = (
  callbacks: CleanRoomRouteCallbacks
): CleanRoomRouteController => {
  const root = document.documentElement;
  const main = document.querySelector<HTMLElement>(".home-page main");
  const volumes = document.querySelector<HTMLElement>(".press-volumes");
  const sections = Array.from(
    document.querySelectorAll<HTMLElement>(".press-volume-section")
  );
  const figures = sections.map((section) => (
    section.querySelector<HTMLElement>(".press-volume-figure")
  ));
  const rail = document.querySelector<HTMLElement>(".press-rail");
  const railButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>(".press-rail-item")
  );
  const backButton = document.querySelector<HTMLButtonElement>(".press-back");
  const configuredCatalogue = document.body.dataset.pressCatalogue ?? "/press/";
  const cataloguePath = configuredCatalogue === "/"
    ? "/"
    : `${configuredCatalogue.replace(/\/+$/, "")}/`;
  const routePaths = callbacks.links.map((link) => new URL(
    link.dataset.pressRoute ?? link.href,
    window.location.href
  ).pathname);

  const cleanAddress = (pathname: string): string => {
    const url = new URL(pathname, window.location.href);
    url.search = "";
    return `${url.pathname}${url.search}${url.hash}`;
  };
  const volumeAddress = (index: number): string => cleanAddress(routePaths[index] ?? cataloguePath);
  const catalogueAddress = cleanAddress(cataloguePath);
  const pathIndex = (): number => routePaths.indexOf(window.location.pathname);
  const deepLinkIndex = pathIndex();
  let mode: CleanRoomPressMode = deepLinkIndex >= 0 ? "volumes" : "catalogue";
  let currentIndex = Math.max(0, deepLinkIndex);
  let currentAddress = cleanAddress(`${window.location.pathname}${window.location.hash}`);
  let pendingDeepLinkIndex = deepLinkIndex;
  let catalogueScrollY = Number(history.state?.pressScrollY) || window.scrollY;

  const available = Boolean(
    main
    && volumes
    && sections.length === callbacks.items.length
    && figures.length === callbacks.items.length
  );

  if (available && main && rail && backButton && !rail.closest(".press-route-controls")) {
    const controls = document.createElement("div");
    controls.className = "press-route-controls";
    main.append(controls);
    controls.append(backButton, rail);
  }

  const updateDocumentHeight = (): void => {
    if (!available || !main || !volumes) return;
    if (mode === "volumes") {
      main.style.height = `${Math.ceil(volumes.offsetHeight)}px`;
    } else {
      main.style.removeProperty("height");
    }
  };

  const updateAccess = (): void => {
    callbacks.items.forEach((item) => {
      item.inert = mode === "volumes";
    });
  };

  const setCurrentIndex = (next: number, source: CleanRoomRouteSource): void => {
    const bounded = Math.min(callbacks.items.length - 1, Math.max(0, next));
    currentIndex = bounded;
    const section = sections[bounded];
    if (section) {
      root.style.setProperty(
        "--press-active-ink",
        getComputedStyle(section).getPropertyValue("--press-volume-ink").trim()
      );
    }
    railButtons.forEach((button, index) => {
      const current = index === bounded;
      button.classList.toggle("is-current", current);
      if (current) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    });
    callbacks.onIndexChange(bounded, source);
  };

  const setMode = (next: CleanRoomPressMode, source: CleanRoomRouteSource): void => {
    const previous = mode;
    mode = next;
    root.classList.toggle("press-volumes-open", next === "volumes");
    root.classList.toggle("press-in-volumes", next === "volumes");
    updateDocumentHeight();
    updateAccess();
    if (previous !== next) callbacks.onModeChange(next, previous, source);
  };

  const sectionScrollTop = (index: number): number => {
    const section = sections[index];
    return section ? section.getBoundingClientRect().top + window.scrollY : 0;
  };

  const scrollToVolume = (index: number): boolean => {
    if (!sections[index]) return false;
    instantScroll(sectionScrollTop(index));
    return true;
  };

  const goToVolume = (index: number, source: CleanRoomRouteSource): boolean => {
    if (!available || !sections[index]) return false;
    if (mode === "catalogue") {
      catalogueScrollY = window.scrollY;
      history.replaceState(
        { ...(history.state ?? {}), pressHome: true, pressScrollY: catalogueScrollY },
        "",
        currentAddress
      );
    }
    callbacks.onBeforeVolume(index, source);
    const address = volumeAddress(index);
    history.pushState({ pressVolume: index }, "", address);
    currentAddress = address;
    setCurrentIndex(index, source);
    setMode("volumes", source);
    scrollToVolume(index);
    callbacks.onWake(1400);
    return true;
  };

  const returnToCatalogue = (source: CleanRoomRouteSource): boolean => {
    if (!available || mode !== "volumes") return false;
    const index = currentIndex;
    callbacks.onBeforeCatalogue(index, source);
    history.pushState({ pressHome: true, pressScrollY: catalogueScrollY }, "", catalogueAddress);
    currentAddress = catalogueAddress;
    setMode("catalogue", source);
    const slot = window.innerHeight * (window.innerWidth <= 899 ? 0.225 : 0.213) * index;
    instantScroll(slot);
    setCurrentIndex(index, source);
    callbacks.onWake(1800);
    return true;
  };

  const activate = (index: number, event?: MouseEvent): boolean => {
    if (event && (event.defaultPrevented || hasModifiedClick(event))) return false;
    if (!available) return false;
    event?.preventDefault();
    return goToVolume(index, "pick");
  };

  backButton?.addEventListener("click", (event) => {
    event.preventDefault();
    returnToCatalogue("back-control");
  });

  railButtons.forEach((button, index) => {
    button.addEventListener("click", (event) => {
      if (hasModifiedClick(event)) return;
      event.preventDefault();
      goToVolume(index, "rail");
    });
  });

  window.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || hasModifiedClick(event) || mode !== "volumes") return;
    const target = event.target;
    if (target instanceof HTMLElement && (
      target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)
    )) return;
    if (event.key === "Escape") {
      event.preventDefault();
      returnToCatalogue("keyboard");
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const next = currentIndex + (event.key === "ArrowDown" ? 1 : -1);
    if (next < 0 || next >= sections.length) return;
    event.preventDefault();
    goToVolume(next, "keyboard");
  });

  window.addEventListener("popstate", (event) => {
    currentAddress = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const index = pathIndex();
    if (index >= 0 && sections[index]) {
      callbacks.onBeforeVolume(index, "popstate");
      setCurrentIndex(index, "popstate");
      setMode("volumes", "popstate");
      scrollToVolume(index);
      callbacks.onWake(1400);
      return;
    }
    callbacks.onBeforeCatalogue(currentIndex, "popstate");
    setMode("catalogue", "popstate");
    catalogueScrollY = Number(event.state?.pressScrollY) || 0;
    instantScroll(catalogueScrollY);
    callbacks.onWake(1800);
  });

  if (available) {
    const crossing = new Set<Element>();
    const observer = new IntersectionObserver((records) => {
      records.forEach((record) => {
        if (record.isIntersecting) crossing.add(record.target);
        else crossing.delete(record.target);
      });
      if (mode !== "volumes" || pendingDeepLinkIndex >= 0) return;
      const section = sections.find((candidate) => crossing.has(candidate));
      if (!section) return;
      const index = sections.indexOf(section);
      const address = volumeAddress(index);
      if (address === currentAddress) return;
      currentAddress = address;
      history.replaceState(
        { ...(history.state ?? {}), pressVolume: index },
        "",
        address
      );
      setCurrentIndex(index, "scroll");
      callbacks.onWake(500);
    }, { rootMargin: "-50% 0px -50% 0px", threshold: 0 });
    sections.forEach((section) => observer.observe(section));
  }

  const settlePendingDeepLink = (): boolean => {
    if (pendingDeepLinkIndex < 0) return false;
    const index = pendingDeepLinkIndex;
    pendingDeepLinkIndex = -1;
    updateDocumentHeight();
    scrollToVolume(index);
    callbacks.onWake(900);
    return true;
  };

  if (available) {
    history.scrollRestoration = "manual";
    if (deepLinkIndex >= 0) {
      history.replaceState({ pressVolume: deepLinkIndex }, "", currentAddress);
      callbacks.onBeforeVolume(deepLinkIndex, "deep-link");
      setCurrentIndex(deepLinkIndex, "deep-link");
      setMode("volumes", "deep-link");
    } else {
      history.replaceState(
        { ...(history.state ?? {}), pressHome: true, pressScrollY: catalogueScrollY },
        "",
        currentAddress
      );
      pendingDeepLinkIndex = -1;
      setCurrentIndex(0, "deep-link");
      setMode("catalogue", "deep-link");
    }
  }

  return {
    sections,
    figures,
    available,
    snapshot: () => ({
      mode,
      currentIndex,
      currentAddress,
      pendingDeepLinkIndex,
      catalogueScrollY
    }),
    activate,
    setCatalogueIndex: (index: number) => {
      if (mode === "catalogue") setCurrentIndex(index, "scroll");
    },
    settlePendingDeepLink,
    updateLayout: updateDocumentHeight
  };
};
