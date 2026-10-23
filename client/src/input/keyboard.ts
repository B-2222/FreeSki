// Keyboard -> sim input frames. Uses KeyboardEvent.code so bindings are layout independent.

import { BTN, type InputFrame } from '@shared/sim/input';

export const DEFAULT_BINDINGS: Record<string, number> = {
  KeyA: BTN.LEFT,
  KeyD: BTN.RIGHT,
  KeyW: BTN.FWD,
  KeyS: BTN.BACK,
  ArrowLeft: BTN.ROLL_L,
  ArrowRight: BTN.ROLL_R,
  ArrowUp: BTN.MOD,
  Space: BTN.POP,
  ShiftLeft: BTN.MUTE,
  ShiftRight: BTN.MUTE,
  KeyQ: BTN.TAIL,
  KeyE: BTN.JAPAN,
  KeyZ: BTN.SAFETY,
  KeyX: BTN.BLUNT,
  KeyB: BTN.BUTTER,
  KeyR: BTN.RESTART,
  KeyF: BTN.SKIP,
};

/** Keys whose browser default (scrolling etc.) should be suppressed. */
const SWALLOW = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']);

export class Keyboard {
  private down = new Set<string>();
  private listeners: ((code: string) => void)[] = [];

  constructor(private bindings: Record<string, number> = DEFAULT_BINDINGS) {
    window.addEventListener('keydown', (e) => {
      if (SWALLOW.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.down.add(e.code);
      for (const l of this.listeners) l(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
    });
    window.addEventListener('blur', () => this.down.clear());
  }

  /** Called once per key press (not repeats), for UI shortcuts. */
  onPress(fn: (code: string) => void): void {
    this.listeners.push(fn);
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  sample(): InputFrame {
    let b = 0;
    for (const code of this.down) b |= this.bindings[code] ?? 0;
    return { b, sx: 0, rx: 0 };
  }
}
