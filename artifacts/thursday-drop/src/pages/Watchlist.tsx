import { useGetWatchlist, useAddToWatchlist, useRemoveFromWatchlist, getGetWatchlistQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/lib/AuthContext";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, Wine, User } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function Watchlist() {
  const { profile } = useAuth();
  const { data: watchlist, isLoading } = useGetWatchlist();
  const addToWatchlist = useAddToWatchlist();
  const removeFromWatchlist = useRemoveFromWatchlist();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [mode, setMode] = useState<"exact" | "producer">("exact");
  const [wineName, setWineName] = useState("");
  const [vintage, setVintage] = useState("");
  const [producer, setProducer] = useState("");

  const limit = profile?.is_pro ? Infinity : 5;
  const count = watchlist?.length || 0;
  const isAtLimit = count >= limit;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const nameValue = mode === "producer" ? producer : wineName;
    if (!nameValue) return;

    addToWatchlist.mutate(
      {
        data: {
          wine_name: nameValue,
          vintage: mode === "exact" && vintage ? vintage : null,
          producer: mode === "producer" ? producer : (producer || null),
          match_type: mode,
        }
      },
      {
        onSuccess: () => {
          setWineName("");
          setVintage("");
          setProducer("");
          queryClient.invalidateQueries({ queryKey: getGetWatchlistQueryKey() });
          toast({ title: mode === "exact" ? "Wine added to watchlist" : "Producer added to watchlist" });
        },
        onError: (err: any) => {
          const msg = err?.response?.data?.error || "Failed to add item.";
          toast({ title: "Error", description: msg, variant: "destructive" });
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

        <div className="bg-card p-6 border border-border space-y-6">
          <h2 className="font-serif text-2xl">Add New Target</h2>

          <div className="flex gap-0 border border-border w-fit">
            <button
              type="button"
              onClick={() => setMode("exact")}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium tracking-wider uppercase transition-colors ${mode === "exact" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}
            >
              <Wine className="h-4 w-4" />
              Specific Wine
            </button>
            <button
              type="button"
              onClick={() => setMode("producer")}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium tracking-wider uppercase transition-colors ${mode === "producer" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}
            >
              <User className="h-4 w-4" />
              Producer / Label
            </button>
          </div>

          <form onSubmit={handleAdd} className="space-y-4">
            {mode === "exact" ? (
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1">
                  <Input
                    placeholder="Wine name (e.g., Rousseau Chambertin)"
                    value={wineName}
                    onChange={e => setWineName(e.target.value)}
                    required
                    className="bg-background rounded-none border-border"
                  />
                </div>
                <div className="w-full md:w-32">
                  <Input
                    placeholder="Vintage"
                    value={vintage}
                    onChange={e => setVintage(e.target.value)}
                    maxLength={4}
                    className="bg-background rounded-none border-border font-mono"
                  />
                </div>
              </div>
            ) : (
              <div className="flex-1">
                <Input
                  placeholder="Producer or label (e.g., Armand Rousseau, DRC)"
                  value={producer}
                  onChange={e => setProducer(e.target.value)}
                  required
                  className="bg-background rounded-none border-border"
                />
              </div>
            )}
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {mode === "exact"
                  ? "Alerts when this exact wine (and vintage, if set) appears in a new release."
                  : "Alerts for any wine from this producer, regardless of vintage."}
              </p>
              <Button
                type="submit"
                disabled={isAtLimit || addToWatchlist.isPending}
                className="rounded-none font-bold tracking-widest uppercase px-8"
              >
                {addToWatchlist.isPending ? "Adding..." : "Add"}
              </Button>
            </div>
          </form>

          {isAtLimit && !profile?.is_pro && (
            <p className="text-destructive text-sm">Free tier limit reached. Upgrade to Pro for unlimited items.</p>
          )}
        </div>

        <div className="border border-border bg-card">
          <Table>
            <TableHeader className="bg-background">
              <TableRow className="border-border">
                <TableHead className="font-serif text-primary uppercase tracking-widest text-xs">Target</TableHead>
                <TableHead className="font-serif text-primary uppercase tracking-widest text-xs">Type</TableHead>
                <TableHead className="font-serif text-primary uppercase tracking-widest text-xs">Producer</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground italic font-serif">Loading watchlist...</TableCell>
                </TableRow>
              ) : watchlist?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Your watchlist is empty.</TableCell>
                </TableRow>
              ) : (
                watchlist?.map((item) => (
                  <TableRow key={item.id} className="border-border">
                    <TableCell className="font-medium">
                      <div className="flex flex-col">
                        <span>{item.wine_name}</span>
                        {item.match_type === "exact" && item.vintage && (
                          <span className="text-primary font-mono text-sm font-semibold">{item.vintage}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`rounded-none text-xs uppercase tracking-wider font-medium ${item.match_type === "producer" ? "border-primary/50 text-primary" : "border-border text-muted-foreground"}`}
                      >
                        {item.match_type === "producer" ? (
                          <><User className="h-3 w-3 mr-1" />Producer</>
                        ) : (
                          <><Wine className="h-3 w-3 mr-1" />Exact</>
                        )}
                      </Badge>
                    </TableCell>
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
