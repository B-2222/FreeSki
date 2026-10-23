// Flight: ballistic motion with drag, spin / flip / roll while keys are held, settling to
// the nearest landable orientation when released, grabs, and touchdown judgment.

import { PI, RAD, TAU, wrapAngle } from '../math/dmath';
import { clamp, clamp01, smoothstep } from '../math/smooth';
import { type V3, vAddScaled, vClone, vDot, vLen, vLerp, vNorm } from '../math/vec3';
import { DT, PHYS } from './constants';
import {
  type Ctx, K, checkRailHit, flipInput, isReleased, popAmount, rollInput, spinInput, trackSpace, tryRailSnap,
} from './common';
import { bodyUp, poseQuat, yawOf } from './frame';
import { BTN, GRAB_BITS } from './input';
import { judgeLanding } from './landing';
import { dragK } from './predict';
import type { AirState, RiderState } from './state';
import { enterCrash, landOnGround, repredict } from './transitions';

const KDRAG = dragK(PHYS.cdaStand);
const UPV: V3 = { x: 0, y: 1, z: 0 };

/** One rotation axis: held key drives a fixed rate, release settles to a latched target. */
function axisStep(
  angle: number, rate: number, input: number, baseRate: number,
  settling: boolean, target: number, maxSettle: number,
): [number, number] {
  let want: number, k: number;
  if (input !== 0 || !settling) {
    want = input * baseRate;
    k = K.rot;
  } else {
    want = clamp((target - angle) / PHYS.settleTau, -maxSettle, maxSettle);
    k = K.settle;
  }
  rate += (want - rate) * k;
  return [angle + rate * DT, rate];
}

function updateGrab(a: AirState, c: Ctx): void {
  if (a.grab && (c.held & GRAB_BITS[a.grab]) === 0) {
    a.grab = 0;
    a.grabHeld = 0;
  }
  let fresh = 0;
  for (let id = 1; id < GRAB_BITS.length; id++) {
    if (c.pressed & GRAB_BITS[id]) { fresh = id; break; }
  }
  if (fresh && fresh !== a.grab) {
    a.grab = fresh;
    a.grabHeld = 0;
  } else if (!a.grab) {
    for (let id = 1; id < GRAB_BITS.length; id++) {
      if (c.held & GRAB_BITS[id]) { a.grab = id; a.grabHeld = 0; break; }
    }
  }
  if (a.grab) {
    a.grabHeld += DT;
    if (a.grabHeld > a.grabTimes[a.grab]) a.grabTimes[a.grab] = a.grabHeld;
  }
}

export function stepAir(s: RiderState, c: Ctx): void {
  const a = s.air;
  const terrain = c.w.terrain;
  a.t += DT;
  trackSpace(s, c);

  // Slightly late pop right after leaving the lip.
  if (a.coyote > 0) {
    a.coyote -= DT;
    if (isReleased(c, BTN.POP) && !a.popped) {
      const amt = popAmount(s.spaceHold) * PHYS.popCoyoteFactor;
      s.vel.y += amt;
      a.popped = true;
      c.ev.push({ type: 'pop', amount: amt });
      repredict(s, c);
    }
  }

  updateGrab(a, c);
  const boost = a.grab ? PHYS.grabBoost : 1;

  // ---- Rotation
  const look = PHYS.settleLookahead;
  const si = spinInput(c);
  if (si !== 0) a.spinSettling = false;
  else if (!a.spinSettling) {
    // Nearest landable heading: skis along the travel direction, forward or switch.
    const hv = Math.sqrt(s.vel.x * s.vel.x + s.vel.z * s.vel.z);
    const velYaw = hv > 0.5 ? yawOf(s.vel) : a.heading0;
    const h = a.heading0 + a.spin + a.spinRate * look;
    const k = Math.round((h - velYaw) / PI);
    a.spinTarget = velYaw + k * PI - a.heading0;
    a.spinSettling = true;
  }
  [a.spin, a.spinRate] = axisStep(a.spin, a.spinRate, si, PHYS.spinRate * boost, a.spinSettling, a.spinTarget, PHYS.settleMaxSpin);

  const fi = flipInput(c);
  if (fi !== 0) a.flipSettling = false;
  else if (!a.flipSettling) {
    a.flipTarget = TAU * Math.round((a.flip + a.flipRate * look) / TAU);
    a.flipSettling = true;
  }
  [a.flip, a.flipRate] = axisStep(a.flip, a.flipRate, fi, PHYS.flipRate * boost, a.flipSettling, a.flipTarget, PHYS.settleMaxFlip);

  const ri = rollInput(c);
  if (ri !== 0) a.rollSettling = false;
  else if (!a.rollSettling) {
    a.rollTarget = TAU * Math.round((a.roll + a.rollRate * look) / TAU);
    a.rollSettling = true;
  }
  [a.roll, a.rollRate] = axisStep(a.roll, a.rollRate, ri, PHYS.rollRate * boost, a.rollSettling, a.rollTarget, PHYS.settleMaxFlip);

  // ---- Base frame: follow the trajectory, then line up with the predicted landing slope.
  const sp = vLen(s.vel);
  let tn: V3 = UPV;
  if (sp > 1) {
    const vh = vNorm(s.vel);
    const t = vAddScaled(UPV, vh, -vh.y);
    const w = clamp01((sp - 3) / 6);
    if (vLen(t) > 0.2) tn = vNorm(vLerp(UPV, vNorm(t), w));
  }
  const blend = a.predTotal > 0 ? smoothstep(0.45, 0.92, a.t / a.predTotal) : 0;
  const target = vNorm(vLerp(tn, a.predNormal, blend));
  a.frameUp = vNorm(vLerp(a.frameUp, target, K.frameUp));
  s.q = poseQuat(a.frameUp, a.heading0 + a.spin, a.flip, a.roll);

  // Count inversions (head below the horizon of the base frame).
  const upDot = vDot(bodyUp(s.q), a.frameUp);
  if (!a.inverted && upDot < -0.2) { a.inverted = true; a.inversions++; }
  else if (a.inverted && upDot > 0.2) a.inverted = false;

  // ---- Ballistic motion
  const v = s.vel;
  v.y -= PHYS.g * DT;
  const f = 1 - KDRAG * sp * DT;
  v.x *= f; v.y *= f; v.z *= f;
  const prev = vClone(s.pos);
  s.pos = { x: s.pos.x + v.x * DT, y: s.pos.y + v.y * DT, z: s.pos.z + v.z * DT };
  if (s.pos.y > a.peakY) a.peakY = s.pos.y;

  if (tryRailSnap(s, c, prev)) return;
  if (checkRailHit(s, c)) return;

  const gs = terrain.sample(s.pos.x, s.pos.z);
  if (s.pos.y <= gs.h) {
    s.pos.y = gs.h;
    const impact = Math.max(0, -vDot(s.vel, gs.n));
    const minor = !a.fromKicker && !a.popped && !a.fromRail;
    const soft = (a.t < 0.2 || (minor && a.t < PHYS.minorAirTime)) && impact < 4 && vDot(bodyUp(s.q), gs.n) > 0.6 && !a.grab;
    if (soft) {
      landOnGround(s, gs, null);
      c.ev.push({ type: 'touch' });
      return;
    }
    // Judge the pose a moment after touchdown: rotation still going at landing carries on.
    const cr = PHYS.landingCarry;
    const qj = poseQuat(a.frameUp, a.heading0 + a.spin + a.spinRate * cr, a.flip + a.flipRate * cr, a.roll + a.rollRate * cr);
    const j = judgeLanding(qj, s.vel, gs.n, a.grab !== 0);
    c.ev.push({
      type: 'land',
      quality: j.quality,
      spinDeg: a.spin * RAD,
      flipDeg: a.flip * RAD,
      rollDeg: a.roll * RAD,
      inversions: a.inversions,
      airTime: a.t,
      height: a.peakY - a.takeoffPos.y,
      impact: j.impact,
      smack: j.impact > PHYS.smackImpact,
      switchLanding: j.switchLanding,
      grabTimes: a.grabTimes.slice(),
      grabbingAtLanding: a.grab !== 0,
      yawErr: j.yawErr,
      pitchErr: j.pitchErr,
      rollErr: j.rollErr,
      reason: j.reason,
      fromKicker: a.fromKicker,
      fromRail: a.fromRail,
    });
    if (j.quality === 'crash') enterCrash(s, c, j.reason, j.impact, false, gs.n);
    else landOnGround(s, gs, j);
    return;
  }

  // Head or body hitting the snow before the skis.
  const up = bodyUp(s.q);
  const hx = s.pos.x + up.x * 1.4, hy = s.pos.y + up.y * 1.4, hz = s.pos.z + up.z * 1.4;
  if (up.y < 0.3 && hy < terrain.height(hx, hz)) {
    enterCrash(s, c, 'head first', vLen(s.vel), true);
    return;
  }

  if (s.tick % 12 === 0) repredict(s, c);
  s.heading = wrapAngle(a.heading0 + a.spin);
}
