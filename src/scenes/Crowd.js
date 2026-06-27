// Living-city crowd: low-poly civilians that wander between waypoints, avoid
// buildings (city colliders), bob as they walk, occasionally mutter a "bark", and
// scatter away from the player when a firefight breaks out. Cheap + renderer-light
// so it stays inside the SurfaceScene FPS budget. See issue #15.
import { THREE } from '../renderer/Renderer.js';
import { characterModel, CROWD_KINDS } from '../entities/Models.js';
import { AnimatedActor } from '../entities/AnimatedActor.js';

const BARK_LINES = [
  'Keep your head down out here.',
  'Heard the Enforcers are sweeping the docks.',
  'Credits talk, Corsair.',
  'Watch the alleys after dark.',
  'Prices are wild this cycle.',
  'You didn\'t hear it from me…',
  'Another ship in. Another problem.',
  'Stay sharp.',
];

export class Crowd {
  constructor(scene, { colliders = [], groundY, world, bounds = 150, onBark } = {}) {
    this.scene = scene;
    this.colliders = colliders;
    this.groundY = groundY || (() => 0);
    this.bounds = bounds;
    this.onBark = onBark || (() => {});

    const cfg = world?.crowd || { count: 10, palette: [0x8a93a8, 0x6f7fa8, 0xb5723a] };
    this.palette = cfg.palette;
    this.people = [];
    this._barkTimer = 4 + Math.random() * 4;
    this._tmp = new THREE.Vector3();

    for (let i = 0; i < cfg.count; i++) this._spawn(i);
  }

  _spawn(i) {
    const scale = 0.9 + (i % 3) * 0.12; // body-type variety
    // animated 3D civilian (man/woman/alien), or the procedural figure as a fallback
    const m = characterModel(CROWD_KINDS[i % CROWD_KINDS.length]);
    let group, actor = null;
    if (m) { actor = new AnimatedActor(m); group = m.object; actor.play('idle'); }
    else { group = makeCivilian(this.palette[i % this.palette.length]); }
    group.scale.setScalar(scale);
    const start = this._wanderPoint();
    group.position.copy(start);
    group.position.y = this.groundY(start.x, start.z);
    group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.scene.add(group);
    this.people.push({
      group, actor,
      target: this._wanderPoint(),
      speed: 3.4 + Math.random() * 1.8,
      bob: Math.random() * Math.PI * 2,
      repath: 0,
    });
  }

  // A random open point inside the city footprint, not inside a building.
  _wanderPoint() {
    for (let tries = 0; tries < 8; tries++) {
      const x = (Math.random() * 2 - 1) * this.bounds;
      const z = (Math.random() * 2 - 1) * this.bounds;
      if (!this._inBuilding(x, z)) return new THREE.Vector3(x, 0, z);
    }
    return new THREE.Vector3(0, 0, 0);
  }

  _inBuilding(x, z, pad = 1.2) {
    for (const c of this.colliders) {
      if (x > c.min.x - pad && x < c.max.x + pad && z > c.min.z - pad && z < c.max.z + pad) return true;
    }
    return false;
  }

  // alarmed: a firefight is active → civilians sprint away from the player.
  // playerPos: THREE.Vector3-ish of the player character.
  update(dt, { playerPos, alarmed = false } = {}) {
    for (const p of this.people) {
      const g = p.group;
      p.repath -= dt;
      let moved = false;

      if (alarmed && playerPos) {
        // flee: aim for a far point directly away from the player
        const away = this._tmp.set(g.position.x - playerPos.x, 0, g.position.z - playerPos.z);
        if (away.lengthSq() < 0.01) away.set(1, 0, 0);
        away.normalize();
        p.target.set(
          Math.max(-this.bounds, Math.min(this.bounds, g.position.x + away.x * 30)),
          0,
          Math.max(-this.bounds, Math.min(this.bounds, g.position.z + away.z * 30)),
        );
      }

      const dx = p.target.x - g.position.x;
      const dz = p.target.z - g.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1.5 || p.repath <= 0) {
        p.target = this._wanderPoint();
        p.repath = 3 + Math.random() * 4;
      } else {
        const spd = (alarmed ? 2.4 : 1) * p.speed;
        const nx = g.position.x + (dx / dist) * spd * dt;
        const nz = g.position.z + (dz / dist) * spd * dt;
        if (this._inBuilding(nx, nz)) {
          p.target = this._wanderPoint(); // blocked — choose a new route
        } else {
          g.position.x = nx;
          g.position.z = nz;
          g.rotation.y = Math.atan2(dx, dz);
          p.bob += dt * 9;
          moved = true;
        }
      }

      // animated figures get their motion from the clip; procedural ones bob
      const gy = this.groundY(g.position.x, g.position.z);
      g.position.y = p.actor ? gy : gy + Math.abs(Math.sin(p.bob)) * 0.12;
      if (p.actor) { p.actor.play(moved || alarmed ? 'walk' : 'idle'); p.actor.update(dt); }
    }

    // occasional ambient bark from a civilian near the player
    if (playerPos && !alarmed) {
      this._barkTimer -= dt;
      if (this._barkTimer <= 0) {
        this._barkTimer = 7 + Math.random() * 7;
        const near = this.people.find((p) =>
          Math.hypot(p.group.position.x - playerPos.x, p.group.position.z - playerPos.z) < 16);
        if (near) this.onBark(BARK_LINES[(Math.random() * BARK_LINES.length) | 0]);
      }
    }
  }

  dispose() {
    for (const p of this.people) {
      this.scene.remove(p.group);
      // model clones share the cached template's buffers — only free procedural ones
      if (!p.actor) p.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }
    this.people = [];
  }
}

// Simple low-poly civilian (lighter than the player figure).
function makeCivilian(color) {
  const g = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.15 });
  const visor = new THREE.MeshStandardMaterial({ color: 0x111820, emissive: 0x223344, emissiveIntensity: 0.8, roughness: 0.4 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 1.1, 4, 8), suit);
  body.position.y = 1.4; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), suit);
  head.position.y = 2.3; g.add(head);
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6, 0, Math.PI), visor);
  face.position.set(0, 2.3, 0.22); face.rotation.x = Math.PI / 2; g.add(face);
  return g;
}
