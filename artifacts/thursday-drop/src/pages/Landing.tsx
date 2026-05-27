import { useCreateCheckout } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/AuthContext";
import { Check } from "lucide-react";

export default function Landing() {
  const { profile } = useAuth();
  const [, setLocation] = useLocation();
  const createCheckout = useCreateCheckout();

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
            Thursday Drop tracks every LCBO Vintages release and sends you a personal alert the moment your favourite wines become available. Never miss an allocation again.
          </p>

          <div className="pt-6">
            {profile ? (
              <Link
                href="/release"
                className="inline-block bg-primary text-primary-foreground px-10 py-4 rounded-none font-bold tracking-widest uppercase hover:bg-primary/90 transition-colors text-sm"
              >
                View Current Release
              </Link>
            ) : (
              <Link
                href="/signup"
                className="inline-block bg-primary text-primary-foreground px-10 py-4 rounded-none font-bold tracking-widest uppercase hover:bg-primary/90 transition-colors text-sm"
              >
                Create Free Account
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Founder Story */}
      <section className="px-6 py-20 bg-background border-b border-border">
        <div className="max-w-2xl mx-auto">
          <div className="border-l-2 border-primary pl-8 space-y-5">
            <p className="font-serif italic text-lg md:text-xl text-foreground/80 leading-relaxed">
              I built Thursday Drop for myself.
            </p>
            <p className="font-serif italic text-base md:text-lg text-foreground/70 leading-relaxed">
              I kept missing Vintages drops. Not because I wasn't interested — because I'm busy. I wasn't going to check vintagesshoponline.com every Thursday morning to see if my favourite wines had come in. And by the time I remembered to look, it was gone.
            </p>
            <p className="font-serif italic text-base md:text-lg text-foreground/70 leading-relaxed">
              So I built something that watches for me. Thursday Drop tracks every LCBO Vintages release — Special Offers, Monthly Features, Bordeaux Futures — and sends me a personal email the moment anything on my list appears. I thought other collectors might find it useful too.
            </p>
            <p className="font-serif text-sm text-primary tracking-wide mt-6">
              — Jordan, Toronto
            </p>
          </div>
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
              <p className="text-muted-foreground">Our systems scrape upcoming LCBO Vintages releases every Thursday and cross-reference your watchlist.</p>
            </div>
            <div className="space-y-4">
              <div className="text-5xl font-serif text-border opacity-50">03</div>
              <h3 className="text-xl font-medium tracking-wide uppercase">Get Alerted</h3>
              <p className="text-muted-foreground">Receive a personal email alert the moment a match drops, giving you the edge before bottles sell out.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="px-6 py-24 bg-card border-y border-border">
        <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-px bg-border">
          {[
            {
              quote: "I manage the wine program for two restaurants in Toronto. I used to waste time going through the Vintages release every week looking for specific bottles. Now I have a list of 20-25 wines that we always try to source and Thursday Drop tells me when any of them show up. It has saved me hours and we haven't missed an allocation since.",
              attribution: "Restaurant Wine Director, Toronto",
            },
            {
              quote: "I collect serious Burgundy — Grand Cru only. I got so tired of the generic Vintages email blast every week. Thursday Drop only alerts me when something I actually care about is available.",
              attribution: "Private Collector, Toronto",
            },
            {
              quote: "I genuinely do not have time to monitor Vintages every week. I added about 20 wines to my watchlist and forgot about it. The $5 per month is worth it so that I don't have to look through my email every Thursday.",
              attribution: "Subscriber, Ottawa",
            },
          ].map((t) => (
            <div key={t.attribution} className="bg-card px-8 py-10 flex flex-col gap-6">
              <span className="font-serif text-5xl leading-none text-primary select-none">&ldquo;</span>
              <p className="font-serif italic text-foreground/75 text-base leading-relaxed flex-1 -mt-4">
                {t.quote}
              </p>
              <p className="text-xs font-sans uppercase tracking-[0.15em] text-muted-foreground">
                {t.attribution}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing section — shown to guests and Free users only */}
      {!profile?.is_pro && (
        <section className="px-6 py-24 bg-card border-y border-border">
          <div className="max-w-4xl mx-auto space-y-12">
            <div className="text-center space-y-4">
              <h2 className="font-serif text-4xl md:text-5xl text-primary">Membership</h2>
              <p className="text-xl text-muted-foreground font-light">
                Choose the tier that matches your collecting ambition.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8 items-stretch">
              {/* Free Tier */}
              <div className="bg-background border border-border p-8 flex flex-col">
                <div className="space-y-4 flex-1">
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
                <div className="space-y-4 flex-1">
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
                Create Free Account
              </Link>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
