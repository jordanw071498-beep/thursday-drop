import { useGetWatchlist, useAddToWatchlist, useRemoveFromWatchlist, getGetWatchlistQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/lib/AuthContext";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function Watchlist() {
  const { profile } = useAuth();
  const { data: watchlist, isLoading } = useGetWatchlist();
  const addToWatchlist = useAddToWatchlist();
  const removeFromWatchlist = useRemoveFromWatchlist();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [wineName, setWineName] = useState("");
  const [producer, setProducer] = useState("");

  const limit = profile?.is_pro ? Infinity : 5;
  const count = watchlist?.length || 0;
  const isAtLimit = count >= limit;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!wineName) return;

    addToWatchlist.mutate(
      { data: { wine_name: wineName, producer } },
      {
        onSuccess: () => {
          setWineName("");
          setProducer("");
          queryClient.invalidateQueries({ queryKey: getGetWatchlistQueryKey() });
          toast({ title: "Added to watchlist" });
        },
        onError: () => {
          toast({ title: "Failed to add", variant: "destructive" });
        }
      }
    );
  };

  const handleRemove = (id: number) => {
    removeFromWatchlist.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetWatchlistQueryKey() });
          toast({ title: "Removed from watchlist" });
        }
      }
    );
  };

  return (
    <div className="min-h-screen bg-background px-6 py-12">
      <div className="max-w-4xl mx-auto space-y-12">
        <header className="border-b border-border pb-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h1 className="font-serif text-5xl text-primary mb-4">Watchlist</h1>
            <p className="text-muted-foreground text-lg">We'll notify you when these drop.</p>
          </div>
          <div className="text-right">
            <span className="font-mono text-xl">{count}</span>
            <span className="text-muted-foreground"> / {limit === Infinity ? '∞' : limit} items</span>
          </div>
        </header>

        <div className="bg-card p-6 border border-border">
          <h2 className="font-serif text-2xl mb-6">Add New Target</h2>
          <form onSubmit={handleAdd} className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <Input 
                placeholder="Wine Name (e.g., Tignanello)" 
                value={wineName}
                onChange={e => setWineName(e.target.value)}
                required
                className="bg-background rounded-none border-border"
              />
            </div>
            <div className="flex-1">
              <Input 
                placeholder="Producer (Optional)" 
                value={producer}
                onChange={e => setProducer(e.target.value)}
                className="bg-background rounded-none border-border"
              />
            </div>
            <Button 
              type="submit" 
              disabled={isAtLimit || addToWatchlist.isPending}
              className="rounded-none font-bold tracking-widest uppercase md:w-32"
            >
              Add
            </Button>
          </form>
          {isAtLimit && !profile?.is_pro && (
            <p className="text-destructive text-sm mt-4">Free tier limit reached. Upgrade to Pro for unlimited items.</p>
          )}
        </div>

        <div className="border border-border bg-card">
          <Table>
            <TableHeader className="bg-background">
              <TableRow className="border-border">
                <TableHead className="font-serif text-primary uppercase tracking-widest text-xs">Target Name</TableHead>
                <TableHead className="font-serif text-primary uppercase tracking-widest text-xs">Producer</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8 text-muted-foreground italic font-serif">Loading watchlist...</TableCell>
                </TableRow>
              ) : watchlist?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">Your watchlist is empty.</TableCell>
                </TableRow>
              ) : (
                watchlist?.map((item) => (
                  <TableRow key={item.id} className="border-border">
                    <TableCell className="font-medium">{item.wine_name}</TableCell>
                    <TableCell>{item.producer || '—'}</TableCell>
                    <TableCell>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => handleRemove(item.id)}
                        disabled={removeFromWatchlist.isPending}
                        className="h-8 w-8 rounded-none hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
