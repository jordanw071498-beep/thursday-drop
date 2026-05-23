import { ReactNode } from "react";
import { useAuth } from "@/lib/AuthContext";
import { Redirect } from "wouter";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { profile, loading } = useAuth();
  
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-background text-foreground">Loading...</div>;
  }
  
  if (!profile) {
    return <Redirect to="/login" />;
  }
  
  return <>{children}</>;
}
