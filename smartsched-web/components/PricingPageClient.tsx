"use client";

import { useState } from "react";
import { Check, Minus } from "lucide-react";
import { PricingCards } from "@/components/PricingCards";
import { cn } from "@/lib/utils";

type Billing = "monthly" | "annual";

interface ComparisonRow {
  label: string;
  values: [string | boolean, string | boolean, string | boolean]; // Starter, Pro, Enterprise
}

const comparison: { group: string; rows: ComparisonRow[] }[] = [
  {
    group: "Scheduling",
    rows: [
      { label: "Classes", values: ["2", "Unlimited", "Unlimited"] },
      { label: "Subjects", values: ["20", "Unlimited", "Unlimited"] },
      { label: "AI auto-schedule", values: [true, true, true] },
      { label: "Real-time conflict detection", values: [true, true, true] },
      { label: "Elective OR/AND groups", values: [false, true, true] },
      { label: "Multi-stream support", values: [false, true, true] },
      { label: "Room & resource planning", values: [false, true, true] },
    ],
  },
  {
    group: "Collaboration & export",
    rows: [
      { label: "PDF export", values: [true, true, true] },
      { label: "Multi-campus management", values: [false, false, true] },
      { label: "API access", values: [false, false, true] },
      { label: "SSO / SAML", values: [false, false, true] },
    ],
  },
  {
    group: "Support",
    rows: [
      { label: "Community support", values: [true, true, true] },
      { label: "Priority support", values: [false, true, true] },
      { label: "Dedicated success manager", values: [false, false, true] },
    ],
  },
];

function Cell({ value }: { value: string | boolean }) {
  if (typeof value === "boolean") {
    return value ? (
      <Check className="mx-auto size-5 text-primary" aria-label="Included" />
    ) : (
      <Minus
        className="mx-auto size-5 text-muted-foreground"
        aria-label="Not included"
      />
    );
  }
  return <span className="text-sm font-medium text-foreground">{value}</span>;
}

export function PricingPageClient() {
  const [billing, setBilling] = useState<Billing>("monthly");

  return (
    <div>
      {/* Toggle */}
      <div className="flex items-center justify-center gap-4">
        <span
          className={cn(
            "text-sm font-medium",
            billing === "monthly" ? "text-foreground" : "text-muted-foreground",
          )}
        >
          Monthly
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={billing === "annual"}
          aria-label="Toggle annual billing"
          onClick={() =>
            setBilling((b) => (b === "monthly" ? "annual" : "monthly"))
          }
          className={cn(
            "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
            billing === "annual" ? "bg-primary" : "bg-border",
          )}
        >
          <span
            className={cn(
              "inline-block size-5 transform rounded-full bg-white shadow transition-transform",
              billing === "annual" ? "translate-x-5" : "translate-x-0.5",
            )}
          />
        </button>
        <span
          className={cn(
            "text-sm font-medium",
            billing === "annual" ? "text-foreground" : "text-muted-foreground",
          )}
        >
          Annual
        </span>
        <span className="inline-flex items-center rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-accent-foreground">
          Save 20%
        </span>
      </div>

      <div className="mt-12">
        <PricingCards billing={billing} />
      </div>

      {/* Comparison table */}
      <div className="mt-24">
        <h2 className="text-center text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Compare every plan
        </h2>
        <div className="mt-10 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="border-b border-border">
                <th className="py-4 pr-4 text-sm font-semibold text-foreground">
                  Features
                </th>
                <th className="px-4 py-4 text-center text-sm font-semibold text-foreground">
                  Starter
                </th>
                <th className="px-4 py-4 text-center text-sm font-semibold text-foreground">
                  Pro
                </th>
                <th className="px-4 py-4 text-center text-sm font-semibold text-foreground">
                  Enterprise
                </th>
              </tr>
            </thead>
            <tbody>
              {comparison.map((section) => (
                <FragmentRows key={section.group} group={section.group} rows={section.rows} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function FragmentRows({ group, rows }: { group: string; rows: ComparisonRow[] }) {
  return (
    <>
      <tr className="bg-muted/50">
        <td
          colSpan={4}
          className="py-3 pr-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
          {group}
        </td>
      </tr>
      {rows.map((row) => (
        <tr key={row.label} className="border-b border-border">
          <td className="py-4 pr-4 text-sm text-foreground">{row.label}</td>
          {row.values.map((value, i) => (
            <td key={i} className="px-4 py-4 text-center">
              <Cell value={value} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
