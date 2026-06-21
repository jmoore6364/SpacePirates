// On-foot 3rd-person camera with free look. Orbits the character at a distance set
// by yaw (turn) and pitch (look up/down); yaw eases toward the character heading so
// movement stays consistent, while pitch is driven directly by the look controller.
import { THREE } from '../renderer/Renderer.js';
import { clamp, wrapAngle } from '../util/math.js';

export class ThirdPersonCamera {
  constructor(camera, { dist = 14, height = 7, look = 2.4 } = {}) {
    this.camera = camera;
    this.dist = dist;
    this.height = height;
    this.look = look;
    this.yaw = Math.PI;
    this.pitch = 0; // radians; + looks down on the character, - looks up
    this._desired = new THREE.Vector3();
    this._lookAt = new THREE.Vector3();
    this._init = false;
  }

  // pitch01 in [-1,1]: negative (cursor up) looks UP, positive looks DOWN. The view
  // is steered mostly by the aim point so the camera never clips through the ground.
  update(dt, target, pitch01 = 0) {
    this.yaw += wrapAngle(target.heading - this.yaw) * clamp(dt * 4, 0, 1);
    this.pitch += (clamp(pitch01, -1, 1) - this.pitch) * clamp(dt * 8, 0, 1);

    // camera trails at a fixed ring; height nudges with pitch but stays above ground
    const ox = -Math.sin(this.yaw) * this.dist;
    const oz = -Math.cos(this.yaw) * this.dist;
    const oy = Math.max(1.5, this.height + this.pitch * 5);
    this._desired.set(target.position.x + ox, target.position.y + oy, target.position.z + oz);

    if (!this._init) { this.camera.position.copy(this._desired); this._init = true; }
    else this.camera.position.lerp(this._desired, clamp(dt * 6, 0, 1));

    // aim point rises (look up) or drops (look down) with pitch — this is the view tilt
    this._lookAt.copy(target.position);
    this._lookAt.y += this.look - this.pitch * 14;
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this._lookAt);
  }
}
