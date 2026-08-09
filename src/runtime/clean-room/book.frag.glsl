/*
 * BOOK COVER FRAGMENT SHADER
 *
 * This shader creates realistic book cover materials with multiple layers:
 * - Base diffuse textures (shared + custom)
 * - Bump mapping for surface detail
 * - Foil effects with animated reflections
 * - Gloss effects with procedural colors
 * - Glitter effects with tiled patterns
 * - Phong lighting with dynamic specularity
 *
 * The shader uses overlay blending to combine multiple texture layers
 * and creates animated effects based on surface normals and view position.
 */

// Enable Phong lighting model from Three.js
#define PHONG

// Inputs from vertex shader
varying vec2 vUv;        // UV coordinates for texture sampling
varying vec3 vNormal;     // Surface normal vector

// Basic material properties
uniform vec3 specular;     // Specular color (usually white)
uniform float shininess;   // How sharp specular highlights are
uniform float reflectiveness; // Base reflectivity of the material

// Diffuse texture system - two layers that can be blended
uniform sampler2D diffuseMapBase;   // Shared base texture (e.g., paper grain)
uniform sampler2D diffuseMapCustom; // Custom texture (e.g., book cover design)
uniform vec3 diffuseBaseColor;      // Fallback color when textures are black

// Bump mapping system - creates surface detail without geometry
uniform sampler2D bumpMapBase;      // Base bump map (e.g., paper texture)
uniform sampler2D bumpMapCustom;    // Custom bump map (e.g., embossed text)
uniform float bumpScaleBase;        // Intensity of base bump mapping
uniform float bumpScaleCustom;      // Intensity of custom bump mapping

// Foil effect system - creates metallic, reflective areas
uniform sampler2D foilMap;         // Mask defining where foil appears
uniform float foilDetail;          // Controls foil animation speed/detail
uniform float foilOpacity;         // Overall foil effect strength
uniform float foilEmissive;        // How much foil glows
uniform float foilSpecular;        // How reflective foil areas are
const vec2 foilUvSize = vec2(0.14, -0.19); // Size of foil texture tiles

// Gloss effect system - creates shiny, wet-looking areas
uniform sampler2D glossMap;        // Mask defining where gloss appears
uniform float glossOpacity;        // Overall gloss effect strength
uniform float glossSpecular;       // How reflective gloss areas are
uniform float glossEmissive;       // How much gloss glows

// Glitter effect system - creates sparkly, metallic particles
uniform sampler2D glitterMap;     // Glitter pattern texture
uniform float glitterOpacity;      // Overall glitter effect strength
uniform float glitterSpecular;     // How reflective glitter particles are
uniform float glitterEmissive;     // How much glitter glows

// Include Three.js shader chunks for lighting and common functions
#include <common>                    // Common GLSL functions and constants
#include <bsdfs>                     // Bidirectional Scattering Distribution Functions
#include <lights_pars_begin>         // Light parsing functions
#include <lights_phong_pars_fragment> // Phong lighting model functions

//
// UTILITY FUNCTIONS
//

/*
 * Pseudo-random number generator
 * Creates deterministic "random" values from 2D coordinates
 * Used for procedural effects and noise generation
 */
float randy(vec2 co){
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

/*
 * OVERLAY BLENDING MODE
 *
 * Overlay blending combines two values using Photoshop's overlay mode:
 * - If base < 0.5: Multiply blend (darkens)
 * - If base >= 0.5: Screen blend (lightens)
 *
 * This creates contrast enhancement - dark areas get darker,
 * light areas get lighter, mid-tones stay similar.
 */
float blendOverlay(float base, float blend) {
  return base < 0.5
    ? 2.0 * base * blend                    // Multiply: darkens
    : 1.0 - 2.0 * (1.0 - base) * (1.0 - blend); // Screen: lightens
}

/*
 * Overlay blending with opacity control
 * Blends between overlay result and original base value
 */
float blendOverlay(float base, float blend, float opacity) {
  return blendOverlay(base, blend) * opacity + base * (1.0 - opacity);
}

/*
 * Vector version of overlay blending for RGBA colors
 * Applies overlay blending to each color channel separately
 */
vec4 blendOverlay(vec4 base, vec4 blend) {
  return vec4(
    blendOverlay(base.r, blend.r),
    blendOverlay(base.g, blend.g),
    blendOverlay(base.b, blend.b),
    (base.a + blend.a) / 2.0  // Average alpha channels
  );
}

/*
 * Vector overlay blending with opacity control
 * Allows fine-tuning of blend strength
 */
vec4 blendOverlay(vec4 base, vec4 blend, float opacity) {
  return vec4(
    blendOverlay(base.r, blend.r, opacity),
    blendOverlay(base.g, blend.g, opacity),
    blendOverlay(base.b, blend.b, opacity),
    (base.a + blend.a) / 2.0
  );
}

//
// BUMP MAPPING SYSTEM
//

/*
 * CALCULATE HEIGHT GRADIENTS FOR BUMP MAPPING
 *
 * This function calculates the gradient of the height field (bump map)
 * in screen space. It uses finite differences to compute how the
 * surface height changes in X and Y directions.
 *
 * The function combines multiple bump maps using overlay blending
 * and modulates their influence based on other effects (foil, gloss, glitter).
 */
vec2 dHdxy_fwd() {

  // Calculate screen-space derivatives of UV coordinates
  // These tell us how much UV coordinates change per pixel
  vec2 dSTdx = dFdx( vUv );  // Change in U per pixel in X direction
  vec2 dSTdy = dFdy( vUv );  // Change in V per pixel in Y direction

  // Calculate inverse coverage masks for other effects
  // These reduce bump mapping where foil/gloss/glitter are present
  float inverseFoilCoverage = 1.0 - texture2D( foilMap, vUv ).r * foilOpacity;
  float inverseGlossCoverage = 1.0 - texture2D( glossMap, vUv ).r * (glossOpacity * 10.);
  float inverseGlitterCoverage = 1.0 - texture2D( glitterMap, vUv ).r * (glitterOpacity);

  // Normalize bump scales to prevent over-amplification
  float scaleMax = max(bumpScaleBase, bumpScaleCustom);
  float scaleBaseNorm = bumpScaleBase / scaleMax;
  float scaleCustomNorm = bumpScaleCustom / scaleMax;

  // Calculate height at current pixel using overlay blending
  // Center the bump map values around 0.5 (neutral height)
  float Hll = scaleMax * blendOverlay(
    0.5 + (texture2D( bumpMapBase,   vUv ).x - 0.5) * scaleBaseNorm * inverseFoilCoverage * inverseGlossCoverage * inverseGlitterCoverage,
    0.5 + (texture2D( bumpMapCustom, vUv ).x - 0.5) * scaleCustomNorm
  );

  // Calculate height gradients by sampling neighboring pixels
  // This gives us the slope of the surface
  float dBx = scaleMax * blendOverlay(
    0.5 + (texture2D( bumpMapBase,   vUv + dSTdx ).x - 0.5) * scaleBaseNorm * inverseFoilCoverage * inverseGlossCoverage * inverseGlitterCoverage,
    0.5 + (texture2D( bumpMapCustom, vUv + dSTdx ).x - 0.5) * scaleCustomNorm
  ) - Hll;

  float dBy = scaleMax * blendOverlay(
    0.5 + (texture2D( bumpMapBase,   vUv + dSTdy ).x - 0.5) * scaleBaseNorm * inverseFoilCoverage * inverseGlossCoverage * inverseGlitterCoverage,
    0.5 + (texture2D( bumpMapCustom, vUv + dSTdy ).x - 0.5) * scaleCustomNorm
  ) - Hll;

  // Return the height gradients in screen space
  return vec2( dBx, dBy );
}

/*
 * PERTURB SURFACE NORMAL USING BUMP MAPPING
 *
 * This function modifies the surface normal based on bump map gradients.
 * It implements arbitrary surface perturbation, which works on any
 * surface orientation (not just flat surfaces).
 *
 * The algorithm:
 * 1. Calculate tangent vectors from surface position derivatives
 * 2. Create a coordinate system using the surface normal
 * 3. Apply bump gradients to perturb the normal
 * 4. Return the new, perturbed normal vector
 */
vec3 perturbNormalArb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection ) {

  // Workaround for Adreno 3XX GPU bug with dFdx/dFdy on vec3
  // See Three.js issue #9988 for details

  // Calculate tangent vectors from surface position derivatives
  // These represent how the surface changes in screen space
  vec3 vSigmaX = vec3( dFdx( surf_pos.x ), dFdx( surf_pos.y ), dFdx( surf_pos.z ) );
  vec3 vSigmaY = vec3( dFdy( surf_pos.x ), dFdy( surf_pos.y ), dFdy( surf_pos.z ) );
  vec3 vN = surf_norm;		// Original surface normal (normalized)

  // Create coordinate system vectors using cross products
  // R1 and R2 form a basis for the tangent space
  vec3 R1 = cross( vSigmaY, vN );  // Tangent vector 1
  vec3 R2 = cross( vN, vSigmaX );  // Tangent vector 2

  // Calculate determinant to check orientation
  // This ensures we maintain correct surface orientation
  float fDet = dot( vSigmaX, R1 ) * faceDirection;

  // Apply bump gradients to perturb the normal
  // dHdxy contains the height gradients from bump mapping
  vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );

  // Combine original normal with perturbation and normalize
  return normalize( abs( fDet ) * surf_norm - vGrad );
}

//
// MAIN FRAGMENT SHADER FUNCTION
//

void main() {

  // STEP 1: CALCULATE PERTURBED SURFACE NORMAL
  // Apply bump mapping to create surface detail
  vec3 normal = perturbNormalArb( -vViewPosition, vNormal, dHdxy_fwd(), 1.0 );

  // STEP 2: COMBINE DIFFUSE TEXTURES
  // Blend base texture (paper grain) with custom texture (book cover design)
  vec4 diffuseColor = blendOverlay(
    texture2D( diffuseMapBase, vUv ),    // Shared base texture
    texture2D( diffuseMapCustom, vUv )   // Custom cover texture
  );

  // Fallback to base color if textures are completely black
  if (diffuseColor.rgb == vec3(0.0, 0.0, 0.0)) {
    diffuseColor = vec4(diffuseBaseColor, 1.0);
  }

  // STEP 3: APPLY FOIL EFFECT
  // Creates animated metallic reflections that change with view angle

  // Generate animated UV coordinates based on surface normal and view position
  // This creates the "shifting" effect of foil as you move around
  vec2 foilIndex = vec2(
    sin(-normal.y * foilDetail  +  vViewPosition.y * foilDetail / 10.0),
    cos(-normal.x * foilDetail  +  vViewPosition.x * foilDetail / 10.0)
  ) / 2.0;

  // Transform to proper UV space for foil texture sampling
  foilIndex = vec2(0.0, 1.0) + foilUvSize / 2.0 + foilIndex * foilUvSize;

  // Sample foil color from custom texture using animated coordinates
  vec4 foilColor = texture2D( diffuseMapCustom, foilIndex );
  float foilCoverage = texture2D( foilMap, vUv ).r;  // Mask defining foil areas

  // Blend foil effect into diffuse color
  diffuseColor = mix(diffuseColor, foilColor, foilCoverage * foilOpacity);

  // Fallback for foil color
  if (foilColor.rgb == vec3(0.0, 0.0, 0.0)) {
    foilColor = vec4(diffuseBaseColor, 1.0);
    foilCoverage = foilColor.r;
  }

  // STEP 4: APPLY GLOSS EFFECT
  // Creates shiny, wet-looking areas with procedural colors

  // Generate procedural gloss colors using sine waves
  // Colors change based on surface normal and view position
  vec4 glossColor = vec4(
    0.5 * (0.5 + 0.5 * (sin(-normal.y * vViewPosition.y * 2. + normal.x * vViewPosition.x * 2.))),
    0.5 * (0.5 + 0.5 * (sin(normal.y * vViewPosition.x * 2.))),
    0.5 * (0.5 + 0.5 * (sin(normal.x * vViewPosition.x * 2.))), 1.);

  float glossCoverage = texture2D( glossMap, vUv ).r;  // Mask defining gloss areas

  // Blend gloss effect into diffuse color
  diffuseColor = mix(diffuseColor, glossColor, glossCoverage * glossOpacity);

  // STEP 5: APPLY GLITTER EFFECT
  // Creates sparkly metallic particles

  // Tile the UV coordinates to create small glitter particles
  float glitterCoverage = texture2D( glitterMap, fract(vUv * 30.) ).r;
  vec4 glitterColor = texture2D( glitterMap, fract(vUv * 30.) );

  // Blend glitter effect (reduced intensity for subtlety)
  diffuseColor = mix(diffuseColor, glitterColor * 0.3, glitterCoverage * 0.3);

  // STEP 6: CALCULATE LIGHTING
  // Combine all specular contributions for realistic reflections

  // Calculate total specular strength from all effects
  float specularStrength = reflectiveness + foilCoverage * foilSpecular + glossCoverage * glossSpecular + glitterCoverage * glitterSpecular * glitterOpacity;

  // Initialize lighting accumulator
  ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );

  // Apply Three.js Phong lighting model
  #include <lights_phong_fragment>    // Calculate Phong lighting
  #include <lights_fragment_begin>    // Initialize light calculations
  #include <lights_fragment_maps>      // Apply texture maps to lighting
  #include <lights_fragment_end>      // Finalize light calculations

  // Combine all lighting contributions
  vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse
                      + reflectedLight.directSpecular + reflectedLight.indirectSpecular;

  // STEP 7: APPLY EMISSIVE EFFECTS
  // Add glow from foil, gloss, and glitter effects
  // This creates the "self-illuminated" appearance of metallic materials
  outgoingLight = mix(outgoingLight, foilColor.rgb * glossColor.rgb, foilCoverage * foilEmissive * foilOpacity * glossCoverage * glossEmissive * glossOpacity * glitterCoverage * glitterEmissive * glitterOpacity);

  // Output final color with original alpha
  gl_FragColor = vec4( outgoingLight, diffuseColor.a );
}