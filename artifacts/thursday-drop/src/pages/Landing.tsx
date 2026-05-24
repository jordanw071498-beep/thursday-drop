import { useState } from "react";
import { useGetLatestRelease, useEmailSubscribe, useCreateCheckout } from "@workspace/api-client-react";
import { WineTable } from "@/components/WineTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/AuthContext";
import { Check } from "lucide-react";

export default function Landing() {
  const { data: latestRelease, isLoading } = useGetLatestRelease();
  const emailSubscribe = useEmailSubscribe();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const { profile } = useAuth();
  const [, setLocation] = useLocation();
  const createCheckout = useCreateCheckout();

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
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleStripeCheckout = (plan: "monthly" | "annual") => {
    if (!profile) {
      setLocation("/signup");
      return;
    }
    createCheckout.mutate(
      { data: { plan, user_id: profile.id, email: profile.email || "" } },
      {
        onSuccess: (result) => {
          window.location.href = result.url;
        },
        onError: () => {
          alert("Unable to start checkout. Please try again.");
        },
      },
    );
  };

  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero */}
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
              onChange={(e) => setEmail(e.target.value)}
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
            <Link
              href="/release"
              className="text-sm font-bold tracking-widest uppercase hover:text-primary transition-colors border-b border-transparent hover:border-primary pb-1"
            >
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

      {/* Pricing section — shown to guests and Free users only */}
      {!profile?.is_pro && (
        <section className="px-6 py-24 bg-background border-b border-border">
          <div className="max-w-4xl mx-auto space-y-12">
            <div className="text-center space-y-4">
              <h2 className="font-serif text-4xl md:text-5xl text-primary">Membership</h2>
              <p className="text-xl text-muted-foreground font-light">
                Choose the tier that matches your collecting ambition.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              {/* Free Tier */}
              <div className="bg-card border border-border p-8 flex flex-col">
                <div className="space-y-4 flex-grow">
                  <h3 className="font-serif text-2xl text-foreground">Standard</h3>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-light">$0</span>
                    <span className="text-muted-foreground">/ forever</span>
                  </div>
                  <p className="text-muted-foreground pb-6 border-b border-border">
                    For the casual enthusiast looking to stay informed.
                  </p>
                  <ul className="space-y-3 pt-4 text-sm">
                    <li className="flex items-center gap-3">
                      <Check className="h-4 w-4 text-primary shrink-0" />
                      <span>Access to current release data</span>
                    </li>
                    <li className="flex items-center gap-3">
                      <Check className="h-4 w-4 text-primary shrink-0" />
                      <span>Watchlist up to 5 items</span>
                    </li>
                    <li className="flex items-center gap-3">
                      <Check className="h-4 w-4 text-primary shrink-0" />
                      <span>Weekly drop email alerts</span>
                    </li>
                  </ul>
                </div>
                <div className="pt-8">
                  <Button
                    variant="outline"
                    className="w-full rounded-none font-bold tracking-widest uppercase h-12 border-border hover:bg-muted"
                    onClick={() => (profile ? setLocation("/account") : setLocation("/signup"))}
                  >
                    {profile ? "Your Current Plan" : "Sign Up Free"}
                  </Button>
                </div>
              </div>

              {/* Pro Tier */}
              <div className="bg-background border border-primary p-8 flex flex-col relative overflow-hidden">
                <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-xs font-bold tracking-widest uppercase py-1 px-4">
                  Premium
                </div>
                <div className="space-y-4 flex-grow">
                  <h3 className="font-serif text-2xl text-primary">Pro Collector</h3>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-light">$4.99</span>
                    <span className="text-muted-foreground">/ month</span>
                  </div>
                  <p className="text-muted-foreground pb-6 border-b border-border">
                    For serious collectors hunting specific allocations.
                  </p>
                  <ul className="space-y-3 pt-4 text-sm">
                    <li className="flex items-center gap-3">
                      <Check className="h-4 w-4 text-primary shrink-0" />
                      <span>Unlimited watchlist items</span>
                    </li>
                    <li className="flex items-center gap-3">
                      <Check className="h-4 w-4 text-primary shrink-0" />
                      <span>Full historical archive access</span>
                    </li>
                    <li className="flex items-center gap-3">
                      <Check className="h-4 w-4 text-primary shrink-0" />
                      <span>Advanced filtering & analytics</span>
                    </li>
                    <li className="flex items-center gap-3">
                      <Check className="h-4 w-4 text-primary shrink-0" />
                      <span>Priority email drop alerts</span>
                    </li>
                  </ul>
                </div>
                <div className="pt-8 space-y-3">
                  <Button
                    className="w-full rounded-none font-bold tracking-widest uppercase h-12"
                    onClick={() => handleStripeCheckout("monthly")}
                    disabled={createCheckout.isPending}
                  >
                    {createCheckout.isPending ? "Processing…" : "Subscribe — $4.99 / month"}
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full rounded-none tracking-widest uppercase text-xs hover:text-primary hover:bg-transparent"
                    onClick={() => handleStripeCheckout("annual")}
                    disabled={createCheckout.isPending}
                  >
                    Or $49.99 / year&ensp;—&ensp;Save 17%
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Bottom CTA */}
      <section className="px-6 py-24 text-center bg-background">
        <div className="max-w-3xl mx-auto space-y-8">
          <h2 className="font-serif text-4xl text-foreground">Unlock the Archive</h2>
          <p className="text-xl text-muted-foreground font-light">
            Free members get alerts for current drops. Pro members get unlimited watchlist items, full historical price data, and advanced filtering.
          </p>
          {!profile && (
            <div className="pt-4">
              <Link
                href="/signup"
                className="inline-block bg-primary text-primary-foreground px-8 py-4 rounded-none font-bold tracking-widest uppercase hover:bg-primary/90 transition-colors"
              >
                Get Started Free
              </Link>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
