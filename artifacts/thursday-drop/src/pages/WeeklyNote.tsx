import { useAuth } from "@/lib/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import ReactMarkdown from "react-markdown";
import { Clock, ArrowLeft } from "lucide-react";

interface FeaturedWine {
  name: string;
  vintage?: string;
  score?: string;
  score_source?: string;
  price?: string;
  lcbo_number?: string;
  note?: string;
}

interface ReleaseNote {
  id: number;
  slug: string;
  title: string;
  body: string;
  excerpt: string | null;
  hero_image_url: string | null;
  author: string;
  article_type: string;
  status: string;
  published_at: string | null;
  reading_time_minutes: number | null;
  view_count: number;
  featured_wines: FeaturedWine[];
  created_at: string;
  updated_at: string;
}

export default function WeeklyNote() {
  const { token } = useAuth();
  const [, params] = useRoute("/weekly/:slug");
  const slug = params?.slug ?? "";

  const { data, isLoading, error } = useQuery<{ note: ReleaseNote }>({
    queryKey: ["release-note", slug, token],
    queryFn: async () => {
      const res = await fetch(`/api/release-notes/${slug}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    enabled: !!token && !!slug,
    staleTime: 5 * 60_000,
  });

  const note = data?.note;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background px-6 py-10">
        <div className="max-w-3xl mx-auto">
          <div className="text-muted-foreground text-sm animate-pulse">Loading…</div>
        </div>
      </div>
    );
  }

  if (error || !note) {
    return (
      <div className="min-h-screen bg-background px-6 py-10">
        <div className="max-w-3xl mx-auto space-y-6">
          <Link
            href="/weekly"
            className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.15em] text-muted-foreground hover:text-primary transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Weekly Notes
          </Link>
          <div className="border border-border p-12 text-center text-muted-foreground">
            Article not found.
          </div>
        </div>
      </div>
    );
  }

  const hasFeaturedWines = Array.isArray(note.featured_wines) && note.featured_wines.length > 0;

  return (
    <div className="min-h-screen bg-background px-6 py-10">
      <div className="max-w-3xl mx-auto space-y-10">

        <Link
          href="/weekly"
          className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.15em] text-muted-foreground hover:text-primary transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Weekly Notes
        </Link>

        {note.hero_image_url && (
          <img
            src={note.hero_image_url}
            alt={note.title}
            className="w-full aspect-[21/9] object-cover"
          />
        )}

        <header className="space-y-4 border-b border-border pb-8">
          <div className="flex items-center gap-3 text-xs uppercase tracking-[0.15em] text-muted-foreground flex-wrap">
            {note.published_at && (
              <span>
                {new Date(note.published_at).toLocaleDateString("en-CA", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </span>
            )}
            {note.reading_time_minutes && (
              <>
                <span className="w-px h-3 bg-border/60" />
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {note.reading_time_minutes} min read
                </span>
              </>
            )}
          </div>
          <h1 className="font-serif text-4xl md:text-5xl text-primary leading-tight">
            {note.title}
          </h1>
          {note.excerpt && (
            <p className="text-muted-foreground text-lg leading-relaxed">{note.excerpt}</p>
          )}
          <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">{note.author}</p>
        </header>

        <div className="prose prose-invert prose-sm max-w-none prose-headings:font-serif prose-headings:font-normal prose-headings:text-foreground prose-a:text-primary prose-strong:text-foreground prose-p:text-muted-foreground prose-li:text-muted-foreground">
          <ReactMarkdown>{note.body}</ReactMarkdown>
        </div>

        {hasFeaturedWines && (
          <section className="space-y-5 border-t border-border pt-10">
            <h2 className="font-serif text-2xl text-foreground">Featured in this drop</h2>
            <div className="space-y-0 divide-y divide-border border-y border-border">
              {note.featured_wines.map((wine, i) => (
                <div key={i} className="py-5 space-y-1.5">
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <span className="font-medium text-foreground">
                      {wine.name}
                      {wine.vintage && (
                        <span className="ml-2 text-primary font-mono text-sm font-semibold">
                          {wine.vintage}
                        </span>
                      )}
                    </span>
                    {wine.score && (
                      <span className="font-mono text-xs font-bold text-foreground">
                        {wine.score}
                        {wine.score_source && (
                          <span className="text-muted-foreground font-normal ml-1">
                            {wine.score_source}
                          </span>
                        )}
                      </span>
                    )}
                    {wine.price && (
                      <span className="font-mono text-xs text-muted-foreground">
                        ${wine.price}
                      </span>
                    )}
                    {wine.lcbo_number && (
                      <span className="text-xs text-muted-foreground">
                        #{wine.lcbo_number}
                      </span>
                    )}
                  </div>
                  {wine.note && (
                    <p className="text-sm text-muted-foreground leading-relaxed">{wine.note}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="border-t border-border pt-8">
          <Link
            href="/weekly"
            className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.15em] text-muted-foreground hover:text-primary transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            All articles
          </Link>
        </div>

      </div>
    </div>
  );
}
