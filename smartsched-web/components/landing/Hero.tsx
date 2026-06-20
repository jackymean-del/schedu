import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { REGISTER_URL } from "@/lib/site";
import { cn } from "@/lib/utils";

const proofPoints = [
  "No credit card required",
  "Set up in minutes",
  "Conflict-free, guaranteed",
];

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Subtle background accent */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[480px] bg-gradient-to-b from-muted to-background"
      />
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center rounded-full border border-border bg-background px-3 py-1 text-sm font-medium text-accent-foreground">
            AI scheduling for every institution
          </span>
          <h1 className="mt-6 text-4xl font-normal tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            Schedule with schedU,
            <br />
            <span className="italic text-primary">at the speed of light.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
            schedU intelligently allocates resources — slots, courses,
            educators, and locations — and builds conflict-free timetables in
            minutes. Designed for schools, colleges, universities, coaching
            institutes, training centres, and academic organizations of every
            scale. Works with any board, any curriculum, anywhere in the world.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={REGISTER_URL}
              className={cn(buttonVariants({ size: "lg" }))}
              aria-label="Start a free schedU trial"
            >
              Start Free Trial
              <ArrowRight className="size-5" />
            </Link>
            <Link
              href="#how-it-works"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
              aria-label="See how schedU works"
            >
              See How It Works
            </Link>
          </div>

          <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            {proofPoints.map((point) => (
              <li key={point} className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-primary" aria-hidden="true" />
                {point}
              </li>
            ))}
          </ul>
        </div>

        {/* Product preview placeholder — fixed aspect ratio prevents layout shift */}
        <div className="mx-auto mt-16 max-w-5xl">
          <div className="aspect-[16/9] w-full rounded-xl border border-border bg-muted shadow-sm" />
        </div>
      </div>
    </section>
  );
}
