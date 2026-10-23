// DOM heads-up display. Milestone 1 shows the landing judgment and the measured motion
// (spin, flips, grabs, air time); trick names and points arrive with scoring in milestone 2.

import { GRAB_NAMES } from '@shared/sim/input';
import { PHYS } from '@shared/sim/constants';
import type { LandEvent } from '@shared/sim/events';
import type { RiderState } from '@shared/sim/state';

const el = (cls: string, html = '') => {
  const d = document.createElement('div');
  d.className = cls;
  d.innerHTML = html;
  return d;
};

const fmtTime = (t: number) => {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
};

export class Hud {
  private speed = el('hud-speed', '<div class="num">0</div><div class="unit">KM/H</div>');
  private timer = el('hud-timer', '0:00.00');
  private state = el('hud-state');
  private toast = el('hud-toast', '<div class="title"></div><div class="detail"></div><div class="sub"></div>');
  private ring = el(
    'hud-ring',
    '<svg viewBox="0 0 96 96"><circle class="bg" cx="48" cy="48" r="40"/><circle class="fg" cx="48" cy="48" r="40" stroke-dasharray="251.3" stroke-dashoffset="251.3"/></svg><div class="label">RESTART</div>',
  );
  private help = el('hud-panel hud-help');
  private debug = el('hud-panel hud-debug hidden');
  private banner = el('hud-banner', '<div class="big"></div><div class="small"></div>');
  private start = el('hud-start hidden');
  private toastTimer = 0;
  private bannerTimer = 0;

  constructor(root: HTMLElement) {
    this.help.innerHTML = `
      <h2>FROSTLINE · TEST SLOPE</h2>
      ${[
        ['<kbd>W</kbd> pole / tuck', 'push off slow, tuck fast'],
        ['<kbd>A</kbd><kbd>D</kbd> carve', 'spin in the air'],
        ['<kbd>S</kbd> brake', 'backflip in the air'],
        ['<kbd>W</kbd> in air', 'frontflip'],
        ['<kbd>←</kbd><kbd>→</kbd>', 'roll / sideflip'],
        ['<kbd>Space</kbd> hold', 'crouch, release to pop'],
        ['<kbd>Shift</kbd> <kbd>Q</kbd> <kbd>E</kbd>', 'mute / tail / japan'],
        ['<kbd>Z</kbd> <kbd>X</kbd>', 'safety / blunt'],
        ['<kbd>R</kbd> hold 2 s', 'restart from the top'],
        ['<kbd>C</kbd>', 'camera follow / close'],
        ['Right mouse', 'hold to look around'],
        ['<kbd>Esc</kbd>/<kbd>P</kbd>', 'pause'],
      ].map(([a, b]) => `<div class="row"><span>${a}</span><span>${b}</span></div>`).join('')}
      <div class="foot">Release all rotation keys to settle for the landing. Let go of grabs before you land.<br/><kbd>H</kbd> hide help · <kbd>F3</kbd> debug</div>`;
    root.append(this.speed, this.timer, this.state, this.toast, this.ring, this.help, this.debug, this.banner, this.start);
  }

  /** Start screen: the game needs a click (or key) before it receives keyboard input. */
  showStart(onStart: (fullscreen: boolean) => void): void {
    const touchOnly = matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
    this.start.innerHTML = `
      <div class="logo">FROSTLINE</div>
      <div class="sub">Test slope · 3 kickers · 2 rails</div>
      ${touchOnly ? '<p class="warn">This early build needs a keyboard. Touch controls come in a later milestone.</p>' : ''}
      <div class="buttons">
        <button type="button" id="start-play">Drop in</button>
        <button type="button" id="start-full" class="ghost">Drop in fullscreen</button>
      </div>
      <p class="hint">Click here or press any key to start, then hold <kbd>W</kbd> to push off.</p>`;
    this.start.classList.remove('hidden');
    (this.start.querySelector('#start-play') as HTMLButtonElement).addEventListener('click', (e) => { e.stopPropagation(); onStart(false); });
    (this.start.querySelector('#start-full') as HTMLButtonElement).addEventListener('click', (e) => { e.stopPropagation(); onStart(true); });
    this.start.addEventListener('click', () => onStart(false));
    (this.start.querySelector('#start-play') as HTMLButtonElement).focus();
  }

  hideStart(): void {
    this.start.classList.add('hidden');
  }

  toggleHelp(): void {
    this.help.classList.toggle('hidden');
  }

  toggleDebug(): void {
    this.debug.classList.toggle('hidden');
  }

  get debugVisible(): boolean {
    return !this.debug.classList.contains('hidden');
  }

  showToast(title: string, cls: string, detail = '', sub = '', time = 2.2): void {
    const [t, d, s] = Array.from(this.toast.children) as HTMLElement[];
    t.textContent = title;
    t.className = `title ${cls}`;
    d.textContent = detail;
    s.textContent = sub;
    this.toast.classList.add('show');
    this.toastTimer = time;
  }

  showLanding(e: LandEvent): void {
    const parts: string[] = [];
    const spin = Math.round(Math.abs(e.spinDeg) / 180) * 180;
    if (spin > 0) parts.push(`SPIN ${spin} ${e.spinDeg > 0 ? 'L' : 'R'}`);
    const flips = Math.round(Math.abs(e.flipDeg) / 360);
    if (flips > 0) parts.push(`${flips > 1 ? flips + 'x ' : ''}${e.flipDeg > 0 ? 'BACKFLIP' : 'FRONTFLIP'}`);
    const rolls = Math.round(Math.abs(e.rollDeg) / 360);
    if (rolls > 0) parts.push(`${rolls > 1 ? rolls + 'x ' : ''}SIDEFLIP ${e.rollDeg > 0 ? 'R' : 'L'}`);
    for (let g = 1; g < e.grabTimes.length; g++) {
      const t = e.grabTimes[g];
      if (t >= PHYS.grabCountTime) parts.push(`${GRAB_NAMES[g]} ${t.toFixed(1)}s${t >= PHYS.grabFullTime ? '★' : ''}`);
    }
    if (e.switchLanding && e.quality !== 'crash') parts.push('SWITCH');
    if (parts.length === 0) parts.push('STRAIGHT AIR');
    const sub = [`AIR ${e.airTime.toFixed(2)} s`, `HEIGHT ${e.height.toFixed(1)} m`];
    if (e.inversions) sub.push(`INVERTED ×${e.inversions}`);
    if (e.smack) sub.push('SMACK!');
    if (e.quality !== 'clean' && e.reason) sub.push(e.reason.toUpperCase());
    if (e.quality !== 'clean') sub.push(`yaw ${e.yawErr.toFixed(0)}° pitch ${e.pitchErr.toFixed(0)}° roll ${e.rollErr.toFixed(0)}°`);
    this.showToast(e.quality.toUpperCase(), e.quality, parts.join(' · '), sub.join(' · '));
  }

  showBanner(big: string, small: string, time = Infinity): void {
    const [b, s] = Array.from(this.banner.children) as HTMLElement[];
    b.textContent = big;
    s.textContent = small;
    this.banner.classList.add('show');
    this.bannerTimer = time;
  }

  hideBanner(): void {
    this.banner.classList.remove('show');
  }

  update(dt: number, s: RiderState, debugText: string): void {
    const sp = Math.hypot(s.vel.x, s.vel.y, s.vel.z);
    (this.speed.firstElementChild as HTMLElement).textContent = String(Math.round(sp * 3.6));
    this.timer.textContent = fmtTime(s.runTime);
    const tags: string[] = [s.mode.toUpperCase()];
    if (s.switchStance && s.mode !== 'crash') tags.push('SWITCH');
    if (s.mode === 'ground' && s.tuck > 0.5) tags.push('TUCK');
    if (s.onPowder && s.mode === 'ground') tags.push('POWDER');
    this.state.textContent = tags.join(' · ');

    const ring = this.ring.querySelector('.fg') as SVGCircleElement;
    const f = Math.min(1, s.restartHold / PHYS.restartHoldTime);
    ring.setAttribute('stroke-dashoffset', String(251.3 * (1 - f)));
    this.ring.classList.toggle('show', s.restartHold > 0.05);

    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toast.classList.remove('show');
    }
    if (this.bannerTimer !== Infinity && this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.hideBanner();
    }
    if (this.debugVisible) this.debug.textContent = debugText;
  }
}
