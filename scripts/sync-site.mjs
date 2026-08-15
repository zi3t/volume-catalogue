import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { packageRoot, resolveZi3tSiteRoot } from "./site-root.mjs";

const siteRoot = await resolveZi3tSiteRoot();
const source = resolve(packageRoot, "dist");
const destination = resolve(siteRoot, "public/press-assets");
const shellSource = resolve(packageRoot, "index.html");
const shellDestination = resolve(siteRoot, "public/press/index.html");

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

const shell = (await readFile(shellSource, "utf8"))
  .replace(
    '<link rel="stylesheet" href="/src/styles/catalogue.css">',
    '<link rel="stylesheet" href="/press-assets/volume-catalogue.css?v=0.2.0">'
  )
  .replace(
    '<link rel="stylesheet" href="/src/styles/volume-sections.css">',
    '<link rel="stylesheet" href="/press-assets/volume-catalogue-volumes.css?v=0.2.0">'
  )
  .replace(
    '<script type="module" src="/src/site-entry.ts"></script>',
    '<script type="module" src="/press-assets/site-entry.js?v=0.2.0"></script>'
  );

await mkdir(resolve(siteRoot, "public/press"), { recursive: true });
await writeFile(shellDestination, shell);
