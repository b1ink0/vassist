import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Camera } from "@babylonjs/core/Cameras/camera";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import { drawingContext } from "./StageTextures";
import type { StageSeason } from "../../config/stageConfig";
import type { StageWeatherBounds } from "./types";

const weather: Record<
  StageSeason,
  {
    count: number;
    size: [number, number];
    fall: [number, number];
    drift: number;
    spin: number;
    lifetime: number;
  }
> = {
  winter: {
    count: 400,
    size: [0.012, 0.045],
    fall: [0.22, 0.55],
    drift: 0.14,
    spin: 0.4,
    lifetime: 12,
  },
  autumn: {
    count: 85,
    size: [0.035, 0.085],
    fall: [0.4, 0.8],
    drift: 0.32,
    spin: 2.2,
    lifetime: 9,
  },
  spring: {
    count: 140,
    size: [0.025, 0.065],
    fall: [0.18, 0.4],
    drift: 0.24,
    spin: 1.3,
    lifetime: 11,
  },
  summer: {
    count: 65,
    size: [0.004, 0.014],
    fall: [0.015, 0.06],
    drift: 0.08,
    spin: 0.2,
    lifetime: 14,
  },
};

export function createStageSeasonalEffects(
  scene: Scene,
  parent: TransformNode,
  anchor: [number, number, number],
  density = 1,
  bounds?: StageWeatherBounds | null,
) {
  const inverseWorld = Matrix.Identity();
  const localPosition = new Vector3();
  const scale = new Vector3();
  parent.computeWorldMatrix(true).decompose(scale);
  const units = Math.max(0.001, Math.abs(scale.y));
  const floor = new Vector3();
  const anchorPosition = Vector3.FromArray(anchor);
  const cameraPosition = new Vector3();
  const right = new Vector3();
  const up = new Vector3();
  const forward = new Vector3();
  const localForward = new Vector3(0, 0, scene.useRightHandedSystem ? -1 : 1);
  let width = 1,
    height = 1,
    time = 0;
  let enabled = true;
  let currentSeason: StageSeason = "summer";
  let activeSeason: StageSeason | null = null;
  let systems: ParticleSystem[] = [];
  let texture: DynamicTexture | null = null;

  const updateView = () => {
    Vector3.TransformCoordinatesToRef(
      anchorPosition,
      parent.computeWorldMatrix(),
      floor,
    );
    if (bounds) {
      parent.getWorldMatrix().invertToRef(inverseWorld);
      return;
    }
    const camera = scene.activeCamera;
    if (!camera) return;
    camera.getWorldMatrix();
    cameraPosition.copyFrom(camera.globalPosition);
    camera.getDirectionToRef(Vector3.RightReadOnly, right);
    camera.getDirectionToRef(Vector3.UpReadOnly, up);
    camera.getDirectionToRef(localForward, forward);
    const aspect = scene.getEngine().getAspectRatio(camera);
    const tangent = Math.tan(camera.fov / 2);
    height =
      camera.fovMode === Camera.FOVMODE_HORIZONTAL_FIXED
        ? tangent / aspect
        : tangent;
    width = height * aspect;
  };

  const makeTexture = (season: StageSeason) => {
    const result = new DynamicTexture(
      "stage " + season + " particle",
      64,
      scene,
      false,
    );
    const context = drawingContext(result);
    context.clearRect(0, 0, 64, 64);
    if (season === "winter" || season === "summer") {
      const glow = context.createRadialGradient(32, 32, 2, 32, 32, 27);
      const rgb = season === "winter" ? "245,250,255" : "255,232,166";
      glow.addColorStop(0, "rgba(" + rgb + ",1)");
      glow.addColorStop(0.42, "rgba(" + rgb + ",.95)");
      glow.addColorStop(1, "rgba(" + rgb + ",0)");
      context.fillStyle = glow;
      context.fillRect(0, 0, 64, 64);
      if (season === "winter") {
        context.strokeStyle = "rgba(255,255,255,.85)";
        context.lineWidth = 2;
        context.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = (i * Math.PI) / 3;
          context.moveTo(32, 32);
          context.lineTo(32 + Math.cos(angle) * 22, 32 + Math.sin(angle) * 22);
        }
        context.stroke();
      }
    } else if (season === "autumn") {
      const fill = context.createLinearGradient(12, 12, 50, 52);
      fill.addColorStop(0, "#f5bd57");
      fill.addColorStop(0.5, "#ce6d2f");
      fill.addColorStop(1, "#823923");
      context.fillStyle = fill;
      context.beginPath();
      context.moveTo(32, 5);
      const points: [number, number][] = [
        [39, 17],
        [49, 14],
        [46, 26],
        [58, 29],
        [48, 39],
        [51, 47],
        [34, 48],
        [31, 58],
        [28, 48],
        [13, 46],
        [17, 37],
        [6, 29],
        [20, 26],
        [17, 14],
        [27, 18],
      ];
      for (const [x, y] of points) context.lineTo(x, y);
      context.closePath();
      context.fill();
      context.strokeStyle = "rgba(87,47,20,.65)";
      context.lineWidth = 1.5;
      context.beginPath();
      context.moveTo(31, 58);
      context.lineTo(32, 12);
      context.moveTo(32, 37);
      context.lineTo(19, 29);
      context.moveTo(32, 32);
      context.lineTo(46, 25);
      context.stroke();
    } else {
      const fill = context.createLinearGradient(20, 10, 45, 55);
      fill.addColorStop(0, "#fff1f4");
      fill.addColorStop(1, "#e79db9");
      context.fillStyle = fill;
      context.beginPath();
      context.moveTo(32, 57);
      context.bezierCurveTo(5, 37, 12, 5, 29, 10);
      context.lineTo(32, 16);
      context.lineTo(36, 9);
      context.bezierCurveTo(56, 7, 56, 40, 32, 57);
      context.fill();
    }
    result.hasAlpha = true;
    result.update();
    return result;
  };

  const clear = () => {
    for (const system of systems) system.dispose(false);
    systems = [];
    texture?.dispose();
    texture = null;
    activeSeason = null;
  };

  const sync = () => {
    if (!enabled || bounds === null) {
      clear();
      return;
    }
    if (activeSeason === currentSeason) return;
    clear();
    activeSeason = currentSeason;
    updateView();
    texture = makeTexture(currentSeason);
    const settings = weather[currentSeason];
    // Perspective supplies the size difference. Existing particles stay in world
    // space when the camera moves; only the spawn volume follows its framing.
    for (const near of bounds ? [false] : [false, true]) {
      const count = Math.round(
        settings.count * density * (bounds ? 0.65 : near ? 0.08 : 0.92),
      );
      const system = new ParticleSystem(
        "stage " + currentSeason + (near ? " near" : " far"),
        count,
        scene,
      );
      system.emitter = Vector3.Zero();
      system.particleTexture = texture;
      system.isLocal = false;
      const outdoorLifetime = bounds
        ? (bounds.max[1] - bounds.min[1]) / settings.fall[0] + 1
        : settings.lifetime;
      system.minLifeTime = bounds ? outdoorLifetime : settings.lifetime * 0.7;
      system.maxLifeTime = bounds ? outdoorLifetime * 1.15 : settings.lifetime;
      system.minSize = settings.size[0] * units;
      system.maxSize = settings.size[1] * units;
      const crossingTime =
        (bounds
          ? bounds.max[1] - bounds.min[1]
          : 2 * height * (near ? 1.8 : 8)) /
        ((settings.fall[0] + settings.fall[1]) * 0.5);
      system.emitRate =
        count /
        (bounds
          ? crossingTime
          : Math.min(settings.lifetime * 0.65, Math.max(1.5, crossingTime)));
      system.updateSpeed = 1 / 60;
      system.blendMode = ParticleSystem.BLENDMODE_STANDARD;
      system.minInitialRotation = -Math.PI;
      system.maxInitialRotation = Math.PI;
      system.minAngularSpeed = -settings.spin;
      system.maxAngularSpeed = settings.spin;
      system.addColorGradient(0, new Color4(1, 1, 1, 0));
      system.addColorGradient(0.08, new Color4(1, 1, 1, near ? 0.95 : 0.85));
      system.addColorGradient(0.8, new Color4(1, 1, 1, near ? 0.95 : 0.85));
      system.addColorGradient(1, new Color4(1, 1, 1, 0));
      let seeded = 0;
      system.startPositionFunction = (_matrix, position) => {
        if (bounds) {
          localPosition.set(
            bounds.min[0] + Math.random() * (bounds.max[0] - bounds.min[0]),
            seeded++ < count
              ? bounds.min[1] + Math.random() * (bounds.max[1] - bounds.min[1])
              : bounds.max[1],
            bounds.min[2] + Math.random() * (bounds.max[2] - bounds.min[2]),
          );
          Vector3.TransformCoordinatesToRef(
            localPosition,
            parent.getWorldMatrix(),
            position,
          );
          return;
        }
        const distance =
          (near ? 0.65 + Math.random() * 2.35 : 3 + Math.random() * 10) * units;
        const x = (Math.random() * 2 - 1) * distance * width * 1.15;
        const y =
          (seeded++ < count ? Math.random() * 2 - 0.9 : 1.1) *
          distance *
          height *
          1.15;
        position.copyFrom(cameraPosition);
        position.addInPlaceFromFloats(
          forward.x * distance + right.x * x + up.x * y,
          forward.y * distance + right.y * x + up.y * y,
          forward.z * distance + right.z * x + up.z * y,
        );
        if (position.y < floor.y + 0.05 * units)
          position.y = floor.y + (0.1 + Math.random() * 2.8) * units;
      };
      system.startDirectionFunction = (_matrix, direction) => {
        direction.set(
          0,
          -(
            settings.fall[0] +
            Math.random() * (settings.fall[1] - settings.fall[0])
          ) * units,
          0,
        );
      };
      system.manualEmitCount = count;
      system.start();
      systems.push(system);
    }
  };

  const observer = scene.onBeforeRenderObservable.add(() => {
    if (
      !enabled ||
      !systems.length ||
      (typeof document !== "undefined" &&
        document.hidden &&
        !scene.metadata?.xrActive)
    )
      return;
    updateView();
    time += Math.min(scene.getEngine().getDeltaTime() / 1000, 0.1);
    const settings = weather[currentSeason];
    const gust = Math.sin(time * 0.37) * 0.45 + Math.sin(time * 0.13) * 0.3;
    for (const system of systems) {
      if (system.manualEmitCount === 0) system.manualEmitCount = -1;
      for (const particle of system.particles) {
        const phase = particle.id * 2.399;
        particle.direction.x =
          (gust + Math.sin(time * 0.9 + phase) * 0.6) * settings.drift * units;
        particle.direction.z =
          Math.cos(time * 0.65 + phase) * settings.drift * units * 0.5;
        if (bounds) {
          Vector3.TransformCoordinatesToRef(
            particle.position,
            inverseWorld,
            localPosition,
          );
          if (
            localPosition.x < bounds.min[0] ||
            localPosition.x > bounds.max[0] ||
            localPosition.z < bounds.min[2] ||
            localPosition.z > bounds.max[2] ||
            localPosition.y < bounds.min[1]
          )
            particle.age = particle.lifeTime;
        } else if (particle.position.y < floor.y + 0.015 * units) {
          particle.age = particle.lifeTime;
        }
      }
    }
  });

  return {
    setSeason(season: StageSeason) {
      currentSeason = season;
      sync();
    },
    setEnabled(value: boolean) {
      enabled = value;
      sync();
    },
    dispose() {
      scene.onBeforeRenderObservable.remove(observer);
      clear();
    },
  };
}
