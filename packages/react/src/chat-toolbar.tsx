import {
  mergeVAssistEmbedConfig,
  type VAssistEmbedConfig,
} from "../../../src/embed/config";
import { VAssistEmbed, type VAssistEmbedProps } from "./index";

export * from "./index";

export const createChatToolbarVAssistReactConfig = (
  config: VAssistEmbedConfig = {},
): VAssistEmbedConfig =>
  mergeVAssistEmbedConfig({ shell: { mode: "chat-toolbar" } }, config);

export function ChatToolbarVAssistEmbed(props: VAssistEmbedProps) {
  return (
    <VAssistEmbed
      {...props}
      defaultConfig={createChatToolbarVAssistReactConfig(props.defaultConfig)}
    />
  );
}
