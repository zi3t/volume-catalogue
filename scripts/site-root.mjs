import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const packageRoot = fileURLToPath(new URL("../", import.meta.url));

const hasSiteMarkers = async (candidate) => {
  try {
    await Promise.all([
      access(resolve(candidate, "wrangler.jsonc")),
      access(resolve(candidate, "public/press/index.html"))
    ]);
    return true;
  } catch {
    return false;
  }
};

export const resolveZi3tSiteRoot = async () => {
  const configuredRoot = process.env.ZI3T_SITE_ROOT;
  const candidates = configuredRoot
    ? [resolve(configuredRoot)]
    : [
        resolve(packageRoot, "../zi3t"),
        resolve(packageRoot, "../..")
      ];

  for (const candidate of candidates) {
    if (await hasSiteMarkers(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    "Could not locate the zi3t.io checkout. Set ZI3T_SITE_ROOT to its absolute path."
  );
};

