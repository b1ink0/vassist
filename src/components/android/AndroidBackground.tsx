/**
 * AndroidBackground Component
 * Shared background layer for Android app and live wallpaper
 */

import { useState, useEffect } from "react";
import { backgroundStorageService } from "../../services/BackgroundStorageService";
import Logger from "../../services/LoggerService";

function AndroidBackground() {
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);

  useEffect(() => {
    const loadBackground = async () => {
      try {
        const active = await backgroundStorageService.getActiveBackground();
        if (active?.imageUrl) {
          setBackgroundUrl(active.imageUrl);
        } else {
          setBackgroundUrl(null);
        }
      } catch (error) {
        Logger.error("AndroidBackground", "Failed to load background:", error);
      }
    };

    loadBackground();

    const handleBackgroundChange = () => loadBackground();
    window.addEventListener("backgroundChanged", handleBackgroundChange);

    return () => {
      window.removeEventListener("backgroundChanged", handleBackgroundChange);
    };
  }, []);

  if (!backgroundUrl) return null;

  return (
    <div
      className="fixed inset-0 z-[-1]"
      style={{
        backgroundImage: `url(${backgroundUrl})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    />
  );
}

export default AndroidBackground;
