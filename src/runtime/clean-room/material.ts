import * as THREE from "three";

import referenceFragmentShader from "./book.frag.glsl?raw";
import referenceVertexShader from "./book.vert.glsl?raw";
import type { CleanRoomMaterialProfile } from "./profiles";
import type { CleanRoomMaterialMaps } from "./textures";

export interface CleanRoomMaterialDiagnostics {
  readonly architecture: "reference-book-shader-material";
  readonly mapCount: 7;
  readonly mapNames: readonly [
    "base-diffuse",
    "custom-diffuse",
    "base-bump",
    "custom-bump",
    "foil",
    "gloss",
    "glitter"
  ];
  readonly atlasSize: readonly [1920, 1600];
  readonly thickness: number;
  readonly baseBump: CleanRoomMaterialProfile["baseBump"];
  readonly responseSignature: string;
}

export interface CleanRoomLayeredMaterial {
  readonly material: THREE.ShaderMaterial;
  readonly diagnostics: CleanRoomMaterialDiagnostics;
}

const MAP_NAMES = [
  "base-diffuse",
  "custom-diffuse",
  "base-bump",
  "custom-bump",
  "foil",
  "gloss",
  "glitter"
] as const;

export const createCleanRoomLayeredMaterial = (
  profile: CleanRoomMaterialProfile,
  thickness: number,
  maps: CleanRoomMaterialMaps,
  slug: string
): CleanRoomLayeredMaterial => {
  // Keep the atlas Texture instances intact. UniformsUtils.merge clones them;
  // if the material is created while TextureLoader is still decoding an image,
  // that clone permanently retains an empty source and renders a blank layer.
  const uniforms = {
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.lights),
      specular: { value: new THREE.Color(profile.specular) },
      shininess: { value: profile.shininess },
      reflectiveness: { value: profile.reflectiveness },
      thickness: { value: thickness },
      diffuseMapBase: { value: maps.baseDiffuse },
      diffuseBaseColor: { value: new THREE.Color(profile.diffuseBaseColor) },
      diffuseMapCustom: { value: maps.customDiffuse },
      bumpMapBase: { value: maps.baseBump },
      bumpMapCustom: { value: maps.customBump },
      bumpScaleBase: { value: profile.bump.base },
      bumpScaleCustom: { value: profile.bump.custom },
      foilMap: { value: maps.foil },
      foilDetail: { value: profile.foil.detail },
      foilEmissive: { value: profile.foil.emissive },
      foilOpacity: { value: profile.foil.opacity },
      foilSpecular: { value: profile.foil.specular },
      glossMap: { value: maps.gloss },
      glossEmissive: { value: profile.gloss.emissive },
      glossOpacity: { value: profile.gloss.opacity },
      glossSpecular: { value: profile.gloss.specular },
      glitterMap: { value: maps.glitter },
      glitterEmissive: { value: profile.glitter.emissive },
      glitterOpacity: { value: profile.glitter.opacity },
      glitterSpecular: { value: profile.glitter.specular }
  };

  const material = new THREE.ShaderMaterial({
    name: `book-${slug}-seven-map`,
    vertexShader: referenceVertexShader,
    fragmentShader: referenceFragmentShader,
    uniforms,
    lights: true,
    defines: {
      USE_UV: "",
      USE_MAP: "",
      USE_BUMPMAP: ""
    }
  });
  material.userData.bookMaterial = {
    architecture: "reference-book-shader-material",
    mapCount: 7,
    thickness
  };

  return {
    material,
    diagnostics: {
      architecture: "reference-book-shader-material",
      mapCount: 7,
      mapNames: MAP_NAMES,
      atlasSize: maps.dimensions,
      thickness,
      baseBump: profile.baseBump,
      responseSignature: [
        profile.shininess,
        profile.reflectiveness,
        profile.baseBump,
        profile.bump.base,
        profile.bump.custom,
        profile.foil.detail,
        profile.foil.opacity,
        profile.foil.specular,
        profile.gloss.opacity,
        profile.glitter.opacity,
        thickness
      ].join("/")
    }
  };
};
