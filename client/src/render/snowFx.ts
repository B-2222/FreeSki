// Snow spray particles from the skis (carves, powerslides, landings, crashes, powder).
// Purely visual, so it uses Math.random freely.

import * as THREE from 'three';

const MAX = 1600;

function sprite(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class SnowFx {
  readonly points: THREE.Points;
  private pos = new Float32Array(MAX * 3);
  private vel = new Float32Array(MAX * 3);
  private life = new Float32Array(MAX);
  private maxLife = new Float32Array(MAX);
  private size = new Float32Array(MAX);
  private alpha = new Float32Array(MAX);
  private next = 0;
  private carry = 0;

  constructor() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { map: { value: sprite() }, scale: { value: 600 } },
      vertexShader: /* glsl */ `
        attribute float size; attribute float alpha; varying float vA; uniform float scale;
        void main() {
          vA = alpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * scale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map; varying float vA;
        void main() {
          vec4 t = texture2D(map, gl_PointCoord);
          gl_FragColor = vec4(vec3(0.97, 0.98, 1.0), t.a * vA);
        }`,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
  }

  setViewportHeight(h: number): void {
    (this.points.material as THREE.ShaderMaterial).uniforms.scale.value = h * 0.9;
  }

  emit(p: THREE.Vector3, v: THREE.Vector3, spread: number, up: number, life = 0.9, size = 0.25): void {
    const i = this.next;
    this.next = (this.next + 1) % MAX;
    this.pos[i * 3] = p.x + (Math.random() - 0.5) * 0.3;
    this.pos[i * 3 + 1] = p.y + Math.random() * 0.1;
    this.pos[i * 3 + 2] = p.z + (Math.random() - 0.5) * 0.3;
    this.vel[i * 3] = v.x + (Math.random() - 0.5) * spread;
    this.vel[i * 3 + 1] = v.y + up * (0.5 + Math.random());
    this.vel[i * 3 + 2] = v.z + (Math.random() - 0.5) * spread;
    this.maxLife[i] = this.life[i] = life * (0.6 + Math.random() * 0.6);
    this.size[i] = size * (0.6 + Math.random() * 0.9);
  }

  /** Continuous emission at `rate` particles per second. */
  stream(dt: number, rate: number, fn: () => void): void {
    this.carry += rate * dt;
    while (this.carry >= 1) {
      fn();
      this.carry -= 1;
    }
  }

  burst(p: THREE.Vector3, v: THREE.Vector3, n: number, spread = 5, up = 3): void {
    for (let i = 0; i < n; i++) this.emit(p, v, spread, up, 1.1, 0.32);
  }

  update(dt: number): void {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const drag = Math.exp(-dt * 2.2);
      this.vel[i * 3] *= drag;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * drag - 6 * dt;
      this.vel[i * 3 + 2] *= drag;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const t = this.life[i] / this.maxLife[i];
      this.alpha[i] = Math.max(0, Math.min(1, t * 1.6)) * 0.85;
      this.size[i] *= 1 + dt * 0.8;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.size.needsUpdate = true;
    g.attributes.alpha.needsUpdate = true;
  }
}
