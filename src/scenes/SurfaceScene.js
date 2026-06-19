// Pass 3: on-foot surface scene. Walk a 3rd-person character through a procedural
// neon city after landing. Take off (T) to return to space.
import { THREE } from '../renderer/Renderer.js';
import { Character } from '../entities/Character.js';
import { ThirdPersonCamera } from '../core/ThirdPersonCamera.js';
import { Ship } from '../entities/Ship.js';
import { buildCity } from './city.js';
import { GroundCombat } from '../systems/GroundCombat.js';

export class SurfaceScene {
  constructor(input, world, threat = 0) {
    this.input = input;
    this.world = world;
    this.threat = threat;
    this.onEvent = null; // main sets this for toasts
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
    this.heightAt = city.heightAt;

    // landed ship on the pad (plaza is flat)
    this.parkedShip = new Ship();
    this.parkedShip.object.position.copy(city.padPosition).setY(1.4);
    this.parkedShip.object.rotation.set(-0.08, Math.PI * 0.85, 0);
    this.parkedShip.object.scale.setScalar(1.6);
    this.scene.add(this.parkedShip.object);

    // character at the spawn point, grounded to terrain
    this.character = new Character();
    this.character.groundSampler = this.heightAt;
    this.character.position.copy(city.spawn).setY(this.heightAt(city.spawn.x, city.spawn.z));
    this.character.heading = Math.PI; // face the city
    this.scene.add(this.character.object);

    // vendors / interactables + ambient NPCs
    this.interactables = [];
    this._addVendor('shop', 'Trader', new THREE.Vector3(22, 0, -2), 0xffe6a0);
    this._addVendor('missions', 'Mission Board', new THREE.Vector3(-22, 0, -6), 0x66e0ff);
    this._addVendor('market', 'Market', new THREE.Vector3(0, 0, -26), 0xff5db1);
    this._addAmbientNPCs();

    // on-foot blaster combat — enforcers come if you landed with heat on you
    this.ground = new GroundCombat(this.scene, this.character, input, {
      spawn: city.spawn.clone(),
      groundY: this.heightAt,
      onEvent: (e) => { if (this.onEvent) this.onEvent(e); },
    });
    if (threat > 0) this.ground.spawnWave(Math.min(threat + 1, 6));

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

    this.interactables.push({ id, label, position: pos.clone(), orb, baseY: gy + 5.2 });
  }

  _addAmbientNPCs() {
    const palette = [0x8a93a8, 0x6f7fa8, 0xb5723a, 0x3f8f5a, 0x9a6fb0];
    this.ambient = [];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const rad = 26 + (i % 3) * 9;
      const npc = makeNPC(palette[i % palette.length]);
      const nx = Math.cos(a) * rad, nz = Math.sin(a) * rad - 30;
      const gy = this.heightAt ? this.heightAt(nx, nz) : 0;
      npc.position.set(nx, gy, nz);
      npc.rotation.y = a;
      this.scene.add(npc);
      this.ambient.push({ npc, base: npc.position.clone(), phase: i, groundY: gy });
    }
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

    // vendor orbs bob; ambient NPCs sway
    this._npcPulse += dt;
    for (const it of this.interactables) {
      it.orb.position.y = it.baseY + Math.sin(this._npcPulse * 2 + it.position.x) * 0.25;
    }
    for (const a of this.ambient) {
      a.npc.position.y = a.groundY + Math.abs(Math.sin(this._npcPulse * 1.5 + a.phase)) * 0.12;
      a.npc.rotation.y += dt * 0.2;
    }

    // nearest interactable in reach
    let near = null, nd = Infinity;
    for (const it of this.interactables) {
      const d = Math.hypot(this.character.position.x - it.position.x, this.character.position.z - it.position.z);
      if (d < nd) { nd = d; near = it; }
    }

    this.ground.update(dt);

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
