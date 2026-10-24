import { drawingContext } from "../StageTextures";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Material } from "@babylonjs/core/Materials/material";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Effect } from "@babylonjs/core/Materials/effect";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { ShadowOnlyMaterial } from "@babylonjs/materials/shadowOnly";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import type { Light } from "@babylonjs/core/Lights/light";
import type { AuthoredStage, QuietStageOptions } from "../types";
import type { StageSeason } from "../../../config/stageConfig";
const V = (x = 0, y = 0, z = 0) => new Vector3(x, y, z),
  C = (h: string) => Color3.FromHexString(h);
const PRESETS = {
  ink: {
    name: "Ink",
    note: "Near-black, almost invisible floor",
    top: "#05070b",
    horizon: "#0d1016",
    floor: "#11151c",
    key: "#e9e9e5",
    fill: "#9faebd",
    shadow: 0.35,
    kind: "floor",
  },
  paper: {
    name: "Paper",
    note: "Warm, seamless light studio",
    top: "#e6e3da",
    horizon: "#d4d1c7",
    floor: "#c6c3b8",
    key: "#fff4e1",
    fill: "#c7d1d5",
    shadow: 0.22,
    kind: "floor",
  },
  slate: {
    name: "Slate",
    note: "Cool stone with a circular plinth",
    top: "#38434c",
    horizon: "#66717a",
    floor: "#39424a",
    key: "#f2e8d7",
    fill: "#a4bbc8",
    shadow: 0.3,
    kind: "disc",
  },
  dusk: {
    name: "Dusk",
    note: "Violet twilight with a warm open horizon",
    top: "#25233d",
    horizon: "#aa645e",
    floor: "#43384e",
    key: "#f5d9b1",
    fill: "#b6c5cf",
    shadow: 0.23,
    kind: "floor",
  },
  stillwater: {
    name: "Stillwater",
    note: "Deep blue water with subtle ripples",
    top: "#0b2033",
    horizon: "#466875",
    floor: "#1e3e50",
    key: "#e4e2d7",
    fill: "#99c2ca",
    shadow: 0.22,
    kind: "water",
  },
  pebble: {
    name: "Pebble",
    note: "A soft rectangular base in warm sand",
    top: "#ac9070",
    horizon: "#d9bc8d",
    floor: "#b49a76",
    key: "#ffedcf",
    fill: "#b5c2c3",
    shadow: 0.25,
    kind: "pebble",
  },
};
export function createQuietStage(
  scene: Scene,
  {
    preset = "ink",
    lighting = true,
    contactShadow = true,
    realShadows = false,
    shadowSize = 512,
    shadowFilteringQuality = ShadowGenerator.QUALITY_LOW,
  }: QuietStageOptions = {},
): AuthoredStage {
  if (!PRESETS[preset]) throw Error("Unknown quiet stage: " + preset);
  const p = PRESETS[preset],
    root = new TransformNode("QuietStage " + preset, scene),
    meshes: Mesh[] = [],
    materials: Material[] = [],
    textures: BaseTexture[] = [],
    lights: Light[] = [];
  const previous = { clearColor: scene.clearColor.clone() };
  let contact: Mesh | null = null,
    waterMaterial: ShaderMaterial | null = null,
    clock = 0,
    fillLight: HemisphericLight | null = null,
    rimLight: DirectionalLight | null = null;
  function mat(n: string, hex: string, unlit = false) {
    const m = new StandardMaterial(n, scene);
    m.diffuseColor = C(hex);
    m.specularColor = Color3.Black();
    m.disableLighting = unlit;
    if (unlit) m.emissiveColor = C(hex);
    m.maxSimultaneousLights = 3;
    materials.push(m);
    return m;
  }
  function own<T extends Material>(mesh: Mesh, m: T): Mesh & { material: T } {
    mesh.parent = root;
    mesh.material = m;
    meshes.push(mesh);
    return mesh as Mesh & { material: T };
  }
  // A single 12-triangle sky cube, with a cheap directional gradient.
  Effect.ShadersStore.quietSkyVertexShader =
    "precision highp float;attribute vec3 position;uniform mat4 worldViewProjection;varying vec3 vD;void main(){vD=position;gl_Position=worldViewProjection*vec4(position,1.);}";
  Effect.ShadersStore.quietSkyFragmentShader = `precision highp float;
    varying vec3 vD;
    uniform vec3 topColor;
    uniform vec3 horizonColor;
    uniform float nightStars;
    uniform float starTime;
    void main(){
      vec3 d=normalize(vD);
      vec3 color=mix(horizonColor,topColor,smoothstep(-.15,.7,d.y));
      vec2 uv=vec2(atan(d.z,d.x)/6.283185+.5,asin(clamp(d.y,-1.,1.))/3.141593+.5)*vec2(640.,320.);
      float seed=fract(sin(dot(floor(uv),vec2(127.1,311.7)))*43758.5453);
      float star=step(.99,seed)*(1.-smoothstep(.06,.34,length(fract(uv)-.5)));
      float twinkle=.7+.3*sin(starTime*.65+seed*120.);
      color+=vec3(.66,.77,1.)*star*twinkle*nightStars*smoothstep(.02,.35,d.y);
      gl_FragColor=vec4(color,1.);
    }`;
  const sky = own(
    MeshBuilder.CreateBox(
      "quiet gradient",
      { size: 160, sideOrientation: Mesh.BACKSIDE },
      scene,
    ),
    new ShaderMaterial(
      "quiet sky " + preset,
      scene,
      { vertex: "quietSky", fragment: "quietSky" },
      {
        attributes: ["position"],
        uniforms: [
          "worldViewProjection",
          "topColor",
          "horizonColor",
          "nightStars",
          "starTime",
        ],
      },
    ),
  );
  materials.push(sky.material);
  sky.infiniteDistance = true;
  sky.isPickable = false;
  sky.material.setColor3("topColor", C(p.top));
  sky.material.setColor3("horizonColor", C(p.horizon));
  sky.material.setFloat("nightStars", 0);
  sky.material.setFloat("starTime", 0);
  // Small generated opacity map lets the floor fade into the backdrop.
  const fade = new DynamicTexture(
      "quiet floor fade",
      { width: 128, height: 128 },
      scene,
      false,
    ),
    fc = drawingContext(fade),
    fg = fc.createRadialGradient(64, 64, 7, 64, 64, 64);
  fg.addColorStop(0, "rgba(255,255,255,1)");
  fg.addColorStop(0.25, "rgba(255,255,255,.95)");
  fg.addColorStop(1, "rgba(255,255,255,0)");
  fc.fillStyle = fg;
  fc.fillRect(0, 0, 128, 128);
  fade.update();
  fade.hasAlpha = true;
  textures.push(fade);
  const ground: Mesh = own(
    MeshBuilder.CreateGround("quiet floor", { width: 36, height: 36 }, scene),
    mat("quiet floor " + preset, p.floor),
  );
  const floorMaterial = ground.material as StandardMaterial;
  floorMaterial.opacityTexture = fade;
  floorMaterial.transparencyMode = Material.MATERIAL_ALPHABLEND;
  ground.receiveShadows = true;
  ground.isPickable = false;
  let anchorY = 0.005;
  // Physical bases only in two presets; the other four keep the floor clear.
  if (p.kind === "disc") {
    const disc = own(
      MeshBuilder.CreateCylinder(
        "slate low base",
        {
          height: 0.06,
          diameterTop: 2.92,
          diameterBottom: 3.02,
          tessellation: 48,
        },
        scene,
      ),
      mat("matte slate base", "#5b6269"),
    );
    disc.position.y = 0.031;
    disc.receiveShadows = true;
    anchorY = 0.062;
    const rp = [],
      ri = [],
      rn = [],
      ru = [];
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      for (const r of [1.463, 1.472] as const) {
        rp.push(Math.cos(a) * r, 0.0615, Math.sin(a) * r);
        rn.push(0, 1, 0);
        ru.push(i / 64, r);
      }
    }
    for (let i = 0; i < 64; i++) {
      const a = i * 2,
        b = ((i + 1) % 64) * 2;
      ri.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const rim = new Mesh("slate fine edge", scene),
      rv = new VertexData();
    rv.positions = rp;
    rv.indices = ri;
    rv.normals = rn;
    rv.uvs = ru;
    rv.applyToMesh(rim);
    const rm = mat("slate fine edge", "#727b82");
    rm.backFaceCulling = false;
    own(rim, rm);
  }
  if (p.kind === "pebble") {
    // Beveled rounded rectangle, only 3 rings and 40 boundary points per ring.
    const points: [number, number][] = [];
    const w = 1.52,
      d = 1.18,
      r = 0.36;
    for (let corner = 0; corner < 4; corner++) {
      const centers = [
          [w - r, d - r],
          [-w + r, d - r],
          [-w + r, -d + r],
          [w - r, -d + r],
        ] as const,
        c = centers[corner]!;
      for (let i = 0; i < 10; i++) {
        const a = (corner * Math.PI) / 2 + ((i / 10) * Math.PI) / 2;
        points.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]);
      }
    }
    const pos: number[] = [],
      inds = [],
      uv: number[] = [],
      norm: number[] = [],
      N = points.length;
    for (const [scale, y] of [
      [0.985, 0.002],
      [1, 0.022],
      [0.982, 0.065],
    ] as const)
      for (const q of points) {
        pos.push(q[0] * scale, y, q[1] * scale);
        uv.push(q[0] / (w * 2) + 0.5, q[1] / (d * 2) + 0.5);
      }
    for (let j = 0; j < 2; j++)
      for (let i = 0; i < N; i++) {
        const a = j * N + i,
          b = j * N + ((i + 1) % N),
          c = (j + 1) * N + i,
          e = (j + 1) * N + ((i + 1) % N);
        inds.push(a, c, b, b, c, e);
      }
    VertexData.ComputeNormals(pos, inds, norm);
    if (norm[0]! * pos[0]! + norm[2]! * pos[2]! < 0)
      for (let i = 0; i < norm.length; i++) norm[i] = -norm[i]!;
    // Separate cap vertices give the top a perfectly flat upward normal.
    const topStart = pos.length / 3;
    for (const q of points) {
      pos.push(q[0] * 0.982, 0.065, q[1] * 0.982);
      uv.push(q[0] / (w * 2) + 0.5, q[1] / (d * 2) + 0.5);
      norm.push(0, 1, 0);
    }
    const topCenter = pos.length / 3;
    pos.push(0, 0.065, 0);
    uv.push(0.5, 0.5);
    norm.push(0, 1, 0);
    const bottomStart = pos.length / 3;
    for (const q of points) {
      pos.push(q[0] * 0.985, 0.002, q[1] * 0.985);
      uv.push(0, 0);
      norm.push(0, -1, 0);
    }
    const bottomCenter = pos.length / 3;
    pos.push(0, 0.002, 0);
    uv.push(0, 0);
    norm.push(0, -1, 0);
    for (let i = 0; i < N; i++) {
      inds.push(topCenter, topStart + i, topStart + ((i + 1) % N));
      inds.push(bottomCenter, bottomStart + ((i + 1) % N), bottomStart + i);
    }
    const base = new Mesh("warm pebble base", scene),
      vd = new VertexData();
    vd.positions = pos;
    vd.indices = inds;
    vd.normals = norm;
    vd.uvs = uv;
    vd.applyToMesh(base);
    const bm = mat("matte warm stone", "#ad997b");
    bm.backFaceCulling = false;
    own(base, bm);
    base.receiveShadows = true;
    anchorY = 0.066;
  }
  if (p.kind === "water") {
    Effect.ShadersStore.quietWaterVertexShader =
      "precision highp float;attribute vec3 position;uniform mat4 world;uniform mat4 worldViewProjection;varying vec3 vP;void main(){vP=(world*vec4(position,1.)).xyz;gl_Position=worldViewProjection*vec4(position,1.);}";
    Effect.ShadersStore.quietWaterFragmentShader =
      "precision highp float;varying vec3 vP;uniform float time;uniform vec3 floorColor;uniform vec3 horizonColor;void main(){vec2 p=vP.xz;float wave=.65*sin(p.x*4.3+p.y*2.2+time*.3)+.35*sin(p.y*7.1-p.x*.8-time*.2);float r=length(p);vec3 col=floorColor+vec3(.008,.012,.014)*wave;float fade=1.-smoothstep(2.,17.,r);gl_FragColor=vec4(col,fade*.92);}";
    const wm = new ShaderMaterial(
      "quiet analytic water",
      scene,
      { vertex: "quietWater", fragment: "quietWater" },
      {
        attributes: ["position"],
        uniforms: [
          "world",
          "worldViewProjection",
          "time",
          "floorColor",
          "horizonColor",
        ],
        needAlphaBlending: true,
      },
    );
    wm.setColor3("floorColor", C(p.floor));
    wm.setColor3("horizonColor", C(p.horizon));
    wm.setFloat("time", 0);
    wm.backFaceCulling = false;
    materials.push(wm);
    ground.material = wm;
    waterMaterial = wm;
    ground.receiveShadows = false;
    ground.metadata = { water: true };
  }
  // One shared 128px procedural contact shadow, aligned with the character anchor.
  if (contactShadow) {
    const t = new DynamicTexture(
        "quiet contact shadow",
        { width: 128, height: 128 },
        scene,
        false,
      ),
      c = drawingContext(t),
      gradient = c.createRadialGradient(64, 64, 2, 64, 64, 63);
    gradient.addColorStop(0, "rgba(0,0,0," + p.shadow + ")");
    gradient.addColorStop(0.3, "rgba(0,0,0," + p.shadow * 0.75 + ")");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = gradient;
    c.fillRect(0, 0, 128, 128);
    t.update();
    t.hasAlpha = true;
    textures.push(t);
    const m = mat("quiet soft contact", "#000000", true);
    m.diffuseTexture = t;
    m.useAlphaFromDiffuseTexture = true;
    m.backFaceCulling = false;
    contact = own(
      MeshBuilder.CreateGround(
        "quiet contact",
        { width: 1.25, height: 1.0 },
        scene,
      ),
      m,
    );
    contact.position.y = anchorY + 0.001;
    contact.isPickable = false;
  }
  // Optional studio lights. Reuse host lighting by passing lighting:false.
  let key: DirectionalLight | null = null,
    shadowGenerator: ShadowGenerator | null = null;
  if (lighting) {
    key = new DirectionalLight("quiet key", V(-0.5, -0.9, 0.6), scene);
    key.diffuse = C(p.key);
    key.intensity = 1.1;
    key.position = V(4, 7, -5);
    lights.push(key);
    fillLight = new HemisphericLight("quiet fill", V(0, 1, 0), scene);
    fillLight.diffuse = C(p.fill);
    fillLight.groundColor = C(p.floor).scale(0.45);
    fillLight.intensity = 0.55;
    lights.push(fillLight);
    rimLight = new DirectionalLight("quiet rim", V(0.5, -0.4, -0.7), scene);
    rimLight.diffuse = C(p.fill);
    rimLight.intensity = 0.35;
    lights.push(rimLight);
  }
  if (realShadows && key) {
    shadowGenerator = new ShadowGenerator(shadowSize, key);
    shadowGenerator.usePercentageCloserFiltering = true;
    shadowGenerator.filteringQuality = shadowFilteringQuality;
    shadowGenerator.bias = 0.001;
    shadowGenerator.normalBias = 0.008;
    shadowGenerator.setDarkness(0.38);
    key.shadowMinZ = 0.1;
    key.shadowMaxZ = 20;
    key.autoCalcShadowZBounds = true;
    for (const m of meshes)
      if (m.name.includes("base")) m.receiveShadows = true;
    if (p.kind === "water") {
      const receiverMaterial = new ShadowOnlyMaterial(
        "quiet water shadow receiver material",
        scene,
      );
      receiverMaterial.activeLight = key;
      receiverMaterial.shadowColor = Color3.Black();
      receiverMaterial.alpha = 0.42;
      receiverMaterial.backFaceCulling = false;
      receiverMaterial.disableDepthWrite = true;
      materials.push(receiverMaterial);
      const receiver = own(
        MeshBuilder.CreateGround(
          "quiet water shadow receiver",
          { width: 36, height: 36 },
          scene,
        ),
        receiverMaterial,
      );
      receiver.position.y = 0.002;
      receiver.receiveShadows = true;
      receiver.isPickable = false;
    }
  }
  const baseFloorColor = floorMaterial.diffuseColor.clone();
  const baseTopColor = C(p.top);
  const baseHorizonColor = C(p.horizon);
  const baseKeyColor = C(p.key);
  const baseFillColor = C(p.fill);
  const baseFloorSpecularPower = floorMaterial.specularPower;
  let currentSeason: StageSeason = "summer";
  let currentHour = 15.5;
  const applyAppearance = () => {
    const palettes: Record<
      StageSeason,
      { floor: string; sky: string; horizon: string; light: string }
    > = {
      spring: {
        floor: "#829174",
        sky: "#66868d",
        horizon: "#aec2ba",
        light: "#f2d9bd",
      },
      summer: { floor: p.floor, sky: p.top, horizon: p.horizon, light: p.key },
      autumn: {
        floor: "#927957",
        sky: "#514d55",
        horizon: "#a78368",
        light: "#f2bd87",
      },
      winter: {
        floor: "#8d9da5",
        sky: "#465d70",
        horizon: "#bccbd1",
        light: "#d7e9f4",
      },
    };
    const palette = palettes[currentSeason];
    // Tint the original palette without lifting a dark studio toward the same
    // pale seasonal colors used by every other preset.
    const tint = (base: Color3, hex: string, amount: number) => {
      if (currentSeason === "summer") return base.clone();
      const color = C(hex);
      color.scaleInPlace(1 / Math.max(color.r, color.g, color.b, 0.001));
      return base.multiply(Color3.Lerp(Color3.White(), color, amount));
    };
    const altitude = Math.sin(((currentHour - 6) * Math.PI) / 12);
    const transition = Math.max(0, Math.min(1, (altitude + 0.12) / 0.42));
    const daylight = transition * transition * (3 - 2 * transition);
    const skyLevel =
      preset === "ink"
        ? 0.55 + daylight * 0.45
        : preset === "paper"
          ? 0.38 + daylight * 0.62
          : 0.16 + daylight * 0.84;
    const top = tint(baseTopColor, palette.sky, 0.2).scale(skyLevel);
    const horizon = tint(baseHorizonColor, palette.horizon, 0.25).scale(
      skyLevel,
    );
    floorMaterial.diffuseColor = tint(baseFloorColor, palette.floor, 0.3);
    waterMaterial?.setColor3(
      "floorColor",
      floorMaterial.diffuseColor.scale(0.25 + daylight * 0.75),
    );
    waterMaterial?.setColor3("horizonColor", horizon);
    sky.material.setColor3("topColor", top);
    sky.material.setColor3("horizonColor", horizon);
    sky.material.setFloat(
      "nightStars",
      preset === "paper"
        ? 0
        : preset === "ink"
          ? 0.45 + (1 - daylight) * 0.25
          : preset === "dusk" || preset === "slate" || preset === "stillwater"
            ? 0.18 + (1 - daylight) * 0.6
            : (1 - daylight) * 0.5,
    );
    scene.clearColor = Color4.FromColor3(horizon);
    const timeLight = Color3.Lerp(C("#9eafd5"), C("#fff1db"), daylight);
    if (key) {
      const angle = ((currentHour - 6) * Math.PI) / 12;
      const lightPosition = V(
        Math.cos(angle),
        Math.max(0.4, Math.abs(Math.sin(angle))),
        0.65 * Math.sin(angle),
      ).normalize();
      key.position.copyFrom(lightPosition).scaleInPlace(9);
      key.direction.copyFrom(lightPosition).negateInPlace();
      key.diffuse = tint(baseKeyColor, palette.light, 0.3).multiply(timeLight);
      key.intensity = 0.65 + daylight * 0.45;
    }
    if (fillLight) {
      fillLight.diffuse = tint(baseFillColor, palette.light, 0.24).multiply(
        timeLight,
      );
      fillLight.intensity = 0.22 + daylight * 0.33;
      fillLight.groundColor = floorMaterial.diffuseColor.scale(0.45);
    }
    if (rimLight) rimLight.intensity = 0.18 + daylight * 0.17;
    if (currentSeason === "winter") {
      floorMaterial.specularPower = 128;
      floorMaterial.specularColor = C("#aabdc8");
    } else {
      floorMaterial.specularPower = baseFloorSpecularPower;
      floorMaterial.specularColor = Color3.Black();
    }
  };
  const setSeason = (season: StageSeason) => {
    currentSeason = season;
    applyAppearance();
  };
  const setTime = (hour: number) => {
    currentHour = ((hour % 24) + 24) % 24;
    applyAppearance();
  };
  applyAppearance();
  return {
    id: preset,
    name: p.name,
    root,
    setSeason,
    setTime,
    characterAnchor: { position: [0, anchorY, 0], facingRadians: Math.PI },
    cameraPreset: {
      position: [2.65, 1.9, -4.9],
      target: [0, 0.87, 0],
      fov: 0.65,
    },
    setContactPosition(x: number, z: number) {
      if (contact) {
        contact.position.x = x;
        contact.position.z = z;
      }
    },
    addShadowCaster(mesh: AbstractMesh, includeChildren = true) {
      if (shadowGenerator)
        shadowGenerator.addShadowCaster(mesh, includeChildren);
    },
    update(dt: number) {
      clock += Math.min(0.1, Math.max(0, dt));
      sky.material.setFloat("starTime", clock);
      if (p.kind === "water") waterMaterial?.setFloat("time", clock);
    },
    dispose() {
      shadowGenerator?.dispose();
      lights.forEach((l) => l.dispose());
      root.dispose(false);
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      Object.assign(scene, previous);
    },
  };
}
