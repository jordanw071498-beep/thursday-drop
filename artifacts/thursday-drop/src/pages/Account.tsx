import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";

export default function Account() {
  const { profile, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-background px-6 py-12">
      <div className="max-w-2xl mx-auto space-y-12">
        <header className="border-b border-border pb-8">
          <h1 className="font-serif text-5xl text-primary mb-4">Account</h1>
          <p className="text-muted-foreground text-lg">Manage your membership and preferences.</p>
        </header>

        <div className="space-y-8">
          <div className="bg-card border border-border p-8 space-y-6">
            <h2 className="font-serif text-2xl border-b border-border pb-4">Profile Details</h2>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="text-muted-foreground uppercase tracking-widest">Email</div>
              <div className="col-span-2 font-medium">{profile?.email}</div>
              
              <div className="text-muted-foreground uppercase tracking-widest">Status</div>
              <div className="col-span-2">
                <span className={`inline-block px-2 py-1 text-xs font-bold tracking-widest uppercase ${profile?.is_pro ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                  {profile?.is_pro ? 'Pro Member' : 'Free Member'}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-card border border-border p-8 space-y-6">
            <h2 className="font-serif text-2xl border-b border-border pb-4">Danger Zone</h2>
            <p className="text-sm text-muted-foreground">Log out of your account on this device.</p>
            <Button 
              variant="destructive" 
              className="rounded-none font-bold tracking-widest uppercase"
              onClick={() => signOut()}
            >
              Sign Out
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
