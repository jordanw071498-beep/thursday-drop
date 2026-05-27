import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminRoute } from "@/components/AdminRoute";

// Pages
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import Release from "@/pages/Release";
import History from "@/pages/History";
import Pricing from "@/pages/Pricing";
import Watchlist from "@/pages/Watchlist";
import Account from "@/pages/Account";
import Admin from "@/pages/Admin";
import AdminLogin from "@/pages/AdminLogin";
import Unsubscribe from "@/pages/Unsubscribe";
import FAQ from "@/pages/FAQ";
import Contact from "@/pages/Contact";
import Terms from "@/pages/Terms";
import Privacy from "@/pages/Privacy";

const queryClient = new QueryClient();

function ScrollToTop() {
  const [location] = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location]);
  return null;
}

function Router() {
  return (
    <div className="min-h-screen bg-background text-foreground font-sans flex flex-col">
      <ScrollToTop />
      <Nav />
      <div className="pt-20 flex-1 flex flex-col">
        <Switch>
          <Route path="/" component={Landing} />
          <Route path="/login" component={Login} />
          <Route path="/signup" component={Signup} />
          <Route path="/release" component={Release} />
          <Route path="/pricing" component={Pricing} />
          <Route path="/unsubscribe" component={Unsubscribe} />
          <Route path="/faq" component={FAQ} />
          <Route path="/contact" component={Contact} />
          <Route path="/terms" component={Terms} />
          <Route path="/privacy" component={Privacy} />

          {/* Protected Routes */}
          <Route path="/history">
            <ProtectedRoute><History /></ProtectedRoute>
          </Route>
          <Route path="/watchlist">
            <ProtectedRoute><Watchlist /></ProtectedRoute>
          </Route>
          <Route path="/account">
            <ProtectedRoute><Account /></ProtectedRoute>
          </Route>

          {/* Admin Login — public hidden route */}
          <Route path="/admin-login" component={AdminLogin} />

          {/* Admin Route */}
          <Route path="/admin">
            <AdminRoute><Admin /></AdminRoute>
          </Route>

          <Route component={NotFound} />
        </Switch>
      </div>
      <Footer />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
