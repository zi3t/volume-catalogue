import * as THREE from "three";

import {
  createCleanRoomLayeredMaterial,
  type CleanRoomMaterialDiagnostics
} from "./material";
import type { CleanRoomVolumeProfile } from "./profiles";
import type { CleanRoomSharedTextures, CleanRoomSurfaceTextures } from "./textures";

export interface CleanRoomBook {
  readonly root: THREE.Group;
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
    readonly boardStopsAtJoint: true;
    readonly boardCornerRadius: number;
    readonly pageBlockInset: number;
    readonly spineEndCapCount: 2;
    readonly spineEndCapDepth: number;
    readonly headbandCount: 2;
  };
}

const createSpineGeometry = (
  width: number,
  height: number,
  bulge: number
): THREE.PlaneGeometry => {
  const geometry = new THREE.PlaneGeometry(width, height, 1, 12);
  const positions = geometry.getAttribute("position");
  if (!positions) throw new Error("Spine geometry has no position attribute");
  for (let index = 0; index < positions.count; index += 1) {
    const normalizedY = THREE.MathUtils.clamp(
      positions.getY(index) / (height * 0.5),
      -1,
      1
    );
    // Match the case shell's semicircular crown. The former sine profile sat
    // behind that shell near both shoulders, leaving only a textured centre
    // band visible on the spine.
    positions.setZ(index, Math.sqrt(Math.max(0, 1 - normalizedY ** 2)) * bulge);
  }
  positions.needsUpdate = true;
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
  coverJointZ: number,
  coverJointWidth: number,
  coverJointDepth: number
): THREE.PlaneGeometry => {
  const geometry = new THREE.PlaneGeometry(
    span,
    thickness,
    edge === "fore" ? 1 : 32,
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
      const row = (coverV - 0.5) * bookDepth;
      const jointCenter = upper ? -coverJointZ : coverJointZ;
      const progress = (
        row - (jointCenter - coverJointWidth * 0.5)
      ) / coverJointWidth;
      if (progress >= 0 && progress <= 1) {
        const recess = -(
          Math.sin(progress * Math.PI) ** 2
        ) * coverJointDepth;
        const outerWeight = upper ? across : 1 - across;
        positions.setY(
          index,
          positions.getY(index) + (upper ? recess : -recess) * outerWeight
        );
      }
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
  jointY: number,
  jointWidth: number,
  jointDepth: number
): THREE.BufferGeometry => {
  const halfDepth = boardDepth * 0.5;
  const halfJoint = jointWidth * 0.5;
  const rows = [
    -halfDepth,
    ...Array.from({ length: 9 }, (_, index) => (
      jointY - halfJoint + jointWidth * index / 8
    )),
    halfDepth
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
    const acrossJoint = THREE.MathUtils.clamp(
      (row - (jointY - halfJoint)) / jointWidth,
      0,
      1
    );
    const insideJoint = row >= jointY - halfJoint && row <= jointY + halfJoint;
    const recess = insideJoint
      ? -(Math.sin(acrossJoint * Math.PI) ** 2) * jointDepth
      : 0;
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
  blockThickness: number,
  jointInset: number,
  jointWidth: number,
  jointDepth: number,
  spineTurnIn: number,
  spineBulge: number
): THREE.ExtrudeGeometry => {
  const segments = 18;
  const spineSegments = 28;
  const foreEdge = -depth * 0.5;
  const jointEnd = depth * 0.5 - jointInset;
  const jointStart = jointEnd - jointWidth;
  const halfThickness = thickness * 0.5;
  const innerHalfThickness = blockThickness * 0.5 + 0.0002;
  const spineShoulder = depth * 0.5 + spineTurnIn;
  const innerSpine = depth * 0.5 - 0.0008;
  const innerCrown = 0.0012;
  const shape = new THREE.Shape();

  shape.moveTo(foreEdge, halfThickness);
  shape.lineTo(jointStart, halfThickness);
  for (let index = 1; index <= segments; index += 1) {
    const progress = index / segments;
    shape.lineTo(
      jointStart + jointWidth * progress,
      halfThickness - Math.sin(progress * Math.PI) ** 2 * jointDepth
    );
  }
  shape.lineTo(spineShoulder, halfThickness);
  for (let index = 0; index <= spineSegments; index += 1) {
    const angle = Math.PI * 0.5 - Math.PI * index / spineSegments;
    shape.lineTo(
      spineShoulder + Math.cos(angle) * spineBulge,
      Math.sin(angle) * halfThickness
    );
  }
  shape.lineTo(jointEnd, -halfThickness);
  for (let index = segments - 1; index >= 0; index -= 1) {
    const progress = index / segments;
    shape.lineTo(
      jointStart + jointWidth * progress,
      -halfThickness + Math.sin(progress * Math.PI) ** 2 * jointDepth
    );
  }
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
  const coverSkinOffset = 0.00045;
  const coverClothThickness = 0.00055;
  const square = 0.018;
  const blockThickness = profile.binding.pageBlockThicknessRatio;
  const foreEdgeZ = depth * -0.5;
  const coverJointZ = (
    depth * 0.5
    - profile.binding.coverJoints.inset
    - profile.binding.coverJoints.width * 0.5
  );
  const boardBoundEdgeZ = coverJointZ - profile.binding.coverJoints.width * 0.5;
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
    color: 0xffffff,
    specular: 0x303030,
    shininess: 3,
    emissive: 0x050505
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
  const spineBulge = Math.max(0.0055, thickness * 0.045);
  const spineTurnIn = boardCornerRadius * 0.34;
  const caseShellGeometry = createCaseShellGeometry(
    width,
    depth,
    thickness,
    blockThickness,
    profile.binding.coverJoints.inset,
    profile.binding.coverJoints.width,
    profile.binding.coverJoints.depth,
    spineTurnIn,
    Math.max(0.001, spineBulge - 0.00055)
  );
  const spineGeometry = createSpineGeometry(
    width,
    thickness,
    spineBulge
  );
  const upperCoverGeometry = createCoverJointGeometry(
    width,
    depth,
    -coverJointZ,
    profile.binding.coverJoints.width,
    profile.binding.coverJoints.depth
  );
  const lowerCoverGeometry = createCoverJointGeometry(
    width,
    depth,
    coverJointZ,
    profile.binding.coverJoints.width,
    profile.binding.coverJoints.depth
  );
  const headbandRadius = Math.max(0.0028, blockThickness * 0.026);
  const headbandGeometry = new THREE.CylinderGeometry(
    headbandRadius,
    headbandRadius,
    blockThickness + 0.002,
    16
  );
  const coverWrapThickness = boardThickness + coverClothThickness;
  const upperHeadWrapGeometry = createCoverWrapGeometry(
    depth, coverWrapThickness, "head", true, width, depth,
    coverJointZ, profile.binding.coverJoints.width, profile.binding.coverJoints.depth
  );
  const upperTailWrapGeometry = createCoverWrapGeometry(
    depth, coverWrapThickness, "tail", true, width, depth,
    coverJointZ, profile.binding.coverJoints.width, profile.binding.coverJoints.depth
  );
  const lowerHeadWrapGeometry = createCoverWrapGeometry(
    depth, coverWrapThickness, "head", false, width, depth,
    coverJointZ, profile.binding.coverJoints.width, profile.binding.coverJoints.depth
  );
  const lowerTailWrapGeometry = createCoverWrapGeometry(
    depth, coverWrapThickness, "tail", false, width, depth,
    coverJointZ, profile.binding.coverJoints.width, profile.binding.coverJoints.depth
  );
  const upperForeWrapGeometry = createCoverWrapGeometry(
    width, coverWrapThickness, "fore", true, width, depth,
    coverJointZ, profile.binding.coverJoints.width, profile.binding.coverJoints.depth
  );
  const lowerForeWrapGeometry = createCoverWrapGeometry(
    width, coverWrapThickness, "fore", false, width, depth,
    coverJointZ, profile.binding.coverJoints.width, profile.binding.coverJoints.depth
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

  const wrapX = width * 0.5 + coverClothThickness * 0.55;
  const wrapY = thickness * 0.5 + coverSkinOffset - coverWrapThickness * 0.5;
  const wrapForeZ = foreEdgeZ - coverClothThickness * 0.45;

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
  spine.position.z = depth * 0.5 + spineTurnIn + 0.0003;

  const headbandX = width * 0.5 - square - headbandRadius * 0.7;
  const headbandZ = depth * 0.5 - headbandRadius * 0.65;
  const headbandHead = new THREE.Mesh(headbandGeometry, headbandMaterial);
  headbandHead.position.set(headbandX, 0, headbandZ);
  const headbandTail = new THREE.Mesh(headbandGeometry, headbandMaterial);
  headbandTail.position.set(-headbandX, 0, headbandZ);

  const object = new THREE.Group();
  object.rotation.set(profile.shelfPitch, 0, profile.shelfRoll);
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

  const root = new THREE.Group();
  root.add(object);

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
      boardStopsAtJoint: true,
      boardCornerRadius,
      pageBlockInset: square,
      spineEndCapCount: 2,
      spineEndCapDepth: spineTurnIn + spineBulge,
      headbandCount: 2
    }
  };
};
