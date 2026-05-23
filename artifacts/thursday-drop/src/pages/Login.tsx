import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [, setLocation] = useLocation();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
    } else {
      setLocation("/watchlist");
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h2 className="font-serif text-4xl text-primary mb-2">Welcome Back</h2>
          <p className="text-muted-foreground text-lg">Enter your details to access your account.</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6 bg-card p-8 border border-border shadow-xl">
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
              className="bg-background rounded-none"
              autoComplete="current-password"
            />
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full text-primary-foreground font-bold tracking-widest uppercase rounded-none"
          >
            {loading ? "Signing in..." : "Sign In"}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Don't have an account? <Link href="/signup" className="text-primary hover:underline">Sign up</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
