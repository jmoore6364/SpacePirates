// On-foot 3rd-person camera. Trails behind the character; its yaw eases toward
// the character's heading so "forward" stays consistent. Exposes `yaw` so the
// walk controller can build camera-relative movement before the camera updates.
import { THREE } from '../renderer/Renderer.js';
import { clamp, wrapAngle } from '../util/math.js';

export class ThirdPersonCamera {
  constructor(camera, { dist = 14, height = 7, look = 2.4 } = {}) {
    this.camera = camera;
    this.dist = dist;
    this.height = height;
    this.look = look;
    this.yaw = Math.PI;
    this._desired = new THREE.Vector3();
    this._lookAt = new THREE.Vector3();
    this._init = false;
  }

  update(dt, target) {
    this.yaw += wrapAngle(target.heading - this.yaw) * clamp(dt * 4, 0, 1);

    this._desired.set(
      target.position.x - Math.sin(this.yaw) * this.dist,
      target.position.y + this.height,
      target.position.z - Math.cos(this.yaw) * this.dist,
    );

    if (!this._init) { this.camera.position.copy(this._desired); this._init = true; }
    else this.camera.position.lerp(this._desired, clamp(dt * 6, 0, 1));

    this._lookAt.copy(target.position); this._lookAt.y += this.look;
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this._lookAt);
  }
}
