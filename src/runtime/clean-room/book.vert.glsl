varying vec2 vUv;
varying vec3 vViewPosition;
varying vec3 vNormal;

uniform float thickness;

// Thickness of the base mesh in centimeters
const float modelThickness = 3.374;

void main() {
  vUv = vec2(uv.x, uv.y);

  // Normals

  vec3 objectNormal = vec3( normal );
  vec3 transformedNormal = normalMatrix * objectNormal;
  vNormal = normalize( transformedNormal );

  // Book thickness

  vec3 transformed = vec3( position );
  float thicknessDelta = (thickness - modelThickness) / 2.0;

  if (transformed.x > 1.0) transformed.x += thicknessDelta;
  else if (transformed.x < -1.0) transformed.x -= thicknessDelta;

  // Projection

  vec4 mvPosition = vec4( transformed, 1.0 );
  mvPosition = modelViewMatrix * mvPosition;

  gl_Position = projectionMatrix * mvPosition;

  vViewPosition = - mvPosition.xyz;
}