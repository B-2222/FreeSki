import { describe, expect, it } from 'vitest';
import { acos, asin, atan, atan2, cos, exp, sin, tan, wrapAngle } from '../math/dmath';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

describe('deterministic math', () => {
  it('sin/cos/tan match Math within 1e-14 over a wide range', () => {
    for (let x = -60; x <= 60; x += 0.0137) {
      expect(Math.abs(sin(x) - Math.sin(x))).toBeLessThan(1e-14);
      expect(Math.abs(cos(x) - Math.cos(x))).toBeLessThan(1e-14);
    }
    for (let x = -1.5; x <= 1.5; x += 0.01) expect(Math.abs(tan(x) - Math.tan(x))).toBeLessThan(1e-12);
  });

  it('atan/atan2/asin/acos match Math', () => {
    for (let x = -50; x <= 50; x += 0.0131) expect(Math.abs(atan(x) - Math.atan(x))).toBeLessThan(1e-15);
    for (let y = -3; y <= 3; y += 0.37) {
      for (let x = -3; x <= 3; x += 0.29) expect(Math.abs(atan2(y, x) - Math.atan2(y, x))).toBeLessThan(1e-14);
    }
    for (let x = -1; x <= 1; x += 0.001) {
      expect(Math.abs(asin(x) - Math.asin(x))).toBeLessThan(1e-13);
      expect(Math.abs(acos(x) - Math.acos(x))).toBeLessThan(1e-13);
    }
  });

  it('exp matches Math.exp (relative)', () => {
    for (let x = -30; x <= 30; x += 0.0173) {
      expect(Math.abs(exp(x) - Math.exp(x)) / Math.exp(x)).toBeLessThan(1e-14);
    }
  });

  it('wrapAngle stays in [-pi, pi]', () => {
    for (let a = -40; a < 40; a += 0.3) {
      const w = wrapAngle(a);
      expect(w).toBeGreaterThanOrEqual(-Math.PI - 1e-12);
      expect(w).toBeLessThanOrEqual(Math.PI + 1e-12);
      expect(Math.abs(Math.sin(w) - Math.sin(a))).toBeLessThan(1e-9);
    }
  });
});

describe('sim code purity', () => {
  // The sim must not use engine-dependent Math functions or Math.random, and must not import Three.js.
  const forbidden = /Math\.(sin|cos|tan|asin|acos|atan|atan2|exp|expm1|log|log2|log10|log1p|pow|random|hypot|cbrt|sinh|cosh|tanh|asinh|acosh|atanh)\b|from ['"]three['"]|performance\.now|Date\.now/;
  const roots = ['math', 'sim', 'terrain', 'maps'].map((d) => join(__dirname, '..', d));
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.ts') && !p.endsWith('.test.ts')) files.push(p);
    }
  };
  roots.forEach(walk);
  it.each(files.map((f) => [f.split('shared')[1], f]))('%s uses only deterministic math', (_, f) => {
    const src = readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '');
    expect(src.match(forbidden)?.[0] ?? null).toBeNull();
  });
});
