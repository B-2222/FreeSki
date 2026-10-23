# FROSTLINE

A free 3D freeski game that runs in the browser. Arcade-realistic physics, a trick system decided at the lip, and parks built for big lines.

Status: **Milestone 1 (core feel)** is playable: one test slope with 3 kickers and 2 rails.

## Run it

```bash
npm install
npm run dev        # open http://localhost:5173
```

Other scripts:

| Command | What it does |
|---|---|
| `npm test` | Unit tests for the shared sim (deterministic math, physics, landing judgment, determinism) |
| `npm run typecheck` | TypeScript check of client + shared |
| `npm run build` | Typecheck and production build into `dist/` |
| `npm run plan` | Course planner: runs a bot down the map and reports lip speeds and where each jump lands |
| `npm run budget` | Biggest spin that lands clean on each jump (with and without pop / grab) |

## Controls (milestone 1)

| Key | On snow | In the air |
|---|---|---|
| `W` | pole (below 6 m/s), tuck (faster) | frontflip |
| `S` | brake (powerslide) | backflip |
| `A` / `D` | carve left / right | spin left / right |
| `←` / `→` | | roll / sideflip |
| `Space` | hold to crouch, release to pop | |
| `Shift` / `Q` / `E` / `Z` / `X` | | mute / tail / japan / safety / blunt grab |
| `R` (hold 2 s) | restart from the top (let go to cancel) | |
| `C` | camera: follow / close | |
| Right mouse (hold) | look around | |
| `Esc` / `P` | pause | |
| `H` / `F3` | hide help / debug panel | |

Rotation only happens while a key is held. Let go of all rotation keys and the rider settles to the nearest landable orientation within about 0.25 s. Let go of grabs before you land.

## Project layout

```
client/   Vite app: rendering (Three.js), input, HUD
shared/   Simulation (no Three.js): math, terrain, rider physics, maps, tools, tests
  math/     deterministic sin/cos/atan2/exp, vectors, quaternions, seeded RNG
  terrain/  analytic base slope + features (tabletop jumps, kickers, on-ramps) + rails
  sim/      120 Hz rider sim: ground, air, rails, landing judgment, crashes
  maps/     map JSON (test-slope.json)
  tools/    bots and the course planner
  test/     vitest suites
server/   (milestone 9) rooms, chat, leaderboards, run verification
```

### Determinism

The sim in `/shared` is deterministic: the same input frames from the same start state give the same result bit for bit, on any JS engine. It runs on a fixed 120 Hz step, uses its own `sin`/`cos`/`atan2`/`exp` built only from IEEE-754 basic operations (engines are allowed to differ on `Math.sin` etc.), stores its seeded RNG state in the rider state, and never reads the clock. A test scans the sim sources and fails if an engine-dependent `Math` function, `Math.random`, `Date.now` or a Three.js import sneaks in. This is what replays, ghosts and server verification will build on.

### Terrain

Ground height and normals are sampled exactly from analytic shapes (a fall-line profile with banks, plus feature shapes with exact gradients), so the physics never sees mesh approximations, even at a kicker lip. The renderer builds its meshes by sampling the same functions.

Physics tuning notes live in [TUNING.md](TUNING.md).
