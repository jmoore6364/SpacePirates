// Pass 0 proof-of-render: a lit, spinning planet with an atmosphere rim,
// a sun (directional light + glowing billboard), and a starfield.
// Renderer-agnostic game code stays elsewhere; this is presentation only.
import { THREE } from '../renderer/Renderer.js';

export class PlanetScene {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x05060d, 0.0008);

    // --- lights ---
    this.scene.add(new THREE.AmbientLight(0x223044, 0.6));
    const sun = new THREE.DirectionalLight(0xfff2dd, 2.4);
    sun.position.set(-6, 3, 5);
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0x4488ff, 0.8);
    rim.position.set(6, -2, -4);
    this.scene.add(rim);

    // --- starfield ---
    this.scene.add(this._makeStars(1800, 600));

    // --- planet ---
    this.planet = new THREE.Group();
    const geo = new THREE.IcosahedronGeometry(2.4, 24);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x2e6f8e,
      roughness: 0.85,
      metalness: 0.05,
      flatShading: false,
      emissive: 0x06141c,
      emissiveIntensity: 1.0,
    });
    this._displace(geo, 0.14);
    geo.computeVertexNormals();
    const surface = new THREE.Mesh(geo, mat);
    this.planet.add(surface);

    // atmosphere rim (back-side additive shell)
    const atmoGeo = new THREE.SphereGeometry(2.62, 48, 48);
    const atmoMat = new THREE.MeshBasicMaterial({
      color: 0x55b8ff,
      transparent: true,
      opacity: 0.28,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.planet.add(new THREE.Mesh(atmoGeo, atmoMat));

    this.planet.rotation.z = 0.35;
    this.scene.add(this.planet);

    // --- sun billboard glow ---
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      color: 0xfff0c0,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    glow.scale.set(6, 6, 1);
    glow.position.copy(sun.position).multiplyScalar(6);
    this.scene.add(glow);

    this.elapsed = 0;
  }

  onEnter(renderer) {
    renderer.camera.position.set(0, 1.2, 8);
    renderer.camera.lookAt(0, 0, 0);
  }

  update(dt, renderer) {
    this.elapsed += dt;
    this.planet.rotation.y += dt * 0.25;
    // gentle camera drift so the proof-of-render reads as "alive"
    if (renderer) {
      const cam = renderer.camera;
      cam.position.x = Math.sin(this.elapsed * 0.15) * 1.4;
      cam.position.y = 1.2 + Math.sin(this.elapsed * 0.21) * 0.4;
      cam.lookAt(0, 0, 0);
    }
  }

  _displace(geo, amount) {
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n =
        Math.sin(v.x * 2.1) * Math.cos(v.y * 1.7) +
        Math.sin(v.z * 2.9 + 1.3) * 0.5;
      const scale = 1 + (n * 0.5) * (amount / 2.4);
      v.multiplyScalar(scale);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    pos.needsUpdate = true;
  }

  _makeStars(count, radius) {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      // uniform on a sphere shell
      const u = Math.random() * 2 - 1;
      const t = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const d = radius * (0.6 + Math.random() * 0.4);
      positions[i * 3] = Math.cos(t) * r * d;
      positions[i * 3 + 1] = u * d;
      positions[i * 3 + 2] = Math.sin(t) * r * d;
      c.setHSL(0.55 + Math.random() * 0.1, 0.5, 0.6 + Math.random() * 0.4);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const m = new THREE.PointsMaterial({
      size: 1.6,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    return new THREE.Points(g, m);
  }

  dispose() {
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => m.dispose());
      }
    });
  }
}
