import * as THREE from "three";

import type { CleanRoomVolumeProfile } from "./profiles";
import type { CleanRoomSharedTextures, CleanRoomSurfaceTextures } from "./textures";

export interface CleanRoomBook {
  readonly root: THREE.Group;
  readonly materials: readonly THREE.Material[];
  readonly geometries: readonly THREE.BufferGeometry[];
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
    color: new THREE.Color(profile.cloth).multiplyScalar(0.82),
    bumpMap: shared.clothBump,
    bumpScale: profile.material.clothBump * 0.008,
    specular: new THREE.Color(profile.material.specular),
    shininess: Math.max(1, profile.material.shininess * 0.72)
  });
  const coverMaterial = new THREE.MeshPhongMaterial({
    map: surfaces.cover,
    // The recovered rake is intentionally hot. Reduce the authored albedo
    // before that light reaches it so pale cloth keeps detail instead of
    // clipping to white in the linear/no-tone-mapping pipeline.
    color: 0xaaaaaa,
    bumpMap: shared.clothBump,
    bumpScale: profile.material.clothBump * 0.01,
    specular: new THREE.Color(profile.material.specular),
    shininess: profile.material.shininess,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
  const spineMaterial = new THREE.MeshPhongMaterial({
    map: surfaces.spine,
    bumpMap: shared.clothBump,
    bumpScale: profile.material.clothBump * 0.012,
    specular: new THREE.Color(profile.material.specular),
    shininess: profile.material.shininess,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
  const pageMaterial = new THREE.MeshPhongMaterial({
    map: shared.paper,
    color: 0xe8e2ca,
    specular: 0x181818,
    shininess: 4
  });
  const endpaperMaterial = new THREE.MeshPhongMaterial({
    color: new THREE.Color(profile.cloth).lerp(new THREE.Color(profile.ink), 0.18),
    specular: 0x101010,
    shininess: 3
  });

  const pageGeometry = new THREE.BoxGeometry(
    width - square * 2,
    thickness - boardThickness * 2,
    depth - square
  );
  const boardGeometry = new THREE.BoxGeometry(width, boardThickness, depth);
  const coverGeometry = new THREE.PlaneGeometry(width, depth);
  const spineGeometry = new THREE.PlaneGeometry(width, thickness);

  const pages = new THREE.Mesh(pageGeometry, pageMaterial);
  pages.position.z = -square * 0.5;

  const upperBoard = new THREE.Mesh(boardGeometry, clothMaterial);
  upperBoard.position.y = thickness * 0.5 - boardThickness * 0.5;
  const lowerBoard = new THREE.Mesh(boardGeometry, clothMaterial);
  lowerBoard.position.y = -(thickness * 0.5 - boardThickness * 0.5);

  const cover = new THREE.Mesh(coverGeometry, coverMaterial);
  cover.rotation.x = -Math.PI / 2;
  cover.position.y = thickness * 0.5 + 0.0015;

  const underside = new THREE.Mesh(coverGeometry, endpaperMaterial);
  underside.rotation.x = Math.PI / 2;
  underside.position.y = -(thickness * 0.5 + 0.0015);

  const spine = new THREE.Mesh(spineGeometry, spineMaterial);
  spine.position.z = depth * 0.5 + 0.0015;

  const object = new THREE.Group();
  object.rotation.set(profile.shelfPitch, 0, profile.shelfRoll);
  object.add(pages, upperBoard, lowerBoard, cover, underside, spine);

  const root = new THREE.Group();
  root.add(object);

  return {
    root,
    materials: [
      clothMaterial,
      coverMaterial,
      spineMaterial,
      pageMaterial,
      endpaperMaterial
    ],
    geometries: [pageGeometry, boardGeometry, coverGeometry, spineGeometry]
  };
};
