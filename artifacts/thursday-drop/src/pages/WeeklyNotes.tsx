import { useAuth } from "@/lib/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { BookOpen, Clock } from "lucide-react";

interface NoteListItem {
  id: number;
  slug: string;
  title: string;
  excerpt: string | null;
  hero_image_url: string | null;
  author: string;
  article_type: string;
  status: string;
  published_at: string | null;
  reading_time_minutes: number | null;
  view_count: number;
  created_at: string;
}

export default function WeeklyNotes() {
  const { token } = useAuth();

  const { data, isLoading, error } = useQuery<{ notes: NoteListItem[] }>({
    queryKey: ["release-notes", token],
    queryFn: async () => {
      const res = await fetch("/api/release-notes", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    enabled: !!token,
    staleTime: 60_000,
  });

  const notes = data?.notes ?? [];

  return (
    <div className="min-h-screen bg-background px-6 py-16">
      <div className="max-w-3xl mx-auto space-y-12">
        <header>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">Thursday Drop</p>
          <h1 className="font-serif text-5xl text-primary mb-4">Weekly Notes</h1>
          <p className="text-muted-foreground text-lg">
            Curation notes, producer spotlights, and what we're watching in each Vintages drop.
          </p>
        </header>

        {isLoading && (
          <div className="text-muted-foreground text-sm animate-pulse">Loading articles…</div>
        )}

        {!isLoading && !error && notes.length === 0 && (
          <div className="border border-border p-12 text-center">
            <BookOpen className="h-8 w-8 mx-auto mb-4 text-muted-foreground opacity-40" />
            <p className="text-muted-foreground">No articles published yet. Check back after the next drop.</p>
          </div>
        )}

        {notes.length > 0 && (
          <div className="space-y-0 divide-y divide-border border-y border-border">
            {notes.map((note) => (
              <Link
                key={note.id}
                href={`/weekly/${note.slug}`}
                className="block group py-8 px-1 hover:bg-card/40 transition-colors"
              >
                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-xs uppercase tracking-[0.15em] text-muted-foreground">
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
                          {note.reading_time_minutes} min
                        </span>
                      </>
                    )}
                  </div>
                  <h2 className="font-serif text-2xl text-foreground group-hover:text-primary transition-colors leading-snug">
                    {note.title}
                  </h2>
                  {note.excerpt && (
                    <p className="text-muted-foreground leading-relaxed line-clamp-3 text-sm">
                      {note.excerpt}
                    </p>
                  )}
                  <p className="text-xs uppercase tracking-[0.15em] text-primary">
                    Read article →
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
