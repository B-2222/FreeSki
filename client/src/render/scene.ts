// Renderer, sky, fog and lights.

import * as THREE from 'three';

export const SKY = {
  zenith: new THREE.Color('#2f6fc4'),
  horizon: new THREE.Color('#d8e7f5'),
  fog: new THREE.Color('#cfe0f1'),
};

export function createRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  r.setSize(window.innerWidth, window.innerHeight, false);
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFShadowMap;
  // Neutral tone mapping keeps snow white instead of greying it out.
  r.toneMapping = THREE.NeutralToneMapping;
  r.toneMappingExposure = 1.0;
  r.outputColorSpace = THREE.SRGBColorSpace;
  return r;
}

export interface SceneRig {
  scene: THREE.Scene;
  sun: THREE.DirectionalLight;
  sunDir: THREE.Vector3;
  sky: THREE.Mesh;
  /** Keep the sun's shadow box and the sky centred on the camera / rider. */
  follow(target: THREE.Vector3, camera: THREE.Camera): void;
}

export function createScene(): SceneRig {
  const scene = new THREE.Scene();
  scene.background = SKY.horizon.clone();
  scene.fog = new THREE.Fog(SKY.fog, 160, 1100);

  // Sun high on the right, slightly downhill, so slopes facing down the fall line are lit.
  const sunDir = new THREE.Vector3(0.5, 0.8, -0.35).normalize();

  // Gradient sky dome with a soft sun glow.
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      zenith: { value: SKY.zenith },
      horizon: { value: SKY.horizon },
      sunDir: { value: sunDir },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 zenith; uniform vec3 horizon; uniform vec3 sunDir;
      varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y, -0.2, 1.0);
        vec3 col = mix(horizon, zenith, pow(max(h, 0.0), 0.55));
        float s = max(dot(normalize(vDir), sunDir), 0.0);
        col += vec3(1.0, 0.95, 0.85) * (pow(s, 600.0) * 2.5 + pow(s, 12.0) * 0.18);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), skyMat);
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  scene.add(sky);

  const hemi = new THREE.HemisphereLight('#dce8fb', '#ffffff', 1.5);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight('#fff6ea', 3.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45;
  sc.near = 1; sc.far = 260;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);
  scene.add(sun.target);

  return {
    scene, sun, sunDir, sky,
    follow(target, camera) {
      sun.target.position.copy(target);
      sun.position.copy(target).addScaledVector(sunDir, 120);
      sky.position.copy(camera.position);
    },
  };
}
