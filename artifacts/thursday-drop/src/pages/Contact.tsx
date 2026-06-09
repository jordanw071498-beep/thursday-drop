import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle } from "lucide-react";

export default function Contact() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError(null);

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to send message.");
      }

      setSent(true);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-background">
      <div className="max-w-xl mx-auto px-6 py-16 md:py-24">
        <div className="mb-12 text-center space-y-3">
          <h1 className="font-serif text-5xl text-foreground">Contact</h1>
          <p className="text-muted-foreground">
            Have a question, suggestion, or just want to say hello? We read every message.
          </p>
        </div>

        <div className="bg-card border border-border p-8 space-y-8">
          {sent ? (
            <div className="flex flex-col items-center text-center py-6 space-y-4">
              <CheckCircle className="h-10 w-10 text-primary" />
              <p className="font-serif text-2xl text-foreground">Message sent.</p>
              <p className="text-muted-foreground text-sm">
                Thank you — we will get back to you within 48 hours.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground uppercase tracking-widest">Name</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  required
                  className="bg-background rounded-none border-border"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs text-muted-foreground uppercase tracking-widest">Email</label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="bg-background rounded-none border-border"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs text-muted-foreground uppercase tracking-widest">Message</label>
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="What's on your mind?"
                  required
                  rows={5}
                  className="bg-background rounded-none border-border resize-none"
                />
              </div>

              {error && (
                <p className="text-destructive text-sm">{error}</p>
              )}

              <Button
                type="submit"
                disabled={sending}
                className="w-full rounded-none font-bold tracking-widest uppercase"
              >
                {sending ? "Sending..." : "Send Message"}
              </Button>
            </form>
          )}

          <div className="border-t border-border pt-6 space-y-2 text-center">
            <p className="text-sm text-muted-foreground">
              Or email us directly at{" "}
              <a
                href="mailto:thursdaydrop.ca@gmail.com"
                className="text-primary hover:underline"
              >
                thursdaydrop.ca@gmail.com
              </a>
            </p>
            <p className="text-xs text-muted-foreground/60">
              For account or billing issues, please include the email address associated with your Thursday Drop account.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
