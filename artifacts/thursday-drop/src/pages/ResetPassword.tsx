import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/AuthContext";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [, setLocation] = useLocation();
  const { signIn } = useAuth();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token");
    if (!t) {
      setError("Missing or invalid reset link. Please request a new one.");
    } else {
      setToken(t);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      let data: any = {};
      try { data = await res.json(); } catch { /* non-JSON */ }

      if (!res.ok) {
        setError(data.error ?? `Error (${res.status}). Please try again.`);
        return;
      }

      if (data.token && data.profile) {
        signIn(data.token, data.profile);
        setSuccess(true);
        setTimeout(() => setLocation("/watchlist"), 2000);
      } else {
        setSuccess(true);
      }
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
        <div className="w-full max-w-md text-center space-y-6">
          <div className="bg-card p-8 border border-border shadow-xl space-y-4">
            <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center mx-auto">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-primary">
                <path d="M5 10l4 4 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h2 className="font-serif text-2xl text-primary">Password updated</h2>
            <p className="text-muted-foreground text-sm">Your password has been changed. Redirecting you to your watchlist…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h2 className="font-serif text-4xl text-primary mb-2">New Password</h2>
          <p className="text-muted-foreground text-lg">Choose a strong password for your account.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 bg-card p-8 border border-border shadow-xl">
          {error && (
            <div className="text-destructive text-sm text-center bg-destructive/10 p-3 border border-destructive/20">
              {error}
            </div>
          )}

          {!token && !error && (
            <div className="text-muted-foreground text-sm text-center">
              Loading…
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              disabled={loading || !token}
              className="bg-background rounded-none border-border"
              autoComplete="new-password"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">Min 8 chars with uppercase, number, and special character.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm">Confirm new password</Label>
            <Input
              id="confirm"
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              disabled={loading || !token}
              className="bg-background rounded-none border-border"
              autoComplete="new-password"
            />
          </div>

          <Button
            type="submit"
            disabled={loading || !token}
            className="w-full text-primary-foreground font-bold tracking-widest uppercase rounded-none"
          >
            {loading ? "Updating..." : "Update Password"}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            <Link href="/login" className="text-primary hover:underline">Back to sign in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
