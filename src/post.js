// Post-processing: HDR bloom, anamorphic streaks, tone mapping, grading, lens effects.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// Horizontal light streaks from very bright pixels (cinema-lens look).
class StreakPass extends Pass {
  constructor(w, h) {
    super();
    this.needsSwap = false;
    const opts = { type: THREE.HalfFloatType, depthBuffer: false };
    this.sw = Math.floor(w / 4);
    this.sh = Math.floor(h / 4);
    this.rtA = new THREE.WebGLRenderTarget(this.sw, this.sh, opts);
    this.rtB = new THREE.WebGLRenderTarget(this.sw, this.sh, opts);
    this.strength = 0.35;
    this.brightMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uThresh: { value: 3.5 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
      fragmentShader: `uniform sampler2D tDiffuse; uniform float uThresh; varying vec2 vUv;
        void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb; float l = max(c.r, max(c.g, c.b));
        gl_FragColor = vec4(c * smoothstep(uThresh, uThresh * 2.5, l), 1.); }`,
    });
    this.blurMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uStep: { value: 1 }, uTexel: { value: 1 / this.sw } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
      fragmentShader: `uniform sampler2D tDiffuse; uniform float uStep, uTexel; varying vec2 vUv;
        void main(){ vec3 s = vec3(0.); float wsum = 0.;
          for (int i = -6; i <= 6; i++) { float fi = float(i); float w = exp(-fi*fi/18.);
            s += texture2D(tDiffuse, vUv + vec2(fi * uStep * uTexel, 0.)).rgb * w; wsum += w; }
          gl_FragColor = vec4(s / wsum, 1.); }`,
    });
    this.addMat = new THREE.ShaderMaterial({
      uniforms: { tStreak: { value: null }, uStrength: { value: 1 }, uTint: { value: new THREE.Color(0.55, 0.75, 1.0) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
      fragmentShader: `uniform sampler2D tStreak; uniform float uStrength; uniform vec3 uTint; varying vec2 vUv;
        void main(){ vec3 s = texture2D(tStreak, vUv).rgb; float l = dot(s, vec3(0.333));
          gl_FragColor = vec4(mix(s, uTint * l, 0.6) * uStrength, 1.); }`,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });
    this.quad = new FullScreenQuad(null);
  }
  render(renderer, writeBuffer, readBuffer) {
    this.quad.material = this.brightMat;
    this.brightMat.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.rtA);
    this.quad.render(renderer);
    let src = this.rtA, dst = this.rtB;
    this.quad.material = this.blurMat;
    for (const step of [1, 3, 9]) {
      this.blurMat.uniforms.tDiffuse.value = src.texture;
      this.blurMat.uniforms.uStep.value = step;
      renderer.setRenderTarget(dst);
      this.quad.render(renderer);
      [src, dst] = [dst, src];
    }
    this.quad.material = this.addMat;
    this.addMat.uniforms.tStreak.value = src.texture;
    this.addMat.uniforms.uStrength.value = this.strength;
    const ac = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(readBuffer);
    this.quad.render(renderer);
    renderer.autoClear = ac;
  }
}

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1920, 816) },
    uCA: { value: 0 },
    uFlash: { value: 0 },
    uFlashCol: { value: new THREE.Color(1, 1, 1) },
    uFade: { value: 0 },
    uInvert: { value: 0 },
    uGrain: { value: 0.045 },
    uShake: { value: new THREE.Vector2(0, 0) },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime, uCA, uFlash, uFade, uInvert, uGrain; uniform vec2 uRes, uShake; uniform vec3 uFlashCol;
    varying vec2 vUv;
    float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    void main(){
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float r2 = dot(c, c);
      vec2 off = c * (0.004 + uCA) * (0.4 + r2 * 2.5);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + off).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - off).b;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, 1.15);
      col += vec3(-0.012, 0.004, 0.02) * (1.0 - smoothstep(0.0, 0.45, l));
      col += vec3(0.03, 0.012, -0.015) * smoothstep(0.5, 1.0, l);
      col = (col - 0.5) * 1.05 + 0.5;
      col *= 1.0 - smoothstep(0.38, 1.0, length(c * vec2(1.35, 1.0))) * 0.6;
      // anime-style impact frame
      vec3 inv = mix(vec3(0.02, 0.01, 0.04), vec3(1.0, 0.97, 0.92), 1.0 - smoothstep(0.2, 0.26, l));
      col = mix(col, inv, uInvert);
      col += uFlashCol * uFlash;
      float g = hash(uv * uRes + fract(uTime * 7.31) * 913.0) - 0.5;
      col += g * uGrain * (1.0 - l * 0.6);
      col *= 1.0 - uFade;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
};

export function buildPost(renderer, scene, camera, W, H) {
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(1);
  composer.setSize(W, H);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.5, 0.12, 1.0);
  // clamp what feeds the bloom so dense additive particle clusters don't flood the frame
  bloom.materialHighPassFilter.fragmentShader = bloom.materialHighPassFilter.fragmentShader.replace('vec4 texel = texture2D( tDiffuse, vUv );', 'vec4 texel = min( texture2D( tDiffuse, vUv ), vec4( 4.0 ) );');
  bloom.materialHighPassFilter.needsUpdate = true;
  composer.addPass(bloom);
  const streak = new StreakPass(W, H);
  composer.addPass(streak);
  const output = new OutputPass();
  composer.addPass(output);
  const final = new ShaderPass(FinalShader);
  final.uniforms.uRes.value.set(W, H);
  composer.addPass(final);
  return { composer, bloom, streak, final, renderPass };
}
