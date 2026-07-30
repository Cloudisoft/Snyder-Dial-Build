import { useState } from 'react';
import { useLocation } from 'wouter';
import { useLogin, useRegister } from '@workspace/api-client-react';
import { setToken } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

  const login = useLogin();
  const register = useRegister();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (isRegister) {
      register.mutate(
        { data: { email, password, name } },
        {
          onSuccess: (data) => {
            setToken(data.token);
            setLocation('/');
            toast({ title: 'Account created successfully' });
          },
          onError: (error) => {
            toast({
              title: 'Registration failed',
              description: error.message,
              variant: 'destructive',
            });
          },
        }
      );
    } else {
      login.mutate(
        { data: { email, password } },
        {
          onSuccess: (data) => {
            setToken(data.token);
            setLocation('/');
            toast({ title: 'Signed in successfully' });
          },
          onError: (error) => {
            toast({
              title: 'Sign in failed',
              description: error.message,
              variant: 'destructive',
            });
          },
        }
      );
    }
  };

  const isPending = login.isPending || register.isPending;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-primary rounded flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-lg">SD</span>
            </div>
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">SNYDER DIALER</h1>
          <p className="text-muted-foreground">AI-powered outbound calling platform</p>
        </div>

        <div className="bg-card border border-card-border rounded-lg p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <div>
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="mt-1.5"
                  data-testid="input-name"
                />
              </div>
            )}

            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="mt-1.5"
                data-testid="input-email"
              />
            </div>

            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="mt-1.5"
                data-testid="input-password"
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isPending}
              data-testid="button-submit"
            >
              {isPending ? 'Loading...' : isRegister ? 'Create Account' : 'Sign In'}
            </Button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => setIsRegister(!isRegister)}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                data-testid="button-toggle-mode"
              >
                {isRegister ? 'Already have an account? Sign in' : "Don't have an account? Register"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
