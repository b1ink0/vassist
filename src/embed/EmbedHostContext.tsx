import { createContext, useContext, type PropsWithChildren } from "react";
import {
  normalizeVAssistEmbedConfig,
  type ResolvedVAssistEmbedConfig,
} from "./config";

interface EmbedHostContextValue {
  hostId: string;
  embedConfig: ResolvedVAssistEmbedConfig;
}

const defaultEmbedConfig = normalizeVAssistEmbedConfig();

const EmbedHostContext = createContext<EmbedHostContextValue>({
  hostId: defaultEmbedConfig.mount.hostId,
  embedConfig: defaultEmbedConfig,
});

export function EmbedHostProvider({
  children,
  embedConfig,
}: PropsWithChildren<{ embedConfig: ResolvedVAssistEmbedConfig }>) {
  return (
    <EmbedHostContext.Provider
      value={{
        hostId: embedConfig.mount.hostId,
        embedConfig,
      }}
    >
      {children}
    </EmbedHostContext.Provider>
  );
}

export function useEmbedHost(): EmbedHostContextValue {
  return useContext(EmbedHostContext);
}

export default EmbedHostContext;
