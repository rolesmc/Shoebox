import { useEffect, useRef } from "react";

/**
 * useWakeLock — Screen Wake Lock hook for UniVault Phase 8.
 *
 * Acquires a screen wake lock while `active` is true, releases it when
 * `active` becomes false or the component unmounts. Automatically
 * re-acquires on visibilitychange → visible (the browser auto-releases
 * the sentinel when the tab is hidden per the Wake Lock spec).
 *
 * Design decisions:
 *   D-07  Active states: only 'copying' | 'mirroring'. Never 'paused'.
 *   D-08  Lives in src/hooks/ — first hook in the UniVault repo.
 *   D-09  Best-effort only. Failures are logged + silently swallowed.
 *         NO fallback (setInterval, fake <video>).
 *
 * Pitfalls honored:
 *   WL-1  sentinel.release() may throw if already released by OS — wrapped
 *         in .catch(() => {}) everywhere.
 *   WL-2  `cancelled` is a local `let` flag (not a ref) so each effect-run
 *         gets its own fresh cancellation scope.
 *   WL-3  The `release` event listener checks identity before nulling the ref
 *         to avoid wiping a freshly re-acquired sentinel.
 *   WL-4  visibilitychange re-acquire calls acquire() (which guards
 *         `sentinelRef.current` for double-acquire safety).
 *   WL-5  Optional chaining `navigator.wakeLock?.request(...)` handles
 *         iOS Safari and other environments where the API is absent.
 *   P8-3  request('screen') is rejected on hidden tabs — acquire() guards
 *         document.visibilityState before calling request().
 *
 * @param {boolean} active - When true, holds a screen sentinel. When false,
 *   any held sentinel is released immediately.
 * @returns {void}
 */
export function useWakeLock(active) {
  const sentinelRef = useRef(null);

  useEffect(() => {
    if (!active) return;

    // WL-2: local flag so each effect-run has its own cancellation scope.
    let cancelled = false;

    const acquire = async () => {
      // Fast-exit paths
      if (cancelled) return;
      // P8-3: browser rejects request('screen') on hidden tabs.
      if (document.visibilityState !== "visible") return;
      // WL-4: already holding a sentinel — do not double-acquire.
      if (sentinelRef.current) return;

      try {
        const sentinel = await navigator.wakeLock?.request('screen');
        if (!sentinel) return; // API unavailable (iOS Safari, older browsers)

        // Post-await cancellation check — component may have unmounted.
        if (cancelled) {
          sentinel.release().catch(() => {}); // WL-1
          return;
        }

        sentinelRef.current = sentinel;

        // WL-3: clear ref only if the released sentinel is the one we stored.
        sentinel.addEventListener("release", () => {
          if (sentinelRef.current === sentinel) {
            sentinelRef.current = null;
          }
        });
      } catch (err) {
        // D-09: swallow all failures — best-effort only.
        console.warn("[useWakeLock] request failed:", err?.name ?? err);
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        // When hidden, the browser auto-releases per spec — do NOT release
        // manually here (would be a no-op on a dead sentinel).
        acquire();
      }
    };

    // Initial acquire + visibility listener.
    acquire();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      sentinel?.release().catch(() => {}); // WL-1
    };
  }, [active]);
}
