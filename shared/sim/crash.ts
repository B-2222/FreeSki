// Crash: the rider slides on the snow (on the back after a backward/switch crash, on the
// front after a forward one), tumbling a little, then gets up after ~1.5 s.

import { atan2, wrapAngle } from '../math/dmath';
import { qFromBasis } from '../math/quat';
import { type V3, vCross, vDot, vLen, vNeg, vNorm, vReject, vScale } from '../math/vec3';
import { DT, PHYS } from './constants';
import { type Ctx, K, rotateAbout } from './common';
import { bodyUp, yawOf } from './frame';
import { dragK } from './predict';
import { type RiderState, SKID } from './state';

const KDRAG = dragK(PHYS.cdaStand);

export function stepCrash(s: RiderState, c: Ctx): void {
  const cr = s.crash;
  const terrain = c.w.terrain;
  cr.t += DT;
  cr.tumble += cr.tumbleRate * DT;
  cr.tumbleRate -= cr.tumbleRate * K.tumble;

  let v = s.vel;
  let n: V3;
  if (cr.airborne) {
    const sp = vLen(v);
    v.y -= PHYS.g * DT;
    const f = 1 - KDRAG * sp * DT;
    v = vScale(v, f);
    s.pos = { x: s.pos.x + v.x * DT, y: s.pos.y + v.y * DT, z: s.pos.z + v.z * DT };
    const gs = terrain.sample(s.pos.x, s.pos.z);
    n = gs.n;
    if (s.pos.y <= gs.h) {
      s.pos.y = gs.h;
      v = vReject(v, gs.n);
      cr.airborne = false;
    }
  } else {
    const g0 = terrain.sample(s.pos.x, s.pos.z);
    n = g0.n;
    const N = PHYS.g * n.y;
    const gt = { x: PHYS.g * n.y * n.x, y: -PHYS.g + PHYS.g * n.y * n.y, z: PHYS.g * n.y * n.z };
    v = { x: v.x + gt.x * DT, y: v.y + gt.y * DT, z: v.z + gt.z * DT };
    const sp1 = vLen(v);
    const decel = (PHYS.crashMu * N + KDRAG * sp1 * sp1) * DT;
    const sp2 = sp1 > decel ? sp1 - decel : 0;
    v = sp1 > 0 ? vScale(v, sp2 / sp1) : v;
    s.pos = { x: s.pos.x + v.x * DT, y: s.pos.y + v.y * DT, z: s.pos.z + v.z * DT };
    const gs = terrain.sample(s.pos.x, s.pos.z);
    n = gs.n;
    const gap = s.pos.y - gs.h;
    if (gap < 0.4) {
      s.pos.y = gs.h;
      const t = vReject(v, gs.n);
      const tl = vLen(t);
      v = tl > 1e-6 ? vScale(t, vLen(v) / tl) : t;
    } else {
      cr.airborne = true;
    }
  }
  s.vel = v;

  // Lying pose along the slide direction, tumbling around the body's long axis.
  const t = vReject(v, n);
  const tl = vLen(t);
  let head: V3;
  if (tl > 0.3) head = cr.back ? vScale(t, -1 / tl) : vScale(t, 1 / tl);
  else head = vNorm(vReject(bodyUp(s.q), n), { x: 0, y: 0, z: 1 });
  let chest = cr.back ? n : vNeg(n);
  chest = rotateAbout(chest, head, cr.tumble);
  const back = vNeg(vNorm(vReject(chest, head)));
  const right = vNorm(vCross(head, back));
  s.q = qFromBasis(right, head, back);

  if (cr.t >= PHYS.crashTime) {
    const gs = terrain.sample(s.pos.x, s.pos.z);
    let sp = vLen(s.vel);
    if (sp > PHYS.crashMaxSpeedAfter) {
      s.vel = vScale(s.vel, PHYS.crashMaxSpeedAfter / sp);
      sp = PHYS.crashMaxSpeedAfter;
    }
    s.heading = wrapAngle(sp > 1.5 ? yawOf(s.vel) : atan2(gs.dx, gs.dz));
    s.switchStance = false;
    s.skidMode = SKID.NONE;
    s.mode = cr.airborne ? 'crash' : 'ground';
    if (s.mode === 'ground') {
      s.groundN = gs.n;
      s.pos.y = gs.h;
      s.vel = vReject(s.vel, gs.n);
      if (vDot(s.vel, s.vel) < 1e-6) s.vel = { x: 0, y: 0, z: 0 };
      c.ev.push({ type: 'recover' });
    }
  }
}
