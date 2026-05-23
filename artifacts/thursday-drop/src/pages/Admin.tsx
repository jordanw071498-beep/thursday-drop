import { useGetAdminStats, useTriggerScrape, useSendAlerts, useSendWeeklyPicks } from "@workspace/api-client-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

export default function Admin() {
  const { data: stats, refetch } = useGetAdminStats();
  const triggerScrape = useTriggerScrape();
  const sendAlerts = useSendAlerts();
  const sendWeeklyPicks = useSendWeeklyPicks();
  const { toast } = useToast();

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const handleScrape = () => {
    triggerScrape.mutate({}, {
      onSuccess: () => {
        toast({ title: "Scrape Triggered", description: "Data is being updated." });
        refetch();
      }
    });
  };

  const handleAlerts = () => {
    sendAlerts.mutate({}, {
      onSuccess: () => {
        toast({ title: "Alerts Sent", description: "Notifications dispatched to users." });
      }
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
        }
      }
    );
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
            <TabsTrigger value="overview" className="rounded-none h-full px-8 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Overview</TabsTrigger>
            <TabsTrigger value="scraper" className="rounded-none h-full px-8 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Scraper</TabsTrigger>
            <TabsTrigger value="alerts" className="rounded-none h-full px-8 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Alerts</TabsTrigger>
            <TabsTrigger value="newsletter" className="rounded-none h-full px-8 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Newsletter</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <StatCard title="Total Subscribers" value={stats?.total_subscribers} />
              <StatCard title="Pro Subscribers" value={stats?.pro_subscribers} />
              <StatCard title="MRR" value={stats?.mrr ? `$${stats.mrr}` : undefined} />
              <StatCard title="Total Wines" value={stats?.total_wines} />
              <StatCard title="Total Releases" value={stats?.total_releases} />
              <StatCard title="Pending Alerts" value={stats?.pending_alerts} />
            </div>
          </TabsContent>

          <TabsContent value="scraper">
            <div className="bg-card border border-border p-8 space-y-6">
              <h2 className="font-serif text-2xl">Manual Data Sync</h2>
              <p className="text-muted-foreground">Trigger a manual scrape of the LCBO API to check for new releases and inventory updates.</p>
              <Button 
                onClick={handleScrape} 
                disabled={triggerScrape.isPending}
                className="rounded-none font-bold tracking-widest uppercase"
              >
                {triggerScrape.isPending ? "Scraping..." : "Run Scraper Now"}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="alerts">
            <div className="bg-card border border-border p-8 space-y-6">
              <h2 className="font-serif text-2xl">Trigger Notifications</h2>
              <p className="text-muted-foreground">Manually process the alert queue to notify users of watchlist matches.</p>
              <div className="p-4 bg-background border border-border font-mono text-sm mb-4">
                {stats?.pending_alerts || 0} alerts currently in queue
              </div>
              <Button 
                onClick={handleAlerts} 
                disabled={sendAlerts.isPending || stats?.pending_alerts === 0}
                className="rounded-none font-bold tracking-widest uppercase"
              >
                {sendAlerts.isPending ? "Processing..." : "Dispatch Alerts"}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="newsletter">
            <div className="bg-card border border-border p-8 space-y-6">
              <h2 className="font-serif text-2xl">Weekly Picks</h2>
              <p className="text-muted-foreground">Compose and send the editorial newsletter to all subscribers.</p>
              
              <form onSubmit={handleWeeklyPicks} className="space-y-4">
                <div>
                  <Input 
                    placeholder="Subject Line" 
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    required
                    className="bg-background rounded-none border-border"
                  />
                </div>
                <div>
                  <Textarea 
                    placeholder="Newsletter Body (Markdown supported)" 
                    value={body}
                    onChange={e => setBody(e.target.value)}
                    required
                    className="bg-background rounded-none border-border min-h-[300px]"
                  />
                </div>
                <Button 
                  type="submit" 
                  disabled={sendWeeklyPicks.isPending}
                  className="rounded-none font-bold tracking-widest uppercase w-full md:w-auto px-12"
                >
                  {sendWeeklyPicks.isPending ? "Sending..." : "Send to All"}
                </Button>
              </form>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value?: number | string }) {
  return (
    <div className="bg-card border border-border p-6 flex flex-col justify-center">
      <div className="text-muted-foreground text-sm uppercase tracking-widest mb-2">{title}</div>
      <div className="font-serif text-4xl text-primary">{value !== undefined ? value : '—'}</div>
    </div>
  );
}
