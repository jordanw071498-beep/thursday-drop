import { useState } from "react";
import { useGetLatestRelease, useEmailSubscribe } from "@workspace/api-client-react";
import { WineTable } from "@/components/WineTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

export default function Landing() {
  const { data: latestRelease, isLoading } = useGetLatestRelease();
  const emailSubscribe = useEmailSubscribe();
  const { toast } = useToast();
  const [email, setEmail] = useState("");

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    
    emailSubscribe.mutate(
      { data: { email } },
      {
        onSuccess: () => {
          toast({
            title: "Subscribed successfully",
            description: "You'll receive alerts for the next drop.",
          });
          setEmail("");
        },
        onError: () => {
          toast({
            title: "Subscription failed",
            description: "Please try again later.",
            variant: "destructive"
          });
        }
      }
    );
  };

  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="relative px-6 py-24 md:py-32 flex flex-col items-center text-center border-b border-border bg-gradient-to-b from-background to-card">
        <div className="max-w-3xl mx-auto space-y-8">
          <h1 className="font-serif text-5xl md:text-7xl lg:text-8xl leading-none text-foreground tracking-tight">
            The club for <span className="text-primary italic">serious</span> collectors.
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground font-light max-w-2xl mx-auto leading-relaxed">
            Premium LCBO Vintages intelligence. We track the drops, analyze the scores, and alert you before the best bottles sell out.
          </p>
          
          <form onSubmit={handleSubscribe} className="flex flex-col sm:flex-row max-w-md mx-auto gap-4 pt-8">
            <Input 
              type="email" 
              placeholder="Enter your email" 
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="bg-background rounded-none h-12 text-lg border-primary/50 focus-visible:ring-primary"
              required
            />
            <Button 
              type="submit" 
              className="h-12 px-8 rounded-none font-bold tracking-widest uppercase text-primary-foreground"
              disabled={emailSubscribe.isPending}
            >
              {emailSubscribe.isPending ? "Joining..." : "Join Free"}
            </Button>
          </form>
        </div>
      </section>

      {/* How it Works */}
      <section className="px-6 py-24 bg-background">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="font-serif text-3xl md:text-4xl text-primary">How It Works</h2>
            <div className="w-12 h-1 bg-primary mx-auto mt-6"></div>
          </div>
          
          <div className="grid md:grid-cols-3 gap-12 text-center">
            <div className="space-y-4">
              <div className="text-5xl font-serif text-border opacity-50">01</div>
              <h3 className="text-xl font-medium tracking-wide uppercase">Set Watchlist</h3>
              <p className="text-muted-foreground">Add specific producers, regions, or wines you're hunting for to your personal watchlist.</p>
            </div>
            <div className="space-y-4">
              <div className="text-5xl font-serif text-border opacity-50">02</div>
              <h3 className="text-xl font-medium tracking-wide uppercase">We Monitor</h3>
              <p className="text-muted-foreground">Our systems continuously scrape upcoming LCBO Vintages releases and cross-reference scores.</p>
            </div>
            <div className="space-y-4">
              <div className="text-5xl font-serif text-border opacity-50">03</div>
              <h3 className="text-xl font-medium tracking-wide uppercase">Get Alerted</h3>
              <p className="text-muted-foreground">Receive instant email notifications the moment a match drops, giving you the edge.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Live Table */}
      <section className="px-6 py-24 bg-card border-y border-border">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-end justify-between mb-12">
            <div>
              <h2 className="font-serif text-3xl md:text-4xl text-primary mb-2">Latest Release</h2>
              <p className="text-muted-foreground">
                {isLoading ? "Loading..." : latestRelease?.release.program_label || "Current Drop"}
              </p>
            </div>
            <Link href="/release" className="text-sm font-bold tracking-widest uppercase hover:text-primary transition-colors border-b border-transparent hover:border-primary pb-1">
              View All
            </Link>
          </div>
          
          {isLoading ? (
            <div className="h-64 flex items-center justify-center border border-border">
              <span className="font-serif italic text-xl text-muted-foreground">Curating collection...</span>
            </div>
          ) : latestRelease?.wines ? (
            <WineTable wines={latestRelease.wines.slice(0, 5)} showWatchButton />
          ) : (
            <div className="p-8 text-center border border-border text-muted-foreground">No current release data available.</div>
          )}
        </div>
      </section>

      {/* CTA / Pricing Preview */}
      <section className="px-6 py-32 text-center bg-background">
        <div className="max-w-3xl mx-auto space-y-8">
          <h2 className="font-serif text-4xl text-foreground">Unlock the Archive</h2>
          <p className="text-xl text-muted-foreground font-light">
            Free members get alerts for current drops. Pro members get unlimited watchlist items, full historical price data, and advanced filtering.
          </p>
          <div className="pt-8">
            <Link href="/pricing" className="inline-block bg-primary text-primary-foreground px-8 py-4 rounded-none font-bold tracking-widest uppercase hover:bg-primary/90 transition-colors">
              View Membership Tiers
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
