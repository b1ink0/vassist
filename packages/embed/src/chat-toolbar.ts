import { injectVAssistEmbed } from "../../../embed/main";
import {
  mergeVAssistEmbedConfig,
  type VAssistEmbedConfig,
  type VAssistEmbedInjectOptions,
} from "../../../src/embed/config";

export * from "./index";

export const createChatToolbarVAssistConfig = (
  config: VAssistEmbedConfig = {},
): VAssistEmbedConfig =>
  mergeVAssistEmbedConfig({ shell: { mode: "chat-toolbar" } }, config);

export const injectChatToolbarVAssistEmbed = (
  options: VAssistEmbedInjectOptions = {},
) =>
  injectVAssistEmbed({
    ...options,
    config: createChatToolbarVAssistConfig(options.config),
  });
