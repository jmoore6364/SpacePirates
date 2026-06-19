// Pass 1: free-flight space scene. Fly the ship with throttle + pitch/yaw/roll,
// chase camera, starfield, sun, and a handful of themed planets to fly around.
import { THREE } from '../renderer/Renderer.js';
import { Ship } from '../entities/Ship.js';
import { ChaseCamera } from '../core/ChaseCamera.js';
import { makeStarfield, makePlanet, makeSun } from './props.js';

const PLANETS = [
  { position: [600, -40, -500], r: 160, color: 0x2e6f8e, atmo: 0x55b8ff },  // ocean
  { position: [-700, 120, -1400], r: 220, color: 0xb5723a, atmo: 0xffb066 }, // desert
  { position: [300, 260, -2200], r: 130, color: 0x6f7fa8, atmo: 0xaad4ff },  // ice
  { position: [-1200, -200, -800], r: 110, color: 0x3f8f5a, atmo: 0x8effa0 }, // jungle
];

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

    this.planets = PLANETS.map((p) => {
      const g = makePlanet(p);
      this.scene.add(g);
      return g;
    });

    this.ship = new Ship();
    this.scene.add(this.ship.object);

    this.chase = null; // built on enter when we have the camera
    this._enginePulse = 0;
  }

  onEnter(renderer) {
    this.chase = new ChaseCamera(renderer.camera);
    // start drifting forward a touch so the first frame reads as motion
    this.ship.throttle = 0.25;
    this.chase.update(0.016, this.ship.object, 0);
  }

  readControls() {
    const i = this.input;
    if (!i) return {};
    return {
      // pitch: nose down on ArrowUp/W feels natural for flight (push stick fwd)
      pitch: i.axis(['ArrowDown', 'KeyS'], ['ArrowUp', 'KeyW']),
      yaw: i.axis(['ArrowRight', 'KeyD'], ['ArrowLeft', 'KeyA']),
      roll: i.axis(['KeyE'], ['KeyQ']),
      // Space throttles up (and holds); Shift/Ctrl throttles down.
      throttleDelta: i.axis(['ShiftLeft', 'ControlLeft'], ['Space']),
    };
  }

  update(dt, renderer) {
    const controls = this.readControls();
    this.ship.update(dt, controls);

    // planets spin
    for (const p of this.planets) p.rotation.y += dt * (p.userData.spin || 0.03);

    // engine flicker scaled by throttle
    this._enginePulse += dt * 12;
    const eng = this.ship.object.userData.engine;
    if (eng) {
      const base = 0.4 + this.ship.throttle * 0.9;
      eng.scale.setScalar(base + Math.sin(this._enginePulse) * 0.08);
    }

    const speed01 = this.ship.speed / this.ship.maxSpeed;
    if (this.chase) this.chase.update(dt, this.ship.object, speed01);

    this.hud = {
      throttle: this.ship.throttle,
      speed: this.ship.speed,
      maxSpeed: this.ship.maxSpeed,
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
