import { initializeRevealMotion } from "./runtime/reveal";

const start = async (): Promise<void> => {
  initializeRevealMotion();
  const cleanRoom = new URLSearchParams(window.location.search)
    .get("press-renderer") === "clean-room";
  if (cleanRoom) {
    const { mountCleanRoomCatalogue } = await import("./runtime/clean-room");
    mountCleanRoomCatalogue();
    return;
  }
  const { mountVolumeCatalogue } = await import("./runtime/catalogue");
  mountVolumeCatalogue();
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void start(), { once: true });
} else {
  void start();
}
