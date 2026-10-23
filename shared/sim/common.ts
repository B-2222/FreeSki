// Shared helpers for the rider sim: input decoding, constant smoothing factors, rails.

import { DEG, approachK, cos, sin } from '../math/dmath';
import { clamp, clamp01 } from '../math/smooth';
import { type V3, vCross, vDot, vNeg } from '../math/vec3';
import type { World } from '../world';
import { DT, PHYS } from './constants';
import type { SimEvent } from './events';
import { bodyForward, bodyUp } from './frame';
import { BTN, type InputFrame } from './input';
import type { RiderState } from './state';
import { enterCrash, enterRail } from './transitions';

export interface Ctx {
  w: World;
  inp: InputFrame;
  held: number;
  pressed: number;
  released: number;
  ev: SimEvent[];
}

// Per-step smoothing factors. Computed once with deterministic exp.
export const K = {
  steerRise: approachK(DT, PHYS.steerRise),
  steerFall: approachK(DT, PHYS.steerFall),
  grip: approachK(DT, PHYS.gripTau),
  tuck: approachK(DT, 0.12),
  crouch: approachK(DT, 0.05),
  lean: approachK(DT, 0.08),
  brakeTurn: approachK(DT, 0.07),
  relaxBrakeH: approachK(DT, 0.12),
  relaxCleanH: approachK(DT, 0.06),
  relaxCleanV: approachK(DT, 0.4),
  sketchyH: approachK(DT, 0.3),
  sketchyV: approachK(DT, 0.6),
  rot: approachK(DT, PHYS.rotResponseTau),
  settle: approachK(DT, PHYS.settleResponseTau),
  frameUp: approachK(DT, 0.1),
  tumble: approachK(DT, 0.6),
};

export const COS_RAIL_ALIGN = cos(PHYS.railAlign);
export const SIN_WALL = sin(PHYS.wallAngle);
export const DEG6 = 6 * DEG;

export const isHeld = (c: Ctx, bit: number) => (c.held & bit) !== 0;
export const isPressed = (c: Ctx, bit: number) => (c.pressed & bit) !== 0;
export const isReleased = (c: Ctx, bit: number) => (c.released & bit) !== 0;

/** Steer axis: -1 left .. 1 right. */
export function steerInput(c: Ctx): number {
  let v = 0;
  if (c.held & BTN.RIGHT) v += 1;
  if (c.held & BTN.LEFT) v -= 1;
  return clamp(v + c.inp.sx / 127, -1, 1);
}

/** Spin axis: + = left (counter-clockwise seen from above). */
export function spinInput(c: Ctx): number {
  return -steerInput(c);
}

/** Flip axis: + = backflip. */
export function flipInput(c: Ctx): number {
  let v = 0;
  if (c.held & BTN.BACK) v += 1;
  if (c.held & BTN.FWD) v -= 1;
  return v;
}

/** Roll axis: + = right. */
export function rollInput(c: Ctx): number {
  let v = 0;
  if (c.held & BTN.ROLL_R) v += 1;
  if (c.held & BTN.ROLL_L) v -= 1;
  return clamp(v + c.inp.rx / 127, -1, 1);
}

/** Pop speed from Space hold time. */
export function popAmount(hold: number): number {
  return PHYS.popMax * (PHYS.popMinFactor + (1 - PHYS.popMinFactor) * clamp01(hold / PHYS.popFullHold));
}

/** Rotate v about unit axis n by angle a (Rodrigues). */
export function rotateAbout(v: V3, n: V3, a: number): V3 {
  const c = cos(a), s = sin(a);
  const k = vCross(n, v);
  const d = vDot(n, v) * (1 - c);
  return { x: v.x * c + k.x * s + n.x * d, y: v.y * c + k.y * s + n.y * d, z: v.z * c + k.z * s + n.z * d };
}

/** Space bar bookkeeping shared by all modes. */
export function trackSpace(s: RiderState, c: Ctx): void {
  if (isPressed(c, BTN.POP)) s.spaceHold = 0;
  if (isHeld(c, BTN.POP)) s.spaceHold += DT;
  const target = isHeld(c, BTN.POP) ? clamp01(s.spaceHold / PHYS.popFullHold) : 0;
  s.crouch += (target - s.crouch) * K.crouch;
}

/**
 * Snap onto a rail if the skis crossed it this step: within the snap radius horizontally,
 * coming down onto it (or level), aligned within 60 degrees and roughly upright.
 */
export function tryRailSnap(s: RiderState, c: Ctx, prev: V3): boolean {
  if (s.vel.y > PHYS.railMaxRise) return false;
  const hs = Math.sqrt(s.vel.x * s.vel.x + s.vel.z * s.vel.z);
  if (hs < 1) return false;
  if (bodyUp(s.q).y < 0.5) return false;
  const rails = c.w.rails;
  for (let i = 0; i < rails.length; i++) {
    if (i === s.railCooldownIndex && s.railCooldown > 0) continue;
    const r = rails[i];
    const cl = r.closestXZ(s.pos.x, s.pos.z);
    if (cl.dist > r.snapRadius) continue;
    if (s.pos.y > cl.y + 0.12) continue;
    const cp = r.closestXZ(prev.x, prev.z);
    if (prev.y < cp.y - 0.12) continue;
    const g = r.segs[cl.seg];
    const cosA = (s.vel.x * g.hx + s.vel.z * g.hz) / hs;
    if ((cosA < 0 ? -cosA : cosA) < COS_RAIL_ALIGN) continue;
    let speed = vDot(s.vel, g.dir);
    if (speed > -1 && speed < 1) speed = cosA >= 0 ? 1 : -1;
    if ((speed > 0 && cl.s > r.length - 0.3) || (speed < 0 && cl.s < 0.3)) continue;
    const travel = speed >= 0 ? g.dir : vNeg(g.dir);
    const f = bodyForward(s.q);
    enterRail(s, c, i, cl.s, speed, f.x * travel.x + f.z * travel.z < 0);
    return true;
  }
  return false;
}

/** Crash if the body runs into a rail from below/side. */
export function checkRailHit(s: RiderState, c: Ctx): boolean {
  const rails = c.w.rails;
  for (let i = 0; i < rails.length; i++) {
    const cl = rails[i].closestXZ(s.pos.x, s.pos.z);
    if (cl.dist < PHYS.railHitRadius + rails[i].width * 0.5 && cl.y > s.pos.y + 0.25 && cl.y < s.pos.y + 1.5) {
      enterCrash(s, c, 'hit the rail', 8, s.mode === 'air');
      return true;
    }
  }
  return false;
}
