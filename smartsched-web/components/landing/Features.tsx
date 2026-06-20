import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { features } from "@/lib/marketing-data";

export function Features() {
  return (
    <section id="features" className="py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Everything you need to schedule any institution
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            From AI generation to conflict-free exports, schedU handles the
            hard parts of timetabling — at any institution.
          </p>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <Card key={feature.title} className="transition-shadow hover:shadow-md">
                <CardHeader>
                  <span className="mb-2 inline-flex size-11 items-center justify-center rounded-lg bg-accent text-primary">
                    <Icon className="size-6" aria-hidden="true" />
                  </span>
                  <CardTitle>{feature.title}</CardTitle>
                  <CardDescription>{feature.summary}</CardDescription>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
