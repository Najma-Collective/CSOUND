import * as THREE from 'three';

export interface MotionCurve {
  amplitude: number;
  frequency: number;
  phase?: number;
}

export interface FaunaOptions {
  palette?: string[];
  driftCurve?: MotionCurve;
  wingCurve?: MotionCurve;
  glowCurve?: MotionCurve;
}

export interface FaunaEntity {
  object: THREE.Object3D;
  update: (elapsed: number) => void;
  onInteraction?: (event: 'trajectory', payload?: { direction: THREE.Vector3 }) => void;
}

const defaultPalette = ['#7fffd4', '#ffe066', '#7f91ff'];

const vertexShader = /* glsl */ `
  uniform float time;
  uniform float wingFrequency;
  uniform float wingAmplitude;
  attribute float wingSide;
  varying float vWingSide;

  void main() {
    vWingSide = wingSide;
    vec3 transformed = position;
    transformed.y += sin(time * wingFrequency + wingSide) * wingAmplitude * (1.0 - abs(wingSide));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform float time;
  uniform vec3 tint;
  uniform float glowAmplitude;
  uniform float glowFrequency;
  varying float vWingSide;

  void main() {
    float glow = 0.6 + sin(time * glowFrequency + vWingSide * 2.0) * glowAmplitude;
    vec3 color = tint * glow;
    gl_FragColor = vec4(color, 0.9);
  }
`;

function createInsectGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.PlaneGeometry(0.6, 0.25, 1, 8);
  const wingSide = new Float32Array(geometry.attributes.position.count);
  for (let i = 0; i < wingSide.length; i += 1) {
    const x = geometry.attributes.position.getX(i);
    wingSide[i] = Math.sign(x);
  }
  geometry.setAttribute('wingSide', new THREE.BufferAttribute(wingSide, 1));
  geometry.translate(0, 0, 0);
  return geometry;
}

export function createFaunaFlock(
  count: number,
  options: FaunaOptions = {}
): FaunaEntity {
  const palette = options.palette ?? defaultPalette;
  const group = new THREE.Group();

  const meshes: THREE.Mesh[] = [];
  const materials: THREE.ShaderMaterial[] = [];

  for (let i = 0; i < count; i += 1) {
    const geometry = createInsectGeometry();
    const color = new THREE.Color(palette[i % palette.length]).convertSRGBToLinear();
    const material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        tint: { value: color },
        wingFrequency: { value: options.wingCurve?.frequency ?? 6.0 },
        wingAmplitude: { value: options.wingCurve?.amplitude ?? 0.15 },
        glowAmplitude: { value: options.glowCurve?.amplitude ?? 0.3 },
        glowFrequency: { value: options.glowCurve?.frequency ?? 2.5 },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      vertexShader,
      fragmentShader,
      depthWrite: false,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(
      (Math.random() - 0.5) * 6,
      1.5 + Math.random() * 2.5,
      (Math.random() - 0.5) * 6
    );
    mesh.rotation.set(Math.random() * 0.3, Math.random() * Math.PI, Math.random() * 0.3);

    group.add(mesh);
    meshes.push(mesh);
    materials.push(material);
  }

  const velocityOverrides = new Map<THREE.Mesh, THREE.Vector3>();

  const update = (elapsed: number) => {
    meshes.forEach((mesh, index) => {
      const t = elapsed + index;
      const driftAmp = options.driftCurve?.amplitude ?? 0.7;
      const driftFreq = options.driftCurve?.frequency ?? 0.2;
      const phase = options.driftCurve?.phase ?? 0;

      let velocity = new THREE.Vector3(
        Math.sin(t * driftFreq + phase + index) * driftAmp,
        Math.sin(t * driftFreq * 1.3 + phase + index * 0.3) * 0.3,
        Math.cos(t * driftFreq + phase + index) * driftAmp
      ).multiplyScalar(0.03);

      const override = velocityOverrides.get(mesh);
      if (override) {
        velocity = override.clone().multiplyScalar(0.05);
        velocityOverrides.set(
          mesh,
          override.lerp(new THREE.Vector3(), 0.02)
        );
        if (override.length() < 0.01) {
          velocityOverrides.delete(mesh);
        }
      }

      mesh.position.add(velocity);
      (mesh.material as THREE.ShaderMaterial).uniforms.time.value = elapsed;
    });
  };

  const onInteraction = (
    event: 'trajectory',
    payload?: { direction: THREE.Vector3 }
  ) => {
    if (event !== 'trajectory' || !payload?.direction) return;
    meshes.forEach((mesh) => {
      velocityOverrides.set(mesh, payload.direction.clone());
    });
  };

  const dispose = () => {
    meshes.forEach((mesh) => {
      (mesh.geometry as THREE.BufferGeometry).dispose();
      (mesh.material as THREE.ShaderMaterial).dispose();
    });
  };

  group.userData.dispose = dispose;

  return {
    object: group,
    update,
    onInteraction,
  };
}
