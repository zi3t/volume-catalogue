import armArtwork from "../../assets/arm-volume.svg?url";
import notesArtwork from "../../assets/notes-volume.svg?url";
import practiceArtwork from "../../assets/practice-volume.svg?url";
import reflyArtwork from "../../assets/refly-volume.svg?url";
import shutdownDrainArtwork from "../../assets/shutdown-drain-volume.svg?url";

export type CleanRoomBaseBump = "none" | "buckram" | "paper" | "cardboard";

export interface CleanRoomMaterialProfile {
  readonly shininess: number;
  readonly specular: string;
  readonly reflectiveness: number;
  readonly diffuseBaseColor: string;
  readonly baseBump: CleanRoomBaseBump;
  readonly bump: {
    readonly base: number;
    readonly custom: number;
  };
  readonly foil: {
    /** The shader samples these colors from the atlas's foil-palette tile. */
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
  readonly paper: string;
  readonly headband: readonly [string, string];
  readonly artworkUrl: string;
  readonly caption: string;
  /** Full authored book thickness in the OBJ's centimeter coordinate space. */
  readonly thickness: number;
  readonly spineNote?: string;
  readonly material: CleanRoomMaterialProfile;
}

/**
 * Per-volume inputs for the shared book mesh. Geometry is deliberately absent:
 * every volume uses the same authored topology and changes thickness through
 * the material uniform, exactly where the mesh's outer-shell vertices allow it.
 */
export const demoVolumeProfiles = [
  {
    slug: "surfaces",
    cloth: "#b9ad6c",
    ink: "#18185e",
    paper: "#f2f1eb",
    headband: ["#18185e", "#c8bd77"],
    artworkUrl: reflyArtwork,
    caption: "Compare cloth, paper, foil, gloss, and bump responses on the shared book mesh.",
    thickness: 3.4,
    material: {
      shininess: 3,
      specular: "#ffffff",
      reflectiveness: 0.6,
      diffuseBaseColor: "#0a0a59",
      baseBump: "none",
      bump: { base: -0.02, custom: -0.04 },
      foil: {
        colors: ["#7775c5", "#d7c568"],
        detail: 2,
        opacity: 0,
        specular: 0.2,
        emissive: 0
      },
      gloss: { opacity: 1, specular: 0.1, emissive: 0 },
      glitter: { opacity: 0.3, specular: 0.2, emissive: 0 }
    }
  },
  {
    slug: "geometry",
    cloth: "#d9d1ae",
    ink: "#29435c",
    paper: "#faf8ee",
    headband: ["#29435c", "#d9d1ae"],
    artworkUrl: armArtwork,
    caption: "Reuse one authored topology while varying thickness, covers, joints, and page blocks.",
    thickness: 3.18,
    spineNote: "Topology",
    material: {
      shininess: 2,
      specular: "#dfe5e4",
      reflectiveness: 0.1,
      diffuseBaseColor: "#29435c",
      baseBump: "buckram",
      bump: { base: 0.04, custom: 0.25 },
      foil: {
        colors: ["#718ca2", "#dfe7df"],
        detail: 2.6,
        opacity: 0.6,
        specular: 1,
        emissive: 0
      },
      gloss: { opacity: 1, specular: 0.1, emissive: 0 },
      glitter: { opacity: 0, specular: 0, emissive: 0 }
    }
  },
  {
    slug: "interaction",
    cloth: "#243447",
    ink: "#e7e7df",
    paper: "#faf8ee",
    headband: ["#d6b86b", "#243447"],
    artworkUrl: shutdownDrainArtwork,
    caption: "Exercise picking, holding, dragging, focus, and the transition from shelf to volume.",
    thickness: 3.4,
    spineNote: "Input model",
    material: {
      shininess: 1.2,
      specular: "#f2ead0",
      reflectiveness: 0.8,
      diffuseBaseColor: "#243447",
      baseBump: "none",
      bump: { base: 0.015, custom: 0.14 },
      foil: {
        colors: ["#d6b86b", "#f5f0d8"],
        detail: 1.5,
        opacity: -1,
        specular: 0.3,
        emissive: -1
      },
      gloss: { opacity: 1, specular: 0.1, emissive: 0 },
      glitter: { opacity: 0, specular: 0, emissive: 0 }
    }
  },
  {
    slug: "routing",
    cloth: "#6d2949",
    ink: "#f0dfb4",
    paper: "#faf8ee",
    headband: ["#f0dfb4", "#6d2949"],
    artworkUrl: practiceArtwork,
    caption: "Keep one scene alive while routes change, volumes scroll, and navigation returns to the shelf.",
    thickness: 2.85,
    spineNote: "History",
    material: {
      shininess: 1,
      specular: "#f4e2ae",
      reflectiveness: 0.6,
      diffuseBaseColor: "#6d2949",
      baseBump: "paper",
      bump: { base: 0.015, custom: 0.12 },
      foil: {
        colors: ["#f0dfb4", "#d59ac0"],
        detail: 1,
        opacity: 0.8,
        specular: -0.45,
        emissive: 0.45
      },
      gloss: { opacity: 1, specular: 0.1, emissive: 0 },
      glitter: { opacity: 0, specular: 0, emissive: 0 }
    }
  },
  {
    slug: "integration",
    cloth: "#ad763b",
    ink: "#26333d",
    paper: "#faf8ee",
    headband: ["#26333d", "#ad763b"],
    artworkUrl: notesArtwork,
    caption: "Mount the renderer over ordinary links and retain an accessible catalogue without WebGL.",
    thickness: 3.32,
    spineNote: "Fallback",
    material: {
      shininess: 1,
      specular: "#e6e2d8",
      reflectiveness: 0.6,
      diffuseBaseColor: "#26333d",
      baseBump: "cardboard",
      bump: { base: 0.04, custom: -0.04 },
      foil: {
        colors: ["#27343e", "#ead7b5"],
        detail: 0.8,
        opacity: 1.3,
        specular: -1.3,
        emissive: 0.2
      },
      gloss: { opacity: 1, specular: 0.1, emissive: 0 },
      glitter: { opacity: 0, specular: 0, emissive: 0 }
    }
  }
] as const satisfies readonly CleanRoomVolumeProfile[];
