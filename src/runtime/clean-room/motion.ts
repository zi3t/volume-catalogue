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
  releaseClassDelay: 780
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
