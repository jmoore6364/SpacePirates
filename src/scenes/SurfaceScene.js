// Pass 3: on-foot surface scene. Walk a 3rd-person character through a procedural
// neon city after landing. Take off (T) to return to space.
import { THREE } from '../renderer/Renderer.js';
import { Character } from '../entities/Character.js';
import { ThirdPersonCamera } from '../core/ThirdPersonCamera.js';
import { Ship } from '../entities/Ship.js';
import { buildCity } from './city.js';

export class SurfaceScene {
  constructor(input, world) {
    this.input = input;
    this.world = world;
    this.scene = new THREE.Scene();

    const atmo = new THREE.Color(world.atmo);
    const ground = new THREE.Color(world.color).multiplyScalar(0.15);
    this.scene.background = ground;
    this.scene.fog = new THREE.Fog(ground.getHex(), 60, 360);

    // lights: cool ambient + a key light + themed hemisphere for the streets
    this.scene.add(new THREE.HemisphereLight(atmo.getHex(), 0x0a0c14, 0.7));
    this.scene.add(new THREE.AmbientLight(0x223044, 0.5));
    const key = new THREE.DirectionalLight(0xfff2dd, 1.1);
    key.position.set(40, 80, 30);
    this.scene.add(key);

    const city = buildCity(world);
    this.scene.add(city.group);
    this.colliders = city.colliders;

    // landed ship on the pad
    this.parkedShip = new Ship();
    this.parkedShip.object.position.copy(city.padPosition).setY(1.4);
    this.parkedShip.object.rotation.set(-0.08, Math.PI * 0.85, 0);
    this.parkedShip.object.scale.setScalar(1.6);
    this.scene.add(this.parkedShip.object);

    // character at the spawn point
    this.character = new Character();
    this.character.position.copy(city.spawn);
    this.character.heading = Math.PI; // face the city
    this.scene.add(this.character.object);

    this.cam = null;
    this._enginePulse = 0;
    this.hud = {};
    this.requestTakeoff = false;
  }

  onEnter(renderer) {
    this.cam = new ThirdPersonCamera(renderer.camera);
    this.cam.yaw = this.character.heading;
    this.cam.update(0.016, this.character);
  }

  readMove() {
    const i = this.input;
    if (!i || this.inputLocked) return { forward: 0, strafe: 0 };
    return {
      forward: i.axis(['ArrowDown', 'KeyS'], ['ArrowUp', 'KeyW']),
      strafe: i.axis(['ArrowLeft', 'KeyA'], ['ArrowRight', 'KeyD']),
    };
  }

  update(dt) {
    const move = this.readMove();
    const yaw = this.cam ? this.cam.yaw : this.character.heading;
    this.character.update(dt, move, yaw, this.colliders);
    if (this.cam) this.cam.update(dt, this.character);

    // parked-ship engine idle flicker
    this._enginePulse += dt * 6;
    const eng = this.parkedShip.object.userData.engine;
    if (eng) eng.scale.setScalar(0.5 + Math.sin(this._enginePulse) * 0.06);

    // distance from the pad to prompt takeoff
    const distToPad = Math.hypot(this.character.position.x, this.character.position.z);

    this.hud = {
      world: this.world,
      onFoot: true,
      nearShip: distToPad < 16,
      moving: this.character.moving,
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
