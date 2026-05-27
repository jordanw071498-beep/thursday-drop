import { Link } from "wouter";

const FOOTER_LINK =
  "text-xs tracking-[0.12em] uppercase text-muted-foreground hover:text-primary transition-colors whitespace-nowrap";

export function Footer() {
  return (
    <footer className="border-t border-border bg-background mt-auto">
      {/* Top row */}
      <div className="max-w-7xl mx-auto px-6 py-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <Link
          href="/"
          className="font-serif text-sm font-bold tracking-[0.2em] text-primary uppercase whitespace-nowrap"
        >
          Thursday Drop
        </Link>

        <nav className="flex flex-wrap items-center justify-center gap-5">
          <Link href="/release" className={FOOTER_LINK}>Release</Link>
          <Link href="/history" className={FOOTER_LINK}>History</Link>
          <Link href="/pricing" className={FOOTER_LINK}>Pricing</Link>
          <Link href="/faq" className={FOOTER_LINK}>FAQ</Link>
          <Link href="/contact" className={FOOTER_LINK}>Contact</Link>
        </nav>

        <p className="text-xs text-muted-foreground/60 text-center md:text-right whitespace-nowrap">
          Trusted by serious LCBO collectors
        </p>
      </div>

      {/* Bottom row */}
      <div className="border-t border-border/50">
        <div className="max-w-7xl mx-auto px-6 py-3 flex flex-col md:flex-row items-center justify-between gap-2 text-xs text-muted-foreground/50">
          <span>© {new Date().getFullYear()} Thursday Drop</span>
          <span className="text-center">Not affiliated with LCBO or Vintages</span>
          <span>Built in Toronto</span>
        </div>
      </div>
    </footer>
  );
}
