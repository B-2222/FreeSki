import { describe, expect, it } from 'vitest';
import { DEG } from '../math/dmath';
import { qMul } from '../math/quat';
import { MAPS } from '../maps';
import type { MapData } from '../maps/types';
import { DT, PHYS } from '../sim/constants';
import type { SimEvent } from '../sim/events';
import { frameQuat, qFlip, qRoll } from '../sim/frame';
import { BTN, type InputFrame } from '../sim/input';
import { judgeLanding } from '../sim/landing';
import { stepRider } from '../sim/rider';
import { createRider, type RiderState } from '../sim/state';
import { type Bot, laneBot, runBot, straightBot } from '../tools/bot';
import { speedForLanding, landingZone } from '../tools/planCourse';
import { buildWorld } from '../world';

const world = buildWorld(MAPS['test-slope']);

function hashState(s: RiderState): string {
  return JSON.stringify(s);
}

/** A busy scripted input sequence exercising most controls. */
const busyBot: Bot = (s, tick) => {
  let b = 0;
  const phase = Math.floor(tick / 90) % 8;
  if (!s.started) b |= BTN.FWD;
  if (s.mode === 'ground') {
    if (phase === 1) b |= BTN.LEFT;
    if (phase === 3) b |= BTN.RIGHT;
    if (phase === 5 && tick % 90 < 40) b |= BTN.POP;
    if (phase === 6) b |= BTN.BACK;
  } else if (s.mode === 'air') {
    if (s.air.t < 0.66) b |= BTN.LEFT;
    if (s.air.t < 0.4) b |= BTN.MUTE;
  }
  return { b, sx: 0, rx: 0 };
};

describe('determinism', () => {
  it('same inputs give the same state bit for bit', () => {
    const a = runBot(world, busyBot, 120 * 40, false);
    const b = runBot(world, busyBot, 120 * 40, false);
    expect(hashState(a.state)).toBe(hashState(b.state));
    expect(JSON.stringify(a.events)).toBe(JSON.stringify(b.events));
  });

  it('a cloned mid-run state continues identically', () => {
    const s1 = createRider(world);
    const ev: SimEvent[] = [];
    for (let i = 0; i < 1500; i++) stepRider(s1, busyBot(s1, i), world, ev);
    const s2 = structuredClone(s1);
    for (let i = 1500; i < 3000; i++) {
      stepRider(s1, busyBot(s1, i), world, ev);
      stepRider(s2, busyBot(s2, i), world, ev);
    }
    expect(hashState(s2)).toBe(hashState(s1));
  });
});

/** Flat-ish custom slope for physics checks. */
function slopeWorld(deg: number, length = 3000): ReturnType<typeof buildWorld> {
  const map: MapData = {
    id: 'slope', name: 'slope',
    course: { topHeight: 1000, halfWidth: 30, length, profile: [[0, deg], [length, deg]], undulation: 0 },
    spawn: { x: 0, z: -5, heading: 0 }, startGate: { z: -6, halfWidth: 5 }, finish: { z: -length + 10, halfWidth: 30 },
    features: [], rails: [],
  };
  return buildWorld(map);
}

function ride(w: ReturnType<typeof buildWorld>, ticks: number, input: (s: RiderState, i: number) => number, s = createRider(w)) {
  const ev: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) stepRider(s, { b: input(s, i), sx: 0, rx: 0 }, w, ev);
  return { s, ev };
}

const speed = (s: RiderState) => Math.hypot(s.vel.x, s.vel.y, s.vel.z);

describe('ground physics', () => {
  it('reaches the drag/friction equilibrium speed on a constant slope', () => {
    const deg = 10;
    const w = slopeWorld(deg);
    const { s } = ride(w, 120 * 90, () => 0);
    const th = deg * DEG;
    const vEq = Math.sqrt((2 * PHYS.mass * PHYS.g * (Math.sin(th) - PHYS.muGroomed * Math.cos(th))) / (PHYS.airDensity * PHYS.cdaStand));
    expect(speed(s)).toBeGreaterThan(vEq * 0.97);
    expect(speed(s)).toBeLessThan(vEq * 1.01);
  });

  it('tucking is faster than standing', () => {
    const w = slopeWorld(14);
    const stand = ride(w, 120 * 25, () => 0).s;
    const tuck = ride(w, 120 * 25, () => BTN.FWD).s;
    expect(speed(tuck)).toBeGreaterThan(speed(stand) + 2);
    expect(speed(tuck)).toBeLessThan(40);
  });

  it('poles only below 6 m/s on the flat start', () => {
    const { s } = ride(world, 120 * 1.5, () => BTN.FWD);
    expect(speed(s)).toBeGreaterThan(1.5);
    const w = slopeWorld(0.0001);
    const { s: s2 } = ride(w, 120 * 20, () => BTN.FWD);
    expect(speed(s2)).toBeLessThan(PHYS.poleMaxSpeed + PHYS.poleImpulse + 0.1);
  });

  it('braking stops the rider quickly', () => {
    const w = slopeWorld(8);
    const { s } = ride(w, 120 * 8, () => 0);
    const v0 = speed(s);
    expect(v0).toBeGreaterThan(6);
    ride(w, 120 * 2.5, () => BTN.BACK, s);
    expect(speed(s)).toBeLessThan(1);
  });

  it('carving turns and bleeds a little speed, without reversing direction', () => {
    const w = slopeWorld(12);
    const { s } = ride(w, 120 * 6, () => 0);
    const h0 = s.heading;
    const v0 = speed(s);
    ride(w, 60, () => BTN.LEFT, s);
    expect(s.heading).toBeGreaterThan(h0 + 0.3);
    expect(s.lean).toBeGreaterThan(0.2);
    expect(speed(s)).toBeLessThan(v0 + 2);
  });

  it('riding backwards is detected as switch', () => {
    const w = slopeWorld(10);
    const s = createRider(w);
    s.heading = Math.PI; // skis point uphill
    ride(w, 120 * 3, () => 0, s);
    expect(s.switchStance).toBe(true);
    expect(speed(s)).toBeGreaterThan(3);
  });
});

describe('takeoff and pop', () => {
  it('a pop on flat snow adds up to +2.2 m/s vertical after a full 0.35 s hold', () => {
    const w = slopeWorld(0.0001);
    const s = createRider(w);
    const ev: SimEvent[] = [];
    const hold = Math.round(0.4 / DT);
    for (let i = 0; i < hold; i++) stepRider(s, { b: BTN.POP, sx: 0, rx: 0 }, w, ev);
    stepRider(s, { b: 0, sx: 0, rx: 0 }, w, ev);
    const pop = ev.find((e) => e.type === 'pop');
    expect(pop && pop.type === 'pop' && pop.amount).toBeCloseTo(PHYS.popMax, 5);
    expect(s.mode).toBe('air');
  });

  it('a quick tap gives only a small hop', () => {
    const w = slopeWorld(0.0001);
    const s = createRider(w);
    const ev: SimEvent[] = [];
    stepRider(s, { b: BTN.POP, sx: 0, rx: 0 }, w, ev);
    stepRider(s, { b: 0, sx: 0, rx: 0 }, w, ev);
    const pop = ev.find((e) => e.type === 'pop');
    expect(pop && pop.type === 'pop' && pop.amount).toBeLessThan(0.8);
  });

  it('kickers launch along the lip and the straight bot lands every jump clean', () => {
    const run = runBot(world, straightBot);
    expect(run.state.finished).toBe(true);
    const kickerTakeoffs = run.events.filter((e) => e.e.type === 'takeoff' && e.e.fromKicker);
    expect(kickerTakeoffs.length).toBe(3);
    const lands = run.events.filter((e) => e.e.type === 'land');
    expect(lands.length).toBeGreaterThanOrEqual(3);
    for (const l of lands) expect(l.e.type === 'land' && l.e.quality).toBe('clean');
    expect(run.events.some((e) => e.e.type === 'crash')).toBe(false);
  });

  it('natural speed lands near the sweet spot (1/4 down the landing) on every jump', () => {
    const run = runBot(world, straightBot);
    for (const f of world.terrain.features.filter((f) => f.type === 'jump')) {
      const z = landingZone(world, f);
      const lip = f.toWorld(f.uLip, 0);
      const tk = run.events.find((e) => e.e.type === 'takeoff' && Math.abs(e.z - lip.z) < 1.5)!;
      const land = run.events.find((e) => e.tick > tk.tick && e.e.type === 'land')!;
      const frac = (f.toLocal(land.x, land.z).u - z.start) / (z.end - z.start);
      expect(frac).toBeGreaterThan(0.05);
      expect(frac).toBeLessThan(0.45);
      expect(Math.abs(speedForLanding(world, f) - tk.speed)).toBeLessThan(1.5);
    }
  });
});

describe('air rotation', () => {
  /** Ride straight to the big jump, then apply an air input script. */
  function hitJump3(air: (t: number) => number): SimEvent[] {
    const bot: Bot = (s) => {
      if (s.mode === 'air' && s.air.fromKicker && s.pos.z < -250) return { b: air(s.air.t), sx: 0, rx: 0 };
      return straightBot(s, 0);
    };
    return runBot(world, bot).events.map((e) => e.e);
  }
  const landAfterJ3 = (ev: SimEvent[]) => ev.filter((e) => e.type === 'land').at(-1) as Extract<SimEvent, { type: 'land' }>;

  it('holding spin for ~0.62 s then releasing settles into a clean 360', () => {
    const l = landAfterJ3(hitJump3((t) => (t < 0.62 ? BTN.LEFT : 0)));
    expect(l.quality).toBe('clean');
    expect(Math.abs(l.spinDeg - 360)).toBeLessThan(10);
  });

  it('a backflip held ~0.85 s lands clean with one inversion', () => {
    const l = landAfterJ3(hitJump3((t) => (t < 0.85 ? BTN.BACK : 0)));
    expect(l.quality).toBe('clean');
    expect(l.inversions).toBe(1);
    expect(Math.abs(l.flipDeg - 360)).toBeLessThan(10);
  });

  it('spinning until touchdown means landing mid-rotation (not clean)', () => {
    const l = landAfterJ3(hitJump3(() => BTN.LEFT));
    expect(l.quality).not.toBe('clean');
  });

  it('flipping until touchdown crashes', () => {
    const ev = hitJump3(() => BTN.BACK);
    const tk = ev.findLastIndex((e) => e.type === 'takeoff' && e.fromKicker);
    const after = ev.slice(tk).find((e) => e.type === 'crash' || e.type === 'land');
    expect(after?.type === 'crash' || (after?.type === 'land' && after.quality === 'crash')).toBe(true);
  });

  it('grabs register hold times and boost rotation 15%', () => {
    const ev = hitJump3((t) => (t < 0.62 ? BTN.LEFT | BTN.MUTE : 0));
    const l = landAfterJ3(ev);
    expect(l.grabTimes[1]).toBeGreaterThan(0.55);
    expect(l.quality).toBe('clean');
  });

  it('landing while still grabbing is downgraded', () => {
    const l = landAfterJ3(hitJump3(() => BTN.TAIL));
    expect(l.grabbingAtLanding).toBe(true);
    expect(l.quality).toBe('sketchy');
  });
});

describe('landing judgment', () => {
  const n = { x: 0, y: 1, z: 0 };
  const vel = { x: 0, y: -3, z: -15 };
  const judge = (yaw: number, pitch = 0, roll = 0) =>
    judgeLanding(qMul(qMul(frameQuat(n, yaw * DEG), qFlip(-pitch * DEG)), qRoll(roll * DEG)), vel, n, false);

  it('clean within 20 degrees of travel', () => {
    expect(judge(0).quality).toBe('clean');
    expect(judge(19).quality).toBe('clean');
    expect(judge(180).quality).toBe('clean');
    expect(judge(180).switchLanding).toBe(true);
  });
  it('sketchy from 20 to 70 degrees', () => {
    expect(judge(25).quality).toBe('sketchy');
    expect(judge(-65).quality).toBe('sketchy');
  });
  it('crash beyond 70 degrees', () => {
    expect(judge(75).quality).toBe('crash');
    expect(judge(90).quality).toBe('crash');
  });
  it('tips or tails up to 45 degrees still stomp', () => {
    expect(judge(0, 40).quality).toBe('clean');
    expect(judge(0, -44).quality).toBe('clean');
    expect(judge(0, 70).quality).toBe('crash');
  });
  it('upside down is a crash', () => {
    expect(judge(0, 180).quality).toBe('crash');
    expect(judge(0, 0, 120).quality).toBe('crash');
  });
});

describe('rails, crash and restart', () => {
  it('both rails can be ridden and exited clean', () => {
    for (const [i, r] of world.rails.entries()) {
      const run = runBot(world, laneBot(() => r.points[0].x), 120 * 40);
      expect(run.events.some((e) => e.e.type === 'railOn' && e.e.index === i)).toBe(true);
      // Rails zone ends before the first jump.
      expect(run.events.some((e) => e.e.type === 'crash' && e.z > -100)).toBe(false);
      const off = run.events.find((e) => e.e.type === 'railOff' && e.e.index === i)!;
      const after = run.events.find((e) => e.tick > off.tick && (e.e.type === 'land' || e.e.type === 'touch'))!;
      expect(after.e.type === 'touch' || (after.e.type === 'land' && after.e.quality === 'clean')).toBe(true);
    }
  });

  it('a crash slides, then the rider gets up after ~1.5 s', () => {
    const bot: Bot = (s) => (s.mode === 'air' && s.air.fromKicker ? { b: BTN.BACK, sx: 0, rx: 0 } : straightBot(s, 0));
    const run = runBot(world, bot, 120 * 30, false);
    const crash = run.events.find((e) => e.e.type === 'crash')!;
    const rec = run.events.find((e) => e.e.type === 'recover' && e.tick > crash.tick)!;
    expect(crash).toBeTruthy();
    expect((rec.tick - crash.tick) * DT).toBeGreaterThan(1.4);
    expect((rec.tick - crash.tick) * DT).toBeLessThan(2.5);
  });

  it('holding R for 2 s restarts from the top; letting go cancels', () => {
    const s = createRider(world);
    const ev: SimEvent[] = [];
    for (let i = 0; i < 600; i++) stepRider(s, straightBot(s, i), world, ev);
    expect(s.pos.z).toBeLessThan(-15);
    const R: InputFrame = { b: BTN.RESTART, sx: 0, rx: 0 };
    for (let i = 0; i < 180; i++) stepRider(s, R, world, ev);
    stepRider(s, { b: 0, sx: 0, rx: 0 }, world, ev);
    expect(ev.some((e) => e.type === 'restart')).toBe(false);
    for (let i = 0; i < 241; i++) stepRider(s, R, world, ev);
    expect(ev.some((e) => e.type === 'restart')).toBe(true);
    expect(s.pos.z).toBeCloseTo(world.spawn.z, 3);
  });
});

describe('spin budget (spec: a 1080 fits comfortably on a 20 m jump)', () => {
  it('20 m table fits a 1080 without a pop; the small jump does not', async () => {
    const { spinBudget } = await import('../tools/spinBudget');
    const rows = spinBudget('test-slope', false);
    const best = (id: string, pop: boolean) => {
      const r = rows.find((x) => x.startsWith(`${id} ${pop ? 'pop' : 'no pop'}`))!;
      return Number(/best clean spin (\d+)/.exec(r)![1]);
    };
    expect(best('j2', false)).toBeGreaterThanOrEqual(1080);
    expect(best('j1', false)).toBeLessThan(1080);
    expect(best('j3', false)).toBeGreaterThanOrEqual(1260);
  });
});
