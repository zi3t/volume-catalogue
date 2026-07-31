import { cp, mkdir, rm } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { packageRoot, resolveZi3tSiteRoot } from "./site-root.mjs";

const siteRoot = await resolveZi3tSiteRoot();
const source = resolve(packageRoot, "dist");
const destination = resolve(siteRoot, "public/press-assets");

if (basename(destination) !== "press-assets") {
  throw new Error(`Refusing to replace unexpected site directory: ${destination}`);
}

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(source, destination, {
  recursive: true,
  filter: (sourcePath) => {
    const name = basename(sourcePath);
    if (name.endsWith(".map")) return false;
    if (name === "index.js" || name === "cloudflare-worker.js") return false;
    if (name.startsWith("volumes-") && name.endsWith(".js")) return false;
    return true;
  }
});
