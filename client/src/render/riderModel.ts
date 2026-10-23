// Simple primitive skier (milestone 1 placeholder for the proper model in milestone 4).
// Limbs are cylinders placed between joints solved with two-bone IK, so crouch, tuck,
// grabs, pole plants, switch stance and crashes all read clearly.
// Body frame: +X right, +Y up, -Z forward; the root sits at the ski base.

import * as THREE from 'three';
import { GRAB } from '@shared/sim/input';
import type { RiderMode } from '@shared/sim/state';

export interface RiderPose {
  mode: RiderMode;
  /** Carve lean (rad, + = left); the root already leans, the model adds angulation. */
  lean: number;
  crouch: number;
  tuck: number;
  grab: number;
  switchStance: boolean;
  poleAnim: number;
  braking: boolean;
  wobble: number;
  airT: number;
  railT: number;
}

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UPY = V(0, 1, 0);

function ik2(root: THREE.Vector3, target: THREE.Vector3, l1: number, l2: number, pole: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  const d = target.clone().sub(root);
  let dist = d.length();
  const maxD = l1 + l2 - 1e-3;
  const minD = Math.abs(l1 - l2) + 1e-3;
  dist = Math.min(maxD, Math.max(minD, dist));
  const dn = d.normalize();
  const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const pp = pole.clone().addScaledVector(dn, -pole.dot(dn));
  if (pp.lengthSq() < 1e-8) pp.set(0, 0, -1);
  pp.normalize();
  return out.copy(root).addScaledVector(dn, a).addScaledVector(pp, h);
}

function placeSeg(m: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3): void {
  const d = b.clone().sub(a);
  const len = d.length();
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.scale.set(1, Math.max(len, 1e-3), 1);
  if (len > 1e-6) m.quaternion.setFromUnitVectors(UPY, d.multiplyScalar(1 / len));
}

const smooth = (cur: number, target: number, dt: number, tau: number) => cur + (target - cur) * (1 - Math.exp(-dt / tau));

export class RiderModel {
  readonly root = new THREE.Group();
  /** Inner group, offset for powder sink / lying on the snow. */
  readonly body = new THREE.Group();
  private skis: THREE.Group[] = [];
  private seg: Record<string, THREE.Mesh> = {};
  private joints: Record<string, THREE.Mesh> = {};
  private head = new THREE.Group();
  private torso: THREE.Mesh;
  private pelvis: THREE.Mesh;
  private grabAmt = 0;
  private shownGrab = 0;
  private time = 0;

  constructor(colors = { jacket: '#ff6a2b', pants: '#25324d', helmet: '#f4f4f4', skis: '#16c1d6', gloves: '#1b1b1f' }) {
    this.root.add(this.body);
    const mat = (c: string, rough = 0.7, metal = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal });
    const jacket = mat(colors.jacket, 0.65);
    const pants = mat(colors.pants, 0.75);
    const helmet = mat(colors.helmet, 0.35);
    const skiMat = mat(colors.skis, 0.4);
    const gloves = mat(colors.gloves, 0.8);
    const boot = mat('#2c2f36', 0.5);
    const poleMat = mat('#c9ced6', 0.3, 0.8);
    const goggleMat = new THREE.MeshStandardMaterial({ color: '#ffb02e', roughness: 0.1, metalness: 0.9, emissive: '#3a1f00' });

    // Skis with an upturned tip and a boot.
    for (let i = 0; i < 2; i++) {
      const g = new THREE.Group();
      const ski = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.022, 1.62), skiMat);
      ski.position.set(0, 0.011, -0.05);
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.02, 0.2), skiMat);
      tip.position.set(0, 0.04, -0.93);
      tip.rotation.x = 0.42;
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.02, 0.14), skiMat);
      tail.position.set(0, 0.03, 0.81);
      tail.rotation.x = -0.32;
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.3), boot);
      b.position.set(0, 0.1, 0.0);
      g.add(ski, tip, tail, b);
      this.skis.push(g);
      this.body.add(g);
    }

    const cyl = (r: number, m: THREE.Material) => {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 10), m);
      this.body.add(c);
      return c;
    };
    const ball = (r: number, m: THREE.Material) => {
      const s = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), m);
      this.body.add(s);
      return s;
    };
    for (const side of ['L', 'R']) {
      this.seg['thigh' + side] = cyl(0.078, pants);
      this.seg['shin' + side] = cyl(0.068, pants);
      this.seg['upper' + side] = cyl(0.058, jacket);
      this.seg['fore' + side] = cyl(0.052, jacket);
      this.seg['pole' + side] = cyl(0.011, poleMat);
      this.joints['knee' + side] = ball(0.075, pants);
      this.joints['hand' + side] = ball(0.058, gloves);
      this.joints['shoulder' + side] = ball(0.075, jacket);
      this.joints['elbow' + side] = ball(0.056, jacket);
    }
    this.torso = cyl(0.17, jacket);
    this.pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.2), pants);
    this.body.add(this.pelvis);

    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), helmet);
    const goggles = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.065, 0.06), goggleMat);
    goggles.position.set(0, 0.0, -0.11);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.12, 8), jacket);
    neck.position.set(0, -0.12, 0);
    this.head.add(skull, goggles, neck);
    this.body.add(this.head);

    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
  }

  update(p: RiderPose, dt: number): void {
    this.time += dt;
    const air = p.mode === 'air';
    const crash = p.mode === 'crash';
    const rail = p.mode === 'rail';

    // Grab blend in/out (keep the last grab while fading out).
    if (p.grab) this.shownGrab = p.grab;
    this.grabAmt = smooth(this.grabAmt, air && p.grab ? 1 : 0, dt, 0.06);
    if (this.grabAmt < 0.01 && !p.grab) this.shownGrab = 0;
    const ga = this.grabAmt;
    const G = this.shownGrab;

    // ---- Lower body
    let hipY = 0.93 - 0.3 * p.crouch - 0.34 * p.tuck;
    let hipZ = 0.06 + 0.1 * p.crouch + 0.12 * p.tuck;
    let torsoPitch = 0.22 + 0.35 * p.crouch + 0.95 * p.tuck;
    let torsoYaw = 0;
    let headYaw = 0;
    const lift = [0, 0];
    const skiYaw = [0, 0];
    const skiPitch = [0, 0];
    const footZ = [0, 0];
    if (air) {
      hipY = 0.86 - 0.12 * p.crouch;
      lift[0] = lift[1] = 0.1 + 0.22 * ga;
      torsoPitch = 0.3 + 0.25 * ga;
    }
    if (rail) {
      hipY = 0.8;
      torsoPitch = 0.3;
    }
    if (G === GRAB.MUTE) {
      skiYaw[0] = -0.36 * ga; skiYaw[1] = 0.36 * ga;
      torsoYaw = 0.4 * ga;
    } else if (G === GRAB.TAIL) {
      lift[1] += 0.12 * ga;
      torsoYaw = -0.3 * ga;
    } else if (G === GRAB.JAPAN) {
      hipY += 0.04 * ga;
      lift[1] += 0.2 * ga;
      skiPitch[1] = 1.0 * ga;
      footZ[1] = -0.12 * ga;
      torsoYaw = 0.3 * ga;
    } else if (G === GRAB.SAFETY) {
      lift[0] += 0.08 * ga; lift[1] += 0.08 * ga;
    } else if (G === GRAB.BLUNT) {
      lift[0] += 0.18 * ga;
      skiPitch[0] = 0.7 * ga;
      footZ[0] = -0.1 * ga;
      torsoYaw = -0.2 * ga;
    }
    if (p.switchStance && !air && !crash) {
      torsoYaw += 0.35;
      headYaw = 2.3;
    }
    // Carving: hips drop and the upper body angulates back toward vertical.
    const leanAbs = Math.abs(p.lean);
    if (p.mode === 'ground') hipY -= 0.2 * Math.min(1, leanAbs / 0.9);
    const angQ = new THREE.Quaternion().setFromAxisAngle(V(0, 0, -1), p.mode === 'ground' ? 0.38 * p.lean : 0);
    if (crash) {
      hipY = 0.9;
      torsoPitch = 0;
      lift[0] = lift[1] = 0;
    }

    const sides = [-1, 1];
    const ankle: THREE.Vector3[] = [];
    for (let i = 0; i < 2; i++) {
      const ski = this.skis[i];
      ski.position.set(sides[i] * 0.13, lift[i], footZ[i]);
      ski.rotation.set(skiPitch[i], skiYaw[i], 0, 'YXZ');
      ski.updateMatrix();
      ankle.push(V(0, 0.12, 0).applyMatrix4(ski.matrix));
    }
    const pelvisC = V(0, hipY, hipZ);
    const yawQ = new THREE.Quaternion().setFromAxisAngle(UPY, torsoYaw);
    const right = V(1, 0, 0).applyQuaternion(yawQ).applyQuaternion(angQ);
    const torsoDir = V(0, Math.cos(torsoPitch), -Math.sin(torsoPitch)).applyQuaternion(yawQ).applyQuaternion(angQ);
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 'L' : 'R';
      const hip = pelvisC.clone().addScaledVector(V(1, 0, 0), sides[i] * 0.1);
      const knee = ik2(hip, ankle[i], 0.47, 0.47, V(sides[i] * 0.15, 0, -1), V());
      placeSeg(this.seg['thigh' + s], hip, knee);
      placeSeg(this.seg['shin' + s], knee, ankle[i]);
      this.joints['knee' + s].position.copy(knee);
    }
    this.pelvis.position.copy(pelvisC);
    this.pelvis.quaternion.copy(yawQ);

    // ---- Upper body
    const chest = pelvisC.clone().addScaledVector(torsoDir, 0.5);
    placeSeg(this.torso, pelvisC.clone().addScaledVector(torsoDir, 0.05), chest);
    const neckBase = chest.clone().addScaledVector(torsoDir, 0.1);
    this.head.position.copy(neckBase).add(V(0, 0.17, 0));
    this.head.rotation.set(-torsoPitch * 0.35, torsoYaw + headYaw, p.mode === 'ground' ? 0.5 * p.lean : 0, 'YXZ');

    const skiPoint = (i: number, x: number, y: number, z: number) => V(x, y, z).applyMatrix4(this.skis[i].matrix);
    const hands: THREE.Vector3[] = [];
    const t = this.time;
    for (let i = 0; i < 2; i++) {
      let h: THREE.Vector3;
      if (crash) h = V(sides[i] * 0.62, hipY + 0.45, -0.15 + Math.sin(t * 9 + i) * 0.15);
      else if (rail) h = V(sides[i] * 0.58, hipY + 0.38, -0.12);
      else if (p.tuck > 0.05 && !air) h = V(sides[i] * (0.32 - 0.19 * p.tuck), hipY + 0.08 + 0.18 * p.tuck, -0.32 - 0.2 * p.tuck);
      else if (p.poleAnim > 0 && !air) {
        const ph = 1 - p.poleAnim;
        h = V(sides[i] * 0.3, hipY + 0.15 - 0.3 * ph, -0.5 + 0.7 * ph);
      } else if (air) h = V(sides[i] * 0.4, hipY + 0.25, -0.3);
      else h = V(sides[i] * 0.34, hipY + 0.06 + 0.1 * p.crouch, -0.3);
      if (p.wobble > 0) h.add(V(0, Math.sin(t * 17 + i * 2) * 0.3 * p.wobble, Math.cos(t * 13 + i) * 0.15 * p.wobble));
      h.sub(pelvisC).applyQuaternion(angQ).add(pelvisC);
      hands.push(h);
    }
    // Grab targets: right hand (index 1) for most grabs, left hand for blunt.
    if (G) {
      let gi = 1;
      let tgt: THREE.Vector3;
      if (G === GRAB.MUTE) tgt = skiPoint(0, 0, 0.06, -0.25);
      else if (G === GRAB.TAIL) tgt = skiPoint(1, 0, 0.05, 0.62);
      else if (G === GRAB.JAPAN) tgt = skiPoint(0, 0, 0.07, 0.2);
      else if (G === GRAB.SAFETY) tgt = skiPoint(1, 0.07, 0.04, -0.02);
      else { gi = 0; tgt = skiPoint(0, 0, 0.05, -0.68); }
      hands[gi].lerp(tgt, ga);
      const free = 1 - gi;
      hands[free].lerp(V(sides[free] * 0.62, hipY + 0.55, 0.12), ga);
    }

    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 'L' : 'R';
      const sh = chest.clone().addScaledVector(right, sides[i] * 0.2);
      const elbow = ik2(sh, hands[i], 0.3, 0.3, V(sides[i] * 0.8, -0.4, 0.5), V());
      placeSeg(this.seg['upper' + s], sh, elbow);
      placeSeg(this.seg['fore' + s], elbow, hands[i]);
      this.joints['shoulder' + s].position.copy(sh);
      this.joints['elbow' + s].position.copy(elbow);
      this.joints['hand' + s].position.copy(hands[i]);
      // Poles: planted ahead during a push, trailing behind otherwise.
      let tip: THREE.Vector3;
      if (p.poleAnim > 0 && !air && !crash) {
        const ph = 1 - p.poleAnim;
        tip = V(sides[i] * 0.42, 0.02, -0.7 + 1.4 * ph);
      } else if (p.tuck > 0.05 && !air) tip = hands[i].clone().add(V(sides[i] * 0.05, 0.25, 1.2));
      else if (G && ga > 0.3) tip = hands[i].clone().add(V(sides[i] * 0.3, -0.2, 1.1));
      else tip = V(sides[i] * 0.5, 0.08, 0.55);
      const dir = tip.sub(hands[i]).normalize();
      placeSeg(this.seg['pole' + s], hands[i], hands[i].clone().addScaledVector(dir, 1.15));
    }
  }
}
