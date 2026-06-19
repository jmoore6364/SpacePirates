// Smooth 3rd-person chase camera that trails a target Object3D, sitting behind
// and above it in the target's local frame, with speed-based pull-back.
import { THREE } from '../renderer/Renderer.js';
import { clamp } from '../util/math.js';

export class ChaseCamera {
  constructor(camera, { back = 9, up = 3.2, lookAhead = 10 } = {}) {
    this.camera = camera;
    this.back = back;
    this.up = up;
    this.lookAhead = lookAhead;
    this._desired = new THREE.Vector3();
    this._lookAt = new THREE.Vector3();
    this._offset = new THREE.Vector3();
    this._initialized = false;
  }

  // speed01 in [0,1] pulls the camera back a bit at high speed for a sense of velocity.
  update(dt, target, speed01 = 0) {
    const back = this.back * (1 + speed01 * 0.5);
    const up = this.up;

    this._offset.set(0, up, back).applyQuaternion(target.quaternion);
    this._desired.copy(target.position).add(this._offset);

    if (!this._initialized) {
      this.camera.position.copy(this._desired);
      this._initialized = true;
    } else {
      const t = clamp(dt * 5, 0, 1);
      this.camera.position.lerp(this._desired, t);
    }

    this._lookAt.set(0, 0, -this.lookAhead).applyQuaternion(target.quaternion).add(target.position);
    this.camera.up.set(0, 1, 0).applyQuaternion(target.quaternion);
    this.camera.lookAt(this._lookAt);
  }
}
