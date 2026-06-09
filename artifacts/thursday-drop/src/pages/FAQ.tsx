import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Link } from "wouter";

const FAQS = [
  {
    q: "What is Thursday Drop?",
    a: "Thursday Drop is a personal alert service for LCBO Vintages collectors. We track every release — Special Offers, Monthly Cellar Features, and Bordeaux Futures — and send you a personalized email when wines on your watchlist become available. No more checking the LCBO website every week.",
  },
  {
    q: "How does the watchlist work?",
    a: "After creating a free account, you can add wines to your watchlist in three ways — track a specific wine and vintage, track a wine across all vintages, or track an entire producer. We alert you any time a match appears in a new Vintages release.",
  },
  {
    q: "When do alerts go out?",
    a: "We scrape the LCBO Vintages website every Thursday at 9am Eastern. If your wine is in the release, your alert goes out the same morning. Pro subscribers also receive a second reminder alert at 7am on the morning ordering opens.",
  },
  {
    q: "What is the difference between Free and Pro?",
    a: "Free accounts can track up to 5 wines and receive standard release alerts. Pro accounts ($4.99/month) get unlimited watchlist items, the 7am morning reminder before ordering opens, weekly curated picks emails, and full access to the wine history archive.",
  },
  {
    q: "How do I cancel my Pro subscription?",
    a: "You can cancel anytime from your Account page. You keep Pro access until the end of your current billing period. No questions asked.",
  },
  {
    q: "Which LCBO releases do you track?",
    a: "We track all three Vintages programs — Special Offers (weekly), Monthly Cellar Features (monthly), and Bordeaux Futures (annual). The scraper automatically discovers new programs each Thursday without any manual input.",
  },
  {
    q: "Is Thursday Drop affiliated with the LCBO?",
    a: "No. Thursday Drop is an independent service built by a Toronto-based collector. We are not affiliated with, endorsed by, or connected to the LCBO or Vintages in any way.",
  },
  {
    q: "How do I suggest a feature or report a problem?",
    a: "Use the contact form on our Contact page or email thursdaydrop.ca@gmail.com directly. We read every message.",
  },
];

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between py-6 text-left group"
      >
        <span className="font-serif text-lg text-primary pr-8 group-hover:text-primary/80 transition-colors">
          {q}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-primary shrink-0 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
        />
      </button>

      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          open ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <p className="text-muted-foreground text-sm leading-relaxed pb-6 pr-8">
          {a}
        </p>
      </div>
    </div>
  );
}

export default function FAQ() {
  return (
    <div className="bg-background">
      <div className="max-w-2xl mx-auto px-6 py-16 md:py-24">
        <div className="mb-12 text-center space-y-3">
          <h1 className="font-serif text-5xl text-foreground">FAQ</h1>
          <p className="text-muted-foreground">
            Common questions about Thursday Drop. Still need help?{" "}
            <Link href="/contact" className="text-primary hover:underline">
              Get in touch.
            </Link>
          </p>
        </div>

        <div className="bg-card border border-border px-8">
          {FAQS.map((item) => (
            <FAQItem key={item.q} q={item.q} a={item.a} />
          ))}
        </div>
      </div>
    </div>
  );
}
