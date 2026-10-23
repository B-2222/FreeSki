// Riding on snow: gravity along the slope, friction, drag, carving, tuck, poling,
// powerslide braking, popping, and following the ground (or launching off it).

import { DEG, PI, asin, atan, cos, sin, wrapAngle } from '../math/dmath';
import { clamp, clamp01, lerp, sign } from '../math/smooth';
import { qMul } from '../math/quat';
import { type V3, vClone, vDot, vLen, vReject, vScale } from '../math/vec3';
import { DT, PHYS } from './constants';
import {
  type Ctx, DEG6, K, SIN_WALL, checkRailHit, isHeld, isReleased, popAmount, rotateAbout,
  steerInput, trackSpace, tryRailSnap,
} from './common';
import { frameQuat, qRoll, yawOf } from './frame';
import { BTN } from './input';
import { dragK } from './predict';
import { FAR, type RiderState, SKID } from './state';
import { enterCrash, initAir } from './transitions';

/** Tangent direction on the plane with normal n whose horizontal yaw is `heading`. */
function skiDir(n: V3, heading: number): V3 {
  const sh = sin(heading), ch = cos(heading);
  const y = (sh * n.x + ch * n.z) / n.y;
  const l = Math.sqrt(sh * sh + y * y + ch * ch);
  return { x: -sh / l, y: y / l, z: -ch / l };
}

/** Keep the speed but lay the velocity into the tangent plane of n. */
function redirect(v: V3, n: V3, speed: number): V3 {
  const t = vReject(v, n);
  const l = vLen(t);
  return l > 1e-6 ? vScale(t, speed / l) : t;
}

export function stepGround(s: RiderState, c: Ctx): void {
  const terrain = c.w.terrain;
  const g0 = terrain.sample(s.pos.x, s.pos.z);
  const n = g0.n;
  s.groundN = n;
  s.onPowder = g0.powder;
  s.lipDist = g0.lipDist < FAR ? g0.lipDist : FAR;
  const onKicker = g0.lipDist < PHYS.kickerSteerZone;
  const N = PHYS.g * n.y;

  // ---- Inputs
  trackSpace(s, c);
  const steerIn = steerInput(c);
  s.steer += (steerIn - s.steer) * (Math.abs(steerIn) > Math.abs(s.steer) ? K.steerRise : K.steerFall);
  const brakeHeld = isHeld(c, BTN.BACK);
  const fwdHeld = isHeld(c, BTN.FWD);

  let v = s.vel;
  const spd = vLen(v);
  const vh = Math.sqrt(v.x * v.x + v.z * v.z);
  const stanceOff = () => (s.switchStance ? PI : 0);
  const velYaw = vh > 0.2 ? yawOf(v) : wrapAngle(s.heading - stanceOff());

  // Ski angle relative to travel, in the current stance. Riding switch when the
  // velocity is behind the skis (with hysteresis).
  let beta = wrapAngle(s.heading - velYaw - stanceOff());
  if (vh > 0.5 && (beta > 100 * DEG || beta < -100 * DEG) && s.skidMode !== SKID.BRAKE) {
    s.switchStance = !s.switchStance;
    beta = wrapAngle(beta - PI);
  }

  // ---- Tuck
  const wantTuck = fwdHeld && spd >= PHYS.tuckMinSpeed && !brakeHeld;
  s.tuck += ((wantTuck ? 1 : 0) - s.tuck) * K.tuck;

  // ---- Turn rate from steering: carve radius shrinks with edge angle, capped by
  // max lateral g; pivot turns at low speed.
  const a = Math.abs(s.steer);
  let omega = 0;
  if (a > 1e-3) {
    const Rmin = lerp(PHYS.carveRadiusMin, PHYS.carveRadiusMinTuck, s.tuck);
    const R = lerp(PHYS.carveRadiusMax, Rmin, a);
    const latG = lerp(PHYS.carveMaxLatG, PHYS.carveMaxLatGTuck, s.tuck);
    const carve = spd / R;
    const cap = (a * latG * PHYS.g) / Math.max(spd, 0.5);
    const pivot = a * PHYS.pivotRate * clamp01(1 - spd / PHYS.pivotFadeSpeed);
    omega = -sign(s.steer) * Math.max(Math.min(carve, cap), pivot);
  }
  if (onKicker) omega *= PHYS.kickerSteerScale;
  if (omega > 0.05) s.lastTurnSign = 1;
  else if (omega < -0.05) s.lastTurnSign = -1;

  // ---- Skis vs travel: carve (edge grip), powerslide brake, or skid recovery
  let skidDecel = 0;
  let velRot = 0;
  let gripped = false;
  const braking = brakeHeld && spd > 0.3;
  if (braking) {
    if (s.skidMode !== SKID.BRAKE) {
      s.brakeSide = s.steer > 0.2 ? -1 : s.steer < -0.2 ? 1 : s.lastTurnSign;
      s.skidMode = SKID.BRAKE;
    }
    velRot = -s.steer * PHYS.brakeSteerRate * DT;
    beta += (s.brakeSide * PHYS.brakeAngle - beta) * K.brakeTurn;
    skidDecel = PHYS.brakeMu * N;
  } else {
    if (s.skidMode === SKID.BRAKE) s.skidMode = SKID.RELAX_BRAKE;
    if (s.skidMode === SKID.NONE) {
      gripped = true;
    } else {
      let kh: number, kv: number;
      if (s.skidMode === SKID.RELAX_BRAKE) { kh = K.relaxBrakeH; kv = 0; }
      else if (s.skidMode === SKID.RELAX_CLEAN) { kh = K.relaxCleanH; kv = K.relaxCleanV; }
      else { kh = K.sketchyH; kv = K.sketchyV; }
      velRot = omega * DT;
      beta -= beta * kh;
      const dv = beta * kv;
      velRot += dv;
      beta -= dv;
      skidDecel = PHYS.skidMu * N * Math.abs(sin(beta));
      if (Math.abs(beta) < DEG6) s.skidMode = SKID.NONE;
    }
  }
  if (s.wobble > 0) s.wobble = Math.max(0, s.wobble - DT);

  if (gripped) {
    s.heading = wrapAngle(s.heading + omega * DT);
    if (spd > 1e-4) {
      // Edge grip removes velocity across the skis, so travel follows the ski line.
      const d = skiDir(n, s.heading);
      const par = vDot(v, d);
      const lx = v.x - d.x * par, ly = v.y - d.y * par, lz = v.z - d.z * par;
      v = { x: v.x - lx * K.grip, y: v.y - ly * K.grip, z: v.z - lz * K.grip };
    }
  } else {
    if (velRot !== 0 && spd > 1e-4) v = rotateAbout(v, n, velRot);
    s.heading = wrapAngle(velYaw + velRot + stanceOff() + beta);
  }

  // ---- Forces along the slope
  const gt = { x: PHYS.g * n.y * n.x, y: -PHYS.g + PHYS.g * n.y * n.y, z: PHYS.g * n.y * n.z };
  const mu = g0.powder ? PHYS.muPowder : PHYS.muGroomed;
  const cda = lerp(PHYS.cdaStand, PHYS.cdaTuck, s.tuck);
  const drag = dragK(cda) * spd * spd;
  v = { x: v.x + gt.x * DT, y: v.y + gt.y * DT, z: v.z + gt.z * DT };

  // Poling (W when slow): small forward pushes, never up real slopes.
  if (fwdHeld && spd < PHYS.poleMaxSpeed && !brakeHeld) {
    s.poleTimer -= DT;
    if (s.poleTimer <= 0) {
      const d = skiDir(n, s.heading);
      if (asin(d.y) <= PHYS.poleMaxUphill) {
        v = { x: v.x + d.x * PHYS.poleImpulse, y: v.y + d.y * PHYS.poleImpulse, z: v.z + d.z * PHYS.poleImpulse };
        s.poleAnim = 1;
        c.ev.push({ type: 'pole' });
      }
      s.poleTimer = PHYS.polePeriod;
    }
  } else {
    s.poleTimer = 0;
  }
  if (s.poleAnim > 0) s.poleAnim = Math.max(0, s.poleAnim - DT / PHYS.polePeriod);

  const sp1 = vLen(v);
  const decel = (mu * N + drag + skidDecel) * DT;
  const sp2 = sp1 - decel > 0 ? sp1 - decel : 0;
  if (sp1 > 0) v = vScale(v, sp2 / sp1);
  const gtl = vLen(gt);
  if (sp2 < 0.05 && gtl <= (PHYS.muStatic + (brakeHeld ? PHYS.brakeMu : 0)) * N) v = { x: 0, y: 0, z: 0 };

  // Actual travel turn rate and carve lean (leans more the harder and faster you carve).
  const vh2 = Math.sqrt(v.x * v.x + v.z * v.z);
  s.turnRate = vh2 > 1 && vh > 1 ? wrapAngle(yawOf(v) - velYaw) / DT : omega;
  let leanTarget: number;
  if (braking) leanTarget = s.brakeSide * 0.35;
  else leanTarget = clamp(atan((vLen(v) * s.turnRate) / PHYS.g), -PHYS.maxLean, PHYS.maxLean);
  s.lean += (leanTarget - s.lean) * K.lean;

  // ---- Move and follow the ground
  const prev = vClone(s.pos);
  s.vel = v;
  s.pos = { x: s.pos.x + v.x * DT, y: s.pos.y + v.y * DT, z: s.pos.z + v.z * DT };

  if (tryRailSnap(s, c, prev)) return;
  if (checkRailHit(s, c)) return;

  const gs = terrain.sample(s.pos.x, s.pos.z);
  const speed = vLen(s.vel);
  const gap = s.pos.y - gs.h;
  const passedLip = g0.lipDist <= 1.5 && !(gs.lipDist < FAR);
  if (passedLip && gap > -0.05) {
    if (s.pos.y < gs.h) s.pos.y = gs.h;
    takeoff(s, c, true);
    return;
  }
  if (gap < 0) {
    s.pos.y = gs.h;
    const vn = vDot(s.vel, gs.n);
    if (-vn > speed * SIN_WALL && -vn > 2) {
      // Ran into something steep: lose the normal component.
      s.vel = vReject(s.vel, gs.n);
      if (-vn > PHYS.wallCrashSpeed) {
        enterCrash(s, c, 'hit a wall', -vn, false, gs.n);
        return;
      }
    } else {
      s.vel = redirect(s.vel, gs.n, speed);
    }
  } else if (gap <= PHYS.snapBase + speed * DT * PHYS.snapSlope) {
    s.pos.y = gs.h;
    s.vel = redirect(s.vel, gs.n, speed);
  } else {
    takeoff(s, c, false);
    return;
  }
  s.groundN = gs.n;

  // ---- Pop (Space release). Close to a kicker lip the pop is buffered and fires at the lip.
  if (s.pendingPop > 0) {
    s.pendingPopTtl -= DT;
    if (s.pendingPopTtl <= 0) {
      const amt = s.pendingPop;
      s.pendingPop = 0;
      initAir(s, c, { pop: amt });
      return;
    }
  }
  if (isReleased(c, BTN.POP) && s.pendingPop === 0) {
    const amt = popAmount(s.spaceHold);
    if (gs.lipDist <= PHYS.popLipWindow) {
      const t = clamp01((gs.lipDist - PHYS.popLipBest) / (PHYS.popLipWindow - PHYS.popLipBest));
      s.pendingPop = amt * lerp(1, PHYS.popLipMinFactor, t);
      s.pendingPopTtl = gs.lipDist / Math.max(speed, 1) + 0.08;
    } else {
      initAir(s, c, { pop: amt });
      return;
    }
  }

  s.q = qMul(frameQuat(gs.n, s.heading), qRoll(-s.lean));
}

function takeoff(s: RiderState, c: Ctx, fromKicker: boolean): void {
  const pop = s.pendingPop;
  initAir(s, c, { fromKicker, pop });
}
