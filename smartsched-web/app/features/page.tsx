import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { features } from "@/lib/marketing-data";
import { REGISTER_URL, SITE_URL } from "@/lib/site";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Features",
  description:
    "Explore every schedU feature — AI auto-scheduling, conflict detection, elective grouping, multi-stream support, room planning, and PDF export for schools, colleges, and universities.",
  alternates: { canonical: `${SITE_URL}/features` },
};

export default function FeaturesPage() {
  return (
    <>
      <section className="border-b border-border bg-gradient-to-b from-muted to-background">
        <div className="mx-auto max-w-7xl px-4 py-20 text-center sm:px-6 lg:px-8 lg:py-28">
          <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Every tool your institution needs to schedule with confidence
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            schedU combines AI generation with the constraints real
            institutions live by — so the timetable you publish is always
            conflict-free.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {features.map((feature, index) => {
          const Icon = feature.icon;
          const reversed = index % 2 === 1;
          return (
            <section
              key={feature.title}
              className="grid grid-cols-1 items-center gap-10 border-b border-border py-16 lg:grid-cols-2 lg:gap-16"
            >
              <div className={cn(reversed && "lg:order-2")}>
                <span className="inline-flex size-12 items-center justify-center rounded-lg bg-accent text-primary">
                  <Icon className="size-6" aria-hidden="true" />
                </span>
                <h2 className="mt-5 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                  {feature.title}
                </h2>
                <p className="mt-4 text-lg text-muted-foreground">
                  {feature.description}
                </p>
              </div>
              <div
                className={cn(
                  "h-64 rounded-xl bg-muted",
                  reversed && "lg:order-1",
                )}
                role="img"
                aria-label={`${feature.title} screenshot preview`}
              />
            </section>
          );
        })}
      </div>

      <section className="py-20 text-center lg:py-28">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            See it on your own institution's data
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Start free and generate your first conflict-free timetable today.
          </p>
          <Link
            href={REGISTER_URL}
            className={cn(buttonVariants({ size: "lg" }), "mt-8")}
            aria-label="Start a free schedU trial"
          >
            Start Free Trial
            <ArrowRight className="size-5" />
          </Link>
        </div>
      </section>
    </>
  );
}
