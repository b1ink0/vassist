import {
  mergeVAssistEmbedConfig,
  type VAssistEmbedConfig,
} from "../../../src/embed/config";
import { VAssistEmbed, type VAssistEmbedProps } from "./index";

export * from "./index";

export const createToolbarVAssistReactConfig = (
  config: VAssistEmbedConfig = {},
): VAssistEmbedConfig =>
  mergeVAssistEmbedConfig({ shell: { mode: "toolbar-only" } }, config);

export function ToolbarVAssistEmbed(props: VAssistEmbedProps) {
  return (
    <VAssistEmbed
      {...props}
      defaultConfig={createToolbarVAssistReactConfig(props.defaultConfig)}
    />
  );
}
