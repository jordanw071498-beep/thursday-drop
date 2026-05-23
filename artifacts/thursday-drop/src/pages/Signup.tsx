import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Signup() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [, setLocation] = useLocation();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { data, error: signUpError } = await supabase.auth.signUp({ email, password });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    if (data.user) {
      await fetch("/api/profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.user.id}`,
        },
        body: JSON.stringify({ email }),
      });

      if (data.session) {
        setLocation("/watchlist");
      } else {
        setEmailSent(true);
      }
    }

    setLoading(false);
  };

  if (emailSent) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
        <div className="w-full max-w-md space-y-8 text-center bg-card p-8 border border-border">
          <h2 className="font-serif text-4xl text-primary mb-2">Check Your Email</h2>
          <p className="text-muted-foreground text-lg">
            We sent a confirmation link to <strong className="text-foreground">{email}</strong>.
            Click it to activate your account and sign in.
          </p>
          <Link href="/login" className="inline-block mt-6 text-primary hover:underline text-sm">
            Back to login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h2 className="font-serif text-4xl text-primary mb-2">Join the Club</h2>
          <p className="text-muted-foreground text-lg">Create an account to track premium wine releases.</p>
        </div>

        <form onSubmit={handleSignup} className="space-y-6 bg-card p-8 border border-border shadow-xl">
          {error && <div className="text-destructive text-sm text-center bg-destructive/10 p-3 border border-destructive/20">{error}</div>}

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
              minLength={6}
              className="bg-background rounded-none"
              autoComplete="new-password"
            />
            <p className="text-xs text-muted-foreground">Minimum 6 characters</p>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full text-primary-foreground font-bold tracking-widest uppercase rounded-none"
          >
            {loading ? "Creating account..." : "Sign Up"}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Already have an account? <Link href="/login" className="text-primary hover:underline">Log in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
