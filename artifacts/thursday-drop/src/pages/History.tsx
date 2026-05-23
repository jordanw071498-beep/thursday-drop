import { useListReleases, useListWines } from "@workspace/api-client-react";
import { WineTable } from "@/components/WineTable";
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/AuthContext";
import { Lock } from "lucide-react";
import { Link } from "wouter";

export default function History() {
  const { profile } = useAuth();
  const { data: releases, isLoading: releasesLoading } = useListReleases();
  const [selectedReleaseId, setSelectedReleaseId] = useState<number | "all">("all");
  
  const { data: wines, isLoading: winesLoading } = useListWines(
    selectedReleaseId === "all" ? undefined : { release_cycle_id: selectedReleaseId }
  );

  if (!profile?.is_pro) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center">
        <div className="max-w-md space-y-6 bg-card p-12 border border-border">
          <Lock className="w-12 h-12 text-primary mx-auto opacity-50" />
          <h1 className="font-serif text-3xl text-foreground">Archive Locked</h1>
          <p className="text-muted-foreground">
            Historical release data and advanced filtering are reserved for Pro members.
          </p>
          <Link href="/pricing" className="block w-full bg-primary text-primary-foreground py-3 font-bold tracking-widest uppercase hover:bg-primary/90 transition-colors">
            Upgrade to Pro
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-6 py-12">
      <div className="max-w-7xl mx-auto space-y-12">
        <header className="border-b border-border pb-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h1 className="font-serif text-5xl text-primary mb-4">The Archive</h1>
            <p className="text-muted-foreground text-lg">Search the complete historical database.</p>
          </div>
          
          <div className="w-full md:w-64">
            <Select 
              value={selectedReleaseId.toString()} 
              onValueChange={(v) => setSelectedReleaseId(v === "all" ? "all" : parseInt(v))}
            >
              <SelectTrigger className="w-full rounded-none border-border bg-card">
                <SelectValue placeholder="All Releases" />
              </SelectTrigger>
              <SelectContent className="rounded-none border-border">
                <SelectItem value="all">All Releases</SelectItem>
                {releases?.map(r => (
                  <SelectItem key={r.id} value={r.id.toString()}>{r.program_label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </header>

        {winesLoading ? (
          <div className="h-64 flex items-center justify-center border border-border">
            <span className="font-serif italic text-xl text-muted-foreground">Accessing archives...</span>
          </div>
        ) : (
          <WineTable wines={wines || []} showReleaseLabel={selectedReleaseId === "all"} showWatchButton />
        )}
      </div>
    </div>
  );
}
