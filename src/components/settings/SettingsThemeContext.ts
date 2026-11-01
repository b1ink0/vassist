import { createContext, useContext } from "react";

export const SettingsThemeContext = createContext<
  "dark" | "light" | "opaque-light" | null
>(null);
export const useSettingsTheme = () => useContext(SettingsThemeContext);
