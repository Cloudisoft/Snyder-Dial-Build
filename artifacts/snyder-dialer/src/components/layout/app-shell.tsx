import { ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { LayoutDashboard, Megaphone, FileText, Phone, LogOut, Plug } from 'lucide-react';
import { useLogout } from '@workspace/api-client-react';
import { removeToken } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const logout = useLogout();

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        removeToken();
        setLocation('/login');
        toast({ title: 'Logged out successfully' });
      },
      onError: () => {
        removeToken();
        setLocation('/login');
      },
    });
  };

  const navItems = [
    { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/campaigns', icon: Megaphone, label: 'Campaigns' },
    { path: '/prompt-templates', icon: FileText, label: 'Templates' },
    { path: '/calls', icon: Phone, label: 'Calls' },
    { path: '/integrations', icon: Plug, label: 'Integrations' },
  ];

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-card flex flex-col">
        {/* Logo */}
        <div className="h-16 px-6 flex items-center border-b border-border">
          <Link href="/" className="flex items-center gap-3">
            <img src="/snyder-logo.png" alt="Snyder Dialer" className="w-9 h-9 object-contain" />
            <span className="font-bold text-lg tracking-tight">SNYDER DIALER</span>
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const isActive = location === item.path;
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                href={item.path}
                className={`flex items-center gap-3 px-4 py-2.5 rounded text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
                data-testid={`nav-${item.label.toLowerCase()}`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="p-4 border-t border-border">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
