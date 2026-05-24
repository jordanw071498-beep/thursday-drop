import { useQuery } from "@tanstack/react-query";
import { WineTable } from "@/components/WineTable";
import { Input } from "@/components/ui/input";
import { useState, useMemo } from "react";
import { Search } from "lucide-react";

interface Wine {
  id: number;
  release_cycle_id: number;
  wine_name: string;
  producer: string | null;
  lcbo_number: string | null;
  region: string | null;
  region_category: string | null;
  vintage: string | null;
  score: number | null;
  score_source: string | null;
  price: number | null;
  sold_out: boolean;
  buy_url: string | null;
  closing_date: string | null;
}

interface ReleaseCycle {
  id: number;
  program_id: string;
  program_label: string;
  program_type: string;
  closing_date: string | null;
  wine_count: number;
  scraped_at: string;
}

interface ProgramWithWines {
  release: ReleaseCycle;
  wines: Wine[];
}

interface ActiveReleasesResponse {
  programs: ProgramWithWines[];
}

const TYPE_ORDER: Record<string, number> = {
  special_offer: 0,
  classics_collection: 1,
  bordeaux_futures: 2,
};

const TYPE_LABEL: Record<string, string> = {
  special_offer: "Special Offers",
  classics_collection: "Monthly Cellar Features",
  bordeaux_futures: "Bordeaux Futures",
};

async function fetchActiveReleases(): Promise<ActiveReleasesResponse> {
  const res = await fetch("/api/releases/active");
  if (!res.ok) throw new Error("Failed to fetch active releases");
  return res.json();
}

export default function Release() {
  const { data, isLoading } = useQuery({
    queryKey: ["releases", "active"],
    queryFn: fetchActiveReleases,
  });

  const [search, setSearch] = useState("");

  const sortedGroups = useMemo(() => {
    if (!data?.programs) return [];

    const grouped: Record<string, ProgramWithWines[]> = {};
    for (const p of data.programs) {
      const type = p.release.program_type ?? "other";
      if (!grouped[type]) grouped[type] = [];
      grouped[type].push(p);
    }

    return Object.entries(grouped).sort(([a], [b]) => {
      const oa = TYPE_ORDER[a] ?? 99;
      const ob = TYPE_ORDER[b] ?? 99;
      return oa - ob;
    });
  }, [data?.programs]);

  const totalWines = useMemo(
    () => (data?.programs ?? []).reduce((sum, p) => sum + p.wines.length, 0),
    [data?.programs],
  );

  const s = search.toLowerCase();

  function filterWines(wines: Wine[]) {
    if (!search) return wines;
    return wines.filter(
      (w) =>
        w.wine_name.toLowerCase().includes(s) ||
        w.producer?.toLowerCase().includes(s) ||
        w.region?.toLowerCase().includes(s),
    );
  }

  return (
    <div className="min-h-screen bg-background px-6 py-12">
      <div className="max-w-7xl mx-auto space-y-12">
        <header className="border-b border-border pb-8">
          <h1 className="font-serif text-5xl text-primary mb-4">Current Release</h1>
          {isLoading ? (
            <p className="text-muted-foreground text-lg">Fetching release data...</p>
          ) : (
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div>
                <p className="text-muted-foreground">
                  {totalWines} wines across {data?.programs?.length ?? 0} active programs
                </p>
              </div>
              <div className="relative w-full md:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search wines, producers, regions..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10 bg-card border-border rounded-none h-10"
                />
              </div>
            </div>
          )}
        </header>

        {isLoading ? (
          <div className="h-64 flex items-center justify-center border border-border">
            <span className="font-serif italic text-xl text-muted-foreground">Decanting data...</span>
          </div>
        ) : !data?.programs?.length ? (
          <div className="p-12 text-center border border-border text-muted-foreground">
            No active releases at this time. Check back on Thursday.
          </div>
        ) : (
          <div className="space-y-16">
            {sortedGroups.map(([type, programs]) => (
              <section key={type}>
                <h2 className="font-serif text-3xl text-primary border-b border-border pb-4 mb-8">
                  {TYPE_LABEL[type] ?? type}
                </h2>
                <div className="space-y-12">
                  {programs.map((program) => {
                    const filtered = filterWines(program.wines);
                    if (search && filtered.length === 0) return null;
                    return (
                      <div key={program.release.id}>
                        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 mb-4">
                          <h3 className="text-xl font-medium tracking-wide text-foreground">
                            {program.release.program_label}
                          </h3>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span>{filtered.length} wine{filtered.length !== 1 ? "s" : ""}</span>
                            {program.release.closing_date && (
                              <span className="border-l border-border pl-4">
                                Closes {program.release.closing_date}
                              </span>
                            )}
                          </div>
                        </div>
                        <WineTable wines={filtered} showWatchButton />
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
