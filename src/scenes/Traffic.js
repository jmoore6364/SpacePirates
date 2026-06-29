// Flying city traffic: small craft cruising in straight lanes at various heights,
// wrapping around the city bounds. Reuses the ship GLB models (consistent low-poly
// look) when loaded, else a procedural craft. Update(dt) each frame; cheap.
import { THREE } from '../renderer/Renderer.js';
import { shipModel } from '../entities/Models.js';

const HULLS = ['interceptor', 'corsair', 'gunship', 'freighter'];

export class Traffic {
  constructor(scene, { count = 16, bounds = 200 } = {}) {
    this.scene = scene;
    this.bounds = bounds;
    this.vehicles = [];
    for (let i = 0; i < count; i++) this._spawn(i);
  }

  _spawn(i) {
    const ship = shipModel(HULLS[i % HULLS.length]); // returns the Object3D, or null
    let obj;
    if (ship) { obj = ship; obj.scale.multiplyScalar(0.55); }
    else obj = makeCraft();

    // alternate lane axis + direction so traffic crisscrosses
    const horiz = i % 2 === 0;
    const sign = i % 4 < 2 ? 1 : -1;
    const dir = horiz ? new THREE.Vector3(sign, 0, 0) : new THREE.Vector3(0, 0, sign);
    const y = 16 + ((i * 9) % 44);                 // staggered cruise heights
    const off = ((i * 61) % (this.bounds * 2)) - this.bounds; // lane offset
    const along = (((i * 37) % (this.bounds * 2)) - this.bounds);
    obj.position.set(horiz ? along : off, y, horiz ? off : along);
    obj.lookAt(obj.position.clone().add(dir)); // ship models fly -Z forward
    obj.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    this.scene.add(obj);
    this.vehicles.push({ obj, dir, speed: 16 + (i % 5) * 6, y, bob: i * 0.7 });
  }

  update(dt) {
    const b = this.bounds;
    for (const v of this.vehicles) {
      const p = v.obj.position;
      p.addScaledVector(v.dir, v.speed * dt);
      if (p.x > b) p.x = -b; else if (p.x < -b) p.x = b;   // wrap around the city
      if (p.z > b) p.z = -b; else if (p.z < -b) p.z = b;
      v.bob += dt;
      p.y = v.y + Math.sin(v.bob) * 0.5;
    }
  }

  dispose() {
    // model clones share cached geometry/materials — just detach
    for (const v of this.vehicles) this.scene.remove(v.obj);
    this.vehicles = [];
  }
}

// Procedural fallback craft (used only if the ship models haven't loaded). -Z forward.
function makeCraft() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.6, 2.4, 6), new THREE.MeshStandardMaterial({ color: 0x8aa0c0, roughness: 0.5, metalness: 0.6 }));
  body.rotation.x = -Math.PI / 2; // tip toward -Z
  g.add(body);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), new THREE.MeshBasicMaterial({ color: 0x66e0ff }));
  glow.position.z = 1.3; // tail glow
  g.add(glow);
  return g;
}
