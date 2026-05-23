import { Wine } from "@workspace/api-client-react/src/generated/api.schemas";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/AuthContext";
import { useAddToWatchlist } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Plus } from "lucide-react";

interface WineTableProps {
  wines: Wine[];
  showWatchButton?: boolean;
  showReleaseLabel?: boolean;
  showSoldOut?: boolean;
}

export function WineTable({ wines, showWatchButton = false, showReleaseLabel = false, showSoldOut = true }: WineTableProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const addToWatchlist = useAddToWatchlist();

  const handleAddWatchlist = (wine: Wine) => {
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please log in to add wines to your watchlist.",
        variant: "destructive"
      });
      return;
    }
    
    addToWatchlist.mutate(
      { 
        data: { 
          wine_name: wine.wine_name, 
          producer: wine.producer, 
          region: wine.region 
        } 
      },
      {
        onSuccess: () => {
          toast({
            title: "Added to Watchlist",
            description: `${wine.wine_name} has been added to your watchlist.`,
          });
        },
        onError: () => {
          toast({
            title: "Error",
            description: "Failed to add to watchlist.",
            variant: "destructive"
          });
        }
      }
    );
  };

  const getScoreBadgeVariant = (score?: number | null) => {
    if (!score) return "outline";
    if (score >= 90) return "default"; // Gold
    if (score >= 87) return "secondary"; // Cream
    return "outline"; // Muted
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
            {showWatchButton && <TableHead className="w-16"></TableHead>}
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
                  <span>{wine.wine_name}</span>
                  <span className="text-xs text-muted-foreground">LCBO: {wine.lcbo_number} {showReleaseLabel && wine.release_cycle_id && `• Release #${wine.release_cycle_id}`}</span>
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
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => handleAddWatchlist(wine)}
                    disabled={wine.sold_out}
                    className="h-8 w-8 rounded-none hover:text-primary hover:bg-background"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
