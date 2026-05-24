import { useQuery } from "@tanstack/react-query";
import { WineTable } from "@/components/WineTable";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { useState, useMemo } from "react";
import { Search, ExternalLink } from "lucide-react";

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

const TABS = [
  {
    id: "special_offers",
    label: "Special Offers",
    types: new Set(["special_offer", "vintages"]),
  },
  {
    id: "monthly_collection",
    label: "Monthly Collection",
    types: new Set(["classics_collection"]),
  },
  {
    id: "bordeaux_futures",
    label: "Bordeaux Futures",
    types: new Set(["bordeaux_futures"]),
  },
] as const;

async function fetchActiveReleases(): Promise<ActiveReleasesResponse> {
  const res = await fetch("/api/releases/active");
  if (!res.ok) throw new Error("Failed to fetch active releases");
  return res.json();
}

function ProgramSection({ program, search }: { program: ProgramWithWines; search: string }) {
  const filtered = useMemo(() => {
    if (!search) return program.wines;
    const s = search.toLowerCase();
    return program.wines.filter(
      (w) =>
        w.wine_name.toLowerCase().includes(s) ||
        w.producer?.toLowerCase().includes(s) ||
        w.region?.toLowerCase().includes(s),
    );
  }, [program.wines, search]);

  if (search && filtered.length === 0) return null;

  const lcboUrl = program.wines[0]?.buy_url ?? `https://www.vintagesshoponline.com/vintages/Public/OrderProgramProducts.aspx?programId=${program.release.program_id}&lang=en`;

  return (
    <AccordionItem value={String(program.release.id)} className="border-border">
      <AccordionTrigger className="hover:no-underline px-0 py-5 group">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full text-left pr-4">
          <span className="font-serif text-xl text-foreground group-hover:text-primary transition-colors flex-1">
            {program.release.program_label}
          </span>
          <div className="flex items-center gap-4 shrink-0">
            <span className="text-sm text-muted-foreground">
              {program.wines.length} wine{program.wines.length !== 1 ? "s" : ""}
            </span>
            {program.release.closing_date && (
              <span className="text-xs text-muted-foreground border border-border px-2 py-0.5">
                Closes: {program.release.closing_date}
              </span>
            )}
            <a
              href={lcboUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1.5 text-xs tracking-widest uppercase text-primary border border-primary px-3 py-1.5 hover:bg-primary hover:text-primary-foreground transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              LCBO Vintages
            </a>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="pb-6">
        {search && (
          <p className="text-sm text-muted-foreground mb-4">
            {filtered.length} of {program.wines.length} wine{program.wines.length !== 1 ? "s" : ""} match your search
          </p>
        )}
        <WineTable wines={filtered} showWatchButton />
      </AccordionContent>
    </AccordionItem>
  );
}

function TabPane({
  programs,
  search,
}: {
  programs: ProgramWithWines[];
  search: string;
}) {
  const [openItem, setOpenItem] = useState<string>(
    programs[0] ? String(programs[0].release.id) : "",
  );

  if (programs.length === 0) {
    return (
      <div className="py-16 text-center border border-border text-muted-foreground">
        No active programs in this category.
      </div>
    );
  }

  return (
    <Accordion
      type="single"
      collapsible
      value={openItem}
      onValueChange={(v) => setOpenItem(v)}
      className="divide-y divide-border"
    >
      {programs.map((program) => (
        <ProgramSection key={program.release.id} program={program} search={search} />
      ))}
    </Accordion>
  );
}

export default function Release() {
  const { data, isLoading } = useQuery({
    queryKey: ["releases", "active"],
    queryFn: fetchActiveReleases,
  });

  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("special_offers");

  const groupedByTab = useMemo(() => {
    if (!data?.programs) return {} as Record<string, ProgramWithWines[]>;
    const result: Record<string, ProgramWithWines[]> = {};
    for (const tab of TABS) {
      result[tab.id] = data.programs.filter((p) => tab.types.has(p.release.program_type as any));
    }
    return result;
  }, [data?.programs]);

  const totalWines = useMemo(
    () => (data?.programs ?? []).reduce((sum, p) => sum + p.wines.length, 0),
    [data?.programs],
  );

  const currentTabCount = useMemo(() => {
    const progs = groupedByTab[activeTab] ?? [];
    return progs.reduce((sum, p) => sum + p.wines.length, 0);
  }, [groupedByTab, activeTab]);

  return (
    <div className="min-h-screen bg-background">
      {/* Page header */}
      <div className="border-b border-border bg-background/95 sticky top-20 z-30 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="font-serif text-4xl text-primary">Current Release</h1>
              {!isLoading && (
                <p className="text-sm text-muted-foreground mt-1">
                  {totalWines} wines · {data?.programs?.length ?? 0} active programs
                </p>
              )}
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search wines, producers, regions..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 bg-card border-border rounded-none h-10"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {isLoading ? (
          <div className="h-64 flex items-center justify-center border border-border">
            <span className="font-serif italic text-xl text-muted-foreground">Decanting data...</span>
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setSearch(""); }}>
            {/* Tab bar */}
            <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent p-0 mb-8 h-auto gap-0">
              {TABS.map((tab) => {
                const count = (groupedByTab[tab.id] ?? []).reduce((s, p) => s + p.wines.length, 0);
                return (
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent bg-transparent px-6 py-4 text-sm tracking-widest uppercase font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {tab.label}
                    {count > 0 && (
                      <span className="ml-2 text-xs opacity-60">{count}</span>
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {TABS.map((tab) => (
              <TabsContent key={tab.id} value={tab.id} className="mt-0 focus-visible:outline-none">
                {search && (
                  <p className="text-sm text-muted-foreground mb-6">
                    Searching {currentTabCount} wines in {tab.label}
                  </p>
                )}
                <TabPane programs={groupedByTab[tab.id] ?? []} search={search} />
              </TabsContent>
            ))}
          </Tabs>
        )}
      </div>
    </div>
  );
}
