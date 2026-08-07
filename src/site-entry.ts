import { initializeRevealMotion } from "./runtime/reveal";

const start = async (): Promise<void> => {
  initializeRevealMotion();
  // The clean-room renderer is the default. `?press-renderer=accepted` still
  // reaches the previous one, which keeps the comparison available for the
  // parity harness and leaves a way back without a deploy.
  const accepted = new URLSearchParams(window.location.search)
    .get("press-renderer") === "accepted";
  if (accepted) {
    const { mountVolumeCatalogue } = await import("./runtime/catalogue");
    mountVolumeCatalogue();
    return;
  }
  const { mountCleanRoomCatalogue } = await import("./runtime/clean-room");
  mountCleanRoomCatalogue();
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void start(), { once: true });
} else {
  void start();
}
