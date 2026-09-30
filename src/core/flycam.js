// Free-fly debug camera driven by core/input.js (used by the bootstrap and the demos until the car owns the camera).
//   createFlyCamera(camera, input, { speed = 25, groundAt = (x, z) => 0, clearance = 1.5 }) -> fly
//     fly.update(dt)                WASD / arrows move, Space / Ctrl up / down, Shift x6, wheel changes speed, mouse looks
//     fly.setPose(pos, yaw, pitch)  yaw 0 looks toward -z; pitch + looks up (radians)
//     fly.yaw, fly.pitch, fly.speed, fly.enabled
import * as THREE from 'three';

export function createFlyCamera(camera, input, { speed = 25, groundAt = () => 0, clearance = 1.5 } = {}) {
  let yaw = 0, pitch = -0.15;
  const v = new THREE.Vector3(), fwd = new THREE.Vector3(), side = new THREE.Vector3(), euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const fly = {
    enabled: true,
    speed,
    get yaw() { return yaw; },
    get pitch() { return pitch; },
    setPose(pos, y = yaw, p = pitch) { camera.position.copy(pos); yaw = y; pitch = p; apply(); },
    update(dt) {
      if (!fly.enabled) return;
      const I = input.poll(dt);
      yaw -= I.look.dx * 0.0022;
      pitch = THREE.MathUtils.clamp(pitch - I.look.dy * 0.0022, -1.5, 1.5);
      if (I.wheel) fly.speed = THREE.MathUtils.clamp(fly.speed * Math.pow(1.25, -I.wheel), 2, 800);
      fwd.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      side.set(Math.cos(yaw), 0, -Math.sin(yaw));
      v.set(0, 0, 0).addScaledVector(fwd, I.move.y).addScaledVector(side, I.move.x);
      v.y += (I.jump ? 1 : 0) - (I.drop ? 1 : 0);
      if (v.lengthSq() > 1) v.normalize();
      camera.position.addScaledVector(v, fly.speed * (I.sprint ? 6 : 1) * dt);
      const floor = groundAt(camera.position.x, camera.position.z) + clearance;
      if (camera.position.y < floor) camera.position.y = floor;
      apply();
    },
  };
  function apply() { euler.set(pitch, yaw, 0); camera.quaternion.setFromEuler(euler); }
  apply();
  return fly;
}
