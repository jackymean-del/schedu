import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { getAllPosts } from "@/lib/mdx";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Guides and insights on AI scheduling, elective management, and running timetables for schools, colleges, and universities — from the schedU team.",
  alternates: { canonical: `${SITE_URL}/blog` },
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

export default function BlogIndexPage() {
  const posts = getAllPosts();

  return (
    <section className="py-20 lg:py-28">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            The schedU blog
          </h1>
          <p className="mt-6 text-lg text-muted-foreground">
            Practical advice on scheduling, electives, and getting the most out
            of AI timetabling.
          </p>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-2">
          {posts.map((post) => (
            <Link key={post.slug} href={`/blog/${post.slug}`} className="group">
              <Card className="h-full transition-shadow group-hover:shadow-md">
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <time dateTime={post.date}>
                      {dateFormatter.format(new Date(post.date))}
                    </time>
                    <span aria-hidden="true">·</span>
                    <span>{post.readingTime}</span>
                  </div>
                  <h2 className="mt-3 text-xl font-semibold text-foreground group-hover:text-primary">
                    {post.title}
                  </h2>
                  <p className="mt-2 text-muted-foreground">
                    {post.description}
                  </p>
                  <span className="mt-4 inline-block text-sm font-medium text-primary">
                    Read article →
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
