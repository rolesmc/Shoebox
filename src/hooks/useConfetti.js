// univault/src/hooks/useConfetti.js
//
// Phase 9 POLISH-02: single-fire confetti wrapper.
//
// Dynamic-imports canvas-confetti on first fire() call so the ~7 KB gzipped
// library stays out of the main initial chunk (Vite code-splits dynamic
// imports automatically; main bundle stays under the 250 KB ceiling).
// Mirrors the existing dynamic-import pattern at BentoDashboard.jsx:468
// (folderMirror.js) and :537 (copyQueue.js).
//
// Accessibility: passes disableForReducedMotion:true so users with
// `prefers-reduced-motion: reduce` see no animation (canvas-confetti
// resolves the promise immediately under that condition).
//
// Cleanup: useEffect return calls confetti.reset?.() on unmount so an
// in-flight burst doesn't persist over a Sign Out screen (Pitfall 5).

import { useCallback, useEffect, useRef } from "react";

export function useConfetti() {
  // Holds the canvas-confetti module after the first dynamic import resolves.
  const moduleRef = useRef(null);

  const fire = useCallback(async () => {
    if (!moduleRef.current) {
      // Vite emits this as a separate chunk; verify via `dist/assets/*.js`
      // listing after `npm run build`.
      moduleRef.current = await import("canvas-confetti");
    }
    const confetti = moduleRef.current.default;
    if (typeof confetti !== "function") return;

    // Emerald + purple palette to match the design tokens. White adds sparkle.
    const baseOpts = {
      particleCount: 80,
      spread: 75,
      startVelocity: 35,
      ticks: 200,
      gravity: 0.9,
      decay: 0.93,
      scalar: 0.95,
      colors: ["#10b981", "#8b5cf6", "#ffffff"],
      disableForReducedMotion: true,
    };

    confetti({ ...baseOpts, origin: { x: 0.3, y: 0.6 } });
    setTimeout(() => {
      confetti({ ...baseOpts, origin: { x: 0.7, y: 0.6 } });
    }, 150);
  }, []);

  // Pitfall 5: stop the animation if the component unmounts mid-burst.
  useEffect(() => {
    return () => {
      moduleRef.current?.default?.reset?.();
    };
  }, []);

  return fire;
}
