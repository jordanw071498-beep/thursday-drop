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
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (!stored) {
      setLoading(false);
      return;
    }

    setAuthTokenGetter(() => stored);

    fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${stored}` },
    })
      .then(res => {
        if (!res.ok) throw new Error('Invalid session');
        return res.json();
      })
      .then((p: AuthProfile) => {
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

  return (
    <AuthContext.Provider value={{ profile, token, loading, signIn, signOut }}>
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
