// Shared GLSL for all underwater materials. Caustics are computed, not
// texture-based: two drifting noise fields subtracted and sharpened produce
// the characteristic bright web — the standard cheap trick that reads as
// expensive. Fog is exponential toward the near-fog color; the sky dome's
// water column uses the same palette, so surfaces dissolve into it seamlessly.

export const NOISE_CHUNK = /* glsl */ `
float uwHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float uwNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(uwHash(i), uwHash(i + vec2(1.0, 0.0)), u.x),
    mix(uwHash(i + vec2(0.0, 1.0)), uwHash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}
`;

export const FOG_CHUNK = /* glsl */ `
uniform vec3 uFogColor;
uniform float uFogDensity;
vec3 underFog(vec3 col, float dist) {
  float f = 1.0 - exp(-dist * uFogDensity);
  // FAR BLEND: an extra ramp that only engages in the far distance, so the
  // seabed's far edge and the drop-off shelf dissolve fully into the water
  // colour while the near/mid field stays crystal clear. Push this range out
  // (e.g. 260, 460) to see further; pull it in to hide far boundaries sooner.
  f = max(f, smoothstep(80.0, 190.0, dist));
  return mix(col, uFogColor, f);
}
`;

export const CAUSTIC_CHUNK = /* glsl */ `
float caustic(vec2 uv, float t) {
  float n1 = uwNoise(uv * 1.35 + vec2(t * 0.11, t * 0.07));
  float n2 = uwNoise(uv * 1.65 - vec2(t * 0.08, t * 0.12));
  return pow(clamp(1.0 - abs(n1 - n2) * 2.2, 0.0, 1.0), 6.0);
}
`;

// Seabed height, shared so the floor, the rocks, and the kelp all agree on
// where the ground is — including the drop-off shelf. terrainHeight() returns
// the height OFFSET at world-xz p; add -floorDepth for the absolute Y. Requires
// NOISE_CHUNK (uwNoise) to be injected before it. Keep this the ONLY copy of
// this math: if it drifts from what the floor uses, rocks/kelp float or sink.
export const TERRAIN_CHUNK = /* glsl */ `
uniform float uDropOffZ;
uniform float uDropOffDepth;
uniform float uDropOffWidth;
uniform float uDropOffWaver;

float terrainDunes(vec2 p) {
  return uwNoise(p * 0.018) * 3.2 + uwNoise(p * 0.07) * 0.9 + uwNoise(p * 0.22) * 0.22;
}
float terrainShelf(vec2 p) {
  float edge = uDropOffZ + uwNoise(p * 0.01) * uDropOffWaver;
  float t = smoothstep(edge, edge - uDropOffWidth, p.y);
  return -uDropOffDepth * t * t;   // t² = gentle lip, accelerating plunge
}
float terrainHeight(vec2 p) { return terrainDunes(p) + terrainShelf(p); }
`;