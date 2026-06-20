import Link from "next/link";
import { Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { pricingTiers, type PricingTier } from "@/lib/marketing-data";
import { REGISTER_URL } from "@/lib/site";
import { cn } from "@/lib/utils";

function priceDisplay(tier: PricingTier, billing: "monthly" | "annual") {
  if (tier.priceLabel) return { amount: tier.priceLabel, suffix: "" };
  const amount = billing === "annual" ? tier.price.annual : tier.price.monthly;
  return { amount: `$${amount}`, suffix: "/mo" };
}

export function PricingCards({
  billing = "monthly",
}: {
  billing?: "monthly" | "annual";
}) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {pricingTiers.map((tier) => {
        const { amount, suffix } = priceDisplay(tier, billing);
        return (
          <Card
            key={tier.name}
            className={cn(
              "flex flex-col p-8",
              tier.highlighted && "border-primary shadow-md ring-1 ring-primary",
            )}
          >
            {tier.highlighted && (
              <span className="mb-4 inline-flex w-fit items-center rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                Most popular
              </span>
            )}
            <h3 className="text-xl font-semibold text-foreground">{tier.name}</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {tier.description}
            </p>

            <div className="mt-6 flex items-baseline gap-1">
              <span className="font-mono text-4xl font-bold tracking-tight text-foreground">
                {amount}
              </span>
              {suffix && (
                <span className="text-sm text-muted-foreground">{suffix}</span>
              )}
            </div>
            {billing === "annual" && !tier.priceLabel && (
              <p className="mt-1 text-xs text-muted-foreground">
                billed annually
              </p>
            )}

            <Link
              href={REGISTER_URL}
              className={cn(
                buttonVariants({ variant: tier.highlighted ? "primary" : "outline" }),
                "mt-6 w-full",
              )}
              aria-label={`${tier.cta} on the ${tier.name} plan`}
            >
              {tier.cta}
            </Link>

            <ul className="mt-8 space-y-3">
              {tier.features.map((feature) => (
                <li key={feature} className="flex items-start gap-3 text-sm">
                  <Check
                    className="mt-0.5 size-4 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  <span className="text-foreground">{feature}</span>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}
