import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";

import bookObject from "../../assets/book.obj?raw";
import {
  createCleanRoomLayeredMaterial,
  type CleanRoomMaterialDiagnostics
} from "./material";
import type { CleanRoomVolumeProfile } from "./profiles";
import type { CleanRoomMaterialMaps } from "./textures";

export interface CleanRoomBook {
  /** Reference outer pose: shelf/list placement or active-volume placement. */
  readonly root: THREE.Group;
  /** The single authored mesh is also the interactive cover pivot. */
  readonly cover: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  readonly geometries: readonly [THREE.BufferGeometry];
  readonly materialModel: CleanRoomMaterialDiagnostics;
  readonly geometryModel: {
    readonly meshCount: 1;
    readonly vertexCount: number;
    readonly triangleCount: number;
    readonly objectName: "book";
  };
}

const parseBookGeometry = (): THREE.BufferGeometry => {
  const parsed = new OBJLoader().parse(bookObject);
  const source = parsed.getObjectByName("book");
  if (!(source instanceof THREE.Mesh)) {
    throw new Error("The authored book OBJ does not contain its expected 'book' mesh");
  }
  const geometry = source.geometry;
  if (!(geometry instanceof THREE.BufferGeometry)) {
    throw new Error("The authored book mesh does not contain buffer geometry");
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
};

/** Shared exactly as in the reference scene; cloned books retain one topology. */
const BOOK_GEOMETRY = parseBookGeometry();

export const createCleanRoomBook = (
  profile: CleanRoomVolumeProfile,
  maps: CleanRoomMaterialMaps
): CleanRoomBook => {
  const layered = createCleanRoomLayeredMaterial(
    profile.material,
    profile.thickness,
    maps,
    profile.slug
  );
  const cover = new THREE.Mesh(BOOK_GEOMETRY, layered.material);
  cover.name = "book";
  cover.matrixWorldNeedsUpdate = true;

  const root = new THREE.Group();
  root.add(cover);

  const positions = BOOK_GEOMETRY.getAttribute("position");
  return {
    root,
    cover,
    geometries: [BOOK_GEOMETRY],
    materialModel: layered.diagnostics,
    geometryModel: {
      meshCount: 1,
      vertexCount: positions?.count ?? 0,
      triangleCount: BOOK_GEOMETRY.index
        ? BOOK_GEOMETRY.index.count / 3
        : (positions?.count ?? 0) / 3,
      objectName: "book"
    }
  };
};
