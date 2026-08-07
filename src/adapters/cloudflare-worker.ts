import type { VolumeDefinition } from "../content/volumes";
import { withTrailingSlash } from "../content/volumes";

export interface CloudflareCatalogueOptions<Environment> {
  readonly siteName: string;
  readonly cataloguePath: string;
  readonly volumes: readonly VolumeDefinition[];
  readonly contentStylesheets: readonly string[];
  readonly volumeStylesheet: string;
  readonly assets: (environment: Environment) => Fetcher;
}

const escapeHtml = (value: unknown): string => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

/**
 * Every embedded page marks its content `<main id="main">`. Namespacing keeps
 * those ids, anchor targets, and accessible relationships local to a volume.
 */
export const namespaceIds = (html: string, slug: string): string => html
  .replace(/\bid="([^"]+)"/g, (_, id: string) => `id="${slug}-${id}"`)
  .replace(
    /\b(for|aria-labelledby|aria-describedby|aria-controls|aria-owns)="([^"]+)"/g,
    (_, attribute: string, ids: string) => `${attribute}="${ids
      .split(/\s+/)
      .map((id) => `${slug}-${id}`)
      .join(" ")}"`
  )
  .replace(/\bhref="#([^"]+)"/g, (_, id: string) => `href="#${slug}-${id}"`);

export const extractMain = (html: string): string => {
  const match = /<main\b[^>]*>([\s\S]*)<\/main>/i.exec(html);
  return match?.[1] ?? "";
};

export const renderVolumeSection = (
  volume: VolumeDefinition,
  content: string
): string => `
<section class="press-volume-section press-volume-section--${escapeHtml(volume.slug)}"
         id="volume-${escapeHtml(volume.slug)}"
         data-press-volume="${escapeHtml(volume.routeUrl)}"
         data-press-slug="${escapeHtml(volume.slug)}"
         aria-labelledby="volume-${escapeHtml(volume.slug)}-title">
  <div class="press-volume-stage">
    <div class="press-volume-figure" aria-hidden="true"></div>
    <div class="press-volume-detail">
      <p class="press-volume-kicker">${escapeHtml(volume.spine.eyebrow)}</p>
      <h2 class="press-volume-title" id="volume-${escapeHtml(volume.slug)}-title">${escapeHtml(volume.title)}</h2>
      <p class="press-volume-summary">${escapeHtml(volume.description)}</p>
      <p class="press-volume-actions"><a href="${escapeHtml(volume.contentPath)}">Open ${escapeHtml(volume.routeMode)} page</a></p>
      <dl class="press-volume-meta">
        <div><dt>Volume</dt><dd>${escapeHtml(volume.spine.serial)}</dd></div>
        <div><dt>Format</dt><dd>${escapeHtml(volume.routeMode)}</dd></div>
      </dl>
    </div>
  </div>
  <div class="press-volume-content">${content}</div>
</section>`;

class RemoveLiveDemo implements HTMLRewriterElementContentHandlers {
  element(element: Element): void {
    element.remove();
  }
}

class RevealPressBrief implements HTMLRewriterElementContentHandlers {
  element(element: Element): void {
    element.removeAttribute("hidden");
  }
}

class InjectVolumeSections implements HTMLRewriterElementContentHandlers {
  constructor(private readonly html: string) {}

  element(element: Element): void {
    element.setInnerContent(this.html, { html: true });
  }
}

class InjectVolumeAssets implements HTMLRewriterElementContentHandlers {
  constructor(private readonly stylesheets: readonly string[]) {}

  element(element: Element): void {
    element.append(
      this.stylesheets
        .map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}">`)
        .join(""),
      { html: true }
    );
  }
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
    if (tag === "link") {
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

const assembleVolumes = async (
  assets: Fetcher,
  origin: string,
  volumes: readonly VolumeDefinition[]
): Promise<string> => {
  const sections = await Promise.all(volumes.map(async (volume) => {
    const response = await assets.fetch(
      new Request(new URL(volume.contentPath, origin))
    );
    if (!response.ok) return renderVolumeSection(volume, "");

    const prepared = await new HTMLRewriter()
      .on("[data-press-demo]", new RemoveLiveDemo())
      .on("[data-press-brief]", new RevealPressBrief())
      .transform(response)
      .text();
    const content = namespaceIds(extractMain(prepared), volume.slug);
    return renderVolumeSection(volume, content);
  }));

  return sections.join("\n");
};

/**
 * Creates a Worker module without baking a binding name into the package.
 * The host supplies a typed binding selector generated from its own Wrangler
 * configuration.
 */
export const createCloudflareCatalogueWorker = <Environment>(
  options: CloudflareCatalogueOptions<Environment>
): ExportedHandler<Environment> => {
  const cataloguePath = withTrailingSlash(options.cataloguePath);
  const bookRoutes = new Map(
    options.volumes.map((volume) => [
      withTrailingSlash(volume.routeUrl),
      volume
    ])
  );
  const stylesheets = [
    ...options.contentStylesheets,
    options.volumeStylesheet
  ];

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

      const rewriter = new HTMLRewriter()
        .on("head", new InjectVolumeAssets(stylesheets))
        .on(
          "[data-press-volumes]",
          new InjectVolumeSections(
            await assembleVolumes(assets, url.origin, options.volumes)
          )
        );

      if (route) {
        const canonical = `${url.origin}${url.pathname}`;
        rewriter
          .on(
            "title",
            new RewriteShellMetadata(route, canonical, options.siteName)
          )
          .on(
            'link[rel="canonical"]',
            new RewriteShellMetadata(route, canonical, options.siteName)
          )
          .on(
            "meta",
            new RewriteShellMetadata(route, canonical, options.siteName)
          );
      }

      return rewriter.transform(response);
    }
  };
};
