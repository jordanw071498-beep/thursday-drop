import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { useGetSubscriptionInfo, useCancelSubscription } from "@workspace/api-client-react";
import { useLocation, useSearch } from "wouter";
import { useEffect, useState } from "react";

export default function Account() {
  const { profile, signOut, refreshProfile } = useAuth();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const [showSuccess, setShowSuccess] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);

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

  useEffect(() => {
    const params = new URLSearchParams(search);
    if (params.get("checkout") === "success") {
      setShowSuccess(true);
      refreshProfile();
      window.history.replaceState({}, "", "/account");
    }
  }, [search]);

  const planLabel = subInfo?.plan_type === "annual" ? "Pro Annual" : subInfo?.plan_type === "monthly" ? "Pro Monthly" : "Pro";

  const periodEndFormatted = subInfo?.period_end
    ? new Date(subInfo.period_end).toLocaleDateString("en-CA", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <div className="min-h-screen bg-background px-6 py-12">
      <div className="max-w-2xl mx-auto space-y-12">
        <header className="border-b border-border pb-8">
          <h1 className="font-serif text-5xl text-primary mb-4">Account</h1>
          <p className="text-muted-foreground text-lg">Manage your membership and preferences.</p>
        </header>

        {showSuccess && (
          <div className="bg-primary/10 border border-primary px-6 py-4 text-sm font-medium text-primary tracking-wide">
            Your Pro membership is now active. Welcome to Thursday Drop Pro.
          </div>
        )}

        <div className="space-y-8">
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

          {!profile?.is_pro && (
            <div className="bg-card border border-border p-8 space-y-4">
              <h2 className="font-serif text-2xl border-b border-border pb-4">Upgrade</h2>
              <p className="text-sm text-muted-foreground">
                Get unlimited watchlist items, full archive access, and priority alerts.
              </p>
              <Button
                className="rounded-none font-bold tracking-widest uppercase"
                onClick={() => setLocation("/pricing")}
              >
                View Pro Plans
              </Button>
            </div>
          )}

          <div className="bg-card border border-border p-8 space-y-6">
            <h2 className="font-serif text-2xl border-b border-border pb-4">Sign Out</h2>
            <p className="text-sm text-muted-foreground">Log out of your account on this device.</p>
            <Button
              variant="destructive"
              className="rounded-none font-bold tracking-widest uppercase"
              onClick={() => signOut()}
            >
              Sign Out
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
