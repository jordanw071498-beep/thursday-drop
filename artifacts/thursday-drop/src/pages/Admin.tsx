import { useGetAdminStats, useTriggerScrape, useSendAlerts, useSendWeeklyPicks } from "@workspace/api-client-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/AuthContext";
import { AlertTriangle, CheckCircle, Clock, FlaskConical, ShieldCheck, User, List, Database } from "lucide-react";

interface AlertRow {
  id: number;
  wine_name: string;
  user_email: string;
  program_label: string;
  release_opens_at: string | null;
  announcement_alert_sent: boolean;
  sent_at: string | null;
  morning_alert_sent: boolean;
  morning_sent_at: string | null;
  is_test: boolean;
  created_at: string;
}

interface UserRow {
  id: string;
  email: string;
  is_pro: boolean;
  is_admin: boolean;
  created_at: string;
}

interface WatchlistItem {
  id: number;
  wine_name: string;
  producer: string | null;
  vintage: string | null;
  match_type: string;
  created_at: string;
}

interface WatchlistCategory {
  id: number;
  category: string;
  created_at: string;
}

interface WatchlistUser {
  user_id: string;
  email: string;
  is_pro: boolean;
  items: WatchlistItem[];
  categories: WatchlistCategory[];
}

function useAdminFetch<T>(path: string, token: string | null) {
  return useQuery<T>({
    queryKey: [path, token],
    queryFn: async () => {
      const res = await fetch(`/api${path}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    enabled: !!token,
    staleTime: 15_000,
  });
}

function useAdminPost(path: string, token: string | null) {
  return useMutation({
    mutationFn: async (body?: Record<string, unknown>) => {
      const res = await fetch(`/api${path}`, {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      return res.json();
    },
  });
}

function SentBadge({ sent, label, date }: { sent: boolean; label: string; date?: string | null }) {
  if (sent) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
        <CheckCircle className="h-3.5 w-3.5" />
        {label}
        {date && <span className="text-muted-foreground">{new Date(date).toLocaleTimeString()}</span>}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-amber-400">
      <Clock className="h-3.5 w-3.5" />
      Pending
    </span>
  );
}

/** Inline confirmation dialog shown when about to send real alerts */
function ConfirmSendDialog({
  realAlerts,
  realUsers,
  onConfirm,
  onCancel,
  isSending,
}: {
  realAlerts: number;
  realUsers: number;
  onConfirm: () => void;
  onCancel: () => void;
  isSending: boolean;
}) {
  return (
    <div className="border border-amber-700/60 bg-amber-950/30 p-4 space-y-3">
      <div className="flex items-start gap-2 text-amber-400">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <p className="text-sm font-medium">
          This will send emails to <strong>{realUsers} real {realUsers === 1 ? "user" : "users"}</strong> ({realAlerts} alert{realAlerts !== 1 && "s"} total). Are you sure?
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={onConfirm}
          disabled={isSending}
          className="rounded-none tracking-widest uppercase bg-amber-700 hover:bg-amber-600 text-white text-xs h-7 px-4"
        >
          {isSending ? "Sending..." : "Yes, Send Now"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onCancel}
          disabled={isSending}
          className="rounded-none tracking-widest uppercase text-xs h-7 px-4"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

export default function Admin() {
  const { profile, token, refreshProfile } = useAuth();

  const { data: stats, refetch: refetchStats } = useGetAdminStats();
  const { data: alertsData, refetch: refetchAlerts } = useAdminFetch<{ alerts: AlertRow[] }>("/admin/alerts", token);
  const { data: usersData, refetch: refetchUsers } = useAdminFetch<{ users: UserRow[] }>("/admin/users", token);
  const { data: watchlistsData } = useAdminFetch<{ users: WatchlistUser[]; total_items: number; total_categories: number; total_users: number }>("/admin/watchlists", token);

  const sendAlerts = useSendAlerts();
  const sendWeeklyPicks = useSendWeeklyPicks();
  const sendMorningAlerts = useAdminPost("/admin/send-morning-alerts", token);
  const sendTestAlert = useAdminPost("/admin/test-alert", token);
  const sendTestModeAlerts = useAdminPost("/admin/send-test-mode-alerts", token);
  const importWikidata = useAdminPost("/admin/import-wikidata", token);
  const seedSpirits = useAdminPost("/admin/seed-spirits", token);
  const { toast } = useToast();

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState("");

  // Test Mode state
  const [testMode, setTestMode] = useState(false);

  // Confirmation dialog state for Send All Pending
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSendingConfirmed, setIsSendingConfirmed] = useState(false);

  const alerts = alertsData?.alerts ?? [];
  const users = usersData?.users ?? [];
  const morningPending = alerts.filter((a) => !a.morning_alert_sent && a.release_opens_at).length;

  // Use server-computed counts from stats (accurate, not derived from the 100-row limit)
  const pendingRealAlerts = stats?.pending_real_alerts ?? 0;
  const pendingTestAlerts = stats?.pending_test_alerts ?? 0;
  const pendingRealUsers = stats?.pending_real_users ?? 0;

  const handleScrape = () => {
    // Use the generated hook for scrape but pass testMode via body through raw fetch
    fetch("/api/admin/scrape", {
      method: "POST",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ testMode }),
    })
      .then((r) => r.json())
      .then((data: any) => {
        const modeLabel = testMode ? " [TEST MODE]" : "";
        toast({ title: `Scrape Complete${modeLabel}`, description: data?.message ?? "Done." });
        refetchStats();
        refetchAlerts();
      })
      .catch(() => toast({ title: "Scrape failed", variant: "destructive" }));
  };

  const handleAlerts = () => {
    if (pendingRealAlerts === 0) {
      toast({ title: "No pending real alerts" });
      return;
    }
    setShowConfirm(true);
  };

  const handleConfirmedSend = () => {
    setIsSendingConfirmed(true);
    fetch("/api/admin/send-alerts", {
      method: "POST",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ confirm: true }),
    })
      .then((r) => r.json())
      .then((data: any) => {
        toast({ title: "Announcement Alerts Sent", description: data?.message ?? "Done." });
        setShowConfirm(false);
        refetchStats();
        refetchAlerts();
      })
      .catch(() => toast({ title: "Failed to send", variant: "destructive" }))
      .finally(() => setIsSendingConfirmed(false));
  };

  const handleMorningAlerts = () => {
    sendMorningAlerts.mutate(undefined, {
      onSuccess: (data: any) => {
        toast({ title: "Morning Alerts Sent", description: data?.message ?? "Done." });
        refetchAlerts();
      },
    });
  };

  const handleSendTestModeAlerts = () => {
    sendTestModeAlerts.mutate(undefined, {
      onSuccess: (data: any) => {
        toast({ title: "Test Alerts Sent to Admin", description: data?.message ?? "Check your inbox." });
        refetchStats();
        refetchAlerts();
      },
      onError: () => {
        toast({ title: "Failed to send test alerts", variant: "destructive" });
      },
    });
  };

  const handleTestAlert = () => {
    if (!testEmail.includes("@")) {
      toast({ title: "Enter a valid email address first", variant: "destructive" });
      return;
    }
    sendTestAlert.mutate({ email: testEmail }, {
      onSuccess: (data: any) => {
        toast({ title: "Test Emails Sent", description: data?.message ?? "Check your inbox." });
      },
      onError: () => {
        toast({ title: "Test Failed", description: "Check server logs.", variant: "destructive" });
      },
    });
  };

  const handleWeeklyPicks = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject || !body) return;
    sendWeeklyPicks.mutate(
      { data: { subject, body } },
      {
        onSuccess: () => {
          toast({ title: "Newsletter Sent" });
          setSubject("");
          setBody("");
        },
      },
    );
  };

  const handleTogglePro = async (user: UserRow) => {
    if (!token) return;
    setTogglingId(user.id);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/toggle-pro`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed");
      await refetchUsers();
      if (user.id === profile?.id) await refreshProfile();
      toast({ title: `Pro ${user.is_pro ? "removed from" : "granted to"} ${user.email}` });
    } catch {
      toast({ title: "Failed to toggle Pro", variant: "destructive" });
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background px-6 py-12">
      <div className="max-w-6xl mx-auto space-y-12">
        <header className="border-b border-border pb-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="font-serif text-5xl text-primary mb-4">Command Center</h1>
              <p className="text-muted-foreground text-lg">System operations and administration.</p>
            </div>

            {/* Test Mode toggle */}
            <div className={`flex items-center gap-3 border p-4 shrink-0 ${testMode ? "border-amber-600/60 bg-amber-950/30" : "border-border bg-card"}`}>
              <FlaskConical className={`h-5 w-5 ${testMode ? "text-amber-400" : "text-muted-foreground"}`} />
              <div>
                <p className={`text-sm font-medium tracking-widest uppercase ${testMode ? "text-amber-400" : "text-muted-foreground"}`}>
                  Test Mode {testMode ? "ON" : "OFF"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {testMode ? "Scraper alerts marked as test — never sent to real users" : "Scraper alerts go to real users"}
                </p>
              </div>
              <button
                onClick={() => { setTestMode((v) => !v); setShowConfirm(false); }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${testMode ? "bg-amber-600" : "bg-muted"}`}
                aria-label="Toggle Test Mode"
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${testMode ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>
          </div>
        </header>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="bg-card border border-border rounded-none h-12 w-full justify-start p-0 mb-8 overflow-x-auto flex-nowrap shrink-0">
            {[
              { value: "overview", label: "Overview" },
              { value: "scraper", label: "Scraper" },
              { value: "alerts", label: "Alerts" },
              { value: "users", label: "Users" },
              { value: "watchlists", label: "Watchlists" },
              { value: "newsletter", label: "Newsletter" },
            ].map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="rounded-none h-full px-5 whitespace-nowrap shrink-0 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs tracking-widest uppercase"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Overview */}
          <TabsContent value="overview">
            <div className="space-y-10">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard title="Total Subscribers" value={stats?.total_subscribers} />
                <StatCard title="Pro Subscribers" value={stats?.pro_subscribers} />
                <StatCard title="MRR" value={stats?.mrr ? `$${stats.mrr}` : undefined} />
                <StatCard title="Total Wines" value={stats?.total_wines} />
                <StatCard title="Total Releases" value={stats?.total_releases} />
                <StatCard title="Real Alerts Pending" value={pendingRealAlerts} highlight={pendingRealAlerts > 0} />
                <StatCard title="Test Alerts Pending" value={pendingTestAlerts} muted />
                <StatCard title="Morning Alerts Pending" value={morningPending} />
              </div>

              {/* User list */}
              <div className="bg-card border border-border">
                <div className="p-6 border-b border-border">
                  <h2 className="font-serif text-2xl">Users</h2>
                  <p className="text-sm text-muted-foreground mt-1">{users.length} accounts — grant or remove Pro access below</p>
                </div>
                {users.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-xs uppercase tracking-widest text-muted-foreground">
                          <th className="text-left px-6 py-3">Email</th>
                          <th className="text-left px-4 py-3">Status</th>
                          <th className="text-left px-4 py-3">Joined</th>
                          <th className="text-left px-4 py-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {users.map((user) => (
                          <tr key={user.id} className="hover:bg-background/30 transition-colors">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                {user.is_admin ? (
                                  <ShieldCheck className="h-3.5 w-3.5 text-primary shrink-0" />
                                ) : (
                                  <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                )}
                                <span className="text-foreground">{user.email}</span>
                                {user.id === profile?.id && (
                                  <span className="text-xs text-muted-foreground">(you)</span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex gap-2 flex-wrap">
                                {user.is_pro && (
                                  <span className="text-xs px-2 py-0.5 bg-primary/20 text-primary border border-primary/30 uppercase tracking-widest">Pro</span>
                                )}
                                {user.is_admin && (
                                  <span className="text-xs px-2 py-0.5 bg-amber-900/30 text-amber-400 border border-amber-700/30 uppercase tracking-widest">Admin</span>
                                )}
                                {!user.is_pro && !user.is_admin && (
                                  <span className="text-xs text-muted-foreground">Free</span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-4 text-muted-foreground text-xs">
                              {new Date(user.created_at).toLocaleDateString("en-CA")}
                            </td>
                            <td className="px-4 py-4">
                              <Button
                                size="sm"
                                variant={user.is_pro ? "outline" : "default"}
                                disabled={togglingId === user.id}
                                onClick={() => handleTogglePro(user)}
                                className="rounded-none text-xs tracking-widest uppercase h-7 px-3"
                              >
                                {togglingId === user.id ? "..." : user.is_pro ? "Remove Pro" : "Grant Pro"}
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-16 text-center text-muted-foreground">No users yet.</div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* Scraper */}
          <TabsContent value="scraper">
            <div className="bg-card border border-border p-8 space-y-6">
              <h2 className="font-serif text-2xl">Manual Data Sync</h2>
              <p className="text-muted-foreground">Trigger a manual scrape of LCBO Vintages to check for new releases.</p>

              {testMode && (
                <div className="flex items-start gap-2 border border-amber-700/60 bg-amber-950/30 p-4 text-amber-400">
                  <FlaskConical className="h-4 w-4 mt-0.5 shrink-0" />
                  <p className="text-sm">
                    <strong>Test Mode is ON.</strong> Any alerts generated by this scrape will be marked as test alerts and will never be sent to real users. Use "Send Test Alert to Admin" in the Alerts tab to review them.
                  </p>
                </div>
              )}

              <Button
                onClick={handleScrape}
                className={`rounded-none font-bold tracking-widest uppercase ${testMode ? "bg-amber-700 hover:bg-amber-600 text-white" : ""}`}
              >
                {testMode ? "Run Scraper (Test Mode)" : "Run Scraper Now"}
              </Button>
            </div>

            {/* Suggestions corpus */}
            <div className="bg-card border border-border p-8 space-y-6">
              <div className="flex items-start gap-3">
                <Database className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <h2 className="font-serif text-2xl">Autocomplete Corpus</h2>
                  <p className="text-muted-foreground mt-1 text-sm">
                    Import producer names from Wikidata (CC0) — wineries, distilleries, and breweries. Existing entries are deduplicated; popularity counts are preserved.
                  </p>
                </div>
              </div>

              {importWikidata.data && (
                <div className="border border-emerald-700/40 bg-emerald-950/20 p-4 text-sm space-y-1">
                  <p className="text-emerald-400 font-medium">
                    Import complete — {(importWikidata.data as any).total?.toLocaleString() ?? 0} entries processed
                  </p>
                  {((importWikidata.data as any).by_entity ?? []).map((e: any) => (
                    <p key={e.qid} className="text-muted-foreground text-xs">
                      {e.label}: {e.fetched?.toLocaleString() ?? 0} fetched
                      {e.error && <span className="text-red-400 ml-2">({e.error})</span>}
                    </p>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={() =>
                    importWikidata.mutate(undefined, {
                      onSuccess: (data: any) => {
                        if (data?.success === false) {
                          toast({ title: "Wikidata import failed", description: data.error, variant: "destructive" });
                        } else {
                          toast({ title: "Wikidata Import Complete", description: `${data?.total?.toLocaleString() ?? 0} producer entries processed` });
                        }
                      },
                      onError: () => toast({ title: "Wikidata import failed", variant: "destructive" }),
                    })
                  }
                  disabled={importWikidata.isPending}
                  variant="outline"
                  className="rounded-none tracking-widest uppercase font-bold"
                >
                  {importWikidata.isPending ? "Importing from Wikidata…" : "Import Wikidata Producers"}
                </Button>

                <Button
                  onClick={() =>
                    seedSpirits.mutate(undefined, {
                      onSuccess: (data: any) => {
                        if (data?.success === false) {
                          toast({ title: "Spirits seed failed", description: data.error, variant: "destructive" });
                        } else {
                          toast({ title: "Spirits Seed Complete", description: `${data?.inserted?.toLocaleString() ?? 0} Scotch/spirits entries processed` });
                        }
                      },
                      onError: () => toast({ title: "Spirits seed failed", variant: "destructive" }),
                    })
                  }
                  disabled={seedSpirits.isPending}
                  variant="outline"
                  className="rounded-none tracking-widest uppercase font-bold"
                >
                  {seedSpirits.isPending ? "Seeding Spirits…" : "Seed Scotch & Spirits"}
                </Button>
              </div>

              {seedSpirits.data && (
                <p className="text-sm text-emerald-400">
                  Spirits seed complete — {(seedSpirits.data as any).inserted?.toLocaleString() ?? 0} entries processed
                </p>
              )}
            </div>
          </TabsContent>

          {/* Alerts */}
          <TabsContent value="alerts">
            <div className="space-y-8">
              {/* Alert counts summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-card border border-border p-4">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Real Pending</p>
                  <p className={`font-mono text-2xl font-bold ${pendingRealAlerts > 0 ? "text-foreground" : "text-muted-foreground"}`}>
                    {pendingRealAlerts}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{pendingRealUsers} user{pendingRealUsers !== 1 && "s"}</p>
                </div>
                <div className="bg-card border border-amber-900/40 p-4">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Test Pending</p>
                  <p className={`font-mono text-2xl font-bold ${pendingTestAlerts > 0 ? "text-amber-400" : "text-muted-foreground"}`}>
                    {pendingTestAlerts}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">admin only</p>
                </div>
                <div className="bg-card border border-border p-4">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Morning Pending</p>
                  <p className="font-mono text-2xl font-bold text-muted-foreground">{morningPending}</p>
                  <p className="text-xs text-muted-foreground mt-1">today</p>
                </div>
                <div className="bg-card border border-border p-4">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Total in Queue</p>
                  <p className="font-mono text-2xl font-bold text-muted-foreground">{alerts.length}</p>
                  <p className="text-xs text-muted-foreground mt-1">all time</p>
                </div>
              </div>

              {/* Action cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Announcement alerts */}
                <div className="bg-card border border-border p-6 space-y-4">
                  <div>
                    <h3 className="font-serif text-lg mb-1">Announcement Alerts</h3>
                    <p className="text-muted-foreground text-sm">Send to real users. Requires confirmation.</p>
                  </div>
                  <div className="font-mono text-sm">
                    <span className={pendingRealAlerts > 0 ? "text-foreground" : "text-muted-foreground"}>
                      {pendingRealAlerts} real pending
                    </span>
                    {pendingTestAlerts > 0 && (
                      <span className="text-amber-400 ml-2">· {pendingTestAlerts} test</span>
                    )}
                  </div>

                  {showConfirm ? (
                    <ConfirmSendDialog
                      realAlerts={pendingRealAlerts}
                      realUsers={pendingRealUsers}
                      onConfirm={handleConfirmedSend}
                      onCancel={() => setShowConfirm(false)}
                      isSending={isSendingConfirmed}
                    />
                  ) : (
                    <Button
                      onClick={handleAlerts}
                      disabled={pendingRealAlerts === 0}
                      size="sm"
                      className="rounded-none tracking-widest uppercase w-full"
                    >
                      Send All Pending ({pendingRealAlerts})
                    </Button>
                  )}
                </div>

                {/* Test mode alerts */}
                <div className="bg-card border border-amber-900/40 p-6 space-y-4">
                  <div>
                    <h3 className="font-serif text-lg mb-1 flex items-center gap-2">
                      <FlaskConical className="h-4 w-4 text-amber-400" />
                      Test Alert to Admin
                    </h3>
                    <p className="text-muted-foreground text-sm">Send queued test alerts only to your admin email. Never touches real users.</p>
                  </div>
                  <div className="font-mono text-sm text-amber-400">
                    {pendingTestAlerts} test alert{pendingTestAlerts !== 1 && "s"} queued
                  </div>
                  <Button
                    onClick={handleSendTestModeAlerts}
                    disabled={sendTestModeAlerts.isPending || pendingTestAlerts === 0}
                    size="sm"
                    variant="outline"
                    className="rounded-none tracking-widest uppercase w-full border-amber-700 text-amber-400 hover:bg-amber-900/20 disabled:opacity-40"
                  >
                    {sendTestModeAlerts.isPending ? "Sending..." : "Send Test Alert to Admin"}
                  </Button>
                </div>

                {/* Morning alerts */}
                <div className="bg-card border border-border p-6 space-y-4">
                  <div>
                    <h3 className="font-serif text-lg mb-1">Morning Alerts</h3>
                    <p className="text-muted-foreground text-sm">Sent at 7am on the Thursday a wine opens for ordering.</p>
                  </div>
                  <div className="font-mono text-sm text-muted-foreground">
                    {morningPending} pending today
                  </div>
                  <Button
                    onClick={handleMorningAlerts}
                    disabled={sendMorningAlerts.isPending}
                    size="sm"
                    variant="outline"
                    className="rounded-none tracking-widest uppercase w-full"
                  >
                    {sendMorningAlerts.isPending ? "Sending..." : "Send All Pending"}
                  </Button>
                </div>
              </div>

              {/* Template test */}
              <div className="bg-card border border-border p-6 space-y-4">
                <div>
                  <h3 className="font-serif text-lg mb-1">Test Email Templates</h3>
                  <p className="text-muted-foreground text-sm">Send both email templates to any address to preview them. This does not touch the alerts queue.</p>
                </div>
                <div className="flex gap-3 items-end">
                  <Input
                    type="email"
                    placeholder="your@email.com"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    className="bg-background rounded-none border-border text-sm max-w-xs"
                  />
                  <Button
                    onClick={handleTestAlert}
                    disabled={sendTestAlert.isPending || !testEmail}
                    size="sm"
                    variant="outline"
                    className="rounded-none tracking-widest uppercase border-border hover:bg-muted disabled:opacity-40"
                  >
                    {sendTestAlert.isPending ? "Sending..." : "Send Template Preview"}
                  </Button>
                </div>
              </div>

              {/* Alert queue table */}
              {alerts.length > 0 ? (
                <div className="bg-card border border-border">
                  <div className="p-6 border-b border-border flex items-center justify-between">
                    <div>
                      <h3 className="font-serif text-xl">Alert Queue</h3>
                      <p className="text-sm text-muted-foreground mt-1">{alerts.length} alerts (most recent 100)</p>
                    </div>
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-foreground/40" />real</span>
                      <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-amber-500" />test</span>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-xs uppercase tracking-widest text-muted-foreground">
                          <th className="text-left px-6 py-3">Wine</th>
                          <th className="text-left px-4 py-3">User</th>
                          <th className="text-left px-4 py-3">Program</th>
                          <th className="text-left px-4 py-3">Announcement</th>
                          <th className="text-left px-4 py-3">Morning</th>
                          <th className="text-left px-4 py-3">Type</th>
                          <th className="text-left px-4 py-3">Created</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {alerts.map((alert) => (
                          <tr key={alert.id} className={`hover:bg-background/30 transition-colors ${alert.is_test ? "bg-amber-950/10" : ""}`}>
                            <td className="px-6 py-3 max-w-[220px]">
                              <span className="line-clamp-1 text-foreground">{alert.wine_name}</span>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground text-xs">{alert.user_email}</td>
                            <td className="px-4 py-3 text-muted-foreground text-xs max-w-[160px]">
                              <span className="line-clamp-1">{alert.program_label}</span>
                            </td>
                            <td className="px-4 py-3">
                              <SentBadge sent={alert.announcement_alert_sent} label="Sent" date={alert.sent_at} />
                            </td>
                            <td className="px-4 py-3">
                              {alert.release_opens_at ? (
                                <SentBadge sent={alert.morning_alert_sent} label="Sent" date={alert.morning_sent_at} />
                              ) : (
                                <span className="text-xs text-muted-foreground/40">N/A</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {alert.is_test ? (
                                <span className="inline-flex items-center gap-1 text-xs text-amber-400">
                                  <FlaskConical className="h-3 w-3" />Test
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">Real</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground text-xs">
                              {new Date(alert.created_at).toLocaleDateString("en-CA")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="bg-card border border-border p-16 text-center text-muted-foreground">
                  No alerts in queue. Run the scraper to generate matches.
                </div>
              )}
            </div>
          </TabsContent>

          {/* Users */}
          <TabsContent value="users">
            <div className="bg-card border border-border">
              <div className="p-6 border-b border-border">
                <h2 className="font-serif text-2xl">User Management</h2>
                <p className="text-sm text-muted-foreground mt-1">{users.length} users total</p>
              </div>
              {users.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs uppercase tracking-widest text-muted-foreground">
                        <th className="text-left px-6 py-3">Email</th>
                        <th className="text-left px-4 py-3">Status</th>
                        <th className="text-left px-4 py-3">Joined</th>
                        <th className="text-left px-4 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {users.map((user) => (
                        <tr key={user.id} className="hover:bg-background/30 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              {user.is_admin ? (
                                <ShieldCheck className="h-3.5 w-3.5 text-primary shrink-0" />
                              ) : (
                                <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              )}
                              <span className="text-foreground">{user.email}</span>
                              {user.id === profile?.id && (
                                <span className="text-xs text-muted-foreground">(you)</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex gap-2 flex-wrap">
                              {user.is_pro && (
                                <span className="text-xs px-2 py-0.5 bg-primary/20 text-primary border border-primary/30 uppercase tracking-widest">Pro</span>
                              )}
                              {user.is_admin && (
                                <span className="text-xs px-2 py-0.5 bg-amber-900/30 text-amber-400 border border-amber-700/30 uppercase tracking-widest">Admin</span>
                              )}
                              {!user.is_pro && !user.is_admin && (
                                <span className="text-xs text-muted-foreground">Free</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-4 text-muted-foreground text-xs">
                            {new Date(user.created_at).toLocaleDateString("en-CA")}
                          </td>
                          <td className="px-4 py-4">
                            <Button
                              size="sm"
                              variant={user.is_pro ? "outline" : "default"}
                              disabled={togglingId === user.id}
                              onClick={() => handleTogglePro(user)}
                              className="rounded-none text-xs tracking-widest uppercase h-7 px-3"
                            >
                              {togglingId === user.id ? "..." : user.is_pro ? "Remove Pro" : "Grant Pro"}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-16 text-center text-muted-foreground">No users yet.</div>
              )}
            </div>
          </TabsContent>

          {/* Watchlists */}
          <TabsContent value="watchlists">
            <div className="space-y-6">
              {/* Summary counts */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-card border border-border p-4">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Users with Watchlists</p>
                  <p className="font-mono text-2xl font-bold">{watchlistsData?.total_users ?? "—"}</p>
                </div>
                <div className="bg-card border border-border p-4">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Wine Items</p>
                  <p className="font-mono text-2xl font-bold">{watchlistsData?.total_items ?? "—"}</p>
                </div>
                <div className="bg-card border border-border p-4">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Category Items</p>
                  <p className="font-mono text-2xl font-bold">{watchlistsData?.total_categories ?? "—"}</p>
                </div>
              </div>

              {/* Per-user watchlist cards */}
              {!watchlistsData ? (
                <div className="bg-card border border-border p-16 text-center text-muted-foreground">Loading…</div>
              ) : watchlistsData.users.length === 0 ? (
                <div className="bg-card border border-border p-16 text-center text-muted-foreground">No watchlist entries yet.</div>
              ) : (
                <div className="space-y-4">
                  {watchlistsData.users.map((user) => {
                    const total = user.items.length + user.categories.length;
                    return (
                      <div key={user.user_id} className="bg-card border border-border">
                        {/* User header */}
                        <div className="px-6 py-4 border-b border-border flex items-center gap-3">
                          <List className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="font-medium text-foreground">{user.email}</span>
                          {user.is_pro && (
                            <span className="text-xs px-2 py-0.5 bg-primary/20 text-primary border border-primary/30 uppercase tracking-widest">Pro</span>
                          )}
                          <span className="ml-auto text-xs text-muted-foreground font-mono">{total} {total === 1 ? "item" : "items"}</span>
                        </div>

                        {/* Items table */}
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-border text-xs uppercase tracking-widest text-muted-foreground">
                                <th className="text-left px-6 py-2">Name / Producer / Category</th>
                                <th className="text-left px-4 py-2">Type</th>
                                <th className="text-left px-4 py-2">Vintage</th>
                                <th className="text-left px-4 py-2">Added</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {user.items.map((item) => (
                                <tr key={`item-${item.id}`} className="hover:bg-background/30 transition-colors">
                                  <td className="px-6 py-3 text-foreground">
                                    {item.match_type === "producer" ? item.producer : item.wine_name}
                                  </td>
                                  <td className="px-4 py-3">
                                    <MatchTypeBadge type={item.match_type} />
                                  </td>
                                  <td className="px-4 py-3 text-muted-foreground text-xs font-mono">
                                    {item.vintage ?? <span className="text-muted-foreground/40">—</span>}
                                  </td>
                                  <td className="px-4 py-3 text-muted-foreground text-xs">
                                    {new Date(item.created_at).toLocaleDateString("en-CA")}
                                  </td>
                                </tr>
                              ))}
                              {user.categories.map((cat) => (
                                <tr key={`cat-${cat.id}`} className="hover:bg-background/30 transition-colors">
                                  <td className="px-6 py-3 text-foreground">{cat.category}</td>
                                  <td className="px-4 py-3">
                                    <MatchTypeBadge type="category" />
                                  </td>
                                  <td className="px-4 py-3 text-muted-foreground/40 text-xs">—</td>
                                  <td className="px-4 py-3 text-muted-foreground text-xs">
                                    {new Date(cat.created_at).toLocaleDateString("en-CA")}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </TabsContent>

          {/* Newsletter */}
          <TabsContent value="newsletter">
            <div className="bg-card border border-border p-8 space-y-6">
              <h2 className="font-serif text-2xl">Weekly Picks Newsletter</h2>
              <p className="text-muted-foreground">Compose and send a curated newsletter to all Pro subscribers.</p>
              <form onSubmit={handleWeeklyPicks} className="space-y-4 max-w-2xl">
                <Input
                  placeholder="Subject line"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="bg-background rounded-none border-border"
                />
                <Textarea
                  placeholder="Email body (plain text or HTML)"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={10}
                  className="bg-background rounded-none border-border font-mono text-sm"
                />
                <Button
                  type="submit"
                  disabled={sendWeeklyPicks.isPending || !subject || !body}
                  className="rounded-none font-bold tracking-widest uppercase"
                >
                  {sendWeeklyPicks.isPending ? "Sending..." : "Send to Pro Subscribers"}
                </Button>
              </form>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function MatchTypeBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; className: string }> = {
    exact: { label: "Exact Wine", className: "bg-primary/15 text-primary border-primary/30" },
    wine: { label: "Any Vintage", className: "bg-blue-900/20 text-blue-400 border-blue-700/30" },
    producer: { label: "Producer", className: "bg-violet-900/20 text-violet-400 border-violet-700/30" },
    category: { label: "Category", className: "bg-emerald-900/20 text-emerald-400 border-emerald-700/30" },
  };
  const config = map[type] ?? { label: type, className: "bg-muted text-muted-foreground border-border" };
  return (
    <span className={`text-xs px-2 py-0.5 border uppercase tracking-widest ${config.className}`}>
      {config.label}
    </span>
  );
}

function StatCard({
  title,
  value,
  highlight,
  muted,
}: {
  title: string;
  value?: number | string;
  highlight?: boolean;
  muted?: boolean;
}) {
  return (
    <div className={`bg-card border p-6 ${highlight ? "border-primary/40" : "border-border"}`}>
      <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">{title}</p>
      <p className={`font-mono text-3xl font-bold ${highlight ? "text-primary" : muted ? "text-muted-foreground" : "text-foreground"}`}>
        {value ?? "—"}
      </p>
    </div>
  );
}
