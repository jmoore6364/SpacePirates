// Pass 3: on-foot surface scene. Walk a 3rd-person character through a procedural
// neon city after landing. Take off (T) to return to space.
import { THREE } from '../renderer/Renderer.js';
import { Character } from '../entities/Character.js';
import { ThirdPersonCamera } from '../core/ThirdPersonCamera.js';
import { Ship } from '../entities/Ship.js';
import { buildCity } from './city.js';
import { GroundCombat } from '../systems/GroundCombat.js';
import { Crowd } from './Crowd.js';
import { player } from '../game/Player.js';
import { clamp } from '../util/math.js';

// Per-visit time-of-day phases (a light day/night nudge layered on the world mood).
// Floors kept high so the city stays readable even at "night".
const TIME_PHASES = [
  { name: 'day',   sunMul: 1.1,  warm: 0x000000, ambMul: 1.1 },
  { name: 'dusk',  sunMul: 0.9,  warm: 0x3a1505, ambMul: 1.0 },
  { name: 'night', sunMul: 0.65, warm: 0x001028, ambMul: 0.9 },
  { name: 'dawn',  sunMul: 0.95, warm: 0x281030, ambMul: 1.0 },
];
let _visit = 0;

export class SurfaceScene {
  constructor(input, world, threat = 0, questLog = null) {
    this.input = input;
    this.world = world;
    this.threat = threat;
    this.questLog = questLog;
    this.onEvent = null; // main sets this for toasts
    this.scene = new THREE.Scene();

    // per-world lighting mood + a rotating time-of-day phase
    const L = world.light || { sky: 0x16203a, ground: 0x05070c, sun: 0xfff2dd, sunI: 1.2, amb: 0x223044, ambI: 0.7, fog: 0x05070c, fogNear: 60, fogFar: 340 };
    const phase = TIME_PHASES[_visit++ % TIME_PHASES.length];
    this.timeOfDay = phase.name;

    // push the horizon back + lift the background so the city isn't swallowed by fog
    this.scene.background = new THREE.Color(L.fog).lerp(new THREE.Color(L.sky), 0.25);
    this.scene.fog = new THREE.Fog(L.fog, L.fogNear * 1.4, L.fogFar * 1.7);

    // brighter sky/ground + ambient fill so everything reads clearly
    this.scene.add(new THREE.HemisphereLight(L.sky, L.ground, (L.ambI || 0.7) * 1.8 + 0.35));
    this.scene.add(new THREE.AmbientLight(L.amb, (L.ambI || 0.7) * phase.ambMul * 1.3 + 0.2));

    // shadow-casting key light tinted by world + time of day (with a sensible floor)
    const sunColor = new THREE.Color(L.sun).lerp(new THREE.Color(phase.warm), 0.25);
    const key = new THREE.DirectionalLight(sunColor.getHex(), Math.max(1.5, L.sunI * phase.sunMul));
    key.position.set(60, 110, 40);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const cam = key.shadow.camera;
    cam.near = 10; cam.far = 320; cam.left = -90; cam.right = 90; cam.top = 90; cam.bottom = -90;
    key.shadow.bias = -0.0004;
    this.scene.add(key);
    this.scene.add(key.target);

    // soft cool fill from the opposite side so shadowed faces aren't pitch black
    const fill = new THREE.DirectionalLight(L.sky, 0.6);
    fill.position.set(-70, 50, -40);
    this.scene.add(fill);

    const city = buildCity(world);
    this.scene.add(city.group);
    this.colliders = city.colliders;
    this.heightAt = city.heightAt;

    // landed ship on the pad (plaza is flat)
    this.parkedShip = new Ship(player.hull);
    this.parkedShip.object.position.copy(city.padPosition).setY(1.4);
    this.parkedShip.object.rotation.set(-0.08, Math.PI * 0.85, 0);
    this.parkedShip.object.scale.setScalar(1.6);
    this.parkedShip.object.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.scene.add(this.parkedShip.object);

    // character at the spawn point, grounded to terrain
    this.character = new Character();
    this.character.groundSampler = this.heightAt;
    this.character.position.copy(city.spawn).setY(this.heightAt(city.spawn.x, city.spawn.z));
    this.character.heading = Math.PI; // face the city
    this.lookYaw = Math.PI;           // free aim/look yaw (mouse/keys/touch turn it)
    this.lookPitch = 0;               // free look pitch (mouse-Y / R-F)
    this.character.object.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.scene.add(this.character.object);

    // vendors / interactables + ambient NPCs
    this.interactables = [];
    this._addVendor('shop', 'Trader', new THREE.Vector3(22, 0, -2), 0xffe6a0);
    this._addVendor('missions', 'Mission Board', new THREE.Vector3(-22, 0, -6), 0x66e0ff);
    this._addVendor('market', 'Market', new THREE.Vector3(0, 0, -26), 0xff5db1);
    this._addVendor('shipyard', 'Shipyard', new THREE.Vector3(34, 0, 14), 0x8effd0);
    this._addVendor('armory', 'Armory', new THREE.Vector3(-34, 0, 14), 0xff9b6e);
    // quest-giver NPC appears when there's a job to take or hand off here
    this.questGiver = questLog ? questLog.giverAt(world.id) : null;
    if (this.questGiver) {
      this._addVendor('quest', this.questGiver.name, new THREE.Vector3(14, 0, 12), 0xffd24a);
    }
    // a named local you can chat with for a rumor / market tip
    this._addVendor('informant', 'Informant', new THREE.Vector3(-14, 0, -14), 0xc0a0ff);

    // living crowd: civilians wander, avoid buildings, scatter when shots fly
    this.crowd = new Crowd(this.scene, {
      colliders: this.colliders,
      groundY: this.heightAt,
      world,
      bounds: 150,
      onBark: (line) => { if (this.onEvent) this.onEvent({ type: 'bark', line }); },
    });

    // on-foot blaster combat — enforcers come if you landed with heat on you
    this.ground = new GroundCombat(this.scene, this.character, input, {
      spawn: city.spawn.clone(),
      groundY: this.heightAt,
      colliders: this.colliders,
      onEvent: (e) => { if (this.onEvent) this.onEvent(e); },
    });
    if (threat > 0) this.ground.spawnWave(Math.min(threat + 1, 6));
    if (threat >= 4) this.ground.spawnCaptain(); // an Enforcer Captain leads heavy heat

    this.cam = null;
    this._enginePulse = 0;
    this._npcPulse = 0;
    this.hud = {};
  }

  _addVendor(id, label, pos, color) {
    const gy = this.heightAt ? this.heightAt(pos.x, pos.z) : 0;
    const npc = makeNPC(color);
    npc.position.set(pos.x, gy, pos.z);
    npc.lookAt(0, gy, 0);
    this.scene.add(npc);

    // glowing beacon pylon so the vendor reads from a distance
    const pylon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 5, 8),
      new THREE.MeshBasicMaterial({ color }),
    );
    pylon.position.set(pos.x, gy + 2.5, pos.z);
    this.scene.add(pylon);
    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 12, 12),
      new THREE.MeshBasicMaterial({ color }),
    );
    orb.position.set(pos.x, gy + 5.2, pos.z);
    this.scene.add(orb);
    const pl = new THREE.PointLight(color, 1.4, 30);
    pl.position.copy(orb.position);
    this.scene.add(pl);

    this.interactables.push({ id, label, position: pos.clone(), orb, baseY: gy + 5.2, color });
  }

  onEnter(renderer) {
    this.cam = new ThirdPersonCamera(renderer.camera);
    this.cam.yaw = this.character.heading;
    this.cam.update(0.016, this.character);
    // blaster casts the camera's view ray to land bolts under the screen-center reticle
    this.ground.camera = renderer.camera;
  }

  // 3rd-person controls: forward/back walk, turn rotates the free look-yaw (so you
  // can point anywhere), strafe steps sideways. Mouse motion looks (1:1, no lag).
  // Touch stick: y walk, x turn. Keyboard: W/S walk, A/D turn, Q/E strafe, R/F tilt.
  readControls() {
    const i = this.input;
    if (!i || this.inputLocked) return { forward: 0, turn: 0, strafe: 0, pitch: 0 };
    const clampU = (v) => (v < -1 ? -1 : v > 1 ? 1 : v);
    const tm = i.touchMove;
    const tf = tm && tm.active ? -tm.y : 0;
    const tt = tm && tm.active ? tm.x : 0;
    return {
      // forward/back: keys (action map), touch stick Y, or gamepad left-stick Y
      forward: clampU(i.actAxis('pitchDown', 'pitchUp') + tf - i.pad.moveY),
      // turn: A/D (action map) + touch stick X + gamepad right-stick X (sign flipped)
      turn: -clampU(i.actAxis('yawLeft', 'yawRight') + tt + i.pad.lookX),
      // strafe: Q/E (action map) + gamepad left-stick X
      strafe: clampU(i.actAxis('rollLeft', 'rollRight') + i.pad.moveX),
      // R/F look up/down (R up = negative pitch) + gamepad right-stick Y
      pitch: clampU(i.actAxis('lookDown', 'lookUp') + i.pad.lookY),
    };
  }

  update(dt) {
    const c = this.readControls();
    const TURN_RATE = 4.5;  // rad/s for key/touch turning
    const PITCH_RATE = 2.0; // /s for R-F tilt

    // Direct mouse-look: relative motion turns/pitches instantly, scaled by how far
    // the mouse moved — no rate ramp, so it tracks the hand 1:1 (snappy, no lag).
    const i = this.input;
    // drain motion every frame (even when locked) so it never piles up into a jump
    const look = i && i.consumeLook ? i.consumeLook() : { dx: 0, dy: 0 };
    if (i && i.mouseFlight && !this.inputLocked) {
      const SENS = 0.0026; // radians per pixel
      this.lookYaw -= look.dx * SENS;                 // mouse right → turn right
      this.lookPitch = clamp(this.lookPitch + look.dy * SENS, -1, 1); // mouse down → look down
    }

    this.lookYaw += c.turn * TURN_RATE * dt;
    this.lookPitch = clamp(this.lookPitch + c.pitch * PITCH_RATE * dt, -1, 1);
    this.character.update(dt, { forward: c.forward, strafe: c.strafe }, this.lookYaw, this.colliders);
    if (this.cam) this.cam.update(dt, this.character, this.lookPitch);

    // parked-ship engine idle flicker
    this._enginePulse += dt * 6;
    const eng = this.parkedShip.object.userData.engine;
    if (eng) eng.scale.setScalar(0.5 + Math.sin(this._enginePulse) * 0.06);

    // vendor orbs bob
    this._npcPulse += dt;
    for (const it of this.interactables) {
      it.orb.position.y = it.baseY + Math.sin(this._npcPulse * 2 + it.position.x) * 0.25;
    }

    this.ground.update(dt);

    // living crowd wanders; scatters when a firefight is on
    if (this.crowd) {
      this.crowd.update(dt, { playerPos: this.character.position, alarmed: this.ground.enemyCount > 0 });
    }

    // nearest interactable in reach
    let near = null, nd = Infinity;
    for (const it of this.interactables) {
      const d = Math.hypot(this.character.position.x - it.position.x, this.character.position.z - it.position.z);
      if (d < nd) { nd = d; near = it; }
    }

    const distToPad = Math.hypot(this.character.position.x, this.character.position.z);

    this.hud = {
      world: this.world,
      onFoot: true,
      nearShip: distToPad < 16,
      moving: this.character.moving,
      interact: near && nd < 7 ? { id: near.id, label: near.label } : null,
      ground: this.ground.hudData(),
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

// Simple low-poly NPC (lighter than the player figure).
function makeNPC(color) {
  const g = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.2 });
  const visor = new THREE.MeshStandardMaterial({ color: 0x111820, emissive: 0x224455, emissiveIntensity: 1, roughness: 0.3 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.6, 1.2, 5, 10), suit);
  body.position.y = 1.5;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.48, 12, 10), suit);
  head.position.y = 2.5;
  g.add(head);
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8, 0, Math.PI), visor);
  face.position.set(0, 2.5, 0.26);
  face.rotation.x = Math.PI / 2;
  g.add(face);
  return g;
}
