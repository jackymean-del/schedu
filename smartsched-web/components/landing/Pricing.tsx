import Link from "next/link";
import { PricingCards } from "@/components/PricingCards";

export function Pricing() {
  return (
    <section id="pricing" className="border-y border-border bg-muted py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Simple pricing that scales with you
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Start free, upgrade when your institution grows. No hidden fees.
          </p>
        </div>

        <div className="mt-16">
          <PricingCards billing="monthly" />
        </div>

        <p className="mt-10 text-center text-sm text-muted-foreground">
          Need a full feature comparison?{" "}
          <Link href="/pricing" className="font-medium text-primary hover:underline">
            See detailed pricing →
          </Link>
        </p>
      </div>
    </section>
  );
}
