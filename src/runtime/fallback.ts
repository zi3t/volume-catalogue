// @ts-nocheck
import armArt from "../assets/arm-volume.svg?url";
import notesArt from "../assets/notes-volume.svg?url";
import practiceArt from "../assets/practice-volume.svg?url";
import reflyArt from "../assets/refly-volume.svg?url";
import telemetryArt from "../assets/telemetry-volume.svg?url";

export const activateClassicFallback = () => {
  const stage = document.querySelector(".press-catalog");
  const rail = document.querySelector(".press-rail");
  const items = Array.from(document.querySelectorAll(".press-volume-item"));
  const links = items.map((item) => item.querySelector(".press-volume"));
  const railButtons = Array.from(document.querySelectorAll(".press-rail-item"));
  const railFills = Array.from(document.querySelectorAll(".press-rail .press-rail-fill"));
  if (!stage || !items.length || stage.dataset.pressFallbackActive === "true") {
    return false;
  }
  stage.dataset.pressFallbackActive = "true";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const compactLayout = window.matchMedia("(max-width: 780px)");
  const expandedPositions = [0, 1.37, 2.65, 3.78, 4.9];
  const compressedPositions = [0, 1.01, 1.89, 2.48, 3.27];
  const compressedScaleX = [0.83, 0.91, 0.78, 0.76, 0.74];
  const compressedScaleY = [0.78, 0.815, 0.47, 0.72, 0.69];
  const volumeMeta = [
    {
      title: "Re-fly the incident",
      meta: "Rust / WASM",
      serial: "01",
      background: "#b8ad58",
      ink: "#292a74",
      art: reflyArt
    },
    {
      title: "GLUON kinematics",
      meta: "Robotics / Rust",
      serial: "02",
      background: "#d6cda9",
      ink: "#29435c",
      art: armArt
    },
    {
      title: "Telemetry replay",
      meta: "C# / RabbitMQ",
      serial: "03",
      background: "#304255",
      ink: "#e5e6df",
      art: telemetryArt
    },
    {
      title: "Evidence over adjectives",
      meta: "Systems / Security",
      serial: "04",
      background: "#702c4d",
      ink: "#f0dfb4",
      art: practiceArt
    },
    {
      title: "Engineering notes",
      meta: "Replay / Verification",
      serial: "05",
      background: "#b37c3f",
      ink: "#26333d",
      art: notesArt
    }
  ];
  let pointerFrame = 0;
  let sceneFrame = 0;
  let accessTimer = 0;
  let currentIndex = 0;
  let transitionStarted = false;

  const setCurrentIndex = (index) => {
    currentIndex = Math.max(0, Math.min(items.length - 1, index));
    railButtons.forEach((button, buttonIndex) => {
      const current = buttonIndex === currentIndex;
      button.classList.toggle("is-current", current);
      if (current) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    });
  };

  const updateAccess = () => {
    items.forEach((item) => {
      const bounds = item.getBoundingClientRect();
      item.inert = bounds.bottom <= 0 || bounds.top >= window.innerHeight;
    });
  };

  const scheduleAccess = () => {
    updateAccess();
    clearTimeout(accessTimer);
    accessTimer = window.setTimeout(updateAccess, 480);
  };

  const updateScene = () => {
    sceneFrame = 0;

    if (compactLayout.matches || reduceMotion.matches) {
      stage.style.setProperty("--press-scroll-y", "0px");
      items.forEach((item) => {
        item.style.removeProperty("top");
        item.style.removeProperty("--press-scale-x");
        item.style.removeProperty("--press-scale-y");
      });
      setCurrentIndex(0);
      scheduleAccess();
      return;
    }

    const progress = Math.min(window.scrollY / 700, 1);
    const travel = window.scrollY * 0.0815;
    const volumeHeight = Number.parseFloat(getComputedStyle(items[1] || items[0]).height);

    stage.style.setProperty("--press-scroll-y", `${-travel.toFixed(2)}px`);
    items.forEach((item, index) => {
      const position = expandedPositions[index]
        + (compressedPositions[index] - expandedPositions[index]) * progress;
      const scaleX = 1 + (compressedScaleX[index] - 1) * progress;
      const scaleY = 1 + (compressedScaleY[index] - 1) * progress;
      const firstVolumeOffset = index === 0 ? 6 * (1 - progress) : 0;
      item.style.top = `${(position * volumeHeight + firstVolumeOffset).toFixed(2)}px`;
      item.style.setProperty("--press-scale-x", scaleX.toFixed(3));
      item.style.setProperty("--press-scale-y", scaleY.toFixed(3));
    });
    setCurrentIndex(Math.round(progress * (items.length - 1)));
    scheduleAccess();
  };

  const scheduleScene = () => {
    if (sceneFrame) return;
    sceneFrame = requestAnimationFrame(updateScene);
  };

  const setPointer = (event) => {
    if (event.pointerType !== "mouse" || reduceMotion.matches || transitionStarted) return;
    if (pointerFrame) cancelAnimationFrame(pointerFrame);

    pointerFrame = requestAnimationFrame(() => {
      const bounds = stage.getBoundingClientRect();
      const x = (event.clientX - bounds.left) / bounds.width - 0.5;
      const y = (event.clientY - bounds.top) / bounds.height - 0.5;
      stage.style.setProperty("--press-shift-x", `${(x * 10).toFixed(2)}px`);
      stage.style.setProperty("--press-shift-y", `${(y * 6).toFixed(2)}px`);
      pointerFrame = 0;
    });
  };

  const resetPointer = () => {
    stage.style.setProperty("--press-shift-x", "0px");
    stage.style.setProperty("--press-shift-y", "0px");
  };

  const previewRailItem = (index) => {
    if (compactLayout.matches || transitionStarted) return;
    stage.classList.add("is-index-preview");
    document.body.classList.add("press-index-preview");

    railButtons.forEach((button, buttonIndex) => {
      button.classList.toggle("is-preview", buttonIndex === index);
    });

    railFills.forEach((fill, fillIndex) => {
      const distance = Math.abs(index - fillIndex);
      const scale = Math.max(1, Math.cos(distance / railFills.length * Math.PI) * 2 + 2.5);
      fill.style.setProperty("--rail-scale", scale.toFixed(3));
    });
  };

  const closeRailPreview = () => {
    stage.classList.remove("is-index-preview");
    document.body.classList.remove("press-index-preview");
    railButtons.forEach((button) => button.classList.remove("is-preview"));
    railFills.forEach((fill) => fill.style.setProperty("--rail-scale", "1"));
  };

  const hasModifiedClick = (event) => (
    event.button > 0
    || event.metaKey
    || event.ctrlKey
    || event.shiftKey
    || event.altKey
  );

  const openVolume = (index, event) => {
    const link = links[index];
    if (!link || transitionStarted || (event && hasModifiedClick(event))) return;
    if (event) event.preventDefault();

    transitionStarted = true;
    stage.classList.add("is-transitioning");
    resetPointer();
    const rect = items[index].getBoundingClientRect();

    if (window.PressTransition) {
      window.PressTransition.depart({
        index,
        link,
        rect,
        meta: volumeMeta[index]
      });
    } else {
      window.location.href = link.href;
    }
  };

  railButtons.forEach((button, index) => {
    button.addEventListener("pointerenter", () => previewRailItem(index));
    button.addEventListener("focus", () => previewRailItem(index));
    button.addEventListener("blur", closeRailPreview);
    button.addEventListener("click", (event) => openVolume(index, event));
  });

  links.forEach((link, index) => {
    link.addEventListener("mouseenter", () => setCurrentIndex(index));
    link.addEventListener("focus", () => setCurrentIndex(index));
    link.addEventListener("click", (event) => openVolume(index, event));
  });

  if (rail) rail.addEventListener("pointerleave", closeRailPreview);
  stage.addEventListener("pointermove", setPointer, { passive: true });
  stage.addEventListener("pointerleave", resetPointer);
  window.addEventListener("scroll", scheduleScene, { passive: true });
  window.addEventListener("resize", scheduleScene, { passive: true });
  reduceMotion.addEventListener("change", scheduleScene);
  compactLayout.addEventListener("change", scheduleScene);
  window.addEventListener("pageshow", () => {
    transitionStarted = false;
    stage.classList.remove("is-transitioning");
    closeRailPreview();
    if (window.PressTransition) window.PressTransition.returnHome();
  });

  setCurrentIndex(0);
  scheduleScene();
  return true;
};
