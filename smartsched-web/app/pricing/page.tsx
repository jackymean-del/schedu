import type { Metadata } from "next";
import { PricingPageClient } from "@/components/PricingPageClient";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Simple, transparent pricing for schedU. Start free, then scale to unlimited classes, multi-stream electives, and multi-campus management. Save 20% annually.",
  alternates: { canonical: `${SITE_URL}/pricing` },
};

export default function PricingPage() {
  return (
    <section className="py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Pricing that grows with your institution
          </h1>
          <p className="mt-6 text-lg text-muted-foreground">
            Start free on the Starter plan. Upgrade when you need unlimited
            classes, electives, and multi-campus control.
          </p>
        </div>

        <div className="mt-16">
          <PricingPageClient />
        </div>
      </div>
    </section>
  );
}
