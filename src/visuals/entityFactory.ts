import * as THREE from 'three';
import {
  createFloraCluster,
  FloraEntity,
  FloraOptions,
} from './flora';
import { createFaunaFlock, FaunaEntity, FaunaOptions } from './fauna';

export interface AnimatedEntity {
  object: THREE.Object3D;
  update: (elapsed: number) => void;
  onInteraction?: (event: string, payload?: unknown) => void;
}

export interface EntityFactoryOptions {
  flora?: FloraOptions;
  fauna?: FaunaOptions;
}

type SeededRandom = () => number;

function createSeededRandom(seed: number | string): SeededRandom {
  let h = 2166136261 >>> 0;
  const strSeed = seed.toString();
  for (let i = 0; i < strSeed.length; i += 1) {
    h ^= strSeed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class EntityFactory {
  private scene: THREE.Scene;

  private random: SeededRandom;

  private floraEntities: FloraEntity[] = [];

  private faunaEntities: FaunaEntity[] = [];

  private options: EntityFactoryOptions;

  constructor(scene: THREE.Scene, seed: number | string, options: EntityFactoryOptions = {}) {
    this.scene = scene;
    this.random = createSeededRandom(seed);
    this.options = options;
  }

  spawnFloraCluster(
    count: number,
    overrides: FloraOptions = {}
  ): FloraEntity {
    const flora = createFloraCluster(count, {
      ...this.options.flora,
      ...overrides,
    });

    const radius = 3 + this.random() * 3;
    flora.object.position.set(
      (this.random() - 0.5) * radius,
      0,
      (this.random() - 0.5) * radius
    );

    this.scene.add(flora.object);
    this.floraEntities.push(flora);
    return flora;
  }

  spawnFaunaFlock(
    count: number,
    overrides: FaunaOptions = {}
  ): FaunaEntity {
    const fauna = createFaunaFlock(count, {
      ...this.options.fauna,
      ...overrides,
    });

    fauna.object.position.set(
      (this.random() - 0.5) * 4,
      2 + this.random() * 2,
      (this.random() - 0.5) * 4
    );

    this.scene.add(fauna.object);
    this.faunaEntities.push(fauna);
    return fauna;
  }

  update(elapsed: number): void {
    this.floraEntities.forEach((flora) => flora.update(elapsed));
    this.faunaEntities.forEach((fauna) => fauna.update(elapsed));
  }

  getFloraEntities(): readonly FloraEntity[] {
    return this.floraEntities;
  }

  getFaunaEntities(): readonly FaunaEntity[] {
    return this.faunaEntities;
  }

  triggerBlooming(): void {
    this.floraEntities.forEach((flora) => flora.onInteraction?.('bloom'));
  }

  triggerTrajectoryShift(direction?: THREE.Vector3): void {
    const dir = direction?.clone() ?? new THREE.Vector3(
      this.random() - 0.5,
      (this.random() - 0.2) * 0.6,
      this.random() - 0.5
    ).normalize();
    this.faunaEntities.forEach((fauna) =>
      fauna.onInteraction?.('trajectory', { direction: dir })
    );
  }

  dispose(): void {
    this.floraEntities.forEach((flora) => {
      flora.object.parent?.remove(flora.object);
      flora.object.traverse((child) => {
        if ('dispose' in child.userData) {
          child.userData.dispose();
        }
      });
    });

    this.faunaEntities.forEach((fauna) => {
      fauna.object.parent?.remove(fauna.object);
      fauna.object.traverse((child) => {
        if ('dispose' in child.userData) {
          child.userData.dispose();
        }
      });
    });

    this.floraEntities = [];
    this.faunaEntities = [];
  }
}
