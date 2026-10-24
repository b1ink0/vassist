import { drawingContext, setTextureScale } from "../StageTextures";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Material } from "@babylonjs/core/Materials/material";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Effect } from "@babylonjs/core/Materials/effect";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Engine } from "@babylonjs/core/Engines/engine";
import { HDRCubeTexture } from "@babylonjs/core/Materials/Textures/hdrCubeTexture";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import type { Light } from "@babylonjs/core/Lights/light";
import type { AuthoredStage, AuthoredStageOptions } from "../types";
import type { StageSeason } from "../../../config/stageConfig";
import { createRoundedBox } from "../StageGeometry";
import { StageAssets } from "../StageAssets";
const V = (x = 0, y = 0, z = 0) => new Vector3(x, y, z),
  C = (h: string) => Color3.FromHexString(h);
export async function createRainlightLibrary(
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
  const root = new TransformNode("RainlightLibrary", scene),
    runtime = new TransformNode("RainlightLibrary_Runtime", scene),
    owned: Mesh[] = [],
    materials: Material[] = [],
    textures: BaseTexture[] = [],
    lights: Light[] = [];
  const previous = {
    environmentTexture: scene.environmentTexture,
    environmentIntensity: scene.environmentIntensity,
    clearColor: scene.clearColor.clone(),
  };
  let parent = root,
    seed = 1209;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  function material(n: string, c: string, r = 0.85, metal = 0) {
    const m = new PBRMaterial(n, scene);
    m.albedoColor = C(c);
    m.roughness = r;
    m.metallic = metal;
    m.maxSimultaneousLights = 4;
    materials.push(m);
    return m;
  }
  const plaster = material("warm plaster", "#bdb19a"),
    walnut = material("dark walnut", "#62452f", 0.7),
    floorMat = material("oiled floor", "#ac8b64", 0.72),
    bronze = material("antique brass", "#a48451", 0.4, 0.6),
    charcoal = material("cast iron", "#242a28", 0.7, 0.35),
    linen = material("ivory linen", "#d5c4a5"),
    velvet = material("rust velvet", "#885337"),
    sage = material("sage cloth", "#65715c"),
    stone = material("hearth stone", "#8f8877"),
    brick = material("fireplace brick", "#896c55"),
    paper = material("cream paper", "#e3d5b4"),
    shade = material("lamp linen", "#eddbb6");
  function tex(n: string) {
    const t = new Texture(assetUrl(n), scene, false, false);
    textures.push(t);
    return t;
  }
  floorMat.albedoTexture = tex("wood-Diffuse.jpg");
  floorMat.albedoColor = C("#c8af8e");
  const baseFloorColor = floorMat.albedoColor.clone();
  floorMat.bumpTexture = tex("wood-nor_gl.jpg");
  floorMat.bumpTexture.level = 0.22;
  floorMat.metallicTexture = tex("wood-arm.jpg");
  floorMat.useRoughnessFromMetallicTextureGreen = true;
  floorMat.useMetallnessFromMetallicTextureBlue = true;
  floorMat.useRoughnessFromMetallicTextureAlpha = false;
  for (const t of [
    floorMat.albedoTexture,
    floorMat.bumpTexture,
    floorMat.metallicTexture,
  ] as const) {
    setTextureScale(t, 3, 3);
  }
  function detail(n: string, base: string, weave = false) {
    const t = new DynamicTexture(n, { width: 256, height: 256 }, scene, false),
      c = drawingContext(t);
    c.fillStyle = base;
    c.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 7000; i++) {
      c.fillStyle = i % 2 ? "rgba(255,245,210,.05)" : "rgba(20,12,8,.06)";
      c.fillRect(rand() * 256, rand() * 256, 1, 1);
    }
    if (weave)
      for (let i = 0; i < 256; i += 3) {
        c.fillStyle = "rgba(48,24,12,.07)";
        c.fillRect(i, 0, 1, 256);
        c.fillRect(0, i, 256, 1);
      }
    t.update();
    textures.push(t);
    return t;
  }
  plaster.albedoTexture = detail("plaster detail", "#c5b99f");
  plaster.albedoColor = Color3.White();
  linen.albedoTexture = detail("linen weave", "#d1c09e", true);
  linen.albedoColor = Color3.White();
  velvet.albedoTexture = detail("rust textile", "#905a3e", true);
  velvet.albedoColor = Color3.White();
  function register(m: Mesh, mat: Material) {
    m.material = mat;
    m.parent = parent;
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
    r = 0,
  ) {
    const m = MeshBuilder.CreateBox(
      n,
      { width: w, height: h, depth: d },
      scene,
    );
    m.position = V(x, y, z);
    m.rotation.y = r;
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
    t = 32,
  ) {
    const m = MeshBuilder.CreateCylinder(
      n,
      { diameterTop: dt, diameterBottom: db, height: h, tessellation: t },
      scene,
    );
    m.position = V(x, y, z);
    return register(m, mat);
  }
  function group(n: string, _kind = "furniture"): TransformNode {
    const p = new TransformNode(n, scene);
    p.parent = root;
    parent = p;
    return p;
  }
  function end() {
    parent = root;
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
  box("foundation", 0, -0.15, 0, 10.5, 0.28, 9.0, stone);
  box("oak floor", 0, 0.012, 0, 10.2, 0.06, 8.8, floorMat);
  box("left wall", -5.2, 2.05, 0, 0.18, 4.1, 9, plaster);
  box("right wall", 5.2, 2.05, 0, 0.18, 4.1, 9, plaster);
  box("back fireplace wall", -2.27, 2.05, 4.5, 5.86, 4.1, 0.2, plaster);
  box("right window pier", 5.0, 2.05, 4.5, 0.3, 4.1, 0.2, plaster);
  box("window lower wall", 2.75, 0.31, 4.5, 4.2, 0.62, 0.2, plaster);
  box("window header", 2.75, 3.85, 4.5, 4.2, 0.5, 0.2, plaster);
  box("ceiling", 0, 4.12, 0, 10.5, 0.16, 9, plaster);
  box("front wall", 0, 2.05, -4.5, 10.5, 4.1, 0.2, plaster);
  box("closed oak door", 1.65, 1.37, -4.34, 1.32, 2.65, 0.08, walnut);
  for (const x of [0.94, 2.36] as const)
    box("door architrave", x, 1.42, -4.29, 0.1, 2.82, 0.09, walnut);
  box("door top architrave", 1.65, 2.83, -4.29, 1.52, 0.1, 0.09, walnut);
  for (const y of [0.77, 1.98] as const)
    rounded(
      "door inset panel",
      1.65,
      y,
      -4.285,
      1.1,
      1.0,
      0.035,
      0.015,
      plaster,
    );
  const knob = MeshBuilder.CreateSphere(
    "brass door knob",
    { diameter: 0.085, segments: 8 },
    scene,
  );
  knob.position = V(2.13, 1.22, -4.2);
  register(knob, bronze);
  const knobStem = cylinder(
    "door knob spindle",
    2.13,
    1.22,
    -4.255,
    0.025,
    0.025,
    0.09,
    bronze,
    12,
  );
  knobStem.rotation.x = Math.PI / 2;
  for (const x of [-4.8, -1.55, 1.55, 4.8] as const)
    box("ceiling oak joist", x, 3.96, 0, 0.13, 0.15, 8.8, walnut);
  for (const x of [-5.08, 5.08] as const) {
    box("wall skirting", x, 0.16, 0, 0.07, 0.23, 8.8, walnut);
    box("picture rail", x, 2.99, 0, 0.055, 0.065, 8.8, walnut);
  }
  box("back skirting", 0, 0.16, 4.36, 10.15, 0.23, 0.06, walnut);
  // Window frames stay below the header; no decoration reaches the ceiling.
  for (const x of [0.66, 2.05, 3.44, 4.84] as const)
    box("window mullion", x, 2.12, 4.42, 0.065, 2.96, 0.15, walnut);
  for (const y of [0.65, 2.6, 3.6] as const)
    box("window rail", 2.75, y, 4.42, 4.24, 0.065, 0.15, walnut);
  box("deep window sill", 2.75, 0.65, 4.27, 4.45, 0.11, 0.5, walnut);
  // A restrained border rug, centered on the companion's clear standing area.
  const rugTex = new DynamicTexture(
      "woven library rug",
      { width: 512, height: 512 },
      scene,
      false,
    ),
    rc = drawingContext(rugTex);
  rc.fillStyle = "#a19170";
  rc.fillRect(0, 0, 512, 512);
  rc.strokeStyle = "#6f4834";
  rc.lineWidth = 22;
  rc.strokeRect(24, 24, 464, 464);
  rc.strokeStyle = "#c1a475";
  rc.lineWidth = 6;
  rc.strokeRect(44, 44, 424, 424);
  for (let y = 80; y < 445; y += 36)
    for (let x = 80; x < 445; x += 36) {
      rc.fillStyle = "#84765a";
      rc.beginPath();
      rc.moveTo(x, y - 5);
      rc.lineTo(x + 5, y);
      rc.lineTo(x, y + 5);
      rc.lineTo(x - 5, y);
      rc.fill();
    }
  rc.globalAlpha = 0.12;
  for (let i = 0; i < 512; i += 3) {
    rc.fillStyle = "#30241b";
    rc.fillRect(i, 0, 1, 512);
    rc.fillRect(0, i, 512, 1);
  }
  rugTex.update();
  textures.push(rugTex);
  const rugMat = material("woven rug", "#ffffff");
  rugMat.albedoTexture = rugTex;
  rounded("library rug", 0, 0.073, -0.8, 3.9, 0.035, 3.4, 0.016, rugMat);
  // Custom upholstered sofa, deliberate clear separation from the library shelves.
  const sofa = group("Sofa");
  for (const x of [-0.65, 0.65] as const)
    for (const z of [-1.05, 1.05] as const)
      cylinder("sofa foot", x, 0.075, z, 0.065, 0.065, 0.066, walnut, 12);
  rounded("sofa base", 0, 0.28, 0, 1.85, 0.35, 2.9, 0.1, walnut);
  rounded("sofa back", -0.76, 0.94, 0, 0.32, 1.08, 2.9, 0.15, velvet);
  for (const z of [-1.3, 1.3] as const)
    rounded("sofa arm", 0, 0.7, z, 1.82, 0.55, 0.25, 0.11, velvet);
  for (const z of [-0.64, 0.64] as const)
    rounded("sofa seat", 0.08, 0.61, z, 1.52, 0.26, 1.19, 0.11, linen);
  sofa.position = V(-3.4, 0, -1.25);
  end();
  const props = new StageAssets(
    scene,
    assetUrls,
    (material) => {
      material.roughness = 0.8;
      const palette: Record<string, string> = {
        wood: "#805d3a",
        metal: "#655b4a",
        carpet: "#9f6c4a",
        carpetDarker: "#7e4e3b",
        carpetWhite: "#d8c7a4",
        plant: "#657951",
      };
      const tint = palette[material.name];
      if (tint) material.albedoColor = C(tint);
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
    return props.place(name, parent, V(x, y, z), height, angle, cast);
  }
  // Full-height cases use CC0 artist-made meshes; books sit on the measured shelf tops.
  const spineMats = [
    "#626849",
    "#87634d",
    "#956145",
    "#b29362",
    "#5f6d6a",
    "#9c8972",
  ].map((c, i) => material("book cloth " + i, c));
  async function bookcase(n: string, x: number, z: number, angle: number) {
    const unit = group(n);
    await place("bookcaseOpen", 0, 0.042, 0, 2.65);
    const scale = 2.65 / 0.88;
    for (const shelf of [0.13, 0.37, 0.61] as const) {
      const y = 0.042 + shelf * scale;
      await place("books", -0.25, y, -0.15, 0.32);
      for (let i = 0; i < 6; i++) {
        const h = 0.36 + rand() * 0.14,
          w = 0.055 + rand() * 0.015,
          xx = 0.04 + i * 0.075;
        box(
          "clothbound book",
          xx,
          y + h / 2,
          -0.2,
          w,
          h,
          0.28,
          spineMats[(i + Math.round(shelf * 20)) % spineMats.length]!,
        );
        for (const yy of [0.07, h - 0.07] as const)
          box(
            "book spine band",
            xx,
            y + yy,
            -0.343,
            w * 0.85,
            0.009,
            0.005,
            bronze,
          );
      }
    }
    await place("plantSmall1", 0, 2.692, 0, 0.36);
    unit.position = V(x, 0, z);
    unit.rotation.y = angle;
    end();
    return unit;
  }
  await bookcase("Rear bookcase left", -4.35, 4.0, 0);
  await bookcase("Rear bookcase right", -3.07, 4.0, 0);
  await bookcase("Side bookcase", -4.65, 2.55, -Math.PI / 2);
  // Sofa cushions remain inside the sofa bounds, with their group audited as one unit.
  parent = sofa;
  await place("pillow", -0.53, 0.75, -0.7, 0.46, Math.PI / 2);
  await place("pillowLong", -0.53, 0.75, 0.63, 0.42, Math.PI / 2);
  end();
  const chair = group("Reading chair");
  await place("loungeChairRelax", 0, 0.042, 0, 1.05, -Math.PI / 5);
  chair.position = V(3.5, 0, -0.4);
  end();
  const table = group("Reading side table");
  cylinder("side table top", 0, 0.62, 0, 0.78, 0.78, 0.07, walnut);
  cylinder("side table pedestal", 0, 0.34, 0, 0.16, 0.29, 0.49, bronze);
  cylinder("table foot", 0, 0.07, 0, 0.48, 0.48, 0.056, walnut);
  await place("books", -0.08, 0.66, 0, 0.13, 0.15);
  cylinder("tea cup", 0.22, 0.75, 0, 0.13, 0.1, 0.16, paper);
  table.position = V(3.25, 0, 1.15);
  end();
  const bench = group("Window bench");
  rounded("window bench base", 0, 0.27, 0, 3.52, 0.45, 0.78, 0.055, walnut);
  rounded("window seat cushion", 0, 0.56, 0, 3.44, 0.17, 0.75, 0.065, sage);
  await place("pillow", -1.2, 0.65, 0, 0.4, 0.2);
  await place("plantSmall2", 1.36, 0.65, 0.05, 0.35);
  bench.position = V(2.75, 0, 3.8);
  end();
  const lamp = group("Reading floor lamp");
  cylinder("lamp foot", 0, 0.075, 0, 0.48, 0.48, 0.066, bronze);
  cylinder("lamp stem", 0, 0.98, 0, 0.035, 0.035, 1.87, bronze);
  cylinder("linen lamp shade", 0, 1.98, 0, 0.44, 0.69, 0.43, shade);
  lamp.position = V(4.25, 0, -1.9);
  end();
  // Small original clock on the right wall; no panel above the ceiling line.
  const clockTex = new DynamicTexture(
      "original clock face",
      { width: 256, height: 256 },
      scene,
      false,
    ),
    cc = drawingContext(clockTex);
  cc.fillStyle = "#b9a57d";
  cc.fillRect(0, 0, 256, 256);
  cc.fillStyle = "#e1d2ad";
  cc.beginPath();
  cc.arc(128, 128, 118, 0, Math.PI * 2);
  cc.fill();
  cc.strokeStyle = "#4e4634";
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    cc.lineWidth = i % 3 ? 2 : 4;
    cc.beginPath();
    cc.moveTo(128 + Math.sin(a) * 98, 128 - Math.cos(a) * 98);
    cc.lineTo(128 + Math.sin(a) * 108, 128 - Math.cos(a) * 108);
    cc.stroke();
  }
  cc.lineWidth = 5;
  cc.beginPath();
  cc.moveTo(84, 102);
  cc.lineTo(128, 128);
  cc.lineTo(185, 94);
  cc.stroke();
  clockTex.update();
  textures.push(clockTex);
  const clockMat = material("clock paper", "#ffffff");
  clockMat.albedoTexture = clockTex;
  const clock = MeshBuilder.CreateDisc(
    "decorative wall clock",
    { radius: 0.38, tessellation: 48, sideOrientation: Mesh.DOUBLESIDE },
    scene,
  );
  clock.position = V(5.09, 2.64, -0.5);
  clock.rotation.y = Math.PI / 2;
  register(clock, clockMat);
  // Fireplace is architecture; brick columns, firebox and mantel are separate solids.
  parent = root;
  const fx = -1.3;
  const brickTex = new DynamicTexture(
      "masonry texture",
      { width: 512, height: 512 },
      scene,
      false,
    ),
    bc = drawingContext(brickTex);
  bc.fillStyle = "#554f43";
  bc.fillRect(0, 0, 512, 512);
  for (let row = 0; row < 8; row++)
    for (let col = -1; col < 5; col++) {
      const x = col * 128 + (row % 2) * 64,
        y = row * 64;
      bc.fillStyle = ["#8a6c55", "#95765b", "#7e6652", "#9a7c61"][
        (row + col + 5) % 4
      ]!;
      bc.fillRect(x + 3, y + 3, 122, 58);
      for (let i = 0; i < 80; i++) {
        bc.fillStyle = i % 2 ? "#ffffff08" : "#18100812";
        bc.fillRect(x + rand() * 125, y + rand() * 60, 2, 1);
      }
    }
  brickTex.update();
  textures.push(brickTex);
  brick.albedoTexture = brickTex;
  brick.albedoColor = Color3.White();
  rounded("stone hearth", fx, 0.12, 3.75, 2.45, 0.17, 1.22, 0.06, stone);
  box("firebox back", fx, 0.77, 4.26, 1.37, 1.22, 0.12, charcoal);
  box("left chimney pier", fx - 0.86, 0.84, 4.0, 0.36, 1.55, 0.65, brick);
  box("right chimney pier", fx + 0.86, 0.84, 4.0, 0.36, 1.55, 0.65, brick);
  box("fireplace lintel", fx, 1.52, 4.0, 2.08, 0.27, 0.65, brick);
  rounded("mantel", fx, 1.73, 3.98, 2.34, 0.15, 0.86, 0.035, walnut);
  box("chimney breast", fx, 2.9, 4.2, 1.96, 2.28, 0.4, plaster);
  for (let i = 0; i < 3; i++) {
    const log = cylinder(
      "firewood",
      fx + (i - 1) * 0.24,
      0.33,
      3.97,
      0.18,
      0.18,
      0.74,
      walnut,
      12,
    );
    log.rotation.z = Math.PI / 2;
    log.rotation.y = (i - 1) * 0.15;
  }
  for (const x of [-0.58, -0.29, 0, 0.29, 0.58] as const)
    box("grate bar", fx + x, 0.4, 3.53, 0.025, 0.42, 0.025, charcoal);
  box("grate top rail", fx, 0.61, 3.53, 1.3, 0.025, 0.03, charcoal);
  // Mantel decor has 0.7+ m of clearance below the ceiling; no tall angled panels.
  for (const x of [fx - 0.7, fx + 0.7] as const) {
    cylinder("mantel candle holder", x, 1.86, 3.9, 0.13, 0.19, 0.12, bronze);
    cylinder("wax candle", x, 2.01, 3.9, 0.08, 0.08, 0.21, paper);
  }
  const art = new DynamicTexture(
      "original rainy landscape",
      { width: 512, height: 512 },
      scene,
      false,
    ),
    ac = drawingContext(art);
  ac.fillStyle = "#c2ad87";
  ac.fillRect(0, 0, 512, 512);
  ac.fillStyle = "#8b9278";
  ac.beginPath();
  ac.moveTo(0, 340);
  ac.bezierCurveTo(200, 180, 340, 370, 512, 220);
  ac.lineTo(512, 512);
  ac.lineTo(0, 512);
  ac.fill();
  ac.fillStyle = "#5c6b60";
  ac.beginPath();
  ac.moveTo(0, 430);
  ac.bezierCurveTo(200, 290, 340, 450, 512, 340);
  ac.lineTo(512, 512);
  ac.lineTo(0, 512);
  ac.fill();
  ac.fillStyle = "#d0bd91";
  ac.beginPath();
  ac.arc(340, 165, 45, 0, Math.PI * 2);
  ac.fill();
  art.update();
  textures.push(art);
  const am = material("landscape paper", "#ffffff");
  am.albedoTexture = art;
  box("mantel picture frame", fx, 2.72, 3.96, 1.12, 1.12, 0.06, walnut);
  const painting = MeshBuilder.CreatePlane(
    "original mantel landscape",
    { width: 1.01, height: 1.01 },
    scene,
  );
  painting.position = V(fx, 2.72, 3.918);
  register(painting, am);
  // Runtime fire stays inside the firebox: 0.96 × 0.84 m, below the lintel.
  Effect.ShadersStore.rainlightFireVertexShader =
    "precision highp float;attribute vec3 position;attribute vec2 uv;uniform mat4 worldViewProjection;varying vec2 vUV;void main(){vUV=uv;gl_Position=worldViewProjection*vec4(position,1.);}";
  Effect.ShadersStore.rainlightFireFragmentShader = `precision highp float;varying vec2 vUV;uniform float time;void main(){vec2 p=vUV;float flame=0.;for(int i=0;i<5;i++){float fi=float(i);float x=.12+fi*.19+.025*sin(time*1.9+fi*2.);float w=.10*(1.-p.y*.75);float height=.57+.2*sin(fi*1.8+time*1.3);float f=exp(-pow((p.x-x)/max(.01,w),2.))*smoothstep(height,height-.22,p.y);flame=max(flame,f);}float a=clamp(flame,0.,1.)*smoothstep(0.,.08,p.y);vec3 col=mix(vec3(1.,.14,.008),vec3(1.,.66,.12),clamp(flame*1.6-p.y*.45,0.,1.));gl_FragColor=vec4(col*a*.95,a*.88);}`;
  const fire = MeshBuilder.CreatePlane(
    "fire inside firebox",
    { width: 0.96, height: 0.84 },
    scene,
  );
  fire.parent = runtime;
  fire.position = V(fx, 0.72, 3.71);
  const fm = new ShaderMaterial(
    "contained hearth flames",
    scene,
    { vertex: "rainlightFire", fragment: "rainlightFire" },
    {
      attributes: ["position", "uv"],
      uniforms: ["worldViewProjection", "time"],
      needAlphaBlending: true,
    },
  );
  fm.backFaceCulling = false;
  fm.alphaMode = Engine.ALPHA_ADD;
  fm.disableDepthWrite = true;
  fm.setFloat("time", 0);
  fire.material = fm;
  materials.push(fm);
  // Distant rainlit street: real low-detail geometry outside the window, no image backdrop.
  const cityMat = material("distant slate buildings", "#253342"),
    windowGlow = material("distant warm windows", "#bda472");
  windowGlow.unlit = true;
  windowGlow.albedoColor = C("#76613e");
  windowGlow.emissiveColor = C("#6d5130").scale(0.12);
  const cityRoot = new TransformNode("Rainlight street", scene);
  cityRoot.parent = runtime;
  const oldParent = parent;
  parent = cityRoot;
  box("outside ground", 2, -0.35, 16, 40, 0.3, 30, cityMat);
  for (let i = 0; i < 7; i++) {
    const x = -13 + i * 4.8,
      h = 5 + rand() * 5,
      z = 16 + rand() * 6;
    box("distant townhouse", x, h / 2 - 1, z, 3.8, h, 3.8, cityMat);
    for (let row = 0; row < 3; row++)
      for (let col = 0; col < 2; col++)
        if (rand() > 0.28)
          box(
            "distant window",
            x - 0.85 + col * 1.7,
            0.7 + row * 1.7,
            z - 1.91,
            0.6,
            0.85,
            0.025,
            windowGlow,
          );
  }
  parent = oldParent;
  // Rain-streaked panes are bounded by the window reveal, never the roof.
  Effect.ShadersStore.rainlightRainVertexShader =
    "precision highp float;attribute vec3 position;attribute vec2 uv;uniform mat4 worldViewProjection;varying vec2 vUV;void main(){vUV=uv;gl_Position=worldViewProjection*vec4(position,1.);}";
  Effect.ShadersStore.rainlightRainFragmentShader = `precision highp float;varying vec2 vUV;uniform float time;float hash(float x){return fract(sin(x*127.1)*43758.54);}void main(){vec2 uv=vUV;float rain=0.;for(int i=0;i<2;i++){float f=float(i),cols=22.+f*17.;float cell=floor(uv.x*cols);float h=hash(cell+f*81.);float center=(cell+.2+h*.6)/cols;float dx=uv.x-center;float yy=fract(uv.y*3.2+time*(.055+h*.045)+h);float bead=exp(-dx*dx*170000.-pow((yy-.55)*48.,2.));float tail=exp(-dx*dx*300000.)*smoothstep(.27,.5,yy)*(1.-smoothstep(.55,.62,yy));rain+=(bead*.38+tail*.12)*step(.38,h);}gl_FragColor=vec4(vec3(.5,.65,.73),.028+rain);}`;
  const rainMat = new ShaderMaterial(
    "window rain",
    scene,
    { vertex: "rainlightRain", fragment: "rainlightRain" },
    {
      attributes: ["position", "uv"],
      uniforms: ["worldViewProjection", "time"],
      needAlphaBlending: true,
    },
  );
  rainMat.backFaceCulling = false;
  rainMat.disableDepthWrite = true;
  rainMat.setFloat("time", 0);
  materials.push(rainMat);
  for (const [x, w] of [
    [1.36, 1.3],
    [2.75, 1.3],
    [4.14, 1.3],
  ] as const) {
    const pane = MeshBuilder.CreatePlane(
      "rain within window reveal",
      { width: w, height: 2.84 },
      scene,
    );
    pane.position = V(x, 2.12, 4.395);
    pane.parent = runtime;
    pane.material = rainMat;
  }
  // Static batches grouped by material; imported repeated props remain instances.
  const batches = new Map<number, Mesh[]>();
  for (const m of owned) {
    if (m.isDisposed() || m.parent === cityRoot) continue;
    let p = m.parent,
      inRoot = false;
    while (p) {
      if (p === root) {
        inRoot = true;
        break;
      }
      p = p.parent;
    }
    if (!inRoot) continue;
    if (!m.material) continue;
    const k = m.material.uniqueId;
    if (!batches.has(k)) batches.set(k, []);
    batches.get(k)!.push(m);
  }
  for (const group of batches.values()) {
    if (group.length < 2) continue;
    const name = group[0]!.material!.name,
      merged = Mesh.MergeMeshes(group, true, true, undefined, false, false);
    if (!merged) continue;
    merged.name = "static " + name;
    merged.parent = root;
    merged.receiveShadows = true;
  }
  // Two batches for the distant street, rather than a draw call per lit window.
  for (const mat of [cityMat, windowGlow] as const) {
    const ms = cityRoot
      .getChildMeshes()
      .filter((m): m is Mesh => m instanceof Mesh && m.material === mat);
    if (ms.length > 1) {
      const m = Mesh.MergeMeshes(ms, true, true, undefined, false, false);
      if (!m) continue;
      m.name = "street " + mat.name;
      m.parent = cityRoot;
      m.receiveShadows = false;
    }
  }
  const env = new HDRCubeTexture(
    assetUrl("library-light.hdr"),
    scene,
    128,
    false,
    true,
    false,
    true,
  );
  env.rotationY = 0.4;
  scene.environmentTexture = env;
  textures.push(env);
  const moon = new DirectionalLight(
    "rainy window light",
    V(-0.5, -0.6, -0.8),
    scene,
  );
  moon.position = V(6, 10, 15);
  moon.diffuse = C("#8da6bd");
  lights.push(moon);
  const fill = new HemisphericLight("soft library fill", V(0, 1, 0), scene);
  fill.groundColor = C("#514331");
  fill.diffuse = C("#b3a087");
  lights.push(fill);
  const hearth = new PointLight("warm hearth", V(fx, 1.05, 2.85), scene);
  hearth.diffuse = C("#ffbd6e");
  hearth.range = 9;
  hearth.radius = 1.2;
  lights.push(hearth);
  const reading = new PointLight(
    "warm reading lamp",
    V(4.25, 1.8, -1.9),
    scene,
  );
  reading.diffuse = C("#ffd29c");
  reading.range = 8;
  reading.radius = 0.55;
  lights.push(reading);
  const shadows = new ShadowGenerator(quality === "mobile" ? 2048 : 4096, moon);
  shadows.usePercentageCloserFiltering = true;
  shadows.filteringQuality =
    quality === "mobile"
      ? ShadowGenerator.QUALITY_MEDIUM
      : ShadowGenerator.QUALITY_HIGH;
  shadows.bias = 0.0008;
  shadows.normalBias = 0.008;
  shadows.setDarkness(0.38);
  moon.shadowMinZ = 1;
  moon.shadowMaxZ = 50;
  moon.autoCalcShadowZBounds = true;
  for (const m of root.getChildMeshes())
    if (m.getTotalVertices()) shadows.addShadowCaster(m);
  const moods = {
    rainy: {
      moon: 0.65,
      fill: 0.16,
      env: 0.22,
      hearth: 9,
      lamp: 8,
      sky: "#101b2b",
    },
    evening: {
      moon: 1.5,
      fill: 0.26,
      env: 0.4,
      hearth: 7,
      lamp: 6,
      sky: "#263b4c",
    },
    embers: {
      moon: 0.2,
      fill: 0.09,
      env: 0.11,
      hearth: 13,
      lamp: 7,
      sky: "#080f1b",
    },
  };
  let mood = "rainy",
    time = 0,
    season: StageSeason = "summer";
  const seasonalPalette: Record<
    StageSeason,
    { sky: string; ambient: string; floor: string; environment: number }
  > = {
    spring: {
      sky: "#576b70",
      ambient: "#c0d4c5",
      floor: "#c6ad8c",
      environment: 1.05,
    },
    summer: {
      sky: "#263b4c",
      ambient: "#b3a087",
      floor: "#c8af8e",
      environment: 1,
    },
    autumn: {
      sky: "#51413a",
      ambient: "#d2ae85",
      floor: "#b99268",
      environment: 0.92,
    },
    winter: {
      sky: "#304657",
      ambient: "#c2d5e0",
      floor: "#aebcc1",
      environment: 0.78,
    },
  };
  function setMood(n: string) {
    if (!moods[n as keyof typeof moods])
      throw Error("Unknown library mood: " + n);
    mood = n;
    const m = moods[n as keyof typeof moods];
    const seasonal = seasonalPalette[season];
    moon.intensity = m.moon;
    moon.diffuse = Color3.Lerp(C("#8da6bd"), C(seasonal.ambient), 0.28);
    fill.intensity = m.fill;
    fill.diffuse = Color3.Lerp(C("#b3a087"), C(seasonal.ambient), 0.32);
    scene.environmentIntensity = m.env * seasonal.environment;
    hearth.intensity = m.hearth;
    reading.intensity = m.lamp;
    shade.emissiveColor = C("#ffd092").scale(n === "evening" ? 0.35 : 0.7);
    scene.clearColor = Color4.FromColor3(
      Color3.Lerp(C(m.sky), C(seasonal.sky), 0.26),
    );
    floorMat.albedoColor = Color3.Lerp(baseFloorColor, C(seasonal.floor), 0.35);
    return n;
  }
  function setTime(h: number) {
    h = ((h % 24) + 24) % 24;
    return setMood(
      h >= 6 && h < 18 ? "evening" : h < 22 && h >= 18 ? "rainy" : "embers",
    );
  }
  function setSeason(nextSeason: StageSeason) {
    season = nextSeason;
    setMood(mood);
    return season;
  }
  function update(dt: number) {
    time += Math.min(0.1, Math.max(0, dt));
    fm.setFloat("time", time);
    rainMat.setFloat("time", time);
    hearth.intensity =
      moods[mood as keyof typeof moods].hearth *
      (1 + 0.025 * Math.sin(time * 2.1) + 0.018 * Math.sin(time * 3.7));
  }
  setMood("rainy");
  onProgress("Library ready");
  return {
    id: "rainlight-library",
    animatedLighting: true,
    root,
    runtime,
    setMood,
    setTime,
    setSeason,
    update,
    get mood() {
      return mood;
    },
    weatherBounds: { min: [-1, 0, 4.9], max: [6.5, 7, 12] },
    characterAnchor: { position: [0, 0.095, -0.8], facingRadians: Math.PI },
    cameraPresets: {
      companion: {
        position: [3.8, 1.85, -4.0],
        target: [-0.6, 1.5, 2.8],
        fov: 1.25,
      },
      leftCorner: { position: [-4.55, 2.1, -3.85], target: [1.4, 1.7, 2.5] },
      rightCorner: { position: [4.6, 2.05, -3.8], target: [-2.1, 1.6, 2.9] },
      rearLeft: { position: [-2.5, 2.05, 3.0], target: [1.1, 1.1, -1.4] },
      rearRight: { position: [4.4, 2.0, 2.95], target: [-2.7, 1.4, -0.2] },
      ceiling: { position: [0, 3.65, -3.5], target: [0, 1.4, 2.2] },
      window: { position: [0.5, 1.6, 1.75], target: [2.7, 2.1, 4.5] },
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
