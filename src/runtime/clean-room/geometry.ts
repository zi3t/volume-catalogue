import * as THREE from "three";

import {
  createCleanRoomLayeredMaterial,
  type CleanRoomMaterialDiagnostics
} from "./material";
import type { CleanRoomVolumeProfile } from "./profiles";
import type { CleanRoomSharedTextures, CleanRoomSurfaceTextures } from "./textures";

export interface CleanRoomBook {
  /** Reference outer pose: shelf/list placement or active-volume placement. */
  readonly root: THREE.Group;
  /** Centered interactive cover pivot; pointer motion rotates only this node. */
  readonly cover: THREE.Group;
  /** Maps the local X-width/Y-thickness model into the reference model axes. */
  readonly axisAdapter: THREE.Group;
  /** Authored geometry and per-volume dimensional correction. */
  readonly object: THREE.Group;
  readonly materials: readonly THREE.Material[];
  readonly geometries: readonly THREE.BufferGeometry[];
  readonly materialModel: {
    readonly cover: CleanRoomMaterialDiagnostics;
    readonly spine: CleanRoomMaterialDiagnostics;
  };
  readonly bindingModel: {
    readonly spineSegments: number;
    readonly coverJointCount: 2;
    readonly spineHubCount: 0;
    readonly coverJointInset: number;
    readonly coverJointWidth: number;
    readonly coverJointDepth: number;
    readonly coverSkinOffset: number;
    readonly coverClothThickness: number;
    readonly coverJointClearance: number;
    readonly spineSpan: number;
    readonly spineSpanRatio: number;
    readonly boardStopsAtJoint: true;
    readonly boardCornerRadius: number;
    readonly pageBlockInset: number;
    readonly spineEndCapCount: 2;
    readonly spineEndCapDepth: number;
    readonly headbandCount: 2;
  };
}

/**
 * Head/tail silhouette sampled from Stripe's shared case mesh at the 3.4-unit
 * thickness used by the supplied Poor Charlie's frame, then normalized to its
 * full depth and board half-thickness. Keeping those points dimensionless lets
 * every local volume preserve the reference joint and backstrip curve.
 */
const REFERENCE_CASE_OUTER_PROFILE = [
  [0.9211273, 1],
  [0.9248393, 0.9970839],
  [0.9285523, 0.9883351],
  [0.9321254, 0.9740871],
  [0.9376543, 0.9472585],
  [0.9412609, 0.9323476],
  [0.9450835, 0.921702],
  [0.9490297, 0.9157717],
  [0.9529976, 0.9147754],
  [0.9568838, 0.9186748],
  [0.9605928, 0.9271836],
  [0.9691468, 0.9525778],
  [0.9730141, 0.9640591],
  [0.9770131, 0.9706447],
  [0.9806417, 0.975931],
  [0.9885884, 0.975931],
  [0.9918405, 0.9733125],
  [0.9951397, 0.9620594],
  [0.9978567, 0.9390826],
  [0.9994839, 0.9125945],
  [1, 0.8828633]
] as const;

const SPINE_SHOULDER_PROFILE_INDEX = 15;
const SPINE_SHOULDER_RATIO = (
  REFERENCE_CASE_OUTER_PROFILE[SPINE_SHOULDER_PROFILE_INDEX][1]
);
const SPINE_FACE_RATIO = REFERENCE_CASE_OUTER_PROFILE.at(-1)?.[1] ?? 0.8828633;

const profileRowAt = (progress: number, depth: number): number => (
  -depth * 0.5 + progress * depth
);

const caseHalfSpanRatioAt = (row: number, depth: number): number => {
  const progress = THREE.MathUtils.clamp(row / depth + 0.5, 0, 1);
  const first = REFERENCE_CASE_OUTER_PROFILE[0];
  if (progress <= first[0]) return 1;

  for (let index = 1; index < REFERENCE_CASE_OUTER_PROFILE.length; index += 1) {
    const previous = REFERENCE_CASE_OUTER_PROFILE[index - 1];
    const current = REFERENCE_CASE_OUTER_PROFILE[index];
    if (progress > current[0]) continue;
    const across = (progress - previous[0]) / (current[0] - previous[0]);
    return THREE.MathUtils.lerp(previous[1], current[1], across);
  }
  return SPINE_FACE_RATIO;
};

const caseOuterOffsetAt = (
  row: number,
  depth: number,
  thickness: number
): number => (
  (caseHalfSpanRatioAt(row, depth) - 1) * thickness * 0.5
);

const createSpineGeometry = (
  width: number,
  thickness: number,
  depth: number
): THREE.BufferGeometry => {
  const halfThickness = thickness * 0.5;
  const crown = REFERENCE_CASE_OUTER_PROFILE.slice(SPINE_SHOULDER_PROFILE_INDEX);
  const rows = [
    ...crown.map(([progress, ratio]) => ({
      y: -halfThickness * ratio,
      z: profileRowAt(progress, depth)
    })),
    { y: 0, z: depth * 0.5 },
    ...[...crown].reverse().map(([progress, ratio]) => ({
      y: halfThickness * ratio,
      z: profileRowAt(progress, depth)
    }))
  ];
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const shoulderHalfSpan = halfThickness * SPINE_SHOULDER_RATIO;

  rows.forEach(({ y, z }) => {
    const v = y / (shoulderHalfSpan * 2) + 0.5;
    positions.push(-width * 0.5, y, z, width * 0.5, y, z);
    uvs.push(0, v, 1, v);
  });
  for (let row = 0; row < rows.length - 1; row += 1) {
    const lowerLeft = row * 2;
    const lowerRight = lowerLeft + 1;
    const upperLeft = lowerLeft + 2;
    const upperRight = lowerLeft + 3;
    indices.push(
      lowerLeft, lowerRight, upperRight,
      lowerLeft, upperRight, upperLeft
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

type CoverWrapEdge = "head" | "tail" | "fore";

/**
 * Samples a narrow strip from the cover's own UV space onto its turned edge.
 * Diffuse, bump, foil, and gloss therefore stay registered through the fold;
 * an edge only carries stripes when that volume's actual artwork reaches it.
 */
const createCoverWrapGeometry = (
  span: number,
  thickness: number,
  edge: CoverWrapEdge,
  upper: boolean,
  bookWidth: number,
  bookDepth: number,
  bookThickness: number
): THREE.PlaneGeometry => {
  const geometry = new THREE.PlaneGeometry(
    span,
    thickness,
    edge === "fore" ? 1 : 128,
    1
  );
  const uvs = geometry.getAttribute("uv");
  const positions = geometry.getAttribute("position");
  if (!uvs) throw new Error("Cover-wrap geometry has no UV attribute");
  if (!positions) throw new Error("Cover-wrap geometry has no position attribute");
  const edgeBand = edge === "fore"
    ? THREE.MathUtils.clamp(thickness / bookDepth, 0.004, 0.06)
    : THREE.MathUtils.clamp(thickness / bookWidth, 0.004, 0.06);

  for (let index = 0; index < uvs.count; index += 1) {
    const along = uvs.getX(index);
    const across = uvs.getY(index);
    const inward = upper ? 1 - across : across;
    let coverV: number;
    if (edge === "head") {
      coverV = upper ? along : 1 - along;
      uvs.setXY(index, 1 - inward * edgeBand, coverV);
    } else if (edge === "tail") {
      coverV = upper ? 1 - along : along;
      uvs.setXY(index, inward * edgeBand, coverV);
    } else {
      coverV = upper ? 1 - inward * edgeBand : inward * edgeBand;
      uvs.setXY(index, 1 - along, coverV);
    }

    if (edge !== "fore") {
      // Head wraps rotate +90° around Y and tail wraps rotate -90°, so their
      // local x axes run in opposite depth directions. Geometry, not artwork
      // UV orientation, owns the silhouette sample.
      const row = (edge === "head" ? -1 : 1) * positions.getX(index);
      const offset = caseOuterOffsetAt(row, bookDepth, bookThickness);
      const outerWeight = upper ? across : 1 - across;
      positions.setY(
        index,
        positions.getY(index) + (upper ? offset : -offset) * outerWeight
      );
    }
  }
  uvs.needsUpdate = true;
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
};

const createCoverJointGeometry = (
  length: number,
  boardDepth: number,
  bookThickness: number
): THREE.BufferGeometry => {
  const halfDepth = boardDepth * 0.5;
  const shoulderProfile = REFERENCE_CASE_OUTER_PROFILE.slice(
    0,
    SPINE_SHOULDER_PROFILE_INDEX + 1
  );
  const rows = [
    -halfDepth,
    ...shoulderProfile.map(([progress]) => profileRowAt(progress, boardDepth))
  ]
    .map((value) => THREE.MathUtils.clamp(value, -halfDepth, halfDepth))
    .sort((left, right) => left - right)
    .filter((value, index, values) => {
      const previous = values[index - 1];
      return previous === undefined || Math.abs(value - previous) > 1e-6;
    });

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  rows.forEach((row) => {
    const recess = caseOuterOffsetAt(row, boardDepth, bookThickness);
    positions.push(
      -length * 0.5, row, recess,
      length * 0.5, row, recess
    );
    const v = row / boardDepth + 0.5;
    uvs.push(0, v, 1, v);
  });
  for (let row = 0; row < rows.length - 1; row += 1) {
    const lowerLeft = row * 2;
    const lowerRight = lowerLeft + 1;
    const upperLeft = lowerLeft + 2;
    const upperRight = lowerLeft + 3;
    indices.push(
      lowerLeft, lowerRight, upperRight,
      lowerLeft, upperRight, upperLeft
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

const createJointBridgeGeometry = (
  length: number,
  jointZ: number,
  jointWidth: number,
  jointDepth: number,
  clothThickness: number
): THREE.ExtrudeGeometry => {
  const segments = 16;
  const jointStart = jointZ - jointWidth * 0.5;
  const shape = new THREE.Shape();
  const recessAt = (progress: number) => (
    -(Math.sin(progress * Math.PI) ** 2) * jointDepth
  );

  shape.moveTo(jointStart, recessAt(0));
  for (let index = 1; index <= segments; index += 1) {
    const progress = index / segments;
    shape.lineTo(jointStart + jointWidth * progress, recessAt(progress));
  }
  for (let index = segments; index >= 0; index -= 1) {
    const progress = index / segments;
    shape.lineTo(
      jointStart + jointWidth * progress,
      recessAt(progress) - clothThickness
    );
  }
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: length,
    steps: 1,
    bevelEnabled: false,
    curveSegments: 4
  });
  geometry.rotateY(-Math.PI / 2);
  geometry.translate(length * 0.5, 0, 0);
  geometry.computeVertexNormals();
  return geometry;
};

const createBoardGeometry = (
  length: number,
  foreEdge: number,
  boundEdge: number,
  thickness: number,
  cornerRadius: number
): THREE.ExtrudeGeometry => {
  const halfThickness = thickness * 0.5;
  const radius = Math.min(
    cornerRadius,
    halfThickness * 0.9,
    (boundEdge - foreEdge) * 0.25
  );
  const shape = new THREE.Shape();

  // A case-bound board ends before the exterior joint. The covering cloth,
  // authored separately below, bridges the remaining distance to the spine.
  // Keeping rigid substrate under that bridge forces the dip to remain a full
  // board thickness away from the page block and creates the false broad dent
  // the side reference exposed.
  shape.moveTo(foreEdge + radius, -halfThickness);
  shape.lineTo(boundEdge - radius, -halfThickness);
  shape.quadraticCurveTo(
    boundEdge,
    -halfThickness,
    boundEdge,
    -halfThickness + radius
  );
  shape.lineTo(boundEdge, halfThickness - radius);
  shape.quadraticCurveTo(
    boundEdge,
    halfThickness,
    boundEdge - radius,
    halfThickness
  );
  shape.lineTo(foreEdge + radius, halfThickness);
  shape.quadraticCurveTo(
    foreEdge,
    halfThickness,
    foreEdge,
    halfThickness - radius
  );
  shape.lineTo(foreEdge, -halfThickness + radius);
  shape.quadraticCurveTo(
    foreEdge,
    -halfThickness,
    foreEdge + radius,
    -halfThickness
  );
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: length,
    steps: 1,
    bevelEnabled: false,
    curveSegments: 4
  });
  // ExtrudeGeometry grows along +z. Rotate that axis into the book's long x
  // axis while preserving the shape's x coordinate as book depth.
  geometry.rotateY(-Math.PI / 2);
  geometry.translate(length * 0.5, 0, 0);
  geometry.computeVertexNormals();
  return geometry;
};

const createSpineEndCapGeometry = (
  height: number,
  turnIn: number,
  bulge: number
): THREE.ShapeGeometry => {
  const halfHeight = height * 0.5;
  const segments = 16;
  const shape = new THREE.Shape();
  shape.moveTo(0, -halfHeight);
  for (let index = 0; index <= segments; index += 1) {
    const progress = index / segments;
    const y = THREE.MathUtils.lerp(-halfHeight, halfHeight, progress);
    const crown = Math.sin(progress * Math.PI) * bulge;
    // Negative shape-x rotates into positive model-z below. The straight
    // inside edge closes against the text block; the crowned outside edge is
    // the cloth turn-in visible at the head and tail of the case.
    shape.lineTo(-(turnIn + crown), y);
  }
  shape.lineTo(0, halfHeight);
  shape.closePath();

  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateY(Math.PI / 2);
  geometry.computeVertexNormals();
  return geometry;
};

const smoothstep = (edge0: number, edge1: number, value: number): number => {
  const progress = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return progress * progress * (3 - 2 * progress);
};

/**
 * A text block is not a machined cuboid. The dense subdivisions let its fore
 * edge cup inward through the middle, soften the head and tail, and carry a
 * minute deterministic leaf wave into the silhouette instead of asking a flat
 * texture to fake all three effects.
 */
const createPageBlockGeometry = (
  width: number,
  height: number,
  depth: number
): THREE.BoxGeometry => {
  const geometry = new THREE.BoxGeometry(width, height, depth, 48, 18, 24);
  const positions = geometry.getAttribute("position");
  if (!positions) throw new Error("Page-block geometry has no position attribute");
  const halfWidth = width * 0.5;
  const halfHeight = height * 0.5;
  const halfDepth = depth * 0.5;

  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const z = positions.getZ(index);
    const normalizedX = halfWidth > 0 ? x / halfWidth : 0;
    const normalizedY = halfHeight > 0 ? y / halfHeight : 0;
    const normalizedZ = halfDepth > 0 ? z / halfDepth : 0;
    const faceWeight = smoothstep(0.72, 1, Math.abs(normalizedY));
    const endRound = smoothstep(0.82, 1, Math.abs(normalizedX)) * 0.0022;
    const leafWave = (
      Math.sin((normalizedX + 1) * 31.7)
      + Math.sin((normalizedX - normalizedZ) * 17.3) * 0.45
    ) * 0.00012;
    const adjustedY = y - Math.sign(y) * (endRound - leafWave) * faceWeight;
    const foreWeight = smoothstep(0.82, 1, -normalizedZ);
    const foreCup = (1 - normalizedY * normalizedY) * 0.0017;
    const adjustedZ = z + foreWeight * (
      foreCup + Math.sin((normalizedY + 1) * 39.1) * 0.00012
    );
    positions.setXYZ(index, x, adjustedY, adjustedZ);
  }

  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
};

/**
 * One extruded U-shaped case carries both boards, both hinges, the spine, and
 * the head/tail cross-sections. Decorative cover and spine skins sit a fraction
 * above it, but the silhouette and normals no longer terminate at mesh seams.
 */
const createCaseShellGeometry = (
  length: number,
  depth: number,
  thickness: number,
  blockThickness: number
): THREE.ExtrudeGeometry => {
  const spineSegments = 28;
  const foreEdge = -depth * 0.5;
  const halfThickness = thickness * 0.5;
  const innerHalfThickness = blockThickness * 0.5 + 0.0002;
  const innerSpine = depth * 0.5 - 0.0022;
  const innerCrown = 0.0012;
  const shape = new THREE.Shape();

  shape.moveTo(foreEdge, halfThickness);
  REFERENCE_CASE_OUTER_PROFILE.forEach(([progress, ratio]) => {
    shape.lineTo(
      profileRowAt(progress, depth),
      halfThickness * ratio
    );
  });
  [...REFERENCE_CASE_OUTER_PROFILE].reverse().forEach(([progress, ratio]) => {
    shape.lineTo(
      profileRowAt(progress, depth),
      -halfThickness * ratio
    );
  });
  shape.lineTo(foreEdge, -halfThickness);
  shape.lineTo(foreEdge, -innerHalfThickness);
  shape.lineTo(innerSpine, -innerHalfThickness);
  for (let index = 0; index <= spineSegments; index += 1) {
    const angle = -Math.PI * 0.5 + Math.PI * index / spineSegments;
    shape.lineTo(
      innerSpine + Math.cos(angle) * innerCrown,
      Math.sin(angle) * innerHalfThickness
    );
  }
  shape.lineTo(foreEdge, innerHalfThickness);
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: length,
    steps: 1,
    bevelEnabled: false,
    curveSegments: 8
  });
  geometry.rotateY(-Math.PI / 2);
  geometry.translate(length * 0.5, 0, 0);
  geometry.computeVertexNormals();
  return geometry;
};

export const createCleanRoomBook = (
  profile: CleanRoomVolumeProfile,
  surfaces: CleanRoomSurfaceTextures,
  shared: CleanRoomSharedTextures
): CleanRoomBook => {
  const width = 1;
  const depth = profile.depthRatio;
  const thickness = profile.thicknessRatio;
  const boardThickness = profile.binding.boardThicknessRatio;
  const boardCornerRadius = Math.min(boardThickness * 0.36, 0.0052);
  // The reference case is one continuous surface. Layered materials use
  // polygon offset for draw ordering, so physically lifting the cover/spine
  // skins only creates a bright rail at grazing shelf angles.
  const coverSkinOffset = 0;
  const coverClothThickness = 0.00055;
  const square = 0.018;
  const blockThickness = profile.binding.pageBlockThicknessRatio;
  // The reference backstrip is flat through its central face and rolls outward
  // into a taller shoulder; its face is not a smaller semicircle pasted onto
  // the full board caliper.
  const spineSpan = thickness * SPINE_FACE_RATIO;
  const foreEdgeZ = depth * -0.5;
  const boardBoundEdgeZ = profileRowAt(
    REFERENCE_CASE_OUTER_PROFILE[0][0],
    depth
  );
  const coverJointClearance = (
    boardThickness
    + coverSkinOffset
    - profile.binding.coverJoints.depth
    - coverClothThickness
  );

  const boardBump = shared.clothBump.clone();
  const boardTexture = profile.material.texture.board;
  boardBump.name = `clean-room-${profile.slug}-board-bump`;
  boardBump.wrapS = THREE.RepeatWrapping;
  boardBump.wrapT = THREE.RepeatWrapping;
  boardBump.repeat.set(...boardTexture.scale);
  boardBump.offset.set(...boardTexture.offset);
  boardBump.center.set(0.5, 0.5);
  boardBump.rotation = boardTexture.rotation;
  boardBump.needsUpdate = true;

  const clothMaterial = new THREE.MeshPhongMaterial({
    color: new THREE.Color(profile.cloth).multiplyScalar(1.02),
    bumpMap: boardBump,
    bumpScale: profile.material.bump.base * 0.3,
    specular: new THREE.Color(profile.material.specular).multiplyScalar(0.22),
    shininess: Math.max(1, profile.material.shininess * 0.35)
  });
  const backClothMaterial = new THREE.MeshPhongMaterial({
    color: new THREE.Color(profile.cloth).multiplyScalar(1.08),
    bumpMap: boardBump,
    bumpScale: profile.material.bump.base * 0.25,
    specular: new THREE.Color(profile.material.specular).multiplyScalar(0.34),
    shininess: Math.max(2, profile.material.shininess * 0.5),
    emissive: new THREE.Color(profile.cloth).multiplyScalar(0.08)
  });
  const coverLayer = createCleanRoomLayeredMaterial(
    profile.material,
    surfaces.cover,
    "cover"
  );
  const spineLayer = createCleanRoomLayeredMaterial(
    profile.material,
    surfaces.spine,
    "spine"
  );
  const pageMaterial = new THREE.MeshPhongMaterial({
    map: shared.paper,
    color: new THREE.Color(profile.binding.paper),
    specular: 0x202020,
    shininess: 3,
    emissive: 0x080808
  });
  const pageEdgeMaterial = new THREE.MeshPhongMaterial({
    map: surfaces.pageEdge,
    bumpMap: surfaces.pageEdge,
    bumpScale: 0.001,
    // The legacy light rig sums above one on a square-on leaf edge. White
    // material clips the paper texture completely, erasing the individual
    // signatures. Stripe's uploaded edge resolves around warm 208 rather than
    // display white under the same rake, so keep enough headroom for the map.
    color: new THREE.Color(profile.binding.paper).multiplyScalar(0.75),
    specular: 0x303030,
    shininess: 3,
    emissive: 0x000000
  });
  const endpaperMaterial = new THREE.MeshPhongMaterial({
    map: shared.paper,
    color: new THREE.Color(profile.binding.endpaper),
    emissive: new THREE.Color(profile.binding.endpaper).multiplyScalar(0.08),
    specular: new THREE.Color(profile.material.specular).multiplyScalar(0.28),
    shininess: Math.max(2, profile.material.shininess * 0.65)
  });
  const headbandMaterial = new THREE.MeshPhongMaterial({
    map: surfaces.headband,
    specular: new THREE.Color(profile.material.specular).multiplyScalar(0.35),
    shininess: Math.max(3, profile.material.shininess * 0.8)
  });
  const pageGeometry = createPageBlockGeometry(
    width - square * 2,
    blockThickness,
    depth - square
  );
  const endpaperGeometry = new THREE.PlaneGeometry(
    width - boardCornerRadius * 2,
    boardBoundEdgeZ - foreEdgeZ - boardCornerRadius * 2
  );
  const caseShellGeometry = createCaseShellGeometry(
    width,
    depth,
    thickness,
    blockThickness
  );
  const spineGeometry = createSpineGeometry(
    width,
    thickness,
    depth
  );
  const upperCoverGeometry = createCoverJointGeometry(
    width,
    depth,
    thickness
  );
  const lowerCoverGeometry = createCoverJointGeometry(
    width,
    depth,
    thickness
  );
  const headbandRadius = Math.max(0.0028, blockThickness * 0.026);
  const headbandGeometry = new THREE.CylinderGeometry(
    headbandRadius,
    headbandRadius,
    blockThickness,
    16
  );
  const coverWrapThickness = boardThickness + coverClothThickness;
  const upperHeadWrapGeometry = createCoverWrapGeometry(
    depth, coverWrapThickness, "head", true, width, depth,
    thickness
  );
  const upperTailWrapGeometry = createCoverWrapGeometry(
    depth, coverWrapThickness, "tail", true, width, depth,
    thickness
  );
  const lowerHeadWrapGeometry = createCoverWrapGeometry(
    depth, coverWrapThickness, "head", false, width, depth,
    thickness
  );
  const lowerTailWrapGeometry = createCoverWrapGeometry(
    depth, coverWrapThickness, "tail", false, width, depth,
    thickness
  );
  const upperForeWrapGeometry = createCoverWrapGeometry(
    width, coverWrapThickness, "fore", true, width, depth,
    thickness
  );
  const lowerForeWrapGeometry = createCoverWrapGeometry(
    width, coverWrapThickness, "fore", false, width, depth,
    thickness
  );

  const pages = new THREE.Mesh(pageGeometry, [
    pageEdgeMaterial,
    pageEdgeMaterial,
    pageMaterial,
    pageMaterial,
    pageEdgeMaterial,
    pageEdgeMaterial
  ]);
  // The block is flush at the bound edge and inset at the three unbound edges.
  // The previous negative offset did the reverse: it left a slot behind the
  // spine and ran the leaves flush to the fore edge, which reads as a printed
  // slab rather than a case-bound book when the volume turns.
  pages.position.z = square * 0.5;

  // The shell is structural cloth. Printed finishes live on the outer cover
  // and on the narrow wrap meshes below; painting the whole extrusion cap with
  // cover UVs projected artwork across the page-block opening.
  const caseShell = new THREE.Mesh(caseShellGeometry, clothMaterial);

  // The closed text block hides most of each pastedown, but the explicit
  // planes retain the endpaper in the square around the three unbound edges.
  const upperEndpaper = new THREE.Mesh(endpaperGeometry, endpaperMaterial);
  upperEndpaper.rotation.x = Math.PI / 2;
  upperEndpaper.position.y = thickness * 0.5 - boardThickness - 0.0001;
  upperEndpaper.position.z = (foreEdgeZ + boardBoundEdgeZ) * 0.5;
  const lowerEndpaper = new THREE.Mesh(endpaperGeometry, endpaperMaterial);
  lowerEndpaper.rotation.x = -Math.PI / 2;
  lowerEndpaper.position.y = -(thickness * 0.5 - boardThickness - 0.0001);
  lowerEndpaper.position.z = (foreEdgeZ + boardBoundEdgeZ) * 0.5;

  const upperCover = new THREE.Mesh(upperCoverGeometry, coverLayer.material);
  upperCover.rotation.x = -Math.PI / 2;
  upperCover.position.y = thickness * 0.5 + coverSkinOffset;
  // The authored cover maps describe the printed front board. Reusing them on
  // the back board painted the same stripes onto the otherwise plain lower
  // rail in the side view. The back remains the binding cloth.
  const lowerCover = new THREE.Mesh(lowerCoverGeometry, backClothMaterial);
  lowerCover.rotation.x = Math.PI / 2;
  lowerCover.position.y = -(thickness * 0.5 + coverSkinOffset);

  const wrapX = width * 0.5;
  const wrapY = thickness * 0.5 + coverSkinOffset - coverWrapThickness * 0.5;
  const wrapForeZ = foreEdgeZ;

  const upperHeadWrap = new THREE.Mesh(upperHeadWrapGeometry, coverLayer.material);
  upperHeadWrap.rotation.y = Math.PI / 2;
  upperHeadWrap.position.set(wrapX, wrapY, 0);
  const upperTailWrap = new THREE.Mesh(upperTailWrapGeometry, coverLayer.material);
  upperTailWrap.rotation.y = -Math.PI / 2;
  upperTailWrap.position.set(-wrapX, wrapY, 0);
  const lowerHeadWrap = new THREE.Mesh(lowerHeadWrapGeometry, backClothMaterial);
  lowerHeadWrap.rotation.y = Math.PI / 2;
  lowerHeadWrap.position.set(wrapX, -wrapY, 0);
  const lowerTailWrap = new THREE.Mesh(lowerTailWrapGeometry, backClothMaterial);
  lowerTailWrap.rotation.y = -Math.PI / 2;
  lowerTailWrap.position.set(-wrapX, -wrapY, 0);

  const upperForeWrap = new THREE.Mesh(upperForeWrapGeometry, coverLayer.material);
  upperForeWrap.rotation.y = Math.PI;
  upperForeWrap.position.set(0, wrapY, wrapForeZ);
  const lowerForeWrap = new THREE.Mesh(lowerForeWrapGeometry, backClothMaterial);
  lowerForeWrap.rotation.y = Math.PI;
  lowerForeWrap.position.set(0, -wrapY, wrapForeZ);

  const spine = new THREE.Mesh(spineGeometry, spineLayer.material);
  spine.position.z = 0;

  const headbandX = width * 0.5 - square - headbandRadius * 0.7;
  // A headband sits behind the backstrip at the bound edge of the text block.
  // The former -.65 radius placement let .35 radius protrude through the
  // spine face, turning each cord into a full-height striped catalogue bar.
  const headbandZ = depth * 0.5 - headbandRadius * 1.25;
  const headbandHead = new THREE.Mesh(headbandGeometry, headbandMaterial);
  headbandHead.position.set(headbandX, 0, headbandZ);
  const headbandTail = new THREE.Mesh(headbandGeometry, headbandMaterial);
  headbandTail.position.set(-headbandX, 0, headbandZ);

  const object = new THREE.Group();
  object.add(
    pages,
    caseShell,
    upperEndpaper,
    lowerEndpaper,
    upperCover,
    lowerCover,
    upperHeadWrap,
    upperTailWrap,
    lowerHeadWrap,
    lowerTailWrap,
    upperForeWrap,
    lowerForeWrap,
    spine,
    headbandHead,
    headbandTail
  );

  // Stripe's shared book mesh is X-thickness, Y-width, Z-depth. This clean-room
  // mesh is X-width, Y-thickness, Z-depth, so one fixed adapter makes the
  // reference's outer/cover Euler hierarchy applicable without distributing
  // interactive rotation across unrelated nodes.
  const axisAdapter = new THREE.Group();
  axisAdapter.rotation.z = -Math.PI / 2;
  axisAdapter.add(object);

  const cover = new THREE.Group();
  cover.add(axisAdapter);

  const root = new THREE.Group();
  root.add(cover);

  const materials = [
    clothMaterial,
    backClothMaterial,
    coverLayer.material,
    spineLayer.material,
    pageMaterial,
    pageEdgeMaterial,
    endpaperMaterial,
    headbandMaterial
  ];
  materials.forEach((material) => {
    material.transparent = true;
    material.depthWrite = true;
  });

  return {
    root,
    cover,
    axisAdapter,
    object,
    materials,
    geometries: [
      pageGeometry,
      caseShellGeometry,
      endpaperGeometry,
      upperCoverGeometry,
      lowerCoverGeometry,
      spineGeometry,
      upperHeadWrapGeometry,
      upperTailWrapGeometry,
      lowerHeadWrapGeometry,
      lowerTailWrapGeometry,
      upperForeWrapGeometry,
      lowerForeWrapGeometry,
      headbandGeometry
    ],
    materialModel: {
      cover: coverLayer.diagnostics,
      spine: spineLayer.diagnostics
    },
    bindingModel: {
      spineSegments: 12,
      coverJointCount: 2,
      spineHubCount: 0,
      coverJointInset: profile.binding.coverJoints.inset,
      coverJointWidth: profile.binding.coverJoints.width,
      coverJointDepth: profile.binding.coverJoints.depth,
      coverSkinOffset,
      coverClothThickness,
      coverJointClearance,
      spineSpan,
      spineSpanRatio: spineSpan / thickness,
      boardStopsAtJoint: true,
      boardCornerRadius,
      pageBlockInset: square,
      spineEndCapCount: 2,
      spineEndCapDepth: depth * (
        1 - REFERENCE_CASE_OUTER_PROFILE[SPINE_SHOULDER_PROFILE_INDEX][0]
      ),
      headbandCount: 2
    }
  };
};
