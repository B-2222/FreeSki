// Follow camera: close and low behind the rider on a smooth spring arm. Follows the
// direction of travel (never the rider's spin), swings a little to the outside of
// turns, turns toward the landing on the way down, pulls out and up for big airs,
// and widens the FOV with speed. Hold right mouse to look around.

import * as THREE from 'three';
import type { RiderState } from '@shared/sim/state';
import type { World } from '@shared/world';

export interface CameraSettings {
  fov: number;
  distance: number;
  height: number;
  stiffness: number;
  tilt: number;
}

export const CAMERA_PRESETS: Record<string, CameraSettings> = {
  follow: { fov: 68, distance: 4.6, height: 1.6, stiffness: 9, tilt: 0.05 },
  close: { fov: 72, distance: 3.0, height: 1.15, stiffness: 12, tilt: 0.02 },
};

const wrap = (a: number) => a - Math.PI * 2 * Math.round(a / (Math.PI * 2));
const k = (dt: number, rate: number) => 1 - Math.exp(-dt * rate);

export class FollowCamera {
  readonly camera: THREE.PerspectiveCamera;
  settings: CameraSettings = { ...CAMERA_PRESETS.follow };
  private yaw = 0;
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private trick = 0;
  private freeYaw = 0;
  private freePitch = 0;
  private dragging = false;
  private initialised = false;

  constructor(aspect: number, dom: HTMLElement) {
    this.camera = new THREE.PerspectiveCamera(68, aspect, 0.1, 3000);
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    dom.addEventListener('mousedown', (e) => {
      if (e.button === 2) this.dragging = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 2) this.dragging = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.dragging) return;
      this.freeYaw -= e.movementX * 0.005;
      this.freePitch = Math.max(-0.6, Math.min(1.0, this.freePitch + e.movementY * 0.004));
    });
  }

  reset(): void {
    this.initialised = false;
  }

  update(dt: number, s: RiderState, riderPos: THREE.Vector3, world: World): void {
    const st = this.settings;
    const v = s.vel;
    const hspeed = Math.hypot(v.x, v.z);
    const speed = Math.hypot(v.x, v.y, v.z);

    // Direction to look along: travel direction, or the skis when nearly stopped.
    let yawTarget: number;
    if (hspeed > 1.5) yawTarget = Math.atan2(-v.x, -v.z);
    else yawTarget = s.heading + (s.switchStance ? Math.PI : 0);
    if (s.mode === 'ground') yawTarget -= s.turnRate * 0.12; // swing to the outside of the turn

    const air = s.mode === 'air';
    const trickWanted = air && s.air.predTotal > 1.2 ? 1 : 0;
    this.trick += (trickWanted - this.trick) * k(dt, trickWanted ? 2.2 : 1.6);

    const target = riderPos.clone().add(new THREE.Vector3(0, 1.1, 0));
    if (!this.initialised) {
      this.yaw = yawTarget;
      this.initialised = true;
      this.pos.copy(target).add(new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).multiplyScalar(st.distance)).add(new THREE.Vector3(0, st.height, 0));
      this.look.copy(target);
    }
    const yawRate = s.mode === 'crash' ? 1.5 : air ? 2.0 : 4.5;
    this.yaw += wrap(yawTarget - this.yaw) * k(dt, yawRate);

    if (!this.dragging) {
      this.freeYaw += -this.freeYaw * k(dt, 3);
      this.freePitch += -this.freePitch * k(dt, 3);
    }

    let dist = st.distance + speed * 0.035;
    let height = st.height + speed * 0.015;
    if (s.mode === 'crash') { dist += 1.6; height += 1.0; }
    dist += (7.6 - dist) * this.trick;
    height += (3.4 - height) * this.trick;
    const yaw = this.yaw + this.freeYaw;
    const back = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const desired = target.clone()
      .addScaledVector(back, dist * Math.cos(this.freePitch))
      .add(new THREE.Vector3(0, height + Math.sin(this.freePitch) * dist, 0));
    const ground = world.terrain.height(desired.x, desired.z) + 0.7;
    if (desired.y < ground) desired.y = ground;

    // Move with the rider (feed-forward) so the spring only smooths changes instead of
    // trailing further behind the faster you go. Vertical follows partly, so landings
    // and bumps don't shake the view.
    this.pos.x += v.x * dt;
    this.pos.z += v.z * dt;
    this.pos.y += v.y * dt * (air ? 0.85 : 0.6);
    const stiff = air ? st.stiffness * 0.6 : st.stiffness;
    const kh = k(dt, stiff);
    const kv = k(dt, stiff * 0.8);
    this.pos.x += (desired.x - this.pos.x) * kh;
    this.pos.z += (desired.z - this.pos.z) * kh;
    this.pos.y += (desired.y - this.pos.y) * kv;
    const g2 = world.terrain.height(this.pos.x, this.pos.z) + 0.5;
    if (this.pos.y < g2) this.pos.y = g2;

    // Look slightly ahead; on the way down in a big air, turn toward the landing.
    const ahead = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const lookTarget = target.clone().addScaledVector(ahead, 2.0 + speed * 0.05);
    lookTarget.y -= st.tilt * dist;
    if (air && v.y < 0 && s.air.predTotal > 0.6) {
      const lp = new THREE.Vector3(s.air.predPoint.x, s.air.predPoint.y + 1, s.air.predPoint.z);
      const w = Math.min(1, -v.y / 8) * 0.45;
      lookTarget.lerp(lp, w);
    }
    this.look.lerp(lookTarget, k(dt, 10));
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);

    const fov = st.fov + Math.min(1, speed / 28) * 16 * (1 - this.trick * 0.5) + this.trick * 4;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov += (fov - this.camera.fov) * k(dt, 4);
      this.camera.updateProjectionMatrix();
    }
  }
}
