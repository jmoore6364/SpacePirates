// On-foot blaster combat in cities. Enforcers spawn when you land with heat on you
// and hunt the player; the player fires a blaster (J) in their facing direction.
// Ground-plane combat at chest height, swept bolt collisions, on-foot health with
// regen, and respawn-on-death. Reads the shared player for credit rewards.
import { THREE } from '../renderer/Renderer.js';
import { player } from '../game/Player.js';
import { clamp, segDistSq } from '../util/math.js';
import { characterModel } from '../entities/Models.js';
import { AnimatedActor } from '../entities/AnimatedActor.js';

const BOLT_SPEED = 240;
const BOLT_LIFE = 1.4;
const CHEST = 1.6;
const HP_REGEN = 6; // per second after a lull

// On-foot enforcer archetypes — distinct HP, pace, range and threat (mirrors the
// space enemy roster). grunt is the original baseline.
export const ENFORCER_TYPES = {
  // bounty/HP climbs grunt → heavy → captain so tougher targets pay off; the sniper
  // is a glass cannon (low HP, high dmg/range) and keeps a deliberate risk premium.
  grunt:   { hp: 40,  speed: 11, ideal: 16, fireCd: 1.6, dmg: 8,  bounty: 55,  scale: 1.0,  color: 0xff3b50 },
  heavy:   { hp: 95,  speed: 7,  ideal: 13, fireCd: 1.9, dmg: 16, bounty: 160, scale: 1.35, color: 0xff7a3c },
  sniper:  { hp: 28,  speed: 9,  ideal: 30, fireCd: 2.6, dmg: 22, bounty: 78,  scale: 0.9,  color: 0xc06bff },
  // on-foot mini-boss: an Enforcer Captain (the ground answer to the Warlord)
  captain: { hp: 260, speed: 9,  ideal: 18, fireCd: 0.85, dmg: 14, bounty: 720, scale: 1.7, color: 0xffd24a, volley: 3, boss: true },
};

export class GroundCombat {
  constructor(scene, character, input, { onEvent, spawn, groundY, colliders } = {}) {
    this.scene = scene;
    this.character = character;
    this.input = input;
    this.onEvent = onEvent || (() => {});
    this.spawnPoint = spawn || new THREE.Vector3(0, 0, 16);
    this.groundY = groundY || (() => 0);
    this.colliders = colliders || []; // city AABBs, used to stop bolts at the reticle
    this.camera = null;               // set by the scene; defines the screen-center ray

    const armor = player.groundArmor();
    this.maxHp = armor.hp;
    this.hp = armor.hp;
    this.regen = armor.regen || HP_REGEN;
    this.dr = armor.dr || 0; // fraction of incoming damage soaked by armor
    this.enemies = [];
    this.captain = null; // active Enforcer Captain mini-boss, or null
    this.bolts = [];
    this._fireCd = 0;
    this._hitGrace = 0;
    this._tmp = new THREE.Vector3();
    this._tmp2 = new THREE.Vector3();
    this._tmp3 = new THREE.Vector3();
    this._mat = {
      player: new THREE.MeshBasicMaterial({ color: 0x9effa0 }),
      enemy: new THREE.MeshBasicMaterial({ color: 0xff5b6e }),
    };

    // transient hit/impact FX (muzzle flash, sparks, kill bursts) — additive, fading
    this.fx = [];
    this._fxGeo = {
      flash: new THREE.IcosahedronGeometry(1, 0),
      shard: new THREE.TetrahedronGeometry(0.3),
    };
  }

  get enemyCount() { return this.enemies.length; }

  spawnWave(count) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 36 + Math.random() * 26;
      this.spawnEnforcer(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r), this._pickEnforcer());
    }
  }

  // weighted enforcer archetype mix (grunts common, heavies/snipers rarer)
  _pickEnforcer() {
    const r = Math.random();
    if (r < 0.2) return 'heavy';
    if (r < 0.45) return 'sniper';
    return 'grunt';
  }

  spawnEnforcer(pos, typeKey = 'grunt') {
    const type = ENFORCER_TYPES[typeKey] || ENFORCER_TYPES.grunt;
    // animated robot enforcer (own materials so the tint + hit-flash are per-instance),
    // or the procedural figure as a fallback
    const m = characterModel('robot', { cloneMaterials: true });
    const mats = [];
    let mesh, actor = null;
    if (m) {
      actor = new AnimatedActor(m);
      mesh = m.object;
      mesh.scale.multiplyScalar(type.scale); // archetype size on top of the normalized height
      mesh.traverse((o) => {
        if (o.isMesh) o.castShadow = true;
        if (!o.isMesh || !o.material) return;
        for (const mm of (Array.isArray(o.material) ? o.material : [o.material])) {
          if (!mm.emissive) continue;
          mm.emissive.setHex(type.color); mm.emissiveIntensity = 0.5; // archetype colour glow
          mats.push({ m: mm, baseHex: type.color, baseI: 0.5 });
        }
      });
      actor.play('idle');
    } else {
      mesh = buildEnforcer(type);
      mesh.traverse((o) => {
        if (o.isMesh) o.castShadow = true;
        if (o.isMesh && o.material && o.material.emissive) {
          mats.push({ m: o.material, baseHex: o.material.emissive.getHex(), baseI: o.material.emissiveIntensity });
        }
      });
    }
    mesh.position.copy(pos);
    mesh.position.y = this.groundY(pos.x, pos.z);
    this.scene.add(mesh);
    const e = { mesh, actor, type, hp: type.hp, maxHp: type.hp, cd: 1 + Math.random() * 1.5, mats, flash: 0, isBoss: !!type.boss };
    this.enemies.push(e);
    if (type.boss) this.captain = e;
    return e;
  }

  spawnCaptain() {
    const a = Math.random() * Math.PI * 2;
    const r = 42;
    this.spawnEnforcer(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r), 'captain');
    this.onEvent({ type: 'captainSpawn' });
  }

  update(dt) {
    this._fireCd -= dt;
    this._hitGrace += dt;

    if (this.input && (this.input.firing ? this.input.firing() : this.input.isDown('KeyJ'))) this.fire();

    this._updateEnemies(dt);
    this._updateBolts(dt);
    this._updateFx(dt);
    if (this._hitGrace > 4 && this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + this.regen * dt);
    }
  }

  fire() {
    if (this._fireCd > 0) return;
    const w = player.groundWeapon();
    this._fireCd = w.cd;
    const dmg = player.sidearmDamage();
    const cp = this.character.position;
    const muzzle = this._tmp.set(cp.x, this.groundY(cp.x, cp.z) + CHEST, cp.z);

    // Aim at the exact world point under the screen-center reticle: cast the camera's
    // view ray against enemies, buildings and the ground, then send the bolt from the
    // muzzle to that hit so it visibly ENDS at the reticle (no overshoot).
    let target;
    if (this.camera) {
      const origin = this._tmp2.copy(this.camera.position);
      const ray = this.camera.getWorldDirection(this._tmp3);
      const dist = this._reticleDist(origin, ray);
      target = origin.clone().addScaledVector(ray, dist);
    } else {
      const h = this.character.heading;
      target = muzzle.clone().add(new THREE.Vector3(Math.sin(h), 0, Math.cos(h)).multiplyScalar(80));
    }

    const toTarget = target.sub(muzzle);
    const reach = Math.max(2, toTarget.length());
    const aim = toTarget.multiplyScalar(1 / reach); // normalized aim direction
    const start = muzzle.clone().addScaledVector(aim, 1.4);

    // one bolt, or a spread of pellets for scatter-type weapons
    for (let k = 0; k < (w.pellets || 1); k++) {
      const dir = w.spread ? scatter(aim, w.spread) : aim.clone();
      const life = Math.min(BOLT_LIFE, (reach - 1.4) / w.speed);
      this._spawnBolt(start, dir, false, dmg, life, w.speed, w.color);
    }
    this._spawnFx('muzzle', start, w.color);
    this.onEvent({ type: 'blaster' });
  }

  // Distance along the camera ray to the first thing under the reticle (enemy /
  // building / ground), capped to a max range when it hits open sky.
  _reticleDist(o, d) {
    let best = 220;
    if (d.y < -1e-4) { // ground plane near the player (terrain is ~flat)
      const t = (this.groundY(o.x, o.z) - o.y) / d.y;
      if (t > 0.1) best = Math.min(best, t);
    }
    for (const c of this.colliders) {
      const t = rayAABB(o, d, c.min, c.max);
      if (t !== null && t > 0.1) best = Math.min(best, t);
    }
    for (const e of this.enemies) {
      const cy = this.groundY(e.mesh.position.x, e.mesh.position.z) + CHEST;
      const t = raySphere(o, d, e.mesh.position.x, cy, e.mesh.position.z, 2.2);
      if (t !== null && t > 0.1) best = Math.min(best, t);
    }
    return best;
  }

  _spawnBolt(pos, dir, hostile, dmg, life = BOLT_LIFE, speed = BOLT_SPEED, color = null) {
    const mat = hostile ? this._mat.enemy : (color != null ? this._boltMat(color) : this._mat.player);
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 1.4, 2, 6), mat);
    mesh.position.copy(pos);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    this.scene.add(mesh);
    this.bolts.push({ mesh, vel: dir.clone().multiplyScalar(speed), life, hostile, dmg });
  }

  // Shared bolt material per colour so each weapon's bolts read distinctly.
  _boltMat(color) {
    this._boltMats = this._boltMats || {};
    return this._boltMats[color] || (this._boltMats[color] = new THREE.MeshBasicMaterial({ color }));
  }

  _updateEnemies(dt) {
    const p = this.character.position;
    for (const e of this.enemies) {
      const to = this._tmp.copy(p).sub(e.mesh.position);
      to.y = 0;
      const dist = to.length();
      to.normalize();
      const ideal = e.type.ideal;
      let moved = false;
      if (dist > ideal + 2) { e.mesh.position.addScaledVector(to, e.type.speed * dt); moved = true; }
      else if (dist < ideal - 2) { e.mesh.position.addScaledVector(to, -e.type.speed * 0.7 * dt); moved = true; }
      e.mesh.position.y = this.groundY(e.mesh.position.x, e.mesh.position.z);
      e.mesh.rotation.y = Math.atan2(to.x, to.z);
      if (e.actor) { e.actor.play(moved ? 'walk' : 'idle'); e.actor.update(dt); }

      // red hit-flash fades back to the enforcer's normal glow
      if (e.flash > 0) {
        e.flash = Math.max(0, e.flash - dt);
        const k = e.flash / 0.14;
        for (const mm of e.mats) {
          if (k > 0) { mm.m.emissive.setHex(0xff2030); mm.m.emissiveIntensity = mm.baseI + k * 3; }
          else { mm.m.emissive.setHex(mm.baseHex); mm.m.emissiveIntensity = mm.baseI; }
        }
      }

      e.cd -= dt;
      if (dist < 60 && e.cd <= 0) {
        e.cd = e.type.fireCd + Math.random();
        const pChest = this.groundY(p.x, p.z) + CHEST;
        const eChest = this.groundY(e.mesh.position.x, e.mesh.position.z) + CHEST;
        const dir = this._tmp2.copy(p).setY(pChest).sub(this._tmp.copy(e.mesh.position).setY(eChest)).normalize();
        const muzzle = e.mesh.position.clone().setY(eChest);
        const shots = e.type.volley || 1;
        for (let k = 0; k < shots; k++) {
          const d = shots > 1 ? scatter(dir, 0.09) : dir.clone();
          this._spawnBolt(muzzle.clone().addScaledVector(d, 1.4), d, true, e.type.dmg);
        }
      }
    }
  }

  _updateBolts(dt) {
    const p = this.character.position;
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      const from = this._tmp.copy(b.mesh.position);
      b.mesh.position.addScaledVector(b.vel, dt);
      const to = b.mesh.position;
      b.life -= dt;

      let hit = false;
      if (b.hostile) {
        if (segDistSq(this._tmp2.set(p.x, this.groundY(p.x, p.z) + CHEST, p.z), from, to) < 2.2 * 2.2) {
          this._damagePlayer(b.dmg);
          this._spawnFx('hit', b.mesh.position.clone(), 0xff5b6e);
          hit = true;
        }
      } else {
        for (const e of this.enemies) {
          const ey = this.groundY(e.mesh.position.x, e.mesh.position.z) + CHEST;
          if (segDistSq(this._tmp2.set(e.mesh.position.x, ey, e.mesh.position.z), from, to) < 2.4 * 2.4) {
            e.hp -= b.dmg;
            e.flash = 0.14; // red impact flash
            e.mesh.position.add(this._tmp3.copy(b.vel).setY(0).normalize().multiplyScalar(0.6)); // knockback
            this._spawnFx('hit', b.mesh.position.clone(), 0xff8a5b);
            hit = true;
            if (e.hp <= 0) this._killEnemy(e);
            break;
          }
        }
      }

      if (hit || b.life <= 0) {
        // bolt expired at the reticle on the world (no target): leave a small spark
        if (!hit && !b.hostile) this._spawnFx('surface', b.mesh.position.clone(), 0xfff0c0);
        this.scene.remove(b.mesh);
        b.mesh.geometry.dispose();
        this.bolts.splice(i, 1);
      }
    }
  }

  _killEnemy(e) {
    const cy = this.groundY(e.mesh.position.x, e.mesh.position.z) + 1.6;
    this._spawnFx('kill', this._tmp.set(e.mesh.position.x, cy, e.mesh.position.z).clone(), e.isBoss ? 0xffd24a : 0xff5b6e);
    this.scene.remove(e.mesh);
    // model enforcers share the cached robot geometry — only free per-instance materials;
    // procedural ones own their geometry
    if (e.actor) { for (const mm of e.mats) mm.m.dispose && mm.m.dispose(); }
    else e.mesh.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.enemies = this.enemies.filter((x) => x !== e);
    const bounty = e.type?.bounty || 50;
    player.addCredits(bounty);
    if (e.isBoss) { this.captain = null; this.onEvent({ type: 'captainDown', bounty }); }
    else this.onEvent({ type: 'enforcerDown', bounty });
  }

  _damagePlayer(dmg) {
    this._hitGrace = 0;
    this.hp -= dmg * (1 - this.dr);
    this.onEvent({ type: 'playerHurt' });
    if (this.hp <= 0) this._down();
  }

  _down() {
    const penalty = Math.round(player.credits * 0.05);
    player.addCredits(-penalty);
    this.hp = this.maxHp;
    this.character.position.copy(this.spawnPoint);
    for (const e of this.enemies) this.scene.remove(e.mesh);
    this.enemies = [];
    this.captain = null;
    this.onEvent({ type: 'playerDown', penalty });
  }

  // Spawn a short-lived additive burst. 'kill' adds a flash plus flung shards.
  _spawnFx(kind, pos, color) {
    if (kind === 'kill') {
      this._addFx(this._fxGeo.flash, color, pos, { life: 0.32, from: 0.8, to: 3.4, spin: 4 });
      for (let k = 0; k < 6; k++) {
        const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.3, Math.random() - 0.5)
          .normalize().multiplyScalar(7 + Math.random() * 6);
        this._addFx(this._fxGeo.shard, color, pos, { life: 0.5, from: 1, to: 0.3, vel: v, grav: -20, spin: 12 });
      }
      return;
    }
    const cfg = kind === 'muzzle' ? { life: 0.09, from: 0.5, to: 0.05, spin: 6 }
      : kind === 'hit' ? { life: 0.18, from: 0.3, to: 1.9, spin: 5 }
      : /* surface */ { life: 0.15, from: 0.2, to: 1.2, spin: 5 };
    this._addFx(this._fxGeo.flash, color, pos, cfg);
  }

  _addFx(geo, color, pos, { life, from, to, vel = null, grav = 0, spin = 0 }) {
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    mesh.scale.setScalar(from);
    this.scene.add(mesh);
    this.fx.push({ mesh, mat, life, maxLife: life, from, to, vel: vel ? vel.clone() : null, grav, spin });
  }

  _updateFx(dt) {
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.life -= dt;
      const t = 1 - Math.max(0, f.life) / f.maxLife; // 0 → 1 over its life
      f.mat.opacity = Math.max(0, 1 - t);
      f.mesh.scale.setScalar(f.from + (f.to - f.from) * t);
      if (f.spin) { f.mesh.rotation.x += f.spin * dt; f.mesh.rotation.y += f.spin * dt; }
      if (f.vel) { f.vel.y += f.grav * dt; f.mesh.position.addScaledVector(f.vel, dt); }
      if (f.life <= 0) {
        this.scene.remove(f.mesh);
        f.mat.dispose();
        this.fx.splice(i, 1);
      }
    }
  }

  hudData() {
    return {
      hp: this.hp, maxHp: this.maxHp, enemies: this.enemies.length,
      boss: this.captain ? { name: 'Enforcer Captain', hp: Math.max(0, this.captain.hp), maxHp: this.captain.maxHp } : null,
    };
  }
}

// Perturb a unit direction within a cone of `spread` radians (scatter weapons).
function scatter(dir, spread) {
  const up = Math.abs(dir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const right = new THREE.Vector3().crossVectors(dir, up).normalize();
  const realUp = new THREE.Vector3().crossVectors(right, dir).normalize();
  const a = (Math.random() * 2 - 1) * spread;
  const b = (Math.random() * 2 - 1) * spread;
  return dir.clone().addScaledVector(right, Math.tan(a)).addScaledVector(realUp, Math.tan(b)).normalize();
}

// Nearest positive ray/AABB hit distance, or null. (slab method)
function rayAABB(o, d, min, max) {
  let tmin = -Infinity, tmax = Infinity;
  for (const ax of ['x', 'y', 'z']) {
    if (Math.abs(d[ax]) < 1e-8) {
      if (o[ax] < min[ax] || o[ax] > max[ax]) return null; // parallel & outside slab
    } else {
      const inv = 1 / d[ax];
      let t1 = (min[ax] - o[ax]) * inv;
      let t2 = (max[ax] - o[ax]) * inv;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
  }
  return tmin > 0 ? tmin : (tmax > 0 ? tmax : null);
}

// Nearest positive ray/sphere hit distance, or null.
function raySphere(o, d, cx, cy, cz, r) {
  const mx = o.x - cx, my = o.y - cy, mz = o.z - cz;
  const b = mx * d.x + my * d.y + mz * d.z;
  const c = mx * mx + my * my + mz * mz - r * r;
  if (c > 0 && b > 0) return null; // origin outside & ray pointing away
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : 0;
}

function buildEnforcer(type = ENFORCER_TYPES.grunt) {
  const g = new THREE.Group();
  const suitHex = new THREE.Color(type.color).multiplyScalar(0.32).getHex();
  const suit = new THREE.MeshStandardMaterial({ color: suitHex, roughness: 0.6, metalness: 0.3 });
  const glow = new THREE.MeshStandardMaterial({ color: type.color, emissive: type.color, emissiveIntensity: 1, roughness: 0.3 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.65, 1.3, 5, 10), suit);
  body.position.y = 1.6; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), suit);
  head.position.y = 2.7; g.add(head);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.36, 10, 8, 0, Math.PI), glow);
  visor.position.set(0, 2.7, 0.28); visor.rotation.x = Math.PI / 2; g.add(visor);
  // heavies get shoulder pauldrons; snipers a long barrel — quick silhouette tells
  if (type.scale >= 1.3) {
    for (const sx of [-0.85, 0.85]) {
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.7), suit);
      pad.position.set(sx, 2.3, 0); g.add(pad);
    }
  } else if (type.ideal >= 25) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.4, 6), glow);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0.5, 1.7, 0.9); g.add(barrel);
  }
  if (type.boss) { // captain crest
    const crest = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.7, 4), glow);
    crest.position.y = 3.35; g.add(crest);
  }
  g.scale.setScalar(type.scale);
  return g;
}
