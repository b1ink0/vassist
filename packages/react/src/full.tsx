import {
  mergeVAssistEmbedConfig,
  type VAssistEmbedConfig,
} from "../../../src/embed/config";
import { VAssistEmbed, type VAssistEmbedProps } from "./index";

export * from "./index";

export const createFullVAssistReactConfig = (
  config: VAssistEmbedConfig = {},
): VAssistEmbedConfig =>
  mergeVAssistEmbedConfig({ shell: { mode: "full" } }, config);

export function FullVAssistEmbed(props: VAssistEmbedProps) {
  return (
    <VAssistEmbed
      {...props}
      defaultConfig={createFullVAssistReactConfig(props.defaultConfig)}
    />
  );
}
