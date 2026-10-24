import { drawingContext, setTextureScale } from "../StageTextures";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Material } from "@babylonjs/core/Materials/material";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import { HDRCubeTexture } from "@babylonjs/core/Materials/Textures/hdrCubeTexture";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { Effect } from "@babylonjs/core/Materials/effect";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import type { Light } from "@babylonjs/core/Lights/light";
import type { AuthoredStage, AuthoredStageOptions } from "../types";
import type { StageSeason } from "../../../config/stageConfig";
import { createRoundedBox } from "../StageGeometry";
import { StageAssets } from "../StageAssets";
const V = (x = 0, y = 0, z = 0) => new Vector3(x, y, z),
  color = (h: string) => Color3.FromHexString(h);
export async function createMossHouse(
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
  const root = new TransformNode("MossHouse", scene),
    runtime = new TransformNode("MossHouse_Runtime", scene);
  const owned: Mesh[] = [],
    lights: Light[] = [],
    materials: Material[] = [],
    textures: BaseTexture[] = [];
  const prev = {
    clearColor: scene.clearColor.clone(),
    environmentTexture: scene.environmentTexture,
    environmentIntensity: scene.environmentIntensity,
    fogMode: scene.fogMode,
    fogColor: scene.fogColor.clone(),
    fogDensity: scene.fogDensity,
  };
  const mats: Record<string, PBRMaterial> = {};
  let rng = 4719;
  const rand = () => {
    rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
    return rng / 4294967296;
  };
  function material(n: string, hex: string, roughness = 0.8, metallic = 0) {
    const m = new PBRMaterial(n, scene);
    m.albedoColor = color(hex);
    m.roughness = roughness;
    m.metallic = metallic;
    m.maxSimultaneousLights = 4;
    materials.push(m);
    return (mats[n] = m);
  }
  const lime = material("limewashed walls", "#d9d1b9"),
    oak = material("oiled white oak", "#c0a277"),
    walnut = material("dark oak trim", "#64503c"),
    bronze = material("antique bronze", "#3d443c", 0.43, 0.55),
    linen = material("ivory upholstery", "#dfdac9"),
    sage = material("moss upholstery", "#617653"),
    stone = material("honed limestone", "#a8ad9e"),
    earth = material("garden soil", "#404834"),
    grass = material("meadow base", "#687554"),
    clay = material("fired clay", "#ae7557"),
    water = material("still water", "#426d62", 0.13, 0.35),
    paper = material("washi", "#f0dfb9"),
    brass = material("aged brass", "#b89654", 0.35, 0.65);
  function texture(file: string) {
    const t = new Texture(assetUrl(file), scene, false, false);
    textures.push(t);
    return t;
  }
  oak.albedoColor = color("#ded0b7");
  oak.albedoTexture = texture("wood-Diffuse.jpg");
  oak.bumpTexture = texture("wood-nor_gl.jpg");
  oak.bumpTexture.level = 0.25;
  oak.metallicTexture = texture("wood-arm.jpg");
  oak.useRoughnessFromMetallicTextureGreen = true;
  oak.useMetallnessFromMetallicTextureBlue = true;
  oak.useAmbientOcclusionFromMetallicTextureRed = true;
  oak.useRoughnessFromMetallicTextureAlpha = false;
  oak.metallic = 0;
  oak.roughness = 0.78;
  // Fine plaster and woven textile detail generated locally, small shared textures.
  function detailTexture(n: string, base: string, lines = false) {
    const t = new DynamicTexture(n, { width: 256, height: 256 }, scene, false);
    const c = drawingContext(t);
    c.fillStyle = base;
    c.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 9000; i++) {
      const a = rand() * 0.08;
      c.fillStyle = `rgba(20,20,10,${a})`;
      c.fillRect(rand() * 256, rand() * 256, 1, 1);
    }
    if (lines) {
      for (let i = 0; i < 256; i += 3) {
        c.fillStyle = "rgba(255,255,240,.09)";
        c.fillRect(i, 0, 1, 256);
        c.fillRect(0, i, 256, 1);
      }
    }
    t.update();
    textures.push(t);
    return t;
  }
  linen.albedoTexture = detailTexture("linen weave", "#e3ddc9", true);
  linen.albedoColor = Color3.White();
  lime.albedoTexture = detailTexture("plaster grain", "#eae4d6");
  lime.albedoColor = Color3.White();
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
    t = 24,
  ) {
    const m = MeshBuilder.CreateCylinder(
      n,
      { diameterTop: dt, diameterBottom: db, height: h, tessellation: t },
      scene,
    );
    m.position = V(x, y, z);
    return register(m, mat);
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
  const meadow = new DynamicTexture(
      "meadow ground",
      { width: 512, height: 512 },
      scene,
      false,
    ),
    mc = drawingContext(meadow);
  mc.fillStyle = "#65724e";
  mc.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 12000; i++) {
    const x = rand() * 512,
      y = rand() * 512;
    mc.fillStyle = ["#65764d", "#77885b", "#586443", "#8c9365"][i % 4]!;
    mc.globalAlpha = 0.25 + rand() * 0.2;
    mc.fillRect(x, y, 1 + rand() * 6, 1 + rand() * 4);
  }
  meadow.update();
  setTextureScale(meadow, 7, 7);
  grass.albedoTexture = meadow;
  grass.albedoColor = Color3.White();
  textures.push(meadow);
  // Foundation and single UV-mapped oak floor instead of many contrasting planks.
  box("limestone plinth", 0, -0.18, 0.3, 11, 0.3, 9, stone);
  box("continuous oak floor", 0, 0.005, 0.3, 10.7, 0.09, 8.7, oak);
  setTextureScale(oak.albedoTexture, 3, 3);
  setTextureScale(oak.bumpTexture, 3, 3);
  setTextureScale(oak.metallicTexture, 3, 3);
  box("interior left wall", -5.3, 1.85, 0.3, 0.18, 3.7, 8.7, lime);
  box("interior right return", 5.3, 1.85, 2.8, 0.18, 3.7, 3.7, lime);
  // Wide panoramic garden opening, with sliding screens gathered to the edges.
  box("garden opening header", 0, 3.45, 4.6, 10.8, 0.5, 0.32, lime);
  box("garden opening sill", 0, 0.16, 4.5, 10.7, 0.21, 0.38, walnut);
  for (const x of [-5.15, -2.75, 2.75, 5.15] as const)
    box("slim window post", x, 1.85, 4.5, 0.075, 3.2, 0.1, walnut);
  for (const x of [-4.05, 4.05] as const) {
    box("sliding screen lower", x, 0.7, 4.46, 2.08, 1.0, 0.05, paper);
    for (let i = 0; i < 5; i++)
      box(
        "screen lattice",
        x - 0.96 + i * 0.48,
        1.85,
        4.43,
        0.026,
        3.1,
        0.04,
        walnut,
      );
    for (const y of [0.25, 1.15, 2.45, 3.35] as const)
      box("screen cross rail", x, y, 4.43, 2.1, 0.035, 0.04, walnut);
  }
  // Ceiling covers the room, front cut away for orbit camera. Real roof casts shade.
  box("roof ceiling", 0, 3.8, 0.3, 10.8, 0.14, 8.7, lime);
  for (const x of [-5.12, -2.58, 0, 2.58, 5.12] as const)
    box("exposed ceiling rafter", x, 3.62, 1.3, 0.13, 0.22, 6.8, walnut);
  box("front fascia", 0, 3.62, -4.02, 10.8, 0.22, 0.15, walnut);
  // Complete the camera-side facade, with a real doorway and wide daylight opening.
  box("front facade left", -3.68, 1.85, -4.02, 3.06, 3.7, 0.18, lime);
  box("front facade right", 4.23, 1.85, -4.02, 1.96, 3.7, 0.18, lime);
  box("front facade header", 0.55, 3.4, -4.02, 5.4, 0.6, 0.18, lime);
  box("front window apron", 1.5, 0.48, -4.02, 3.5, 0.96, 0.18, lime);
  for (const x of [-2.15, -0.25, 3.25] as const)
    box("front opening jamb", x, 1.83, -4.02, 0.09, 3.66, 0.24, walnut);
  for (const y of [1.0, 3.08] as const)
    box("front window rail", 1.5, y, -4.02, 3.5, 0.07, 0.24, walnut);
  box("right wall completion", 5.3, 1.85, -1.55, 0.18, 3.7, 5.0, lime);
  // Raised window seat along the right, with softly rounded cushions.
  box("built-in window bench", 4.68, 0.32, 2.7, 1.02, 0.55, 2.5, walnut);
  rounded("bench cushion", 4.65, 0.65, 2.7, 0.95, 0.17, 2.45, 0.07, linen);
  // Broad rug is the companion zone, without a coffee table across it.
  const rugMat = material("woven oatmeal rug", "#c8b99c");
  rugMat.albedoTexture = detailTexture("rug weave", "#bfb89d", true);
  rugMat.albedoColor = Color3.White();
  setTextureScale(rugMat.albedoTexture, 5, 4);
  rounded("large woven rug", 0.3, 0.075, 0.0, 3.7, 0.045, 3.25, 0.02, rugMat);
  for (const x of [-1.47, 2.07] as const)
    box("rug bound edge", x, 0.101, 0, 0.027, 0.003, 3.15, walnut);
  // A restrained woven pattern keeps the rug from reading as an empty white slab.
  const rugTex = new DynamicTexture(
      "woven border rug",
      { width: 512, height: 512 },
      scene,
      false,
    ),
    rctx = drawingContext(rugTex);
  rctx.fillStyle = "#d8c9aa";
  rctx.fillRect(0, 0, 512, 512);
  rctx.strokeStyle = "#8c9475";
  rctx.lineWidth = 14;
  rctx.strokeRect(22, 22, 468, 468);
  rctx.strokeStyle = "#b49665";
  rctx.lineWidth = 3;
  rctx.strokeRect(40, 40, 432, 432);
  for (let y = 68; y < 450; y += 30) {
    rctx.strokeStyle = "#a8aa89";
    rctx.lineWidth = 1;
    rctx.beginPath();
    rctx.moveTo(62, y);
    for (let x = 62; x < 450; x += 18)
      rctx.lineTo(x, y + (Math.floor(x / 18) % 2) * 7);
    rctx.stroke();
  }
  rctx.globalAlpha = 0.12;
  for (let i = 0; i < 512; i += 3) {
    rctx.fillStyle = "#534a32";
    rctx.fillRect(i, 0, 1, 512);
    rctx.fillRect(0, i, 512, 1);
  }
  rugTex.update();
  textures.push(rugTex);
  rugMat.albedoTexture = rugTex;
  // Left reading alcove, custom rounded upholstered seating with timber base.
  rounded(
    "sofa timber platform",
    -3.65,
    0.29,
    0.4,
    2.0,
    0.25,
    3.35,
    0.08,
    walnut,
  );
  rounded(
    "sofa back upholstery",
    -4.44,
    0.91,
    0.4,
    0.37,
    1.05,
    3.34,
    0.17,
    sage,
  );
  for (const z of [-1.08, 1.88] as const)
    rounded(
      "sofa upholstered arm",
      -3.57,
      0.68,
      z,
      1.87,
      0.53,
      0.3,
      0.13,
      sage,
    );
  for (const z of [-0.34, 1.12] as const)
    rounded("sofa seat", -3.51, 0.57, z, 1.55, 0.26, 1.4, 0.11, linen);
  // Sculptural side table; the clear central area remains usable for PMX motion.
  cylinder("round side table", -2.25, 0.57, 2.4, 1.05, 1.05, 0.1, walnut);
  cylinder(
    "side table fluted base",
    -2.25,
    0.29,
    2.4,
    0.36,
    0.43,
    0.52,
    walnut,
  );
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI) / 8;
    cylinder(
      "fluted table base",
      -2.25 + Math.cos(a) * 0.19,
      0.3,
      2.4 + Math.sin(a) * 0.19,
      0.035,
      0.035,
      0.5,
      oak,
      8,
    );
  }
  // Desk and shelves, with intentionally varied negative space and prop groupings.
  rounded("writing desk", 2.9, 1.0, 3.25, 2.25, 0.11, 0.9, 0.04, oak);
  for (const x of [1.95, 3.85] as const)
    for (const z of [2.95, 3.57] as const)
      box("writing desk leg", x, 0.48, z, 0.055, 0.96, 0.055, bronze);
  for (const y of [1.35, 2.32] as const) {
    box("floating oak shelf", -5.05, y, 0.5, 0.48, 0.065, 3.7, oak);
    for (const z of [-0.96, 1.96] as const)
      box("shelf bracket", -5.03, y - 0.12, z, 0.35, 0.24, 0.035, bronze);
  }
  // Recessed art panel with original vector-like botanical graphic.
  const art = new DynamicTexture(
      "original botanical print",
      { width: 512, height: 768 },
      scene,
      false,
    ),
    ac = drawingContext(art);
  ac.fillStyle = "#e6dbc0";
  ac.fillRect(0, 0, 512, 768);
  ac.fillStyle = "#b07552";
  ac.beginPath();
  ac.arc(330, 240, 100, 0, Math.PI * 2);
  ac.fill();
  ac.strokeStyle = "#526650";
  ac.lineWidth = 8;
  ac.beginPath();
  ac.moveTo(120, 680);
  ac.bezierCurveTo(240, 500, 200, 350, 290, 100);
  ac.stroke();
  for (let i = 0; i < 7; i++) {
    ac.save();
    ac.translate(170 + i * 13, 570 - i * 61);
    ac.rotate(i % 2 ? -0.55 : 0.7);
    ac.fillStyle = i % 2 ? "#798366" : "#526650";
    ac.beginPath();
    ac.ellipse(25, -12, 67, 20, 0, 0, Math.PI * 2);
    ac.fill();
    ac.restore();
  }
  art.update();
  textures.push(art);
  const artMat = material("botanical print", "#ffffff");
  artMat.albedoTexture = art;
  box("art frame", -5.17, 2.03, 3.15, 0.09, 1.5, 1.03, walnut);
  const panel = MeshBuilder.CreatePlane(
    "original botanical artwork",
    { width: 1, height: 1.47 },
    scene,
  );
  panel.position = V(-5.111, 2.03, 3.15);
  panel.rotation.y = -Math.PI / 2;
  register(panel, artMat);
  // Ceramic cups, stacked journals, a little tray.
  const journal = material("terracotta journal", "#b17656");
  rounded("desk journal", 2.88, 1.075, 3.25, 0.5, 0.055, 0.35, 0.02, journal);
  cylinder("cup saucer", 3.4, 1.08, 3.16, 0.23, 0.23, 0.025, linen);
  cylinder("tea cup", 3.4, 1.17, 3.16, 0.15, 0.11, 0.17, clay);
  cylinder("tea surface", 3.4, 1.26, 3.16, 0.126, 0.126, 0.005, earth);
  // Soft static contact occlusion, inexpensive and independent of screen resolution.
  const aoTex = new DynamicTexture(
      "contact falloff",
      { width: 128, height: 128 },
      scene,
      false,
    ),
    aoc = drawingContext(aoTex);
  const grad = aoc.createRadialGradient(64, 64, 10, 64, 64, 64);
  grad.addColorStop(0, "rgba(15,22,12,.38)");
  grad.addColorStop(1, "rgba(15,22,12,0)");
  aoc.fillStyle = grad;
  aoc.fillRect(0, 0, 128, 128);
  aoTex.update();
  aoTex.hasAlpha = true;
  textures.push(aoTex);
  const aoMat = new StandardMaterial("static contact shade", scene);
  aoMat.diffuseTexture = aoTex;
  aoMat.useAlphaFromDiffuseTexture = true;
  aoMat.disableLighting = true;
  aoMat.emissiveColor = Color3.White();
  aoMat.backFaceCulling = false;
  materials.push(aoMat);
  for (const [x, z, w, d] of [
    [-3.65, 0.4, 2.4, 3.8],
    [2.9, 3.25, 2.6, 1.15],
    [-2.25, 2.4, 1.3, 1.3],
    [4.65, 2.7, 1.3, 2.8],
  ] as const) {
    const m = MeshBuilder.CreateGround(
      "contact occlusion",
      { width: w, height: d },
      scene,
    );
    m.position = V(x, 0.055, z);
    register(m, aoMat);
    m.receiveShadows = false;
  }
  // Outdoor deck, stepping stones and an offset reflecting pond.
  box("garden terrain", 0, -0.28, 10, 48, 0.25, 44, grass);
  box("garden terrace", 0, -0.065, 6.3, 10.7, 0.18, 3.3, stone);
  for (const x of [-5.1, 5.1] as const)
    box("terrace planter edging", x, 0.12, 7, 0.25, 0.42, 4.6, stone);
  rounded("reflecting basin", 3.7, -0.01, 9.2, 4.3, 0.28, 3.5, 0.12, stone);
  rounded("pond water", 3.7, 0.145, 9.2, 4.0, 0.025, 3.2, 0.01, water);
  // Subtle rippled normal from a tiny generated map, rather than a reflection pass.
  const ripple = new DynamicTexture(
      "water ripple normals",
      { width: 128, height: 128 },
      scene,
      false,
    ),
    rc = drawingContext(ripple),
    im = rc.createImageData(128, 128);
  for (let y = 0; y < 128; y++)
    for (let x = 0; x < 128; x++) {
      const k = (y * 128 + x) * 4;
      im.data[k] = 128 + Math.sin(x * 0.22 + y * 0.1) * 11;
      im.data[k + 1] = 128 + Math.cos(y * 0.18 + x * 0.1) * 11;
      im.data[k + 2] = 250;
      im.data[k + 3] = 255;
    }
  rc.putImageData(im, 0, 0);
  ripple.update();
  water.bumpTexture = ripple;
  water.bumpTexture.level = 0.2;
  textures.push(ripple);
  for (let i = 0; i < 8; i++) {
    const x = -0.7 + Math.sin(i * 0.6) * 0.7;
    rounded(
      "garden stepping slab",
      x,
      -0.03,
      8.6 + i * 1.02,
      1.15,
      0.17,
      0.64,
      0.065,
      stone,
    );
  }
  box("garden rear plaster wall", 0, 0.3, 21, 29, 1.1, 0.35, lime);
  for (const x of [-12.5, 12.5] as const)
    box("garden side wall", x, 0.9, 14, 0.3, 2.4, 14, lime);
  const props = new StageAssets(
    scene,
    assetUrls,
    (material) => {
      material.environmentIntensity = 1;
      material.roughness = Math.max(0.6, material.roughness ?? 0.8);
      const palette: Record<string, string> = {
        metal: "#5e6556",
        carpetBlue: "#8e9a7b",
        carpet: "#b8906c",
        carpetDarker: "#9e7659",
        carpetWhite: "#e8e2cb",
        plant: "#6a8854",
        wood: "#ac825b",
      };
      const tint = palette[material.name];
      if (tint) material.albedoColor = color(tint);
      if (material.name.toLowerCase().includes("leav")) {
        material.backFaceCulling = false;
        material.twoSidedLighting = true;
        material.useAlphaFromAlbedoTexture = true;
        material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHATEST;
        material.alphaCutOff = 0.45;
      }
      if (material.name === "Leaves_TwistedTree")
        material.albedoColor = color("#bdcba7");
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
  // Furnishing accents from Kenney's CC0 Furniture Kit.
  await place("chairModernCushion", 2.85, 0.08, 2.06, 0.88, Math.PI);
  await place("books", -4.93, 1.39, -0.8, 0.32, Math.PI / 2);
  await place("books", -4.93, 2.36, 0.4, 0.3, Math.PI / 2);
  await place("plantSmall1", -4.99, 1.39, 1.5, 0.37);
  await place("plantSmall2", -4.98, 2.36, -0.72, 0.35);
  await place("books", -2.25, 0.63, 2.4, 0.14, -0.3);
  await place("pillow", -3.98, 0.71, -0.35, 0.48, Math.PI / 2);
  await place("pillowLong", -4, 0.72, 1.08, 0.42, Math.PI / 2);
  // Real textured leafy trees: place outside the companion room, layered silhouettes.
  for (const [name, x, z, h, r] of [
    ["TwistedTree_3", -5.9, 11.7, 5.6, 0.4],
    ["CommonTree_1", 5.7, 14.9, 6.4, 2],
    ["CommonTree_1", -0.6, 17.9, 5.2, 0.8],
    ["CommonTree_1", -9.2, 18, 8.2, 1.2],
    ["CommonTree_4", 10, 19.4, 8.3, 3],
    ["TwistedTree_3", -11.5, 10, 7.3, 2],
    ["CommonTree_4", 10.1, 10.7, 6.5, 1.4],
  ] as const)
    await place(name, x, -0.17, z, h, r);
  // Layered planting beds, with dense small foliage and restrained flower color.
  for (let i = 0; i < 16; i++) {
    const x = -8 + rand() * 16,
      z = 9 + rand() * 11;
    if (Math.abs(x) < 1.8 || (x > 1.2 && x < 6.5 && z < 11.5)) continue;
    await place(
      "Bush_Common_Flowers",
      x,
      -0.15,
      z,
      0.65 + rand() * 0.5,
      rand() * 6.28,
    );
  }
  for (let i = 0; i < (quality === "mobile" ? 14 : 36); i++) {
    const x = -9 + rand() * 18,
      z = 7.9 + rand() * 12;
    if (Math.abs(x) < 1.7 || (x > 1.2 && x < 6.5 && z < 11.5)) continue;
    const n =
      i % 3 === 0
        ? "Flower_4_Group"
        : i % 3 === 1
          ? "Fern_1"
          : "Flower_3_Group";
    await place(n, x, -0.14, z, 0.35 + rand() * 0.5, rand() * 6.28, {
      cast: false,
    });
  }
  for (let i = 0; i < (quality === "mobile" ? 30 : 90); i++) {
    const x = -10 + rand() * 20,
      z = 8 + rand() * 13;
    if (Math.abs(x) < 1.6 || (x > 1.2 && x < 6.5 && z < 11.5)) continue;
    await place(
      i % 4 === 0 ? "Grass_Wispy_Tall" : "Grass_Common_Short",
      x,
      -0.15,
      z,
      0.16 + rand() * 0.3,
      rand() * 6.28,
      { cast: false },
    );
  }
  // A tall real-leaf houseplant, using the kit's fern rather than primitive leaves.
  for (const [x, z, h] of [
    [4.55, -1.7, 1.4],
    [-4.4, 2.8, 0.85],
  ] as const) {
    cylinder("ceramic planter", x, 0.3, z, 0.57, 0.38, 0.59, clay);
    cylinder("planter soil", x, 0.6, z, 0.51, 0.51, 0.015, earth);
    await place("Fern_1", x, 0.6, z, h, rand() * 6.28);
  }
  // Close planting clusters create depth without blanket high-poly grass.
  for (let i = 0; i < 22; i++) {
    const side = i % 2 ? -1 : 1,
      x = side * (1.9 + rand() * 1.5),
      z = 8.3 + rand() * 5.0;
    if (x > 1.5 && z < 11.3) continue;
    await place(
      i % 4 === 0
        ? "Flower_3_Group"
        : i % 3 === 0
          ? "Fern_1"
          : "Grass_Wispy_Tall",
      x,
      -0.14,
      z,
      0.35 + rand() * 0.45,
      rand() * 6.28,
      { cast: false },
    );
  }
  // Natural rock groupings and a richer planted edge around the pond.
  for (const [x, z, h, r] of [
    [1.3, 10.9, 0.55, 1],
    [5.95, 8.6, 0.8, 2],
    [6.2, 10.8, 0.5, 0.2],
    [-3.5, 10.7, 0.7, 1.8],
    [-5, 14, 0.65, 2],
  ] as const)
    await place("Rock_Medium_1", x, -0.12, z, h, r);
  for (let i = 0; i < 5; i++)
    await place(
      "CommonTree_1",
      -12 + i * 6,
      -0.17,
      24 + rand() * 3,
      7 + rand() * 2,
      rand() * 6.28,
      { cast: false },
    );
  for (let i = 0; i < 15; i++) {
    const x = -10 + i * 1.4;
    await place(
      "Fern_1",
      x,
      -0.15,
      19 + rand() * 1.3,
      0.75 + rand() * 0.4,
      rand() * 6.28,
      { cast: false },
    );
  }
  // Merge original static meshes by material. Imported repeated foliage remains instanced.
  const mergeGroups: Map<string, Mesh[]> = new Map();
  for (const m of owned) {
    if (m.isDisposed() || m instanceof InstancedMesh || !m.getTotalVertices())
      continue;
    if (!m.material) continue;
    const k = m.material.uniqueId + "_" + m.receiveShadows;
    if (!mergeGroups.has(k)) mergeGroups.set(k, []);
    mergeGroups.get(k)!.push(m);
  }
  for (const group of mergeGroups.values()) {
    if (group.length < 2) continue;
    const receive = group[0]!.receiveShadows;
    const materialName = group[0]!.material!.name;
    const merged = Mesh.MergeMeshes(group, true, true, undefined, false, false);
    if (merged) {
      merged.name = "static " + materialName;
      merged.parent = root;
      merged.receiveShadows = receive;
      merged.metadata = { stageCast: receive };
    }
  }
  // Indirect environment illumination and four direct lights maximum.
  onProgress("Preparing lighting");
  const env = new HDRCubeTexture(
    assetUrl("venice-sunset.hdr"),
    scene,
    128,
    false,
    true,
    false,
    true,
  );
  scene.environmentTexture = env;
  textures.push(env);
  scene.environmentIntensity = 0.65;
  env.rotationY = 1.6;
  const sun = new DirectionalLight("sunlight", V(-0.45, -0.8, -0.35), scene);
  lights.push(sun);
  sun.position = V(9, 14, 14);
  const hemi = new HemisphericLight("soft sky fill", V(0, 1, 0), scene);
  lights.push(hemi);
  hemi.groundColor = color("#66604b");
  const lampMat = material("illuminated washi", "#ffeed0");
  function lamp(x: number, y: number, z: number, scale = 1) {
    cylinder(
      "lamp weighted foot",
      x,
      0.12,
      z,
      0.48 * scale,
      0.5 * scale,
      0.08,
      bronze,
    );
    cylinder("lamp stem", x, y / 2, z, 0.025, 0.025, y, brass);
    cylinder(
      "washi shade",
      x,
      y,
      z,
      0.48 * scale,
      0.64 * scale,
      0.52 * scale,
      lampMat,
    );
    const l = new PointLight("warm reading light", V(x, y - 0.22, z), scene);
    l.diffuse = color("#ffb968");
    l.range = 7;
    l.radius = 0.5;
    lights.push(l);
    return l;
  }
  const reading = lamp(-2.5, 1.65, -1.45, 1);
  const deskLamp = new PointLight("desk warm light", V(3.2, 1.65, 3.2), scene);
  deskLamp.diffuse = color("#ffbd77");
  deskLamp.range = 5;
  deskLamp.radius = 0.3;
  lights.push(deskLamp);
  cylinder("desk lamp base", 3.2, 1.09, 3.2, 0.23, 0.23, 0.035, bronze);
  cylinder("desk lamp neck", 3.2, 1.34, 3.2, 0.024, 0.024, 0.5, brass);
  cylinder("desk lamp shade", 3.2, 1.6, 3.2, 0.21, 0.4, 0.22, lampMat);
  // Shadow map is one pass; plants do not each need their own light or shadow.
  const shadows = new ShadowGenerator(quality === "mobile" ? 2048 : 4096, sun);
  shadows.usePercentageCloserFiltering = true;
  shadows.filteringQuality =
    quality === "mobile"
      ? ShadowGenerator.QUALITY_MEDIUM
      : ShadowGenerator.QUALITY_HIGH;
  shadows.bias = 0.0006;
  shadows.normalBias = 0.008;
  shadows.setDarkness(0.38);
  shadows.transparencyShadow = true;
  sun.shadowMinZ = 1;
  sun.shadowMaxZ = 60;
  sun.autoCalcShadowZBounds = true;
  for (const m of root.getChildMeshes())
    if (m.getTotalVertices() && m.metadata?.stageCast !== false)
      shadows.addShadowCaster(m, false);
  // Procedural sky: gradient, moving sun/moon and stars in a single draw call.
  Effect.ShadersStore.mossSkyVertexShader =
    "precision highp float; attribute vec3 position; uniform mat4 worldViewProjection; varying vec3 vDirection; void main(){vDirection=position;gl_Position=worldViewProjection*vec4(position,1.0);}";
  Effect.ShadersStore.mossSkyFragmentShader = `precision highp float;varying vec3 vDirection;uniform float daylight;uniform float dusk;uniform vec3 sunDir;uniform float time;float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}void main(){vec3 d=normalize(vDirection);float h=max(d.y,0.0);vec3 top=mix(vec3(.025,.045,.10),vec3(.26,.49,.63),daylight);vec3 horizon=mix(vec3(.14,.18,.25),vec3(.80,.84,.77),daylight);horizon=mix(horizon,vec3(.94,.57,.34),dusk*.65);vec3 col=mix(horizon,top,pow(h,.45));float sun=smoothstep(.9992,.9998,dot(d,sunDir));col+=vec3(1.,.8,.48)*sun*daylight;vec3 moonDir=normalize(vec3(-.45,.5,.5));float moon=smoothstep(.99965,.99985,dot(d,moonDir));col+=vec3(.75,.82,1.)*moon*(1.-daylight);vec3 cell=floor(d*350.);float star=step(.9986,hash(cell))*pow(max(d.y,0.),.3);col+=star*(1.-daylight)*.7;gl_FragColor=vec4(col,1.);}`;
  const sky = MeshBuilder.CreateSphere(
    "runtime sky dome",
    { diameter: 180, segments: 16, sideOrientation: Mesh.BACKSIDE },
    scene,
  );
  sky.parent = runtime;
  sky.infiniteDistance = true;
  sky.isPickable = false;
  const skyMat = new ShaderMaterial(
    "MossHouse sky",
    scene,
    { vertex: "mossSky", fragment: "mossSky" },
    {
      attributes: ["position"],
      uniforms: ["worldViewProjection", "daylight", "dusk", "sunDir", "time"],
    },
  );
  sky.material = skyMat;
  skyMat.backFaceCulling = false;
  materials.push(skyMat);
  // Keep controls independent of any application's own clock or render loop.
  let currentHour = 15.5;
  let currentSeason: StageSeason = "summer";
  const seasonPalette: Record<
    StageSeason,
    {
      grass: string;
      sun: string;
      sky: string;
      ambient: string;
      environment: number;
    }
  > = {
    spring: {
      grass: "#7f9566",
      sun: "#ffe1b6",
      sky: "#b8d5d2",
      ambient: "#d5e5d9",
      environment: 0.9,
    },
    summer: {
      grass: "#687554",
      sun: "#fff4df",
      sky: "#b4cccf",
      ambient: "#e3ede5",
      environment: 1,
    },
    autumn: {
      grass: "#8d7550",
      sun: "#ffd19a",
      sky: "#d6b79a",
      ambient: "#dfc4a5",
      environment: 0.82,
    },
    winter: {
      grass: "#8a9a98",
      sun: "#dce9f0",
      sky: "#aabecb",
      ambient: "#cad8e0",
      environment: 0.72,
    },
  };
  const baseGrassColor = grass.albedoColor.clone();
  function setTime(hour: number) {
    currentHour = ((hour % 24) + 24) % 24;
    const elev = Math.sin(((currentHour - 6) / 12) * Math.PI),
      day = Math.max(0, elev),
      daylight = Math.min(1, day * 2.8),
      dusk = Math.max(0, 1 - Math.abs(currentHour - 17.5) / 2),
      night = 1 - Math.min(1, day * 4);
    const sunVector = V(
      Math.cos(((currentHour - 6) / 12) * Math.PI) * 0.85,
      Math.max(0.1, day),
      0.7,
    ).normalize();
    sun.direction = sunVector.negate();
    sun.position = sunVector.scale(24).add(V(0, 0, 7));
    sun.intensity = 0.03 + day * 2.5;
    const palette = seasonPalette[currentSeason];
    sun.diffuse = Color3.Lerp(
      color(currentSeason === "autumn" ? "#e9a96d" : "#ffc17b"),
      color(palette.sun),
      Math.min(1, day * 1.5),
    );
    hemi.intensity = 0.1 + day * 0.35;
    hemi.diffuse = Color3.Lerp(color("#7e99c0"), color(palette.ambient), day);
    scene.environmentIntensity = (0.15 + day * 0.8) * palette.environment;
    reading.intensity = 0.2 + night * 8.8;
    deskLamp.intensity = 0.1 + night * 3.9;
    lampMat.emissiveColor = color("#ffbb64").scale(0.08 + night * 0.62);
    grass.albedoColor = Color3.Lerp(
      baseGrassColor,
      color(palette.grass),
      currentSeason === "summer" ? 0 : 0.65,
    );
    skyMat.setFloat("daylight", daylight);
    skyMat.setFloat("dusk", dusk);
    skyMat.setVector3("sunDir", sunVector);
    skyMat.setFloat("time", hour);
    scene.clearColor = Color4.FromColor3(
      Color3.Lerp(color("#b4cccf"), color(palette.sky), 0.45),
    );
    return currentHour;
  }
  function setSeason(season: StageSeason) {
    currentSeason = season;
    setTime(currentHour);
    return season;
  }
  // Runtime-only background: GLB contains stage geometry and PBR assets.
  setTime(15.5);
  onProgress("Scene ready");
  return {
    id: "moss-house",
    root,
    runtime,
    setTime,
    setSeason,
    get hour() {
      return currentHour;
    },
    weatherBounds: { min: [-12, 0, 5], max: [12, 6, 19] },
    characterAnchor: { position: [0.3, 0.105, 0], facingRadians: Math.PI },
    cameraPresets: {
      companion: { position: [3.8, 1.8, -3.45], target: [-0.4, 1.25, 3.3] },
      wide: { position: [8, 4, -8], target: [0, 1.3, 7] },
    },
    dispose() {
      shadows.dispose();
      lights.forEach((l) => l.dispose());
      root.dispose(false);
      runtime.dispose(false);
      props.dispose();
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      Object.assign(scene, prev);
    },
  };
}
