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

export interface CleanRoomVolumeProfile {
  readonly slug: string;
  readonly cloth: string;
  readonly ink: string;
  readonly artworkUrl: string;
  readonly caption: string;
  readonly thicknessRatio: number;
  readonly depthRatio: number;
  readonly shelfPitch: number;
  readonly shelfRoll: number;
  readonly spineNote?: string;
  readonly drag: {
    readonly revealPitch: number;
    readonly verticalResponse: number;
    readonly yawResponse: number;
  };
  readonly material: CleanRoomMaterialProfile;
}

/**
 * Independently authored ZI3T art direction, reduced to the inputs the new
 * renderer owns. These are deliberately not ports of the reference's scalar
 * table: the reference geometry and material equations use a different basis.
 */
export const cleanRoomProfiles = [
  {
    slug: "refly",
    cloth: "#c1b676",
    ink: "#18185e",
    artworkUrl: reflyArtwork,
    caption: "Re-run browser incidents frame by frame—from captured evidence to deterministic replay, with network, input, and state changes kept inspectable.",
    thicknessRatio: 0.137,
    depthRatio: 0.792,
    shelfPitch: 0.052,
    shelfRoll: 0.0015,
    drag: { revealPitch: 0.03, verticalResponse: 1.3, yawResponse: 1 },
    material: {
      shininess: 17,
      specular: "#ffffff",
      reflectiveness: 0.32,
      baseDiffuseStrength: 0.64,
      baseDiffuseContrast: 4.4,
      spineCrown: 0.89,
      cover: { crown: 0, diffuseStrength: 0.24, diffuseContrast: 2 },
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
    thicknessRatio: 0.122,
    depthRatio: 0.815,
    shelfPitch: 0.048,
    shelfRoll: -0.001,
    spineNote: "Field guide",
    drag: { revealPitch: 0.04, verticalResponse: 1.3, yawResponse: 1 },
    material: {
      shininess: 11,
      specular: "#dfe5e4",
      reflectiveness: 0.16,
      baseDiffuseStrength: 0.74,
      baseDiffuseContrast: 4.8,
      spineCrown: 0.99,
      cover: { crown: 0, diffuseStrength: 0.3, diffuseContrast: 2 },
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
    thicknessRatio: 0.112,
    depthRatio: 0.826,
    shelfPitch: 0.046,
    shelfRoll: 0.001,
    spineNote: "Run 04",
    drag: { revealPitch: 0.035, verticalResponse: 1.3, yawResponse: 1 },
    material: {
      shininess: 15,
      specular: "#f2ead0",
      reflectiveness: 0.49,
      baseDiffuseStrength: 0.58,
      baseDiffuseContrast: 3.6,
      spineCrown: 0.81,
      cover: { crown: 0, diffuseStrength: 0.2, diffuseContrast: 2 },
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
    thicknessRatio: 0.129,
    depthRatio: 0.803,
    shelfPitch: 0.051,
    shelfRoll: -0.0015,
    spineNote: "Methods",
    drag: { revealPitch: 0.045, verticalResponse: 1.3, yawResponse: 1 },
    material: {
      shininess: 22,
      specular: "#f4e2ae",
      reflectiveness: 0.62,
      baseDiffuseStrength: 0.61,
      baseDiffuseContrast: 4.5,
      spineCrown: 0.96,
      cover: { crown: 0, diffuseStrength: 0.22, diffuseContrast: 2 },
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
    thicknessRatio: 0.139,
    depthRatio: 0.78,
    shelfPitch: 0.053,
    shelfRoll: 0.001,
    spineNote: "Revised",
    drag: { revealPitch: 0.05, verticalResponse: 1.3, yawResponse: 1 },
    material: {
      shininess: 9,
      specular: "#e6e2d8",
      reflectiveness: 0.24,
      baseDiffuseStrength: 0.82,
      baseDiffuseContrast: 5.2,
      spineCrown: 1.09,
      cover: { crown: 0, diffuseStrength: 0.28, diffuseContrast: 2 },
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
