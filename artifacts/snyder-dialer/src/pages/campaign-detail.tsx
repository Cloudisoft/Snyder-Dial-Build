import { useState, useRef, useEffect } from 'react';
import { useParams, useLocation, useSearch } from 'wouter';
import {
  useGetCampaign,
  useUpdateCampaign,
  useLaunchCampaign,
  usePauseCampaign,
  useGetCampaignStats,
  useListLeads,
  useImportLeadsCsv,
  useDeleteLead,
  useListKnowledgeBaseFiles,
  useAddKnowledgeBaseDoc,
  useDeleteKnowledgeBaseFile,
  useListCalls,
  getGetCampaignQueryKey,
  getGetCampaignStatsQueryKey,
  getListLeadsQueryKey,
  getListKnowledgeBaseFilesQueryKey,
  getListCallsQueryKey,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/ui/stat-card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { Play, Pause, Upload, Trash2, Users, Phone, CheckCircle2, XCircle, ArrowLeft, FileText, AlertTriangle, ExternalLink, UserPlus, ChevronDown, ChevronRight, Clock, MessageSquare, Mic, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { getToken } from '@/lib/auth';
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

export default function CampaignDetail() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const campaignId = Number(params.id);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Read ?tab= from URL to allow direct linking to a tab
  const defaultTab = new URLSearchParams(search).get('tab') ?? 'overview';

  const { data: campaign, isLoading: campaignLoading } = useGetCampaign(campaignId);
  const { data: stats } = useGetCampaignStats(campaignId);
  const { data: leads } = useListLeads(campaignId);
  const { data: kbFiles } = useListKnowledgeBaseFiles(campaignId);
  const { data: calls } = useListCalls(campaignId);

  const updateCampaign = useUpdateCampaign();
  const launchCampaign = useLaunchCampaign();
  const pauseCampaign = usePauseCampaign();
  const importLeads = useImportLeadsCsv();
  const deleteLead = useDeleteLead();
  const addKbDoc = useAddKnowledgeBaseDoc();
  const deleteKbFile = useDeleteKnowledgeBaseFile();

  const leadsFileRef = useRef<HTMLInputElement>(null);
  const kbFileRef = useRef<HTMLInputElement>(null);

  const [masterPrompt, setMasterPrompt] = useState('');
  const [twilioAccountSid, setTwilioAccountSid] = useState('');
  const [twilioAuthToken, setTwilioAuthToken] = useState('');
  const [twilioPhoneNumber, setTwilioPhoneNumber] = useState('');
  const [vapiApiKey, setVapiApiKey] = useState('');

  // VAPI sync state
  const [syncing, setSyncing] = useState(false);

  // Add-lead dialog state
  const [addLeadOpen, setAddLeadOpen] = useState(false);
  const [leadName, setLeadName] = useState('');
  const [leadPhone, setLeadPhone] = useState('');
  const [leadEmail, setLeadEmail] = useState('');
  const [leadCompany, setLeadCompany] = useState('');
  const [leadNotes, setLeadNotes] = useState('');
  const [addingLead, setAddingLead] = useState(false);

  // Global integrations creds (to determine if credentials are truly missing)
  const [globalCredsSet, setGlobalCredsSet] = useState<boolean | null>(null);
  useEffect(() => {
    fetch(`${BASE}/api/settings/integrations`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then((r) => r.json())
      .then((d) => setGlobalCredsSet(!!(d.vapiApiKeySet && d.twilioAccountSid && d.twilioAuthTokenSet && d.twilioPhoneNumber)))
      .catch(() => setGlobalCredsSet(false));
  }, []);

  // Initialize form when campaign loads
  if (campaign && !masterPrompt && !twilioAccountSid) {
    setMasterPrompt(campaign.masterPrompt);
    setTwilioAccountSid(campaign.twilioAccountSid || '');
    setTwilioAuthToken(campaign.twilioAuthToken || '');
    setTwilioPhoneNumber(campaign.twilioPhoneNumber || '');
    setVapiApiKey(campaign.vapiApiKey || '');
  }

  const campaignCredsSet = !!(campaign?.vapiApiKey && campaign?.twilioAccountSid && campaign?.twilioAuthToken && campaign?.twilioPhoneNumber);
  // Credentials OK if either campaign-level or global integrations are configured
  const credentialsMissing = !campaignCredsSet && globalCredsSet === false;

  const handleSyncVapi = async () => {
    setSyncing(true);
    try {
      const res = await fetch(`${BASE}/api/campaigns/${campaignId}/sync-vapi`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Sync failed');
      queryClient.invalidateQueries({ queryKey: getGetCampaignQueryKey(campaignId) });
      toast({ title: 'VAPI agent synced', description: `Assistant ID: ${data.assistantId}` });
    } catch (err: unknown) {
      toast({ title: 'Sync failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  const handleAddLead = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddingLead(true);
    try {
      const res = await fetch(`${BASE}/api/campaigns/${campaignId}/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ name: leadName, phone: leadPhone, email: leadEmail || undefined, company: leadCompany || undefined, notes: leadNotes || undefined }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to add lead');
      queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey(campaignId) });
      queryClient.invalidateQueries({ queryKey: getGetCampaignStatsQueryKey(campaignId) });
      toast({ title: `Lead "${leadName}" added` });
      setLeadName(''); setLeadPhone(''); setLeadEmail(''); setLeadCompany(''); setLeadNotes('');
      setAddLeadOpen(false);
    } catch (err: unknown) {
      toast({ title: 'Failed to add lead', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setAddingLead(false);
    }
  };

  const handleLaunch = () => {
    if (credentialsMissing) {
      toast({
        title: 'Credentials required',
        description: 'Add VAPI and Twilio credentials in Integrations (sidebar) or this campaign\'s Settings tab.',
        variant: 'destructive',
      });
      return;
    }
    launchCampaign.mutate(
      { id: campaignId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetCampaignQueryKey(campaignId) });
          toast({ title: 'Campaign launched' });
        },
        onError: (error) => {
          toast({ title: 'Failed to launch', description: error.message, variant: 'destructive' });
        },
      }
    );
  };

  const handlePause = () => {
    pauseCampaign.mutate(
      { id: campaignId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetCampaignQueryKey(campaignId) });
          toast({ title: 'Campaign paused' });
        },
        onError: (error) => {
          toast({ title: 'Failed to pause', description: error.message, variant: 'destructive' });
        },
      }
    );
  };

  const handleSaveSettings = () => {
    updateCampaign.mutate(
      {
        id: campaignId,
        data: {
          masterPrompt,
          twilioAccountSid,
          twilioAuthToken,
          twilioPhoneNumber,
          vapiApiKey,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetCampaignQueryKey(campaignId) });
          toast({ title: 'Settings saved' });
        },
        onError: (error) => {
          toast({ title: 'Failed to save', description: error.message, variant: 'destructive' });
        },
      }
    );
  };

  const handleLeadsUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    importLeads.mutate(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: campaignId, data: formData as any },
      {
        onSuccess: (result) => {
          queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey(campaignId) });
          queryClient.invalidateQueries({ queryKey: getGetCampaignStatsQueryKey(campaignId) });
          toast({ title: `Imported ${result.imported} leads` });
          if (leadsFileRef.current) leadsFileRef.current.value = '';
        },
        onError: (error) => {
          toast({ title: 'Upload failed', description: error.message, variant: 'destructive' });
        },
      }
    );
  };

  const handleKbUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    addKbDoc.mutate(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: campaignId, data: formData as any },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListKnowledgeBaseFilesQueryKey(campaignId) });
          toast({ title: 'File uploaded' });
          if (kbFileRef.current) kbFileRef.current.value = '';
        },
        onError: (error) => {
          toast({ title: 'Upload failed', description: error.message, variant: 'destructive' });
        },
      }
    );
  };

  const handleDeleteLead = (leadId: number) => {
    deleteLead.mutate(
      { id: leadId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey(campaignId) });
          toast({ title: 'Lead deleted' });
        },
      }
    );
  };

  const handleDeleteKbFile = (fileId: number) => {
    deleteKbFile.mutate(
      { id: fileId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListKnowledgeBaseFilesQueryKey(campaignId) });
          toast({ title: 'File deleted' });
        },
      }
    );
  };

  const insertVariable = (variable: string) => {
    setMasterPrompt((prev) => prev + ` {{${variable}}}`);
  };

  if (campaignLoading) {
    return (
      <div className="p-8">
        <div className="text-muted-foreground">Loading campaign...</div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="p-8">
        <div className="text-muted-foreground">Campaign not found</div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-chart-5 text-background';
      case 'paused':
        return 'bg-chart-2 text-background';
      case 'completed':
        return 'bg-muted text-muted-foreground';
      default:
        return 'bg-secondary text-secondary-foreground';
    }
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => setLocation('/campaigns')} data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold tracking-tight">{campaign.name}</h1>
              <Badge className={getStatusColor(campaign.status)}>{campaign.status.toUpperCase()}</Badge>
            </div>
            <p className="text-muted-foreground">{campaign.objective}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {campaign.status === 'active' ? (
            <Button onClick={handlePause} disabled={pauseCampaign.isPending} data-testid="button-pause">
              <Pause className="w-4 h-4 mr-2" />
              Pause
            </Button>
          ) : (
            <Button onClick={handleLaunch} disabled={launchCampaign.isPending} data-testid="button-launch">
              <Play className="w-4 h-4 mr-2" />
              Launch
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue={defaultTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="leads" data-testid="tab-leads">Leads</TabsTrigger>
          <TabsTrigger value="knowledge" data-testid="tab-knowledge">Knowledge Base</TabsTrigger>
          <TabsTrigger value="calls" data-testid="tab-calls">Calls</TabsTrigger>
          <TabsTrigger value="settings" data-testid="tab-settings" className="relative">
            Settings
            {credentialsMissing && (
              <span className="ml-1.5 inline-flex items-center justify-center w-2 h-2 rounded-full bg-destructive" />
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {credentialsMissing && (
            <div className="flex items-start gap-3 p-4 bg-destructive/10 border border-destructive/30 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-destructive text-sm">Credentials not configured</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Add your VAPI API Key and Twilio credentials in the{' '}
                  <button
                    className="underline text-foreground"
                    onClick={() => {
                      const el = document.querySelector('[data-testid="tab-settings"]') as HTMLButtonElement;
                      el?.click();
                    }}
                  >
                    Settings tab
                  </button>{' '}
                  before launching this campaign.
                </p>
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {stats && (
              <>
                <StatCard label="Total Leads" value={stats.totalLeads} icon={Users} />
                <StatCard label="Called" value={stats.calledLeads} icon={Phone} />
                <StatCard label="Successful" value={stats.successfulCalls} icon={CheckCircle2} />
                <StatCard label="Failed" value={stats.failedCalls} icon={XCircle} />
              </>
            )}
          </div>

          <div className="bg-card border border-card-border rounded-lg">
            <div className="px-6 py-4 border-b border-card-border">
              <h2 className="text-lg font-semibold">Recent Calls</h2>
            </div>
            <div className="divide-y divide-card-border">
              {calls && calls.length > 0 ? (
                calls.slice(0, 5).map((call) => (
                  <CallRow key={call.id} call={call} data-testid={`call-${call.id}`} />
                ))
              ) : (
                <div className="px-6 py-12 text-center text-muted-foreground">No calls yet</div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="leads">
          {/* Add Lead dialog */}
          <Dialog open={addLeadOpen} onOpenChange={setAddLeadOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Lead</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAddLead} className="space-y-4 mt-2">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="leadName">Full Name *</Label>
                    <Input id="leadName" value={leadName} onChange={e => setLeadName(e.target.value)} required className="mt-1.5" placeholder="Jane Smith" />
                  </div>
                  <div>
                    <Label htmlFor="leadPhone">Phone Number *</Label>
                    <Input id="leadPhone" value={leadPhone} onChange={e => setLeadPhone(e.target.value)} required className="mt-1.5 font-mono" placeholder="+15551234567" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="leadEmail">Email</Label>
                    <Input id="leadEmail" type="email" value={leadEmail} onChange={e => setLeadEmail(e.target.value)} className="mt-1.5" placeholder="jane@company.com" />
                  </div>
                  <div>
                    <Label htmlFor="leadCompany">Company</Label>
                    <Input id="leadCompany" value={leadCompany} onChange={e => setLeadCompany(e.target.value)} className="mt-1.5" placeholder="Acme Corp" />
                  </div>
                </div>
                <div>
                  <Label htmlFor="leadNotes">Notes</Label>
                  <Textarea id="leadNotes" value={leadNotes} onChange={e => setLeadNotes(e.target.value)} className="mt-1.5" placeholder="Any context for the AI..." rows={3} />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setAddLeadOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={addingLead}>{addingLead ? 'Adding...' : 'Add Lead'}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

          <div className="bg-card border border-card-border rounded-lg">
            <div className="px-6 py-4 border-b border-card-border flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Leads</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Add individual leads or bulk-import via CSV</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setAddLeadOpen(true)} data-testid="button-add-lead">
                  <UserPlus className="w-4 h-4 mr-2" />
                  Add Lead
                </Button>
                <input
                  ref={leadsFileRef}
                  type="file"
                  accept=".csv"
                  onChange={handleLeadsUpload}
                  className="hidden"
                  data-testid="input-leads-file"
                />
                <Button
                  onClick={() => leadsFileRef.current?.click()}
                  disabled={importLeads.isPending}
                  size="sm"
                  data-testid="button-upload-leads"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {importLeads.isPending ? 'Uploading...' : 'Upload CSV'}
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50 border-b border-card-border">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Phone</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Company</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-card-border">
                  {leads && leads.length > 0 ? (
                    leads.map((lead) => (
                      <tr key={lead.id} className="hover:bg-muted/50" data-testid={`lead-${lead.id}`}>
                        <td className="px-6 py-4 text-sm">{lead.name}</td>
                        <td className="px-6 py-4 text-sm font-mono">{lead.phone}</td>
                        <td className="px-6 py-4 text-sm">{lead.company || '-'}</td>
                        <td className="px-6 py-4">
                          <Badge variant="outline" className="text-xs">{lead.status}</Badge>
                        </td>
                        <td className="px-6 py-4">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteLead(lead.id)}
                            data-testid={`button-delete-lead-${lead.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                        No leads yet. Upload a CSV to get started.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="knowledge">
          <div className="bg-card border border-card-border rounded-lg">
            <div className="px-6 py-4 border-b border-card-border flex items-center justify-between">
              <h2 className="text-lg font-semibold">Knowledge Base Files</h2>
              <div>
                <input
                  ref={kbFileRef}
                  type="file"
                  onChange={handleKbUpload}
                  className="hidden"
                  data-testid="input-kb-file"
                />
                <Button
                  onClick={() => kbFileRef.current?.click()}
                  disabled={addKbDoc.isPending}
                  size="sm"
                  data-testid="button-upload-kb"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {addKbDoc.isPending ? 'Uploading...' : 'Upload File'}
                </Button>
              </div>
            </div>
            <div className="divide-y divide-card-border">
              {kbFiles && kbFiles.length > 0 ? (
                kbFiles.map((file) => (
                  <div key={file.id} className="px-6 py-4 flex items-center justify-between" data-testid={`kb-file-${file.id}`}>
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{file.fileName}</p>
                        <p className="text-xs text-muted-foreground">
                          {file.fileType} • {formatDistanceToNow(new Date(file.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{file.status}</Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteKbFile(file.id)}
                        data-testid={`button-delete-kb-${file.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-6 py-12 text-center text-muted-foreground">
                  No files uploaded yet
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="calls">
          <div className="bg-card border border-card-border rounded-lg">
            <div className="px-6 py-4 border-b border-card-border">
              <h2 className="text-lg font-semibold">Call History</h2>
              <p className="text-sm text-muted-foreground mt-0.5">Click a row to expand the transcript</p>
            </div>
            <div className="divide-y divide-card-border">
              {calls && calls.length > 0 ? (
                calls.map((call) => (
                  <CallRow key={call.id} call={call} data-testid={`call-detail-${call.id}`} />
                ))
              ) : (
                <div className="px-6 py-12 text-center text-muted-foreground">
                  No calls yet
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="settings" className="space-y-6">
          <div className="bg-card border border-card-border rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">Master AI Prompt</h2>
            <div className="space-y-4">
              <div className="flex gap-2 mb-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => insertVariable('name')}
                  data-testid="button-insert-name"
                >
                  Insert {'{{'} name {'}}'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => insertVariable('company')}
                  data-testid="button-insert-company"
                >
                  Insert {'{{'} company {'}}'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => insertVariable('phone')}
                  data-testid="button-insert-phone"
                >
                  Insert {'{{'} phone {'}}'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => insertVariable('notes')}
                  data-testid="button-insert-notes"
                >
                  Insert {'{{'} notes {'}}'}
                </Button>
              </div>
              <Textarea
                value={masterPrompt}
                onChange={(e) => setMasterPrompt(e.target.value)}
                className="min-h-64 font-mono text-sm"
                placeholder="Enter your AI prompt..."
                data-testid="textarea-master-prompt"
              />
            </div>
          </div>

          <div className="bg-card border border-card-border rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Twilio Configuration</h2>
              <a
                href="https://console.twilio.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                Get credentials <ExternalLink className="w-3 h-3" />
              </a>
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
                  data-testid="input-twilio-sid"
                />
                <p className="text-xs text-muted-foreground mt-1">Found on your Twilio Console dashboard</p>
              </div>
              <div>
                <Label htmlFor="twilioAuthToken">Auth Token</Label>
                <Input
                  id="twilioAuthToken"
                  type="password"
                  value={twilioAuthToken}
                  onChange={(e) => setTwilioAuthToken(e.target.value)}
                  className="mt-1.5 font-mono"
                  placeholder="••••••••••••••••••••••••••••••••"
                  data-testid="input-twilio-token"
                />
                <p className="text-xs text-muted-foreground mt-1">Found alongside your Account SID on the Twilio Console</p>
              </div>
              <div>
                <Label htmlFor="twilioPhoneNumber">Outbound Phone Number</Label>
                <Input
                  id="twilioPhoneNumber"
                  value={twilioPhoneNumber}
                  onChange={(e) => setTwilioPhoneNumber(e.target.value)}
                  className="mt-1.5 font-mono"
                  placeholder="+15551234567"
                  data-testid="input-twilio-phone"
                />
                <p className="text-xs text-muted-foreground mt-1">A Twilio number in E.164 format (e.g. +15551234567). Calls will display this caller ID.</p>
              </div>
            </div>
          </div>

          <div className="bg-card border border-card-border rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">VAPI Configuration</h2>
              <a
                href="https://dashboard.vapi.ai/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                Get API Key <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div>
              <Label htmlFor="vapiApiKey">Private API Key</Label>
              <Input
                id="vapiApiKey"
                type="password"
                value={vapiApiKey}
                onChange={(e) => setVapiApiKey(e.target.value)}
                className="mt-1.5 font-mono"
                placeholder="••••••••••••••••••••••••••••••••"
                data-testid="input-vapi-key"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Your VAPI Private API Key from{' '}
                <a href="https://dashboard.vapi.ai/keys" target="_blank" rel="noopener noreferrer" className="underline">
                  dashboard.vapi.ai/keys
                </a>. VAPI handles the AI voice conversation; Twilio handles the phone call.
              </p>
            </div>
          </div>

          {/* VAPI Agent Sync */}
          <div className="bg-card border border-card-border rounded-lg p-6">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h2 className="text-lg font-semibold">VAPI Agent</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Creates a persistent AI agent in VAPI using this campaign's Master Prompt.
                  Sync after every prompt change.
                </p>
              </div>
              {campaign.vapiAssistantId && (
                <span className="flex items-center gap-1.5 text-xs text-chart-5 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Synced
                </span>
              )}
            </div>
            {campaign.vapiAssistantId && (
              <p className="text-xs font-mono text-muted-foreground mb-3 mt-2 bg-muted px-3 py-1.5 rounded">
                Agent ID: {campaign.vapiAssistantId}
              </p>
            )}
            <Button
              variant={campaign.vapiAssistantId ? 'outline' : 'default'}
              size="sm"
              onClick={handleSyncVapi}
              disabled={syncing}
              data-testid="button-sync-vapi"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing…' : campaign.vapiAssistantId ? 'Re-sync Agent' : 'Create Agent in VAPI'}
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              Make sure your VAPI API key is saved in{' '}
              <a href="/integrations" className="underline hover:text-foreground">Integrations</a>{' '}
              before syncing. The phone number must also be registered there.
            </p>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={handleSaveSettings}
              disabled={updateCampaign.isPending}
              data-testid="button-save-settings"
            >
              {updateCampaign.isPending ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface TranscriptTurn {
  speaker: string;
  text: string;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/**
 * Parse a VAPI transcript string into labelled speaker turns.
 * VAPI uses lines like "AI: ..." and "User: ..." (or "Assistant:" / "Human:").
 * Falls back to showing the raw text as a single unspeakered block.
 */
function parseTranscript(raw: string): TranscriptTurn[] {
  const lines = raw.split('\n').filter((l) => l.trim() !== '');
  const turns: TranscriptTurn[] = [];

  // Matches lines that start with "SpeakerName: text"
  const speakerRe = /^([A-Za-z][A-Za-z0-9 _-]{0,30}):\s*(.+)$/;

  let current: TranscriptTurn | null = null;

  for (const line of lines) {
    const m = line.match(speakerRe);
    if (m) {
      if (current) turns.push(current);
      current = { speaker: m[1].trim(), text: m[2].trim() };
    } else if (current) {
      // Continuation of the previous speaker's turn
      current.text += ' ' + line.trim();
    } else {
      // No speaker prefix found yet — treat as a single raw block
      current = { speaker: '', text: line.trim() };
    }
  }
  if (current) turns.push(current);

  return turns;
}

function speakerClass(speaker: string): string {
  const s = speaker.toLowerCase();
  if (s === 'ai' || s === 'assistant' || s === 'agent' || s === 'bot') {
    return 'bg-primary/10 text-primary';
  }
  if (s === 'user' || s === 'human' || s === 'customer' || s === 'lead') {
    return 'bg-muted text-muted-foreground';
  }
  return 'bg-secondary/50 text-secondary-foreground';
}

function CallRow({ call, 'data-testid': testId }: CallRowProps) {
  const [expanded, setExpanded] = useState(false);
  const hasTranscript = Boolean(call.transcript?.trim());
  const turns = hasTranscript ? parseTranscript(call.transcript!) : [];

  return (
    <div data-testid={testId}>
      {/* Summary row – always visible */}
      <button
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-muted/30 transition-colors text-left group"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-4 min-w-0">
          <div className="shrink-0 text-muted-foreground group-hover:text-foreground transition-colors">
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </div>
          <div className="min-w-0">
            <p className="font-medium truncate">{call.leadName ?? 'Unknown'}</p>
            <p className="text-sm text-muted-foreground font-mono">{call.leadPhone ?? '—'}</p>
          </div>
        </div>
        <div className="flex items-center gap-4 shrink-0 ml-4">
          {call.duration != null && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDuration(call.duration)}
            </span>
          )}
          {hasTranscript && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <MessageSquare className="w-3 h-3" />
              {turns.length} turns
            </span>
          )}
          {call.startedAt && (
            <span className="text-xs text-muted-foreground hidden sm:block">
              {formatDistanceToNow(new Date(call.startedAt), { addSuffix: true })}
            </span>
          )}
          <Badge variant="outline" className="text-xs">{call.status}</Badge>
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-6 pb-5 space-y-4 border-t border-card-border bg-muted/10">
          {/* Outcome / summary */}
          {call.outcome && (
            <div className="pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Outcome</p>
              <p className="text-sm">{call.outcome}</p>
            </div>
          )}

          {/* Recording */}
          <div className={call.outcome ? '' : 'pt-4'}>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
              <Mic className="w-3 h-3" /> Recording
            </p>
            {call.recordingUrl ? (
              <audio
                controls
                src={call.recordingUrl}
                className="w-full h-10 rounded"
                preload="none"
              />
            ) : (
              <p className="text-sm text-muted-foreground italic">No recording available for this call.</p>
            )}
          </div>

          {/* Transcript */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Transcript
            </p>
            {hasTranscript ? (
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {turns.map((turn, i) => (
                  <div
                    key={i}
                    className="flex gap-3 items-start text-sm"
                  >
                    {turn.speaker ? (
                      <span
                        className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded mt-0.5 whitespace-nowrap ${speakerClass(turn.speaker)}`}
                      >
                        {turn.speaker}
                      </span>
                    ) : null}
                    <p className="leading-relaxed text-foreground/90">{turn.text}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">No transcript available for this call.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface CallRowProps {
  call: {
    id: number;
    leadName?: string | null;
    leadPhone?: string | null;
    status: string;
    duration?: number | null;
    transcript?: string | null;
    recordingUrl?: string | null;
    outcome?: string | null;
    startedAt?: string | null;
  };
  'data-testid'?: string;
}
