"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Shared lazy-render gate for the marketing animations — an animation only
 * plays once its wrapper scrolls into view, and pauses again once it scrolls
 * out (animation-play-state), so below-the-fold loops never burn cycles.
 */
export function useInView<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.2 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, inView };
}
