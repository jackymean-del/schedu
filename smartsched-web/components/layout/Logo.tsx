import { cn } from "@/lib/utils";

/**
 * schedU brand lockup — violet rounded-square mark with a white "U" glyph and a
 * gold accent dot, beside the "sched" + italic-violet "U" wordmark.
 * Mirrors the product landing page (frontend/src/pages/home.tsx).
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-[9px] bg-primary"
        aria-hidden="true"
      >
        <svg width="17" height="17" viewBox="0 0 52 52" fill="none">
          <rect x="12" y="9" width="8" height="33" rx="4" fill="white" />
          <path
            d="M 20 22 C 23 14 40 15 40 30 C 40 45 23 46 20 42"
            stroke="white"
            strokeWidth="8"
            fill="none"
            strokeLinecap="round"
          />
          <circle cx="39" cy="10" r="4.5" fill="#D4920E" />
        </svg>
      </span>
      <span className="text-lg font-extrabold tracking-tight text-foreground">
        sched
        <span className="italic text-primary">U</span>
      </span>
    </span>
  );
}
