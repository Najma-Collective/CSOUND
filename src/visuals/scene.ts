import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FilmPass } from 'three/examples/jsm/postprocessing/FilmPass.js';

export interface SceneBootstrapOptions {
  /** Controls overall brightness of the glade. */
  exposure?: number;
  /** Camera initial position. */
  cameraPosition?: THREE.Vector3;
  /** Target for the main spotlight. */
  focusPoint?: THREE.Vector3;
  /** Renderer clear color. */
  backgroundColor?: THREE.ColorRepresentation;
  /** Size to use for initial layout. */
  size?: { width: number; height: number };
}

export interface SceneContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  composer: EffectComposer;
  lighting: {
    ambient: THREE.AmbientLight;
    moon: THREE.DirectionalLight;
    fill: THREE.PointLight;
  };
  update: (delta: number) => void;
  resize: (width: number, height: number) => void;
  dispose: () => void;
}

/**
 * Bootstraps a Three.js scene tuned for an ethereal bioluminescent glade.
 */
export function bootstrapBioluminescentScene(
  canvas: HTMLCanvasElement,
  options: SceneBootstrapOptions = {}
): SceneContext {
  const size = options.size ?? {
    width: canvas.clientWidth || window.innerWidth,
    height: canvas.clientHeight || window.innerHeight,
  };

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(options.backgroundColor ?? 0x030914);
  scene.fog = new THREE.FogExp2((scene.background as THREE.Color).getHex(), 0.045);

  const camera = new THREE.PerspectiveCamera(60, size.width / size.height, 0.1, 200);
  camera.position.copy(
    options.cameraPosition ?? new THREE.Vector3(-4.5, 4.0, 10.5)
  );

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(size.width, size.height);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = options.exposure ?? 1.1;

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(size.width, size.height),
    1.35,
    0.85,
    0.2
  );
  composer.addPass(bloomPass);

  const filmPass = new FilmPass(0.2, 0.0, 2048, false);
  composer.addPass(filmPass);

  const ambient = new THREE.AmbientLight(0x335577, 0.5);
  scene.add(ambient);

  const moon = new THREE.DirectionalLight(0x9ec8ff, 1.1);
  moon.position.set(-6, 12, 4);
  moon.target.position.copy(options.focusPoint ?? new THREE.Vector3(0, 0, 0));
  scene.add(moon);
  scene.add(moon.target);

  const fill = new THREE.PointLight(0x3effb0, 1.6, 25, 1.5);
  fill.position.set(2.5, 1.2, -1.5);
  scene.add(fill);

  const update = (delta: number) => {
    bloomPass.strength = THREE.MathUtils.lerp(1.15, 1.6, Math.sin(performance.now() * 0.00025) * 0.5 + 0.5);
    fill.intensity = 1.2 + Math.sin(performance.now() * 0.0008) * 0.4;
    composer.render(delta);
  };

  const resize = (width: number, height: number) => {
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    composer.setSize(width, height);
  };

  const dispose = () => {
    composer.passes.forEach((pass) => {
      if ('dispose' in pass && typeof pass.dispose === 'function') {
        pass.dispose();
      }
    });
    composer.dispose();
    renderer.dispose();
  };

  return {
    scene,
    camera,
    renderer,
    composer,
    lighting: { ambient, moon, fill },
    update,
    resize,
    dispose,
  };
}
