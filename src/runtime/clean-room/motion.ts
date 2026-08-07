export const CLEAN_ROOM_MOTION = {
  hoverProjectedScale: 1.033,
  holdProjectedScale: 1.035,
  dragThreshold: 4,
  rotationPerPixel: 0.003,
  revealDistance: 124,
  orbitLimit: Math.PI,
  entryDelay: 54,
  entryStagger: 72,
  entryDuration: 492,
  entrySettleEpsilon: 0.012,
  entrySettleTimeout: 1800,
  stackEvictionViewports: 1.12,
  spineZEase: 0.1,
  releaseIsolation: 360,
  releasePresentation: 110,
  releaseBackdrop: 430,
  releaseClassDelay: 780,
  sectionCoverYaw: 0.35,
  sectionCoverRoll: -(Math.PI / 2) + 0.04,
  sectionCoverPitchShortfall: 0.16,
  sectionCoverViewportHeight: 0.685,
  sectionObjectScaleX: 0.953,
  sectionCompactObjectScaleX: 0.944,
  flightEaseStep: 0.006,
  flightEaseCeiling: 0.15,
  volumeFollowRate: 0.00015,
  volumeDragRate: 0.003,
  volumeScrollTurn: 0.0008,
  volumeTwirlLimit: 0.3,
  volumeTwirlDecay: 0.95,
  scrollVelocityPerPixel: 0.003,
  scrollVelocityDecay: 0.4,
  scrollVelocityLimit: 1,
  desktopShelfPitchOffset: -0.057,
  compactShelfPitchOffset: 0.184,
  compactThicknessScale: 1.5,
  catalogueRestLiftPixels: 10,
  compactCatalogueRestLiftPixels: 6.5,
  heldLiftPixels: 4,
  pressPickLiftPixels: 0,
  pressPickPitch: 0.008,
  heldLongAxisForeshorten: 0.958,
  heldForeshortenAngle: 0.42,
  terminalScrollViewports: 2.18,
  idlePauseAfter: 1200
} as const;

export const clamp = (value: number, minimum: number, maximum: number): number => (
  Math.min(maximum, Math.max(minimum, value))
);

export const mix = (from: number, to: number, progress: number): number => (
  from + (to - from) * progress
);

export const damp = (
  from: number,
  to: number,
  speed: number,
  deltaSeconds: number
): number => mix(from, to, 1 - Math.exp(-speed * deltaSeconds));

export const frameApproach = (
  from: number,
  to: number,
  perFrame: number,
  deltaSeconds: number
): number => mix(
  from,
  to,
  1 - Math.pow(1 - perFrame, clamp(deltaSeconds * 60, 0.25, 4))
);

export const smooth = (progress: number): number => {
  const value = clamp(progress, 0, 1);
  return value * value * (3 - 2 * value);
};

export const spring = (progress: number): number => {
  const value = clamp(progress, 0, 1);
  const raw = 1 - Math.exp(-7.25 * value) * Math.cos(9.4 * value);
  const end = 1 - Math.exp(-7.25) * Math.cos(9.4);
  return raw / end;
};

export const heldOrbitAngle = (pixels: number, response = 1): number => clamp(
  pixels * CLEAN_ROOM_MOTION.rotationPerPixel * response,
  -CLEAN_ROOM_MOTION.orbitLimit,
  CLEAN_ROOM_MOTION.orbitLimit
);
