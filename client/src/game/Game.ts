// Game loop: fixed 120 Hz simulation steps, rendering interpolated between steps.

import * as THREE from 'three';
import { DT } from '@shared/sim/constants';
import type { SimEvent } from '@shared/sim/events';
import { stepRider } from '@shared/sim/rider';
import { SKID, type RiderState, createRider } from '@shared/sim/state';
import type { World } from '@shared/world';
import { Keyboard } from '../input/keyboard';
import { CAMERA_PRESETS, FollowCamera } from '../render/followCamera';
import { RiderModel } from '../render/riderModel';
import { createRenderer, createScene, type SceneRig } from '../render/scene';
import { buildCourseMarkers, buildTrees } from '../render/scenery';
import { SnowFx } from '../render/snowFx';
import { buildBaseTerrain, buildFeatureMesh, buildRails } from '../render/terrainMesh';
import { Hud } from '../ui/hud';
import { GRAB_NAMES, type InputFrame } from '@shared/sim/input';

const MAX_STEPS_PER_FRAME = 12;

export class Game {
  readonly state: RiderState;
  readonly renderer: THREE.WebGLRenderer;
  readonly rig: SceneRig;
  readonly cam: FollowCamera;
  readonly rider = new RiderModel();
  readonly snow = new SnowFx();
  readonly hud: Hud;
  readonly keys = new Keyboard();
  paused = false;
  /** Showing the start screen; the sim doesn't run until the player starts. */
  waiting = true;
  /** Sim ticks run so far (for tests / debugging). */
  ticks = 0;
  /** When set, used instead of the keyboard (automated tests, replays later). */
  inputOverride: InputFrame | null = null;

  private acc = 0;
  private last = 0;
  private prevPos = new THREE.Vector3();
  private prevQ = new THREE.Quaternion();
  private curPos = new THREE.Vector3();
  private curQ = new THREE.Quaternion();
  private visQ = new THREE.Quaternion();
  private landOffset = new THREE.Quaternion();
  private sink = 0;
  private fps = 60;
  private camMode: 'follow' | 'close' = 'follow';
  private events: SimEvent[] = [];
  private frameEvents: SimEvent[] = [];

  constructor(canvas: HTMLCanvasElement, hudRoot: HTMLElement, readonly world: World) {
    this.renderer = createRenderer(canvas);
    this.rig = createScene();
    this.cam = new FollowCamera(this.viewSize().w / this.viewSize().h, canvas);
    this.hud = new Hud(hudRoot);
    this.state = createRider(world, 1);

    const scene = this.rig.scene;
    scene.add(buildBaseTerrain(world));
    for (const f of world.terrain.features) scene.add(buildFeatureMesh(world, f));
    scene.add(buildRails(world));
    scene.add(buildTrees(world).group);
    scene.add(buildCourseMarkers(world));
    scene.add(this.rider.root);
    scene.add(this.snow.points);
    this.resize();

    this.syncPose(true);
    this.keys.onPress((code) => this.onKey(code));
    window.addEventListener('resize', () => this.resize());
    new ResizeObserver(() => this.resize()).observe(canvas);
    // Embedded pages only get keyboard input once clicked, so start from a click or a key.
    this.hud.showStart((fullscreen) => this.begin(fullscreen));
    canvas.addEventListener('pointerdown', () => this.begin(false));
  }

  /** Leave the start screen and start the run. */
  begin(fullscreen: boolean): void {
    if (!this.waiting) return;
    this.waiting = false;
    this.hud.hideStart();
    window.focus();
    if (fullscreen) document.documentElement.requestFullscreen?.().catch(() => {});
    this.last = performance.now();
    this.acc = 0;
    this.hud.showToast('PUSH OFF', 'clean', 'Hold W to pole out of the start gate', '', 3.5);
  }

  private viewSize(): { w: number; h: number } {
    const c = this.renderer.domElement;
    return { w: c.clientWidth || window.innerWidth, h: c.clientHeight || window.innerHeight };
  }

  start(): void {
    this.last = performance.now();
    const loop = (t: number) => {
      this.frame(t);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  private onKey(code: string): void {
    if (this.waiting) {
      if (code !== 'Escape' && code !== 'F3') this.begin(false);
      return;
    }
    if (code === 'Escape' || code === 'KeyP') {
      this.paused = !this.paused;
      if (this.paused) this.hud.showBanner('PAUSED', 'Esc / P to resume');
      else this.hud.hideBanner();
    } else if (code === 'KeyH') this.hud.toggleHelp();
    else if (code === 'F3' || code === 'Backquote') this.hud.toggleDebug();
    else if (code === 'KeyC') {
      this.camMode = this.camMode === 'follow' ? 'close' : 'follow';
      this.cam.settings = { ...CAMERA_PRESETS[this.camMode] };
      this.hud.showToast('CAMERA', 'clean', this.camMode.toUpperCase(), '', 1.2);
    }
  }

  private resize(): void {
    const { w, h } = this.viewSize();
    this.renderer.setSize(w, h, false);
    this.cam.camera.aspect = w / h;
    this.cam.camera.updateProjectionMatrix();
    this.snow.setViewportHeight(h);
  }

  private syncPose(snap = false): void {
    const s = this.state;
    this.prevPos.copy(this.curPos);
    this.prevQ.copy(this.curQ);
    this.curPos.set(s.pos.x, s.pos.y, s.pos.z);
    this.curQ.set(s.q.x, s.q.y, s.q.z, s.q.w);
    if (snap) {
      this.prevPos.copy(this.curPos);
      this.prevQ.copy(this.curQ);
    }
  }

  /** Advance the simulation by one fixed tick with the current input. */
  step(): void {
    this.events.length = 0;
    stepRider(this.state, this.inputOverride ?? this.keys.sample(), this.world, this.events);
    this.ticks++;
    this.syncPose();
    for (const e of this.events) {
      this.frameEvents.push(e);
      if (e.type === 'land' || e.type === 'touch' || e.type === 'restart' || e.type === 'recover') {
        // Blend from the pose we were showing into the ground pose.
        this.landOffset.copy(this.visQ).multiply(this.curQ.clone().invert());
        this.prevQ.copy(this.curQ);
        if (e.type === 'restart') {
          this.landOffset.identity();
          this.prevPos.copy(this.curPos);
        }
      }
    }
  }

  /**
   * Test hook: run `ticks` sim steps synchronously with a fixed input. Visuals (camera,
   * rider, FX) advance every tick so they match real play; drawing happens once at the end.
   */
  simulate(ticks: number, input: InputFrame | null, draw = true): void {
    this.inputOverride = input;
    for (let i = 0; i < ticks; i++) {
      this.step();
      this.handleEvents();
      this.updateVisuals(DT, 1);
    }
    this.inputOverride = null;
    if (draw) this.draw();
  }

  draw(): void {
    this.renderer.render(this.rig.scene, this.cam.camera);
  }

  private frame(now: number): void {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (dt > 0) this.fps += (1 / dt - this.fps) * 0.05;

    if (!this.paused && !this.waiting) {
      this.acc += dt;
      let n = 0;
      while (this.acc >= DT && n < MAX_STEPS_PER_FRAME) {
        this.step();
        this.acc -= DT;
        n++;
      }
      if (n === MAX_STEPS_PER_FRAME) this.acc = 0;
    }
    this.handleEvents();
    this.updateVisuals(this.paused ? 0 : dt, this.paused ? 1 : this.acc / DT);
    this.draw();
  }

  private handleEvents(): void {
    const s = this.state;
    for (const e of this.frameEvents) {
      const p = new THREE.Vector3(s.pos.x, s.pos.y, s.pos.z);
      const v = new THREE.Vector3(s.vel.x, s.vel.y, s.vel.z).multiplyScalar(0.3);
      switch (e.type) {
        case 'land':
          this.hud.showLanding(e);
          this.snow.burst(p, v, Math.round(18 + e.impact * 7), 4, 2 + e.impact * 0.3);
          break;
        case 'crash':
          this.hud.showToast('CRASH', 'crash', e.reason.toUpperCase(), e.hard ? 'HARD SLAM' : '');
          this.snow.burst(p, v, 90, 6, 4);
          break;
        case 'railOn':
          this.hud.showToast('ON RAIL', 'clean', this.world.rails[e.index].kind === 'box' ? 'BOX' : 'RAIL', '', 0.8);
          break;
        case 'railOff':
          this.hud.showToast('RAIL', 'clean', `${e.time.toFixed(2)} s on the ${this.world.rails[e.index].kind}`, '', 1.6);
          break;
        case 'restart':
          this.cam.reset();
          this.hud.hideBanner();
          this.hud.showToast('RESTART', 'clean', 'Hold W to push off', '', 1.6);
          break;
        case 'finish':
          this.hud.showBanner('FINISH', `${s.runTime.toFixed(2)} s · hold R to go again`, 6);
          break;
      }
    }
    this.frameEvents.length = 0;
  }

  private emitSnow(dt: number, pos: THREE.Vector3): void {
    const s = this.state;
    const sp = Math.hypot(s.vel.x, s.vel.y, s.vel.z);
    const v = new THREE.Vector3(s.vel.x, s.vel.y, s.vel.z);
    if (s.mode === 'ground') {
      let rate = 0;
      let lateral = 0;
      if (s.skidMode === SKID.BRAKE && sp > 1.5) { rate = 150 + sp * 8; lateral = s.brakeSide; }
      else if ((s.skidMode === SKID.SKETCHY || s.wobble > 0) && sp > 2) rate = 110;
      else if (Math.abs(s.lean) > 0.45 && sp > 8) { rate = 50 + Math.abs(s.lean) * 60; lateral = s.lean > 0 ? -1 : 1; }
      else if (sp > 13) rate = 8;
      if (s.onPowder && sp > 2.5) rate += 80;
      if (rate <= 0) return;
      const side = new THREE.Vector3(v.z, 0, -v.x).normalize();
      this.snow.stream(dt, rate, () => {
        const ev = v.clone().multiplyScalar(-0.15).addScaledVector(side, lateral * sp * 0.22);
        const off = new THREE.Vector3((Math.random() - 0.5) * 0.4, 0, (Math.random() - 0.5) * 0.8);
        this.snow.emit(pos.clone().add(off), ev, 1.8, s.onPowder ? 2.2 : 1.4, 0.9, s.onPowder ? 0.42 : 0.26);
      });
    } else if (s.mode === 'crash' && sp > 2 && !s.crash.airborne) {
      this.snow.stream(dt, 120, () => this.snow.emit(pos, v.clone().multiplyScalar(0.1), 2.5, 1.8, 0.9, 0.34));
    }
  }

  private updateVisuals(dt: number, alpha: number): void {
    const s = this.state;
    const pos = this.prevPos.clone().lerp(this.curPos, alpha);
    const q = this.prevQ.clone().slerp(this.curQ, alpha);
    this.landOffset.slerp(new THREE.Quaternion(), 1 - Math.exp(-dt / 0.07));
    this.visQ.copy(this.landOffset).multiply(q);

    const sp = Math.hypot(s.vel.x, s.vel.y, s.vel.z);
    const sinkTarget = s.mode === 'ground' && s.onPowder ? 0.3 + 0.3 * Math.max(0, Math.min(1, 1 - sp / 14)) : 0;
    this.sink += (sinkTarget - this.sink) * (1 - Math.exp(-dt / 0.25));
    const rp = pos.clone();
    rp.y -= this.sink;
    if (s.mode === 'crash') rp.addScaledVector(new THREE.Vector3(s.groundN.x, s.groundN.y, s.groundN.z), 0.17);
    this.rider.root.position.copy(rp);
    this.rider.root.quaternion.copy(this.visQ);
    this.rider.update(
      {
        mode: s.mode,
        lean: s.lean,
        crouch: s.crouch,
        tuck: s.tuck,
        grab: s.mode === 'air' ? s.air.grab : 0,
        switchStance: s.switchStance,
        poleAnim: s.poleAnim,
        braking: s.skidMode === SKID.BRAKE,
        wobble: s.wobble,
        airT: s.air.t,
        railT: s.rail.t,
      },
      dt,
    );

    this.emitSnow(dt, pos);
    this.snow.update(dt);
    this.cam.update(dt, s, pos, this.world);
    this.rig.follow(pos, this.cam.camera);
    this.hud.update(dt, s, this.hud.debugVisible ? this.debugText() : '');
  }

  private debugText(): string {
    const s = this.state;
    const a = s.air;
    const d = (r: number) => ((r * 180) / Math.PI).toFixed(0);
    const sp = Math.hypot(s.vel.x, s.vel.y, s.vel.z);
    const lines = [
      `fps ${this.fps.toFixed(0)}  tick ${s.tick}`,
      `mode ${s.mode}${s.switchStance ? ' (switch)' : ''}`,
      `pos ${s.pos.x.toFixed(1)} ${s.pos.y.toFixed(1)} ${s.pos.z.toFixed(1)}`,
      `speed ${sp.toFixed(2)} m/s  ${(sp * 3.6).toFixed(0)} km/h`,
      `heading ${d(s.heading)}  turn ${d(s.turnRate)}°/s`,
      `steer ${s.steer.toFixed(2)}  lean ${d(s.lean)}  tuck ${s.tuck.toFixed(2)}`,
      `skid ${s.skidMode}  wobble ${s.wobble.toFixed(2)}  crouch ${s.crouch.toFixed(2)}`,
      `lip ${s.lipDist < 1e8 ? s.lipDist.toFixed(2) : '-'}  pendingPop ${s.pendingPop.toFixed(2)}`,
    ];
    if (s.mode === 'air') {
      lines.push(
        `air t ${a.t.toFixed(2)} / pred ${a.predTotal.toFixed(2)}`,
        `spin ${d(a.spin)} (${d(a.spinRate)}/s)${a.spinSettling ? ' settle' : ''}`,
        `flip ${d(a.flip)} (${d(a.flipRate)}/s)  roll ${d(a.roll)}`,
        `inversions ${a.inversions}  grab ${GRAB_NAMES[a.grab] || '-'} ${a.grabHeld.toFixed(2)}`,
      );
    }
    if (s.mode === 'rail') lines.push(`rail ${s.rail.index} s ${s.rail.s.toFixed(2)} v ${s.rail.speed.toFixed(2)}`);
    if (s.mode === 'crash') lines.push(`crash ${s.crash.reason} t ${s.crash.t.toFixed(2)}`);
    return lines.join('\n');
  }
}
