import { drawingContext, setTextureScale } from "../StageTextures";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Material } from "@babylonjs/core/Materials/material";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { HDRCubeTexture } from "@babylonjs/core/Materials/Textures/hdrCubeTexture";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Effect } from "@babylonjs/core/Materials/effect";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Engine } from "@babylonjs/core/Engines/engine";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import type { Light } from "@babylonjs/core/Lights/light";
import type { AuthoredStage, AuthoredStageOptions } from "../types";
import type { StageSeason } from "../../../config/stageConfig";
import { createRoundedBox } from "../StageGeometry";
import { StageAssets } from "../StageAssets";
const V = (x = 0, y = 0, z = 0) => new Vector3(x, y, z),
  C = (h: string) => Color3.FromHexString(h);
export async function createAsterObservatory(
  scene: Scene,
  {
    assetUrls = {},
    quality = "balanced",
    onProgress = () => {},
    registerCleanup,
  }: AuthoredStageOptions,
): Promise<AuthoredStage> {
  const assetUrl = (name: string): string => {
    const url = assetUrls[name];
    if (!url) throw new Error(`Missing stage asset: ${name}`);
    return url;
  };
  const root = new TransformNode("AsterObservatory", scene),
    runtime = new TransformNode("AsterObservatory_Runtime", scene),
    owned: Mesh[] = [],
    materials: Material[] = [],
    textures: BaseTexture[] = [],
    lights: Light[] = [];
  const previous = {
    environmentTexture: scene.environmentTexture,
    environmentIntensity: scene.environmentIntensity,
    clearColor: scene.clearColor.clone(),
  };
  let seed = 17;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  function material(n: string, hex: string, r = 0.8, metal = 0) {
    const m = new PBRMaterial(n, scene);
    m.albedoColor = C(hex);
    m.roughness = r;
    m.metallic = metal;
    m.maxSimultaneousLights = 4;
    materials.push(m);
    return m;
  }
  const ivory = material("ceramic ivory", "#d3cdbd", 0.6),
    graphite = material("graphite alloy", "#29363a", 0.45, 0.45),
    slate = material("matte deck", "#4b5658", 0.83, 0.08),
    bronze = material("brushed champagne trim", "#aa9270", 0.38, 0.55),
    fabric = material("deep teal upholstery", "#3b5e60", 0.95),
    linen = material("oatmeal upholstery", "#aab5b1", 0.95),
    rubber = material("rubber seams", "#141f23"),
    warm = material("amber light diffuser", "#ffe5ae"),
    cool = material("ice light diffuser", "#bbdce1"),
    screenMat = material("instrument displays", "#789da5", 0.5);
  warm.emissiveColor = C("#ffbc63");
  cool.emissiveColor = C("#89c2cf");
  screenMat.emissiveColor = C("#8eb7b9").scale(0.25);
  function register(m: Mesh, mat: Material) {
    m.material = mat;
    m.parent = root;
    m.receiveShadows = true;
    owned.push(m);
    return m;
  }
  function box(
    n: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    mat: Material,
    ry = 0,
  ) {
    const m = MeshBuilder.CreateBox(
      n,
      { width: w, height: h, depth: d },
      scene,
    );
    m.position = V(x, y, z);
    m.rotation.y = ry;
    return register(m, mat);
  }
  function cylinder(
    n: string,
    x: number,
    y: number,
    z: number,
    dt: number,
    db: number,
    h: number,
    mat: Material,
    t = 48,
  ) {
    const m = MeshBuilder.CreateCylinder(
      n,
      { diameterTop: dt, diameterBottom: db, height: h, tessellation: t },
      scene,
    );
    m.position = V(x, y, z);
    return register(m, mat);
  }
  function tube(n: string, path: Vector3[], r: number, mat: Material) {
    return register(
      MeshBuilder.CreateTube(
        n,
        { path, radius: r, tessellation: 8, cap: Mesh.CAP_ALL },
        scene,
      ),
      mat,
    );
  }
  function rounded(
    n: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    r: number,
    mat: Material,
  ) {
    const mesh = createRoundedBox(scene, n, w, h, d, r);
    mesh.position = V(x, y, z);
    return register(mesh, mat);
  }
  // Low-contrast microtexture is shared rather than adding modeled surface detail.
  function micro(n: string, base: string, weave = false) {
    const t = new DynamicTexture(n, { width: 256, height: 256 }, scene, false),
      ctx = drawingContext(t);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 6000; i++) {
      ctx.fillStyle = i % 2 ? "rgba(255,255,255,.045)" : "rgba(0,8,10,.07)";
      ctx.fillRect(rand() * 256, rand() * 256, 1, 1);
    }
    if (weave) {
      for (let i = 0; i < 256; i += 3) {
        ctx.fillStyle = "rgba(0,10,12,.055)";
        ctx.fillRect(i, 0, 1, 256);
        ctx.fillRect(0, i, 256, 1);
      }
    }
    t.update();
    textures.push(t);
    return t;
  }
  slate.albedoTexture = micro("deck microtexture", "#627172");
  slate.albedoColor = Color3.White();
  setTextureScale(slate.albedoTexture, 8, 8);
  fabric.albedoTexture = micro("woven teal", "#45666a", true);
  fabric.albedoColor = Color3.White();
  ivory.albedoTexture = micro("ceramic microtexture", "#d7d0bf");
  ivory.albedoColor = Color3.White();
  // Circular observatory deck with restrained radial expansion joints.
  cylinder("station deck edge", 0, -0.21, -1, 16, 16, 0.35, graphite, 96);
  const xrFloor = cylinder(
    "station deck surface",
    0,
    -0.01,
    -1,
    15.8,
    15.8,
    0.08,
    slate,
    96,
  );
  cylinder(
    "companion inlay",
    -0.4,
    0.047,
    0.1,
    4.25,
    4.25,
    0.025,
    graphite,
    96,
  );
  cylinder(
    "companion standing surface",
    -0.4,
    0.067,
    0.1,
    4.1,
    4.1,
    0.018,
    linen,
    96,
  );
  for (let i = 0; i < 20; i++) {
    const a = (i * Math.PI) / 10;
    const p1 = V(Math.sin(a) * 3.6, 0.037, -1 + Math.cos(a) * 3.6),
      p2 = V(Math.sin(a) * 7.86, 0.037, -1 + Math.cos(a) * 7.86);
    tube("deck expansion joint", [p1, p2], 0.008, rubber);
  }
  // Curved panoramic frame. No screen-space fake window image.
  const arc = (r: number, y: number, n = 56) =>
    Array.from({ length: n + 1 }, (_, i) => {
      const a = ((-70 + (i * 140) / n) * Math.PI) / 180;
      return V(Math.sin(a) * r, y, Math.cos(a) * r - 1);
    });
  for (const y of [0.38, 0.63] as const)
    tube("panoramic window frame", arc(8, y), y > 0.7 ? 0.12 : 0.085, graphite);
  tube("warm window foot light", arc(7.92, 0.42), 0.022, warm);
  for (const a of [-70, -43, 43, 70] as const) {
    const t = (a * Math.PI) / 180,
      x = Math.sin(t) * 8,
      z = Math.cos(t) * 8 - 1,
      top = 3.25 + 1.9 * Math.sqrt(Math.max(0, 1 - (x / 7.6) ** 2));
    box(
      "window upright",
      x,
      (top + 0.38) / 2,
      z,
      0.13,
      top - 0.38,
      0.16,
      graphite,
      t,
    );
  }
  // Lower curved sill panels and deep window seats follow the same architectural arc.
  for (let a = -63; a <= 63; a += 14) {
    const t = (a * Math.PI) / 180;
    rounded(
      "lower hull panel",
      Math.sin(t) * 7.9,
      0.29,
      Math.cos(t) * 7.9 - 1,
      1.86,
      0.52,
      0.25,
      0.06,
      ivory,
    ).rotation.y = t;
  }
  for (const a of [-54, -39, 39, 54] as const) {
    const t = (a * Math.PI) / 180;
    rounded(
      "window seat base",
      Math.sin(t) * 7.2,
      0.47,
      Math.cos(t) * 7.2 - 1,
      1.65,
      0.55,
      0.85,
      0.09,
      graphite,
    ).rotation.y = t;
    rounded(
      "window seat cushion",
      Math.sin(t) * 7.2,
      0.8,
      Math.cos(t) * 7.2 - 1,
      1.6,
      0.2,
      0.8,
      0.08,
      fabric,
    ).rotation.y = t;
  }
  // Raised barrel vault: spring line sits above every wall display.
  const vaultY = (x: number) =>
    3.25 + 1.9 * Math.sqrt(Math.max(0, 1 - (x / 7.6) ** 2));
  for (const z of [-4.05, 0.5, 4.0] as const) {
    const extent = Math.min(7.52, Math.sqrt(64 - (z + 1) ** 2));
    const path = Array.from({ length: 65 }, (_, i) => {
      const x = -extent + (2 * extent * i) / 64;
      return V(x, vaultY(x) - 0.03, z);
    });
    tube("vaulted structural rib", path, 0.1, graphite);
  }
  const ceilingPath = [];
  for (let j = 0; j <= 16; j++)
    ceilingPath.push(
      Array.from({ length: 81 }, (_, i) => {
        const x = -7.52 + (15.04 * i) / 80,
          back = Math.sqrt(64 - x * x) - 1;
        return V(x, vaultY(x), -4.15 + ((back + 4.15) * j) / 16);
      }),
    );
  register(
    MeshBuilder.CreateRibbon(
      "vaulted ceramic ceiling",
      { pathArray: ceilingPath, sideOrientation: Mesh.DOUBLESIDE },
      scene,
    ),
    ivory,
  );
  for (const x of [-4.3, 4.3] as const)
    box(
      "ceiling recessed luminaire",
      x,
      vaultY(x) - 0.1,
      0.5,
      0.085,
      0.035,
      7.2,
      warm,
    );
  // Curved upper window follows the roof, avoiding a floating horizontal frame.
  tube(
    "roof to window crown",
    arc(8, 0).map((p) => V(p.x, vaultY(p.x), p.z)),
    0.1,
    graphite,
  );
  // Side bulkheads and layered inset panels.
  for (const side of [-1, 1] as const) {
    box("side bulkhead", side * 7.35, 1.9, -1.21, 0.25, 3.8, 5.88, graphite);
    for (const z of [-3.25, -1.55, 0.15] as const)
      rounded(
        "ceramic wall cassette",
        side * 7.17,
        1.75,
        z,
        0.18,
        2.4,
        1.56,
        0.075,
        ivory,
      );
    box(
      "bulkhead bronze belt",
      side * 7.04,
      1,
      -1.21,
      0.035,
      0.05,
      5.7,
      bronze,
    );
  }
  // A comfortable corner and a quiet instrument station, leaving the middle clear.
  rounded(
    "lounge timberless base",
    -4.8,
    0.32,
    -0.25,
    2.05,
    0.36,
    3.25,
    0.14,
    graphite,
  );
  rounded("lounge back", -5.62, 0.97, -0.25, 0.4, 1.17, 3.25, 0.17, fabric);
  for (const z of [-1.67, 1.17] as const)
    rounded("lounge arm", -4.75, 0.72, z, 1.96, 0.53, 0.3, 0.13, fabric);
  for (const z of [-0.98, 0.48] as const)
    rounded("lounge seat", -4.69, 0.67, z, 1.64, 0.25, 1.38, 0.12, linen);
  const pillow = rounded(
    "angled bolster",
    -5.21,
    1.03,
    -0.65,
    0.3,
    0.55,
    0.76,
    0.13,
    bronze,
  );
  pillow.rotation.z = -0.18;
  cylinder(
    "occasional table top",
    -3.25,
    0.64,
    1.55,
    1.05,
    1.05,
    0.09,
    graphite,
  );
  cylinder("table base", -3.25, 0.33, 1.55, 0.35, 0.5, 0.58, bronze);
  // Slim wall display with an original, legible cartographic UI texture.
  const display = new DynamicTexture(
      "original orbital chart",
      { width: 1024, height: 512 },
      scene,
      false,
    ),
    dc = drawingContext(display);
  dc.fillStyle = "#10252e";
  dc.fillRect(0, 0, 1024, 512);
  dc.strokeStyle = "#36585f";
  dc.lineWidth = 1;
  for (let x = 0; x < 1024; x += 48) {
    dc.beginPath();
    dc.moveTo(x, 0);
    dc.lineTo(x, 512);
    dc.stroke();
  }
  for (let y = 0; y < 512; y += 48) {
    dc.beginPath();
    dc.moveTo(0, y);
    dc.lineTo(1024, y);
    dc.stroke();
  }
  dc.strokeStyle = "#8ebbbd";
  dc.lineWidth = 3;
  for (const r of [90, 145, 195] as const) {
    dc.beginPath();
    dc.ellipse(370, 270, r, r * 0.6, -0.3, 0, Math.PI * 2);
    dc.stroke();
  }
  dc.fillStyle = "#b8d1c6";
  dc.beginPath();
  dc.arc(370, 270, 45, 0, Math.PI * 2);
  dc.fill();
  dc.fillStyle = "#dcb883";
  dc.beginPath();
  dc.arc(505, 205, 9, 0, Math.PI * 2);
  dc.fill();
  dc.fillStyle = "#a8c1bd";
  dc.font = "20px monospace";
  dc.fillText("ASTER   /   OBSERVATORY", 48, 52);
  dc.font = "14px monospace";
  dc.fillStyle = "#6c969b";
  dc.fillText("LOCAL ORBIT", 704, 140);
  for (let i = 0; i < 7; i++) {
    dc.fillRect(704, 175 + i * 28, 70 + ((i * 37) % 170), 4);
  }
  dc.fillStyle = "#dcb883";
  dc.fillRect(704, 408, 210, 3);
  display.update();
  textures.push(display);
  const chartMat = material("orbital chart", "#ffffff", 1);
  chartMat.albedoTexture = display;
  chartMat.emissiveTexture = display;
  chartMat.emissiveColor = Color3.White().scale(0.35);
  chartMat.unlit = true;
  rounded(
    "chart surround",
    -7.0,
    2.45,
    -0.25,
    0.17,
    1.35,
    2.65,
    0.065,
    graphite,
  );
  const chart = MeshBuilder.CreatePlane(
    "orbital chart screen",
    { width: 2.5, height: 1.25 },
    scene,
  );
  chart.position = V(-6.898, 2.45, -0.25);
  chart.rotation.y = -Math.PI / 2;
  register(chart, chartMat);
  const props = new StageAssets(
    scene,
    assetUrls,
    (material) => {
      material.roughness = 0.68;
    },
    onProgress,
  );
  registerCleanup?.(() => props.dispose());
  await props.preload();
  function place(
    name: string,
    x: number,
    y: number,
    z: number,
    height: number,
    angle = 0,
    { cast = true } = {},
  ) {
    return props.place(name, root, V(x, y, z), height, angle, cast);
  }
  const mainConsole = await place(
    "computer-wide",
    4.8,
    0.04,
    2.4,
    1.45,
    Math.PI - 0.38,
  );
  await place("chair-armrest-headrest", 4.05, 0.04, 0.65, 1.15, -0.38);
  await place("computer-system", 6.1, 0.04, -2.1, 1.8, Math.PI / 2);
  await place("wall-detail", 7.01, 1.1, 1.0, 1.2, -Math.PI / 2);
  await place("wall-switch", -7.0, 1.18, 1.25, 0.45, Math.PI / 2);
  // Put an original orbital chart on the kit's blank sloping console display.
  const overlay = new Mesh("console orbital chart", scene),
    ov = new VertexData(),
    cp = V(0, 0.365 + 0.83 * 0.003, 0.006 + 0.55 * 0.003),
    up = V(0, 0.55, -0.83);
  const pp = [];
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ] as const) {
    const p = cp.add(V(sx * 0.318, 0, 0)).add(up.scale(sy * 0.165));
    pp.push(p.x, p.y, p.z);
  }
  ov.positions = pp;
  ov.indices = [0, 1, 2, 0, 2, 3];
  ov.normals = [0, 0.83, 0.55, 0, 0.83, 0.55, 0, 0.83, 0.55, 0, 0.83, 0.55];
  ov.uvs = [0, 1, 1, 1, 1, 0, 0, 0];
  ov.applyToMesh(overlay);
  register(overlay, chartMat);
  overlay.parent = mainConsole.assetRoot;
  chartMat.backFaceCulling = false;
  // Compact optical instrument: a focal prop that gives the room its own identity.
  const tx = -4.0,
    tz = 4.3;
  cylinder("telescope pier foot", tx, 0.12, tz, 0.65, 0.75, 0.12, graphite);
  cylinder("telescope pier", tx, 0.77, tz, 0.12, 0.18, 1.35, bronze);
  const mount = cylinder(
    "telescope equatorial mount",
    tx,
    1.48,
    tz,
    0.3,
    0.3,
    0.4,
    graphite,
  );
  mount.rotation.z = Math.PI / 2;
  const optical = cylinder(
    "telescope optical tube",
    tx,
    1.7,
    tz,
    0.32,
    0.32,
    1.05,
    ivory,
  );
  optical.rotation.x = Math.PI / 2 - 0.35;
  const rim = cylinder(
    "telescope objective rim",
    tx,
    1.89,
    tz + 0.5,
    0.36,
    0.36,
    0.13,
    graphite,
  );
  rim.rotation.x = Math.PI / 2 - 0.35;
  const lensMat = material("optical glass", "#183541", 0.15, 0.45);
  const lens = cylinder(
    "telescope objective",
    tx,
    1.91,
    tz + 0.565,
    0.285,
    0.285,
    0.012,
    lensMat,
  );
  lens.rotation.x = Math.PI / 2 - 0.35;
  const eyepiece = cylinder(
    "telescope eyepiece",
    tx,
    1.5,
    tz - 0.57,
    0.1,
    0.1,
    0.2,
    graphite,
  );
  eyepiece.rotation.x = Math.PI / 2 - 0.35;
  // Original flush status panels, with restrained amber / icy-blue lighting.
  for (const side of [-1, 1] as const)
    for (const z of [-2.7, 1.35] as const) {
      box("inset diffuser", side * 7.0, 2.2, z, 0.035, 0.75, 0.065, cool);
    }
  // Floor edge locator lights are emissive strips, not dozens of point lights.
  for (const side of [-1, 1] as const)
    for (let i = 0; i < 5; i++)
      box(
        "deck locator",
        side * (3.2 + i * 0.62),
        0.04,
        -3.4,
        0.33,
        0.01,
        0.025,
        cool,
      );
  // Subtle identity plate on the right-hand end wall.
  const labelTex = new DynamicTexture(
      "station identity",
      { width: 512, height: 256 },
      scene,
      false,
    ),
    lc = drawingContext(labelTex);
  lc.fillStyle = "#cfc9b9";
  lc.fillRect(0, 0, 512, 256);
  lc.fillStyle = "#263a3e";
  lc.font = "58px sans-serif";
  lc.fillText("ASTER", 40, 112);
  lc.font = "16px monospace";
  lc.fillText("O B S E R V A T O R Y   /   0 2", 40, 165);
  labelTex.update();
  textures.push(labelTex);
  const labelMat = material("identity plate", "#ffffff");
  labelMat.albedoTexture = labelTex;
  const plate = MeshBuilder.CreatePlane(
    "Aster identity plaque",
    { width: 1.7, height: 0.85 },
    scene,
  );
  plate.position = V(7.015, 2.5, -1.3);
  plate.rotation.y = Math.PI / 2;
  register(plate, labelMat);
  // Merge the architectural mesh groups after all placements.
  const groups = new Map<number, Mesh[]>();
  for (const m of owned) {
    if (m.isDisposed() || !m.getTotalVertices()) continue;
    if (!m.material) continue;
    const k = m.material.uniqueId;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(m);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const n = group[0]!.material!.name;
    const m = Mesh.MergeMeshes(group, true, true, undefined, false, false);
    if (!m) continue;
    m.name = "static " + n;
    m.parent = root;
    m.receiveShadows = true;
  }
  onProgress("Lighting the observatory");
  const env = new HDRCubeTexture(
    assetUrl("studio-light.hdr"),
    scene,
    128,
    false,
    true,
    false,
    true,
  );
  scene.environmentTexture = env;
  env.rotationY = 0.3;
  scene.environmentIntensity = 0.5;
  textures.push(env);
  const sun = new DirectionalLight(
    "window key light",
    V(-0.4, -0.55, -0.6),
    scene,
  );
  sun.position = V(8, 12, 17);
  lights.push(sun);
  const fill = new HemisphericLight("interior soft fill", V(0, 1, 0), scene);
  fill.groundColor = C("#303b40");
  lights.push(fill);
  const amber = new PointLight("warm lounge light", V(-3.7, 2.6, -0.4), scene);
  amber.diffuse = C("#ffca83");
  amber.range = 9;
  amber.radius = 0.7;
  lights.push(amber);
  const blue = new PointLight("instrument bounce", V(4.1, 2.4, 2.3), scene);
  blue.diffuse = C("#9bc9da");
  blue.range = 7;
  blue.radius = 0.7;
  lights.push(blue);
  const shadows = new ShadowGenerator(quality === "mobile" ? 2048 : 4096, sun);
  shadows.usePercentageCloserFiltering = true;
  shadows.filteringQuality =
    quality === "mobile"
      ? ShadowGenerator.QUALITY_MEDIUM
      : ShadowGenerator.QUALITY_HIGH;
  shadows.bias = 0.0007;
  shadows.normalBias = 0.008;
  shadows.setDarkness(0.38);
  sun.shadowMinZ = 1;
  sun.shadowMaxZ = 50;
  sun.autoCalcShadowZBounds = true;
  for (const m of root.getChildMeshes())
    if (m.getTotalVertices()) shadows.addShadowCaster(m);
  // Original planet. Static albedo contains generated ocean / continents / cloud detail.
  const planet = MeshBuilder.CreateSphere(
    "Aster planet",
    { diameter: 24, segments: quality === "mobile" ? 32 : 64 },
    scene,
  );
  planet.parent = runtime;
  planet.position = V(8, 5.5, 78);
  planet.rotation.y = 2.2;
  const planetMat = material("planet surface", "#ffffff", 0.84);
  planetMat.albedoTexture = new Texture(
    assetUrl("aster-planet.jpg"),
    scene,
    false,
    false,
  );
  textures.push(planetMat.albedoTexture);
  planetMat.environmentIntensity = 0.06;
  planet.material = planetMat;
  const spaceSun = new DirectionalLight(
    "planet sun",
    V(-0.55, -0.25, 0.8),
    scene,
  );
  spaceSun.intensity = 3.8;
  spaceSun.diffuse = C("#f6ead7");
  spaceSun.includedOnlyMeshes = [planet];
  lights.push(spaceSun);
  for (const l of [sun, fill, amber, blue] as const)
    l.excludedMeshes = [planet];
  // Thin additive atmosphere: one low-poly shell; no volumetric raymarching.
  Effect.ShadersStore.asterAtmosphereVertexShader =
    "precision highp float;attribute vec3 position;attribute vec3 normal;uniform mat4 world;uniform mat4 worldViewProjection;varying vec3 vN;varying vec3 vP;void main(){vec4 p=world*vec4(position,1.);vP=p.xyz;vN=normalize(mat3(world)*normal);gl_Position=worldViewProjection*vec4(position,1.);}";
  Effect.ShadersStore.asterAtmosphereFragmentShader =
    "precision highp float;uniform vec3 cameraPosition;varying vec3 vN;varying vec3 vP;void main(){float f=pow(1.-abs(dot(normalize(vN),normalize(cameraPosition-vP))),4.);gl_FragColor=vec4(vec3(.13,.48,.78)*f*1.4,f*.8);}";
  const atmosphere = MeshBuilder.CreateSphere(
    "planet atmospheric rim",
    { diameter: 24.3, segments: 40 },
    scene,
  );
  atmosphere.position.copyFrom(planet.position);
  atmosphere.parent = runtime;
  const atmoMat = new ShaderMaterial(
    "planet atmosphere",
    scene,
    { vertex: "asterAtmosphere", fragment: "asterAtmosphere" },
    {
      attributes: ["position", "normal"],
      uniforms: ["world", "worldViewProjection", "cameraPosition"],
      needAlphaBlending: true,
    },
  );
  atmoMat.alphaMode = Engine.ALPHA_ADD;
  atmoMat.backFaceCulling = true;
  atmoMat.disableDepthWrite = true;
  atmosphere.material = atmoMat;
  materials.push(atmoMat);
  // A small moon gives the window vista depth and scale.
  const moon = MeshBuilder.CreateSphere(
    "distant moon",
    { diameter: 3, segments: 24 },
    scene,
  );
  moon.position = V(-22, 15, 78);
  moon.parent = runtime;
  const moonMat = material("moon mineral", "#8a9194", 1);
  moon.material = moonMat;
  spaceSun.includedOnlyMeshes.push(moon);
  for (const l of [sun, fill, amber, blue] as const)
    l.excludedMeshes.push(moon);
  // Single-mesh star field with seeded positions and varied colour / size.
  const starPos: number[] = [],
    starIndices: number[] = [],
    starColors: number[] = [];
  for (let i = 0; i < (quality === "mobile" ? 350 : 650); i++) {
    const a = rand() * Math.PI * 2,
      e = Math.asin(rand() * 1.6 - 0.3),
      r = 115;
    const p = V(
        Math.cos(a) * Math.cos(e) * r,
        Math.sin(e) * r,
        Math.sin(a) * Math.cos(e) * r,
      ),
      sz = 0.035 + rand() * 0.065,
      k = starPos.length / 3;
    starPos.push(
      p.x - sz,
      p.y - sz,
      p.z,
      p.x + sz,
      p.y - sz,
      p.z,
      p.x,
      p.y + sz,
      p.z,
    );
    starIndices.push(k, k + 1, k + 2);
    const tint = i % 7 === 0 ? [0.8, 0.71, 0.5, 1] : [0.65, 0.78, 0.86, 1];
    starColors.push(...tint, ...tint, ...tint);
  }
  const stars = new Mesh("static star field", scene),
    vd = new VertexData();
  vd.positions = starPos;
  vd.indices = starIndices;
  vd.colors = starColors;
  vd.applyToMesh(stars);
  stars.parent = runtime;
  const sm = new StandardMaterial("starlight", scene);
  sm.disableLighting = true;
  sm.emissiveColor = Color3.White();
  sm.backFaceCulling = false;
  stars.material = sm;
  materials.push(sm);
  let currentMood = "deep-orbit";
  let currentSeason: StageSeason = "summer";
  const baseSlateColor = slate.albedoColor.clone();
  const seasonPalette: Record<
    StageSeason,
    { sky: string; ambient: string; deck: string; environment: number }
  > = {
    spring: {
      sky: "#193348",
      ambient: "#a9c8c9",
      deck: "#53625e",
      environment: 0.28,
    },
    summer: {
      sky: "#050d18",
      ambient: "#a7bac4",
      deck: "#4b5658",
      environment: 1,
    },
    autumn: {
      sky: "#221b25",
      ambient: "#d3a679",
      deck: "#65534a",
      environment: 0.9,
    },
    winter: {
      sky: "#152535",
      ambient: "#c1d8e4",
      deck: "#60737c",
      environment: 0.82,
    },
  };
  const moods = {
    dawn: {
      sun: 2.8,
      fill: 0.4,
      env: 0.65,
      amber: 5,
      blue: 2,
      sky: "#111d2c",
      key: "#f8dab0",
    },
    "deep-orbit": {
      sun: 0.7,
      fill: 0.14,
      env: 0.24,
      amber: 13,
      blue: 5,
      sky: "#050d18",
      key: "#9ebfd2",
    },
    "quiet-amber": {
      sun: 0.15,
      fill: 0.07,
      env: 0.11,
      amber: 22,
      blue: 1.0,
      sky: "#070e18",
      key: "#c0cfdd",
    },
  };
  function setMood(name: string) {
    if (!moods[name as keyof typeof moods])
      throw Error("Unknown Aster mood: " + name);
    currentMood = name;
    const m = moods[name as keyof typeof moods];
    const seasonal = seasonPalette[currentSeason];
    sun.intensity = m.sun;
    sun.diffuse = Color3.Lerp(C(m.key), C(seasonal.ambient), 0.25);
    fill.intensity = m.fill;
    fill.diffuse = Color3.Lerp(C("#a7bac4"), C(seasonal.ambient), 0.3);
    scene.environmentIntensity = m.env * seasonal.environment;
    amber.intensity = m.amber;
    blue.intensity = m.blue;
    scene.clearColor = Color4.FromColor3(
      Color3.Lerp(C(m.sky), C(seasonal.sky), 0.3),
    );
    slate.albedoColor = Color3.Lerp(baseSlateColor, C(seasonal.deck), 0.42);
    warm.emissiveColor = C("#ffd29a").scale(name === "dawn" ? 0.55 : 0.9);
    cool.emissiveColor = C("#8fc4d0").scale(
      name === "quiet-amber" ? 0.35 : 0.65,
    );
    return name;
  }
  function setTime(h: number) {
    h = ((h % 24) + 24) % 24;
    return setMood(
      h >= 6 && h < 11
        ? "dawn"
        : h >= 19 || h < 6
          ? "quiet-amber"
          : "deep-orbit",
    );
  }
  function setSeason(season: StageSeason) {
    currentSeason = season;
    setMood(currentMood);
    return season;
  }
  // Small runtime motion is optional; the host owns update frequency and clock.
  function update(deltaSeconds: number) {
    planet.rotation.y += Math.min(0.1, Math.max(0, deltaSeconds)) * 0.003;
  }
  setMood("deep-orbit");
  onProgress("Scene ready");
  return {
    id: "aster-observatory",
    floorMeshes: [xrFloor],
    root,
    runtime,
    setMood,
    setTime,
    setSeason,
    update,
    get mood() {
      return currentMood;
    },
    weatherBounds: null,
    characterAnchor: { position: [-0.4, 0.08, 0.1], facingRadians: Math.PI },
    cameraPresets: {
      companion: { position: [1.8, 2.1, -3.8], target: [0, 1.9, 3.6] },
      wide: { position: [10, 5, -11], target: [0, 2, 2.5] },
      window: { position: [-0.7, 1.75, 2.5], target: [11, 7, 60] },
    },
    dispose() {
      shadows.dispose();
      lights.forEach((l) => l.dispose());
      root.dispose(false);
      runtime.dispose(false);
      props.dispose();
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      Object.assign(scene, previous);
    },
  };
}
