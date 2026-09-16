import { Color } from 'three';

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const degToRad = (d) => (d * Math.PI) / 180;

/** Map progress into a segment's local 0..1 range, clamped. */
export function segmentProgress(progress, [start, end]) {
  return clamp((progress - start) / (end - start), 0, 1);
}

/** Hex string → THREE.Color in linear space (shader-ready). */
export function linearColor(hex) {
  return new Color(hex).convertSRGBToLinear();
}
