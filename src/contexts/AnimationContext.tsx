/**
 * AnimationContext backed by a scoped Zustand store.
 */

import {
  createContext,
  useContext,
  useRef,
  type ReactNode,
} from "react";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import {
  createAnimationStore,
  type AnimationStore,
  type AnimationStoreState,
} from "../stores/createAnimationStore";

const AnimationStoreContext = createContext<AnimationStore | null>(null);

interface AnimationProviderProps {
  children: ReactNode;
}

export const AnimationProvider = ({ children }: AnimationProviderProps) => {
  const storeRef = useRef<AnimationStore | null>(null);

  if (!storeRef.current) {
    storeRef.current = createAnimationStore();
  }

  return (
    <AnimationStoreContext.Provider value={storeRef.current}>
      {children}
    </AnimationStoreContext.Provider>
  );
};

export function useAnimationStoreSelector<T>(
  selector: (state: AnimationStoreState) => T,
): T {
  const store = useContext(AnimationStoreContext);
  if (!store) {
    throw new Error(
      "useAnimationStoreSelector must be used within AnimationProvider",
    );
  }

  return useStore(store, selector);
}

export const useAnimation = (): AnimationStoreState =>
  useAnimationStoreSelector(
    useShallow((state) => ({
      isLoading: state.isLoading,
      configSaved: state.configSaved,
      disabledDefaultAnimations: state.disabledDefaultAnimations,
      customAnimations: state.customAnimations,
      getEnabledAnimations: state.getEnabledAnimations,
      getRandomAnimation: state.getRandomAnimation,
      toggleDefaultAnimation: state.toggleDefaultAnimation,
      toggleCustomAnimation: state.toggleCustomAnimation,
      reloadCustomAnimations: state.reloadCustomAnimations,
      hasEnabledAnimation: state.hasEnabledAnimation,
      getEnabledCounts: state.getEnabledCounts,
    })),
  );

export default AnimationStoreContext;
