import { howItWorks } from "@/lib/marketing-data";

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-y border-border bg-muted py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            From data to timetable in three steps
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            No training required. schedU walks you from a blank slate to a
            published schedule.
          </p>
        </div>

        <ol className="mt-16 grid grid-cols-1 gap-8 md:grid-cols-3">
          {howItWorks.map((step) => (
            <li key={step.number} className="relative">
              <span className="flex size-12 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
                {step.number}
              </span>
              <h3 className="mt-5 text-xl font-semibold text-foreground">
                {step.title}
              </h3>
              <p className="mt-2 text-muted-foreground">{step.description}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
