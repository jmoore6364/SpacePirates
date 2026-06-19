// Pass 1–2: free-flight space scene. Fly with throttle + pitch/yaw/roll, chase
// camera, starfield, sun, themed worlds. Pass 2 adds approach-detection (proximity
// prompt) and fast-travel warp used by the star map.
import { THREE } from '../renderer/Renderer.js';
import { Ship } from '../entities/Ship.js';
import { ChaseCamera } from '../core/ChaseCamera.js';
import { makeStarfield, makePlanet, makeSun } from './props.js';
import { WORLDS } from '../world/Worlds.js';

export class SpaceScene {
  constructor(input) {
    this.input = input;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x05060d, 0.00006);

    this.scene.add(new THREE.AmbientLight(0x2a3550, 0.7));
    const sunLight = new THREE.DirectionalLight(0xfff2dd, 2.2);
    sunLight.position.set(-1500, 600, -1200);
    this.scene.add(sunLight);

    this.scene.add(makeStarfield());
    this.scene.add(makeSun([-1500, 600, -1200]));

    this.planets = WORLDS.map((w) => {
      const g = makePlanet(w);
      g.userData.world = w;
      this.scene.add(g);
      return g;
    });

    this.ship = new Ship();
    this.scene.add(this.ship.object);

    this.chase = null;
    this._enginePulse = 0;
    this._tmp = new THREE.Vector3();
    this.approach = null; // { world, dist } when near a world
    this.hud = {};
  }

  onEnter(renderer) {
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

    const speed01 = this.ship.speed / this.ship.maxSpeed;
    if (this.chase) this.chase.update(dt, this.ship.object, speed01);

    this.hud = {
      throttle: this.ship.throttle,
      speed: this.ship.speed,
      maxSpeed: this.ship.maxSpeed,
      approach: this.approach,
    };
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
