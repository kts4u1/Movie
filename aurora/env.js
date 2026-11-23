// Night environment: painted sky (moon, clouds, stars, aurora), layered mountains, dark earth,
// and a wind-swept pampas field of instanced grass blades and plumes.
import * as THREE from 'three';
import { LIGHTS } from './shaders.js';

const NOISE = /* glsl */ `
float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.-2.*f); return mix(mix(h12(i), h12(i+vec2(1,0)), u.x), mix(h12(i+vec2(0,1)), h12(i+vec2(1,1)), u.x), u.y); }
float fbm(vec2 p){ float v = 0., a = .5; mat2 r = mat2(1.6,1.2,-1.2,1.6); for(int i=0;i<5;i++){ v += a*vn(p); p = r*p; a *= .5; } return v; }
`;

export function buildEnv(scene) {
  const env = {};
  // ---- sky
  const skyU = { uTime: { value: 0 }, uMoonDir: { value: new THREE.Vector3(-0.3, 0.32, -1).normalize() }, uMoonSize: { value: 0.035 }, uMoonK: { value: 1 }, uAurora: { value: 0 }, uFlash: { value: 0 } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 48, 24), new THREE.ShaderMaterial({
    uniforms: skyU, side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 vD; void main(){ vD = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
    fragmentShader: /* glsl */ `
      uniform float uTime, uMoonSize, uMoonK, uAurora, uFlash; uniform vec3 uMoonDir; varying vec3 vD;
      ${NOISE}
      void main(){
        vec3 d = normalize(vD); float h = d.y;
        vec3 col = mix(vec3(0.07, 0.09, 0.16), vec3(0.006, 0.008, 0.02), smoothstep(-0.02, 0.6, h));
        col = mix(col, vec3(0.13, 0.15, 0.24), exp(-max(h, 0.0) * 14.0) * 0.8);
        // stars
        vec2 sp = d.xz / (h + 0.6) * 180.0; float st = step(0.9965, h12(floor(sp))) * smoothstep(0.05, 0.3, h);
        col += vec3(0.8, 0.85, 1.0) * st * (0.4 + 0.6 * h12(floor(sp) + 3.0));
        // moon + halo
        float md = dot(d, uMoonDir), ang = acos(clamp(md, -1.0, 1.0));
        float disc = smoothstep(uMoonSize, uMoonSize - 0.0015, ang);
        vec2 mp = (d - uMoonDir * md).xy / uMoonSize;
        float crat = fbm(mp * 3.0 + 4.0);
        vec3 moon = uMoonK * vec3(1.0, 0.98, 0.92) * (1.6 + 0.6 * crat) * (1.0 - 0.35 * smoothstep(0.4, 0.75, crat));
        col += uMoonK * vec3(0.55, 0.62, 0.9) * (exp(-ang * 9.0 * 0.035 / uMoonSize) * 0.35 + exp(-ang * 40.0 * 0.035 / uMoonSize) * 0.5);
        // clouds lit from the moon side
        vec2 cp = d.xz / (max(h, 0.02) + 0.25) * 1.4 + vec2(uTime * 0.02, 0.0);
        float c = fbm(cp * 1.1), c2 = fbm(cp * 2.7 + 9.0);
        float cl = smoothstep(0.45, 0.85, c * 0.7 + c2 * 0.4) * smoothstep(0.0, 0.25, h);
        vec3 ccol = mix(vec3(0.03, 0.035, 0.06), vec3(0.32, 0.36, 0.5), pow(max(md, 0.0), 6.0) * (0.4 + c2));
        col = mix(col + moon * disc, ccol, cl * (1.0 - disc * 0.3));
        col = mix(col, col + moon * disc * 0.6, disc);
        // aurora curtains
        if (uAurora > 0.001) {
          float az = atan(d.x, -d.z);
          float band = exp(-pow((h - 0.28 - 0.06 * sin(az * 3.0 + uTime * 0.4)) * 7.0, 2.0));
          float rays = 0.5 + 0.5 * sin(az * 90.0 + sin(az * 7.0 + uTime) * 4.0);
          vec3 ac = mix(vec3(0.15, 1.0, 0.75), vec3(0.6, 0.35, 1.0), smoothstep(0.25, 0.45, h));
          col += ac * band * (0.35 + 0.65 * rays) * uAurora * 0.55 * smoothstep(0.05, 0.2, h);
        }
        col += vec3(0.3, 0.33, 0.45) * uFlash;
        gl_FragColor = vec4(col, 1.0);
      }`,
  }));
  sky.frustumCulled = false; sky.renderOrder = -10;
  scene.add(sky);
  env.sky = sky; env.skyU = skyU; env.moonDir0 = skyU.uMoonDir.value.clone();
  // ---- mountains
  const ridge = (R, minH, maxH, col, seed) => {
    const n = 220, pos = [], idx = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const k = Math.sin(a * 3 + seed) * 0.5 + Math.sin(a * 7.3 + seed * 2) * 0.3 + Math.sin(a * 17 + seed * 3) * 0.12 + Math.sin(a * 41 + seed) * 0.05;
      const hgt = minH + (maxH - minH) * (0.5 + 0.5 * k);
      pos.push(Math.cos(a) * R, -2, Math.sin(a) * R, Math.cos(a) * R, hgt, Math.sin(a) * R);
      if (i < n) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide, fog: false }));
    m.frustumCulled = false; scene.add(m); return m;
  };
  ridge(160, 8, 34, new THREE.Color(0.055, 0.068, 0.11), 1.3);
  ridge(110, 4, 18, new THREE.Color(0.038, 0.047, 0.08), 4.1);
  ridge(75, 1.5, 8, new THREE.Color(0.026, 0.032, 0.055), 7.7);
  // ---- ground
  const groundU = { uFogCol: { value: LIGHTS.fogCol }, uFogDen: { value: LIGHTS.fogDen } };
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
    uniforms: groundU,
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform vec3 uFogCol; uniform float uFogDen; varying vec3 vW; ${NOISE}
      void main(){ float n = fbm(vW.xz * 0.6) * 0.6 + fbm(vW.xz * 4.0) * 0.4; vec3 c = mix(vec3(0.02, 0.025, 0.04), vec3(0.05, 0.06, 0.09), n);
        float path = exp(-vW.z * vW.z * 0.25); c = mix(c, vec3(0.06, 0.065, 0.09), path * 0.5 * n);
        float d = length(cameraPosition - vW); float fog = 1.0 - exp(-pow(d * uFogDen, 2.0)); gl_FragColor = vec4(mix(c, uFogCol, fog), 1.0); }`,
  }));
  scene.add(ground);
  // ---- grass field (instanced blades) and pampas plumes
  const grassU = { uTime: { value: 0 }, uGust: { value: 0 }, uWaveX: { value: -100 }, uWaveK: { value: 0 }, uFogCol: { value: LIGHTS.fogCol }, uFogDen: { value: LIGHTS.fogDen }, uKeyDir: { value: LIGHTS.keyDir }, uRimCol: { value: LIGHTS.rimCol }, uPushX: { value: -100 }, uPushK: { value: 0 } };
  const blade = new THREE.BufferGeometry();
  { const pos = [], idx = [], seg = 4; for (let i = 0; i <= seg; i++) { const u = i / seg, w = 0.022 * (1 - u * 0.92); pos.push(-w, u, 0, w, u, 0); if (i < seg) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2); } blade.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); blade.setIndex(idx); }
  const plume = new THREE.BufferGeometry();
  { const pos = [], idx = [], seg = 5; for (let i = 0; i <= seg; i++) { const u = i / seg, w = 0.022 * Math.sin(Math.PI * Math.min(u * 1.1, 1)) + 0.003; pos.push(-w, 1 + u * 0.3, 0, w, 1 + u * 0.3, 0); if (i < seg) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2); }
    for (let i = 0; i <= 4; i++) { const u = i / 4, w = 0.006 * (1 - u * 0.5); pos.push(-w, u, 0, w, u, 0); } const b = (seg + 1) * 2; for (let i = 0; i < 4; i++) idx.push(b + i * 2, b + i * 2 + 1, b + i * 2 + 2, b + i * 2 + 1, b + i * 2 + 3, b + i * 2 + 2);
    plume.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); plume.setIndex(idx); }
  const grassVS = /* glsl */ `
    attribute vec4 aOff; attribute vec2 aSz;
    uniform float uTime, uGust, uWaveX, uWaveK, uPushX, uPushK;
    varying float vU; varying vec3 vW; varying float vShade;
    void main(){
      vec3 p = position; float u = clamp(p.y, 0.0, 1.3); vU = u;
      float c = cos(aOff.w), s = sin(aOff.w);
      p.xz = mat2(c, -s, s, c) * vec2(p.x * aSz.y, p.z);
      p.y *= aSz.x;
      vec3 w = vec3(aOff.x, 0.0, aOff.z) + p;
      float sway = sin(uTime * 1.7 + aOff.x * 0.55 + aOff.z * 0.4) * 0.08 + sin(uTime * 3.1 + aOff.x * 1.7) * 0.03;
      sway += uGust * (0.25 + 0.2 * sin(uTime * 5.0 - aOff.x * 0.9));
      sway += uWaveK * exp(-pow(aOff.x - uWaveX, 2.0) / 3.0);
      float push = uPushK * exp(-pow(length(aOff.xz - vec2(uPushX, 0.0)) - 0.0, 2.0) / 4.0);
      w.x += (sway + push) * u * u * aSz.x;
      w.y -= abs(sway + push) * u * u * aSz.x * 0.25;
      vW = w; vShade = aOff.y;
      gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
    }`;
  const grassFS = (tip, rim) => /* glsl */ `
    uniform vec3 uFogCol, uRimCol; uniform float uFogDen; varying float vU; varying vec3 vW; varying float vShade;
    void main(){
      vec3 c = mix(vec3(0.012, 0.016, 0.03), ${tip}, smoothstep(0.0, 1.0, vU)) * (0.7 + 0.6 * vShade);
      c += uRimCol * ${rim} * smoothstep(0.55, 1.0, vU) * (0.5 + vShade);
      float d = length(cameraPosition - vW); float fog = 1.0 - exp(-pow(d * uFogDen, 2.0));
      gl_FragColor = vec4(mix(c, uFogCol, fog), 1.0);
    }`;
  const makeField = (geo, count, place, tip, rim) => {
    const ig = new THREE.InstancedBufferGeometry().copy(geo);
    const off = new Float32Array(count * 4), sz = new Float32Array(count * 2);
    let s = 1234;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < count; i++) { const p = place(rnd); off.set([p[0], rnd(), p[1], rnd() * Math.PI * 2], i * 4); sz.set([p[2], 0.7 + rnd() * 0.8], i * 2); }
    ig.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4)); ig.setAttribute('aSz', new THREE.InstancedBufferAttribute(sz, 2));
    ig.instanceCount = count;
    const m = new THREE.Mesh(ig, new THREE.ShaderMaterial({ uniforms: grassU, vertexShader: grassVS, fragmentShader: grassFS(tip, rim), side: THREE.DoubleSide }));
    m.frustumCulled = false; scene.add(m); return m;
  };
  // trampled clearing along the fight line, tall grass to the sides and in the foreground
  const place = (rnd) => {
    const x = (rnd() * 2 - 1) * 26, z = -26 + rnd() * 29;
    const clear = Math.exp(-z * z / 5);
    const h = (0.35 + rnd() * 0.7) * (1 - 0.86 * clear);
    return [x, z, h];
  };
  env.grass = makeField(blade, 38000, place, 'vec3(0.045, 0.055, 0.085)', '0.05');
  env.plumes = makeField(plume, 2200, (rnd) => { let p; do { p = place(rnd); } while (Math.abs(p[1]) < 2.6 && rnd() < 0.98); return [p[0], p[1], 0.8 + rnd() * 0.5]; }, 'vec3(0.13, 0.14, 0.19)', '0.16');
  env.grassU = grassU;
  env.update = (t, o = {}) => {
    skyU.uTime.value = t; skyU.uAurora.value = o.aurora || 0; skyU.uFlash.value = o.flash || 0;
    skyU.uMoonDir.value.copy(o.moonDir || env.moonDir0);
    skyU.uMoonSize.value = o.moonSize || 0.035; skyU.uMoonK.value = o.moonK ?? 1;
    grassU.uTime.value = t; grassU.uGust.value = o.gust || 0;
    grassU.uWaveX.value = o.waveX ?? -100; grassU.uWaveK.value = o.waveK || 0;
    grassU.uPushX.value = o.pushX ?? -100; grassU.uPushK.value = o.pushK || 0;
  };
  return env;
}
