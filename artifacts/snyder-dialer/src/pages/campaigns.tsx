import { useState } from 'react';
import { Link } from 'wouter';
import { useListCampaigns, useCreateCampaign, useDeleteCampaign, getListCampaignsQueryKey } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, ExternalLink, UserPlus, Play } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { CampaignStatus } from '@workspace/api-client-react';

export default function Campaigns() {
  const { data: campaigns, isLoading } = useListCampaigns();
  const createCampaign = useCreateCampaign();
  const deleteCampaign = useDeleteCampaign();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [objective, setObjective] = useState('');
  const [masterPrompt, setMasterPrompt] = useState('');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createCampaign.mutate(
      { data: { name, objective, masterPrompt } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCampaignsQueryKey() });
          setOpen(false);
          setName('');
          setObjective('');
          setMasterPrompt('');
          toast({ title: 'Campaign created successfully' });
        },
        onError: (error) => {
          toast({
            title: 'Failed to create campaign',
            description: error.message,
            variant: 'destructive',
          });
        },
      }
    );
  };

  const handleDelete = (id: number) => {
    if (!confirm('Are you sure you want to delete this campaign?')) return;

    deleteCampaign.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCampaignsQueryKey() });
          toast({ title: 'Campaign deleted' });
        },
        onError: (error) => {
          toast({
            title: 'Failed to delete campaign',
            description: error.message,
            variant: 'destructive',
          });
        },
      }
    );
  };

  const getStatusColor = (status: CampaignStatus) => {
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
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Campaigns</h1>
          <p className="text-muted-foreground">Manage your outbound calling campaigns</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-campaign">
              <Plus className="w-4 h-4 mr-2" />
              New Campaign
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Campaign</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 mt-4">
              <div>
                <Label htmlFor="name">Campaign Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="mt-1.5"
                  data-testid="input-campaign-name"
                />
              </div>
              <div>
                <Label htmlFor="objective">Objective</Label>
                <Input
                  id="objective"
                  value={objective}
                  onChange={(e) => setObjective(e.target.value)}
                  required
                  className="mt-1.5"
                  placeholder="e.g., Book meetings, Generate leads, Qualify prospects"
                  data-testid="input-objective"
                />
              </div>
              <div>
                <Label htmlFor="masterPrompt">Master AI Prompt</Label>
                <Textarea
                  id="masterPrompt"
                  value={masterPrompt}
                  onChange={(e) => setMasterPrompt(e.target.value)}
                  required
                  className="mt-1.5 min-h-32 font-mono text-sm"
                  placeholder="Enter the AI prompt for this campaign..."
                  data-testid="input-master-prompt"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createCampaign.isPending} data-testid="button-create-submit">
                  {createCampaign.isPending ? 'Creating...' : 'Create Campaign'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-card border border-card-border rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-muted-foreground">Loading campaigns...</div>
        ) : campaigns && campaigns.length > 0 ? (
          <div className="divide-y divide-card-border">
            {campaigns.map((campaign) => (
              <div
                key={campaign.id}
                className="p-6 hover:bg-muted/50 transition-colors"
                data-testid={`campaign-${campaign.id}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <Link href={`/campaigns/${campaign.id}`} className="text-lg font-semibold hover:text-primary transition-colors">
                        {campaign.name}
                      </Link>
                      <Badge className={getStatusColor(campaign.status)}>
                        {campaign.status.toUpperCase()}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">{campaign.objective}</p>
                    <p className="text-xs text-muted-foreground font-mono">
                      Created {formatDistanceToNow(new Date(campaign.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link href={`/campaigns/${campaign.id}?tab=leads`}>
                      <Button variant="outline" size="sm" data-testid={`button-leads-${campaign.id}`}>
                        <UserPlus className="w-4 h-4 mr-2" />
                        Add Leads
                      </Button>
                    </Link>
                    <Link href={`/campaigns/${campaign.id}`}>
                      <Button size="sm" data-testid={`button-view-${campaign.id}`}>
                        <Play className="w-4 h-4 mr-2" />
                        Open
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(campaign.id)}
                      disabled={deleteCampaign.isPending}
                      data-testid={`button-delete-${campaign.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-12 text-center">
            <p className="text-muted-foreground mb-4">No campaigns yet</p>
            <Button onClick={() => setOpen(true)} data-testid="button-create-first">
              <Plus className="w-4 h-4 mr-2" />
              Create Your First Campaign
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
