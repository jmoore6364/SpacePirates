// On-foot blaster combat in cities. Enforcers spawn when you land with heat on you
// and hunt the player; the player fires a blaster (J) in their facing direction.
// Ground-plane combat at chest height, swept bolt collisions, on-foot health with
// regen, and respawn-on-death. Reads the shared player for credit rewards.
import { THREE } from '../renderer/Renderer.js';
import { player } from '../game/Player.js';
import { clamp, segDistSq } from '../util/math.js';

const BOLT_SPEED = 240;
const BOLT_LIFE = 1.4;
const CHEST = 1.6;
const HP_REGEN = 6; // per second after a lull

export class GroundCombat {
  constructor(scene, character, input, { onEvent, spawn, groundY } = {}) {
    this.scene = scene;
    this.character = character;
    this.input = input;
    this.onEvent = onEvent || (() => {});
    this.spawnPoint = spawn || new THREE.Vector3(0, 0, 16);
    this.groundY = groundY || (() => 0);

    this.maxHp = 100;
    this.hp = 100;
    this.enemies = [];
    this.bolts = [];
    this._fireCd = 0;
    this._hitGrace = 0;
    this._tmp = new THREE.Vector3();
    this._tmp2 = new THREE.Vector3();
    this._mat = {
      player: new THREE.MeshBasicMaterial({ color: 0x9effa0 }),
      enemy: new THREE.MeshBasicMaterial({ color: 0xff5b6e }),
    };
  }

  get enemyCount() { return this.enemies.length; }

  spawnWave(count) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 36 + Math.random() * 26;
      this.spawnEnforcer(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
    }
  }

  spawnEnforcer(pos) {
    const mesh = buildEnforcer();
    mesh.position.copy(pos);
    mesh.position.y = this.groundY(pos.x, pos.z);
    mesh.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.scene.add(mesh);
    this.enemies.push({ mesh, hp: 40, cd: 1 + Math.random() * 1.5 });
  }

  update(dt) {
    this._fireCd -= dt;
    this._hitGrace += dt;

    if (this.input && (this.input.firing ? this.input.firing() : this.input.isDown('KeyJ'))) this.fire();

    this._updateEnemies(dt);
    this._updateBolts(dt);
    if (this._hitGrace > 4 && this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + HP_REGEN * dt);
    }
  }

  fire() {
    if (this._fireCd > 0) return;
    this._fireCd = 0.22;
    const cp = this.character.position;
    const muzzle = this._tmp.set(cp.x, this.groundY(cp.x, cp.z) + CHEST, cp.z);

    // Fire at the screen-center aim point (the reticle), so shots land under the
    // crosshair wherever the camera is pointed (up/down/left/right).
    let dir;
    if (this.aimTarget) {
      dir = this._tmp2.copy(this.aimTarget).sub(muzzle).normalize();
    } else {
      const h = this.character.heading;
      dir = this._tmp2.set(Math.sin(h), 0, Math.cos(h)).normalize();
    }

    const start = muzzle.clone().addScaledVector(dir, 1.4);
    this._spawnBolt(start, dir.clone(), false, player.stats().weapon);
    this.onEvent({ type: 'blaster' });
  }

  _spawnBolt(pos, dir, hostile, dmg) {
    const mesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.18, 1.4, 2, 6),
      hostile ? this._mat.enemy : this._mat.player,
    );
    mesh.position.copy(pos);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    this.scene.add(mesh);
    this.bolts.push({ mesh, vel: dir.clone().multiplyScalar(BOLT_SPEED), life: BOLT_LIFE, hostile, dmg });
  }

  _updateEnemies(dt) {
    const p = this.character.position;
    for (const e of this.enemies) {
      const to = this._tmp.copy(p).sub(e.mesh.position);
      to.y = 0;
      const dist = to.length();
      to.normalize();
      const ideal = 16;
      if (dist > ideal + 2) e.mesh.position.addScaledVector(to, 11 * dt);
      else if (dist < ideal - 2) e.mesh.position.addScaledVector(to, -8 * dt);
      e.mesh.position.y = this.groundY(e.mesh.position.x, e.mesh.position.z);
      e.mesh.rotation.y = Math.atan2(to.x, to.z);

      e.cd -= dt;
      if (dist < 60 && e.cd <= 0) {
        e.cd = 1.6 + Math.random();
        const pChest = this.groundY(p.x, p.z) + CHEST;
        const eChest = this.groundY(e.mesh.position.x, e.mesh.position.z) + CHEST;
        const dir = this._tmp2.copy(p).setY(pChest).sub(this._tmp.copy(e.mesh.position).setY(eChest)).normalize();
        this._spawnBolt(e.mesh.position.clone().setY(eChest).addScaledVector(dir, 1.4), dir.clone(), true, 8);
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
          hit = true;
        }
      } else {
        for (const e of this.enemies) {
          const ey = this.groundY(e.mesh.position.x, e.mesh.position.z) + CHEST;
          if (segDistSq(this._tmp2.set(e.mesh.position.x, ey, e.mesh.position.z), from, to) < 2.4 * 2.4) {
            e.hp -= b.dmg;
            hit = true;
            if (e.hp <= 0) this._killEnemy(e);
            break;
          }
        }
      }

      if (hit || b.life <= 0) {
        this.scene.remove(b.mesh);
        b.mesh.geometry.dispose();
        this.bolts.splice(i, 1);
      }
    }
  }

  _killEnemy(e) {
    this.scene.remove(e.mesh);
    e.mesh.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.enemies = this.enemies.filter((x) => x !== e);
    const bounty = 50;
    player.addCredits(bounty);
    this.onEvent({ type: 'enforcerDown', bounty });
  }

  _damagePlayer(dmg) {
    this._hitGrace = 0;
    this.hp -= dmg;
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
    this.onEvent({ type: 'playerDown', penalty });
  }

  hudData() {
    return { hp: this.hp, maxHp: this.maxHp, enemies: this.enemies.length };
  }
}

function buildEnforcer() {
  const g = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color: 0x5a1f28, roughness: 0.6, metalness: 0.3 });
  const glow = new THREE.MeshStandardMaterial({ color: 0xff3b50, emissive: 0x661018, emissiveIntensity: 1, roughness: 0.3 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.65, 1.3, 5, 10), suit);
  body.position.y = 1.6; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), suit);
  head.position.y = 2.7; g.add(head);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.36, 10, 8, 0, Math.PI), glow);
  visor.position.set(0, 2.7, 0.28); visor.rotation.x = Math.PI / 2; g.add(visor);
  return g;
}
