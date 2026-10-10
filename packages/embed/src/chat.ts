import { injectVAssistEmbed } from "../../../embed/main";
import {
  mergeVAssistEmbedConfig,
  type VAssistEmbedConfig,
  type VAssistEmbedInjectOptions,
} from "../../../src/embed/config";

export * from "./index";

export const createChatVAssistConfig = (
  config: VAssistEmbedConfig = {},
): VAssistEmbedConfig =>
  mergeVAssistEmbedConfig({ shell: { mode: "chat-only" } }, config);

export const injectChatVAssistEmbed = (
  options: VAssistEmbedInjectOptions = {},
) =>
  injectVAssistEmbed({
    ...options,
    config: createChatVAssistConfig(options.config),
  });
