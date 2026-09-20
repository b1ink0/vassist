import { create } from "zustand";
import type { CSSProperties, ReactNode } from "react";
import type { VAssistSettingsTabId, VAssistSettingsTargetId } from "./config";

export interface VAssistReactIconProps {
  name: string;
  size?: number;
  className?: string;
  style?: CSSProperties;
}

export interface VAssistReactHeaderActionsContext {
  hostId: string;
}

export interface VAssistReactFooterContext {
  hostId: string;
}

export interface VAssistReactEmptyStateContext {
  hostId: string;
}

export interface VAssistReactToolbarActionsContext {
  hostId: string;
}

export interface VAssistReactSettingsExtensionContext {
  hostId: string;
  activeTab: VAssistSettingsTabId;
  activeTarget: VAssistSettingsTargetId | null;
}

export interface VAssistReactCustomizations {
  renderHeaderActions?: (
    context: VAssistReactHeaderActionsContext,
  ) => ReactNode;
  renderFooterContent?: (context: VAssistReactFooterContext) => ReactNode;
  renderEmptyState?: (context: VAssistReactEmptyStateContext) => ReactNode;
  renderToolbarActions?: (
    context: VAssistReactToolbarActionsContext,
  ) => ReactNode;
  renderSettingsExtension?: (
    context: VAssistReactSettingsExtensionContext,
  ) => ReactNode;
  iconRenderers?: Record<string, (props: VAssistReactIconProps) => ReactNode>;
}

const EMPTY_CUSTOMIZATIONS: VAssistReactCustomizations = {};

interface ReactCustomizationState {
  byHostId: Record<string, VAssistReactCustomizations>;
  setHost: (hostId: string, customizations: VAssistReactCustomizations) => void;
  clearHost: (hostId: string) => void;
}

const useReactCustomizationStore = create<ReactCustomizationState>((set) => ({
  byHostId: {},
  setHost: (hostId, customizations) => {
    set((state) => ({
      byHostId: {
        ...state.byHostId,
        [hostId]: customizations,
      },
    }));
  },
  clearHost: (hostId) => {
    set((state) => {
      if (!state.byHostId[hostId]) {
        return state;
      }

      const nextByHostId = { ...state.byHostId };
      delete nextByHostId[hostId];
      return { byHostId: nextByHostId };
    });
  },
}));

export function registerVAssistReactCustomizations(
  hostId: string,
  customizations: VAssistReactCustomizations,
): void {
  useReactCustomizationStore.getState().setHost(hostId, customizations);
}

export function clearVAssistReactCustomizations(hostId: string): void {
  useReactCustomizationStore.getState().clearHost(hostId);
}

export function useVAssistReactCustomizations(
  hostId: string,
): VAssistReactCustomizations {
  return useReactCustomizationStore(
    (state) => state.byHostId[hostId] ?? EMPTY_CUSTOMIZATIONS,
  );
}

export function getVAssistReactCustomizations(
  hostId: string,
): VAssistReactCustomizations {
  return (
    useReactCustomizationStore.getState().byHostId[hostId] ??
    EMPTY_CUSTOMIZATIONS
  );
}
