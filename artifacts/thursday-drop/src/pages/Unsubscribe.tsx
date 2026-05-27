import { useEffect, useState } from "react";
import { useSearch } from "wouter";
import { Link } from "wouter";

export default function Unsubscribe() {
  const search = useSearch();
  const token = new URLSearchParams(search).get("token");
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      return;
    }

    fetch(`/api/auth/unsubscribe?token=${encodeURIComponent(token)}`)
      .then((res) => {
        if (res.ok) setStatus("success");
        else setStatus("error");
      })
      .catch(() => setStatus("error"));
  }, [token]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-md text-center space-y-6">
        <p className="text-primary text-xs tracking-widest uppercase font-sans">Thursday Drop</p>

        {status === "loading" && (
          <>
            <h1 className="font-serif text-4xl text-foreground">One moment…</h1>
            <p className="text-muted-foreground">Processing your request.</p>
          </>
        )}

        {status === "success" && (
          <>
            <h1 className="font-serif text-4xl text-foreground">Unsubscribed</h1>
            <p className="text-muted-foreground leading-relaxed">
              You've been unsubscribed from Thursday Drop drop alerts. You won't receive any more email notifications.
            </p>
            <p className="text-sm text-muted-foreground">
              Changed your mind?{" "}
              <Link href="/account" className="text-primary hover:underline">
                Re-enable alerts in your account.
              </Link>
            </p>
          </>
        )}

        {status === "error" && (
          <>
            <h1 className="font-serif text-4xl text-foreground">Link Expired</h1>
            <p className="text-muted-foreground leading-relaxed">
              This unsubscribe link is invalid or has already been used.
            </p>
            <p className="text-sm text-muted-foreground">
              <Link href="/account" className="text-primary hover:underline">
                Manage alerts from your account instead.
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
