import { injectVAssistEmbed } from "../../../embed/main";
import {
  mergeVAssistEmbedConfig,
  type VAssistEmbedConfig,
  type VAssistEmbedInjectOptions,
} from "../../../src/embed/config";

export * from "./index";

export const createFullVAssistConfig = (
  config: VAssistEmbedConfig = {},
): VAssistEmbedConfig =>
  mergeVAssistEmbedConfig({ shell: { mode: "full" } }, config);

export const injectFullVAssistEmbed = (
  options: VAssistEmbedInjectOptions = {},
) =>
  injectVAssistEmbed({
    ...options,
    config: createFullVAssistConfig(options.config),
  });
