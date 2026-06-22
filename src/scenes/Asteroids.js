// A drifting asteroid belt around a world (The Maw — the asteroid stronghold).
// Low-poly faceted rocks that spin and drift slowly; the scene tests the ship
// against them for collision damage + a bounce. Renderer touches stay local here.
import { THREE } from '../renderer/Renderer.js';

export class Asteroids {
  constructor(scene, { center, count = 40, inner = 300, outer = 900 } = {}) {
    this.scene = scene;
    this.center = center.clone();
    this.rocks = [];
    this._tmp = new THREE.Vector3();
    const mat = new THREE.MeshStandardMaterial({ color: 0x6b5f57, roughness: 0.95, metalness: 0.1, flatShading: true });
    this._mat = mat;

    for (let i = 0; i < count; i++) {
      // random point in the spherical shell [inner, outer] around the center
      const dir = new THREE.Vector3(Math.random() * 2 - 1, (Math.random() * 2 - 1) * 0.5, Math.random() * 2 - 1).normalize();
      const dist = inner + Math.random() * (outer - inner);
      const radius = 5 + Math.random() * 16;
      const geo = new THREE.IcosahedronGeometry(radius, 0);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(this.center).addScaledVector(dir, dist);
      mesh.scale.set(0.7 + Math.random() * 0.6, 0.7 + Math.random() * 0.6, 0.7 + Math.random() * 0.6);
      mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      scene.add(mesh);
      const sx = Math.max(mesh.scale.x, mesh.scale.y, mesh.scale.z);
      this.rocks.push({
        mesh, radius,
        hp: Math.round(radius * sx * 3),
        spin: new THREE.Vector3((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4),
        drift: new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6),
      });
    }
    this.inner = inner;
    this.outer = outer;
  }

  update(dt) {
    for (const r of this.rocks) {
      r.mesh.rotation.x += r.spin.x * dt;
      r.mesh.rotation.y += r.spin.y * dt;
      r.mesh.position.addScaledVector(r.drift, dt);
      // keep rocks loosely within the belt — reverse drift if they wander out
      const d = this._tmp.copy(r.mesh.position).sub(this.center).length();
      if (d > this.outer * 1.2 || d < this.inner * 0.6) r.drift.multiplyScalar(-1);
    }
  }

  // First rock overlapping a sphere at `pos` with radius `shipR`, else null.
  collide(pos, shipR) {
    for (const r of this.rocks) {
      const sx = Math.max(r.mesh.scale.x, r.mesh.scale.y, r.mesh.scale.z);
      const rr = r.radius * sx + shipR;
      if (this._tmp.copy(pos).sub(r.mesh.position).lengthSq() < rr * rr) return r;
    }
    return null;
  }

  // First rock a projectile segment from→to passes through, else null (for mining).
  hitTest(from, to) {
    for (const r of this.rocks) {
      const sx = Math.max(r.mesh.scale.x, r.mesh.scale.y, r.mesh.scale.z);
      const rr = r.radius * sx;
      if (segDistSq(r.mesh.position, from, to) < rr * rr) return r;
    }
    return null;
  }

  // Apply mining damage. Returns ore yield (>0) when the rock shatters, else 0.
  damage(rock, dmg) {
    rock.hp -= dmg;
    if (rock.hp > 0) return 0;
    this.scene.remove(rock.mesh);
    rock.mesh.geometry.dispose();
    this.rocks = this.rocks.filter((r) => r !== rock);
    const sx = Math.max(rock.mesh.scale.x, rock.mesh.scale.y, rock.mesh.scale.z);
    return Math.max(1, Math.round((rock.radius * sx) / 4));
  }
}

// Squared distance from point P to segment AB (swept hit test).
function segDistSq(p, a, b) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const apx = p.x - a.x, apy = p.y - a.y, apz = p.z - a.z;
  const abLen = abx * abx + aby * aby + abz * abz;
  let t = abLen > 0 ? (apx * abx + apy * aby + apz * abz) / abLen : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = apx - abx * t, dy = apy - aby * t, dz = apz - abz * t;
  return dx * dx + dy * dy + dz * dz;
}
