// Grinding a rail or box (basic version for milestone 1: snap, slide, ride off the end,
// pop off with Space). Swaps, presses and pop-off spins arrive in milestone 3.

import { PI, wrapAngle } from '../math/dmath';
import { vNeg, vScale } from '../math/vec3';
import { DT, PHYS } from './constants';
import { type Ctx, isReleased, popAmount, trackSpace } from './common';
import { frameQuat, yawOf } from './frame';
import { BTN } from './input';
import type { RiderState } from './state';
import { initAir, railUp } from './transitions';

export function stepRail(s: RiderState, c: Ctx): void {
  const rs = s.rail;
  const r = c.w.rails[rs.index];
  rs.t += DT;
  trackSpace(s, c);

  const seg = r.segs[r.at(rs.s).seg];
  const dir = seg.dir;
  // The rail carries you: gravity along the bar, almost no friction. Braking does nothing.
  const along = -PHYS.g * dir.y;
  const fr = PHYS.railMu * PHYS.g * (rs.speed >= 0 ? 1 : -1);
  rs.speed += (along - fr) * DT;
  rs.s += rs.speed * DT;

  const travel = rs.speed >= 0 ? dir : vNeg(dir);
  s.heading = wrapAngle(yawOf(travel) + (rs.switchStance ? PI : 0));
  s.switchStance = rs.switchStance;
  const up = railUp(dir);

  if (rs.s >= r.length || rs.s <= 0) {
    rs.s = rs.s >= r.length ? r.length : 0;
    s.pos = r.at(rs.s).p;
    s.vel = vScale(dir, rs.speed);
    c.ev.push({ type: 'railOff', index: rs.index, time: rs.t });
    s.railCooldownIndex = rs.index;
    s.railCooldown = PHYS.railCooldown;
    initAir(s, c, { fromRail: true, up });
    return;
  }

  s.pos = r.at(rs.s).p;
  s.vel = vScale(dir, rs.speed);
  s.q = frameQuat(up, s.heading);

  if (isReleased(c, BTN.POP)) {
    c.ev.push({ type: 'railOff', index: rs.index, time: rs.t });
    s.railCooldownIndex = rs.index;
    s.railCooldown = PHYS.railCooldown;
    initAir(s, c, { fromRail: true, up, pop: popAmount(s.spaceHold) });
  }
}
