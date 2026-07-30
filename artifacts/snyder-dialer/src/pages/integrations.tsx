import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, ExternalLink, KeyRound, Phone, RefreshCw } from 'lucide-react';
import { getToken } from '@/lib/auth';

interface IntegrationSettings {
  vapiApiKeySet: boolean;
  vapiApiKey: string | null;
  twilioAccountSid: string | null;
  twilioAuthTokenSet: boolean;
  twilioAuthToken: string | null;
  twilioPhoneNumber: string | null;
  twilioApiKey: string | null;
  twilioApiKeySet: boolean;
  twilioApiSecretSet: boolean;
  twilioApiSecret: string | null;
  vapiPhoneNumberId: string | null;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

async function fetchSettings(): Promise<IntegrationSettings> {
  const res = await fetch(`${BASE}/api/settings/integrations`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error('Failed to load settings');
  return res.json();
}

async function saveSettings(data: Record<string, string>): Promise<IntegrationSettings> {
  const res = await fetch(`${BASE}/api/settings/integrations`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to save settings');
  return res.json();
}

export default function Integrations() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [registeringPhone, setRegisteringPhone] = useState(false);
  const [settings, setSettings] = useState<IntegrationSettings | null>(null);

  const [vapiApiKey, setVapiApiKey] = useState('');
  const [twilioAccountSid, setTwilioAccountSid] = useState('');
  const [twilioAuthToken, setTwilioAuthToken] = useState('');
  const [twilioPhoneNumber, setTwilioPhoneNumber] = useState('');
  const [twilioApiKey, setTwilioApiKey] = useState('');
  const [twilioApiSecret, setTwilioApiSecret] = useState('');

  useEffect(() => {
    fetchSettings()
      .then((s) => {
        setSettings(s);
        setTwilioAccountSid(s.twilioAccountSid ?? '');
        setTwilioPhoneNumber(s.twilioPhoneNumber ?? '');
      })
      .catch(() => toast({ title: 'Failed to load settings', variant: 'destructive' }))
      .finally(() => setLoading(false));
  }, []);

  const handleRegisterPhone = async () => {
    setRegisteringPhone(true);
    try {
      const res = await fetch(`${BASE}/api/settings/integrations/register-phone`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Registration failed');
      setSettings((s) => s ? { ...s, vapiPhoneNumberId: data.phoneNumberId } : s);
      toast({
        title: data.reused ? 'Phone number already registered' : 'Phone number registered with VAPI',
        description: `VAPI Phone ID: ${data.phoneNumberId}`,
      });
    } catch (err: unknown) {
      toast({ title: 'Registration failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setRegisteringPhone(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Record<string, string> = {
        twilioAccountSid,
        twilioPhoneNumber,
      };
      // Only send secrets if user typed something new
      if (vapiApiKey) payload.vapiApiKey = vapiApiKey;
      if (twilioAuthToken) payload.twilioAuthToken = twilioAuthToken;
      if (twilioApiKey) payload.twilioApiKey = twilioApiKey;
      if (twilioApiSecret) payload.twilioApiSecret = twilioApiSecret;

      const updated = await saveSettings(payload);
      setSettings(updated);
      setVapiApiKey('');
      setTwilioAuthToken('');
      setTwilioApiKey('');
      setTwilioApiSecret('');
      toast({ title: 'Credentials saved' });
    } catch {
      toast({ title: 'Failed to save', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Integrations</h1>
        <p className="text-muted-foreground">
          Set your VAPI and Twilio credentials once here — all campaigns will use them automatically.
          You can override per-campaign in the campaign's Settings tab.
        </p>
      </div>

      {/* VAPI */}
      <div className="bg-card border border-card-border rounded-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <KeyRound className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold">VAPI</h2>
              <p className="text-xs text-muted-foreground">AI voice conversation engine</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {settings?.vapiApiKeySet ? (
              <span className="flex items-center gap-1.5 text-xs text-chart-5 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" /> Connected
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">Not configured</span>
            )}
            <a
              href="https://dashboard.vapi.ai/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              Get key <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        <div>
          <Label htmlFor="vapiApiKey">
            Private API Key{settings?.vapiApiKeySet && <span className="ml-2 text-xs text-muted-foreground font-normal">(saved — enter new value to replace)</span>}
          </Label>
          <Input
            id="vapiApiKey"
            type="password"
            value={vapiApiKey}
            onChange={(e) => setVapiApiKey(e.target.value)}
            className="mt-1.5 font-mono"
            placeholder={settings?.vapiApiKeySet ? settings.vapiApiKey ?? '••••••••' : 'sk-...'}
          />
          <p className="text-xs text-muted-foreground mt-1.5">
            Found at <a href="https://dashboard.vapi.ai/keys" target="_blank" rel="noopener noreferrer" className="underline">dashboard.vapi.ai/keys</a> — use your <strong>Private</strong> key.
          </p>
        </div>
      </div>

      {/* Twilio */}
      <div className="bg-card border border-card-border rounded-lg p-6 mb-8">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <Phone className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold">Twilio</h2>
              <p className="text-xs text-muted-foreground">Outbound phone call provider</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {settings?.twilioAccountSid && settings?.twilioAuthTokenSet && settings?.twilioPhoneNumber ? (
              <span className="flex items-center gap-1.5 text-xs text-chart-5 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" /> Connected
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">Not configured</span>
            )}
            <a
              href="https://console.twilio.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              Get credentials <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <Label htmlFor="twilioAccountSid">Account SID</Label>
            <Input
              id="twilioAccountSid"
              value={twilioAccountSid}
              onChange={(e) => setTwilioAccountSid(e.target.value)}
              className="mt-1.5 font-mono"
              placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            />
            <p className="text-xs text-muted-foreground mt-1">Found on your Twilio Console dashboard homepage.</p>
          </div>

          <div>
            <Label htmlFor="twilioAuthToken">
              Auth Token{settings?.twilioAuthTokenSet && <span className="ml-2 text-xs text-muted-foreground font-normal">(saved — enter new value to replace)</span>}
            </Label>
            <Input
              id="twilioAuthToken"
              type="password"
              value={twilioAuthToken}
              onChange={(e) => setTwilioAuthToken(e.target.value)}
              className="mt-1.5 font-mono"
              placeholder={settings?.twilioAuthTokenSet ? settings.twilioAuthToken ?? '••••••••' : 'Your auth token'}
            />
            <p className="text-xs text-muted-foreground mt-1">Found next to your Account SID on the Twilio Console.</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="twilioApiKey">
                API Key SID{settings?.twilioApiKeySet && <span className="ml-2 text-xs text-muted-foreground font-normal">(saved)</span>}
              </Label>
              <Input
                id="twilioApiKey"
                value={twilioApiKey}
                onChange={(e) => setTwilioApiKey(e.target.value)}
                className="mt-1.5 font-mono"
                placeholder={settings?.twilioApiKey ?? 'SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'}
              />
            </div>
            <div>
              <Label htmlFor="twilioApiSecret">
                API Key Secret{settings?.twilioApiSecretSet && <span className="ml-2 text-xs text-muted-foreground font-normal">(saved)</span>}
              </Label>
              <Input
                id="twilioApiSecret"
                type="password"
                value={twilioApiSecret}
                onChange={(e) => setTwilioApiSecret(e.target.value)}
                className="mt-1.5 font-mono"
                placeholder={settings?.twilioApiSecretSet ? settings.twilioApiSecret ?? '••••••••' : 'Your API Key Secret'}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground -mt-2">
            Required by VAPI for phone registration. Create API Keys at{' '}
            <a href="https://console.twilio.com/us1/account/manage-keys/api-key-list" target="_blank" rel="noopener noreferrer" className="underline">
              Twilio Console → API Keys &amp; Tokens
            </a>.
            Copy both the SID (SK…) and the Secret immediately — Twilio only shows the secret once.
          </p>

          <div>
            <Label htmlFor="twilioPhoneNumber">Outbound Phone Number</Label>
            <Input
              id="twilioPhoneNumber"
              value={twilioPhoneNumber}
              onChange={(e) => setTwilioPhoneNumber(e.target.value)}
              className="mt-1.5 font-mono"
              placeholder="+15551234567"
            />
            <p className="text-xs text-muted-foreground mt-1">
              A Twilio number in E.164 format. Calls will show this as the caller ID.
              Get one at <a href="https://console.twilio.com/us1/develop/phone-numbers/manage/incoming" target="_blank" rel="noopener noreferrer" className="underline">Twilio Phone Numbers</a>.
            </p>
          </div>
        </div>

        {/* Register phone with VAPI */}
        <div className="mt-5 pt-5 border-t border-card-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Register with VAPI</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Links your Twilio number to VAPI so calls use a persistent phone number ID.
                Required for reliable outbound calls.
              </p>
              {settings?.vapiPhoneNumberId && (
                <p className="text-xs font-mono text-muted-foreground mt-1 bg-muted px-2 py-1 rounded inline-block">
                  Phone ID: {settings.vapiPhoneNumberId}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 ml-4 shrink-0">
              {settings?.vapiPhoneNumberId && (
                <span className="flex items-center gap-1.5 text-xs text-chart-5 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Registered
                </span>
              )}
              <Button
                variant={settings?.vapiPhoneNumberId ? 'outline' : 'default'}
                size="sm"
                onClick={handleRegisterPhone}
                disabled={registeringPhone || !settings?.twilioAccountSid || !settings?.twilioAuthTokenSet || !settings?.twilioPhoneNumber || !settings?.vapiApiKeySet || !settings?.twilioApiKeySet || !settings?.twilioApiSecretSet}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${registeringPhone ? 'animate-spin' : ''}`} />
                {registeringPhone ? 'Registering…' : settings?.vapiPhoneNumberId ? 'Re-register' : 'Register Phone with VAPI'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Credentials'}
        </Button>
      </div>
    </div>
  );
}
