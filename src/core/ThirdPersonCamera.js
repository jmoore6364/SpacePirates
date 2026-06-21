// On-foot 3rd-person camera with free look. Orbits the character at a distance set
// by yaw (turn) and pitch (look up/down); yaw eases toward the character heading so
// movement stays consistent, while pitch is driven directly by the look controller.
import { THREE } from '../renderer/Renderer.js';
import { clamp, wrapAngle } from '../util/math.js';

export class ThirdPersonCamera {
  constructor(camera, { dist = 14, height = 7, aimDist = 20, aimHeight = 1.7 } = {}) {
    this.camera = camera;
    this.dist = dist;
    this.height = height;
    this.aimDist = aimDist;     // how far ahead the screen-center aim point sits
    this.aimHeight = aimHeight; // its height above the character (≈ chest)
    this.yaw = Math.PI;
    this.pitch = 0; // radians; + looks down on the character, - looks up
    this._desired = new THREE.Vector3();
    // world point the screen-center reticle is on — the blaster fires here so shots
    // always land under the crosshair. Read by the scene/combat each frame.
    this.aimPoint = new THREE.Vector3();
    this._init = false;
  }

  // pitch01 in [-1,1]: negative (cursor up) looks UP, positive looks DOWN. The camera
  // looks at an aim point a fixed distance ahead at ~chest height; pitch raises/lowers
  // it so center-screen tracks where you want to shoot.
  update(dt, target, pitch01 = 0) {
    this.yaw += wrapAngle(target.heading - this.yaw) * clamp(dt * 14, 0, 1);
    this.pitch += (clamp(pitch01, -1, 1) - this.pitch) * clamp(dt * 10, 0, 1);

    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);

    // camera trails at a fixed ring; height nudges with pitch but stays above ground
    const ox = -fx * this.dist;
    const oz = -fz * this.dist;
    const oy = Math.max(1.5, this.height + this.pitch * 5);
    this._desired.set(target.position.x + ox, target.position.y + oy, target.position.z + oz);

    if (!this._init) { this.camera.position.copy(this._desired); this._init = true; }
    else this.camera.position.lerp(this._desired, clamp(dt * 6, 0, 1));

    // aim point ahead at chest height; pitch raises (look up) or drops (look down) it
    this.aimPoint.set(
      target.position.x + fx * this.aimDist,
      target.position.y + this.aimHeight - this.pitch * 22,
      target.position.z + fz * this.aimDist,
    );
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.aimPoint);
  }
}
