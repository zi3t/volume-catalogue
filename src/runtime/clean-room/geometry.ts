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
    const normalizedY = THREE.MathUtils.clamp(positions.getY(index) / height + 0.5, 0, 1);
    positions.setZ(index, Math.sin(normalizedY * Math.PI) * bulge);
  }
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
      ? -Math.sin(acrossJoint * Math.PI) * jointDepth
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

const createBoardGeometry = (
  length: number,
  boardDepth: number,
  thickness: number,
  cornerRadius: number,
  jointZ: number,
  jointWidth: number,
  jointDepth: number
): THREE.ExtrudeGeometry => {
  const halfDepth = boardDepth * 0.5;
  const halfThickness = thickness * 0.5;
  const radius = Math.min(cornerRadius, halfThickness * 0.9);
  const foreEdge = -halfDepth;
  const boundEdge = halfDepth;
  const jointStart = jointZ - jointWidth * 0.5;
  const jointEnd = jointZ + jointWidth * 0.5;
  const shape = new THREE.Shape();

  // The board is authored from its fore edge around the inner face and back
  // along the outer face. The outer run includes the pressed-in hinge groove,
  // so the joint changes the real side silhouette instead of shading a flat
  // box or adding a separate raised strip.
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
  shape.lineTo(jointEnd, halfThickness);
  for (let index = 0; index <= 12; index += 1) {
    const progress = index / 12;
    shape.lineTo(
      jointEnd - jointWidth * progress,
      halfThickness - Math.sin(progress * Math.PI) * jointDepth
    );
  }
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

export const createCleanRoomBook = (
  profile: CleanRoomVolumeProfile,
  surfaces: CleanRoomSurfaceTextures,
  shared: CleanRoomSharedTextures
): CleanRoomBook => {
  const width = 1;
  const depth = profile.depthRatio;
  const thickness = profile.thicknessRatio;
  const boardThickness = Math.max(0.012, thickness * 0.09);
  const boardCornerRadius = Math.min(boardThickness * 0.36, 0.0052);
  const coverSkinOffset = 0.00045;
  const square = 0.014;
  const blockThickness = Math.max(0.02, thickness - boardThickness * 2);
  const coverJointZ = (
    depth * 0.5
    - profile.binding.coverJoints.inset
    - profile.binding.coverJoints.width * 0.5
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
    color: new THREE.Color(profile.cloth).multiplyScalar(0.96),
    bumpMap: boardBump,
    bumpScale: profile.material.bump.base * 0.3,
    specular: new THREE.Color(profile.material.specular).multiplyScalar(0.22),
    shininess: Math.max(1, profile.material.shininess * 0.35)
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
    specular: 0x181818,
    shininess: 4,
    emissive: 0x14120c
  });
  const pageEdgeMaterial = new THREE.MeshPhongMaterial({
    map: surfaces.pageEdge,
    bumpMap: surfaces.pageEdge,
    bumpScale: 0.0025,
    color: 0xffffff,
    specular: 0x26231c,
    shininess: 2,
    emissive: 0x16140e
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

  const pageGeometry = new THREE.BoxGeometry(
    width - square * 2,
    blockThickness,
    depth - square
  );
  const boardGeometry = createBoardGeometry(
    width,
    depth,
    boardThickness,
    boardCornerRadius,
    coverJointZ,
    profile.binding.coverJoints.width,
    profile.binding.coverJoints.depth
  );
  const endpaperGeometry = new THREE.PlaneGeometry(
    width - boardCornerRadius * 2,
    depth - boardCornerRadius * 2
  );
  const spineBulge = Math.max(0.0055, thickness * 0.045);
  const spineTurnIn = boardCornerRadius * 0.34;
  const spineGeometry = createSpineGeometry(
    width,
    thickness,
    spineBulge
  );
  const spineEndCapGeometry = createSpineEndCapGeometry(
    thickness,
    spineTurnIn,
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
  const headbandRadius = Math.max(0.004, blockThickness * 0.035);
  const headbandGeometry = new THREE.CylinderGeometry(
    headbandRadius,
    headbandRadius,
    blockThickness + 0.002,
    10
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

  const upperBoard = new THREE.Mesh(boardGeometry, clothMaterial);
  upperBoard.position.y = thickness * 0.5 - boardThickness * 0.5;
  const lowerBoard = new THREE.Mesh(boardGeometry, clothMaterial);
  lowerBoard.scale.y = -1;
  lowerBoard.position.y = -(thickness * 0.5 - boardThickness * 0.5);

  // The closed text block hides most of each pastedown, but the explicit
  // planes retain the endpaper in the square around the three unbound edges.
  const upperEndpaper = new THREE.Mesh(endpaperGeometry, endpaperMaterial);
  upperEndpaper.rotation.x = Math.PI / 2;
  upperEndpaper.position.y = thickness * 0.5 - boardThickness - 0.0001;
  const lowerEndpaper = new THREE.Mesh(endpaperGeometry, endpaperMaterial);
  lowerEndpaper.rotation.x = -Math.PI / 2;
  lowerEndpaper.position.y = -(thickness * 0.5 - boardThickness - 0.0001);

  const upperCover = new THREE.Mesh(upperCoverGeometry, coverLayer.material);
  upperCover.rotation.x = -Math.PI / 2;
  upperCover.position.y = thickness * 0.5 + coverSkinOffset;
  const lowerCover = new THREE.Mesh(lowerCoverGeometry, clothMaterial);
  lowerCover.rotation.x = Math.PI / 2;
  lowerCover.position.y = -(thickness * 0.5 + coverSkinOffset);

  const spine = new THREE.Mesh(spineGeometry, spineLayer.material);
  spine.position.z = depth * 0.5 + spineTurnIn;

  // A surface-only spine disappears when the book is viewed along its head or
  // tail. These two cross-sections close the mapped crown into a visible
  // rounded headcap/tailcap, as a real case binding does.
  const spineEndCapMaterial = clothMaterial.clone();
  spineEndCapMaterial.color.multiplyScalar(0.82);
  spineEndCapMaterial.specular.multiplyScalar(0.65);
  spineEndCapMaterial.side = THREE.DoubleSide;
  const spineHeadCap = new THREE.Mesh(spineEndCapGeometry, spineEndCapMaterial);
  spineHeadCap.position.set(width * 0.5 + 0.0004, 0, depth * 0.5);
  const spineTailCap = new THREE.Mesh(spineEndCapGeometry, spineEndCapMaterial);
  spineTailCap.position.set(-(width * 0.5 + 0.0004), 0, depth * 0.5);

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
    upperBoard,
    lowerBoard,
    upperEndpaper,
    lowerEndpaper,
    upperCover,
    lowerCover,
    spine,
    spineHeadCap,
    spineTailCap,
    headbandHead,
    headbandTail
  );

  const root = new THREE.Group();
  root.add(object);

  const materials = [
    clothMaterial,
    coverLayer.material,
    spineLayer.material,
    pageMaterial,
    pageEdgeMaterial,
    endpaperMaterial,
    spineEndCapMaterial,
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
      boardGeometry,
      endpaperGeometry,
      upperCoverGeometry,
      lowerCoverGeometry,
      spineGeometry,
      spineEndCapGeometry,
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
      boardCornerRadius,
      pageBlockInset: square,
      spineEndCapCount: 2,
      spineEndCapDepth: spineTurnIn + spineBulge,
      headbandCount: 2
    }
  };
};
