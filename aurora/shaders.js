// Ink-and-paint shading: hard-terminator cel lighting, moonlit rim, pen hatching in the shadows,
// coloured blade lights, depth fog, and a screen-space inverted-hull ink outline.
import * as THREE from 'three';

export const LIGHTS = {
  keyDir: new THREE.Vector3(-0.45, 0.55, -0.7).normalize(),
  keyCol: new THREE.Color(0.66, 0.74, 1.0),
  rimDir: new THREE.Vector3(-0.3, 0.35, -1).normalize(),
  rimCol: new THREE.Color(0.62, 0.72, 1.0),
  amb: new THREE.Color(0.2, 0.22, 0.33),
  fillDir: new THREE.Vector3(0.35, 0.25, 0.9).normalize(),
  fillCol: new THREE.Color(0.24, 0.28, 0.48),
  fogCol: new THREE.Color(0.075, 0.09, 0.15),
  fogDen: 0.045,
};

const VS = /* glsl */ `
  uniform mat4 uBones[17];
  uniform mat4 uModel;
  uniform float uSkinned, uOutline, uOutK;
  uniform vec2 uRes;
  attribute vec4 skinIndex;
  attribute vec4 skinWeight;
  attribute vec3 color;
  varying vec3 vCol, vN, vW;
  void main(){
    mat4 S = mat4(1.0);
    if (uSkinned > 0.5) S = uBones[int(skinIndex.x)] * skinWeight.x + uBones[int(skinIndex.y)] * skinWeight.y + uBones[int(skinIndex.z)] * skinWeight.z + uBones[int(skinIndex.w)] * skinWeight.w;
    vec4 wp = uModel * (S * vec4(position, 1.0));
    vec3 wn = normalize(mat3(uModel) * (mat3(S) * normal));
    vW = wp.xyz; vN = wn; vCol = color;
    vec4 cp = projectionMatrix * viewMatrix * wp;
    if (uOutline > 0.0) {
      vec4 cn = projectionMatrix * viewMatrix * vec4(wn, 0.0);
      vec2 d = cn.xy; float l = length(d); d = l > 1e-5 ? d / l : vec2(0.0);
      float w = uOutline * (0.75 + 0.5 * fract(sin(dot(position.xy * 37.0, vec2(12.9898, 78.233))) * 43758.5)) * uOutK;
      cp.xy += d * w / uRes * 2.0 * cp.w;
    }
    gl_Position = cp;
  }`;

const FS = /* glsl */ `
  uniform vec3 uKeyDir, uKeyCol, uRimDir, uRimCol, uAmb, uFogCol, uTint, uFillDir, uFillCol;
  uniform float uFogDen, uSil, uTwoSided, uGlow, uOutline, uHatch;
  uniform vec3 uPL1Pos, uPL1Col, uPL2Pos, uPL2Col;
  uniform float uDis, uDisY0, uDisH;
  varying vec3 vCol, vN, vW;
  vec3 pointLight(vec3 N, vec3 P, vec3 C){
    vec3 L = P - vW; float d = length(L); float k = max(dot(N, L / d), 0.0) / (1.0 + d * d * 1.6);
    return C * (smoothstep(0.03, 0.09, k) * 0.45 + k * 0.45);
  }
  void main(){
    if (uDis > 0.0) {
      float n = fract(sin(dot(floor(vW * 26.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
      float h = clamp((vW.y - uDisY0) / uDisH, 0.0, 1.0);
      float thr = 0.9 * (1.0 - h) + 0.35 * (n - 0.5) + 0.12;
      if (uDis > thr) discard;
      if (uDis > thr - 0.045) { gl_FragColor = vec4(1.8, 0.12, 0.28, 1.0); return; }
    }
    float dist = length(cameraPosition - vW);
    float fog = 1.0 - exp(-pow(dist * uFogDen, 2.0));
    if (uOutline > 0.0) { gl_FragColor = vec4(mix(vec3(0.012, 0.014, 0.03), uFogCol, fog * 0.85) * (1.0 - uSil) + uTint * uSil, 1.0); return; }
    vec3 N = normalize(vN), V = normalize(cameraPosition - vW);
    if (uTwoSided > 0.5 && dot(N, V) < 0.0) N = -N;
    vec3 base = vCol;
    float emis = step(1.01, max(max(base.r, base.g), base.b));
    float ndl = dot(N, uKeyDir);
    float lit = smoothstep(-0.02, 0.06, ndl), hi = smoothstep(0.62, 0.7, ndl);
    float fil = smoothstep(0.05, 0.25, dot(N, uFillDir));
    vec3 col = base * (uAmb + uFillCol * (0.35 + 0.45 * fil) + uKeyCol * (0.55 * lit + 0.3 * hi));
    // pen hatching inside the shadow side
    float h1 = step(0.55, fract((gl_FragCoord.x - gl_FragCoord.y) * 0.16));
    float h2 = step(0.6, fract((gl_FragCoord.x + gl_FragCoord.y) * 0.13));
    col *= 1.0 - (1.0 - lit) * uHatch * (0.16 * h1 + 0.1 * h2 * smoothstep(-0.2, -0.6, ndl));
    // moonlit rim
    float fr = 1.0 - max(dot(N, V), 0.0);
    float rim = smoothstep(0.38, 0.5, fr) * smoothstep(-0.35, 0.3, dot(N, uRimDir));
    col += uRimCol * rim * (0.25 + 0.55 * min(base * 1.6, vec3(1.0)));
    col += pointLight(N, uPL1Pos, uPL1Col) * (0.4 + base) + pointLight(N, uPL2Pos, uPL2Col) * (0.4 + base);
    col = mix(col, base * (1.0 + uGlow), emis);
    col = mix(col, uFogCol, fog);
    col = mix(col, uTint, uSil);
    gl_FragColor = vec4(col, 1.0);
  }`;

export function inkMaterial(o = {}) {
  const uniforms = {
    uBones: { value: Array.from({ length: 17 }, () => new THREE.Matrix4()) },
    uModel: { value: new THREE.Matrix4() },
    uSkinned: { value: o.skinned ? 1 : 0 }, uOutline: { value: o.outline || 0 }, uOutK: { value: 1 },
    uRes: { value: new THREE.Vector2(1920, 804) },
    uKeyDir: { value: LIGHTS.keyDir }, uKeyCol: { value: LIGHTS.keyCol }, uRimDir: { value: LIGHTS.rimDir }, uRimCol: { value: LIGHTS.rimCol },
    uAmb: { value: LIGHTS.amb }, uFillDir: { value: LIGHTS.fillDir }, uFillCol: { value: LIGHTS.fillCol }, uFogCol: { value: LIGHTS.fogCol }, uFogDen: { value: LIGHTS.fogDen },
    uTint: { value: new THREE.Color(0, 0, 0) }, uSil: { value: 0 }, uTwoSided: { value: o.twoSided ? 1 : 0 }, uGlow: { value: 0 }, uHatch: { value: 1 }, uDis: { value: 0 }, uDisY0: { value: 0 }, uDisH: { value: 2.6 },
    uPL1Pos: { value: new THREE.Vector3(0, -50, 0) }, uPL1Col: { value: new THREE.Color(0, 0, 0) },
    uPL2Pos: { value: new THREE.Vector3(0, -50, 0) }, uPL2Col: { value: new THREE.Color(0, 0, 0) },
  };
  return new THREE.ShaderMaterial({
    uniforms, vertexShader: VS, fragmentShader: FS,
    side: o.outline ? THREE.BackSide : (o.twoSided ? THREE.DoubleSide : THREE.FrontSide),
  });
}
// share light/fog uniforms across many materials
export function linkLights(mats, src) {
  for (const m of mats) for (const k of ['uFillDir', 'uFillCol', 'uKeyDir', 'uKeyCol', 'uRimDir', 'uRimCol', 'uAmb', 'uFogCol', 'uFogDen', 'uRes', 'uPL1Pos', 'uPL1Col', 'uPL2Pos', 'uPL2Col']) m.uniforms[k] = src.uniforms[k];
}
