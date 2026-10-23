import { MAPS } from '@shared/maps';
import { buildWorld } from '@shared/world';
import { Game } from './game/Game';

const params = new URLSearchParams(location.search);
const mapId = params.get('map') ?? 'test-slope';
const world = buildWorld(MAPS[mapId] ?? MAPS['test-slope']);

const canvas = document.getElementById('game') as HTMLCanvasElement;
const hud = document.getElementById('hud') as HTMLElement;

// When published as a claude.ai artifact, keep the run going across page updates.
type Hot = { ready?: (fn: (d: unknown) => void) => void; data?: unknown; snapshot?: (fn: () => unknown) => void };
const hot = (window as unknown as { claude?: { hot?: Hot } }).claude?.hot;

function boot(data: unknown): void {
  const game = new Game(canvas, hud, world);
  const saved = (data as { state?: unknown } | undefined)?.state;
  if (saved && typeof saved === 'object') {
    try {
      Object.assign(game.state, structuredClone(saved));
    } catch {
      // Ignore a snapshot from an incompatible version.
    }
  }
  try {
    hot?.snapshot?.(() => ({ state: game.state }));
  } catch {
    // Not running inside a viewer.
  }
  game.start();
  // Handy for debugging in the console and for automated browser checks.
  (window as unknown as { frostline: { game: Game } }).frostline = { game };
}

if (hot?.ready) hot.ready(boot);
else boot(hot?.data ?? {});
