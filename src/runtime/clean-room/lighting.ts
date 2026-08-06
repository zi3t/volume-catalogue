import * as THREE from "three";

const LEGACY_LIGHT_SCALE = Math.PI;

export interface CleanRoomLightRig {
  readonly ambient: THREE.AmbientLight;
  readonly key: THREE.DirectionalLight;
  readonly back: THREE.DirectionalLight;
  readonly rake: THREE.SpotLight;
  updateCameraY(cameraY: number): void;
}

/** Four-light rig recovered from the durable numeric capture. */
export const createCleanRoomLightRig = (scene: THREE.Scene): CleanRoomLightRig => {
  const ambient = new THREE.AmbientLight(0xffffff, 0.52 * LEGACY_LIGHT_SCALE);
  scene.add(ambient);

  const keyTarget = new THREE.Object3D();
  const key = new THREE.DirectionalLight(0xffffff, 0.6 * LEGACY_LIGHT_SCALE);
  key.position.set(4, 9.5, 4.5);
  key.target = keyTarget;
  scene.add(key, keyTarget);

  const backTarget = new THREE.Object3D();
  const back = new THREE.DirectionalLight(0x211815, 0.5 * LEGACY_LIGHT_SCALE);
  back.position.set(-32, 12, -16);
  back.target = backTarget;
  scene.add(back, backTarget);

  const rakeTarget = new THREE.Object3D();
  const rake = new THREE.SpotLight(
    0xcceecc,
    0.75 * LEGACY_LIGHT_SCALE,
    0,
    0.36,
    1,
    0
  );
  rake.target = rakeTarget;
  scene.add(rake, rakeTarget);

  const updateCameraY = (cameraY: number): void => {
    rake.position.set(24, cameraY, 1);
    rakeTarget.position.set(-6, cameraY - 6.5, -6.5);
  };
  updateCameraY(6.5);

  return { ambient, key, back, rake, updateCameraY };
};
