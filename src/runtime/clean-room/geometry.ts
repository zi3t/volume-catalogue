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

export const createCleanRoomBook = (
  profile: CleanRoomVolumeProfile,
  surfaces: CleanRoomSurfaceTextures,
  shared: CleanRoomSharedTextures
): CleanRoomBook => {
  const width = 1;
  const depth = profile.depthRatio;
  const thickness = profile.thicknessRatio;
  const boardThickness = Math.max(0.012, thickness * 0.09);
  const square = 0.014;
  const blockThickness = Math.max(0.02, thickness - boardThickness * 2);

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
    specular: new THREE.Color(profile.material.specular),
    shininess: Math.max(1, profile.material.shininess * 0.72)
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
  const boardGeometry = new THREE.BoxGeometry(width, boardThickness, depth);
  const coverGeometry = new THREE.PlaneGeometry(width, depth);
  const spineGeometry = createSpineGeometry(
    width,
    thickness,
    Math.max(0.0015, thickness * 0.012)
  );
  const hingeGeometry = new THREE.BoxGeometry(
    width,
    Math.max(0.0025, thickness * 0.024),
    Math.max(0.003, depth * 0.003)
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

  // Box material order: +x, -x, +y, -y, +z, -z. The pastedown belongs on the
  // face toward the text block; every exposed edge remains cloth wrapped.
  const upperBoard = new THREE.Mesh(boardGeometry, [
    clothMaterial,
    clothMaterial,
    clothMaterial,
    endpaperMaterial,
    clothMaterial,
    clothMaterial
  ]);
  upperBoard.position.y = thickness * 0.5 - boardThickness * 0.5;
  const lowerBoard = new THREE.Mesh(boardGeometry, [
    clothMaterial,
    clothMaterial,
    endpaperMaterial,
    clothMaterial,
    clothMaterial,
    clothMaterial
  ]);
  lowerBoard.position.y = -(thickness * 0.5 - boardThickness * 0.5);

  const cover = new THREE.Mesh(coverGeometry, coverLayer.material);
  cover.rotation.x = -Math.PI / 2;
  cover.position.y = thickness * 0.5 + 0.0015;

  const spine = new THREE.Mesh(spineGeometry, spineLayer.material);
  spine.position.z = depth * 0.5 + 0.0015;

  const hingeOffset = thickness * 0.5 - boardThickness * 0.86;
  const upperHinge = new THREE.Mesh(hingeGeometry, clothMaterial);
  upperHinge.position.set(0, hingeOffset, depth * 0.5 + 0.0028);
  const lowerHinge = new THREE.Mesh(hingeGeometry, clothMaterial);
  lowerHinge.position.set(0, -hingeOffset, depth * 0.5 + 0.0028);

  const headbandX = width * 0.5 - square - headbandRadius * 0.7;
  const headbandZ = depth * 0.5 - headbandRadius * 1.35;
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
    cover,
    spine,
    upperHinge,
    lowerHinge,
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
      coverGeometry,
      spineGeometry,
      hingeGeometry,
      headbandGeometry
    ],
    materialModel: {
      cover: coverLayer.diagnostics,
      spine: spineLayer.diagnostics
    }
  };
};
