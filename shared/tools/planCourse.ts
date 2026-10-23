// Course planner: runs bots down a map and reports lip speeds, landing spots and the
// lip speed needed to land each jump's sweet spot (1/4 down the landing).
// Usage: npm run plan [map-id]

import { DEG, RAD, atan, cos, sin } from '../math/dmath';
import { MAPS } from '../maps';
import { predictFlight } from '../sim/predict';
import { buildWorld, type World } from '../world';
import type { Feature } from '../terrain/features';
import { laneBot, runBot, straightBot } from './bot';

/** Usable landing: from knuckle end until the ground along the axis flattens below 20 degrees. */
export function landingZone(w: World, f: Feature): { start: number; end: number } {
  const start = f.knuckle1;
  let end = start;
  for (let u = start; u < start + 120; u += 0.25) {
    const p = f.toWorld(u, 0);
    const g = w.terrain.sample(p.x, p.z);
    const slope = atan(-(g.dx * f.dx + g.dz * f.dz)) * RAD;
    end = u;
    if (slope < 20) break;
  }
  return { start, end };
}

/** Where (u along the jump axis) a straight air from the lip at `speed` lands. */
export function landingU(w: World, f: Feature, speed: number): number {
  const lip = f.toWorld(f.uLip, 0);
  const y = w.terrain.sample(lip.x, lip.z).h;
  const a = f.lipAngle * DEG;
  const vh = speed * cos(a);
  const v = { x: f.dx * vh, y: speed * sin(a), z: f.dz * vh };
  const p = predictFlight(w.terrain, { x: lip.x, y: y + 0.01, z: lip.z }, v, 6, 1 / 240);
  return f.toLocal(p.point.x, p.point.z).u;
}

/** Lip speed that lands at `frac` of the usable landing (bisection). */
export function speedForLanding(w: World, f: Feature, frac = 0.25): number {
  const z = landingZone(w, f);
  const target = z.start + (z.end - z.start) * frac;
  let lo = 3, hi = 40;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (landingU(w, f, mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function planReport(mapId: string): string {
  const w = buildWorld(MAPS[mapId]);
  const out: string[] = [];
  const run = runBot(w, straightBot);
  out.push(`Map ${mapId}: straight bot ${run.state.finished ? `finished in ${run.state.runTime.toFixed(2)} s` : 'did NOT finish'}`);
  const crashes = run.events.filter((e) => e.e.type === 'crash');
  if (crashes.length) out.push(`  crashes: ${crashes.map((c) => `${(c.e as { reason: string }).reason} @z=${c.z.toFixed(1)}`).join(', ')}`);

  for (const f of w.terrain.features) {
    if (f.type !== 'jump') continue;
    const lip = f.toWorld(f.uLip, 0);
    const z = landingZone(w, f);
    const need = speedForLanding(w, f, 0.25);
    // Bot lip speed: the takeoff event closest to this lip.
    const tk = run.events.find((e) => e.e.type === 'takeoff' && Math.abs(e.z - lip.z) < 1.5);
    const land = tk ? run.events.find((e) => e.tick > tk.tick && (e.e.type === 'land' || e.e.type === 'touch' || e.e.type === 'crash')) : undefined;
    let landInfo = 'no landing';
    if (land) {
      const u = f.toLocal(land.x, land.z).u;
      const frac = (u - z.start) / (z.end - z.start);
      const q = land.e.type === 'land' ? land.e.quality : land.e.type;
      landInfo = `landed u=${u.toFixed(1)} (${(frac * 100).toFixed(0)}% down landing) ${q}`;
    }
    out.push(
      `  ${f.id}: lip z=${lip.z.toFixed(1)} knuckle u=${f.knuckle0.toFixed(1)}..${f.knuckle1.toFixed(1)} ` +
      `landing u=${z.start.toFixed(1)}..${z.end.toFixed(1)} (${(z.end - z.start).toFixed(1)} m) | ` +
      `sweet-spot lip speed ${need.toFixed(1)} m/s, bot lip speed ${tk ? tk.speed.toFixed(1) : '-'} m/s, ${landInfo}`,
    );
  }

  // Rail lanes.
  for (const [i, r] of w.rails.entries()) {
    const x = r.points[0].x;
    const lr = runBot(w, laneBot(() => x), 120 * 60);
    const on = lr.events.find((e) => e.e.type === 'railOn' && e.e.index === i);
    const off = lr.events.find((e) => e.e.type === 'railOff' && e.e.index === i);
    const after = off ? lr.events.find((e) => e.tick > off.tick && (e.e.type === 'land' || e.e.type === 'touch' || e.e.type === 'crash')) : undefined;
    const res = after ? (after.e.type === 'land' ? after.e.quality : after.e.type) : '-';
    out.push(`  rail ${r.id}: ${on ? `on at ${on.speed.toFixed(1)} m/s` : 'MISSED'}${off ? `, off after ${(off.e as { time: number }).time.toFixed(2)} s` : ''}, then ${res}`);
  }

  // Speed profile.
  const prof: string[] = [];
  for (let zz = -10; zz > -440; zz -= 20) {
    const smp = run.samples.find((p) => p.z <= zz);
    if (smp) prof.push(`${(-zz).toFixed(0)}:${smp.speed.toFixed(1)}`);
  }
  out.push(`  speed by s: ${prof.join(' ')}`);
  return out.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(planReport(process.argv[2] ?? 'test-slope'));
}
