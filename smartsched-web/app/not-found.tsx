import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <section className="flex min-h-[60vh] items-center justify-center px-4 py-20">
      <div className="text-center">
        <p className="text-sm font-semibold text-primary">404</p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          Page not found
        </h1>
        <p className="mx-auto mt-4 max-w-md text-muted-foreground">
          The page you’re looking for doesn’t exist or has moved.
        </p>
        <Link href="/" className={cn(buttonVariants(), "mt-8")}>
          Back to home
        </Link>
      </div>
    </section>
  );
}
