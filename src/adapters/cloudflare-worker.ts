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
  content: string,
  excerpt = escapeHtml(volume.description)
): string => `
<section class="press-volume-section press-volume-section--${escapeHtml(volume.slug)}"
         id="volume-${escapeHtml(volume.slug)}"
         data-press-volume="${escapeHtml(volume.routeUrl)}"
         data-press-slug="${escapeHtml(volume.slug)}"
         aria-labelledby="volume-${escapeHtml(volume.slug)}-title">
  <div class="press-volume-stage">
    <div class="press-volume-figure-track" aria-hidden="true">
      <div class="press-volume-figure"></div>
    </div>
    <div class="press-volume-copy">
      <div class="press-volume-detail">
        <p class="press-volume-kicker">${escapeHtml(volume.spine.eyebrow)}</p>
        <h2 class="press-volume-title" id="volume-${escapeHtml(volume.slug)}-title">${escapeHtml(volume.title)}</h2>
        <p class="press-volume-summary">${escapeHtml(volume.byline)}</p>
        <p class="press-volume-actions"><a href="${escapeHtml(volume.contentPath)}">Open ${escapeHtml(volume.routeMode)} page</a></p>
        <p class="press-volume-excerpt">${excerpt}</p>
        <dl class="press-volume-meta">
          <div><dt>Volume</dt><dd>${escapeHtml(volume.spine.serial)}</dd></div>
          <div><dt>Format</dt><dd>${escapeHtml(volume.routeMode)}</dd></div>
        </dl>
      </div>
      <div class="press-volume-content">${content}</div>
    </div>
  </div>
</section>`;

/**
 * Promotes the source page's own lead into the opening route composition. The
 * paragraph is removed from the long-form copy so the assembled document does
 * not repeat it one viewport later. All input is same-origin generated HTML;
 * retaining its inline emphasis and links is intentional.
 */
const extractRouteExcerpt = (
  html: string,
  fallback: string
): { readonly html: string; readonly excerpt: string } => {
  const brief = /<(section|div)\b[^>]*\bdata-press-brief\b[^>]*>([\s\S]*?)<\/\1>/i.exec(html);
  if (brief) {
    const paragraphs = (brief[2] ?? "").matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/gi);
    for (const paragraph of paragraphs) {
      if (/\bsection-label\b/i.test(paragraph[1] ?? "")) continue;
      const excerpt = paragraph[2]?.trim() ?? "";
      if (!excerpt) continue;
      return { html: html.replace(paragraph[0], ""), excerpt };
    }
  }

  const authoredLead = /<p\b[^>]*class="[^"]*\b(?:resume-summary|lead)\b[^"]*"[^>]*>([\s\S]*?)<\/p>/i.exec(html);
  const authoredExcerpt = authoredLead?.[1]?.trim();
  if (authoredLead && authoredExcerpt) {
    return {
      html: html.replace(authoredLead[0], ""),
      excerpt: authoredExcerpt
    };
  }

  return { html, excerpt: escapeHtml(fallback) };
};

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

const PRESS_STARTUP_GATE = `<style id="press-startup-gate">
html.press-startup-pending{background:#201819}
html.press-startup-pending body{visibility:hidden;animation:press-startup-failsafe 0s linear 8s forwards}
html.press-startup-pending .press-scene-canvas{opacity:1!important;transition:none!important}
html.press-startup-pending .home-brand{animation-play-state:paused!important}
@keyframes press-startup-failsafe{to{visibility:visible}}
</style><noscript><style>html.press-startup-pending body{visibility:visible;animation:none}</style></noscript>`;

class MarkStartupPending implements HTMLRewriterElementContentHandlers {
  element(element: Element): void {
    const classes = (element.getAttribute("class") ?? "")
      .split(/\s+/)
      .filter(Boolean);
    if (!classes.includes("press-startup-pending")) {
      classes.push("press-startup-pending");
    }
    element.setAttribute("class", classes.join(" "));
  }
}

class InjectVolumeAssets implements HTMLRewriterElementContentHandlers {
  constructor(private readonly stylesheets: readonly string[]) {}

  element(element: Element): void {
    element.append(
      `${PRESS_STARTUP_GATE}${this.stylesheets
        .map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}">`)
        .join("")}`,
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
    const promoted = extractRouteExcerpt(prepared, volume.description);
    const content = namespaceIds(extractMain(promoted.html), volume.slug);
    const excerpt = namespaceIds(promoted.excerpt, volume.slug);
    return renderVolumeSection(volume, content, excerpt);
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
        .on("html", new MarkStartupPending())
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
