import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      let data: any = {};
      try { data = await res.json(); } catch { /* non-JSON */ }

      if (!res.ok) {
        setError(data.error ?? `Error (${res.status}). Please try again.`);
        return;
      }

      setSubmitted(true);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
        <div className="w-full max-w-md space-y-8 text-center">
          <div className="bg-card p-8 border border-border shadow-xl space-y-4">
            <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center mx-auto">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-primary">
                <path d="M2 6l8 5 8-5M2 6v10a1 1 0 001 1h14a1 1 0 001-1V6M2 6a1 1 0 011-1h14a1 1 0 011 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h2 className="font-serif text-2xl text-primary">Check your inbox</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              If an account exists for <strong className="text-foreground">{email}</strong>, you'll receive a password reset link shortly. The link expires in 1 hour.
            </p>
            <p className="text-xs text-muted-foreground">Don't see it? Check your spam folder.</p>
          </div>
          <Link href="/login" className="text-sm text-primary hover:underline">
            ← Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h2 className="font-serif text-4xl text-primary mb-2">Forgot Password</h2>
          <p className="text-muted-foreground text-lg">Enter your email and we'll send you a reset link.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 bg-card p-8 border border-border shadow-xl">
          {error && (
            <div className="text-destructive text-sm text-center bg-destructive/10 p-3 border border-destructive/20">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              disabled={loading}
              placeholder="you@example.com"
              className="bg-background rounded-none border-border"
              autoComplete="email"
              autoFocus
            />
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full text-primary-foreground font-bold tracking-widest uppercase rounded-none"
          >
            {loading ? "Sending..." : "Send Reset Link"}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Remember it?{" "}
            <Link href="/login" className="text-primary hover:underline">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
