import { CLEAN_ROOM_MOTION, clamp, wrapRotation } from "./motion";

export interface CleanRoomVolumeInteractionSnapshot {
  readonly rotationX: number;
  readonly rotationY: number;
  readonly dragging: boolean;
  readonly twirlX: number;
  readonly twirlY: number;
}

interface CleanRoomVolumeInteractionCallbacks {
  readonly figures: readonly (HTMLElement | null)[];
  readonly canInteract: () => boolean;
  readonly flightActive: () => boolean;
  readonly onWake: (duration?: number) => void;
}

export interface CleanRoomVolumeInteractionController {
  readonly snapshot: () => CleanRoomVolumeInteractionSnapshot;
  readonly reset: () => void;
  readonly advanceTwirl: (deltaSeconds: number) => boolean;
}

interface ModifiedPointerEvent {
  readonly button: number;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
}

const modified = (event: ModifiedPointerEvent): boolean => (
  event.button !== 0
  || event.metaKey
  || event.ctrlKey
  || event.shiftKey
  || event.altKey
);

export const installCleanRoomVolumeInteraction = (
  callbacks: CleanRoomVolumeInteractionCallbacks
): CleanRoomVolumeInteractionController => {
  let rotationX = 0;
  let rotationY = 0;
  let lastX = 0;
  let lastY = 0;
  let baseX = 0;
  let baseY = 0;
  let anchorX = 0;
  let anchorY = 0;
  let dragging = false;
  let pointerId = -1;
  let captureTarget: HTMLElement | null = null;
  let twirlX = 0;
  let twirlY = 0;
  let horizontalDirection = 1;

  const point = (event: PointerEvent): { x: number; y: number } => ({
    x: event.clientX - window.innerWidth * 0.5,
    y: event.clientY - window.innerHeight * 0.5
  });

  const reset = (): void => {
    rotationX = 0;
    rotationY = 0;
    lastX = 0;
    lastY = 0;
    baseX = 0;
    baseY = 0;
    anchorX = 0;
    anchorY = 0;
    dragging = false;
    pointerId = -1;
    captureTarget = null;
    twirlX = 0;
    twirlY = 0;
    horizontalDirection = 1;
    document.body.classList.remove("press-cover-dragging");
  };

  const begin = (event: PointerEvent): void => {
    if (
      !callbacks.canInteract()
      || callbacks.flightActive()
      || event.pointerType === "touch"
      || modified(event)
    ) return;
    const current = point(event);
    dragging = true;
    pointerId = event.pointerId;
    captureTarget = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    anchorX = current.x;
    anchorY = current.y;
    baseX = rotationX;
    baseY = rotationY;
    lastX = rotationX;
    lastY = rotationY;
    twirlX = 0;
    twirlY = 0;
    const absoluteX = Math.abs(wrapRotation(rotationX));
    horizontalDirection = absoluteX > Math.PI / 2
      && absoluteX < Math.PI * 1.5
      ? -1
      : 1;
    try {
      captureTarget?.setPointerCapture(pointerId);
    } catch {
      // Window listeners still own the drag when capture is unavailable.
    }
    document.body.classList.add("press-cover-dragging");
    callbacks.onWake(900);
  };

  const move = (event: PointerEvent): void => {
    if (!callbacks.canInteract() || event.pointerType === "touch") return;
    if (dragging && event.pointerId !== pointerId) return;
    const current = point(event);
    const rate = dragging
      ? CLEAN_ROOM_MOTION.volumeDragRate
      : CLEAN_ROOM_MOTION.volumeFollowRate;
    lastX = rotationX;
    lastY = rotationY;
    rotationX = wrapRotation((current.y - anchorY) * rate + baseX);
    rotationY = wrapRotation(
      (current.x - anchorX) * rate * horizontalDirection + baseY
    );
    callbacks.onWake(500);
  };

  const finish = (event: PointerEvent): void => {
    if (!dragging || event.pointerId !== pointerId) return;
    try {
      if (captureTarget?.hasPointerCapture(pointerId)) {
        captureTarget.releasePointerCapture(pointerId);
      }
    } catch {
      // Capture may already be released at a window edge.
    }
    const current = point(event);
    anchorX = current.x;
    anchorY = current.y;
    baseX = rotationX;
    baseY = rotationY;
    twirlX = clamp(
      rotationX - lastX,
      -CLEAN_ROOM_MOTION.volumeTwirlLimit,
      CLEAN_ROOM_MOTION.volumeTwirlLimit
    );
    twirlY = clamp(
      rotationY - lastY,
      -CLEAN_ROOM_MOTION.volumeTwirlLimit,
      CLEAN_ROOM_MOTION.volumeTwirlLimit
    );
    dragging = false;
    pointerId = -1;
    captureTarget = null;
    document.body.classList.remove("press-cover-dragging");
    callbacks.onWake(1800);
  };

  callbacks.figures.forEach((figure) => {
    figure?.addEventListener("pointerdown", begin);
  });
  window.addEventListener("pointermove", move, { passive: true });
  window.addEventListener("pointerup", finish, { passive: true });
  window.addEventListener("pointercancel", finish, { passive: true });

  const advanceTwirl = (deltaSeconds: number): boolean => {
    if (!twirlX && !twirlY) return false;
    const frameCount = clamp(deltaSeconds * 60, 0.25, 4);
    const decay = Math.pow(
      CLEAN_ROOM_MOTION.volumeTwirlDecay,
      frameCount
    );
    const advance = (1 - decay) / (1 - CLEAN_ROOM_MOTION.volumeTwirlDecay);
    rotationX = wrapRotation(rotationX + twirlX * advance);
    rotationY = wrapRotation(rotationY + twirlY * advance);
    baseX = rotationX;
    baseY = rotationY;
    twirlX *= decay;
    twirlY *= decay;
    if (Math.abs(twirlX) + Math.abs(twirlY) < 0.001) {
      twirlX = 0;
      twirlY = 0;
    } else {
      callbacks.onWake(120);
    }
    return true;
  };

  return {
    snapshot: () => ({ rotationX, rotationY, dragging, twirlX, twirlY }),
    reset,
    advanceTwirl
  };
};
