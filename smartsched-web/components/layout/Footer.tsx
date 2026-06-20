import Link from "next/link";
import { Logo } from "./Logo";
import { APP_URL, REGISTER_URL, LOGIN_URL } from "@/lib/site";

const columns: { heading: string; links: { label: string; href: string }[] }[] =
  [
    {
      heading: "Product",
      links: [
        { label: "Features", href: "/features" },
        { label: "Pricing", href: "/pricing" },
        { label: "Sign in", href: LOGIN_URL },
        { label: "Start free trial", href: REGISTER_URL },
      ],
    },
    {
      heading: "Company",
      links: [
        { label: "About", href: "/#how-it-works" },
        { label: "Blog", href: "/blog" },
        { label: "Careers", href: "/blog" },
        { label: "Contact", href: "mailto:hello@bhusku.com" },
      ],
    },
    {
      heading: "Resources",
      links: [
        { label: "Documentation", href: `${APP_URL}/docs` },
        { label: "Help center", href: `${APP_URL}/help` },
        { label: "How it works", href: "/#how-it-works" },
        { label: "Blog", href: "/blog" },
      ],
    },
    {
      heading: "Legal",
      links: [
        { label: "Privacy", href: "/privacy" },
        { label: "Terms", href: "/terms" },
        { label: "Security", href: "/security" },
        { label: "Data processing", href: "/dpa" },
      ],
    },
  ];

export function Footer() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-5">
          <div className="col-span-2 md:col-span-1">
            <Logo />
            <p className="mt-4 max-w-xs text-sm text-muted-foreground">
              AI-powered timetable scheduling for every institution.
            </p>
          </div>

          {columns.map((col) => (
            <div key={col.heading}>
              <h2 className="text-sm font-semibold text-foreground">
                {col.heading}
              </h2>
              <ul className="mt-4 space-y-3">
                {col.links.map((link) => (
                  <li key={`${col.heading}-${link.label}`}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 border-t border-border pt-8">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} schedU. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
