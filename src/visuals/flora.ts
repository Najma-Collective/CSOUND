import * as THREE from 'three';

export interface MotionCurve {
  amplitude: number;
  frequency: number;
  phase?: number;
}

export interface FloraOptions {
  palette?: string[];
  heightRange?: [number, number];
  bendCurve?: MotionCurve;
  pulseCurve?: MotionCurve;
}

export interface FloraEntity {
  object: THREE.Object3D;
  update: (elapsed: number) => void;
  onInteraction?: (event: 'bloom', payload?: unknown) => void;
}

const defaultPalette = ['#48ffd8', '#74a8ff', '#9a68ff', '#f8f1ff'];
const defaultHeightRange: [number, number] = [0.8, 2.1];
const vertexShader = /* glsl */ `
  uniform float time;
  uniform float bendAmplitude;
  uniform float bendFrequency;
  attribute float plantHeight;
  varying float vHeight;

  void main() {
    vHeight = plantHeight;
    float bend = sin(time * bendFrequency + position.y * 2.5) * bendAmplitude * (position.y / plantHeight);
    vec3 transformed = position;
    transformed.x += bend;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform float time;
  uniform vec3 baseColor;
  uniform float pulseAmplitude;
  uniform float pulseFrequency;
  varying float vHeight;

  void main() {
    float glow = 0.6 + sin(time * pulseFrequency + vHeight * 3.1415) * pulseAmplitude;
    vec3 color = baseColor * glow;
    gl_FragColor = vec4(color, 0.95);
  }
`;

export function createFloraCluster(
  count: number,
  options: FloraOptions = {}
): FloraEntity {
  const palette = options.palette ?? defaultPalette;
  const heightRange = options.heightRange ?? defaultHeightRange;

  const group = new THREE.Group();

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.ShaderMaterial[] = [];

  const entities: THREE.Mesh[] = [];

  for (let i = 0; i < count; i += 1) {
    const height = THREE.MathUtils.lerp(heightRange[0], heightRange[1], Math.random());
    const radius = 0.08 + Math.random() * 0.12;
    const geometry = new THREE.CylinderGeometry(0.0, radius, height, 12, 1, true);
    const positions = geometry.getAttribute('position');
    const plantHeight = new Float32Array(positions.count);
    for (let j = 0; j < plantHeight.length; j += 1) {
      plantHeight[j] = height;
    }
    geometry.setAttribute('plantHeight', new THREE.BufferAttribute(plantHeight, 1));
    geometry.translate(0, height / 2, 0);

    const color = new THREE.Color(palette[i % palette.length]).convertSRGBToLinear();

    const material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        baseColor: { value: color },
        bendAmplitude: {
          value: options.bendCurve?.amplitude ?? 0.25,
        },
        bendFrequency: {
          value: options.bendCurve?.frequency ?? 0.5,
        },
        pulseAmplitude: {
          value: options.pulseCurve?.amplitude ?? 0.25,
        },
        pulseFrequency: {
          value: options.pulseCurve?.frequency ?? 1.2,
        },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(
      (Math.random() - 0.5) * 6,
      0,
      (Math.random() - 0.5) * 6
    );
    mesh.rotation.y = Math.random() * Math.PI * 2;
    group.add(mesh);
    geometries.push(geometry);
    materials.push(material);
    entities.push(mesh);
  }

  const bloomTargets = new Set<THREE.Mesh>();

  const update = (elapsed: number) => {
    materials.forEach((material) => {
      material.uniforms.time.value = elapsed;
    });
    bloomTargets.forEach((mesh) => {
      const material = mesh.material as THREE.ShaderMaterial;
      material.uniforms.pulseAmplitude.value = THREE.MathUtils.lerp(
        material.uniforms.pulseAmplitude.value,
        (options.pulseCurve?.amplitude ?? 0.25) * 2.5,
        0.1
      );
    });
  };

  const onInteraction = (event: 'bloom') => {
    if (event !== 'bloom') return;
    entities.forEach((mesh) => {
      bloomTargets.add(mesh);
      setTimeout(() => {
        bloomTargets.delete(mesh);
        const material = mesh.material as THREE.ShaderMaterial;
        material.uniforms.pulseAmplitude.value = options.pulseCurve?.amplitude ?? 0.25;
      }, 1200);
    });
  };

  const dispose = () => {
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
  };

  group.userData.dispose = dispose;

  return {
    object: group,
    update,
    onInteraction,
  };
}
