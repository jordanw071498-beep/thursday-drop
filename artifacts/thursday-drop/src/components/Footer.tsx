import { Link } from "wouter";

export function Footer() {
  return (
    <footer className="border-t border-border bg-background mt-auto">
      {/* Top row — logo + social proof */}
      <div className="max-w-7xl mx-auto px-6 py-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <Link
          href="/"
          className="font-serif text-sm font-bold tracking-[0.2em] text-primary uppercase whitespace-nowrap"
        >
          Thursday Drop
        </Link>
        <p className="text-xs text-muted-foreground/60 text-center md:text-right whitespace-nowrap">
          Trusted by serious LCBO collectors
        </p>
      </div>

      {/* Bottom row — legal */}
      <div className="border-t border-border/50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          {/* Left: copyright + links */}
          <div className="flex flex-col gap-1.5 shrink-0">
            <span style={{ fontSize: "0.7rem" }} className="text-muted-foreground/50">
              © {new Date().getFullYear()} Thursday Drop. All rights reserved.
            </span>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {[
                { href: "/faq", label: "FAQ" },
                { href: "/contact", label: "Contact" },
                { href: "/terms", label: "Terms of Service" },
                { href: "/privacy", label: "Privacy Policy" },
              ].map((link, i, arr) => (
                <span key={link.href} className="flex items-center gap-3">
                  <Link
                    href={link.href}
                    style={{ fontSize: "0.65rem" }}
                    className="text-muted-foreground/40 hover:text-primary transition-colors uppercase tracking-wider"
                  >
                    {link.label}
                  </Link>
                  {i < arr.length - 1 && (
                    <span style={{ fontSize: "0.65rem" }} className="text-muted-foreground/25">·</span>
                  )}
                </span>
              ))}
            </div>
          </div>

          {/* Center: legal disclaimer */}
          <p
            style={{ fontSize: "0.6rem" }}
            className="text-muted-foreground/40 text-center max-w-xl leading-relaxed"
          >
            Thursday Drop is an independent service and is not affiliated with, endorsed by, or connected to the LCBO, the Liquor Control Board of Ontario, or the Vintages program in any way. All product names, trademarks, and release information remain the property of their respective owners.
          </p>

          {/* Right */}
          <span style={{ fontSize: "0.7rem" }} className="text-muted-foreground/50 shrink-0 whitespace-nowrap">
            Built in Toronto, Ontario
          </span>
        </div>
      </div>
    </footer>
  );
}
