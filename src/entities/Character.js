// On-foot 3rd-person character: a low-poly figure + a camera-relative walk
// controller with simple AABB collision against city buildings and a walk bob.
import { THREE } from '../renderer/Renderer.js';
import { clamp, lerp, wrapAngle } from '../util/math.js';

export class Character {
  constructor() {
    this.object = buildFigure();
    this.heading = Math.PI;        // facing -Z initially
    this.speed = 16;               // units/s
    this.radius = 1.2;             // collision radius
    this._bob = 0;
    this._vel = new THREE.Vector3();
    this.moving = false;
    this.groundSampler = null; // (x,z) => terrain height; set by the scene
  }

  get position() { return this.object.position; }

  // move dir is built from input in camera space (forward/right unit vectors on ground).
  update(dt, { forward = 0, strafe = 0 }, camYaw = 0, colliders = []) {
    const dir = new THREE.Vector3();
    if (forward || strafe) {
      // camera-space basis on the ground plane (camera sits behind at camYaw)
      const cf = new THREE.Vector3(Math.sin(camYaw), 0, Math.cos(camYaw));
      const cr = new THREE.Vector3(Math.cos(camYaw), 0, -Math.sin(camYaw));
      dir.addScaledVector(cf, forward).addScaledVector(cr, strafe);
      if (dir.lengthSq() > 0) dir.normalize();
    }
    this.moving = dir.lengthSq() > 0;

    if (this.moving) {
      const targetHeading = Math.atan2(dir.x, dir.z);
      // ease heading toward movement direction
      this.heading += wrapAngle(targetHeading - this.heading) * clamp(dt * 10, 0, 1);
      this.object.rotation.y = this.heading;

      const next = this.position.clone().addScaledVector(dir, this.speed * dt);
      this._resolveCollision(next, colliders);
      this.position.x = next.x;
      this.position.z = next.z;

      this._bob += dt * 10;
    } else {
      this._bob = lerp(this._bob, 0, clamp(dt * 8, 0, 1));
    }

    // follow the terrain with a little walk bob on top
    const groundY = this.groundSampler ? this.groundSampler(this.position.x, this.position.z) : 0;
    this.position.y = groundY + Math.abs(Math.sin(this._bob)) * 0.25;
  }

  _resolveCollision(next, colliders) {
    const r = this.radius;
    for (const c of colliders) {
      if (
        next.x > c.min.x - r && next.x < c.max.x + r &&
        next.z > c.min.z - r && next.z < c.max.z + r
      ) {
        // push out along the smaller penetration axis (XZ only)
        const penX = Math.min(next.x - (c.min.x - r), (c.max.x + r) - next.x);
        const penZ = Math.min(next.z - (c.min.z - r), (c.max.z + r) - next.z);
        if (penX < penZ) {
          next.x = next.x < (c.min.x + c.max.x) / 2 ? c.min.x - r : c.max.x + r;
        } else {
          next.z = next.z < (c.min.z + c.max.z) / 2 ? c.min.z - r : c.max.z + r;
        }
      }
    }
    // stay within the city footprint
    next.x = clamp(next.x, -190, 190);
    next.z = clamp(next.z, -190, 190);
  }
}

function buildFigure() {
  const g = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color: 0x3a4660, roughness: 0.6, metalness: 0.3 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xff5db1, roughness: 0.5, metalness: 0.3, emissive: 0x2a0820, emissiveIntensity: 1 });
  const visor = new THREE.MeshStandardMaterial({ color: 0x66e0ff, emissive: 0x1b6f8a, emissiveIntensity: 1, roughness: 0.2, metalness: 0.8 });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.7, 1.4, 6, 12), suit);
  torso.position.y = 1.7;
  g.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 14), suit);
  head.position.y = 2.9;
  g.add(head);

  const face = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 10, 0, Math.PI), visor);
  face.position.set(0, 2.9, 0.28);
  face.rotation.x = Math.PI / 2;
  g.add(face);

  // shoulder pads / pack accent
  const pack = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, 0.5), accent);
  pack.position.set(0, 1.9, -0.55);
  g.add(pack);

  // legs
  for (const sx of [-0.35, 0.35]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.9, 4, 8), suit);
    leg.position.set(sx, 0.7, 0);
    g.add(leg);
  }

  return g;
}
