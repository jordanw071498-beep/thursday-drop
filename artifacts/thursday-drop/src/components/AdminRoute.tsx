import { ReactNode } from "react";
import { useAuth } from "@/lib/AuthContext";
import { Redirect } from "wouter";

export function AdminRoute({ children }: { children: ReactNode }) {
  const { profile, loading } = useAuth();
  
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-background text-foreground">Loading...</div>;
  }
  
  if (!profile?.is_admin) {
    return <Redirect to="/" />;
  }
  
  return <>{children}</>;
}
