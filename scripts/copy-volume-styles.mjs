import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(
  new URL("../src/styles/volume-sections.css", import.meta.url)
);
const destination = fileURLToPath(
  new URL("../dist/volume-catalogue-volumes.css", import.meta.url)
);

await mkdir(fileURLToPath(new URL("../dist/", import.meta.url)), {
  recursive: true
});
await copyFile(source, destination);
