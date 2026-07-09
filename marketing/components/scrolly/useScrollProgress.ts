"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Drives the full-page scrollytelling sequence. Returns a ref to attach to
 * a <section>, plus that section's scroll progress (0 = entering the
 * bottom of the viewport, 1 = exiting the top) written both to state (for
 * phase-based React rendering) and to a `--p` CSS custom property on the
 * element itself (for continuous CSS `calc()`-driven motion) so a beat can
 * use whichever is cheaper for a given effect.
 *
 * This is the IntersectionObserver/scroll-listener fallback described in
 * design/scrollytelling/00-system.md §3 — implemented as the primary path
 * everywhere for now (universal support); `animation-timeline: view()` can
 * be layered in later as a progressive enhancement without changing this
 * hook's contract.
 */
export function useScrollProgress<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [progress, setProgress] = useState(0);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    let last = -1;

    function update() {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      // p=0 when the section's top is at the viewport's bottom edge (just
      // entering), p=1 once it has scrolled one viewport-height further (its
      // top reaches the viewport's top edge). Deliberately independent of
      // the section's own height and of how much page exists after it, so
      // the last beat on the page (with only a short footer following) can
      // still reach p=1 — it doesn't need room to scroll fully out of view.
      const passed = vh - rect.top;
      const p = Math.min(1, Math.max(0, passed / vh));
      if (Math.abs(p - last) > 0.002) {
        last = p;
        el.style.setProperty("--p", p.toFixed(4));
        setProgress(p);
      }
      setInView(rect.top < vh && rect.bottom > 0);
    }

    function onScroll() {
      if (raf) return;
      raf = requestAnimationFrame(() => { update(); raf = 0; });
    }

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return { ref, progress, inView };
}

export function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
