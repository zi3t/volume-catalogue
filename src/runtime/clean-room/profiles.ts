import armArtwork from "../../assets/arm-volume.svg?url";
import notesArtwork from "../../assets/notes-volume.svg?url";
import practiceArtwork from "../../assets/practice-volume.svg?url";
import reflyArtwork from "../../assets/refly-volume.svg?url";
import telemetryArtwork from "../../assets/telemetry-volume.svg?url";

export interface CleanRoomMaterialProfile {
  readonly shininess: number;
  readonly specular: string;
  readonly clothBump: number;
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
      shininess: 3,
      specular: "#ffffff",
      clothBump: 0.42
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
      shininess: 1.6,
      specular: "#dfe5e4",
      clothBump: 0.54
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
      shininess: 2.4,
      specular: "#f2ead0",
      clothBump: 0.35
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
      shininess: 2.2,
      specular: "#f4e2ae",
      clothBump: 0.44
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
      shininess: 1.4,
      specular: "#e6e2d8",
      clothBump: 0.5
    }
  }
] as const satisfies readonly CleanRoomVolumeProfile[];
