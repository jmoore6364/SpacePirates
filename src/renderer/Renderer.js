// Thin Three.js boundary. ALL direct Three.js usage for rendering lives here
// (or in scene modules that import THREE through here). Game logic stays
// renderer-agnostic so a custom WebGL engine can implement this same surface
// later — see docs/ENGINE-ROADMAP.md.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

export { THREE };

export class Renderer {
  constructor(container) {
    this.container = container;

    this.three = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.three.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.three.setSize(container.clientWidth, container.clientHeight);
    this.three.setClearColor(0x05060d, 1);
    this.three.shadowMap.enabled = true;
    this.three.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.three.domElement);

    this.camera = new THREE.PerspectiveCamera(
      60,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.1,
      20000,
    );
    this.camera.position.set(0, 0, 8);

    this.scene = null;
    this.shake = 0;
    this._shakeOff = new THREE.Vector3();

    // bloom postprocessing for the neon look
    this.bloomEnabled = true;
    this.composer = new EffectComposer(this.three);
    this.renderPass = new RenderPass(new THREE.Scene(), this.camera);
    this.composer.addPass(this.renderPass);
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(container.clientWidth, container.clientHeight),
      0.85, // strength
      0.6,  // radius
      0.2,  // threshold
    );
    this.composer.addPass(this.bloomPass);
    this.composer.setSize(container.clientWidth, container.clientHeight);

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
  }

  setScene(scene) {
    this.scene = scene;
    this.renderPass.scene = scene;
  }

  setBloom(on) { this.bloomEnabled = !!on; }

  // 'low' | 'med' | 'high' — trades pixel ratio + bloom strength for performance
  setQuality(level) {
    const cap = level === 'low' ? 0.75 : level === 'med' ? 1 : 2;
    this.three.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
    this.bloomPass.strength = level === 'low' ? 0.45 : level === 'med' ? 0.65 : 0.85;
    this.resize();
  }

  addShake(amount) { this.shake = Math.min(this.shake + amount, 3); }

  resize() {
    const w = this.container.clientWidth;
    const h = Math.max(1, this.container.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.three.setSize(w, h);
    this.composer.setSize(w, h);
  }

  render() {
    if (!this.scene) return;

    // apply transient screen shake, render, then restore so gameplay code owns
    // the camera transform.
    let applied = false;
    if (this.shake > 0.001) {
      this._shakeOff.set(
        (Math.random() - 0.5) * this.shake,
        (Math.random() - 0.5) * this.shake,
        (Math.random() - 0.5) * this.shake * 0.5,
      );
      this.camera.position.add(this._shakeOff);
      this.shake *= 0.86;
      applied = true;
    } else {
      this.shake = 0;
    }

    if (this.bloomEnabled) this.composer.render();
    else this.three.render(this.scene, this.camera);

    if (applied) this.camera.position.sub(this._shakeOff);
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this.composer.dispose?.();
    this.three.dispose();
    if (this.three.domElement.parentNode) {
      this.three.domElement.parentNode.removeChild(this.three.domElement);
    }
  }
}
