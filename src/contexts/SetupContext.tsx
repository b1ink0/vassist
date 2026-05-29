/**
 * SetupContext backed by a scoped Zustand store.
 */

import { createContext, useContext, useRef, type ReactNode } from "react";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import {
  createSetupStore,
  type SetupStore,
  type SetupStoreState,
} from "../stores/createSetupStore";

const SetupStoreContext = createContext<SetupStore | null>(null);

interface SetupProviderProps {
  children: ReactNode;
}

export function SetupProvider({ children }: SetupProviderProps) {
  const storeRef = useRef<SetupStore | null>(null);

  if (!storeRef.current) {
    storeRef.current = createSetupStore();
  }

  return (
    <SetupStoreContext.Provider value={storeRef.current}>
      {children}
    </SetupStoreContext.Provider>
  );
}

export function useSetupStoreSelector<T>(
  selector: (state: SetupStoreState) => T,
): T {
  const store = useContext(SetupStoreContext);
  if (!store) {
    throw new Error(
      "useSetupStoreSelector must be used within a SetupProvider",
    );
  }

  return useStore(store, selector);
}

export const useSetup = (): SetupStoreState =>
  useSetupStoreSelector(
    useShallow((state) => ({
      isLoading: state.isLoading,
      setupCompleted: state.setupCompleted,
      currentStep: state.currentStep,
      completedSteps: state.completedSteps,
      setupData: state.setupData,
      totalSteps: state.totalSteps,
      goToStep: state.goToStep,
      nextStep: state.nextStep,
      previousStep: state.previousStep,
      markStepComplete: state.markStepComplete,
      updateSetupData: state.updateSetupData,
      completeSetup: state.completeSetup,
      completeSetupWithDefaults: state.completeSetupWithDefaults,
      resetSetup: state.resetSetup,
    })),
  );

export default SetupStoreContext;
