// Thin Three.js boundary. ALL direct Three.js usage for rendering lives here
// (or in scene modules that import THREE through here). Game logic stays
// renderer-agnostic so a custom WebGL engine can implement this same surface
// later — see docs/ENGINE-ROADMAP.md.
import * as THREE from 'three';

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
    container.appendChild(this.three.domElement);

    this.camera = new THREE.PerspectiveCamera(
      60,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.1,
      20000,
    );
    this.camera.position.set(0, 0, 8);

    this.scene = null;

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
  }

  setScene(scene) {
    this.scene = scene;
  }

  resize() {
    const w = this.container.clientWidth;
    const h = Math.max(1, this.container.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.three.setSize(w, h);
  }

  render() {
    if (this.scene) this.three.render(this.scene, this.camera);
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this.three.dispose();
    if (this.three.domElement.parentNode) {
      this.three.domElement.parentNode.removeChild(this.three.domElement);
    }
  }
}
