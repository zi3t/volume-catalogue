import { initializeRevealMotion } from "./runtime/reveal";
import { demoVolumeProfiles } from "./runtime/clean-room/profiles";

const releaseStartupGate = (fallback = false): void => {
  const root = document.documentElement;
  root.classList.remove("press-startup-pending");
  if (fallback) root.classList.add("press-startup-fallback");
};

const start = async (): Promise<void> => {
  try {
    initializeRevealMotion();
    const { mountCleanRoomCatalogue } = await import("./runtime/clean-room");
    if (!mountCleanRoomCatalogue({ profiles: demoVolumeProfiles })) {
      releaseStartupGate(true);
    }
  } catch (error) {
    releaseStartupGate(true);
    console.warn("Press scene failed to initialise; showing the DOM fallback.", error);
  }
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void start(), { once: true });
} else {
  void start();
}
