import { useGetAdminStats, useTriggerScrape, useSendAlerts, useSendWeeklyPicks } from "@workspace/api-client-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/AuthContext";
import { CheckCircle, Clock, ShieldCheck, User } from "lucide-react";

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
  created_at: string;
}

interface UserRow {
  id: string;
  email: string;
  is_pro: boolean;
  is_admin: boolean;
  created_at: string;
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

export default function Admin() {
  const { profile, token, refreshProfile } = useAuth();

  const { data: stats, refetch: refetchStats } = useGetAdminStats();
  const { data: alertsData, refetch: refetchAlerts } = useAdminFetch<{ alerts: AlertRow[] }>("/admin/alerts", token);
  const { data: usersData, refetch: refetchUsers } = useAdminFetch<{ users: UserRow[] }>("/admin/users", token);

  const triggerScrape = useTriggerScrape();
  const sendAlerts = useSendAlerts();
  const sendWeeklyPicks = useSendWeeklyPicks();
  const sendMorningAlerts = useAdminPost("/admin/send-morning-alerts", token);
  const sendTestAlert = useAdminPost("/admin/test-alert", token);
  const { toast } = useToast();

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState("");

  const alerts = alertsData?.alerts ?? [];
  const users = usersData?.users ?? [];
  const announcementPending = alerts.filter((a) => !a.announcement_alert_sent).length;
  const morningPending = alerts.filter((a) => !a.morning_alert_sent && a.release_opens_at).length;

  const handleScrape = () => {
    triggerScrape.mutate(undefined, {
      onSuccess: () => {
        toast({ title: "Scrape Triggered", description: "Data is being updated." });
        refetchStats();
        refetchAlerts();
      },
    });
  };

  const handleAlerts = () => {
    sendAlerts.mutate(undefined, {
      onSuccess: (data: any) => {
        toast({ title: "Announcement Alerts Sent", description: data?.message ?? "Done." });
        refetchAlerts();
      },
    });
  };

  const handleMorningAlerts = () => {
    sendMorningAlerts.mutate(undefined, {
      onSuccess: (data: any) => {
        toast({ title: "Morning Alerts Sent", description: data?.message ?? "Done." });
        refetchAlerts();
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
      // If toggling self, refresh auth context too
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
          <h1 className="font-serif text-5xl text-primary mb-4">Command Center</h1>
          <p className="text-muted-foreground text-lg">System operations and administration.</p>
        </header>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="bg-card border border-border rounded-none h-12 w-full justify-start p-0 mb-8 overflow-x-auto">
            {["overview", "scraper", "alerts", "users", "newsletter"].map((tab) => (
              <TabsTrigger
                key={tab}
                value={tab}
                className="rounded-none h-full px-8 capitalize data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                {tab}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Overview */}
          <TabsContent value="overview">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <StatCard title="Total Subscribers" value={stats?.total_subscribers} />
              <StatCard title="Pro Subscribers" value={stats?.pro_subscribers} />
              <StatCard title="MRR" value={stats?.mrr ? `$${stats.mrr}` : undefined} />
              <StatCard title="Total Wines" value={stats?.total_wines} />
              <StatCard title="Total Releases" value={stats?.total_releases} />
              <StatCard title="Announcement Alerts Pending" value={announcementPending} />
              <StatCard title="Morning Alerts Pending" value={morningPending} />
            </div>
          </TabsContent>

          {/* Scraper */}
          <TabsContent value="scraper">
            <div className="bg-card border border-border p-8 space-y-6">
              <h2 className="font-serif text-2xl">Manual Data Sync</h2>
              <p className="text-muted-foreground">Trigger a manual scrape of LCBO Vintages to check for new releases.</p>
              <Button
                onClick={handleScrape}
                disabled={triggerScrape.isPending}
                className="rounded-none font-bold tracking-widest uppercase"
              >
                {triggerScrape.isPending ? "Scraping..." : "Run Scraper Now"}
              </Button>
            </div>
          </TabsContent>

          {/* Alerts */}
          <TabsContent value="alerts">
            <div className="space-y-8">
              {/* Action cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Announcement alerts */}
                <div className="bg-card border border-border p-6 space-y-4">
                  <div>
                    <h3 className="font-serif text-lg mb-1">Announcement Alerts</h3>
                    <p className="text-muted-foreground text-sm">Sent immediately when a watched wine appears on Vintages.</p>
                  </div>
                  <div className="font-mono text-sm text-muted-foreground">
                    {announcementPending} pending
                  </div>
                  <Button
                    onClick={handleAlerts}
                    disabled={sendAlerts.isPending || announcementPending === 0}
                    size="sm"
                    className="rounded-none tracking-widest uppercase w-full"
                  >
                    {sendAlerts.isPending ? "Sending..." : "Send All Pending"}
                  </Button>
                </div>

                {/* Morning alerts */}
                <div className="bg-card border border-border p-6 space-y-4">
                  <div>
                    <h3 className="font-serif text-lg mb-1">Morning Alerts</h3>
                    <p className="text-muted-foreground text-sm">Sent at 7am on the Thursday the wine opens for ordering.</p>
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

                {/* Test email */}
                <div className="bg-card border border-border p-6 space-y-4">
                  <div>
                    <h3 className="font-serif text-lg mb-1">Test Emails</h3>
                    <p className="text-muted-foreground text-sm">Send both email templates to any address to preview them.</p>
                  </div>
                  <Input
                    type="email"
                    placeholder="your@email.com"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    className="bg-background rounded-none border-border text-sm"
                  />
                  <Button
                    onClick={handleTestAlert}
                    disabled={sendTestAlert.isPending || !testEmail}
                    size="sm"
                    variant="outline"
                    className="rounded-none tracking-widest uppercase w-full border-amber-700 text-amber-400 hover:bg-amber-900/20 disabled:opacity-40"
                  >
                    {sendTestAlert.isPending ? "Sending..." : "Send Test Email"}
                  </Button>
                </div>
              </div>

              {/* Alert queue table */}
              {alerts.length > 0 ? (
                <div className="bg-card border border-border">
                  <div className="p-6 border-b border-border">
                    <h3 className="font-serif text-xl">Alert Queue</h3>
                    <p className="text-sm text-muted-foreground mt-1">{alerts.length} total alerts</p>
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
                          <th className="text-left px-4 py-3">Created</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {alerts.map((alert) => (
                          <tr key={alert.id} className="hover:bg-background/30 transition-colors">
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
              <div className="p-6 border-b border-border flex items-center justify-between">
                <div>
                  <h2 className="font-serif text-2xl">User Management</h2>
                  <p className="text-sm text-muted-foreground mt-1">{users.length} users total</p>
                </div>
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
                                <span className="text-xs px-2 py-0.5 bg-primary/20 text-primary border border-primary/30 uppercase tracking-widest">
                                  Pro
                                </span>
                              )}
                              {user.is_admin && (
                                <span className="text-xs px-2 py-0.5 bg-amber-900/30 text-amber-400 border border-amber-700/30 uppercase tracking-widest">
                                  Admin
                                </span>
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
                              {togglingId === user.id
                                ? "..."
                                : user.is_pro
                                ? "Remove Pro"
                                : "Grant Pro"}
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

          {/* Newsletter */}
          <TabsContent value="newsletter">
            <div className="bg-card border border-border p-8 space-y-6">
              <h2 className="font-serif text-2xl">Weekly Picks</h2>
              <p className="text-muted-foreground">Compose and send the editorial newsletter to all Pro subscribers.</p>
              <form onSubmit={handleWeeklyPicks} className="space-y-4">
                <Input
                  placeholder="Subject Line"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  required
                  className="bg-background rounded-none border-border"
                />
                <Textarea
                  placeholder="Newsletter Body (Markdown supported)"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  required
                  className="bg-background rounded-none border-border min-h-[300px]"
                />
                <Button
                  type="submit"
                  disabled={sendWeeklyPicks.isPending}
                  className="rounded-none font-bold tracking-widest uppercase w-full md:w-auto px-12"
                >
                  {sendWeeklyPicks.isPending ? "Sending..." : "Send to All Pro Subscribers"}
                </Button>
              </form>
            </div>
          </TabsContent>
        </Tabs>

        <div className="text-center pt-4 pb-2">
          <a
            href="mailto:hello@thursdaydrop.ca?subject=Admin suggestion"
            className="text-xs text-muted-foreground/50 hover:text-primary transition-colors"
          >
            Have a suggestion? →
          </a>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value?: number | string }) {
  return (
    <div className="bg-card border border-border p-6 flex flex-col justify-center">
      <div className="text-muted-foreground text-sm uppercase tracking-widest mb-2">{title}</div>
      <div className="font-serif text-4xl text-primary">{value !== undefined ? value : "—"}</div>
    </div>
  );
}
