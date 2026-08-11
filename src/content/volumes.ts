export type VolumeRouteMode = "project" | "reading";

export interface VolumeDefinition {
  readonly routeUrl: string;
  readonly contentPath: string;
  readonly slug: string;
  readonly title: string;
  readonly byline: string;
  readonly description: string;
  readonly routeMode: VolumeRouteMode;
  readonly spine: {
    readonly eyebrow: string;
    readonly serial: string;
    readonly ariaLabel: string;
  };
  readonly contentStylesheet?: string;
}

/**
 * Ordered source of truth shared by the browser catalogue and its server-side
 * content adapter. Scene profiles intentionally key by this order.
 */
export const volumes = [
  {
    routeUrl: "/press/refly/",
    contentPath: "/refly/",
    slug: "refly",
    title: "Re-fly the incident",
    byline: "Rust / WebAssembly",
    description:
      "Re-run browser incidents frame by frame, from captured evidence to deterministic replay.",
    routeMode: "project",
    spine: {
      eyebrow: "Rust / WASM",
      serial: "01",
      ariaLabel: "Open Re-fly the incident"
    },
    contentStylesheet: "/assets/refly.css"
  },
  {
    routeUrl: "/press/arm/",
    contentPath: "/arm/",
    slug: "arm",
    title: "GLUON kinematics",
    byline: "Rust kinematics / three.js",
    description:
      "Inspect robot kinematics as executable geometry, with every transform exposed and testable.",
    routeMode: "project",
    spine: {
      eyebrow: "Robotics / Rust",
      serial: "02",
      ariaLabel: "Open the GLUON kinematics project"
    },
    contentStylesheet: "/assets/arm.css"
  },
  {
    routeUrl: "/press/shutdown-drain/",
    contentPath: "/notes/first-queue/",
    slug: "shutdown-drain",
    title: "The last command",
    byline: "C++17 / UDP / packet evidence",
    description:
      "Follow a shutdown warning upstream to the queue that still owned the actuator-disable command.",
    routeMode: "reading",
    spine: {
      eyebrow: "C++17 / UDP",
      serial: "03",
      ariaLabel: "Open the robot-controller shutdown field report"
    },
    contentStylesheet: "/assets/notes.css"
  },
  {
    routeUrl: "/press/practice/",
    contentPath: "/resume/",
    slug: "practice",
    title: "Evidence over adjectives",
    byline: "Systems engineering / security",
    description:
      "The boundary, the contract, and the evidence behind every engineering claim.",
    routeMode: "project",
    spine: {
      eyebrow: "Systems / Security",
      serial: "04",
      ariaLabel: "Open the résumé and engineering practice"
    },
    contentStylesheet: "/assets/resume.css"
  },
  {
    routeUrl: "/press/field-notes/",
    contentPath: "/notes/",
    slug: "field-notes",
    title: "Engineering notes",
    byline: "Replay / verification",
    description:
      "All field reports, public experiments, and technical decisions in one reading index.",
    routeMode: "reading",
    spine: {
      eyebrow: "Replay / Verification",
      serial: "05",
      ariaLabel: "Open all engineering notes"
    }
  }
] as const satisfies readonly VolumeDefinition[];

export const contentStylesheets = Array.from(
  new Set(
    volumes.flatMap((volume) => (
      "contentStylesheet" in volume ? [volume.contentStylesheet] : []
    ))
  )
);

export const withTrailingSlash = (pathname: string): string => (
  pathname.endsWith("/") ? pathname : `${pathname}/`
);
