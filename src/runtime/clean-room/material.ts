import * as THREE from "three";

import type { CleanRoomMaterialProfile } from "./profiles";
import type { CleanRoomMaterialMaps } from "./textures";

export interface CleanRoomMaterialDiagnostics {
  readonly architecture: "clean-room-shader-material";
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
  readonly diffuseSize: readonly [number, number];
  readonly maskSize: readonly [number, number];
  readonly responseSignature: string;
}

export interface CleanRoomLayeredMaterial {
  readonly material: THREE.ShaderMaterial;
  readonly diagnostics: CleanRoomMaterialDiagnostics;
}

/**
 * Mean luminance of the shared cloth scan, measured off the asset
 * (`polyhaven-book-pattern-colour-1k.jpg`, mean 60.4/255, sd 18.0). The overlay
 * re-level is mean-neutral only while this matches the map it levels, so it
 * moves if that asset is ever replaced.
 */
const BASE_DIFFUSE_LEVEL = 0.237;

const MAP_NAMES = [
  "base-diffuse",
  "custom-diffuse",
  "base-bump",
  "custom-bump",
  "foil",
  "gloss",
  "glitter"
] as const;

const CUSTOM_MAP_PARS = /* glsl */`
uniform sampler2D diffuseMapBase;
uniform sampler2D diffuseMapCustom;
uniform sampler2D bumpMapBase;
uniform sampler2D bumpMapCustom;
uniform sampler2D foilMap;
uniform sampler2D glossMap;
uniform sampler2D glitterMap;

uniform vec2 baseMapScale;
uniform vec2 glitterMapScale;
uniform float baseDiffuseStrength;
uniform float baseDiffuseLevel;
uniform float baseDiffuseContrast;
uniform float bumpScaleBase;
uniform float bumpScaleCustom;
uniform float effectReliefSuppression;
uniform float surfaceCurvature;
uniform float reflectiveness;

uniform vec3 foilColorA;
uniform vec3 foilColorB;
uniform float foilDetail;
uniform float foilOpacity;
uniform float foilSpecular;
uniform float foilEmissive;

uniform float glossOpacity;
uniform float glossSpecular;
uniform float glossEmissive;

uniform float glitterOpacity;
uniform float glitterSpecular;
uniform float glitterEmissive;
`;

const CUSTOM_RELIEF = /* glsl */`
float cleanRoomMask( sampler2D maskMap, vec2 uv ) {
  return smoothstep( 0.04, 0.92, texture2D( maskMap, uv ).r );
}

float cleanRoomHeight( vec2 uv ) {
  float foilCoverageAtUv = cleanRoomMask( foilMap, uv );
  float glossCoverageAtUv = cleanRoomMask( glossMap, uv );
  float glitterCoverageAtUv = cleanRoomMask( glitterMap, uv * glitterMapScale );
  float finishedCoverage = max(
    foilCoverageAtUv * foilOpacity,
    max(
      glossCoverageAtUv * glossOpacity,
      glitterCoverageAtUv * glitterOpacity
    )
  );
  float relief = texture2D( bumpMapBase, uv * baseMapScale ).r * bumpScaleBase;
  relief += texture2D( bumpMapCustom, uv ).r * bumpScaleCustom;
  return relief * ( 1.0 - clamp( finishedCoverage * effectReliefSuppression, 0.0, 0.82 ) );
}

vec2 cleanRoomHeightGradient( vec2 uv ) {
  vec2 dSTdx = dFdx( uv );
  vec2 dSTdy = dFdy( uv );
  float baseHeight = cleanRoomHeight( uv );
  return vec2(
    cleanRoomHeight( uv + dSTdx ) - baseHeight,
    cleanRoomHeight( uv + dSTdy ) - baseHeight
  );
}

vec3 cleanRoomPerturbNormal(
  vec3 surfacePosition,
  vec3 surfaceNormal,
  vec2 heightGradient,
  float faceDirectionValue
) {
  vec3 sigmaX = normalize( dFdx( surfacePosition ) );
  vec3 sigmaY = normalize( dFdy( surfacePosition ) );
  vec3 r1 = cross( sigmaY, surfaceNormal );
  vec3 r2 = cross( surfaceNormal, sigmaX );
  float determinant = dot( sigmaX, r1 ) * faceDirectionValue;
  vec3 gradient = sign( determinant )
    * ( heightGradient.x * r1 + heightGradient.y * r2 );
  return normalize( abs( determinant ) * surfaceNormal - gradient );
}
`;

const CUSTOM_DIFFUSE = /* glsl */`
vec3 baseDiffuseSample = texture2D( diffuseMapBase, vMapUv * baseMapScale ).rgb;
vec4 customDiffuseSample = texture2D( diffuseMapCustom, vMapUv );
float baseLuminance = dot( baseDiffuseSample, vec3( 0.2126, 0.7152, 0.0722 ) );

// Re-level the scan to mid grey before blending. The cloth scan means 0.237,
// so a raw overlay would take the base<0.5 branch almost everywhere and halve
// every cover — the same failure the 2026-07-29 pass fixed for the legacy
// renderer's canvas composite ("a luminosity composite pulls the cloth's
// brightness toward the scan's darker mean"). This is the shader-side form:
// additive, so it preserves the scan's absolute variation, with
// baseDiffuseContrast as the authored gain on it.
float leveledBase = clamp(
  0.5 + ( baseLuminance - baseDiffuseLevel ) * baseDiffuseContrast,
  0.0,
  1.0
);

// Overlay curve, scalar scan against the authored RGB. The base stays a scalar
// on purpose: the scan carries a colour cast, and blending it per channel
// turns every volume olive regardless of its own cloth hue.
vec3 overlaid = mix(
  2.0 * leveledBase * customDiffuseSample.rgb,
  1.0 - 2.0 * ( 1.0 - leveledBase ) * ( 1.0 - customDiffuseSample.rgb ),
  step( 0.5, leveledBase )
);
diffuseColor *= vec4(
  mix( customDiffuseSample.rgb, overlaid, baseDiffuseStrength ),
  customDiffuseSample.a
);

float foilCoverage = cleanRoomMask( foilMap, vMapUv );
float glossCoverage = cleanRoomMask( glossMap, vMapUv );
float glitterCoverage = cleanRoomMask( glitterMap, vMapUv * glitterMapScale );
`;

const CUSTOM_SPECULAR = /* glsl */`
float specularStrength = clamp(
  reflectiveness
    + foilCoverage * foilOpacity * foilSpecular
    + glossCoverage * glossOpacity * glossSpecular
    + glitterCoverage * glitterOpacity * glitterSpecular,
  0.0,
  2.0
);
`;

const CUSTOM_NORMAL_AND_FINISH = /* glsl */`
normal = cleanRoomPerturbNormal(
  -vViewPosition,
  normal,
  cleanRoomHeightGradient( vMapUv ),
  faceDirection
);

float finishedCoverage = max(
  foilCoverage * foilOpacity,
  max(
    glossCoverage * glossOpacity,
    glitterCoverage * glitterOpacity
  )
);
normal = normalize( mix(
  normal,
  nonPerturbedNormal,
  clamp( finishedCoverage * effectReliefSuppression, 0.0, 0.72 )
) );

// A bound spine is round. The reference's spine reads bright along its crown and
// falls away at both edges because it is a curved surface; ours is a plane, and
// a plane under fixed lights shades uniformly — which is most of why our case
// has half the reference's tonal spread. Bend the shading normal across the
// short axis through the same derivative frame the relief uses, so it stays
// correct as the volume rotates and leaves geometry and silhouette untouched.
// Applied after the suppression mix on purpose: this is the shape of the board
// under the cloth, so a foil or gloss mask must not flatten it.
normal = cleanRoomPerturbNormal(
  -vViewPosition,
  normal,
  vec2( 0.0, surfaceCurvature * ( 0.5 - vMapUv.y ) ),
  faceDirection
);

vec3 viewDirection = normalize( vViewPosition );
float foilSweep = 0.5 + 0.5 * sin(
  (
    vMapUv.x * 1.7
    + vMapUv.y * 1.1
    + dot( viewDirection.xy, vec2( 0.7, -0.45 ) )
    + dot( normal.xy, vec2( -0.55, 0.8 ) )
  ) * foilDetail * PI
);
vec3 foilColor = mix( foilColorA, foilColorB, foilSweep );
diffuseColor.rgb = mix(
  diffuseColor.rgb,
  foilColor,
  clamp( foilCoverage * foilOpacity, 0.0, 1.0 )
);

vec3 glossTint = mix( diffuseColor.rgb, vec3( 1.0 ), 0.14 );
diffuseColor.rgb = mix(
  diffuseColor.rgb,
  glossTint,
  clamp( glossCoverage * glossOpacity * 0.24, 0.0, 0.28 )
);

float glitterFlash = pow( saturate( dot( normal, viewDirection ) ), 22.0 );
float glitterSignal = glitterCoverage * glitterOpacity * ( 0.18 + 0.82 * glitterFlash );
diffuseColor.rgb = mix(
  diffuseColor.rgb,
  foilColorB,
  clamp( glitterSignal * 0.46, 0.0, 0.36 )
);

totalEmissiveRadiance += foilColor * foilCoverage * foilOpacity * foilEmissive;
totalEmissiveRadiance += diffuseColor.rgb * glossCoverage * glossOpacity * glossEmissive;
totalEmissiveRadiance += foilColorB * glitterSignal * glitterEmissive;
`;

const replaceChunk = (source: string, chunk: string, replacement: string): string => {
  const needle = `#include <${chunk}>`;
  if (!source.includes(needle)) {
    throw new Error(`Three.js Phong shader no longer exposes ${needle}`);
  }
  return source.replace(needle, replacement);
};

const createFragmentShader = (): string => {
  let shader = THREE.ShaderLib.phong.fragmentShader;
  shader = replaceChunk(shader, "map_pars_fragment", CUSTOM_MAP_PARS);
  shader = replaceChunk(shader, "bumpmap_pars_fragment", CUSTOM_RELIEF);
  shader = replaceChunk(shader, "map_fragment", CUSTOM_DIFFUSE);
  shader = replaceChunk(shader, "specularmap_fragment", CUSTOM_SPECULAR);
  shader = replaceChunk(shader, "normal_fragment_maps", CUSTOM_NORMAL_AND_FINISH);
  return shader;
};

const CLEAN_ROOM_FRAGMENT_SHADER = createFragmentShader();

export const createCleanRoomLayeredMaterial = (
  profile: CleanRoomMaterialProfile,
  maps: CleanRoomMaterialMaps,
  surface: "cover" | "spine"
): CleanRoomLayeredMaterial => {
  const uniforms = THREE.UniformsUtils.clone(THREE.ShaderLib.phong.uniforms);
  Object.assign(uniforms, {
    // The authored custom diffuse owns the surface colour. A grey Phong base
    // multiplied it a second time, which was easy to miss on the shelf but
    // made route-scale straw and ochre covers dissolve into their section.
    diffuse: { value: new THREE.Color(0xffffff) },
    emissive: {
      value: new THREE.Color(profile.specular)
        .lerp(new THREE.Color(0x000000), surface === "spine" ? 0.94 : 0.975)
    },
    specular: { value: new THREE.Color(profile.specular) },
    shininess: { value: profile.shininess },
    opacity: { value: 1 },
    map: { value: maps.customDiffuse },
    diffuseMapBase: { value: maps.baseDiffuse },
    diffuseMapCustom: { value: maps.customDiffuse },
    bumpMapBase: { value: maps.baseBump },
    bumpMapCustom: { value: maps.customBump },
    foilMap: { value: maps.foil },
    glossMap: { value: maps.gloss },
    glitterMap: { value: maps.glitter },
    baseMapScale: {
      value: surface === "cover" ? new THREE.Vector2(3.2, 3.8) : new THREE.Vector2(5.6, 1.25)
    },
    glitterMapScale: {
      value: surface === "cover" ? new THREE.Vector2(2.4, 2.8) : new THREE.Vector2(6.4, 1.2)
    },
    baseDiffuseStrength: {
      value: surface === "cover" ? profile.cover.diffuseStrength : profile.baseDiffuseStrength
    },
    // Measured mean luminance of polyhaven-book-pattern-colour-1k.jpg
    // (60.4/255). The re-level is only mean-neutral if this tracks the map, so
    // it belongs here rather than as a literal in the blend.
    baseDiffuseLevel: { value: BASE_DIFFUSE_LEVEL },
    baseDiffuseContrast: {
      value: surface === "cover" ? profile.cover.diffuseContrast : profile.baseDiffuseContrast
    },
    bumpScaleBase: { value: profile.bump.base },
    bumpScaleCustom: { value: profile.bump.custom },
    effectReliefSuppression: { value: 0.68 },
    // The spine carries the crown. The cover is authored separately rather than
    // as a fraction of it: a cover between boards is a different shape, and the
    // statistic the spine's value is tuned against barely contains the cover.
    surfaceCurvature: { value: surface === "spine" ? profile.spineCrown : profile.cover.crown },
    reflectiveness: { value: profile.reflectiveness },
    foilColorA: { value: new THREE.Color(profile.foil.colors[0]) },
    foilColorB: { value: new THREE.Color(profile.foil.colors[1]) },
    foilDetail: { value: profile.foil.detail },
    foilOpacity: { value: profile.foil.opacity },
    foilSpecular: { value: profile.foil.specular },
    foilEmissive: { value: profile.foil.emissive },
    glossOpacity: { value: profile.gloss.opacity },
    glossSpecular: { value: profile.gloss.specular },
    glossEmissive: { value: profile.gloss.emissive },
    glitterOpacity: { value: profile.glitter.opacity },
    glitterSpecular: { value: profile.glitter.specular },
    glitterEmissive: { value: profile.glitter.emissive }
  });

  const material = new THREE.ShaderMaterial({
    name: `clean-room-${surface}-seven-map`,
    defines: { USE_MAP: "", MAP_UV: "uv" },
    uniforms,
    vertexShader: THREE.ShaderLib.phong.vertexShader,
    fragmentShader: CLEAN_ROOM_FRAGMENT_SHADER,
    lights: true,
    transparent: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });

  material.userData.cleanRoomMaterial = {
    architecture: "clean-room-shader-material",
    mapCount: 7,
    surface
  };

  return {
    material,
    diagnostics: {
      architecture: "clean-room-shader-material",
      mapCount: 7,
      mapNames: MAP_NAMES,
      diffuseSize: maps.dimensions.diffuse,
      maskSize: maps.dimensions.masks,
      responseSignature: [
        profile.shininess,
        profile.reflectiveness,
        profile.bump.base,
        profile.bump.custom,
        profile.foil.opacity,
        profile.gloss.opacity,
        profile.glitter.opacity,
        // The overlay made these two authored per volume, so they belong in the
        // signature the foundation gate counts — a behaviour change earns the
        // assertion rather than riding on the old fields staying distinct.
        profile.baseDiffuseStrength,
        profile.baseDiffuseContrast
      ].join("/")
    }
  };
};
