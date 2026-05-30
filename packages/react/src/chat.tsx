import {
  mergeVAssistEmbedConfig,
  type VAssistEmbedConfig,
} from "../../../src/embed/config";
import { VAssistEmbed, type VAssistEmbedProps } from "./index";

export * from "./index";

export const createChatVAssistReactConfig = (
  config: VAssistEmbedConfig = {},
): VAssistEmbedConfig =>
  mergeVAssistEmbedConfig({ shell: { mode: "chat-only" } }, config);

export function ChatVAssistEmbed(props: VAssistEmbedProps) {
  return (
    <VAssistEmbed
      {...props}
      defaultConfig={createChatVAssistReactConfig(props.defaultConfig)}
    />
  );
}
