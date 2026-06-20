import { Card, CardContent } from "@/components/ui/card";
import { testimonials } from "@/lib/marketing-data";

export function Testimonials() {
  return (
    <section id="testimonials" className="py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Trusted by institutions that hate scheduling
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Administrators across the world use schedU to reclaim weeks of
            work every term.
          </p>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-3">
          {testimonials.map((t) => (
            <Card key={t.name} className="flex flex-col">
              <CardContent className="flex flex-1 flex-col gap-6 p-6">
                <blockquote className="flex-1 text-base leading-relaxed text-foreground">
                  “{t.quote}”
                </blockquote>
                <figcaption>
                  <div className="font-semibold text-foreground">{t.name}</div>
                  <div className="text-sm text-muted-foreground">{t.role}</div>
                </figcaption>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
