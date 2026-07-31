import { mountVolumeCatalogue } from "./runtime/catalogue";
import { initializeRevealMotion } from "./runtime/reveal";

const start = (): void => {
  initializeRevealMotion();
  mountVolumeCatalogue();
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
