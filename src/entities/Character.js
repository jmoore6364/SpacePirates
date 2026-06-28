// On-foot 3rd-person character: an animated 3D model (Kenney Blocky Characters, CC0)
// when loaded, else a low-poly procedural figure. Camera-relative walk controller
// with simple AABB collision against city buildings.
import { THREE } from '../renderer/Renderer.js';
import { clamp, lerp } from '../util/math.js';
import { characterModel } from './Models.js';
import { AnimatedActor } from './AnimatedActor.js';
import { buildGun } from './Gun.js';
import { player } from '../game/Player.js';

// Where the held gun sits in the right-hand bone's local space. The Quaternius hand
// bone carries a ~70× world scale, so the gun is scaled down hard to read hand-sized;
// pos offsets are tiny for the same reason. euler may need eyeball tuning.
const GUN_FIT = { pos: [0, 0.004, 0.004], euler: [-Math.PI / 2, 0, 0], scale: 0.012 };

// Procedural aim: override the right arm each frame to raise the gun and point it
// forward (the rig has no aim clip). Measured: UpperArm.R at X+90° → arm fwd ≈ +0.99.
const AIM_UPPER_ARM = [Math.PI / 2, 0, 0];

export class Character {
  constructor() {
    this.object = new THREE.Group();   // stable transform; visual is a swappable child
    this.heading = Math.PI;        // facing -Z initially
    this.speed = 16;               // units/s
    this.radius = 1.2;             // collision radius
    this._bob = 0;
    this._bobAmp = 0.25;           // vertical walk bob (0 when an animation handles it)
    this._vel = new THREE.Vector3();
    this.moving = false;
    this.groundSampler = null; // (x,z) => terrain height; set by the scene

    this.actor = null;
    this._buildVisual();
  }

  get position() { return this.object.position; }

  // Use the animated model if it's loaded, otherwise the procedural figure.
  _buildVisual() {
    const m = characterModel('man');
    if (m) {
      this.actor = new AnimatedActor(m);
      this.object.add(m.object);
      this._bobAmp = 0; // the walk/idle clips provide the motion
      this.actor.play('idle');
      this.equipGun(player.groundWeapon().id);
      this._armUpper = this.actor.findBone('UpperArm.R');
      this._armLower = this.actor.findBone('LowerArm.R');
    } else {
      this.object.add(buildFigure());
    }
    this.object.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }

  // (Re)build the held weapon mesh in the character's right hand.
  equipGun(weaponId) {
    if (!this.actor) return;
    if (this._gun && this._gun.parent) this._gun.parent.remove(this._gun);
    this._gun = this.actor.attachToHand(buildGun(weaponId), GUN_FIT);
    if (this._gun) { this._gunHome = this._gun.position.clone(); this._recoil = 0; }
  }

  // Brief weapon kick on firing (decays in update) — reads as a shot without a clip.
  gunRecoil() { if (this._gun) this._recoil = 0.1; }

  // 3rd-person aim controls: `yaw` is the look/heading the character faces (set by
  // the scene from mouse/keys/touch turning); `forward` walks along that facing,
  // `strafe` steps sideways. The character always faces `yaw` so it aims/shoots
  // wherever you point.
  update(dt, { forward = 0, strafe = 0 }, yaw = 0, colliders = []) {
    this.heading = yaw;
    this.object.rotation.y = yaw;

    const dir = new THREE.Vector3();
    if (forward || strafe) {
      const f = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));   // facing
      const r = new THREE.Vector3(-Math.cos(yaw), 0, Math.sin(yaw));  // screen-right
      dir.addScaledVector(f, forward).addScaledVector(r, strafe);
      if (dir.lengthSq() > 0) dir.normalize();
    }
    this.moving = dir.lengthSq() > 0;

    if (this.moving) {
      const next = this.position.clone().addScaledVector(dir, this.speed * dt);
      this._resolveCollision(next, colliders);
      this.position.x = next.x;
      this.position.z = next.z;
      this._bob += dt * 10;
    } else {
      this._bob = lerp(this._bob, 0, clamp(dt * 8, 0, 1));
    }

    // follow the terrain with a little walk bob on top (skipped when animated)
    const groundY = this.groundSampler ? this.groundSampler(this.position.x, this.position.z) : 0;
    this.position.y = groundY + Math.abs(Math.sin(this._bob)) * this._bobAmp;

    // drive the animation: walk while moving, idle when still
    if (this.actor) {
      this.actor.play(this.moving ? 'walk' : 'idle');
      this.actor.update(dt);
      // override the right arm AFTER the clip so he holds the gun out, pointing forward
      if (this._armUpper) {
        this._armUpper.rotation.set(AIM_UPPER_ARM[0], AIM_UPPER_ARM[1], AIM_UPPER_ARM[2]);
        if (this._armLower) this._armLower.rotation.set(0, 0, 0);
      }
    }

    // weapon recoil kick decays back to the rest pose
    if (this._gun && this._recoil > 0) {
      this._recoil = Math.max(0, this._recoil - dt);
      this._gun.position.copy(this._gunHome).z -= (this._recoil / 0.1) * 0.06;
    }
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
