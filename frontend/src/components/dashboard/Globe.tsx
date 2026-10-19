import createGlobe from "cobe";
import { useEffect, useRef } from "react";

export interface GlobeMarker {
  location: [number, number];
  size: number;
}

/** Slowly rotating dotted globe (WebGL via cobe), centred on `focus`.
 * Rotation is purely decorative, so it stops for reduced-motion users. */
export function Globe({ markers, focus, alarm }: { markers: GlobeMarker[]; focus: [number, number]; alarm?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef(markers);
  markersRef.current = markers;

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // cobe's phi is longitude rotation; this offset puts `focus` facing the viewer.
    const basePhi = -((focus[1] * Math.PI) / 180) - Math.PI / 2;
    const theta = (focus[0] * Math.PI) / 180 * 0.6;
    let drift = 0;
    let size = wrap.clientWidth;

    const globe = createGlobe(canvas, {
      devicePixelRatio: 2,
      width: size * 2,
      height: size * 2,
      phi: basePhi,
      theta,
      dark: 1,
      diffuse: 1.6,
      mapSamples: 20000,
      mapBrightness: 7,
      baseColor: [0.16, 0.42, 0.4],
      markerColor: alarm ? [0.95, 0.33, 0.36] : [0.37, 0.92, 0.83],
      glowColor: [0.12, 0.5, 0.45],
      markers: markersRef.current,
      onRender: (state) => {
        if (!still) drift += 0.0016;
        // Sway around the site rather than spinning it off-screen.
        state.phi = basePhi + Math.sin(drift) * 0.35;
        state.markers = markersRef.current;
        state.width = size * 2;
        state.height = size * 2;
      },
    });

    const ro = new ResizeObserver(() => {
      size = wrap.clientWidth;
    });
    ro.observe(wrap);
    requestAnimationFrame(() => (canvas.style.opacity = "1"));

    return () => {
      ro.disconnect();
      globe.destroy();
    };
  }, [focus, alarm]);

  return (
    <div ref={wrapRef} className="relative aspect-square w-full">
      <canvas
        ref={canvasRef}
        className="h-full w-full opacity-0 transition-opacity duration-1000"
        style={{ contain: "layout paint size" }}
      />
    </div>
  );
}
