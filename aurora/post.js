// Post: HDR bloom, ACES tone map, then a film pass (grade, vignette, grain, aberration) that also
// carries the shot-level tricks: impact-frame inversion, duotone freeze, the screen cut, flashes.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const Film = {
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1920, 804) },
    uInvert: { value: 0 }, uTone: { value: new THREE.Color(1, 1, 1) }, uToneK: { value: 0 },
    uFlash: { value: 0 }, uFlashCol: { value: new THREE.Color(1, 1, 1) }, uFade: { value: 0 },
    uCutP: { value: new THREE.Vector2(0.5, 0.5) }, uCutD: { value: new THREE.Vector2(1, 0) }, uCutOff: { value: 0 }, uCutGlow: { value: 0 },
    uCA: { value: 0.0015 }, uGrain: { value: 0.05 }, uSat: { value: 0.92 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime, uInvert, uToneK, uFlash, uFade, uCutOff, uCutGlow, uCA, uGrain, uSat;
    uniform vec2 uRes, uCutP, uCutD; uniform vec3 uTone, uFlashCol; varying vec2 vUv;
    float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    void main(){
      vec2 uv = vUv;
      vec2 asp = vec2(uRes.x / uRes.y, 1.0);
      vec2 q = (uv - uCutP) * asp; float side = sign(uCutD.x * q.y - uCutD.y * q.x);
      uv -= uCutD / asp * uCutOff * side;
      vec2 c = uv - 0.5; float r2 = dot(c, c);
      vec2 off = c * uCA * (1.0 + r2 * 3.0);
      vec3 col = vec3(texture2D(tDiffuse, uv + off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - off).b);
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSat);
      col = mix(col, col * vec3(0.94, 0.98, 1.06), smoothstep(0.5, 0.0, l));
      col = (col - 0.5) * 1.06 + 0.5;
      col *= 1.0 - smoothstep(0.35, 1.0, length(c * vec2(1.25, 1.0))) * 0.55;
      vec3 tone = uTone * (0.15 + 1.25 * pow(l, 0.8));
      col = mix(col, tone, uToneK);
      vec3 inv = mix(vec3(0.97, 0.96, 0.94), vec3(0.02, 0.02, 0.035), smoothstep(0.08, 0.16, l));
      col = mix(col, inv, uInvert);
      float dl = abs(uCutD.x * q.y - uCutD.y * q.x);
      col += vec3(0.75, 1.0, 0.98) * uCutGlow * (exp(-dl * 900.0) + 0.35 * exp(-dl * 120.0));
      col += uFlashCol * uFlash;
      col += (hash(vUv * uRes + fract(uTime * 7.3) * 917.0) - 0.5) * uGrain * (1.0 - l * 0.5);
      col *= 1.0 - uFade;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
};

export function buildPost(renderer, scene, camera, W, H) {
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(1); composer.setSize(W, H);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.55, 0.4, 0.92);
  bloom.materialHighPassFilter.fragmentShader = bloom.materialHighPassFilter.fragmentShader.replace('vec4 texel = texture2D( tDiffuse, vUv );', 'vec4 texel = min( texture2D( tDiffuse, vUv ), vec4( 4.0 ) );');
  bloom.materialHighPassFilter.needsUpdate = true;
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const film = new ShaderPass(Film);
  film.uniforms.uRes.value.set(W, H);
  composer.addPass(film);
  return { composer, bloom, film: film.uniforms };
}
