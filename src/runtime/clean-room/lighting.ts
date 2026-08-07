import * as THREE from "three";

const LEGACY_LIGHT_SCALE = Math.PI;

export interface CleanRoomLightRig {
  readonly ambient: THREE.AmbientLight;
  readonly key: THREE.DirectionalLight;
  readonly back: THREE.DirectionalLight;
  readonly rake: THREE.SpotLight;
  readonly rakeTarget: THREE.Object3D;
  update(cameraY: number, presentation: number): void;
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

  const update = (cameraY: number, presentation: number): void => {
    const active = THREE.MathUtils.clamp(presentation, 0, 1);
    rake.position.set(24, cameraY, 1);
    // The active reference does not merely dim the rake. Its aim travels from
    // the shelf spine plane to the standing book, changing the direction of the
    // highlight as the case turns. Keeping the rest target while only lowering
    // intensity made the route cover look lit from the catalogue behind it.
    rakeTarget.position.set(
      THREE.MathUtils.lerp(-6, -14.3, active),
      cameraY - 6.5,
      THREE.MathUtils.lerp(-6.5, -61, active)
    );
  };
  update(6.5, 0);

  return { ambient, key, back, rake, rakeTarget, update };
};
