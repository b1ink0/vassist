import { useEffect, useRef } from "react";
import audioVisualizationService from "../../services/audio/AudioVisualizationService";
import { useSpatialHtmlPanelHost } from "../xr/SpatialHtmlPanelContext";
import { AuraRenderer } from "./voice/AuraRenderer";

export function VoiceWaveform({
  state,
  label,
}: {
  state: string;
  label: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  const spatialHost = useSpatialHtmlPanelHost();
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    let renderer: AuraRenderer | null = null;
    let lost = false;
    const initialize = () => {
      renderer?.dispose();
      renderer = null;
      try {
        renderer = new AuraRenderer(canvas);
        container.removeAttribute("data-unavailable");
      } catch {
        // Audio controls remain available when the decorative renderer is unavailable.
        container.dataset.unavailable = "true";
      }
    };
    initialize();
    const onLost = (event: Event) => {
      event.preventDefault();
      lost = true;
    };
    const onRestored = () => {
      lost = false;
      initialize();
    };
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let microphone = 0,
      speech = 0,
      microphoneTime = 0,
      speechTime = 0;
    let level = 0,
      time = 0,
      lastPaint = 0;
    const unsubscribe = audioVisualizationService.subscribe(
      ({ channel, levels }) => {
        const value = Math.max(...levels);
        if (channel === "microphone") {
          microphone = value;
          microphoneTime = performance.now();
        } else {
          speech = value;
          speechTime = performance.now();
        }
      },
    );
    let frame = 0;
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (document.hidden || lost || !renderer || now - lastPaint < 1000 / 30)
        return;
      const elapsed = Math.min((now - lastPaint) / 1000, 0.1);
      lastPaint = now;
      const mic = now - microphoneTime < 200 ? microphone : 0;
      const reply = now - speechTime < 200 ? speech : 0;
      const target =
        1 - Math.exp(-Math.max(0, Math.hypot(mic, reply) - 0.008) * 5);
      // Quick attack and a slower release keep the existing envelope feed fluid.
      level +=
        (target - level) *
        (1 - Math.exp(-elapsed / (target > level ? 0.07 : 0.22)));
      if (!reducedMotion.matches) time += elapsed;
      const thinking = ["thinking", "generating_voice", "processing"].includes(
        stateRef.current,
      );
      const color = getComputedStyle(container)
        .color.match(/[\d.]+/g)
        ?.slice(0, 3)
        .map((value) => Number(value) / 255) ?? [1, 1, 1];
      renderer.draw(time, level, thinking, color);
      spatialHost?.dispatchEvent(new Event("vassist:html-panel-repaint"));
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      unsubscribe();
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      renderer?.dispose();
    };
  }, [spatialHost]);
  return (
    <div
      ref={containerRef}
      className="composer-waveform relative h-9 min-w-0 flex-1 overflow-hidden"
      role="status"
      aria-label={label}
    >
      <canvas
        ref={canvasRef}
        className="block h-full w-full"
        aria-hidden="true"
      />
    </div>
  );
}
