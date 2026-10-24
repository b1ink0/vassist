import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { BUILT_IN_BACKGROUNDS } from "../src/config/backgroundCatalog.ts";
import { BUILT_IN_STAGES } from "../src/config/stageConfig.ts";

const root = path.resolve(import.meta.dirname, "..");
const backgroundsSource = path.join(root, "public/res/assets/backgrounds");
const stagesSource = path.join(root, "public/res/assets/stage-previews");
const docsAssets = path.join(root, "documentation/site/public/assets");

/** Sync small documentation copies from the app's source-of-truth previews. */
export async function syncDocumentationPreviews(): Promise<void> {
  const backgroundsOutput = path.join(docsAssets, "backgrounds");
  const stagesOutput = path.join(docsAssets, "stages");
  await Promise.all([
    mkdir(backgroundsOutput, { recursive: true }),
    mkdir(stagesOutput, { recursive: true }),
  ]);

  await Promise.all(
    BUILT_IN_BACKGROUNDS.map(async ({ preview }) => {
      await sharp(path.join(backgroundsSource, preview))
        .resize(720, 405, { fit: "cover" })
        .webp({ quality: 66, effort: 6 })
        .toFile(path.join(backgroundsOutput, preview));
    }),
  );
  await Promise.all(
    BUILT_IN_STAGES.map(({ id }) => {
      const preview = id + ".webp";
      return copyFile(
        path.join(stagesSource, preview),
        path.join(stagesOutput, preview),
      );
    }),
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename)
  await syncDocumentationPreviews();
