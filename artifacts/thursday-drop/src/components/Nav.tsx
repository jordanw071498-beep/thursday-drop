import { Link } from "wouter";
import { useAuth } from "@/lib/AuthContext";
import { useState, useEffect } from "react";

export function Nav() {
  const { user, signOut } = useAuth();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-colors duration-300 ${
        scrolled ? "bg-background border-b border-border" : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        <Link href="/" className="font-serif text-2xl font-bold tracking-widest text-primary">
          THURSDAY DROP
        </Link>

        <div className="hidden md:flex items-center gap-8">
          <Link href="/release" className="text-sm tracking-widest uppercase hover:text-primary transition-colors">
            Release
          </Link>
          <Link href="/history" className="text-sm tracking-widest uppercase hover:text-primary transition-colors">
            History
          </Link>
          <Link href="/pricing" className="text-sm tracking-widest uppercase hover:text-primary transition-colors">
            Pricing
          </Link>
        </div>

        <div className="flex items-center gap-6">
          {user ? (
            <>
              <Link href="/watchlist" className="text-sm tracking-widest uppercase hover:text-primary transition-colors">
                Watchlist
              </Link>
              <Link href="/account" className="text-sm tracking-widest uppercase hover:text-primary transition-colors">
                Account
              </Link>
              <button 
                onClick={() => signOut()}
                className="text-sm tracking-widest uppercase hover:text-primary transition-colors"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="text-sm tracking-widest uppercase hover:text-primary transition-colors">
                Login
              </Link>
              <Link href="/signup" className="text-sm tracking-widest uppercase text-background bg-primary px-5 py-2 rounded-sm hover:bg-primary/90 transition-colors">
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
