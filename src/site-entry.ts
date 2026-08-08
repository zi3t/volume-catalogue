import { initializeRevealMotion } from "./runtime/reveal";

const start = async (): Promise<void> => {
  initializeRevealMotion();
  const { mountCleanRoomCatalogue } = await import("./runtime/clean-room");
  mountCleanRoomCatalogue();
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void start(), { once: true });
} else {
  void start();
}
