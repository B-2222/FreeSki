// One fixed 120 Hz tick of the rider simulation. Deterministic: the same input frames
// from the same starting state always give the same result, bit for bit.

import type { World } from '../world';
import { stepAir } from './air';
import type { Ctx } from './common';
import { DT, PHYS } from './constants';
import { stepCrash } from './crash';
import type { SimEvent } from './events';
import { stepGround } from './ground';
import { BTN, type InputFrame } from './input';
import { stepRail } from './rail';
import { type RiderState, resetToSpawn } from './state';

export function stepRider(s: RiderState, inp: InputFrame, w: World, ev: SimEvent[]): void {
  const held = inp.b;
  const c: Ctx = { w, inp, held, pressed: held & ~s.prevButtons, released: s.prevButtons & ~held, ev };

  // Hold R for 2 s to restart from the top (release to cancel).
  if (held & BTN.RESTART) {
    if (!s.restartLatch) {
      s.restartHold += DT;
      if (s.restartHold >= PHYS.restartHoldTime) {
        resetToSpawn(s, w);
        s.restartLatch = true;
        ev.push({ type: 'restart' });
        s.prevButtons = held;
        s.tick++;
        return;
      }
    }
  } else {
    s.restartHold = 0;
    s.restartLatch = false;
  }

  if (s.railCooldown > 0) s.railCooldown -= DT;

  switch (s.mode) {
    case 'ground': stepGround(s, c); break;
    case 'air': stepAir(s, c); break;
    case 'rail': stepRail(s, c); break;
    case 'crash': stepCrash(s, c); break;
  }

  if (!s.started && s.pos.z < w.gateZ) {
    s.started = true;
    ev.push({ type: 'start' });
  }
  if (s.started && !s.finished) {
    s.runTime += DT;
    if (s.pos.z < w.finishZ) {
      s.finished = true;
      ev.push({ type: 'finish', time: s.runTime });
    }
  }

  s.tick++;
  s.prevButtons = held;
}
