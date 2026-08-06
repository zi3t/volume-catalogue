import armArtwork from "../../assets/arm-volume.svg?url";
import notesArtwork from "../../assets/notes-volume.svg?url";
import practiceArtwork from "../../assets/practice-volume.svg?url";
import reflyArtwork from "../../assets/refly-volume.svg?url";
import telemetryArtwork from "../../assets/telemetry-volume.svg?url";

export interface CleanRoomMaterialProfile {
  readonly shininess: number;
  readonly specular: string;
  readonly reflectiveness: number;
  readonly baseDiffuseStrength: number;
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
  readonly thicknessRatio: number;
  readonly depthRatio: number;
  readonly shelfPitch: number;
  readonly shelfRoll: number;
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
    thicknessRatio: 0.137,
    depthRatio: 0.792,
    shelfPitch: 0.052,
    shelfRoll: 0.0015,
    material: {
      shininess: 4.2,
      specular: "#ffffff",
      reflectiveness: 0.16,
      baseDiffuseStrength: 0.24,
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
    thicknessRatio: 0.122,
    depthRatio: 0.815,
    shelfPitch: 0.048,
    shelfRoll: -0.001,
    material: {
      shininess: 2.6,
      specular: "#dfe5e4",
      reflectiveness: 0.08,
      baseDiffuseStrength: 0.3,
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
    thicknessRatio: 0.112,
    depthRatio: 0.826,
    shelfPitch: 0.046,
    shelfRoll: 0.001,
    material: {
      shininess: 3.8,
      specular: "#f2ead0",
      reflectiveness: 0.24,
      baseDiffuseStrength: 0.2,
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
    thicknessRatio: 0.129,
    depthRatio: 0.803,
    shelfPitch: 0.051,
    shelfRoll: -0.0015,
    material: {
      shininess: 5.4,
      specular: "#f4e2ae",
      reflectiveness: 0.31,
      baseDiffuseStrength: 0.22,
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
    thicknessRatio: 0.139,
    depthRatio: 0.78,
    shelfPitch: 0.053,
    shelfRoll: 0.001,
    material: {
      shininess: 2.2,
      specular: "#e6e2d8",
      reflectiveness: 0.12,
      baseDiffuseStrength: 0.34,
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
