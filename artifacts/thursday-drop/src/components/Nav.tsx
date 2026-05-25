import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/AuthContext";
import { useState, useEffect } from "react";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const NAV_LINK =
  "text-xs font-light tracking-[0.15em] uppercase text-muted-foreground hover:text-primary transition-colors whitespace-nowrap";

const NAV_LINK_ACTIVE = "text-primary";

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const [location] = useLocation();
  const isActive = location === href || (href !== "/" && location.startsWith(href));
  return (
    <Link href={href} className={`${NAV_LINK} ${isActive ? NAV_LINK_ACTIVE : ""}`}>
      {children}
    </Link>
  );
}

export function Nav() {
  const { profile, signOut } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close menu on navigation
  useEffect(() => {
    setMenuOpen(false);
  }, []);

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-colors duration-300 ${
          scrolled || menuOpen
            ? "bg-background border-b border-border"
            : "bg-background/90 backdrop-blur-sm border-b border-border/40"
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 h-[60px] flex items-center">
          {/* Left: Logo */}
          <div className="flex-none">
            <Link
              href="/"
              className="font-serif text-lg font-bold tracking-[0.2em] text-primary uppercase whitespace-nowrap leading-none"
            >
              Thursday Drop
            </Link>
          </div>

          {/* Center: Public links — desktop only */}
          <div className="hidden md:flex flex-1 items-center justify-center gap-8">
            <NavLink href="/release">Release</NavLink>
            <NavLink href="/history">History</NavLink>
          </div>

          {/* Right: User links — desktop only */}
          <div className="hidden md:flex flex-none items-center">
            {profile ? (
              <div className="flex items-center gap-6">
                <NavLink href="/watchlist">Watchlist</NavLink>
                <NavLink href="/account">Account</NavLink>
                <button
                  onClick={() => setShowSignOutConfirm(true)}
                  className={NAV_LINK}
                >
                  Sign out
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-6">
                <NavLink href="/login">Login</NavLink>
                <Link
                  href="/signup"
                  className="text-xs font-light tracking-[0.15em] uppercase text-background bg-primary px-4 py-2 hover:bg-primary/90 transition-colors whitespace-nowrap"
                >
                  Sign up
                </Link>
              </div>
            )}
          </div>

          {/* Mobile: hamburger — pushed to right */}
          <div className="flex md:hidden flex-1 justify-end">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="text-muted-foreground hover:text-primary transition-colors p-1"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        {menuOpen && (
          <div className="md:hidden border-t border-border bg-background">
            <div className="max-w-7xl mx-auto px-6 py-5 flex flex-col gap-5">
              <MobileNavLink href="/release" onClose={() => setMenuOpen(false)}>Release</MobileNavLink>
              <MobileNavLink href="/history" onClose={() => setMenuOpen(false)}>History</MobileNavLink>
              <div className="w-full h-px bg-border/50" />
              {profile ? (
                <>
                  <MobileNavLink href="/watchlist" onClose={() => setMenuOpen(false)}>Watchlist</MobileNavLink>
                  <MobileNavLink href="/account" onClose={() => setMenuOpen(false)}>Account</MobileNavLink>
                  <button
                    onClick={() => { setMenuOpen(false); setShowSignOutConfirm(true); }}
                    className={NAV_LINK}
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <MobileNavLink href="/login" onClose={() => setMenuOpen(false)}>Login</MobileNavLink>
                  <MobileNavLink href="/signup" onClose={() => setMenuOpen(false)}>Sign up</MobileNavLink>
                </>
              )}
            </div>
          </div>
        )}
      </nav>

      {/* Spacer so content doesn't hide under fixed nav */}
      <div className="h-[60px]" />

      {/* Sign-out confirmation modal */}
      {showSignOutConfirm && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70"
          onClick={(e) => { if (e.target === e.currentTarget) setShowSignOutConfirm(false); }}
        >
          <div className="bg-background border border-border p-8 max-w-sm w-full mx-4 space-y-6">
            <div className="space-y-2">
              <h3 className="font-serif text-2xl text-foreground">Sign out?</h3>
              <p className="text-muted-foreground text-sm">Are you sure you want to sign out of Thursday Drop?</p>
            </div>
            <div className="flex gap-3">
              <Button
                className="flex-1 rounded-none font-bold tracking-widest uppercase"
                onClick={() => { signOut(); setShowSignOutConfirm(false); }}
              >
                Yes, Sign Out
              </Button>
              <Button
                variant="outline"
                className="flex-1 rounded-none font-bold tracking-widest uppercase border-border"
                onClick={() => setShowSignOutConfirm(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function MobileNavLink({
  href,
  children,
  onClose,
}: {
  href: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const [location] = useLocation();
  const isActive = location === href || (href !== "/" && location.startsWith(href));
  return (
    <Link
      href={href}
      onClick={onClose}
      className={`${NAV_LINK} ${isActive ? NAV_LINK_ACTIVE : ""}`}
    >
      {children}
    </Link>
  );
}
