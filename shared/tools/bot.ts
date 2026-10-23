// Scripted riders for course planning and tests. A bot is a function from sim state to
// input; running it through the real sim gives "natural" speeds at every feature.

import { BTN, type InputFrame } from '../sim/input';
import { stepRider } from '../sim/rider';
import { createRider, type RiderState } from '../sim/state';
import type { SimEvent } from '../sim/events';
import type { World } from '../world';

export type Bot = (s: RiderState, tick: number) => InputFrame;

/** Pole off the start, then ride straight with no input. */
export const straightBot: Bot = (s) => ({ b: s.mode === 'ground' && !s.started ? BTN.FWD : 0, sx: 0, rx: 0 });

/** Steer toward a target x (simple P controller), poling at the start. */
export function laneBot(targetX: (s: RiderState) => number, extra: (s: RiderState) => number = () => 0): Bot {
  return (s) => {
    let b = extra(s);
    if (s.mode === 'ground' && !s.started) b |= BTN.FWD;
    let sx = 0;
    if (s.mode === 'ground') {
      const err = targetX(s) - s.pos.x;
      sx = Math.max(-127, Math.min(127, Math.round(err * 60 - s.vel.x * 40)));
    }
    return { b, sx, rx: 0 };
  };
}

export interface BotRun {
  state: RiderState;
  events: { tick: number; e: SimEvent; z: number; x: number; speed: number }[];
  samples: { tick: number; x: number; y: number; z: number; speed: number; mode: string }[];
}

export function runBot(world: World, bot: Bot, maxTicks = 120 * 120, stopAtFinish = true): BotRun {
  const s = createRider(world);
  const events: BotRun['events'] = [];
  const samples: BotRun['samples'] = [];
  const ev: SimEvent[] = [];
  for (let i = 0; i < maxTicks; i++) {
    ev.length = 0;
    stepRider(s, bot(s, i), world, ev);
    const speed = Math.sqrt(s.vel.x * s.vel.x + s.vel.y * s.vel.y + s.vel.z * s.vel.z);
    for (const e of ev) events.push({ tick: s.tick, e, z: s.pos.z, x: s.pos.x, speed });
    if (i % 6 === 0) samples.push({ tick: s.tick, x: s.pos.x, y: s.pos.y, z: s.pos.z, speed, mode: s.mode });
    if (stopAtFinish && s.finished) break;
  }
  return { state: s, events, samples };
}
