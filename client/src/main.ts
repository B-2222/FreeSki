import { MAPS } from '@shared/maps';
import { buildWorld } from '@shared/world';
import { Game } from './game/Game';

const params = new URLSearchParams(location.search);
const mapId = params.get('map') ?? 'test-slope';
const world = buildWorld(MAPS[mapId] ?? MAPS['test-slope']);

const canvas = document.getElementById('game') as HTMLCanvasElement;
const hud = document.getElementById('hud') as HTMLElement;
const game = new Game(canvas, hud, world);
game.start();

// Handy for debugging in the console and for automated browser checks.
(window as unknown as { frostline: { game: Game } }).frostline = { game };
