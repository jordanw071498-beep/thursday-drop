import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/AuthContext";
import { Check, X } from "lucide-react";

type Plan = "free" | "monthly";

const PASSWORD_REQS = [
  { key: "length", label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { key: "upper", label: "One uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { key: "number", label: "One number", test: (p: string) => /[0-9]/.test(p) },
  { key: "special", label: "One special character (!@#$%^&*)", test: (p: string) => /[!@#$%^&*]/.test(p) },
];

export default function Signup() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<Plan>("free");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [, setLocation] = useLocation();
  const { signIn } = useAuth();

  const reqs = PASSWORD_REQS.map((r) => ({ ...r, met: r.test(password) }));
  const allMet = reqs.every((r) => r.met);
  const passwordsMatch = password === confirm && confirm.length > 0;
  const canSubmit = allMet && passwordsMatch && email.trim().length > 0;

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!allMet) {
      setError("Please meet all password requirements.");
      return;
    }
    if (!passwordsMatch) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });

      let data: any = {};
      try { data = await res.json(); } catch { /* non-JSON response */ }

      if (!res.ok) {
        setError(data.error ?? `Server error (${res.status}). Please try again.`);
        return;
      }

      await signIn(data.token, data.profile);

      if (selectedPlan !== "free") {
        try {
          const checkoutRes = await fetch("/api/stripe/create-checkout", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${data.token}`,
            },
            body: JSON.stringify({
              plan: selectedPlan,
              user_id: data.profile.id,
              email: data.profile.email || email.trim().toLowerCase(),
            }),
          });
          if (checkoutRes.ok) {
            const { url } = await checkoutRes.json();
            window.location.href = url;
            return;
          }
        } catch {
          // fallthrough to watchlist if checkout fails
        }
      }

      setLocation("/watchlist");
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background px-4 py-12">
      <div className="w-full max-w-md mx-auto space-y-8">
        <div className="text-center">
          <h2 className="font-serif text-4xl text-primary mb-2">Join the Club</h2>
          <p className="text-muted-foreground text-lg">Create an account to track premium wine releases.</p>
        </div>

        <form onSubmit={handleSignup} className="space-y-6 bg-card p-8 border border-border shadow-xl">
          {error && (
            <div className="text-destructive text-sm text-center bg-destructive/10 p-3 border border-destructive/20">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              disabled={loading}
              className="bg-background rounded-none"
              autoComplete="email"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              disabled={loading}
              className="bg-background rounded-none"
              autoComplete="new-password"
            />
            {password.length > 0 && (
              <ul className="mt-2 space-y-1">
                {reqs.map((r) => (
                  <li key={r.key} className={`flex items-center gap-2 text-xs transition-colors ${r.met ? "text-primary" : "text-muted-foreground"}`}>
                    {r.met
                      ? <Check className="h-3 w-3 shrink-0 text-primary" />
                      : <X className="h-3 w-3 shrink-0 text-muted-foreground/50" />}
                    {r.label}
                  </li>
                ))}
              </ul>
            )}
            {password.length === 0 && (
              <p className="text-xs text-muted-foreground">Min 8 chars with uppercase, number, and special character.</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm">Confirm Password</Label>
            <Input
              id="confirm"
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              disabled={loading}
              className="bg-background rounded-none"
              autoComplete="new-password"
            />
            {confirm.length > 0 && (
              <p className={`text-xs flex items-center gap-1.5 ${passwordsMatch ? "text-primary" : "text-destructive"}`}>
                {passwordsMatch
                  ? <><Check className="h-3 w-3" /> Passwords match</>
                  : <><X className="h-3 w-3" /> Passwords do not match</>}
              </p>
            )}
          </div>

          <Button
            type="submit"
            disabled={loading || !canSubmit}
            className="w-full text-primary-foreground font-bold tracking-widest uppercase rounded-none"
          >
            {loading
              ? selectedPlan !== "free" ? "Creating account…" : "Creating account…"
              : selectedPlan !== "free" ? "Create Account & Subscribe" : "Create Free Account"}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="text-primary hover:underline">Log in</Link>
          </p>
        </form>

        {/* Plan selection */}
        <div className="space-y-4">
          <div className="text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-widest">Choose your plan</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Free */}
            <button
              type="button"
              onClick={() => setSelectedPlan("free")}
              className={`p-4 border text-left transition-colors ${selectedPlan === "free" ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/50"}`}
            >
              <div className="flex items-start justify-between mb-2">
                <p className="text-xs text-muted-foreground uppercase tracking-widest">Free</p>
                {selectedPlan === "free" && <Check className="h-4 w-4 text-primary shrink-0" />}
              </div>
              <p className="text-xl font-light">$0</p>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">5 watchlist items</p>
            </button>

            {/* Monthly */}
            <button
              type="button"
              onClick={() => setSelectedPlan("monthly")}
              className={`p-4 border text-left transition-colors relative ${selectedPlan === "monthly" ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/50"}`}
            >
              <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-xs font-bold tracking-widest py-0.5 px-2">
                Pro
              </div>
              <div className="flex items-start justify-between mb-2">
                <p className="text-xs text-muted-foreground uppercase tracking-widest">Monthly</p>
                {selectedPlan === "monthly" && <Check className="h-4 w-4 text-primary shrink-0" />}
              </div>
              <p className="text-xl font-light">$4.99<span className="text-xs text-muted-foreground">/mo</span></p>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">Unlimited watchlist</p>
            </button>
          </div>

          {selectedPlan !== "free" && (
            <p className="text-center text-xs text-muted-foreground">
              You'll create your account first, then be redirected to checkout to complete your {selectedPlan} subscription.
            </p>
          )}

          <div className="bg-card border border-border p-6">
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                Drop alerts
              </div>
              <div className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                {selectedPlan !== "free" ? "Unlimited watchlist" : "Up to 5 items"}
              </div>
              <div className={`flex items-center gap-2 ${selectedPlan === "free" ? "opacity-35 line-through" : ""}`}>
                <Check className={`h-3.5 w-3.5 shrink-0 ${selectedPlan !== "free" ? "text-primary" : "text-muted-foreground"}`} />
                Full archive access
              </div>
              <div className={`flex items-center gap-2 ${selectedPlan === "free" ? "opacity-35 line-through" : ""}`}>
                <Check className={`h-3.5 w-3.5 shrink-0 ${selectedPlan !== "free" ? "text-primary" : "text-muted-foreground"}`} />
                Category tracking
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
