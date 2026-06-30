// Building interior: a themed 3D room you walk into from the surface. Same on-foot
// controller as SurfaceScene (mouse/keys look + walk), with NPCs milling and two
// interactables — the vendor station (opens its panel) and the exit door (back outside).
import { THREE } from '../renderer/Renderer.js';
import { Character } from '../entities/Character.js';
import { ThirdPersonCamera } from '../core/ThirdPersonCamera.js';
import { Crowd } from './Crowd.js';
import { buildInterior } from './interior.js';
import { clamp } from '../util/math.js';

export class InteriorScene {
  constructor(input, kind, world, questLog = null) {
    this.input = input;
    this.kind = kind;
    this.world = world;
    this.questLog = questLog;
    this.onEvent = null;
    this.inputLocked = false;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05070c);

    const room = buildInterior(kind, world);
    this.scene.add(room.group);
    this.colliders = room.colliders;
    this.title = room.title;
    this.flat = () => 0; // floor is flat at y=0

    // interactables: the vendor station (if any) + the exit door
    this.interactables = [];
    if (room.station) this.interactables.push(room.station);
    this.interactables.push({ id: 'exit', label: room.exit.label, pos: room.exit.pos });

    // player at the doorway, facing into the room
    this.character = new Character();
    this.character.groundSampler = this.flat;
    this.character.position.copy(room.spawn);
    this.character.heading = Math.PI; // face -Z, into the room
    this.lookYaw = Math.PI;
    this.lookPitch = 0.05;
    this.character.object.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.scene.add(this.character.object);

    // NPCs milling about the room (bounded to the interior)
    this.crowd = new Crowd(this.scene, {
      colliders: this.colliders,
      groundY: this.flat,
      world,
      bounds: Math.min(room.bounds.x, room.bounds.z),
      count: 5,
      onBark: (line) => { if (this.onEvent) this.onEvent({ type: 'bark', line }); },
    });

    this.cam = null;
    this.hud = {};
  }

  onEnter(renderer) {
    this.cam = new ThirdPersonCamera(renderer.camera);
    this.cam.yaw = this.character.heading;
    this.cam.update(0.016, this.character);
  }

  readControls() {
    const i = this.input;
    if (!i || this.inputLocked) return { forward: 0, turn: 0, strafe: 0, pitch: 0 };
    const clampU = (v) => (v < -1 ? -1 : v > 1 ? 1 : v);
    const tm = i.touchMove;
    const tf = tm && tm.active ? -tm.y : 0;
    const tt = tm && tm.active ? tm.x : 0;
    return {
      forward: clampU(i.actAxis('pitchDown', 'pitchUp') + tf - i.pad.moveY),
      turn: -clampU(i.actAxis('yawLeft', 'yawRight') + tt + i.pad.lookX),
      strafe: clampU(i.actAxis('rollLeft', 'rollRight') + i.pad.moveX),
      pitch: clampU(i.actAxis('lookDown', 'lookUp') + i.pad.lookY),
    };
  }

  update(dt) {
    const c = this.readControls();
    const i = this.input;
    const look = i && i.consumeLook ? i.consumeLook() : { dx: 0, dy: 0 };
    if (i && i.mouseFlight && !this.inputLocked) {
      const SENS = 0.0026;
      this.lookYaw -= look.dx * SENS;
      this.lookPitch = clamp(this.lookPitch + look.dy * SENS, -1, 1);
    }
    this.lookYaw += c.turn * 4.5 * dt;
    this.lookPitch = clamp(this.lookPitch + c.pitch * 2.0 * dt, -1, 1);
    this.character.update(dt, { forward: c.forward, strafe: c.strafe }, this.lookYaw, this.colliders);
    if (this.cam) this.cam.update(dt, this.character, this.lookPitch);
    if (this.crowd) this.crowd.update(dt, { playerPos: this.character.position, alarmed: false });

    // nearest interactable in reach
    let near = null, nd = Infinity;
    for (const it of this.interactables) {
      const d = Math.hypot(this.character.position.x - it.pos.x, this.character.position.z - it.pos.z);
      if (d < nd) { nd = d; near = it; }
    }
    this.hud = {
      world: this.world,
      onFoot: true,
      interior: true,
      moving: this.character.moving,
      interact: near && nd < 6 ? { id: near.id, label: near.label } : null,
    };
  }

  dispose() {
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
  }
}
