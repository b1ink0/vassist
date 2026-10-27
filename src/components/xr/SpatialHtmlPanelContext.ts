import { createContext, useContext } from "react";

export const SpatialHtmlPanelContext = createContext<HTMLElement | null>(null);
export const useSpatialHtmlPanelHost = () =>
  useContext(SpatialHtmlPanelContext);
