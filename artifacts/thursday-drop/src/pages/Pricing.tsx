import { useCreateCheckout } from "@workspace/api-client-react";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics";

export default function Pricing() {
  const { profile } = useAuth();
  const [, setLocation] = useLocation();
  const createCheckout = useCreateCheckout();

  // Pro users are redirected to account — they don't need this page
  useEffect(() => {
    if (profile?.is_pro) {
      setLocation("/account");
    }
  }, [profile?.is_pro, setLocation]);

  const handleSubscribe = (plan: "monthly") => {
    if (!profile) {
      setLocation("/login");
      return;
    }

    trackEvent("pro_upgrade_started", { plan, source: "pricing_page" });

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
    <div className="min-h-screen bg-background px-6 py-24">
      <div className="max-w-7xl mx-auto space-y-16">
        <div className="text-center space-y-6">
          <h1 className="font-serif text-5xl md:text-6xl text-primary">Membership</h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Choose the tier that matches your collecting ambition.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
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
              <ul className="space-y-4 pt-6">
                <li className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-primary" />
                  <span>Access to current release data</span>
                </li>
                <li className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-primary" />
                  <span>Watchlist up to 5 items</span>
                </li>
                <li className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-primary" />
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
                {profile ? "Current Plan" : "Sign Up Free"}
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
              <ul className="space-y-4 pt-6">
                <li className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-primary" />
                  <span>Unlimited watchlist items</span>
                </li>
                <li className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-primary" />
                  <span>Full historical archive access</span>
                </li>
                <li className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-primary" />
                  <span>Advanced filtering & analytics</span>
                </li>
                <li className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-primary" />
                  <span>Priority email drop alerts</span>
                </li>
              </ul>
            </div>
            <div className="pt-8 space-y-3">
              <Button
                className="w-full rounded-none font-bold tracking-widest uppercase h-12"
                onClick={() => handleSubscribe("monthly")}
                disabled={createCheckout.isPending}
              >
                {createCheckout.isPending ? "Processing…" : "Subscribe — $4.99 / month"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
