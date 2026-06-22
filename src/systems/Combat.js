// Space combat: player + enemy lasers, pursuing enemy fighters, shields/hull,
// explosions, and a wanted level that escalates spawns. Lives inside SpaceScene
// and reads the shared player for derived stats. Renderer touches are localized
// to small mesh factories here.
import { THREE } from '../renderer/Renderer.js';
import { player } from '../game/Player.js';
import { clamp } from '../util/math.js';

const FWD = new THREE.Vector3(0, 0, -1);
const PROJ_SPEED = 760;
const PROJ_LIFE = 1.6;
const SHIELD_REGEN = 8; // per second after a lull
// homing missiles (secondary weapon): slower than bolts so the seek reads, hits hard
// with splash, limited by Player ammo.
const MISSILE_SPEED = 340;
const MISSILE_LIFE = 3.4;
const MISSILE_DMG = 52;
const SPLASH_RADIUS = 22;
const SPLASH_DMG = 24;

// Enemy archetypes — distinct feel and threat. Mix is gated by wanted level.
export const ENEMY_TYPES = {
  scout:   { name: 'Scout',   hp: 18, speed: 175, ideal: 150, range: 300, fireCd: 1.7, dmg: 6,  bounty: 45,  scale: 0.8, color: 0x66e0ff, strafe: 0.95 },
  raider:  { name: 'Raider',  hp: 34, speed: 120, ideal: 180, range: 360, fireCd: 1.4, dmg: 9,  bounty: 70,  scale: 1.0, color: 0xff5b6e, strafe: 0.6 },
  gunship: { name: 'Gunship', hp: 84, speed: 78,  ideal: 230, range: 440, fireCd: 1.0, dmg: 17, bounty: 150, scale: 1.7, color: 0xffa23c, strafe: 0.2 },
  // boss: a pirate Warlord capital ship that hunts you at max heat
  warlord: { name: 'Warlord', hp: 520, speed: 55, ideal: 210, range: 560, fireCd: 0.9, dmg: 14, bounty: 1200, scale: 3.0, color: 0xff3b50, strafe: 0.35, volley: 3, boss: true },
};

export class Combat {
  constructor(scene, ship, input, { onEvent } = {}) {
    this.scene = scene;
    this.ship = ship;
    this.input = input;
    this.onEvent = onEvent || (() => {});

    const stats = player.stats();
    this.maxShield = 60 + stats.shield;
    this.maxHull = stats.hull;
    this.shield = this.maxShield;
    this.hull = this.maxHull;
    this.weaponDmg = stats.weapon;

    this.asteroids = null; // optional Asteroids field (mining), set by the scene
    this.projectiles = []; // { mesh, vel, life, dmg, hostile }
    this.enemies = [];     // { mesh, vel, hp, cd }
    this.effects = [];     // { mesh, life, max, scaleRate }
    this.missiles = [];    // { mesh, vel, life, target, trailCd }

    this.wanted = 0;
    this.kills = 0;
    this.boss = null; // active Warlord enemy entry, or null
    this.wingman = null; // hired escort fighter, or null
    this._fireCd = 0;
    this._missileCd = 0;
    this._wingCd = 0;
    this._spawnCd = 3;
    this._hitGrace = 0; // since last damage, for shield regen
    this._mat = {
      player: new THREE.MeshBasicMaterial({ color: 0x66e0ff }),
      enemy: new THREE.MeshBasicMaterial({ color: 0xff5b6e }),
      missile: new THREE.MeshBasicMaterial({ color: 0xffd24a }),
    };
    this._tmp = new THREE.Vector3();
    this._tmp2 = new THREE.Vector3();
  }

  get enemyCount() { return this.enemies.length; }

  update(dt) {
    this._fireCd -= dt;
    this._missileCd -= dt;
    this._spawnCd -= dt;
    this._hitGrace += dt;

    if (this.input && (this.input.firing ? this.input.firing() : this.input.isDown('KeyJ'))) this.fire();
    if (this.input && this.input.firingSecondary && this.input.firingSecondary()) this.fireMissile();

    this._spawnWaves(dt);
    this._updateEnemies(dt);
    this._updateWingman(dt);
    this._updateProjectiles(dt);
    this._updateMissiles(dt);
    this._updateEffects(dt);
    this._regenShield(dt);
  }

  // A hired escort that flies in formation off the player's wing and fires on the
  // nearest enemy. Invulnerable (enemies hunt the player); pure added firepower.
  _updateWingman(dt) {
    if (!player.hasWingman) {
      if (this.wingman) { this.scene.remove(this.wingman.mesh); this.wingman = null; }
      return;
    }
    if (!this.wingman) {
      const mesh = buildWingmanMesh();
      this.scene.add(mesh);
      this.wingman = { mesh };
    }
    const w = this.wingman;
    const right = this._tmp.set(1, 0, 0).applyQuaternion(this.ship.quaternion);
    const fwd = this._tmp2.copy(FWD).applyQuaternion(this.ship.quaternion);
    // formation point: off the right wing, slightly back and above
    const form = this.ship.position.clone().addScaledVector(right, 16).addScaledVector(fwd, -6);
    form.y += 4;
    w.mesh.position.lerp(form, clamp(dt * 2.5, 0, 1));

    // target nearest enemy and fire
    let best = null, bd = Infinity;
    for (const e of this.enemies) {
      const d = w.mesh.position.distanceToSquared(e.mesh.position);
      if (d < bd) { bd = d; best = e; }
    }
    this._wingCd -= dt;
    if (best && bd < 700 * 700) {
      w.mesh.lookAt(best.mesh.position);
      if (this._wingCd <= 0) {
        this._wingCd = 0.7;
        const dir = this._tmp.copy(best.mesh.position).sub(w.mesh.position).normalize();
        this._spawnProjectile(w.mesh.position.clone().addScaledVector(dir, 2), dir.clone(), false, 12);
      }
    } else {
      w.mesh.lookAt(this.ship.position.clone().addScaledVector(fwd, 60));
    }
  }

  fire() {
    if (this._fireCd > 0) return;
    this._fireCd = 0.16;
    const fwd = FWD.clone().applyQuaternion(this.ship.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.ship.quaternion);

    // auto-aim: lead toward the nearest enemy inside the forward cone (arcade feel)
    const aim = this._aimDir(fwd);

    // two barrels off the wings
    for (const off of [-1.4, 1.4]) {
      const start = this.ship.position.clone().addScaledVector(right, off).addScaledVector(fwd, 2);
      this._spawnProjectile(start, aim.clone(), false, this.weaponDmg);
    }
    this.onEvent({ type: 'fire' });
  }

  _aimDir(fwd) {
    let best = null, bd = Infinity;
    for (const e of this.enemies) {
      const to = this._tmp.copy(e.mesh.position).sub(this.ship.position);
      const dist = to.length();
      if (dist < 1) continue;
      to.normalize();
      if (fwd.dot(to) < 0.35) continue;        // only target what's roughly ahead
      if (dist < bd) { bd = dist; best = e; }
    }
    if (!best || bd > 700) return fwd;
    return this._tmp.copy(best.mesh.position).sub(this.ship.position).normalize().clone();
  }

  _spawnProjectile(pos, dir, hostile, dmg) {
    const mesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.25, 3.2, 2, 6),
      hostile ? this._mat.enemy : this._mat.player,
    );
    mesh.position.copy(pos);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    this.scene.add(mesh);
    const vel = dir.clone().multiplyScalar(PROJ_SPEED);
    // inherit a bit of shooter momentum so bolts read right
    this.projectiles.push({ mesh, vel, life: PROJ_LIFE, dmg, hostile });
  }

  // Fire a homing missile if ammo remains. It locks the nearest enemy ahead and
  // detonates with splash damage. Ammo lives on the shared Player (#16 optional).
  fireMissile() {
    if (this._missileCd > 0) return;
    if (!player.spendMissile()) { this.onEvent({ type: 'dryFire' }); this._missileCd = 0.4; return; }
    this._missileCd = 0.7;
    const fwd = FWD.clone().applyQuaternion(this.ship.quaternion);
    const start = this.ship.position.clone().addScaledVector(fwd, 3);
    const target = this._lockTarget(fwd);
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 2.2, 3, 6), this._mat.missile);
    mesh.position.copy(start);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), fwd);
    this.scene.add(mesh);
    this.missiles.push({ mesh, vel: fwd.clone().multiplyScalar(MISSILE_SPEED), life: MISSILE_LIFE, target, trailCd: 0 });
    this.onEvent({ type: 'missile' });
  }

  // nearest enemy roughly ahead of the ship (for missile lock); null if none
  _lockTarget(fwd) {
    let best = null, bd = Infinity;
    for (const e of this.enemies) {
      const to = this._tmp.copy(e.mesh.position).sub(this.ship.position);
      const dist = to.length();
      if (dist < 1) continue;
      if (fwd.dot(to.normalize()) < 0.2) continue;
      if (dist < bd) { bd = dist; best = e; }
    }
    return best;
  }

  _updateMissiles(dt) {
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      // re-acquire if the locked target died
      if (m.target && (m.target._dead || !this.enemies.includes(m.target))) {
        m.target = this._lockTarget(this._tmp.copy(m.vel).normalize());
      }
      // strong homing toward the target
      if (m.target) {
        const want = this._tmp2.copy(m.target.mesh.position).sub(m.mesh.position).normalize();
        const cur = this._tmp.copy(m.vel).normalize();
        cur.lerp(want, clamp(dt * 5, 0, 1)).normalize();
        m.vel.copy(cur).multiplyScalar(MISSILE_SPEED);
        m.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), cur);
      }

      const from = this._tmp.copy(m.mesh.position);
      m.mesh.position.addScaledVector(m.vel, dt);
      const to = m.mesh.position;
      m.life -= dt;

      // smoke/flare trail
      m.trailCd -= dt;
      if (m.trailCd <= 0) { m.trailCd = 0.04; this._spark(to, 0xffae3c, 0.3); }

      let hit = false;
      for (const e of this.enemies) {
        const r = 7 * (e.type?.scale || 1) + 5; // proximity fuse — a touch wider than bolts
        if (segDistSq(e.mesh.position, from, to) < r * r) { hit = true; break; }
      }
      if (hit || m.life <= 0) {
        if (hit) this._detonate(to.clone());
        this.scene.remove(m.mesh);
        m.mesh.geometry.dispose();
        this.missiles.splice(i, 1);
      }
    }
  }

  // splash explosion: full damage at the core, falloff to SPLASH_DMG in radius
  _detonate(pos) {
    this._explosion(pos, 0xffae3c);
    for (const e of [...this.enemies]) {
      const d = e.mesh.position.distanceTo(pos);
      if (d <= SPLASH_RADIUS) {
        e.hp -= (d < 6 ? MISSILE_DMG : SPLASH_DMG);
        if (e.hp <= 0) this._killEnemy(e);
      }
    }
  }

  _spawnWaves(dt) {
    // at max heat a Warlord boss arrives to end the spree
    if (this.wanted >= 5 && !this.boss) this._spawnBoss();

    const target = 2 + this.wanted; // more heat → more hunters
    if (this.enemies.length >= target || this._spawnCd > 0) return;
    this._spawnCd = 2.2;
    const ahead = FWD.clone().applyQuaternion(this.ship.quaternion).multiplyScalar(280);
    const jitter = new THREE.Vector3(
      (Math.random() - 0.5) * 320,
      (Math.random() - 0.5) * 180,
      (Math.random() - 0.5) * 320,
    );
    const pos = this.ship.position.clone().add(ahead).add(jitter);
    this._spawnEnemy(pos, this._pickType());
  }

  // Weighted by wanted level: scouts/raiders early, gunships once heat builds.
  _pickType() {
    const w = this.wanted;
    const r = Math.random();
    if (w >= 2 && r < 0.12 + w * 0.06) return 'gunship';
    if (r < 0.45) return 'scout';
    return 'raider';
  }

  _spawnEnemy(pos, typeKey = 'raider') {
    const type = ENEMY_TYPES[typeKey] || ENEMY_TYPES.raider;
    const mesh = buildEnemyMesh(type);
    mesh.position.copy(pos);
    this.scene.add(mesh);
    const e = {
      mesh, type, vel: new THREE.Vector3(),
      hp: type.hp + this.wanted * 4,
      cd: 0.6 + Math.random() * type.fireCd,
      isBoss: !!type.boss, maxHp: type.hp + this.wanted * 4,
    };
    this.enemies.push(e);
    return e;
  }

  _spawnBoss() {
    const ahead = FWD.clone().applyQuaternion(this.ship.quaternion).multiplyScalar(320);
    const pos = this.ship.position.clone().add(ahead);
    this.boss = this._spawnEnemy(pos, 'warlord');
    this.onEvent({ type: 'bossSpawn', name: 'Warlord' });
  }

  _updateEnemies(dt) {
    for (const e of this.enemies) {
      const t = e.type;
      const toPlayer = this._tmp.copy(this.ship.position).sub(e.mesh.position);
      const dist = toPlayer.length();
      toPlayer.normalize();

      // face the player and keep this type's preferred fighting distance
      const desired = this._tmp2.copy(e.mesh.position);
      if (dist > t.ideal + 30) desired.addScaledVector(toPlayer, t.speed * dt);
      else if (dist < t.ideal - 30) desired.addScaledVector(toPlayer, -t.speed * dt);
      else {
        const side = new THREE.Vector3(toPlayer.z, 0, -toPlayer.x);
        desired.addScaledVector(side, t.speed * t.strafe * dt);
      }
      e.mesh.position.copy(desired);
      e.mesh.lookAt(this.ship.position);

      // fire at the player
      e.cd -= dt;
      if (dist < t.range && e.cd <= 0) {
        e.cd = t.fireCd + Math.random() * 0.6;
        const dir = this._tmp2.copy(this.ship.position).sub(e.mesh.position).normalize();
        const shots = t.volley || 1;
        for (let k = 0; k < shots; k++) {
          // spread a volley into a small fan
          const d = dir.clone();
          if (shots > 1) {
            d.x += (k - (shots - 1) / 2) * 0.08;
            d.y += (Math.random() - 0.5) * 0.05;
            d.normalize();
          }
          this._spawnProjectile(e.mesh.position.clone().addScaledVector(d, 3 * t.scale), d, true, t.dmg + this.wanted);
        }
      }
    }
  }

  _updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];

      // light homing for player bolts: curve toward the nearest enemy in a
      // forward cone so dogfights connect without precise aim (fun-first).
      if (!p.hostile && this.enemies.length) {
        let best = null, bd = Infinity;
        for (const e of this.enemies) {
          const d = p.mesh.position.distanceToSquared(e.mesh.position);
          if (d < bd) { bd = d; best = e; }
        }
        if (best && bd < 260 * 260) {
          const want = this._tmp2.copy(best.mesh.position).sub(p.mesh.position).normalize();
          const cur = this._tmp.copy(p.vel).normalize();
          if (cur.dot(want) > 0.2) { // only steer toward targets roughly ahead
            cur.lerp(want, clamp(dt * 4, 0, 1)).normalize();
            p.vel.copy(cur).multiplyScalar(PROJ_SPEED);
            p.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), cur);
          }
        }
      }

      // swept collision: test the whole step segment so fast bolts don't tunnel
      const from = this._tmp.copy(p.mesh.position);
      p.mesh.position.addScaledVector(p.vel, dt);
      const to = p.mesh.position;
      p.life -= dt;

      let hit = false;
      if (p.hostile) {
        if (segDistSq(this.ship.position, from, to) < 5 * 5) {
          this._damagePlayer(p.dmg);
          hit = true;
        }
      } else {
        for (const e of this.enemies) {
          const r = 7 * (e.type?.scale || 1);
          if (segDistSq(e.mesh.position, from, to) < r * r) {
            e.hp -= p.dmg;
            this._spark(to, 0x66e0ff, 0.5);
            hit = true;
            if (e.hp <= 0) this._killEnemy(e);
            break;
          }
        }
        // mining: player bolts chip asteroids and shatter them into ore
        if (!hit && this.asteroids) {
          const rock = this.asteroids.hitTest(from, to);
          if (rock) {
            hit = true;
            this._spark(to, 0xd9b06a, 0.5);
            const ore = this.asteroids.damage(rock, p.dmg);
            if (ore > 0) {
              this._explosion(rock.mesh.position, 0xd9b06a);
              const got = player.addCargo('ore', ore);
              this.onEvent({ type: 'mined', ore: got, spilled: ore - got });
            }
          }
        }
      }

      if (hit || p.life <= 0) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        this.projectiles.splice(i, 1);
      }
    }
    // cull dead enemies
    this.enemies = this.enemies.filter((e) => e.hp > 0 || !e._dead);
  }

  _killEnemy(e) {
    e._dead = true;
    this._explosion(e.mesh.position, e.isBoss ? 0xff3b50 : 0xff7a3c);
    if (e.isBoss) { this._explosion(e.mesh.position, 0xffd24a); this.boss = null; }
    this.scene.remove(e.mesh);
    e.mesh.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.enemies = this.enemies.filter((x) => x !== e);
    this.kills += 1;

    if (e.isBoss) {
      const bounty = e.type.bounty;
      player.addCredits(bounty);
      this.wanted = 0; this.kills = 0; // the spree ends with the Warlord
      this.onEvent({ type: 'bossKill', bounty, enemy: e.type.name });
      return;
    }
    this.wanted = clamp(Math.floor(this.kills / 2), 0, 5);
    const bounty = (e.type?.bounty || 60) + this.wanted * 10;
    player.addCredits(bounty);
    this.onEvent({ type: 'kill', bounty, enemy: e.type?.name });
  }

  _damagePlayer(dmg) {
    this._hitGrace = 0;
    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, dmg);
      this.shield -= absorbed;
      dmg -= absorbed;
      this._spark(this.ship.position, 0x66aaff, 0.8);
    }
    if (dmg > 0) {
      this.hull -= dmg;
      this._spark(this.ship.position, 0xff5b6e, 0.8);
    }
    this.onEvent({ type: 'playerHit' });
    if (this.hull <= 0) this._destroyPlayer();
  }

  _destroyPlayer() {
    this._explosion(this.ship.position, 0x66e0ff);
    // wipe the field; restore on respawn
    for (const e of this.enemies) { this.scene.remove(e.mesh); }
    this.enemies = [];
    for (const m of this.missiles) { this.scene.remove(m.mesh); m.mesh.geometry.dispose(); }
    this.missiles = [];
    this.boss = null;
    if (this.wingman) { this.scene.remove(this.wingman.mesh); this.wingman = null; } // re-forms on respawn
    this.shield = this.maxShield;
    this.hull = this.maxHull;
    this.wanted = 0;
    this.kills = 0;
    const penalty = Math.round(player.credits * 0.1);
    player.addCredits(-penalty);
    this.onEvent({ type: 'destroyed', penalty });
  }

  _regenShield(dt) {
    if (this._hitGrace > 3 && this.shield < this.maxShield) {
      this.shield = Math.min(this.maxShield, this.shield + SHIELD_REGEN * dt);
    }
  }

  _spark(pos, color, life) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1.4, 8, 8),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.effects.push({ mesh, life, max: life, scaleRate: 6 });
  }

  _explosion(pos, color) {
    for (let i = 0; i < 5; i++) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(1 + Math.random() * 2, 8, 8),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      mesh.position.copy(pos).add(new THREE.Vector3(
        (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6,
      ));
      this.scene.add(mesh);
      this.effects.push({ mesh, life: 0.6, max: 0.6, scaleRate: 14 });
    }
  }

  _updateEffects(dt) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const f = this.effects[i];
      f.life -= dt;
      const t = clamp(f.life / f.max, 0, 1);
      f.mesh.material.opacity = t;
      f.mesh.scale.addScalar(f.scaleRate * dt);
      if (f.life <= 0) {
        this.scene.remove(f.mesh);
        f.mesh.geometry.dispose();
        f.mesh.material.dispose();
        this.effects.splice(i, 1);
      }
    }
  }

  hudData() {
    return {
      shield: this.shield, maxShield: this.maxShield,
      hull: this.hull, maxHull: this.maxHull,
      wanted: this.wanted, enemies: this.enemies.length,
      missiles: player.missiles, maxMissiles: player.maxMissiles,
      boss: this.boss ? { name: this.boss.type.name, hp: Math.max(0, this.boss.hp), maxHp: this.boss.maxHp } : null,
      wingman: !!this.wingman,
    };
  }
}

// Squared distance from point P to segment AB (all THREE.Vector3). Used for
// swept projectile hit tests so high-speed bolts can't tunnel through targets.
function segDistSq(p, a, b) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const apx = p.x - a.x, apy = p.y - a.y, apz = p.z - a.z;
  const abLen = abx * abx + aby * aby + abz * abz;
  let t = abLen > 0 ? (apx * abx + apy * aby + apz * abz) / abLen : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = apx - abx * t, dy = apy - aby * t, dz = apz - abz * t;
  return dx * dx + dy * dy + dz * dz;
}

// Friendly escort fighter — cyan/green so it never reads as a threat.
function buildWingmanMesh() {
  const g = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: 0x2a6e5a, roughness: 0.5, metalness: 0.6 });
  const glow = new THREE.MeshBasicMaterial({ color: 0x8effa0 });
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.8, 3.6, 6), hull);
  body.rotation.x = -Math.PI / 2; g.add(body);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.2, 1.1), hull);
  wing.position.z = 0.6; g.add(wing);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), glow);
  eye.position.set(0, 0, -1.4); g.add(eye);
  const eng = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), glow);
  eng.position.set(0, 0, 1.9); g.add(eng);
  g.scale.setScalar(1.1);
  return g;
}

function buildEnemyMesh(type) {
  const g = new THREE.Group();
  const tint = new THREE.Color(type.color).multiplyScalar(0.4).getHex();
  const hull = new THREE.MeshStandardMaterial({ color: tint, roughness: 0.5, metalness: 0.6 });
  const glow = new THREE.MeshBasicMaterial({ color: type.color });

  if (type.name === 'Warlord') {
    // hulking capital ship: long armored spine, side batteries, menacing red eyes
    const spine = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.2, 7.5), hull);
    g.add(spine);
    const prow = new THREE.Mesh(new THREE.ConeGeometry(1.6, 3.2, 6), hull);
    prow.rotation.x = -Math.PI / 2; prow.position.z = -4.8; g.add(prow);
    for (const sx of [-2.8, 2.8]) {
      const nac = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 6, 8), hull);
      nac.rotation.x = Math.PI / 2; nac.position.set(sx, 0, 0.6); g.add(nac);
      const gun = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 3), hull);
      gun.position.set(sx, 0, -2.4); g.add(gun);
    }
    const wing = new THREE.Mesh(new THREE.BoxGeometry(9, 0.6, 3), hull);
    wing.position.z = 1; g.add(wing);
    for (const sx of [-1.2, 1.2]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 10), glow);
      eye.position.set(sx, 0.4, -3.4); g.add(eye);
    }
    g.scale.setScalar(type.scale);
    return g;
  }

  if (type.name === 'Scout') {
    // small dart
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.7, 3.4, 5), hull);
    body.rotation.x = -Math.PI / 2;
    g.add(body);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.15, 0.9), hull);
    fin.position.z = 0.8; g.add(fin);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), glow);
    eye.position.set(0, 0, -1.3); g.add(eye);
  } else if (type.name === 'Gunship') {
    // bulky cruiser with twin nacelles + two eyes
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 5.2), hull);
    g.add(body);
    for (const sx of [-2.2, 2.2]) {
      const nac = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 4, 8), hull);
      nac.rotation.x = Math.PI / 2; nac.position.set(sx, 0, 0); g.add(nac);
    }
    const wing = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.4, 2.2), hull);
    wing.position.z = 0.4; g.add(wing);
    for (const sx of [-0.9, 0.9]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), glow);
      eye.position.set(sx, 0.2, -2.6); g.add(eye);
    }
  } else {
    // raider (default)
    const body = new THREE.Mesh(new THREE.ConeGeometry(1.1, 4.4, 6), hull);
    body.rotation.x = -Math.PI / 2; g.add(body);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.2, 1.2), hull);
    wing.position.z = 0.6; g.add(wing);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), glow);
    eye.position.set(0, 0, -1.6); g.add(eye);
  }

  g.scale.setScalar(type.scale);
  return g;
}
