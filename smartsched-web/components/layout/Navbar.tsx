"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Logo } from "./Logo";
import { buttonVariants } from "@/components/ui/button";
import { navLinks, REGISTER_URL, LOGIN_URL } from "@/lib/site";
import { cn } from "@/lib/utils";

export function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-md">
      <nav
        className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8"
        aria-label="Primary"
      >
        <Link href="/" aria-label="schedU home">
          <Logo />
        </Link>

        {/* Center links — desktop */}
        <ul className="hidden items-center gap-8 md:flex">
          {navLinks.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        {/* Right actions — desktop */}
        <div className="hidden items-center gap-2 md:flex">
          <Link
            href={LOGIN_URL}
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
          >
            Login
          </Link>
          <Link
            href={REGISTER_URL}
            className={cn(buttonVariants({ size: "sm" }))}
            aria-label="Start a free schedU trial"
          >
            Start Free Trial
          </Link>
        </div>

        {/* Mobile toggle */}
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-md p-2 text-foreground md:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="size-6" /> : <Menu className="size-6" />}
        </button>
      </nav>

      {/* Mobile menu */}
      {open && (
        <div className="border-t border-border bg-background md:hidden">
          <ul className="space-y-1 px-4 py-4">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="block rounded-md px-3 py-2 text-base font-medium text-foreground hover:bg-muted"
                  onClick={() => setOpen(false)}
                >
                  {link.label}
                </Link>
              </li>
            ))}
            <li className="flex flex-col gap-2 pt-3">
              <Link
                href={LOGIN_URL}
                className={cn(buttonVariants({ variant: "outline" }))}
                onClick={() => setOpen(false)}
              >
                Login
              </Link>
              <Link
                href={REGISTER_URL}
                className={cn(buttonVariants())}
                onClick={() => setOpen(false)}
              >
                Start Free Trial
              </Link>
            </li>
          </ul>
        </div>
      )}
    </header>
  );
}
