import React, { createContext, useContext, useEffect, useState } from 'react';
import { setAuthTokenGetter } from '@workspace/api-client-react';

const TOKEN_KEY = 'thursday_drop_token';

export type AuthProfile = {
  id: string;
  email: string;
  is_pro: boolean;
  is_admin: boolean;
  stripe_customer_id?: string | null;
};

type AuthContextType = {
  profile: AuthProfile | null;
  token: string | null;
  loading: boolean;
  signIn: (token: string, profile: AuthProfile) => void;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (storedToken: string): Promise<AuthProfile | null> => {
    const res = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${storedToken}` },
    });
    if (!res.ok) throw new Error('Invalid session');
    return res.json() as Promise<AuthProfile>;
  };

  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (!stored) {
      setLoading(false);
      return;
    }

    setAuthTokenGetter(() => stored);

    fetchProfile(stored)
      .then((p) => {
        setToken(stored);
        setProfile(p);
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setAuthTokenGetter(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const signIn = (newToken: string, newProfile: AuthProfile) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    setAuthTokenGetter(() => newToken);
    setToken(newToken);
    setProfile(newProfile);
  };

  const signOut = async () => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored) {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${stored}` },
      }).catch(() => {});
    }
    localStorage.removeItem(TOKEN_KEY);
    setAuthTokenGetter(null);
    setToken(null);
    setProfile(null);
  };

  const refreshProfile = async () => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (!stored) return;
    try {
      const p = await fetchProfile(stored);
      setProfile(p);
    } catch {
      // session may have expired
    }
  };

  return (
    <AuthContext.Provider value={{ profile, token, loading, signIn, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
