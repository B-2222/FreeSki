// Deterministic math.
//
// JS engines are free to implement Math.sin, Math.atan2, Math.exp etc. differently,
// so the same run could diverge between Chrome, Firefox, Safari and the Node server.
// Everything here is built only from IEEE-754 + - * / and Math.sqrt (which are
// exactly specified), so results are bit-identical everywhere.
// Kernels follow the classic fdlibm polynomial approximations.

export const PI = 3.141592653589793;
export const TAU = 6.283185307179586;
export const HALF_PI = 1.5707963267948966;
export const DEG = PI / 180;
export const RAD = 180 / PI;

const INV_PIO2 = 6.36619772367581382433e-1;
const PIO2_1 = 1.57079632673412561417; // first 33 bits of pi/2
const PIO2_1T = 6.07710050650619224932e-11; // pi/2 - PIO2_1

const S1 = -1.66666666666666324348e-1;
const S2 = 8.33333333332248946124e-3;
const S3 = -1.98412698298579493134e-4;
const S4 = 2.75573137070700676789e-6;
const S5 = -2.50507602534068634195e-8;
const S6 = 1.58969099521155010221e-10;

const C1 = 4.16666666666666019037e-2;
const C2 = -1.38888888888741095749e-3;
const C3 = 2.48015872894767294178e-5;
const C4 = -2.75573143513906633035e-7;
const C5 = 2.08757232129817482790e-9;
const C6 = -1.13596475577881948265e-11;

function kSin(x: number): number {
  const z = x * x;
  return x + x * z * (S1 + z * (S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)))));
}

function kCos(x: number): number {
  const z = x * x;
  return 1 - 0.5 * z + z * z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
}

/** Reduce x to r in [-pi/4, pi/4] and quadrant n (0..3). Valid for |x| < ~1e8. */
function reduce(x: number): [number, number] {
  const k = Math.round(x * INV_PIO2);
  const r = x - k * PIO2_1 - k * PIO2_1T;
  const n = ((k % 4) + 4) % 4;
  return [r, n];
}

export function sin(x: number): number {
  if (x > -0.7853981633974483 && x < 0.7853981633974483) return kSin(x);
  const [r, n] = reduce(x);
  switch (n) {
    case 0: return kSin(r);
    case 1: return kCos(r);
    case 2: return -kSin(r);
    default: return -kCos(r);
  }
}

export function cos(x: number): number {
  if (x > -0.7853981633974483 && x < 0.7853981633974483) return kCos(x);
  const [r, n] = reduce(x);
  switch (n) {
    case 0: return kCos(r);
    case 1: return -kSin(r);
    case 2: return -kCos(r);
    default: return kSin(r);
  }
}

export function tan(x: number): number {
  return sin(x) / cos(x);
}

const ATANHI = [4.63647609000806093515e-1, 7.85398163397448278999e-1, 9.82793723247329054082e-1, 1.57079632679489655800];
const ATANLO = [2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17, 6.12323399573676603587e-17];
const AT = [
  3.33333333333329318027e-1, -1.99999999998764832476e-1, 1.42857142725034663711e-1,
  -1.11111104054623557880e-1, 9.09088713343650656196e-2, -7.69187620504482999495e-2,
  6.66107313738753120669e-2, -5.83357013379057348645e-2, 4.97687799461593236017e-2,
  -3.65315727442169155270e-2, 1.62858201153657823623e-2,
];

export function atan(xIn: number): number {
  const neg = xIn < 0;
  let x = neg ? -xIn : xIn;
  if (x > 1e17) return neg ? -HALF_PI : HALF_PI;
  let id: number;
  if (x < 0.4375) {
    id = -1;
  } else if (x < 1.1875) {
    if (x < 0.6875) { id = 0; x = (2 * x - 1) / (2 + x); }
    else { id = 1; x = (x - 1) / (x + 1); }
  } else if (x < 2.4375) {
    id = 2; x = (x - 1.5) / (1 + 1.5 * x);
  } else {
    id = 3; x = -1 / x;
  }
  const z = x * x;
  const w = z * z;
  const s1 = z * (AT[0] + w * (AT[2] + w * (AT[4] + w * (AT[6] + w * (AT[8] + w * AT[10])))));
  const s2 = w * (AT[1] + w * (AT[3] + w * (AT[5] + w * (AT[7] + w * AT[9]))));
  let r: number;
  if (id < 0) r = x - x * (s1 + s2);
  else r = ATANHI[id] - ((x * (s1 + s2) - ATANLO[id]) - x);
  return neg ? -r : r;
}

export function atan2(y: number, x: number): number {
  if (x > 0) return atan(y / x);
  if (x < 0) return y >= 0 ? atan(y / x) + PI : atan(y / x) - PI;
  if (y > 0) return HALF_PI;
  if (y < 0) return -HALF_PI;
  return 0;
}

export function asin(x: number): number {
  const c = x > 1 ? 1 : x < -1 ? -1 : x;
  return atan2(c, Math.sqrt(1 - c * c));
}

export function acos(x: number): number {
  const c = x > 1 ? 1 : x < -1 ? -1 : x;
  return atan2(Math.sqrt(1 - c * c), c);
}

const LN2_HI = 6.93147180369123816490e-1;
const LN2_LO = 1.90821492927058770002e-10;
const INV_LN2 = 1.44269504088896338700;
const P1 = 1.66666666666666019037e-1;
const P2 = -2.77777777770155933842e-3;
const P3 = 6.61375632143793436117e-5;
const P4 = -1.65339022054652515390e-6;
const P5 = 4.13813679705723846039e-8;

export function exp(x: number): number {
  if (x > 709) return Infinity;
  if (x < -745) return 0;
  const k = Math.round(x * INV_LN2);
  const hi = x - k * LN2_HI;
  const lo = k * LN2_LO;
  const r = hi - lo;
  const t = r * r;
  const c = r - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
  let y = 1 - ((lo - (r * c) / (2 - c)) - hi);
  // Scale by 2^k with exact power-of-two multiplications.
  if (k > 0) for (let i = 0; i < k; i++) y *= 2;
  else for (let i = 0; i < -k; i++) y *= 0.5;
  return y;
}

export const sqrt = Math.sqrt;

/** Wrap an angle to [-PI, PI]. */
export function wrapAngle(a: number): number {
  return a - TAU * Math.round(a / TAU);
}

/** Smoothing factor for exponential approach with time constant tau over dt. */
export function approachK(dt: number, tau: number): number {
  return tau <= 0 ? 1 : 1 - exp(-dt / tau);
}
