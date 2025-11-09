import * as THREE from "three";
import { resumeAudio, getBackgroundFilter } from "../audio/context";
import { MotifLayerManager } from "../audio/motifs";
import { EntityFactory } from "../visuals/entityFactory";
import type { FloraEntity } from "../visuals/flora";
import type { FaunaEntity } from "../visuals/fauna";
import {
  clampInteractionValue,
  getInteractionConfig,
} from "./config";
import { emitTelemetryEvent } from "./telemetry";

export interface InteractionControllerOptions {
  canvas: HTMLCanvasElement;
  camera: THREE.Camera;
  scene: THREE.Scene;
  entityFactory: EntityFactory;
  motifLayers: MotifLayerManager;
  lighting?: {
    ambient?: THREE.Light;
    fill?: THREE.Light;
  };
}

type NearestEntity =
  | { type: "flora"; entity: FloraEntity; distance: number }
  | { type: "fauna"; entity: FaunaEntity; distance: number }
  | null;

export class InteractionController {
  private readonly canvas: HTMLCanvasElement;

  private readonly camera: THREE.Camera;

  private readonly scene: THREE.Scene;

  private readonly entityFactory: EntityFactory;

  private readonly motifLayers: MotifLayerManager;

  private readonly raycaster = new THREE.Raycaster();

  private readonly pointer = new THREE.Vector2();

  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  private readonly lastWorldPoint = new THREE.Vector3();

  private readonly faunaDelta = new THREE.Vector3();

  private readonly backgroundReference = new THREE.Vector3();

  private readonly backgroundTarget = { hue: 0, light: 0 };

  private readonly backgroundState = { hue: 0, light: 0 };

  private readonly baseBackgroundHSL: { h: number; s: number; l: number } = {
    h: 0,
    s: 0,
    l: 0,
  };

  private readonly workingColor = new THREE.Color();

  private readonly tempVector = new THREE.Vector3();

  private readonly optionsLighting: InteractionControllerOptions["lighting"];

  private readonly ambientBaseIntensity: number | null;

  private readonly fillBaseIntensity: number | null;

  private backgroundFilter: BiquadFilterNode | null = null;

  private backgroundFilterRequested = false;

  private backgroundEaseHandle: number | null = null;

  private pointerDown = false;

  private activeDrag: "fauna" | "background" | null = null;

  private motifsStarted = false;

  private motifStartPending = false;

  private lastFloraInteraction = 0;

  private lastFaunaInteraction = 0;

  private lastBackgroundInteraction = 0;

  private floraHoverStrength = 0;

  private floraHoverTarget = 0;

  private gentleInquiryLevel = 0;

  private lastFaunaTelemetry = 0;

  private lastBackgroundTelemetry = 0;

  private readonly supportsPointerEvents =
    typeof window !== "undefined" && "PointerEvent" in window;

  private readonly handleAudioActivation = () => {
    void this.maybeStartMotifs();
  };

  private removeAudioActivationListeners: (() => void) | null = null;

  constructor(options: InteractionControllerOptions) {
    this.canvas = options.canvas;
    this.camera = options.camera;
    this.scene = options.scene;
    this.entityFactory = options.entityFactory;
    this.motifLayers = options.motifLayers;
    this.optionsLighting = options.lighting;

    this.ambientBaseIntensity = this.optionsLighting?.ambient?.intensity ?? null;
    this.fillBaseIntensity = this.optionsLighting?.fill?.intensity ?? null;

    if (this.scene.background instanceof THREE.Color) {
      this.scene.background.getHSL(this.baseBackgroundHSL);
    }

    this.attachListeners();
    this.attachAudioActivationListeners();

    emitTelemetryEvent({
      name: "session_start",
      attributes: {
        floraClusters: this.entityFactory.getFloraEntities().length,
        faunaFlocks: this.entityFactory.getFaunaEntities().length,
      },
    });
  }

  dispose(): void {
    this.detachListeners();
    this.removeAudioActivationListeners?.();
    this.removeAudioActivationListeners = null;
  }

  private attachListeners(): void {
    if (this.supportsPointerEvents) {
      this.canvas.addEventListener("pointerdown", this.handlePointerDown);
      this.canvas.addEventListener("pointermove", this.handlePointerMove);
      this.canvas.addEventListener("pointerleave", this.handlePointerUp);
      window.addEventListener("pointerup", this.handlePointerUp);
      window.addEventListener("pointercancel", this.handlePointerUp);
      return;
    }

    this.canvas.addEventListener("mousedown", this.handleMouseDown);
    this.canvas.addEventListener("mousemove", this.handleMouseMove);
    this.canvas.addEventListener("mouseleave", this.handleMouseUp);
    window.addEventListener("mouseup", this.handleMouseUp);

    this.canvas.addEventListener("touchstart", this.handleTouchStart, { passive: false });
    this.canvas.addEventListener("touchmove", this.handleTouchMove, { passive: false });
    window.addEventListener("touchend", this.handleTouchEnd, { passive: false });
    window.addEventListener("touchcancel", this.handleTouchEnd, { passive: false });
  }

  private detachListeners(): void {
    if (this.backgroundEaseHandle !== null && typeof window !== "undefined") {
      window.cancelAnimationFrame(this.backgroundEaseHandle);
      this.backgroundEaseHandle = null;
    }

    if (this.supportsPointerEvents) {
      this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
      this.canvas.removeEventListener("pointermove", this.handlePointerMove);
      this.canvas.removeEventListener("pointerleave", this.handlePointerUp);
      window.removeEventListener("pointerup", this.handlePointerUp);
      window.removeEventListener("pointercancel", this.handlePointerUp);
      return;
    }

    this.canvas.removeEventListener("mousedown", this.handleMouseDown);
    this.canvas.removeEventListener("mousemove", this.handleMouseMove);
    this.canvas.removeEventListener("mouseleave", this.handleMouseUp);
    window.removeEventListener("mouseup", this.handleMouseUp);

    this.canvas.removeEventListener("touchstart", this.handleTouchStart);
    this.canvas.removeEventListener("touchmove", this.handleTouchMove);
    window.removeEventListener("touchend", this.handleTouchEnd);
    window.removeEventListener("touchcancel", this.handleTouchEnd);
  }

  private attachAudioActivationListeners(): void {
    if (typeof window === "undefined") {
      return;
    }

    const cleanupCallbacks: Array<() => void> = [];
    const handler = this.handleAudioActivation;

    const addListener = (
      target: EventTarget | null | undefined,
      type: string,
      options?: AddEventListenerOptions,
    ) => {
      if (!target) {
        return;
      }
      target.addEventListener(type, handler, options);
      cleanupCallbacks.push(() => target.removeEventListener(type, handler, options));
    };

    const documentRef = typeof document !== "undefined" ? document : null;
    const primaryTarget: EventTarget = documentRef ?? window;

    addListener(primaryTarget, "keydown", { capture: true });

    if (this.supportsPointerEvents) {
      addListener(primaryTarget, "pointerdown", { capture: true });
    } else {
      addListener(primaryTarget, "mousedown", { capture: true });
      addListener(primaryTarget, "touchstart", { passive: true, capture: true });
      addListener(primaryTarget, "touchend", { passive: true, capture: true });
    }

    this.removeAudioActivationListeners = () => {
      cleanupCallbacks.forEach((cleanup) => cleanup());
      this.removeAudioActivationListeners = null;
    };
  }

  private handlePointerDown = (event: PointerEvent) => {
    this.handlePointerDownInternal(event);
  };

  private handlePointerDownInternal = (event: {
    clientX: number;
    clientY: number;
    pointerId?: number;
  }) => {
    const worldPoint = this.projectToWorld(event.clientX, event.clientY);
    this.pointerDown = true;
    this.activeDrag = null;
    this.lastWorldPoint.copy(worldPoint);

    void this.maybeStartMotifs();

    if (typeof event.pointerId === "number" && "setPointerCapture" in this.canvas) {
      try {
        this.canvas.setPointerCapture(event.pointerId);
      } catch (error) {
        // Some environments do not support setPointerCapture (e.g., Safari canvas fallback).
      }
    }

    const nearest = this.findNearestEntity(worldPoint);
    const config = getInteractionConfig();
    const now = performance.now();

    if (nearest?.type === "flora" && nearest.distance <= config.flora.hoverRadius) {
      this.triggerFloraBloom(nearest.entity, now);
      this.floraHoverTarget = 1;
    } else if (nearest?.type === "fauna" && nearest.distance <= config.fauna.dragRadius) {
      this.activeDrag = "fauna";
      this.lastFaunaInteraction = now - config.fauna.cooldownMs;
      this.faunaDelta.setScalar(0);
      this.floraHoverTarget = 0;
    } else {
      this.activeDrag = "background";
      this.backgroundReference.copy(worldPoint);
      this.lastBackgroundInteraction = now - config.background.cooldownMs;
      this.floraHoverTarget = 0;
    }

    this.updateGentleInquiryLevel(config);
  };

  private handlePointerMove = (event: PointerEvent) => {
    this.handlePointerMoveInternal(event);
  };

  private handlePointerMoveInternal = (event: { clientX: number; clientY: number }) => {
    const worldPoint = this.projectToWorld(event.clientX, event.clientY);
    const config = getInteractionConfig();
    const now = performance.now();

    if (!this.pointerDown) {
      const nearest = this.findNearestEntity(worldPoint);
      if (nearest?.type === "flora" && nearest.distance <= config.flora.hoverRadius) {
        const normalizedDistance = clampInteractionValue(
          nearest.distance / config.flora.hoverRadius,
          [0, 1],
        );
        this.floraHoverTarget = 1 - normalizedDistance;
        if (now - this.lastFloraInteraction > config.flora.bloomCooldownMs) {
          this.triggerFloraBloom(nearest.entity, now);
        }
      } else {
        this.floraHoverTarget = 0;
      }

      this.updateGentleInquiryLevel(config);
      this.lastWorldPoint.copy(worldPoint);
      return;
    }

    if (this.activeDrag === "fauna") {
      if (now - this.lastFaunaInteraction < config.fauna.cooldownMs) {
        this.lastWorldPoint.copy(worldPoint);
        return;
      }

      const delta = this.tempVector.copy(worldPoint).sub(this.lastWorldPoint).setY(0);

      if (delta.lengthSq() === 0) {
        this.lastWorldPoint.copy(worldPoint);
        return;
      }

      const smoothing = clampInteractionValue(config.fauna.directionSmoothing, [0.01, 0.9]);
      if (this.faunaDelta.lengthSq() === 0) {
        this.faunaDelta.copy(delta);
      } else {
        this.faunaDelta.lerp(delta, smoothing);
      }

      const maxDrag = Math.max(0.2, config.fauna.maxDragDelta);
      if (this.faunaDelta.length() > maxDrag) {
        this.faunaDelta.setLength(maxDrag);
      }

      this.entityFactory.triggerTrajectoryShift(this.faunaDelta);
      this.updateFaunaMotifs(config, this.faunaDelta.length() / maxDrag);
      this.lastFaunaInteraction = now;

      if (now - this.lastFaunaTelemetry > 1500) {
        this.lastFaunaTelemetry = now;
        emitTelemetryEvent({
          name: "fauna_drag",
          attributes: {
            dragMagnitude: Number(this.faunaDelta.length().toFixed(3)),
            normalized: Number((this.faunaDelta.length() / maxDrag).toFixed(3)),
            faunaCount: this.entityFactory.getFaunaEntities().length,
          },
        });
      }
    } else if (this.activeDrag === "background") {
      if (now - this.lastBackgroundInteraction >= config.background.cooldownMs) {
        const delta = worldPoint.clone().sub(this.backgroundReference);
        const normalizedX = THREE.MathUtils.clamp(delta.x / config.fauna.maxDragDelta, -1, 1);
        const normalizedZ = THREE.MathUtils.clamp(delta.z / config.fauna.maxDragDelta, -1, 1);
        this.backgroundTarget.hue = normalizedX;
        this.backgroundTarget.light = normalizedZ;
        this.applyBackgroundState(config);
        this.lastBackgroundInteraction = now;

        if (now - this.lastBackgroundTelemetry > 2000) {
          this.lastBackgroundTelemetry = now;
          emitTelemetryEvent({
            name: "background_shift",
            attributes: {
              hueOffset: Number(this.backgroundTarget.hue.toFixed(3)),
              lightOffset: Number(this.backgroundTarget.light.toFixed(3)),
            },
          });
        }
      }
    }

    this.lastWorldPoint.copy(worldPoint);
  };

  private handlePointerUp = (event: PointerEvent) => {
    this.handlePointerUpInternal(event);
  };

  private handlePointerUpInternal = (event: { pointerId?: number }) => {
    if (this.pointerDown && typeof event.pointerId === "number" && "releasePointerCapture" in this.canvas) {
      try {
        this.canvas.releasePointerCapture(event.pointerId);
      } catch (error) {
        // Ignore release failures.
      }
    }

    this.pointerDown = false;
    this.activeDrag = null;
    this.backgroundTarget.hue = 0;
    this.backgroundTarget.light = 0;
    const config = getInteractionConfig();
    this.applyBackgroundState(config);
    this.floraHoverTarget = 0;
    this.updateGentleInquiryLevel(config);
  };

  private handleMouseDown = (event: MouseEvent) => {
    event.preventDefault();
    this.handlePointerDownInternal({ clientX: event.clientX, clientY: event.clientY });
  };

  private handleMouseMove = (event: MouseEvent) => {
    this.handlePointerMoveInternal({ clientX: event.clientX, clientY: event.clientY });
  };

  private handleMouseUp = (_event: MouseEvent) => {
    this.handlePointerUpInternal({});
  };

  private extractTouchPoint(event: TouchEvent):
    | { clientX: number; clientY: number; identifier: number }
    | null {
    if (event.changedTouches && event.changedTouches.length > 0) {
      const touch = event.changedTouches[0];
      return { clientX: touch.clientX, clientY: touch.clientY, identifier: touch.identifier };
    }

    if (event.touches && event.touches.length > 0) {
      const touch = event.touches[0];
      return { clientX: touch.clientX, clientY: touch.clientY, identifier: touch.identifier };
    }

    return null;
  }

  private handleTouchStart = (event: TouchEvent) => {
    const touch = this.extractTouchPoint(event);
    if (!touch) {
      return;
    }

    event.preventDefault();
    this.handlePointerDownInternal({
      clientX: touch.clientX,
      clientY: touch.clientY,
      pointerId: touch.identifier,
    });
  };

  private handleTouchMove = (event: TouchEvent) => {
    const touch = this.extractTouchPoint(event);
    if (!touch) {
      return;
    }

    event.preventDefault();
    this.handlePointerMoveInternal({ clientX: touch.clientX, clientY: touch.clientY });
  };

  private handleTouchEnd = (event: TouchEvent) => {
    const touch = this.extractTouchPoint(event);
    event.preventDefault();
    this.handlePointerUpInternal({ pointerId: touch?.identifier });
  };

  private projectToWorld(clientX: number, clientY: number): THREE.Vector3 {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -(((clientY - rect.top) / rect.height) * 2 - 1);

    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersection = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(this.groundPlane, intersection);
    return intersection;
  }

  private findNearestEntity(worldPoint: THREE.Vector3): NearestEntity {
    let nearest: NearestEntity = null;
    let minDistance = Number.POSITIVE_INFINITY;

    const floraEntities = this.entityFactory.getFloraEntities();
    floraEntities.forEach((flora) => {
      const position = new THREE.Vector3();
      flora.object.getWorldPosition(position);
      const distance = position.distanceTo(worldPoint);
      if (distance < minDistance) {
        minDistance = distance;
        nearest = { type: "flora", entity: flora, distance };
      }
    });

    const faunaEntities = this.entityFactory.getFaunaEntities();
    faunaEntities.forEach((fauna) => {
      const position = new THREE.Vector3();
      fauna.object.getWorldPosition(position);
      const distance = position.distanceTo(worldPoint);
      if (distance < minDistance) {
        minDistance = distance;
        nearest = { type: "fauna", entity: fauna, distance };
      }
    });

    return nearest;
  }

  private triggerFloraBloom(entity: FloraEntity, timestamp: number): void {
    const config = getInteractionConfig();
    if (timestamp - this.lastFloraInteraction < config.flora.bloomCooldownMs) {
      return;
    }

    entity.onInteraction?.("bloom");
    this.lastFloraInteraction = timestamp;
    this.maybeStartMotifs();

    const bloomIntensity = THREE.MathUtils.lerp(0.4, 0.9, this.floraHoverTarget);
    this.motifLayers.setIntensity("gentleInquiry", bloomIntensity, config.flora.motifFadeSeconds);

    emitTelemetryEvent({
      name: "flora_bloom",
      attributes: {
        hoverStrength: Number(this.floraHoverTarget.toFixed(3)),
        bloomIntensity: Number(bloomIntensity.toFixed(3)),
        floraCount: this.entityFactory.getFloraEntities().length,
      },
    });
  }

  private updateGentleInquiryLevel(config: ReturnType<typeof getInteractionConfig>): void {
    this.floraHoverStrength = THREE.MathUtils.lerp(
      this.floraHoverStrength,
      this.floraHoverTarget,
      clampInteractionValue(config.flora.hoverEase, [0.01, 0.6]),
    );

    const targetLevel = THREE.MathUtils.lerp(0.28, 0.82, this.floraHoverStrength);
    if (Math.abs(targetLevel - this.gentleInquiryLevel) > 0.02) {
      this.gentleInquiryLevel = targetLevel;
      this.motifLayers.setIntensity(
        "gentleInquiry",
        this.gentleInquiryLevel,
        config.flora.motifFadeSeconds,
      );
    }
  }

  private updateFaunaMotifs(config: ReturnType<typeof getInteractionConfig>, normalized: number): void {
    const [minIntensity, maxIntensity] = config.fauna.motifIntensityRange;
    const intensity = THREE.MathUtils.lerp(minIntensity, maxIntensity, THREE.MathUtils.clamp(normalized, 0, 1));
    this.motifLayers.setIntensity("risingHope", intensity, config.fauna.motifRampSeconds);
    this.motifLayers.setIntensity(
      "shimmeringCascade",
      intensity * 0.85,
      config.fauna.motifRampSeconds,
    );
  }

  private applyBackgroundState(config: ReturnType<typeof getInteractionConfig>): void {
    this.backgroundState.hue = THREE.MathUtils.lerp(
      this.backgroundState.hue,
      this.backgroundTarget.hue,
      clampInteractionValue(config.background.dragEasing, [0.01, 0.45]),
    );
    this.backgroundState.light = THREE.MathUtils.lerp(
      this.backgroundState.light,
      this.backgroundTarget.light,
      clampInteractionValue(config.background.dragEasing, [0.01, 0.45]),
    );

    const hueOffset = THREE.MathUtils.mapLinear(
      this.backgroundState.hue,
      -1,
      1,
      config.background.hueShiftRange[0],
      config.background.hueShiftRange[1],
    );
    const saturationOffset = THREE.MathUtils.mapLinear(
      this.backgroundState.light,
      -1,
      1,
      config.background.saturationRange[0],
      config.background.saturationRange[1],
    );
    const lightnessOffset = THREE.MathUtils.mapLinear(
      this.backgroundState.light,
      -1,
      1,
      config.background.lightnessRange[0],
      config.background.lightnessRange[1],
    );

    if (this.scene.background instanceof THREE.Color) {
      const base = this.baseBackgroundHSL;
      const hue = (base.h + hueOffset + 1) % 1;
      const saturation = THREE.MathUtils.clamp(base.s + saturationOffset, 0, 1);
      const lightness = THREE.MathUtils.clamp(base.l + lightnessOffset, 0, 1);
      this.workingColor.setHSL(hue, saturation, lightness);
      this.scene.background.copy(this.workingColor);
    }

    if (this.scene.fog && "color" in this.scene.fog) {
      (this.scene.fog as THREE.Fog | THREE.FogExp2).color.lerp(this.workingColor, 0.35);
    }

    if (this.optionsLighting?.ambient && this.ambientBaseIntensity !== null) {
      const mix = (this.backgroundState.light + 1) / 2;
      this.optionsLighting.ambient.intensity = THREE.MathUtils.lerp(
        this.ambientBaseIntensity * 0.85,
        this.ambientBaseIntensity * 1.2,
        mix,
      );
    }

    if (this.optionsLighting?.fill && this.fillBaseIntensity !== null) {
      const mix = (this.backgroundState.hue + 1) / 2;
      this.optionsLighting.fill.intensity = THREE.MathUtils.lerp(
        this.fillBaseIntensity * 0.8,
        this.fillBaseIntensity * 1.35,
        mix,
      );
    }

    const backgroundFilter = this.ensureBackgroundFilter();
    if (backgroundFilter) {
      const context = backgroundFilter.context;
      const mix = (this.backgroundState.light + 1) / 2;
      const freq = THREE.MathUtils.lerp(
        config.background.audioFrequencyRange[0],
        config.background.audioFrequencyRange[1],
        mix,
      );
      const q = THREE.MathUtils.lerp(
        config.background.audioQRange[0],
        config.background.audioQRange[1],
        Math.abs(this.backgroundState.hue),
      );
      const timeConstant = Math.max(0.05, config.background.dragEasing);
      backgroundFilter.frequency.setTargetAtTime(freq, context.currentTime, timeConstant);
      backgroundFilter.Q.setTargetAtTime(q, context.currentTime, timeConstant);
    }

    const needsEase =
      Math.abs(this.backgroundState.hue - this.backgroundTarget.hue) > 0.01 ||
      Math.abs(this.backgroundState.light - this.backgroundTarget.light) > 0.01;
    if (needsEase && this.backgroundEaseHandle === null && typeof window !== "undefined") {
      this.backgroundEaseHandle = window.requestAnimationFrame(() => {
        this.backgroundEaseHandle = null;
        this.applyBackgroundState(getInteractionConfig());
      });
    }
  }

  private async maybeStartMotifs(): Promise<void> {
    if (this.motifsStarted || this.motifStartPending) {
      return;
    }

    this.motifStartPending = true;

    try {
      await resumeAudio();
    } catch (error) {
      // Ignore resume errors (e.g., environment without Web Audio).
      this.motifStartPending = false;
      return;
    }

    try {
      this.motifLayers.start();
      this.motifsStarted = true;
      this.removeAudioActivationListeners?.();
      this.removeAudioActivationListeners = null;

      emitTelemetryEvent({
        name: "motif_started",
        attributes: {
          chord: this.motifLayers.getActiveChord().name,
        },
      });
    } finally {
      this.motifStartPending = false;
    }
  }

  private ensureBackgroundFilter(): BiquadFilterNode | null {
    if (this.backgroundFilter || this.backgroundFilterRequested) {
      return this.backgroundFilter;
    }

    this.backgroundFilterRequested = true;
    try {
      this.backgroundFilter = getBackgroundFilter();
    } catch (error) {
      this.backgroundFilter = null;
      this.backgroundFilterRequested = false;
    }

    return this.backgroundFilter;
  }
}
