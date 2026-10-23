# Tuning notes

Values that differ from the spec, or that the spec left open, with the reason. All constants live in `shared/sim/constants.ts`.

## Milestone 1

### Ground

| Value | Setting | Why |
|---|---|---|
| Rider mass | 80 kg (rider + gear) | Spec gives CdA but no mass; needed for drag. With CdA 0.55 this gives about 20 m/s standing on a 12 degree slope and 26 m/s tucked, matching the spec's 12 to 20 cruising and up to 28 tucked. |
| Max carve force | 1.9 g (1.4 g tucked), was 2.2 / 1.6 | At 2.2 g the physical lean is 65 degrees and the rider looked like they were falling over. |
| Max carve lean | 55 degrees, was 62 | Same reason. The model also angulates (upper body stays about 38% more upright, hips drop) so hard carves read as carving. |
| Carve radius | 32 m (light edge) to 7.5 m (full edge), 10 m min when tucked | Radius shrinks with edge angle, as the spec asks. |
| Carving speed loss | Comes from edge grip (lateral velocity decays with a 0.03 s time constant) | Gives roughly 0.5 to 1 m/s² of loss in a hard carve, "bleeds a little speed" without a separate fudge factor. |
| Low-speed pivot | up to 1.8 rad/s, fading out by 9 m/s | Lets you turn around when slow without making fast carving twitchy. |
| Brake | 0.55 x normal force, skis swing 75 degrees across | Strong powerslide stop: 8 m/s to 0 in about 2 s on gentle slopes. |
| Poling | 0.9 m/s push every 0.55 s, only below 6 m/s, never up a grade steeper than 2 degrees | "Only small recovery pushes", can't pole back up to repeat features. |
| Static friction | 0.05 | A stopped rider stays put on slopes under about 3 degrees. |
| Steering on a kicker | 20% within 6 m of the lip | Holding A/D to set up a spin shouldn't carve you off the kicker. |
| Ground snapping | Follows convex terrain while the slope changes by up to about 4 degrees per step | Riders absorb rollers instead of getting micro-airs; kicker lips always launch (detected from the kicker shape, not from snapping). |

### Pop

| Value | Setting | Why |
|---|---|---|
| Pop window near a lip | Released within 3 m of the lip, the pop is **buffered and fires at the lip**: 100% within the last 0.5 m, falling to 40% at 3 m | The spec's best zone (last 0.5 m) is only 28 ms at 18 m/s, which nobody can hit. Buffering keeps the 0.5 m sweet spot as the best timing but makes it humanly possible. Popping earlier than 3 m pops immediately and the rising ramp catches you (proper contact, never through the lip). |
| Late pop | Released within 0.06 s after leaving the lip: 70% | Small grace window so a pop a hair late isn't lost. |
| Quick tap | 30% of max (0.66 m/s) | Taps give a small hop. |

### Air and landing

| Value | Setting | Why |
|---|---|---|
| Rotation rates | 540 / 400 / 400 deg/s, +15% while grabbing (spec values) | Checked with `npm run budget` (biggest spin that lands clean, no pop): 9 m table 720 (1.6 s air), 20 m table 1080 (2.1 s), 25 m table 1260 (2.5 s). A full pop adds about 0.6 s of air and roughly one more 180 to 360. So a 1080 fits a 20 m jump and a 1260 needs the big one, as the spec asks. |
| Settle | Time constant 0.07 s, max 6 rad/s (spin) and 5 rad/s (flip/roll), 0.09 s lookahead to pick the target | Settles within about 0.25 s. The lookahead means releasing a little early still finishes the rotation you were going for. |
| Air pose | The rider's base frame follows the trajectory, then lines up with the predicted landing slope over the second half of the flight | So a settled rider lands matched to the slope. |
| Landing pitch | Clean up to 45 degrees (tips or tails), sketchy to 60, crash beyond | Spec gives the 45 degree stomp rule only. |
| Landing roll | Clean up to 25 degrees, sketchy to 50, crash beyond | Spec says "upright"; these are the numbers. |
| Landing mid-rotation | Judged on the pose 0.06 s after touchdown, using the rotation speed at touchdown | Without it, spinning into the landing was a coin flip. Now still rotating at touchdown over-rotates you; a settled rider is unaffected. |
| Still grabbing at touchdown | Downgrades one level (clean to sketchy, sketchy to crash) | Spec: "release to open up for landing". |
| Impact | Smack above 6 m/s into the slope, clean becomes sketchy above 10 m/s, crash above 14 m/s; speed loss 3% per m/s above 5 m/s (max 35%) | Flat landings hurt, matched landings keep speed. |
| Soft touches | Airs under 0.3 s with no pop, kicker or rail (or any air under 0.2 s) with a gentle, upright touchdown aren't judged | Brushing over a crest or an early pop that lands back on the kicker shouldn't count as a landing. |
| Crash | Slide friction 0.35, up after 1.5 s at no more than 4 m/s | Spec: ragdoll slide, up in about 1.5 s. |

### Rails (basic, full version in milestone 3)

| Value | Setting | Why |
|---|---|---|
| Rail friction | 0.02 | Flat bars keep your speed; down rails add some. |
| Body hits a rail | Crash if the bar is between 0.25 m and 1.5 m above your feet within 0.25 m | You can't ride through a rail. |

### Terrain

| Value | Setting | Why |
|---|---|---|
| Table front faces | 42 degrees, was 54 | A rider riding into the side of a table at speed crashed into a near-wall. |
| Test slope jump spacing | Planned with `npm run plan` | At natural speed (no tuck, no brake) the bot lands 22%, 24% and 23% down the three landings (target: about 25%). |
