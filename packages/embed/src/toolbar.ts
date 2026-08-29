import { injectVAssistEmbed } from "../../../embed/main";
import {
  mergeVAssistEmbedConfig,
  type VAssistEmbedConfig,
  type VAssistEmbedInjectOptions,
} from "../../../src/embed/config";

export * from "./index";

export const createToolbarVAssistConfig = (
  config: VAssistEmbedConfig = {},
): VAssistEmbedConfig =>
  mergeVAssistEmbedConfig({ shell: { mode: "toolbar-only" } }, config);

export const injectToolbarVAssistEmbed = (
  options: VAssistEmbedInjectOptions = {},
) =>
  injectVAssistEmbed({
    ...options,
    config: createToolbarVAssistConfig(options.config),
  });
