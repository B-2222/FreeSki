// Spin budget: the biggest spin that lands clean on each jump, with and without a pop.
// Usage: npx tsx shared/tools/spinBudget.ts [map-id]

import { RAD } from '../math/dmath';
import { MAPS } from '../maps';
import { BTN } from '../sim/input';
import { buildWorld } from '../world';
import { type Bot, runBot, straightBot } from './bot';

export function spinBudget(mapId: string, grab: boolean) {
  const w = buildWorld(MAPS[mapId]);
  const rows: string[] = [];
  for (const f of w.terrain.features.filter((f) => f.type === 'jump')) {
    for (const pop of [false, true]) {
      let best = 0;
      let air = 0;
      for (let target = 180; target <= 1800; target += 180) {
        const lip = f.toWorld(f.uLip, 0);
        const bot: Bot = (s) => {
          if (s.mode === 'ground') {
            const d = s.pos.z - lip.z; // metres before the lip
            let b = straightBot(s, 0).b;
            if (pop && d < 6 && d > 0.3) b |= BTN.POP;
            return { b, sx: 0, rx: 0 };
          }
          if (s.mode === 'air' && s.air.fromKicker && Math.abs(s.air.takeoffPos.z - lip.z) < 2) {
            // Release early enough that settle + lookahead finishes the rotation.
            const spun = Math.abs(s.air.spin) * RAD;
            let b = spun < target - 45 ? BTN.LEFT : 0;
            if (grab && spun < target - 90) b |= BTN.MUTE;
            return { b, sx: 0, rx: 0 };
          }
          return straightBot(s, 0);
        };
        const run = runBot(w, bot);
        const tk = run.events.findIndex((e) => e.e.type === 'takeoff' && e.e.fromKicker && Math.abs(e.z - lip.z) < 2);
        const land = run.events.slice(tk).find((e) => e.e.type === 'land' || e.e.type === 'crash');
        if (land && land.e.type === 'land' && land.e.quality === 'clean' && Math.abs(Math.abs(land.e.spinDeg) - target) < 30) {
          best = target;
          air = land.e.airTime;
        }
      }
      rows.push(`${f.id} ${pop ? 'pop   ' : 'no pop'}${grab ? ' +grab' : '      '}: best clean spin ${best} (air ${air.toFixed(2)} s)`);
    }
  }
  return rows;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const g of [false, true]) console.log(spinBudget(process.argv[2] ?? 'test-slope', g).join('\n'));
}
