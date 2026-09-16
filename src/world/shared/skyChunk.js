// Shared between sky.frag and ocean.frag so reflections and sky are
// guaranteed to agree. Analytic gradient sky: cheap, band-free, and easy to
// grade — a PMREM/HDRI hook can replace this later without touching callers.

export const SKY_CHUNK = /* glsl */ `
float skyHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float skyNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(skyHash(i), skyHash(i + vec2(1.0, 0.0)), u.x),
    mix(skyHash(i + vec2(0.0, 1.0)), skyHash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}
// 5-octave fbm — soft, blobby cumulus shapes rather than sharp noise grain.
float skyFbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * skyNoise(p);
    p *= 2.02;
    a *= 0.4;
  }
  return v;
}

// Stable cloud layer: a function of view DIRECTION only, no uTime term, so
// clouds never drift or scroll — they only change if you look around, same
// as real clouds appear fixed while the camera translates underneath them.
float cloudMask(vec3 dir) {
  if (dir.y <= 0.02) return 0.0;
  // Project onto a plane above the camera — keeps cloud shapes from
  // stretching/smearing near the horizon the way raw dir.xz would.
  vec2 p = dir.xz / (dir.y + 0.15);
  float n = skyFbm(p * 0.85 + 11.0);
  float coverage = smoothstep(0.05, 0.78, n);
  // Fade out near the horizon so clouds don't end in a hard line.
  float horizonFade = smoothstep(0.02, 0.22, dir.y);
  return coverage * horizonFade;
}

vec3 skyColor(vec3 dir, vec3 sunDir, vec3 zenith, vec3 horizon, vec3 sunTint) {
  float up = clamp(dir.y, 0.0, 1.0);
  // Slow horizon→zenith ramp; pow keeps the pale band sitting low like overcast light.
  vec3 col = mix(horizon, zenith, pow(up, 0.48));

  float sunDot = max(dot(dir, sunDir), 0.0);
  // Implied sun: a broad cold haze near the horizon plus a tighter core.
  float haze = pow(sunDot, 3.0) * (1.0 - up) * 0.22;
  float core = pow(sunDot, 260.0) * 0.85;
  col += sunTint * (haze + core);

  // Stable cumulus clouds, brighter on the sun-facing side.
  float clouds = cloudMask(dir);
  float cloudLight = 0.82 + 0.18 * sunDot;
  col = mix(col, vec3(1.0) * cloudLight, clouds * 0.85);

  return col;
}
`;