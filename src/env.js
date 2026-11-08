// Environment: stormy night sky, wet stone arena, ruins, torii gate, lights.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { RNG, clamp, lerp, smoothstep, fbmTile, fbm2, noise2 } from './util.js';

export const MOON_DIR = new THREE.Vector3(-0.35, 0.42, -1).normalize();
export const FOG_COLOR = new THREE.Color(0x0c121c);

// ---------------------------------------------------------------- sky
const NOISE_GLSL = /* glsl */ `
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.-2.*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y); }
float fbm(vec2 p){ float v = 0., a = .5; mat2 r = mat2(1.6,1.2,-1.2,1.6); for(int i=0;i<6;i++){ v += a*vnoise(p); p = r*p; a *= .5; } return v; }
`;

function makeSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTime: { value: 0 },
      uFlash: { value: 0 },
      uFlashDir: { value: new THREE.Vector3(0.3, 0.5, -1).normalize() },
      uMoonDir: { value: MOON_DIR.clone() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uFlash; uniform vec3 uMoonDir, uFlashDir;
      varying vec3 vDir;
      ${NOISE_GLSL}
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 zen = vec3(0.004, 0.007, 0.018);
        vec3 hor = vec3(0.035, 0.055, 0.09);
        vec3 col = mix(hor, zen, smoothstep(0.0, 0.55, h));
        col = mix(col, vec3(0.012,0.016,0.026), smoothstep(0.02, -0.25, h));
        float md = max(dot(d, uMoonDir), 0.0);
        vec3 moonCol = vec3(0.72, 0.84, 1.0);
        float halo = pow(md, 900.0) * 1.2 + pow(md, 60.0) * 0.35 + pow(md, 8.0) * 0.08;
        // clouds on a curved plane
        vec2 uv = d.xz / (max(h, 0.0) + 0.18) * 1.2;
        uv += vec2(uTime * 0.035, uTime * 0.01);
        float c = fbm(uv * 1.3);
        float c2 = fbm(uv * 3.1 + 7.0);
        float cl = smoothstep(0.38, 0.78, c * 0.75 + c2 * 0.35) * smoothstep(-0.02, 0.2, h);
        // moon disc with craters
        float disc = smoothstep(0.99935, 0.99955, md);
        float crater = fbm(d.xy * 400.0);
        vec3 moon = moonCol * (3.5 + crater * 1.5) * disc;
        col += moonCol * halo * 0.9;
        col += moon * (1.0 - cl * 0.85);
        // clouds lit by moon and lightning
        float fd = max(dot(d, uFlashDir), 0.0);
        vec3 cloudCol = vec3(0.028, 0.034, 0.05) + moonCol * (pow(md, 12.0) * 0.5) * (0.4 + c2);
        cloudCol += vec3(0.55, 0.62, 1.0) * uFlash * (0.18 + 1.1 * pow(fd, 8.0)) * (0.4 + c);
        col = mix(col, cloudCol, cl * 0.9);
        col += vec3(0.4, 0.45, 0.8) * uFlash * 0.08 * (1.0 - cl);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}

// ---------------------------------------------------------------- textures
function makeStoneTextures(size = 1024) {
  const rng = new RNG(1234);
  const rows = 8;
  // per row: cut points in [0,1)
  const rowCuts = [];
  for (let r = 0; r < rows; r++) {
    const cuts = [];
    let x = rng.range(0, 0.2);
    while (x < 1 + rng.range(0, 0.1)) {
      cuts.push(x % 1);
      x += rng.range(0.11, 0.26);
    }
    cuts.sort((a, b) => a - b);
    rowCuts.push(cuts);
  }
  const H = new Float32Array(size * size);
  const stoneId = new Float32Array(size * size);
  const bevel = 0.012;
  for (let y = 0; y < size; y++) {
    const v = y / size;
    const rf = v * rows, r = Math.floor(rf), lv = rf - r;
    const cuts = rowCuts[r];
    const dv = Math.min(lv, 1 - lv) / rows;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      // find nearest cuts around u (wrapping)
      let left = -1, right = 2, idx = 0;
      for (let i = 0; i < cuts.length; i++) {
        const c = cuts[i];
        for (const cc of [c - 1, c, c + 1]) {
          if (cc <= u && cc > left) { left = cc; idx = i; }
          if (cc > u && cc < right) right = cc;
        }
      }
      const du = Math.min(u - left, right - u);
      const ed = Math.min(du, dv);
      const sid = r * 37 + idx * 13;
      const sr = Math.sin(sid * 91.7) * 43758.5;
      const srand = sr - Math.floor(sr);
      const detail = fbmTile(u * 16, v * 16, 16, 4);
      const crack = Math.abs(fbmTile(u * 6 + srand * 3, v * 6, 6, 4) - 0.5);
      let h = smoothstep(0, bevel, ed) * (0.75 + srand * 0.25) + detail * 0.12;
      h -= smoothstep(0.03, 0.0, crack) * 0.25 * smoothstep(0, bevel, ed);
      H[y * size + x] = h;
      stoneId[y * size + x] = srand;
    }
  }
  const col = new Uint8Array(size * size * 4);
  const nrm = new Uint8Array(size * size * 4);
  const rgh = new Uint8Array(size * size * 4);
  const at = (x, y) => H[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x, o = i * 4;
      const u = x / size, v = y / size;
      const h = H[i];
      const s = stoneId[i];
      const n = fbmTile(u * 32, v * 32, 32, 3);
      const big = fbmTile(u * 4, v * 4, 4, 4);
      // puddles: low frequency mask
      const pud = smoothstep(0.5, 0.62, fbmTile(u * 3 + 11, v * 3 + 5, 3, 4));
      const gap = 1 - smoothstep(0.15, 0.5, h);
      let br = (0.55 + s * 0.35) * (0.75 + n * 0.5) * (0.8 + big * 0.4);
      br *= lerp(1, 0.35, gap);
      br *= lerp(1, 0.6, pud);
      const tint = 0.9 + s * 0.15;
      col[o] = clamp(br * 70 * tint, 0, 255);
      col[o + 1] = clamp(br * 74, 0, 255);
      col[o + 2] = clamp(br * 82 / tint, 0, 255);
      col[o + 3] = 255;
      const dx = (at(x - 1, y) - at(x + 1, y)) * 6;
      const dy = (at(x, y - 1) - at(x, y + 1)) * 6;
      const L = Math.hypot(dx, dy, 1);
      nrm[o] = (dx / L * 0.5 + 0.5) * 255;
      nrm[o + 1] = (dy / L * 0.5 + 0.5) * 255;
      nrm[o + 2] = (1 / L * 0.5 + 0.5) * 255;
      nrm[o + 3] = 255;
      const rough = lerp(lerp(0.5 + n * 0.35, 0.92, gap), 0.08, pud);
      rgh[o] = pud * 255; // R: puddle mask (read by the reflection overlay)
      rgh[o + 1] = rough * 255; // G: roughness
      rgh[o + 2] = 0;
      rgh[o + 3] = 255;
    }
  }
  const mk = (data, srgb) => {
    const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  };
  return { map: mk(col, true), normalMap: mk(nrm, false), roughnessMap: mk(rgh, false) };
}

function makeCircleTexture(size = 2048) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, size, size);
  const rng = new RNG(77);
  g.translate(size / 2, size / 2);
  g.strokeStyle = '#fff';
  g.fillStyle = '#fff';
  const R = size / 2 - 8;
  const ring = (r, w) => { g.lineWidth = w; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); };
  ring(R * 0.99, 6);
  ring(R * 0.955, 2.5);
  ring(R * 0.80, 4);
  ring(R * 0.77, 2);
  ring(R * 0.42, 3);
  ring(R * 0.38, 1.5);
  // glyph band
  g.lineWidth = 3;
  const n = 64;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    g.save();
    g.rotate(a);
    g.translate(0, -R * 0.875);
    const k = rng.int(2, 4);
    g.beginPath();
    for (let j = 0; j < k; j++) {
      const x0 = rng.range(-18, 18), y0 = rng.range(-34, 34);
      const x1 = rng.range(-18, 18), y1 = rng.range(-34, 34);
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
    }
    g.stroke();
    g.restore();
  }
  // ticks
  for (let i = 0; i < 180; i++) {
    const a = (i / 180) * Math.PI * 2;
    const l = i % 5 === 0 ? 30 : 12;
    g.lineWidth = i % 5 === 0 ? 3 : 1.5;
    g.beginPath();
    g.moveTo(Math.cos(a) * R * 0.955, Math.sin(a) * R * 0.955);
    g.lineTo(Math.cos(a) * (R * 0.955 - l), Math.sin(a) * (R * 0.955 - l));
    g.stroke();
  }
  // two interlocked heptagrams
  const star = (r, k, step, rot) => {
    g.beginPath();
    for (let i = 0; i <= k; i++) {
      const a = rot + ((i * step) % k) / k * Math.PI * 2;
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  };
  g.lineWidth = 3.5;
  star(R * 0.77, 7, 3, 0);
  g.lineWidth = 2;
  star(R * 0.77, 7, 2, Math.PI / 7);
  // inner tomoe-ish arcs
  g.lineWidth = 5;
  for (let i = 0; i < 3; i++) {
    g.save();
    g.rotate((i / 3) * Math.PI * 2);
    g.beginPath();
    g.arc(R * 0.2, 0, R * 0.18, Math.PI * 0.2, Math.PI * 1.25);
    g.stroke();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = 8;
  return t;
}

// ---------------------------------------------------------------- props
function displace(geo, amt, freq, seed) {
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = fbm2(v.x * freq + seed, v.y * freq + v.z * freq * 0.7 + seed * 2.1, 4) - 0.5;
    const len = v.length();
    v.multiplyScalar(1 + (n * amt) / Math.max(len, 0.001));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

function jitterCylinder(geo, rng, amt, topBreak) {
  const p = geo.attributes.position;
  const params = geo.parameters;
  const topY = params.height / 2;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(z, x);
    const n = noise2(a * 3 + y * 0.8, y * 1.7) - 0.5;
    const s = 1 + n * amt;
    x *= s;
    z *= s;
    if (topBreak && y > topY - 0.01) {
      y -= topBreak * (0.5 + 0.5 * Math.sin(a * 2 + rng.range(0, 0.6))) * (0.6 + noise2(a * 5, 3.3) * 0.8);
    }
    p.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  return geo;
}

function makeTorii(mat) {
  const g = new THREE.Group();
  const H = 8.5, span = 3.4;
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, H, 20), mat);
    post.position.set(sx * span, H / 2, 0);
    post.rotation.z = -sx * 0.03;
    post.castShadow = true;
    g.add(post);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.6, 20), new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.8 }));
    base.position.set(sx * span, 0.3, 0);
    g.add(base);
  }
  const bent = (len, h, d, curve) => {
    const geo = new THREE.BoxGeometry(len, h, d, 40, 1, 1);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const k = (x / (len / 2)) ** 2;
      p.setY(i, p.getY(i) + k * k * curve);
    }
    geo.computeVertexNormals();
    return geo;
  };
  const kasagi = new THREE.Mesh(bent(span * 2 + 3.2, 0.42, 0.75, 0.55), new THREE.MeshStandardMaterial({ color: 0x0b0b0d, roughness: 0.5, metalness: 0.2 }));
  kasagi.position.set(0, H + 0.35, 0);
  g.add(kasagi);
  const shimaki = new THREE.Mesh(bent(span * 2 + 2.6, 0.36, 0.6, 0.35), mat);
  shimaki.position.set(0, H - 0.05, 0);
  g.add(shimaki);
  const nuki = new THREE.Mesh(new THREE.BoxGeometry(span * 2 + 1.4, 0.32, 0.36), mat);
  nuki.position.set(0, H - 1.6, 0);
  g.add(nuki);
  const gakuzuka = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.3, 0.3), mat);
  gakuzuka.position.set(0, H - 0.85, 0);
  g.add(gakuzuka);
  return g;
}

function makeLantern(stone, rng) {
  const g = new THREE.Group();
  const add = (geo, y, m = stone) => {
    const me = new THREE.Mesh(geo, m);
    me.position.y = y;
    me.castShadow = true;
    me.receiveShadow = true;
    g.add(me);
    return me;
  };
  add(new THREE.CylinderGeometry(0.42, 0.5, 0.25, 6), 0.125);
  add(new THREE.CylinderGeometry(0.14, 0.18, 1.0, 10), 0.75);
  add(new THREE.CylinderGeometry(0.36, 0.3, 0.16, 6), 1.33);
  add(new THREE.BoxGeometry(0.42, 0.42, 0.42), 1.62);
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.42, 0.12).multiplyScalar(2.2), fog: true });
  const win = add(new THREE.BoxGeometry(0.44, 0.24, 0.24), 1.62, glow);
  win.castShadow = false;
  const win2 = add(new THREE.BoxGeometry(0.24, 0.24, 0.44), 1.62, glow);
  win2.castShadow = false;
  add(new THREE.ConeGeometry(0.62, 0.42, 6), 2.0);
  add(new THREE.SphereGeometry(0.1, 10, 8), 2.28);
  g.userData.flameOffset = new THREE.Vector3(0, 1.62, 0);
  return g;
}

function makeMountains(radius, minH, maxH, color, seed) {
  const n = 256;
  const pos = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const h = lerp(minH, maxH, Math.pow(fbm2(Math.cos(a) * 3 + seed, Math.sin(a) * 3 + seed, 5), 1.6) * 1.6);
    const x = Math.cos(a) * radius, z = Math.sin(a) * radius;
    pos.push(x, -10, z, x, h, z);
    if (i < n) {
      const k = i * 2;
      idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, fog: false, side: THREE.DoubleSide }));
  m.renderOrder = -5;
  return m;
}

// ---------------------------------------------------------------- main builder
export function buildEnvironment(scene, renderer, W, H) {
  const env = { update: null };
  scene.fog = new THREE.FogExp2(FOG_COLOR, 0.032);
  scene.background = new THREE.Color(0x000000);

  // ----- image based lighting (custom dark environment with colored panels)
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSphere = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `varying vec3 vP; void main(){ vec3 d = normalize(vP); vec3 c = mix(vec3(0.01,0.012,0.02), vec3(0.05,0.07,0.12), smoothstep(-0.2,0.6,d.y)); gl_FragColor = vec4(c,1.); }`,
  }));
  envScene.add(envSphere);
  const panel = (color, pos, sx, sy) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(sx, sy), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    m.position.copy(pos);
    m.lookAt(0, 0, 0);
    envScene.add(m);
  };
  panel(new THREE.Color(0.7, 0.8, 1.0).multiplyScalar(3.0), MOON_DIR.clone().multiplyScalar(8), 3.5, 3.5);
  panel(new THREE.Color(0.2, 0.6, 1.0).multiplyScalar(1.2), new THREE.Vector3(-8, 1.5, 3), 6, 2.5);
  panel(new THREE.Color(1.0, 0.35, 0.08).multiplyScalar(1.4), new THREE.Vector3(8, 1.0, 2), 6, 2.5);
  panel(new THREE.Color(0.35, 0.4, 0.6).multiplyScalar(0.8), new THREE.Vector3(0, 9, 0), 10, 10);
  panel(new THREE.Color(0.6, 0.65, 0.8).multiplyScalar(0.6), new THREE.Vector3(0, 2, 9), 12, 3);
  const envRT = pmrem.fromScene(envScene, 0.02);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.9;

  // ----- sky + mountains
  const sky = makeSky();
  scene.add(sky);
  scene.add(makeMountains(170, 6, 34, 0x0a0f18, 3.1));
  scene.add(makeMountains(120, 3, 20, 0x070a10, 9.7));

  // ----- ground
  const tex = makeStoneTextures(1024);
  const rep = 26;
  for (const t of [tex.map, tex.normalMap, tex.roughnessMap]) t.repeat.set(rep, rep);
  const groundMat = new THREE.MeshStandardMaterial({
    map: tex.map,
    normalMap: tex.normalMap,
    normalScale: new THREE.Vector2(1.2, 1.2),
    roughnessMap: tex.roughnessMap,
    roughness: 1.0,
    metalness: 0.0,
    envMapIntensity: 0.6,
  });
  const groundGeo = new THREE.PlaneGeometry(110, 110, 1, 1);
  groundGeo.rotateX(-Math.PI / 2);
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.receiveShadow = true;
  scene.add(ground);

  // ----- wet reflection overlay (additive)
  const reflGeo = new THREE.PlaneGeometry(110, 110);
  const reflector = new Reflector(reflGeo, {
    textureWidth: Math.floor(W * 0.5),
    textureHeight: Math.floor(H * 0.5),
    clipBias: 0.003,
    multisample: 0,
    shader: {
      name: 'WetReflection',
      uniforms: {
        color: { value: null },
        tDiffuse: { value: null },
        textureMatrix: { value: null },
        tMask: { value: tex.roughnessMap },
        tNormal: { value: tex.normalMap },
        uRep: { value: rep },
        uStrength: { value: 0.5 },
      },
      vertexShader: /* glsl */ `
        uniform mat4 textureMatrix; varying vec4 vUvP; varying vec2 vUv; varying vec3 vWorld;
        void main(){ vUvP = textureMatrix * vec4(position, 1.0); vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse, tMask, tNormal; uniform float uRep, uStrength;
        varying vec4 vUvP; varying vec2 vUv; varying vec3 vWorld;
        void main(){
          vec2 tuv = vUv * uRep;
          float pud = texture2D(tMask, tuv).r;
          vec2 n = texture2D(tNormal, tuv).xy * 2.0 - 1.0;
          vec4 p = vUvP;
          float rough = mix(1.0, 0.25, pud);
          p.xy += n * 0.05 * rough * p.w;
          vec3 c = vec3(0.0);
          vec2 o = vec2(0.004, 0.0) * p.w * rough;
          c += texture2DProj(tDiffuse, p).rgb * 0.4;
          c += texture2DProj(tDiffuse, p + vec4(o, 0, 0)).rgb * 0.15;
          c += texture2DProj(tDiffuse, p - vec4(o, 0, 0)).rgb * 0.15;
          c += texture2DProj(tDiffuse, p + vec4(o.yx * 2.0, 0, 0)).rgb * 0.15;
          c += texture2DProj(tDiffuse, p - vec4(o.yx * 2.0, 0, 0)).rgb * 0.15;
          vec3 V = normalize(cameraPosition - vWorld);
          float fres = 0.05 + 0.95 * pow(1.0 - clamp(V.y, 0.0, 1.0), 5.0);
          float wet = mix(0.22, 1.0, pud);
          float fade = 1.0 - smoothstep(18.0, 40.0, length(vWorld.xz));
          gl_FragColor = vec4(c * fres * wet * uStrength * fade, 1.0);
        }`,
    },
  });
  reflector.rotation.x = -Math.PI / 2;
  reflector.position.y = 0.004;
  reflector.material.transparent = true;
  reflector.material.blending = THREE.AdditiveBlending;
  reflector.material.depthWrite = false;
  reflector.renderOrder = 1;
  scene.add(reflector);
  env.reflector = reflector;

  // ----- magic circle (cyan on the west half, ember on the east half)
  const circleTex = makeCircleTexture(2048);
  const circleMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { tMap: { value: circleTex }, uGlow: { value: 0.35 }, uTime: { value: 0 }, uPulse: { value: 0 }, uPulseR: { value: 0 } },
    vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vW = (modelMatrix*vec4(position,1.)).xyz; gl_Position = projectionMatrix*viewMatrix*vec4(vW,1.); }',
    fragmentShader: /* glsl */ `
      uniform sampler2D tMap; uniform float uGlow, uTime, uPulse, uPulseR; varying vec2 vUv; varying vec3 vW;
      void main(){
        float m = texture2D(tMap, vUv).r;
        vec3 cy = vec3(0.25, 0.85, 1.0), or = vec3(1.0, 0.38, 0.08);
        float side = smoothstep(-1.5, 1.5, vW.x);
        vec3 c = mix(cy, or, side);
        float r = length(vW.xz);
        float wave = exp(-pow((r - uPulseR) * 1.2, 2.0)) * uPulse;
        float flick = 0.85 + 0.15 * sin(uTime * 3.0 + r * 2.0);
        gl_FragColor = vec4(c * m * (uGlow * flick + wave * 6.0), 1.0);
      }`,
  });
  const circle = new THREE.Mesh(new THREE.PlaneGeometry(15, 15), circleMat);
  circle.rotation.x = -Math.PI / 2;
  circle.position.y = 0.006;
  circle.renderOrder = 2;
  scene.add(circle);
  env.circle = circle;

  // ----- stone material for ruins
  const stoneTex = tex.map.clone();
  stoneTex.repeat.set(1.5, 1.5);
  stoneTex.needsUpdate = true;
  const stoneN = tex.normalMap.clone();
  stoneN.repeat.set(1.5, 1.5);
  stoneN.needsUpdate = true;
  const stoneMat = new THREE.MeshStandardMaterial({ map: stoneTex, normalMap: stoneN, color: 0x9aa0a8, roughness: 0.85, metalness: 0.0 });
  const rng = new RNG(99);

  // ----- pillars
  const pillarCount = 12;
  for (let i = 0; i < pillarCount; i++) {
    const a = (i / pillarCount) * Math.PI * 2 + 0.13;
    const R = 12.5 + rng.range(-0.4, 0.6);
    const broken = rng.next() < 0.55;
    const h = broken ? rng.range(2.2, 5.5) : rng.range(6.5, 7.5);
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(jitterCylinder(new THREE.CylinderGeometry(0.55, 0.62, h, 20, 10), rng, 0.12, broken ? 0.6 : 0), stoneMat);
    shaft.position.y = h / 2 + 0.3;
    shaft.castShadow = shaft.receiveShadow = true;
    g.add(shaft);
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 1.6), stoneMat);
    plinth.position.y = 0.3;
    plinth.receiveShadow = plinth.castShadow = true;
    g.add(plinth);
    if (!broken) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.45, 1.5), stoneMat);
      cap.position.y = h + 0.5;
      cap.castShadow = true;
      g.add(cap);
    }
    // faint rune band
    if (rng.next() < 0.6) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.63, 0.63, 0.08, 24, 1, true),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 0.75, 1.0).multiplyScalar(1.6) }));
      band.position.y = Math.min(h - 0.4, 1.6 + rng.range(0, 1));
      g.add(band);
    }
    g.position.set(Math.cos(a) * R, 0, Math.sin(a) * R);
    g.rotation.set(rng.range(-0.04, 0.04), rng.range(0, 6), rng.range(-0.04, 0.04));
    scene.add(g);
    if (broken && rng.next() < 0.7) {
      const fl = new THREE.Mesh(jitterCylinder(new THREE.CylinderGeometry(0.5, 0.55, rng.range(1.5, 3), 16, 6), rng, 0.15, 0.3), stoneMat);
      fl.rotation.z = Math.PI / 2;
      fl.rotation.y = rng.range(0, Math.PI);
      fl.position.set(Math.cos(a + 0.12) * (R + 1.5), 0.45, Math.sin(a + 0.12) * (R + 1.5));
      fl.castShadow = fl.receiveShadow = true;
      scene.add(fl);
    }
  }
  // rubble
  for (let i = 0; i < 40; i++) {
    const a = rng.range(0, Math.PI * 2), R = rng.range(9.5, 16);
    const s = rng.range(0.15, 0.6);
    const rock = new THREE.Mesh(displace(new THREE.IcosahedronGeometry(s, 1), s * 0.5, 2.5, i), stoneMat);
    rock.position.set(Math.cos(a) * R, s * 0.4, Math.sin(a) * R);
    rock.rotation.set(rng.range(0, 6), rng.range(0, 6), rng.range(0, 6));
    rock.castShadow = rock.receiveShadow = true;
    scene.add(rock);
  }

  // ----- torii gate (background, behind the moon line)
  const lacquer = new THREE.MeshStandardMaterial({ color: 0x6a1410, roughness: 0.45, metalness: 0.1 });
  const torii = makeTorii(lacquer);
  torii.position.set(-1.0, 0, -21);
  torii.rotation.y = 0.05;
  scene.add(torii);
  const torii2 = makeTorii(lacquer);
  torii2.position.set(2.0, 0, 24);
  torii2.rotation.y = Math.PI + 0.1;
  torii2.scale.setScalar(0.85);
  scene.add(torii2);

  // ----- stone lanterns
  env.lanterns = [];
  const lanternPos = [[-9.5, -6], [9.5, -6.5], [-10, 6.5], [10.2, 6.2], [-4.2, -13.5], [3.8, -13.8]];
  for (const [x, z] of lanternPos) {
    const l = makeLantern(stoneMat, rng);
    l.position.set(x, 0, z);
    l.rotation.y = rng.range(0, 1);
    scene.add(l);
    env.lanterns.push(l.position.clone().add(l.userData.flameOffset));
  }

  // ----- floating rocks
  const floaters = [];
  const crystalMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 0.8, 1.0).multiplyScalar(3) });
  for (let i = 0; i < 16; i++) {
    const a = rng.range(0, Math.PI * 2), R = rng.range(9, 22);
    const s = rng.range(0.35, 1.3);
    const geo = displace(new THREE.IcosahedronGeometry(s, 2), s * 0.6, 1.4, i * 3.3);
    geo.scale(1, 0.7, 1);
    const rock = new THREE.Mesh(geo, stoneMat);
    rock.castShadow = true;
    if (rng.next() < 0.5) {
      const cr = new THREE.Mesh(new THREE.OctahedronGeometry(s * 0.3, 0), crystalMat);
      cr.position.set(0, -s * 0.6, 0);
      cr.scale.set(0.5, 1.6, 0.5);
      rock.add(cr);
    }
    const base = new THREE.Vector3(Math.cos(a) * R, rng.range(3.5, 11), Math.sin(a) * R);
    rock.position.copy(base);
    scene.add(rock);
    floaters.push({ mesh: rock, base, ph: rng.range(0, 6), sp: rng.range(0.2, 0.5), rot: new THREE.Vector3(rng.range(-0.2, 0.2), rng.range(-0.3, 0.3), rng.range(-0.2, 0.2)) });
  }

  // ----- lights
  const moon = new THREE.DirectionalLight(0xa8bcff, 1.25);
  moon.position.copy(MOON_DIR).multiplyScalar(30);
  moon.target.position.set(0, 0, 0);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  const sc = moon.shadow.camera;
  sc.left = -14; sc.right = 14; sc.top = 14; sc.bottom = -14; sc.near = 1; sc.far = 70;
  moon.shadow.bias = -0.0004;
  moon.shadow.normalBias = 0.03;
  moon.shadow.radius = 3;
  scene.add(moon, moon.target);
  env.moon = moon;

  const hemi = new THREE.HemisphereLight(0x33476e, 0x0c0907, 0.55);
  scene.add(hemi);
  env.hemi = hemi;

  // rim light from behind the subjects relative to the camera
  const rim = new THREE.DirectionalLight(0x7fa0ff, 2.0);
  scene.add(rim, rim.target);
  env.rim = rim;
  // soft fill from the camera side so armor shapes read in the dark
  const fill = new THREE.DirectionalLight(0x8a9cc0, 0.55);
  scene.add(fill, fill.target);
  env.fill = fill;

  env.update = (t, flash, camera) => {
    sky.material.uniforms.uTime.value = t;
    sky.material.uniforms.uFlash.value = flash;
    sky.position.copy(camera.position);
    circleMat.uniforms.uTime.value = t;
    for (const f of floaters) {
      f.mesh.position.set(f.base.x, f.base.y + Math.sin(t * f.sp + f.ph) * 0.35, f.base.z);
      f.mesh.rotation.set(f.rot.x * t, f.rot.y * t + f.ph, f.rot.z * t);
    }
    moon.intensity = 1.25 + flash * 2.0;
    hemi.intensity = 0.55 + flash * 0.8;
  };
  return env;
}
