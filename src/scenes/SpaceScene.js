// Pass 1–2: free-flight space scene. Fly with throttle + pitch/yaw/roll, chase
// camera, starfield, sun, themed worlds. Pass 2 adds approach-detection (proximity
// prompt) and fast-travel warp used by the star map.
import { THREE } from '../renderer/Renderer.js';
import { Ship } from '../entities/Ship.js';
import { ChaseCamera } from '../core/ChaseCamera.js';
import { makeStarfield, makePlanet, makeSun } from './props.js';
import { WORLDS } from '../world/Worlds.js';
import { player } from '../game/Player.js';
import { Combat } from '../systems/Combat.js';

export class SpaceScene {
  constructor(input) {
    this.input = input;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x05060d, 0.00006);

    // sun key + cool rim/back light + faint fill for shape on the ship & planets
    this.scene.add(new THREE.AmbientLight(0x2a3550, 0.55));
    const sunLight = new THREE.DirectionalLight(0xfff2dd, 2.4);
    sunLight.position.set(-1500, 600, -1200);
    this.scene.add(sunLight);
    const rim = new THREE.DirectionalLight(0x4d7bff, 1.1);
    rim.position.set(1400, -300, 1200);
    this.scene.add(rim);
    const fill = new THREE.DirectionalLight(0xff6aa8, 0.35);
    fill.position.set(400, 800, 1400);
    this.scene.add(fill);

    this.scene.add(makeStarfield());
    this.scene.add(makeSun([-1500, 600, -1200]));

    this.planets = WORLDS.map((w) => {
      const g = makePlanet(w);
      g.userData.world = w;
      this.scene.add(g);
      return g;
    });

    this.ship = new Ship(player.hull);
    this.ship.maxSpeed = player.stats().maxSpeed; // apply hull + engine + skills
    this.scene.add(this.ship.object);

    this.onEvent = null; // main sets this for toasts / audio
    this.renderer = null; // set in onEnter for screen shake
    this.combat = new Combat(this.scene, this.ship, input, {
      onEvent: (e) => this._onCombat(e),
    });

    this.chase = null;
    this._enginePulse = 0;
    this._tmp = new THREE.Vector3();
    this.approach = null; // { world, dist } when near a world
    this.active = true;   // gates combat (paused behind the title screen)
    this.hud = {};
  }

  _emit(e) { if (this.onEvent) this.onEvent(e); }

  _onCombat(e) {
    // local screen shake
    if (this.renderer) {
      const amt = { fire: 0.12, hit: 0.2, kill: 0.8, playerHit: 0.5, destroyed: 2.4 }[e.type];
      if (amt) this.renderer.addShake(amt);
    }
    if (e.type === 'destroyed') this.travelTo('neon-haven');
    this._emit(e); // forward to main for audio/toasts
  }

  onEnter(renderer) {
    this.renderer = renderer;
    this.chase = new ChaseCamera(renderer.camera);
    this.ship.throttle = 0.25;
    // start near Neon Haven looking inward
    this.travelTo('neon-haven');
    this.chase.update(0.016, this.ship.object, 0);
  }

  // Warp the ship to a standoff point near a world, facing it. Used by star map.
  travelTo(worldId) {
    const planet = this.planets.find((p) => p.userData.world.id === worldId);
    if (!planet) return false;
    const w = planet.userData.world;
    const standoff = w.r * 3.2;
    // approach from the +Z/up side so the sun lights the face we see
    const dir = new THREE.Vector3(0.2, 0.25, 1).normalize();
    this.ship.position.copy(planet.position).addScaledVector(dir, standoff);
    this.ship.velocity.set(0, 0, 0);
    this.ship.throttle = 0;
    this.ship.object.lookAt(planet.position);
    if (this.chase) {
      this.chase._initialized = false;
      this.chase.update(0.016, this.ship.object, 0);
    }
    return true;
  }

  readControls() {
    const i = this.input;
    if (!i || this.inputLocked) return {};
    return {
      pitch: i.axis(['ArrowDown', 'KeyS'], ['ArrowUp', 'KeyW']),
      yaw: i.axis(['ArrowRight', 'KeyD'], ['ArrowLeft', 'KeyA']),
      roll: i.axis(['KeyE'], ['KeyQ']),
      throttleDelta: i.axis(['ShiftLeft', 'ControlLeft'], ['Space']),
    };
  }

  _updateApproach() {
    let nearest = null;
    let nd = Infinity;
    for (const p of this.planets) {
      const d = this._tmp.copy(this.ship.position).sub(p.position).length();
      const surface = d - p.userData.world.r;
      if (surface < nd) { nd = surface; nearest = p; }
    }
    // "in range" when within ~1.8 planet-radii of the surface
    if (nearest && nd < nearest.userData.world.r * 1.8) {
      this.approach = { world: nearest.userData.world, dist: Math.max(0, nd) };
    } else {
      this.approach = null;
    }
  }

  update(dt, renderer) {
    this.ship.update(dt, this.readControls());

    for (const p of this.planets) p.rotation.y += dt * (p.userData.spin || 0.03);

    this._enginePulse += dt * 12;
    const eng = this.ship.object.userData.engine;
    if (eng) {
      const base = 0.4 + this.ship.throttle * 0.9;
      eng.scale.setScalar(base + Math.sin(this._enginePulse) * 0.08);
    }

    this._updateApproach();
    if (this.active) this.combat.update(dt);

    const speed01 = this.ship.speed / this.ship.maxSpeed;
    if (this.chase) this.chase.update(dt, this.ship.object, speed01);

    this.hud = {
      throttle: this.ship.throttle,
      speed: this.ship.speed,
      maxSpeed: this.ship.maxSpeed,
      approach: this.approach,
      combat: this.combat.hudData(),
      radar: this._radarBlips(),
    };
  }

  // Blips in radar-local space (forward = up): {x, y} in [-1,1], type, color, far.
  _radarBlips() {
    const range = 2600;
    const q = this._radarQ ? this._radarQ.copy(this.ship.object.quaternion).invert()
      : (this._radarQ = this.ship.object.quaternion.clone().invert());
    const blips = [];
    const add = (pos, type, color) => {
      const local = this._tmp.copy(pos).sub(this.ship.position).applyQuaternion(q);
      const dist = Math.hypot(local.x, local.z);
      let x = local.x, z = local.z, far = false;
      if (dist > range) { const s = range / dist; x *= s; z *= s; far = true; }
      blips.push({ x: x / range, y: z / range, type, color, far });
    };
    for (const p of this.planets) add(p.position, 'planet', p.userData.world.atmo);
    for (const e of this.combat.enemies) add(e.mesh.position, 'enemy', 0xff5b6e);
    return blips;
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
