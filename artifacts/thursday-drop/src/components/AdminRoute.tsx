import { ReactNode } from "react";
import { useAuth } from "@/lib/AuthContext";
import { Redirect } from "wouter";

export function AdminRoute({ children }: { children: ReactNode }) {
  const { user, profile, loading } = useAuth();
  
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-background text-foreground">Loading...</div>;
  }
  
  if (!user || !profile?.is_admin) {
    return <Redirect to="/" />;
  }
  
  return <>{children}</>;
}
