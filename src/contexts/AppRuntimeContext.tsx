import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { useStore } from "zustand";
import defaultChatService, { ChatService } from "../services/ChatService";
import defaultChatHistoryService, {
  ChatHistoryService,
} from "../services/ChatHistoryService";
import {
  appStore,
  createAppStore,
  type AppStore,
  type AppStoreState,
} from "../stores/createAppStore";

interface AppRuntimeContextValue {
  store: AppStore;
  chatService: ChatService;
  chatHistoryService: ChatHistoryService;
}

const globalRuntimeValue: AppRuntimeContextValue = {
  store: appStore,
  chatService: defaultChatService,
  chatHistoryService: defaultChatHistoryService,
};

const AppRuntimeContext = createContext<AppRuntimeContextValue | null>(null);

interface AppRuntimeProviderProps {
  children: ReactNode;
  onStoreReady?: ((store: AppStore) => void) | undefined;
}

export function AppRuntimeProvider({
  children,
  onStoreReady,
}: AppRuntimeProviderProps) {
  const runtimeRef = useRef<AppRuntimeContextValue | null>(null);

  if (!runtimeRef.current) {
    const chatService = new ChatService();
    const chatHistoryService = new ChatHistoryService({ chatService });
    const store = createAppStore({
      chatService,
      chatHistoryService,
    });

    runtimeRef.current = {
      store,
      chatService,
      chatHistoryService,
    };
  }

  useEffect(() => {
    onStoreReady?.(runtimeRef.current!.store);
  }, [onStoreReady]);

  return (
    <AppRuntimeContext.Provider value={runtimeRef.current}>
      {children}
    </AppRuntimeContext.Provider>
  );
}

export function useAppRuntime(): AppRuntimeContextValue {
  return useContext(AppRuntimeContext) ?? globalRuntimeValue;
}

export function useAppStoreSelector<T>(
  selector: (state: AppStoreState) => T,
): T {
  const { store } = useAppRuntime();
  return useStore(store, selector);
}

export function useAppStoreApi(): AppStore {
  return useAppRuntime().store;
}

export function useAppRuntimeServices(): Pick<
  AppRuntimeContextValue,
  "chatService" | "chatHistoryService"
> {
  const { chatService, chatHistoryService } = useAppRuntime();
  return { chatService, chatHistoryService };
}

export default AppRuntimeContext;
