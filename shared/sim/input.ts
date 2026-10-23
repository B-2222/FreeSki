// One input frame per sim tick. Buttons are a bitmask; analog axes are integers in
// [-127, 127] so recorded inputs are exact and compact (replays, server verification).

export const BTN = {
  LEFT: 1 << 0, // A: carve / spin left
  RIGHT: 1 << 1, // D: carve / spin right
  FWD: 1 << 2, // W: pole / tuck / frontflip
  BACK: 1 << 3, // S: brake / backflip
  ROLL_L: 1 << 4, // Left arrow
  ROLL_R: 1 << 5, // Right arrow
  MOD: 1 << 6, // Up arrow: rodeo / misty modifier
  POP: 1 << 7, // Space
  MUTE: 1 << 8, // Shift
  TAIL: 1 << 9, // Q
  JAPAN: 1 << 10, // E
  SAFETY: 1 << 11, // Z
  BLUNT: 1 << 12, // X
  BUTTER: 1 << 13, // B
  RESTART: 1 << 14, // R (hold)
  SKIP: 1 << 15, // F
} as const;

export interface InputFrame {
  /** Button bitmask (BTN). */
  b: number;
  /** Analog steer, -127 (left) .. 127 (right). */
  sx: number;
  /** Analog roll, -127 (left) .. 127 (right). */
  rx: number;
}

export const emptyInput = (): InputFrame => ({ b: 0, sx: 0, rx: 0 });

export const GRAB = { NONE: 0, MUTE: 1, TAIL: 2, JAPAN: 3, SAFETY: 4, BLUNT: 5 } as const;
export const GRAB_NAMES = ['', 'MUTE', 'TAIL', 'JAPAN', 'SAFETY', 'BLUNT'];
/** Grab button bits indexed by grab id. */
export const GRAB_BITS = [0, BTN.MUTE, BTN.TAIL, BTN.JAPAN, BTN.SAFETY, BTN.BLUNT];
