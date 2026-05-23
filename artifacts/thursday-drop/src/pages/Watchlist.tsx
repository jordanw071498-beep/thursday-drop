import { useGetWatchlist, useAddToWatchlist, useRemoveFromWatchlist, getGetWatchlistQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/lib/AuthContext";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, Wine, User, Calendar } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

type Mode = "exact" | "wine" | "producer";

const MODE_CONFIG: Record<Mode, { label: string; icon: React.ReactNode; hint: string }> = {
  exact: {
    label: "Exact",
    icon: <Wine className="h-4 w-4" />,
    hint: "Alerts when this exact wine and vintage appears.",
  },
  wine: {
    label: "Any Vintage",
    icon: <Calendar className="h-4 w-4" />,
    hint: "Alerts any time this wine appears, regardless of vintage year.",
  },
  producer: {
    label: "Producer",
    icon: <User className="h-4 w-4" />,
    hint: "Alerts for any wine from this producer.",
  },
};

function MatchBadge({ matchType }: { matchType: string }) {
  if (matchType === "producer") {
    return (
      <Badge variant="outline" className="rounded-none text-xs uppercase tracking-wider font-medium border-primary/50 text-primary gap-1">
        <User className="h-3 w-3" />Producer
      </Badge>
    );
  }
  if (matchType === "wine") {
    return (
      <Badge variant="outline" className="rounded-none text-xs uppercase tracking-wider font-medium border-amber-500/50 text-amber-500 gap-1">
        <Calendar className="h-3 w-3" />Any Vintage
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="rounded-none text-xs uppercase tracking-wider font-medium border-border text-muted-foreground gap-1">
      <Wine className="h-3 w-3" />Exact
    </Badge>
  );
}

export default function Watchlist() {
  const { profile } = useAuth();
  const { data: watchlist, isLoading } = useGetWatchlist();
  const addToWatchlist = useAddToWatchlist();
  const removeFromWatchlist = useRemoveFromWatchlist();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [mode, setMode] = useState<Mode>("exact");
  const [wineName, setWineName] = useState("");
  const [vintage, setVintage] = useState("");
  const [producer, setProducer] = useState("");

  const limit = profile?.is_pro ? Infinity : 5;
  const count = watchlist?.length || 0;
  const isAtLimit = count >= limit;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();

    let wine_name: string;
    let payload_vintage: string | null = null;
    let payload_producer: string | null = null;

    if (mode === "producer") {
      if (!producer.trim()) return;
      wine_name = producer.trim();
      payload_producer = producer.trim();
    } else {
      if (!wineName.trim()) return;
      wine_name = wineName.trim();
      payload_vintage = mode === "exact" && vintage.trim() ? vintage.trim() : null;
      payload_producer = null;
    }

    addToWatchlist.mutate(
      {
        data: {
          wine_name,
          vintage: payload_vintage,
          producer: payload_producer,
          match_type: mode,
        }
      },
      {
        onSuccess: () => {
          setWineName("");
          setVintage("");
          setProducer("");
          queryClient.invalidateQueries({ queryKey: getGetWatchlistQueryKey() });
          const labels: Record<Mode, string> = {
            exact: "Wine added — exact match",
            wine: "Wine added — any vintage",
            producer: "Producer added to watchlist",
          };
          toast({ title: labels[mode] });
        },
        onError: (err: any) => {
          const msg = err?.data?.error || "Failed to add item.";
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
            {(["exact", "wine", "producer"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium tracking-wider uppercase transition-colors ${
                  mode === m ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {MODE_CONFIG[m].icon}
                {MODE_CONFIG[m].label}
              </button>
            ))}
          </div>

          <form onSubmit={handleAdd} className="space-y-4">
            {mode === "exact" && (
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
            )}

            {mode === "wine" && (
              <Input
                placeholder="Wine name (e.g., Rousseau Chambertin)"
                value={wineName}
                onChange={e => setWineName(e.target.value)}
                required
                className="bg-background rounded-none border-border"
              />
            )}

            {mode === "producer" && (
              <Input
                placeholder="Producer or label (e.g., Armand Rousseau, DRC)"
                value={producer}
                onChange={e => setProducer(e.target.value)}
                required
                className="bg-background rounded-none border-border"
              />
            )}

            <div className="flex items-center justify-between gap-4">
              <p className="text-xs text-muted-foreground">{MODE_CONFIG[mode].hint}</p>
              <Button
                type="submit"
                disabled={isAtLimit || addToWatchlist.isPending}
                className="rounded-none font-bold tracking-widest uppercase px-8 shrink-0"
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
                <TableHead className="font-serif text-primary uppercase tracking-widest text-xs">Tracking</TableHead>
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
                        {item.match_type === "wine" && (
                          <span className="text-xs text-muted-foreground">any vintage</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <MatchBadge matchType={item.match_type} />
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
