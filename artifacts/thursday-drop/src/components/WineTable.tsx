import { Wine, useGetArchiveHistory } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/lib/AuthContext";
import { useAddToWatchlist } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Plus, Wine as WineIcon, User, Calendar, Clock3 } from "lucide-react";
import { useState } from "react";

interface WineTableProps {
  wines: Wine[];
  showWatchButton?: boolean;
  showReleaseLabel?: boolean;
  showSoldOut?: boolean;
  showHistory?: boolean;
}

export function WineTable({ wines, showWatchButton = false, showReleaseLabel = false, showSoldOut = true, showHistory = false }: WineTableProps) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const addToWatchlist = useAddToWatchlist();
  const [openPopover, setOpenPopover] = useState<number | null>(null);

  function requireAuth(): boolean {
    if (!profile) {
      toast({ title: "Sign in required", description: "Please log in to add wines to your watchlist.", variant: "destructive" });
      return false;
    }
    return true;
  }

  const handleAddExact = (wine: Wine) => {
    if (!requireAuth()) return;
    setOpenPopover(null);
    addToWatchlist.mutate(
      {
        data: {
          wine_name: wine.wine_name,
          vintage: wine.vintage ?? null,
          producer: wine.producer,
          region: wine.region,
          match_type: "exact",
        }
      },
      {
        onSuccess: () => {
          toast({ title: "Tracking — Exact", description: `${wine.wine_name}${wine.vintage ? ` ${wine.vintage}` : ""} only.` });
        },
        onError: (err: any) => {
          const msg = err?.data?.error || "Failed to add to watchlist.";
          toast({ title: "Error", description: msg, variant: "destructive" });
        }
      }
    );
  };

  const handleAddWine = (wine: Wine) => {
    if (!requireAuth()) return;
    setOpenPopover(null);
    addToWatchlist.mutate(
      {
        data: {
          wine_name: wine.wine_name,
          vintage: null,
          producer: wine.producer,
          region: wine.region,
          match_type: "wine",
        }
      },
      {
        onSuccess: () => {
          toast({ title: "Tracking — Any Vintage", description: `Any vintage of ${wine.wine_name}.` });
        },
        onError: (err: any) => {
          const msg = err?.data?.error || "Failed to add to watchlist.";
          toast({ title: "Error", description: msg, variant: "destructive" });
        }
      }
    );
  };

  const handleAddProducer = (wine: Wine) => {
    if (!requireAuth()) return;
    if (!wine.producer) {
      toast({ title: "No producer listed", description: "This wine has no producer to track.", variant: "destructive" });
      return;
    }
    setOpenPopover(null);
    addToWatchlist.mutate(
      {
        data: {
          wine_name: wine.producer,
          producer: wine.producer,
          match_type: "producer",
        }
      },
      {
        onSuccess: () => {
          toast({ title: "Tracking — Producer", description: `Any wine from ${wine.producer}.` });
        },
        onError: (err: any) => {
          const msg = err?.data?.error || "Failed to add to watchlist.";
          toast({ title: "Error", description: msg, variant: "destructive" });
        }
      }
    );
  };

  const getScoreBadgeVariant = (score?: number | null) => {
    if (!score) return "outline";
    if (score >= 90) return "default";
    if (score >= 87) return "secondary";
    return "outline";
  };

  const filteredWines = showSoldOut ? wines : wines.filter(w => !w.sold_out);

  if (filteredWines.length === 0) {
    return <div className="py-12 text-center text-muted-foreground border border-border">No wines found matching your criteria.</div>;
  }

  return (
    <div className="border border-border bg-card">
      <Table>
        <TableHeader className="bg-background">
          <TableRow className="border-border">
            <TableHead className="font-serif text-primary uppercase tracking-widest text-xs">Wine</TableHead>
            <TableHead className="font-serif text-primary uppercase tracking-widest text-xs">Producer</TableHead>
            <TableHead className="font-serif text-primary uppercase tracking-widest text-xs">Region</TableHead>
            <TableHead className="font-serif text-primary uppercase tracking-widest text-xs text-right">Score</TableHead>
            <TableHead className="font-serif text-primary uppercase tracking-widest text-xs text-right">Price</TableHead>
            {showWatchButton && <TableHead className="w-10"></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredWines.map((wine) => (
            <TableRow
              key={wine.id}
              className={`border-border hover:bg-muted/30 transition-colors ${wine.sold_out ? 'opacity-50 grayscale' : ''}`}
            >
              <TableCell className="font-medium">
                <div className="flex flex-col">
                  <span>
                    {wine.wine_name}
                    {wine.vintage && !wine.wine_name.trim().endsWith(wine.vintage.trim()) && (
                      <span className="ml-2 text-primary font-mono text-sm font-semibold">{wine.vintage}</span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    LCBO: {wine.lcbo_number ?? '—'}
                    {showReleaseLabel && wine.release_cycle_id && ` • Release #${wine.release_cycle_id}`}
                  </span>
                  {wine.sold_out && <span className="text-xs text-destructive uppercase tracking-wider mt-1">Sold Out</span>}
                  {wine.bottle_size && wine.bottle_size !== "750 mL" && (
                    <span className="text-xs font-mono text-primary/80 mt-0.5">{wine.bottle_size}</span>
                  )}
                  {showHistory && <WineHistoryBadge wineName={wine.wine_name} bottleSize={wine.bottle_size} />}
                </div>
              </TableCell>
              <TableCell>{wine.producer || '—'}</TableCell>
              <TableCell>{wine.region || '—'}</TableCell>
              <TableCell className="text-right">
                {wine.score ? (
                  <Badge variant={getScoreBadgeVariant(wine.score)} className="rounded-none font-bold">
                    {wine.score}
                  </Badge>
                ) : '—'}
              </TableCell>
              <TableCell className="text-right font-mono">
                {wine.price ? `$${wine.price.toFixed(2)}` : '—'}
              </TableCell>
              {showWatchButton && (
                <TableCell>
                  <Popover open={openPopover === wine.id} onOpenChange={(o) => setOpenPopover(o ? wine.id : null)}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={wine.sold_out || addToWatchlist.isPending}
                        className="h-8 w-8 rounded-none hover:text-primary hover:bg-background"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-1 rounded-none border-border bg-card" align="end">
                      <div className="px-3 py-2 border-b border-border mb-1">
                        <p className="text-xs text-muted-foreground uppercase tracking-widest font-medium">Track this wine</p>
                      </div>

                      <button
                        onClick={() => handleAddExact(wine)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-background transition-colors text-left"
                      >
                        <WineIcon className="h-4 w-4 text-primary shrink-0" />
                        <div>
                          <div className="font-medium">This wine, this vintage</div>
                          <div className="text-xs text-muted-foreground">
                            {wine.vintage ? `${wine.wine_name} ${wine.vintage} only` : wine.wine_name}
                          </div>
                        </div>
                      </button>

                      <button
                        onClick={() => handleAddWine(wine)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-background transition-colors text-left"
                      >
                        <Calendar className="h-4 w-4 text-primary shrink-0" />
                        <div>
                          <div className="font-medium">This wine, any vintage</div>
                          <div className="text-xs text-muted-foreground">{wine.wine_name} — any year</div>
                        </div>
                      </button>

                      <button
                        onClick={() => handleAddProducer(wine)}
                        disabled={!wine.producer}
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-background transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <User className="h-4 w-4 text-primary shrink-0" />
                        <div>
                          <div className="font-medium">Any wine by this producer</div>
                          <div className="text-xs text-muted-foreground">{wine.producer ?? 'No producer listed'}</div>
                        </div>
                      </button>
                    </PopoverContent>
                  </Popover>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function WineHistoryBadge({ wineName, bottleSize }: { wineName: string; bottleSize?: string | null }) {
  const { data } = useGetArchiveHistory({
    wine_name: wineName,
    ...(bottleSize ? { bottle_size: bottleSize } : {}),
  });

  if (!data || data.count === 0) return null;

  const lastSeen = data.last_seen_month
    ? (() => {
        const [y, m] = data.last_seen_month.split("-");
        return new Date(Number(y), Number(m) - 1, 1).toLocaleString("en-CA", { month: "short", year: "numeric" });
      })()
    : null;

  const uniquePrices = [...new Set(data.prices.map((p) => Math.round(p)))].sort((a, b) => a - b);
  const priceStr = uniquePrices.length > 0 ? uniquePrices.map((p) => `$${p}`).join(", ") : null;

  // Highlight non-standard formats — 750 mL is assumed and unremarkable
  const nonStandardSizes = (data.bottle_sizes ?? []).filter((s) => s !== "750 mL");

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-1">
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground/60">
        <Clock3 className="h-3 w-3 shrink-0" />
        Seen {data.count}× on Vintages
      </span>
      {lastSeen && (
        <span className="text-xs text-muted-foreground/50">· Last: {lastSeen}</span>
      )}
      {priceStr && (
        <span className="text-xs text-muted-foreground/50">· {priceStr}</span>
      )}
      {nonStandardSizes.length > 0 && (
        <span className="text-xs text-primary/70 font-mono">· {nonStandardSizes.join(", ")}</span>
      )}
    </div>
  );
}
