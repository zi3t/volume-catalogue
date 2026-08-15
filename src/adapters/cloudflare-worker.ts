import type { VolumeDefinition } from "../content/volumes";
import { withTrailingSlash } from "../content/volumes";

export interface CloudflareCatalogueOptions<Environment> {
  readonly siteName: string;
  readonly cataloguePath: string;
  readonly volumes: readonly VolumeDefinition[];
  readonly assets: (environment: Environment) => Fetcher;
}

class RewriteShellMetadata implements HTMLRewriterElementContentHandlers {
  constructor(
    private readonly route: VolumeDefinition,
    private readonly routeUrl: string,
    private readonly siteName: string
  ) {}

  element(element: Element): void {
    const tag = element.tagName;
    if (tag === "title") {
      element.setInnerContent(`${this.route.title} — ${this.siteName}`);
      return;
    }
    if (tag === "link" && element.getAttribute("rel") === "canonical") {
      element.setAttribute("href", this.routeUrl);
      return;
    }
    if (tag !== "meta") return;

    const property = element.getAttribute("property") ?? element.getAttribute("name");
    if (property === "og:url") {
      element.setAttribute("content", this.routeUrl);
    } else if (property === "og:title" || property === "twitter:title") {
      element.setAttribute("content", `${this.route.title} — ${this.siteName}`);
    } else if (property === "og:description" || property === "description") {
      element.setAttribute("content", this.route.description);
    }
  }
}

/**
 * Serves the same package-owned demo shell for the catalogue and its deep
 * links. Host pages are never fetched, parsed, or injected into the demo.
 */
export const createCloudflareCatalogueWorker = <Environment>(
  options: CloudflareCatalogueOptions<Environment>
): ExportedHandler<Environment> => {
  const cataloguePath = withTrailingSlash(options.cataloguePath);
  const bookRoutes = new Map(
    options.volumes.map((volume) => [withTrailingSlash(volume.routeUrl), volume])
  );

  return {
    async fetch(request, environment): Promise<Response> {
      const assets = options.assets(environment);
      const url = new URL(request.url);
      const normalizedPath = withTrailingSlash(url.pathname);
      const route = bookRoutes.get(normalizedPath);
      const isCatalogue = normalizedPath === cataloguePath;

      if ((!route && !isCatalogue) || request.method !== "GET") {
        return assets.fetch(request);
      }

      const shellUrl = new URL(url);
      shellUrl.pathname = cataloguePath;
      shellUrl.search = "";
      const shell = await assets.fetch(new Request(shellUrl, request));
      if (!shell.ok) return assets.fetch(request);

      const response = new Response(shell.body, shell);
      response.headers.set("content-type", "text/html; charset=utf-8");
      response.headers.delete("etag");
      response.headers.delete("last-modified");
      response.headers.set("cache-control", "no-cache");

      if (!route) return response;

      const canonical = `${url.origin}${url.pathname}`;
      const metadata = new RewriteShellMetadata(route, canonical, options.siteName);
      return new HTMLRewriter()
        .on("title", metadata)
        .on('link[rel="canonical"]', metadata)
        .on("meta", metadata)
        .transform(response);
    }
  };
};
