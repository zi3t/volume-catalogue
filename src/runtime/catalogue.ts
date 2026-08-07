// @ts-nocheck
//
// This is the calibrated renderer/state machine moved without a behavioural
// rewrite. Public boundaries are typed; this coordinator becomes type-checked
// module by module as the physical rendering pieces are extracted.
import * as THREE from "three";

import armArt from "../assets/arm-volume.svg?url";
import notesArt from "../assets/notes-volume.svg?url";
import paperColourTexture from "../assets/textures/Paper001_1K-JPG_Color.jpg?url";
import clothColourTexture from "../assets/textures/polyhaven-book-pattern-colour-1k.jpg?url";
import clothHeightTexture from "../assets/textures/polyhaven-book-pattern-height-1k.jpg?url";
import practiceArt from "../assets/practice-volume.svg?url";
import reflyArt from "../assets/refly-volume.svg?url";
import telemetryArt from "../assets/telemetry-volume.svg?url";
import { activateClassicFallback } from "./fallback";

// The reference scene runs three r151 defaults: no tone mapping, no output
// encoding, no color management — sRGB bytes are shaded raw and land on screen
// unconverted. Disabling color management before any Color/texture is created
// reproduces that pipeline in r171, so ported constants behave 1:1.
THREE.ColorManagement.enabled = false;
// r151 legacy lights premultiply every light color by π at uniform upload.
// r171 is physical-only, so the reference intensities transfer through ×π.
const LEGACY_LIGHT_SCALE = Math.PI;
// One source-scene unit spans camera.z / 100 of this scene's pixel-like world
// units. The sheen math consumes view-space distances, which never transfer
// raw — feeding unscaled positions turns the reference's slow parallax sweep
// into a high-frequency interference lattice (visible dot grids on foil).
const pressUnitScaleUniform = { value: 1 };

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const mix = (from, to, progress) => from + (to - from) * progress;
const damp = (from, to, speed, deltaSeconds) => (
  mix(from, to, 1 - Math.exp(-speed * deltaSeconds))
);
// These are screen-space calibration values, not raw source-scene z values.
// The ZI3T volumes are wider/deeper than Stripe's source meshes, so importing
// its z delta literally over-scales the accepted hover and held silhouettes.
const HOVER_PROJECTED_SCALE = 1.033;
const HOLD_PROJECTED_SCALE = 1.035;
const HOLD_DRAG_THRESHOLD = 4;
const HOLD_ROTATION_PER_PIXEL = 0.003;
const HOLD_REVEAL_DISTANCE = 124;
const HOLD_ORBIT_LIMIT = Math.PI;
const ENTRY_DELAY = 54;
const ENTRY_STAGGER = 72;
const ENTRY_DURATION = 492;
// Source units of residual travel that still read as "parked" to the eye, and
// the ceiling that releases the rail even if a book never fully settles.
const ENTRY_SETTLE_EPSILON = 0.35;
const ENTRY_SETTLE_TIMEOUT = 1800;
const TERMINAL_SCROLL_VIEWPORTS = 2.18;
const STACK_EVICTION_VIEWPORTS = 1.12;
// The volume standing in its own section. Extracted facts §8 gives the
// *structure* of the reference's active-book pose — rest `(−π/2, 0, +π/2)` →
// active `(−.5, .35, .15)`: the rest roll is shed, the pitch stops short of
// face-on, a yaw turns the side face into view. Only the yaw is its literal
// value. The two rigs do not share an axis convention, so roll and pitch were
// calibrated by eye against a captured reference frame — the roll came out the
// other way around, and a literal `.5` shortfall renders far flatter to the
// picture plane there than here. Treat these three as calibrated, not extracted;
// the 2026-07-26 checkpoint records the frame and the corner measurements.
const SECTION_COVER_YAW = 0.35;
// The volume is bound along `width`, its long axis, so standing the cover
// portrait means rolling that axis upright — a quarter turn, plus the reference's
// own small off-square tilt. This is what its rest `+π/2` → active `.15` roll
// encodes: the shelf lays the spine horizontal, standing it up puts it back.
// Negative, so the spine's text climbs the standing volume bottom-to-top. The
// roll direction is the only thing that decides it: the spine already reads
// along the volume's long edge, and rolling the other way would stand the same
// letters running top-to-bottom. Flipping this means flipping the cover
// composition with it, below, or the artwork lands upside down.
const SECTION_COVER_ROLL = -(Math.PI / 2) + 0.04;
const SECTION_COVER_PITCH_SHORTFALL = 0.16;
// The opening volume is deliberately larger than the catalogue hand-off: the
// portrait pose in the supplied reference occupies about .685 of its viewport
// on the long axis, and every direct book URL now begins from that same pose.
const SECTION_COVER_VIEWPORT_HEIGHT = 0.685;
// The reference's universal ease: every transform lerps toward its target at a
// speed that ramps `+.006` per frame to a `.15` ceiling and is reset to 0 when a
// book is activated, so a pick leaves the shelf slowly and arrives quickly.
const FLIGHT_EASE_STEP = 0.006;
const FLIGHT_EASE_CEILING = 0.15;
// A volume in its section stays a live object. Read from the reference's page
// module rather than inferred: `dt = 15e-5` is the rate the cover follows the
// pointer when nothing is held, `x = .003` the rate it turns under a drag, and
// `st = 8e-4` the rate scrolling the section turns it — applied to the active
// book's Y target only. Release throws it: the last rotation delta clamped to
// ±.3, decayed ×.95 a frame until it falls under .001.
const COVER_FOLLOW_RATE = 0.00015;
const COVER_DRAG_RATE = 0.003;
const COVER_SCROLL_TURN = 0.0008;
const COVER_TWIRL_LIMIT = 0.3;
const COVER_TWIRL_DECAY = 0.95;
// Extracted facts §7: scrolling sets a velocity of scrollDelta × .003 that
// decays × .4 per frame and is folded into the damped spine-tilt approach, so
// the stack fans under scroll and settles on its own. The reference runs it
// only while no book is active — here, only in the catalogue document. The
// limit is a safety the source does not need: it reads one debounced delta,
// while a trackpad flick can deliver a much larger one.
const SCROLL_VELOCITY_PER_PIXEL = 0.003;
const SCROLL_VELOCITY_DECAY = 0.4;
const SCROLL_VELOCITY_LIMIT = 1;
// §8: the hovered spine's z eases at a fixed .1 per frame. The source reads
// that raw per animation frame; here it is normalized over elapsed frames.
const SPINE_Z_EASE = 0.1;
// §7: the reference pauses its render loop 1200ms after the last movement.
const IDLE_PAUSE_AFTER = 1200;
const spring = (progress) => {
  const t = clamp(progress, 0, 1);
  const raw = 1 - Math.exp(-7.25 * t) * Math.cos(9.4 * t);
  const end = 1 - Math.exp(-7.25) * Math.cos(9.4);
  return raw / end;
};

const smooth = (progress) => {
  const t = clamp(progress, 0, 1);
  return t * t * (3 - 2 * t);
};

const heldOrbitAngle = (pixels, response = 1) => {
  return clamp(
    pixels * HOLD_ROTATION_PER_PIXEL * response,
    -HOLD_ORBIT_LIMIT,
    HOLD_ORBIT_LIMIT
  );
};

// Equivalent of CSS color-mix(in srgb, a w%, b) for opaque hex endpoints.
// Routed pages read the injected palette into THREE.Color, which cannot parse
// color-mix() strings, so the mix is resolved here before injection. The two
// former transparent mixes (--rule/--rule-strong) flatten against the paper
// background, which is what every rule in those pages renders over anyway.
const mixHex = (colorA, colorB, weightA) => {
  const parse = (hex) => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16)
  ];
  const a = parse(colorA);
  const b = parse(colorB);
  const channel = (index) => Math.round(a[index] * weightA + b[index] * (1 - weightA))
    .toString(16)
    .padStart(2, "0");
  return `#${channel(0)}${channel(1)}${channel(2)}`;
};

const createRandom = (seed) => {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
};

// These scans carry the surface information that a small procedural weave never
// can: irregular fibre bundles, uneven dye absorption, and the slight wear of a
// handled cloth case. They are deliberately folded into our authored colours
// rather than used as a green cover texture, so every ZI3T volume keeps its own
// identity and artwork. See `assets/textures/README.md` for CC0 provenance.
const scannedSurfaceSources = Object.freeze({
  clothColour: clothColourTexture,
  clothHeight: clothHeightTexture,
  paperColour: paperColourTexture
});

const loadScannedImage = (source) => {
  const image = new Image();
  image.decoding = "async";
  image.src = source;
  return image;
};

const scannedSurfaces = Object.freeze({
  clothColour: loadScannedImage(scannedSurfaceSources.clothColour),
  clothHeight: loadScannedImage(scannedSurfaceSources.clothHeight),
  paperColour: loadScannedImage(scannedSurfaceSources.paperColour)
});

const imageIsReady = (image) => image.complete && image.naturalWidth > 0;

const repaintAfterImageLoad = (image, paint) => {
  if (!imageIsReady(image)) image.addEventListener("load", paint, { once: true });
};

const hexLuminance = (hex) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
};

// A luminosity composite drags each cloth's mean brightness toward the scan's
// own, darker, mean — that is what muddied the light cloths when the scans
// landed. The scan is therefore pre-baked per cloth: converted to luminance,
// its mean re-levelled to the cloth's own mean, with only gentle contrast kept
// around that level. Variation without the mean shift. Baked to a canvas
// rather than applied through `context.filter`, which older Safari ignores.
const normalizedScanCache = new Map();
const bakeNormalizedScan = (image, targetLuminance) => {
  const key = Math.round(targetLuminance * 200);
  const cached = normalizedScanCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d", { alpha: false });
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = pixels.data;
  let sum = 0;
  for (let index = 0; index < data.length; index += 4) {
    sum += data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722;
  }
  const mean = sum / (data.length / 4) / 255;
  const gain = clamp(targetLuminance / mean, 0.7, 1.7);
  for (let index = 0; index < data.length; index += 4) {
    const luminance = (
      data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722
    ) / 255;
    const levelled = clamp(
      targetLuminance + (luminance * gain - targetLuminance) * 1.12,
      0,
      1
    );
    const value = Math.round(levelled * 255);
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
    data[index + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  normalizedScanCache.set(key, canvas);
  return canvas;
};

// Draws the cloth scan into the albedo at its natural aspect — never stretched
// to the target rect, which is what squashed the weave into a regular
// pinstripe on the long spine band. Two decorrelated passes (the second
// mirrored, each cropped from a deterministic per-volume phase at a slightly
// different scale) keep the repeat from reading as a tile.
const paintScanLuminosity = (context, image, width, height, alpha, targetLuminance, seed) => {
  if (!imageIsReady(image)) return false;
  const scan = bakeNormalizedScan(image, targetLuminance);
  const random = createRandom(seed);
  context.save();
  context.globalCompositeOperation = "luminosity";
  [false, true].forEach((flip) => {
    context.save();
    context.globalAlpha = alpha * 0.55;
    const scale = Math.max(width / scan.width, height / scan.height) * (1 + random() * 0.22);
    const drawWidth = scan.width * scale;
    const drawHeight = scan.height * scale;
    const dx = -random() * (drawWidth - width);
    const dy = -random() * (drawHeight - height);
    if (flip) {
      context.translate(width, 0);
      context.scale(-1, 1);
    }
    context.drawImage(scan, dx, dy, drawWidth, drawHeight);
    context.restore();
  });
  context.restore();
  return true;
};

// Quiets the cloth grain exactly where small type has to survive it: a soft
// elliptical cloud of the cloth's own colour, falloff to zero at the edges so
// it reads as calmer cloth rather than a masked patch. Drawn after the scan
// and artwork, before the ink.
const hexToRgba = (hex, alpha) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const subdueScanUnder = (context, color, x, y, width, height) => {
  context.save();
  context.translate(x + width / 2, y + height / 2);
  context.scale(1, height / width);
  const radius = width / 2;
  const gradient = context.createRadialGradient(0, 0, radius * 0.3, 0, 0, radius);
  gradient.addColorStop(0, hexToRgba(color, 0.4));
  gradient.addColorStop(1, hexToRgba(color, 0));
  context.fillStyle = gradient;
  context.fillRect(-radius, -radius, width, width);
  context.restore();
};

const configurations = [
  {
    background: "#b9ad6c",
    ink: "#18185e",
    art: reflyArt,
    routeMode: "project",
    widthScale: 1,
    heightScale: 0.965,
    yOffset: -10,
    topRatio: 0.3,
    depthRatio: 0.792,
    seed: 201,
    pose: {
      revealPitch: 0.03,
      verticalResponse: 1.3,
      yawResponse: 1,
      restYaw: 0,
      restRoll: 0.0015,
      routeWidth: 370,
      routeX: -0.155,
      routeY: 20
    },
    light: {
      key: "#fff0c5",
      bounce: "#6877ad",
      keyIntensity: 3.55,
      bounceIntensity: 0.76,
      rimIntensity: 0.82,
      idleKey: 0.25,
      idleGlint: 0.14,
      idleBounce: 0.12,
      anchorX: -0.12,
      anchorY: 0.08
    },
    material: {
      weave: { warp: 4.6, weft: 4, warpWeight: 0.74, weftWeight: 0.62, slub: 0.13, repeatX: 5.8, repeatY: 2.2 },
      diffuse: { highlight: 0.14, shadow: 0.16, spineThreads: 0.17, coverThreads: 0.115 },
      roughness: { core: 0.8, spine: 0.74, cover: 0.66, underside: 0.88, variation: 0.12 },
      bump: { spine: 0.74, cover: 0.58, underside: 0.34 },
      foil: { metalness: 0.36, text: 1, art: 0.42, gloss: 0.34, glossRoughness: 0.3, reflectiveness: 0.44, sparkle: 0.0012 },
      phong: {
        shininess: 3,
        reflectiveness: 0.6,
        foilDetail: 2,
        foilSpecular: 0.35,
        foilOpacity: 0.5,
        sheen: { light: "#f6eeab", mid: "#dfc465", deep: "#8a6d2f" }
      },
      paper: { light: "#e8e0bd", mid: "#cfc69e", dark: "#8d866f", fleck: 0.12, roughness: 0.57, variation: 0.17, bump: 0.28 },
      underside: { base: "#655e31", board: "#423d20", hinge: "#292a74", endpaper: "#9f9552" }
    },
    caption: "Re-run browser incidents frame by frame—from captured evidence to deterministic replay, with network, input, and state changes kept inspectable."
  },
  {
    background: "#d9d1ae",
    ink: "#29435c",
    art: armArt,
    routeMode: "project",
    widthScale: 0.995,
    heightScale: 0.845,
    yOffset: -4,
    topRatio: 0.315,
    depthRatio: 0.815,
    seed: 402,
    pose: {
      revealPitch: 0.04,
      verticalResponse: 1.3,
      yawResponse: 1,
      restYaw: 0,
      restRoll: -0.001,
      routeWidth: 374,
      routeX: -0.155,
      routeY: 18
    },
    light: {
      key: "#fff5d8",
      bounce: "#6e879e",
      keyIntensity: 3.1,
      bounceIntensity: 0.68,
      rimIntensity: 0.7,
      idleKey: 0.22,
      idleGlint: 0.2,
      idleBounce: 0.1,
      anchorX: 0.08,
      anchorY: 0.02
    },
    material: {
      weave: { warp: 5.4, weft: 3.7, warpWeight: 0.56, weftWeight: 0.78, slub: 0.2, repeatX: 4.7, repeatY: 2.7 },
      diffuse: { highlight: 0.1, shadow: 0.11, spineThreads: 0.205, coverThreads: 0.15 },
      roughness: { core: 0.9, spine: 0.86, cover: 0.82, underside: 0.94, variation: 0.08 },
      bump: { spine: 0.92, cover: 0.74, underside: 0.48 },
      foil: { metalness: 0.13, text: 0.52, art: 0.08, gloss: 0.2, glossRoughness: 0.38, reflectiveness: 0.3, sparkle: 0.0004 },
      phong: {
        shininess: 1.6,
        reflectiveness: 0.3,
        foilDetail: 3,
        foilSpecular: 0.22,
        foilOpacity: 0.38,
        sheen: { light: "#dfe5e4", mid: "#aebdc2", deep: "#5d707c" }
      },
      paper: { light: "#ebe6d2", mid: "#d5cfb8", dark: "#999381", fleck: 0.09, roughness: 0.68, variation: 0.11, bump: 0.2 },
      underside: { base: "#aba486", board: "#77725f", hinge: "#29435c", endpaper: "#c4bb98" }
    },
    caption: "Inspect robot kinematics as executable geometry, with every transform exposed and testable."
  },
  {
    background: "#243447",
    ink: "#e7e7df",
    art: telemetryArt,
    routeMode: "project",
    widthScale: 0.995,
    heightScale: 0.742,
    yOffset: -6,
    topRatio: 0.3,
    depthRatio: 0.826,
    seed: 603,
    pose: {
      revealPitch: 0.035,
      verticalResponse: 1.3,
      yawResponse: 1,
      restYaw: 0,
      restRoll: 0.001,
      routeWidth: 382,
      routeX: -0.157,
      routeY: 16
    },
    light: {
      key: "#f7edc8",
      bounce: "#5f82b6",
      keyIntensity: 4.8,
      bounceIntensity: 0.86,
      rimIntensity: 0.94,
      idleKey: 0.46,
      idleGlint: 0.18,
      idleBounce: 0.14,
      anchorX: -0.04,
      anchorY: 0.06
    },
    material: {
      weave: { warp: 3.6, weft: 4.8, warpWeight: 0.82, weftWeight: 0.48, slub: 0.08, repeatX: 7.2, repeatY: 2 },
      diffuse: { highlight: 0.16, shadow: 0.2, spineThreads: 0.11, coverThreads: 0.08 },
      roughness: { core: 0.72, spine: 0.64, cover: 0.57, underside: 0.84, variation: 0.15 },
      bump: { spine: 0.54, cover: 0.42, underside: 0.28 },
      foil: { metalness: 0.55, text: 0.72, art: 0.82, gloss: 0.46, glossRoughness: 0.22, reflectiveness: 0.58, sparkle: 0.0018 },
      phong: {
        shininess: 2.4,
        reflectiveness: 0.55,
        foilDetail: 2.4,
        foilSpecular: 0.5,
        foilOpacity: 0.62,
        sheen: { light: "#f2ead0", mid: "#d9c489", deep: "#7d6a3c" }
      },
      paper: { light: "#d7d8d1", mid: "#bbbdb7", dark: "#787c7c", fleck: 0.06, roughness: 0.53, variation: 0.19, bump: 0.16 },
      underside: { base: "#17232f", board: "#0e171f", hinge: "#d6b86b", endpaper: "#243447" }
    },
    caption: "Replay distributed-system evidence in order, without sanding away uncertainty."
  },
  {
    background: "#6d2949",
    ink: "#f0dfb4",
    art: practiceArt,
    routeMode: "project",
    widthScale: 0.995,
    heightScale: 0.888,
    yOffset: -3,
    topRatio: 0.3,
    depthRatio: 0.803,
    seed: 804,
    pose: {
      revealPitch: 0.045,
      verticalResponse: 1.3,
      yawResponse: 1,
      restYaw: 0,
      restRoll: -0.0015,
      routeWidth: 372,
      routeX: -0.155,
      routeY: 18
    },
    light: {
      key: "#ffe9bd",
      bounce: "#7382ad",
      keyIntensity: 3.6,
      bounceIntensity: 0.8,
      rimIntensity: 0.88,
      idleKey: 0.24,
      idleGlint: 0.16,
      idleBounce: 0.13,
      anchorX: 0.1,
      anchorY: 0.04
    },
    material: {
      weave: { warp: 4.2, weft: 4.4, warpWeight: 0.7, weftWeight: 0.68, slub: 0.1, repeatX: 6.2, repeatY: 2.4 },
      diffuse: { highlight: 0.13, shadow: 0.18, spineThreads: 0.145, coverThreads: 0.1 },
      roughness: { core: 0.78, spine: 0.7, cover: 0.64, underside: 0.89, variation: 0.13 },
      bump: { spine: 0.7, cover: 0.55, underside: 0.36 },
      foil: { metalness: 0.52, text: 0.84, art: 0.76, gloss: 0.43, glossRoughness: 0.24, reflectiveness: 0.56, sparkle: 0.0016 },
      phong: {
        shininess: 2.2,
        reflectiveness: 0.5,
        foilDetail: 2.8,
        foilSpecular: 0.42,
        foilOpacity: 0.55,
        sheen: { light: "#f4e2ae", mid: "#d7b268", deep: "#7c5a2b" }
      },
      paper: { light: "#e5dcc4", mid: "#c9bea4", dark: "#8d826f", fleck: 0.11, roughness: 0.59, variation: 0.16, bump: 0.25 },
      underside: { base: "#43172d", board: "#29101d", hinge: "#d5b66b", endpaper: "#5b223e" }
    },
    caption: "Show the boundary, the contract, and the evidence behind every engineering claim."
  },
  {
    background: "#ad763b",
    ink: "#26333d",
    art: notesArt,
    widthScale: 0.995,
    heightScale: 0.967,
    yOffset: 0,
    topRatio: 0.338,
    depthRatio: 0.78,
    seed: 1005,
    routeMode: "reading",
    pose: {
      revealPitch: 0.05,
      verticalResponse: 1.3,
      yawResponse: 1,
      restYaw: 0,
      restRoll: 0.001,
      routeWidth: 370,
      routeX: -0.155,
      routeY: 20
    },
    light: {
      key: "#ffeac7",
      bounce: "#70849b",
      keyIntensity: 3.28,
      bounceIntensity: 0.72,
      rimIntensity: 0.78,
      idleKey: 0.23,
      idleGlint: 0.21,
      idleBounce: 0.11,
      anchorX: -0.08,
      anchorY: 0.1
    },
    material: {
      weave: { warp: 5.8, weft: 4.1, warpWeight: 0.58, weftWeight: 0.8, slub: 0.18, repeatX: 4.8, repeatY: 3 },
      diffuse: { highlight: 0.09, shadow: 0.17, spineThreads: 0.19, coverThreads: 0.145 },
      roughness: { core: 0.87, spine: 0.8, cover: 0.75, underside: 0.95, variation: 0.09 },
      bump: { spine: 0.86, cover: 0.7, underside: 0.46 },
      foil: { metalness: 0.18, text: 0.5, art: 0.12, gloss: 0.24, glossRoughness: 0.36, reflectiveness: 0.34, sparkle: 0.0006 },
      phong: {
        shininess: 1.4,
        reflectiveness: 0.25,
        foilDetail: 3.6,
        foilSpecular: 0.18,
        foilOpacity: 0.32,
        sheen: { light: "#e6e2d8", mid: "#b9b2a4", deep: "#6a6154" }
      },
      paper: { light: "#e9dec4", mid: "#cfbea0", dark: "#8f806b", fleck: 0.15, roughness: 0.65, variation: 0.13, bump: 0.3 },
      underside: { base: "#72491f", board: "#493015", hinge: "#26333d", endpaper: "#98622f" }
    },
    caption: "Working notes on replayable systems, verification, and engineering decisions that can be inspected."
  }
];

const loadClassicFallback = () => {
  document.documentElement.classList.remove("press-scene-ready");
  activateClassicFallback();
};

const paintThreads = (context, width, height, seed, weave, strength) => {
  const random = createRandom(seed);
  const warpStep = Math.max(3, weave.warp);
  const weftStep = Math.max(3, weave.weft);
  context.save();
  context.globalCompositeOperation = "soft-light";

  for (let y = 1; y < height; y += weftStep * (0.82 + random() * 0.42)) {
    context.globalAlpha = strength * weave.weftWeight * (0.28 + random() * 0.24);
    context.strokeStyle = random() > 0.5 ? "#ffffff" : "#000000";
    context.lineWidth = random() > 0.9 ? 0.8 : 0.34;
    context.beginPath();
    context.moveTo(0, y + random());
    context.bezierCurveTo(
      width * 0.3,
      y + (random() - 0.5) * 2.4,
      width * 0.7,
      y + (random() - 0.5) * 2.4,
      width,
      y + random()
    );
    context.stroke();
  }

  for (let x = 1; x < width; x += warpStep * (0.8 + random() * 0.46)) {
    context.globalAlpha = strength * weave.warpWeight * (0.24 + random() * 0.22);
    context.strokeStyle = random() > 0.48 ? "#ffffff" : "#000000";
    context.lineWidth = random() > 0.93 ? 0.7 : 0.3;
    context.beginPath();
    context.moveTo(x + random(), 0);
    context.bezierCurveTo(
      x + (random() - 0.5) * 2.2,
      height * 0.28,
      x + (random() - 0.5) * 2.2,
      height * 0.72,
      x + random(),
      height
    );
    context.stroke();
  }

  context.globalCompositeOperation = "source-over";
  const flecks = Math.floor(width * height / mix(960, 420, weave.slub));
  for (let index = 0; index < flecks; index += 1) {
    const light = random() > 0.5;
    context.globalAlpha = strength * weave.slub * (0.1 + random() * 0.2);
    context.fillStyle = light ? "#ffffff" : "#000000";
    const size = random() > 0.92 ? 1.35 : 0.55;
    context.fillRect(random() * width, random() * height, size * (1.2 + random()), size);
  }
  context.restore();
};

const drawPublisherMark = (context, x, y, radius, ink, serial) => {
  context.save();
  context.strokeStyle = ink;
  context.fillStyle = ink;
  context.lineWidth = Math.max(2, radius * 0.035);
  context.globalAlpha *= 0.92;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.stroke();
  context.beginPath();
  context.arc(x, y, radius * 0.73, Math.PI * 0.5, Math.PI * 1.5);
  context.stroke();
  context.beginPath();
  context.arc(x, y, radius * 0.45, -Math.PI * 0.5, Math.PI * 0.5);
  context.stroke();
  context.font = "700 " + Math.round(radius * 0.34) + "px ui-monospace, SFMono-Regular, Menlo, monospace";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(serial, x, y + 1);
  context.restore();
};

const createSurfaceTexture = (renderer, config, metadata, kind) => {
  const canvas = document.createElement("canvas");
  // The cover face is `width × depth`, and `width` is the long axis it is bound
  // along — so the texture is landscape even though the cover reads portrait.
  // The composition is painted into a rotated space below, which is what makes
  // the two agree.
  canvas.width = kind === "spine" ? 1536 : (kind === "cover" ? 1000 : (kind === "board" ? 512 : 1024));
  canvas.height = kind === "spine" ? 240 : (kind === "cover" ? 800 : (kind === "board" ? 512 : 716));
  const context = canvas.getContext("2d", { alpha: false });
  const { diffuse, weave } = config.material;
  let artwork = null;

  const paint = () => {
    // The cover is composed portrait and painted into a landscape texture,
    // because the face it maps to is bound along its long axis and the section
    // pose rolls that axis upright. Composing in the final orientation is the
    // only way the artwork and the typography agree with the standing volume;
    // everything below uses `width`/`height` of the *composition*, not the
    // canvas.
    const composed = kind === "cover";
    const width = composed ? canvas.height : canvas.width;
    const height = composed ? canvas.width : canvas.height;
    context.setTransform(1, 0, 0, 1, 0, 0);
    if (composed) {
      context.translate(0, canvas.height);
      context.rotate(-Math.PI / 2);
    }
    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";
    context.fillStyle = config.background;
    context.fillRect(0, 0, width, height);

    const hasClothScan = paintScanLuminosity(
      context,
      scannedSurfaces.clothColour,
      width,
      height,
      kind === "board" ? 0.32 : 0.24,
      hexLuminance(config.background) * (kind === "board" ? 0.82 : 1),
      config.seed + (kind === "spine" ? 3 : kind === "board" ? 5 : 7)
    );

    // Keep color in the albedo and let the scene lights describe the form.
    // The previous diagonal albedo ramp read as a baked studio highlight and
    // doubled the moving key during hold/route poses.
    // The cover runs its long axis vertically now, so the same stops cover far
    // more of it than they did on a landscape face and washed the artwork out.
    // Same physical band, shorter in normalised space, and gentler.
    const coverFace = kind === "cover";
    const albedoTone = context.createLinearGradient(0, 0, 0, height);
    albedoTone.addColorStop(0, `rgba(255,255,255,${diffuse.highlight * (coverFace ? 0.16 : 0.3)})`);
    albedoTone.addColorStop(coverFace ? 0.08 : 0.14, "rgba(255,255,255,0)");
    albedoTone.addColorStop(coverFace ? 0.92 : 0.86, "rgba(0,0,0,0)");
    albedoTone.addColorStop(1, `rgba(0,0,0,${diffuse.shadow * (coverFace ? 0.2 : 0.34)})`);
    context.fillStyle = albedoTone;
    context.fillRect(0, 0, width, height);

    if (kind === "cover" && artwork) {
      context.save();
      context.globalAlpha = 0.98;
      context.drawImage(artwork, 0, 0, width, height);
      context.restore();
    }

    // A deterministic weave keeps the scene resilient if an asset ever fails
    // to decode. Once the scan is ready it replaces, rather than doubles, that
    // regular synthetic lattice.
    if (!hasClothScan) {
      paintThreads(
        context,
        width,
        height,
        config.seed + (kind === "spine" ? 11 : 47),
        weave,
        kind === "spine" ? diffuse.spineThreads : diffuse.coverThreads
      );
    }

    context.globalAlpha = 1;
    context.fillStyle = config.ink;
    if (kind === "spine") {
      context.textBaseline = "middle";
      context.textAlign = "left";
      context.font = `700 ${Math.round(height * 0.097)}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
      const metaText = metadata.meta.toUpperCase();
      subdueScanUnder(
        context,
        config.background,
        width * 0.045 - height * 0.1,
        height * 0.5 - height * 0.13,
        context.measureText(metaText).width + height * 0.2,
        height * 0.26
      );
      context.fillText(metaText, width * 0.045, height * 0.506);

      context.textAlign = "center";
      context.font = `500 ${Math.round(height * 0.206)}px "Iowan Old Style", Baskerville, Georgia, serif`;
      const titleWidth = context.measureText(metadata.title).width;
      subdueScanUnder(
        context,
        config.background,
        width * 0.505 - titleWidth / 2 - height * 0.14,
        height * 0.5 - height * 0.2,
        titleWidth + height * 0.28,
        height * 0.4
      );
      context.fillText(metadata.title, width * 0.505, height * 0.503);
      drawPublisherMark(context, width * 0.945, height * 0.5, height * 0.144, config.ink, metadata.serial);
    } else if (kind === "cover") {
      drawCoverTypography(context, metadata, config.ink, { width, height }, config.background);
    } else if (kind === "underside") {
      context.textBaseline = "alphabetic";
      context.textAlign = "left";
      drawPublisherMark(context, width * 0.906, height * 0.866, width * 0.036, config.ink, metadata.serial);
    }

    const edge = context.createLinearGradient(0, 0, 0, height);
    edge.addColorStop(0, "rgba(255,255,255,0.11)");
    edge.addColorStop(0.035, "rgba(255,255,255,0.02)");
    edge.addColorStop(0.88, "rgba(0,0,0,0)");
    edge.addColorStop(1, "rgba(0,0,0,0.1)");
    context.fillStyle = edge;
    context.fillRect(0, 0, width, height);

    texture.needsUpdate = true;
  };

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  paint();
  repaintAfterImageLoad(scannedSurfaces.clothColour, paint);

  if (kind === "cover") {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      artwork = image;
      paint();
    };
    image.src = config.art;
  }

  return texture;
};

const createPageTexture = (renderer, config) => {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 192;
  const context = canvas.getContext("2d", { alpha: false });
  const profile = config.material.paper;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  // The leaf lines have to stack across the block's thickness, and there are far
  // more leaves than the 96 lines this canvas holds.
  texture.repeat.set(1.2, 3.4);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  const paint = () => {
    const random = createRandom(config.seed + 1709);
    const paper = context.createLinearGradient(0, 0, 0, canvas.height);
    paper.addColorStop(0, profile.dark);
    paper.addColorStop(0.055, profile.light);
    paper.addColorStop(0.74, profile.light);
    paper.addColorStop(0.94, profile.mid);
    paper.addColorStop(1, profile.dark);
    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";
    context.fillStyle = paper;
    context.fillRect(0, 0, canvas.width, canvas.height);
    // Paper001's real fibre and mottling sit under the leaf structure. The
    // material stays volume-specific through the gradient above, while the scan
    // breaks the uniform cream that made the block look synthetic at close range.
    paintScanLuminosity(
      context,
      scannedSurfaces.paperColour,
      canvas.width,
      canvas.height,
      0.18,
      hexLuminance(profile.light),
      config.seed + 71
    );

    // The edge of a text block is the edge of every leaf in it, so it reads as
    // fine stacked lines rather than a tone.
    for (let y = 1; y < canvas.height; y += 2) {
      const leaf = random();
      context.globalAlpha = 0.16 + profile.fleck * (0.5 + leaf * 0.9);
      context.strokeStyle = leaf > 0.44 ? "#4a463c" : "#fbf7ea";
      context.lineWidth = leaf > 0.88 ? 1.1 : 0.55;
      context.beginPath();
      context.moveTo(0, y + random() * 0.6);
      context.lineTo(canvas.width, y + random() * 0.6);
      context.stroke();
    }

    // A few gathered signatures, darker where the sections meet.
    context.globalAlpha = 0.2 + profile.fleck * 0.5;
    context.strokeStyle = "#3b382f";
    context.lineWidth = 1.4;
    for (let index = 0; index < 9; index += 1) {
      const y = (index + random() * 0.7) * (canvas.height / 9);
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(canvas.width, y);
      context.stroke();
    }

    context.globalAlpha = profile.fleck * 0.3;
    context.fillStyle = "#322f2a";
    for (let index = 0; index < 260; index += 1) {
      context.fillRect(random() * canvas.width, random() * canvas.height, random() * 1.2, 0.6);
    }
    context.globalAlpha = 1;
    texture.needsUpdate = true;
  };
  paint();
  repaintAfterImageLoad(scannedSurfaces.paperColour, paint);
  return texture;
};

const createPageResponseTexture = (config, kind) => {
  const canvas = document.createElement("canvas");
  canvas.width = 192;
  canvas.height = 96;
  const context = canvas.getContext("2d", { alpha: false });
  const image = context.createImageData(canvas.width, canvas.height);
  const profile = config.material.paper;
  const random = createRandom(config.seed + (kind === "roughness" ? 2161 : 2293));

  for (let y = 0; y < canvas.height; y += 1) {
    const sheet = Math.sin(y * Math.PI * 0.69) * 0.5 + 0.5;
    for (let x = 0; x < canvas.width; x += 1) {
      const index = (y * canvas.width + x) * 4;
      const fibre = Math.sin((x * 0.11) + (y * 0.29)) * 0.5 + 0.5;
      const noise = random() - 0.5;
      const normalized = kind === "roughness"
        ? clamp(profile.roughness + 0.08 + (sheet - 0.5) * profile.variation * 0.5 + noise * profile.variation * 0.26, 0.34, 0.96)
        : clamp(0.44 + sheet * 0.28 + fibre * 0.07 + noise * 0.045, 0.22, 0.88);
      const value = Math.round(normalized * 255);
      image.data[index] = value;
      image.data[index + 1] = value;
      image.data[index + 2] = value;
      image.data[index + 3] = 255;
    }
  }

  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.35, 1);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  return texture;
};

const configureResponseTexture = (texture, config, kind) => {
  const { weave } = config.material;
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  const warpDensity = clamp(4.6 / weave.warp, 0.78, 1.24);
  const weftDensity = clamp(4.2 / weave.weft, 0.78, 1.24);
  if (kind === "cover") {
    texture.repeat.set(1.55 * warpDensity, 1.2 * weftDensity);
  } else if (kind === "underside") {
    texture.repeat.set(1.2 * warpDensity, 1.05 * weftDensity);
  } else {
    texture.repeat.set(2.1 * warpDensity, 0.95 * weftDensity);
  }
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  return texture;
};

const createBumpTexture = (config, kind, metadata = null) => {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d", { alpha: false });
  const texture = configureResponseTexture(new THREE.CanvasTexture(canvas), config, kind);
  const paint = () => {
    const image = context.createImageData(canvas.width, canvas.height);
    if (imageIsReady(scannedSurfaces.clothHeight)) {
      context.drawImage(scannedSurfaces.clothHeight, 0, 0, canvas.width, canvas.height);
      const source = context.getImageData(0, 0, canvas.width, canvas.height);
      for (let index = 0; index < source.data.length; index += 4) {
        const luminance = source.data[index] * 0.2126
          + source.data[index + 1] * 0.7152
          + source.data[index + 2] * 0.0722;
        const value = clamp(Math.round(128 + (luminance - 128) * 0.72), 80, 178);
        image.data[index] = value;
        image.data[index + 1] = value;
        image.data[index + 2] = value;
        image.data[index + 3] = 255;
      }
    } else {
      const random = createRandom(config.seed + 903 + (kind === "cover" ? 37 : kind === "underside" ? 79 : 0));
      const weave = config.material.weave;
      for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
          const index = (y * canvas.width + x) * 4;
          const warp = Math.sin(x / weave.warp * Math.PI * 2) * 3.4 * weave.warpWeight;
          const weft = Math.cos(y / weave.weft * Math.PI * 2) * 3.2 * weave.weftWeight;
          const fibre = Math.sin((x + y) * 0.19) * 1.35;
          const slub = (random() - 0.5) * (5 + weave.slub * 10);
          const value = clamp(Math.round(126 + warp + weft + fibre + slub), 92, 166);
          image.data[index] = value;
          image.data[index + 1] = value;
          image.data[index + 2] = value;
          image.data[index + 3] = 255;
        }
      }
    }
    context.putImageData(image, 0, 0);
    if (metadata && kind !== "underside") {
      // Foil is pressed into the cloth, not merely painted over it. Reusing the
      // original typography mask keeps the emboss registered with the albedo.
      drawFoilTypography(context, metadata, kind, config.material.foil.text * 0.085);
    }
    texture.needsUpdate = true;
  };
  paint();
  repaintAfterImageLoad(scannedSurfaces.clothHeight, paint);
  return texture;
};

// The cover's own words, in one place. The albedo paints them in the volume's
// ink and the bump map presses the identical layout into the cloth, so any
// change here stays registered across both. The title sits on the cover's far
// edge — the most foreshortened part of the shelf pose, which is where the
// reference puts its own and why a portrait cover can carry type at all.
const drawCoverTypography = (context, metadata, color, size, clothColor) => {
  // Measured in the *composition*, not the canvas. The cover is composed
  // portrait inside a landscape texture, so reading `context.canvas` here laid
  // every margin and baseline out in the transposed space — the credit line came
  // out a fifth of the cover too high, sitting in the artwork.
  const width = size ? size.width : context.canvas.width;
  const height = size ? size.height : context.canvas.height;
  const margin = width * 0.12;
  context.textBaseline = "alphabetic";
  context.textAlign = "left";
  context.fillStyle = color;

  // Small, the way a real cover's title is small against its board — and the
  // way the reference's is. Large type here reads fine face-on but reappears on
  // the shelf: the whole cover compresses into the top band there, so an
  // oversized title lands directly above the front face's own and doubles it.
  const titleSize = Math.round(width * (metadata.title.length > 18 ? 0.05 : 0.058));
  context.font = `500 ${titleSize}px "Iowan Old Style", Baskerville, Georgia, serif`;
  const lines = [];
  metadata.title.split(" ").forEach((word) => {
    const candidate = lines.length ? `${lines[lines.length - 1]} ${word}` : word;
    if (lines.length && context.measureText(candidate).width <= width - margin * 2) {
      lines[lines.length - 1] = candidate;
    } else {
      lines.push(word);
    }
  });
  if (clothColor) {
    const titlePad = titleSize * 0.7;
    const widest = lines.reduce(
      (maximum, line) => Math.max(maximum, context.measureText(line).width),
      0
    );
    subdueScanUnder(
      context,
      clothColor,
      margin - titlePad,
      height * 0.172 - titleSize * 1.05 - titlePad * 0.4,
      widest + titlePad * 2,
      (lines.length - 1) * titleSize * 1.24 + titleSize * 1.6 + titlePad * 0.8,
      titleSize * 0.8
    );
  }
  lines.forEach((text, index) => {
    context.fillText(text, margin, height * 0.172 + index * titleSize * 1.24);
  });

  const alpha = context.globalAlpha;
  context.globalAlpha = alpha * 0.62;
  context.font = `600 ${Math.round(width * 0.019)}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
  // Far enough above the title that a long one's ascenders clear it — they were
  // touching on every cover.
  const metaText = metadata.meta.toUpperCase();
  if (clothColor) {
    subdueScanUnder(
      context,
      clothColor,
      margin - width * 0.012,
      height * 0.098 - width * 0.021,
      context.measureText(metaText).width + width * 0.024,
      width * 0.032
    );
  }
  context.fillText(metaText, margin, height * 0.098);
  context.globalAlpha = alpha;

  context.font = `500 ${Math.round(width * 0.027)}px "Iowan Old Style", Baskerville, Georgia, serif`;
  if (clothColor) {
    subdueScanUnder(
      context,
      clothColor,
      margin - width * 0.012,
      height * 0.9 - width * 0.03,
      context.measureText("William Nguyen").width + width * 0.024,
      width * 0.042
    );
  }
  context.fillText("William Nguyen", margin, height * 0.9);

  drawPublisherMark(context, width * 0.878, height * 0.076, width * 0.038, color, metadata.serial);
};

const drawFoilTypography = (context, metadata, kind, strength) => {
  const width = context.canvas.width;
  const height = context.canvas.height;
  context.save();
  context.globalAlpha = strength;
  context.fillStyle = "#ffffff";
  context.strokeStyle = "#ffffff";

  if (kind === "spine") {
    context.textBaseline = "middle";
    context.textAlign = "left";
    context.font = `700 ${Math.round(height * 0.097)}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    context.fillText(metadata.meta.toUpperCase(), width * 0.045, height * 0.506);
    context.textAlign = "center";
    context.font = `500 ${Math.round(height * 0.206)}px "Iowan Old Style", Baskerville, Georgia, serif`;
    context.fillText(metadata.title, width * 0.505, height * 0.503);
    drawPublisherMark(context, width * 0.945, height * 0.5, height * 0.144, "#ffffff", metadata.serial);
  } else {
    // The cover presses nothing. This map is a 128px tiling cloth weave, not a
    // registered decal surface: the albedo it would have to line up with is
    // 800×1000, so the same relative layout lands somewhere else entirely and
    // lifts a second, offset copy of every letter out of the board. The mark
    // was small enough to pass as texture; a title is not.
    if (kind === "cover") return;
    context.textBaseline = "alphabetic";
    context.textAlign = "left";
    drawPublisherMark(context, width * 0.906, height * 0.866, width * 0.036, "#ffffff", metadata.serial);
  }
  context.restore();
};

const createFoilTexture = (renderer, config, metadata, kind) => {
  const canvas = document.createElement("canvas");
  // Matches the albedo's aspect for the cover, and its composed orientation
  // below, or the sheen mask paints a second copy of the artwork across the
  // rolled one.
  canvas.width = kind === "spine" ? 768 : (kind === "cover" ? 500 : 512);
  canvas.height = kind === "spine" ? 120 : (kind === "cover" ? 400 : 358);
  const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
  const foil = config.material.foil;
  let artwork = null;

  const paint = () => {
    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";
    context.fillStyle = "#000000";
    context.fillRect(0, 0, canvas.width, canvas.height);

    if (kind === "cover" && artwork && foil.art > 0) {
      const scratch = document.createElement("canvas");
      scratch.width = canvas.width;
      scratch.height = canvas.height;
      const scratchContext = scratch.getContext("2d", { alpha: false, willReadFrequently: true });
      scratchContext.save();
      scratchContext.translate(0, scratch.height);
      scratchContext.rotate(-Math.PI / 2);
      scratchContext.drawImage(artwork, 0, 0, scratch.height, scratch.width);
      scratchContext.restore();
      const source = scratchContext.getImageData(0, 0, scratch.width, scratch.height);
      const mask = context.createImageData(canvas.width, canvas.height);
      // The cloth background is the artwork's dominant color, not the corner
      // pixel — refly's top band sits at (0,0) and a corner sample floods the
      // whole cover into the foil mask.
      const counts = new Map();
      for (let index = 0; index < source.data.length; index += 4) {
        const key = (source.data[index] >> 4 << 8)
          | (source.data[index + 1] >> 4 << 4)
          | (source.data[index + 2] >> 4);
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      let modeKey = 0;
      let modeCount = -1;
      counts.forEach((count, key) => {
        if (count > modeCount) {
          modeCount = count;
          modeKey = key;
        }
      });
      const background = [
        ((modeKey >> 8 & 15) << 4) | 8,
        ((modeKey >> 4 & 15) << 4) | 8,
        ((modeKey & 15) << 4) | 8
      ];
      for (let index = 0; index < source.data.length; index += 4) {
        const distance = (
          Math.abs(source.data[index] - background[0])
          + Math.abs(source.data[index + 1] - background[1])
          + Math.abs(source.data[index + 2] - background[2])
        );
        const value = Math.round(255 * foil.art * clamp((distance - 14) / 112, 0, 1));
        mask.data[index] = value;
        mask.data[index + 1] = value;
        mask.data[index + 2] = value;
        mask.data[index + 3] = 255;
      }
      context.putImageData(mask, 0, 0);
    }

    drawFoilTypography(context, metadata, kind, foil.text);

    // Sparse deterministic variation gives the foil layer a restrained
    // sparkle under moving highlights without a copied glitter texture.
    const response = context.getImageData(0, 0, canvas.width, canvas.height);
    const random = createRandom(config.seed + (kind === "spine" ? 2801 : 3181));
    const sparkle = foil.sparkle || 0;
    for (let index = 0; index < response.data.length; index += 4) {
      const mask = response.data[index];
      if (mask < 8) continue;
      const sample = random();
      const value = sample > 1 - sparkle
        ? Math.round(mask * (0.48 + sample * 0.18))
        : mask;
      response.data[index] = value;
      response.data[index + 1] = value;
      response.data[index + 2] = value;
    }
    context.putImageData(response, 0, 0);
    texture.needsUpdate = true;
  };

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  paint();

  if (kind === "cover" && foil.art > 0) {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      artwork = image;
      paint();
    };
    image.src = config.art;
  }
  return texture;
};

// The reference sheen is a normal-driven lookup into a pre-painted palette
// strip: foilIndex = (sin(-n.y·detail + viewPos.y·detail/10),
// cos(-n.x·detail + viewPos.x·detail/10)) / 2, sampled where the foil mask
// covers. Stripe reserves the strip inside each diffuse atlas; ZI3T's covers
// map their full canvas, so the strip lives in its own small texture instead —
// same math, same role, original artwork.
const createSheenTexture = (config) => {
  const sheen = config.material.phong.sheen;
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d", { alpha: false });
  const sweep = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  sweep.addColorStop(0, sheen.light);
  sweep.addColorStop(0.34, sheen.mid);
  sweep.addColorStop(0.58, sheen.light);
  sweep.addColorStop(0.8, sheen.deep);
  sweep.addColorStop(1, sheen.mid);
  context.fillStyle = sweep;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const random = createRandom(config.seed + 4271);
  context.globalAlpha = 0.16;
  for (let band = 0; band < 5; band += 1) {
    const across = context.createLinearGradient(0, band * 26, canvas.width, band * 26 + 52);
    across.addColorStop(0, "rgba(255,255,255,0)");
    across.addColorStop(clamp(0.3 + random() * 0.4, 0, 1), band % 2 ? sheen.deep : "#ffffff");
    across.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = across;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
};

// Ported reference combine (see scene-contract "Extracted reference facts" §3):
// the cover shader is Phong with the foil layer mixed into the diffuse after
// bump perturbation and an additive specular strength
// (reflectiveness + coverage × foilSpecular). Injected into MeshPhongMaterial
// so three r171's own light loop stays authoritative.
const applyReferenceFoilShader = (material, maps, phong) => {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.pressFoilMap = { value: maps.foil };
    shader.uniforms.pressSheenMap = { value: maps.sheen };
    shader.uniforms.pressFoilDetail = { value: phong.foilDetail };
    shader.uniforms.pressFoilOpacity = { value: phong.foilOpacity };
    shader.uniforms.pressFoilSpecular = { value: phong.foilSpecular };
    shader.uniforms.pressReflectiveness = { value: phong.reflectiveness };
    shader.uniforms.pressUnitScale = pressUnitScaleUniform;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        [
          "#include <common>",
          "uniform sampler2D pressFoilMap;",
          "uniform sampler2D pressSheenMap;",
          "uniform float pressFoilDetail;",
          "uniform float pressFoilOpacity;",
          "uniform float pressFoilSpecular;",
          "uniform float pressReflectiveness;",
          "uniform float pressUnitScale;"
        ].join("\n")
      )
      .replace(
        "#include <specularmap_fragment>",
        [
          "float pressFoilCoverage = texture2D( pressFoilMap, vMapUv ).r;",
          "float specularStrength = pressReflectiveness + pressFoilCoverage * pressFoilSpecular;"
        ].join("\n")
      )
      .replace(
        "#include <normal_fragment_maps>",
        [
          "#include <normal_fragment_maps>",
          "// View-space distances are divided back into source units so the",
          "// reference's detail/10 parallax term stays a slow sweep across",
          "// the face instead of aliasing into a dot lattice.",
          "vec2 pressSheenView = vViewPosition.xy / pressUnitScale;",
          "vec2 pressSheenIndex = vec2(",
          "  sin( -normal.y * pressFoilDetail + pressSheenView.y * pressFoilDetail / 10.0 ),",
          "  cos( -normal.x * pressFoilDetail + pressSheenView.x * pressFoilDetail / 10.0 )",
          ") * 0.5 + 0.5;",
          "vec3 pressSheenColor = texture2D( pressSheenMap, pressSheenIndex ).rgb;",
          "diffuseColor.rgb = mix( diffuseColor.rgb, pressSheenColor, pressFoilCoverage * pressFoilOpacity );"
        ].join("\n")
      );
  };
  material.customProgramCacheKey = () => "press-phong-book-v5";
};

// The cord at the head and tail of a bound block is wrapped in striped cloth,
// classically two colours picked from the binding. Per volume those are the
// profile's hinge and endpaper tones.
const createHeadbandTexture = (renderer, config) => {
  const canvas = document.createElement("canvas");
  canvas.width = 48;
  canvas.height = 24;
  const context = canvas.getContext("2d", { alpha: false });
  const profile = config.material.underside;
  for (let x = 0; x < canvas.width; x += 4) {
    context.fillStyle = (x / 4) % 2 ? profile.endpaper : profile.hinge;
    context.fillRect(x, 0, 4, canvas.height);
  }
  context.fillStyle = "rgba(0, 0, 0, 0.16)";
  for (let y = 3; y < canvas.height; y += 6) {
    context.fillRect(0, y, canvas.width, 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return texture;
};

const createUndersideTexture = (renderer, config) => {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 384;
  const context = canvas.getContext("2d", { alpha: false });
  const profile = config.material.underside;
  let artwork = null;
  const paint = () => {
    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";
    context.fillStyle = profile.base;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = profile.board;
    context.fillRect(9, 9, canvas.width - 18, canvas.height - 18);
    context.fillStyle = profile.endpaper;
    context.fillRect(29, 27, canvas.width - 58, canvas.height - 54);
    context.fillStyle = profile.hinge;
    context.fillRect(29, 27, 17, canvas.height - 54);
    context.fillRect(canvas.width - 46, 27, 6, canvas.height - 54);

    if (artwork) {
      context.save();
      context.globalCompositeOperation = "multiply";
      context.globalAlpha = 0.2;
      context.drawImage(artwork, 58, 48, canvas.width - 116, canvas.height - 96);
      context.restore();
    }

    const edgeTone = context.createLinearGradient(0, 0, 0, canvas.height);
    edgeTone.addColorStop(0, "rgba(255,255,255,0.07)");
    edgeTone.addColorStop(0.2, "rgba(255,255,255,0)");
    edgeTone.addColorStop(0.82, "rgba(0,0,0,0)");
    edgeTone.addColorStop(1, "rgba(0,0,0,0.1)");
    context.fillStyle = edgeTone;
    context.fillRect(0, 0, canvas.width, canvas.height);
    paintThreads(
      context,
      canvas.width,
      canvas.height,
      config.seed + 1889,
      config.material.weave,
      config.material.diffuse.coverThreads * 0.42
    );

    context.strokeStyle = "rgba(0,0,0,0.18)";
    context.lineWidth = 2;
    context.strokeRect(9, 9, canvas.width - 18, canvas.height - 18);
    texture.needsUpdate = true;
  };

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  paint();

  const image = new Image();
  image.decoding = "async";
  image.onload = () => {
    artwork = image;
    paint();
  };
  image.src = config.art;
  return texture;
};

const createRoundedShape = (width, height, radius) => {
  const x = -width / 2;
  const y = -height / 2;
  const shape = new THREE.Shape();
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  return shape;
};

const createSpineGeometry = (width, height, bulge) => {
  const geometry = new THREE.PlaneGeometry(width, height, 1, 10);
  const positions = geometry.attributes.position;
  for (let index = 0; index < positions.count; index += 1) {
    const normalizedY = clamp((positions.getY(index) / height) + 0.5, 0, 1);
    positions.setZ(index, Math.sin(normalizedY * Math.PI) * bulge);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
};

const setMaterialOpacity = (book, opacity) => {
  const value = clamp(opacity, 0, 1);
  book.opacity = value;
  book.materials.forEach((material) => {
    material.opacity = value;
    material.depthWrite = value > 0.97;
  });
};

// A volume has two URLs, mirroring the reference where a book URL is only ever
// a book. `routeUrl` is what the address bar shows and what a deep link
// resolves to (the worker serves the composite shell there). `contentUrl` is
// the genuine page loaded into the panel — and stays the anchor's href so the
// destination remains real without JavaScript. They coincide for volumes whose
// project page is not also linked as a standalone page elsewhere.
const getMetadata = (item, link, index) => {
  const href = link?.href || "/";
  const routeAttribute = link?.dataset?.pressRoute;
  return {
    title: item.querySelector("strong")?.textContent.trim() || link?.textContent.trim() || "",
    meta: item.querySelector("small")?.textContent.trim() || "",
    serial: item.querySelector("b")?.textContent.trim() || String(index + 1).padStart(2, "0"),
    href,
    contentUrl: href,
    routeUrl: routeAttribute ? new URL(routeAttribute, window.location.href).href : href
  };
};

const routePathname = (book) => new URL(book.metadata.routeUrl).pathname;

const boot = () => {
  const stage = document.querySelector(".press-catalog");
  const list = document.querySelector(".press-volume-list");
  const items = Array.from(document.querySelectorAll(".press-volume-item"));
  const links = items.map((item) => item.querySelector(".press-volume"));
  const rail = document.querySelector(".press-rail");
  const railButtons = Array.from(document.querySelectorAll(".press-rail-item"));
  const railFills = Array.from(document.querySelectorAll(".press-rail .press-rail-fill"));
  const homeFrame = document.querySelector(".home-frame");
  const main = document.querySelector(".home-page main");
  const backButton = document.querySelector(".press-back");
  const cataloguePath = (() => {
    const configured = document.body?.dataset.pressCatalogue || "/";
    return configured === "/" ? "/" : `${configured.replace(/\/+$/, "")}/`;
  })();
  // The route content is painted after the pinned hero. Keep the shared
  // controls in a sibling layer at the end of `main`, otherwise a visible rail
  // is still covered by the volume figure and cannot receive a pointer click.
  if (main && rail && backButton) {
    const routeControls = document.createElement("div");
    routeControls.className = "press-route-controls";
    main.append(routeControls);
    routeControls.append(backButton, rail);
  }
  // Present only when the worker assembled the volumes into the shell.
  const volumes = document.querySelector(".press-volumes");
  const volumeSections = Array.from(document.querySelectorAll(".press-volume-section"));
  const signaturePanel = document.querySelector(".signature-section");
  const closingPanel = document.querySelector(".home-closing");
  const footerPanel = document.querySelector(".home-footer");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const compactLayout = window.matchMedia("(max-width: 899px)");

  if (!stage || !list || !items.length || !main || !homeFrame) {
    loadClassicFallback();
    return false;
  }

  let renderer;
  // §4/§7: the reference preserves the drawing buffer off small screens, which
  // is what lets its render loop pause at idle without the compositor clearing
  // the settled frame. Compact layouts skip preservation and keep drawing.
  const preserveDrawingBuffer = !compactLayout.matches;
  try {
    renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer
    });
  } catch (error) {
    console.warn("Press scene unavailable; using DOM books.", error);
    loadClassicFallback();
    return false;
  }

  renderer.setClearColor(0x201819, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  // Reference pipeline: linear passthrough, no tone mapping (r151 defaults).
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.domElement.className = "press-scene-canvas";
  renderer.domElement.setAttribute("aria-hidden", "true");
  stage.prepend(renderer.domElement);

  const holdCaption = document.createElement("aside");
  holdCaption.className = "press-hold-caption";
  holdCaption.setAttribute("aria-hidden", "true");
  stage.append(holdCaption);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(12, 1, 10, 30000);
  camera.layers.enable(1);
  // Four-light reference rig. Positions are normalized into this scene's
  // pixel-like world in layoutLightRig(); the group follows camera.y so its
  // direction stays stable while native document scroll drives the stack.
  const lightRig = new THREE.Group();
  scene.add(lightRig);
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.52 * LEGACY_LIGHT_SCALE);
  scene.add(ambientLight);

  const keyLight = new THREE.DirectionalLight(0xffffff, 0.6 * LEGACY_LIGHT_SCALE);
  lightRig.add(keyLight, keyLight.target);

  // The reference constructs its back light with the near-black page neutral
  // and lerps the color toward the held volume's cloth background; its
  // configured #ffe6cc is never applied. At rest this light is effectively off.
  const BACK_LIGHT_REST_COLOR = new THREE.Color(0x211815);
  const backLightColorTarget = new THREE.Color(0x211815);
  const backLight = new THREE.DirectionalLight(0x211815, 0.5 * LEGACY_LIGHT_SCALE);
  lightRig.add(backLight, backLight.target);

  const rakeTarget = new THREE.Object3D();
  // distance 0 + decay 0: the legacy pipeline applies no distance falloff.
  const rakeLight = new THREE.SpotLight(0xcceecc, 0, 0, 0.36, 1, 0);
  rakeLight.target = rakeTarget;
  lightRig.add(rakeLight, rakeTarget);

  const books = items.map((item, index) => {
    const config = configurations[index] || configurations[configurations.length - 1];
    const link = links[index];
    const layoutTarget = link.querySelector(".press-volume-book") || link;
    const metadata = getMetadata(item, link, index);
    const spineMap = createSurfaceTexture(renderer, config, metadata, "spine");
    const coverMap = createSurfaceTexture(renderer, config, metadata, "cover");
    const boardMap = createSurfaceTexture(renderer, config, metadata, "board");
    const pageMap = createPageTexture(renderer, config);
    const pageBump = createPageResponseTexture(config, "bump");
    const undersideMap = createUndersideTexture(renderer, config);
    const spineBump = createBumpTexture(config, "spine", metadata);
    const coverBump = createBumpTexture(config, "cover", metadata);
    const boardBump = createBumpTexture(config, "board");
    const undersideBump = createBumpTexture(config, "underside");
    const spineFoil = createFoilTexture(renderer, config, metadata, "spine");
    const coverFoil = createFoilTexture(renderer, config, metadata, "cover");
    const sheenMap = createSheenTexture(config);
    const materialProfile = config.material;
    const phong = materialProfile.phong;

    // Reference materials are Phong (specular #ffffff, per-volume shininess);
    // brightness comes from the ×π rig, not emissive floors or a base-diffuse
    // add. Roughness/metalness/clearcoat era is retired with the ACES pipeline.
    const coreMaterial = new THREE.MeshPhongMaterial({
      color: new THREE.Color(config.background),
      specular: new THREE.Color(0x1c1c1c),
      shininess: Math.max(2, phong.shininess * 0.8),
      transparent: true
    });
    const spineMaterial = new THREE.MeshPhongMaterial({
      map: spineMap,
      bumpMap: spineBump,
      bumpScale: materialProfile.bump.spine * 0.56,
      specular: new THREE.Color(0xffffff),
      shininess: phong.shininess,
      transparent: true,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
    const coverMaterial = new THREE.MeshPhongMaterial({
      map: coverMap,
      bumpMap: coverBump,
      bumpScale: materialProfile.bump.cover * 0.56,
      specular: new THREE.Color(0xffffff),
      shininess: phong.shininess,
      transparent: true,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
    applyReferenceFoilShader(spineMaterial, { foil: spineFoil, sheen: sheenMap }, phong);
    applyReferenceFoilShader(coverMaterial, { foil: coverFoil, sheen: sheenMap }, phong);
    const pageMaterial = new THREE.MeshPhongMaterial({
      map: pageMap,
      bumpMap: pageBump,
      bumpScale: materialProfile.paper.bump * 0.62,
      color: 0xffffff,
      specular: new THREE.Color(0x161616),
      shininess: 6,
      transparent: true,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
    const undersideMaterial = new THREE.MeshPhongMaterial({
      map: undersideMap,
      bumpMap: undersideBump,
      bumpScale: materialProfile.bump.underside * 0.5,
      specular: new THREE.Color(0x121212),
      shininess: 5,
      transparent: true,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
    // The case's boards are real solids, not the planes the art floats on: a
    // hardback reads as a book from the side because two thick cloth-wrapped
    // boards sandwich the block. The edge material is the same cloth darkened
    // — the wrap over the board's cut edge — with the weave bump carried over.
    const boardEdgeMaterial = new THREE.MeshPhongMaterial({
      map: boardMap,
      // The scanned map already carries the volume's tint. This is only the
      // cloth wrap's edge darkening, not a second multiplication by the hue.
      color: new THREE.Color(0xffffff).multiplyScalar(0.82),
      bumpMap: boardBump,
      bumpScale: materialProfile.bump.cover * 0.4,
      specular: new THREE.Color(0x2a2a2a),
      shininess: Math.max(2, phong.shininess * 0.7),
      transparent: true
    });
    // The pastedown: the endpaper sheet glued over the board's inner face,
    // visible only in the square gap between board and block.
    const endpaperMaterial = new THREE.MeshPhongMaterial({
      color: new THREE.Color(materialProfile.underside.endpaper),
      specular: new THREE.Color(0x0e0e0e),
      shininess: 4,
      transparent: true
    });
    const headbandMaterial = new THREE.MeshPhongMaterial({
      map: createHeadbandTexture(renderer, config),
      specular: new THREE.Color(0x1a1a1a),
      shininess: 8,
      transparent: true
    });

    const root = new THREE.Group();
    const object = new THREE.Group();
    root.add(object);
    scene.add(root);

    return {
      index,
      item,
      link,
      layoutTarget,
      config,
      metadata,
      root,
      object,
      materials: [
        coreMaterial,
        spineMaterial,
        coverMaterial,
        pageMaterial,
        undersideMaterial,
        boardEdgeMaterial,
        endpaperMaterial,
        headbandMaterial
      ],
      coreMaterial,
      spineMaterial,
      coverMaterial,
      pageMaterial,
      undersideMaterial,
      boardEdgeMaterial,
      endpaperMaterial,
      headbandMaterial,
      geometry: [],
      dimensions: { width: 1, thickness: 1, depth: 1, tilt: 0 },
      // A volume has two homes: its slot on the catalogue shelf and the figure
      // column of its own section further down the same document. `sectionWeight`
      // says which one the pose is answering to.
      figure: volumeSections[index]?.querySelector(".press-volume-figure") || null,
      layout: {
        x: 0,
        y: 0,
        scale: 1,
        objectScaleX: 1,
        rotationY: 0,
        rotationZ: 0,
        objectRotationX: 0,
        sectionWeight: 0
      },
      centerOffset: { x: 0, y: 0 },
      opacity: 0,
      hover: 0,
      hold: 0,
      holdRotationX: 0,
      holdRotationY: 0,
      holdTargetRotationX: 0,
      holdTargetRotationY: 0,
      builtWidth: 0,
      builtHeight: 0
    };
  });

  let viewportWidth = 0;
  let viewportHeight = 0;
  let currentIndex = 0;
  let hoverIndex = -1;
  let focusIndex = -1;
  let pendingDeepLinkScroll = -1;
  let renderedFrames = 0;
  let presentedFrames = 0;
  let renderFrame = 0;
  let destroyed = false;
  let scrollFrame = 0;
  let resizeFrame = 0;
  let pointerFrame = 0;
  // Start the choreography after the first shader-compiled frame. Starting
  // earlier lets a cold WebGL compile consume the entire visible sequence.
  let entryStart = 0;
  let entrySettled = false;
  let entryControlsReady = false;
  // The address the document currently claims, so scroll-driven updates can tell
  // a real change from a repeat without reading `location` on every frame.
  let currentAddress = window.location.pathname + window.location.search;
  // The catalogue and the volumes are two states of one document, not one
  // continuous scroll. Measured on the reference at 1568×894: `/` is 6956px and
  // its address never changes however far you scroll it, while a picked book is
  // a 59529px document of every volume whose address does follow the scroll —
  // the same wrapper element, with the catalogue's own scroll contribution gone
  // (`PressHomepageProductList__container` 5846px → 0). So the mode is switched
  // by navigation — a pick, a popstate, a deep link — and never by scrolling.
  let pressMode = "catalogue";
  // The volume in flight from the shelf to its section, if a pick is in progress.
  let flight = null;
  // The rotation the reader has put into the volume that owns the viewport:
  // `x` about the horizontal axis, `y` about the vertical one, both offsets on
  // top of the section pose. `base` is what previous gestures left behind and
  // `anchor` is the pointer position they were measured from, so releasing a
  // drag keeps the orientation and free pointer-follow resumes from there.
  const cover = {
    x: 0,
    y: 0,
    lastX: 0,
    lastY: 0,
    baseX: 0,
    baseY: 0,
    anchorX: 0,
    anchorY: 0,
    dragging: false,
    twirlX: 0,
    twirlY: 0
  };
  // Whether a volume section, rather than the catalogue, owns the viewport.
  let sectionsOwnViewport = false;
  let currentScrollStep = 1;
  let holdGesture = null;
  let returningHoldIndex = -1;
  let holdIsolation = 0;
  let holdPresentation = 0;
  let holdBackdrop = 0;
  let holdReleasedAt = 0;
  let holdWasDragged = false;
  let holdClassTimer = 0;
  let completedPointerGesture = null;
  let lastFrameTime = 0;
  let lastScrollY = window.scrollY;
  let scrollVelocity = 0;
  let stackShift = 0;
  let terminalProgress = 0;
  let terminalSceneOpacity = 1;
  const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
  const holdBackdropColor = new THREE.Color(0x201819);
  let renderUntil = performance.now() + 1400;
  // The scene exposes none of its per-book state, and reasoning about it from
  // the outside has guessed wrong more than once — so the QA gate reads it
  // directly. Off unless something opts in before the scene loads: the gate sets
  // `window.__pressDebugEnabled` through `Page.addScriptToEvaluateOnNewDocument`,
  // which survives every navigation without decorating URLs. A visitor never
  // gets the hook.
  const debugEnabled = Boolean(window.__pressDebugEnabled);
  let frameDebug = null;

  document.documentElement.classList.remove("press-entry-complete");
  document.body.classList.remove("press-terminal-active", "press-terminal-closing");
  if (closingPanel) closingPanel.inert = true;
  if (footerPanel) footerPanel.inert = true;

  const wakeScene = (duration = 720) => {
    renderUntil = Math.max(renderUntil, performance.now() + duration);
    scheduleRender();
  };

  // Desktop preserves its settled drawing buffer, so once the scene is idle it
  // can stop requesting animation frames entirely. Every path that changes the
  // pose already calls wakeScene(); using that same boundary avoids a 120 Hz
  // callback loop which did no WebGL work but still consumed renderer-main CPU.
  function scheduleRender() {
    if (destroyed || renderFrame) return;
    renderFrame = requestAnimationFrame((now) => {
      renderFrame = 0;
      render(now);
    });
  }

  const disposeGeometry = (book) => {
    book.geometry.forEach((geometry) => geometry.dispose());
    book.geometry = [];
    book.object.clear();
  };

  const projectedBounds = (object) => {
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(object);
    const points = [
      new THREE.Vector3(bounds.min.x, bounds.min.y, bounds.min.z),
      new THREE.Vector3(bounds.min.x, bounds.min.y, bounds.max.z),
      new THREE.Vector3(bounds.min.x, bounds.max.y, bounds.min.z),
      new THREE.Vector3(bounds.min.x, bounds.max.y, bounds.max.z),
      new THREE.Vector3(bounds.max.x, bounds.min.y, bounds.min.z),
      new THREE.Vector3(bounds.max.x, bounds.min.y, bounds.max.z),
      new THREE.Vector3(bounds.max.x, bounds.max.y, bounds.min.z),
      new THREE.Vector3(bounds.max.x, bounds.max.y, bounds.max.z)
    ];
    let minimumX = Infinity;
    let minimumY = Infinity;
    let maximumX = -Infinity;
    let maximumY = -Infinity;
    points.forEach((point) => {
      point.project(camera);
      const x = (point.x * 0.5 + 0.5) * viewportWidth;
      const y = (-point.y * 0.5 + 0.5) * viewportHeight;
      minimumX = Math.min(minimumX, x);
      minimumY = Math.min(minimumY, y);
      maximumX = Math.max(maximumX, x);
      maximumY = Math.max(maximumY, y);
    });
    return {
      left: minimumX,
      top: minimumY,
      right: maximumX,
      bottom: maximumY,
      width: maximumX - minimumX,
      height: maximumY - minimumY,
      centerX: (minimumX + maximumX) / 2,
      centerY: (minimumY + maximumY) / 2
    };
  };

  const buildGeometry = (book, rect) => {
    if (
      Math.abs(book.builtWidth - rect.width) < 1
      && Math.abs(book.builtHeight - rect.height) < 1
    ) return;

    disposeGeometry(book);
    const width = rect.width * book.config.widthScale;
    const totalHeight = rect.height * book.config.heightScale;
    const topRatio = compactLayout.matches
      ? clamp(book.config.topRatio * 1.9, 0.46, 0.58)
      : book.config.topRatio;
    // `topRatio` is the lever for how much of the cover the shelf shows. The
    // tilt below is *derived* from it, so raising the tilt on its own is not
    // possible: the top face always projects to exactly `topDepth` pixels
    // (depth × sin(asin(topDepth / depth))), whatever angle it is held at. The
    // only way to give the cover more room is to spend more of the volume's
    // height on it, which is what these raised ratios do — the front face stays
    // the larger of the two and keeps the title.
    const topDepth = totalHeight * topRatio;
    const depth = rect.width * book.config.depthRatio;
    const thickness = Math.max(32, totalHeight - topDepth);
    const tilt = Math.asin(clamp(topDepth / depth, 0.01, 0.45));
    const radius = clamp(thickness * 0.022, 1.4, 2.5);
    // The case's boards and spine keep the calibrated outer size; the text block
    // inside them is smaller on the three unbound edges by the binder's
    // "squares", and flush at the spine, which is bound and has none.
    // The squares are on the three unbound edges only. Insetting the block
    // vertically as well opened a cavity between the boards — with nothing
    // standing in for the case's walls, an orbit under the volume looked
    // straight into a hollow box.
    const square = clamp(width * 0.014, 4, 11);
    // The boards are the case's thick covers: a real proportion is ~2.5mm of
    // greyboard against a ~28mm block. They are what the fore-edge and orbit
    // views were missing — two cloth-wrapped slabs with the block between
    // them, instead of art planes floating over a page brick.
    const boardThickness = clamp(thickness * 0.1, 3.5, 10);
    // The block yields its top and bottom to the boards and embeds 0.3 into
    // each so no two faces are coplanar — coplanar faces of neighbouring
    // meshes z-fight at grazing angles.
    const blockThickness = thickness - boardThickness * 2 - 0.6;
    const shape = createRoundedShape(width - square * 2, blockThickness, radius);
    const bevelSize = 0.72;
    const bevelThickness = 0.68;
    const coreGeometry = new THREE.ExtrudeGeometry(shape, {
      depth: depth - square,
      steps: 1,
      bevelEnabled: true,
      bevelSegments: 1,
      bevelSize,
      bevelThickness,
      curveSegments: 3
    });
    // Pulled a hair back from the spine plane: the boards' spine faces sit at
    // exactly +depth/2, and the block's own spine face must not share that
    // plane (coplanar z-fight).
    coreGeometry.translate(0, 0, -depth / 2 + square - 0.3);

    // The block is the pages. It used to be the whole book, with the cover
    // painted onto planes lying flush on its faces, which is why every edge met
    // the boards dead flat and the volume read as a printed slab rather than a
    // bound one.
    const core = new THREE.Mesh(coreGeometry, book.pageMaterial);
    // Keep mapped cloth/page faces clear of the triangulated core at steep
    // route angles. This is a surface separation, not added book thickness.
    const faceOffset = 1.05;
    const spineGeometry = createSpineGeometry(
      width,
      thickness,
      clamp(thickness * 0.012, 0.72, 1.2)
    );
    const spine = new THREE.Mesh(spineGeometry, book.spineMaterial);
    spine.position.z = depth / 2 + faceOffset;

    const coverGeometry = new THREE.PlaneGeometry(width, depth, 1, 1);
    const cover = new THREE.Mesh(coverGeometry, book.coverMaterial);
    cover.rotation.x = -Math.PI / 2;
    cover.position.y = thickness / 2 + faceOffset;

    const lowerCover = new THREE.Mesh(coverGeometry, book.undersideMaterial);
    lowerCover.rotation.x = Math.PI / 2;
    lowerCover.position.y = -thickness / 2 - faceOffset;

    // The boards. Box material order is px, nx, py, ny, pz, nz: the cloth
    // wraps every outer face, and the face toward the block is the pastedown.
    // A fully bevelled replacement was tested here, but it flattened the
    // interior at the existing extreme-orbit pose; retain this layered case
    // until a rounded board can preserve those visible surfaces.
    const boardGeometry = new THREE.BoxGeometry(width, boardThickness, depth);
    const upperBoard = new THREE.Mesh(boardGeometry, [
      book.boardEdgeMaterial,
      book.boardEdgeMaterial,
      book.boardEdgeMaterial,
      book.endpaperMaterial,
      book.boardEdgeMaterial,
      book.boardEdgeMaterial
    ]);
    upperBoard.position.y = thickness / 2 - boardThickness / 2;
    const lowerBoard = new THREE.Mesh(boardGeometry, [
      book.boardEdgeMaterial,
      book.boardEdgeMaterial,
      book.endpaperMaterial,
      book.boardEdgeMaterial,
      book.boardEdgeMaterial,
      book.boardEdgeMaterial
    ]);
    lowerBoard.position.y = -(thickness / 2 - boardThickness / 2);

    // Headbands: the striped cord at the head and tail of the block's spine,
    // peeking into the square gap at the two unbound x ends. The bound edge
    // (z+) has none of the square's clearance, so they tuck against it.
    // A headband is braided cord, not a square plug. Its ten-sided section is
    // subtle at shelf scale but catches the scanned-cloth light in an orbit.
    const headbandGeometry = new THREE.CylinderGeometry(2.15, 2.15, blockThickness + 1, 10);
    const headbandX = width / 2 - square - 0.5;
    const headbandZ = depth / 2 - 4.5;
    const headbandHead = new THREE.Mesh(headbandGeometry, book.headbandMaterial);
    headbandHead.position.set(headbandX, 0, headbandZ);
    const headbandTail = new THREE.Mesh(headbandGeometry, book.headbandMaterial);
    headbandTail.position.set(-headbandX, 0, headbandZ);

    // A hardback is a case around a smaller text block, not a printed slab. The
    // boards overhang the pages on the three unbound edges — the binder's
    // "squares" — and it is that overhang, plus the shadow it casts into the
    // page block, that reads as a book rather than a box. The pages were three
    // planes lying flush on the core's own faces, so every edge met the cover
    // dead flat.
    //
    // The case keeps the full `width × thickness × depth` the shelf is
    // calibrated against; the block is inset inside it and flush at the spine,
    // because that edge is bound and has no square.
    core.layers.enable(1);

    book.object.add(core, spine, cover, lowerCover, upperBoard, lowerBoard, headbandHead, headbandTail);
    book.geometry.push(coreGeometry, spineGeometry, coverGeometry, boardGeometry, headbandGeometry);
    book.root.position.set(0, 0, 0);
    book.root.rotation.set(0, 0, 0);
    book.root.scale.setScalar(1);
    book.object.scale.set(1, 1, 1);
    book.object.rotation.x = tilt;

    const cameraY = camera.position.y;
    camera.position.y = 0;
    const bounds = projectedBounds(book.object);
    camera.position.y = cameraY;
    camera.updateMatrixWorld(true);
    book.centerOffset.x = viewportWidth / 2 - bounds.centerX;
    book.centerOffset.y = bounds.centerY - viewportHeight / 2;
    book.dimensions = {
      width,
      thickness,
      depth,
      tilt,
      effectiveDepth: depth
    };
    book.builtWidth = rect.width;
    book.builtHeight = rect.height;
  };

  const setCurrentIndex = (index) => {
    const next = clamp(index, 0, books.length - 1);
    // Whatever the reader turned one volume to does not belong to the next one:
    // the reference resets its drag rotation whenever the active product
    // changes, so each volume is met square on. Not mid-drag, though — a scroll
    // during a drag changes the index, and zeroing the anchor under a held
    // pointer snaps the cover and drops the grabbing cursor while it is grabbed.
    if (next !== currentIndex && pressMode === "volumes" && !cover.dragging) {
      resetCover();
    }
    currentIndex = next;
    // The back control sits in the pinned hero, under the sections, so it cannot
    // inherit the ink of the volume covering it. Publish it.
    const section = volumeSections[currentIndex];
    if (section) {
      document.documentElement.style.setProperty(
        "--press-active-ink",
        getComputedStyle(section).getPropertyValue("--press-volume-ink").trim()
      );
    }
    railButtons.forEach((button, buttonIndex) => {
      const current = buttonIndex === currentIndex;
      button.classList.toggle("is-current", current);
      if (current) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    });
  };

  // The hero stays pinned beneath every section, so once a section owns the
  // viewport the shelf is not merely invisible — it is covered. Its anchors keep
  // their on-screen bounds there (the stack is frozen, not scrolled away), so
  // without this they stay in the tab order and a reader tabbing through a
  // volume walks three catalogue links they cannot see. `pointer-events: none`
  // only stops the mouse.
  const updateAccess = () => {
    items.forEach((item) => {
      const bounds = item.getBoundingClientRect();
      item.inert = sectionsOwnViewport
        || terminalProgress > 0.04
        || bounds.bottom <= 0
        || bounds.top >= window.innerHeight;
    });
  };

  const updateTerminalPanels = (progress) => {
    terminalProgress = clamp(progress, 0, 1);
    const signatureIn = smooth(clamp(terminalProgress / 0.14, 0, 1));
    const signatureOut = 1 - smooth(clamp((terminalProgress - 0.48) / 0.15, 0, 1));
    const signatureOpacity = signatureIn * signatureOut;
    const closingOpacity = smooth(clamp((terminalProgress - 0.58) / 0.2, 0, 1));
    terminalSceneOpacity = 1 - smooth(clamp(terminalProgress / 0.16, 0, 1));

    signaturePanel?.style.setProperty("--press-terminal-opacity", signatureOpacity.toFixed(4));
    signaturePanel?.style.setProperty(
      "--press-terminal-scale",
      mix(0.965, 1, signatureIn).toFixed(4)
    );
    closingPanel?.style.setProperty("--press-terminal-opacity", closingOpacity.toFixed(4));
    closingPanel?.style.setProperty(
      "--press-terminal-shift",
      `${mix(22, 0, closingOpacity).toFixed(2)}px`
    );
    footerPanel?.style.setProperty("--press-terminal-opacity", closingOpacity.toFixed(4));
    stage.style.setProperty(
      "--press-terminal-controls-opacity",
      (1 - smooth(clamp((terminalProgress - 0.5) / 0.24, 0, 1))).toFixed(4)
    );

    const active = terminalProgress > 0.012;
    const closing = closingOpacity > 0.72;
    document.body.classList.toggle("press-terminal-active", active);
    document.body.classList.toggle("press-terminal-closing", closing);
    if (closingPanel) closingPanel.inert = !closing;
    if (footerPanel) footerPanel.inert = !closing;
  };

  const updateScroll = () => {
    scrollFrame = 0;
    if (reducedMotion.matches) {
      main.style.removeProperty("height");
      list.style.setProperty("--press-stack-shift", "0px");
      stackShift = 0;
      camera.position.y = 0;
      lastScrollY = window.scrollY;
      scrollVelocity = 0;
      updateTerminalPanels(0);
      setCurrentIndex(0);
      // `layoutBooks` decides whether a section owns the viewport, and
      // `updateAccess` acts on that decision, so it has to run first — otherwise
      // a single instant jump leaves the access pass reading the previous
      // position's answer with no second event coming to correct it.
      layoutBooks(false);
      updateAccess();
      return;
    }

    const nextScrollY = window.scrollY;
    const scrollDelta = lastScrollY - nextScrollY;
    lastScrollY = nextScrollY;
    // §7: the fan lives only while no book is active. The volumes document
    // turns its live volume on scroll instead (COVER_SCROLL_TURN).
    if (pressMode !== "volumes") {
      scrollVelocity = clamp(
        scrollDelta * SCROLL_VELOCITY_PER_PIXEL,
        -SCROLL_VELOCITY_LIMIT,
        SCROLL_VELOCITY_LIMIT
      );
    }
    const offsets = items.map((item) => item.offsetTop);
    const compact = compactLayout.matches;
    currentScrollStep = window.innerHeight * (compact ? 0.225 : 0.213);
    const inVolumes = pressMode === "volumes";
    const catalogueMaximum = inVolumes ? 0 : currentScrollStep * (items.length - 1);
    const terminalLength = compact || inVolumes
      ? 0
      : window.innerHeight * TERMINAL_SCROLL_VIEWPORTS;
    // Each mode is only as long as its own content. The catalogue is its shelf
    // journey plus the terminal journey and nothing else — this is what keeps
    // scrolling the catalogue inside its own URL. The volumes document is the
    // five sections, which the stylesheet pulls up over the pinned hero so the
    // first one starts at offset 0, exactly as the reference's book document
    // does.
    const volumesHeight = inVolumes && volumes ? volumes.offsetHeight : 0;
    const terminalStart = catalogueMaximum;
    const maximum = catalogueMaximum + volumesHeight + terminalLength;
    main.style.height = Math.round(
      (inVolumes ? 0 : window.innerHeight) + maximum
    ) + "px";
    const catalogueScroll = Math.min(window.scrollY, catalogueMaximum);
    const floatingIndex = clamp(catalogueScroll / currentScrollStep, 0, items.length - 1);
    const lower = Math.floor(floatingIndex);
    const upper = Math.min(items.length - 1, lower + 1);
    const local = floatingIndex - lower;
    const shift = mix(offsets[lower], offsets[upper], local);
    stackShift = shift;
    list.style.setProperty("--press-stack-shift", -shift.toFixed(2) + "px");
    camera.position.y = -shift;
    if (!inVolumes) setCurrentIndex(Math.round(floatingIndex));
    // The volumes document has no terminal journey to be at a progress within.
    updateTerminalPanels(
      compact || inVolumes ? 0 : (window.scrollY - terminalStart) / terminalLength
    );
    layoutBooks(false);
    updateAccess();
  };

  const scheduleScroll = () => {
    wakeScene();
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(updateScroll);
  };

  // A book leaves the shelf for its own section's figure column when that figure
  // is about to enter from below. In the volumes document the shelf is never
  // drawn at all (see `drawFrame`), so the switch happens with nothing on screen
  // to jump.
  // In catalogue mode the sections are collapsed, so their rects are all zeros.
  // A zero rect is not an absent one — read as geometry it says "this section's
  // figure is at the top of the viewport", which would pose every book into a
  // section that has no layout. Gate on the mode, not on the geometry.
  const sectionHandoff = () => ({ inVolumes: pressMode === "volumes" && Boolean(volumes) });

  const sectionWeightFor = (book, figureRect, handoff) => {
    if (!handoff.inVolumes || !figureRect) return 0;
    // Under reduced motion the sections are plain document and the stylesheet
    // drops the figure column entirely, so there is no column to pose into. This
    // is load-bearing rather than a policy statement: a dropped figure still
    // answers `querySelector`, and its zero rect reads as a column at the top of
    // the viewport, so without this every book would be posed into nothing.
    if (reducedMotion.matches) return 0;
    return figureRect.top < viewportHeight * 1.25 ? 1 : 0;
  };

  const layoutBooks = (snap) => {
    const handoff = sectionHandoff();
    sectionsOwnViewport = handoff.inVolumes;
    // The hero stays pinned beneath every section, so its catalogue has to stop
    // claiming the pointer once a section owns the viewport.
    document.documentElement.classList.toggle("press-in-volumes", handoff.inVolumes);
    books.forEach((book) => {
      const rect = book.layoutTarget.getBoundingClientRect();
      // Geometry stays sized to the shelf rect and caches on ±1px of it. The
      // section pose is reached with `root.scale`; feeding a figure rect here
      // would re-extrude every book on every frame of the hand-off.
      buildGeometry(book, rect);
      const unshiftedTop = rect.top + stackShift;
      const shelfX = rect.left + rect.width / 2 - viewportWidth / 2 + book.centerOffset.x;
      const shelfY = viewportHeight / 2
        - (unshiftedTop + rect.height / 2)
        + book.centerOffset.y
        - book.config.yOffset;
      const shelfVisible = rect.bottom > -180 && rect.top < viewportHeight + 180;

      const figureRect = book.figure ? book.figure.getBoundingClientRect() : null;
      const weight = sectionWeightFor(book, figureRect, handoff);
      // `- stackShift` and `camera.position.y = -stackShift` are the same term
      // with opposite signs, so writing the camera in keeps a rect placed from
      // anywhere honest if the follow law changes.
      const figureX = figureRect
        ? figureRect.left + figureRect.width / 2 - viewportWidth / 2
        : 0;
      const figureY = figureRect
        ? viewportHeight / 2 - (figureRect.top + figureRect.height / 2) + camera.position.y
        : 0;
      // The cover pose follows the reference's active book (extracted facts §8,
      // and see the constants for what is extracted versus calibrated): the
      // pitch stops short of face-on so the cover stays foreshortened, the yaw
      // shows the side face, and the roll the shelf carries is *dropped*.
      //
      // That last one is the whole of the sideways-artwork bug. The reference
      // carries a quarter turn at rest and sheds it when the book stands up;
      // this scene had no rest roll and added one here, which stood the volume
      // portrait and took its landscape-authored artwork with it.
      //
      // Sized from the viewport rather than the figure column, as the reference
      // does — the book is the section, not an illustration inside a column. Its
      // cover measures .615 of viewport height, which is its long axis — and the
      // long axis is `width`, the edge the volume is bound along, stood upright
      // by the roll. Capped by the column it sits in, or a compact viewport gets
      // a cover wider than the screen.
      const heightLimited = figureRect
        ? (viewportHeight * SECTION_COVER_VIEWPORT_HEIGHT) / book.dimensions.width
        : 1;
      const widthLimited = figureRect
        ? (figureRect.width * 0.95) / book.dimensions.depth
        : 1;
      const coverScale = Math.min(heightLimited, widthLimited);

      book.layout.sectionWeight = weight;
      book.layout.x = weight > 0 ? mix(shelfX, figureX, weight) : shelfX;
      book.layout.y = weight > 0 ? mix(shelfY, figureY, weight) : shelfY;
      book.layout.scale = mix(1, coverScale, weight);
      // Only the volume that owns the viewport is live — the reference turns its
      // active product and nothing else. `activeScroll` is how far the section
      // has been read past its own top, which is the term it turns on.
      // Only the volume that owns the viewport is live — the reference turns its
      // active product and nothing else. `activeScroll` is how far the section
      // has been read past its own top, which is the term it turns on. The
      // pointer's own contribution is added at draw time instead: it changes
      // without a scroll or a resize, and this pass only runs on those.
      const active = book.index === currentIndex && !compactLayout.matches;
      const activeScroll = active && figureRect
        ? viewportHeight / 2 - (figureRect.top + figureRect.height / 2)
        : 0;
      const turnY = activeScroll * COVER_SCROLL_TURN;

      book.layout.live = active;
      book.layout.objectScaleX = mix(1, 0.86, weight);
      book.layout.rotationY = mix(
        book.config.pose.restYaw || 0,
        SECTION_COVER_YAW + turnY,
        weight
      );
      book.layout.rotationZ = mix(book.config.pose.restRoll || 0, SECTION_COVER_ROLL, weight);
      book.layout.objectRotationX = mix(
        book.dimensions.tilt,
        Math.PI / 2 - SECTION_COVER_PITCH_SHORTFALL,
        weight
      );
      book.layout.height = rect.height;
      book.layout.visible = weight >= 0.5
        ? figureRect.bottom > -180 && figureRect.top < viewportHeight + 180
        : shelfVisible;
      if (snap) {
        book.root.position.set(book.layout.x, book.layout.y, 0);
        book.root.scale.setScalar(book.layout.scale);
        book.root.rotation.set(
          0,
          book.layout.rotationY,
          book.layout.rotationZ
        );
        book.object.rotation.x = book.layout.objectRotationX;
        // The route cover pose narrows the object on x. A volume the hand-off
        // swapped *away* from is only ever restored here — `animateBookHome`
        // runs for the closing volume alone — so without this reset it stayed
        // squeezed on the shelf for the rest of the session.
        book.object.scale.x = book.layout.objectScaleX;
        book.hold = 0;
        book.holdRotationX = 0;
        book.holdRotationY = 0;
        book.holdTargetRotationX = 0;
        book.holdTargetRotationY = 0;
      }
    });
  };

  const stackEvictionOffset = (index, activeIndex) => (
    (activeIndex - index) * viewportHeight * STACK_EVICTION_VIEWPORTS
  );

  // One source unit spans camera.z / 100 world units. The z offset is anchored
  // at the visible spine plane because ZI3T's genuine volumes are deeper than
  // the reference meshes.
  const layoutLightRig = () => {
    const unit = camera.position.z / 100;
    const frontZ = books.reduce(
      (maximum, book) => Math.max(maximum, (book.dimensions.depth || 0) / 2),
      240
    );
    keyLight.position.set(4 * unit, 9.5 * unit, 4.5 * unit);
    backLight.position.set(-32 * unit, 12 * unit, -16 * unit);
    rakeLight.position.set(24 * unit, 5.4 * unit, frontZ + 4 * unit);
    rakeTarget.position.set(-6 * unit, -4 * unit, frontZ - 9.5 * unit);
  };

  const resize = (snap = false) => {
    resizeFrame = 0;
    viewportWidth = window.innerWidth;
    viewportHeight = window.innerHeight;
    renderer.setSize(viewportWidth, viewportHeight, false);
    camera.aspect = viewportWidth / viewportHeight;
    camera.position.set(0, 0, viewportHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))));
    camera.far = camera.position.z + 12000;
    pressUnitScaleUniform.value = camera.position.z / 100;
    camera.updateProjectionMatrix();
    updateScroll();
    layoutBooks(snap);
    layoutLightRig();
  };

  const scheduleResize = () => {
    wakeScene(900);
    if (resizeFrame) return;
    resizeFrame = requestAnimationFrame(() => resize(false));
  };

  const previewRailItem = (index) => {
    if (compactLayout.matches) return;
    // The preview previews the *shelf* — it scrims the stage and dims the canvas
    // to .28 so the hovered volume reads against it. Inside a volume there is no
    // shelf to preview and the scrim is `position: fixed`, so it would drop 72%
    // black over the section the reader is on. The rail still navigates.
    if (pressMode === "volumes") return;
    stage.classList.add("is-index-preview");
    document.body.classList.add("press-index-preview");
    railButtons.forEach((button, buttonIndex) => {
      button.classList.toggle("is-preview", buttonIndex === index);
    });
    railFills.forEach((fill, fillIndex) => {
      const distance = Math.abs(index - fillIndex);
      const falloff = Math.cos(distance / railFills.length * Math.PI);
      fill.style.setProperty("--rail-scale", Math.max(1, falloff * 2 + 2.55).toFixed(3));
    });
  };

  const closeRailPreview = () => {
    stage.classList.remove("is-index-preview");
    document.body.classList.remove("press-index-preview");
    railButtons.forEach((button) => button.classList.remove("is-preview"));
    railFills.forEach((fill) => fill.style.setProperty("--rail-scale", "1"));
  };

  const hasModifiedClick = (event) => (
    event.button > 0
    || event.metaKey
    || event.ctrlKey
    || event.shiftKey
    || event.altKey
  );

  const clearHoldClasses = (immediate = false) => {
    window.clearTimeout(holdClassTimer);
    const remove = () => {
      stage.classList.remove("is-book-held", "is-book-dragging");
      document.body.classList.remove("press-book-held", "press-book-dragging");
    };
    if (immediate) remove();
    else holdClassTimer = window.setTimeout(remove, 780);
  };

  const beginBookHold = (book, event, options = {}) => {
    if (
      event.pointerType !== "mouse"
      || event.button !== 0
      || hasModifiedClick(event)
      || compactLayout.matches
      || reducedMotion.matches
      || terminalProgress > 0.012
    ) return;

    clearHoldClasses(true);
    closeRailPreview();
    returningHoldIndex = book.index;
    holdReleasedAt = 0;
    holdWasDragged = false;
    completedPointerGesture = null;
    holdBackdropColor.set(book.config.background);
    holdGesture = {
      id: event.pointerId,
      index: book.index,
      link: book.link,
      startX: event.clientX,
      startY: event.clientY,
      dx: 0,
      dy: 0,
      moved: false,
      captureTarget: options.captureTarget || event.currentTarget || book.link
    };
    book.holdRotationX = 0;
    book.holdRotationY = 0;
    book.holdTargetRotationX = 0;
    book.holdTargetRotationY = 0;
    hoverIndex = book.index;
    setCurrentIndex(book.index);
    document.body.style.setProperty("--press-held-background", book.config.background);
    document.body.style.setProperty("--press-held-ink", book.config.ink);
    holdCaption.textContent = book.config.caption;
    stage.classList.add("is-book-held");
    document.body.classList.add("press-book-held");
    try {
      holdGesture.captureTarget?.setPointerCapture?.(event.pointerId);
    } catch {
      // Window-level pointer tracking remains authoritative when a browser
      // declines capture on an anchor or list row.
    }
    wakeScene(2400);
  };

  const updateBookHold = (event) => {
    if (!holdGesture || holdGesture.id !== event.pointerId) return false;
    // A drag exists only while the primary button is still down. Headful
    // Chrome can emit a synthetic pointermove at the physical cursor after a
    // DevTools screenshot with `buttons: 0`; window-focus changes can do the
    // same. Treating that as gesture travel turns a stationary press into a
    // drag and suppresses an otherwise valid click.
    if ((event.buttons & 1) === 0) return false;
    holdGesture.dx = event.clientX - holdGesture.startX;
    holdGesture.dy = event.clientY - holdGesture.startY;
    if (
      !holdGesture.moved
      && Math.abs(holdGesture.dx) + Math.abs(holdGesture.dy) > HOLD_DRAG_THRESHOLD
    ) {
      holdGesture.moved = true;
      stage.classList.add("is-book-dragging");
      document.body.classList.add("press-book-dragging");
      // The reference places the caption in whichever vertical half the held
      // volume does not occupy, so the note never covers the book.
      const heldBook = books[holdGesture.index];
      if (heldBook) {
        const heldCenterY = projectedBounds(heldBook.root).centerY;
        holdCaption.classList.toggle("is-low", heldCenterY < viewportHeight * 0.5);
      }
    }

    const book = books[holdGesture.index];
    if (book && holdGesture.moved) {
      const pose = book.config.pose;
      const distance = Math.hypot(holdGesture.dx, holdGesture.dy);
      const reveal = smooth(clamp(
        (distance - HOLD_DRAG_THRESHOLD) / (HOLD_REVEAL_DISTANCE - HOLD_DRAG_THRESHOLD),
        0,
        1
      ));
      // Screen-space vertical travel follows the pointer: dragging upward
      // raises the grabbed edge instead of tipping the cover down toward it.
      const directionalPitch = heldOrbitAngle(
        holdGesture.dy,
        pose.verticalResponse
      );
      const revealPitch = holdGesture.dy > 0
        ? pose.revealPitch * 0.16
        : pose.revealPitch;
      book.holdTargetRotationX = clamp(
        reveal * revealPitch + directionalPitch,
        -HOLD_ORBIT_LIMIT,
        HOLD_ORBIT_LIMIT
      );
      book.holdTargetRotationY = heldOrbitAngle(
        holdGesture.dx,
        pose.yawResponse
      );
    }
    wakeScene(1800);
    return true;
  };

  const finishBookHold = (event) => {
    if (!holdGesture || holdGesture.id !== event.pointerId) return false;
    const finished = holdGesture;
    if (finished.captureTarget?.hasPointerCapture?.(event.pointerId)) {
      try {
        finished.captureTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Capture can already be gone after a Safari window-edge release.
      }
    }
    completedPointerGesture = {
      index: finished.index,
      pointerId: finished.id,
      moved: finished.moved
    };
    returningHoldIndex = finished.index;
    holdReleasedAt = performance.now();
    holdWasDragged = finished.moved;
    holdGesture = null;
    hoverIndex = -1;
    stage.classList.remove("is-book-dragging");
    document.body.classList.remove("press-book-dragging");
    clearHoldClasses(false);
    wakeScene(1500);
    return true;
  };

  // Switching mode changes what the document *is*, so the scroll length, the
  // pose targets and the covered-chrome flags all have to be recomputed before
  // anything reads a section offset. `updateScroll` does all three.
  const setPressMode = (next, { snap = true } = {}) => {
    if (!volumeSections.length) return;
    if (pressMode === next) return;
    pressMode = next;
    document.documentElement.classList.toggle("press-volumes-open", next === "volumes");
    updateScroll();
    if (next !== "volumes") {
      // A pick interrupted would otherwise leave its volume parked mid-flight:
      // the section pose block skips a book with no section, and the shelf's own
      // pose chain only runs while the scene is awake. History restores the
      // shelf as it was, so it snaps; Escape is a gesture and flies home, which
      // the damped pose chain does on its own once it is woken and not snapped.
      flight = null;
      resetCover();
      if (snap) layoutBooks(true);
      else wakeScene(1600);
    }
  };

  // A book URL is a position in the volumes document, so reaching a volume is a
  // scroll within it. The address is pushed rather than replaced because the
  // pick is deliberate: Back should undo it, where Back over a scroll should not.
  const volumeAddress = (index) => {
    const url = new URL(books[index].metadata.routeUrl, window.location.href);
    return url.pathname + url.search + url.hash;
  };

  const sectionScrollTop = (index) => {
    const section = volumeSections[index];
    return section ? section.getBoundingClientRect().top + window.scrollY : 0;
  };

  // Instant, not smooth. The reference jumps: 120ms after a pick it already had
  // the new address, the new 59529px document and scrollY 12148. Animating the
  // offset instead flies the reader past every volume between here and there —
  // measured at 1.5s and four addresses replaced on the way — through a document
  // the mode switch has only just created.
  //
  // `"instant"`, not `"auto"`: `site.css` sets `scroll-behavior: smooth` on
  // `html`, and `auto` means *defer to that*, which is how this came to animate
  // in the first place.
  const scrollToVolume = (index) => {
    if (!volumeSections[index]) return false;
    window.scrollTo({ top: sectionScrollTop(index), behavior: "instant" });
    return true;
  };

  const goToVolume = (index) => {
    if (!volumeSections[index]) return false;
    // Park the scroll position on the entry being left, so Back restores where
    // the catalogue was rather than the top of the document.
    history.replaceState(
      { ...(history.state || {}), pressScrollY: window.scrollY },
      "",
      currentAddress
    );
    const address = volumeAddress(index);
    history.pushState({ pressVolume: index }, "", address);
    currentAddress = address;
    setCurrentIndex(index);
    // Each route begins in the same intentional portrait pose. A turn thrown
    // into one volume must not leak into the next one through the shared scene.
    resetCover();
    // The book flies from wherever it is now, so its pose has to be taken before
    // the mode switch moves the target. Speed starts at 0 — that slow start is
    // the whole character of the reference's activation.
    // Not under reduced motion, where no volume is posed into a section at all:
    // the flight would have no target to advance toward, so it would never
    // terminate and would hold the shelf's pose chain off that book until the
    // next mode switch cleared it.
    flight = reducedMotion.matches ? null : { index, speed: 0, approach: 0 };
    // Open the volumes document before measuring where in it to land: while the
    // sections are collapsed every one of them reports offset 0.
    setPressMode("volumes");
    scrollToVolume(index);
    wakeScene(1200);
    return true;
  };

  const openVolume = (index, event) => {
    if (event && (event.defaultPrevented || hasModifiedClick(event))) return;
    const completedGesture = event?.detail > 0
      && completedPointerGesture?.index === index
      ? completedPointerGesture
      : null;
    if (completedGesture) completedPointerGesture = null;
    if (completedGesture?.moved || (holdGesture?.index === index && holdGesture.moved)) {
      event?.preventDefault();
      return;
    }
    // Without the assembled sections there is nowhere in this document to go —
    // the anchor is real, so let the browser follow it.
    if (!volumeSections[index]) return;
    event?.preventDefault();
    goToVolume(index);
  };

  // Escape puts the volume back on the shelf. The reference's own handler does
  // exactly this — `Escape` calls `activateProductList()`, which restarts the
  // ease and scrolls to that book's slot in the list rather than to wherever the
  // reader happened to be. So the shelf comes back with the volume you were
  // reading under the cursor, not at the top of the page.
  //
  // Its `ArrowUp`/`ArrowDown` step between volumes in the same handler. Not
  // adopted: our sections carry long-form reading, and taking the arrow keys
  // away from a keyboard reader trying to scroll costs more than the shortcut is
  // worth.
  const returnToCatalogue = () => {
    if (pressMode !== "volumes") return false;
    const index = currentIndex;
    history.pushState({ pressHome: true }, "", cataloguePath);
    currentAddress = cataloguePath;
    setPressMode("catalogue", { snap: false });
    window.scrollTo({ top: currentScrollStep * index, behavior: "instant" });
    setCurrentIndex(index);
    wakeScene(1600);
    return true;
  };

  const backControl = backButton;
  if (backControl) {
    backControl.addEventListener("click", (event) => {
      event.preventDefault();
      // This is a product-list control rather than a one-step history walker:
      // after moving between volumes, browser history can contain other book
      // URLs. It always returns the current volume to its shelf slot; browser
      // Back gets the same damped animation in the popstate handler below.
      returnToCatalogue();
    });
  }

  window.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || hasModifiedClick(event)) return;
    if (pressMode !== "volumes") return;
    // Not while the reader is typing, and not inside anything that takes its own
    // keys — a volume's content is real page content and may contain either.
    const target = event.target;
    if (target instanceof HTMLElement && (
      target.isContentEditable
      || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)
    )) return;

    if (event.key === "Escape") {
      event.preventDefault();
      returnToCatalogue();
      return;
    }
    // The reference maps these to stepping between volumes in the same handler.
    // It takes the arrow keys away from scrolling to do it, which is the cost —
    // so this stops at the ends rather than wrapping, and Escape and the back
    // control remain the ways out.
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const next = currentIndex + (event.key === "ArrowDown" ? 1 : -1);
      if (next < 0 || next >= volumeSections.length) return;
      event.preventDefault();
      goToVolume(next);
    }
  });

  const goToRailVolume = (index, event) => {
    if (event && hasModifiedClick(event)) return;
    event?.preventDefault();
    goToVolume(index);
  };

  items.forEach((item, index) => {
    const link = links[index];
    if (!link) return;
    item.addEventListener("pointerdown", (event) => beginBookHold(books[index], event));
    link.addEventListener("dragstart", (event) => event.preventDefault());
    item.addEventListener("pointerenter", () => {
      hoverIndex = index;
      wakeScene();
      setCurrentIndex(index);
    });
    item.addEventListener("pointerleave", () => {
      if (holdGesture?.index === index) return;
      if (hoverIndex === index) hoverIndex = -1;
      wakeScene();
    });
    link.addEventListener("focus", () => {
      focusIndex = index;
      wakeScene();
      setCurrentIndex(index);
    });
    link.addEventListener("blur", () => {
      if (focusIndex === index) focusIndex = -1;
      wakeScene();
    });
    item.addEventListener("click", (event) => openVolume(index, event));
  });

  railButtons.forEach((button, index) => {
    button.addEventListener("pointerenter", () => previewRailItem(index));
    button.addEventListener("focus", () => previewRailItem(index));
    button.addEventListener("blur", closeRailPreview);
    button.addEventListener("click", (event) => goToRailVolume(index, event));
  });
  rail?.addEventListener("pointerleave", closeRailPreview);

  closingPanel?.querySelectorAll("a[href]").forEach((anchor) => {
    const pathname = new URL(anchor.href, window.location.href).pathname;
    // Closing-panel links point at the genuine pages, but a volume may also be
    // reachable by its book URL, so accept either.
    const bookIndex = books.findIndex((book) => (
      new URL(book.metadata.contentUrl, window.location.href).pathname === pathname
      || routePathname(book) === pathname
    ));
    if (bookIndex >= 0) {
      anchor.addEventListener("click", (event) => goToRailVolume(bookIndex, event));
    }
  });

  // The volume in a section is not a picture of a book. The reference keeps it
  // live: it follows the pointer at a rate you barely notice until you look, it
  // turns under a drag, and a release throws it. All three are the same two
  // numbers with different rates.
  const coverPointer = (event) => ({
    x: event.clientX - viewportWidth / 2,
    y: event.clientY - viewportHeight / 2
  });

  const resetCover = () => {
    cover.x = 0;
    cover.y = 0;
    cover.lastX = 0;
    cover.lastY = 0;
    cover.baseX = 0;
    cover.baseY = 0;
    cover.anchorX = 0;
    cover.anchorY = 0;
    cover.dragging = false;
    cover.twirlX = 0;
    cover.twirlY = 0;
    document.body.classList.remove("press-cover-dragging");
  };

  const coverLive = () => (
    pressMode === "volumes" && !reducedMotion.matches && !compactLayout.matches
  );

  const trackCover = (event) => {
    if (!coverLive() || event.pointerType === "touch") return;
    const point = coverPointer(event);
    const rate = cover.dragging ? COVER_DRAG_RATE : COVER_FOLLOW_RATE;
    cover.lastX = cover.x;
    cover.lastY = cover.y;
    // Vertical pointer travel turns the cover about the horizontal axis and
    // horizontal travel about the vertical one, as the reference maps them.
    cover.x = (point.y - cover.anchorY) * rate + cover.baseX;
    cover.y = (point.x - cover.anchorX) * rate + cover.baseY;
    wakeScene();
  };

  const beginCoverDrag = (event) => {
    if (!coverLive() || hasModifiedClick(event) || event.pointerType === "touch") return;
    // Not while the volume is still flying in: the flight eases toward a target
    // that now includes this offset, so grabbing mid-flight moves the target
    // under the ease. The reference cannot reach this state — its activation
    // resets the drag rotation and owns the frame until it lands.
    if (flight) return;
    const point = coverPointer(event);
    cover.dragging = true;
    cover.twirlX = 0;
    cover.twirlY = 0;
    // Re-anchor on the grab so the drag starts from where the cover already is
    // rather than snapping to the pointer's absolute offset.
    cover.anchorX = point.x;
    cover.anchorY = point.y;
    cover.baseX = cover.x;
    cover.baseY = cover.y;
    document.body.classList.add("press-cover-dragging");
    wakeScene(900);
  };

  const endCoverDrag = (event) => {
    if (!cover.dragging) return;
    cover.dragging = false;
    document.body.classList.remove("press-cover-dragging");
    const point = coverPointer(event);
    cover.anchorX = point.x;
    cover.anchorY = point.y;
    cover.baseX = cover.x;
    cover.baseY = cover.y;
    cover.twirlX = clamp(cover.x - cover.lastX, -COVER_TWIRL_LIMIT, COVER_TWIRL_LIMIT);
    cover.twirlY = clamp(cover.y - cover.lastY, -COVER_TWIRL_LIMIT, COVER_TWIRL_LIMIT);
    wakeScene(1600);
  };

  books.forEach((book) => {
    if (!book.figure) return;
    book.figure.addEventListener("pointerdown", beginCoverDrag);
  });

  window.addEventListener("pointermove", trackCover, { passive: true });
  window.addEventListener("pointerup", endCoverDrag, { passive: true });
  window.addEventListener("pointercancel", endCoverDrag, { passive: true });

  window.addEventListener("pointermove", (event) => {
    if (holdGesture) updateBookHold(event);
  }, { capture: true, passive: true });
  window.addEventListener("pointerup", (event) => finishBookHold(event), true);
  window.addEventListener("pointercancel", (event) => finishBookHold(event), true);

  stage.addEventListener("pointermove", (event) => {
    if (reducedMotion.matches) return;
    if (holdGesture) return;
    if (event.pointerType !== "mouse") return;
    if (pointerFrame) cancelAnimationFrame(pointerFrame);
    pointerFrame = requestAnimationFrame(() => {
      // The reference keeps the stack planted; pointer movement only keeps
      // the on-demand scene awake while a spine extrudes toward the camera.
      pointer.targetX = 0;
      pointer.targetY = 0;
      wakeScene();
      pointerFrame = 0;
    });
  }, { passive: true });

  stage.addEventListener("pointerleave", () => {
    if (holdGesture) return;
    pointer.targetX = 0;
    pointer.targetY = 0;
    wakeScene();
  });

  window.addEventListener("scroll", scheduleScroll, { passive: true });
  window.addEventListener("resize", scheduleResize, { passive: true });
  reducedMotion.addEventListener("change", scheduleResize);
  compactLayout.addEventListener("change", scheduleResize);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      entryStart = entryStart
        ? Math.min(entryStart, performance.now() - 700)
        : performance.now() - 700;
      wakeScene(900);
    }
  });

  // There is no route to reverse: an entry is a mode and a position within it,
  // so Back is a mode switch and a scroll. `history.scrollRestoration` is
  // manual, which is why the offset has to be put back by hand.
  window.addEventListener("popstate", (event) => {
    currentAddress = window.location.pathname + window.location.search;
    const index = books.findIndex(
      (book) => routePathname(book) === window.location.pathname
    );
    if (index >= 0 && volumeSections[index]) {
      setCurrentIndex(index);
      setPressMode("volumes");
      scrollToVolume(index);
      return;
    }
    // Collapse first, then restore: the catalogue is the shorter document, so
    // putting the offset back before the volumes close lets the browser clamp
    // it to the end of a document that is about to shrink.
    // Preserve the section pose for one damped shelf return, just as Escape
    // does. Snapping here was why the browser's Back button felt unlike the
    // dedicated control.
    setPressMode("catalogue", { snap: false });
    window.scrollTo({ top: Number(event.state?.pressScrollY) || 0, behavior: "instant" });
    wakeScene(1600);
  });

  renderer.domElement.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    destroyed = true;
    cancelAnimationFrame(renderFrame);
    document.documentElement.classList.remove("press-scene-ready");
  });

  window.addEventListener("pagehide", () => {
    destroyed = true;
    cancelAnimationFrame(scrollFrame);
    cancelAnimationFrame(resizeFrame);
    cancelAnimationFrame(pointerFrame);
    cancelAnimationFrame(renderFrame);
    const textures = new Set();
    books.forEach((book) => {
      book.geometry.forEach((geometry) => geometry.dispose());
      book.materials.forEach((material) => {
        [material.map, material.bumpMap, material.roughnessMap, material.metalnessMap]
          .filter(Boolean)
          .forEach((texture) => textures.add(texture));
        material.dispose();
      });
    });
    textures.forEach((texture) => texture.dispose());
    renderer.dispose();
    renderer.forceContextLoss();
  }, { once: true });

  // Deep link: the worker answers a book URL with this shell, so a direct load
  // opens straight into that volume rather than the shelf — the reference
  // resolves its book URLs the same way, by reading the path on load.
  const deepLinkIndex = books.findIndex(
    (book) => routePathname(book) === window.location.pathname
  );
  // A book URL is a position in the volumes document, so a deep link opens that
  // document and lands on the section. Without the assembled sections there is
  // nowhere to land and the shell simply opens at the catalogue.
  if (deepLinkIndex >= 0 && volumeSections.length) {
    history.replaceState(
      { pressVolume: deepLinkIndex },
      "",
      window.location.href
    );
    setCurrentIndex(deepLinkIndex);
    pressMode = "volumes";
    document.documentElement.classList.add("press-volumes-open");
    pendingDeepLinkScroll = deepLinkIndex;
  }

  // Safari and a restored browser session may apply their saved scroll after
  // the first paint, which used to leave a direct book URL with its viewport
  // layer visible but its book figure far above the viewport. Settle one more
  // time after load, once the browser has finished that restoration.
  if (deepLinkIndex >= 0 && volumeSections.length) {
    window.addEventListener("load", () => {
      window.setTimeout(() => {
        if (pressMode === "volumes" && pendingDeepLinkScroll < 0) {
          scrollToVolume(deepLinkIndex);
        }
      }, 120);
    }, { once: true });
  }

  history.scrollRestoration = "manual";
  if (window.location.pathname === cataloguePath) {
    history.replaceState(
      { ...(history.state || {}), pressHome: true },
      "",
      window.location.href
    );
  }

  // Inside the volumes document the address follows the scroll: whichever
  // section crosses the middle of the viewport owns it. Replaced, never pushed —
  // scrolling through five volumes must not bury the entry the reader arrived
  // on. A deliberate pick pushes instead, in `goToVolume`.
  //
  // It does nothing in catalogue mode, and it is the reason this rebuild had to
  // gain a mode at all: scrolling the catalogue used to walk into the sections
  // and hand the address away, which the reference never does.
  if (volumeSections.length) {
    const crossing = new Set();
    const addressObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) crossing.add(entry.target);
        else crossing.delete(entry.target);
      });
      if (pressMode !== "volumes") return;
      // A deep link opens the volumes document at scroll 0 and only lands on its
      // section once there are frames to measure against. The observer delivers
      // at the end of the first frame, so without this it claims the address for
      // whichever section is at the top and hands it back a few milliseconds
      // later — measured flipping to `/refly/` at 224ms on a `/field-notes/`
      // load and back at 234ms.
      if (pendingDeepLinkScroll >= 0) return;
      const section = volumeSections.find((candidate) => crossing.has(candidate));
      if (!section) return;
      const address = section.dataset.pressVolume;
      if (address === currentAddress) return;
      currentAddress = address;
      history.replaceState(
        { ...(history.state || {}), pressScrollY: window.scrollY },
        "",
        address
      );
      const index = volumeSections.indexOf(section);
      if (index >= 0) setCurrentIndex(index);
    }, { rootMargin: "-50% 0px -50% 0px", threshold: 0 });
    volumeSections.forEach((section) => addressObserver.observe(section));
  }

  // One canvas serves both documents, and it paints *above* the sections'
  // grounds, so the shelf cannot be left to be occluded by them — it has to stop
  // being drawn. Which books draw is therefore a property of the mode: the
  // catalogue draws its whole shelf, the volumes document draws only the books
  // that have reached their section's figure. A book still on the shelf in the
  // volumes document would otherwise appear over the volume in view, since its
  // shelf slot is still laid out inside the pinned hero.
  //
  // This was a two-pass scissored split while the catalogue and the volumes were
  // one scroll and the boundary between them could sit mid-viewport. With two
  // documents there is no such boundary to cut on — the sections begin at offset
  // 0 — so the split is by mode and the scissor is gone.
  const drawFrame = () => {
    if (pressMode !== "volumes") {
      renderer.render(scene, camera);
      return;
    }
    books.forEach((book) => {
      book.root.visible = book.layout.sectionWeight > 0;
    });
    renderer.render(scene, camera);
    books.forEach((book) => {
      book.root.visible = true;
    });
  };

  function render(now) {
    if (destroyed) return;
    if (!entryStart) {
      entryStart = now;
      renderUntil = Math.max(renderUntil, now + 1400);
    }
    const rawDeltaSeconds = lastFrameTime ? (now - lastFrameTime) / 1000 : 1 / 60;
    const deltaSeconds = clamp(rawDeltaSeconds, 1 / 240, 1 / 20);
    const interactionDeltaSeconds = clamp(rawDeltaSeconds, 1 / 240, 0.25);
    lastFrameTime = now;
    const homeMotionActive = !entrySettled
      || now < renderUntil
      || Boolean(holdGesture)
      || returningHoldIndex >= 0;
    if (debugEnabled) frameDebug = { now, renderUntil, homeMotionActive, entrySettled };
    // §7: the scroll velocity decays ×.4 per frame and is added to the spine
    // tilt target inside the damped approach below — it is not itself eased.
    const frameSteps = clamp(interactionDeltaSeconds * 60, 0.25, 4);
    scrollVelocity *= Math.pow(SCROLL_VELOCITY_DECAY, frameSteps);
    if (Math.abs(scrollVelocity) < 0.0001) scrollVelocity = 0;

    const activeHoldIndex = holdGesture?.index ?? returningHoldIndex;
    const holdingBook = Boolean(holdGesture);
    const presentingBook = Boolean(holdGesture?.moved);
    const releaseElapsed = holdReleasedAt ? now - holdReleasedAt : Infinity;
    const isolatingBook = holdingBook || (holdWasDragged && releaseElapsed < 360);
    const returningPresentation = holdWasDragged && releaseElapsed < 110;
    const holdingBackdrop = presentingBook || (holdWasDragged && releaseElapsed < 430);
    holdIsolation = damp(
      holdIsolation,
      isolatingBook ? 1 : 0,
      isolatingBook ? 14 : 6,
      interactionDeltaSeconds
    );
    stage.classList.toggle(
      "is-stack-evacuated",
      activeHoldIndex >= 0 && holdIsolation > 0.9
    );
    holdPresentation = damp(
      holdPresentation,
      presentingBook || returningPresentation ? 1 : 0,
      presentingBook || returningPresentation ? 7.8 : 4.6,
      interactionDeltaSeconds
    );
    holdBackdrop = damp(
      holdBackdrop,
      holdingBackdrop ? 1 : 0,
      holdingBackdrop ? 12.5 : 7,
      interactionDeltaSeconds
    );

    lightRig.position.y = camera.position.y;
    const keyBook = books[activeHoldIndex] || null;
    const keyFocus = keyBook ? holdPresentation : 0;
    const dragLightX = clamp((holdGesture?.dx || 0) / 220, -1, 1) * keyFocus;
    const dragLightY = clamp((holdGesture?.dy || 0) / 180, -1, 1) * keyFocus;
    const lightUnit = camera.position.z / 100;
    const keyTargetX = (keyBook?.root.position.x || 0) * keyFocus;
    const keyTargetY = (
      (keyBook?.root.position.y || camera.position.y) - camera.position.y
    ) * keyFocus;
    keyLight.target.position.x = damp(
      keyLight.target.position.x,
      keyTargetX,
      8.5,
      interactionDeltaSeconds
    );
    keyLight.target.position.y = damp(
      keyLight.target.position.y,
      keyTargetY,
      8.5,
      interactionDeltaSeconds
    );
    keyLight.position.x = damp(
      keyLight.position.x,
      keyTargetX + (4 + dragLightX * 8) * lightUnit,
      8.5,
      interactionDeltaSeconds
    );
    keyLight.position.y = damp(
      keyLight.position.y,
      keyTargetY + (9.5 - dragLightY * 5) * lightUnit,
      8.5,
      interactionDeltaSeconds
    );
    keyLight.position.z = damp(
      keyLight.position.z,
      (4.5 + Math.abs(dragLightY) * 3) * lightUnit,
      8.5,
      interactionDeltaSeconds
    );

    ambientLight.intensity = damp(
      ambientLight.intensity,
      0.52 * LEGACY_LIGHT_SCALE,
      5.2,
      interactionDeltaSeconds
    );
    keyLight.intensity = damp(
      keyLight.intensity,
      0.6 * LEGACY_LIGHT_SCALE,
      5.2,
      interactionDeltaSeconds
    );
    backLight.intensity = damp(
      backLight.intensity,
      0.5 * LEGACY_LIGHT_SCALE,
      5.2,
      interactionDeltaSeconds
    );
    // Reference behavior: the back light's color lerps toward the presented
    // volume's cloth background and returns to the near-black neutral at rest.
    if (keyBook && keyFocus > 0) {
      backLightColorTarget.set(keyBook.config.background).lerp(
        BACK_LIGHT_REST_COLOR,
        1 - keyFocus
      );
    } else {
      backLightColorTarget.copy(BACK_LIGHT_REST_COLOR);
    }
    backLight.color.lerp(
      backLightColorTarget,
      1 - Math.exp(-5.2 * interactionDeltaSeconds)
    );
    // The source rig dims the pale-mint rake while a book is presented.
    rakeLight.intensity = damp(
      rakeLight.intensity,
      mix(0.75, 0.05, holdPresentation) * LEGACY_LIGHT_SCALE,
      5.2,
      interactionDeltaSeconds
    );
    renderer.setClearColor(holdBackdropColor, holdBackdrop);

    if (homeMotionActive) {
      pointer.x = mix(pointer.x, pointer.targetX, 0.08);
      pointer.y = mix(pointer.y, pointer.targetY, 0.08);
      let allEntriesSettled = true;
      // `entryLinear` only reports that the drive curve finished; every pose it
      // feeds is reached through `damp`, which approaches asymptotically. The
      // rail used to start its cascade on the curve alone and so ran over books
      // still visibly sliding into place. Track the worst remaining offset and
      // hold the hand-off until the stack is actually parked.
      let entryResidual = 0;
      books.forEach((book, index) => {
        // A volume that has left for its section is not on the shelf any more,
        // and the section pass overwrites every property this chain would set.
        // Skipping it matters beyond the wasted work: pointer movement inside a
        // volume wakes the scene, so without this the shelf's damped chain keeps
        // writing the resting tilt into the same properties the flight is
        // easing, and the two settle on a blend instead of the cover pose.
        if (book.layout.sectionWeight > 0) return;
        const isHoldSubject = index === activeHoldIndex;
        const activelyHeld = holdGesture?.index === index;
        const interactive = !reducedMotion.matches && (
          index === hoverIndex
          || index === focusIndex
          || activelyHeld
        );
        const holdTarget = (
          activelyHeld && holdGesture.moved
        ) || (
          isHoldSubject && returningPresentation
        );
        book.hover = damp(book.hover, interactive ? 1 : 0, interactive ? 9.2 : 6.8, interactionDeltaSeconds);
        book.hold = damp(
          book.hold,
          holdTarget ? 1 : 0,
          activelyHeld || returningPresentation ? 15 : 6.5,
          interactionDeltaSeconds
        );
        const keepReleasePose = isHoldSubject && returningPresentation;
        book.holdRotationX = damp(
          book.holdRotationX,
          activelyHeld || keepReleasePose ? book.holdTargetRotationX : 0,
          activelyHeld ? 14.5 : 7.5,
          interactionDeltaSeconds
        );
        book.holdRotationY = damp(
          book.holdRotationY,
          activelyHeld || keepReleasePose ? book.holdTargetRotationY : 0,
          activelyHeld ? 14.5 : 7.5,
          interactionDeltaSeconds
        );
        const entryLinear = reducedMotion.matches
          ? 1
          : clamp(
            (now - entryStart - ENTRY_DELAY - index * ENTRY_STAGGER) / ENTRY_DURATION,
            0,
            1
          );
        const entry = reducedMotion.matches ? 1 : spring(entryLinear);
        const entryOpacity = reducedMotion.matches
          ? 1
          : smooth(clamp(entryLinear / 0.72, 0, 1));
        if (entryLinear < 1) allEntriesSettled = false;
        const visible = book.layout.visible;
        const targetX = book.layout.x + book.hold * 5;
        const stackEvictionY = isHoldSubject
          ? 0
          : stackEvictionOffset(index, activeHoldIndex) * holdIsolation;
        const targetY = book.layout.y
          - (1 - entry) * 28
          - book.hold * 10
          + stackEvictionY;
        const hoverDepth = camera.position.z * (1 - 1 / HOVER_PROJECTED_SCALE);
        const holdDepth = camera.position.z * (1 - 1 / HOLD_PROJECTED_SCALE);
        const entryDepth = -camera.position.z * 0.012 * (1 - smooth(entryLinear));
        const targetDepth = entryDepth + mix(book.hover * hoverDepth, holdDepth, book.hold);
        const holdRotationX = isHoldSubject ? book.holdRotationX * book.hold : 0;
        const holdRotationY = isHoldSubject ? book.holdRotationY * book.hold : 0;
        const isolatedOpacity = isHoldSubject
          ? 1
          : 1 - smooth(clamp((holdIsolation - 0.72) / 0.28, 0, 1));
        book.root.position.x = damp(book.root.position.x, targetX, 11.5, interactionDeltaSeconds);
        book.root.position.y = damp(book.root.position.y, targetY, 11.5, interactionDeltaSeconds);
        book.root.position.z = mix(
          book.root.position.z,
          targetDepth,
          // §8: the spine's z eases at a fixed .1 per frame, frame-normalized.
          1 - Math.pow(1 - SPINE_Z_EASE, frameSteps)
        );
        book.root.scale.setScalar(damp(book.root.scale.x, 1, 11, interactionDeltaSeconds));
        // Safety net for the same leak: on the shelf the object is always
        // unsqueezed, so any route pose left on x unwinds instead of sticking.
        book.object.scale.x = damp(book.object.scale.x, 1, 11, interactionDeltaSeconds);
        if (!entryControlsReady) {
          entryResidual = Math.max(
            entryResidual,
            Math.abs(book.root.position.y - targetY),
            Math.abs(book.root.position.z - targetDepth)
          );
        }
        book.root.rotation.y = damp(
          book.root.rotation.y,
          (book.config.pose.restYaw || 0) + holdRotationY,
          13,
          interactionDeltaSeconds
        );
        book.root.rotation.z = damp(
          book.root.rotation.z,
          (book.config.pose.restRoll || 0)
            - holdRotationY * 0.038
            + (1 - entry) * (index % 2 ? -0.008 : 0.008),
          13,
          interactionDeltaSeconds
        );
        book.object.rotation.x = damp(
          book.object.rotation.x,
          book.dimensions.tilt + scrollVelocity * (1 - book.hold) + holdRotationX,
          13,
          interactionDeltaSeconds
        );
        setMaterialOpacity(
          book,
          visible
            ? entryOpacity * isolatedOpacity * terminalSceneOpacity
            : 0
        );
      });
      entrySettled = allEntriesSettled;
      // The ceiling keeps a pointer that arrives mid-entry — hover retargets a
      // book and holds the residual open — from stranding the rail offscreen.
      const entryParked = entryResidual <= ENTRY_SETTLE_EPSILON
        || now - entryStart > ENTRY_SETTLE_TIMEOUT;
      if (entrySettled && entryParked && !entryControlsReady) {
        entryControlsReady = true;
        document.documentElement.classList.add("press-entry-complete");
      }
    }

    // A book that belongs to a section is placed, not damped: its target is the
    // figure rect, which moves with the scroll, so damping toward it would leave
    // the volume trailing behind its own hero. Placing it means it simply rides
    // the section the way the reference's books do.
    //
    // This runs after the pose chain and outside `homeMotionActive` on purpose.
    // That gate only stays open for `wakeScene`'s window after an input; a scene
    // driven from scroll position must not depend on it, or the books stop
    // following the moment the window closes.
    {
      // …except for the one volume that was just picked. The reference does not
      // cut to the cover pose: its universal ease resets to 0 on activation and
      // ramps back to its ceiling, so the book leaves the shelf slowly and
      // arrives quickly, settling in roughly 600ms. Only the picked volume flies,
      // and only until it lands — after that it is placed again, so scrolling
      // still tracks its section exactly.
      // A thrown cover keeps turning and slows down. Folded into `base` as it
      // goes, so wherever it stops is where the pointer-follow resumes from.
      if (cover.twirlX || cover.twirlY) {
        const decay = Math.pow(COVER_TWIRL_DECAY, clamp(deltaSeconds * 60, 0.25, 4));
        cover.x += cover.twirlX;
        cover.y += cover.twirlY;
        cover.baseX = cover.x;
        cover.baseY = cover.y;
        cover.twirlX *= decay;
        cover.twirlY *= decay;
        if (Math.abs(cover.twirlX) + Math.abs(cover.twirlY) < 0.001) {
          cover.twirlX = 0;
          cover.twirlY = 0;
        } else {
          wakeScene(120);
        }
      }

      const flyingIndex = flight ? flight.index : -1;
      if (flight) {
        const frames = clamp(deltaSeconds * 60, 0.25, 4);
        flight.speed = Math.min(
          FLIGHT_EASE_CEILING,
          flight.speed + FLIGHT_EASE_STEP * frames
        );
        flight.approach = 1 - Math.pow(1 - flight.speed, frames);
      }
      books.forEach((book) => {
        if (book.layout.sectionWeight <= 0) return;
        // What the pointer has put into the live volume, on top of the pose the
        // layout pass computed.
        const turnY = book.layout.live ? cover.y : 0;
        const turnX = book.layout.live ? cover.x : 0;
        const targetRotationY = book.layout.rotationY + turnY;
        const targetObjectRotationX = book.layout.objectRotationX + turnX;
        if (book.index === flyingIndex) {
          const t = flight.approach;
          book.root.position.x += (book.layout.x - book.root.position.x) * t;
          book.root.position.y += (book.layout.y - book.root.position.y) * t;
          book.root.position.z += (0 - book.root.position.z) * t;
          const scale = book.root.scale.x + (book.layout.scale - book.root.scale.x) * t;
          book.root.scale.setScalar(scale);
          book.root.rotation.x += (0 - book.root.rotation.x) * t;
          book.root.rotation.y += (targetRotationY - book.root.rotation.y) * t;
          book.root.rotation.z += (book.layout.rotationZ - book.root.rotation.z) * t;
          book.object.rotation.x
            += (targetObjectRotationX - book.object.rotation.x) * t;
          book.object.scale.x
            += (book.layout.objectScaleX - book.object.scale.x) * t;
          if (
            Math.abs(book.layout.x - book.root.position.x) < 0.6
            && Math.abs(book.layout.y - book.root.position.y) < 0.6
            && Math.abs(book.layout.scale - book.root.scale.x) < 0.004
            && Math.abs(targetObjectRotationX - book.object.rotation.x) < 0.004
          ) {
            flight = null;
          }
        } else {
          book.root.scale.setScalar(book.layout.scale);
          book.root.rotation.set(0, targetRotationY, book.layout.rotationZ);
          book.object.rotation.x = targetObjectRotationX;
          book.object.scale.x = book.layout.objectScaleX;
          // The section book turns around one fixed point: its geometric
          // centre. Drag changes only yaw and pitch, never the book's route
          // position, so the interaction has a stable central pivot.
          book.root.position.set(book.layout.x, book.layout.y, 0);
        }
        setMaterialOpacity(
          book,
          book.layout.visible ? terminalSceneOpacity : 0
        );
      });
    }

    if (!holdingBook && holdIsolation < 0.002 && holdPresentation < 0.002) {
      returningHoldIndex = -1;
      holdReleasedAt = 0;
      holdWasDragged = false;
    }

    // §7: the reference pauses its render loop 1200ms after the last movement.
    // The pause is only safe where the drawing buffer is preserved — an
    // unpreserved buffer is not guaranteed to survive compositing, so compact
    // layouts (preserveDrawingBuffer: false, as the reference on small
    // screens) keep presenting instead. Any input wakes the scene through
    // renderUntil, and requestAnimationFrame is suspended in backgrounded
    // tabs, so this still yields naturally when the document is hidden.
    const idlePaused = preserveDrawingBuffer
      && entrySettled
      && !holdGesture
      && returningHoldIndex < 0
      && !flight
      && !cover.twirlX
      && !cover.twirlY
      && now > renderUntil + IDLE_PAUSE_AFTER;
    if (document.visibilityState !== "hidden" && !idlePaused) {
      drawFrame();
      presentedFrames += 1;
    }
    renderedFrames += 1;
    // A deep link lands on its section. Waiting for a drawn frame keeps the
    // offset honest: the sections are only at their final heights once `main`
    // has been sized from the volumes.
    if (pendingDeepLinkScroll >= 0 && renderedFrames >= 3) {
      const section = volumeSections[pendingDeepLinkScroll];
      pendingDeepLinkScroll = -1;
      if (section) {
        window.scrollTo({
          top: section.getBoundingClientRect().top + window.scrollY,
          behavior: "instant"
        });
      }
    }
    if (!idlePaused) scheduleRender();
  }

  const rendererDebug = () => {
    const textures = new Map();
    books.forEach((book) => book.materials.forEach((material) => {
      Object.values(material).forEach((value) => {
        if (value?.isTexture) textures.set(value.uuid, value);
      });
    }));
    const textureSurfaces = [...textures.values()].map((texture) => {
      const image = texture.image;
      const width = Number(image?.naturalWidth || image?.videoWidth || image?.width || 0);
      const height = Number(image?.naturalHeight || image?.videoHeight || image?.height || 0);
      const baseBytes = width * height * 4;
      return {
        width,
        height,
        mipmaps: Boolean(texture.generateMipmaps),
        estimatedBytes: Math.round(baseBytes * (texture.generateMipmaps ? 4 / 3 : 1))
      };
    });
    const now = performance.now();
    const idlePaused = preserveDrawingBuffer
      && entrySettled
      && !holdGesture
      && returningHoldIndex < 0
      && !flight
      && !cover.twirlX
      && !cover.twirlY
      && now > renderUntil + IDLE_PAUSE_AFTER;
    return {
      animationFrames: renderedFrames,
      presentedFrames,
      idlePaused,
      preserveDrawingBuffer,
      memory: { ...renderer.info.memory },
      render: { ...renderer.info.render },
      programs: renderer.info.programs?.length || 0,
      textureSurfaces,
      estimatedTextureBytes: textureSurfaces.reduce(
        (total, texture) => total + texture.estimatedBytes,
        0
      )
    };
  };

  if (debugEnabled) window.__pressDebug = () => ({
    frame: frameDebug,
    mode: pressMode,
    currentIndex,
    live: books.map((b) => Boolean(b.layout.live)),
    scroll: {
      y: window.scrollY,
      docHeight: document.documentElement.scrollHeight,
      stackShift,
      currentScrollStep,
      mainHeight: main.getBoundingClientRect().height,
      volumesHeight: volumes ? volumes.offsetHeight : 0,
      terminalProgress,
      terminalSceneOpacity,
      cameraY: camera.position.y
    },
    sections: volumeSections.map((section) => ({
      slug: section.dataset.pressSlug,
      top: Math.round(section.getBoundingClientRect().top),
      figure: (() => {
        const rect = section.querySelector(".press-volume-figure")?.getBoundingClientRect();
        return rect ? { top: Math.round(rect.top), left: Math.round(rect.left), w: Math.round(rect.width), h: Math.round(rect.height) } : null;
      })()
    })),
    books: books.map((book) => ({
      index: book.index,
      visible: book.layout.visible,
      sectionWeight: Number(book.layout.sectionWeight.toFixed(3)),
      layoutScale: Number(book.layout.scale.toFixed(3)),
      layout: {
        x: Number(book.layout.x.toFixed(1)),
        y: Number(book.layout.y.toFixed(1)),
        height: Number(book.layout.height.toFixed(1))
      },
      target: (() => {
        const rect = book.layoutTarget.getBoundingClientRect();
        return { top: Math.round(rect.top), left: Math.round(rect.left), h: Math.round(rect.height) };
      })(),
      position: {
        x: Number(book.root.position.x.toFixed(1)),
        y: Number(book.root.position.y.toFixed(1)),
        z: Number(book.root.position.z.toFixed(1))
      },
      scale: Number(book.root.scale.x.toFixed(3)),
      rotationY: Number(book.root.rotation.y.toFixed(4)),
      objectRotationX: Number(book.object.rotation.x.toFixed(4)),
      opacity: Number((book.opacity ?? -1).toFixed(3))
    })),
    cover: {
      x: Number(cover.x.toFixed(4)),
      y: Number(cover.y.toFixed(4)),
      dragging: cover.dragging,
      twirl: Number((Math.abs(cover.twirlX) + Math.abs(cover.twirlY)).toFixed(4))
    },
    renderer: rendererDebug()
  });

  resize(true);
  // Not `0`: a deep link has already named the volume it opened on, and this
  // used to overwrite it — which left the rail marking the wrong volume and, once
  // the pose went live, left the pointer turning a book the reader cannot see.
  setCurrentIndex(deepLinkIndex >= 0 ? deepLinkIndex : 0);
  renderer.render(scene, camera);
  document.documentElement.classList.add("press-scene-ready");
  scheduleRender();
  return true;
};

let mounted = false;

export const mountVolumeCatalogue = () => {
  if (mounted) return true;
  mounted = true;
  try {
    return boot();
  } catch (error) {
    console.error("Press scene failed to initialize.", error);
    loadClassicFallback();
    return false;
  }
};
