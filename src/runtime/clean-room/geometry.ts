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

  const clothMaterial = new THREE.MeshPhongMaterial({
    color: new THREE.Color(profile.cloth).multiplyScalar(0.96),
    bumpMap: shared.clothBump,
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
    color: 0xe8e2ca,
    specular: 0x181818,
    shininess: 4,
    emissive: 0x14120c
  });
  const pageEdgeMaterial = new THREE.MeshPhongMaterial({
    map: shared.paperEdge,
    bumpMap: shared.paperEdge,
    bumpScale: 0.0025,
    color: 0xffffff,
    specular: 0x26231c,
    shininess: 2,
    emissive: 0x16140e
  });
  const endpaperMaterial = new THREE.MeshPhongMaterial({
    map: surfaces.cover.customDiffuse,
    color: 0xd8d3bc,
    emissive: new THREE.Color(profile.cloth).multiplyScalar(0.2),
    specular: new THREE.Color(profile.material.specular).multiplyScalar(0.28),
    shininess: Math.max(2, profile.material.shininess * 0.65)
  });

  const pageGeometry = new THREE.BoxGeometry(
    width - square * 2,
    thickness - boardThickness * 2,
    depth - square
  );
  const boardGeometry = new THREE.BoxGeometry(width, boardThickness, depth);
  const coverGeometry = new THREE.PlaneGeometry(width, depth);
  const spineGeometry = new THREE.PlaneGeometry(width, thickness);

  const pages = new THREE.Mesh(pageGeometry, [
    pageEdgeMaterial,
    pageEdgeMaterial,
    pageMaterial,
    pageMaterial,
    pageEdgeMaterial,
    pageEdgeMaterial
  ]);
  pages.position.z = -square * 0.5;

  const upperBoard = new THREE.Mesh(boardGeometry, clothMaterial);
  upperBoard.position.y = thickness * 0.5 - boardThickness * 0.5;
  const lowerBoard = new THREE.Mesh(boardGeometry, clothMaterial);
  lowerBoard.position.y = -(thickness * 0.5 - boardThickness * 0.5);

  const cover = new THREE.Mesh(coverGeometry, coverLayer.material);
  cover.rotation.x = -Math.PI / 2;
  cover.position.y = thickness * 0.5 + 0.0015;

  const underside = new THREE.Mesh(coverGeometry, endpaperMaterial);
  underside.rotation.x = Math.PI / 2;
  underside.position.y = -(thickness * 0.5 + 0.0015);

  const spine = new THREE.Mesh(spineGeometry, spineLayer.material);
  spine.position.z = depth * 0.5 + 0.0015;

  const object = new THREE.Group();
  object.rotation.set(profile.shelfPitch, 0, profile.shelfRoll);
  object.add(pages, upperBoard, lowerBoard, cover, underside, spine);

  const root = new THREE.Group();
  root.add(object);

  const materials = [
    clothMaterial,
    coverLayer.material,
    spineLayer.material,
    pageMaterial,
    pageEdgeMaterial,
    endpaperMaterial
  ];
  materials.forEach((material) => {
    material.transparent = true;
    material.depthWrite = true;
  });

  return {
    root,
    object,
    materials,
    geometries: [pageGeometry, boardGeometry, coverGeometry, spineGeometry],
    materialModel: {
      cover: coverLayer.diagnostics,
      spine: spineLayer.diagnostics
    }
  };
};
