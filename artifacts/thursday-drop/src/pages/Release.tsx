import { useGetLatestRelease } from "@workspace/api-client-react";
import { WineTable } from "@/components/WineTable";
import { Input } from "@/components/ui/input";
import { useState, useMemo } from "react";
import { Search } from "lucide-react";

export default function Release() {
  const { data: latestRelease, isLoading } = useGetLatestRelease();
  const [search, setSearch] = useState("");

  const filteredWines = useMemo(() => {
    if (!latestRelease?.wines) return [];
    if (!search) return latestRelease.wines;
    
    const s = search.toLowerCase();
    return latestRelease.wines.filter(w => 
      w.wine_name.toLowerCase().includes(s) || 
      w.producer?.toLowerCase().includes(s) ||
      w.region?.toLowerCase().includes(s)
    );
  }, [latestRelease?.wines, search]);

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
                <p className="text-xl text-foreground">{latestRelease?.release.program_label}</p>
                <p className="text-muted-foreground">
                  {latestRelease?.release.wine_count || 0} wines available • Closes {latestRelease?.release.closing_date || 'TBD'}
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
        ) : (
          <WineTable wines={filteredWines} showWatchButton />
        )}
      </div>
    </div>
  );
}
