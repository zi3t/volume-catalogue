import armArtwork from "../../assets/arm-volume.svg?url";
import notesArtwork from "../../assets/notes-volume.svg?url";
import practiceArtwork from "../../assets/practice-volume.svg?url";
import reflyArtwork from "../../assets/refly-volume.svg?url";
import telemetryArtwork from "../../assets/telemetry-volume.svg?url";

export interface CleanRoomMaterialProfile {
  readonly shininess: number;
  readonly specular: string;
  readonly reflectiveness: number;
  /** Mix weight toward the cloth-overlaid diffuse, 0 = authored art only. */
  readonly baseDiffuseStrength: number;
  /** Authored gain on the re-levelled cloth scan before the overlay. */
  readonly baseDiffuseContrast: number;
  /** Shading-normal crown across the spine's short axis; a bound spine is round. */
  readonly spineCrown: number;
  /**
   * Cover-side surface response, authored independently of the spine's.
   *
   * The first rest case is ~85% spine, so the three scalars above are tuned
   * against a statistic the cover barely appears in. Deriving the cover's
   * values from them — a fixed fraction of `spineCrown`, and the spine's own
   * diffuse gain — put a crown shaped for a round board and a contrast chosen
   * for spine weave onto a flat surface that dominates the standing route. It
   * cost ~40% of the measured standing silhouette: the cover's edge and its
   * darker interior fell below the ground colour and dropped out of the
   * difference mask. Evidence in `docs/reference/parity-readings-20260808.json`.
   */
  readonly cover: {
    /** Crown across the cover. A cover between boards is far flatter than a spine. */
    readonly crown: number;
    readonly diffuseStrength: number;
    readonly diffuseContrast: number;
  };
  /**
   * The licensed cloth scan is shared source material, not a shared finish.
   * Each binding samples it with its own density, grain direction and phase so
   * five differently authored cases do not read as one texture recoloured five
   * times.
   */
  readonly texture: {
    readonly family: "fine-linen" | "buckram" | "coated-cloth" | "sateen" | "canvas";
    readonly cover: CleanRoomTextureTransform;
    readonly spine: CleanRoomTextureTransform;
    readonly board: CleanRoomTextureTransform;
  };
  readonly bump: {
    readonly base: number;
    readonly custom: number;
  };
  readonly foil: {
    readonly colors: readonly [string, string];
    readonly detail: number;
    readonly opacity: number;
    readonly specular: number;
    readonly emissive: number;
  };
  readonly gloss: {
    readonly opacity: number;
    readonly specular: number;
    readonly emissive: number;
  };
  readonly glitter: {
    readonly opacity: number;
    readonly specular: number;
    readonly emissive: number;
  };
}

export interface CleanRoomTextureTransform {
  readonly scale: readonly [number, number];
  readonly offset: readonly [number, number];
  readonly rotation: number;
}

export interface CleanRoomVolumeProfile {
  readonly slug: string;
  readonly cloth: string;
  readonly ink: string;
  readonly artworkUrl: string;
  readonly caption: string;
  readonly thicknessRatio: number;
  /** Shared-mesh thickness correction, measured independently per volume. */
  readonly thicknessScale: number;
  readonly depthRatio: number;
  readonly spineNote?: string;
  readonly binding: {
    /** Board and text-block thicknesses are independently reference-calibrated. */
    readonly boardThicknessRatio: number;
    readonly pageBlockThicknessRatio: number;
    readonly paper: string;
    readonly paperEdge: string;
    readonly endpaper: string;
    readonly headband: readonly [string, string];
    readonly leafDensity: number;
    readonly signatureEvery: number;
    /** Recessed exterior joints where the two cover boards meet the spine. */
    readonly coverJoints: {
      readonly inset: number;
      readonly width: number;
      readonly depth: number;
    };
  };
  readonly material: CleanRoomMaterialProfile;
}

/**
 * Reference-calibrated volume inputs. Reproducible screenshot measurements
 * take precedence over local silhouette and artwork preferences.
 */
export const cleanRoomProfiles = [
  {
    slug: "refly",
    cloth: "#b9ad6c",
    ink: "#18185e",
    artworkUrl: reflyArtwork,
    caption: "Re-run browser incidents frame by frame—from captured evidence to deterministic replay, with network, input, and state changes kept inspectable.",
    thicknessRatio: 0.1672,
    thicknessScale: 0.87,
    depthRatio: 0.672,
    binding: {
      boardThicknessRatio: 0.0105,
      pageBlockThicknessRatio: 0.1462,
      paper: "#f2f1eb",
      paperEdge: "#a4a5a1",
      endpaper: "#a49b61",
      headband: ["#50627d", "#c8bd77"],
      leafDensity: 0.9,
      signatureEvery: 15,
      coverJoints: { inset: 0.005, width: 0.04, depth: 0.0088 }
    },
    material: {
      shininess: 17,
      specular: "#ffffff",
      reflectiveness: 0.32,
      baseDiffuseStrength: 0.64,
      baseDiffuseContrast: 4.4,
      spineCrown: 0.89,
      cover: { crown: 0, diffuseStrength: 0.24, diffuseContrast: 2 },
      texture: {
        family: "fine-linen",
        cover: { scale: [3.2, 3.8], offset: [0, 0], rotation: 0 },
        spine: { scale: [5.6, 1.25], offset: [0, 0], rotation: 0 },
        board: { scale: [3.1, 3.6], offset: [0.08, 0.14], rotation: 0.018 }
      },
      bump: { base: 0.014, custom: 0.022 },
      foil: {
        colors: ["#7775c5", "#d7c568"],
        detail: 1.75,
        opacity: 0.72,
        specular: 0.36,
        emissive: 0.012
      },
      gloss: { opacity: 0.12, specular: 0.16, emissive: 0 },
      glitter: { opacity: 0.05, specular: 0.2, emissive: 0 }
    }
  },
  {
    slug: "arm",
    cloth: "#d9d1ae",
    ink: "#29435c",
    artworkUrl: armArtwork,
    caption: "Inspect robot kinematics as executable geometry, with every transform exposed and testable.",
    thicknessRatio: 0.1672,
    thicknessScale: 0.805,
    depthRatio: 0.672,
    spineNote: "Field guide",
    binding: {
      boardThicknessRatio: 0.0105,
      pageBlockThicknessRatio: 0.1462,
      paper: "#faf8ee",
      paperEdge: "#777a78",
      endpaper: "#b6ad8d",
      headband: ["#29435c", "#d9d1ae"],
      leafDensity: 1.65,
      signatureEvery: 7,
      coverJoints: { inset: 0.006, width: 0.038, depth: 0.0086 }
    },
    material: {
      shininess: 11,
      specular: "#dfe5e4",
      reflectiveness: 0.16,
      baseDiffuseStrength: 0.74,
      baseDiffuseContrast: 4.8,
      spineCrown: 0.99,
      cover: { crown: 0, diffuseStrength: 0.3, diffuseContrast: 2 },
      texture: {
        family: "buckram",
        cover: { scale: [2.45, 2.9], offset: [0.22, 0.07], rotation: -0.042 },
        spine: { scale: [4.1, 0.92], offset: [0.17, 0.31], rotation: -0.026 },
        board: { scale: [2.2, 2.7], offset: [0.3, 0.11], rotation: -0.052 }
      },
      bump: { base: 0.018, custom: 0.016 },
      foil: {
        colors: ["#718ca2", "#dfe7df"],
        detail: 2.2,
        opacity: 0.38,
        specular: 0.2,
        emissive: 0
      },
      gloss: { opacity: 0.08, specular: 0.1, emissive: 0 },
      glitter: { opacity: 0, specular: 0, emissive: 0 }
    }
  },
  {
    slug: "telemetry",
    cloth: "#243447",
    ink: "#e7e7df",
    artworkUrl: telemetryArtwork,
    caption: "Replay distributed-system evidence in order, without sanding away uncertainty.",
    thicknessRatio: 0.1672,
    thicknessScale: 0.88,
    depthRatio: 0.672,
    spineNote: "Run 04",
    binding: {
      boardThicknessRatio: 0.0105,
      pageBlockThicknessRatio: 0.1462,
      paper: "#faf8ee",
      paperEdge: "#777a78",
      endpaper: "#172737",
      headband: ["#d6b86b", "#243447"],
      leafDensity: 1.65,
      signatureEvery: 12,
      coverJoints: { inset: 0.0055, width: 0.0395, depth: 0.0087 }
    },
    material: {
      shininess: 15,
      specular: "#f2ead0",
      reflectiveness: 0.49,
      baseDiffuseStrength: 0.58,
      baseDiffuseContrast: 3.6,
      spineCrown: 0.81,
      cover: { crown: 0, diffuseStrength: 0.2, diffuseContrast: 2 },
      texture: {
        family: "coated-cloth",
        cover: { scale: [5.5, 4.2], offset: [0.41, 0.18], rotation: 0.014 },
        spine: { scale: [7.2, 1.5], offset: [0.36, 0.08], rotation: 0.009 },
        board: { scale: [5, 4], offset: [0.48, 0.2], rotation: 0.02 }
      },
      bump: { base: 0.011, custom: 0.026 },
      foil: {
        colors: ["#d6b86b", "#f5f0d8"],
        detail: 2.85,
        opacity: 0.8,
        specular: 0.52,
        emissive: 0.02
      },
      gloss: { opacity: 0.34, specular: 0.3, emissive: 0.004 },
      glitter: { opacity: 0.14, specular: 0.34, emissive: 0.006 }
    }
  },
  {
    slug: "practice",
    cloth: "#6d2949",
    ink: "#f0dfb4",
    artworkUrl: practiceArtwork,
    caption: "Show the boundary, the contract, and the evidence behind every engineering claim.",
    thicknessRatio: 0.1672,
    thicknessScale: 0.72,
    depthRatio: 0.672,
    spineNote: "Methods",
    binding: {
      boardThicknessRatio: 0.0105,
      pageBlockThicknessRatio: 0.1462,
      paper: "#faf8ee",
      paperEdge: "#777a78",
      endpaper: "#4c1b33",
      headband: ["#f0dfb4", "#6d2949"],
      leafDensity: 1.65,
      signatureEvery: 8,
      coverJoints: { inset: 0.0065, width: 0.039, depth: 0.0086 }
    },
    material: {
      shininess: 22,
      specular: "#f4e2ae",
      reflectiveness: 0.62,
      baseDiffuseStrength: 0.61,
      baseDiffuseContrast: 4.5,
      spineCrown: 0.96,
      cover: { crown: 0, diffuseStrength: 0.22, diffuseContrast: 2 },
      texture: {
        family: "sateen",
        cover: { scale: [3.4, 5.7], offset: [0.12, 0.44], rotation: 0.082 },
        spine: { scale: [5.9, 1.8], offset: [0.06, 0.39], rotation: 0.048 },
        board: { scale: [3.2, 5.1], offset: [0.2, 0.52], rotation: 0.074 }
      },
      bump: { base: 0.014, custom: 0.019 },
      foil: {
        colors: ["#f0dfb4", "#d59ac0"],
        detail: 1.35,
        opacity: 0.66,
        specular: 0.44,
        emissive: 0.014
      },
      gloss: { opacity: 0.48, specular: 0.42, emissive: 0.006 },
      glitter: { opacity: 0.09, specular: 0.26, emissive: 0.003 }
    }
  },
  {
    slug: "field-notes",
    cloth: "#ad763b",
    ink: "#26333d",
    artworkUrl: notesArtwork,
    caption: "Working notes on replayable systems, verification, and engineering decisions that can be inspected.",
    thicknessRatio: 0.1672,
    thicknessScale: 0.84,
    depthRatio: 0.672,
    spineNote: "Revised",
    binding: {
      boardThicknessRatio: 0.0105,
      pageBlockThicknessRatio: 0.1462,
      paper: "#faf8ee",
      paperEdge: "#777a78",
      endpaper: "#8a552d",
      headband: ["#26333d", "#ad763b"],
      leafDensity: 1.65,
      signatureEvery: 6,
      coverJoints: { inset: 0.0045, width: 0.042, depth: 0.0089 }
    },
    material: {
      shininess: 9,
      specular: "#e6e2d8",
      reflectiveness: 0.24,
      baseDiffuseStrength: 0.82,
      baseDiffuseContrast: 5.2,
      spineCrown: 1.09,
      cover: { crown: 0, diffuseStrength: 0.28, diffuseContrast: 2 },
      texture: {
        family: "canvas",
        cover: { scale: [1.9, 2.35], offset: [0.33, 0.27], rotation: -0.067 },
        spine: { scale: [3.35, 0.78], offset: [0.43, 0.21], rotation: -0.038 },
        board: { scale: [1.75, 2.2], offset: [0.37, 0.32], rotation: -0.061 }
      },
      bump: { base: 0.02, custom: 0.014 },
      foil: {
        colors: ["#27343e", "#ead7b5"],
        detail: 3.1,
        opacity: 0.28,
        specular: 0.14,
        emissive: 0
      },
      gloss: { opacity: 0.05, specular: 0.08, emissive: 0 },
      glitter: { opacity: 0, specular: 0, emissive: 0 }
    }
  }
] as const satisfies readonly CleanRoomVolumeProfile[];
