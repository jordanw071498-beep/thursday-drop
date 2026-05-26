import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { useGetSubscriptionInfo, useCancelSubscription, useCreateCheckout } from "@workspace/api-client-react";
import { useLocation, useSearch } from "wouter";
import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";

export default function Account() {
  const { profile, signOut, refreshProfile } = useAuth();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const [showSuccess, setShowSuccess] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: subInfo, refetch: refetchSubInfo } = useGetSubscriptionInfo();

  const cancelSubscription = useCancelSubscription({
    mutation: {
      onSuccess: async () => {
        setCancelConfirm(false);
        await refreshProfile();
        refetchSubInfo();
      },
    },
  });

  const createCheckout = useCreateCheckout();

  const handleSubscribe = (plan: "monthly" | "annual") => {
    if (!profile) {
      setLocation("/login");
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

  // After checkout, poll refreshProfile to pick up is_pro once webhook fires
  useEffect(() => {
    const params = new URLSearchParams(search);
    if (params.get("checkout") === "success") {
      setShowSuccess(true);
      window.history.replaceState({}, "", "/account");

      let attempts = 0;
      const poll = async () => {
        await refreshProfile();
        attempts++;
        if (attempts < 6) {
          pollRef.current = setTimeout(poll, 2000);
        }
      };
      poll();
    }
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const planLabel =
    subInfo?.plan_type === "annual"
      ? "Pro Annual"
      : subInfo?.plan_type === "monthly"
        ? "Pro Monthly"
        : "Pro";

  const periodEndFormatted = subInfo?.period_end
    ? new Date(subInfo.period_end).toLocaleDateString("en-CA", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Account" subtitle="Manage your membership and preferences." />
      <div className="max-w-2xl mx-auto px-6 py-10 space-y-12">

        {showSuccess && (
          <div className="bg-primary/10 border border-primary px-6 py-4 text-sm font-medium text-primary tracking-wide">
            Your Pro membership is now active. Welcome to Thursday Drop Pro.
          </div>
        )}

        <div className="space-y-8">
          {/* Profile */}
          <div className="bg-card border border-border p-8 space-y-6">
            <h2 className="font-serif text-2xl border-b border-border pb-4">Profile</h2>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="text-muted-foreground uppercase tracking-widest">Email</div>
              <div className="col-span-2 font-medium">{profile?.email}</div>

              <div className="text-muted-foreground uppercase tracking-widest">Plan</div>
              <div className="col-span-2">
                <span
                  className={`inline-block px-2 py-1 text-xs font-bold tracking-widest uppercase ${
                    profile?.is_pro
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {profile?.is_pro ? planLabel : "Free"}
                </span>
              </div>

              {profile?.is_pro && periodEndFormatted && (
                <>
                  <div className="text-muted-foreground uppercase tracking-widest">
                    {subInfo?.cancel_at_period_end ? "Access Until" : "Renews"}
                  </div>
                  <div className="col-span-2 font-medium">{periodEndFormatted}</div>
                </>
              )}
            </div>
          </div>

          {/* Pro subscription management */}
          {profile?.is_pro && (
            <div className="bg-card border border-border p-8 space-y-6">
              <h2 className="font-serif text-2xl border-b border-border pb-4">Subscription</h2>

              {subInfo?.cancel_at_period_end ? (
                <p className="text-sm text-muted-foreground">
                  Your subscription has been cancelled. You'll retain Pro access until{" "}
                  <span className="text-foreground font-medium">{periodEndFormatted}</span>.
                </p>
              ) : cancelConfirm ? (
                <div className="space-y-4">
                  <p className="text-sm text-foreground">
                    Are you sure you want to cancel? You'll lose Pro access immediately.
                  </p>
                  <div className="flex gap-3">
                    <Button
                      variant="destructive"
                      className="rounded-none font-bold tracking-widest uppercase"
                      onClick={() => cancelSubscription.mutate()}
                      disabled={cancelSubscription.isPending}
                    >
                      {cancelSubscription.isPending ? "Cancelling…" : "Yes, Cancel"}
                    </Button>
                    <Button
                      variant="outline"
                      className="rounded-none font-bold tracking-widest uppercase border-border"
                      onClick={() => setCancelConfirm(false)}
                    >
                      Keep Pro
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    You're on the{" "}
                    <span className="text-foreground font-medium">{planLabel}</span> plan.
                    {periodEndFormatted && ` Renews ${periodEndFormatted}.`}
                  </p>
                  <Button
                    variant="outline"
                    className="rounded-none font-bold tracking-widest uppercase border-border text-muted-foreground hover:text-foreground"
                    onClick={() => setCancelConfirm(true)}
                  >
                    Cancel Subscription
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Upgrade prompt for Free users */}
          {!profile?.is_pro && (
            <div className="bg-card border border-primary/30 p-8 space-y-6">
              <div>
                <h2 className="font-serif text-2xl border-b border-border pb-4 mb-4">Upgrade to Pro</h2>
                <p className="text-sm text-muted-foreground">
                  Unlock unlimited watchlist items, full historical archive, and priority drop alerts.
                </p>
              </div>

              {/* Equal-height cards: items-stretch + flex-col on each card */}
              <div className="grid sm:grid-cols-2 gap-6 items-stretch">
                {/* Monthly */}
                <div className="border border-primary p-6 flex flex-col relative overflow-hidden">
                  <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-xs font-bold tracking-widest uppercase py-1 px-3">
                    Popular
                  </div>
                  <div className="flex-1 space-y-4">
                    <div>
                      <p className="text-sm text-muted-foreground uppercase tracking-widest">Monthly</p>
                      <p className="text-3xl font-light mt-1">
                        $4.99 <span className="text-sm text-muted-foreground">/ mo</span>
                      </p>
                    </div>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-primary shrink-0" /> Unlimited watchlist
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-primary shrink-0" /> Full archive access
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-primary shrink-0" /> Priority alerts
                      </li>
                    </ul>
                  </div>
                  <div className="mt-6">
                    <Button
                      className="w-full rounded-none font-bold tracking-widest uppercase"
                      onClick={() => handleSubscribe("monthly")}
                      disabled={createCheckout.isPending}
                    >
                      {createCheckout.isPending ? "Processing…" : "Subscribe Monthly"}
                    </Button>
                  </div>
                </div>

                {/* Annual */}
                <div className="border border-border p-6 flex flex-col">
                  <div className="flex-1 space-y-4">
                    <div>
                      <p className="text-sm text-muted-foreground uppercase tracking-widest">Annual</p>
                      <p className="text-3xl font-light mt-1">
                        $49.99 <span className="text-sm text-muted-foreground">/ yr</span>
                      </p>
                      <p className="text-xs text-primary mt-1">Save 17%</p>
                    </div>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-primary shrink-0" /> Everything in Monthly
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-primary shrink-0" /> Best value
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-primary shrink-0" /> 2 months free
                      </li>
                    </ul>
                  </div>
                  <div className="mt-6">
                    <Button
                      variant="outline"
                      className="w-full rounded-none font-bold tracking-widest uppercase border-border"
                      onClick={() => handleSubscribe("annual")}
                      disabled={createCheckout.isPending}
                    >
                      {createCheckout.isPending ? "Processing…" : "Subscribe Annual"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Sign Out */}
          <div className="bg-card border border-border p-8 space-y-6">
            <h2 className="font-serif text-2xl border-b border-border pb-4">Sign Out</h2>
            <p className="text-sm text-muted-foreground">Log out of your account on this device.</p>
            <Button
              variant="outline"
              className="rounded-none font-bold tracking-widest uppercase border-border text-muted-foreground hover:text-foreground"
              onClick={() => setShowSignOutConfirm(true)}
            >
              Sign Out
            </Button>
          </div>
        </div>
      </div>

      {/* Sign-out confirmation modal */}
      {showSignOutConfirm && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70"
          onClick={(e) => { if (e.target === e.currentTarget) setShowSignOutConfirm(false); }}
        >
          <div className="bg-background border border-border p-8 max-w-sm w-full mx-4 space-y-6">
            <div className="space-y-2">
              <h3 className="font-serif text-2xl text-foreground">Sign out?</h3>
              <p className="text-muted-foreground text-sm">Are you sure you want to sign out of Thursday Drop?</p>
            </div>
            <div className="flex gap-3">
              <Button
                className="flex-1 rounded-none font-bold tracking-widest uppercase"
                onClick={() => { signOut(); setShowSignOutConfirm(false); }}
              >
                Yes, Sign Out
              </Button>
              <Button
                variant="outline"
                className="flex-1 rounded-none font-bold tracking-widest uppercase border-border"
                onClick={() => setShowSignOutConfirm(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
