import { useEffect, useState } from "react";
import {
  isAndroid,
  isDesktop,
  isDesktopAttachedModeWindow,
} from "../utils/PlatformUtils";

const WIDE_DESKTOP_HISTORY_QUERY = "(min-width: 1280px)";

/** Wide attached desktop layouts can dock history without covering the chat. */
export function useWideDesktopHistory() {
  const [matches, setMatches] = useState(() =>
    typeof window === "undefined"
      ? false
      : window.matchMedia(WIDE_DESKTOP_HISTORY_QUERY).matches,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia(WIDE_DESKTOP_HISTORY_QUERY);
    const updateMatch = () => setMatches(mediaQuery.matches);

    updateMatch();
    mediaQuery.addEventListener("change", updateMatch);
    return () => mediaQuery.removeEventListener("change", updateMatch);
  }, []);

  return isDesktop && !isAndroid && isDesktopAttachedModeWindow && matches;
}
