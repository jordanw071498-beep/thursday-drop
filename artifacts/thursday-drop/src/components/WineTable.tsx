import { Wine } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/lib/AuthContext";
import { useAddToWatchlist } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Plus, Wine as WineIcon, User } from "lucide-react";
import { useState } from "react";

interface WineTableProps {
  wines: Wine[];
  showWatchButton?: boolean;
  showReleaseLabel?: boolean;
  showSoldOut?: boolean;
}

export function WineTable({ wines, showWatchButton = false, showReleaseLabel = false, showSoldOut = true }: WineTableProps) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const addToWatchlist = useAddToWatchlist();
  const [openPopover, setOpenPopover] = useState<number | null>(null);

  const handleAddExact = (wine: Wine) => {
    if (!profile) {
      toast({ title: "Authentication Required", description: "Please log in to add wines to your watchlist.", variant: "destructive" });
      return;
    }
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
          toast({ title: "Tracking Wine", description: `${wine.wine_name}${wine.vintage ? ` ${wine.vintage}` : ""} added to your watchlist.` });
        },
        onError: (err: any) => {
          const msg = err?.response?.data?.error || "Failed to add to watchlist.";
          toast({ title: "Error", description: msg, variant: "destructive" });
        }
      }
    );
  };

  const handleAddProducer = (wine: Wine) => {
    if (!profile) {
      toast({ title: "Authentication Required", description: "Please log in to add wines to your watchlist.", variant: "destructive" });
      return;
    }
    if (!wine.producer) {
      toast({ title: "No Producer", description: "This wine has no producer listed.", variant: "destructive" });
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
          toast({ title: "Tracking Producer", description: `You'll be alerted for any wine from ${wine.producer}.` });
        },
        onError: (err: any) => {
          const msg = err?.response?.data?.error || "Failed to add to watchlist.";
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
                    {wine.vintage && (
                      <span className="ml-2 text-primary font-mono text-sm font-semibold">{wine.vintage}</span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    LCBO: {wine.lcbo_number ?? '—'}
                    {showReleaseLabel && wine.release_cycle_id && ` • Release #${wine.release_cycle_id}`}
                  </span>
                  {wine.sold_out && <span className="text-xs text-destructive uppercase tracking-wider mt-1">Sold Out</span>}
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
                    <PopoverContent className="w-52 p-1 rounded-none border-border bg-card" align="end">
                      <button
                        onClick={() => handleAddExact(wine)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-background transition-colors text-left"
                      >
                        <WineIcon className="h-4 w-4 text-primary shrink-0" />
                        <div>
                          <div className="font-medium">Track This Wine</div>
                          <div className="text-xs text-muted-foreground">
                            {wine.vintage ? `${wine.wine_name} ${wine.vintage}` : wine.wine_name}
                          </div>
                        </div>
                      </button>
                      <button
                        onClick={() => handleAddProducer(wine)}
                        disabled={!wine.producer}
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-background transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <User className="h-4 w-4 text-primary shrink-0" />
                        <div>
                          <div className="font-medium">Track This Producer</div>
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
