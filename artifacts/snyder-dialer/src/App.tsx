import { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { useGetMe } from '@workspace/api-client-react';
import { isAuthenticated } from '@/lib/auth';

import NotFound from '@/pages/not-found';
import Login from '@/pages/login';
import Dashboard from '@/pages/dashboard';
import Campaigns from '@/pages/campaigns';
import CampaignDetail from '@/pages/campaign-detail';
import PromptTemplates from '@/pages/prompt-templates';
import Calls from '@/pages/calls';
import { AppShell } from '@/components/layout/app-shell';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function AuthGuard({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  const { data: user, isLoading, error } = useGetMe();

  useEffect(() => {
    if (!isLoading && (error || !user) && !isAuthenticated()) {
      setLocation('/login');
    }
  }, [isLoading, error, user, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/register" component={Login} />
      <Route path="/">
        {() => (
          <AuthGuard>
            <AppShell>
              <Dashboard />
            </AppShell>
          </AuthGuard>
        )}
      </Route>
      <Route path="/campaigns">
        {() => (
          <AuthGuard>
            <AppShell>
              <Campaigns />
            </AppShell>
          </AuthGuard>
        )}
      </Route>
      <Route path="/campaigns/:id">
        {() => (
          <AuthGuard>
            <AppShell>
              <CampaignDetail />
            </AppShell>
          </AuthGuard>
        )}
      </Route>
      <Route path="/prompt-templates">
        {() => (
          <AuthGuard>
            <AppShell>
              <PromptTemplates />
            </AppShell>
          </AuthGuard>
        )}
      </Route>
      <Route path="/calls">
        {() => (
          <AuthGuard>
            <AppShell>
              <Calls />
            </AppShell>
          </AuthGuard>
        )}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
