import { useListReleases, useListWines } from "@workspace/api-client-react";
import { WineTable } from "@/components/WineTable";
import { PageHeader } from "@/components/PageHeader";
import { useState, useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/AuthContext";
import { Lock, Search } from "lucide-react";
import { Link } from "wouter";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getProgramTypeLabel(programType: string): string {
  if (programType === "special_offers") return "Special Offers";
  if (programType === "monthly_collection") return "Monthly Collection";
  if (programType === "bordeaux_futures") return "Bordeaux Futures";
  return programType;
}

function getReleaseYear(release: { scraped_at?: string; closing_date?: string | null }): string {
  if (release.scraped_at) {
    const y = new Date(release.scraped_at).getFullYear();
    if (!isNaN(y) && y > 2000) return String(y);
  }
  if (release.closing_date) {
    const m = release.closing_date.match(/\b(20\d{2})\b/);
    if (m) return m[1];
  }
  return "Unknown";
}

const PAGE_SIZE = 50;

// ─── Component ────────────────────────────────────────────────────────────────

export default function History() {
  const { profile } = useAuth();
  const { data: releases, isLoading: releasesLoading } = useListReleases();

  const [selectedYear, setSelectedYear] = useState<string>("");
  const [selectedProgramType, setSelectedProgramType] = useState<string>("");
  const [selectedReleaseId, setSelectedReleaseId] = useState<number | "all">("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // Always fetch all wines for archive (Pro only, so dataset is reasonable)
  const { data: wines, isLoading: winesLoading } = useListWines(
    selectedReleaseId !== "all" ? { release_cycle_id: selectedReleaseId } : undefined,
  );

  // ── Pro gate ────────────────────────────────────────────────────────────────
  if (!profile?.is_pro) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center">
        <div className="max-w-md space-y-6 bg-card p-12 border border-border">
          <Lock className="w-12 h-12 text-primary mx-auto opacity-50" />
          <h1 className="font-serif text-3xl text-foreground">Archive Locked</h1>
          <p className="text-muted-foreground">
            Historical release data and advanced filtering are reserved for Pro members.
          </p>
          <Link
            href="/pricing"
            className="block w-full bg-primary text-primary-foreground py-3 font-bold tracking-widest uppercase hover:bg-primary/90 transition-colors"
          >
            Upgrade to Pro
          </Link>
        </div>
      </div>
    );
  }

  // ── Derived filter options ───────────────────────────────────────────────────

  const releaseMap = useMemo(() => {
    const m = new Map<number, NonNullable<typeof releases>[number]>();
    releases?.forEach((r) => m.set(r.id, r));
    return m;
  }, [releases]);

  const years = useMemo(() => {
    if (!releases) return [];
    const ys = new Set(
      releases.map((r) => getReleaseYear(r as any)),
    );
    return [...ys].filter((y) => y !== "Unknown").sort((a, b) => b.localeCompare(a));
  }, [releases]);

  const programTypes = useMemo(() => {
    if (!releases) return [];
    const scoped = selectedYear
      ? releases.filter((r) => getReleaseYear(r as any) === selectedYear)
      : releases;
    const types = new Set(scoped.map((r) => getProgramTypeLabel((r as any).program_type ?? "")));
    return [...types].sort();
  }, [releases, selectedYear]);

  const drops = useMemo(() => {
    if (!releases) return [];
    return releases.filter((r) => {
      if (selectedYear && getReleaseYear(r as any) !== selectedYear) return false;
      if (selectedProgramType && getProgramTypeLabel((r as any).program_type ?? "") !== selectedProgramType) return false;
      return true;
    });
  }, [releases, selectedYear, selectedProgramType]);

  // ── Filtered wines ──────────────────────────────────────────────────────────

  const filteredWines = useMemo(() => {
    if (!wines) return [];
    let result = wines as unknown as Array<{
      id: number;
      release_cycle_id: number;
      wine_name: string;
      producer: string | null;
      region: string | null;
      [key: string]: any;
    }>;

    // Year / program-type filtering (only needed when no specific release is selected)
    if (selectedReleaseId === "all" && (selectedYear || selectedProgramType)) {
      result = result.filter((w) => {
        const r = releaseMap.get(w.release_cycle_id) as any;
        if (!r) return false;
        if (selectedYear && getReleaseYear(r) !== selectedYear) return false;
        if (selectedProgramType && getProgramTypeLabel(r.program_type ?? "") !== selectedProgramType)
          return false;
        return true;
      });
    }

    // Search filter
    if (search.trim()) {
      const s = search.toLowerCase();
      result = result.filter(
        (w) =>
          w.wine_name.toLowerCase().includes(s) ||
          w.producer?.toLowerCase().includes(s) ||
          w.region?.toLowerCase().includes(s),
      );
    }

    return result;
  }, [wines, selectedReleaseId, selectedYear, selectedProgramType, search, releaseMap]);

  const totalPages = Math.max(1, Math.ceil(filteredWines.length / PAGE_SIZE));
  const paginatedWines = filteredWines.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleYearChange = (v: string) => {
    setSelectedYear(v === "all" ? "" : v);
    setSelectedProgramType("");
    setSelectedReleaseId("all");
    setPage(1);
  };

  const handleTypeChange = (v: string) => {
    setSelectedProgramType(v === "all" ? "" : v);
    setSelectedReleaseId("all");
    setPage(1);
  };

  const handleDropChange = (v: string) => {
    setSelectedReleaseId(v === "all" ? "all" : parseInt(v));
    setPage(1);
  };

  const handleSearch = (v: string) => {
    setSearch(v);
    setPage(1);
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="The Archive" subtitle="Search the complete historical database." />
      <div className="max-w-7xl mx-auto px-6 py-10 space-y-10">

        {/* Search */}
        <div className="relative max-w-lg">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search wines, producers, regions..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-10 bg-card border-border rounded-none"
          />
        </div>

        {/* Cascading filters */}
        <div className="flex flex-wrap gap-4 items-end">
          {/* 1. Year */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-widest">Year</p>
            <Select value={selectedYear || "all"} onValueChange={handleYearChange}>
              <SelectTrigger className="w-36 rounded-none border-border bg-card">
                <SelectValue placeholder="All Years" />
              </SelectTrigger>
              <SelectContent className="rounded-none border-border">
                <SelectItem value="all">All Years</SelectItem>
                {years.map((y) => (
                  <SelectItem key={y} value={y}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 2. Program type (cascades from year) */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-widest">Program</p>
            <Select value={selectedProgramType || "all"} onValueChange={handleTypeChange}>
              <SelectTrigger className="w-52 rounded-none border-border bg-card">
                <SelectValue placeholder="All Programs" />
              </SelectTrigger>
              <SelectContent className="rounded-none border-border">
                <SelectItem value="all">All Programs</SelectItem>
                {programTypes.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 3. Specific drop (cascades from year + type) */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-widest">Drop</p>
            <Select value={selectedReleaseId.toString()} onValueChange={handleDropChange}>
              <SelectTrigger className="w-72 rounded-none border-border bg-card">
                <SelectValue placeholder="All Drops" />
              </SelectTrigger>
              <SelectContent className="rounded-none border-border">
                <SelectItem value="all">All Drops</SelectItem>
                {drops.map((r) => (
                  <SelectItem key={r.id} value={r.id.toString()}>
                    {r.program_label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Clear filters */}
          {(selectedYear || selectedProgramType || selectedReleaseId !== "all" || search) && (
            <Button
              variant="ghost"
              className="text-xs tracking-widest uppercase text-muted-foreground hover:text-foreground"
              onClick={() => {
                setSelectedYear("");
                setSelectedProgramType("");
                setSelectedReleaseId("all");
                setSearch("");
                setPage(1);
              }}
            >
              Clear filters
            </Button>
          )}
        </div>

        {/* Results */}
        {winesLoading || releasesLoading ? (
          <div className="h-64 flex items-center justify-center border border-border">
            <span className="font-serif italic text-xl text-muted-foreground">Accessing archives...</span>
          </div>
        ) : filteredWines.length === 0 ? (
          <div className="py-16 text-center border border-border text-muted-foreground">
            {search
              ? `No wines match "${search}".`
              : "No releases found for the selected filters."}
          </div>
        ) : (
          <>
            <div className="text-sm text-muted-foreground">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredWines.length)} of{" "}
              {filteredWines.length} wine{filteredWines.length !== 1 ? "s" : ""}
            </div>

            <WineTable
              wines={paginatedWines as any}
              showReleaseLabel={selectedReleaseId === "all"}
              showWatchButton
            />

            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-6 border-t border-border">
                <Button
                  variant="outline"
                  className="rounded-none font-bold tracking-widest uppercase border-border"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  className="rounded-none font-bold tracking-widest uppercase border-border"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
