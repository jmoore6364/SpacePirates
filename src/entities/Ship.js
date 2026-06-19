// Player ship: arcade 6-DOF-ish flight model + a low-poly procedural mesh.
// Orientation is a quaternion; controls apply angular velocity in the ship's
// local frame, thrust pushes along local forward (-Z). Velocity has mild damping
// so it feels arcade (fun-first), not Newtonian-floaty.
import { THREE } from '../renderer/Renderer.js';
import { clamp } from '../util/math.js';

const FWD = new THREE.Vector3(0, 0, -1);

export class Ship {
  constructor(hullId = 'corsair') {
    this.hullId = hullId;
    this.object = buildShipMesh(hullId);

    this.velocity = new THREE.Vector3();
    this.throttle = 0;            // 0..1
    this.maxSpeed = 420;          // units/s at full throttle
    this.thrustAccel = 240;       // how fast we reach target speed
    this.linearDamp = 0.6;        // per-second velocity damping

    // angular response (rad/s at full input) + smoothing
    this.pitchRate = 1.5;
    this.yawRate = 1.1;
    this.rollRate = 2.2;
    this._angVel = new THREE.Vector3(); // x=pitch, y=yaw, z=roll (smoothed)

    this._q = new THREE.Quaternion();
    this._tmp = new THREE.Vector3();
  }

  get position() { return this.object.position; }
  get quaternion() { return this.object.quaternion; }

  get speed() { return this.velocity.length(); }

  forward(out = new THREE.Vector3()) {
    return out.copy(FWD).applyQuaternion(this.object.quaternion);
  }

  // controls: { pitch, yaw, roll } in [-1,1], throttleDelta in [-1,1]
  update(dt, controls) {
    const { pitch = 0, yaw = 0, roll = 0, throttleDelta = 0 } = controls || {};

    // throttle eases toward input
    this.throttle = clamp(this.throttle + throttleDelta * dt * 1.2, 0, 1);

    // smooth angular velocity toward target for weighty feel
    const targetAng = this._tmp.set(
      pitch * this.pitchRate,
      yaw * this.yawRate,
      roll * this.rollRate,
    );
    this._angVel.lerp(targetAng, clamp(dt * 6, 0, 1));

    // apply local-frame rotation
    if (this._angVel.lengthSq() > 1e-8) {
      const e = new THREE.Euler(
        this._angVel.x * dt,
        this._angVel.y * dt,
        this._angVel.z * dt,
        'XYZ',
      );
      this._q.setFromEuler(e);
      this.object.quaternion.multiply(this._q).normalize();
    }

    // thrust toward target velocity along forward
    const target = this.forward(this._tmp).multiplyScalar(this.throttle * this.maxSpeed);
    this.velocity.lerp(target, clamp(this.thrustAccel / Math.max(1, this.maxSpeed) * dt, 0, 1));
    // gentle damping bleeds off drift when throttle drops
    this.velocity.multiplyScalar(1 - clamp(this.linearDamp * dt, 0, 1) * (1 - this.throttle * 0.6));

    this.object.position.addScaledVector(this.velocity, dt);
  }
}

const HULL_LOOK = {
  corsair:     { body: 0x9fb3c8, accent: 0xff5db1, engine: 0x66e0ff, wing: 3.6, scale: 1.0 },
  interceptor: { body: 0x8fd8e6, accent: 0x66e0ff, engine: 0x9effff, wing: 4.4, scale: 0.85 },
  freighter:   { body: 0xb9a489, accent: 0xffb066, engine: 0xffd24a, wing: 2.6, scale: 1.45 },
  gunship:     { body: 0x8a6e74, accent: 0xff5b6e, engine: 0xff8a3c, wing: 5.0, scale: 1.35 },
};

function buildShipMesh(hullId = 'corsair') {
  const L = HULL_LOOK[hullId] || HULL_LOOK.corsair;
  const group = new THREE.Group();

  const hullMat = new THREE.MeshStandardMaterial({ color: L.body, roughness: 0.5, metalness: 0.6 });
  const accentMat = new THREE.MeshStandardMaterial({ color: L.accent, roughness: 0.4, metalness: 0.3, emissive: 0x220a18, emissiveIntensity: 1 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x102030, roughness: 0.1, metalness: 0.9, emissive: 0x0a1c2a, emissiveIntensity: 1 });
  const engineMat = new THREE.MeshBasicMaterial({ color: L.engine });

  // fuselage — boxy for the freighter, sleek cone otherwise
  let body;
  if (hullId === 'freighter') {
    body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.6, 4.6), hullMat);
  } else if (hullId === 'gunship') {
    body = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.2, 4.6, 8), hullMat);
    body.rotation.x = -Math.PI / 2;
  } else {
    body = new THREE.Mesh(new THREE.ConeGeometry(0.9, 4.2, 8), hullMat);
    body.rotation.x = -Math.PI / 2;
  }
  group.add(body);

  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10, 0, Math.PI * 2, 0, Math.PI / 1.6), glassMat);
  cockpit.position.set(0, 0.35, -0.6);
  cockpit.rotation.x = Math.PI / 2;
  group.add(cockpit);

  const wing = new THREE.Mesh(new THREE.BoxGeometry(L.wing, 0.14, 1.3), accentMat);
  wing.position.set(0, -0.1, 0.7);
  group.add(wing);
  if (hullId === 'gunship') { // twin weapon pods
    for (const sx of [-L.wing / 2, L.wing / 2]) {
      const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 2.4, 8), hullMat);
      pod.rotation.x = Math.PI / 2; pod.position.set(sx, -0.1, 0.2); group.add(pod);
    }
  }

  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.0, 1.0), accentMat);
  fin.position.set(0, 0.5, 1.4);
  group.add(fin);

  const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 0.4, 12), engineMat);
  engine.rotation.x = Math.PI / 2;
  engine.position.set(0, -0.05, 2.05);
  group.add(engine);
  group.userData.engine = engine;

  const engineLight = new THREE.PointLight(L.engine, 2, 12);
  engineLight.position.set(0, 0, 2.4);
  group.add(engineLight);

  group.scale.setScalar(L.scale);
  return group;
}
