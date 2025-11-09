export * from "./visuals/scene";
export * from "./visuals/entityFactory";
export * from "./visuals/flora";
export * from "./visuals/fauna";
export * from "./interactions/controller";
export * from "./interactions/config";
export * from "./interactions/telemetry";
export * from "./systems";
export * from "./audio/context";
export * from "./audio/nodes";
export * from "./audio/analysis";
export * from "./audio/registry";
export * from "./audio/debugTools";
export * from "./audio/motifs";

import * as THREE from "three";

import { bootstrapBioluminescentScene } from "./visuals/scene";
import { EntityFactory } from "./visuals/entityFactory";
import { createMotifLayerManager } from "./audio/motifs";
import { InteractionController } from "./interactions/controller";
import { configureTelemetry } from "./interactions/telemetry";
import type { TelemetryEnvironment } from "./interactions/telemetry";
import { suspendAudio } from "./audio/context";

type BrowserGlobal = typeof globalThis & {
  __CSOUND_APP__?: {
    dispose: () => void;
  };
};

type ImportMetaWithEnv = ImportMeta & {
  env?: Record<string, string | undefined>;
};

const isBrowser = typeof window !== "undefined" && typeof document !== "undefined";

function resolveTelemetryDebug(): boolean {
  if (!isBrowser) {
    return false;
  }

  const env = (import.meta as ImportMetaWithEnv).env ?? {};
  const environment = (env.CSOUND_ENVIRONMENT ?? "development").toLowerCase();
  return environment !== ("production" satisfies TelemetryEnvironment);
}

function ensureRootElement(): HTMLDivElement {
  const existing = document.getElementById("csound-root");
  if (existing instanceof HTMLDivElement) {
    existing.style.position = existing.style.position || "relative";
    return existing;
  }

  const root = document.createElement("div");
  root.id = "csound-root";
  root.style.position = "relative";
  root.style.width = "100%";
  root.style.height = "100%";
  document.body.appendChild(root);
  return root;
}

interface AppInstance {
  dispose: () => void;
}

function mountApp(): AppInstance {
  const root = ensureRootElement();
  const loadingIndicator = root.querySelector<HTMLDivElement>("#csound-loading");

  const canvas = document.createElement("canvas");
  canvas.id = "csound-canvas";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.display = "block";
  canvas.style.touchAction = "none";
  root.appendChild(canvas);

  const sceneContext = bootstrapBioluminescentScene(canvas, {
    exposure: 1.08,
  });

  const entityFactory = new EntityFactory(sceneContext.scene, "glade-demo", {
    flora: {
      bendCurve: { amplitude: 0.24, frequency: 0.35 },
      pulseCurve: { amplitude: 0.28, frequency: 1.15 },
    },
    fauna: {
      driftCurve: { amplitude: 0.9, frequency: 0.18 },
      wingCurve: { amplitude: 0.18, frequency: 6.6 },
      glowCurve: { amplitude: 0.32, frequency: 2.4 },
    },
  });

  const floraClusters = [18, 14, 12, 9];
  floraClusters.forEach((count, index) => {
    entityFactory.spawnFloraCluster(count, {
      pulseCurve: { amplitude: 0.22 + index * 0.04, frequency: 1.05 + index * 0.08 },
      bendCurve: { amplitude: 0.21 + index * 0.03, frequency: 0.32 + index * 0.05 },
    });
  });

  const faunaFlocks = [6, 5];
  faunaFlocks.forEach((count, index) => {
    entityFactory.spawnFaunaFlock(count, {
      driftCurve: { amplitude: 0.75 + index * 0.18, frequency: 0.16 + index * 0.04 },
      wingCurve: { amplitude: 0.16 + index * 0.02, frequency: 6.2 + index * 0.4 },
      glowCurve: { amplitude: 0.28 + index * 0.05, frequency: 2.2 + index * 0.35 },
    });
  });

  const motifLayers = createMotifLayerManager({
    shimmeringCascade: { density: 0.9 },
  });

  const controller = new InteractionController({
    canvas,
    camera: sceneContext.camera,
    scene: sceneContext.scene,
    entityFactory,
    motifLayers,
    lighting: sceneContext.lighting,
  });

  const clock = new THREE.Clock();
  let animationFrame = 0;

  const resize = () => {
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    sceneContext.resize(width, height);
  };

  const render = () => {
    const delta = clock.getDelta();
    const elapsed = clock.getElapsedTime();
    entityFactory.update(elapsed);
    sceneContext.update(delta);
    animationFrame = window.requestAnimationFrame(render);
  };

  resize();
  animationFrame = window.requestAnimationFrame(render);

  const handleResize = () => resize();
  window.addEventListener("resize", handleResize);

  loadingIndicator?.remove();
  window.dispatchEvent(new Event("csound:ready"));

  return {
    dispose: () => {
      window.removeEventListener("resize", handleResize);
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
      }
      controller.dispose();
      motifLayers.stop();
      entityFactory.dispose();
      sceneContext.dispose();
      void suspendAudio();
      if (canvas.parentElement === root) {
        root.removeChild(canvas);
      }
    },
  };
}

function bootstrap(): void {
  configureTelemetry({
    debug: resolveTelemetryDebug(),
  });

  const globalObject = window as BrowserGlobal;
  if (globalObject.__CSOUND_APP__) {
    return;
  }

  const start = () => {
    globalObject.__CSOUND_APP__ = mountApp();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
}

if (isBrowser) {
  bootstrap();
}
