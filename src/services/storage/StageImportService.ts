import { pmxConverterService } from "../mmd/PMXConverterService";
import { modelStorageService } from "./ModelStorageService";
import { stageStorageService } from "./StageStorageService";

function checkEmbeddedBabylon(value: unknown): void {
  if (!value || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value)) {
    if (key === "delayLoadingFile" && typeof entry === "string" && entry)
      throw new Error(
        "Export this Babylon scene without external delayed geometry before importing",
      );
    if (
      key === "environmentTexture" &&
      typeof entry === "string" &&
      !entry.startsWith("data:")
    )
      throw new Error(
        "Embed the environment texture before importing this Babylon scene",
      );
    if (/texture$/i.test(key) && entry && typeof entry === "object") {
      const texture = entry as { name?: unknown; base64String?: unknown };
      if (
        typeof texture.name === "string" &&
        texture.name &&
        !texture.name.startsWith("data:") &&
        !texture.base64String
      )
        throw new Error(
          "This Babylon scene references external textures. Export it with embedded textures before importing.",
        );
    }
    checkEmbeddedBabylon(entry);
  }
}

export async function importStageFile(
  file: File,
  onProgress: (message: string) => void,
): Promise<void> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  const name = file.name.replace(/\.[^.]+$/, "");
  if (extension === "zip") {
    const validation = await pmxConverterService.quickValidate(file);
    if (!validation.isValid) throw new Error(validation.errors.join(", "));
    const result = await pmxConverterService.processModelUpload(
      file,
      name,
      (_step, message) => onProgress(message),
    );
    for (const id of Array.isArray(result) ? result : [result]) {
      try {
        const model = await modelStorageService.getModel(id);
        if (!model?.modelData)
          throw new Error("Converted stage data is unavailable");
        await stageStorageService.saveStage(
          null,
          model.name || name,
          model.modelData,
          { ...model.metadata, format: "bpmx" },
        );
      } finally {
        await modelStorageService.deleteModel(id);
      }
    }
    return;
  }
  if (extension !== "glb" && extension !== "babylon")
    throw new Error("Choose a GLB, Babylon scene, or PMX ZIP");
  onProgress(`Checking ${file.name}`);
  if (extension === "glb") {
    const buffer = await file.arrayBuffer();
    const view = new DataView(buffer);
    if (
      buffer.byteLength < 20 ||
      view.getUint32(0, true) !== 0x46546c67 ||
      view.getUint32(4, true) !== 2 ||
      view.getUint32(8, true) !== buffer.byteLength ||
      view.getUint32(16, true) !== 0x4e4f534a
    )
      throw new Error("This is not a valid glTF 2 GLB file");
    const length = view.getUint32(12, true);
    if (20 + length > buffer.byteLength)
      throw new Error("The GLB file is incomplete");
    const content = JSON.parse(
      new TextDecoder().decode(new Uint8Array(buffer, 20, length)),
    ) as { buffers?: { uri?: string }[]; images?: { uri?: string }[] };
    if (
      [...(content.buffers ?? []), ...(content.images ?? [])].some(
        (item) => item.uri && !item.uri.startsWith("data:"),
      )
    )
      throw new Error(
        "Export a self-contained GLB with its textures and buffers embedded",
      );
  } else {
    const content: unknown = JSON.parse(await file.text());
    if (!content || typeof content !== "object" || !("meshes" in content))
      throw new Error("This is not a Babylon scene");
    checkEmbeddedBabylon(content);
  }
  await stageStorageService.saveStage(null, name, file, {
    format: extension,
    originalFileName: file.name,
  });
}
